// frontend/src/services/reservation.service.js
import { API } from "../lib/api.js";

/**
 * Create a new reservation
 * @param {Object} reservationData - Reservation data
 * @param {number|string} reservationData.tableId - Table ID
 * @param {number} [reservationData.areaId] - Area ID (optional)
 * @param {string} reservationData.customerName - Customer name
 * @param {string} reservationData.customerPhone - Customer phone
 * @param {string} [reservationData.customerEmail] - Customer email (optional)
 * @param {string} reservationData.reservationDate - Reservation date (ISO format or YYYY-MM-DD)
 * @param {string} reservationData.reservationTime - Reservation time (HH:mm format)
 * @param {number} reservationData.numberOfGuests - Number of guests
 * @param {string} [reservationData.specialRequests] - Special requests (optional)
 * @returns {Promise<Object>} Created reservation
 */
export async function createReservation(reservationData) {
  try {
    const response = await API.post("/reservation", reservationData);
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Create error:", error);
    throw error;
  }
}

/**
 * Get reservations for a specific table
 * @param {number|string} tableId - Table ID
 * @returns {Promise<Object>} Reservations for the table
 */
export async function getReservationsByTable(tableId) {
  try {
    const response = await API.get(`/reservation/table/${tableId}`);
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Get by table error:", error);
    throw error;
  }
}

/**
 * Get all reservations with optional filters
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.status] - Filter by status (PENDING, CONFIRMED, CANCELLED, etc.)
 * @param {string} [filters.date] - Filter by date (YYYY-MM-DD)
 * @param {number|string} [filters.tableId] - Filter by table ID
 * @returns {Promise<Object>} All reservations matching filters
 */
export async function getAllReservations(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.status) params.append("status", filters.status);
    if (filters.date) params.append("date", filters.date);
    if (filters.tableId) params.append("tableId", filters.tableId);

    const queryString = params.toString();
    const url = `/reservation${queryString ? `?${queryString}` : ""}`;
    const response = await API.get(url);
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Get all error:", error);
    throw error;
  }
}

/**
 * Update reservation status
 * @param {number|string} reservationId - Reservation ID
 * @param {string} status - New status (CONFIRMED, CANCELLED, COMPLETED, NO_SHOW)
 * @returns {Promise<Object>} Updated reservation
 */
export async function updateReservationStatus(reservationId, status) {
  try {
    const response = await API.patch(`/reservation/${reservationId}/status`, { status });
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Update status error:", error);
    throw error;
  }
}

