import axios from "axios";
import { warn } from "./logger";

export const API = axios.create({
  
  baseURL: import.meta.env.VITE_API_BASE_URL || "https://api.deynoqr.com/api",
  // baseURL: import.meta.env.VITE_API_BASE_URL || "http://192.168.0.195:5001/api",
  timeout: 60000 // Increased to 60 seconds to handle complex queries with image processing

});


// Retry logic for rate limiting (429 errors)
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY = 3000;

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

    if (error.response?.status === 429 && !isPaymentCall) {
      const retryCount = config._retryCount || 0;
      if (retryCount < MAX_RETRIES) {
        config._retryCount = retryCount + 1;

        // Exponential backoff with jitter: 2s, 4s, 8s (±20% jitter)
        const base = BASE_RETRY_DELAY * Math.pow(2, retryCount);
        const jitter = base * 0.2 * (Math.random() - 0.5);
        const delay = Math.round(base + jitter);
        warn(
          `[API] Rate limited (429). Retrying in ${delay}ms (attempt ${config._retryCount}/${MAX_RETRIES})...`
        );

        await sleep(delay);
        return API(config);
      }
    }

    return Promise.reject(error);
  }
);
