// backend/routes/payout/payouts.routes.js
// Super-admin-only payout actions. The pipeline has four states: PENDING
// (money collected, sitting with DeynoQR, no PayoutStatus row yet),
// PROCESSING and SCHEDULED (in-progress settlement stages, freely movable
// between each other and back to PENDING), and TRANSFERRED (settled to the
// restaurant with a cheque / bank reference). TRANSFERRED is final - there is
// deliberately no undo once a payment reaches it.
//
// Every action that touches the pipeline (a single status change, a bulk
// status change, a single transfer, a bulk transfer) stamps a shared BatchNo
// (from dbo.PayoutBatchSeq) onto every row it touches - even a lone payment
// gets its own batch number. If the exact same set of payments already all
// share one batch number (e.g. moving the same group from Processing to
// Scheduled), that number is REUSED instead of minting a new one - see
// resolveBatchNo() - so a group keeps its identity as it moves through
// stages together. Only a brand new / mixed / partial selection gets a fresh
// number. This is just a plain grouping marker, not a separate managed
// entity: dbo.PayoutStatus.BatchNo is the only place it lives.
import express from "express";
import { query, mssql } from "../../utils/payoutDb.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/payoutAuth.middleware.js";
import { parseWallClock } from "../../utils/payoutDates.js";

const router = express.Router();

// Bank/gateway charge for pushing one transaction out in a batch transfer, and
// the VAT on that charge. Both are DeynoQR's own cost - they are reported per
// batch for reference and are NOT deducted from the restaurant's payout.
const TRANSFER_FEE_PER_TXN = 0.5;
const TRANSFER_FEE_TAX_RATE = 0.05; // 5% UAE VAT

// Bank charge for pushing ONE outward batch transfer, plus VAT on it. Unlike
// the per-transaction figure above this one IS deducted from the restaurant's
// net - it is the "Transfer Fee" / "VAT on Transfer Fee" pair on the settlement
// statement DeynoQR sends out, and the statement's NET AMOUNT TRANSFERRED is
// gross payable minus these two. Flat per batch, not per transaction.
const BATCH_TRANSFER_FEE = 5;
const VAT_RATE = 0.05; // 5% UAE VAT

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function nextBatchNo() {
  const rows = await query(`SELECT NEXT VALUE FOR dbo.PayoutBatchSeq AS n`);
  return Number(rows[0].n);
}

/**
 * A scheduled payout's batch number IS its payout date, written DDMMYYYY, so
 * the batch number, the statement number (BATCH10082026) and the bank transfer
 * all read the same thing. Stored in a bigint column, so a single-digit day
 * loses its leading zero - 4 Aug 2026 is stored as 4082026, which is exactly
 * how the two settled production batches were already numbered by hand.
 * Pad back to 8 digits for display (see isDateBatchNo / formatting helpers).
 *
 * Consequence, and intended: two scheduling actions on the same date land in
 * the same batch and become one payout. One payout date, one bank transfer.
 */
function dateBatchNo(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return Number(`${dd}${mm}${d.getUTCFullYear()}`);
}

/** True for a DDMMYYYY-shaped batch number, false for a legacy sequence one. */
function isDateBatchNo(n) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 1011000 && v <= 31129999;
}

/** Builds "@p0, @p1, ..." and fills params[prefix+i] for a dynamic IN-list. */
function idsInParams(ids, params, prefix = "id") {
  return ids
    .map((id, i) => {
      const key = `${prefix}${i}`;
      params[key] = { type: mssql.BigInt, value: id };
      return `@${key}`;
    })
    .join(", ");
}

/**
 * Picks the batch number to use for an action touching these paymentIds:
 * if every one of them already has a PayoutStatus row and they all share the
 * SAME existing BatchNo, reuse it (moving the same group through another
 * stage keeps its identity). Otherwise mint a fresh one - covers a brand new
 * selection, a partial/mixed selection, or a first-time action.
 */
async function resolveBatchNo(paymentIds) {
  const params = {};
  const inList = idsInParams(paymentIds, params);
  const rows = await query(
    `SELECT PaymentID, BatchNo FROM dbo.PayoutStatus WHERE PaymentID IN (${inList})`,
    params
  );
  if (rows.length === paymentIds.length) {
    const batchNos = new Set(rows.map((r) => (r.BatchNo == null ? null : Number(r.BatchNo))));
    if (batchNos.size === 1) {
      const only = [...batchNos][0];
      if (only != null) return only;
    }
  }
  return nextBatchNo();
}

// Both sides are UTC-midnight Dates (parseWallClock / the mssql Date type), so
// comparing the date part of the ISO string is enough to spot a real reschedule.
function sameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
}

/**
 * TransferDate is a wall-clock calendar day, exactly like ScheduledDate, so it
 * has to be parsed the same way - new Date() would read the value as Node-local
 * time and the driver would then shift it to UTC, moving the stored day. This
 * column is the grouping key of the payout history report: a one-day skew would
 * split a single settlement into two rows. Accepts "YYYY-MM-DD" or a full ISO
 * string, and falls back to today's wall-clock day.
 */
function parseTransferDate(value) {
  const today = new Date();
  const fallback = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  if (!value) return fallback;
  return parseWallClock(String(value).slice(0, 10)) || fallback;
}

async function getPayment(paymentId) {
  const rows = await query(
    `SELECT PaymentID, ShopID, PaidAmount, PaidStatus,
            (PaidAmount - ISNULL(ServiceFeeAmount, 0) - ISNULL(PlatformFeeAmount, 0)) AS RestaurantPayoutAmount
     FROM dbo.Payment WHERE PaymentID = @paymentId`,
    { paymentId: { type: mssql.BigInt, value: paymentId } }
  );
  return rows?.[0] || null;
}

