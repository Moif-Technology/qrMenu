// backend/routes/admin.routes.js
import { Router } from "express";
import { loginAdmin } from "../services/adminAuth.service.js";
import { requireAdmin } from "../middleware/adminAuth.middleware.js";

const router = Router();

/**
 * POST /api/admin/login
 * Body: { login, password }
 * Validates against StaffMaster (Designation='ADMIN'), returns JWT + user.
 */
router.post("/admin/login", async (req, res) => {
  try {
    const { login, password } = req.body || {};
    const result = await loginAdmin(login, password);
    res.json({ ok: true, ...result });
  } catch (e) {
    const status = e?.statusCode || 500;
    if (status >= 500) console.error("[/admin/login] ERROR", e?.message || e);
    res.status(status).json({ ok: false, error: e?.message || "Login failed" });
  }
});

/**
 * GET /api/admin/me
 * Returns the authenticated admin from the token (session check).
 */
router.get("/admin/me", requireAdmin, (req, res) => {
  res.json({ ok: true, user: req.admin });
});

export default router;
