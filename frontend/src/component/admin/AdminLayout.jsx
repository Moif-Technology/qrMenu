import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Clock, Users, UtensilsCrossed,
  QrCode, BarChart3, LogOut, Menu as MenuIcon, X, Settings, MessageCircle,
} from "lucide-react";
import { useAdminAuth } from "../../context/AdminAuthContext";

const NAV = [
  { to: "/admin/overview", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/waitlist", label: "Waitlist", icon: Clock },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/admin/qr-codes", label: "QR Codes", icon: QrCode },
  { to: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function NavItems({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-1.5 px-4">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-semibold transition-colors ${
                isActive
                  ? "text-[var(--ink)]"
                  : "text-[#E3B6C4] hover:text-[#FFF1F5]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute inset-0 rounded-xl bg-[var(--brass-soft)]" />
                )}
                <span className={`absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-full transition-all ${isActive ? "bg-[var(--brass)]" : "bg-transparent"}`} />
                <Icon className="relative h-[18px] w-[18px] shrink-0" />
                <span className="relative">{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/admin/login", { replace: true });
  };

  const initials = (user?.name || "A").trim().slice(0, 1).toUpperCase();

  const Sidebar = (
    <div className="flex h-full flex-col" style={{ background: "linear-gradient(170deg, #5E0017 0%, #7A0026 50%, #A81038 100%)" }}>
      {/* Wordmark */}
      <div className="px-6 pt-7 pb-6">
        <p className="admin-eyebrow !text-[#F4B9CA]">Opaia</p>
        <h1 className="font-display text-[26px] leading-none text-[#FFF1F5] mt-1">
          Maître<span className="text-[#F4B9CA]">.</span>
        </h1>
        <p className="text-[11px] text-[#D69EAE] mt-1.5 tracking-wide">Reservation Studio</p>
      </div>

      <div className="mx-6 admin-rule !bg-[#93324F]" />

      <div className="flex-1 overflow-y-auto py-5">
        <NavItems onNavigate={() => setDrawerOpen(false)} />
      </div>

      {/* User */}
      <div className="m-4 rounded-2xl bg-[#5E0017] p-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#F4B9CA] flex items-center justify-center font-display text-lg text-[#7A0026]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#FFF1F5] truncate">{user?.name || "Admin"}</p>
            <p className="text-[11px] text-[#D69EAE] tracking-wide">{user?.designation || "ADMIN"}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="h-9 w-9 rounded-lg flex items-center justify-center text-[#E3B6C4] hover:text-[#FFD7C7] hover:bg-black/20 transition"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="admin-root min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[268px] flex-col">{Sidebar}</aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-[var(--ink)]/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-[268px] max-w-[82%] admin-rise">{Sidebar}</div>
          <button
            className="absolute top-4 right-4 text-[#FFF1F5]"
            onClick={() => setDrawerOpen(false)}
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      )}

      {/* Main */}
      <div className="lg:pl-[268px]">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3.5" style={{ background: "linear-gradient(110deg, #7A0026 0%, #A81038 100%)" }}>
          <button onClick={() => setDrawerOpen(true)} className="text-[#FFF1F5]">
            <MenuIcon className="h-6 w-6" />
          </button>
          <span className="font-display text-xl text-[#FFF1F5]">Maître<span className="text-[#F4B9CA]">.</span></span>
          <button onClick={handleLogout} className="text-[#E3B6C4]">
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        <main className="px-5 py-7 sm:px-8 sm:py-10 xl:px-12">
          <div className="mx-auto w-full max-w-[1500px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
