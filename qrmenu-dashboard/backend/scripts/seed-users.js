// qrmenu-dashboard/backend/scripts/seed-users.js
// Creates the initial dashboard logins:
//   company / company123     (role: company  — sees everything, marks payouts)
//   opaia   / opaia123       (role: restaurant, ShopID 1 — read-only own data)
// Change the passwords immediately after first login in production.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { query, mssql } from "../config/db.js";

const USERS = [
  { username: "company", password: process.env.SEED_COMPANY_PASSWORD || "company123", role: "company", shopId: null, displayName: "DeynoQR Admin" },
  { username: "opaia", password: process.env.SEED_OPAIA_PASSWORD || "opaia123", role: "restaurant", shopId: 1, displayName: "Opaia Restaurant" }
];

async function main() {
  for (const u of USERS) {
    const existing = await query(
      `SELECT UserID FROM dbo.DashboardUsers WHERE Username = @username`,
      { username: u.username }
    );
    if (existing.length) {
      console.log(`[SEED] User '${u.username}' already exists — skipping.`);
      continue;
    }
    const hash = await bcrypt.hash(u.password, 10);
    await query(
      `INSERT INTO dbo.DashboardUsers (Username, PasswordHash, Role, ShopID, DisplayName)
       VALUES (@username, @hash, @role, @shopId, @displayName)`,
      {
        username: u.username,
        hash,
        role: u.role,
        shopId: u.shopId != null ? { type: mssql.BigInt, value: u.shopId } : { type: mssql.BigInt, value: null },
        displayName: u.displayName
      }
    );
    console.log(`[SEED] Created user '${u.username}' (${u.role}${u.shopId != null ? `, shop ${u.shopId}` : ""}).`);
  }
  console.log("[SEED] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[SEED] Failed:", err.message);
  process.exit(1);
});
