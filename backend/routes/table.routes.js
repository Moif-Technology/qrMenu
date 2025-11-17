// backend/routes/table.routes.js
import { Router } from "express";
import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";
import { decodeToken } from "../utils/qr.utils.js";

const router = Router();

const LIST_SQL = `
SELECT 
  km.kotMasterID,
  km.KotStatus,kc.AndroidPrint,
  ISNULL(km.BillID, 0)    AS BillID,
  km.TableID,
  km.CrOn,
  kc.KotChildID,
  kc.ProductID,
  kc.ShortDescription,
  kc.Qty,
  kc.UnitPrice,
  kc.Tax1AmountC,
  kc.LineTotal,
  kc.Modifier
FROM dbo.KOTMaster AS km
JOIN dbo.KOTChild  AS kc
  ON kc.kotMasterID = km.kotMasterID
WHERE km.TableID = @TableID
  AND ISNULL(km.BillID, 0) = 0
  AND ISNULL(km.KotStatus, '') <> 'CANCELLED'
ORDER BY km.kotMasterID, kc.KotChildID;
`;

// POST /api/r/resolve  -> { token } => { tableId, area, lines: [...] }
router.post("/r/resolve", async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok:false, msg:"token required" });
    const { tableId, area } = decodeToken(token);

    const numericTable = Number(String(tableId).replace(/\D/g, "")) || 0;
    const pool = await connectToDb();
    const q = await pool.request()
      .input("TableID", mssql.Int, numericTable)
      .query(LIST_SQL);

    res.json({ ok:true, tableId: String(tableId), area, lines: q.recordset || [] });
  } catch (e) {
    console.error("[/r/resolve]", e?.message || e);
    res.status(400).json({ ok:false, msg: e?.message || "invalid token" });
  }
});

// GET /api/tables/:tableId/summary
router.get("/tables/:tableId/summary", async (req, res) => {
  try {
    const numericTable = Number(String(req.params.tableId).replace(/\D/g, "")) || 0;
    const pool = await connectToDb();
    const q = await pool.request()
      .input("TableID", mssql.Int, numericTable)
      .query(LIST_SQL);

    res.json({ ok:true, tableId: numericTable, lines: q.recordset || [] });
  } catch (e) {
    console.error("[/tables/:tableId/summary]", e?.message || e);
    res.status(500).json({ ok:false, msg:"summary failed" });
  }
});

export default router;
