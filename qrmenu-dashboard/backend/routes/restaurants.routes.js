// qrmenu-dashboard/backend/routes/restaurants.routes.js
import express from "express";
import { query, mssql } from "../config/db.js";
import { requireAuth, requireCompany } from "../middleware/auth.js";

const router = express.Router();

/** GET /api/restaurants — company only, for the filter dropdown. */
router.get("/", requireAuth, requireCompany, async (_req, res) => {
  try {
    const rows = await query(
      `SELECT RestaurantID, Slug, Name, ContactPerson, ContactPhone,
              BankName, BankAccount, BankIBAN, Status, CreatedAt
       FROM dbo.RestaurantMaster
       ORDER BY RestaurantID`
    );
    res.json({ ok: true, restaurants: rows });
  } catch (err) {
    console.error("[DASH:REST] List error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load restaurants" });
  }
});

/** POST /api/restaurants — register a new restaurant (company only). */
router.post("/", requireAuth, requireCompany, async (req, res) => {
  try {
    const { restaurantId, slug, name, contactPerson, contactPhone, bankName, bankAccount, bankIban } = req.body || {};
    const id = Number(restaurantId);
    if (!Number.isFinite(id) || id <= 0 || !slug || !name) {
      return res.status(400).json({ ok: false, error: "restaurantId, slug and name are required" });
    }

    await query(
      `INSERT INTO dbo.RestaurantMaster
         (RestaurantID, Slug, Name, ContactPerson, ContactPhone, BankName, BankAccount, BankIBAN)
       VALUES
         (@id, @slug, @name, @contactPerson, @contactPhone, @bankName, @bankAccount, @bankIban)`,
      {
        id: { type: mssql.BigInt, value: id },
        slug: { type: mssql.VarChar(50), value: String(slug).trim().toLowerCase() },
        name: { type: mssql.NVarChar(200), value: String(name).trim() },
        contactPerson: { type: mssql.NVarChar(200), value: contactPerson || null },
        contactPhone: { type: mssql.VarChar(50), value: contactPhone || null },
        bankName: { type: mssql.NVarChar(200), value: bankName || null },
        bankAccount: { type: mssql.NVarChar(100), value: bankAccount || null },
        bankIban: { type: mssql.NVarChar(100), value: bankIban || null }
      }
    );
    res.json({ ok: true, restaurantId: id });
  } catch (err) {
    if (/UNIQUE|PRIMARY KEY/i.test(err.message)) {
      return res.status(409).json({ ok: false, error: "RestaurantID or slug already exists" });
    }
    console.error("[DASH:REST] Create error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to create restaurant" });
  }
});

export default router;
