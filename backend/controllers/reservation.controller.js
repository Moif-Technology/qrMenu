// backend/controllers/reservation.controller.js
import util from "node:util";
import {
  createReservation,
  getReservationsByTable,
  getAllReservations,
  getReservationsByDate,
  getReservationsByDateRange,
  getReservationById,
  updateReservationStatus
} from "../services/reservation.service.js";

const isProd = process.env.NODE_ENV === "production";

// Pull useful info out of mssql/tedious errors
function unwrapSqlError(err) {
  const info = err?.originalError?.info || err?.info || {};
  const preceding = Array.isArray(err?.precedingErrors)
    ? err.precedingErrors.map(e => e?.message || String(e))
    : undefined;

  return {
    name: err?.name,
    message:
      info?.message ||
      err?.message ||
      "Reservation operation failed",
    code: err?.code || info?.code,
    number: info?.number,
    state: info?.state,
    class: info?.class,
    lineNumber: info?.lineNumber,
    serverName: info?.serverName,
    procName: info?.procName,
    stack: err?.stack,
    precedingErrors: preceding
  };
}

/**
 * POST /api/reservation
 * Create a new reservation
 */
export async function createReservationController(req, res) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  
  console.log(`[RESERVATION][${reqId}] POST ${req.originalUrl} payload:`, {
    tableId: req.body?.tableId,
    customerName: req.body?.customerName,
    customerPhone: req.body?.customerPhone,
    reservationDate: req.body?.reservationDate,
    reservationTime: req.body?.reservationTime,
    numberOfGuests: req.body?.numberOfGuests
  });

  try {
    const result = await createReservation(req.body);
    console.log(`[RESERVATION][${reqId}] OK:`, result);
    return res.status(201).json(result);
  } catch (err) {
    const diag = unwrapSqlError(err);
    console.error(`[RESERVATION][${reqId}] ERROR:`, util.inspect(diag, { depth: null, colors: true }));

    const msg = String(diag.message || "").toLowerCase();
    const code = (msg.includes("required") || msg.includes("invalid") || msg.includes("valid")) ? 400 : 500;

    return res.status(code).json({
      ok: false,
      error: diag.message || "Reservation creation failed",
      debug: isProd ? undefined : diag
    });
  }
}

/**
 * GET /api/reservation/table/:tableId
 * Get reservations for a specific table
 */
export async function getReservationsByTableController(req, res) {
  try {
    const { tableId } = req.params;
    const reservations = await getReservationsByTable(tableId);
    
    return res.json({
      ok: true,
      tableId,
      reservations
    });
  } catch (err) {
    const diag = unwrapSqlError(err);
    console.error("[RESERVATION] GET by table ERROR:", diag.message || err);
    
    const msg = String(diag.message || "").toLowerCase();
    const code = (msg.includes("required") || msg.includes("invalid") || msg.includes("valid")) ? 400 : 500;

    return res.status(code).json({
      ok: false,
      error: diag.message || "Failed to get reservations",
      debug: isProd ? undefined : diag
    });
  }
}

/**
 * GET /api/reservation
 * Get all reservations (with optional query filters)
 * Query params: 
 *   - date=2024-01-01 (single date - current day)
 *   - fromDate=2024-01-01&toDate=2024-01-31 (date range)
 *   - status=PENDING (optional)
 *   - tableId=5 (optional)
 */
export async function getAllReservationsController(req, res) {
  try {
    const { status, date, fromDate, toDate, tableId } = req.query;
    
    const filters = {
      status,
      date,
      fromDate,
      toDate,
      tableId: tableId ? parseInt(tableId) : undefined
    };
    
    // Log cancelled filter request
    if (status && status.toUpperCase() === 'CANCELLED') {
      console.log("[BACKEND][CANCELLED FILTER] Request received:", {
        status,
        date,
        fromDate,
        toDate,
        tableId,
        url: req.originalUrl,
        timestamp: new Date().toISOString()
      });
    }
    
    const reservations = await getAllReservations(filters);
    
    // Log cancelled filter response
    if (status && status.toUpperCase() === 'CANCELLED') {
      console.log("[BACKEND][CANCELLED FILTER] Response data:", {
        totalCount: reservations.length,
        first5Items: reservations.slice(0, 5).map(r => ({
          bookingID: r.bookingID,
          customerName: r.customerName,
          reservationDate: r.reservationDate,
          reservationTime: r.reservationTime,
          status: r.status,
          bookingStatus: r.bookingStatus
        })),
        allStatuses: reservations.map(r => r.status || r.bookingStatus),
        timestamp: new Date().toISOString()
      });
    }
    
    return res.json({
      ok: true,
      reservations,
      count: reservations.length
    });
  } catch (err) {
    const diag = unwrapSqlError(err);
    console.error("[RESERVATION] GET all ERROR:", diag.message || err);
    
    return res.status(500).json({
      ok: false,
      error: diag.message || "Failed to get reservations",
      debug: isProd ? undefined : diag
    });
  }
}

/**
 * GET /api/reservation/:bookingId
 * Get a single reservation by booking ID
 */
export async function getReservationByIdController(req, res) {
  try {
    const { bookingId } = req.params;
    
    if (!bookingId) {
      return res.status(400).json({
        ok: false,
        error: "Booking ID is required"
      });
    }
    
    const reservation = await getReservationById(bookingId);
    
    if (!reservation) {
      return res.status(404).json({
        ok: false,
        error: "Reservation not found"
      });
    }
    
    return res.json({
      ok: true,
      reservation
    });
  } catch (err) {
    const diag = unwrapSqlError(err);
    console.error("[RESERVATION] GET by ID ERROR:", diag.message || err);
    
    const msg = String(diag.message || "").toLowerCase();
    const code = msg.includes("required") || msg.includes("not found") ? 400 : 500;
    
    return res.status(code).json({
      ok: false,
      error: diag.message || "Failed to get reservation",
      debug: isProd ? undefined : diag
    });
  }
}

/**
 * PUT /api/reservation/update-status/:bookingId
 * Update reservation status
 * Body: { status: "BOOKED" | "CONFIRMED" | "CANCELLED" | "ARRIVED" | "SEATED" | "NO_SHOW" | etc. }
 */
export async function updateReservationStatusController(req, res) {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;
    
    if (!bookingId) {
      return res.status(400).json({
        ok: false,
        error: "Booking ID is required"
      });
    }
    
    if (!status) {
      return res.status(400).json({
        ok: false,
        error: "Status is required"
      });
    }
    
    const result = await updateReservationStatus(bookingId, status);
    
    return res.json(result);
  } catch (err) {
    const diag = unwrapSqlError(err);
    console.error("[RESERVATION] UPDATE status ERROR:", diag.message || err);
    
    const msg = String(diag.message || "").toLowerCase();
    const code = (msg.includes("required") || msg.includes("invalid") || msg.includes("not found")) ? 400 : 500;

    return res.status(code).json({
      ok: false,
      error: diag.message || "Failed to update reservation status",
      debug: isProd ? undefined : diag
    });
  }
}

