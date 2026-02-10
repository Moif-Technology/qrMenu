import "dotenv/config";
import express from "express";
import axios from "axios";
import { savePayFullPayment } from "./services/payment.service.js";

const router = express.Router();

const TELR_ENDPOINT = "https://secure.telr.com/gateway/order.json";

const {
  TELR_STORE_ID,
  TELR_AUTH_KEY,
  TELR_TEST_MODE,
  APP_BASE_URL,
  FRONTEND_URL = "http://localhost:5173",
  RESTAURANT_BASE_PATH = "opaia",
} = process.env;

// Restaurant base path for frontend URLs (e.g. opaia -> /opaia)
const FRONTEND_BASE_PATH = String(RESTAURANT_BASE_PATH || "opaia").replace(/^\/|\/$/g, "") || "opaia";

// Normalize APP_BASE_URL to remove trailing /api if present
// This prevents double /api/api/ in return URLs
// Ensure port number is always included (default to 5001 for local network IPs)
function normalizeAppBaseUrl(baseUrl) {
  if (!baseUrl) {
    return "https://api.deynoqr.com/api";
    // return "http://192.168.0.34:5001/api";
  }
  
  // Remove trailing /api and trailing slashes
  let normalized = baseUrl.trim().replace(/\/api\/?$/, "").replace(/\/$/, "");
  
  // Check if it's an IP address pattern
  const ipPattern = /^(https?:\/\/)(\d+\.\d+\.\d+\.\d+)(?::(\d+))?(\/.*)?$/;
  const match = normalized.match(ipPattern);
  
  if (match) {
    // It's an IP address
    const protocol = match[1];
    const ip = match[2];
    const port = match[3];
    const path = match[4] || "";
    
    // If no port specified, add :5001
    if (!port) {
      normalized = `${protocol}${ip}:5001${path}`;
    } else {
      normalized = `${protocol}${ip}:${port}${path}`;
    }
  } else {
    // Try to parse as URL for other cases (localhost, domain names, etc.)
    try {
      const url = new URL(normalized);
      // If no port and it's http://localhost, add port 5001
      if (!url.port && url.protocol === "http:" && url.hostname === "localhost") {
        url.port = "5001";
        normalized = url.toString().replace(/\/$/, "");
      }
    } catch (e) {
      // If URL parsing fails, return as-is (might be malformed, but we tried)
      console.warn("[Telr] Could not parse APP_BASE_URL:", baseUrl, e.message);
    }
  }
  
  return normalized;
}

const normalizedAppBaseUrl = normalizeAppBaseUrl(APP_BASE_URL);

// Debug log to help troubleshoot
console.log("[Telr] APP_BASE_URL:", APP_BASE_URL);
console.log("[Telr] Normalized APP_BASE_URL:", normalizedAppBaseUrl);

const sanitizedStoreId = TELR_STORE_ID?.toString().trim();
const sanitizedAuthKey = TELR_AUTH_KEY?.toString().trim();
const rawTestMode = (TELR_TEST_MODE ?? "").toString().trim().toLowerCase();
const isTestMode = rawTestMode === "1" || rawTestMode === "true";

if (!sanitizedStoreId || !sanitizedAuthKey) {
  console.warn("[Telr] Missing TELR_STORE_ID or TELR_AUTH_KEY env vars");
}

const pendingTelrSessions = new Map();
const pendingTelrSessionsByKey = new Map();

function rememberTelrSession(orderRef, payload) {
  if (!orderRef && !payload?.sessionKey) return;
  const entry = {
    ...payload,
    createdAt: Date.now(),
    processed: false,
    orderRef,
  };
  if (orderRef) {
    pendingTelrSessions.set(orderRef, entry);
  }
  if (payload?.sessionKey) {
    pendingTelrSessionsByKey.set(payload.sessionKey, entry);
  }

  const cutoff = Date.now() - 1000 * 60 * 120; // 2 hours
  for (const [ref, meta] of pendingTelrSessions.entries()) {
    if ((meta?.createdAt ?? 0) < cutoff) {
      pendingTelrSessions.delete(ref);
    }
  }
  for (const [key, meta] of pendingTelrSessionsByKey.entries()) {
    if ((meta?.createdAt ?? 0) < cutoff) {
      pendingTelrSessionsByKey.delete(key);
    }
  }
}

