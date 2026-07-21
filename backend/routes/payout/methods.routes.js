// backend/routes/payout/methods.routes.js
// Payment method management (super admin only).
// dbo.Methods is the same table the main qrMenu backend reads: methods with
// Status = 'Block' are hidden from customers in the QR menu payment screen.
import express from "express";
import { query, mssql } from "../../utils/payoutDb.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/payoutAuth.middleware.js";

const router = express.Router();

/** GET /api/payout/methods - all payment methods, including blocked ones. */
router.get("/", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const rows = await query(
      `SELECT ID, PaymentMethodID, PaymentMethod, Status
       FROM dbo.Methods
       ORDER BY PaymentMethodID`
    );
    const methods = rows.map((m) => ({
      id: Number(m.ID),
      paymentMethodId: Number(m.PaymentMethodID),
      name: m.PaymentMethod,
      blocked: m.Status === "Block"
    }));
    res.json({ ok: true, methods });
  } catch (err) {
    console.error("[PAYOUT:METHODS] List error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load payment methods" });
  }
});

/** POST /api/payout/methods/:paymentMethodId/toggle - block or unblock a method. */
router.post("/:paymentMethodId/toggle", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const paymentMethodId = Number(req.params.paymentMethodId);
    if (!Number.isFinite(paymentMethodId) || paymentMethodId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid paymentMethodId" });
    }

    const rows = await query(
      `SELECT PaymentMethodID, PaymentMethod, Status
       FROM dbo.Methods WHERE PaymentMethodID = @paymentMethodId`,
      { paymentMethodId: { type: mssql.BigInt, value: paymentMethodId } }
    );
    const method = rows?.[0];
    if (!method) return res.status(404).json({ ok: false, error: "Payment method not found" });

    // Main qrMenu backend hides methods where Status = 'Block' (exact string);
    // existing active rows use 'ACTIVE', so we keep that convention.
    const newStatus = method.Status === "Block" ? "ACTIVE" : "Block";
    await query(
      `UPDATE dbo.Methods SET Status = @newStatus WHERE PaymentMethodID = @paymentMethodId`,
      {
        newStatus: { type: mssql.VarChar(20), value: newStatus },
        paymentMethodId: { type: mssql.BigInt, value: paymentMethodId }
      }
    );

    console.log(`[PAYOUT:METHODS] ${req.user.username} set '${method.PaymentMethod}' -> ${newStatus}`);
    res.json({ ok: true, paymentMethodId, name: method.PaymentMethod, blocked: newStatus === "Block" });
  } catch (err) {
    console.error("[PAYOUT:METHODS] Toggle error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to update payment method" });
  }
});

export default router;
