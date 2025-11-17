import axios from "axios";

export const API = axios.create({
  // Change only if your backend runs elsewhere
  baseURL: import.meta.env?.VITE_API_BASE_URL || "http://192.168.70.186:5001/api",
  timeout: 10000
});

// Optional: attach interceptors later (auth, errors, etc.)
// API.interceptors.response.use(r => r, err => Promise.reject(err));