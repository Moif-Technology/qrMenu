// backend/routes/reservation.routes.js
import { Router } from "express";
import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";
import {
  getAllReservationsController,
  getReservationByIdController,
  updateReservationStatusController
} from "../controllers/reservation.controller.js";
import { getNextBookingChildIdTx, updateCustomer } from "../services/reservation.service.js";

const router = Router();
const q = (n) => `[${n}]`; // Helper to quote SQL identifiers

/**
 * GET /api/reservation/tables
 * Get available tables for reservation
 * Query params: areaId (optional) - filter tables by area
 */
router.get("/reservation/tables", async (req, res) => {
  try {
    const pool = await connectToDb();
    const { areaId, date } = req.query;
    
    // Build query with correct column names from TableMaster
    // Check for reservations (BOOKED status) for the selected date
    // AND check for running KOTs (active orders) - tables with unpaid KOTs cannot be assigned
    let sql = `
      SELECT 
        t.[TableID] AS id,
        t.[TableID] AS number,
        t.[TableNO] AS tableNo,
        t.[TableName] AS name,
        t.[NoOfChairs] AS capacity,
        t.[AreaId] AS areaId,
        ISNULL(a.[AreaName], 'Dining') AS area,
        ISNULL(a.[AreaNameArabic], '') AS areaNameArabic,
        CASE 
          -- First check if table has running KOT (active order)
          WHEN EXISTS (
            SELECT 1 FROM dbo.[KOTMaster] km
            WHERE km.[TableID] = t.[TableID]
            AND ISNULL(km.[BillID], 0) = 0
            AND ISNULL(km.[KotStatus], '') <> 'CANCELLED'
            AND ISNULL(km.[KotStatus], '') <> 'COMPLETED'
          ) THEN 'Occupied'
          -- Then check for reservations
          WHEN EXISTS (
            SELECT 1 FROM dbo.[BookingChild] bc
            INNER JOIN dbo.[BookingMaster] bm ON bc.[BookingID] = bm.[BookingID]
            WHERE bc.[TableID] = t.[TableID]
            AND bc.[Status] = 'BOOKED'
            AND CONVERT(date, bm.[BookingDate]) = @selectedDate
          ) THEN 'Reserved'
          ELSE 'Available'
        END AS status,
        -- Get KOT information for occupied tables
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM dbo.[KOTMaster] km
            WHERE km.[TableID] = t.[TableID]
            AND ISNULL(km.[BillID], 0) = 0
            AND ISNULL(km.[KotStatus], '') <> 'CANCELLED'
            AND ISNULL(km.[KotStatus], '') <> 'COMPLETED'
          ) THEN (
            SELECT TOP 1 CONCAT(ISNULL(km.[KotPrefix], ''), ISNULL(CAST(km.[KotNumber] AS VARCHAR), ''))
            FROM dbo.[KOTMaster] km
            WHERE km.[TableID] = t.[TableID]
            AND ISNULL(km.[BillID], 0) = 0
            AND ISNULL(km.[KotStatus], '') <> 'CANCELLED'
            AND ISNULL(km.[KotStatus], '') <> 'COMPLETED'
            ORDER BY km.[kotMasterID] DESC
          )
          ELSE NULL
        END AS kotNumber,
        -- Get KOT status
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM dbo.[KOTMaster] km
            WHERE km.[TableID] = t.[TableID]
            AND ISNULL(km.[BillID], 0) = 0
            AND ISNULL(km.[KotStatus], '') <> 'CANCELLED'
            AND ISNULL(km.[KotStatus], '') <> 'COMPLETED'
          ) THEN (
            SELECT TOP 1 ISNULL(km.[KotStatus], '')
            FROM dbo.[KOTMaster] km
            WHERE km.[TableID] = t.[TableID]
            AND ISNULL(km.[BillID], 0) = 0
            AND ISNULL(km.[KotStatus], '') <> 'CANCELLED'
            AND ISNULL(km.[KotStatus], '') <> 'COMPLETED'
            ORDER BY km.[kotMasterID] DESC
          )
          ELSE NULL
        END AS kotStatus
      FROM dbo.[TableMaster] t
      LEFT JOIN dbo.[AreaMaster] a ON a.[AreaID] = t.[AreaId]
      WHERE (a.[SupplyType] = 'DINE IN' OR a.[SupplyType] IS NULL)
    `;
    
    const request = pool.request();
    
    // Filter by areaId if provided
    if (areaId) {
      sql += ` AND t.[AreaId] = @areaId`;
      request.input("areaId", mssql.BigInt, parseInt(areaId));
    }

    // Add date parameter for reservation check
    if (date) {
      request.input("selectedDate", mssql.Date, date);
    } else {
      // If no date provided, use today's date
      request.input("selectedDate", mssql.Date, new Date().toISOString().split('T')[0]);
    }
    
    sql += ` ORDER BY t.[TableNO], t.[TableID]`;
    
    try {
      const result = await request.query(sql);
      const tables = result.recordset.map((row) => ({
        id: row.id,
        number: row.tableNo || row.number || row.id,
        name: row.name || `Table ${row.tableNo || row.number || row.id}`,
        capacity: row.capacity || 4,
        areaId: row.areaId,
        area: row.area || 'Dining',
        areaNameArabic: row.areaNameArabic,
        floor: (row.area || 'Dining').toLowerCase().replace(/\s+/g, '-'),
        status: row.status || 'Available',
        kotNumber: row.kotNumber || null, // KOT number if table has running order
        kotStatus: row.kotStatus || null, // KOT status if table has running order
        isOccupied: (row.status || '').toLowerCase() === 'occupied', // Helper flag
      }));

      res.json({ ok: true, tables });
    } catch (queryError) {
      // If TableMaster doesn't exist or query fails, return empty array
      console.warn("[/reservation/tables] TableMaster query failed, returning empty array:", queryError?.message);
      res.json({ ok: true, tables: [] });
    }
  } catch (e) {
    console.error("[/reservation/tables] ERROR", e?.message || e);
    // Return empty array on error so frontend can use dummy data
    res.json({ ok: true, tables: [] });
  }
});

