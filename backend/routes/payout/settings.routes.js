// backend/routes/payout/settings.routes.js
// Company-controlled QR menu settings (currently: online service fee %).
// dbo.ServiceFeeConfig is the same table the main qrMenu backend reads at
// checkout time, so a change here takes effect on the next payment.
import express from "express";
import { query, mssql } from "../../utils/payoutDb.js";
import { requireAuth, requireSuperAdmin } from "../../middleware/payoutAuth.middleware.js";

const router = express.Router();

const DEFAULT_TELR_RECEIPT_EMAIL = "deynoqrreceipts@gmail.com";

// The receipt-email column is added on first use so this works on any
// environment without a separate migration step. Ignores failures: the rest
// of the panel must keep working even if the login has no DDL rights.
let receiptEmailColumnReady = false;
async function ensureReceiptEmailColumn() {
  if (receiptEmailColumnReady) return;
  try {
    await query(`
      IF COL_LENGTH('dbo.ServiceFeeConfig', 'TelrReceiptEmail') IS NULL
        ALTER TABLE dbo.ServiceFeeConfig ADD TelrReceiptEmail NVARCHAR(200) NULL;
    `);
    receiptEmailColumnReady = true;
  } catch (err) {
    console.error("[PAYOUT:SETTINGS] Could not ensure TelrReceiptEmail column:", err.message);
  }
}

/** GET /api/payout/settings/service-fee - current rate + Telr receipt inbox. */
router.get("/service-fee", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    await ensureReceiptEmailColumn();
    const emailCol = receiptEmailColumnReady ? "TelrReceiptEmail" : "NULL AS TelrReceiptEmail";
    const rows = await query(`SELECT RatePercent, ${emailCol}, UpdatedBy, UpdatedOn FROM dbo.ServiceFeeConfig WHERE ID = 1`);
    const row = rows?.[0];
    if (!row) return res.status(404).json({ ok: false, error: "Service fee config not found" });
    res.json({
      ok: true,
      ratePercent: Number(row.RatePercent),
      receiptEmail: String(row.TelrReceiptEmail || "").trim() || DEFAULT_TELR_RECEIPT_EMAIL,
      updatedBy: row.UpdatedBy,
      updatedOn: row.UpdatedOn
    });
  } catch (err) {
    console.error("[PAYOUT:SETTINGS] Get service fee error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load service fee" });
  }
});

/**
 * PUT /api/payout/settings/service-fee - update rate and/or Telr receipt inbox.
 * Body: { ratePercent, receiptEmail? }
 */
router.put("/service-fee", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const ratePercent = Number(req.body?.ratePercent);
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      return res.status(400).json({ ok: false, error: "ratePercent must be a number between 0 and 100" });
    }

    let receiptEmail;
    if (req.body?.receiptEmail !== undefined) {
      receiptEmail = String(req.body.receiptEmail || "").trim();
      if (!receiptEmail) receiptEmail = DEFAULT_TELR_RECEIPT_EMAIL;
      if (receiptEmail.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiptEmail)) {
        return res.status(400).json({ ok: false, error: "receiptEmail must be a valid email address" });
      }
      await ensureReceiptEmailColumn();
      if (!receiptEmailColumnReady) {
        return res.status(500).json({ ok: false, error: "Receipt email storage is unavailable" });
      }
    }

    await query(
      `UPDATE dbo.ServiceFeeConfig
       SET RatePercent = @ratePercent,
           ${receiptEmail !== undefined ? "TelrReceiptEmail = @receiptEmail," : ""}
           UpdatedBy = @updatedBy, UpdatedOn = GETDATE()
       WHERE ID = 1`,
      {
        ratePercent: { type: mssql.Decimal(5, 2), value: ratePercent },
        ...(receiptEmail !== undefined
          ? { receiptEmail: { type: mssql.NVarChar(200), value: receiptEmail } }
          : {}),
        updatedBy: { type: mssql.VarChar(50), value: req.user.username }
      }
    );

    console.log(
      `[PAYOUT:SETTINGS] ${req.user.username} set service fee -> ${ratePercent}%` +
      (receiptEmail !== undefined ? `, receipt email -> ${receiptEmail}` : "")
    );
    res.json({ ok: true, ratePercent, ...(receiptEmail !== undefined ? { receiptEmail } : {}) });
  } catch (err) {
    console.error("[PAYOUT:SETTINGS] Update service fee error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to update service fee" });
  }
});

export default router;
