import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import RestaurantDashboard from "./pages/RestaurantDashboard.jsx";
import { getStoredUser } from "./api.js";

function Home() {
  const user = getStoredUser();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === "superadmin" ? <AdminDashboard /> : <RestaurantDashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
