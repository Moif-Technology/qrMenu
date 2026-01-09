// frontend/src/services/floorLayout.service.js
import { API } from "../lib/api";

/**
 * GET /api/floor-layout/area/:areaId
 * Get floor layout for a specific area
 * @param {number|string} areaId - The area ID
 * @returns {Promise<Object>} Floor layout data with tables, shapes, borderPoints
 */
export async function getFloorLayoutByArea(areaId) {
  if (!areaId) {
    throw new Error("areaId is required");
  }

  try {
    const { data } = await API.get(`/floor-layout/area/${encodeURIComponent(areaId)}`);
    
    if (!data || !data.ok) {
      throw new Error(data?.error || "Failed to fetch floor layout");
    }
    
    return data.layout || {
      areaId: Number(areaId),
      tables: [],
      shapes: [],
      borderPoints: []
    };
  } catch (error) {
    console.error("[FLOOR_LAYOUT] Failed to fetch floor layout by area:", error);
    throw error;
  }
}

/**
 * GET /api/floor-layout/all
 * Get floor layouts for all areas
 * @returns {Promise<Object>} Floor layouts by area ID
 */
export async function getAllFloorLayouts() {
  try {
    const { data } = await API.get("/floor-layout/all");
    
    if (!data || !data.ok) {
      throw new Error(data?.error || "Failed to fetch floor layouts");
    }
    
    return data.layouts || {};
  } catch (error) {
    console.error("[FLOOR_LAYOUT] Failed to fetch all floor layouts:", error);
    throw error;
  }
}

