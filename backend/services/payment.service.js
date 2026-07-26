// backend/services/payment.service.js
import mssql from "mssql";
import { queryPaymentDb, connectToPaymentDb, connectToDb } from "../config/dbConfig.js";
import { settleKotToSales } from "./settlement.service.js";

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
async function getNextId(tx, column, startValue = 1000, table = T_PAYMENT) {
  const req = new mssql.Request(tx);
  // WITH (UPDLOCK, HOLDLOCK) serializes concurrent callers so two legs paid
  // at the same moment can't both read the same MAX(...) and collide -
  // PaymentID/PaymentItemID are manually-generated, not DB identities.
  const sql = `
    SELECT
      CASE
        WHEN MAX(${q(column)}) IS NULL THEN ${startValue}
        ELSE MAX(${q(column)}) + 1
      END AS nextId
    FROM ${table} WITH (UPDLOCK, HOLDLOCK)
  `;
  const rs = await req.query(sql);
  return Number(rs.recordset[0].nextId);
}

async function getNextPaymentId(tx) {
  return getNextId(tx, "PaymentID", 1000, T_PAYMENT);
}

// Flat AED commission DeynoQR takes from the restaurant (not the customer)
// on every payment row - Pay Full and every split leg, unconditionally.
const PLATFORM_FEE_AMOUNT = 0.525;

/**
 * Build INSERT SQL for payment record
 */
function buildPaymentInsertSql(includeTableId = false, includeFee = false) {
  const baseFields = [
    q("PaymentID"), q("ShopID"), q("TransID"), q("MethodID"),
    q("BillAmount"), q("PaidAmount"), q("PaidBillAmount"), q("BalanceAmount"), q("PaidStatus"),
    q("PlatformFeeAmount"), q("OrderRef"), q("TranRef"), q("AuthCode"), q("CreatedAt")
  ];
  const baseParams = [
    "@PaymentID", "@ShopID", "@TransID", "@MethodID",
    "@BillAmount", "@PaidAmount", "@PaidBillAmount", "@BalanceAmount", "@PaidStatus",
    "@PlatformFeeAmount", "@OrderRef", "@TranRef", "@AuthCode", "GETDATE()"
  ];

  if (includeTableId) {
    baseFields.push(q("TableID"));
    baseParams.push("@TableID");
  }

  if (includeFee) {
    baseFields.push(q("ServiceFeeAmount"), q("TipAmount"));
    baseParams.push("@ServiceFeeAmount", "@TipAmount");
  }

  return `
    INSERT INTO ${T_PAYMENT} (${baseFields.join(", ")})
    VALUES (${baseParams.join(", ")})
  `;
}

/**
 * Attach the Telr order/transaction reference to an insert Request.
 * All three are nullable — non-Telr or unverified legs just get NULLs.
 */
function addTelrRefInputs(req, { orderRef = null, tranRef = null, authCode = null } = {}) {
  req.input("OrderRef", mssql.NVarChar(100), orderRef || null);
  req.input("TranRef", mssql.NVarChar(100), tranRef || null);
  req.input("AuthCode", mssql.NVarChar(50), authCode || null);
}

/**
 * Aggregate every leg row sharing a TransID (+ MethodID filter) into one
 * whole-bill snapshot: SUM(PaidAmount/fees) across legs, MAX(BillAmount) as
 * the invariant full-bill figure, MAX(PaymentID) to identify the latest leg.
 * Returns null if no rows exist for this TransID+MethodID group yet.
 */
