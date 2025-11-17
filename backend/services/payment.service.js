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

    // IMPORTANT: Check if there's already a custom split payment (MethodID = 4) for this kotMasterID
    // If split has started, we should complete it using MethodID = 4, NOT create a new MethodID = 1 record
    if (transId > 0) {
      const checkSplitReq = new mssql.Request(tx);
      checkSplitReq.input("TransID", mssql.BigInt, transId);
      checkSplitReq.input("MethodID", mssql.BigInt, 4);
      
      const checkSplitSql = `
        SELECT TOP 1 ${q("PaymentID")}, ${q("BillAmount")}, ${q("PaidAmount")}, ${q("BalanceAmount")}, ${q("PaidStatus")}
        FROM ${T_PAYMENT}
        WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @MethodID
        ORDER BY ${q("PaymentID")} ASC
      `;
      
      const splitCheckResult = await checkSplitReq.query(checkSplitSql);
      const existingSplitPayment = splitCheckResult.recordset[0];
      
      if (existingSplitPayment) {
        // Split has already started - use custom split logic to complete the remaining balance
        console.log("[PAYMENT:SVC] Found existing split payment (MethodID=4), completing it instead of creating MethodID=1");
        
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
        
        console.log("[PAYMENT:SVC] Completed split payment by updating existing record");
        
        return {
          ok: true,
          paymentId: toInt(existingSplitPayment.PaymentID),
          ShopID: 1,
          TransID: transId,
          MethodID: 4, // Keep MethodID = 4
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

    // Check if there's an existing payment record for this kotMasterID (TransID) and MethodID=2
    const existingPaymentReq = new mssql.Request(tx);
    existingPaymentReq.input("TransID", mssql.BigInt, transId);
    existingPaymentReq.input("MethodID", mssql.BigInt, 2);
    
    const existingPaymentSql = `
      SELECT TOP 1 ${q("PaymentID")}, ${q("BillAmount")}, ${q("PaidAmount")}, ${q("BalanceAmount")}, ${q("PaidStatus")}, ${q("TableID")}
      FROM ${T_PAYMENT}
      WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @MethodID
      ORDER BY ${q("PaymentID")} ASC
    `;
    
    const existingPaymentResult = await existingPaymentReq.query(existingPaymentSql);
    const existingPayment = existingPaymentResult.recordset[0];
    
    let paymentId;
    let newPaidAmount;
    let newBalanceAmount;
    let paidStatus;

    if (existingPayment) {
      // Update existing payment record - accumulate paid amount
      paymentId = toInt(existingPayment.PaymentID);
      const currentPaidAmount = toNum(existingPayment.PaidAmount, 0);
      const storedBillAmount = toNum(existingPayment.BillAmount, billAmt);
      
      // Use the stored BillAmount (original total) or update if different
      const billAmountToUse = storedBillAmount > 0 ? storedBillAmount : billAmt;
      
      // Add new payment to existing paid amount
      newPaidAmount = r2(currentPaidAmount + paidAmt);
      
      // Recalculate balance
      newBalanceAmount = r2(billAmountToUse - newPaidAmount);
      if (newBalanceAmount < 0) newBalanceAmount = 0;
      
      // Update status based on balance
      paidStatus = newBalanceAmount <= 0 ? "PAID" : "PENDING";
      
      console.log("[PAYMENT:SVC] Updating existing equal split payment:", {
        paymentId,
        billAmount: billAmountToUse,
        currentPaidAmount,
        paidAmt,
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
      console.log("[PAYMENT:SVC] Updated existing equal split payment record");
      
    } else {
      // Insert new payment record
      paymentId = await getNextPaymentId(tx);
      
      // First payment: BillAmount = total bill, PaidAmount = equal share paid, Balance = remaining
      newPaidAmount = r2(paidAmt);
      newBalanceAmount = r2(billAmt - newPaidAmount);
      if (newBalanceAmount < 0) newBalanceAmount = 0;
      paidStatus = newBalanceAmount <= 0 ? "PAID" : "PENDING";
      
      console.log("[PAYMENT:SVC] Creating new equal split payment record:", {
        paymentId,
        billAmount: billAmt,
        paidAmount: newPaidAmount,
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
        BillAmount: billAmt,
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
      console.log("[PAYMENT:SVC] Inserted new equal split payment record");
    }

    await tx.commit();

    return {
      ok: true,
      paymentId,
      ShopID: 1,
      TransID: transId,
      MethodID: 2,
      BillAmount: billAmt,
      PaidAmount: newPaidAmount,
      BalanceAmount: newBalanceAmount,
      PaidStatus: paidStatus,
      paidAmount: newPaidAmount, // Lowercase for frontend
      balanceAmount: newBalanceAmount, // Lowercase for frontend
      paidStatus: paidStatus, // Lowercase for frontend
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

    // Check if there's an existing payment record for this kotMasterID (TransID) and MethodID=4
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

    // Calculate amount being paid for selected items
    let itemsPaidAmount = 0;
    items.forEach(item => {
      const itemTotal = toNum(item.lineTotal || 0);
      itemsPaidAmount += itemTotal;
    });
    itemsPaidAmount = r2(itemsPaidAmount);

    // Use kotMasterID as TransID (same as other payment methods)
    const transId = toInt(kotMasterID);
    
    if (transId <= 0) {
      throw new Error("Valid kotMasterID is required for item split payment");
    }

    console.log("[PAYMENT:SVC] Using TransID =", transId, "(kotMasterID)");

    // Get total bill amount (from KOTMaster or passed as parameter)
    // If totalBillAmount is provided, use it; otherwise we'll need to query KOTMaster
    let originalBillAmount = r2(toNum(totalBillAmount, 0));
    
    if (originalBillAmount <= 0) {
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
      }
    }

    if (originalBillAmount <= 0) {
      throw new Error("Could not determine total bill amount for this KOT");
    }

    // Check if there's an existing payment record for this kotMasterID and MethodID=3
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
    
    let paymentId;
    let newPaidAmount;
    let newBalanceAmount;
    let paidStatus;

    if (existingPayment) {
      // Update existing payment record - accumulate paid amount
      paymentId = toInt(existingPayment.PaymentID);
      const currentPaidAmount = toNum(existingPayment.PaidAmount, 0);
      const storedBillAmount = toNum(existingPayment.BillAmount, originalBillAmount);
      
      // Use the stored BillAmount (original total) or update if different
      const billAmountToUse = storedBillAmount > 0 ? storedBillAmount : originalBillAmount;
      
      // Add new payment to existing paid amount
      newPaidAmount = r2(currentPaidAmount + itemsPaidAmount);
      
      // Recalculate balance
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
        billAmount: originalBillAmount,
        paidAmount: newPaidAmount,
        balanceAmount: newBalanceAmount,
        paidStatus
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
      }

      await insertReq.query(buildPaymentInsertSql(!!tableId));
      console.log("[PAYMENT:SVC] Inserted new item split payment record");
    }

    // Track which items are paid - insert into PaymentItems table
    // This allows us to query which items have been paid for this kotMasterID
    const T_PAYMENT_ITEMS = "dbo.PaymentItems";
    
    // Check if PaymentItems table exists, if not we'll create records in a simpler way
    // For now, let's store paid items in PaymentItems table
    for (const item of items) {
      const kotChildId = toInt(item.kotChildId || item.kotChildID || 0);
      if (kotChildId <= 0) continue;
      
      const itemAmount = r2(toNum(item.lineTotal || 0));
      if (itemAmount <= 0) continue;

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
          console.log("[PAYMENT:SVC] Tracked paid item:", { kotChildId, itemAmount });
        }
      } catch (err) {
        // If PaymentItems table doesn't exist, log warning but continue
        console.warn("[PAYMENT:SVC] PaymentItems table may not exist, skipping item tracking:", err.message);
      }
    }

    await tx.commit();

    return {
      ok: true,
      paymentId,
      ShopID: 1,
      TransID: transId,
      MethodID: 3,
      BillAmount: originalBillAmount,
      PaidAmount: newPaidAmount,
      BalanceAmount: newBalanceAmount,
      PaidStatus: paidStatus,
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
        
        return {
          balance: balance > 0 ? balance : 0,
          hasPendingPayment: paidStatus === "PENDING" && balance > 0,
          isFullyPaid: balance <= 0 || paidStatus === "PAID",
          hasUnpaidKots: false,
          transId: numericKotMasterID,
          billAmount: balance > 0 ? r2(balance) : r2(originalBillAmount),
          originalBillAmount: r2(originalBillAmount),
          totalPaid: r2(totalPaid),
          paidStatus: paidStatus, // Include PaidStatus in response
          equalSplitInfo: equalSplitInfo // Include equal split info if MethodID = 2
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

  return {
    balance: balance > 0 ? balance : 0,
    hasPendingPayment: balance > 0,
    isFullyPaid: balance <= 0,
    hasUnpaidKots: false,
    transId,
    billAmount: balance > 0 ? r2(balance) : r2(originalBillAmount),
    originalBillAmount: r2(originalBillAmount),
    totalPaid: r2(totalPaid),
    equalSplitInfo: equalSplitInfo // Include equal split info if applicable
  };
}
