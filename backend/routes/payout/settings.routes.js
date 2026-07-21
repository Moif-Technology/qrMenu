// backend/routes/payout/settings.routes.js
// Company-controlled QR menu settings (currently: online service fee %).
// dbo.ServiceFeeConfig is the same table the main qrMenu backend reads at
// checkout time, so a change here takes effect on the next payment.
import express from "express";
import { query, mssql } from "../../utils/payoutDb.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/payoutAuth.middleware.js";

const router = express.Router();

/** GET /api/payout/settings/service-fee - current rate. */
router.get("/service-fee", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const rows = await query(`SELECT RatePercent, UpdatedBy, UpdatedOn FROM dbo.ServiceFeeConfig WHERE ID = 1`);
    const row = rows?.[0];
    if (!row) return res.status(404).json({ ok: false, error: "Service fee config not found" });
    res.json({
      ok: true,
      ratePercent: Number(row.RatePercent),
      updatedBy: row.UpdatedBy,
      updatedOn: row.UpdatedOn
    });
  } catch (err) {
    console.error("[PAYOUT:SETTINGS] Get service fee error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load service fee" });
  }
});

/** PUT /api/payout/settings/service-fee - update rate. Body: { ratePercent } */
router.put("/service-fee", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const ratePercent = Number(req.body?.ratePercent);
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      return res.status(400).json({ ok: false, error: "ratePercent must be a number between 0 and 100" });
    }

    await query(
      `UPDATE dbo.ServiceFeeConfig
       SET RatePercent = @ratePercent, UpdatedBy = @updatedBy, UpdatedOn = GETDATE()
       WHERE ID = 1`,
      {
        ratePercent: { type: mssql.Decimal(5, 2), value: ratePercent },
        updatedBy: { type: mssql.VarChar(50), value: req.user.username }
      }
    );

    console.log(`[PAYOUT:SETTINGS] ${req.user.username} set service fee -> ${ratePercent}%`);
    res.json({ ok: true, ratePercent });
  } catch (err) {
    console.error("[PAYOUT:SETTINGS] Update service fee error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to update service fee" });
  }
});

export default router;
