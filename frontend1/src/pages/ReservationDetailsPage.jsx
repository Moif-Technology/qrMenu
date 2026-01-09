// frontend/src/pages/ReservationDetailsPage.jsx
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAllReservations, updateReservationStatus } from "../services/reservation.service";
import { getMockReservations, updateMockReservationStatus } from "../services/reservation.mock";
import BottomNav from "../component/reservation/BottomNav";
import StatusSelector from "../component/reservation/StatusSelector";

// Toggle this to use mock data instead of API
const USE_MOCK_DATA = true;

export default function ReservationDetailsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reservationId = searchParams.get("id");
  
  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showStatusSelector, setShowStatusSelector] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (reservationId) {
      loadReservation();
    }
  }, [reservationId]);

  const loadReservation = async () => {
    setLoading(true);
    setError(null);
    try {
      let data;
      if (USE_MOCK_DATA) {
        const result = getMockReservations({});
        const allReservations = result.reservations || [];
        const found = allReservations.find(r => r.reservationId === parseInt(reservationId));
        data = found || null;
      } else {
        const result = await getAllReservations({});
        const allReservations = Array.isArray(result) ? result : (result?.reservations || []);
        const found = allReservations.find(r => 
          (r.reservationId || r.ReservationID) === parseInt(reservationId)
        );
        data = found || null;
      }
      
      if (!data) {
        setError("Reservation not found");
      } else {
        setReservation(data);
      }
    } catch (err) {
      console.error("Failed to load reservation:", err);
      setError("Failed to load reservation details");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (reservation, newStatus) => {
    const reservationId = reservation.reservationId || reservation.ReservationID;
    if (!reservationId) return;

    setProcessing(true);
    try {
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, newStatus);
      } else {
        await updateReservationStatus(reservationId, newStatus);
      }
      await loadReservation(); // Reload to show updated status
      setShowStatusSelector(false);
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("Failed to update status. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return "—";
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString + "T00:00:00");
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const getStatusColor = (status) => {
    const statusLower = (status || "").toLowerCase();
    switch (statusLower) {
      case 'booked':
      case 'pending': return '#ff9800';
      case 'confirmed': return '#2196f3';
      case 'arrived': return '#9c27b0';
      case 'seated': return '#4caf50';
      case 'cancelled': return '#f44336';
      case 'no-show': return '#9e9e9e';
      default: return '#666';
    }
  };

  const S = {
    page: {
      minHeight: "100vh",
      background: "radial-gradient(120% 60% at 50% 0%, rgba(201,26,77,0.16), transparent 55%), #fdf8fa",
      display: "flex",
      flexDirection: "column",
      paddingBottom: 80
    },
    header: {
      background: "#ffffff",
      borderBottom: "1px solid #e5e7eb",
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      position: "sticky",
      top: 0,
      zIndex: 20,
      boxShadow: "0 1px 6px rgba(0,0,0,0.06)"
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      border: "1px solid #e5e7eb",
      background: "#f9fafb",
      cursor: "pointer",
      display: "grid",
      placeItems: "center"
    },
    titleWrap: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
    title: { margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" },
    subtitle: { margin: 0, fontSize: 13.5, fontWeight: 600, color: "#6b7280" },

    container: { maxWidth: 800, width: "100%", margin: "0 auto" },
    content: { padding: 16, display: "grid", gap: 16 },

    card: {
      background: "#fff",
      borderRadius: 18,
      border: "1px solid #e5e7eb",
      boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
      padding: 20
    },

    sectionTitle: {
      fontSize: "14px",
      fontWeight: "800",
      color: "#374151",
      marginBottom: "12px",
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

    statusBadge: (status) => {
      const statusUpper = (status || "").toUpperCase();
      const isConfirmed = statusUpper === "CONFIRMED" || !status;
      const isCancelled = statusUpper === "CANCELLED";
      const isArrived = statusUpper === "ARRIVED";
      const isSeated = statusUpper === "SEATED";
      return {
        padding: "8px 14px",
        borderRadius: "12px",
        fontSize: "13px",
        fontWeight: "800",
        textTransform: "uppercase",
        background: isCancelled ? "#fef2f2" : (isSeated ? "#f0fdf4" : (isArrived ? "#f3e8ff" : (isConfirmed ? "#eff6ff" : "#fef3c7"))),
        color: isCancelled ? "#b91c1c" : (isSeated ? "#166534" : (isArrived ? "#7c3aed" : (isConfirmed ? "#1e40af" : "#92400e"))),
        border: `1px solid ${isCancelled ? "#fecaca" : (isSeated ? "#bbf7d0" : (isArrived ? "#e9d5ff" : (isConfirmed ? "#dbeafe" : "#fde68a")))}`
      };
    },

    actionButton: (variant) => {
      const base = {
        width: "100%",
        padding: "16px",
        borderRadius: "14px",
        border: "none",
        fontSize: "16px",
        fontWeight: "800",
        cursor: "pointer",
        transition: "all 0.2s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px"
      };
      
      if (variant === "status") {
        return {
          ...base,
          background: "linear-gradient(135deg, #7A0026, #C91A4D)",
          color: "#fff",
          boxShadow: "0 8px 24px rgba(201, 26, 77, 0.35)"
        };
      }
      return {
        ...base,
        background: "#fff",
        color: "#C91A4D",
        border: "2px solid #C91A4D",
        boxShadow: "0 2px 8px rgba(201, 26, 77, 0.15)"
      };
    }
  };

  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <button onClick={() => navigate(-1)} style={S.backBtn} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div style={S.titleWrap}>
            <h1 style={S.title}>Loading...</h1>
          </div>
        </div>
        <div style={{ ...S.container, padding: "40px 16px", textAlign: "center" }}>
          <div style={{ fontSize: "16px", fontWeight: "600", color: "#6b7280" }}>Loading reservation details...</div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <button onClick={() => navigate(-1)} style={S.backBtn} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div style={S.titleWrap}>
            <h1 style={S.title}>Error</h1>
          </div>
        </div>
        <div style={{ ...S.container, padding: "40px 16px", textAlign: "center" }}>
          <div style={{
            padding: "20px",
            borderRadius: "14px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            fontSize: "16px",
            fontWeight: "700"
          }}>
            {error || "Reservation not found"}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const name = reservation.customerName || reservation.CustomerName || "—";
  const phone = reservation.customerPhone || reservation.CustomerPhone || "—";
  const email = reservation.customerEmail || reservation.CustomerEmail || "—";
  const guests = reservation.numberOfGuests || reservation.NumberOfGuests || 0;
  const date = reservation.reservationDate || reservation.ReservationDate || "";
  const time = reservation.reservationTime || reservation.ReservationTime || "";
  const status = reservation.status || reservation.Status || "";
  const table = reservation.tableId || reservation.TableID ? `Table ${reservation.tableId || reservation.TableID}` : "Unassigned";
  const comments = reservation.specialRequests || reservation.SpecialRequests || "";
  const area = reservation.areaId || reservation.AreaID ? `Area ${reservation.areaId || reservation.AreaID}` : "—";

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        <div style={S.titleWrap}>
          <h1 style={S.title}>Reservation Details</h1>
          <p style={S.subtitle}>ID: {reservationId}</p>
        </div>
        <button
          onClick={() => navigate("/reservation")}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
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
        <div style={S.content}>
          {/* Guest Information */}
          <div style={S.card}>
            <div style={S.sectionTitle}>Guest Information</div>
            
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Name</span>
              <span style={S.detailValue}>{name}</span>
            </div>
            
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Phone</span>
              <span style={S.detailValue}>{phone}</span>
            </div>
            
            {email && email !== "—" && (
              <div style={S.detailRow}>
                <span style={S.detailLabel}>Email</span>
                <span style={S.detailValue}>{email}</span>
              </div>
            )}
            
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Number of Guests</span>
              <span style={S.detailValue}>{guests}</span>
            </div>
          </div>

          {/* Reservation Details */}
          <div style={S.card}>
            <div style={S.sectionTitle}>Reservation Details</div>
            
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Date</span>
              <span style={S.detailValue}>{formatDate(date)}</span>
            </div>
            
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Time</span>
              <span style={S.detailValue}>{formatTime(time)}</span>
            </div>
            
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Status</span>
              <span style={S.statusBadge(status)}>{status || "CONFIRMED"}</span>
            </div>
            
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Table</span>
              <span style={S.detailValue}>{table}</span>
            </div>
            
            {area && area !== "—" && (
              <div style={S.detailRow}>
                <span style={S.detailLabel}>Area</span>
                <span style={S.detailValue}>{area}</span>
              </div>
            )}
          </div>

          {/* Special Requests */}
          {comments && (
            <div style={S.card}>
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
                {comments}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={S.card}>
            <div style={S.sectionTitle}>Actions</div>
            
            <div style={{ display: "grid", gap: "12px" }}>
              <button
                type="button"
                onClick={() => setShowStatusSelector(true)}
                disabled={processing}
                style={S.actionButton("status")}
                onMouseEnter={(e) => {
                  if (!processing) {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 12px 28px rgba(201, 26, 77, 0.4)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!processing) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 8px 24px rgba(201, 26, 77, 0.35)";
                  }
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Change Status
              </button>
              
              <button
                type="button"
                onClick={() => {
                  // Navigate to edit form with reservation data
                  navigate(`/reservation-form?edit=${reservationId}`);
                }}
                style={S.actionButton("edit")}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#FBE6EC";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fff";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Reservation
              </button>
            </div>
          </div>
        </div>
      </div>

      <BottomNav />

      {/* Status Selector Modal */}
      {showStatusSelector && reservation && (
        <StatusSelector
          reservation={reservation}
          onStatusChange={handleStatusChange}
          onClose={() => setShowStatusSelector(false)}
        />
      )}
    </div>
  );
}

