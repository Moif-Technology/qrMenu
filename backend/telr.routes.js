import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import axios from "axios";
import { savePayFullPayment, getServiceFeeRatePercent } from "./services/payment.service.js";
import { queryPaymentDb } from "./config/dbConfig.js";
import {
  storeSession,
  getSessionByOrderRef,
  getSessionByKey,
  updateSession,
  deleteSession,
} from "./services/telrSessionStore.js";

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

// Session store lives in telrSessionStore.js (shared with payment.service.js for
// amount-tamper validation).  These shims keep the rest of the file unchanged.
const rememberTelrSession = storeSession;

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
    console.error("[Telr] check: Unexpected response – missing order.ref", {
      orderRef,
      raw: JSON.stringify(data, null, 2),
      status: data?.order?.status,
      error: data?.error,
    });
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
      billAmount = null,
      serviceFeeAmount = 0,
      tipAmount = 0,
    } = req.body ?? {};

    if (!amount || !cartId || !description) {
      return res
        .status(400)
        .json({ error: "amount, cartId and description are required" });
    }

    // 24 bytes = 192 bits of randomness — safe against brute-force guessing
    const sessionKey = `sess_${crypto.randomBytes(24).toString("hex")}`;

    const mode = req.body?.mode || "pay-full";

    // Service fee is company-controlled (qrmenu-dashboard admin) and must never
    // be trusted from the client — recompute it here from the current DB rate.
    // Applies to every mode, always on the amount actually being charged in
    // THIS leg (full bill for pay-full, per-person share for equal split,
    // items subtotal for item split, typed amount for custom split) — not the
    // original full bill amount, so split legs each carry their own
    // proportional share of the fee.
    let effectiveBillAmount = billAmount != null ? Number(billAmount) : Number(amount);
    const legBaseAmount = Number(amount);
    let effectiveServiceFeeAmount = 0;
    let effectiveAmount = legBaseAmount;
    const requestedTip = Number(tipAmount) || 0;

    if (legBaseAmount > 0) {
      const ratePercent = await getServiceFeeRatePercent();
      effectiveServiceFeeAmount = Math.round(legBaseAmount * (ratePercent / 100) * 100) / 100;
      effectiveAmount = Math.round((legBaseAmount + effectiveServiceFeeAmount + requestedTip) * 100) / 100;
    }

    // Keep return URL short: Telr validates return URLs and may reject long ones.
    // We store token, tableId, kotMasterID, cartId, mode in session (by order_ref/sessionKey);
    // when Telr redirects back we look up by order_ref (Telr adds it) or sessionKey.
    const returnParams = new URLSearchParams();
    returnParams.set("sessionKey", sessionKey);
    const returnQuery = returnParams.toString() ? `?${returnParams.toString()}` : "";

    const form = new URLSearchParams({
      ivp_method: "create",
      ivp_store: sanitizedStoreId,
      ivp_authkey: sanitizedAuthKey,
      ivp_test: isTestMode ? "1" : "0",
      ivp_amount: effectiveAmount.toFixed(2),
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
      console.error("[Telr] create: Unexpected response – missing order.url or order.ref", {
        cartId,
        amount,
        currency,
        raw: JSON.stringify(data, null, 2),
        orderStatus: data?.order?.status,
        orderCode: data?.order?.code,
        error: data?.error,
      });
      return res.status(502).json({ error: "Unexpected Telr response", data });
    }

    rememberTelrSession(data.order.ref, {
      amount: effectiveAmount,
      currency,
      description,
      cartId: String(cartId),
      tableId,
      kotMasterID,
      token,
      sessionKey,
      mode,
      billAmount: effectiveBillAmount,
      serviceFeeAmount: effectiveServiceFeeAmount,
      tipAmount: requestedTip,
    });

    return res.json({
      url: data.order.url,
      orderRef: data.order.ref,
      sessionKey,
      amount: effectiveAmount,
      serviceFeeAmount: effectiveServiceFeeAmount,
    });
  } catch (e) {
    console.error("[Telr] create: request failed", {
      message: e?.message,
      status: e?.response?.status,
      data: e?.response?.data,
    });
    return res
      .status(500)
      .json({ error: "create failed", detail: e?.response?.data || e.message });
  }
});

