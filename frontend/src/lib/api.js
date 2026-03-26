import axios from "axios";
import { warn } from "./logger";

export const API = axios.create({
  
  baseURL: import.meta.env.VITE_API_BASE_URL || "https://api.deynoqr.com/api",
  // baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api",
  timeout: 60000 // Increased to 60 seconds to handle complex queries with image processing

});


// Force fresh reads for time-sensitive QR/payment endpoints.
API.interceptors.request.use((config) => {
  const method = String(config.method || "get").toLowerCase();
  const url = String(config.url || "");
  const isSensitiveGet =
    method === "get" && (
      url.includes("/payment/balance/") ||
      url.includes("/payment/paid-items/") ||
      url.includes("/telr/check")
    );
  const isResolvePost = method === "post" && url.includes("/r/resolve");

  if (isSensitiveGet || isResolvePost) {
    config.headers = {
      ...(config.headers || {}),
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    };
  }

  if (isSensitiveGet) {
    const nextParams = { ...(config.params || {}) };
    if (nextParams._t == null) nextParams._t = Date.now();
    config.params = nextParams;
  }

  return config;
});


// Retry logic for rate limiting (429 errors)
const MAX_RETRIES = 2;      // Reduced from 3 to 2
const RETRY_DELAY = 2000;   // Increased to 2 seconds

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Response interceptor to add retry logic
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // Don't retry payment completion calls to avoid duplicate payments
    const isPaymentCall =
      config.url?.includes("/payment/") || config.url?.includes("/telr/");

    if (error.response?.status === 429 && !config._retry && !isPaymentCall) {
      config._retry = true;

      let retryCount = config._retryCount || 0;
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        config._retryCount = retryCount;

        // Exponential backoff: 2s, 4s
        const delay = RETRY_DELAY * Math.pow(2, retryCount - 1);
        warn(
          `[API] Rate limited (429). Retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})...`
        );

        await sleep(delay);
        return API(config);
      }
    }

    return Promise.reject(error);
  }
);
