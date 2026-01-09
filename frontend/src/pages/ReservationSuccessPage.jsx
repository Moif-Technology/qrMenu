// frontend/src/pages/ReservationSuccessPage.jsx
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BottomNav from "../component/reservation/BottomNav";

export default function ReservationSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Get data from URL params or use dummy data
  const [reservationData, setReservationData] = useState({
    reservationId: searchParams.get("id") || "R-2024-001",
    customerName: searchParams.get("name") || "Jane Smith",
    customerPhone: searchParams.get("phone") || "555-9876",
    customerEmail: searchParams.get("email") || "jane.smith@email.com",
    numberOfGuests: parseInt(searchParams.get("guests")) || 4,
    reservationDate: searchParams.get("date") || new Date().toISOString().split("T")[0],
    reservationTime: searchParams.get("time") || "19:00",
    tableId: searchParams.get("tableId") || "15",
    tableName: searchParams.get("tableName") || "Table 15",
    status: "CONFIRMED",
    specialRequests: searchParams.get("comments") || "Window seat preferred"
  });

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString + "T00:00:00");
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const formatTime = (timeString) => {
    if (!timeString) return "—";
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const S = {
    page: {
      minHeight: "100vh",
      background: "radial-gradient(120% 60% at 50% 0%, rgba(201,26,77,0.16), transparent 55%), #fdf8fa",
      display: "flex",
      flexDirection: "column",
      paddingBottom: 80
    },
    container: {
      maxWidth: 600,
      width: "100%",
      margin: "0 auto",
      padding: "20px 16px"
    },
    successCard: {
      background: "#fff",
      borderRadius: "24px",
      border: "1px solid #e5e7eb",
      boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
      padding: "32px 24px",
      textAlign: "center",
      marginBottom: "24px"
    },
    successIcon: {
      width: "80px",
      height: "80px",
      margin: "0 auto 20px",
      background: "linear-gradient(135deg, #7A0026, #C91A4D)",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 8px 24px rgba(201, 26, 77, 0.3)"
    },
    successTitle: {
      fontSize: "28px",
      fontWeight: "800",
      color: "#111827",
      marginBottom: "8px"
    },
    successSubtitle: {
      fontSize: "16px",
      fontWeight: "600",
      color: "#6b7280",
      marginBottom: "32px"
    },
    detailsCard: {
      background: "#fff",
      borderRadius: "18px",
      border: "1px solid #e5e7eb",
      padding: "24px",
      marginBottom: "16px"
    },
    sectionTitle: {
      fontSize: "14px",
      fontWeight: "800",
      color: "#374151",
      marginBottom: "16px",
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    detailRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 0",
      borderBottom: "1px solid #f3f4f6"
    },
    detailLabel: {
      fontSize: "14px",
      fontWeight: "600",
      color: "#6b7280"
    },
    detailValue: {
      fontSize: "15px",
      fontWeight: "700",
      color: "#111827",
      textAlign: "right"
    },
    statusBadge: {
      padding: "8px 16px",
      borderRadius: "12px",
      fontSize: "13px",
      fontWeight: "800",
      textTransform: "uppercase",
      background: "#eff6ff",
      color: "#1e40af",
      border: "1px solid #dbeafe"
    },
    reservationId: {
      fontSize: "12px",
      fontWeight: "700",
      color: "#C91A4D",
      marginTop: "8px"
    },
    actionButton: {
      width: "100%",
      padding: "16px",
      borderRadius: "14px",
      border: "none",
      fontSize: "16px",
      fontWeight: "800",
      cursor: "pointer",
      transition: "all 0.2s",
      background: "linear-gradient(135deg, #7A0026, #C91A4D)",
      color: "#fff",
      boxShadow: "0 8px 24px rgba(201, 26, 77, 0.35)",
      marginTop: "16px"
    },
    secondaryButton: {
      width: "100%",
      padding: "16px",
      borderRadius: "14px",
      border: "2px solid #C91A4D",
      fontSize: "16px",
      fontWeight: "800",
      cursor: "pointer",
      transition: "all 0.2s",
      background: "#fff",
      color: "#C91A4D",
      boxShadow: "0 2px 8px rgba(201, 26, 77, 0.15)",
      marginTop: "12px"
    }
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        position: "sticky",
        top: 0,
        zIndex: 20,
        boxShadow: "0 1px 6px rgba(0,0,0,0.06)"
      }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: "20px", 
            fontWeight: "800",
            color: "#111827"
          }}>
            Success
          </h1>
        </div>
        <button
          onClick={() => navigate("/reservation")}
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "14px",
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            color: "#6b7280",
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#FBE6EC";
            e.currentTarget.style.borderColor = "#C91A4D";
            e.currentTarget.style.color = "#C91A4D";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#f9fafb";
            e.currentTarget.style.borderColor = "#e5e7eb";
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
      <div style={S.container}>
        {/* Success Card */}
        <div style={S.successCard}>
          <div style={S.successIcon}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={S.successTitle}>Reservation Confirmed!</h1>
          <p style={S.successSubtitle}>Reservation has been created successfully</p>
          <div style={S.reservationId}>Reservation ID: {reservationData.reservationId}</div>
        </div>

        {/* Guest Information */}
        <div style={S.detailsCard}>
          <div style={S.sectionTitle}>Guest Information</div>
          
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Guest Name</span>
            <span style={S.detailValue}>{reservationData.customerName}</span>
          </div>
          
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Phone</span>
            <span style={S.detailValue}>{reservationData.customerPhone}</span>
          </div>
          
          {reservationData.customerEmail && (
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Email</span>
              <span style={S.detailValue}>{reservationData.customerEmail}</span>
            </div>
          )}
          
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Number of Guests</span>
            <span style={S.detailValue}>{reservationData.numberOfGuests} guests</span>
          </div>
        </div>

        {/* Reservation Details */}
        <div style={S.detailsCard}>
          <div style={S.sectionTitle}>Reservation Details</div>
          
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Date</span>
            <span style={S.detailValue}>{formatDate(reservationData.reservationDate)}</span>
          </div>
          
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Time</span>
            <span style={S.detailValue}>{formatTime(reservationData.reservationTime)}</span>
          </div>
          
          {reservationData.tableId && (
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Table</span>
              <span style={S.detailValue}>{reservationData.tableName}</span>
            </div>
          )}
          
          <div style={{ ...S.detailRow, borderBottom: "none", paddingTop: "16px" }}>
            <span style={S.detailLabel}>Status</span>
            <span style={S.statusBadge}>{reservationData.status}</span>
          </div>
        </div>

        {/* Special Requests */}
        {reservationData.specialRequests && (
          <div style={S.detailsCard}>
            <div style={S.sectionTitle}>Special Requests</div>
            <div style={{
              padding: "14px",
              borderRadius: "12px",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              fontSize: "14px",
              fontWeight: "600",
              color: "#374151",
              lineHeight: "1.6"
            }}>
              {reservationData.specialRequests}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <button
          onClick={() => navigate("/reservation")}
          style={S.actionButton}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 12px 28px rgba(201, 26, 77, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 8px 24px rgba(201, 26, 77, 0.35)";
          }}
        >
          Back to Floor View
        </button>
        
        <button
          onClick={() => navigate("/reservation-form")}
          style={S.secondaryButton}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#FBE6EC";
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#fff";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          Create Another Reservation
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

