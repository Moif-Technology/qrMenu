import axios from "axios";

export const API = axios.create({
  // baseURL: import.meta.env.VITE_API_BASE_URL || "https://api.deynoqr.com/api", 
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://192.168.1.55:5001/api",
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
API.interceptors.response.use(
  (response) => response,
  async (error) => Promise.reject(error)
);