async function getPayoutRow(paymentId) {
  const rows = await query(
    `SELECT PayoutID, Status, ScheduledDate, BatchNo FROM dbo.PayoutStatus WHERE PaymentID = @paymentId`,
    { paymentId: { type: mssql.BigInt, value: paymentId } }
  );
  return rows?.[0] || null;
}

async function markTransferred(payment, existing, { transferRef, transferDate, transferredBy, notes, batchNo }) {
  const params = {
    paymentId: { type: mssql.BigInt, value: Number(payment.PaymentID) },
    shopId: { type: mssql.BigInt, value: Number(payment.ShopID) },
    amount: { type: mssql.Money, value: Number(payment.RestaurantPayoutAmount) },
    transferRef: { type: mssql.NVarChar(200), value: transferRef },
    transferDate: { type: mssql.Date, value: transferDate },
    transferredBy: { type: mssql.NVarChar(100), value: transferredBy },
    notes: { type: mssql.NVarChar(500), value: notes || null },
    batchNo: { type: mssql.BigInt, value: batchNo }
  };

  if (existing) {
    // Any pre-transfer row (including legacy APPROVED rows) moves straight to TRANSFERRED.
    await query(
      `UPDATE dbo.PayoutStatus
       SET Status = 'TRANSFERRED', Amount = @amount, TransferRef = @transferRef,
           TransferDate = @transferDate, TransferredBy = @transferredBy,
           Notes = ISNULL(@notes, Notes), BatchNo = @batchNo, UpdatedAt = SYSDATETIME()
       WHERE PaymentID = @paymentId`,
      params
    );
  } else {
    await query(
      `INSERT INTO dbo.PayoutStatus
         (PaymentID, ShopID, Amount, Status, TransferRef, TransferDate, TransferredBy, Notes, BatchNo, UpdatedAt)
       VALUES
         (@paymentId, @shopId, @amount, 'TRANSFERRED', @transferRef, @transferDate, @transferredBy, @notes, @batchNo, SYSDATETIME())`,
      params
    );
  }
}

/** POST /api/payout/payouts/:paymentId/transfer  { transferRef, transferDate?, notes? } */
router.post("/:paymentId/transfer", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const paymentId = Number(req.params.paymentId);
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid paymentId" });
    }

    const transferRef = String(req.body?.transferRef || "").trim();
    if (!transferRef) {
      return res.status(400).json({ ok: false, error: "transferRef (cheque/transfer number) is required" });
    }
    const transferDate = parseTransferDate(req.body?.transferDate);

    const payment = await getPayment(paymentId);
    if (!payment) return res.status(404).json({ ok: false, error: "Payment not found" });
    if (Number(payment.PaidAmount) <= 0) {
      return res.status(400).json({ ok: false, error: "Payment has no paid amount to transfer" });
    }

    const existing = await getPayoutRow(paymentId);
    if (existing?.Status === "TRANSFERRED") {
      return res.status(409).json({ ok: false, error: "Payout already transferred - transferred payouts are final" });
    }

    const batchNo = await resolveBatchNo([paymentId]);
    await markTransferred(payment, existing, {
      transferRef,
      transferDate,
      transferredBy: req.user.username,
      notes: req.body?.notes,
      batchNo
    });

    res.json({ ok: true, paymentId, status: "TRANSFERRED", transferRef, batchNo });
  } catch (err) {
    console.error("[PAYOUT:PAYOUT] Transfer error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to mark payout transferred" });
  }
});

function parsePaymentIds(body) {
  const ids = Array.isArray(body?.paymentIds) ? body.paymentIds.map(Number) : [];
  return ids.filter((n) => Number.isFinite(n) && n > 0);
}

/** POST /api/payout/payouts/bulk-transfer  { paymentIds: number[], transferRef, transferDate?, notes? } */
router.post("/bulk-transfer", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const paymentIds = parsePaymentIds(req.body);
    if (!paymentIds.length) {
      return res.status(400).json({ ok: false, error: "paymentIds array is required" });
    }
    if (paymentIds.length > 500) {
      return res.status(400).json({ ok: false, error: "Too many payments in one batch (max 500)" });
    }
    const transferRef = String(req.body?.transferRef || "").trim();
    if (!transferRef) {
      return res.status(400).json({ ok: false, error: "transferRef (cheque/transfer number) is required" });
    }
    const transferDate = parseTransferDate(req.body?.transferDate);
    const batchNo = await resolveBatchNo(paymentIds);

    const results = { transferred: [], skipped: [] };
    for (const paymentId of paymentIds) {
      const payment = await getPayment(paymentId);
      if (!payment) {
        results.skipped.push({ paymentId, reason: "Not found" });
        continue;
      }
      if (Number(payment.PaidAmount) <= 0) {
        results.skipped.push({ paymentId, reason: "No paid amount" });
        continue;
      }
      const existing = await getPayoutRow(paymentId);
      if (existing?.Status === "TRANSFERRED") {
        results.skipped.push({ paymentId, reason: "Already transferred" });
        continue;
      }

      await markTransferred(payment, existing, {
        transferRef,
        transferDate,
        transferredBy: req.user.username,
        notes: req.body?.notes,
        batchNo
      });
      results.transferred.push(paymentId);
    }

    console.log(`[PAYOUT:PAYOUT] Bulk transfer by ${req.user.username} ref=${transferRef} batch=${batchNo}: ${results.transferred.length} transferred, ${results.skipped.length} skipped`);
    res.json({ ok: true, transferredCount: results.transferred.length, transferRef, batchNo, ...results });
  } catch (err) {
    console.error("[PAYOUT:PAYOUT] Bulk transfer error:", err.message);
    res.status(500).json({ ok: false, error: "Bulk transfer failed" });
  }
});

const SETTABLE_STATUSES = new Set(["PENDING", "PROCESSING", "SCHEDULED"]);

