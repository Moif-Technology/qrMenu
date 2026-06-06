// backend/services/adminAuth.service.js
import jwt from "jsonwebtoken";
import { query } from "../config/dbConfig.js";

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || "dev-admin-secret-change-me";
const JWT_EXPIRES = process.env.ADMIN_JWT_EXPIRES || "12h";

/**
 * Validate admin credentials against StaffMaster (Moifcore DB).
 * Only staff with Designation = 'ADMIN' may log in to the admin portal.
 * NOTE: StaffMaster passwords are stored as plaintext by the legacy POS,
 * so we compare directly. We never return the password to the client.
 */
export async function loginAdmin(login, password) {
  if (!login || !password) {
    const err = new Error("Login and password are required");
    err.statusCode = 400;
    throw err;
  }

  const rows = await query(
    `SELECT TOP 1 ID, StaffID, StaffCode, StaffName, Designation, Login, Password, SystemRoleID, MobileNo
     FROM StaffMaster
     WHERE LTRIM(RTRIM(Login)) = @login`,
    { login: String(login).trim() }
  );

  const staff = rows && rows[0];
  if (!staff || String(staff.Password ?? "").trim() !== String(password).trim()) {
    const err = new Error("Invalid login or password");
    err.statusCode = 401;
    throw err;
  }

  if (String(staff.Designation ?? "").trim().toUpperCase() !== "ADMIN") {
    const err = new Error("Access denied: admin privileges required");
    err.statusCode = 403;
    throw err;
  }

  const user = {
    id: staff.ID,
    staffId: staff.StaffID != null ? String(staff.StaffID) : null,
    staffCode: (staff.StaffCode ?? "").trim(),
    name: (staff.StaffName ?? "").trim(),
    designation: (staff.Designation ?? "").trim(),
    login: (staff.Login ?? "").trim(),
    role: "ADMIN",
  };

  const token = jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  return { token, user };
}

export function verifyAdminToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
