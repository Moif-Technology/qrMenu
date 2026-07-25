// backend/controllers/payment.controller.js
import util from "node:util";
import { getActivePaymentMethods, getPaymentMethodById, getPaidItems, getTableBalance, getServiceFeeRatePercent, settleAnyModeFromPayload } from "../services/payment.service.js";
import { claimAndSettlePublic } from "../services/paymentSessionStore.js";

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
 * Every /api/payment/* write endpoint below is public (no login on a QR menu -
 * any diner's phone must be able to call it), which means the request body
 * itself can never be trusted to prove a charge happened: anyone who watches
 * their own phone's network traffic (or just replays a captured request) can
 * send the same billAmount/tableId/kotMasterID without ever paying.
 *
 * The only thing that can't be forged is `orderRef` combined with the
 * server-side PaymentSession row it points to: that row is only ever marked
 * AUTHORISED by the Telr redirect/webhook handlers, and only after they
 * independently re-verify the charge with Telr's own servers (telrCheck()).
 * claimAndSettlePublic() atomically claims that row (so the same orderRef can
 * never settle twice) and reads the actual amounts/items/mode from it -
 * everything else in the request body is ignored for the write itself.
 */
async function settleFromOrderRef(req, res, reqId, label) {
  const orderRef = req.body?.orderRef;
  const tranRef = req.body?.tranRef || null;
  const authCode = req.body?.authCode || null;

  if (!orderRef) {
    console.warn(`[PAYMENT][${reqId}] ${label} rejected: missing orderRef`);
    return res.status(400).json({
      ok: false,
      error: "orderRef is required - this payment must be verified through Telr before it can be recorded"
    });
  }

  console.log(`[PAYMENT][${reqId}] POST ${req.originalUrl} orderRef:`, orderRef);

  const claimed = await claimAndSettlePublic(orderRef, { orderRef, tranRef, authCode }, settleAnyModeFromPayload);

  if (!claimed.ok) {
    console.warn(`[PAYMENT][${reqId}] ${label} could not settle. orderRef:`, orderRef, "reason:", claimed.reason || claimed.error);
    if (claimed.reason) {
      // No AUTHORISED session for this orderRef (never existed, already
      // settled, or still awaiting Telr) - not a server error, so 409/404.
      return res.status(claimed.reason === "no-authorised-session-for-orderref" ? 404 : 409).json({
        ok: false,
        error: claimed.reason === "no-authorised-session-for-orderref"
          ? "No authorised payment session found for this orderRef. This payment has not been verified with Telr."
          : "This payment session is already being processed or has already been settled."
      });
    }
    const msg = String(claimed.error || "").toLowerCase();
    const code = (msg.includes("required") || msg.includes("invalid") || msg.includes("positive") || msg.includes("already") || msg.includes("missing")) ? 400 : 500;
    return res.status(code).json({
      ok: false,
      error: claimed.error || "Payment processing failed"
    });
  }

  console.log(`[PAYMENT][${reqId}] ${label} OK:`, claimed.result);
  return res.status(201).json({
    ok: true,
    ...claimed.result,
    message: "Payment processed successfully"
  });
}

/**
 * POST /api/payment/pay-full
 * Records a Pay Full payment - only for an orderRef whose PaymentSession row
 * is already AUTHORISED by Telr (see settleFromOrderRef above).
 */
export async function processPayFull(req, res) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return settleFromOrderRef(req, res, reqId, "Pay Full");
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
  return settleFromOrderRef(req, res, reqId, "Equal Split");
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
  return settleFromOrderRef(req, res, reqId, "Custom Split");
}

/**
 * POST /api/payment/item-split
 * Process item split payment (MethodID = 3)
 */
export async function processItemSplit(req, res) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return settleFromOrderRef(req, res, reqId, "Item Split");
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
