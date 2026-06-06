// backend/middleware/adminAuth.middleware.js
import { verifyAdminToken } from "../services/adminAuth.service.js";

/**
 * Express middleware: require a valid admin JWT.
 * Reads Bearer token from Authorization header, verifies, attaches req.admin.
 */
export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing authorization token" });
  }

  try {
    const payload = verifyAdminToken(token);
    if (String(payload.role || "").toUpperCase() !== "ADMIN") {
      return res.status(403).json({ ok: false, error: "Admin privileges required" });
    }
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}
