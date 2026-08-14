import axios from "axios";

export const API = axios.create({
  // Local dev overrides this via frontend/.env.local (gitignored); .env.production
  // supplies it on build. The fallback stays pointed at production so a build with
  // a missing env file degrades to the right host instead of a LAN address.
  baseURL: import.meta.env.VITE_API_BASE_URL || "https://api.deynoqr.com/api",
  timeout: 60000, // Increased to 60 seconds to handle complex queries with image processing
});

export const ADMIN_TOKEN_KEY = "admin_token";

// Attach admin JWT (if present) to every request. Admin-only routes require it;
// public routes ignore it.
API.interceptors.request.use((config) => {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem(ADMIN_TOKEN_KEY) : null;
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Do not retry 429 responses. Retrying rate-limited requests from every client
// quickly burns the backend quota and makes the outage last longer.
//
// 401 handling matters now that qr-menu and package writes actually check the
// token: without this an expired session surfaces as "Failed to save" with no
// way out. Mirrors payoutApi.js, which already did this.
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      // Only bounce admin screens. A diner hitting a public route should never
      // be redirected to an admin login.
      const path = window.location.pathname;
      if (path.startsWith("/admin") && path !== "/admin/login") {
        window.location.href = "/admin/login";
      }
    }
    return Promise.reject(error);
  }
);
