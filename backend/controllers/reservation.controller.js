// backend/controllers/reservation.controller.js
import util from "node:util";
import {
  createReservation,
  getReservationsByTable,
  getAllReservations,
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
 * Query params: ?status=PENDING&date=2024-01-01&tableId=5
 */
export async function getAllReservationsController(req, res) {
  try {
    const filters = {
      status: req.query?.status,
      date: req.query?.date,
      tableId: req.query?.tableId
    };
    
    const reservations = await getAllReservations(filters);
    
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
 * PATCH /api/reservation/:reservationId/status
 * Update reservation status
 * Body: { status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW" }
 */
export async function updateReservationStatusController(req, res) {
  try {
    const { reservationId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        ok: false,
        error: "Status is required"
      });
    }
    
    const result = await updateReservationStatus(reservationId, status);
    
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

