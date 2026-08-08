// frontend/src/pages/payout/PayoutRouter.jsx
// Payout console sub-app, mounted at the /payout basename (merged in from
// qrmenu-dashboard/frontend/src/App.jsx). Own login + role-based home,
// separate from the main admin portal's auth.
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "./payout.css";
import Login from "./Login.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import RestaurantDashboard from "./RestaurantDashboard.jsx";
import api, { getStoredUser, storeSession, clearSession } from "../../lib/payoutApi.js";

function Home() {
  const [user, setUser] = useState(() => getStoredUser());
  const [checking, setChecking] = useState(() => Boolean(localStorage.getItem("dash_token")));

  useEffect(() => {
    let alive = true;
    const token = localStorage.getItem("dash_token");
    if (!token) {
      setChecking(false);
      return () => { alive = false; };
    }

    api.get("/auth/me")
      .then(({ data }) => {
        if (!alive) return;
        if (data?.user) {
          storeSession(token, data.user);
          setUser(data.user);
        }
      })
      .catch(() => {
        if (!alive) return;
        clearSession();
        setUser(null);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });

    return () => { alive = false; };
  }, []);

  if (checking) {
    return (
      <div className="min-h-dvh grid place-items-center px-4 text-sm text-zinc-400">
        Checking session...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return user.role === "superadmin" ? <AdminDashboard /> : <RestaurantDashboard />;
}

export default function PayoutRouter() {
  return (
    <div className="payout-app">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
