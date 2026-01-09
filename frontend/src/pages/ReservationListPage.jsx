// frontend/src/pages/ReservationListPage.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useReservationStore } from "../store/reservationStore";
import { getAllReservations, updateReservationStatus } from "../services/reservation.service";
import { getMockReservations, updateMockReservationStatus } from "../services/reservation.mock";
import BottomNav from "../component/reservation/BottomNav";

// Toggle this to use mock data instead of API
const USE_MOCK_DATA = false;

export default function ReservationListPage() {
  const navigate = useNavigate();
  const { 
    selectedDate,
    reservations: storeReservations,
    setReservations
  } = useReservationStore();

  // Local state to ensure reservations is always an array
  const [localReservations, setLocalReservations] = useState([]);
  const [allReservations, setAllReservations] = useState([]); // Store all reservations for counting
  
  // Always prefer local reservations if it's an array (even if empty), otherwise use store reservations
  const reservations = Array.isArray(localReservations)
    ? localReservations 
    : (Array.isArray(storeReservations) ? storeReservations : []);

  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadReservations();
  }, [selectedDate]); // Only reload when date changes, not filter (frontend filtering now)

  const loadReservations = async () => {
    setLoading(true);
    try {
      let result;
      if (USE_MOCK_DATA) {
        // Use mock data - load ALL reservations (no status filter)
        result = getMockReservations({ 
          date: selectedDate
          // Don't pass status filter - we'll filter on frontend for counting
        });
      } else {
        // Use real API - load ALL reservations (no status filter)
        result = await getAllReservations({ 
          date: selectedDate
          // Don't pass status filter - we'll filter on frontend for counting
        });
      }
      
      // Handle both cases: result is an array or result has a reservations property
      let reservationsArray = [];
      if (Array.isArray(result)) {
        reservationsArray = result;
      } else if (result && Array.isArray(result.reservations)) {
        reservationsArray = result.reservations;
      } else if (result && result.reservations) {
        // If reservations is not an array, make it one
        reservationsArray = [result.reservations];
      }
      
      // Store all reservations for counting (without status filter)
      setAllReservations(reservationsArray);
      
      // Always update both local and store
      setLocalReservations(reservationsArray);
      setReservations(reservationsArray);
    } catch (err) {
      console.error("Failed to load reservations:", err);
      setLocalReservations([]); // Ensure it's always an array even on error
      setReservations([]); // Also update store
      setAllReservations([]); // Reset all reservations too
    } finally {
      setLoading(false);
    }
  };

  // Calculate status counts for filter badges
  const getStatusCount = (filterValue) => {
    if (!Array.isArray(allReservations)) return 0;
    
    const now = new Date();
    
    if (filterValue === 'all') return allReservations.length;
    
    return allReservations.filter(res => {
      const status = (res.status || res.Status || '').toUpperCase();
      const resDate = res.reservationDate || res.ReservationDate;
      const resTime = res.reservationTime || res.ReservationTime;
      
      if (filterValue === 'upcoming') {
        if (!resDate || !resTime) return false;
        const resDateTime = new Date(`${resDate}T${resTime}`);
        const isToday = resDate === new Date().toISOString().split('T')[0];
        if (isToday) {
          return resDateTime > now && status !== 'CANCELLED' && status !== 'NO_SHOW' && status !== 'LEFT';
        } else {
          return status !== 'CANCELLED' && status !== 'NO_SHOW' && status !== 'LEFT';
        }
      }
      
      if (filterValue === 'cancelled') {
        return status === 'CANCELLED' || status === 'CANCELLED_NOTIFY';
      }
      
      if (filterValue === 'no-show') {
        return status === 'NO_SHOW';
      }
      
      if (filterValue === 'left') {
        return status === 'LEFT';
      }
      
      return status === filterValue.toUpperCase();
    }).length;
  };

  const filteredReservations = (Array.isArray(reservations) ? reservations : []).filter(r => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        (r.customerName || '').toLowerCase().includes(query) ||
        (r.customerPhone || '').includes(query) ||
        String(r.tableId || '').includes(query)
      );
      if (!matchesSearch) return false;
    }

    // Status filter
    if (filter === 'all') return true;
    
    const status = (r.status || '').toUpperCase();
    const now = new Date();
    const resDate = r.reservationDate || r.ReservationDate;
    const resTime = r.reservationTime || r.ReservationTime;
    
    if (filter === 'upcoming') {
      if (!resDate || !resTime) return false;
      const resDateTime = new Date(`${resDate}T${resTime}`);
      return resDateTime > now && status !== 'CANCELLED' && status !== 'NO_SHOW';
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
  });

  const getStatusColor = (status) => {
    const statusLower = (status || '').toLowerCase();
    switch (statusLower) {
      case 'booked':
      case 'pending': return '#ff9800';
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
        console.log("[ReservationList] Status update successful:", result);
      }
      // Update local state immediately for instant UI feedback
      setLocalReservations(prev => {
        const current = Array.isArray(prev) ? prev : (Array.isArray(reservations) ? reservations : []);
        // Create a new array to ensure React detects the change
        const updated = current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          // Use String comparison to handle number/string mismatches
          if (String(rId) === String(reservationId)) {
            console.log("[ReservationList] Updating reservation:", { rId, reservationId, oldStatus: r.status, newStatus: "ARRIVED" });
            return { ...r, status: "ARRIVED", Status: "ARRIVED" }; // Update both possible field names
          }
          return r;
        });
        console.log("[ReservationList] Updated local state:", { reservationId, totalReservations: updated.length, updated: updated.find(r => String(r.reservationId || r.bookingID || r.ReservationID) === String(reservationId)) });
        return updated; // Return new array reference
      });
      
      // Also update store for consistency
      setReservations(prev => {
        const current = Array.isArray(prev) ? prev : [];
        return current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return String(rId) === String(reservationId)
            ? { ...r, status: "ARRIVED" }
            : r;
        });
      });
      
      // Reload from database after a delay to sync with server, but UI already updated
      setTimeout(async () => {
        try {
          await loadReservations();
        } catch (reloadErr) {
          console.error("Failed to reload reservations:", reloadErr);
          // Don't show error to user since UI is already updated
        }
      }, 1000);
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
      }
      // Update local state immediately for instant UI feedback
      setLocalReservations(prev => {
        const current = Array.isArray(prev) ? prev : (Array.isArray(reservations) ? reservations : []);
        const updated = current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return String(rId) === String(reservationId)
            ? { ...r, status: "SEATED" }
            : r;
        });
        return updated;
      });
      
      // Also update store for consistency
      setReservations(prev => {
        const current = Array.isArray(prev) ? prev : [];
        return current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return String(rId) === String(reservationId)
            ? { ...r, status: "SEATED" }
            : r;
        });
      });
      
      // Reload from database after a short delay to ensure consistency
      setTimeout(async () => {
        await loadReservations();
      }, 500);
    } catch (err) {
      console.error("Failed to seat reservation:", err);
      alert(`Failed to seat reservation: ${err?.response?.data?.error || err?.message || "Please try again."}`);
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
      }
      // Update local state immediately for instant UI feedback
      setLocalReservations(prev => {
        const current = Array.isArray(prev) ? prev : (Array.isArray(reservations) ? reservations : []);
        const updated = current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return String(rId) === String(reservationId)
            ? { ...r, status: "LEFT" }
            : r;
        });
        return updated;
      });
      
      // Also update store for consistency
      setReservations(prev => {
        const current = Array.isArray(prev) ? prev : [];
        return current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return String(rId) === String(reservationId)
            ? { ...r, status: "LEFT" }
            : r;
        });
      });
      
      // Reload from database after a short delay to ensure consistency
      setTimeout(async () => {
        await loadReservations();
      }, 500);
    } catch (err) {
      console.error("Failed to mark as left:", err);
      alert(`Failed to mark as left: ${err?.response?.data?.error || err?.message || "Please try again."}`);
    } finally {
      setProcessingId(null);
    }
  };


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
          Reservations - {selectedDate}
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

      {/* Filters */}
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
            const isActive = filter === filterOption.value;
            
            return (
              <button
                key={filterOption.value}
                onClick={() => setFilter(filterOption.value)}
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
        ) : filteredReservations.length === 0 ? (
          <div style={{
            padding: "2rem",
            textAlign: "center",
            color: "#666"
          }}>
            No reservations found
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {filteredReservations.map((reservation, index) => {
              const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
              const currentStatus = (reservation.status || reservation.Status || 'PENDING').toUpperCase();
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
                      {reservation.customerName || 'Guest'}
                    </div>
                    <div style={{
                      padding: "0.25rem 0.75rem",
                      backgroundColor: getStatusColor(reservation.status || reservation.Status) + "20",
                      color: getStatusColor(reservation.status || reservation.Status),
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: "600"
                    }}>
                      {(reservation.status || reservation.Status || 'PENDING').toUpperCase()}
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
                      {reservation.customerPhone || '-'}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      {reservation.numberOfGuests || reservation.pax || '-'} guests
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {reservation.reservationTime || '-'}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="9" y1="9" x2="15" y2="9" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                      </svg>
                      Table {reservation.tableId || 'Unassigned'}
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
                  {currentStatus !== 'ARRIVED' && 
                   currentStatus !== 'SEATED' && 
                   currentStatus !== 'CANCELLED' &&
                   currentStatus !== 'LEFT' && (
                    <button
                      onClick={() => handleMarkArrived(reservation)}
                      disabled={processingId === (reservation.reservationId || reservation.ReservationID)}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: processingId === (reservation.reservationId || reservation.ReservationID) ? "#ccc" : "#9c27b0",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.75rem",
                        cursor: processingId === (reservation.reservationId || reservation.ReservationID) ? "not-allowed" : "pointer",
                        fontWeight: "600",
                        opacity: processingId === (reservation.reservationId || reservation.ReservationID) ? 0.6 : 1
                      }}
                    >
                      {processingId === (reservation.reservationId || reservation.ReservationID) ? "Processing..." : "Mark Arrived"}
                    </button>
                  )}
                  {(currentStatus === 'ARRIVED' ||
                     currentStatus === 'CONFIRMED' ||
                     currentStatus === 'PENDING') && 
                   currentStatus !== 'SEATED' && 
                   currentStatus !== 'CANCELLED' &&
                   currentStatus !== 'LEFT' && (
                    <button
                      onClick={() => handleSeat(reservation)}
                      disabled={processingId === (reservation.reservationId || reservation.ReservationID)}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: processingId === (reservation.reservationId || reservation.ReservationID) ? "#ccc" : "#4caf50",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.75rem",
                        cursor: processingId === (reservation.reservationId || reservation.ReservationID) ? "not-allowed" : "pointer",
                        fontWeight: "600",
                        opacity: processingId === (reservation.reservationId || reservation.ReservationID) ? 0.6 : 1
                      }}
                    >
                      {processingId === (reservation.reservationId || reservation.ReservationID) ? "Processing..." : "Seat Now"}
                    </button>
                  )}
                  {(currentStatus === 'SEATED' || 
                     currentStatus === 'ARRIVED' ||
                     currentStatus === 'CHECKED_IN') && 
                   currentStatus !== 'LEFT' &&
                   currentStatus !== 'CANCELLED' && (
                    <button
                      onClick={() => handleMarkLeft(reservation)}
                      disabled={processingId === (reservation.reservationId || reservation.ReservationID)}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: processingId === (reservation.reservationId || reservation.ReservationID) ? "#ccc" : "#f59e0b",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.75rem",
                        cursor: processingId === (reservation.reservationId || reservation.ReservationID) ? "not-allowed" : "pointer",
                        fontWeight: "600",
                        opacity: processingId === (reservation.reservationId || reservation.ReservationID) ? 0.6 : 1
                      }}
                    >
                      {processingId === (reservation.reservationId || reservation.ReservationID) ? "Processing..." : "Mark Left"}
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}

