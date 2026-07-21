// backend/controllers/payment.controller.js
import util from "node:util";
import { getActivePaymentMethods, getPaymentMethodById, savePayFullPayment, saveCustomSplitPayment, saveItemSplitPayment, saveEqualSplitPayment, getPaidItems, getTableBalance, getServiceFeeRatePercent } from "../services/payment.service.js";

const isProd = process.env.NODE_ENV === "production";

// Pull useful info out of mssql/tedious errors
function unwrapSqlError(err) {
  const info = err?.originalError?.info || err?.info || {};
  const preceding = Array.isArray(err?.precedingErrors)
    ? err.precedingErrors.map(e => e?.message || String(e))
    : undefined;

  return {
    name: err?.name,
    message:
      info?.message ||
      err?.message ||
      "Payment save failed",
    code: err?.code || info?.code,
    number: info?.number,
    state: info?.state,
    class: info?.class,
    lineNumber: info?.lineNumber,
    serverName: info?.serverName,
    procName: info?.procName,
    stack: err?.stack,
    precedingErrors: preceding
  };
}

/**
 * GET /api/payment/service-fee-rate
 * Company-controlled service fee %, set via the qrmenu-dashboard admin UI.
 */
export async function getServiceFeeRate(req, res) {
  try {
    const ratePercent = await getServiceFeeRatePercent();
    return res.status(200).json({ ok: true, ratePercent });
  } catch (err) {
    console.error("[PAYMENT][getServiceFeeRate] Error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load service fee rate" });
  }
}

/**
 * GET /api/payment/methods
 * Get all active payment methods (excluding Block status)
 */
export async function getPaymentMethods(req, res) {
  try {
    const methods = await getActivePaymentMethods();
    console.log("[PAYMENT][getMethods] Found methods:", methods.length); // Debug log - nodemon restart trigger
    
    const formattedMethods = methods.map(m => ({
      id: m.ID,
      paymentMethodId: m.PaymentMethodID,
      paymentMethod: m.PaymentMethod,
      status: m.Status
    }));
    
    console.log("[PAYMENT][getMethods] Formatted methods:", formattedMethods);
    
    return res.status(200).json({
      ok: true,
      methods: formattedMethods
    });
  } catch (err) {
    console.error("[PAYMENT][getMethods] Error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to fetch payment methods"
    });
  }
}

/**
 * GET /api/payment/methods/:methodId
 * Get payment method by ID
 */
export async function getPaymentMethod(req, res) {
  try {
    const methodId = Number(req.params.methodId);
    if (!methodId || !Number.isFinite(methodId)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid method ID"
      });
    }

    const method = await getPaymentMethodById(methodId);
    if (!method) {
      return res.status(404).json({
        ok: false,
        error: "Payment method not found"
      });
    }

    return res.status(200).json({
      ok: true,
      method: {
        id: method.ID,
        paymentMethodId: method.PaymentMethodID,
        paymentMethod: method.PaymentMethod,
        status: method.Status
      }
    });
  } catch (err) {
    console.error("[PAYMENT][getMethod] Error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to fetch payment method"
    });
  }
}

/**
 * POST /api/payment/pay-full
 * Process Pay Full payment
 * For now, only saves to database - payment gateway integration will be added later
 * Payload: {
 *   billAmount: number, // total bill amount (can also be totalAmount, amount, etc.)
 *   tableId?: number    // optional, for reference
 * }
 */
export async function processPayFull(req, res) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Support multiple field names for bill amount
  const billAmount = req.body?.billAmount || req.body?.totalAmount || req.body?.amount || req.body?.total;
  const tableId = req.body?.tableId;
  const kotMasterID = req.body?.kotMasterID || req.body?.kotMasterId || req.body?.KotMasterID || req.body?.KotMasterId;

  const preview = {
    billAmount,
    tableId,
    kotMasterID,
    methodId: 1 // Pay Full
  };

  console.log(`[PAYMENT][${reqId}] POST ${req.originalUrl} payload:`, preview);

  try {
    const result = await savePayFullPayment({ billAmount, tableId, kotMasterID });
    console.log(`[PAYMENT][${reqId}] OK:`, result);
    return res.status(201).json({
      ok: true,
      ...result,
      message: "Payment processed successfully"
    });
  } catch (err) {
    const diag = unwrapSqlError(err);

    console.error(`[PAYMENT][${reqId}] ERROR:`, util.inspect(diag, { depth: null, colors: true }));

    const msg = String(diag.message || "").toLowerCase();
    const code = (msg.includes("required") || msg.includes("invalid") || msg.includes("positive")) ? 400 : 500;

    return res.status(code).json({
      ok: false,
      error: diag.message || "Payment processing failed",
      debug: isProd ? undefined : diag
    });
  }
}