/**
 * POST /api/reservation/check-availability
 * Check if a table is available for a specific date and time
 */
router.post("/reservation/check-availability", async (req, res) => {
  try {
    const { tableId, date, time } = req.body;
    
    if (!tableId || !date || !time) {
      return res.status(400).json({ 
        ok: false, 
        error: "tableId, date, and time are required" 
      });
    }

    // TODO: Implement actual availability check against reservations table
    // For now, return true (available)
    res.json({ ok: true, available: true });
  } catch (e) {
    console.error("[/reservation/check-availability] ERROR", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "Check failed" });
  }
});

/**
 * POST /api/reservation/create
 * Create a new reservation
 * Body: {
 *   tableId: number | number[], // Single table ID or array of table IDs
 *   areaId?: number,
 *   date: string, // YYYY-MM-DD
 *   time: string, // HH:mm
 *   name: string,
 *   email?: string,
 *   phone: string,
 *   guests: number,
 *   specialRequests?: string,
 *   tags?: string, // Comma-separated
 *   hostessId?: number,
 *   hostessName?: string,
 *   isWalkIn?: boolean
 * }
 */
router.post("/reservation/create", async (req, res) => {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    console.log(`[RESERVATION][${reqId}] POST ${req.originalUrl}`, {
      body: {
        tableIds: req.body.tableIds,
        tableId: req.body.tableId,
        areaId: req.body.areaId,
        section: req.body.section,
        date: req.body.date || req.body.reservationDate,
        time: req.body.time || req.body.reservationTime,
        name: req.body.name || req.body.firstName,
        phone: req.body.phone,
        email: req.body.email,
        guests: req.body.guests || req.body.cover,
        hasTags: !!req.body.tags,
        hasHostess: !!req.body.hostessId
      }
    });

    const { createReservation } = await import("../services/reservation.service.js");
    
    // Transform frontend data to backend format
    // Frontend sends tableIds (plural), service now accepts both tableId and tableIds
    const reservationData = {
      tableIds: req.body.tableIds !== undefined ? req.body.tableIds : req.body.tableId, // Prefer tableIds from frontend
      tableId: req.body.tableId || req.body.tableIds, // Also pass as tableId for backward compatibility
      areaId: req.body.areaId || req.body.section || null,
      date: req.body.date || req.body.reservationDate,
      time: req.body.time || req.body.reservationTime,
      name: req.body.name || req.body.firstName || req.body.guestName,
      email: req.body.email || req.body.guestEmail || '',
      phone: req.body.phone || req.body.guestPhone,
      guests: req.body.guests || req.body.cover || req.body.partySize || 1,
      specialRequests: req.body.specialRequests || req.body.comments || req.body.notes || '',
      tags: Array.isArray(req.body.tags) ? req.body.tags.join(',') : (req.body.tags || ''),
      hostessId: req.body.hostessId || null,
      hostessName: req.body.hostessName || null,
      isWalkIn: req.body.isWalkIn || false,
      bookingSource: req.body.bookingSource || "ONLINE",
      initialStatus: req.body.initialStatus || null // Pass initial status for walk-ins
    };

    console.log(`[RESERVATION][${reqId}] Transformed data:`, {
      tableIds: reservationData.tableIds,
      tableId: reservationData.tableId,
      tableIdsType: typeof reservationData.tableIds,
      tableIdType: typeof reservationData.tableId,
      tableIdsIsArray: Array.isArray(reservationData.tableIds),
      tableIdIsArray: Array.isArray(reservationData.tableId),
      date: reservationData.date,
      time: reservationData.time,
      name: reservationData.name,
      phone: reservationData.phone,
      guests: reservationData.guests,
      guestsType: typeof reservationData.guests
    });
    
    // Validate required fields before calling service
    // TableId is now OPTIONAL - can be assigned later when guest arrives
    // This allows creating reservations without table assignment
    const isGuestReservation = reservationData.bookingSource === "GUEST_ONLINE";
    
    // No validation for tableId - it's optional for all reservations
    // Tables can be assigned later when changing status to ARRIVED/SEATED
    if (!reservationData.date) {
      return res.status(400).json({
        ok: false,
        error: "Missing required field: date"
      });
    }
    if (!reservationData.time) {
      return res.status(400).json({
        ok: false,
        error: "Missing required field: time"
      });
    }
    if (!reservationData.name || reservationData.name.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: "Missing required field: name"
      });
    }
    // Phone is optional - some guests prefer not to share
    
    // Validate guests - convert to number and check
    if (reservationData.guests == null || reservationData.guests === '') {
      return res.status(400).json({
        ok: false,
        error: "Missing required field: guests"
      });
    }
    
    const guestsNum = parseInt(reservationData.guests);
    if (isNaN(guestsNum) || guestsNum < 1) {
      return res.status(400).json({
        ok: false,
        error: `Invalid field: guests (must be at least 1, got: ${reservationData.guests})`
      });
    }
    reservationData.guests = guestsNum; // Ensure it's a number
    
    const result = await createReservation(reservationData);
    
    console.log(`[RESERVATION][${reqId}] Success:`, {
      bookingID: result.bookingID,
      customerID: result.customerID
    });
    
    res.json({ 
      ok: true, 
      reservationId: result.bookingID,
      bookingID: result.bookingID,
      bookingChildIDs: result.bookingChildIDs,
      customerID: result.customerID,
      confirmationCode: result.confirmationCode,
      message: result.message || "Reservation created successfully" 
    });
  } catch (e) {
    console.error(`[RESERVATION][${reqId}] ERROR:`, {
      message: e?.message,
      stack: e?.stack,
      originalError: e?.originalError,
      number: e?.number,
      state: e?.state,
      class: e?.class
    });
    
    // Extract SQL error message if available
    let errorMessage = e?.message || "Reservation failed";
    if (e?.originalError?.info?.message) {
      errorMessage = e.originalError.info.message;
    } else if (e?.precedingErrors?.[0]?.message) {
      errorMessage = e.precedingErrors[0].message;
    }
    
    const statusCode = errorMessage.toLowerCase().includes("missing required") || 
                      errorMessage.toLowerCase().includes("invalid") ||
                      errorMessage.toLowerCase().includes("required") ? 400 : 500;
    
    res.status(statusCode).json({ 
      ok: false, 
      error: errorMessage,
      debug: process.env.NODE_ENV !== 'production' ? {
        message: e?.message,
        number: e?.number,
        state: e?.state
      } : undefined
    });
  }
});

