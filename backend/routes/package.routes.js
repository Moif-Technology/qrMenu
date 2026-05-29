// backend/routes/package.routes.js
import express from "express";
import {
  getPackageHeadersController,
  getPackageContentsController,
  getPackageDetailsController,
  markAsPackageHeaderController,
  addProductToPackageController,
  removeProductFromPackageController,
  updatePackageItemOrderController,
  createPackageController,
  uploadPackageImageController,
} from "../controllers/package.controller.js";

const router = express.Router();

// GET routes (public - for customer viewing)
router.get("/headers/:qrSubgroupId", getPackageHeadersController);
router.get("/:packageProductId/contents", getPackageContentsController);
router.get("/:packageProductId/details", getPackageDetailsController);

// POST routes (admin - for management)
router.post("/create", createPackageController);
router.post("/:packageProductId/image", uploadPackageImageController);
router.post("/mark-header", markAsPackageHeaderController);
router.post("/add-product", addProductToPackageController);
router.post("/remove-product", removeProductFromPackageController);
router.post("/update-order", updatePackageItemOrderController);

export default router;

