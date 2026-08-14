// backend/middleware/adminAuth.middleware.js
import { verifyAdminToken } from "../services/adminAuth.service.js";

/**
 * Express middleware: require a valid admin JWT.
 * Reads Bearer token from Authorization header, verifies, attaches req.admin.
 */
/**
 * Express middleware: require admin auth for anything that mutates.
 *
 * Mounted with router.use() so it also covers routes added later - the failure
 * mode we are closing is that qr-menu and package writes were reachable with no
 * token at all, and a per-route list would drift again the next time someone
 * adds an endpoint.
 *
 * GET is deliberately exempt: the diner QR app reads /api/packages/headers,
 * /contents and /details with no admin session.
 */
export function adminOnlyForWrites(req, res, next) {
  if (req.method === "GET") return next();
  return requireAdmin(req, res, next);
}

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
