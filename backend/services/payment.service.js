// backend/services/payment.service.js
import mssql from "mssql";
import { queryPaymentDb, connectToPaymentDb, connectToDb } from "../config/dbConfig.js";

const T_PAYMENT = "dbo.Payment";
const q = (n) => `[${n}]`;

/* ---------------- helpers ---------------- */

function toInt(n, d = 0) {
  const v = Number.parseInt(n, 10);
  return Number.isFinite(v) ? v : d;
}

function toNum(n, d = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Get next ID: first record = startValue, then MAX(column) + 1
 */
async function getNextId(tx, column, startValue = 1000) {
  const req = new mssql.Request(tx);
  const sql = `
    SELECT 
      CASE 
        WHEN MAX(${q(column)}) IS NULL THEN ${startValue}
        ELSE MAX(${q(column)}) + 1
      END AS nextId
    FROM ${T_PAYMENT}
  `;
  const rs = await req.query(sql);
  return Number(rs.recordset[0].nextId);
}

async function getNextPaymentId(tx) {
  return getNextId(tx, "PaymentID", 1000);
}


/**
 * Build INSERT SQL for payment record
 */
function buildPaymentInsertSql(includeTableId = false) {
  const baseFields = [
    q("PaymentID"), q("ShopID"), q("TransID"), q("MethodID"),
    q("BillAmount"), q("PaidAmount"), q("BalanceAmount"), q("PaidStatus")
  ];
  const baseParams = [
    "@PaymentID", "@ShopID", "@TransID", "@MethodID",
    "@BillAmount", "@PaidAmount", "@BalanceAmount", "@PaidStatus"
  ];

  if (includeTableId) {
    baseFields.push(q("TableID"));
    baseParams.push("@TableID");
  }

  return `
    INSERT INTO ${T_PAYMENT} (${baseFields.join(", ")})
    VALUES (${baseParams.join(", ")})
  `;
}

/**
 * Validate payment amounts
 */
function validateAmounts(billAmount, paidAmount = null) {
  const billAmt = toNum(billAmount);
  if (billAmt <= 0 || !Number.isFinite(billAmt)) {
    throw new Error("Bill amount must be a positive number");
  }
  if (paidAmount !== null) {
    const paidAmt = toNum(paidAmount);
    if (paidAmt <= 0 || !Number.isFinite(paidAmt)) {
      throw new Error("Paid amount must be a positive number");
    }
    // For equal split, paidAmount (per person) can be less than billAmount (total bill)
    // So we don't enforce this check for equal split - it's handled in the service
    // But for other payment types, we should check
    // Actually, let's keep this check but make it more lenient for split payments
    // The check will be done at the service level for split payments
    return { billAmt, paidAmt };
  }
  return { billAmt };
}

/**
 * Build and execute payment query with filters
 */
async function queryPaymentWithFilters(tx, filters, selectFields = "*", orderBy = null) {
  const req = new mssql.Request(tx);
  const conditions = [];
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      req.input(key, mssql.BigInt, toInt(value));
      conditions.push(`${q(key)} = @${key}`);
    }
  });

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderClause = orderBy ? `ORDER BY ${orderBy}` : "";
  
  const sql = `
    SELECT ${selectFields}
    FROM ${T_PAYMENT}
    ${whereClause}
    ${orderClause}
  `;
  
  return req.query(sql);
}

/* ---------------- service functions ---------------- */

export async function getActivePaymentMethods() {
  const sql = `
    SELECT ID, PaymentMethodID, PaymentMethod, Status
    FROM dbo.Methods
    WHERE Status != 'Block' OR Status IS NULL
    ORDER BY PaymentMethodID
  `;
  return await queryPaymentDb(sql) || [];
}

export async function getPaymentMethodById(methodId) {
  const sql = `
    SELECT ID, PaymentMethodID, PaymentMethod, Status
    FROM dbo.Methods
    WHERE PaymentMethodID = @methodId
      AND (Status != 'Block' OR Status IS NULL)
  `;
  const methods = await queryPaymentDb(sql, { methodId });
  return methods?.[0] || null;
}