/**
 * POST /api/reservation/guest
 * Create a guest reservation (online booking without table assignment)
 * Body: {
 *   name: string (required),
 *   phone: string (required),
 *   email?: string (optional),
 *   date: string (required, YYYY-MM-DD),
 *   time: string (required, HH:mm),
 *   guests: number (required),
 *   areaId: number (required),
 *   tags?: string (optional, occasion tag like "Birthday", "Anniversary"),
 *   specialRequests?: string (optional)
 * }
 */
router.post("/reservation/guest", async (req, res) => {
  const reqId = `GUEST-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    console.log(`[GUEST RESERVATION][${reqId}] POST ${req.originalUrl}`, req.body);

    const { createGuestReservation } = await import("../services/reservation.service.js");
    
    // Validate required fields
    const { name, phone, email, date, time, guests, areaId, tags, specialRequests } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: "Missing required field: name"
      });
    }
    // Phone is optional - some guests prefer not to share
    
    if (!date) {
      return res.status(400).json({
        ok: false,
        error: "Missing required field: date"
      });
    }
    
    if (!time) {
      return res.status(400).json({
        ok: false,
        error: "Missing required field: time"
      });
    }
    
    if (!areaId) {
      return res.status(400).json({
        ok: false,
        error: "Missing required field: areaId"
      });
    }
    
    const guestsNum = parseInt(guests);
    if (isNaN(guestsNum) || guestsNum < 1) {
      return res.status(400).json({
        ok: false,
        error: `Invalid field: guests (must be at least 1, got: ${guests})`
      });
    }
    
    const areaIdNum = parseInt(areaId);
    if (isNaN(areaIdNum)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid field: areaId (must be a number, got: ${areaId})`
      });
    }
    
    // Prepare guest data
    const guestData = {
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : null,
      date,
      time,
      guests: guestsNum,
      areaId: areaIdNum,
      tags: tags || null,
      specialRequests: specialRequests || null
    };
    
    const result = await createGuestReservation(guestData);
    
    console.log(`[GUEST RESERVATION][${reqId}] Success:`, {
      bookingID: result.bookingID,
      customerID: result.customerID,
      status: result.status
    });
    
    // SMS is now handled inside reservation.service.js (Message Central)
    
    res.json({ 
      ok: true, 
      reservationId: result.bookingID,
      bookingID: result.bookingID,
      customerID: result.customerID,
      confirmationCode: result.confirmationCode,
      status: result.status,
      message: result.message || "Guest reservation created successfully" 
    });
  } catch (e) {
    console.error(`[GUEST RESERVATION][${reqId}] ERROR:`, {
      message: e?.message,
      stack: e?.stack
    });
    
    const errorMessage = e?.message || "Guest reservation failed";
    const statusCode = errorMessage.toLowerCase().includes("missing") || 
                      errorMessage.toLowerCase().includes("invalid") ||
                      errorMessage.toLowerCase().includes("required") ? 400 : 500;
    
    res.status(statusCode).json({ 
      ok: false, 
      error: errorMessage,
      debug: process.env.NODE_ENV !== 'production' ? {
        message: e?.message,
        stack: e?.stack
      } : undefined
    });
  }
});

/**
 * GET /api/reservation/time-slots
 * Get available time slots for a specific date
 */
router.get("/reservation/time-slots", async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ 
        ok: false, 
        error: "Date parameter is required" 
      });
    }

    // Generate time slots from 7:00 AM to 3:00 AM (next day) - every 30 minutes
    const slots = [];
    
    // First part: 7:00 AM to 11:30 PM (same day)
    for (let hour = 7; hour <= 23; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        slots.push(timeStr);
      }
    }
    
    // Second part: 12:00 AM (midnight) to 3:00 AM (next day)
    for (let hour = 0; hour <= 3; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        // Skip 3:30 AM since we only go up to 3:00 AM
        if (hour === 3 && minute > 0) break;
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        slots.push(timeStr);
      }
    }

    res.json({ ok: true, timeSlots: slots });
  } catch (e) {
    console.error("[/reservation/time-slots] ERROR", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "Failed to get time slots" });
  }
});

/**
 * GET /api/reservation/area-layout/:areaId
 * Get area layout data including border points, shapes, and table positions
 */