function extractOrderRef(req) {
  return (
    req.query?.order_ref ||
    req.query?.orderRef ||
    req.body?.order_ref ||
    req.body?.orderRef ||
    null
  );
}

async function telrCheck(orderRef) {
  if (!sanitizedStoreId || !sanitizedAuthKey) {
    throw new Error("Telr config missing");
  }
  if (!orderRef) {
    throw new Error("orderRef is required");
  }

  const form = new URLSearchParams({
    ivp_method: "check",
    ivp_store: sanitizedStoreId,
    ivp_authkey: sanitizedAuthKey,
    order_ref: String(orderRef),
  });

  if (isTestMode) {
    form.set("ivp_test", "1");
  }

  const { data } = await axios.post(TELR_ENDPOINT, form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!data?.order?.ref) {
    throw new Error("Unexpected Telr response");
  }

  return data;
}

function buildRedirectUrl(status, orderRef, sessionMeta, extraParams = {}, fallback = {}) {
  const effectiveToken = sessionMeta?.token || fallback?.token || null;
  const path = effectiveToken ? `/r/${encodeURIComponent(effectiveToken)}` : "";
  const basePath = `/${FRONTEND_BASE_PATH}${path || ""}`.replace(/\/$/, "") || `/${FRONTEND_BASE_PATH}`;
  const url = new URL(basePath, FRONTEND_URL.endsWith("/") ? FRONTEND_URL : `${FRONTEND_URL}/`);

  url.searchParams.set("telrStatus", status);
  if (orderRef) url.searchParams.set("orderRef", orderRef);

  const tableIdValue = sessionMeta?.tableId ?? fallback?.tableId;
  if (tableIdValue !== undefined && tableIdValue !== null) {
    url.searchParams.set("tableId", String(tableIdValue));
  }
  const amountValue = sessionMeta?.amount ?? fallback?.amount;
  if (amountValue !== undefined && amountValue !== null) {
    const amt = Number(amountValue);
    url.searchParams.set("amount", Number.isFinite(amt) ? amt.toFixed(2) : String(amountValue));
  }
  const cartIdValue = sessionMeta?.cartId ?? fallback?.cartId;
  if (cartIdValue) {
    url.searchParams.set("cartId", cartIdValue);
  }

  Object.entries(extraParams || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  if (sessionMeta?.sessionKey) {
    url.searchParams.set("sessionKey", sessionMeta.sessionKey);
  } else if (fallback?.sessionKey) {
    url.searchParams.set("sessionKey", fallback.sessionKey);
  }

  return url.toString();
}

const telrReturnPage = (status, { message, redirectUrl }) => {
  const safeStatus = String(status || "").toUpperCase();
  const safeMessage =
    message ||
    (safeStatus === "AUTH"
      ? "Payment authorised. You will be redirected shortly."
      : safeStatus === "CANCEL"
        ? "Payment was cancelled."
        : safeStatus === "DECLINED"
          ? "Payment was declined."
          : "Processing payment result.");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Telr Payment ${safeStatus}</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 32px; text-align: center; background: #fafafa; color: #111; }
      h1 { font-size: 20px; margin-bottom: 12px; }
      p { color: #555; font-size: 14px; margin-bottom: 18px; }
      .status-auth { color: #0f7b3f; }
      .status-cancel { color: #c47f17; }
      .status-declined { color: #b3261e; }
      .fallback-link { display: inline-block; margin-top: 18px; color: #116ac9; text-decoration: none; font-weight: 600; }
      .fallback-link:hover { text-decoration: underline; }
      .spinner { display: inline-block; width: 20px; height: 20px; border: 3px solid rgba(0,0,0,0.1); border-top-color: #116ac9; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 8px; vertical-align: middle; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <h1 class="status-${safeStatus.toLowerCase()}">Payment flow returned: ${safeStatus}</h1>
    <p>${safeMessage}</p>
    ${
      redirectUrl
        ? `<div><span class="spinner"></span>Redirecting...</div><a class="fallback-link" href="${redirectUrl}">Click here if you are not redirected</a>`
        : ""
    }
    <script>
      (function () {
        const redirectUrl = ${JSON.stringify(redirectUrl || null)};
        const REDIRECT_DELAY = redirectUrl ? 1500 : 0;
        
        if (redirectUrl) {
          setTimeout(() => {
            try {
              window.location.replace(redirectUrl);
            } catch (redirectErr) {
              console.warn("Redirect failed", redirectErr);
              window.location.href = redirectUrl;
            }
          }, REDIRECT_DELAY);
        }
      })();
    </script>
  </body>
</html>`;
};

router.post("/api/telr/create", async (req, res) => {
  try {
    const {
      amount,
      currency = "AED",
      cartId,
      description,
      customer = {},
      tableId = null,
      kotMasterID = null,
      token = null,
    } = req.body ?? {};

    if (!amount || !cartId || !description) {
      return res
        .status(400)
        .json({ error: "amount, cartId and description are required" });
    }

    const sessionKey =
      `sess_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;

    const returnParams = new URLSearchParams();
    if (token) returnParams.set("token", token);
    if (tableId !== null && tableId !== undefined) returnParams.set("tableId", String(tableId));
    if (kotMasterID !== null && kotMasterID !== undefined) returnParams.set("kotMasterID", String(kotMasterID));
    if (cartId) returnParams.set("cartId", String(cartId));
    returnParams.set("sessionKey", sessionKey);
    const returnQuery = returnParams.toString() ? `?${returnParams.toString()}` : "";

    const form = new URLSearchParams({
      ivp_method: "create",
      ivp_store: sanitizedStoreId,
      ivp_authkey: sanitizedAuthKey,
      ivp_test: isTestMode ? "1" : "0",
      ivp_amount: Number(amount).toFixed(2),
      ivp_currency: currency,
      ivp_desc: description,
      ivp_cart: String(cartId),
      ivp_framed: "0",
      return_auth: `${normalizedAppBaseUrl}/api/telr/return/auth${returnQuery}`,
      return_can: `${normalizedAppBaseUrl}/api/telr/return/cancel${returnQuery}`,
      return_decl: `${normalizedAppBaseUrl}/api/telr/return/declined${returnQuery}`,
    });

    // Debug log return URLs
    console.log("[Telr] Return URLs:", {
      return_auth: `${normalizedAppBaseUrl}/api/telr/return/auth${returnQuery}`,
      return_can: `${normalizedAppBaseUrl}/api/telr/return/cancel${returnQuery}`,
      return_decl: `${normalizedAppBaseUrl}/api/telr/return/declined${returnQuery}`,
    });

    if (customer.email) form.set("bill_email", customer.email);

    if (customer.name) {
      const parts = customer.name.trim().split(" ");
      form.set("bill_fname", parts.slice(0, -1).join(" ") || parts[0]);
      form.set("bill_sname", parts.length > 1 ? parts[parts.length - 1] : "Customer");
    }

    if (customer.address1) form.set("bill_addr1", customer.address1);
    if (customer.city) form.set("bill_city", customer.city);
    if (customer.country) form.set("bill_country", customer.country);

    const { data } = await axios.post(TELR_ENDPOINT, form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!data?.order?.url || !data?.order?.ref) {
      return res.status(502).json({ error: "Unexpected Telr response", data });
    }

    rememberTelrSession(data.order.ref, {
      amount: Number(amount),
      currency,
      description,
      cartId: String(cartId),
      tableId,
      kotMasterID,
      token,
      sessionKey,
    });

    return res.json({ url: data.order.url, orderRef: data.order.ref });
  } catch (e) {
    console.error("Telr create error:", e?.response?.data || e.message);
    return res
      .status(500)
      .json({ error: "create failed", detail: e?.response?.data || e.message });
  }
});

async function handleReturn(req, res, status) {
  res.set("Content-Type", "text/html; charset=utf-8");

  const orderRefFromQuery = extractOrderRef(req);
  const sessionKey = req.query?.sessionKey || null;
  let sessionMeta = orderRefFromQuery ? pendingTelrSessions.get(orderRefFromQuery) : null;
  if (!sessionMeta && sessionKey) {
    sessionMeta = pendingTelrSessionsByKey.get(sessionKey) || null;
  }
  const effectiveOrderRef = orderRefFromQuery || sessionMeta?.orderRef || null;
  const tokenParam = req.query?.token || req.query?.tok || sessionMeta?.token || null;
  const tableIdParam = req.query?.tableId ?? req.query?.table_id ?? sessionMeta?.tableId ?? null;
  const fallbackMeta = {
    token: tokenParam,
    tableId: tableIdParam,
    amount: sessionMeta?.amount ?? (req.query?.amount ? Number(req.query.amount) : undefined),
    cartId: sessionMeta?.cartId ?? req.query?.cartId ?? null,
    sessionKey,
  };
  let redirectUrl = null;
  let message = null;
  let telrData = null;
  let paymentResult = null;
  let finalStatus = status;

  if (orderRefFromQuery) {
    pendingTelrSessions.delete(orderRefFromQuery);
  }
  if (sessionKey) {
    pendingTelrSessionsByKey.delete(sessionKey);
  }

  if (status === "AUTH" && effectiveOrderRef) {
    try {
      telrData = await telrCheck(effectiveOrderRef);
      const transactionStatus = telrData?.transaction?.status?.code;
      const orderStatusCode = Number(telrData?.order?.status?.code);
      const authorised = transactionStatus === "A" || orderStatusCode === 3;

      if (!authorised) {
        finalStatus = "DECLINED";
        message = "Payment could not be verified. Please try again or contact support.";
      } else {
        const metaForSave = {
          amount: sessionMeta?.amount ?? fallbackMeta.amount,
          tableId: sessionMeta?.tableId ?? fallbackMeta.tableId,
          kotMasterID:
            sessionMeta?.kotMasterID ??
            req.query?.kotMasterID ??
            req.query?.kotMasterId ??
            null,
        };

        if (metaForSave.amount && (metaForSave.tableId || metaForSave.kotMasterID)) {
          try {
            paymentResult = await savePayFullPayment({
              billAmount: metaForSave.amount,
              tableId: metaForSave.tableId,
              kotMasterID: metaForSave.kotMasterID,
            });
            if (sessionMeta) sessionMeta.processed = true;
          } catch (err) {
            console.error("[Telr] Failed to persist pay full payment:", err);
            message = "Payment authorised, but we could not update the order automatically. Please check with staff.";
          }
        } else {
          console.warn("[Telr] Missing data to persist payment after Telr AUTH", {
            metaForSave,
          });
        }
      }
    } catch (err) {
      console.error("[Telr] Check after return failed:", err?.response?.data || err.message);
      message = "Payment authorised. We are finalising your order.";
    }
  } else if (status === "CANCEL") {
    message = "Payment was cancelled. You can close this window.";
  } else if (status === "DECLINED") {
    message = "Payment was declined. Please try another method.";
  }

  redirectUrl = buildRedirectUrl(
    finalStatus,
    effectiveOrderRef,
    sessionMeta || {},
    {
      paymentId: paymentResult?.paymentId || paymentResult?.PaymentID,
    },
    fallbackMeta,
  );

  const html = telrReturnPage(finalStatus, { message, redirectUrl });
  res.send(html);
}

router.get("/api/telr/return/auth", (req, res) => handleReturn(req, res, "AUTH"));
router.get("/api/telr/return/cancel", (req, res) => handleReturn(req, res, "CANCEL"));
router.get("/api/telr/return/declined", (req, res) => handleReturn(req, res, "DECLINED"));

router.post("/api/telr/check", async (req, res) => {
  try {
    const { orderRef } = req.body ?? {};
    const data = await telrCheck(orderRef);
    return res.json({ ok: true, data });
  } catch (e) {
    console.error("Telr check error:", e?.response?.data || e.message);
    return res
      .status(500)
      .json({ error: "check failed", detail: e?.response?.data || e.message });
  }
});

export default router;