async function getGroupAggregate(tx, transId, methodIds) {
  const req = new mssql.Request(tx);
  req.input("TransID", mssql.BigInt, transId);
  const methods = Array.isArray(methodIds) ? methodIds : [methodIds];
  methods.forEach((m, i) => req.input(`m${i}`, mssql.BigInt, m));
  const inClause = methods.map((_, i) => `@m${i}`).join(",");
  const sql = `
    SELECT ${q("MethodID")},
           MAX(${q("BillAmount")})  AS BillAmount,
           SUM(${q("PaidAmount")})  AS PaidAmount,
           SUM(ISNULL(${q("ServiceFeeAmount")},0)) AS ServiceFeeAmount,
           SUM(ISNULL(${q("TipAmount")},0))        AS TipAmount,
           SUM(${q("PlatformFeeAmount")})          AS PlatformFeeAmount,
           -- PaidAmount stores the REAL total charged per leg (bill-share +
           -- fee + tip), so balance/remaining-bill math must use just the
           -- bill-share portion, not the raw sum.
           (SUM(${q("PaidAmount")}) - SUM(ISNULL(${q("ServiceFeeAmount")},0)) - SUM(ISNULL(${q("TipAmount")},0))) AS BillSharePaid,
           MAX(${q("TableID")})   AS TableID,
           MAX(${q("PaymentID")}) AS LatestPaymentID
    FROM ${T_PAYMENT}
    WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} IN (${inClause})
    GROUP BY ${q("MethodID")}
    ORDER BY MAX(${q("PaymentID")}) DESC
  `;
  const rs = await req.query(sql);
  // Only one method group should ever be active per TransID (cross-method
  // blocking enforces this) - ORDER BY makes the pick deterministic in the
  // rare transient case where a stale zero-paid row from another method
  // hasn't been cleaned up yet.
  return rs.recordset[0] || null;
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

/**
 * Update QrPaidAmount, QrBalanceAmount, and QrPaymentStatus in KOTMaster
 * after every successful QR payment (partial or full).
 * Runs against Moifcore using a fresh connection – outside the PaymentGateway
 * transaction so a KOTMaster update failure never rolls back the payment.
 */
async function updateKotMasterQrPayment(kotMasterID, totalPaidAmount, balanceAmount, paidStatus, posTipAmount = 0) {
  if (!kotMasterID || kotMasterID <= 0) return;
  try {
    const kotPool = await connectToDb();

    // Always recalc balance from the *current* KOT amount so that
    // if new items are added after an online payment, the remaining
    // balance reflects the latest bill total (KOTMaster.Amount - paid).
    let effectiveBalance = r2(Math.max(0, balanceAmount));
    try {
      const kmReq = kotPool.request();
      kmReq.input("kotMasterID", mssql.BigInt, kotMasterID);
      const kmSql = `
        SELECT Amount
        FROM dbo.KOTMaster
        WHERE kotMasterID = @kotMasterID
      `;
      const kmResult = await kmReq.query(kmSql);
      const currentAmount = kmResult.recordset?.[0]?.Amount;
      if (currentAmount != null) {
        const billTotal = r2(toNum(currentAmount, 0));
        const fromKot   = r2(Math.max(0, billTotal - r2(toNum(totalPaidAmount, 0))));
        effectiveBalance = fromKot;
      }
    } catch (kmErr) {
      console.warn("[PAYMENT:SVC] updateKotMasterQrPayment: failed to read current KOT amount, falling back to passed balanceAmount:", kmErr.message);
    }

    const qrPaymentStatus =
      paidStatus === "PAID"          ? "PAID"    :
      totalPaidAmount > 0           ? "PARTIAL" : "PENDING";

    const req = kotPool.request();
    req.input("kotMasterID",      mssql.BigInt,     kotMasterID);
    req.input("QrPaidAmount",     mssql.Money,      r2(totalPaidAmount));
    req.input("QrBalanceAmount",  mssql.Money,      effectiveBalance);
    req.input("QrPaymentStatus",  mssql.VarChar(20), qrPaymentStatus);

    const sql = `
      UPDATE dbo.KOTMaster
      SET    QrPaidAmount    = @QrPaidAmount,
             QrBalanceAmount = @QrBalanceAmount,
             QrPaymentStatus = @QrPaymentStatus
      WHERE  kotMasterID     = @kotMasterID
    `;

    await req.query(sql);
    console.log("[PAYMENT:SVC] KOTMaster QR payment updated:", {
      kotMasterID, totalPaidAmount, balanceAmount: effectiveBalance, qrPaymentStatus
    });

    // When fully paid → settle into SalesMaster / SalesChild and delete KOTMaster.
    // Fire-and-forget: we don't block the payment response on settlement.
    if (qrPaymentStatus === "PAID") {
      console.log("[PAYMENT:SVC] Payment complete — triggering settlement for kotMasterID:", kotMasterID);
      settleKotToSales(kotMasterID, { tipAmount: r2(toNum(posTipAmount, 0)) })
        .then(async (settlement) => {
          if (settlement?.alreadySettled) {
            console.log("[PAYMENT:SVC] KOT already settled, skipping.");
            return;
          }
          console.log(`[PAYMENT:SVC] Settlement done: SalesID=${settlement.salesID}, BillNo=${settlement.billNo}, items=${settlement.salesChildCount}`);

          // Stamp SalesID onto every Payment row for this kotMasterID — a split
          // bill can have multiple rows (one per split leg/method) under the
          // same TransID, and none of them get a SalesID until this final settle.
          try {
            const payPool = await connectToPaymentDb();
            await payPool.request()
              .input("TransID", mssql.BigInt, kotMasterID)
              .input("SalesID", mssql.BigInt, settlement.salesID)
              .query(`UPDATE ${T_PAYMENT} SET ${q("SalesID")} = @SalesID WHERE ${q("TransID")} = @TransID`);
            console.log(`[PAYMENT:SVC] Stamped SalesID=${settlement.salesID} on Payment rows for TransID=${kotMasterID}`);
          } catch (stampErr) {
            console.error("[PAYMENT:SVC] Failed to stamp SalesID on Payment rows:", stampErr.message);
          }
        })
        .catch((settleErr) => {
          // Log but never block — payment is already committed
          console.error("[PAYMENT:SVC] Settlement error (payment still recorded):", settleErr.message);
        });
    }
  } catch (err) {
    console.error("[PAYMENT:SVC] Failed to update KOTMaster QR payment status:", err.message);
  }
}

/* ---------------- service functions ---------------- */

const DEFAULT_SERVICE_FEE_RATE = 3.1;
let serviceFeeRateCache = { value: null, fetchedAt: 0 };
const SERVICE_FEE_CACHE_TTL_MS = 15000;

/**
 * Company-controlled service fee %, set via the qrmenu-dashboard admin UI
 * (dbo.ServiceFeeConfig). Cached briefly so checkout doesn't hit the DB on
 * every request; falls back to the last known / default rate on read failure
 * so a DB hiccup never blocks checkout.
 */
export async function getServiceFeeRatePercent() {
  const now = Date.now();
  if (serviceFeeRateCache.value != null && now - serviceFeeRateCache.fetchedAt < SERVICE_FEE_CACHE_TTL_MS) {
    return serviceFeeRateCache.value;
  }
  try {
    const rows = await queryPaymentDb(`SELECT RatePercent FROM dbo.ServiceFeeConfig WHERE ID = 1`);
    const rate = toNum(rows?.[0]?.RatePercent, DEFAULT_SERVICE_FEE_RATE);
    serviceFeeRateCache = { value: rate, fetchedAt: now };
    return rate;
  } catch (err) {
    console.error("[PAYMENT:SVC] Failed to read service fee rate, using cached/default:", err.message);
    return serviceFeeRateCache.value ?? DEFAULT_SERVICE_FEE_RATE;
  }
}

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
  const { billAmount, tableId, kotMasterID, serviceFeeAmount = 0, tipAmount = 0, orderRef = null, tranRef = null, authCode = null } = payload;
  const telrRef = { orderRef, tranRef, authCode };
  const { billAmt } = validateAmounts(billAmount);
  const feeAmt = r2(toNum(serviceFeeAmount, 0));
  const tipAmt = r2(toNum(tipAmount, 0));

  console.log("[PAYMENT:SVC] savePayFullPayment - Received payload:", { billAmount, tableId, kotMasterID, serviceFeeAmount: feeAmt, tipAmount: tipAmt });
  
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
      const agg = await getGroupAggregate(tx, transId, [2, 3, 4]);

      if (agg) {
        // Split has already started - complete it by inserting a FINAL leg row
        // under the existing group's MethodID (this leg belongs to whichever
        // split group is already in progress, never a fresh MethodID=1 row).
        const existingMethodID = toInt(agg.MethodID);
        console.log(`[PAYMENT:SVC] Found existing split group (MethodID=${existingMethodID}), completing it with a new leg row instead of creating MethodID=1`);

        const originalBillAmount = r2(toNum(agg.BillAmount, billAmt));
        const paidSoFar = r2(toNum(agg.BillSharePaid, 0)); // bill-share paid so far, excludes fee/tip
        const remainingBalance = r2(Math.max(0, originalBillAmount - paidSoFar));

        const newPaymentId = await getNextPaymentId(tx);
        const newPaidAmount = r2(paidSoFar + remainingBalance); // = originalBillAmount, whole bill now settled (bill-share only)
        const newBalanceAmount = 0;
        const paidStatus = "PAID";
        const legTotalCharged = r2(remainingBalance + feeAmt + tipAmt); // real amount charged for THIS leg

        const insertReq = new mssql.Request(tx);
        insertReq.input("PaymentID", mssql.BigInt, newPaymentId);
        insertReq.input("ShopID", mssql.BigInt, 1);
        insertReq.input("TransID", mssql.BigInt, transId);
        insertReq.input("MethodID", mssql.BigInt, existingMethodID);
        insertReq.input("BillAmount", mssql.Money, originalBillAmount);
        insertReq.input("PaidAmount", mssql.Money, legTotalCharged); // real charge: bill share + fee + tip
        insertReq.input("PaidBillAmount", mssql.Money, r2(legTotalCharged - feeAmt - tipAmt)); // bill share only, no fee/tip
        insertReq.input("BalanceAmount", mssql.Money, newBalanceAmount);
        insertReq.input("PaidStatus", mssql.VarChar(50), paidStatus);
        insertReq.input("PlatformFeeAmount", mssql.Money, PLATFORM_FEE_AMOUNT);
        insertReq.input("ServiceFeeAmount", mssql.Money, feeAmt);
        insertReq.input("TipAmount", mssql.Money, tipAmt);
        addTelrRefInputs(insertReq, telrRef);
        const legTableId = tableId ? toInt(tableId) : toInt(agg.TableID, 0);
        let includeTableIdForInsert = false;
        if (legTableId) {
          insertReq.input("TableID", mssql.BigInt, legTableId);
          includeTableIdForInsert = true;
        }

        await insertReq.query(buildPaymentInsertSql(includeTableIdForInsert, true));
        await tx.commit();

        console.log(`[PAYMENT:SVC] Completed split group (MethodID=${existingMethodID}) with new leg PaymentID=${newPaymentId}`);

        // Update KOTMaster QR payment tracking columns in Moifcore.
        // Settlement fires once on this PAID transition, so the POS-side tip
        // must be the SUM of every leg's tip, not just this final leg's own.
        const posTipAmount = r2(toNum(agg.TipAmount, 0) + tipAmt);
        await updateKotMasterQrPayment(transId, newPaidAmount, newBalanceAmount, paidStatus, posTipAmount);

        return {
          ok: true,
          paymentId: newPaymentId,
          ShopID: 1,
          TransID: transId,
          MethodID: existingMethodID, // Keep the original MethodID (2, 3, or 4)
          BillAmount: originalBillAmount,
          PaidAmount: newPaidAmount,
          BalanceAmount: newBalanceAmount,
          PaidStatus: paidStatus,
          tableId: legTableId || null
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
      PaidAmount: r2(billAmt + feeAmt + tipAmt), // real amount charged: bill + fee + tip
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

    req.input("PaidBillAmount", mssql.Money, r2(billAmt)); // bill share only, no fee/tip
    req.input("PlatformFeeAmount", mssql.Money, PLATFORM_FEE_AMOUNT);
    req.input("ServiceFeeAmount", mssql.Money, feeAmt);
    req.input("TipAmount", mssql.Money, tipAmt);
    addTelrRefInputs(req, telrRef);
    paymentData.PlatformFeeAmount = PLATFORM_FEE_AMOUNT;
    paymentData.ServiceFeeAmount = feeAmt;
    paymentData.TipAmount = tipAmt;

    await req.query(buildPaymentInsertSql(!!tableId, true));
    await tx.commit();

    // POS-side tip recorded at settlement = customer's actual tip only.
    const posTipAmount = r2(tipAmt);

    // Update KOTMaster QR payment tracking columns in Moifcore
    await updateKotMasterQrPayment(transId, r2(billAmt), 0, "PAID", posTipAmount);

    return { ok: true, ...paymentData, tableId: tableId ? toInt(tableId) : null };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function saveEqualSplitPayment(payload) {
  const { billAmount, paidAmount, numberOfPeople, kotMasterID, transId: providedTransId, tableId, sessionKey, serviceFeeAmount = 0, tipAmount = 0, orderRef: orderRefIn = null, tranRef: tranRefIn = null, authCode: authCodeIn = null } = payload;
  const feeAmt = r2(toNum(serviceFeeAmount, 0));
  const tipAmt = r2(toNum(tipAmount, 0));
  let telrRef = { orderRef: orderRefIn, tranRef: tranRefIn, authCode: authCodeIn };

  // Validate amounts separately for equal split (paidAmount can be less than billAmount)
  const billAmt = toNum(billAmount);
  if (billAmt <= 0 || !Number.isFinite(billAmt)) {
    throw new Error("Bill amount must be a positive number");
  }
  
  const paidAmt = toNum(paidAmount);
  if (paidAmt <= 0 || !Number.isFinite(paidAmt)) {
    throw new Error("Paid amount must be a positive number");
  }

  // Server-side tamper check: if the frontend provided a sessionKey, compare the
  // claimed charge (share + fee - what Telr was actually asked to charge) against
  // the amount Telr actually authorized.
  if (sessionKey) {
    const { getVerifiedAmount, getVerifiedTelrRef } = await import("./telrSessionStore.js");
    const verified = getVerifiedAmount(sessionKey);
    if (verified !== null) {
      const claimedCharge = r2(paidAmt + feeAmt + tipAmt);
      const diff = Math.abs(claimedCharge - verified);
      if (diff > 0.01) {
        console.error(`[PAYMENT:SVC] Tamper detected! claimed=${claimedCharge} (share=${paidAmt}+fee=${feeAmt}) verified=${verified} diff=${diff} sessionKey=${sessionKey}`);
        throw new Error(`Payment amount mismatch: claimed ${claimedCharge} but Telr verified ${verified}`);
      }
      console.log(`[PAYMENT:SVC] Amount verified OK: ${claimedCharge} === ${verified}`);
    }
    const sessionRef = getVerifiedTelrRef(sessionKey);
    if (sessionRef) {
      telrRef = {
        orderRef: telrRef.orderRef ?? sessionRef.orderRef,
        tranRef: telrRef.tranRef ?? sessionRef.tranRef,
        authCode: telrRef.authCode ?? sessionRef.authCode,
      };
    }
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

    // Find any existing payment group for this KOT (any method) via aggregate
    const agg = await getGroupAggregate(tx, transId, [1, 2, 3, 4]);

    // Cross-method logic:
    // - No existing payment               → create fresh Equal Split record
    // - Existing MethodID=2 (Equal)       → continue equal split as normal
    // - Existing MethodID=3 (Item Split)  → BLOCK: item split tracks individual items;
    //                                        mixing with amount-based split is undefined
    // - Existing MethodID=4 (Custom)      → ALLOW cross-method (custom→equal is fine;
    //                                        custom is flexible, equal just settles balance)
    // - Existing method, balance=0        → bill already fully paid, reject
    let groupExists = false;
    let groupMethodID = 2;

    if (agg) {
      const existingMethodID = toInt(agg.MethodID);
      const existingPaidAmount = r2(toNum(agg.BillSharePaid, 0));
      const existingBillAmount = r2(toNum(agg.BillAmount, 0));
      const existingBalance = r2(Math.max(0, existingBillAmount - existingPaidAmount));
      const methodNames = { 1: "Pay Full", 2: "Equal Split", 3: "Item Split", 4: "Custom Split" };

      if (existingMethodID === 2) {
        groupExists = true;
        groupMethodID = 2;
      } else if (existingMethodID === 3 && existingPaidAmount > 0) {
        throw new Error(
          `Cannot use Equal Split for this bill. An Item Split is already in progress. ` +
          `Please continue paying for individual items.`
        );
      } else if (existingPaidAmount <= 0) {
        const deleteReq = new mssql.Request(tx);
        deleteReq.input("TransID", mssql.BigInt, transId);
        deleteReq.input("ExistingMethodID", mssql.BigInt, existingMethodID);
        await deleteReq.query(`DELETE FROM ${T_PAYMENT} WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @ExistingMethodID`);
        console.log(`[PAYMENT:SVC] Equal split - deleted unused MethodID=${existingMethodID} group`);
      } else if (existingBalance <= 0) {
        throw new Error("This bill has already been fully paid.");
      } else {
        // Custom split with balance remaining → allow continuation via equal split
        console.log(`[PAYMENT:SVC] Cross-method continuation: ${methodNames[existingMethodID] || existingMethodID} → Equal Split. Balance remaining: ${existingBalance}`);
        groupExists = true;
        groupMethodID = existingMethodID; // preserve the group's own method, not literal 2
      }
    }

    console.log(groupExists
      ? `[PAYMENT:SVC] [EQUAL SPLIT] ✅ FOUND existing split group (MethodID=${groupMethodID}) - will INSERT a new leg row`
      : `[PAYMENT:SVC] [EQUAL SPLIT] ❌ No existing group - will CREATE first leg row`);

    let paymentId;
    let newPaidAmount;
    let newBalanceAmount;
    let paidStatus;
    let billAmountToUse = billAmt; // Default to incoming full bill amount
    let priorTipAmount = 0;

    if (groupExists) {
      const currentPaidAmount = r2(toNum(agg.BillSharePaid, 0));
      const storedBillAmount = r2(toNum(agg.BillAmount, 0));
      priorTipAmount = r2(toNum(agg.TipAmount, 0));

      // CRITICAL: BillAmount must always be the FULL bill amount, never the split amount
      billAmountToUse = storedBillAmount > 0 ? storedBillAmount : billAmt;
      if (billAmt > billAmountToUse) {
        console.warn(`[PAYMENT:SVC] Fixing incorrect BillAmount: stored=${billAmountToUse}, correct=${billAmt}`);
        billAmountToUse = billAmt;
      }

      // CRITICAL: Calculate remaining balance BEFORE adding new payment
      const remainingBalance = r2(billAmountToUse - currentPaidAmount);

      // CRITICAL: For equal split, paidAmt should be the split amount (per person), NOT the full bill
      let actualPaidAmount = paidAmt;
      if (paidAmt > remainingBalance) {
        console.warn(`[PAYMENT:SVC] ⚠️ paidAmt (${paidAmt}) > remainingBalance (${remainingBalance}). Capping to remaining balance.`);
        actualPaidAmount = remainingBalance;
      }

      newPaidAmount = r2(currentPaidAmount + actualPaidAmount); // whole-bill total, for status/response only
      if (newPaidAmount > billAmountToUse) newPaidAmount = r2(billAmountToUse);
      newBalanceAmount = r2(Math.max(0, billAmountToUse - newPaidAmount));
      paidStatus = newBalanceAmount === 0 ? "PAID" : "PENDING";

      console.log("[PAYMENT:SVC] Inserting new leg for existing equal split group:", {
        billAmount: billAmountToUse, currentPaidAmount, actualPaidAmount, newPaidAmount, newBalanceAmount, paidStatus
      });

      // Propagate the BillAmount invariant to every existing leg row of this
      // group if it drifted (e.g. items added to the KOT mid-split).
      if (billAmountToUse !== storedBillAmount) {
        const fixReq = new mssql.Request(tx);
        fixReq.input("TransID", mssql.BigInt, transId);
        fixReq.input("GroupMethodID", mssql.BigInt, groupMethodID);
        fixReq.input("NewBillAmount", mssql.Money, billAmountToUse);
        await fixReq.query(`UPDATE ${T_PAYMENT} SET ${q("BillAmount")} = @NewBillAmount WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @GroupMethodID`);
      }

      paymentId = await getNextPaymentId(tx);
      const legTotalCharged = r2(actualPaidAmount + feeAmt + tipAmt); // real amount charged for THIS leg
      const insertReq = new mssql.Request(tx);
      insertReq.input("PaymentID", mssql.BigInt, paymentId);
      insertReq.input("ShopID", mssql.BigInt, 1);
      insertReq.input("TransID", mssql.BigInt, transId);
      insertReq.input("MethodID", mssql.BigInt, groupMethodID);
      insertReq.input("BillAmount", mssql.Money, billAmountToUse);
      insertReq.input("PaidAmount", mssql.Money, legTotalCharged);
      insertReq.input("PaidBillAmount", mssql.Money, r2(legTotalCharged - feeAmt - tipAmt)); // bill share only, no fee/tip
      insertReq.input("BalanceAmount", mssql.Money, newBalanceAmount);
      insertReq.input("PaidStatus", mssql.VarChar(50), paidStatus);
      insertReq.input("PlatformFeeAmount", mssql.Money, PLATFORM_FEE_AMOUNT);
      insertReq.input("ServiceFeeAmount", mssql.Money, feeAmt);
      insertReq.input("TipAmount", mssql.Money, tipAmt);
      addTelrRefInputs(insertReq, telrRef);
      const legTableId = tableId ? toInt(tableId) : toInt(agg.TableID, 0);
      let includeTableIdForInsert = false;
      if (legTableId) {
        insertReq.input("TableID", mssql.BigInt, legTableId);
        includeTableIdForInsert = true;
      }
      await insertReq.query(buildPaymentInsertSql(includeTableIdForInsert, true));
      console.log("[PAYMENT:SVC] Inserted new leg row for equal split group");

    } else {
      // First payment for this kotMasterID
      paymentId = await getNextPaymentId(tx);

      if (billAmt < paidAmt) {
        console.error(`[PAYMENT:SVC] ERROR: BillAmount (${billAmt}) < PaidAmount (${paidAmt}). Full bill must be >= per-person amount.`);
        throw new Error(`Invalid amounts: Full bill amount (${billAmt}) must be greater than or equal to per-person amount (${paidAmt})`);
      }

      newPaidAmount = r2(paidAmt);
      newBalanceAmount = r2(Math.max(0, billAmt - newPaidAmount));
      paidStatus = newBalanceAmount === 0 ? "PAID" : "PENDING";
      const legTotalCharged = r2(paidAmt + feeAmt + tipAmt); // real amount charged for THIS leg

      console.log("[PAYMENT:SVC] Creating first equal split leg row:", {
        paymentId, billAmount: billAmt, paidAmount: newPaidAmount, balanceAmount: newBalanceAmount, paidStatus, numberOfPeople
      });

      const insertReq = new mssql.Request(tx);
      insertReq.input("PaymentID", mssql.BigInt, paymentId);
      insertReq.input("ShopID", mssql.BigInt, 1);
      insertReq.input("TransID", mssql.BigInt, transId);
      insertReq.input("MethodID", mssql.BigInt, 2);
      insertReq.input("BillAmount", mssql.Money, billAmt);
      insertReq.input("PaidAmount", mssql.Money, legTotalCharged);
      insertReq.input("PaidBillAmount", mssql.Money, r2(legTotalCharged - feeAmt - tipAmt)); // bill share only, no fee/tip
      insertReq.input("BalanceAmount", mssql.Money, newBalanceAmount);
      insertReq.input("PaidStatus", mssql.VarChar(50), paidStatus);
      insertReq.input("PlatformFeeAmount", mssql.Money, PLATFORM_FEE_AMOUNT);
      insertReq.input("ServiceFeeAmount", mssql.Money, feeAmt);
      insertReq.input("TipAmount", mssql.Money, tipAmt);
      addTelrRefInputs(insertReq, telrRef);
      if (tableId) {
        insertReq.input("TableID", mssql.BigInt, toInt(tableId));
      }

      await insertReq.query(buildPaymentInsertSql(!!tableId, true));
      console.log("[PAYMENT:SVC] Inserted new equal split payment record");
    }

    await tx.commit();

    // Update KOTMaster QR payment tracking columns in Moifcore.
    // POS-side tip = SUM of every leg's tip (settlement fires once, at PAID).
    const posTipAmount = r2(priorTipAmount + tipAmt);
    await updateKotMasterQrPayment(transId, newPaidAmount, newBalanceAmount, paidStatus, posTipAmount);

    return {
      ok: true,
      paymentId,
      ShopID: 1,
      TransID: transId,
      MethodID: groupMethodID,
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
  const { billAmount, paidAmount, kotMasterID, transId: providedTransId, tableId, serviceFeeAmount = 0, tipAmount = 0, orderRef = null, tranRef = null, authCode = null } = payload;
  const telrRef = { orderRef, tranRef, authCode };
  const { billAmt, paidAmt } = validateAmounts(billAmount, paidAmount);
  const feeAmt = r2(toNum(serviceFeeAmount, 0));
  const tipAmt = r2(toNum(tipAmount, 0));

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

    // Find any existing payment group for this KOT (any method) via aggregate
    const agg = await getGroupAggregate(tx, transId, [1, 2, 3, 4]);

    // Cross-method logic:
    // - No existing payment               → create fresh Custom Split record
    // - Existing MethodID=4 (Custom)      → continue custom split as normal
    // - Existing MethodID=3 (Item Split)  → BLOCK: item split tracks individual items;
    //                                        mixing with amount-based split is undefined
    // - Existing MethodID=2 (Equal)       → BLOCK: equal split is a group agreement;
    //                                        switching to custom breaks the contract
    // - Existing method, balance=0        → bill already fully paid, reject
    let groupExists = false;
    let groupMethodID = 4;

    if (agg) {
      const existingMethodID = toInt(agg.MethodID);
      const existingPaidAmount = r2(toNum(agg.BillSharePaid, 0));
      const existingBillAmount = r2(toNum(agg.BillAmount, 0));
      const existingBalance = r2(Math.max(0, existingBillAmount - existingPaidAmount));
      const methodNames = { 1: "Pay Full", 2: "Equal Split", 3: "Item Split", 4: "Custom Split" };

      if (existingMethodID === 4) {
        groupExists = true;
        groupMethodID = 4;
      } else if (existingMethodID === 2 && existingPaidAmount > 0) {
        throw new Error(
          `Cannot use Custom Split for this bill. An Equal Split is already in progress. ` +
          `Please continue with the equal split to complete the payment.`
        );
      } else if (existingMethodID === 3 && existingPaidAmount > 0) {
        throw new Error(
          `Cannot use Custom Split for this bill. An Item Split is already in progress. ` +
          `Please continue paying for individual items.`
        );
      } else if (existingPaidAmount <= 0) {
        const deleteReq = new mssql.Request(tx);
        deleteReq.input("TransID", mssql.BigInt, transId);
        deleteReq.input("ExistingMethodID", mssql.BigInt, existingMethodID);
        await deleteReq.query(`DELETE FROM ${T_PAYMENT} WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @ExistingMethodID`);
        console.log(`[PAYMENT:SVC] Custom split - deleted unused MethodID=${existingMethodID} group`);
      } else if (existingBalance <= 0) {
        throw new Error("This bill has already been fully paid.");
      } else {
        console.log(`[PAYMENT:SVC] Cross-method continuation: ${methodNames[existingMethodID] || existingMethodID} → Custom Split. Balance remaining: ${existingBalance}`);
        groupExists = true;
        groupMethodID = existingMethodID;
      }
    }

    let paymentId;
    let originalBillAmount;
    let newPaidAmount;
    let newBalanceAmount;
    let paidStatus;
    let priorTipAmount = 0;

    if (groupExists) {
      originalBillAmount = r2(toNum(agg.BillAmount, billAmt));
      priorTipAmount = r2(toNum(agg.TipAmount, 0));

      // If POS added new items and KOTMaster.Amount increased after the first
      // custom split payment, align the bill total with the *current* KOT amount
      // so remaining balance reflects the new items as well.
      try {
        const kotPool = await connectToDb();
        const kotReq = kotPool.request();
        kotReq.input("kotMasterID", mssql.BigInt, transId);
        const kotSql = `
          SELECT Amount AS TotalAmount
          FROM dbo.KOTMaster
          WHERE kotMasterID = @kotMasterID
        `;
        const kotResult = await kotReq.query(kotSql);
        const currentKotAmount = kotResult.recordset?.[0]?.TotalAmount;
        if (currentKotAmount != null) {
          const kotAmt = r2(toNum(currentKotAmount, 0));
          if (kotAmt > originalBillAmount + 0.01) {
            console.log("[PAYMENT:SVC] Custom split - detected KOT amount increase. Updating originalBillAmount from", originalBillAmount, "to", kotAmt);
            originalBillAmount = kotAmt;
          }
        }
      } catch (kotErr) {
        console.warn("[PAYMENT:SVC] Custom split - could not refresh KOT amount:", kotErr.message);
      }

      // Propagate the BillAmount invariant to every existing leg row of this
      // group if it drifted.
      const storedBillAmount = r2(toNum(agg.BillAmount, 0));
      if (originalBillAmount !== storedBillAmount) {
        const fixReq = new mssql.Request(tx);
        fixReq.input("TransID", mssql.BigInt, transId);
        fixReq.input("GroupMethodID", mssql.BigInt, groupMethodID);
        fixReq.input("NewBillAmount", mssql.Money, originalBillAmount);
        await fixReq.query(`UPDATE ${T_PAYMENT} SET ${q("BillAmount")} = @NewBillAmount WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @GroupMethodID`);
      }

      const currentPaidAmount = r2(toNum(agg.BillSharePaid, 0));
      newPaidAmount = r2(currentPaidAmount + paidAmt); // whole-bill total (bill-share), for status/response only
      newBalanceAmount = r2(Math.max(0, originalBillAmount - newPaidAmount));
      paidStatus = newBalanceAmount <= 0 ? "PAID" : "PENDING";
      const legTotalCharged = r2(paidAmt + feeAmt + tipAmt); // real amount charged for THIS leg

      console.log("[PAYMENT:SVC] Inserting new leg for existing custom split group:", {
        originalBillAmount, currentPaidAmount, newPaymentAmount: paidAmt, newPaidAmount, newBalanceAmount, paidStatus
      });

      paymentId = await getNextPaymentId(tx);
      const insertReq = new mssql.Request(tx);
      insertReq.input("PaymentID", mssql.BigInt, paymentId);
      insertReq.input("ShopID", mssql.BigInt, 1);
      insertReq.input("TransID", mssql.BigInt, transId);
      insertReq.input("MethodID", mssql.BigInt, groupMethodID);
      insertReq.input("BillAmount", mssql.Money, originalBillAmount);
      insertReq.input("PaidAmount", mssql.Money, legTotalCharged);
      insertReq.input("PaidBillAmount", mssql.Money, r2(legTotalCharged - feeAmt - tipAmt)); // bill share only, no fee/tip
      insertReq.input("BalanceAmount", mssql.Money, newBalanceAmount);
      insertReq.input("PaidStatus", mssql.VarChar(50), paidStatus);
      insertReq.input("PlatformFeeAmount", mssql.Money, PLATFORM_FEE_AMOUNT);
      insertReq.input("ServiceFeeAmount", mssql.Money, feeAmt);
      insertReq.input("TipAmount", mssql.Money, tipAmt);
      addTelrRefInputs(insertReq, telrRef);
      const legTableId = tableId ? toInt(tableId) : toInt(agg.TableID, 0);
      let includeTableIdForInsert = false;
      if (legTableId) {
        insertReq.input("TableID", mssql.BigInt, legTableId);
        includeTableIdForInsert = true;
      }
      await insertReq.query(buildPaymentInsertSql(includeTableIdForInsert, true));
      console.log("[PAYMENT:SVC] Inserted new leg row for custom split group");

    } else {
      // INSERT new payment record (first payment for this kotMasterID)
      paymentId = await getNextPaymentId(tx);
      originalBillAmount = r2(billAmt);
      newPaidAmount = r2(paidAmt);
      newBalanceAmount = r2(Math.max(0, originalBillAmount - newPaidAmount));
      paidStatus = newBalanceAmount <= 0 ? "PAID" : "PENDING";
      const legTotalCharged = r2(paidAmt + feeAmt + tipAmt); // real amount charged for THIS leg

      console.log("[PAYMENT:SVC] Creating new payment record:", {
        paymentId, originalBillAmount, newPaidAmount, newBalanceAmount, paidStatus
      });

      const insertReq = new mssql.Request(tx);
      insertReq.input("PaymentID", mssql.BigInt, paymentId);
      insertReq.input("ShopID", mssql.BigInt, 1);
      insertReq.input("TransID", mssql.BigInt, transId);
      insertReq.input("MethodID", mssql.BigInt, 4);
      insertReq.input("BillAmount", mssql.Money, originalBillAmount);
      insertReq.input("PaidAmount", mssql.Money, legTotalCharged);
      insertReq.input("PaidBillAmount", mssql.Money, r2(legTotalCharged - feeAmt - tipAmt)); // bill share only, no fee/tip
      insertReq.input("BalanceAmount", mssql.Money, newBalanceAmount);
      insertReq.input("PaidStatus", mssql.VarChar(50), paidStatus);
      insertReq.input("PlatformFeeAmount", mssql.Money, PLATFORM_FEE_AMOUNT);
      insertReq.input("ServiceFeeAmount", mssql.Money, feeAmt);
      insertReq.input("TipAmount", mssql.Money, tipAmt);
      addTelrRefInputs(insertReq, telrRef);
      if (tableId) {
        insertReq.input("TableID", mssql.BigInt, toInt(tableId));
      }

      await insertReq.query(buildPaymentInsertSql(!!tableId, true));
      console.log("[PAYMENT:SVC] Inserted new payment record");
    }

    await tx.commit();

    // Update KOTMaster QR payment tracking columns in Moifcore.
    // POS-side tip = SUM of every leg's tip (settlement fires once, at PAID).
    const posTipAmount = r2(priorTipAmount + tipAmt);
    await updateKotMasterQrPayment(transId, newPaidAmount, newBalanceAmount, paidStatus, posTipAmount);

    return {
      ok: true,
      paymentId,
      ShopID: 1,
      TransID: transId,
      MethodID: groupMethodID,
      BillAmount: originalBillAmount,
      PaidAmount: newPaidAmount,
      BalanceAmount: newBalanceAmount,
      PaidStatus: paidStatus,
      billAmount: originalBillAmount,
      originalBillAmount: originalBillAmount,
      tableId: tableId ? toInt(tableId) : null
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function saveItemSplitPayment(payload) {
  const { items, tableId, kotMasterID, totalBillAmount, serviceFeeAmount = 0, tipAmount = 0, orderRef = null, tranRef = null, authCode = null } = payload;
  const telrRef = { orderRef, tranRef, authCode };
  const feeAmt = r2(toNum(serviceFeeAmount, 0));
  const tipAmt = r2(toNum(tipAmount, 0));

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

    // Reject item split if an amount-based split (equal/custom) is already in progress.
    // Amount splits track a running balance total; they don't mark individual items.
    // Mixing the two would make it impossible to reconcile which items are "paid".
    const conflictAgg = await getGroupAggregate(tx, transId, [2, 4]);
    if (conflictAgg) {
      const conflictMethodID   = toInt(conflictAgg.MethodID);
      const conflictPaidAmount = r2(toNum(conflictAgg.BillSharePaid, 0));
      const conflictBillAmount = r2(toNum(conflictAgg.BillAmount, 0));
      const conflictBalance    = r2(Math.max(0, conflictBillAmount - conflictPaidAmount));
      const methodNames        = { 1: "Pay Full", 2: "Equal Split", 3: "Item Split", 4: "Custom Split" };
      // If an amount-based split (Equal=2, Custom=4) has already received money → block
      if (conflictPaidAmount > 0 && conflictBalance > 0) {
        throw new Error(
          `Cannot use Item Split for this bill. A ${methodNames[conflictMethodID] || `MethodID=${conflictMethodID}`} ` +
          `is already in progress with ${conflictBalance.toFixed(2)} AED remaining. ` +
          `Please complete the payment using the same method.`
        );
      }
    }

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

    // CRITICAL: Check if there's ANY existing payment GROUP for this kotMasterID
    // If a payment method has been started AND money has been paid, we MUST use that same method ID
    // We cannot switch methods after payment has been made
    // However, if a payment exists but PaidAmount = 0 (no actual payment made yet), we can switch methods
    const anyAgg = await getGroupAggregate(tx, transId, [1, 2, 3, 4]);

    if (anyAgg) {
      const existingMethodID = toInt(anyAgg.MethodID);
      const existingPaidAmount = r2(toNum(anyAgg.BillSharePaid, 0));
      const existingBillAmount = r2(toNum(anyAgg.BillAmount, 0));
      const existingBalanceAmount = r2(Math.max(0, existingBillAmount - existingPaidAmount));
      const existingPaidStatus = existingBalanceAmount <= 0 ? "PAID" : "PENDING";

      console.log("[PAYMENT:SVC] Item split - Found existing group:", {
        MethodID: existingMethodID,
        PaidAmount: existingPaidAmount,
        BalanceAmount: existingBalanceAmount,
        PaidStatus: existingPaidStatus,
        BillAmount: existingBillAmount,
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
          console.log(`[PAYMENT:SVC] Item split - Found Pay Full group (fully paid: ${existingBalanceAmount <= 0}), allowing switch to Item Split (deleting Pay Full group)`);
          const deleteReq = new mssql.Request(tx);
          deleteReq.input("TransID", mssql.BigInt, transId);
          deleteReq.input("ExistingMethodID", mssql.BigInt, existingMethodID);
          await deleteReq.query(`DELETE FROM ${T_PAYMENT} WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @ExistingMethodID`);
          console.log(`[PAYMENT:SVC] Item split - Deleted Pay Full group to allow Item Split`);
        } else {
          // For other methods (Equal Split, Custom Split), check if fully paid
          if (existingPaidStatus === "PAID") {
            throw new Error("This bill has already been fully paid. No additional payments can be made.");
          }
          // If not fully paid, reject switching between split methods
          const methodNames = { 1: "Pay Full", 2: "Equal Split", 3: "Item Split", 4: "Custom Split" };
          throw new Error(`Cannot use Item Split (MethodID=3) for this bill. This bill is already using ${methodNames[existingMethodID] || `MethodID=${existingMethodID}`} and payment has been made. Once a payment method is chosen and payment is made, all payments must use the same method.`);
        }
      }

      // If a different method exists but NO payment has been made (PaidAmount = 0), delete it and allow this method
      if (existingMethodID !== 3 && existingPaidAmount <= 0) {
        console.log(`[PAYMENT:SVC] Item split - Found existing MethodID=${existingMethodID} group with PaidAmount=0, deleting it to allow Item Split`);
        const deleteReq = new mssql.Request(tx);
        deleteReq.input("TransID", mssql.BigInt, transId);
        deleteReq.input("ExistingMethodID", mssql.BigInt, existingMethodID);
        await deleteReq.query(`DELETE FROM ${T_PAYMENT} WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @ExistingMethodID`);
        console.log(`[PAYMENT:SVC] Item split - Deleted unused group (MethodID=${existingMethodID})`);
      }
    }

    // Now check specifically for MethodID=3 (item split) group
    const itemAgg = await getGroupAggregate(tx, transId, 3);

    // Calculate amount being paid for selected items
    // CRITICAL: First check if there's an existing group to validate against already-paid items
    let itemsPaidAmount = 0;
    const itemsToPay = [];

    // If there's an existing item-split group, check which items are already paid
    // across EVERY leg's PaymentID (not just one row) so a second payer can't
    // re-pay an item a prior payer already paid.
    let alreadyPaidKotChildIds = new Set();
    if (itemAgg && r2(toNum(itemAgg.BillSharePaid, 0)) > 0) {
      const checkPaidItemsReq = new mssql.Request(tx);
      checkPaidItemsReq.input("TransID", mssql.BigInt, transId);

      const checkPaidItemsSql = `
        SELECT kotChildID
        FROM dbo.PaymentItems
        WHERE PaymentID IN (
          SELECT ${q("PaymentID")} FROM ${T_PAYMENT}
          WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = 3
        )
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
    let finalBillAmount = originalBillAmount; // Will be set correctly for both new and continuing groups
    let priorTipAmount = 0;
    const groupExists = !!itemAgg;

    if (groupExists) {
      const currentPaidAmount = r2(toNum(itemAgg.BillSharePaid, 0));
      const storedBillAmount = r2(toNum(itemAgg.BillAmount, 0));
      priorTipAmount = r2(toNum(itemAgg.TipAmount, 0));

      // CRITICAL: For item split, ALWAYS use the stored BillAmount from the FIRST payment
      // This is the original total bill amount and should NEVER change
      const billAmountToUse = storedBillAmount > 0 ? storedBillAmount : originalBillAmount;
      finalBillAmount = billAmountToUse;

      if (storedBillAmount > 0 && Math.abs(storedBillAmount - originalBillAmount) > 0.01) {
        console.warn(`[PAYMENT:SVC] Item split - BillAmount mismatch! Stored: ${storedBillAmount}, Provided: ${originalBillAmount}. Using stored value.`);
      }

      const totalBeingPaid = currentPaidAmount + itemsPaidAmount;
      if (billAmountToUse < totalBeingPaid) {
        console.error(`[PAYMENT:SVC] Item split - CRITICAL ERROR: BillAmount (${billAmountToUse}) < TotalBeingPaid (${totalBeingPaid}). This indicates a calculation error!`);
      }

      console.log("[PAYMENT:SVC] Item split - Payment calculation:", {
        storedBillAmount, originalBillAmount, billAmountToUse, currentPaidAmount, itemsPaidAmount,
        calculation: `${billAmountToUse} - (${currentPaidAmount} + ${itemsPaidAmount}) = ${billAmountToUse - (currentPaidAmount + itemsPaidAmount)}`
      });

      const remainingBalance = r2(billAmountToUse - currentPaidAmount);
      if (itemsPaidAmount > remainingBalance) {
        console.warn(`[PAYMENT:SVC] Item split - WARNING: itemsPaidAmount (${itemsPaidAmount}) > remainingBalance (${remainingBalance}). This might indicate duplicate payment.`);
      }

      newPaidAmount = r2(currentPaidAmount + itemsPaidAmount); // whole-bill total (bill-share), for status/response only
      if (newPaidAmount > billAmountToUse) newPaidAmount = r2(billAmountToUse);
      newBalanceAmount = r2(Math.max(0, billAmountToUse - newPaidAmount));
      paidStatus = newBalanceAmount <= 0 ? "PAID" : "PENDING";
      const legTotalCharged = r2(itemsPaidAmount + feeAmt + tipAmt); // real amount charged for THIS leg

      console.log("[PAYMENT:SVC] Inserting new leg for existing item split group:", {
        billAmount: billAmountToUse, currentPaidAmount, itemsPaidAmount, newPaidAmount, newBalanceAmount, paidStatus
      });

      paymentId = await getNextPaymentId(tx);
      const insertReq = new mssql.Request(tx);
      insertReq.input("PaymentID", mssql.BigInt, paymentId);
      insertReq.input("ShopID", mssql.BigInt, 1);
      insertReq.input("TransID", mssql.BigInt, transId);
      insertReq.input("MethodID", mssql.BigInt, 3);
      insertReq.input("BillAmount", mssql.Money, billAmountToUse);
      insertReq.input("PaidAmount", mssql.Money, legTotalCharged);
      insertReq.input("PaidBillAmount", mssql.Money, r2(legTotalCharged - feeAmt - tipAmt)); // bill share only, no fee/tip
      insertReq.input("BalanceAmount", mssql.Money, newBalanceAmount);
      insertReq.input("PaidStatus", mssql.VarChar(50), paidStatus);
      insertReq.input("PlatformFeeAmount", mssql.Money, PLATFORM_FEE_AMOUNT);
      insertReq.input("ServiceFeeAmount", mssql.Money, feeAmt);
      insertReq.input("TipAmount", mssql.Money, tipAmt);
      addTelrRefInputs(insertReq, telrRef);
      const legTableId = tableId ? toInt(tableId) : toInt(itemAgg.TableID, 0);
      let includeTableIdForInsert = false;
      if (legTableId) {
        insertReq.input("TableID", mssql.BigInt, legTableId);
        includeTableIdForInsert = true;
      }
      await insertReq.query(buildPaymentInsertSql(includeTableIdForInsert, true));
      console.log("[PAYMENT:SVC] Inserted new leg row for item split group");

    } else {
      // First payment for this kotMasterID
      paymentId = await getNextPaymentId(tx);

      newPaidAmount = r2(itemsPaidAmount);
      newBalanceAmount = r2(Math.max(0, originalBillAmount - newPaidAmount));
      paidStatus = newBalanceAmount <= 0 ? "PAID" : "PENDING";
      const legTotalCharged = r2(itemsPaidAmount + feeAmt + tipAmt); // real amount charged for THIS leg

      console.log("[PAYMENT:SVC] Creating new item split payment record:", {
        paymentId, ShopID: 1, TransID: transId, MethodID: 3,
        BillAmount: originalBillAmount, PaidAmount: newPaidAmount, BalanceAmount: newBalanceAmount,
        PaidStatus: paidStatus, TableID: tableId ? toInt(tableId) : null
      });

      const insertReq = new mssql.Request(tx);
      insertReq.input("PaymentID", mssql.BigInt, paymentId);
      insertReq.input("ShopID", mssql.BigInt, 1);
      insertReq.input("TransID", mssql.BigInt, transId);
      insertReq.input("MethodID", mssql.BigInt, 3);
      insertReq.input("BillAmount", mssql.Money, originalBillAmount);
      insertReq.input("PaidAmount", mssql.Money, legTotalCharged);
      insertReq.input("PaidBillAmount", mssql.Money, r2(legTotalCharged - feeAmt - tipAmt)); // bill share only, no fee/tip
      insertReq.input("BalanceAmount", mssql.Money, newBalanceAmount);
      insertReq.input("PaidStatus", mssql.VarChar(50), paidStatus);
      insertReq.input("PlatformFeeAmount", mssql.Money, PLATFORM_FEE_AMOUNT);
      insertReq.input("ServiceFeeAmount", mssql.Money, feeAmt);
      insertReq.input("TipAmount", mssql.Money, tipAmt);
      addTelrRefInputs(insertReq, telrRef);
      if (tableId) {
        insertReq.input("TableID", mssql.BigInt, toInt(tableId));
      }

      await insertReq.query(buildPaymentInsertSql(!!tableId, true));
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

          // Get next PaymentItemID (UPDLOCK/HOLDLOCK via getNextId serializes
          // concurrent legs so two payers inserting at once can't collide).
          const nextItemId = await getNextId(tx, "PaymentItemID", 1, T_PAYMENT_ITEMS);

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

    // Update KOTMaster QR payment tracking columns in Moifcore.
    // POS-side tip = SUM of every leg's tip (settlement fires once, at PAID).
    const posTipAmount = r2(priorTipAmount + tipAmt);
    await updateKotMasterQrPayment(transId, newPaidAmount, newBalanceAmount, paidStatus, posTipAmount);

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
    // Item-split bills can have multiple leg rows (one per payer) sharing this
    // TransID+MethodID=3 - union paid items across ALL of them, not just one.
    const paidItemsSql = `
      SELECT pi.kotChildID
      FROM dbo.PaymentItems pi
      WHERE pi.PaymentID IN (
        SELECT ${q("PaymentID")} FROM ${T_PAYMENT}
        WHERE ${q("ShopID")} = 1 AND ${q("TransID")} = @kotMasterID AND ${q("MethodID")} = 3
      )
    `;

    try {
      const paidItemsResult = await queryPaymentDb(paidItemsSql, { kotMasterID: numericKotMasterID });
      const paidKotChildIds = (paidItemsResult || []).map(row => toInt(row.kotChildID));

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
  
  // FIRST: Check if there's a payment group for the specific kotMasterID (if provided)
  // This takes priority - check for MethodID = 1, 2, 3, or 4
  if (kotMasterID) {
    const numericKotMasterID = toInt(kotMasterID);
    if (numericKotMasterID > 0) {
      const paymentPool = await connectToPaymentDb();
      const agg = await getGroupAggregate(paymentPool, numericKotMasterID, [1, 2, 3, 4]);

      if (agg) {
        let originalBillAmount = r2(toNum(agg.BillAmount, 0));
        const totalPaid = r2(toNum(agg.BillSharePaid, 0));
        let balance = r2(Math.max(0, originalBillAmount - totalPaid));
        let paidStatus = balance <= 0 ? "PAID" : "PENDING";
        const methodId = toNum(agg.MethodID, 0);
        const latestPaymentId = toInt(agg.LatestPaymentID, 0);

        console.log("[PAYMENT:SVC] Found payment group for kotMasterID:", numericKotMasterID, "MethodID:", methodId, "Balance:", balance, "Status:", paidStatus);

        // For split payments (MethodID 2, 3, 4): POS may have added new items after the first payment.
        // Recompute balance from CURRENT KOT amount - totalPaid and SYNC both KOTMaster and Payment tables.
        let effectiveBalance = balance;
        let currentKotAmount = originalBillAmount;
        if (methodId === 2 || methodId === 3 || methodId === 4) {
          try {
            const kotPool = await connectToDb();
            const kotReq = kotPool.request();
            kotReq.input("kotMasterID", mssql.BigInt, numericKotMasterID);
            const kotResult = await kotReq.query(`
              SELECT Amount FROM dbo.KOTMaster WHERE kotMasterID = @kotMasterID
            `);
            const kotAmountVal = kotResult.recordset?.[0]?.Amount;
            if (kotAmountVal != null) {
              currentKotAmount = r2(toNum(kotAmountVal, 0));
              effectiveBalance = r2(Math.max(0, currentKotAmount - totalPaid));
              if (Math.abs(effectiveBalance - balance) > 0.01 || Math.abs(currentKotAmount - originalBillAmount) > 0.01) {
                console.log("[PAYMENT:SVC] Split payment: KOT amount changed. Syncing: balance", balance, "->", effectiveBalance, "billAmount", originalBillAmount, "->", currentKotAmount);
                // Update KOTMaster: QrPaidAmount, QrBalanceAmount, QrPaymentStatus
                const qrStatus = effectiveBalance <= 0 ? "PAID" : (totalPaid > 0 ? "PARTIAL" : "PENDING");
                const kotUpd = kotPool.request();
                kotUpd.input("kotMasterID", mssql.BigInt, numericKotMasterID);
                kotUpd.input("QrPaidAmount", mssql.Money, r2(totalPaid));
                kotUpd.input("QrBalanceAmount", mssql.Money, r2(effectiveBalance));
                kotUpd.input("QrPaymentStatus", mssql.VarChar(20), qrStatus);
                await kotUpd.query(`
                  UPDATE dbo.KOTMaster SET QrPaidAmount = @QrPaidAmount, QrBalanceAmount = @QrBalanceAmount, QrPaymentStatus = @QrPaymentStatus WHERE kotMasterID = @kotMasterID
                `);
                // BillAmount invariant must stay identical on EVERY leg row of this group.
                const newPaidStatus = effectiveBalance <= 0 ? "PAID" : "PENDING";
                const billFixReq = paymentPool.request();
                billFixReq.input("TransID", mssql.BigInt, numericKotMasterID);
                billFixReq.input("GroupMethodID", mssql.BigInt, methodId);
                billFixReq.input("BillAmount", mssql.Money, r2(currentKotAmount));
                await billFixReq.query(`
                  UPDATE ${T_PAYMENT} SET ${q("BillAmount")} = @BillAmount WHERE ${q("TransID")} = @TransID AND ${q("MethodID")} = @GroupMethodID
                `);
                // BalanceAmount/PaidStatus snapshot only meaningfully belongs to the latest leg row.
                if (latestPaymentId > 0) {
                  const payUpd = paymentPool.request();
                  payUpd.input("PaymentID", mssql.BigInt, latestPaymentId);
                  payUpd.input("BalanceAmount", mssql.Money, r2(effectiveBalance));
                  payUpd.input("PaidStatus", mssql.VarChar(50), newPaidStatus);
                  await payUpd.query(`
                    UPDATE dbo.Payment SET ${q("BalanceAmount")} = @BalanceAmount, ${q("PaidStatus")} = @PaidStatus WHERE ${q("PaymentID")} = @PaymentID
                  `);
                }
                balance = effectiveBalance;
                paidStatus = newPaidStatus;
                originalBillAmount = currentKotAmount;
              }
            }
          } catch (kotErr) {
            console.warn("[PAYMENT:SVC] Split: could not sync KOT/Payment:", kotErr.message);
          }
        }
        
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
        // Return effectiveBalance (for item split this reflects current KOT amount - paid)
        const finalBalance = effectiveBalance > 0 ? r2(effectiveBalance) : 0;
        const isFullyPaidResult = finalBalance <= 0 || paidStatus === "PAID";
        return {
          balance: finalBalance,
          originalBillAmount: originalBillAmount > 0 ? r2(originalBillAmount) : null,
          hasPendingPayment: paidStatus === "PENDING" && finalBalance > 0,
          isFullyPaid: isFullyPaidResult,
          hasUnpaidKots: false,
          transId: numericKotMasterID,
          billAmount: r2(originalBillAmount),
          originalBillAmount: r2(originalBillAmount),
          totalPaid: r2(totalPaid),
          paidStatus: paidStatus,
          equalSplitInfo: (finalBalance > 0 && paidStatus === "PENDING") ? equalSplitInfo : null
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
  
  // THIRD: If no unpaid KOTs, check for any pending split payments for this table (MethodID = 2, 3, or 4).
  // Must aggregate: a bill can now have multiple leg rows sharing a TransID,
  // and a later leg completing the bill leaves earlier legs' own PaidStatus
  // stuck at 'PENDING' - filtering on that column would return a stale leg
  // instead of the group's actual (now fully paid) truth.
  const pendingSql = `
    SELECT TOP 1 ${q("TransID")}, ${q("MethodID")}, MAX(${q("BillAmount")}) AS BillAmount,
           (SUM(${q("PaidAmount")}) - SUM(ISNULL(${q("ServiceFeeAmount")},0)) - SUM(ISNULL(${q("TipAmount")},0))) AS PaidAmount
    FROM ${T_PAYMENT}
    WHERE ${q("ShopID")} = 1 AND ${q("TableID")} = @tableId AND ${q("MethodID")} IN (2, 3, 4)
    GROUP BY ${q("TransID")}, ${q("MethodID")}
    HAVING (SUM(${q("PaidAmount")}) - SUM(ISNULL(${q("ServiceFeeAmount")},0)) - SUM(ISNULL(${q("TipAmount")},0))) < MAX(${q("BillAmount")})
    ORDER BY MAX(${q("PaymentID")}) DESC
  `;

  const results = await queryPaymentDb(pendingSql, { tableId: numericTableId });

  if (!results || results.length === 0) {
    // No pending payments and no unpaid KOTs - table is fully paid
    return { balance: 0, hasPendingPayment: false, isFullyPaid: true, hasUnpaidKots: false };
  }

  // Get the still-incomplete group for this table
  const paymentRecord = results[0];
  const transId = toNum(paymentRecord?.TransID, 0);
  const originalBillAmount = toNum(paymentRecord?.BillAmount, 0);
  const totalPaid = toNum(paymentRecord?.PaidAmount, 0);
  const balance = r2(Math.max(0, originalBillAmount - totalPaid));
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

/**
 * Settle a split-mode payment (equal / custom / item) purely from a
 * session-shaped payload (mode/billAmount/items/etc as captured server-side
 * at /api/telr/create time) - never from anything a caller sends directly.
 * Shared by the Telr redirect/webhook handlers (telr.routes.js) and by
 * claimAndSettlePublic() (the guard in front of the public /api/payment/*
 * endpoints - see paymentSessionStore.js). Never throws; callers dispatch on
 * the returned { ok } flag.
 */
export async function settleSplitFromSession(session, telrRef) {
  const mode = session?.mode || "pay-full";
  const legPaidAmount = session?.billAmount ?? session?.amount;
  const feeAmt = session?.serviceFeeAmount ?? 0;
  const tipAmt = session?.tipAmount ?? 0;

  try {
    if (mode === "split-equal") {
      const fullBillAmount = session.originalBillAmount ?? legPaidAmount;
      if (!(legPaidAmount && fullBillAmount && session.numberOfPeople && (session.tableId || session.kotMasterID))) {
        return { ok: false, error: "Missing data for equal split settlement" };
      }
      const result = await saveEqualSplitPayment({
        billAmount: fullBillAmount,
        paidAmount: legPaidAmount,
        numberOfPeople: session.numberOfPeople,
        kotMasterID: session.kotMasterID,
        tableId: session.tableId,
        serviceFeeAmount: feeAmt,
        tipAmount: tipAmt,
        ...telrRef,
      });
      return { ok: true, result };
    }

    if (mode === "split-custom") {
      const fullBillAmount = session.originalBillAmount ?? legPaidAmount;
      if (!(legPaidAmount && (session.tableId || session.kotMasterID))) {
        return { ok: false, error: "Missing data for custom split settlement" };
      }
      const result = await saveCustomSplitPayment({
        billAmount: fullBillAmount,
        paidAmount: legPaidAmount,
        kotMasterID: session.kotMasterID,
        tableId: session.tableId,
        serviceFeeAmount: feeAmt,
        tipAmount: tipAmt,
        ...telrRef,
      });
      return { ok: true, result };
    }

    if (mode === "split-items") {
      if (!(Array.isArray(session.items) && session.items.length > 0 && session.kotMasterID)) {
        return { ok: false, error: "Missing items for item split settlement" };
      }
      const result = await saveItemSplitPayment({
        items: session.items,
        tableId: session.tableId,
        kotMasterID: session.kotMasterID,
        totalBillAmount: session.originalBillAmount ?? legPaidAmount,
        serviceFeeAmount: feeAmt,
        tipAmount: tipAmt,
        ...telrRef,
      });
      return { ok: true, result };
    }

    return { ok: false, error: `Unknown split mode: ${mode}` };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Settle any mode (pay-full or split) from a session-shaped payload - the
 * single dispatch point used by the DB-fallback recovery path
 * (claimAndSettle) and by claimAndSettlePublic() guarding the public
 * /api/payment/* endpoints. Both pass a payload built exclusively from the
 * durable PaymentSession row, never from a client-supplied body.
 */
export async function settleAnyModeFromPayload(payload, telrRef) {
  const mode = payload?.mode || "pay-full";
  if (!mode || mode === "pay-full") {
    if (!(payload?.amount && (payload?.tableId || payload?.kotMasterID))) {
      return { ok: false, error: "Missing data for pay-full settlement" };
    }
    try {
      const result = await savePayFullPayment({
        billAmount: payload.billAmount ?? payload.amount,
        tableId: payload.tableId,
        kotMasterID: payload.kotMasterID,
        serviceFeeAmount: payload.serviceFeeAmount,
        tipAmount: payload.tipAmount,
        ...telrRef,
      });
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }
  return settleSplitFromSession(payload, telrRef);
}
