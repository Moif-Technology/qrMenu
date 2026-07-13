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

/** Company-only endpoints (approve / transfer payouts, cross-restaurant views). */
export function requireCompany(req, res, next) {
  if (req.user?.role !== "company") {
    return res.status(403).json({ ok: false, error: "Company access only" });
  }
  return next();
}
