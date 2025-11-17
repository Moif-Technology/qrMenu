// backend/routes/payment.routes.js
import { Router } from "express";
import { getPaymentMethods, getPaymentMethod, processPayFull, processEqualSplit, processCustomSplit, processItemSplit, getPaidItemsEndpoint, getBalance } from "../controllers/payment.controller.js";

const router = Router();

// GET /api/payment/methods - Get all active payment methods
router.get("/payment/methods", getPaymentMethods);

// GET /api/payment/methods/:methodId - Get payment method by ID
router.get("/payment/methods/:methodId", getPaymentMethod);

// POST /api/payment/pay-full - Process Pay Full payment
router.post("/payment/pay-full", processPayFull);

// POST /api/payment/equal-split - Process Equal Split payment (MethodID = 2)
router.post("/payment/equal-split", processEqualSplit);

// POST /api/payment/custom-split - Process Custom Split payment
router.post("/payment/custom-split", processCustomSplit);

// POST /api/payment/item-split - Process Item Split payment (MethodID = 3)
router.post("/payment/item-split", processItemSplit);

// GET /api/payment/paid-items/:kotMasterID - Get paid items for a kotMasterID (item split)
router.get("/payment/paid-items/:kotMasterID", getPaidItemsEndpoint);

// GET /api/payment/balance/:tableId - Get remaining balance for a table
router.get("/payment/balance/:tableId", getBalance);

export default router;