/**
 * POST /api/payment/equal-split
 * Process Equal Split payment (MethodID = 2)
 * Payload: {
 *   billAmount: number,     // Full bill amount
 *   paidAmount: number,     // Equal share amount user is paying
 *   numberOfPeople: number, // Number of people splitting
 *   kotMasterID?: number,   // Optional: KOT Master ID
 *   tableId?: number        // Optional, for reference
 * }
 */
export async function processEqualSplit(req, res) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const billAmount = req.body?.billAmount || req.body?.totalAmount || req.body?.total || null;
  const paidAmount = req.body?.paidAmount || null; // Equal split always uses paidAmount field
  const numberOfPeople = req.body?.numberOfPeople || req.body?.peopleCount || req.body?.count || 2;
  const tableId = req.body?.tableId;
  const kotMasterID = req.body?.kotMasterID || req.body?.kotMasterId || req.body?.KotMasterID || req.body?.KotMasterId;
  const transId = req.body?.transId;
  const sessionKey = req.body?.sessionKey || null; // used for tamper-check in service layer
  const serviceFeeAmount = req.body?.serviceFeeAmount || 0;
  const tipAmount = req.body?.tipAmount || 0;
  
  console.log(`[PAYMENT][${reqId}] Raw request body:`, JSON.stringify(req.body, null, 2));
  
  // Validate required fields
  if (!billAmount || Number(billAmount) <= 0) {
    console.error(`[PAYMENT][${reqId}] Validation failed: billAmount is missing or invalid:`, billAmount);
    return res.status(400).json({
      ok: false,
      error: "Bill amount is required and must be greater than 0"
    });
  }
  
  if (!paidAmount || Number(paidAmount) <= 0) {
    console.error(`[PAYMENT][${reqId}] Validation failed: paidAmount is missing or invalid:`, paidAmount);
    return res.status(400).json({
      ok: false,
      error: "Paid amount is required and must be greater than 0"
    });
  }
  
  const preview = {
    billAmount,
    paidAmount,
    numberOfPeople,
    tableId,
    kotMasterID,
    transId,
    methodId: 2 // Equal Split
  };
  console.log(`[PAYMENT][${reqId}] POST ${req.originalUrl} payload:`, preview);
  
  try {
    const result = await saveEqualSplitPayment({ billAmount, paidAmount, numberOfPeople, kotMasterID, transId, tableId, sessionKey, serviceFeeAmount, tipAmount });
    console.log(`[PAYMENT][${reqId}] OK:`, result);
    return res.status(201).json({ 
      ok: true, 
      ...result, 
      message: "Equal split payment processed successfully" 
    });
  } catch (err) {
    const diag = unwrapSqlError(err);
    console.error(`[PAYMENT][${reqId}] ERROR:`, util.inspect(diag, { depth: null, colors: true }));
    
    return res.status(400).json({
      ok: false,
      error: diag.message || "Equal split payment processing failed",
      debug: isProd ? undefined : diag
    });
  }
}

/**
 * POST /api/payment/custom-split
 * Process Custom Split payment
 * Payload: {
 *   billAmount: number,     // Full bill amount
 *   paidAmount: number,     // Custom amount user is paying
 *   transId?: number,       // Optional: TransID for grouping split payments
 *   tableId?: number        // Optional, for reference
 * }
 */
export async function processCustomSplit(req, res) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  
  // Support multiple field names
  const billAmount = req.body?.billAmount || req.body?.totalAmount || req.body?.total || req.body?.bill;
  const paidAmount = req.body?.paidAmount || req.body?.amount || req.body?.customAmount;
  const transId = req.body?.transId;
  const tableId = req.body?.tableId;
  const kotMasterID = req.body?.kotMasterID || req.body?.kotMasterId || req.body?.KotMasterID || req.body?.KotMasterId;
  const serviceFeeAmount = req.body?.serviceFeeAmount || 0;
  const tipAmount = req.body?.tipAmount || 0;

  const preview = {
    billAmount,
    paidAmount,
    transId,
    tableId,
    kotMasterID,
    methodId: 4 // Custom Split
  };

  console.log(`[PAYMENT][${reqId}] POST ${req.originalUrl} payload:`, preview);

  try {
    const result = await saveCustomSplitPayment({ billAmount, paidAmount, transId, tableId, kotMasterID, serviceFeeAmount, tipAmount });
    console.log(`[PAYMENT][${reqId}] OK:`, result);
    return res.status(201).json({
      ok: true,
      ...result,
      message: "Custom split payment processed successfully"
    });
  } catch (err) {
    const diag = unwrapSqlError(err);
    
    console.error(`[PAYMENT][${reqId}] ERROR:`, util.inspect(diag, { depth: null, colors: true }));
    
    const msg = String(diag.message || "").toLowerCase();
    const code = (msg.includes("required") || msg.includes("invalid") || msg.includes("positive") || msg.includes("exceed")) ? 400 : 500;
    
    return res.status(code).json({
      ok: false,
      error: diag.message || "Payment processing failed",
      debug: isProd ? undefined : diag
    });
  }
}