/**
 * POST /api/payout/payouts/bulk-status
 * { paymentIds: number[], status: 'PENDING'|'PROCESSING'|'SCHEDULED', scheduledDate? }
 * Moves payments between the three pre-transfer stages. TRANSFERRED is
 * deliberately excluded here - that requires a transferRef/transferDate and
 * goes through /transfer, /bulk-transfer or /transfer-all instead.
 * scheduledDate (YYYY-MM-DD) is required when status is SCHEDULED and can be
 * any calendar day - the admin picks the payout date per batch.
 */
router.post("/bulk-status", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    // A batch is addressed by number, never by listing the payments inside it -
    // a batch can hold more rows than one page or one id list can carry, and a
    // truncated list would move part of a batch and leave the rest behind.
    const batchNos = []
      .concat(req.body?.batch ?? [])
      .map(Number)
      .filter((n) => Number.isFinite(n));
    const paymentIds = batchNos.length ? [] : parsePaymentIds(req.body);
    if (!batchNos.length && !paymentIds.length) {
      return res.status(400).json({ ok: false, error: "paymentIds array or batch is required" });
    }
    if (paymentIds.length > 500) {
      return res.status(400).json({ ok: false, error: "Too many payments in one batch (max 500)" });
    }
    const status = String(req.body?.status || "").toUpperCase();
    if (!SETTABLE_STATUSES.has(status)) {
      return res.status(400).json({
        ok: false,
        error: "status must be PENDING, PROCESSING or SCHEDULED (use the transfer endpoint to mark TRANSFERRED)"
      });
    }

    let scheduledDate = null;
    if (status === "SCHEDULED") {
      scheduledDate = parseWallClock(req.body?.scheduledDate);
      if (!scheduledDate) {
        return res.status(400).json({ ok: false, error: "scheduledDate (YYYY-MM-DD) is required for Scheduled" });
      }
    }

    // Whole-batch move: one set-based statement, so it cannot half-apply no
    // matter how many payments the batch holds. TRANSFERRED rows are final and
    // are excluded rather than skipped one by one.
    if (batchNos.length) {
      const params = {};
      const inList = idsInParams(batchNos, params, "batch");
      params.status = { type: mssql.VarChar(20), value: status };
      params.scheduledDate = { type: mssql.Date, value: scheduledDate };
      const targetBatchNo = status === "SCHEDULED" ? dateBatchNo(scheduledDate) : null;

      if (status === "PENDING") {
        // PENDING means "no payout row at all" - same as the per-id path.
        const del = await query(
          `DELETE FROM dbo.PayoutStatus
           OUTPUT deleted.PaymentID
           WHERE BatchNo IN (${inList}) AND Status <> 'TRANSFERRED'`,
          params
        );
        console.log(`[PAYOUT:PAYOUT] Bulk status by ${req.user.username} -> PENDING batches=${batchNos.join(",")}: ${del.length} cleared`);
        return res.json({ ok: true, status, batchNo: null, updatedCount: del.length, updated: del.map((r) => Number(r.PaymentID)), skipped: [] });
      }

      // PROCESSING keeps the batch number it already has; SCHEDULED renumbers
      // to the payout date it is being moved to.
      params.targetBatchNo = { type: mssql.BigInt, value: targetBatchNo };
      const upd = await query(
        `UPDATE dbo.PayoutStatus
         SET Status = @status,
             ScheduledDate = @scheduledDate,
             ${status === "SCHEDULED" ? "BatchNo = @targetBatchNo," : ""}
             UpdatedAt = SYSDATETIME()
         OUTPUT inserted.PaymentID
         WHERE BatchNo IN (${inList}) AND Status <> 'TRANSFERRED'`,
        params
      );
      console.log(`[PAYOUT:PAYOUT] Bulk status by ${req.user.username} -> ${status} batches=${batchNos.join(",")} -> ${targetBatchNo ?? "unchanged"}: ${upd.length} updated`);
      return res.json({ ok: true, status, batchNo: targetBatchNo, updatedCount: upd.length, updated: upd.map((r) => Number(r.PaymentID)), skipped: [] });
    }

    // Scheduled payouts are numbered by their payout date, not by the sequence:
    // picking 10 Aug 2026 puts every selected payment into batch 10082026.
    const batchNo =
      status === "PENDING" ? null
        : status === "SCHEDULED" ? dateBatchNo(scheduledDate)
          : await resolveBatchNo(paymentIds);

    const results = { updated: [], skipped: [] };
    for (const paymentId of paymentIds) {
      const payment = await getPayment(paymentId);
      if (!payment) {
        results.skipped.push({ paymentId, reason: "Not found" });
        continue;
      }
      const existing = await getPayoutRow(paymentId);
      if (existing?.Status === "TRANSFERRED") {
        results.skipped.push({ paymentId, reason: "Already transferred - final, cannot change" });
        continue;
      }
      // A Scheduled row still needs rewriting when the payout date moved, or
      // when it is sitting on the right date under an old sequence batch number
      // - re-applying the same date renumbers it to DDMMYYYY.
      const scheduleNeedsRewrite =
        status === "SCHEDULED" &&
        (!sameDay(existing?.ScheduledDate, scheduledDate) || Number(existing?.BatchNo) !== batchNo);

      if (existing?.Status === status && !scheduleNeedsRewrite) {
        // Already at this status - no-op, don't waste a fresh batch number on it.
        results.skipped.push({ paymentId, reason: `Already ${status}` });
        continue;
      }

      if (status === "PENDING") {
        if (existing) {
          await query(
            `DELETE FROM dbo.PayoutStatus WHERE PaymentID = @paymentId`,
            { paymentId: { type: mssql.BigInt, value: paymentId } }
          );
        }
      } else if (existing) {
        await query(
          `UPDATE dbo.PayoutStatus SET Status = @status, BatchNo = @batchNo, ScheduledDate = @scheduledDate, UpdatedAt = SYSDATETIME() WHERE PaymentID = @paymentId`,
          {
            paymentId: { type: mssql.BigInt, value: paymentId },
            status: { type: mssql.VarChar(20), value: status },
            batchNo: { type: mssql.BigInt, value: batchNo },
            scheduledDate: { type: mssql.Date, value: scheduledDate }
          }
        );
      } else {
        await query(
          `INSERT INTO dbo.PayoutStatus (PaymentID, ShopID, Amount, Status, BatchNo, ScheduledDate, UpdatedAt)
           VALUES (@paymentId, @shopId, @amount, @status, @batchNo, @scheduledDate, SYSDATETIME())`,
          {
            paymentId: { type: mssql.BigInt, value: paymentId },
            shopId: { type: mssql.BigInt, value: Number(payment.ShopID) },
            amount: { type: mssql.Money, value: Number(payment.RestaurantPayoutAmount) },
            status: { type: mssql.VarChar(20), value: status },
            batchNo: { type: mssql.BigInt, value: batchNo },
            scheduledDate: { type: mssql.Date, value: scheduledDate }
          }
        );
      }
      results.updated.push(paymentId);
    }

    console.log(`[PAYOUT:PAYOUT] Bulk status by ${req.user.username} -> ${status} batch=${batchNo}: ${results.updated.length} updated, ${results.skipped.length} skipped`);
    res.json({ ok: true, status, batchNo, updatedCount: results.updated.length, ...results });
  } catch (err) {
    console.error("[PAYOUT:PAYOUT] Bulk status error:", err.message);
    res.status(500).json({ ok: false, error: "Bulk status update failed" });
  }
});

