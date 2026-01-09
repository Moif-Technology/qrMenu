// backend/services/floorLayout.service.js
import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";

const q = (n) => `[${n}]`;

/**
 * Get floor layout for a specific area
 * Returns: tables, shapes, borderPoints
 * @param {number} areaId - The area ID
 * @param {number} [stationId] - Optional StationID (matches VB code StationID filter)
 * @returns {Promise<Object>} Floor layout data
 */
export async function getFloorLayoutByArea(areaId, stationId = null) {
  if (!areaId) {
    throw new Error("areaId is required");
  }
  
  const pool = await connectToDb();
  const req = pool.request();
  
  // Convert areaId to BigInt to match database type
  const areaIdBigInt = BigInt(Number(areaId));
  req.input("AreaID", mssql.BigInt, areaIdBigInt);
  
  // Add StationID filter if provided (matches VB code: WHERE ... AND StationID = @StationID)
  if (stationId != null) {
    const stationIdBigInt = BigInt(Number(stationId));
    req.input("StationID", mssql.BigInt, stationIdBigInt);
  }
  
  try {
    // Get border points first (matches VB code order)
    const borderPointsSql = `
      SELECT 
        ${q("SequenceNo")},
        ${q("PosXPercent")},
        ${q("PosYPercent")}
      FROM dbo.${q("AreaFloorBorderPoint")}
      WHERE ${q("AreaID")} = @AreaID
        ${stationId != null ? `AND ${q("StationID")} = @StationID` : ''}
      ORDER BY ${q("SequenceNo")} ASC
    `;
    
    let borderPoints = [];
    try {
      const borderPointsResult = await req.query(borderPointsSql);
      borderPoints = (borderPointsResult.recordset || []).map(row => ({
        sequenceNo: Number(row.SequenceNo),
        x: Number(row.PosXPercent),
        y: Number(row.PosYPercent)
      }));
    } catch (err) {
      console.warn("[FLOOR_LAYOUT] Error loading border points:", err?.message);
      // Continue without border points
    }
    
    // Get floor shapes (walls, sections, labels)
    const shapesSql = `
      SELECT 
        ${q("ShapeType")},
        ${q("PosXPercent")},
        ${q("PosYPercent")},
        ${q("WidthPercent")},
        ${q("HeightPercent")},
        ${q("BackColorArgb")},
        ${q("BorderColorArgb")},
        ${q("DisplayText")},
        ${q("FontSize")}
      FROM dbo.${q("AreaFloorShape")}
      WHERE ${q("AreaID")} = @AreaID
        ${stationId != null ? `AND ${q("StationID")} = @StationID` : ''}
    `;
    
    let shapes = [];
    try {
      const shapesResult = await req.query(shapesSql);
      shapes = (shapesResult.recordset || []).map(row => ({
        shapeType: String(row.ShapeType || ''),
        position: {
          x: Number(row.PosXPercent || 0),
          y: Number(row.PosYPercent || 0),
          width: Number(row.WidthPercent || 0),
          height: Number(row.HeightPercent || 0)
        },
        style: {
          backgroundColor: row.BackColorArgb != null ? row.BackColorArgb : null,
          borderColor: row.BorderColorArgb != null ? row.BorderColorArgb : null,
          text: row.DisplayText != null ? String(row.DisplayText) : null,
          fontSize: row.FontSize != null ? Number(row.FontSize) : null
        }
      }));
    } catch (err) {
      console.warn("[FLOOR_LAYOUT] Error loading shapes:", err?.message);
      // Continue without shapes
    }
    
    // Get ALL tables from TableMaster for this area, with layout positions if available
    // Matches VB: LoadTables - gets tables from TableMaster, then joins with AreaTableLayout for positions
    const tablesSql = `
      SELECT 
        tm.${q("TableID")},
        tm.${q("TableNO")} AS TableNo,
        tm.${q("TableName")},
        tm.${q("NoOfChairs")} AS Seats,
        atl.${q("PosXPercent")},
        atl.${q("PosYPercent")},
        atl.${q("WidthPercent")},
        atl.${q("HeightPercent")},
        atl.${q("RotationDeg")}
      FROM dbo.${q("TableMaster")} tm
      LEFT JOIN dbo.${q("AreaTableLayout")} atl 
        ON atl.${q("TableID")} = tm.${q("TableID")} 
        AND atl.${q("AreaID")} = @AreaID
        ${stationId != null ? `AND atl.${q("StationID")} = @StationID` : ''}
      WHERE tm.${q("AreaId")} = @AreaID
        ${stationId != null ? `AND tm.${q("StationID")} = @StationID` : ''}
      ORDER BY tm.${q("TableNO")}, tm.${q("TableID")}
    `;
    
    let tables = [];
    try {
      const tablesResult = await req.query(tablesSql);
      tables = (tablesResult.recordset || []).map(row => ({
        tableId: Number(row.TableID),
        tableNo: row.TableNo != null ? String(row.TableNo) : String(row.TableID),
        tableName: row.TableName != null ? String(row.TableName) : `Table ${row.TableID}`,
        seats: Number(row.Seats || 4),
        // Position from AreaTableLayout if available, otherwise null (will use grid fallback)
        position: row.PosXPercent != null ? {
          x: Number(row.PosXPercent),
          y: Number(row.PosYPercent),
          width: Number(row.WidthPercent || 5),
          height: Number(row.HeightPercent || 5),
          rotation: row.RotationDeg != null ? Number(row.RotationDeg) : 0
        } : null // null means no layout - will use grid fallback in frontend
      }));
    } catch (err) {
      console.warn("[FLOOR_LAYOUT] Error loading tables:", err?.message);
      // Continue without tables
    }

    // Get active KOTs for tables (matches VB: LoadTables - Active KOTs for color)
    let activeKots = {};
    try {
      const kotsSql = `
        SELECT 
          ${q("kotMasterID")},
          ${q("TableID")},
          ${q("ChairNo")},
          ${q("KotPrefix")},
          ${q("KotNumber")}
        FROM dbo.${q("KOTMaster")}
        WHERE ${q("KOTStatus")} NOT IN ('CANCELLED', 'COMPLETED')
          AND ${q("AreaID")} = @AreaID
        ORDER BY ${q("TableID")}, ${q("ChairNo")}
      `;
      const kotsResult = await req.query(kotsSql);
      (kotsResult.recordset || []).forEach(row => {
        const tableId = Number(row.TableID);
        if (!activeKots[tableId]) {
          activeKots[tableId] = {
            kotMasterID: Number(row.kotMasterID),
            kotPrefix: String(row.KotPrefix || ''),
            kotNumber: Number(row.KotNumber || 0)
          };
        }
      });
    } catch (err) {
      console.warn("[FLOOR_LAYOUT] Error loading KOTs:", err?.message);
    }

    // Get today's booked tables (matches VB: TODAY'S BOOKED TABLES (RESERVED))
    let bookedTables = new Set();
    try {
      const bookedSql = `
        SELECT DISTINCT bc.${q("TableID")}
        FROM dbo.${q("BookingChild")} bc
        INNER JOIN dbo.${q("BookingMaster")} bm ON bc.${q("BookingID")} = bm.${q("BookingID")}
        WHERE bc.${q("Status")} = 'BOOKED'
          AND CONVERT(date, bm.${q("BookingDate")}) = CONVERT(date, GETDATE())
          AND bc.${q("AreaID")} = @AreaID
      `;
      const bookedResult = await req.query(bookedSql);
      (bookedResult.recordset || []).forEach(row => {
        if (row.TableID != null) {
          bookedTables.add(Number(row.TableID));
        }
      });
    } catch (err) {
      console.warn("[FLOOR_LAYOUT] Error loading booked tables:", err?.message);
    }

    // Add status to tables (matches VB: TableState logic)
    tables = tables.map(table => {
      const hasActiveKot = activeKots[table.tableId];
      const isReserved = bookedTables.has(table.tableId);
      
      let status = 'Available'; // Vacant
      let kotInfo = null;
      
      if (hasActiveKot) {
        status = 'Occupied'; // RED - has active KOT
        kotInfo = {
          kotMasterID: hasActiveKot.kotMasterID,
          kotPrefix: hasActiveKot.kotPrefix,
          kotNumber: hasActiveKot.kotNumber,
          displayText: `${table.tableName}\n${hasActiveKot.kotPrefix}${hasActiveKot.kotNumber}`
        };
      } else if (isReserved) {
        status = 'Reserved'; // YELLOW - booked but no KOT yet
      }
      
      return {
        ...table,
        status,
        kotInfo
      };
    });
    
    return {
      areaId: Number(areaId),
      tables,
      shapes,
      borderPoints
    };
  } catch (error) {
    console.error("[FLOOR_LAYOUT] Error fetching floor layout:", error);
    console.error("[FLOOR_LAYOUT] Error details:", {
      message: error?.message,
      code: error?.code,
      number: error?.number,
      originalError: error?.originalError?.message
    });
    throw error;
  }
}

/**
 * Get floor layout for all areas
 * @returns {Promise<Object>} Floor layout data by area
 */
export async function getAllFloorLayouts() {
  const pool = await connectToDb();
  
  try {
    // Get all areas
    const areasSql = `
      SELECT 
        ${q("AreaID")} AS areaId,
        ${q("AreaName")} AS areaName
      FROM dbo.${q("AreaMaster")}
      WHERE ${q("SupplyType")} = 'Dining'
      ORDER BY ${q("AreaName")} ASC
    `;
    
    const areasResult = await pool.request().query(areasSql);
    const areas = areasResult.recordset || [];
    
    // Get layouts for each area
    const layouts = {};
    for (const area of areas) {
      try {
        layouts[area.areaId] = await getFloorLayoutByArea(area.areaId);
      } catch (err) {
        console.warn(`[FLOOR_LAYOUT] Failed to load layout for area ${area.areaId}:`, err?.message);
        layouts[area.areaId] = {
          areaId: Number(area.areaId),
          tables: [],
          shapes: [],
          borderPoints: []
        };
      }
    }
    
    return layouts;
  } catch (error) {
    console.error("[FLOOR_LAYOUT] Error fetching all floor layouts:", error);
    throw error;
  }
}