/**
 * Record a Telr checkout that did NOT complete (declined or cancelled) so the
 * payout dashboard can show it as FAILED. Fire-and-forget: a logging failure
 * must never break the customer redirect.
 */
async function recordFailedAttempt(status, sessionMeta, fallbackMeta, orderRef) {
  try {
    const amount = Number(sessionMeta?.amount ?? fallbackMeta?.amount ?? 0) || null;
    const transId = Number(sessionMeta?.kotMasterID ?? 0) || null;
    const tableId = Number(sessionMeta?.tableId ?? fallbackMeta?.tableId ?? 0) || null;
    const mode = String(sessionMeta?.mode || "pay-full").slice(0, 30);
    const finalStatus = status === "CANCEL" ? "CANCELLED" : "DECLINED";

    await queryPaymentDb(
      `INSERT INTO dbo.PaymentAttempts (ShopID, TransID, TableID, Amount, Mode, Status, OrderRef)
       VALUES (1, @transId, @tableId, @amount, @mode, @status, @orderRef)`,
      {
        transId,
        tableId,
        amount,
        mode,
        status: finalStatus,
        orderRef: orderRef ? String(orderRef).slice(0, 100) : null
      }
    );
    console.log(`[Telr] Recorded failed attempt: ${finalStatus} ref=${orderRef || "-"} amount=${amount ?? "-"}`);
  } catch (err) {
    console.error("[Telr] Could not record failed attempt:", err.message);
  }
}

