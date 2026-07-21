// backend/scripts/payout-seed-users.js
// Creates (or resets) payout dashboard logins with RANDOM passwords.
// No passwords are hardcoded anywhere: each run generates fresh ones and
// prints them ONCE to the console — save them immediately.
//
//   npm run seed:payout-users            -> creates missing users only
//   npm run seed:payout-users -- --reset -> also resets passwords of existing users
//
// Optional env overrides (if you want to choose the password yourself):
//   SEED_SUPERADMIN_PASSWORD / SEED_OPAIA_PASSWORD
import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query, mssql } from "../utils/payoutDb.js";

const RESET = process.argv.includes("--reset");

// URL-safe random password, e.g. "xK3n-Vq9pT2m"
function generatePassword() {
  return crypto.randomBytes(9).toString("base64url");
}

const USERS = [
  {
    username: "admin",
    password: process.env.SEED_SUPERADMIN_PASSWORD || generatePassword(),
    role: "superadmin",
    shopId: null,
    displayName: "DeynoQR Super Admin"
  },
  {
    username: "opaia",
    password: process.env.SEED_OPAIA_PASSWORD || generatePassword(),
    role: "restaurant",
    shopId: 1,
    displayName: "Opaia Restaurant"
  }
];

async function main() {
  const created = [];

  for (const u of USERS) {
    const existing = await query(
      `SELECT UserID FROM dbo.DashboardUsers WHERE Username = @username`,
      { username: u.username }
    );
    const hash = await bcrypt.hash(u.password, 10);

    if (existing.length) {
      if (!RESET) {
        console.log(`[SEED] User '${u.username}' already exists — skipping (use --reset to regenerate password).`);
        continue;
      }
      await query(
        `UPDATE dbo.DashboardUsers SET PasswordHash = @hash WHERE Username = @username`,
        { username: u.username, hash }
      );
      created.push(u);
      console.log(`[SEED] Reset password for '${u.username}'.`);
    } else {
      await query(
        `INSERT INTO dbo.DashboardUsers (Username, PasswordHash, Role, ShopID, DisplayName)
         VALUES (@username, @hash, @role, @shopId, @displayName)`,
        {
          username: u.username,
          hash,
          role: u.role,
          shopId: { type: mssql.BigInt, value: u.shopId },
          displayName: u.displayName
        }
      );
      created.push(u);
      console.log(`[SEED] Created user '${u.username}' (${u.role}${u.shopId != null ? `, shop ${u.shopId}` : ""}).`);
    }
  }

  if (created.length) {
    console.log("\n================= CREDENTIALS (shown once — save now) =================");
    for (const u of created) {
      console.log(`  ${u.username.padEnd(12)} ${u.password}`);
    }
    console.log("=======================================================================\n");
  }

  console.log("[SEED] Done. Users can change their own password from the dashboard.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[SEED] Failed:", err.message);
  process.exit(1);
});
