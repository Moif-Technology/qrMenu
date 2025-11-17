// backend/services/modifier.service.js
import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";

const T_MODS = "Inventory.dbo.ModifierTable";
const q = (n) => `[${n}]`;

/**
 * Get ALL modifiers (no aliases, no limit, no sort, no paging).
 * Returns columns exactly as in DB.
 */
export async function listAllModifiers() {
  const pool = await connectToDb();

  const sql = `
    SELECT
      ${q("Modifier")},
      ${q("ModifierID")},
      ${q("ModifierArabic")},
      ${q("UploadStatus")}
    FROM ${T_MODS}
  `;

  const rs = await pool.request().query(sql);
  return rs.recordset; // [{ Modifier, ModifierID, ModifierArabic, UploadStatus }, ...]
}
