// qrmenu-dashboard/backend/routes/payouts.routes.js
// Company-only payout actions: approve a payment for payout, then mark it
// transferred with a cheque / bank reference. Upserts into dbo.PayoutStatus.
import express from "express";
import { query, mssql } from "../config/db.js";
import { requireAuth, requireCompany } from "../middleware/auth.js";

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

/** POST /api/payouts/:paymentId/approve  { notes? } */
router.post("/:paymentId/approve", requireAuth, requireCompany, async (req, res) => {
  try {
    const paymentId = Number(req.params.paymentId);
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid paymentId" });
    }

    const payment = await getPayment(paymentId);
    if (!payment) return res.status(404).json({ ok: false, error: "Payment not found" });
    if (Number(payment.PaidAmount) <= 0) {
      return res.status(400).json({ ok: false, error: "Payment has no paid amount to approve" });
    }

    const existing = await getPayoutRow(paymentId);
    if (existing?.Status === "TRANSFERRED") {
      return res.status(409).json({ ok: false, error: "Payout already transferred" });
    }

    const params = {
      paymentId: { type: mssql.BigInt, value: paymentId },
      shopId: { type: mssql.BigInt, value: Number(payment.ShopID) },
      amount: { type: mssql.Money, value: Number(payment.PaidAmount) },
      approvedBy: { type: mssql.NVarChar(100), value: req.user.username },
      notes: { type: mssql.NVarChar(500), value: req.body?.notes || null }
    };

    if (existing) {
      await query(
        `UPDATE dbo.PayoutStatus
         SET Status = 'APPROVED', Amount = @amount, ApprovedBy = @approvedBy,
             ApprovedAt = SYSDATETIME(), Notes = ISNULL(@notes, Notes), UpdatedAt = SYSDATETIME()
         WHERE PaymentID = @paymentId`,
        params
      );
    } else {
      await query(
        `INSERT INTO dbo.PayoutStatus (PaymentID, ShopID, Amount, Status, ApprovedBy, ApprovedAt, Notes)
         VALUES (@paymentId, @shopId, @amount, 'APPROVED', @approvedBy, SYSDATETIME(), @notes)`,
        params
      );
    }

    res.json({ ok: true, paymentId, status: "APPROVED" });
  } catch (err) {
    console.error("[DASH:PAYOUT] Approve error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to approve payout" });
  }
});

/** POST /api/payouts/:paymentId/transfer  { transferRef, transferDate?, notes? } */
router.post("/:paymentId/transfer", requireAuth, requireCompany, async (req, res) => {
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

    const existing = await getPayoutRow(paymentId);

    const params = {
      paymentId: { type: mssql.BigInt, value: paymentId },
      shopId: { type: mssql.BigInt, value: Number(payment.ShopID) },
      amount: { type: mssql.Money, value: Number(payment.PaidAmount) },
      transferRef: { type: mssql.NVarChar(200), value: transferRef },
      transferDate: { type: mssql.Date, value: transferDate },
      transferredBy: { type: mssql.NVarChar(100), value: req.user.username },
      notes: { type: mssql.NVarChar(500), value: req.body?.notes || null }
    };

    if (existing) {
      await query(
        `UPDATE dbo.PayoutStatus
         SET Status = 'TRANSFERRED', Amount = @amount, TransferRef = @transferRef,
             TransferDate = @transferDate, TransferredBy = @transferredBy,
             Notes = ISNULL(@notes, Notes), UpdatedAt = SYSDATETIME()
         WHERE PaymentID = @paymentId`,
        params
      );
    } else {
      // Direct transfer without a prior approve step is allowed.
      await query(
        `INSERT INTO dbo.PayoutStatus
           (PaymentID, ShopID, Amount, Status, TransferRef, TransferDate, TransferredBy, Notes)
         VALUES
           (@paymentId, @shopId, @amount, 'TRANSFERRED', @transferRef, @transferDate, @transferredBy, @notes)`,
        params
      );
    }

    res.json({ ok: true, paymentId, status: "TRANSFERRED", transferRef });
  } catch (err) {
    console.error("[DASH:PAYOUT] Transfer error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to mark payout transferred" });
  }
});

/** POST /api/payouts/:paymentId/reset — undo back to PENDING (company only). */
router.post("/:paymentId/reset", requireAuth, requireCompany, async (req, res) => {
  try {
    const paymentId = Number(req.params.paymentId);
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid paymentId" });
    }
    await query(
      `UPDATE dbo.PayoutStatus
       SET Status = 'PENDING', ApprovedBy = NULL, ApprovedAt = NULL,
           TransferRef = NULL, TransferDate = NULL, TransferredBy = NULL,
           UpdatedAt = SYSDATETIME()
       WHERE PaymentID = @paymentId`,
      { paymentId: { type: mssql.BigInt, value: paymentId } }
    );
    res.json({ ok: true, paymentId, status: "PENDING" });
  } catch (err) {
    console.error("[DASH:PAYOUT] Reset error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to reset payout" });
  }
});

export default router;
