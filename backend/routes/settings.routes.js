// backend/routes/settings.routes.js
import { Router } from "express";
import { getSettings, updateSettings } from "../services/settings.service.js";
import { requireAdmin } from "../middleware/adminAuth.middleware.js";

const router = Router();

/**
 * GET /api/settings
 * Public — customer app reads OrderingEnabled to decide menu-only vs ordering.
 */
router.get("/settings", async (_req, res) => {
  try {
    const settings = await getSettings();
    res.json({ ok: true, settings });
  } catch (e) {
    console.error("[/settings] ERROR", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "Failed to load settings" });
  }
});

/**
 * PUT /api/settings  (admin only)
 * Body: {
 *   orderingEnabled?: boolean,
 *   kotRouting?: "kitchen" | "counter",
 *   chefSpecial?: { productId, title?, titleAr?, subtitle?, subtitleAr?, from?, until? } | null
 * }
 */
router.put("/settings", requireAdmin, async (req, res) => {
  try {
    const { orderingEnabled, kotRouting, chefSpecial } = req.body || {};
    const settings = await updateSettings({ orderingEnabled, kotRouting, chefSpecial });
    res.json({ ok: true, settings });
  } catch (e) {
    console.error("[/settings PUT] ERROR", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "Failed to update settings" });
  }
});

export default router;
