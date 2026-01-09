// frontend/src/pages/WaitlistPage.jsx
import { useNavigate } from "react-router-dom";
import { useReservationStore } from "../store/reservationStore";
import BottomNav from "../component/reservation/BottomNav";

export default function WaitlistPage() {
  const navigate = useNavigate();
  const { waitlist } = useReservationStore();

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#f9fafb",
      display: "flex",
      flexDirection: "column",
      paddingBottom: "70px"
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        padding: "1rem 1.5rem",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        position: "sticky",
        top: 0,
        zIndex: 10
      }}>
        <button
          onClick={() => navigate("/reservation")}
          style={{
            background: "#f3f4f6",
            border: "none",
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            fontSize: "1.125rem",
            cursor: "pointer",
            color: "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            touchAction: "manipulation"
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 style={{ 
          margin: 0, 
          fontSize: "1.5rem", 
          fontWeight: "700",
          color: "#111827",
          flex: 1
        }}>
          Waitlist
        </h1>
        <button
          onClick={() => navigate("/reservation")}
          style={{
            background: "#f3f4f6",
            border: "none",
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            cursor: "pointer",
            color: "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            touchAction: "manipulation",
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#FBE6EC";
            e.currentTarget.style.color = "#C91A4D";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#f3f4f6";
            e.currentTarget.style.color = "#6b7280";
          }}
          aria-label="Home"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
      </div>

      {/* Waitlist Items */}
      <div style={{
        flex: 1,
        padding: "1rem 1.5rem",
        overflow: "auto",
        WebkitOverflowScrolling: "touch"
      }}>
        {waitlist.length === 0 ? (
          <div style={{
            padding: "3rem 2rem",
            textAlign: "center",
            color: "#6b7280"
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ margin: "0 auto 1rem" }}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div style={{ fontSize: "0.875rem", fontWeight: "500" }}>
              No one on waitlist
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {waitlist.map((item, index) => (
              <div
                key={item.waitlistId || index}
                style={{
                  padding: "1rem",
                  backgroundColor: "#fff",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem"
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "1rem",
                    fontWeight: "600",
                    marginBottom: "0.5rem"
                  }}>
                    {item.guestName || 'Guest'}
                  </div>
                  <div style={{
                    fontSize: "0.8125rem",
                    color: "#6b7280",
                    display: "flex",
                    gap: "1rem",
                    flexWrap: "wrap"
                  }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      {item.phone || '-'}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      {item.pax || item.partySize || '-'} guests
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Added: {item.addedTime || '-'}
                    </span>
                    {item.etaMinutes && (
                      <span>ETA: {item.etaMinutes} mins</span>
                    )}
                  </div>
                  {item.notes && (
                    <div style={{
                      fontSize: "0.8125rem",
                      color: "#9ca3af",
                      marginTop: "0.5rem",
                      fontStyle: "italic"
                    }}>
                      {item.notes}
                    </div>
                  )}
                </div>
                <div style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexDirection: "column"
                }}>
                  <button
                    onClick={() => alert("Notify - Coming soon")}
                    style={{
                      padding: "0.5rem 1rem",
                      backgroundColor: "#2196f3",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      fontWeight: "600"
                    }}
                  >
                    Notify
                  </button>
                  <button
                    onClick={() => alert("Seat Now - Coming soon")}
                    style={{
                      padding: "0.5rem 1rem",
                      backgroundColor: "#4caf50",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      fontWeight: "600"
                    }}
                  >
                    Seat Now
                  </button>
                  <button
                    onClick={() => alert("Remove - Coming soon")}
                    style={{
                      padding: "0.5rem 1rem",
                      backgroundColor: "#f44336",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      fontWeight: "600"
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}