router.get("/reservation/area-layout/:areaId", async (req, res) => {
  try {
    console.log("[RESERVATION][AREA-LAYOUT] Request received:", {
      areaId: req.params.areaId,
      url: req.originalUrl,
      method: req.method
    });
    
    const pool = await connectToDb();
    const { areaId } = req.params;
    
    if (!areaId) {
      return res.status(400).json({ ok: false, error: "areaId is required" });
    }

    const request = pool.request();
    request.input("areaId", mssql.BigInt, parseInt(areaId));

    // Fetch border points
    const borderSql = `
      SELECT 
        [SequenceNo],
        [PosXPercent],
        [PosYPercent]
      FROM dbo.[AreaFloorBorderPoint]
      WHERE [AreaID] = @areaId
      ORDER BY [SequenceNo]
    `;

    // Fetch floor shapes
    const shapesSql = `
      SELECT 
        [ShapeType],
        [PosXPercent],
        [PosYPercent],
        [WidthPercent],
        [HeightPercent],
        [BackColorArgb],
        [BorderColorArgb],
        [DisplayText],
        [FontSize]
      FROM dbo.[AreaFloorShape]
      WHERE [AreaID] = @areaId
    `;

    // Fetch table layouts
    const layoutSql = `
      SELECT 
        t.[TableID],
        t.[TableName],
        t.[TableNO],
        t.[NoOfChairs],
        ISNULL(l.[PosXPercent], 0) AS PosXPercent,
        ISNULL(l.[PosYPercent], 0) AS PosYPercent,
        l.[WidthPercent],
        l.[HeightPercent],
        l.[RotationDeg]
      FROM dbo.[TableMaster] t
      LEFT JOIN dbo.[AreaTableLayout] l ON l.[TableID] = t.[TableID] AND l.[AreaID] = @areaId
      WHERE t.[AreaId] = @areaId
      ORDER BY t.[TableNO]
    `;

    // Check for active KOTs (occupied tables) - only unpaid KOTs
    const kotSql = `
      SELECT DISTINCT
        km.[TableID],
        km.[KotPrefix],
        km.[KotNumber],
        km.[KotStatus],
        km.[kotMasterID],
        km.[CrOn] AS KotCreatedOn
      FROM dbo.[KOTMaster] km
      WHERE km.[AreaID] = @areaId
        AND ISNULL(km.[BillID], 0) = 0
        AND km.[KotStatus] NOT IN ('CANCELLED', 'COMPLETED')
    `;

    // Check for reserved tables (bookings for today)
    const reservedSql = `
      SELECT DISTINCT bc.[TableID]
      FROM dbo.[BookingChild] bc
      INNER JOIN dbo.[BookingMaster] bm ON TRY_CAST(bc.[BookingID] AS BIGINT) = bm.[BookingID]
      WHERE bc.[Status] = 'BOOKED'
        AND CONVERT(date, bm.[BookingDate]) = CONVERT(date, GETDATE())
        AND TRY_CAST(bc.[AreaID] AS BIGINT) = @areaId
    `;

    try {
      const [borderResult, shapesResult, layoutResult, kotResult, reservedResult] = await Promise.all([
        request.query(borderSql),
        request.query(shapesSql),
        request.query(layoutSql),
        request.query(kotSql),
        request.query(reservedSql)
      ]);

      const borderPoints = borderResult.recordset.map(row => ({
        sequenceNo: row.SequenceNo,
        posXPercent: parseFloat(row.PosXPercent),
        posYPercent: parseFloat(row.PosYPercent)
      }));

      const shapes = shapesResult.recordset.map(row => ({
        shapeType: row.ShapeType,
        posXPercent: parseFloat(row.PosXPercent),
        posYPercent: parseFloat(row.PosYPercent),
        widthPercent: parseFloat(row.WidthPercent),
        heightPercent: parseFloat(row.HeightPercent),
        backColorArgb: row.BackColorArgb,
        borderColorArgb: row.BorderColorArgb,
        displayText: row.DisplayText,
        fontSize: row.FontSize ? parseFloat(row.FontSize) : null
      }));

      const tables = layoutResult.recordset.map(row => ({
        tableId: row.TableID,
        tableName: row.TableName,
        tableNo: row.TableNO,
        capacity: row.NoOfChairs,
        posXPercent: parseFloat(row.PosXPercent || 0),
        posYPercent: parseFloat(row.PosYPercent || 0),
        widthPercent: row.WidthPercent ? parseFloat(row.WidthPercent) : null,
        heightPercent: row.HeightPercent ? parseFloat(row.HeightPercent) : null,
        rotationDeg: row.RotationDeg
      }));

      const occupiedTableIds = new Set(kotResult.recordset.map(row => row.TableID));
      const reservedTableIds = new Set(reservedResult.recordset.map(row => row.TableID));
      
      // Create a map of table ID to KOT info for quick lookup
      const kotInfoMap = new Map();
      kotResult.recordset.forEach(row => {
        if (!kotInfoMap.has(row.TableID)) {
          kotInfoMap.set(row.TableID, {
            kotNumber: `${row.KotPrefix || ''}${row.KotNumber || ''}`.trim() || null,
            kotStatus: row.KotStatus || null,
            kotMasterID: row.kotMasterID || null,
            kotCreatedOn: row.KotCreatedOn || null,
          });
        }
      });

      // Mark table states and add KOT information
      tables.forEach(table => {
        if (occupiedTableIds.has(table.tableId)) {
          table.state = 'occupied';
          const kotInfo = kotInfoMap.get(table.tableId);
          if (kotInfo) {
            table.kotNumber = kotInfo.kotNumber;
            table.kotStatus = kotInfo.kotStatus;
            table.kotMasterID = kotInfo.kotMasterID;
            table.kotCreatedOn = kotInfo.kotCreatedOn;
          }
        } else if (reservedTableIds.has(table.tableId)) {
          table.state = 'reserved';
        } else {
          table.state = 'available';
        }
      });

      const hasLayout = borderPoints.length > 0 || shapes.length > 0 || 
                       tables.some(t => t.posXPercent > 0 || t.posYPercent > 0);

      res.json({
        ok: true,
        hasLayout,
        borderPoints,
        shapes,
        tables
      });
    } catch (queryError) {
      console.warn("[/reservation/area-layout] Query error (returning empty layout):", queryError?.message);
      // Return empty layout instead of error - frontend will use fallback
      res.json({
        ok: true,
        hasLayout: false,
        borderPoints: [],
        shapes: [],
        tables: []
      });
    }
  } catch (e) {
    console.error("[/reservation/area-layout] ERROR", e?.message || e);
    // Return empty layout on error instead of 500 - allows frontend to use fallback
    res.json({
      ok: true,
      hasLayout: false,
      borderPoints: [],
      shapes: [],
      tables: []
    });
  }
});