/**
 * POST /api/payment/item-split
 * Process item split payment (MethodID = 3)
 */
export async function processItemSplit(req, res) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const items = req.body?.items || req.body?.selectedItems || [];
  const tableId = req.body?.tableId;
  const kotMasterID = req.body?.kotMasterID || req.body?.kotMasterId || req.body?.KotMasterID || req.body?.KotMasterId;
  const totalBillAmount = req.body?.totalBillAmount || req.body?.billAmount || null;
  const serviceFeeAmount = req.body?.serviceFeeAmount || 0;
  const tipAmount = req.body?.tipAmount || 0;

  const preview = {
    itemsCount: items.length, tableId, kotMasterID, totalBillAmount, methodId: 3
  };
  console.log(`[PAYMENT][${reqId}] POST ${req.originalUrl} payload:`, preview);

  try {
    const result = await saveItemSplitPayment({ items, tableId, kotMasterID, totalBillAmount, serviceFeeAmount, tipAmount });
    console.log(`[PAYMENT][${reqId}] OK:`, result);
    return res.status(201).json({ 
      ok: true, 
      ...result, 
      message: "Item split payment processed successfully" 
    });
  } catch (err) {
    const diag = unwrapSqlError(err);
    console.error(`[PAYMENT][${reqId}] ERROR:`, util.inspect(diag, { depth: null, colors: true }));
    
    return res.status(400).json({
      ok: false,
      error: diag.message || "Item split payment processing failed",
      debug: isProd ? undefined : diag
    });
  }
}

/**
 * GET /api/payment/paid-items/:kotMasterID
 * Get list of paid kotChildIDs for a kotMasterID (for item split payments)
 */
export async function getPaidItemsEndpoint(req, res) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const kotMasterID = req.params?.kotMasterID || req.query?.kotMasterID || req.query?.kotMasterId || null;
  
  console.log(`[PAYMENT][${reqId}] GET /api/payment/paid-items kotMasterID:`, kotMasterID);
  
  try {
    const paidItems = await getPaidItems(kotMasterID);
    console.log(`[PAYMENT][${reqId}] Paid items result:`, paidItems);
    return res.status(200).json({
      ok: true,
      paidKotChildIds: paidItems
    });
  } catch (err) {
    const diag = unwrapSqlError(err);
    console.error(`[PAYMENT][${reqId}] ERROR:`, util.inspect(diag, { depth: null, colors: true }));
    
    return res.status(500).json({
      ok: false,
      error: diag.message || "Failed to get paid items",
      debug: isProd ? undefined : diag,
      paidKotChildIds: []
    });
  }
}

/**
 * GET /api/payment/balance/:tableId
 * Get remaining balance for a table
 * Query params: ?kotMasterID=xxx to check balance for specific KOT
 */
export async function getBalance(req, res) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const tableId = req.params?.tableId || req.query?.tableId;
  const kotMasterID = req.query?.kotMasterID || req.query?.kotMasterId || null;
  
  console.log(`[PAYMENT][${reqId}] GET /api/payment/balance tableId:`, tableId, "kotMasterID:", kotMasterID);
  
  try {
    const result = await getTableBalance(tableId, kotMasterID);
    console.log(`[PAYMENT][${reqId}] Balance result:`, result);
    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (err) {
    const diag = unwrapSqlError(err);
    console.error(`[PAYMENT][${reqId}] ERROR:`, util.inspect(diag, { depth: null, colors: true }));
    
    return res.status(500).json({
      ok: false,
      error: diag.message || "Failed to get balance",
      debug: isProd ? undefined : diag
    });
  }
}
