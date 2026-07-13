// qrmenu-dashboard/backend/middleware/auth.js
import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.DASHBOARD_JWT_SECRET || "change-me-in-production";
export const JWT_EXPIRES_IN = process.env.DASHBOARD_JWT_EXPIRES || "12h";

/** Verifies the Bearer token and attaches req.user = { userId, username, role, shopId }. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing token" });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

/** Super-admin-only endpoints (payouts, cross-restaurant views, payment methods). */
export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ ok: false, error: "Super admin access only" });
  }
  return next();
}
