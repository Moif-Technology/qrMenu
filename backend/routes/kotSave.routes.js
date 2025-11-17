// backend/routes/pos.routes.js
import { Router } from "express";
import { createKot } from "../controllers/kotSave.controller.js";

const router = Router();

// POST /api/pos/kot  (base path shown below in index.js)
router.post("/kot", createKot);

export default router;