/**
 * GET /api/payout/payouts/batches
 * Every distinct BatchNo currently in use, with derived stats. Nothing is
 * stored beyond dbo.PayoutStatus.BatchNo itself - this is a live GROUP BY,
 * so it can never drift from the real per-payment state.
 */
router.get("/batches", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    // JOIN Payment for the money/date detail (gross charged, txn dates). The
    // PayoutStatus row is 1:1 with a Payment, so COUNT/SUM cardinality is safe.
    const rows = await query(`
      SELECT
        ps.BatchNo,
        COUNT(*)                                                         AS txnCount,
        -- What the restaurant is actually owed, derived live from Payment:
        -- gross charged, minus the service fee DeynoQR keeps, minus the
        -- platform fee. NOT SUM(ps.Amount) - that column is a snapshot taken
        -- when the payout row was first created, so rows written before the
        -- fee columns were populated still hold the gross and made this read
        -- back identical to the Telr total.
        ISNULL(SUM(p.PaidAmount - ISNULL(p.ServiceFeeAmount, 0) - ISNULL(p.PlatformFeeAmount, 0)), 0) AS totalAmount,
        ISNULL(SUM(ps.Amount), 0)                                        AS storedPayoutAmount,
        ISNULL(SUM(p.PaidAmount), 0)                                     AS totalTxnAmount,
        -- Bill only: what the guest paid for food, with the service fee
        -- DeynoQR keeps and the tip both stripped out.
        ISNULL(SUM(ISNULL(p.PaidBillAmount,
                          p.PaidAmount - ISNULL(p.ServiceFeeAmount, 0) - ISNULL(p.TipAmount, 0))), 0) AS billAmount,
        ISNULL(SUM(ISNULL(p.TipAmount, 0)), 0)                           AS tipAmount,
        ISNULL(SUM(ISNULL(p.ServiceFeeAmount, 0)), 0)                    AS serviceFee,
        ISNULL(SUM(ISNULL(p.PlatformFeeAmount, 0)), 0)                   AS platformFee,
        COUNT(DISTINCT ps.ShopID)                                        AS restaurantCount,
        MAX(ps.UpdatedAt)                                                AS lastUpdatedAt,
        MIN(p.CreatedAt)                                                 AS firstTxnAt,
        MAX(p.CreatedAt)                                                 AS lastTxnAt,
        MAX(ps.TransferDate)                                             AS transferDate,
        MAX(ps.ScheduledDate)                                            AS scheduledDate,
        SUM(CASE WHEN ps.Status = 'PROCESSING' THEN 1 ELSE 0 END)        AS processingCount,
        SUM(CASE WHEN ps.Status = 'SCHEDULED'  THEN 1 ELSE 0 END)        AS scheduledCount,
        SUM(CASE WHEN ps.Status = 'TRANSFERRED' THEN 1 ELSE 0 END)       AS transferredCount
      FROM dbo.PayoutStatus ps
      LEFT JOIN dbo.Payment p ON p.PaymentID = ps.PaymentID
      WHERE ps.BatchNo IS NOT NULL
      GROUP BY ps.BatchNo
      ORDER BY ps.BatchNo DESC
    `);
    const batches = rows.map((r) => {
      const txnCount = Number(r.txnCount);
      const transferredCount = Number(r.transferredCount);
      const scheduledCount = Number(r.scheduledCount);
      const processingCount = Number(r.processingCount);
      const status =
        transferredCount === txnCount ? "TRANSFERRED" :
        transferredCount > 0 ? "MIXED" :
        scheduledCount === txnCount ? "SCHEDULED" :
        processingCount === txnCount ? "PROCESSING" : "MIXED";
      // Bank transfer cost for this batch: one flat fee per transaction, plus
      // VAT on that fee. DeynoQR's cost, reported only - never deducted from
      // totalAmount (the restaurant payout).
      const transferFee = r2(txnCount * TRANSFER_FEE_PER_TXN);
      const transferFeeTax = r2(transferFee * TRANSFER_FEE_TAX_RATE);
      return {
        batchNo: Number(r.BatchNo),
        txnCount,
        // totalAmount = live restaurant payout (bill + tip - platform fee);
        // totalTxnAmount = full amount charged through Telr, service fee
        // included. storedPayoutAmount is the PayoutStatus snapshot, kept only
        // so a drift between the two can be spotted.
        totalAmount: Number(r.totalAmount),
        storedPayoutAmount: Number(r.storedPayoutAmount),
        totalTxnAmount: Number(r.totalTxnAmount),
        billAmount: Number(r.billAmount),
        tipAmount: Number(r.tipAmount),
        serviceFee: Number(r.serviceFee),
        platformFee: Number(r.platformFee),
        transferFee,
        transferFeeTax,
        transferFeeRate: TRANSFER_FEE_PER_TXN,
        // Legacy alias - the old UI read `tax` for this column.
        tax: transferFeeTax,
        firstTxnAt: r.firstTxnAt,
        lastTxnAt: r.lastTxnAt,
        transferDate: r.transferDate || null,
        scheduledDate: r.scheduledDate || null,
        restaurantCount: Number(r.restaurantCount),
        lastUpdatedAt: r.lastUpdatedAt,
        processingCount,
        scheduledCount,
        transferredCount,
        status
      };
    });
    res.json({ ok: true, batches });
  } catch (err) {
    console.error("[PAYOUT:PAYOUT] List batches error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load batches" });
  }
});

