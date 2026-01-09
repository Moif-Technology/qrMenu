// frontend/src/component/reservation/WaitlistView.jsx
import { useReservationStore } from "../../store/reservationStore";

export default function WaitlistView() {
  const { 
    closeWaitlistView,
    waitlist
  } = useReservationStore();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
        padding: "1rem"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeWaitlistView();
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          padding: "2rem",
          maxWidth: "700px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem"
        }}>
          <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "600" }}>
            Waitlist
          </h2>
          <button
            onClick={closeWaitlistView}
            style={{
              background: "#f3f4f6",
              border: "none",
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              cursor: "pointer",
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              touchAction: "manipulation"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Waitlist Items */}
        <div style={{
          flex: 1,
          overflow: "auto",
          border: "1px solid #e0e0e0",
          borderRadius: "4px"
        }}>
          {waitlist.length === 0 ? (
            <div style={{
              padding: "2rem",
              textAlign: "center",
              color: "#666"
            }}>
              No one on waitlist
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {waitlist.map((item, index) => (
                <div
                  key={item.waitlistId || index}
                  style={{
                    padding: "1rem",
                    borderBottom: index < waitlist.length - 1 ? "1px solid #e0e0e0" : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: "1.125rem",
                      fontWeight: "600",
                      marginBottom: "0.5rem"
                    }}>
                      {item.guestName || 'Guest'}
                    </div>
                    <div style={{
                      fontSize: "0.875rem",
                      color: "#666",
                      display: "flex",
                      gap: "1rem"
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
                        fontSize: "0.875rem",
                        color: "#999",
                        marginTop: "0.25rem",
                        fontStyle: "italic"
                      }}>
                        {item.notes}
                      </div>
                    )}
                  </div>
                  <div style={{
                    display: "flex",
                    gap: "0.5rem"
                  }}>
                    <button
                      onClick={() => alert("Notify - Coming soon")}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "#2196f3",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "0.875rem",
                        cursor: "pointer"
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
                        borderRadius: "4px",
                        fontSize: "0.875rem",
                        cursor: "pointer"
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
                        borderRadius: "4px",
                        fontSize: "0.875rem",
                        cursor: "pointer"
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
      </div>
    </div>
  );
}