/**
 * GET /api/reservation
 * Get all reservations with optional filters (status, date, tableId, fromDate, toDate)
 * Supports both single date (current day) and date range queries
 * Query params:
 *   - date=2024-01-01 (single date - defaults to today if not provided)
 *   - fromDate=2024-01-01&toDate=2024-01-31 (date range)
 *   - status=PENDING (optional, comma-separated for multiple)
 *   - tableId=5 (optional)
 */
router.get("/reservation", getAllReservationsController);

/**
 * GET /api/reservation/list
 * Get reservations for a specific date
 * Query params: date (YYYY-MM-DD format) - required
 */
router.get("/reservation/list", async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ 
        ok: false, 
        error: "Date parameter is required (YYYY-MM-DD format)" 
      });
    }

    const pool = await connectToDb();
    const request = pool.request();
    request.input("selectedDate", mssql.Date, date);

    const sql = `
      SELECT 
        bm.[BookingID],
        bm.[BookingDate],
        bm.[EnteredDate],
        bm.[CustomerID],
        bm.[AdavncePayment],
        bm.[BookingStatus],
        bm.[PartySize],
        bm.[BookingSource],
        bm.[StationID],
        bc.[BookingChildID],
        bc.[TableID],
        bc.[AreaID],
        bc.[Status] AS ChildStatus,
        cm.[CustomerName],
        cm.[MobileNo],
        cm.[Email],
        t.[TableNO],
        t.[TableName],
        a.[AreaName],
        a.[AreaNameArabic]
      FROM dbo.[BookingMaster] bm
      INNER JOIN dbo.[BookingChild] bc ON TRY_CAST(bc.[BookingID] AS BIGINT) = bm.[BookingID]
      LEFT JOIN dbo.[CustomerMaster] cm ON cm.[CustomerID] = TRY_CAST(bm.[CustomerID] AS BIGINT)
      LEFT JOIN dbo.[TableMaster] t ON CAST(t.[TableID] AS NVARCHAR(200)) = LTRIM(RTRIM(LEFT(bc.[TableID], CHARINDEX(',', bc.[TableID] + ',') - 1)))
      LEFT JOIN dbo.[AreaMaster] a ON a.[AreaID] = TRY_CAST(bc.[AreaID] AS BIGINT)
      WHERE CONVERT(date, bm.[BookingDate]) = @selectedDate
        AND bc.[Status] = 'BOOKED'
      ORDER BY bm.[BookingDate], bc.[TableID]
    `;

    const result = await request.query(sql);
    
    // Group reservations by BookingID
    const reservationsMap = new Map();
    
    result.recordset.forEach((row) => {
      const bookingID = row.BookingID;
      
      if (!reservationsMap.has(bookingID)) {
        reservationsMap.set(bookingID, {
          bookingID: bookingID,
          bookingDate: row.BookingDate,
          enteredDate: row.EnteredDate,
          customerID: row.CustomerID,
          customerName: row.CustomerName || "Guest",
          customerPhone: row.MobileNo || "",
          customerEmail: row.Email || "",
          advancePayment: parseFloat(row.AdavncePayment || 0),
          bookingStatus: row.BookingStatus,
          partySize: row.PartySize,
          bookingSource: row.BookingSource,
          stationID: row.StationID,
          tables: []
        });
      }
      
      const reservation = reservationsMap.get(bookingID);
      reservation.tables.push({
        bookingChildID: row.BookingChildID,
        tableID: row.TableID,
        tableNo: row.TableNO,
        tableName: row.TableName,
        areaID: row.AreaID,
        areaName: row.AreaName || "Dining",
        areaNameArabic: row.AreaNameArabic || "",
        status: row.ChildStatus
      });
    });

    const reservations = Array.from(reservationsMap.values());

    res.json({ 
      ok: true, 
      date,
      reservations,
      count: reservations.length
    });
  } catch (e) {
    console.error("[/reservation/list] ERROR", e?.message || e);
    res.status(500).json({ 
      ok: false, 
      error: e?.message || "Failed to fetch reservations" 
    });
  }
});

/**
 * PUT /api/reservation/update/:bookingId
 * Update an existing reservation
 */
