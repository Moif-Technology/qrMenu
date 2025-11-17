// backend/routes/modifier.routes.js
import { Router } from "express";
import { getModifiers } from "../controllers/modifier.controller.js";

const router = Router();

// GET /api/modifiers -> returns ALL rows as-is
router.get("/", getModifiers);

export default router;