async function handleReturn(req, res, status) {
  res.set("Content-Type", "text/html; charset=utf-8");

  const orderRefFromQuery = extractOrderRef(req);
  const sessionKey = req.query?.sessionKey || null;
  let sessionMeta = getSessionByOrderRef(orderRefFromQuery);
  if (!sessionMeta && sessionKey) {
    sessionMeta = getSessionByKey(sessionKey);
  }
  const effectiveOrderRef = orderRefFromQuery || sessionMeta?.orderRef || null;
  const tokenParam = req.query?.token || req.query?.tok || sessionMeta?.token || null;
  const tableIdParam = req.query?.tableId ?? req.query?.table_id ?? sessionMeta?.tableId ?? null;
  const fallbackMeta = {
    token: tokenParam,
    tableId: tableIdParam,
    // Amount must come from the server-side session only — never from URL params
    // (URL params are customer-controlled and can be tampered with)
    amount: sessionMeta?.amount ?? undefined,
    cartId: sessionMeta?.cartId ?? req.query?.cartId ?? null,
    sessionKey,
  };
  let redirectUrl = null;
  let message = null;
  let telrData = null;
  let paymentResult = null;
  let finalStatus = status;

  deleteSession(orderRefFromQuery, sessionKey);

  if (status === "AUTH" && effectiveOrderRef) {
    try {
      telrData = await telrCheck(effectiveOrderRef);
      const transactionStatus = telrData?.transaction?.status?.code;
      const orderStatusCode = Number(telrData?.order?.status?.code);
      const authorised = transactionStatus === "A" || orderStatusCode === 3;

      if (!authorised) {
        finalStatus = "DECLINED";
        message = "Payment could not be verified. Please try again or contact support.";
        await recordFailedAttempt("DECLINED", sessionMeta, fallbackMeta, effectiveOrderRef);
      } else {
        // Determine payment mode — split modes are handled by the frontend after redirect
        // Priority: URL query param → stored session meta → default pay-full
        // If mode is missing entirely but the amount charged is less than the full bill
        // we still can't know from the backend alone, so we rely on the stored mode.
        const paymentMode = req.query?.mode || sessionMeta?.mode || "pay-full";
        // Any mode that is not exactly "pay-full" is a split handled by the frontend
        const isPayFull = !paymentMode || paymentMode === "pay-full";

        console.log("[Telr] AUTH return - mode:", paymentMode, "| isPayFull:", isPayFull);

        if (isPayFull) {
          const metaForSave = {
            amount: sessionMeta?.amount ?? fallbackMeta.amount,
            billAmount: sessionMeta?.billAmount ?? sessionMeta?.amount ?? fallbackMeta.amount,
            tableId: sessionMeta?.tableId ?? fallbackMeta.tableId,
            kotMasterID:
              sessionMeta?.kotMasterID ??
              req.query?.kotMasterID ??
              req.query?.kotMasterId ??
              null,
            serviceFeeAmount: sessionMeta?.serviceFeeAmount ?? 0,
            tipAmount: sessionMeta?.tipAmount ?? 0,
          };

          if (metaForSave.amount && (metaForSave.tableId || metaForSave.kotMasterID)) {
            try {
              paymentResult = await savePayFullPayment({
                billAmount: metaForSave.billAmount,
                tableId: metaForSave.tableId,
                kotMasterID: metaForSave.kotMasterID,
                serviceFeeAmount: metaForSave.serviceFeeAmount,
                tipAmount: metaForSave.tipAmount,
              });
              if (sessionMeta) sessionMeta.processed = true;
            } catch (err) {
              console.error("[Telr] Failed to persist pay full payment:", err);
              message = "Payment authorised, but we could not update the order automatically. Please check with staff.";
            }
          } else {
            console.warn("[Telr] Missing data to persist payment after Telr AUTH", { metaForSave });
          }
        } else {
          // Split payment — frontend will call the correct split API after redirect.
          // Store the Telr-verified amount so the split endpoint can validate the
          // paidAmount the frontend claims (prevents tampered payloads).
          const telrVerifiedAmount = Number(telrData?.order?.amount ?? telrData?.order?.total ?? 0);
          if (sessionMeta) {
            sessionMeta.verifiedAmount = telrVerifiedAmount;
            sessionMeta.processed = true;
          }
          // Re-store with verifiedAmount so the split endpoints can look it up
          // (the session was deleted above but we need it for post-redirect validation)
          if (sessionKey || effectiveOrderRef) {
            storeSession(effectiveOrderRef, {
              ...(sessionMeta || {}),
              sessionKey: sessionKey || sessionMeta?.sessionKey,
              verifiedAmount: telrVerifiedAmount,
              verifiedAt: Date.now(),
            });
          }
          console.log("[Telr] Split payment mode detected. Verified amount:", telrVerifiedAmount, "| Frontend will handle:", paymentMode);
        }
      }
    } catch (err) {
      console.error("[Telr] Check after return failed:", err?.response?.data || err.message);
      message = "Payment authorised. We are finalising your order.";
    }
  } else if (status === "CANCEL") {
    message = "Payment was cancelled. You can close this window.";
    await recordFailedAttempt("CANCEL", sessionMeta, fallbackMeta, effectiveOrderRef);
  } else if (status === "DECLINED") {
    message = "Payment was declined. Please try another method.";
    await recordFailedAttempt("DECLINED", sessionMeta, fallbackMeta, effectiveOrderRef);
  }

  redirectUrl = buildRedirectUrl(
    finalStatus,
    effectiveOrderRef,
    sessionMeta || {},
    {
      paymentId: paymentResult?.paymentId || paymentResult?.PaymentID,
      mode: sessionMeta?.mode || req.query?.mode || null,
    },
    fallbackMeta,
  );

  const html = telrReturnPage(finalStatus, { message, redirectUrl });
  res.send(html);
}

router.get("/api/telr/return/auth", (req, res) => handleReturn(req, res, "AUTH"));
router.get("/api/telr/return/cancel", (req, res) => handleReturn(req, res, "CANCEL"));
router.get("/api/telr/return/declined", (req, res) => handleReturn(req, res, "DECLINED"));

