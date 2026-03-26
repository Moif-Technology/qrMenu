// src/App.jsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import OrderSuccess from "./component/OrderSuccess";
import "./index.css";

// Support both /opaia/ and root (/) so existing QR codes with /opaia/ keep working
// and the app also works without /opaia (e.g. at root). No change to existing QR codes needed.
function getBasename() {
  const p = typeof window !== "undefined" ? window.location.pathname : "";
  return p.startsWith("/opaia") ? "/opaia" : "";
}
export const RESTAURANT_BASE_PATH = "/opaia"; // for reference; router uses getBasename()

// Lazy load pages for faster initial load
const MenuPage = lazy(() => import("./pages/MenuPage"));
const PackageDetailsPage = lazy(() => import("./pages/PackageDetailsPage"));
const TableSummary = lazy(() => import("./pages/TableSummary"));
const QRGenerator = lazy(() => import("./pages/QRGenerator"));
const QRMenuManagement = lazy(() => import("./pages/QRMenuManagement"));
const ReservationPage = lazy(() => import("./pages/ReservationPage"));
const WalkInPage = lazy(() => import("./pages/WalkInPage"));
const ReservationFormPage = lazy(() => import("./pages/ReservationFormPage"));
const TableActionPage = lazy(() => import("./pages/TableActionPage"));
const ReservationListPage = lazy(() => import("./pages/ReservationListPage"));
const WaitlistPage = lazy(() => import("./pages/WaitlistPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const ReservationDetailsPage = lazy(() => import("./pages/ReservationDetailsPage"));
const WalkInSuccessPage = lazy(() => import("./pages/WalkInSuccessPage"));
const ReservationSuccessPage = lazy(() => import("./pages/ReservationSuccessPage"));
const GuestReservationPage = lazy(() => import("./pages/GuestReservationPage"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter basename={getBasename()}>
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
    </BrowserRouter>
  );
}
