// src/App.jsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import OrderSuccess from "./component/OrderSuccess";
import "./index.css";

import FloorPlanner from "./pages/FloorPLanner";
import MenuPage from "./pages/MenuPage";
import ReservePage from "./pages/ReservePage";
import TableSummary from "./pages/TableSummary";
import FloorOverlayDemo from "./pages/FloorOverlayDemo";

export default function App() {
  return (
    <BrowserRouter>
      <>
        <Routes>
          <Route path="/" element={<MenuPage />} />
          <Route path="/r/:token" element={<TableSummary />} />
          {/* optional fallback */}
             {/* NEW reservation routes */}
          <Route path="/reserve" element={<ReservePage />} />
          <Route path="/r/:token/reserve" element={<ReservePage />} />
           <Route path="/floor-planner" element={<FloorPlanner />} />
            <Route path="/floor-demo" element={<FloorOverlayDemo />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <OrderSuccess />
      </>
    </BrowserRouter>
  );
}
