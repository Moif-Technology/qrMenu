// frontend/src/pages/payout/PayoutRouter.jsx
// Payout console sub-app, mounted at the /payout basename (merged in from
// qrmenu-dashboard/frontend/src/App.jsx). Own login + role-based home,
// separate from the main admin portal's auth.
import { Navigate, Route, Routes } from "react-router-dom";
import "./payout.css";
import Login from "./Login.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import RestaurantDashboard from "./RestaurantDashboard.jsx";
import { getStoredUser } from "../../lib/payoutApi.js";

function Home() {
  const user = getStoredUser();
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
