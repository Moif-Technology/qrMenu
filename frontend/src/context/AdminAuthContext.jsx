import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API, ADMIN_TOKEN_KEY } from "../lib/api";

const ADMIN_USER_KEY = "admin_user";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(ADMIN_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const persist = useCallback((token, nextUser) => {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    if (nextUser) localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser || null);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    setUser(null);
  }, []);

  const login = useCallback(async (loginId, password) => {
    const { data } = await API.post("/admin/login", { login: loginId, password });
    if (!data?.ok || !data?.token) {
      throw new Error(data?.error || "Login failed");
    }
    persist(data.token, data.user);
    return data.user;
  }, [persist]);

  // Validate any stored token on mount.
  useEffect(() => {
    let active = true;
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    API.get("/admin/me")
      .then(({ data }) => {
        if (!active) return;
        if (data?.ok && data?.user) {
          localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(data.user));
          setUser(data.user);
        } else {
          logout();
        }
      })
      .catch(() => active && logout())
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [logout]);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: !!user, login, logout }),
    [user, loading, login, logout]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