/**
 * GET /api/payout/payouts/my-batches
 * Restaurant-facing batch settlement view (Telr-balance style). Scoped hard to
 * the caller's own shop. Money is framed as the restaurant sees it:
 *   gross  = paidBillAmount + tip  (= PaidAmount - service fee, so the service
 *            fee DeynoQR keeps never appears)
 *   fees   = platform fee (the only cut the restaurant is shown)
 *   tax    = 0 placeholder until a confirmed source is wired
 *   payout = gross - fees  (what actually lands in their bank)
 */
router.get("/my-batches", requireAuth, async (req, res) => {
  try {
    const shopId = req.user.role === "restaurant" ? req.user.shopId : Number(req.query.shopId);
    if (!Number.isFinite(Number(shopId))) {
      return res.status(400).json({ ok: false, error: "shopId required" });
    }
    const rows = await query(
      `
      SELECT
        ps.BatchNo,
        COUNT(*)                                                         AS txnCount,
        ISNULL(SUM(p.PaidAmount - ISNULL(p.ServiceFeeAmount, 0)), 0)     AS gross,
        ISNULL(SUM(ISNULL(p.PlatformFeeAmount, 0)), 0)                  AS fees,
        ISNULL(SUM(p.PaidAmount - ISNULL(p.ServiceFeeAmount, 0) - ISNULL(p.PlatformFeeAmount, 0)), 0) AS payoutAmount,
        MIN(p.CreatedAt)                                                 AS firstTxnAt,
        MAX(p.CreatedAt)                                                 AS lastTxnAt,
        MAX(ps.TransferDate)                                             AS transferDate,
        MAX(ps.ScheduledDate)                                            AS scheduledDate,
        SUM(CASE WHEN ps.Status = 'PROCESSING'  THEN 1 ELSE 0 END)       AS processingCount,
        SUM(CASE WHEN ps.Status = 'SCHEDULED'   THEN 1 ELSE 0 END)       AS scheduledCount,
        SUM(CASE WHEN ps.Status = 'TRANSFERRED' THEN 1 ELSE 0 END)       AS transferredCount
      FROM dbo.PayoutStatus ps
      INNER JOIN dbo.Payment p ON p.PaymentID = ps.PaymentID
      WHERE ps.BatchNo IS NOT NULL AND ps.ShopID = @shopId
      GROUP BY ps.BatchNo
      ORDER BY ps.BatchNo DESC
      `,
      { shopId: { type: mssql.BigInt, value: Number(shopId) } }
    );
    const batches = rows.map((r) => {
      const txnCount = Number(r.txnCount);
      const transferredCount = Number(r.transferredCount);
      const scheduledCount = Number(r.scheduledCount);
      const processingCount = Number(r.processingCount);
      const status =
        transferredCount === txnCount ? "TRANSFERRED" :
        transferredCount > 0 ? "MIXED" :
        scheduledCount === txnCount ? "SCHEDULED" :
        processingCount === txnCount ? "PROCESSING" : "PENDING";
      return {
        batchNo: Number(r.BatchNo),
        txnCount,
        gross: Number(r.gross),
        fees: Number(r.fees),
        tax: 0,
        payoutAmount: Number(r.payoutAmount),
        firstTxnAt: r.firstTxnAt,
        lastTxnAt: r.lastTxnAt,
        transferDate: r.transferDate || null,
        scheduledDate: r.scheduledDate || null,
        status
      };
    });
    res.json({ ok: true, batches });
  } catch (err) {
    console.error("[PAYOUT:PAYOUT] List my-batches error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load batches" });
  }
});

/**
 * Build WHERE conditions over dbo.Payment (aliased p) matching the filters the
 * super admin currently has applied in the transaction list, so "transfer all"
 * settles exactly what they are looking at.
 *
 * `batch` (one number or an array) narrows the scope to whole batches, which is
 * how the Batches tab settles a payout: the caller never enumerates the
 * payments, so a batch can never be half-settled by a truncated id list.
 * Conditions on `ps` are safe here - every query using this joins PayoutStatus.
 */
