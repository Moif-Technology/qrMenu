// frontend/src/pages/ReportsPage.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAllReservations, updateReservationStatus } from "../services/reservation.service";
import { getMockReservations, updateMockReservationStatus } from "../services/reservation.mock";
import BottomNav from "../component/reservation/BottomNav";
import StatusSelector from "../component/reservation/StatusSelector";

// Toggle this to use mock data instead of API
const USE_MOCK_DATA = true;

export default function ReportsPage() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState("lunch"); // lunch, sunset, dinner
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState("all"); // all, upcoming, cancelled, no-show
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  // Time period definitions with SVG icons
  const timePeriods = {
    lunch: { 
      label: "Lunch", 
      start: 11, 
      end: 14, 
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
          <path d="M7 2v20" />
          <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3v0" />
          <path d="M21 15c0 2.5-2.5 4-5 4s-5-1.5-5-4" />
        </svg>
      ), 
      color: "#F59E0B" 
    }, // 11:00 AM - 2:00 PM
    sunset: { 
      label: "Sunset", 
      start: 16, 
      end: 18, 
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          <path d="M12 17v4" />
          <path d="M8 21h8" />
        </svg>
      ), 
      color: "#F97316" 
    }, // 4:00 PM - 6:00 PM
    dinner: { 
      label: "Dinner", 
      start: 18, 
      end: 23, 
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="7" />
          <path d="M12 15v7" />
          <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
          <line x1="12" y1="15" x2="12" y2="22" />
        </svg>
      ), 
      color: "#A855F7" 
    } // 6:00 PM - 11:00 PM
  };

  // Load reservations
  useEffect(() => {
    loadReservations();
  }, [selectedDate, selectedPeriod, statusFilter]);

  const loadReservations = async () => {
    setLoading(true);
    setError(null);
    try {
      let data;
      if (USE_MOCK_DATA) {
        // Use mock data
        data = getMockReservations({ date: selectedDate });
        data = data.reservations || [];
      } else {
        // Use real API
        data = await getAllReservations({ date: selectedDate });
        data = Array.isArray(data) ? data : (data?.reservations || []);
      }
      
      // Filter by time period
      const period = timePeriods[selectedPeriod];
      let filtered = data.filter(res => {
        if (!res.reservationTime) return false;
        const [hours] = res.reservationTime.split(":");
        const hour = parseInt(hours);
        return hour >= period.start && hour < period.end;
      });
      
      // Filter by status
      if (statusFilter !== 'all') {
        const now = new Date();
        filtered = filtered.filter(res => {
          const status = (res.status || res.Status || '').toUpperCase();
          const resDate = res.reservationDate || res.ReservationDate;
          const resTime = res.reservationTime || res.ReservationTime;
          
          if (statusFilter === 'upcoming') {
            if (!resDate || !resTime) return false;
            const resDateTime = new Date(`${resDate}T${resTime}`);
            return resDateTime > now && status !== 'CANCELLED' && status !== 'NO_SHOW';
          }
          
          if (statusFilter === 'cancelled') {
            return status === 'CANCELLED' || status === 'CANCELLED_NOTIFY';
          }
          
          if (statusFilter === 'no-show') {
            return status === 'NO_SHOW';
          }
          
          return true;
        });
      }
      
      // Sort by time
      filtered.sort((a, b) => {
        if (!a.reservationTime || !b.reservationTime) return 0;
        return a.reservationTime.localeCompare(b.reservationTime);
      });
      
      setReservations(filtered);
    } catch (err) {
      console.error("Failed to load reservations:", err);
      setError("Failed to load reservations");
      setReservations([]);
    } finally {
      setLoading(false);
    }
  };

  // Format time for display
  const formatTime = (timeString) => {
    if (!timeString) return "—";
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString + "T00:00:00");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

  // Calculate statistics
  const stats = {
    total: reservations.length,
    totalGuests: reservations.reduce((sum, r) => sum + (r.numberOfGuests || r.NumberOfGuests || 0), 0),
    confirmed: reservations.filter(r => (r.status || r.Status || "").toUpperCase() === "CONFIRMED" || !r.status).length,
    cancelled: reservations.filter(r => (r.status || r.Status || "").toUpperCase() === "CANCELLED").length
  };

  const handleMarkArrived = async (reservation) => {
    const reservationId = reservation.reservationId || reservation.ReservationID;
    if (!reservationId) return;

    setProcessingId(reservationId);
    try {
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, "ARRIVED");
      } else {
        await updateReservationStatus(reservationId, "ARRIVED");
      }
      await loadReservations(); // Reload to show updated status
    } catch (err) {
      console.error("Failed to mark as arrived:", err);
      alert("Failed to mark as arrived. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleSeat = async (reservation) => {
    const reservationId = reservation.reservationId || reservation.ReservationID;
    if (!reservationId) return;

    // If no table assigned, navigate to table selection
    if (!reservation.tableId && !reservation.TableID) {
      if (confirm("No table assigned. Would you like to assign a table now?")) {
        navigate(`/table-action/select?reservationId=${reservationId}`);
      }
      return;
    }

    setProcessingId(reservationId);
    try {
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, "SEATED");
      } else {
        await updateReservationStatus(reservationId, "SEATED");
      }
      await loadReservations(); // Reload to show updated status
    } catch (err) {
      console.error("Failed to seat reservation:", err);
      alert("Failed to seat reservation. Please try again.");
    } finally {
      setProcessingId(null);
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

    container: { maxWidth: 1200, width: "100%", margin: "0 auto" },
    content: { padding: 16, display: "grid", gap: 16 },

    card: {
      background: "#fff",
      borderRadius: 18,
      border: "1px solid #e5e7eb",
      boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
      padding: 20
    },

    // Period selector
    periodSelector: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 12,
      marginBottom: 16
    },
    periodButton: (isActive, color) => ({
      padding: "16px 12px",
      borderRadius: "14px",
      border: isActive ? `2px solid ${color}` : "1px solid #e5e7eb",
      background: isActive ? `${color}15` : "#fff",
      cursor: "pointer",
      transition: "all 0.2s",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      textAlign: "center"
    }),
    periodIcon: (isActive, color) => ({
      color: isActive ? color : "#6b7280",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }),
    periodLabel: (isActive, color) => ({
      fontSize: "14px",
      fontWeight: isActive ? "800" : "700",
      color: isActive ? color : "#374151"
    }),

    // Date selector
    dateSelector: {
      display: "flex",
      gap: 8,
      marginBottom: 20,
      alignItems: "center"
    },
    dateInput: {
      padding: "12px 14px",
      borderRadius: "12px",
      border: "1px solid #d1d5db",
      fontSize: "14px",
      fontWeight: "600",
      outline: "none",
      background: "#fff",
      flex: 1
    },

    // Statistics cards
    statsGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: 12,
      marginBottom: 20
    },
    statCard: {
      padding: "16px",
      borderRadius: "14px",
      background: "linear-gradient(135deg, rgba(122,0,38,0.08), rgba(201,26,77,0.08))",
      border: "1px solid #FBE6EC"
    },
    statValue: {
      fontSize: "24px",
      fontWeight: "800",
      color: "#C91A4D",
      marginBottom: "4px"
    },
    statLabel: {
      fontSize: "12px",
      fontWeight: "700",
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },

    // Reservations list
    listHeader: {
      fontSize: "16px",
      fontWeight: "800",
      color: "#111827",
      marginBottom: "12px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },
    reservationItem: {
      padding: "16px",
      borderRadius: "12px",
      border: "1px solid #e5e7eb",
      background: "#f9fafb",
      marginBottom: "10px",
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: "12px",
      alignItems: "center"
    },
    reservationInfo: {
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    },
    reservationName: {
      fontSize: "16px",
      fontWeight: "800",
      color: "#111827"
    },
    reservationDetails: {
      fontSize: "13px",
      fontWeight: "600",
      color: "#6b7280",
      display: "flex",
      gap: "12px",
      flexWrap: "wrap"
    },
    reservationTime: {
      fontSize: "18px",
      fontWeight: "800",
      color: "#C91A4D",
      textAlign: "right"
    },
    statusBadge: (status) => {
      const statusUpper = (status || "").toUpperCase();
      const isConfirmed = statusUpper === "CONFIRMED" || !status;
      const isCancelled = statusUpper === "CANCELLED";
      return {
        padding: "4px 10px",
        borderRadius: "8px",
        fontSize: "11px",
        fontWeight: "700",
        textTransform: "uppercase",
        background: isCancelled ? "#fef2f2" : (isConfirmed ? "#f0fdf4" : "#fef3c7"),
        color: isCancelled ? "#b91c1c" : (isConfirmed ? "#166534" : "#92400e")
      };
    },

    emptyState: {
      textAlign: "center",
      padding: "40px 20px",
      color: "#6b7280"
    },
    emptyTitle: { fontSize: "16px", fontWeight: "700", marginBottom: "8px", color: "#374151" },
    emptyText: { fontSize: "14px", fontWeight: "600" }
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate("/reservation")} style={S.backBtn} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        <div style={S.titleWrap}>
          <h1 style={S.title}>Reports</h1>
          <p style={S.subtitle}>{formatDate(selectedDate)} • {timePeriods[selectedPeriod].label}</p>
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
          {/* Period Selector */}
          <div style={S.card}>
            <div style={S.periodSelector}>
              {Object.entries(timePeriods).map(([key, period]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedPeriod(key)}
                  style={S.periodButton(selectedPeriod === key, period.color)}
                  onMouseEnter={(e) => {
                    if (selectedPeriod !== key) {
                      e.currentTarget.style.background = "#f9fafb";
                      e.currentTarget.style.transform = "scale(1.02)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedPeriod !== key) {
                      e.currentTarget.style.background = "#fff";
                      e.currentTarget.style.transform = "scale(1)";
                    }
                  }}
                >
                  <div style={S.periodIcon(selectedPeriod === key, period.color)}>{period.icon}</div>
                  <div style={S.periodLabel(selectedPeriod === key, period.color)}>
                    {period.label}
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: "600", color: "#9ca3af" }}>
                    {period.start}:00 - {period.end}:00
                  </div>
                </button>
              ))}
            </div>

            {/* Date Selector */}
            <div style={S.dateSelector}>
              <label style={{ fontSize: "13px", fontWeight: "700", color: "#374151", minWidth: "60px" }}>
                Date:
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={S.dateInput}
              />
            </div>

            {/* Status Filter - Quick Buttons */}
            <div style={{ marginTop: "12px" }}>
              <label style={{ fontSize: "13px", fontWeight: "700", color: "#374151", marginBottom: "8px", display: "block" }}>
                Filter:
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  { value: "all", label: "All", icon: "📋" },
                  { value: "upcoming", label: "Upcoming", icon: "⏰" },
                  { value: "cancelled", label: "Cancelled", icon: "❌" },
                  { value: "no-show", label: "No Show", icon: "🚫" }
                ].map((filterOption) => (
                  <button
                    key={filterOption.value}
                    onClick={() => setStatusFilter(filterOption.value)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "16px",
                      border: statusFilter === filterOption.value ? "2px solid #C91A4D" : "1px solid #d1d5db",
                      backgroundColor: statusFilter === filterOption.value ? "#FBE6EC" : "#fff",
                      color: statusFilter === filterOption.value ? "#C91A4D" : "#374151",
                      fontSize: "12px",
                      fontWeight: statusFilter === filterOption.value ? "700" : "600",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.2s",
                      whiteSpace: "nowrap"
                    }}
                    onMouseEnter={(e) => {
                      if (statusFilter !== filterOption.value) {
                        e.currentTarget.style.borderColor = "#C91A4D";
                        e.currentTarget.style.backgroundColor = "#f9fafb";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (statusFilter !== filterOption.value) {
                        e.currentTarget.style.borderColor = "#d1d5db";
                        e.currentTarget.style.backgroundColor = "#fff";
                      }
                    }}
                  >
                    <span>{filterOption.icon}</span>
                    <span>{filterOption.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Statistics */}
            <div style={S.statsGrid}>
              <div style={S.statCard}>
                <div style={S.statValue}>{stats.total}</div>
                <div style={S.statLabel}>Total Reservations</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statValue}>{stats.totalGuests}</div>
                <div style={S.statLabel}>Total Guests</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statValue}>{stats.confirmed}</div>
                <div style={S.statLabel}>Confirmed</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statValue}>{stats.cancelled}</div>
                <div style={S.statLabel}>Cancelled</div>
              </div>
            </div>
          </div>

          {/* Reservations List */}
          <div style={S.card}>
            <div style={S.listHeader}>
              <span>Reservations ({reservations.length})</span>
              {loading && <span style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280" }}>Loading...</span>}
            </div>

            {error && (
              <div style={{
                padding: "12px",
                borderRadius: "12px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: "14px",
                fontWeight: "700",
                marginBottom: "12px"
              }}>
                {error}
              </div>
            )}

            {!loading && !error && reservations.length === 0 && (
              <div style={S.emptyState}>
                <div style={S.emptyTitle}>No Reservations</div>
                <div style={S.emptyText}>No {timePeriods[selectedPeriod].label.toLowerCase()} reservations found for {formatDate(selectedDate)}</div>
              </div>
            )}

            {!loading && reservations.map((res) => {
              const name = res.customerName || res.CustomerName || "—";
              const phone = res.customerPhone || res.CustomerPhone || "—";
              const guests = res.numberOfGuests || res.NumberOfGuests || 0;
              const time = res.reservationTime || res.ReservationTime || "";
              const status = res.status || res.Status || "";
              const table = res.tableId || res.TableID ? `Table ${res.tableId || res.TableID}` : "Unassigned";
              const reservationId = res.reservationId || res.ReservationID;
              const statusUpper = (status || "").toUpperCase();

              return (
                <div 
                  key={reservationId || Math.random()} 
                  style={S.reservationItem}
                  onClick={() => {
                    navigate(`/reservation-details?id=${reservationId}`);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.cursor = "pointer";
                    e.currentTarget.style.borderColor = "#C91A4D";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(201, 26, 77, 0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={S.reservationInfo}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <div style={S.reservationName}>{name}</div>
                      <span style={S.statusBadge(status)}>{status || "CONFIRMED"}</span>
                    </div>
                    <div style={S.reservationDetails}>
                      <span>📞 {phone}</span>
                      <span>👥 {guests} guests</span>
                      <span>🪑 {table}</span>
                    </div>
                  </div>
                  <div 
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={S.reservationTime}>{formatTime(time)}</div>
                    <div style={{ display: "flex", gap: "6px", flexDirection: "column" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/reservation-form?edit=${reservationId}`);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          border: "1.5px solid #C91A4D",
                          backgroundColor: "#fff",
                          color: "#C91A4D",
                          fontSize: "11px",
                          fontWeight: "700",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          justifyContent: "center"
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
                      </button>
                      {statusUpper !== 'ARRIVED' && statusUpper !== 'SEATED' && statusUpper !== 'CANCELLED' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkArrived(res);
                          }}
                          disabled={processingId === reservationId}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "8px",
                            border: "none",
                            backgroundColor: processingId === reservationId ? "#ccc" : "#9c27b0",
                            color: "white",
                            fontSize: "11px",
                            fontWeight: "700",
                            cursor: processingId === reservationId ? "not-allowed" : "pointer",
                            opacity: processingId === reservationId ? 0.6 : 1
                          }}
                        >
                          Arrived
                        </button>
                      )}
                      {(statusUpper === 'ARRIVED' || statusUpper === 'CONFIRMED' || !status) && statusUpper !== 'SEATED' && statusUpper !== 'CANCELLED' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSeat(res);
                          }}
                          disabled={processingId === reservationId}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "8px",
                            border: "none",
                            backgroundColor: processingId === reservationId ? "#ccc" : "#4caf50",
                            color: "white",
                            fontSize: "11px",
                            fontWeight: "700",
                            cursor: processingId === reservationId ? "not-allowed" : "pointer",
                            opacity: processingId === reservationId ? 0.6 : 1
                          }}
                        >
                          Seat
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

