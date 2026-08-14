// backend/routes/qrMenu.routes.js
import { Router } from "express";
import {
  getAllProducts,
  createMainGroup,
  getMainGroups,
  updateMainGroup,
  deleteMainGroup,
  createGroup,
  getGroups,
  updateGroup,
  deleteGroup,
  createSubgroup,
  getSubgroups,
  updateSubgroup,
  deleteSubgroup,
  addProduct,
  getProducts,
  updateProduct,
  removeProduct,
  getQrCategories,
  getQrMenuItemsController,
} from "../controllers/qrMenu.controller.js";
import { adminOnlyForWrites } from "../middleware/adminAuth.middleware.js";

const router = Router();

// Route-level logging middleware
router.use((req, res, next) => {
  console.log(`[ROUTE][QR-MENU] ${req.method} ${req.path} - Route handler called`);
  next();
});

// Every write below this line requires an admin JWT. GET stays public because
// /categories and /menu-items serve the diner app. Must stay above the routes.
router.use(adminOnlyForWrites);

// Products from ProductMaster
router.get("/products/all", getAllProducts);

// QR Main Groups
router.post("/main-groups", createMainGroup);
router.get("/main-groups", getMainGroups);
router.put("/main-groups/:qrMainGroupId", updateMainGroup);
router.delete("/main-groups/:qrMainGroupId", deleteMainGroup);

// QR Groups
router.post("/groups", createGroup);
router.get("/groups", getGroups);
router.put("/groups/:qrGroupId", updateGroup);
router.delete("/groups/:qrGroupId", deleteGroup);

// QR Subgroups
router.post("/subgroups", createSubgroup);
router.get("/subgroups", getSubgroups);
router.put("/subgroups/:qrSubgroupId", updateSubgroup);
router.delete("/subgroups/:qrSubgroupId", deleteSubgroup);

// QR Products
router.post("/products", addProduct);
router.get("/products", getProducts);
router.put("/products/:productId", updateProduct);
router.delete("/products/:productId", removeProduct);

// QR Menu for Frontend (Categories and Items)
router.get("/categories", getQrCategories);
router.get("/menu-items", getQrMenuItemsController);

export default router;
