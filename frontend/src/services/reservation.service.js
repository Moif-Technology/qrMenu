// frontend/src/services/reservation.service.js
import { API } from "../lib/api.js";

/**
 * Create a new reservation
 * @param {Object} reservationData - Reservation data
 * @param {number|Array} reservationData.tableIds - Table ID(s) - can be single or array
 * @param {number} [reservationData.areaId] - Area ID (optional)
 * @param {string} reservationData.name - Customer name
 * @param {string} reservationData.phone - Customer phone
 * @param {string} [reservationData.email] - Customer email (optional)
 * @param {string} reservationData.date - Reservation date (YYYY-MM-DD)
 * @param {string} reservationData.time - Reservation time (HH:mm format)
 * @param {number} reservationData.guests - Number of guests
 * @param {string} [reservationData.specialRequests] - Special requests (optional)
 * @param {string} [reservationData.tags] - Comma-separated tags (optional)
 * @param {number} [reservationData.hostessId] - Hostess ID (optional)
 * @param {string} [reservationData.hostessName] - Hostess name (optional)
 * @returns {Promise<Object>} Created reservation
 */
export async function createReservation(reservationData) {
  try {
    const response = await API.post("/reservation/create", reservationData);
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Create error:", error);
    console.error("[Reservation Service] Error response:", error?.response?.data);
    console.error("[Reservation Service] Error message:", error?.response?.data?.error || error?.message);
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
 * Supports both single date and date range queries
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.status] - Filter by status (PENDING, CONFIRMED, CANCELLED, etc.)
 * @param {string} [filters.date] - Filter by single date (YYYY-MM-DD) - for current day query
 * @param {string} [filters.fromDate] - Start date for date range query (YYYY-MM-DD)
 * @param {string} [filters.toDate] - End date for date range query (YYYY-MM-DD)
 * @param {number|string} [filters.tableId] - Filter by table ID
 * @returns {Promise<Object>} All reservations matching filters
 */
export async function getAllReservations(filters = {}) {
  try {
    const params = new URLSearchParams();
    
    // Support both single date and date range
    if (filters.fromDate && filters.toDate) {
      // Date range query
      params.append("fromDate", filters.fromDate);
      params.append("toDate", filters.toDate);
    } else if (filters.date) {
      // Single date query
      params.append("date", filters.date);
    }
    
    if (filters.status) params.append("status", filters.status);
    if (filters.tableId) params.append("tableId", filters.tableId);
    
    // Add cache-busting timestamp to ensure fresh data (same as getReservationById)
    const timestamp = Date.now();
    params.append("_t", timestamp);

    const queryString = params.toString();
    const url = `/reservation?${queryString}`;
    const response = await API.get(url);
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Get all error:", error);
    throw error;
  }
}

/**
 * Update reservation status
 * @param {number|string} reservationId - Reservation ID (BookingID)
 * @param {string} status - New status (CONFIRMED, CANCELLED, ARRIVED, SEATED, NO_SHOW, etc.)
 * @returns {Promise<Object>} Updated reservation
 */
export async function updateReservationStatus(reservationId, status) {
  try {
    const response = await API.put(`/reservation/update-status/${reservationId}`, { status });
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Update status error:", error);
    console.error("[Reservation Service] Error response:", error?.response?.data);
    throw error;
  }
}

/**
 * Update an existing reservation
 * @param {number|string} bookingId - Booking ID
 * @param {Object} reservationData - Updated reservation data
 * @returns {Promise<Object>} Updated reservation
 */
export async function updateReservation(bookingId, reservationData) {
  try {
    const response = await API.put(`/reservation/update/${bookingId}`, reservationData);
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Update error:", error);
    console.error("[Reservation Service] Error response:", error?.response?.data);
    throw error;
  }
}

/**
 * Get a single reservation by ID
 * @param {number|string} bookingId - Booking ID
 * @returns {Promise<Object>} Reservation details
 */
export async function getReservationById(bookingId) {
  try {
    // Add cache-busting timestamp to ensure fresh data
    const timestamp = Date.now();
    const response = await API.get(`/reservation/${bookingId}?t=${timestamp}`);
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Get by ID error:", error);
    throw error;
  }
}

/**
 * Create a guest reservation (without table selection)
 * Guest fills out form, restaurant assigns table later
 * @param {Object} guestData - Guest reservation data
 * @param {string} guestData.guestName - Guest name
 * @param {string} guestData.phone - Guest phone
 * @param {string} [guestData.email] - Guest email (optional)
 * @param {string} guestData.reservationDate - Reservation date (YYYY-MM-DD)
 * @param {string} guestData.reservationTime - Reservation time (HH:mm format)
 * @param {number} guestData.partySize - Number of guests
 * @param {number} guestData.areaId - Preferred dining area ID
 * @param {string} [guestData.occasion] - Occasion tag (birthday, anniversary, etc.)
 * @param {string} [guestData.specialRequests] - Special requests (optional)
 * @returns {Promise<Object>} Created reservation
 */
export async function createGuestReservation(guestData) {
  try {
    // Transform guest data to match backend API format for dedicated guest endpoint
    const reservationData = {
      name: guestData.guestName,
      phone: guestData.phone,
      email: guestData.email || null,
      date: guestData.reservationDate,
      time: guestData.reservationTime,
      guests: parseInt(guestData.partySize),
      areaId: parseInt(guestData.areaId),
      tags: guestData.occasion || null,
      specialRequests: guestData.specialRequests || null
    };
    const response = await API.post("/reservation/guest", reservationData);
    return response.data;
  } catch (error) {
    console.error("[Guest Reservation Service] Create error:", error);
    console.error("[Guest Reservation Service] Error response:", error?.response?.data);
    
    // Extract meaningful error message
    const errorMessage = error?.response?.data?.error || error?.message || "Failed to create reservation";
    throw new Error(errorMessage);
  }
}

/**
 * Search customers from CustomerMaster table for autocomplete
 * @param {string} [searchQuery] - Optional search query to filter customers
 * @returns {Promise<Object>} Object with customers array containing { id, name, phone, email }
 */
export async function searchCustomers(searchQuery = '', options = {}) {
  try {
    const {
      page,
      pageSize,
      sort
    } = options;
    const params = new URLSearchParams();
    if (searchQuery && searchQuery.trim()) {
      params.append('q', searchQuery.trim());
    }
    if (page) params.append('page', page);
    if (pageSize) params.append('pageSize', pageSize);
    if (sort) params.append('sort', sort);
    
    const queryString = params.toString();
    const url = `/reservation/customers/search${queryString ? `?${queryString}` : ''}`;
    
    const response = await API.get(url);
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Search customers error:", error);
    return { ok: false, customers: [], error: error.message };
  }
}

/**
 * Get customer history for autocomplete (loads recent customers)
 * @returns {Promise<Object>} Object with customers array containing { id, name, phone, email }
 */
export async function getCustomerHistory() {
  try {
    // Call search endpoint without query to get recent customers
    return await searchCustomers('', { page: 1, pageSize: 50, sort: 'recent' });
  } catch (error) {
    console.error("[Reservation Service] Get customer history error:", error);
    return { ok: false, customers: [], error: error.message };
  }
}

/**
 * Update customer information
 * @param {number|string} customerId - Customer ID
 * @param {Object} customerData - Customer data to update
 * @param {string} customerData.name - Customer name
 * @param {string} customerData.phone - Customer phone
 * @param {string} [customerData.email] - Customer email (optional)
 * @returns {Promise<Object>} Updated customer
 */
export async function updateCustomer(customerId, customerData) {
  try {
    const response = await API.put(`/reservation/customers/${customerId}`, customerData);
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Update customer error:", error);
    console.error("[Reservation Service] Error response:", error?.response?.data);
    throw error;
  }
}

/**
 * Create a basic customer
 * @param {Object} customerData
 * @param {string} customerData.name
 * @param {string} customerData.phone
 * @param {string} [customerData.email]
 * @returns {Promise<Object>} Created customer
 */
export async function createCustomer(customerData) {
  try {
    const response = await API.post("/reservation/customers", customerData);
    return response.data;
  } catch (error) {
    console.error("[Reservation Service] Create customer error:", error);
    console.error("[Reservation Service] Error response:", error?.response?.data);
    throw error;
  }
}

