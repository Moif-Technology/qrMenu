// backend/routes/menu.routes.js
import { Router } from "express";
import { getGroups, getItems, getAreas, getProductImages, getSingleImage, getSingleImageBinary, getImageMappingEndpoint } from "../controllers/menu.controller.js";

const router = Router();

// Route-level logging middleware
router.use((req, res, next) => {
  console.log(`[ROUTE][MENU] ${req.method} ${req.path} - Route handler called`);
  next();
});

router.get("/group", getGroups);
router.get("/items", getItems);
router.get("/areas", getAreas);
router.post("/images", getProductImages);
router.get("/image/:productId", getSingleImage);
router.get("/image/:productId/binary", getSingleImageBinary); // Fast binary endpoint
router.get("/images/mapping", getImageMappingEndpoint);

export default router;
