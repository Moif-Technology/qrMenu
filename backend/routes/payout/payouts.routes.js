// backend/routes/payout/payouts.routes.js
// Super-admin-only payout actions. The pipeline has exactly two states:
// PENDING (money collected, sitting with DeynoQR) and TRANSFERRED (settled to
// the restaurant with a cheque / bank reference). Transfers are final - there
// is deliberately no undo and no intermediate "approved" step.
import express from "express";
import { query, mssql } from "../../utils/payoutDb.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/payoutAuth.middleware.js";
import { parseWallClock } from "../../utils/payoutDates.js";

const router = express.Router();

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

async function markTransferred(payment, existing, { transferRef, transferDate, transferredBy, notes }) {
  const params = {
    paymentId: { type: mssql.BigInt, value: Number(payment.PaymentID) },
    shopId: { type: mssql.BigInt, value: Number(payment.ShopID) },
    amount: { type: mssql.Money, value: Number(payment.PaidAmount) },
    transferRef: { type: mssql.NVarChar(200), value: transferRef },
    transferDate: { type: mssql.Date, value: transferDate },
    transferredBy: { type: mssql.NVarChar(100), value: transferredBy },
    notes: { type: mssql.NVarChar(500), value: notes || null }
  };

  if (existing) {
    // Any pre-transfer row (including legacy APPROVED rows) moves straight to TRANSFERRED.
    await query(
      `UPDATE dbo.PayoutStatus
       SET Status = 'TRANSFERRED', Amount = @amount, TransferRef = @transferRef,
           TransferDate = @transferDate, TransferredBy = @transferredBy,
           Notes = ISNULL(@notes, Notes), UpdatedAt = SYSDATETIME()
       WHERE PaymentID = @paymentId`,
      params
    );
  } else {
    await query(
      `INSERT INTO dbo.PayoutStatus
         (PaymentID, ShopID, Amount, Status, TransferRef, TransferDate, TransferredBy, Notes)
       VALUES
         (@paymentId, @shopId, @amount, 'TRANSFERRED', @transferRef, @transferDate, @transferredBy, @notes)`,
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

    await markTransferred(payment, existing, {
      transferRef,
      transferDate,
      transferredBy: req.user.username,
      notes: req.body?.notes
    });

    res.json({ ok: true, paymentId, status: "TRANSFERRED", transferRef });
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
        notes: req.body?.notes
      });
      results.transferred.push(paymentId);
    }

    console.log(`[PAYOUT:PAYOUT] Bulk transfer by ${req.user.username} ref=${transferRef}: ${results.transferred.length} transferred, ${results.skipped.length} skipped`);
    res.json({ ok: true, transferredCount: results.transferred.length, transferRef, ...results });
  } catch (err) {
    console.error("[PAYOUT:PAYOUT] Bulk transfer error:", err.message);
    res.status(500).json({ ok: false, error: "Bulk transfer failed" });
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
 * one reference, set-based, in a single transaction.
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

    const execParams = {
      ...params,
      transferRef: { type: mssql.NVarChar(200), value: transferRef },
      transferDate: { type: mssql.Date, value: req.body?.transferDate ? new Date(req.body.transferDate) : new Date() },
      transferredBy: { type: mssql.NVarChar(100), value: req.user.username },
      notes: { type: mssql.NVarChar(500), value: req.body?.notes || null }
    };

    await query(
      `
      BEGIN TRAN;

      UPDATE ps
      SET Status = 'TRANSFERRED', Amount = p.PaidAmount, TransferRef = @transferRef,
          TransferDate = @transferDate, TransferredBy = @transferredBy,
          Notes = ISNULL(@notes, ps.Notes), UpdatedAt = SYSDATETIME()
      FROM dbo.PayoutStatus ps
      INNER JOIN dbo.Payment p ON p.PaymentID = ps.PaymentID
      WHERE ${scope.join(" AND ")} AND ps.Status <> 'TRANSFERRED';

      INSERT INTO dbo.PayoutStatus
        (PaymentID, ShopID, Amount, Status, TransferRef, TransferDate, TransferredBy, Notes)
      SELECT p.PaymentID, p.ShopID, p.PaidAmount, 'TRANSFERRED', @transferRef, @transferDate, @transferredBy, @notes
      FROM dbo.Payment p
      LEFT JOIN dbo.PayoutStatus ps ON ps.PaymentID = p.PaymentID
      WHERE ${scope.join(" AND ")} AND ps.PayoutID IS NULL;

      COMMIT;
      `,
      execParams
    );

    console.log(`[PAYOUT:PAYOUT] Transfer-all by ${req.user.username} ref=${transferRef}: ${count} payments, ${amount}`);
    res.json({ ok: true, transferredCount: count, amount, transferRef });
  } catch (err) {
    console.error("[PAYOUT:PAYOUT] Transfer-all error:", err.message);
    res.status(500).json({ ok: false, error: "Transfer-all failed" });
  }
});

export default router;
