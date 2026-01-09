// frontend/src/component/reservation/StatusSelector.jsx
import { useState } from "react";

const statusCategories = {
  "PRE-SERVICE": [
    {
      id: "HOLD",
      label: "Hold",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="10" y1="8" x2="10" y2="16" />
          <line x1="14" y1="8" x2="14" y2="16" />
        </svg>
      ),
      color: "#6b7280"
    },
    {
      id: "BOOKED",
      label: "Booked",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      ),
      color: "#3b82f6"
    },
    {
      id: "LEFT_MESSAGE",
      label: "Left Message",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 10h8" />
          <path d="M8 14h6" />
        </svg>
      ),
      color: "#8b5cf6"
    },
    {
      id: "NO_ANSWER",
      label: "No Answer",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          <circle cx="18" cy="6" r="1" fill="currentColor" />
        </svg>
      ),
      color: "#f59e0b"
    },
    {
      id: "WRONG_NUMBER",
      label: "Wrong Number",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          <line x1="18" y1="6" x2="18" y2="6" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ),
      color: "#ef4444"
    },
    {
      id: "CONFIRMED",
      label: "Confirmed",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      ),
      color: "#10b981"
    },
    {
      id: "ARRIVED",
      label: "Arrived",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" fill="#fff" />
        </svg>
      ),
      color: "#14b8a6"
    },
    {
      id: "PARTIALLY_ARRIVED",
      label: "Partially Arrived",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" fill="currentColor" />
        </svg>
      ),
      color: "#14b8a6"
    }
  ],
  "IN-SERVICE": [
    {
      id: "LATE",
      label: "Late",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" stroke="#fff" strokeWidth="2" fill="none" />
          <circle cx="12" cy="8" r="1" fill="#fff" />
        </svg>
      ),
      color: "#fbbf24"
    },
    {
      id: "CANCELLED",
      label: "Canceled",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="8" r="1" fill="#fff" />
          <line x1="9" y1="12" x2="15" y2="12" stroke="#fff" strokeWidth="2" />
        </svg>
      ),
      color: "#ec4899"
    },
    {
      id: "CANCELLED_NOTIFY",
      label: "Canceled And Notify",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="8" r="1" fill="#fff" />
          <line x1="9" y1="12" x2="15" y2="12" stroke="#fff" strokeWidth="2" />
          <circle cx="18" cy="6" r="1.5" fill="#fff" />
        </svg>
      ),
      color: "#ec4899"
    },
    {
      id: "NO_SHOW",
      label: "No Show",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="8" r="1" fill="currentColor" />
          <line x1="9" y1="12" x2="15" y2="12" strokeWidth="2" />
        </svg>
      ),
      color: "#9ca3af"
    },
    {
      id: "PARTIALLY_SEATED",
      label: "Partially Seated",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2v20M2 12h20" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="5" fill="currentColor" fillOpacity="0.5" />
        </svg>
      ),
      color: "#3b82f6"
    },
    {
      id: "SEATED",
      label: "Seated",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
        </svg>
      ),
      color: "#3b82f6"
    }
  ],
  "POST-SERVICE": [
    {
      id: "PAID",
      label: "Paid",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
          <text x="12" y="16" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="bold">$</text>
        </svg>
      ),
      color: "#14b8a6"
    },
    {
      id: "BUS_TABLE",
      label: "Bus Table",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 8h8v8H8z" fill="#fff" opacity="0.8" />
        </svg>
      ),
      color: "#f472b6"
    },
    {
      id: "LEFT",
      label: "Left",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 8 16 12 12 16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      ),
      color: "#9ca3af"
    }
  ]
};

export default function StatusSelector({ reservation, onStatusChange, onClose }) {
  const [expandedCategory, setExpandedCategory] = useState(null);

  const handleStatusSelect = (statusId) => {
    onStatusChange(reservation, statusId);
    onClose();
  };

  const toggleCategory = (category) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)"
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "20px",
          boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
          width: "100%",
          maxWidth: "400px",
          maxHeight: "85vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "20px",
          background: "linear-gradient(135deg, #7A0026, #C91A4D)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "800", color: "#fff", marginBottom: "4px" }}>
              {reservation?.customerName || "Guest"}
            </div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
              {reservation?.reservationTime || ""} • {reservation?.numberOfGuests || 0} guests
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              border: "none",
              background: "rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.3)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Status Categories */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          background: "#fdf8fa"
        }}>
          {Object.entries(statusCategories).map(([category, statuses]) => (
            <div key={category} style={{ marginBottom: "16px" }}>
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  background: expandedCategory === category ? "#FBE6EC" : "#f9fafb",
                  border: expandedCategory === category ? "2px solid #C91A4D" : "1px solid #e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  borderRadius: "12px",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  if (expandedCategory !== category) {
                    e.currentTarget.style.background = "#FBE6EC";
                    e.currentTarget.style.borderColor = "#C91A4D";
                  }
                }}
                onMouseLeave={(e) => {
                  if (expandedCategory !== category) {
                    e.currentTarget.style.background = "#f9fafb";
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }
                }}
              >
                <span style={{
                  fontSize: "13px",
                  fontWeight: "800",
                  color: expandedCategory === category ? "#C91A4D" : "#374151",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}>
                  {category}
                </span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{
                    transform: expandedCategory === category ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                    color: expandedCategory === category ? "#C91A4D" : "#6b7280"
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Status Options */}
              {expandedCategory === category && (
                <div style={{ paddingLeft: "8px", marginTop: "8px" }}>
                  {statuses.map((status) => (
                    <button
                      key={status.id}
                      onClick={() => handleStatusSelect(status.id)}
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        marginBottom: "8px",
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#FBE6EC";
                        e.currentTarget.style.borderColor = "#C91A4D";
                        e.currentTarget.style.transform = "translateX(4px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(201, 26, 77, 0.15)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#fff";
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.transform = "translateX(0)";
                        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                      }}
                    >
                      <div style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "50%",
                        background: `${status.color}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: status.color,
                        flexShrink: 0,
                        border: `2px solid ${status.color}30`
                      }}>
                        {status.icon}
                      </div>
                      <span style={{
                        fontSize: "15px",
                        fontWeight: "700",
                        color: "#111827",
                        flex: 1,
                        textAlign: "left"
                      }}>
                        {status.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Close Button */}
        <div style={{
          padding: "20px",
          borderTop: "1px solid #e5e7eb",
          background: "#f9fafb",
          display: "flex",
          justifyContent: "center"
        }}>
          <button
            onClick={onClose}
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#6b7280",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#FBE6EC";
              e.currentTarget.style.borderColor = "#C91A4D";
              e.currentTarget.style.color = "#C91A4D";
              e.currentTarget.style.transform = "scale(1.1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(201, 26, 77, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.borderColor = "#e5e7eb";
              e.currentTarget.style.color = "#6b7280";
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

