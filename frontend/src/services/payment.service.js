// frontend/src/services/payment.service.js
import { API } from "../lib/api";

/**
 * Get all active payment methods
 * @returns {Promise<Array>} Array of payment methods
 */
export async function getPaymentMethods() {
  try {
    const { data } = await API.get("/payment/methods");
    if (data.ok) {
      return data.methods || [];
    }
    throw new Error(data.msg || "Failed to fetch payment methods");
  } catch (err) {
    console.error("Error fetching payment methods:", err);
    throw err;
  }
}

/**
 * Process Pay Full payment
 * For now, only saves to database - payment gateway integration will be added later
 * @param {Object} paymentData - Payment data { billAmount, tableId? }
 * @returns {Promise<Object>} Payment result
 */
export async function processPayFull(paymentData) {
  try {
    console.log("[PAYMENT SERVICE] processPayFull - Request payload:", paymentData);
    const { data } = await API.post("/payment/pay-full", paymentData);
    console.log("[PAYMENT SERVICE] processPayFull - Response:", data);
    if (data.ok) {
      return data;
    }
    throw new Error(data.error || "Payment processing failed");
  } catch (err) {
    console.error("Error processing Pay Full payment:", err);
    throw err;
  }
}

export async function createTelrSession(sessionData) {
  try {
    console.log("[PAYMENT SERVICE] createTelrSession - Request payload:", sessionData);
    const { data } = await API.post("/telr/create", sessionData);
    console.log("[PAYMENT SERVICE] createTelrSession - Response:", data);
    return data;
  } catch (err) {
    console.error("Error creating Telr session:", err);
    throw err;
  }
}

export async function checkTelrStatus(orderRef) {
  try {
    const payload = typeof orderRef === "object" && orderRef !== null ? orderRef : { orderRef };
    console.log("[PAYMENT SERVICE] checkTelrStatus - Request payload:", payload);
    const { data } = await API.post("/telr/check", payload);
    console.log("[PAYMENT SERVICE] checkTelrStatus - Response:", data);
    if (data?.ok) {
      return data;
    }
    throw new Error(data?.error || "Failed to check Telr payment status");
  } catch (err) {
    console.error("Error checking Telr payment status:", err);
    throw err;
  }
}

/**
 * Process Custom Split payment
 * For now, only saves to database - payment gateway integration will be added later
 * @param {Object} paymentData - Payment data { billAmount, paidAmount, transId?, tableId? }
 * @returns {Promise<Object>} Payment result
 */
export async function processEqualSplit(paymentData) {
  try {
    console.log("[PAYMENT SERVICE] processEqualSplit - Request payload:", paymentData);
    const { data } = await API.post("/payment/equal-split", paymentData);
    console.log("[PAYMENT SERVICE] processEqualSplit - Response:", data);
    if (data.ok) {
      return data;
    }
    throw new Error(data.error || "Equal split payment processing failed");
  } catch (err) {
    console.error("Error processing Equal Split payment:", err);
    throw err;
  }
}

export async function processCustomSplit(paymentData) {
  try {
    console.log("[PAYMENT SERVICE] processCustomSplit - Request payload:", paymentData);
    const { data } = await API.post("/payment/custom-split", paymentData);
    console.log("[PAYMENT SERVICE] processCustomSplit - Response:", data);
    if (data.ok) {
      return data;
    }
    throw new Error(data.error || "Payment processing failed");
  } catch (err) {
    console.error("Error processing Custom Split payment:", err);
    throw err;
  }
}

/**
 * Process item split payment (MethodID = 3)
 * @param {Object} paymentData - Payment data with items, tableId, kotMasterID
 * @returns {Promise<Object>} Payment result
 */
export async function processItemSplit(paymentData) {
  try {
    console.log("[PAYMENT SERVICE] processItemSplit - Request payload:", paymentData);
    const { data } = await API.post("/payment/item-split", paymentData);
    console.log("[PAYMENT SERVICE] processItemSplit - Response:", data);
    if (data.ok) {
      return data;
    }
    throw new Error(data.error || "Item split payment processing failed");
  } catch (err) {
    console.error("Error processing Item Split payment:", err);
    throw err;
  }
}

/**
 * Get paid items for a kotMasterID (item split payments)
 * @param {string|number} kotMasterID - KOT Master ID
 * @returns {Promise<Array>} Array of paid kotChildIDs
 */
export async function getPaidItems(kotMasterID) {
  try {
    const { data } = await API.get(`/payment/paid-items/${kotMasterID}`);
    if (data.ok) {
      return data.paidKotChildIds || [];
    }
    return [];
  } catch (err) {
    console.error("Error fetching paid items:", err);
    return [];
  }
}

/**
 * Get remaining balance for a table
 * @param {string|number} tableId - Table ID
 * @param {string|number|null} kotMasterID - Optional: KOT Master ID to check balance for specific KOT
 * @returns {Promise<Object>} Balance information
 */
export async function getBalance(tableId, kotMasterID = null) {
  try {
    let url = `/payment/balance/${tableId}`;
    if (kotMasterID) {
      url += `?kotMasterID=${kotMasterID}`;
    }
    const { data } = await API.get(url);
    if (data.ok) {
      return data;
    }
    throw new Error(data.error || "Failed to get balance");
  } catch (err) {
    console.error("Error fetching balance:", err);
    throw err;
  }
}

/**
 * Check if a table has ongoing orders (unpaid KOTs)
 * @param {string} token - Table token
 * @returns {Promise<Object>} { hasOrders: boolean, tableId: string, lines: Array }
 */
export async function checkTableOrders(token) {
  try {
    const { data } = await API.post("/r/resolve", { token });
    if (data.ok) {
      return {
        hasOrders: (data.lines || []).length > 0,
        tableId: data.tableId,
        lines: data.lines || [],
        area: data.area,
      };
    }
    return { hasOrders: false, tableId: null, lines: [], area: null };
  } catch (err) {
    console.error("Error checking table orders:", err);
    return { hasOrders: false, tableId: null, lines: [], area: null };
  }
}

