// frontend/src/component/reservation/BottomNav.jsx
import { useNavigate, useLocation } from "react-router-dom";
import { useReservationStore } from "../../store/reservationStore";

// Import walk icon PNG - make sure walk-icon.png exists in frontend/src/assets/
import walkIcon from "../../assets/walk.png";

// Use the imported walk icon image
const walkIconSrc = walkIcon;

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { waitlistCount } = useReservationStore();

  // Determine active route
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              

  const navItems = [
    {
      id: 'walkin',
      label: 'Walk-in',
      icon: (
        <div style={{ position: "relative", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Walking icon image - add walk.png to frontend/src/assets/ */}
          {walkIconSrc ? (
            <img 
              src={walkIconSrc} 
              alt="walk"
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = e.target.parentElement.querySelector('.walk-fallback');
                if (fallback) fallback.style.display = 'block';
              }}
              style={{
                width: "22px",
                height: "22px",
                objectFit: "contain"
              }}
            />
          ) : null}
          {/* Fallback SVG if image not found */}
          <svg 
            className="walk-fallback"
            width="22" 
            height="22" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            style={{ display: walkIconSrc ? "none" : "block" }}
          >
            <circle cx="7.5" cy="4" r="2" fill="currentColor" />
            <path d="M7.5 6v3.5" strokeWidth="2" />
            <path d="M6 9.5l-1.5 2.5v3.5" strokeWidth="2" />
            <path d="M9 9.5l1.5 2.5v3.5" strokeWidth="2" />
            <path d="M4.5 15.5l1 2" strokeWidth="2" />
            <path d="M10.5 15.5l-1 2" strokeWidth="2" />
          </svg>
          {/* Plus sign overlay - more visible */}
          <div style={{
            position: "absolute",
            top: "-2px",
            right: "-10px",
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            backgroundColor: "#C91A4D",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            zIndex: 10
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        </div>
      ),
      onClick: () => navigate("/walk-in"),
      active: isActive("/walk-in"),
      color: '#C91A4D'
    },
    {
      id: 'reservation',
      label: 'Reservation',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      onClick: () => navigate("/reservation-form"),
      active: isActive("/reservation-form"),
      color: '#C91A4D'
    },
    {
      id: 'waitlist',
      label: 'Waitlist',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      onClick: () => navigate("/waitlist"),
      active: isActive("/waitlist"),
      color: '#A80F3D',
      badge: waitlistCount > 0 ? waitlistCount : null
    },
    {
      id: 'list',
      label: 'List',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
      onClick: () => navigate("/reservation-list"),
      active: isActive("/reservation-list"),
      color: '#7A0026'
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      onClick: () => navigate("/reports"),
      active: isActive("/reports"),
      color: '#9F1239'
    }
  ];

  return (
    <nav style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: "#ffffff",
      borderTop: "1px solid #e5e7eb",
      boxShadow: "0 -2px 10px rgba(0,0,0,0.05)",
      zIndex: 100,
      padding: "0.5rem 0 calc(0.5rem + env(safe-area-inset-bottom))",
      display: "flex",
      justifyContent: "space-around",
      alignItems: "center"
    }}>
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={item.onClick}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.25rem",
            padding: "0.5rem 0.75rem",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            position: "relative",
            minWidth: "60px",
            minHeight: "60px",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent"
          }}
        >
          <div style={{
            position: "relative",
            color: item.active ? item.color : "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s"
          }}>
            {item.icon}
            {item.badge && (
              <span style={{
                position: "absolute",
                top: "-8px",
                right: "-8px",
                backgroundColor: "#ef4444",
                color: "#fff",
                borderRadius: "50%",
                width: "18px",
                height: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.625rem",
                fontWeight: "700",
                border: "2px solid #fff"
              }}>
                {item.badge}
              </span>
            )}
          </div>
          <span style={{
            fontSize: "0.6875rem",
            fontWeight: item.active ? "700" : "500",
            color: item.active ? item.color : "#6b7280"
          }}>
            {item.label}
          </span>
          {item.active && (
            <div style={{
              position: "absolute",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "28px",
              height: "3px",
              backgroundColor: item.color,
              borderRadius: "3px 3px 0 0"
            }} />
          )}
        </button>
      ))}
    </nav>
  );
}
