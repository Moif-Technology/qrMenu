// frontend/src/services/whatsapp.service.js
// Admin WhatsApp blast utility. Every endpoint is admin-JWT guarded; the
// token rides along via the API interceptor in lib/api.js.
import { API } from "../lib/api.js";

const unwrap = (error, fallback) => ({
  ok: false,
  error: error?.response?.data?.error || error?.message || fallback,
});

/** Connection state, QR code (when waiting for a scan) and hourly usage. */
export async function getWhatsAppStatus() {
  try {
    const res = await API.get("/admin/whatsapp/status");
    return res.data;
  } catch (error) {
    return unwrap(error, "Failed to read status");
  }
}

/** Boot the WhatsApp Web client. QR arrives on the next status poll. */
export async function connectWhatsApp() {
  try {
    const res = await API.post("/admin/whatsapp/connect");
    return res.data;
  } catch (error) {
    return unwrap(error, "Failed to connect");
  }
}

/**
 * Unwedge a stuck browser: kills whatever still holds the Chromium profile.
 * Pass wipeSession to also drop the cached login, which is what switching to a
 * different phone number requires.
 */
export async function resetWhatsApp(wipeSession = false) {
  try {
    const res = await API.post("/admin/whatsapp/reset", { wipeSession });
    return res.data;
  } catch (error) {
    return unwrap(error, "Reset failed");
  }
}

/** Drop the session. A new QR scan is needed after this. */
export async function logoutWhatsApp() {
  try {
    const res = await API.post("/admin/whatsapp/logout");
    return res.data;
  } catch (error) {
    return unwrap(error, "Failed to log out");
  }
}

/** Customer picker rows, each with lastMessagedAt so repeats are visible. */
export async function getWhatsAppCustomers(q = "", { page = 1, pageSize = 50 } = {}) {
  try {
    const params = new URLSearchParams();
    if (q && q.trim()) params.append("q", q.trim());
    params.append("page", page);
    params.append("pageSize", pageSize);
    const res = await API.get(`/admin/whatsapp/customers?${params.toString()}`);
    return res.data;
  } catch (error) {
    return { ...unwrap(error, "Failed to load customers"), customers: [] };
  }
}

/**
 * Send to exactly one customer. There is no bulk endpoint on purpose - the
 * page walks its selection and paces the calls itself.
 *
 * `image` is an optional { data, mimetype, filename } poster; the message text
 * arrives as its caption.
 */
export async function sendWhatsAppMessage({ customerId, name, phone, message, image }) {
  try {
    const res = await API.post("/admin/whatsapp/send", {
      customerId,
      name,
      phone,
      message,
      image,
    });
    return res.data;
  } catch (error) {
    return unwrap(error, "Send failed");
  }
}

/** Recent sends, newest first. */
export async function getWhatsAppLog(limit = 100) {
  try {
    const res = await API.get(`/admin/whatsapp/log?limit=${limit}`);
    return res.data;
  } catch (error) {
    return { ...unwrap(error, "Failed to load log"), log: [] };
  }
}
