import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api"
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
      if (window.location.pathname !== "/login") window.location.href = "/login";
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
