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
  updatePackageItemGroupLabelController,
  createPackageController,
  updatePackageDetailsController,
  uploadPackageImageController,
  setPackageVisibilityController,
} from "../controllers/package.controller.js";
import { adminOnlyForWrites } from "../middleware/adminAuth.middleware.js";

const router = express.Router();

// Every write below this line requires an admin JWT. The GET routes stay public
// because the diner app reads them (MenuPage, PackageDetailsPage). Previously
// the "admin - for management" comment was the only thing marking them.
router.use(adminOnlyForWrites);

// GET routes (public - for customer viewing)
router.get("/headers/:qrSubgroupId", getPackageHeadersController);
router.get("/:packageProductId/contents", getPackageContentsController);
router.get("/:packageProductId/details", getPackageDetailsController);

// POST routes (admin - for management)
router.post("/create", createPackageController);
router.post("/:packageProductId/update", updatePackageDetailsController);
router.post("/:packageProductId/image", uploadPackageImageController);
router.post("/:packageProductId/visibility", setPackageVisibilityController);
router.post("/mark-header", markAsPackageHeaderController);
router.post("/add-product", addProductToPackageController);
router.post("/remove-product", removeProductFromPackageController);
router.post("/update-order", updatePackageItemOrderController);
router.post("/update-item-group", updatePackageItemGroupLabelController);

export default router;

