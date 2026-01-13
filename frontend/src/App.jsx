// src/App.jsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import OrderSuccess from "./component/OrderSuccess";
import "./index.css";

import MenuPage from "./pages/MenuPage";
import PackageDetailsPage from "./pages/PackageDetailsPage";
import TableSummary from "./pages/TableSummary";
import QRGenerator from "./pages/QRGenerator";
import QRMenuManagement from "./pages/QRMenuManagement";
import ReservationPage from "./pages/ReservationPage";
import WalkInPage from "./pages/WalkInPage";
import ReservationFormPage from "./pages/ReservationFormPage";
import TableActionPage from "./pages/TableActionPage";
import ReservationListPage from "./pages/ReservationListPage";
import WaitlistPage from "./pages/WaitlistPage";
import CustomersPage from "./pages/CustomersPage";
import ReportsPage from "./pages/ReportsPage";
import ReservationDetailsPage from "./pages/ReservationDetailsPage";
import WalkInSuccessPage from "./pages/WalkInSuccessPage";
import ReservationSuccessPage from "./pages/ReservationSuccessPage";
import GuestReservationPage from "./pages/GuestReservationPage";

export default function App() {
  return (
    <BrowserRouter>
      <>
        <Routes>
          <Route path="/" element={<MenuPage />} />
          <Route path="/package/:packageId" element={<PackageDetailsPage />} />
          <Route path="/r/:token" element={<TableSummary />} />
          <Route path="/qr-generator" element={<QRGenerator />} />
          <Route path="/qr-menu-management" element={<QRMenuManagement />} />
          <Route path="/reservation" element={<ReservationPage />} />
          <Route path="/walk-in" element={<WalkInPage />} />
          <Route path="/reservation-form" element={<ReservationFormPage />} />
          <Route path="/table-action" element={<TableActionPage />} />
          <Route path="/reservation-list" element={<ReservationListPage />} />
          <Route path="/waitlist" element={<WaitlistPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reservation-details" element={<ReservationDetailsPage />} />
          <Route path="/walk-in-success" element={<WalkInSuccessPage />} />
          <Route path="/reservation-success" element={<ReservationSuccessPage />} />
          <Route path="/mt/opaiareservation" element={<GuestReservationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <OrderSuccess />
      </>
    </BrowserRouter>
  );
}