function buildScopeFilters(body, params) {
  const conditions = ["p.PaidAmount > 0"];
  const batchNos = []
    .concat(body?.batch ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (batchNos.length) {
    conditions.push(`ps.BatchNo IN (${idsInParams(batchNos, params, "scopeBatch")})`);
  }
  const shopId = Number(body?.shopId);
  if (Number.isFinite(shopId) && shopId > 0) {
    conditions.push("p.ShopID = @shopId");
    params.shopId = { type: mssql.BigInt, value: shopId };
  }
  if (body?.status === "PAID") {
    conditions.push(`(p.PaidStatus = @status OR EXISTS (
      SELECT 1 FROM dbo.PaymentSession pss
      WHERE pss.OrderRef = p.OrderRef AND pss.Status = 'SETTLED'
    ))`);
    params.status = { type: mssql.VarChar(50), value: String(body.status) };
  } else if (body?.status === "PENDING") {
    conditions.push(`(p.PaidStatus = @status AND NOT EXISTS (
      SELECT 1 FROM dbo.PaymentSession pss
      WHERE pss.OrderRef = p.OrderRef AND pss.Status = 'SETTLED'
    ))`);
    params.status = { type: mssql.VarChar(50), value: String(body.status) };
  } else if (body?.status) {
    conditions.push("p.PaidStatus = @status");
    params.status = { type: mssql.VarChar(50), value: String(body.status) };
  }
  const methodId = Number(body?.methodId);
  if (Number.isFinite(methodId) && methodId > 0) {
    conditions.push("p.MethodID = @methodId");
    params.methodId = { type: mssql.BigInt, value: methodId };
  }
  if (body?.search && String(body.search).trim()) {
    conditions.push("(CAST(p.PaymentID AS VARCHAR(30)) LIKE @search OR CAST(p.TransID AS VARCHAR(30)) LIKE @search OR CAST(p.TableID AS VARCHAR(30)) = @searchExact)");
    const term = String(body.search).trim();
    params.search = { type: mssql.VarChar(40), value: `%${term}%` };
    params.searchExact = { type: mssql.VarChar(30), value: term };
  }
  const fromDate = body?.from ? parseWallClock(body.from) : null;
  if (fromDate) {
    conditions.push("p.CreatedAt >= @from");
    params.from = { type: mssql.DateTime2, value: fromDate };
  }
  const toDate = body?.to ? parseWallClock(body.to, { endOfDay: true }) : null;
  if (toDate) {
    conditions.push("p.CreatedAt <= @to");
    params.to = { type: mssql.DateTime2, value: toDate };
  }
  if (body?.minAmount !== undefined && body.minAmount !== "" && Number.isFinite(Number(body.minAmount))) {
    conditions.push("p.PaidAmount >= @minAmount");
    params.minAmount = { type: mssql.Money, value: Number(body.minAmount) };
  }
  if (body?.maxAmount !== undefined && body.maxAmount !== "" && Number.isFinite(Number(body.maxAmount))) {
    conditions.push("p.PaidAmount <= @maxAmount");
    params.maxAmount = { type: mssql.Money, value: Number(body.maxAmount) };
  }
  return conditions;
}

/**
 * POST /api/payout/payouts/transfer-all
 * Body: { preview?, batch?, shopId?, status?, methodId?, search?, from?, to?,
 *         transferRef?, transferDate?, notes? }
 * With preview: true it only returns { count, amount } of awaiting payments in
 * scope. Otherwise it marks every awaiting payment in scope TRANSFERRED under
 * one reference, set-based, in a single transaction.
 *
 * Scoped by `batch`, existing batch numbers are left exactly as they are - a
 * scheduled batch is numbered by its payout date (see dateBatchNo) and that
 * number is the statement number the restaurant receives. Only an unscoped
 * transfer-all, which sweeps up payments belonging to no batch yet, mints one.
 */
router.post("/transfer-all", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const params = {};
    const scope = buildScopeFilters(req.body, params);
    const byBatch = [].concat(req.body?.batch ?? []).filter((b) => b !== "" && b != null).length > 0;
    const pendingWhere = `${scope.join(" AND ")} AND (ps.PayoutID IS NULL OR ps.Status <> 'TRANSFERRED')`;

    const previewRows = await query(
      `SELECT COUNT(*) AS cnt, ISNULL(SUM(p.PaidAmount - ISNULL(p.ServiceFeeAmount, 0) - ISNULL(p.PlatformFeeAmount, 0)), 0) AS amount
       FROM dbo.Payment p
       LEFT JOIN dbo.PayoutStatus ps ON ps.PaymentID = p.PaymentID
       WHERE ${pendingWhere}`,
      params
    );
    const count = Number(previewRows?.[0]?.cnt || 0);
    const amount = Number(previewRows?.[0]?.amount || 0);

    if (req.body?.preview) {
      return res.json({ ok: true, count, amount });
    }

    const transferRef = String(req.body?.transferRef || "").trim();
    if (!transferRef) {
      return res.status(400).json({ ok: false, error: "transferRef (cheque/transfer number) is required" });
    }
    if (count === 0) {
      return res.status(400).json({ ok: false, error: "No awaiting payments match the current filters" });
    }

    // A batch-scoped run keeps every row's own BatchNo; only an unscoped one
    // needs a new number for the payments it is about to group together.
    const batchNo = byBatch ? null : await nextBatchNo();
    const execParams = {
      ...params,
      transferRef: { type: mssql.NVarChar(200), value: transferRef },
      transferDate: { type: mssql.Date, value: parseTransferDate(req.body?.transferDate) },
      transferredBy: { type: mssql.NVarChar(100), value: req.user.username },
      notes: { type: mssql.NVarChar(500), value: req.body?.notes || null },
      ...(byBatch ? {} : { batchNo: { type: mssql.BigInt, value: batchNo } })
    };

    // Every payment inside a batch already has a PayoutStatus row, so the
    // INSERT branch below can only ever match under an unscoped run.
    const insertMissing = byBatch
      ? ""
      : `
      INSERT INTO dbo.PayoutStatus
        (PaymentID, ShopID, Amount, Status, TransferRef, TransferDate, TransferredBy, Notes, BatchNo, UpdatedAt)
      SELECT p.PaymentID, p.ShopID, (p.PaidAmount - ISNULL(p.ServiceFeeAmount, 0) - ISNULL(p.PlatformFeeAmount, 0)), 'TRANSFERRED', @transferRef, @transferDate, @transferredBy, @notes, @batchNo, SYSDATETIME()
      FROM dbo.Payment p
      LEFT JOIN dbo.PayoutStatus ps ON ps.PaymentID = p.PaymentID
      WHERE ${scope.join(" AND ")} AND ps.PayoutID IS NULL;
      `;

    await query(
      `
      BEGIN TRAN;

      UPDATE ps
      SET Status = 'TRANSFERRED', Amount = (p.PaidAmount - ISNULL(p.ServiceFeeAmount, 0) - ISNULL(p.PlatformFeeAmount, 0)), TransferRef = @transferRef,
          TransferDate = @transferDate, TransferredBy = @transferredBy,
          Notes = ISNULL(@notes, ps.Notes), ${byBatch ? "" : "BatchNo = @batchNo,"} UpdatedAt = SYSDATETIME()
      FROM dbo.PayoutStatus ps
      INNER JOIN dbo.Payment p ON p.PaymentID = ps.PaymentID
      WHERE ${scope.join(" AND ")} AND ps.Status <> 'TRANSFERRED';
      ${insertMissing}
      COMMIT;
      `,
      execParams
    );

    const batchLabel = byBatch ? [].concat(req.body.batch).join(",") : batchNo;
    console.log(`[PAYOUT:PAYOUT] Transfer-all by ${req.user.username} ref=${transferRef} batch=${batchLabel}: ${count} payments, ${amount}`);
    res.json({ ok: true, transferredCount: count, amount, transferRef, batchNo });
  } catch (err) {
    console.error("[PAYOUT:PAYOUT] Transfer-all error:", err.message);
    res.status(500).json({ ok: false, error: "Transfer-all failed" });
  }
});