export async function savePayFullPayment(payload) {
  const { billAmount, tableId, kotMasterID } = payload;
  const { billAmt } = validateAmounts(billAmount);
  
  console.log("[PAYMENT:SVC] savePayFullPayment - Received payload:", { billAmount, tableId, kotMasterID });
  
  const pool = await connectToPaymentDb();
  const tx = new mssql.Transaction(pool);

  try {
    await tx.begin();

    // Use kotMasterID as TransID, fallback to 0 if not provided
    let transId = 0;
    if (kotMasterID !== null && kotMasterID !== undefined && kotMasterID !== '') {
      transId = toInt(kotMasterID);
    }
    console.log("[PAYMENT:SVC] kotMasterID from payload:", kotMasterID, "| Type:", typeof kotMasterID);
    console.log("[PAYMENT:SVC] Using TransID =", transId, transId > 0 ? "(from kotMasterID)" : "(default 0)");

    // IMPORTANT: Check if there's already a split payment (MethodID = 2, 3, or 4) for this kotMasterID
    // If split has started, we should complete it using the existing MethodID, NOT create a new MethodID = 1 record
    if (transId > 0) {
      const checkSplitReq = new mssql.Request(tx);
      checkSplitReq.input("TransID", mssql.BigInt, transId);
      
      // Check for any split payment: MethodID 2 (equal split), 3 (item split), or 4 (custom split)
      const checkSplitSql = `
        SELECT TOP 1 ${q("PaymentID")}, ${q("MethodID")}, ${q("BillAmount")}, ${q("PaidAmount")}, ${q("BalanceAmount")}, ${q("PaidStatus")}
        FROM ${T_PAYMENT}
        WHERE ${q("TransID")} = @TransID AND (${q("MethodID")} = 2 OR ${q("MethodID")} = 3 OR ${q("MethodID")} = 4)
        ORDER BY ${q("PaymentID")} ASC
      `;
      
      const splitCheckResult = await checkSplitReq.query(checkSplitSql);
      const existingSplitPayment = splitCheckResult.recordset[0];
      
      if (existingSplitPayment) {
        // Split has already started - complete it using the existing MethodID
        const existingMethodID = toInt(existingSplitPayment.MethodID);
        console.log(`[PAYMENT:SVC] Found existing split payment (MethodID=${existingMethodID}), completing it instead of creating MethodID=1`);
        
        const existingPaidAmount = toNum(existingSplitPayment.PaidAmount, 0);
        const originalBillAmount = toNum(existingSplitPayment.BillAmount, billAmt);
        const remainingBalance = toNum(existingSplitPayment.BalanceAmount, billAmt);
        
        // Pay the remaining balance
        const newPaidAmount = r2(existingPaidAmount + remainingBalance);
        const newBalanceAmount = 0;
        const paidStatus = "PAID";
        
        // Update the existing payment record
        const updateReq = new mssql.Request(tx);
        updateReq.input("PaymentID", mssql.BigInt, toInt(existingSplitPayment.PaymentID));
        updateReq.input("PaidAmount", mssql.Money, newPaidAmount);
        updateReq.input("BalanceAmount", mssql.Money, newBalanceAmount);
        updateReq.input("PaidStatus", mssql.VarChar(50), paidStatus);
        
        const updateSql = `
          UPDATE ${T_PAYMENT}
          SET ${q("PaidAmount")} = @PaidAmount,
              ${q("BalanceAmount")} = @BalanceAmount,
              ${q("PaidStatus")} = @PaidStatus
          WHERE ${q("PaymentID")} = @PaymentID
        `;
        
        await updateReq.query(updateSql);
        await tx.commit();
        
        console.log(`[PAYMENT:SVC] Completed split payment (MethodID=${existingMethodID}) by updating existing record`);
        
        return {
          ok: true,
          paymentId: toInt(existingSplitPayment.PaymentID),
          ShopID: 1,
          TransID: transId,
          MethodID: existingMethodID, // Keep the original MethodID (2, 3, or 4)
          BillAmount: r2(originalBillAmount),
          PaidAmount: newPaidAmount,
          BalanceAmount: newBalanceAmount,
          PaidStatus: paidStatus,
          tableId: tableId ? toInt(tableId) : null
        };
      }
    }

    // No split exists - create new Pay Full payment (MethodID = 1)
    const paymentId = await getNextPaymentId(tx);
    console.log("[PAYMENT:SVC] Generated PaymentID =", paymentId);

    const paymentData = {
      PaymentID: paymentId,
      ShopID: 1,
      TransID: transId, // This is the kotMasterID
      MethodID: 1,
      BillAmount: r2(billAmt),
      PaidAmount: r2(billAmt),
      BalanceAmount: 0,
      PaidStatus: "PAID"
    };
    
    console.log("[PAYMENT:SVC] Payment data to insert:", paymentData);

    const req = new mssql.Request(tx);
    Object.entries(paymentData).forEach(([key, value]) => {
      if (key === "PaidStatus") {
        req.input(key, mssql.VarChar(50), value);
      } else if (["BillAmount", "PaidAmount", "BalanceAmount"].includes(key)) {
        req.input(key, mssql.Money, value);
      } else {
        req.input(key, mssql.BigInt, value);
      }
    });
    
    if (tableId) {
      req.input("TableID", mssql.BigInt, toInt(tableId));
      paymentData.TableID = toInt(tableId);
    }

    await req.query(buildPaymentInsertSql(!!tableId));
    await tx.commit();

    return { ok: true, ...paymentData, tableId: tableId ? toInt(tableId) : null };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function saveEqualSplitPayment(payload) {
  const { billAmount, paidAmount, numberOfPeople, kotMasterID, transId: providedTransId, tableId } = payload;
  
  // Validate amounts separately for equal split (paidAmount can be less than billAmount)
  const billAmt = toNum(billAmount);
  if (billAmt <= 0 || !Number.isFinite(billAmt)) {
    throw new Error("Bill amount must be a positive number");
  }
  
  const paidAmt = toNum(paidAmount);
  if (paidAmt <= 0 || !Number.isFinite(paidAmt)) {
    throw new Error("Paid amount must be a positive number");
  }
  
  // For equal split, paidAmount (per person) should not exceed the remaining balance
  // But we allow it to be less than billAmount since it's just one person's share

  console.log("[PAYMENT:SVC] saveEqualSplitPayment - Received payload:", { billAmount, paidAmount, numberOfPeople, kotMasterID, providedTransId, tableId });

  const pool = await connectToPaymentDb();
  const tx = new mssql.Transaction(pool);

  try {
    await tx.begin();

    // Use kotMasterID as TransID, fallback to providedTransId or 0
    let transId = 0;
    if (kotMasterID !== null && kotMasterID !== undefined && kotMasterID !== '') {
      transId = toInt(kotMasterID);
    } else if (providedTransId !== null && providedTransId !== undefined && providedTransId !== '') {
      transId = toInt(providedTransId);
    }
    console.log("[PAYMENT:SVC] Using TransID =", transId, transId > 0 ? (kotMasterID ? "(from kotMasterID)" : "(from providedTransId)") : "(default 0)");
    
    if (transId <= 0) {
      throw new Error("Valid kotMasterID (TransID) is required for equal split payment");
    }

    // CRITICAL: Check if there's ANY existing payment for this kotMasterID
    // If a payment method has been started AND money has been paid, we MUST use that same method ID
    // We cannot switch methods after payment has been made
    // However, if a payment exists but PaidAmount = 0 (no actual payment made yet), we can switch methods
    const checkAnyPaymentReq = new mssql.Request(tx);
    checkAnyPaymentReq.input("TransID", mssql.BigInt, transId);
    
    const checkAnyPaymentSql = `
      SELECT TOP 1 ${q("PaymentID")}, ${q("MethodID")}, ${q("BillAmount")}, ${q("PaidAmount")}, ${q("BalanceAmount")}, ${q("PaidStatus")}
      FROM ${T_PAYMENT}
      WHERE ${q("TransID")} = @TransID
      ORDER BY ${q("PaymentID")} ASC
    `;
    
    const anyPaymentResult = await checkAnyPaymentReq.query(checkAnyPaymentSql);
    const anyExistingPayment = anyPaymentResult.recordset[0];
    
    // If there's an existing payment with a DIFFERENT method AND money has been paid, reject this payment
    if (anyExistingPayment) {
      const existingMethodID = toInt(anyExistingPayment.MethodID);
      const existingPaidAmount = toNum(anyExistingPayment.PaidAmount, 0);
      
      // If a different method exists AND payment has been made (PaidAmount > 0), reject
      if (existingMethodID !== 2 && existingPaidAmount > 0) {
        const methodNames = { 1: "Pay Full", 2: "Equal Split", 3: "Item Split", 4: "Custom Split" };
        throw new Error(`Cannot use Equal Split (MethodID=2) for this bill. This bill is already using ${methodNames[existingMethodID] || `MethodID=${existingMethodID}`} and payment has been made. Once a payment method is chosen and payment is made, all payments must use the same method.`);
      }
      
      // If a different method exists but NO payment has been made (PaidAmount = 0), delete it and allow this method
      if (existingMethodID !== 2 && existingPaidAmount <= 0) {
        console.log(`[PAYMENT:SVC] Equal split - Found existing MethodID=${existingMethodID} payment with PaidAmount=0, deleting it to allow Equal Split`);
        const deleteReq = new mssql.Request(tx);
        deleteReq.input("PaymentID", mssql.BigInt, toInt(anyExistingPayment.PaymentID));
        const deleteSql = `DELETE FROM ${T_PAYMENT} WHERE ${q("PaymentID")} = @PaymentID`;
        await deleteReq.query(deleteSql);
        console.log(`[PAYMENT:SVC] Equal split - Deleted unused payment (MethodID=${existingMethodID})`);
      }
    }
    
    // Now check specifically for MethodID=2 payment (equal split)
    const existingEqualSplitReq = new mssql.Request(tx);
    existingEqualSplitReq.input("TransID", mssql.BigInt, transId);
    existingEqualSplitReq.input("MethodID", mssql.BigInt, 2);
    
    const existingEqualSplitSql = `
      SELECT TOP 1 ${q("PaymentID")}, ${q("BillAmount")}, ${q("PaidAmount")}, ${q("BalanceAmount")}, ${q("PaidStatus")}, ${q("TableID")}
      FROM ${T_PAYMENT}
      WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @MethodID
      ORDER BY ${q("PaymentID")} ASC
    `;
    
    console.log(`[PAYMENT:SVC] [EQUAL SPLIT] Checking for existing MethodID=2 payment: TransID=${transId}`);
    const existingEqualSplitResult = await existingEqualSplitReq.query(existingEqualSplitSql);
    const existingPayment = existingEqualSplitResult.recordset[0];
    
    if (existingPayment) {
      console.log(`[PAYMENT:SVC] [EQUAL SPLIT] ✅ FOUND existing equal split payment (MethodID=2):`);
      console.log(`  - PaymentID: ${existingPayment.PaymentID}`);
      console.log(`  - BillAmount: ${existingPayment.BillAmount}`);
      console.log(`  - PaidAmount: ${existingPayment.PaidAmount}`);
      console.log(`  - BalanceAmount: ${existingPayment.BalanceAmount}`);
      console.log(`  - PaidStatus: ${existingPayment.PaidStatus}`);
      console.log(`[PAYMENT:SVC] [EQUAL SPLIT] Will UPDATE this record (not create new)`);
    } else {
      console.log(`[PAYMENT:SVC] [EQUAL SPLIT] ❌ No MethodID=2 payment found - will CREATE new`);
    }
    
    let paymentId;
    let newPaidAmount;
    let newBalanceAmount;
    let paidStatus;
    let billAmountToUse = billAmt; // Default to incoming full bill amount

    if (existingPayment) {
      // Update existing payment record - accumulate paid amount
      paymentId = toInt(existingPayment.PaymentID);
      const currentPaidAmount = toNum(existingPayment.PaidAmount, 0);
      const storedBillAmount = toNum(existingPayment.BillAmount, 0);
      
      // CRITICAL: BillAmount must always be the FULL bill amount, never the split amount
      // Use the larger of stored or incoming billAmount (both should be the full bill)
      // If stored is 0 or invalid, use incoming. If stored is correct, keep it.
      billAmountToUse = storedBillAmount > 0 ? storedBillAmount : billAmt;
      
      // If incoming billAmount is larger, it means stored was wrong - fix it
      if (billAmt > billAmountToUse) {
        console.warn(`[PAYMENT:SVC] Fixing incorrect BillAmount: stored=${billAmountToUse}, correct=${billAmt}`);
        billAmountToUse = billAmt;
      }
      
      // CRITICAL: Calculate remaining balance BEFORE adding new payment
      const remainingBalance = r2(billAmountToUse - currentPaidAmount);
      
      // CRITICAL: For equal split, paidAmt should be the split amount (per person), NOT the full bill
      // If paidAmt exceeds remaining balance, cap it to remaining balance
      // This prevents PaidAmount from exceeding BillAmount
      let actualPaidAmount = paidAmt;
      if (paidAmt > remainingBalance) {
        console.warn(`[PAYMENT:SVC] ⚠️ paidAmt (${paidAmt}) > remainingBalance (${remainingBalance}). Capping to remaining balance.`);
        actualPaidAmount = remainingBalance;
      }
      
      // Add new payment to existing paid amount (accumulate)
      // Example: If bill=35, first payment=17.5, second payment=17.5:
      //   First: PaidAmount=17.5, Balance=17.5, Status=PENDING
      //   Second: PaidAmount=35, Balance=0, Status=PAID
      newPaidAmount = r2(currentPaidAmount + actualPaidAmount);
      
      // CRITICAL: Ensure PaidAmount never exceeds BillAmount
      if (newPaidAmount > billAmountToUse) {
        console.warn(`[PAYMENT:SVC] ⚠️ newPaidAmount (${newPaidAmount}) > billAmountToUse (${billAmountToUse}). Capping to billAmount.`);
        newPaidAmount = r2(billAmountToUse);
      }
      
      // Recalculate balance: Balance = Full Bill - Total Paid
      newBalanceAmount = r2(billAmountToUse - newPaidAmount);
      if (newBalanceAmount < 0) newBalanceAmount = 0;
      
      // CRITICAL: Status = "PAID" ONLY when BalanceAmount = 0, otherwise "PENDING"
      // This ensures the payment is only marked as complete when the full bill is paid
      paidStatus = newBalanceAmount === 0 ? "PAID" : "PENDING";
      
      console.log("[PAYMENT:SVC] Updating existing equal split payment:", {
        paymentId,
        billAmount: billAmountToUse,
        currentPaidAmount,
        incomingPaidAmt: paidAmt,
        actualPaidAmount: actualPaidAmount,
        remainingBalanceBefore: remainingBalance,
        newPaidAmount,
        newBalanceAmount,
        paidStatus
      });
      
      const updateReq = new mssql.Request(tx);
      updateReq.input("PaymentID", mssql.BigInt, paymentId);
      updateReq.input("PaidAmount", mssql.Money, newPaidAmount);
      updateReq.input("BalanceAmount", mssql.Money, newBalanceAmount);
      updateReq.input("PaidStatus", mssql.VarChar(50), paidStatus);
      
      // Update BillAmount if it was wrong
      const needsBillAmountUpdate = billAmountToUse !== storedBillAmount;
      if (needsBillAmountUpdate) {
        updateReq.input("BillAmount", mssql.Money, billAmountToUse);
        const updateSql = `
          UPDATE ${T_PAYMENT}
          SET ${q("BillAmount")} = @BillAmount,
              ${q("PaidAmount")} = @PaidAmount,
              ${q("BalanceAmount")} = @BalanceAmount,
              ${q("PaidStatus")} = @PaidStatus
          WHERE ${q("PaymentID")} = @PaymentID
        `;
        await updateReq.query(updateSql);
        console.log("[PAYMENT:SVC] Updated existing equal split payment (fixed BillAmount)");
      } else {
        const updateSql = `
          UPDATE ${T_PAYMENT}
          SET ${q("PaidAmount")} = @PaidAmount,
              ${q("BalanceAmount")} = @BalanceAmount,
              ${q("PaidStatus")} = @PaidStatus
          WHERE ${q("PaymentID")} = @PaymentID
        `;
        await updateReq.query(updateSql);
        console.log("[PAYMENT:SVC] Updated existing equal split payment");
      }
      
    } else {
      // Insert new payment record - FIRST payment for this kotMasterID
      paymentId = await getNextPaymentId(tx);
      
      // CRITICAL: BillAmount must ALWAYS be the FULL bill amount, never the split amount
      // For equal split: billAmount = full bill, paidAmount = per-person share
      // Validate that billAmount >= paidAmount (full bill should never be less than per-person share)
      if (billAmt < paidAmt) {
        console.error(`[PAYMENT:SVC] ERROR: BillAmount (${billAmt}) < PaidAmount (${paidAmt}). Full bill must be >= per-person amount.`);
        throw new Error(`Invalid amounts: Full bill amount (${billAmt}) must be greater than or equal to per-person amount (${paidAmt})`);
      }
      
      // First payment: BillAmount = FULL total bill, PaidAmount = equal share paid, Balance = remaining
      // Example: Bill=30, Split=2 people, Per person=15
      //   BillAmount=30, PaidAmount=15, BalanceAmount=15, Status=PENDING
      newPaidAmount = r2(paidAmt);
      newBalanceAmount = r2(billAmt - newPaidAmount);
      if (newBalanceAmount < 0) newBalanceAmount = 0;
      
      // CRITICAL: Status = "PAID" ONLY when BalanceAmount = 0, otherwise "PENDING"
      // For first payment, balance will be > 0, so status will be "PENDING"
      paidStatus = newBalanceAmount === 0 ? "PAID" : "PENDING";
      
      console.log("[PAYMENT:SVC] Creating new equal split payment record:", {
        paymentId,
        billAmount: billAmt, // FULL bill amount
        paidAmount: newPaidAmount, // Split amount (per person)
        balanceAmount: newBalanceAmount,
        paidStatus,
        numberOfPeople
      });
      
      const insertReq = new mssql.Request(tx);
      const paymentData = {
        PaymentID: paymentId,
        ShopID: 1,
        TransID: transId,
        MethodID: 2,
        BillAmount: billAmt, // FULL bill amount - never the split amount
        PaidAmount: newPaidAmount, // Split amount paid (per person)
        BalanceAmount: newBalanceAmount,
        PaidStatus: paidStatus
      };
      
      Object.entries(paymentData).forEach(([key, value]) => {
        if (key === "PaidStatus") {
          insertReq.input(key, mssql.VarChar(50), value);
        } else if (["BillAmount", "PaidAmount", "BalanceAmount"].includes(key)) {
          insertReq.input(key, mssql.Money, value);
        } else {
          insertReq.input(key, mssql.BigInt, value);
        }
      });
      
      if (tableId) {
        insertReq.input("TableID", mssql.BigInt, toInt(tableId));
      }

      await insertReq.query(buildPaymentInsertSql(!!tableId));
      console.log("[PAYMENT:SVC] Inserted new equal split payment record");
    }

    await tx.commit();

    return {
      ok: true,
      paymentId,
      ShopID: 1,
      TransID: transId,
      MethodID: 2,
      BillAmount: billAmountToUse,
      PaidAmount: newPaidAmount,
      BalanceAmount: newBalanceAmount,
      PaidStatus: paidStatus,
      paidAmount: newPaidAmount, // Lowercase for frontend
      balanceAmount: newBalanceAmount, // Lowercase for frontend
      paidStatus: paidStatus, // Lowercase for frontend
      billAmount: billAmountToUse, // Lowercase for frontend
      tableId: tableId ? toInt(tableId) : null
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function saveCustomSplitPayment(payload) {
  const { billAmount, paidAmount, kotMasterID, transId: providedTransId, tableId } = payload;
  const { billAmt, paidAmt } = validateAmounts(billAmount, paidAmount);

  console.log("[PAYMENT:SVC] saveCustomSplitPayment - Received payload:", { billAmount, paidAmount, kotMasterID, providedTransId, tableId });

  const pool = await connectToPaymentDb();
  const tx = new mssql.Transaction(pool);

  try {
    await tx.begin();

    // Use kotMasterID as TransID, fallback to providedTransId or 0
    let transId = 0;
    if (kotMasterID !== null && kotMasterID !== undefined && kotMasterID !== '') {
      transId = toInt(kotMasterID);
    } else if (providedTransId !== null && providedTransId !== undefined && providedTransId !== '') {
      transId = toInt(providedTransId);
    }
    console.log("[PAYMENT:SVC] kotMasterID from payload:", kotMasterID, "| Type:", typeof kotMasterID);
    console.log("[PAYMENT:SVC] Using TransID =", transId, transId > 0 ? (kotMasterID ? "(from kotMasterID)" : "(from providedTransId)") : "(default 0)");
    
    if (transId <= 0) {
      throw new Error("Valid kotMasterID (TransID) is required for custom split payment");
    }

    // CRITICAL: Check if there's ANY existing payment for this kotMasterID
    // If a payment method has been started AND money has been paid, we MUST use that same method ID
    // We cannot switch methods after payment has been made
    // However, if a payment exists but PaidAmount = 0 (no actual payment made yet), we can switch methods
    const checkAnyPaymentReq = new mssql.Request(tx);
    checkAnyPaymentReq.input("TransID", mssql.BigInt, transId);
    
    const checkAnyPaymentSql = `
      SELECT TOP 1 ${q("PaymentID")}, ${q("MethodID")}, ${q("BillAmount")}, ${q("PaidAmount")}, ${q("BalanceAmount")}, ${q("PaidStatus")}
      FROM ${T_PAYMENT}
      WHERE ${q("TransID")} = @TransID
      ORDER BY ${q("PaymentID")} ASC
    `;
    
    const anyPaymentResult = await checkAnyPaymentReq.query(checkAnyPaymentSql);
    const anyExistingPayment = anyPaymentResult.recordset[0];
    
    // If there's an existing payment with a DIFFERENT method AND money has been paid, reject this payment
    if (anyExistingPayment) {
      const existingMethodID = toInt(anyExistingPayment.MethodID);
      const existingPaidAmount = toNum(anyExistingPayment.PaidAmount, 0);
      
      // If a different method exists AND payment has been made (PaidAmount > 0), reject
      if (existingMethodID !== 4 && existingPaidAmount > 0) {
        const methodNames = { 1: "Pay Full", 2: "Equal Split", 3: "Item Split", 4: "Custom Split" };
        throw new Error(`Cannot use Custom Split (MethodID=4) for this bill. This bill is already using ${methodNames[existingMethodID] || `MethodID=${existingMethodID}`} and payment has been made. Once a payment method is chosen and payment is made, all payments must use the same method.`);
      }
      
      // If a different method exists but NO payment has been made (PaidAmount = 0), delete it and allow this method
      if (existingMethodID !== 4 && existingPaidAmount <= 0) {
        console.log(`[PAYMENT:SVC] Custom split - Found existing MethodID=${existingMethodID} payment with PaidAmount=0, deleting it to allow Custom Split`);
        const deleteReq = new mssql.Request(tx);
        deleteReq.input("PaymentID", mssql.BigInt, toInt(anyExistingPayment.PaymentID));
        const deleteSql = `DELETE FROM ${T_PAYMENT} WHERE ${q("PaymentID")} = @PaymentID`;
        await deleteReq.query(deleteSql);
        console.log(`[PAYMENT:SVC] Custom split - Deleted unused payment (MethodID=${existingMethodID})`);
      }
    }
    
    // Now check specifically for MethodID=4 payment (custom split)
    const existingPaymentReq = new mssql.Request(tx);
    existingPaymentReq.input("TransID", mssql.BigInt, transId);
    existingPaymentReq.input("MethodID", mssql.BigInt, 4);
    
    const existingPaymentSql = `
      SELECT TOP 1 ${q("PaymentID")}, ${q("BillAmount")}, ${q("PaidAmount")}, ${q("BalanceAmount")}, ${q("PaidStatus")}, ${q("TableID")}
      FROM ${T_PAYMENT}
      WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @MethodID
      ORDER BY ${q("PaymentID")} ASC
    `;
    
    const existingPaymentResult = await existingPaymentReq.query(existingPaymentSql);
    const existingPayment = existingPaymentResult.recordset[0];
    
    let paymentId;
    let originalBillAmount;
    let newPaidAmount;
    let newBalanceAmount;
    let paidStatus;
    
    if (existingPayment) {
      // UPDATE existing payment record
      paymentId = toInt(existingPayment.PaymentID);
      originalBillAmount = toNum(existingPayment.BillAmount, billAmt);
      
      // Add new payment to existing paid amount
      const currentPaidAmount = toNum(existingPayment.PaidAmount, 0);
      newPaidAmount = r2(currentPaidAmount + paidAmt);
      
      // Recalculate balance: originalBillAmount - newPaidAmount
      newBalanceAmount = r2(originalBillAmount - newPaidAmount);
      if (newBalanceAmount < 0) newBalanceAmount = 0;
      
      // Update status based on balance
      paidStatus = newBalanceAmount <= 0 ? "PAID" : "PENDING";
      
      console.log("[PAYMENT:SVC] Updating existing payment:", {
        paymentId,
        originalBillAmount,
        currentPaidAmount,
        newPaymentAmount: paidAmt,
        newPaidAmount,
        newBalanceAmount,
        paidStatus
      });
      
      // Build UPDATE query
      const updateReq = new mssql.Request(tx);
      updateReq.input("PaymentID", mssql.BigInt, paymentId);
      updateReq.input("PaidAmount", mssql.Money, newPaidAmount);
      updateReq.input("BalanceAmount", mssql.Money, newBalanceAmount);
      updateReq.input("PaidStatus", mssql.VarChar(50), paidStatus);
      
      let updateSql = `
        UPDATE ${T_PAYMENT}
        SET ${q("PaidAmount")} = @PaidAmount,
            ${q("BalanceAmount")} = @BalanceAmount,
            ${q("PaidStatus")} = @PaidStatus
        WHERE ${q("PaymentID")} = @PaymentID
      `;
      
      await updateReq.query(updateSql);
      console.log("[PAYMENT:SVC] Updated existing payment record");
      
    } else {
      // INSERT new payment record (first payment for this kotMasterID)
      paymentId = await getNextPaymentId(tx);
      originalBillAmount = r2(billAmt);
      newPaidAmount = r2(paidAmt);
      newBalanceAmount = r2(originalBillAmount - newPaidAmount);
      if (newBalanceAmount < 0) newBalanceAmount = 0;
      paidStatus = newBalanceAmount <= 0 ? "PAID" : "PENDING";
      
      console.log("[PAYMENT:SVC] Creating new payment record:", {
        paymentId,
        originalBillAmount,
        newPaidAmount,
        newBalanceAmount,
        paidStatus
      });
      
      const insertReq = new mssql.Request(tx);
      const paymentData = {
        PaymentID: paymentId,
        ShopID: 1,
        TransID: transId,
        MethodID: 4,
        BillAmount: originalBillAmount,
        PaidAmount: newPaidAmount,
        BalanceAmount: newBalanceAmount,
        PaidStatus: paidStatus
      };
      
      Object.entries(paymentData).forEach(([key, value]) => {
        if (key === "PaidStatus") {
          insertReq.input(key, mssql.VarChar(50), value);
        } else if (["BillAmount", "PaidAmount", "BalanceAmount"].includes(key)) {
          insertReq.input(key, mssql.Money, value);
        } else {
          insertReq.input(key, mssql.BigInt, value);
        }
      });
      
      if (tableId) {
        insertReq.input("TableID", mssql.BigInt, toInt(tableId));
      }

      await insertReq.query(buildPaymentInsertSql(!!tableId));
      console.log("[PAYMENT:SVC] Inserted new payment record");
    }

    await tx.commit();

    return {
      ok: true,
      paymentId,
      ShopID: 1,
      TransID: transId,
      MethodID: 4,
      BillAmount: originalBillAmount,
      PaidAmount: newPaidAmount,
      BalanceAmount: newBalanceAmount,
      PaidStatus: paidStatus,
      billAmount: newBalanceAmount,
      originalBillAmount: originalBillAmount,
      tableId: tableId ? toInt(tableId) : null
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function saveItemSplitPayment(payload) {
  const { items, tableId, kotMasterID, totalBillAmount } = payload;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error("At least one item is required for item split payment");
  }

  if (!kotMasterID) {
    throw new Error("kotMasterID is required for item split payment");
  }

  console.log("[PAYMENT:SVC] saveItemSplitPayment - Received payload:", { 
    itemsCount: items.length, 
    tableId, 
    kotMasterID,
    totalBillAmount 
  });

  const pool = await connectToPaymentDb();
  const tx = new mssql.Transaction(pool);

  try {
    await tx.begin();

    // Use kotMasterID as TransID (same as other payment methods)
    const transId = toInt(kotMasterID);
    
    if (transId <= 0) {
      throw new Error("Valid kotMasterID is required for item split payment");
    }

    console.log("[PAYMENT:SVC] Using TransID =", transId, "(kotMasterID)");

    // Get total bill amount (from KOTMaster or passed as parameter)
    // If totalBillAmount is provided, use it; otherwise we'll need to query KOTMaster
    let originalBillAmount = r2(toNum(totalBillAmount, 0));
    
    console.log("[PAYMENT:SVC] Item split - Initial bill amount check:", {
      totalBillAmount,
      originalBillAmount,
      transId
    });
    
    if (originalBillAmount <= 0) {
      console.log("[PAYMENT:SVC] Item split - totalBillAmount not provided or invalid, querying KOTMaster...");
      // Query KOTMaster to get total bill amount
      const kotPool = await connectToDb();
      const kotReq = kotPool.request();
      kotReq.input("kotMasterID", mssql.BigInt, transId);
      const kotSql = `
        SELECT Amount AS TotalAmount
        FROM dbo.KOTMaster
        WHERE kotMasterID = @kotMasterID
      `;
      const kotResult = await kotReq.query(kotSql);
      if (kotResult.recordset && kotResult.recordset.length > 0) {
        originalBillAmount = r2(toNum(kotResult.recordset[0].TotalAmount, 0));
        console.log("[PAYMENT:SVC] Item split - Retrieved bill amount from KOTMaster:", originalBillAmount);
      } else {
        console.warn("[PAYMENT:SVC] Item split - KOTMaster record not found for kotMasterID:", transId);
      }
    }

    if (originalBillAmount <= 0) {
      throw new Error(`Could not determine total bill amount for this KOT. kotMasterID: ${transId}, totalBillAmount: ${totalBillAmount}`);
    }
    
    console.log("[PAYMENT:SVC] Item split - Using bill amount:", originalBillAmount);
    
    // CRITICAL: Log the items being paid to verify calculation
    console.log("[PAYMENT:SVC] Item split - Items in payload:", items.map(item => ({
      kotChildId: item.kotChildId || item.kotChildID,
      lineTotal: item.lineTotal,
      desc: item.desc || item.ShortDescription
    })));
    
    // Calculate expected total from items (for validation)
    const itemsTotal = items.reduce((sum, item) => sum + toNum(item.lineTotal || 0), 0);
    console.log("[PAYMENT:SVC] Item split - Items total (sum of lineTotal):", itemsTotal);
    console.log("[PAYMENT:SVC] Item split - Provided totalBillAmount:", totalBillAmount);
    console.log("[PAYMENT:SVC] Item split - Calculated originalBillAmount:", originalBillAmount);

    // CRITICAL: Check if there's ANY existing payment for this kotMasterID
    // If a payment method has been started AND money has been paid, we MUST use that same method ID
    // We cannot switch methods after payment has been made
    // However, if a payment exists but PaidAmount = 0 (no actual payment made yet), we can switch methods
    const checkAnyPaymentReq = new mssql.Request(tx);
    checkAnyPaymentReq.input("TransID", mssql.BigInt, transId);
    
    const checkAnyPaymentSql = `
      SELECT TOP 1 ${q("PaymentID")}, ${q("MethodID")}, ${q("BillAmount")}, ${q("PaidAmount")}, ${q("BalanceAmount")}, ${q("PaidStatus")}
      FROM ${T_PAYMENT}
      WHERE ${q("TransID")} = @TransID
      ORDER BY ${q("PaymentID")} ASC
    `;
    
    const anyPaymentResult = await checkAnyPaymentReq.query(checkAnyPaymentSql);
    const anyExistingPayment = anyPaymentResult.recordset[0];
    
    // If there's an existing payment with a DIFFERENT method, check if we can switch
    if (anyExistingPayment) {
      const existingMethodID = toInt(anyExistingPayment.MethodID);
      const existingPaidAmount = toNum(anyExistingPayment.PaidAmount, 0);
      const existingBalanceAmount = toNum(anyExistingPayment.BalanceAmount, 0);
      const existingPaidStatus = anyExistingPayment.PaidStatus || "PENDING";
      
      console.log("[PAYMENT:SVC] Item split - Found existing payment:", {
        PaymentID: anyExistingPayment.PaymentID,
        MethodID: existingMethodID,
        PaidAmount: existingPaidAmount,
        BalanceAmount: existingBalanceAmount,
        PaidStatus: existingPaidStatus,
        BillAmount: toNum(anyExistingPayment.BillAmount, 0),
        TransID: transId
      });
      
      // If a different method exists AND payment has been made (PaidAmount > 0), check if we can switch
      if (existingMethodID !== 3 && existingPaidAmount > 0) {
        // Special case: If it's Pay Full (MethodID=1), allow switching to Item Split
        // This allows users to use Item Split even if Pay Full was used, useful for:
        // - Testing scenarios
        // - Changing payment method preference
        // - Correcting payment records
        if (existingMethodID === 1) {
          const isFullyPaid = existingPaidStatus === "PAID" && existingBalanceAmount <= 0;
          
          if (isFullyPaid) {
            // Pay Full is fully paid - but allow switching to Item Split by deleting Pay Full
            // This is useful for testing or if user wants to change payment method
            console.log(`[PAYMENT:SVC] Item split - Found fully paid Pay Full payment, but allowing switch to Item Split (deleting Pay Full record)`);
            // Delete the Pay Full payment to allow Item Split
            const deleteReq = new mssql.Request(tx);
            deleteReq.input("PaymentID", mssql.BigInt, toInt(anyExistingPayment.PaymentID));
            const deleteSql = `DELETE FROM ${T_PAYMENT} WHERE ${q("PaymentID")} = @PaymentID`;
            await deleteReq.query(deleteSql);
            console.log(`[PAYMENT:SVC] Item split - Deleted Pay Full payment to allow Item Split`);
          } else {
            // Pay Full exists but bill isn't fully paid - allow switching to Item Split
            console.log(`[PAYMENT:SVC] Item split - Found Pay Full payment but bill is not fully paid (Status: ${existingPaidStatus}, Balance: ${existingBalanceAmount}), allowing switch to Item Split`);
            // Delete the incomplete Pay Full payment to allow Item Split
            const deleteReq = new mssql.Request(tx);
            deleteReq.input("PaymentID", mssql.BigInt, toInt(anyExistingPayment.PaymentID));
            const deleteSql = `DELETE FROM ${T_PAYMENT} WHERE ${q("PaymentID")} = @PaymentID`;
            await deleteReq.query(deleteSql);
            console.log(`[PAYMENT:SVC] Item split - Deleted incomplete Pay Full payment to allow Item Split`);
          }
        } else {
          // For other methods (Equal Split, Custom Split), check if fully paid
          const isFullyPaid = existingPaidStatus === "PAID" && existingBalanceAmount <= 0;
          if (isFullyPaid) {
            throw new Error("This bill has already been fully paid. No additional payments can be made.");
          }
          // If not fully paid, reject switching between split methods
          const methodNames = { 1: "Pay Full", 2: "Equal Split", 3: "Item Split", 4: "Custom Split" };
          throw new Error(`Cannot use Item Split (MethodID=3) for this bill. This bill is already using ${methodNames[existingMethodID] || `MethodID=${existingMethodID}`} and payment has been made. Once a payment method is chosen and payment is made, all payments must use the same method.`);
        }
      }
      
      // If a different method exists but NO payment has been made (PaidAmount = 0), delete it and allow this method
      if (existingMethodID !== 3 && existingPaidAmount <= 0) {
        console.log(`[PAYMENT:SVC] Item split - Found existing MethodID=${existingMethodID} payment with PaidAmount=0, deleting it to allow Item Split`);
        const deleteReq = new mssql.Request(tx);
        deleteReq.input("PaymentID", mssql.BigInt, toInt(anyExistingPayment.PaymentID));
        const deleteSql = `DELETE FROM ${T_PAYMENT} WHERE ${q("PaymentID")} = @PaymentID`;
        await deleteReq.query(deleteSql);
        console.log(`[PAYMENT:SVC] Item split - Deleted unused payment (MethodID=${existingMethodID})`);
      }
    }
    
    // Now check specifically for MethodID=3 payment (item split)
    const existingPaymentReq = new mssql.Request(tx);
    existingPaymentReq.input("TransID", mssql.BigInt, transId);
    existingPaymentReq.input("MethodID", mssql.BigInt, 3);
    
    const existingPaymentSql = `
      SELECT TOP 1 ${q("PaymentID")}, ${q("BillAmount")}, ${q("PaidAmount")}, ${q("BalanceAmount")}, ${q("PaidStatus")}
      FROM ${T_PAYMENT}
      WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @MethodID
      ORDER BY ${q("PaymentID")} ASC
    `;
    
    const existingPaymentResult = await existingPaymentReq.query(existingPaymentSql);
    const existingPayment = existingPaymentResult.recordset[0];
    
    // Calculate amount being paid for selected items
    // CRITICAL: First check if there's an existing payment to validate against already-paid items
    let itemsPaidAmount = 0;
    const itemsToPay = [];
    
    // If there's an existing payment, check which items are already paid
    let alreadyPaidKotChildIds = new Set();
    if (existingPayment) {
      const existingPaymentId = toInt(existingPayment.PaymentID);
      const checkPaidItemsReq = new mssql.Request(tx);
      checkPaidItemsReq.input("PaymentID", mssql.BigInt, existingPaymentId);
      
      const checkPaidItemsSql = `
        SELECT kotChildID
        FROM dbo.PaymentItems
        WHERE PaymentID = @PaymentID
      `;
      
      try {
        const paidItemsResult = await checkPaidItemsReq.query(checkPaidItemsSql);
        if (paidItemsResult.recordset && paidItemsResult.recordset.length > 0) {
          paidItemsResult.recordset.forEach(row => {
            alreadyPaidKotChildIds.add(toInt(row.kotChildID));
          });
          console.log("[PAYMENT:SVC] Item split - Found already paid items:", Array.from(alreadyPaidKotChildIds));
        }
      } catch (err) {
        console.warn("[PAYMENT:SVC] Could not check paid items (PaymentItems table may not exist):", err.message);
      }
    }
    
    // Calculate amount only for items that are NOT already paid
    items.forEach(item => {
      const kotChildId = toInt(item.kotChildId || item.kotChildID || 0);
      const itemTotal = toNum(item.lineTotal || 0);
      
      if (kotChildId > 0 && alreadyPaidKotChildIds.has(kotChildId)) {
        console.warn(`[PAYMENT:SVC] Item split - Skipping already paid item: kotChildID=${kotChildId}, amount=${itemTotal}`);
        // Don't add to itemsPaidAmount - this item is already paid
      } else {
        itemsPaidAmount += itemTotal;
        itemsToPay.push({ kotChildId, itemTotal });
      }
    });
    
    itemsPaidAmount = r2(itemsPaidAmount);
    
    if (itemsPaidAmount <= 0) {
      throw new Error("No valid items to pay for. All selected items may have already been paid.");
    }
    
    console.log("[PAYMENT:SVC] Item split - Valid items to pay:", itemsToPay.length, "Total amount:", itemsPaidAmount);
    
    let paymentId;
    let newPaidAmount;
    let newBalanceAmount;
    let paidStatus;
    let finalBillAmount = originalBillAmount; // Will be set correctly for both new and update cases

    if (existingPayment) {
      // Update existing payment record - accumulate paid amount
      paymentId = toInt(existingPayment.PaymentID);
      const currentPaidAmount = toNum(existingPayment.PaidAmount, 0);
      const storedBillAmount = toNum(existingPayment.BillAmount, 0);
      
      // CRITICAL: For item split, ALWAYS use the stored BillAmount from the FIRST payment
      // This is the original total bill amount and should NEVER change
      // If storedBillAmount is 0 or invalid, use the provided originalBillAmount
      // But if storedBillAmount exists, it's the source of truth (from first payment)
      // NEVER use the new originalBillAmount if storedBillAmount exists - it might be wrong
      const billAmountToUse = storedBillAmount > 0 ? storedBillAmount : originalBillAmount;
      finalBillAmount = billAmountToUse; // Store for return statement
      
      // Validate: The new originalBillAmount should match storedBillAmount (if stored exists)
      // If they don't match, use storedBillAmount (it's the correct original)
      if (storedBillAmount > 0 && Math.abs(storedBillAmount - originalBillAmount) > 0.01) {
        console.warn(`[PAYMENT:SVC] Item split - BillAmount mismatch! Stored: ${storedBillAmount}, Provided: ${originalBillAmount}. Using stored value.`);
        console.warn(`[PAYMENT:SVC] Item split - This might indicate the frontend is sending incorrect totalBillAmount. Check frontend calculation.`);
      }
      
      // CRITICAL: Verify that BillAmount makes sense - it should be >= currentPaidAmount + itemsPaidAmount
      // If BillAmount is less than what's being paid, there's a calculation error
      const totalBeingPaid = currentPaidAmount + itemsPaidAmount;
      if (billAmountToUse < totalBeingPaid) {
        console.error(`[PAYMENT:SVC] Item split - CRITICAL ERROR: BillAmount (${billAmountToUse}) < TotalBeingPaid (${totalBeingPaid}). This indicates a calculation error!`);
        // Don't throw - use the stored BillAmount but log the error
      }
      
      console.log("[PAYMENT:SVC] Item split - Payment calculation:", {
        storedBillAmount,
        originalBillAmount,
        billAmountToUse: billAmountToUse, // This is what we'll use
        currentPaidAmount,
        itemsPaidAmount,
        calculation: `${billAmountToUse} - (${currentPaidAmount} + ${itemsPaidAmount}) = ${billAmountToUse - (currentPaidAmount + itemsPaidAmount)}`
      });
      
      // CRITICAL: Validate that itemsPaidAmount doesn't exceed remaining balance
      const remainingBalance = r2(billAmountToUse - currentPaidAmount);
      if (itemsPaidAmount > remainingBalance) {
        console.warn(`[PAYMENT:SVC] Item split - WARNING: itemsPaidAmount (${itemsPaidAmount}) > remainingBalance (${remainingBalance}). This might indicate duplicate payment.`);
        // Don't throw error, but log warning - might be legitimate if items include tax/service
      }
      
      // Add new payment to existing paid amount
      newPaidAmount = r2(currentPaidAmount + itemsPaidAmount);
      
      // CRITICAL: Ensure PaidAmount never exceeds BillAmount
      if (newPaidAmount > billAmountToUse) {
        console.error(`[PAYMENT:SVC] Item split - ERROR: newPaidAmount (${newPaidAmount}) > billAmountToUse (${billAmountToUse}). Capping to billAmount.`);
        newPaidAmount = r2(billAmountToUse);
      }
      
      // Recalculate balance using the ORIGINAL bill amount (stored from first payment)
      // Formula: Balance = OriginalBillAmount - (AllPaidAmounts)
      newBalanceAmount = r2(billAmountToUse - newPaidAmount);
      if (newBalanceAmount < 0) newBalanceAmount = 0;
      
      // Update status based on balance
      paidStatus = newBalanceAmount <= 0 ? "PAID" : "PENDING";
      
      console.log("[PAYMENT:SVC] Updating existing item split payment:", {
        paymentId,
        billAmount: billAmountToUse,
        currentPaidAmount,
        itemsPaidAmount,
        newPaidAmount,
        newBalanceAmount,
        paidStatus
      });
      
      const updateReq = new mssql.Request(tx);
      updateReq.input("PaymentID", mssql.BigInt, paymentId);
      updateReq.input("PaidAmount", mssql.Money, newPaidAmount);
      updateReq.input("BalanceAmount", mssql.Money, newBalanceAmount);
      updateReq.input("PaidStatus", mssql.VarChar(50), paidStatus);
      
      const updateSql = `
        UPDATE ${T_PAYMENT}
        SET ${q("PaidAmount")} = @PaidAmount,
            ${q("BalanceAmount")} = @BalanceAmount,
            ${q("PaidStatus")} = @PaidStatus
        WHERE ${q("PaymentID")} = @PaymentID
      `;
      
      await updateReq.query(updateSql);
      console.log("[PAYMENT:SVC] Updated existing item split payment record");
      
    } else {
      // Insert new payment record
      paymentId = await getNextPaymentId(tx);
      
      // First payment: BillAmount = total bill, PaidAmount = items paid, Balance = remaining
      newPaidAmount = r2(itemsPaidAmount);
      newBalanceAmount = r2(originalBillAmount - newPaidAmount);
      if (newBalanceAmount < 0) newBalanceAmount = 0;
      paidStatus = newBalanceAmount <= 0 ? "PAID" : "PENDING";
      
      console.log("[PAYMENT:SVC] Creating new item split payment record:", {
        paymentId,
        ShopID: 1,
        TransID: transId,
        MethodID: 3,
        BillAmount: originalBillAmount,
        PaidAmount: newPaidAmount,
        BalanceAmount: newBalanceAmount,
        PaidStatus: paidStatus,
        TableID: tableId ? toInt(tableId) : null
      });
      
      const insertReq = new mssql.Request(tx);
      const paymentData = {
        PaymentID: paymentId,
        ShopID: 1,
        TransID: transId,
        MethodID: 3,
        BillAmount: originalBillAmount,
        PaidAmount: newPaidAmount,
        BalanceAmount: newBalanceAmount,
        PaidStatus: paidStatus
      };
      
      Object.entries(paymentData).forEach(([key, value]) => {
        if (key === "PaidStatus") {
          insertReq.input(key, mssql.VarChar(50), value);
        } else if (["BillAmount", "PaidAmount", "BalanceAmount"].includes(key)) {
          insertReq.input(key, mssql.Money, value);
        } else {
          insertReq.input(key, mssql.BigInt, value);
        }
      });
      
      if (tableId) {
        insertReq.input("TableID", mssql.BigInt, toInt(tableId));
        paymentData.TableID = toInt(tableId);
      }

      await insertReq.query(buildPaymentInsertSql(!!tableId));
      console.log("[PAYMENT:SVC] ✅ Inserted new item split payment record with MethodID=3");
    }

    // Track which items are paid - insert into PaymentItems table
    // This allows us to query which items have been paid for this kotMasterID
    const T_PAYMENT_ITEMS = "dbo.PaymentItems";
    
    console.log("[PAYMENT:SVC] Item split - Starting PaymentItems insertion for", items.length, "items");
    
    // Check if PaymentItems table exists, if not we'll create records in a simpler way
    // For now, let's store paid items in PaymentItems table
    let itemsInserted = 0;
    let itemsSkipped = 0;
    let itemsErrors = 0;
    
    for (const item of items) {
      const kotChildId = toInt(item.kotChildId || item.kotChildID || 0);
      if (kotChildId <= 0) {
        console.warn("[PAYMENT:SVC] Item split - Skipping item with invalid kotChildID:", item);
        itemsSkipped++;
        continue;
      }
      
      const itemAmount = r2(toNum(item.lineTotal || 0));
      if (itemAmount <= 0) {
        console.warn("[PAYMENT:SVC] Item split - Skipping item with invalid amount:", { kotChildId, itemAmount });
        itemsSkipped++;
        continue;
      }

      // Check if this item is already tracked
      const checkItemReq = new mssql.Request(tx);
      checkItemReq.input("PaymentID", mssql.BigInt, paymentId);
      checkItemReq.input("kotChildID", mssql.BigInt, kotChildId);
      
      const checkItemSql = `
        SELECT TOP 1 PaymentItemID
        FROM ${T_PAYMENT_ITEMS}
        WHERE PaymentID = @PaymentID AND kotChildID = @kotChildID
      `;
      
      try {
        const checkItemResult = await checkItemReq.query(checkItemSql);
        
        if (!checkItemResult.recordset || checkItemResult.recordset.length === 0) {
          // Insert new PaymentItem record
          const insertItemReq = new mssql.Request(tx);
          
          // Get next PaymentItemID
          const nextIdReq = new mssql.Request(tx);
          const nextIdSql = `
            SELECT CASE 
              WHEN MAX(PaymentItemID) IS NULL THEN 1
              ELSE MAX(PaymentItemID) + 1
            END AS nextId
            FROM ${T_PAYMENT_ITEMS}
          `;
          const nextIdResult = await nextIdReq.query(nextIdSql);
          const nextItemId = toInt(nextIdResult.recordset[0]?.nextId, 1);
          
          insertItemReq.input("PaymentItemID", mssql.BigInt, nextItemId);
          insertItemReq.input("PaymentID", mssql.BigInt, paymentId);
          insertItemReq.input("kotChildID", mssql.BigInt, kotChildId);
          insertItemReq.input("AmountPaid", mssql.Money, itemAmount);
          
          const insertItemSql = `
            INSERT INTO ${T_PAYMENT_ITEMS} (PaymentItemID, PaymentID, kotChildID, AmountPaid)
            VALUES (@PaymentItemID, @PaymentID, @kotChildID, @AmountPaid)
          `;
          
          await insertItemReq.query(insertItemSql);
          console.log("[PAYMENT:SVC] ✅ Tracked paid item:", { PaymentItemID: nextItemId, PaymentID: paymentId, kotChildId, itemAmount });
          itemsInserted++;
        } else {
          console.log("[PAYMENT:SVC] Item already tracked in PaymentItems, skipping:", { kotChildId, PaymentID: paymentId });
          itemsSkipped++;
        }
      } catch (err) {
        // Log error but don't fail the entire transaction - payment is still valid
        console.error("[PAYMENT:SVC] ❌ Error inserting PaymentItem:", {
          error: err.message,
          kotChildId,
          itemAmount,
          PaymentID: paymentId,
          stack: err.stack
        });
        itemsErrors++;
        // Don't throw - allow payment to complete even if PaymentItems insert fails
        // This ensures the Payment record is still saved
      }
    }
    
    console.log("[PAYMENT:SVC] Item split - PaymentItems insertion summary:", {
      total: items.length,
      inserted: itemsInserted,
      skipped: itemsSkipped,
      errors: itemsErrors
    });
    
    // If no items were inserted and there were errors, log a warning
    if (itemsInserted === 0 && itemsErrors > 0) {
      console.warn("[PAYMENT:SVC] ⚠️ WARNING: No PaymentItems were inserted due to errors. Payment record was saved, but item tracking may be incomplete.");
    }

    await tx.commit();

    console.log("[PAYMENT:SVC] ✅ Item split payment completed successfully:", {
      paymentId,
      MethodID: 3,
      BillAmount: finalBillAmount,
      PaidAmount: newPaidAmount,
      BalanceAmount: newBalanceAmount,
      PaidStatus: paidStatus,
      itemsPaid: itemsPaidAmount,
      itemsInserted,
      tableId: tableId ? toInt(tableId) : null
    });

    return {
      ok: true,
      paymentId,
      ShopID: 1,
      TransID: transId,
      MethodID: 3,
      BillAmount: finalBillAmount,
      PaidAmount: newPaidAmount,
      BalanceAmount: newBalanceAmount,
      PaidStatus: paidStatus,
      // Also include lowercase versions for frontend compatibility
      billAmount: finalBillAmount,
      paidAmount: newPaidAmount,
      balanceAmount: newBalanceAmount,
      paidStatus: paidStatus,
      itemsPaid: itemsPaidAmount,
      tableId: tableId ? toInt(tableId) : null
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 * Get paid items for a kotMasterID (item split payments)
 * @param {number} kotMasterID - KOT Master ID
 * @returns {Promise<Array>} Array of paid kotChildIDs
 */
export async function getPaidItems(kotMasterID) {
  if (!kotMasterID) {
    return [];
  }

  const numericKotMasterID = toInt(kotMasterID);
  if (numericKotMasterID <= 0) {
    return [];
  }

  try {
    // Get PaymentID for this kotMasterID with MethodID = 3
    const paymentSql = `
      SELECT TOP 1 ${q("PaymentID")}
      FROM ${T_PAYMENT}
      WHERE ${q("ShopID")} = 1 AND ${q("TransID")} = @kotMasterID AND ${q("MethodID")} = 3
      ORDER BY ${q("PaymentID")} ASC
    `;
    
    const paymentResults = await queryPaymentDb(paymentSql, { kotMasterID: numericKotMasterID });
    
    if (!paymentResults || paymentResults.length === 0) {
      return [];
    }

    const paymentId = toInt(paymentResults[0].PaymentID);
    
    // Get paid items from PaymentItems table
    const paidItemsSql = `
      SELECT kotChildID
      FROM dbo.PaymentItems
      WHERE PaymentID = @paymentId
    `;
    
    const pool = await connectToPaymentDb();
    const req = pool.request();
    req.input("paymentId", mssql.BigInt, paymentId);
    
    try {
      const paidItemsResult = await req.query(paidItemsSql);
      const paidKotChildIds = (paidItemsResult.recordset || []).map(row => toInt(row.kotChildID));
      
      console.log("[PAYMENT:SVC] Found paid items for kotMasterID:", numericKotMasterID, "Items:", paidKotChildIds);
      
      return paidKotChildIds;
    } catch (err) {
      // If PaymentItems table doesn't exist, return empty array
      console.warn("[PAYMENT:SVC] PaymentItems table may not exist:", err.message);
      return [];
    }
  } catch (err) {
    console.error("[PAYMENT:SVC] Error getting paid items:", err);
    return [];
  }
}

export async function getTableBalance(tableId, kotMasterID = null) {
  if (!tableId) {
    return { balance: 0, hasPendingPayment: false, isFullyPaid: false, hasUnpaidKots: false };
  }

  const numericTableId = toInt(tableId);
  
  // FIRST: Check if there's a payment for the specific kotMasterID (if provided)
  // This takes priority - check for both MethodID = 1 (Pay Full) and MethodID = 4 (Custom Split)
  if (kotMasterID) {
    const numericKotMasterID = toInt(kotMasterID);
    if (numericKotMasterID > 0) {
      // Check for any payment (MethodID = 1, 2, 3, or 4) for this kotMasterID
      const kotPaymentSql = `
        SELECT TOP 1 ${q("TransID")}, ${q("MethodID")}, ${q("BillAmount")}, ${q("PaidAmount")}, ${q("BalanceAmount")}, ${q("PaidStatus")}
        FROM ${T_PAYMENT}
        WHERE ${q("ShopID")} = 1 AND ${q("TransID")} = @kotMasterID AND (${q("MethodID")} = 1 OR ${q("MethodID")} = 2 OR ${q("MethodID")} = 3 OR ${q("MethodID")} = 4)
        ORDER BY ${q("PaymentID")} DESC
      `;
      
      const kotPaymentResults = await queryPaymentDb(kotPaymentSql, { kotMasterID: numericKotMasterID });
      
      if (kotPaymentResults && kotPaymentResults.length > 0) {
        const paymentRecord = kotPaymentResults[0];
        const originalBillAmount = toNum(paymentRecord?.BillAmount, 0);
        const totalPaid = toNum(paymentRecord?.PaidAmount, 0);
        const balance = toNum(paymentRecord?.BalanceAmount, 0);
        const paidStatus = paymentRecord?.PaidStatus || "PENDING";
        const methodId = toNum(paymentRecord?.MethodID, 0);
        
        console.log("[PAYMENT:SVC] Found payment for kotMasterID:", numericKotMasterID, "MethodID:", methodId, "Balance:", balance, "Status:", paidStatus);
        
        // Calculate equal split info if MethodID = 2
        let equalSplitInfo = null;
        if (methodId === 2) {
          const billAmt = r2(originalBillAmount);
          
          if (billAmt > 0 && totalPaid > 0) {
            // Strategy: Try different number of people (2-8) and see which gives the best match
            let bestMatch = null;
            let bestScore = 0;
            
            for (let people = 2; people <= 8; people++) {
              const amountPerPerson = r2(billAmt / people);
              const paymentsMade = Math.round(totalPaid / amountPerPerson);
              const expectedTotal = r2(amountPerPerson * paymentsMade);
              const difference = Math.abs(totalPaid - expectedTotal);
              
              if (paymentsMade > 0 && paymentsMade <= people && difference < 1.0) {
                const score = (1 / (difference + 0.01)) * (paymentsMade / people);
                if (score > bestScore) {
                  bestScore = score;
                  bestMatch = {
                    amountPerPerson: amountPerPerson,
                    numberOfPeople: people
                  };
                }
              }
            }
            
            if (bestMatch) {
              equalSplitInfo = bestMatch;
            } else {
              // Fallback: estimate from total paid amount
              if (totalPaid < billAmt / 2) {
                const estimatedPeople = Math.round(billAmt / totalPaid);
                if (estimatedPeople >= 2 && estimatedPeople <= 8) {
                  equalSplitInfo = {
                    amountPerPerson: r2(totalPaid),
                    numberOfPeople: estimatedPeople
                  };
                }
              }
            }
          }
        }
        
        // CRITICAL: When balance = 0 and status = PAID, payment is complete
        // Return balance = 0 (not the original bill amount)
        // For equal split: Only show split info if balance > 0 (payment not complete)
        // Also return originalBillAmount so frontend can use it for subsequent payments
        return {
          balance: balance > 0 ? r2(balance) : 0,
          originalBillAmount: originalBillAmount > 0 ? r2(originalBillAmount) : null, // Always return actual balance (0 when paid)
          hasPendingPayment: paidStatus === "PENDING" && balance > 0,
          isFullyPaid: balance <= 0 || paidStatus === "PAID",
          hasUnpaidKots: false,
          transId: numericKotMasterID,
          billAmount: r2(originalBillAmount), // Always return original full bill amount
          originalBillAmount: r2(originalBillAmount),
          totalPaid: r2(totalPaid),
          paidStatus: paidStatus, // Include PaidStatus in response
          // Only include equal split info if payment is NOT complete (balance > 0)
          equalSplitInfo: (balance > 0 && paidStatus === "PENDING") ? equalSplitInfo : null
        };
      }
    }
  }
  
  // SECOND: Check if there are any unpaid KOTs (BillID = 0) for this table
  const kotPool = await connectToDb();
  const kotCheckSql = `
    SELECT COUNT(*) AS unpaidKotCount
    FROM dbo.KOTMaster
    WHERE TableID = @tableId 
      AND ISNULL(BillID, 0) = 0
      AND ISNULL(KotStatus, '') <> 'CANCELLED'
  `;
  const kotCheckReq = kotPool.request();
  kotCheckReq.input("tableId", mssql.Int, numericTableId);
  const kotCheckResult = await kotCheckReq.query(kotCheckSql);
  const unpaidKotCount = toNum(kotCheckResult.recordset[0]?.unpaidKotCount, 0);
  const hasUnpaidKots = unpaidKotCount > 0;
  
  console.log("[PAYMENT:SVC] getTableBalance - Unpaid KOTs count:", unpaidKotCount, "for table:", numericTableId);
  
  // If there are unpaid KOTs and no payment found for specific kotMasterID, return that the table is NOT fully paid
  if (hasUnpaidKots) {
    return {
      balance: 0,
      hasPendingPayment: false,
      isFullyPaid: false,
      hasUnpaidKots: true,
      unpaidKotCount
    };
  }
  
  // THIRD: If no unpaid KOTs, check for any pending split payments for this table (MethodID = 2, 3, or 4)
  const pendingSql = `
    SELECT TOP 1 ${q("TransID")}, ${q("MethodID")}, ${q("BillAmount")}, ${q("PaidAmount")}, ${q("BalanceAmount")}, ${q("PaidStatus")}
    FROM ${T_PAYMENT}
    WHERE ${q("ShopID")} = 1 AND ${q("TableID")} = @tableId AND ${q("PaidStatus")} = 'PENDING' AND (${q("MethodID")} = 2 OR ${q("MethodID")} = 3 OR ${q("MethodID")} = 4)
    ORDER BY ${q("PaymentID")} DESC
  `;
  
  const results = await queryPaymentDb(pendingSql, { tableId: numericTableId });
  
  if (!results || results.length === 0) {
    // No pending payments and no unpaid KOTs - table is fully paid
    return { balance: 0, hasPendingPayment: false, isFullyPaid: true, hasUnpaidKots: false };
  }

  // Get the payment record (there's only one per kotMasterID now)
  const paymentRecord = results[0];
  const transId = toNum(paymentRecord?.TransID, 0);
  const originalBillAmount = toNum(paymentRecord?.BillAmount, 0);
  const totalPaid = toNum(paymentRecord?.PaidAmount, 0);
  const balance = toNum(paymentRecord?.BalanceAmount, 0);
  const methodId = toNum(paymentRecord?.MethodID, 0);

  // Calculate amount per person for equal split (MethodID = 2)
  // If it's an equal split, estimate amount per person from payment pattern
  let equalSplitInfo = null;
  if (methodId === 2) {
    const billAmt = r2(originalBillAmount);
    
    if (billAmt > 0 && totalPaid > 0) {
      // Strategy: Try different number of people (2-8) and see which gives the best match
      // For equal split, amountPerPerson = BillAmount / numberOfPeople
      // totalPaid should be a multiple of amountPerPerson
      let bestMatch = null;
      let bestScore = 0;
      
      // Try different number of people (2 to 8)
      for (let people = 2; people <= 8; people++) {
        const amountPerPerson = r2(billAmt / people);
        
        // Check if totalPaid is close to a multiple of amountPerPerson
        const paymentsMade = Math.round(totalPaid / amountPerPerson);
        const expectedTotal = r2(amountPerPerson * paymentsMade);
        const difference = Math.abs(totalPaid - expectedTotal);
        
        // Score: how close the match is, and if it makes sense (paymentsMade <= people)
        if (paymentsMade > 0 && paymentsMade <= people && difference < 1.0) {
          const score = (1 / (difference + 0.01)) * (paymentsMade / people);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = {
              amountPerPerson: amountPerPerson,
              numberOfPeople: people
            };
          }
        }
      }
      
      // If we found a good match, use it
      if (bestMatch) {
        equalSplitInfo = bestMatch;
      } else {
        // Fallback: if totalPaid is less than half of billAmt, assume it's a single payment
        // and estimate numberOfPeople from that
        if (totalPaid < billAmt / 2) {
          const estimatedPeople = Math.round(billAmt / totalPaid);
          if (estimatedPeople >= 2 && estimatedPeople <= 8) {
            equalSplitInfo = {
              amountPerPerson: r2(totalPaid),
              numberOfPeople: estimatedPeople
            };
          }
        }
      }
    }
  }

  // CRITICAL: When balance = 0, payment is complete
  // Return balance = 0 (not the original bill amount)
  // For equal split: Only show split info if balance > 0 (payment not complete)
  return {
    balance: balance > 0 ? r2(balance) : 0, // Always return actual balance (0 when paid)
    hasPendingPayment: balance > 0,
    isFullyPaid: balance <= 0,
    hasUnpaidKots: false,
    transId,
    billAmount: r2(originalBillAmount), // Always return original full bill amount
    originalBillAmount: r2(originalBillAmount),
    totalPaid: r2(totalPaid),
    // Only include equal split info if payment is NOT complete (balance > 0)
    equalSplitInfo: balance > 0 ? equalSplitInfo : null
  };
}
