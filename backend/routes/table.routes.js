// backend/routes/table.routes.js
import { Router } from "express";
import mssql from "mssql";
import { connectToDb, connectToPaymentDb } from "../config/dbConfig.js";
import { decodeToken } from "../utils/qr.utils.js";

const router = Router();

// Query to get all unpaid orders for display (regardless of acceptance status)
// Note: We'll filter out fully paid orders by checking Payment table separately
const LIST_SQL = `
SELECT
  km.kotMasterID,
  km.KotStatus,
  kc.AndroidPrint,
  ISNULL(km.BillID, 0)    AS BillID,
  km.TableID,
  km.CrOn,
  km.Amount               AS KotAmount,
  ISNULL(km.BillDiscount, 0) AS BillDiscount,
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

// A POS-applied bill discount lives only on KOTMaster (BillDiscount, applied
// pre-tax on the subtotal) and is already baked into KOTMaster.Amount - but the
// QR menu builds its total by summing KOTChild.LineTotal, which is NOT
// discounted, so the guest gets overcharged. (Item-level discounts already sit
// inside each LineTotal, so those are fine.) We surface KotAmount + BillDiscount
// per line (both are KOTMaster-level, repeated on each child row here) and the
// frontend uses them to show a discount line and land the total on Amount.
// Nothing is scaled here - the raw item prices are preserved for display.

/**
 * GET /api/tables/by-area/:areaId
 * Get all tables for a specific area
 * Returns tables with their status (Available, Occupied, Reserved)
 */
router.get("/tables/by-area/:areaId", async (req, res) => {
  try {
    const { areaId } = req.params;
    
    if (!areaId) {
      return res.status(400).json({ 
        ok: false, 
        error: "areaId parameter is required" 
      });
    }

    const pool = await connectToDb();
    const request = pool.request();
    
    // Get today's date for reservation check
    const today = new Date().toISOString().split('T')[0];
    request.input("selectedDate", mssql.Date, today);
    
    // Convert areaId to number first, then to BigInt (matches VB: areaId As Long)
    const areaIdNum = parseInt(areaId, 10);
    if (isNaN(areaIdNum)) {
      return res.status(400).json({ 
        ok: false, 
        error: "Invalid areaId parameter" 
      });
    }
    request.input("areaId", mssql.BigInt, areaIdNum);
    
    // Note: StationID is optional - if needed, add it as a query parameter or env variable
    // For now, we'll query without StationID filter (matches VB when StationID is not critical)

    // Query matches VB: "SELECT TableID, TableName, TableNO, NoOfChairs FROM TableMaster WHERE AreaID = areaId AND StationID = StationID ORDER BY TableNO"
    // Note: TableMaster uses AreaId (lowercase d), AreaMaster uses AreaID (uppercase D)
    const sql = `
      SELECT 
        t.[TableID] AS id,
        t.[TableID] AS number,
        t.[TableNO] AS tableNo,
        t.[TableName] AS name,
        t.[NoOfChairs] AS capacity,
        t.[AreaId] AS areaId,
        ISNULL(a.[AreaName], 'Dining') AS area,
        CASE 
          -- First check if table has running KOT (active order) - matches VB: KOTStatus Not In ('CANCELLED','COMPLETED') And AreaID=areaId
          WHEN EXISTS (
            SELECT 1 FROM dbo.[KOTMaster] km
            WHERE km.[TableID] = t.[TableID]
            AND ISNULL(km.[BillID], 0) = 0
            AND km.[KotStatus] NOT IN ('CANCELLED', 'COMPLETED')
            AND km.[AreaID] = @areaId
          ) THEN 'Occupied'
          -- Then check for reservations - matches VB: TODAY'S BOOKED TABLES WHERE bc.Status = 'BOOKED' AND CONVERT(date, bm.BookingDate) = CONVERT(date, GETDATE()) AND bc.AreaID = areaId
          WHEN EXISTS (
            SELECT 1 FROM dbo.[BookingChild] bc
            INNER JOIN dbo.[BookingMaster] bm ON bc.[BookingID] = bm.[BookingID]
            WHERE bc.[TableID] = t.[TableID]
            AND bc.[Status] = 'BOOKED'
            AND CONVERT(date, bm.[BookingDate]) = CONVERT(date, GETDATE())
            AND bc.[AreaID] = @areaId
          ) THEN 'Reserved'
          ELSE 'Available'
        END AS status
      FROM dbo.[TableMaster] t
      LEFT JOIN dbo.[AreaMaster] a ON a.[AreaID] = t.[AreaId]
      WHERE t.[AreaId] = @areaId
      ORDER BY t.[TableNO], t.[TableID]
    `;

    try {
      const result = await request.query(sql);
      
      const tables = (result.recordset || []).map((row) => ({
        id: Number(row.id),
        number: row.tableNo || row.number || Number(row.id),
        tableNo: row.tableNo || Number(row.id),
        name: row.name || `Table ${row.tableNo || row.number || row.id}`,
        seats: Number(row.capacity || 4),
        capacity: Number(row.capacity || 4),
        areaId: row.areaId ? Number(row.areaId) : areaIdNum,
        area: row.area || 'Dining',
        status: row.status || 'Available'
      }));

      res.json({ 
        ok: true, 
        tables 
      });
    } catch (queryError) {
      // Try a simpler query without the complex CASE statements
      console.warn("[/tables/by-area/:areaId] Complex query failed, trying simple query:", queryError?.message);
      
      try {
        const simpleRequest = pool.request();
        simpleRequest.input("areaId", mssql.BigInt, areaIdNum);
        
        const simpleSql = `
          SELECT 
            t.[TableID] AS id,
            t.[TableID] AS number,
            t.[TableNO] AS tableNo,
            t.[TableName] AS name,
            t.[NoOfChairs] AS capacity,
            t.[AreaId] AS areaId,
            ISNULL(a.[AreaName], 'Dining') AS area
          FROM dbo.[TableMaster] t
          LEFT JOIN dbo.[AreaMaster] a ON a.[AreaID] = t.[AreaId]
          WHERE t.[AreaId] = @areaId
          ORDER BY t.[TableNO], t.[TableID]
        `;
        
        const simpleResult = await simpleRequest.query(simpleSql);
        const tables = (simpleResult.recordset || []).map((row) => ({
          id: Number(row.id),
          number: row.tableNo || row.number || Number(row.id),
          tableNo: row.tableNo || Number(row.id),
          name: row.name || `Table ${row.tableNo || row.number || row.id}`,
          seats: Number(row.capacity || 4),
          capacity: Number(row.capacity || 4),
          areaId: row.areaId ? Number(row.areaId) : areaIdNum,
          area: row.area || 'Dining',
          status: 'Available' // Default status if complex query fails
        }));

        res.json({ 
          ok: true, 
          tables 
        });
      } catch (simpleError) {
        // If even simple query fails, return empty array
        console.error("[/tables/by-area/:areaId] Simple query also failed:", simpleError?.message);
        console.error("[/tables/by-area/:areaId] Error details:", {
          message: simpleError?.message,
          code: simpleError?.code,
          number: simpleError?.number,
          originalError: simpleError?.originalError?.message
        });
        res.json({ 
          ok: true, 
          tables: [] 
        });
      }
    }
  } catch (e) {
    console.error("[/tables/by-area/:areaId] ERROR", e?.message || e);
    console.error("[/tables/by-area/:areaId] Stack:", e?.stack);
    console.error("[/tables/by-area/:areaId] Full error:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
    res.status(500).json({ 
      ok: false, 
      error: e?.message || "Failed to fetch tables",
      details: process.env.NODE_ENV === 'development' ? e?.stack : undefined
    });
  }
});

// POST /api/r/resolve  -> { token } => { tableId, area, lines: [...], canPay: boolean }
// Returns all unpaid orders for display, but also indicates if payment is enabled
// Payment is only enabled when:
// - KotStatus = 'HOLD' in KOTMaster (accepted by POS)
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

    let lines = q.recordset || [];
    
    // Filter out KOTs that are fully paid (check Payment table in PaymentGateway DB)
    // Even if BillID is not set, if Payment shows PaidStatus='PAID' and BalanceAmount=0, exclude them
    if (lines.length > 0) {
      try {
        const paymentPool = await connectToPaymentDb();
        
        // Get unique kotMasterIDs from the lines
        const kotMasterIDs = [...new Set(lines.map(line => 
          line.kotMasterID || line.kotMasterId || line.KotMasterID || line.KotMasterId
        ).filter(Boolean))];
        
        if (kotMasterIDs.length > 0) {
          // Check Payment table for fully paid KOTs
          // BUT: Don't filter out KOTs with item split payments (MethodID = 3)
          // because we need to show all items (paid and unpaid) for item split method
          const paidKotIds = new Set();
          const itemSplitKotIds = new Set(); // Track KOTs with item split payments
          
          for (const kotId of kotMasterIDs) {
            // CRITICAL: First check if this KOT has ANY item split payment (MethodID = 3)
            // If MethodID = 3 exists, we MUST keep all items (paid and unpaid) for display
            const itemSplitCheck = await paymentPool.request()
              .input("TransID", mssql.BigInt, Number(kotId))
              .query(`
                SELECT TOP 1 PaymentID, MethodID, PaidStatus, BalanceAmount
                FROM dbo.Payment
                WHERE TransID = @TransID
                  AND MethodID = 3
              `);
            
            if (itemSplitCheck.recordset.length > 0) {
              itemSplitKotIds.add(Number(kotId));
              console.log(`[/r/resolve] KOT ${kotId} has item split payment (MethodID=3), keeping ALL items for display regardless of payment status`);
              continue; // Skip checking for fully paid status - we ALWAYS show all items for item split
            }
            
            // For non-item-split payments (MethodID != 3), check if fully paid
            // Only filter out if it's NOT item split AND it's fully paid
            const paymentCheck = await paymentPool.request()
              .input("TransID", mssql.BigInt, Number(kotId))
              .query(`
                SELECT TOP 1 PaymentID, PaidStatus, BalanceAmount, MethodID
                FROM dbo.Payment
                WHERE TransID = @TransID
                  AND MethodID != 3
                  AND PaidStatus = 'PAID'
                  AND ISNULL(BalanceAmount, 0) = 0
              `);
            
            if (paymentCheck.recordset.length > 0) {
              paidKotIds.add(Number(kotId));
              console.log(`[/r/resolve] KOT ${kotId} is fully paid (non-item-split payment), excluding from unpaid list`);
            }
          }
          
          // Filter out lines from fully paid KOTs (but NEVER filter item split KOTs - MethodID = 3)
          if (paidKotIds.size > 0) {
            const beforeCount = lines.length;
            lines = lines.filter(line => {
              const kotId = line.kotMasterID || line.kotMasterId || line.KotMasterID || line.KotMasterId;
              const numericKotId = Number(kotId);
              
              // CRITICAL: NEVER filter out item split KOTs (MethodID = 3)
              // We need to show ALL items (paid and unpaid) for item split method
              if (itemSplitKotIds.has(numericKotId)) {
                return true; // Always keep all items for item split KOTs
              }
              
              // For non-item-split payments, filter out if fully paid
              return !paidKotIds.has(numericKotId);
            });
            console.log(`[/r/resolve] Filtered out ${beforeCount - lines.length} lines from ${paidKotIds.size} fully paid KOT(s). Kept ${itemSplitKotIds.size} item split KOT(s) with all items.`);
          } else if (itemSplitKotIds.size > 0) {
            console.log(`[/r/resolve] Found ${itemSplitKotIds.size} item split KOT(s) - keeping all items for display`);
          }
        }
      } catch (paymentErr) {
        console.error("[/r/resolve] Error checking Payment table:", paymentErr?.message || paymentErr);
        // Continue with original lines if payment check fails
      }
    }
    
    // Check if payment is enabled (only check KotStatus = 'HOLD' in KOTMaster)
    let canPay = false;
    if (lines.length > 0) {
      // Group by kotMasterID to check each KOT
      const kotGroups = {};
      lines.forEach(line => {
        const kotId = line.kotMasterID || line.kotMasterId || line.KotMasterID || line.KotMasterId;
        if (!kotGroups[kotId]) {
          kotGroups[kotId] = {
            kotStatus: line.KotStatus || ''
          };
        }
      });
      
      // Payment is enabled only if ALL KOTs have KotStatus = 'HOLD'
      canPay = Object.values(kotGroups).every(kot => {
        return kot.kotStatus.toUpperCase().trim() === 'HOLD';
      });
    }
    
    console.log(`[/r/resolve] Table ${numericTable}: Found ${lines.length} unpaid lines (after filtering paid KOTs), canPay: ${canPay}`);

    // Get table name and number from TableMaster
    let tableName = null;
    let tableNo = null;
    try {
      const tableInfoReq = pool.request()
        .input("TableID", mssql.Int, numericTable);
      const tableInfoResult = await tableInfoReq.query(`
        SELECT TOP 1 [TableName], [TableNO]
        FROM dbo.[TableMaster]
        WHERE [TableID] = @TableID
      `);
      if (tableInfoResult.recordset.length > 0) {
        tableName = tableInfoResult.recordset[0].TableName;
        tableNo = tableInfoResult.recordset[0].TableNO;
      }
    } catch (tableInfoErr) {
      console.warn("[/r/resolve] Could not fetch table info:", tableInfoErr?.message);
      // Continue without table name - not critical
    }

    res.json({ 
      ok: true, 
      tableId: String(tableId), 
      tableName: tableName || null,
      tableNo: tableNo || null,
      area, 
      lines,
      canPay // Indicates if payment buttons should be enabled
    });
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