/* ------------------------------------------------------------------------- *
 * Payout history - the settlement statement, reproduced from the ledger.
 *
 * Grouped by (BatchNo, TransferRef, TransferDate, ShopID), which is what one
 * bank credit actually is: a set of rows paid out together under one reference
 * on one day. Deliberately filtered on the ROW status, not the batch's derived
 * status - a batch can be part-settled (bulk-transfer skips payments with no
 * paid amount), and filtering by batch status would hide money that really left
 * the bank. The paid slice belongs in history, the unpaid slice stays pending.
 *
 * Statement line mapping (verified against the issued statement for batch
 * 4082026 / BATCH08042026, 59 transactions, every line matching to the fils):
 *
 *   Total Bill Amount   = SUM(PaidBillAmount)      -- NEVER SUM(BillAmount):
 *                         that column is a whole-bill snapshot copied onto each
 *                         leg of a split payment, so summing it multiplies the
 *                         bill by the number of legs (KOT 18611: 8 legs,
 *                         5,938.00 instead of 742.25).
 *   Tip Amount          = SUM(TipAmount)
 *   Service Fee         = SUM(PlatformFeeAmount) ex-VAT  (= txnCount x 0.50)
 *   VAT on Service Fee  = SUM(PlatformFeeAmount) - Service Fee
 *   Gross Payable       = SUM(PaidAmount - ServiceFeeAmount - PlatformFeeAmount)
 *   Transfer Fee        = BATCH_TRANSFER_FEE, flat per settlement
 *   VAT on Transfer Fee = Transfer Fee x 5%
 *   NET TRANSFERRED     = Gross Payable - Transfer Fee - VAT on Transfer Fee
 * ------------------------------------------------------------------------- */

const HISTORY_SELECT = `
  SELECT
    ps.BatchNo, ps.TransferRef, ps.TransferDate, ps.ShopID,
    COUNT(*)                                                          AS txnCount,
    ISNULL(SUM(ISNULL(p.PaidBillAmount, 0)), 0)                       AS totalBillAmount,
    ISNULL(SUM(ISNULL(p.TipAmount, 0)), 0)                            AS tipAmount,
    ISNULL(SUM(ISNULL(p.PlatformFeeAmount, 0)), 0)                    AS platformFeeTotal,
    ISNULL(SUM(p.PaidAmount - ISNULL(p.ServiceFeeAmount, 0)
                            - ISNULL(p.PlatformFeeAmount, 0)), 0)     AS grossPayable,
    ISNULL(SUM(p.PaidAmount), 0)                                      AS telrTotal,
    ISNULL(SUM(ISNULL(p.ServiceFeeAmount, 0)), 0)                     AS telrServiceFee,
    ISNULL(SUM(ps.Amount), 0)                                         AS ledgerAmount,
    MIN(p.CreatedAt)                                                  AS firstTxnAt,
    MAX(p.CreatedAt)                                                  AS lastTxnAt,
    MAX(ps.TransferredBy)                                             AS transferredBy,
    MAX(ps.UpdatedAt)                                                 AS settledAt
  FROM dbo.PayoutStatus ps
  INNER JOIN dbo.Payment p ON p.PaymentID = ps.PaymentID
`;

// TransferRef / TransferDate are nullable columns, and rows have been written
// by hand in the past. A NULL-keyed group would be a "paid" settlement with no
// bank identity, and a date filter would silently drop it - so exclude them
// here and report how many were excluded rather than losing them quietly.
const HISTORY_BASE_WHERE =
  `ps.Status = 'TRANSFERRED' AND ps.TransferRef IS NOT NULL AND ps.TransferDate IS NOT NULL`;

const HISTORY_GROUP_ORDER = `
  GROUP BY ps.BatchNo, ps.TransferRef, ps.TransferDate, ps.ShopID
  ORDER BY ps.TransferDate DESC, ps.BatchNo DESC
`;

/** Adds the optional transfer-date range shared by both history endpoints. */
function historyDateFilters(reqQuery, params, conditions) {
  const from = reqQuery?.from ? parseWallClock(String(reqQuery.from).slice(0, 10)) : null;
  if (from) {
    conditions.push("ps.TransferDate >= @from");
    params.from = { type: mssql.Date, value: from };
  }
  const to = reqQuery?.to ? parseWallClock(String(reqQuery.to).slice(0, 10)) : null;
  if (to) {
    conditions.push("ps.TransferDate <= @to");
    params.to = { type: mssql.Date, value: to };
  }
}

