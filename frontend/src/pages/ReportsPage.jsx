// frontend/src/pages/ReportsPage.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getAllReservations, updateReservationStatus } from "../services/reservation.service";
import { getMockReservations, updateMockReservationStatus } from "../services/reservation.mock";
import BottomNav from "../component/reservation/BottomNav";
import StatusSelector from "../component/reservation/StatusSelector";

// Toggle this to use mock data instead of API
const USE_MOCK_DATA = false;

export default function ReportsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedPeriod, setSelectedPeriod] = useState("lunch"); // lunch, sunset, dinner
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState("all"); // all, upcoming, cancelled, no-show
  const [searchQuery, setSearchQuery] = useState("");
  const [reservations, setReservations] = useState([]);
  const [allReservations, setAllReservations] = useState([]); // Store all reservations for counting
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [showStatusSelector, setShowStatusSelector] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const prevLocationRef = useRef(location.pathname);

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

  // Define loadReservations BEFORE using it in useEffect hooks
  const loadReservations = useCallback(async () => {
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
      
      // Ensure data is an array
      if (!Array.isArray(data)) {
        data = [];
      }
      
      // Filter by time period
      const period = timePeriods[selectedPeriod];
      let filtered = data.filter(res => {
        if (!res.reservationTime) return false;
        const [hours] = res.reservationTime.split(":");
        const hour = parseInt(hours);
        return hour >= period.start && hour < period.end;
      });
      
      // Store all reservations (filtered by period only) for status counts
      setAllReservations(filtered);
      
      // Filter by status
      if (statusFilter !== 'all') {
        const now = new Date();
        filtered = filtered.filter(res => {
          const status = (res.status || res.Status || '').toUpperCase();
          const resDate = res.reservationDate || res.ReservationDate;
          const resTime = res.reservationTime || res.ReservationTime;
          
          if (statusFilter === 'upcoming') {
            // Show reservations for selected date that haven't happened yet
            if (!resDate || !resTime) return false;
            const resDateTime = new Date(`${resDate}T${resTime}`);
            const isToday = resDate === new Date().toISOString().split('T')[0];
            // For today: show future reservations, for other dates: show all non-cancelled/no-show
            if (isToday) {
              return resDateTime > now && status !== 'CANCELLED' && status !== 'NO_SHOW' && status !== 'LEFT';
            } else {
              return status !== 'CANCELLED' && status !== 'NO_SHOW' && status !== 'LEFT';
            }
          }
          
          if (statusFilter === 'cancelled') {
            return status === 'CANCELLED' || status === 'CANCELLED_NOTIFY';
          }
          
          if (statusFilter === 'no-show') {
            return status === 'NO_SHOW';
          }
          
          if (statusFilter === 'left') {
            return status === 'LEFT';
          }
          
          return status === statusFilter.toUpperCase();
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
  }, [selectedDate, selectedPeriod, statusFilter]);
  
  // Calculate status counts for filter badges
  const getStatusCount = useCallback((filter) => {
    if (!Array.isArray(allReservations)) return 0;
    
    const now = new Date();
    
    if (filter === 'all') return allReservations.length;
    
    return allReservations.filter(res => {
      const status = (res.status || res.Status || '').toUpperCase();
      const resDate = res.reservationDate || res.ReservationDate;
      const resTime = res.reservationTime || res.ReservationTime;
      
      if (filter === 'upcoming') {
        if (!resDate || !resTime) return false;
        const resDateTime = new Date(`${resDate}T${resTime}`);
        const isToday = resDate === new Date().toISOString().split('T')[0];
        if (isToday) {
          return resDateTime > now && status !== 'CANCELLED' && status !== 'NO_SHOW' && status !== 'LEFT';
        } else {
          return status !== 'CANCELLED' && status !== 'NO_SHOW' && status !== 'LEFT';
        }
      }
      
      if (filter === 'cancelled') {
        return status === 'CANCELLED' || status === 'CANCELLED_NOTIFY';
      }
      
      if (filter === 'no-show') {
        return status === 'NO_SHOW';
      }
      
      if (filter === 'left') {
        return status === 'LEFT';
      }
      
      return status === filter.toUpperCase();
    }).length;
  }, [allReservations]);

  // Load reservations
  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  // Reload reservations when navigating back to this page (e.g., from details page)
  useEffect(() => {
    // Check if we navigated back to this page
    const isNavigatingToReports = prevLocationRef.current !== location.pathname && location.pathname === '/reports';
    
    if (isNavigatingToReports) {
      // We're back on the reports page, reload data immediately
      // First immediate refresh
      loadReservations();
      
      // Then refresh multiple times to catch database commits (SQL Server read consistency)
      // SQL Server transactions might not be immediately visible to read queries
      const timeout1 = setTimeout(() => {
        loadReservations();
      }, 500); // First retry after 500ms
      
      const timeout2 = setTimeout(() => {
        loadReservations();
      }, 1500); // Second retry after 1.5s to catch delayed commits
      
      return () => {
        clearTimeout(timeout1);
        clearTimeout(timeout2);
      };
    }
    
    prevLocationRef.current = location.pathname;
  }, [location.pathname, loadReservations]);

  // Reload reservations when page becomes visible (e.g., returning from details page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page became visible, reload data immediately to get latest status updates
        // Immediate refresh
        loadReservations();
        
        // Then refresh again after delay to catch database commits
        const delayedRefresh = setTimeout(() => {
          loadReservations();
        }, 1000); // 1 second delay to catch SQL Server transaction visibility
        
        return () => clearTimeout(delayedRefresh);
      }
    };

    const handleFocus = () => {
      // Reload when window regains focus - immediate refresh
      loadReservations();
      
      // Also refresh after delay to catch any pending commits
      setTimeout(() => {
        loadReservations();
      }, 1000);
    };

    // Also reload immediately when component mounts if page is visible
    if (!document.hidden) {
      // Small delay to ensure component is fully mounted
      const initialTimeout = setTimeout(() => {
        loadReservations();
      }, 100);
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleFocus);

      return () => {
        clearTimeout(initialTimeout);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
      };
    } else {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleFocus);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [loadReservations]);

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

  // Get status color
  const getStatusColor = (status) => {
    const statusLower = (status || "").toLowerCase();
    switch (statusLower) {
      case 'booked':
      case 'pending':
      case 'hold': return '#ff9800';
      case 'confirmed': return '#2196f3';
      case 'arrived': return '#9c27b0';
      case 'seated': return '#4caf50';
      case 'checked_in': return '#4caf50';
      case 'left': return '#f59e0b';
      case 'cancelled': return '#f44336';
      case 'no-show': return '#9e9e9e';
      default: return '#666';
    }
  };

  // Calculate statistics
  const safeReservations = Array.isArray(reservations) ? reservations : [];
  const stats = {
    total: safeReservations.length,
    totalGuests: safeReservations.reduce((sum, r) => sum + (r.numberOfGuests || r.NumberOfGuests || 0), 0),
    confirmed: safeReservations.filter(r => (r.status || r.Status || "").toUpperCase() === "CONFIRMED" || !r.status).length,
    cancelled: safeReservations.filter(r => (r.status || r.Status || "").toUpperCase() === "CANCELLED").length
  };

  const handleMarkArrived = async (reservation) => {
    const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
    if (!reservationId) {
      alert("Reservation ID not found");
      return;
    }

    if (!confirm("Mark this reservation as ARRIVED?")) {
      return;
    }

    setProcessingId(reservationId);
    try {
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, "ARRIVED");
      } else {
        const result = await updateReservationStatus(reservationId, "ARRIVED");
        if (!result.ok) {
          throw new Error(result.error || "Failed to update status");
        }
        console.log("[Reports] Status update successful:", result);
      }
      // Update local state immediately
      setReservations(prev => {
        const current = Array.isArray(prev) ? prev : [];
        return current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return rId === reservationId
            ? { ...r, status: "ARRIVED" }
            : r;
        });
      });
      // Reload from database to ensure consistency
      await loadReservations();
    } catch (err) {
      console.error("Failed to mark as arrived:", err);
      const errorMsg = err?.response?.data?.error || err?.message || "Please try again.";
      alert(`Failed to mark as arrived: ${errorMsg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSeat = async (reservation) => {
    const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
    if (!reservationId) {
      alert("Reservation ID not found");
      return;
    }

    // If no table assigned, navigate to table selection
    if (!reservation.tableId && !reservation.TableID) {
      if (confirm("No table assigned. Would you like to assign a table now?")) {
        navigate(`/table-action/select?reservationId=${reservationId}`);
      }
      return;
    }

    if (!confirm("Mark this reservation as SEATED?")) {
      return;
    }

    setProcessingId(reservationId);
    try {
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, "SEATED");
      } else {
        const result = await updateReservationStatus(reservationId, "SEATED");
        if (!result.ok) {
          throw new Error(result.error || "Failed to update status");
        }
        console.log("[Reports] Status update successful:", result);
      }
      // Update local state immediately
      setReservations(prev => {
        const current = Array.isArray(prev) ? prev : [];
        return current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return rId === reservationId
            ? { ...r, status: "SEATED" }
            : r;
        });
      });
      // Reload from database to ensure consistency
      await loadReservations();
    } catch (err) {
      console.error("Failed to seat reservation:", err);
      const errorMsg = err?.response?.data?.error || err?.message || "Please try again.";
      alert(`Failed to seat reservation: ${errorMsg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkLeft = async (reservation) => {
    const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
    if (!reservationId) {
      alert("Reservation ID not found");
      return;
    }

    if (!confirm("Mark this reservation as LEFT?")) {
      return;
    }

    setProcessingId(reservationId);
    try {
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, "LEFT");
      } else {
        const result = await updateReservationStatus(reservationId, "LEFT");
        if (!result.ok) {
          throw new Error(result.error || "Failed to update status");
        }
        console.log("[Reports] Status update successful:", result);
      }
      // Update local state immediately
      setReservations(prev => {
        const current = Array.isArray(prev) ? prev : [];
        return current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return rId === reservationId
            ? { ...r, status: "LEFT" }
            : r;
        });
      });
      // Reload from database to ensure consistency
      await loadReservations();
    } catch (err) {
      console.error("Failed to mark as left:", err);
      const errorMsg = err?.response?.data?.error || err?.message || "Please try again.";
      alert(`Failed to mark as left: ${errorMsg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleStatusChange = async (reservation, newStatus) => {
    const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
    if (!reservationId) {
      alert("Reservation ID not found");
      return;
    }

    setProcessingId(reservationId);
    try {
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, newStatus);
      } else {
        const result = await updateReservationStatus(reservationId, newStatus);
        if (!result.ok) {
          throw new Error(result.error || "Failed to update status");
        }
        console.log("[Reports] Status update successful:", result);
      }
      // Update local state immediately
      setReservations(prev => {
        const current = Array.isArray(prev) ? prev : [];
        return current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return rId === reservationId
            ? { ...r, status: newStatus }
            : r;
        });
      });
      // Reload from database to ensure consistency
      await loadReservations();
    } catch (err) {
      console.error("Failed to update status:", err);
      const errorMsg = err?.response?.data?.error || err?.message || "Please try again.";
      alert(`Failed to update status: ${errorMsg}`);
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

      {/* Period Selector - Keep this at top */}
      <div style={{
        padding: "1rem 1.5rem",
        backgroundColor: "#fff",
        borderBottom: "1px solid #e5e7eb"
      }}>
        <div style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "12px"
        }}>
          {Object.entries(timePeriods).map(([key, period]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedPeriod(key)}
              style={{
                padding: "12px 16px",
                borderRadius: "12px",
                border: selectedPeriod === key ? "2px solid #C91A4D" : "1px solid #e5e7eb",
                backgroundColor: selectedPeriod === key ? "#FBE6EC" : "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.2s",
                flex: "1",
                minWidth: "120px",
                justifyContent: "center"
              }}
              onMouseEnter={(e) => {
                if (selectedPeriod !== key) {
                  e.currentTarget.style.borderColor = "#C91A4D";
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedPeriod !== key) {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.backgroundColor = "#fff";
                }
              }}
            >
              <div style={{ color: period.color }}>{period.icon}</div>
              <div style={{
                fontSize: "14px",
                fontWeight: selectedPeriod === key ? "700" : "600",
                color: selectedPeriod === key ? "#C91A4D" : "#374151"
              }}>
                {period.label}
              </div>
            </button>
          ))}
        </div>
        {/* Date Selector */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px"
        }}>
          <label style={{ fontSize: "13px", fontWeight: "700", color: "#374151", minWidth: "50px" }}>
            Date:
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              fontSize: "14px",
              outline: "none",
              flex: 1,
              maxWidth: "200px"
            }}
          />
        </div>
      </div>

      {/* Filters - Same as ReservationListPage */}
      <div style={{
        padding: "1rem 1.5rem",
        backgroundColor: "#fff",
        borderBottom: "1px solid #e5e7eb"
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search guest, phone, table..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            border: "1px solid #d1d5db",
            borderRadius: "10px",
            fontSize: "0.875rem",
            outline: "none",
            marginBottom: "0.75rem"
          }}
        />
        
        {/* Status Filter Label */}
        <div style={{
          fontSize: "13px",
          fontWeight: "700",
          color: "#374151",
          marginBottom: "8px",
          marginTop: "4px"
        }}>
          Filter by Status:
        </div>
        
        {/* Quick Filter Buttons */}
        <div style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap"
        }}>
          {[
            { value: "all", label: "All", icon: "📋" },
            { value: "upcoming", label: "Upcoming", icon: "⏰" },
            { value: "confirmed", label: "Confirmed", icon: "✓" },
            { value: "arrived", label: "Arrived", icon: "👋" },
            { value: "seated", label: "Seated", icon: "🪑" },
            { value: "left", label: "Left", icon: "👋" },
            { value: "cancelled", label: "Cancelled", icon: "❌" },
            { value: "no-show", label: "No Show", icon: "🚫" }
          ].map((filterOption) => {
            const count = getStatusCount(filterOption.value);
            const isActive = statusFilter === filterOption.value;
            
            return (
              <button
                key={filterOption.value}
                onClick={() => setStatusFilter(filterOption.value)}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "20px",
                  border: isActive ? "2px solid #C91A4D" : "1px solid #d1d5db",
                  backgroundColor: isActive ? "#FBE6EC" : "#fff",
                  color: isActive ? "#C91A4D" : "#374151",
                  fontSize: "0.8125rem",
                  fontWeight: isActive ? "700" : "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                  boxShadow: isActive ? "0 2px 8px rgba(201, 26, 77, 0.2)" : "none"
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = "#C91A4D";
                    e.currentTarget.style.backgroundColor = "#f9fafb";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = "#d1d5db";
                    e.currentTarget.style.backgroundColor = "#fff";
                    e.currentTarget.style.transform = "translateY(0)";
                  }
                }}
              >
                <span>{filterOption.icon}</span>
                <span>{filterOption.label}</span>
                {/* Count Badge */}
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "20px",
                  height: "20px",
                  padding: "0 6px",
                  borderRadius: "10px",
                  background: isActive 
                    ? "linear-gradient(135deg, #7A0026, #C91A4D)" 
                    : "#e5e7eb",
                  color: isActive ? "#fff" : "#6b7280",
                  fontSize: "0.6875rem",
                  fontWeight: "800",
                  marginLeft: "2px"
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div style={{
        flex: 1,
        padding: "1rem 1.5rem",
        overflow: "auto",
        WebkitOverflowScrolling: "touch"
      }}>
        {loading ? (
          <div style={{
            padding: "2rem",
            textAlign: "center",
            color: "#666"
          }}>
            Loading...
          </div>
        ) : (Array.isArray(reservations) ? reservations : []).length === 0 ? (
          <div style={{
            padding: "2rem",
            textAlign: "center",
            color: "#666"
          }}>
            No reservations found
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {(Array.isArray(reservations) ? reservations : [])
              .filter(reservation => {
                // Apply search filter
                if (searchQuery) {
                  const query = searchQuery.toLowerCase();
                  const matchesSearch = (
                    (reservation.customerName || reservation.CustomerName || '').toLowerCase().includes(query) ||
                    (reservation.customerPhone || reservation.CustomerPhone || '').includes(query) ||
                    String(reservation.tableId || reservation.TableID || '').includes(query)
                  );
                  if (!matchesSearch) return false;
                }
                return true;
              })
              .map((reservation, index) => {
              const reservationId = reservation.reservationId || reservation.ReservationID;
              return (
                <div
                  key={reservationId || index}
                  onClick={() => {
                    navigate(`/reservation-details?id=${reservationId}`);
                  }}
                  style={{
                    padding: "1rem",
                    backgroundColor: "#fff",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#C91A4D";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(201, 26, 77, 0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginBottom: "0.5rem"
                    }}>
                      <div style={{
                        fontSize: "1rem",
                        fontWeight: "600"
                      }}>
                        {reservation.customerName || reservation.CustomerName || 'Guest'}
                      </div>
                      <div style={{
                        padding: "0.25rem 0.75rem",
                        backgroundColor: getStatusColor(reservation.status || reservation.Status) + "20",
                        color: getStatusColor(reservation.status || reservation.Status),
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: "600"
                      }}>
                        {reservation.status || reservation.Status || 'PENDING'}
                      </div>
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
                        {reservation.customerPhone || reservation.CustomerPhone || '-'}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        {reservation.numberOfGuests || reservation.NumberOfGuests || reservation.pax || '-'} guests
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        {reservation.reservationTime || reservation.ReservationTime || '-'}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <line x1="9" y1="9" x2="15" y2="9" />
                          <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                        Table {reservation.tableId || reservation.TableID || 'Unassigned'}
                      </span>
                    </div>
                    {reservation.specialRequests && (
                      <div style={{
                        fontSize: "0.8125rem",
                        color: "#9ca3af",
                        marginTop: "0.5rem",
                        fontStyle: "italic"
                      }}>
                        {reservation.specialRequests}
                      </div>
                    )}
                  </div>
                  <div 
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      flexDirection: "column"
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(reservation.status || reservation.Status || '').toUpperCase() !== 'ARRIVED' && 
                     (reservation.status || reservation.Status || '').toUpperCase() !== 'SEATED' && 
                     (reservation.status || reservation.Status || '').toUpperCase() !== 'CANCELLED' &&
                     (reservation.status || reservation.Status || '').toUpperCase() !== 'LEFT' && (
                      <button
                        onClick={() => handleMarkArrived(reservation)}
                        disabled={processingId === reservationId}
                        style={{
                          padding: "0.5rem 1rem",
                          backgroundColor: processingId === reservationId ? "#ccc" : "#9c27b0",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "0.75rem",
                          cursor: processingId === reservationId ? "not-allowed" : "pointer",
                          fontWeight: "600",
                          opacity: processingId === reservationId ? 0.6 : 1
                        }}
                      >
                        {processingId === reservationId ? "Processing..." : "Mark Arrived"}
                      </button>
                    )}
                    {((reservation.status || reservation.Status || '').toUpperCase() === 'ARRIVED' || 
                       (reservation.status || reservation.Status || '').toUpperCase() === 'CONFIRMED' ||
                       !reservation.status) && 
                     (reservation.status || reservation.Status || '').toUpperCase() !== 'SEATED' && 
                     (reservation.status || reservation.Status || '').toUpperCase() !== 'CANCELLED' &&
                     (reservation.status || reservation.Status || '').toUpperCase() !== 'LEFT' && (
                      <button
                        onClick={() => handleSeat(reservation)}
                        disabled={processingId === reservationId}
                        style={{
                          padding: "0.5rem 1rem",
                          backgroundColor: processingId === reservationId ? "#ccc" : "#4caf50",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "0.75rem",
                          cursor: processingId === reservationId ? "not-allowed" : "pointer",
                          fontWeight: "600",
                          opacity: processingId === reservationId ? 0.6 : 1
                        }}
                      >
                        {processingId === reservationId ? "Processing..." : "Seat Now"}
                      </button>
                    )}
                    {((reservation.status || reservation.Status || '').toUpperCase() === 'SEATED' || 
                       (reservation.status || reservation.Status || '').toUpperCase() === 'ARRIVED' ||
                       (reservation.status || reservation.Status || '').toUpperCase() === 'CHECKED_IN') && 
                     (reservation.status || reservation.Status || '').toUpperCase() !== 'LEFT' &&
                     (reservation.status || reservation.Status || '').toUpperCase() !== 'CANCELLED' && (
                      <button
                        onClick={() => handleMarkLeft(reservation)}
                        disabled={processingId === reservationId}
                        style={{
                          padding: "0.5rem 1rem",
                          backgroundColor: processingId === reservationId ? "#ccc" : "#f59e0b",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "0.75rem",
                          cursor: processingId === reservationId ? "not-allowed" : "pointer",
                          fontWeight: "600",
                          opacity: processingId === reservationId ? 0.6 : 1
                        }}
                      >
                        {processingId === reservationId ? "Processing..." : "Mark Left"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />

      {/* Status Selector Modal */}
      {showStatusSelector && selectedReservation && (
        <StatusSelector
          reservation={selectedReservation}
          onStatusChange={handleStatusChange}
          onClose={() => {
            setShowStatusSelector(false);
            setSelectedReservation(null);
          }}
        />
      )}
      
      {/* Add CSS for spin animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

