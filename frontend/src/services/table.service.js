import { API } from "../lib/api";

/**
 * GET /api/tables/by-area/:areaId
 * Get all tables for a specific area
 * @param {number|string} areaId - The area ID
 * @returns {Promise<Array>} Array of table objects
 */
export async function getTablesByArea(areaId) {
  if (!areaId) {
    throw new Error("areaId is required");
  }

  try {
    const { data } = await API.get(`/tables/by-area/${encodeURIComponent(areaId)}`);
    
    if (!data || !data.ok) {
      throw new Error(data?.error || "Failed to fetch tables");
    }
    
    return data.tables || [];
  } catch (error) {
    console.error("[TABLE] Failed to fetch tables by area:", error);
    throw error;
  }
}