// Internal-only check endpoint — only accessible from the same server (localhost).
// This is NOT meant for frontend use. Remove or protect with an API key before
// exposing externally.
router.post("/api/telr/check", (req, res, next) => {
  const ip = req.ip || req.socket?.remoteAddress || "";
  const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (!isLocal && process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}, async (req, res) => {
  try {
    const { orderRef } = req.body ?? {};
    const data = await telrCheck(orderRef);
    return res.json({ ok: true, data });
  } catch (e) {
    console.error("[Telr] check endpoint error:", {
      message: e?.message,
      status: e?.response?.status,
      data: e?.response?.data,
    });
    return res
      .status(500)
      .json({ error: "check failed", detail: e?.response?.data || e.message });
  }
});

/**
 * GET /api/telr/verified-amount?sessionKey=sess_xxx
 *
 * Returns the Telr-verified payment amount stored during the AUTH callback.
 * Split payment endpoints use this to validate that the paidAmount in the
 * frontend POST body has not been tampered with.
 */
router.get("/api/telr/verified-amount", (req, res) => {
  const sessionKey = req.query?.sessionKey || null;
  if (!sessionKey) {
    return res.status(400).json({ error: "sessionKey is required" });
  }
  const session = getSessionByKey(sessionKey);
  if (!session || session.verifiedAmount === undefined) {
    return res.status(404).json({ error: "No verified amount found for this session" });
  }
  return res.json({
    ok: true,
    verifiedAmount: session.verifiedAmount,
    mode: session.mode || null,
    kotMasterID: session.kotMasterID || null,
  });
});

/**
 * POST /api/telr/webhook
 *
 * Telr calls this URL server-to-server after every authorised payment.
 * This is the safety net for the "browser closes before redirect" scenario:
 * even if the customer's phone loses internet, this endpoint still receives
 * the notification directly from Telr's servers and settles the order.
 *
 * ⚠️  This only works in PRODUCTION where your backend has a public HTTPS URL.
 *     On a local 192.168.x.x network, Telr cannot reach this endpoint.
 *
 * In Telr merchant portal → Store Settings → Notification URL:
 *   https://api.yourrestaurant.ae/api/telr/webhook
 */
router.post("/api/telr/webhook", async (req, res) => {
  // Always respond 200 immediately — Telr retries if it gets a non-200 response
  res.sendStatus(200);

  const orderRef = req.body?.order_ref || req.body?.orderRef || null;
  const statusCode = req.body?.status || null; // "A" = Authorised

  console.log("[Telr:Webhook] Received notification:", { orderRef, statusCode, body: req.body });

  if (!orderRef) {
    console.warn("[Telr:Webhook] No order_ref in webhook body — ignoring.");
    return;
  }

  try {
    // Always re-verify with Telr — never trust the webhook body alone
    const telrData = await telrCheck(orderRef);
    const transactionStatus = telrData?.transaction?.status?.code;
    const orderStatusCode    = Number(telrData?.order?.status?.code);
    const authorised = transactionStatus === "A" || orderStatusCode === 3;

    if (!authorised) {
      console.log("[Telr:Webhook] Payment not authorised, skipping. orderRef:", orderRef);
      return;
    }

    // Look up the session stored when the payment was created
    const session = getSessionByOrderRef(orderRef);

    if (!session) {
      console.warn("[Telr:Webhook] No session found for orderRef:", orderRef,
        "— payment may have already been processed via redirect, or session expired.");
      return;
    }

    if (session.webhookProcessed) {
      console.log("[Telr:Webhook] Already processed via webhook, skipping. orderRef:", orderRef);
      return;
    }

    if (session.processed) {
      console.log("[Telr:Webhook] Already processed via redirect, skipping. orderRef:", orderRef);
      return;
    }

    // Mark as processed before the async work to prevent duplicate settlement
    session.webhookProcessed = true;

    const mode = session.mode || "pay-full";
    console.log("[Telr:Webhook] Processing payment. mode:", mode, "orderRef:", orderRef);

    if (!mode || mode === "pay-full") {
      // Pay Full — the redirect did not process it (browser closed), so we do it here
      const metaForSave = {
        billAmount:  session.billAmount ?? session.amount,
        tableId:     session.tableId,
        kotMasterID: session.kotMasterID,
        serviceFeeAmount: session.serviceFeeAmount ?? 0,
        tipAmount:   session.tipAmount ?? 0,
      };

      if (metaForSave.billAmount && (metaForSave.tableId || metaForSave.kotMasterID)) {
        await savePayFullPayment(metaForSave);
        console.log("[Telr:Webhook] Pay Full settled via webhook. orderRef:", orderRef);
      } else {
        console.warn("[Telr:Webhook] Missing amount/tableId/kotMasterID — cannot settle.", metaForSave);
      }
    } else {
      // Split payment — the backend cannot complete a split without knowing which person
      // is paying (that logic is driven by the frontend session). We log it here so staff
      // can manually resolve if needed. In practice, the customer would retry on their
      // phone since the Telr redirect page shows "Payment Authorised".
      console.warn("[Telr:Webhook] Split payment received via webhook (mode:", mode, "). " +
        "Split payments require the frontend to complete — customer should retry if the page didn't load.");
    }
  } catch (err) {
    console.error("[Telr:Webhook] Error processing notification:", err.message);
  }
});

export default router;