router.put("/reservation/update/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { date, time, guests, name, phone, email, specialRequests, tags, hostessId, hostessName, tableIds, areaId, status, customerId } = req.body;
    
    if (!bookingId) {
      return res.status(400).json({ 
        ok: false, 
        error: "Booking ID is required" 
      });
    }

    const pool = await connectToDb();
    const tx = new mssql.Transaction(pool);
    
    try {
      await tx.begin();

      // If user selected an existing customer and changed name/phone/email, update that customer in CustomerMaster
      const resolvedCustomerId = customerId != null && customerId !== "" ? parseInt(customerId, 10) : null;
      if (resolvedCustomerId && !isNaN(resolvedCustomerId) && (name != null || phone != null || email != null)) {
        await updateCustomer(resolvedCustomerId, { name, phone, email }, tx);
      }

      const request = new mssql.Request(tx);
    request.input("BookingID", mssql.BigInt, parseInt(bookingId));
      
      // Check which columns exist
      const checkColumnsReq = new mssql.Request(tx);
      const columnsResult = await checkColumnsReq.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'BookingMaster'
      `);
      const existingColumns = new Set(columnsResult.recordset.map(row => row.COLUMN_NAME));
    
    // Build update query dynamically based on provided fields
    const updates = [];
      
    if (date && time) {
      const bookingDateTime = new Date(`${date}T${time}`);
      if (!isNaN(bookingDateTime.getTime())) {
        request.input("BookingDate", mssql.DateTime, bookingDateTime);
        updates.push(`${q("BookingDate")} = @BookingDate`);
      }
    }
      
    if (guests) {
      request.input("PartySize", mssql.Int, parseInt(guests));
      updates.push(`${q("PartySize")} = @PartySize`);
    }
      
      // Update guest info if columns exist
      if (existingColumns.has('GuestName') && name) {
        request.input("GuestName", mssql.VarChar(150), name.trim());
        updates.push(`${q("GuestName")} = @GuestName`);
      }
      
      if (existingColumns.has('GuestPhone') && phone !== undefined) {
        request.input("GuestPhone", mssql.VarChar(20), (phone && phone.trim()) || null);
        updates.push(`${q("GuestPhone")} = @GuestPhone`);
      }
      
      if (existingColumns.has('GuestEmail') && email !== undefined) {
        request.input("GuestEmail", mssql.VarChar(150), email ? email.trim() : null);
        updates.push(`${q("GuestEmail")} = @GuestEmail`);
      }
      
      if (existingColumns.has('ReservationTime') && time) {
        try {
          const timeParts = time.split(':');
          if (timeParts.length >= 2) {
            const hours = parseInt(timeParts[0]);
            const minutes = parseInt(timeParts[1]);
            if (!isNaN(hours) && !isNaN(minutes)) {
              const timeDate = new Date();
              timeDate.setHours(hours, minutes, 0, 0);
              request.input("ReservationTime", mssql.Time, timeDate);
              updates.push(`${q("ReservationTime")} = @ReservationTime`);
            }
          }
        } catch (timeError) {
          console.warn("[RESERVATION] Error parsing ReservationTime:", timeError);
        }
      }
      
      if (existingColumns.has('SpecialRequests') && specialRequests !== undefined) {
        request.input("SpecialRequests", mssql.NVarChar(500), specialRequests ? specialRequests.trim() : null);
        updates.push(`${q("SpecialRequests")} = @SpecialRequests`);
      }
      
      if (existingColumns.has('Tags') && tags !== undefined) {
        request.input("Tags", mssql.VarChar(500), tags ? (Array.isArray(tags) ? tags.join(',') : tags) : null);
        updates.push(`${q("Tags")} = @Tags`);
      }
      
      if (existingColumns.has('HostessID') && hostessId !== undefined) {
        request.input("HostessID", mssql.BigInt, hostessId ? parseInt(hostessId) : null);
        updates.push(`${q("HostessID")} = @HostessID`);
      }
      
      if (existingColumns.has('HostessName') && hostessName !== undefined) {
        request.input("HostessName", mssql.VarChar(100), hostessName ? hostessName.trim() : null);
        updates.push(`${q("HostessName")} = @HostessName`);
      }
      
      // Update status if provided
      if (status) {
        const validStatuses = ['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED', 'CANCELLED', 'NO_SHOW', 'BOOKED', 'CHECKED_IN', 'LEFT'];
        const statusUpper = status.toUpperCase();
        if (validStatuses.includes(statusUpper)) {
          // Update BookingMaster status
          request.input("BookingStatus", mssql.VarChar(50), statusUpper);
          updates.push(`${q("BookingStatus")} = @BookingStatus`);
          
          // Also update BookingChild status
          const updateChildReq = new mssql.Request(tx);
          updateChildReq.input("BookingID", mssql.BigInt, parseInt(bookingId));
          updateChildReq.input("Status", mssql.VarChar(50), statusUpper);
          await updateChildReq.query(`
            UPDATE ${q("BookingChild")}
            SET ${q("Status")} = @Status
            WHERE ${q("BookingID")} = @BookingID
          `);
        }
      }
    
    if (updates.length === 0) {
        await tx.rollback();
      return res.status(400).json({ 
        ok: false, 
        error: "No valid fields to update" 
      });
    }
    
      // Update BookingMaster
    const updateSql = `
      UPDATE ${q("BookingMaster")}
      SET ${updates.join(", ")}
      WHERE ${q("BookingID")} = @BookingID
    `;
    
    await request.query(updateSql);
      
      // Update tables if provided (run when tableIds is present; resolve areaId from first table if missing)
      if (tableIds != null && (Array.isArray(tableIds) ? tableIds.length > 0 : true)) {
        const tableIdsArray = Array.isArray(tableIds) ? tableIds : [tableIds];
        const validTableIds = tableIdsArray.map((id) => parseInt(id)).filter((id) => !isNaN(id) && id > 0);
        if (validTableIds.length > 0) {
          let resolvedAreaId = parseInt(areaId) || 0;
          if (!resolvedAreaId && validTableIds[0]) {
            const areaReq = new mssql.Request(tx);
            areaReq.input("tableId", mssql.BigInt, validTableIds[0]);
            const areaResult = await areaReq.query(`
              SELECT TOP 1 [AreaId] AS AreaID FROM dbo.[TableMaster] WHERE [TableID] = @tableId
            `);
            if (areaResult.recordset.length > 0) {
              resolvedAreaId = parseInt(areaResult.recordset[0].AreaID) || 0;
            }
          }

          // Delete existing BookingChild records
          const deleteChildReq = new mssql.Request(tx);
          deleteChildReq.input("BookingID", mssql.BigInt, parseInt(bookingId));
          await deleteChildReq.query(`DELETE FROM ${q("BookingChild")} WHERE ${q("BookingID")} = @BookingID`);

          // Insert ONE BookingChild with TableID = comma-separated (e.g. "66,67")
          const tableIdsStr = validTableIds.join(",");
          const bookingChildID = await getNextBookingChildIdTx(tx);
          const insertChildReq = new mssql.Request(tx);
          insertChildReq.input("BookingChildID", mssql.BigInt, bookingChildID);
          insertChildReq.input("BookingID", mssql.BigInt, parseInt(bookingId));
          insertChildReq.input("TableID", mssql.NVarChar(200), tableIdsStr);
          insertChildReq.input("AreaID", mssql.BigInt, resolvedAreaId);
          insertChildReq.input("Status", mssql.VarChar(50), "BOOKED");
          insertChildReq.input("Notes", mssql.NVarChar(500), null);
          insertChildReq.input("SeatedTime", mssql.DateTime, null);
          insertChildReq.input("VacatedTime", mssql.DateTime, null);
          insertChildReq.input("CreatedOn", mssql.DateTime, new Date());
          insertChildReq.input("ModifiedOn", mssql.DateTime, null);

          await insertChildReq.query(`
            INSERT INTO ${q("BookingChild")} (
              ${q("BookingChildID")}, ${q("BookingID")}, ${q("TableID")},
              ${q("AreaID")}, ${q("Status")}, ${q("Notes")},
              ${q("SeatedTime")}, ${q("VacatedTime")}, ${q("CreatedOn")}, ${q("ModifiedOn")}
            )
            VALUES (
              @BookingChildID, @BookingID, @TableID,
              @AreaID, @Status, @Notes,
              @SeatedTime, @VacatedTime, @CreatedOn, @ModifiedOn
            )
          `);
        }
      }
      
      await tx.commit();
    
    res.json({ 
      ok: true, 
      message: "Reservation updated successfully",
      bookingID: parseInt(bookingId)
    });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (e) {
    console.error("[/reservation/update] ERROR", e?.message || e);
    res.status(500).json({ 
      ok: false, 
      error: e?.message || "Failed to update reservation" 
    });
  }
});

/**
 * PUT /api/reservation/cancel/:bookingId
 * Cancel an existing reservation
 */
router.put("/reservation/cancel/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    if (!bookingId) {
      return res.status(400).json({ 
        ok: false, 
        error: "Booking ID is required" 
      });
    }

    const pool = await connectToDb();
    const request = pool.request();
    request.input("BookingID", mssql.BigInt, parseInt(bookingId));
    
    // Update BookingMaster status to CANCELLED
    const updateMasterSql = `
      UPDATE dbo.[BookingMaster]
      SET ${q("BookingStatus")} = 'CANCELLED'
      WHERE ${q("BookingID")} = @BookingID
    `;
    
    // Update BookingChild status to CANCELLED
    const updateChildSql = `
      UPDATE dbo.[BookingChild]
      SET ${q("Status")} = 'CANCELLED'
      WHERE ${q("BookingID")} = @BookingID
    `;
    
    await request.query(updateMasterSql);
    await request.query(updateChildSql);
    
    res.json({ 
      ok: true, 
      message: "Reservation cancelled successfully",
      bookingID: parseInt(bookingId)
    });
  } catch (e) {
    console.error("[/reservation/cancel] ERROR", e?.message || e);
    res.status(500).json({ 
      ok: false, 
      error: e?.message || "Failed to cancel reservation" 
    });
  }
});

/**
 * PUT /api/reservation/checkin/:bookingId
 * Check in a reservation (mark as checked in)
 */
router.put("/reservation/checkin/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    if (!bookingId) {
      return res.status(400).json({ 
        ok: false, 
        error: "Booking ID is required" 
      });
    }

    const pool = await connectToDb();
    const request = pool.request();
    request.input("BookingID", mssql.BigInt, parseInt(bookingId));
    
    // Update BookingMaster status to CHECKED_IN
    const updateMasterSql = `
      UPDATE dbo.[BookingMaster]
      SET ${q("BookingStatus")} = 'CHECKED_IN'
      WHERE ${q("BookingID")} = @BookingID
    `;
    
    // Update BookingChild status to CHECKED_IN
    const updateChildSql = `
      UPDATE dbo.[BookingChild]
      SET ${q("Status")} = 'CHECKED_IN'
      WHERE ${q("BookingID")} = @BookingID
    `;
    
    await request.query(updateMasterSql);
    await request.query(updateChildSql);
    
    res.json({ 
      ok: true, 
      message: "Reservation checked in successfully",
      bookingID: parseInt(bookingId)
    });
  } catch (e) {
    console.error("[/reservation/checkin] ERROR", e?.message || e);
    res.status(500).json({ 
      ok: false, 
      error: e?.message || "Failed to check in reservation" 
    });
  }
});

/**
 * PUT /api/reservation/update-status/:bookingId
 * Update reservation status
 * Body: { status: "BOOKED" | "CONFIRMED" | "LEFT_MESSAGE" | "ARRIVED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW" }
 */
router.put("/reservation/update-status/:bookingId", updateReservationStatusController);

/**
 * GET /api/reservation/:bookingId
 * Get a specific reservation by ID
 */
router.get("/reservation/:bookingId", getReservationByIdController);

/**
 * GET /api/reservation/customers/search
 * Search customers from CustomerMaster table for autocomplete
 * Query params: q (search query) - searches in CustomerName and MobileNo
 */
router.get("/reservation/customers/search", async (req, res) => {
  try {
    const pool = await connectToDb();
    const { q: searchQuery } = req.query;
    
    // If no search query, return all customers with visit count (limit 200)
    if (!searchQuery || searchQuery.trim().length === 0) {
      const result = await pool.request().query(`
        SELECT TOP 200
          cm.[CustomerID] AS id,
          cm.[CustomerName] AS name,
          cm.[MobileNo] AS phone,
          cm.[Email] AS email,
          cm.[CrOn] AS createdDate,
          (SELECT COUNT(*) FROM dbo.[BookingMaster] WHERE [CustomerID] = cm.[CustomerID]) AS visitCount,
          (SELECT MAX([BookingDate]) FROM dbo.[BookingMaster] WHERE [CustomerID] = cm.[CustomerID]) AS lastVisit
        FROM dbo.[CustomerMaster] cm
        WHERE cm.[CustomerName] IS NOT NULL 
          AND cm.[CustomerName] <> ''
          AND cm.[CustomerName] <> '0'
          AND cm.[MobileNo] IS NOT NULL
          AND cm.[MobileNo] <> ''
          AND cm.[MobileNo] <> '0'
        ORDER BY cm.[CrOn] DESC
      `);
      
      return res.json({
        ok: true,
        customers: result.recordset || []
      });
    }
    
    // Search customers by name or phone
    const query = `%${searchQuery.trim()}%`;
    const result = await pool.request()
      .input('searchQuery', mssql.NVarChar, query)
      .query(`
        SELECT TOP 50
          cm.[CustomerID] AS id,
          cm.[CustomerName] AS name,
          cm.[MobileNo] AS phone,
          cm.[Email] AS email,
          cm.[CrOn] AS createdDate,
          (SELECT COUNT(*) FROM dbo.[BookingMaster] WHERE [CustomerID] = cm.[CustomerID]) AS visitCount,
          (SELECT MAX([BookingDate]) FROM dbo.[BookingMaster] WHERE [CustomerID] = cm.[CustomerID]) AS lastVisit
        FROM dbo.[CustomerMaster] cm
        WHERE (
          cm.[CustomerName] LIKE @searchQuery 
          OR cm.[MobileNo] LIKE @searchQuery
        )
        AND cm.[CustomerName] IS NOT NULL 
        AND cm.[CustomerName] <> ''
        AND cm.[CustomerName] <> '0'
        AND cm.[MobileNo] IS NOT NULL
        AND cm.[MobileNo] <> ''
        AND cm.[MobileNo] <> '0'
        ORDER BY cm.[CrOn] DESC
      `);
    
    res.json({
      ok: true,
      customers: result.recordset || []
    });
  } catch (error) {
    console.error("[CUSTOMER_SEARCH] Error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to search customers",
      customers: []
    });
  }
});

/**
 * PUT /api/reservation/customers/:customerId
 * Update customer information
 * Body: { name, phone, email }
 */
router.put("/reservation/customers/:customerId", async (req, res) => {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const customerId = req.params.customerId;
  const { name, phone, email } = req.body;
  
  console.log(`[CUSTOMER_UPDATE][${reqId}] PUT /api/reservation/customers/${customerId}`, { name, phone, email });
  
  try {
    if (!name || !phone) {
      return res.status(400).json({
        ok: false,
        error: "Name and phone are required"
      });
    }
    
    const pool = await connectToDb();
    const request = pool.request();
    
    request.input('customerId', mssql.BigInt, parseInt(customerId));
    request.input('name', mssql.NVarChar(100), name.trim());
    request.input('phone', mssql.VarChar(20), phone.trim());
    request.input('email', mssql.VarChar(100), email ? email.trim() : null);
    request.input('modBy', mssql.VarChar(50), 'SYSTEM');
    
    const updateQuery = `
      UPDATE dbo.[CustomerMaster]
      SET 
        [CustomerName] = @name,
        [MobileNo] = @phone,
        [Email] = @email,
        [ModBy] = @modBy,
        [ModOn] = GETDATE()
      WHERE [CustomerID] = @customerId
    `;
    
    const result = await request.query(updateQuery);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        ok: false,
        error: "Customer not found"
      });
    }
    
    console.log(`[CUSTOMER_UPDATE][${reqId}] Customer updated successfully`);
    
    res.json({
      ok: true,
      message: "Customer updated successfully",
      customer: {
        id: parseInt(customerId),
        name,
        phone,
        email
      }
    });
  } catch (error) {
    console.error(`[CUSTOMER_UPDATE][${reqId}] Error:`, error);
    res.status(500).json({
      ok: false,
      error: "Failed to update customer"
    });
  }
});

export default router;

