// frontend/src/pages/ReservationDetailsPage.jsx
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAllReservations, updateReservationStatus } from "../services/reservation.service";
import { getMockReservations, updateMockReservationStatus } from "../services/reservation.mock";
import BottomNav from "../component/reservation/BottomNav";
import StatusSelector from "../component/reservation/StatusSelector";
import WalkInEditModal from "../component/reservation/WalkInEditModal";

// Toggle this to use mock data instead of API
const USE_MOCK_DATA = false;

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
  const [showWalkInEditModal, setShowWalkInEditModal] = useState(false);

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
        // Use getReservationById for single reservation with cache-busting
        const { getReservationById } = await import("../services/reservation.service.js");
        // Add timestamp to force fresh fetch
        const result = await getReservationById(reservationId);
        if (result.ok && result.reservation) {
          data = result.reservation;
          console.log("[RESERVATION_DETAILS] Fetched reservation from getReservationById:", {
            bookingID: data.bookingID,
            status: data.status,
            bookingStatus: data.bookingStatus
          });
        } else {
          // Fallback to getAllReservations if getReservationById fails
          console.log("[RESERVATION_DETAILS] getReservationById failed, trying getAllReservations");
          const allResult = await getAllReservations({});
          const allReservations = Array.isArray(allResult) ? allResult : (allResult?.reservations || []);
          const found = allReservations.find(r => 
            (r.reservationId || r.bookingID || r.ReservationID) === parseInt(reservationId)
          );
          data = found || null;
          if (data) {
            console.log("[RESERVATION_DETAILS] Fetched reservation from getAllReservations:", {
              bookingID: data.bookingID,
              status: data.status,
              bookingStatus: data.bookingStatus
            });
          }
        }
      }
      
      if (!data) {
        setError("Reservation not found");
      } else {
        console.log("[RESERVATION_DETAILS] Loaded reservation:", {
          bookingID: data.bookingID || data.reservationId,
          status: data.status,
          bookingStatus: data.bookingStatus,
          fullData: data
        });
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
    const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
    if (!reservationId) {
      alert("Reservation ID not found");
      return;
    }

    if (!confirm(`Change status to ${newStatus}?`)) {
      return;
    }

    setProcessing(true);
    try {
      let result = null;
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, newStatus);
        result = { ok: true, status: newStatus };
      } else {
        result = await updateReservationStatus(reservationId, newStatus);
        if (!result.ok) {
          throw new Error(result.error || "Failed to update status");
        }
        console.log("[RESERVATION_DETAILS] Status update API result:", result);
      }
      
      // Get the mapped status from the result (backend may map some statuses)
      const mappedStatus = result?.status || newStatus;
      console.log("[RESERVATION_DETAILS] Status update result:", { 
        originalStatus: newStatus, 
        mappedStatus: mappedStatus,
        result 
      });
      
      // Update local state immediately for instant UI feedback
      setReservation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          status: mappedStatus,
          Status: mappedStatus,
          bookingStatus: mappedStatus,
          BookingStatus: mappedStatus
        };
      });
      
      // Close the modal
      setShowStatusSelector(false);
      
      // Show success message first
      alert(`Status updated to ${mappedStatus} successfully!`);
      
      // Reload reservation data immediately (reduced delay for faster update)
      setTimeout(async () => {
        try {
          await loadReservation();
          console.log("[RESERVATION_DETAILS] Reloaded reservation after status update");
        } catch (reloadErr) {
          console.error("Failed to reload reservation:", reloadErr);
          // Don't show error since UI is already updated
        }
      }, 500); // Reduced from 1500ms to 500ms for faster update
    } catch (err) {
      console.error("Failed to update status:", err);
      const errorMsg = err?.response?.data?.error || err?.message || "Please try again.";
      alert(`Failed to update status: ${errorMsg}`);
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
      case 'pending':
      case 'hold': return '#ff9800';
      case 'confirmed': return '#2196f3';
      case 'arrived': return '#9c27b0';
      case 'seated':
      case 'checked_in': return '#4caf50';
      case 'left': return '#f59e0b';
      case 'cancelled': return '#f44336';
      case 'no-show': return '#9e9e9e';
      case 'left_message': return '#8b5cf6';
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
      const isCancelled = statusUpper === "CANCELLED" || statusUpper === "CANCELLED_NOTIFY";
      const isArrived = statusUpper === "ARRIVED" || statusUpper === "PARTIALLY_ARRIVED";
      const isSeated = statusUpper === "SEATED" || statusUpper === "CHECKED_IN" || statusUpper === "PARTIALLY_SEATED" || statusUpper === "PAID" || statusUpper === "BUS_TABLE";
      const isLeft = statusUpper === "LEFT";
      const isNoShow = statusUpper === "NO_SHOW";
      const isLeftMessage = statusUpper === "LEFT_MESSAGE";
      const isBooked = statusUpper === "BOOKED" || statusUpper === "HOLD" || statusUpper === "PENDING";
      
      let backgroundColor = "#fef3c7";
      if (isCancelled) backgroundColor = "#fef2f2";
      else if (isSeated) backgroundColor = "#f0fdf4";
      else if (isLeft) backgroundColor = "#fef3c7";
      else if (isArrived) backgroundColor = "#f3e8ff";
      else if (isLeftMessage) backgroundColor = "#f3e8ff";
      else if (isNoShow) backgroundColor = "#f3f4f6";
      else if (isBooked) backgroundColor = "#fef3c7";
      else if (isConfirmed) backgroundColor = "#eff6ff";
      
      let textColor = "#92400e";
      if (isCancelled) textColor = "#b91c1c";
      else if (isSeated) textColor = "#166534";
      else if (isLeft) textColor = "#f59e0b";
      else if (isArrived) textColor = "#7c3aed";
      else if (isLeftMessage) textColor = "#8b5cf6";
      else if (isNoShow) textColor = "#6b7280";
      else if (isBooked) textColor = "#92400e";
      else if (isConfirmed) textColor = "#1e40af";
      
      let borderColor = "#fde68a";
      if (isCancelled) borderColor = "#fecaca";
      else if (isSeated) borderColor = "#bbf7d0";
      else if (isLeft) borderColor = "#fde68a";
      else if (isArrived) borderColor = "#e9d5ff";
      else if (isLeftMessage) borderColor = "#e9d5ff";
      else if (isNoShow) borderColor = "#e5e7eb";
      else if (isBooked) borderColor = "#fde68a";
      else if (isConfirmed) borderColor = "#dbeafe";
      
      return {
        padding: "8px 14px",
        borderRadius: "12px",
        fontSize: "13px",
        fontWeight: "800",
        textTransform: "uppercase",
        background: backgroundColor,
        color: textColor,
        border: "1px solid " + borderColor
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
  // Prefer status from BookingChild, fallback to bookingStatus from BookingMaster
  const status = reservation.status || reservation.bookingStatus || reservation.Status || reservation.BookingStatus || "";
  
  // Table information - check multiple fields for proper display
  // First check if tables array exists (for getReservationById response)
  let tableId = reservation.tableId || reservation.TableID;
  let tableName = reservation.tableName || reservation.TableName;
  let tableNo = reservation.tableNo || reservation.TableNO;
  let tableInfo = reservation.tableInfo || reservation.TableInfo;
  
  // If tables array exists, extract from first table
  if (reservation.tables && Array.isArray(reservation.tables) && reservation.tables.length > 0) {
    const firstTable = reservation.tables[0];
    tableId = firstTable.tableId || firstTable.tableID || firstTable.TableID || tableId;
    tableName = firstTable.tableName || firstTable.TableName || tableName;
    tableNo = firstTable.tableNo || firstTable.TableNO || tableNo;
  }
  
  // Determine table display text
  let table = "Unassigned";
  if (tableName) {
    table = tableName;
  } else if (tableInfo) {
    table = tableInfo;
  } else if (tableNo) {
    table = `Table ${tableNo}`;
  } else if (tableId && tableId !== 0) {
    table = `Table ${tableId}`;
  }
  
  const comments = reservation.specialRequests || reservation.SpecialRequests || "";
  
  // Area information - check multiple fields
  let areaId = reservation.areaId || reservation.AreaID;
  let areaName = reservation.areaName || reservation.AreaName;
  
  // If tables array exists, extract area info from first table
  if (reservation.tables && Array.isArray(reservation.tables) && reservation.tables.length > 0) {
    const firstTable = reservation.tables[0];
    areaId = firstTable.areaId || firstTable.areaID || firstTable.AreaID || areaId;
    areaName = firstTable.areaName || firstTable.AreaName || areaName;
  }
  
  const area = areaName || (areaId ? `Area ${areaId}` : "—");

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
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={S.statusBadge(status)}>{(status || reservation.bookingStatus || reservation.Status || reservation.BookingStatus || "CONFIRMED").toUpperCase()}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStatusSelector(true);
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: "1.5px solid #C91A4D",
                    backgroundColor: "#fff",
                    color: "#C91A4D",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#FBE6EC";
                    e.currentTarget.style.transform = "scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Change
                </button>
              </div>
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
                  // Check if this is a walk-in reservation
                  const bookingSource = reservation?.bookingSource || reservation?.BookingSource || "";
                  const isWalkIn = bookingSource.toUpperCase() === "WALKIN";
                  
                  if (isWalkIn) {
                    // Show walk-in edit modal
                    setShowWalkInEditModal(true);
                  } else {
                    // Navigate to full reservation form for regular reservations
                    navigate(`/reservation-form?edit=${reservationId}`);
                  }
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

      {/* Walk-In Edit Modal */}
      {showWalkInEditModal && reservation && (
        <WalkInEditModal
          reservation={reservation}
          onClose={() => setShowWalkInEditModal(false)}
          onSave={() => {
            setShowWalkInEditModal(false);
            loadReservation(); // Reload reservation data after save
          }}
        />
      )}
    </div>
  );
}

