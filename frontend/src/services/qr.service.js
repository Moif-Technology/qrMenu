// frontend/src/services/qr.service.js
import { API } from "../lib/api.js";

/**
 * Generate a QR code for a table
 * @param {string} tableId - The table ID
 * @param {string} area - The area name (default: "DININ")
 * @returns {Promise<{ok: boolean, qrCode?: string, url?: string, token?: string, tableId?: string, area?: string, error?: string}>}
 */
export async function generateQRCode(tableId, area = "DININ") {
  try {
    const response = await API.post("/qr/generate", { tableId, area });
    return response.data;
  } catch (error) {
    console.error("[QR Service] Error generating QR code:", error);
    return {
      ok: false,
      error: error?.response?.data?.error || error?.message || "Failed to generate QR code"
    };
  }
}
