// frontend/src/component/reservation/BottomNav.jsx
import { useNavigate, useLocation } from "react-router-dom";
import { useReservationStore } from "../../store/reservationStore";
import { CalendarPlus, Users, List, BarChart3 } from "lucide-react";

// Import walk icon PNG - make sure walk-icon.png exists in frontend/src/assets/
import walkIcon from "../../assets/walk.png";

// Use the imported walk icon image
const walkIconSrc = walkIcon;

// Walking icon component (keeping original with image fallback)
function WalkInIcon({ className, isActive }) {
  return (
    <div className={`relative w-7 h-7 flex items-center justify-center ${className || ''}`}>
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
        strokeWidth={isActive ? "2.5" : "2"}
        strokeLinecap="round" 
        strokeLinejoin="round"
        style={{ display: walkIconSrc ? "none" : "block" }}
      >
        <circle cx="7.5" cy="4" r="2" fill="currentColor" />
        <path d="M7.5 6v3.5" />
        <path d="M6 9.5l-1.5 2.5v3.5" />
        <path d="M9 9.5l1.5 2.5v3.5" />
        <path d="M4.5 15.5l1 2" />
        <path d="M10.5 15.5l-1 2" />
      </svg>
      {/* Plus sign overlay - matching original style */}
      <div
        className="absolute -top-0.5 -right-2.5 w-4 h-4 rounded-full flex items-center justify-center shadow-sm"
        style={{ backgroundColor: "#C91A4D", zIndex: 10 }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
    </div>
  );
}

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine active route
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navItems = [
    {
      id: 'walkin',
      label: 'Walk-in',
      icon: WalkInIcon,
      href: "/walk-in",
      active: isActive("/walk-in")
    },
    {
      id: 'reservation',
      label: 'Reservation',
      icon: CalendarPlus,
      href: "/reservation-form",
      active: isActive("/reservation-form")
    },
    {
      id: 'customers',
      label: 'Customers',
      icon: Users,
      href: "/customers",
      active: isActive("/customers")
    },
    {
      id: 'list',
      label: 'List',
      icon: List,
      href: "/reservation-list",
      active: isActive("/reservation-list")
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: BarChart3,
      href: "/reports",
      active: isActive("/reports")
    }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="mx-auto max-w-4xl px-2 sm:px-4 md:px-6 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around py-1.5 sm:py-2 md:py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.active;
            
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.href)}
                className={`
                  relative flex items-center justify-center transition-all duration-200 ease-out
                  active:scale-95 group rounded-2xl
                  flex-col gap-0.5 px-3 py-2
                  sm:flex-row sm:gap-2.5 sm:px-5 sm:py-3
                  md:px-6 md:py-3.5
                  ${
                    active
                      ? 'sm:text-white sm:shadow-lg sm:shadow-rose-500/25'
                      : 'text-gray-500 hover:bg-rose-50/50 sm:hover:bg-gray-100 sm:hover:text-white'
                  }
                `}
                style={{
                  // Mobile: colored text on light background
                  // Tablet+: white text on colored background
                  color: active ? '#C91A4D' : undefined,
                  backgroundColor: active ? '#FBE6EC' : undefined,
                  ...(typeof window !== 'undefined' && window.innerWidth >= 640 && active ? {
                    backgroundColor: '#C91A4D',
                    color: '#FFFFFF'
                  } : {})
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.color = '#C91A4D';
                    if (window.innerWidth >= 640) {
                      e.currentTarget.style.backgroundColor = '#C91A4D';
                      e.currentTarget.style.color = '#FFFFFF';
                    }
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.backgroundColor = '';
                    e.currentTarget.style.color = '';
                  }
                }}
              >
                {/* Icon with badge */}
                <div className="relative">
                  <Icon 
                    className={`transition-transform duration-200 ${
                      active ? 'scale-110' : 'group-hover:scale-105'
                    }`}
                    isActive={active}
                  />
                  {/* Badge for waitlist count */}
                  {item.badge && item.badge > 0 && (
                    <span 
                      className={`absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold shadow-md z-10 border-2 border-white ${
                        active ? 'sm:bg-white sm:text-[#C91A4D]' : ''
                      }`}
                      style={{
                        backgroundColor: '#C91A4D',
                        color: '#FFFFFF',
                        ...(typeof window !== 'undefined' && window.innerWidth >= 640 && active ? {
                          backgroundColor: '#FFFFFF',
                          color: '#C91A4D'
                        } : {})
                      }}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </div>
                {/* Label */}
                <span className={`
                  whitespace-nowrap transition-all duration-200
                  text-[10px] sm:text-sm md:text-base
                  ${active ? 'font-semibold sm:font-bold' : 'font-medium'}
                `}>
                  {item.label}
                </span>
                {/* Mobile active indicator dot */}
                {active && (
                  <span 
                    className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full sm:hidden"
                    style={{ backgroundColor: '#C91A4D' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
