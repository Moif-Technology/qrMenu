// backend/routes/whatsapp.routes.js
//
// Admin-only WhatsApp blast utility. Every route here requires an admin JWT -
// these endpoints can message the restaurant's entire guest list, so none of
// them are public, not even the read-only ones.

import { Router } from "express";
import { query } from "../config/dbConfig.js";
import { requireAdmin } from "../middleware/adminAuth.middleware.js";
import {
  getHourlyUsage,
  getLastMessagedMap,
  getSendLog,
  getStatus,
  logoutClient,
  renderTemplate,
  resetClient,
  sendMessage,
  startClient,
} from "../services/whatsapp.service.js";

const router = Router();

router.use(requireAdmin);

/** GET /api/admin/whatsapp/status - connection state + QR + hourly usage. */
router.get("/status", (_req, res) => {
  try {
    res.json({ ok: true, ...getStatus(), usage: getHourlyUsage() });
  } catch (e) {
    console.error("[WA] /status ERROR", e?.message || e);
    res.status(500).json({ ok: false, error: "Failed to read WhatsApp status" });
  }
});

/** POST /api/admin/whatsapp/connect - boot the client (QR arrives via /status). */
router.post("/connect", (_req, res) => {
  try {
    const result = startClient();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[WA] /connect ERROR", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "Failed to start WhatsApp" });
  }
});

/**
 * POST /api/admin/whatsapp/reset
 * Body: { wipeSession?: boolean }
 *
 * Escape hatch for a wedged browser - kills whatever is holding the Chromium
 * profile and clears the lock. wipeSession also drops the cached login, which
 * is what switching to a different phone number needs.
 */
router.post("/reset", async (req, res) => {
  try {
    const wipeSession = Boolean(req.body?.wipeSession);
    const result = await resetClient({ wipeSession });
    res.json({ ok: true, ...result, ...getStatus() });
  } catch (e) {
    console.error("[WA] /reset ERROR", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "Reset failed" });
  }
});

/** POST /api/admin/whatsapp/logout - drop the session, require a new scan. */
router.post("/logout", async (_req, res) => {
  try {
    await logoutClient();
    res.json({ ok: true });
  } catch (e) {
    console.error("[WA] /logout ERROR", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "Failed to log out" });
  }
});

/**
 * GET /api/admin/whatsapp/customers?q=&page=&pageSize=
 *
 * The customer picker. Same CustomerMaster filter the reservation search uses
 * (name and mobile both present), plus the last time we messaged each one so
 * the admin can avoid re-blasting the same people.
 *
 * "Last messaged" is stitched on from the in-memory send log rather than
 * joined in SQL, because there is no log table yet - see whatsapp.service.js.
 */
router.get("/customers", async (req, res) => {
  try {
    const searchText = String(req.query.q || "").trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
    const offset = (page - 1) * pageSize;
    const hasSearch = searchText.length > 0;

    const where = `
      cm.[CustomerName] IS NOT NULL AND cm.[CustomerName] <> '' AND cm.[CustomerName] <> '0'
      AND cm.[MobileNo] IS NOT NULL AND cm.[MobileNo] <> '' AND cm.[MobileNo] <> '0'
      ${hasSearch ? "AND (cm.[CustomerName] LIKE @searchQuery OR cm.[MobileNo] LIKE @searchQuery)" : ""}
    `;

    const params = hasSearch ? { searchQuery: `%${searchText}%` } : {};

    const countRows = await query(
      `SELECT COUNT(*) AS total FROM dbo.[CustomerMaster] cm WHERE ${where}`,
      params
    );

    const rows = await query(
      `SELECT
         cm.[CustomerID] AS id,
         cm.[CustomerName] AS name,
         cm.[MobileNo] AS phone,
         cm.[Email] AS email
       FROM dbo.[CustomerMaster] cm
       WHERE ${where}
       ORDER BY cm.[CrOn] DESC, cm.[CustomerID] DESC
       OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`,
      params
    );

    const lastMessaged = getLastMessagedMap();
    const customers = (rows || []).map((c) => ({
      ...c,
      lastMessagedAt: lastMessaged[c.id] || null,
    }));

    const total = Number(countRows?.[0]?.total || 0);
    res.json({
      ok: true,
      customers,
      paging: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (e) {
    console.error("[WA] /customers ERROR", e?.message || e);
    res.status(500).json({ ok: false, error: "Failed to load customers", customers: [] });
  }
});

/**
 * POST /api/admin/whatsapp/send
 * Body: { customerId, name, phone, message, image? }
 *
 * `image` is an optional offer poster as { data, mimetype, filename }, where
 * data may be a data: URL or bare base64. When present the message text is
 * sent as its caption.
 *
 * Sends to exactly one recipient. The UI walks its selection and calls this
 * once per customer, pacing itself between calls - see the service for why
 * there is no bulk endpoint.
 */
router.post("/send", async (req, res) => {
  try {
    const { customerId, name, phone, message, image } = req.body || {};
    if (!phone) return res.status(400).json({ ok: false, error: "phone is required" });

    const text = renderTemplate(message, { name, phone });
    const result = await sendMessage({
      customerId,
      phone,
      message: text,
      image,
      sentBy: req.admin?.name || req.admin?.login || "admin",
    });

    res.json({ ok: true, ...result, usage: getHourlyUsage() });
  } catch (e) {
    const status = e?.statusCode || 500;
    if (status >= 500) console.error("[WA] /send ERROR", e?.message || e);
    res.status(status).json({ ok: false, error: e?.message || "Send failed" });
  }
});

/** GET /api/admin/whatsapp/log?limit= - recent sends, newest first. */
router.get("/log", (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    res.json({ ok: true, log: getSendLog(limit) });
  } catch (e) {
    console.error("[WA] /log ERROR", e?.message || e);
    res.status(500).json({ ok: false, error: "Failed to load log", log: [] });
  }
});

export default router;
