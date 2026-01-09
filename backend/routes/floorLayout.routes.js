// backend/routes/floorLayout.routes.js
import { Router } from "express";
import { getFloorLayoutByAreaController, getAllFloorLayoutsController } from "../controllers/floorLayout.controller.js";

const router = Router();

// GET /api/floor-layout/area/:areaId
router.get("/area/:areaId", getFloorLayoutByAreaController);

// GET /api/floor-layout/all
router.get("/all", getAllFloorLayoutsController);

export default router;