/**
 * "BATCH" + DDMMYYYY, matching the statements already issued (BATCH12082026 is
 * the 12 Aug 2026 payout). Taken from the batch number itself once that is
 * date-derived, so the statement number and the batch number can never drift
 * apart; older sequence-numbered batches fall back to their transfer date.
 */
function statementNo(batchNo, transferDate) {
  if (isDateBatchNo(batchNo)) return `BATCH${String(Number(batchNo)).padStart(8, "0")}`;
  if (!transferDate) return null;
  const d = new Date(transferDate);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `BATCH${dd}${mm}${d.getUTCFullYear()}`;
}

/** One DB row -> one settlement statement. */
function toStatement(r) {
  const txnCount = Number(r.txnCount);
  // PlatformFeeAmount is stored VAT-inclusive; the statement shows the charge
  // and its VAT on separate lines, so split it back out rather than recomputing
  // from a hardcoded per-transaction rate that may change later.
  const platformFeeTotal = r2(r.platformFeeTotal);
  const serviceFee = r2(platformFeeTotal / (1 + VAT_RATE));
  const serviceFeeVat = r2(platformFeeTotal - serviceFee);

  const grossPayable = r2(r.grossPayable);
  const transferFee = BATCH_TRANSFER_FEE;
  const transferFeeVat = r2(transferFee * VAT_RATE);
  const netTransferred = r2(grossPayable - transferFee - transferFeeVat);

  const ledgerAmount = r2(r.ledgerAmount);

  return {
    batchNo: Number(r.BatchNo),
    statementNo: statementNo(r.BatchNo, r.TransferDate),
    transferRef: r.TransferRef,
    transferDate: r.TransferDate,
    shopId: Number(r.ShopID),
    txnCount,
    // Statement lines, in the order they are printed.
    totalBillAmount: r2(r.totalBillAmount),
    tipAmount: r2(r.tipAmount),
    serviceFee,
    serviceFeeVat,
    grossPayable,
    transferFee,
    transferFeeVat,
    netTransferred,
    firstTxnAt: r.firstTxnAt,
    lastTxnAt: r.lastTxnAt,
    // Aliases matching the /my-batches shape so the existing settlement cards
    // and BatchDetailSheet render a history row without any adapter. Renaming
    // these would not crash - the formatter turns undefined into "0.00" - it
    // would silently show AED 0.00 as somebody's payout.
    status: "TRANSFERRED",
    gross: r2(Number(r.totalBillAmount) + Number(r.tipAmount)),
    fees: platformFeeTotal,
    payoutAmount: netTransferred,
    // Kept 0 for backwards compatibility with an older frontend that still
    // reads it; the Tax row itself is gone from the UI.
    tax: 0,
    ledgerAmount,
    drift: r2(ledgerAmount - grossPayable)
  };
}

/**
 * GET /api/payout/payouts/history?from&to&shopId
 * Super-admin settlement history across every restaurant.
 */
router.get("/history", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const params = {};
    const conditions = [HISTORY_BASE_WHERE];
    const shopId = Number(req.query.shopId);
    if (Number.isFinite(shopId) && shopId > 0) {
      conditions.push("ps.ShopID = @shopId");
      params.shopId = { type: mssql.BigInt, value: shopId };
    }
    historyDateFilters(req.query, params, conditions);

    const rows = await query(
      `${HISTORY_SELECT} WHERE ${conditions.join(" AND ")} ${HISTORY_GROUP_ORDER}`,
      params
    );
    const settlements = rows.map((r) => ({
      ...toStatement(r),
      telrTotal: r2(r.telrTotal),
      telrServiceFee: r2(r.telrServiceFee),
      transferredBy: r.transferredBy || null,
      settledAt: r.settledAt
    }));

    // Transferred rows that carry no reference or no date cannot be grouped
    // into a settlement - surface the count instead of dropping them silently.
    const excluded = await query(
      `SELECT COUNT(*) AS cnt FROM dbo.PayoutStatus ps
       WHERE ps.Status = 'TRANSFERRED'
         AND (ps.TransferRef IS NULL OR ps.TransferDate IS NULL)`
    );

    res.json({
      ok: true,
      settlements,
      unidentifiedCount: Number(excluded?.[0]?.cnt || 0)
    });
  } catch (err) {
    console.error("[PAYOUT:PAYOUT] History error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load payout history" });
  }
});

/**
 * GET /api/payout/payouts/my-history?from&to
 * The restaurant's own settlement statements. Hard-scoped to the caller's shop
 * exactly like /my-batches: a restaurant user's ?shopId= is ignored. DeynoQR's
 * own Telr service-fee cut is never exposed here.
 */
router.get("/my-history", requireAuth, async (req, res) => {
  try {
    const shopId = req.user.role === "restaurant" ? req.user.shopId : Number(req.query.shopId);
    if (!Number.isFinite(Number(shopId))) {
      return res.status(400).json({ ok: false, error: "shopId required" });
    }
    const params = { shopId: { type: mssql.BigInt, value: Number(shopId) } };
    const conditions = [HISTORY_BASE_WHERE, "ps.ShopID = @shopId"];
    historyDateFilters(req.query, params, conditions);

    const rows = await query(
      `${HISTORY_SELECT} WHERE ${conditions.join(" AND ")} ${HISTORY_GROUP_ORDER}`,
      params
    );
    const settlements = rows.map((r) => {
      // Drop the admin-only fields before they reach a restaurant.
      const { ledgerAmount, drift, shopId: _shopId, ...rest } = toStatement(r);
      return rest;
    });

    res.json({ ok: true, settlements });
  } catch (err) {
    console.error("[PAYOUT:PAYOUT] My-history error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load payout history" });
  }
});

export default router;
