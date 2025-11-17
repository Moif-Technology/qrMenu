// backend/routes/menu.routes.js
import { Router } from "express";
import { getGroups, getItems } from "../controllers/menu.controller.js";

const router = Router();

router.get("/group", getGroups);
router.get("/items", getItems);

export default router;
