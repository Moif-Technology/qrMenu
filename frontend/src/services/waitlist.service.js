// frontend/src/services/waitlist.service.js
import { API } from "../lib/api.js";

/**
 * Create a new waitlist entry
 * @param {Object} waitlistData - Waitlist data
 * @param {string} waitlistData.guestName - Guest name
 * @param {string} waitlistData.phone - Phone number
 * @param {string} [waitlistData.email] - Email (optional)
 * @param {number} waitlistData.partySize - Party size
 * @param {number} waitlistData.waitTimeMinutes - Wait time in minutes
 * @param {Array} [waitlistData.tableIds] - Preferred table IDs (optional)
 * @param {number} [waitlistData.areaId] - Preferred area ID (optional)
 * @param {string} [waitlistData.notes] - Notes (optional)
 * @param {string} [waitlistData.specialRequests] - Special requests (optional)
 * @param {number} [waitlistData.hostessId] - Hostess ID (optional)
 * @param {string} [waitlistData.hostessName] - Hostess name (optional)
 * @returns {Promise<Object>} Created waitlist entry
 */
export async function createWaitlistEntry(waitlistData) {
  try {
    const response = await API.post("/waitlist", waitlistData);
    return response.data;
  } catch (error) {
    console.error("[Waitlist Service] Create error:", error);
    throw error;
  }
}

/**
 * Get all waitlist entries
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.status] - Filter by status (WAITING, NOTIFIED, SEATED, etc.)
 * @returns {Promise<Object>} Waitlist entries
 */
export async function getWaitlistEntries(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.status) params.append("status", filters.status);

    const queryString = params.toString();
    const url = `/waitlist${queryString ? `?${queryString}` : ""}`;
    const response = await API.get(url);
    return response.data;
  } catch (error) {
    console.error("[Waitlist Service] Get all error:", error);
    throw error;
  }
}

/**
 * Update waitlist entry status
 * @param {number|string} waitlistId - Waitlist ID
 * @param {string} status - New status (WAITING, NOTIFIED, SEATED, CANCELLED, NO-SHOW)
 * @returns {Promise<Object>} Updated waitlist entry
 */
export async function updateWaitlistStatus(waitlistId, status) {
  try {
    const response = await API.put(`/waitlist/${waitlistId}/status`, { status });
    return response.data;
  } catch (error) {
    console.error("[Waitlist Service] Update status error:", error);
    throw error;
  }
}

/**
 * Delete waitlist entry
 * @param {number|string} waitlistId - Waitlist ID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteWaitlistEntry(waitlistId) {
  try {
    const response = await API.delete(`/waitlist/${waitlistId}`);
    return response.data;
  } catch (error) {
    console.error("[Waitlist Service] Delete error:", error);
    throw error;
  }
}

