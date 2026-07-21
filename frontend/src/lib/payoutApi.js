// frontend/src/lib/payoutApi.js
// Payout console API client (merged in from qrmenu-dashboard/frontend/src/api.js).
// Same backend host as the main API client, just under the /payout prefix -
// one backend service instead of a second process on its own port.
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_PAYOUT_API_URL
    || `${import.meta.env.VITE_API_BASE_URL || "http://192.168.0.104:5001/api"}/payout`
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("dash_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("dash_token");
      localStorage.removeItem("dash_user");
      if (window.location.pathname !== "/payout/login") window.location.href = "/payout/login";
    }
    return Promise.reject(err);
  }
);

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("dash_user") || "null");
  } catch {
    return null;
  }
}

export function storeSession(token, user) {
  localStorage.setItem("dash_token", token);
  localStorage.setItem("dash_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("dash_token");
  localStorage.removeItem("dash_user");
}

export default api;
