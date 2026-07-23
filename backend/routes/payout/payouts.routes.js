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

async function nextBatchNo() {
  const rows = await query(`SELECT NEXT VALUE FOR dbo.PayoutBatchSeq AS n`);
  return Number(rows[0].n);
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

async function getPayment(paymentId) {
  const rows = await query(
    `SELECT PaymentID, ShopID, PaidAmount, PaidStatus
     FROM dbo.Payment WHERE PaymentID = @paymentId`,
    { paymentId: { type: mssql.BigInt, value: paymentId } }
  );
  return rows?.[0] || null;
}

async function getPayoutRow(paymentId) {
  const rows = await query(
    `SELECT PayoutID, Status FROM dbo.PayoutStatus WHERE PaymentID = @paymentId`,
    { paymentId: { type: mssql.BigInt, value: paymentId } }
  );
  return rows?.[0] || null;
}

async function markTransferred(payment, existing, { transferRef, transferDate, transferredBy, notes, batchNo }) {
  const params = {
    paymentId: { type: mssql.BigInt, value: Number(payment.PaymentID) },
    shopId: { type: mssql.BigInt, value: Number(payment.ShopID) },
    amount: { type: mssql.Money, value: Number(payment.PaidAmount) },
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
    const transferDate = req.body?.transferDate ? new Date(req.body.transferDate) : new Date();

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
    const transferDate = req.body?.transferDate ? new Date(req.body.transferDate) : new Date();
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
 * scheduledDate (YYYY-MM-DD) is required when status is SCHEDULED and must
 * fall on a Tuesday - payouts only run weekly on Tuesdays.
 */
router.post("/bulk-status", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const paymentIds = parsePaymentIds(req.body);
    if (!paymentIds.length) {
      return res.status(400).json({ ok: false, error: "paymentIds array is required" });
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
      if (scheduledDate.getUTCDay() !== 2) {
        return res.status(400).json({ ok: false, error: "scheduledDate must be a Tuesday" });
      }
    }

    const batchNo = status === "PENDING" ? null : await resolveBatchNo(paymentIds);

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
      if (existing?.Status === status) {
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
            amount: { type: mssql.Money, value: Number(payment.PaidAmount) },
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
    const rows = await query(`
      SELECT
        BatchNo,
        COUNT(*)                                                      AS txnCount,
        SUM(Amount)                                                   AS totalAmount,
        COUNT(DISTINCT ShopID)                                        AS restaurantCount,
        MAX(UpdatedAt)                                                AS lastUpdatedAt,
        SUM(CASE WHEN Status = 'PROCESSING' THEN 1 ELSE 0 END)        AS processingCount,
        SUM(CASE WHEN Status = 'SCHEDULED'  THEN 1 ELSE 0 END)        AS scheduledCount,
        SUM(CASE WHEN Status = 'TRANSFERRED' THEN 1 ELSE 0 END)       AS transferredCount
      FROM dbo.PayoutStatus
      WHERE BatchNo IS NOT NULL
      GROUP BY BatchNo
      ORDER BY BatchNo DESC
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
      return {
        batchNo: Number(r.BatchNo),
        txnCount,
        totalAmount: Number(r.totalAmount),
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
 * Build WHERE conditions over dbo.Payment (aliased p) matching the filters the
 * super admin currently has applied in the transaction list, so "transfer all"
 * settles exactly what they are looking at.
 */
function buildScopeFilters(body, params) {
  const conditions = ["p.PaidAmount > 0"];
  const shopId = Number(body?.shopId);
  if (Number.isFinite(shopId) && shopId > 0) {
    conditions.push("p.ShopID = @shopId");
    params.shopId = { type: mssql.BigInt, value: shopId };
  }
  if (body?.status) {
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
 * Body: { preview?, shopId?, status?, methodId?, search?, from?, to?,
 *         transferRef?, transferDate?, notes? }
 * With preview: true it only returns { count, amount } of awaiting payments in
 * scope. Otherwise it marks every awaiting payment in scope TRANSFERRED under
 * one reference and one shared batch number, set-based, in a single transaction.
 */
router.post("/transfer-all", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const params = {};
    const scope = buildScopeFilters(req.body, params);
    const pendingWhere = `${scope.join(" AND ")} AND (ps.PayoutID IS NULL OR ps.Status <> 'TRANSFERRED')`;

    const previewRows = await query(
      `SELECT COUNT(*) AS cnt, ISNULL(SUM(p.PaidAmount), 0) AS amount
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

    const batchNo = await nextBatchNo();
    const execParams = {
      ...params,
      transferRef: { type: mssql.NVarChar(200), value: transferRef },
      transferDate: { type: mssql.Date, value: req.body?.transferDate ? new Date(req.body.transferDate) : new Date() },
      transferredBy: { type: mssql.NVarChar(100), value: req.user.username },
      notes: { type: mssql.NVarChar(500), value: req.body?.notes || null },
      batchNo: { type: mssql.BigInt, value: batchNo }
    };

    await query(
      `
      BEGIN TRAN;

      UPDATE ps
      SET Status = 'TRANSFERRED', Amount = p.PaidAmount, TransferRef = @transferRef,
          TransferDate = @transferDate, TransferredBy = @transferredBy,
          Notes = ISNULL(@notes, ps.Notes), BatchNo = @batchNo, UpdatedAt = SYSDATETIME()
      FROM dbo.PayoutStatus ps
      INNER JOIN dbo.Payment p ON p.PaymentID = ps.PaymentID
      WHERE ${scope.join(" AND ")} AND ps.Status <> 'TRANSFERRED';

      INSERT INTO dbo.PayoutStatus
        (PaymentID, ShopID, Amount, Status, TransferRef, TransferDate, TransferredBy, Notes, BatchNo, UpdatedAt)
      SELECT p.PaymentID, p.ShopID, p.PaidAmount, 'TRANSFERRED', @transferRef, @transferDate, @transferredBy, @notes, @batchNo, SYSDATETIME()
      FROM dbo.Payment p
      LEFT JOIN dbo.PayoutStatus ps ON ps.PaymentID = p.PaymentID
      WHERE ${scope.join(" AND ")} AND ps.PayoutID IS NULL;

      COMMIT;
      `,
      execParams
    );

    console.log(`[PAYOUT:PAYOUT] Transfer-all by ${req.user.username} ref=${transferRef} batch=${batchNo}: ${count} payments, ${amount}`);
    res.json({ ok: true, transferredCount: count, amount, transferRef, batchNo });
  } catch (err) {
    console.error("[PAYOUT:PAYOUT] Transfer-all error:", err.message);
    res.status(500).json({ ok: false, error: "Transfer-all failed" });
  }
});

export default router;
