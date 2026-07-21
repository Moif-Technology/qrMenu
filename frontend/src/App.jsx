// src/App.jsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import OrderSuccess from "./component/OrderSuccess";
import "./index.css";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import RequireAdmin from "./component/admin/RequireAdmin";

// Detect which context we're in at module-load time.
// "/opaia" prefix  → Opaia restaurant context (entry + menu).
// root (no prefix) → DeynoQR public landing page.
// A full page reload is required to switch contexts, which is expected
// when navigating between the landing page and a restaurant subdirectory.
function getBasename() {
  const p = typeof window !== "undefined" ? window.location.pathname : "";
  if (p.startsWith("/opaia")) return "/opaia";
  if (p.startsWith("/bonfood")) return "/bonfood";
  if (p.startsWith("/payout")) return "/payout";
  return "";
}
export const RESTAURANT_BASE_PATH = "/opaia";


const isOpaiaContext =
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/opaia");

const isBonfoodContext =
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/bonfood");

// Payout console (merged in from qrmenu-dashboard) - own login/auth,
// own full-reload boundary just like /opaia and /bonfood.
const isPayoutContext =
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/payout");

// app.deynoqr.com = LandingPage + OpaiaEntryPage
// deynoqr.com     = QR menu app (entry + menu + admin)
const isAppDomain =
  typeof window !== "undefined" &&
  window.location.hostname.startsWith("app.");

// Guest-facing routes must show the restaurant name in the URL
// (deynoqr.com/opaia/menu, not deynoqr.com/menu). Printed QR codes and old
// links still point at the unprefixed paths, so redirect them into the
// /opaia context before the router mounts. Admin, legal, and reservation
// staff pages stay unprefixed.
const GUEST_ROUTE_RE = /^\/(menu$|r\/|package\/)/;
if (
  typeof window !== "undefined" &&
  !isAppDomain &&
  getBasename() === "" &&
  GUEST_ROUTE_RE.test(window.location.pathname)
) {
  window.location.replace(
    RESTAURANT_BASE_PATH +
      window.location.pathname +
      window.location.search +
      window.location.hash
  );
}

// Public landing page
const LandingPage = lazy(() => import("./pages/LandingPage"));

// Opaia restaurant entry page
const OpaiaEntryPage = lazy(() => import("./pages/OpaiaEntryPage"));

// Coming soon page for restaurants not yet live
const LaunchingSoonPage = lazy(() => import("./pages/LaunchingSoonPage"));

// Company info / legal pages
const AboutUsPage = lazy(() => import("./pages/AboutUsPage"));
const RefundPolicyPage = lazy(() => import("./pages/RefundPolicyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));

// Existing restaurant pages
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
const ReservationDetailsPage = lazy(() =>
  import("./pages/ReservationDetailsPage")
);
const WalkInSuccessPage = lazy(() => import("./pages/WalkInSuccessPage"));
const ReservationSuccessPage = lazy(() =>
  import("./pages/ReservationSuccessPage")
);
const GuestReservationPage = lazy(() => import("./pages/GuestReservationPage"));

// Payout console
const PayoutRouter = lazy(() => import("./pages/payout/PayoutRouter"));

// Admin portal
const AdminLayout = lazy(() => import("./component/admin/AdminLayout"));
const AdminLoginPage = lazy(() => import("./pages/admin/AdminLoginPage"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminWaitlist = lazy(() => import("./pages/admin/AdminWaitlist"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminQRCodes = lazy(() => import("./pages/admin/AdminQRCodes"));
const AdminMenu = lazy(() => import("./pages/admin/AdminMenu"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter basename={getBasename()}>
      <AdminAuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {isPayoutContext ? (
              /* ── Payout console: own login + full-reload boundary ── */
              <Route path="/*" element={<PayoutRouter />} />
            ) : (
              <>
                {/* ── Root route differs by context ── */}
                <Route
                  path="/"
                  element={
                    isOpaiaContext ? <OpaiaEntryPage /> :
                    isBonfoodContext ? <LaunchingSoonPage name="Bonfood" /> :
                    isAppDomain ? <LandingPage /> :
                    <OpaiaEntryPage />
                  }
                />

                {/* ── Company info / legal (public, unprefixed) ── */}
                <Route path="/about" element={<AboutUsPage />} />
                <Route path="/refund-policy" element={<RefundPolicyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />

                {/* ── Restaurant menu ──
                    In the opaia context: URL = /opaia/menu  → MenuPage
                    In root context: not linked (but renders if navigated to directly) */}
                <Route path="/menu" element={<MenuPage />} />

                {/* ── Existing routes (unchanged) ── */}
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
                <Route
                  path="/reservation-details"
                  element={<ReservationDetailsPage />}
                />
                <Route path="/walk-in-success" element={<WalkInSuccessPage />} />
                <Route
                  path="/reservation-success"
                  element={<ReservationSuccessPage />}
                />
                <Route
                  path="/mt/opaiareservation"
                  element={<GuestReservationPage />}
                />

                {/* ── Admin portal ── */}
                <Route path="/admin/login" element={<AdminLoginPage />} />
                <Route
                  path="/admin"
                  element={
                    <RequireAdmin>
                      <AdminLayout />
                    </RequireAdmin>
                  }
                >
                  <Route index element={<Navigate to="overview" replace />} />
                  <Route path="overview" element={<AdminOverview />} />
                  <Route path="waitlist" element={<AdminWaitlist />} />
                  <Route path="customers" element={<AdminCustomers />} />
                  <Route path="menu" element={<AdminMenu />} />
                  <Route path="qr-codes" element={<AdminQRCodes />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            )}
          </Routes>
          <OrderSuccess />
        </Suspense>
      </AdminAuthProvider>
    </BrowserRouter>
  );
}
