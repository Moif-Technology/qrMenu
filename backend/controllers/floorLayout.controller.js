// backend/controllers/floorLayout.controller.js
import { getFloorLayoutByArea, getAllFloorLayouts } from "../services/floorLayout.service.js";

/**
 * GET /api/floor-layout/area/:areaId
 * Get floor layout for a specific area
 */
export async function getFloorLayoutByAreaController(req, res, next) {
  try {
    const { areaId } = req.params;
    
    if (!areaId) {
      return res.status(400).json({
        ok: false,
        error: "areaId parameter is required"
      });
    }
    
    const layout = await getFloorLayoutByArea(areaId);
    
    res.json({
      ok: true,
      layout
    });
  } catch (error) {
    console.error("[FLOOR_LAYOUT][CONTROLLER] Error:", error?.message || error);
    next(error);
  }
}

/**
 * GET /api/floor-layout/all
 * Get floor layouts for all areas
 */
export async function getAllFloorLayoutsController(req, res, next) {
  try {
    const layouts = await getAllFloorLayouts();
    
    res.json({
      ok: true,
      layouts
    });
  } catch (error) {
    console.error("[FLOOR_LAYOUT][CONTROLLER] Error:", error?.message || error);
    next(error);
  }
}

