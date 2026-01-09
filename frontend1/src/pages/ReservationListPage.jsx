// frontend/src/pages/ReservationListPage.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useReservationStore } from "../store/reservationStore";
import { getAllReservations, updateReservationStatus } from "../services/reservation.service";
import { getMockReservations, updateMockReservationStatus } from "../services/reservation.mock";
import BottomNav from "../component/reservation/BottomNav";

// Toggle this to use mock data instead of API
const USE_MOCK_DATA = true;

export default function ReservationListPage() {
  const navigate = useNavigate();
  const { 
    selectedDate,
    reservations,
    setReservations
  } = useReservationStore();

  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadReservations();
  }, [selectedDate, filter]);

  const loadReservations = async () => {
    setLoading(true);
    try {
      let result;
      if (USE_MOCK_DATA) {
        // Use mock data
        result = getMockReservations({ 
          date: selectedDate,
          status: filter === 'all' ? undefined : filter
        });
      } else {
        // Use real API
        result = await getAllReservations({ 
          date: selectedDate,
          status: filter === 'all' ? undefined : filter.toUpperCase()
        });
      }
      setReservations(result.reservations || []);
    } catch (err) {
      console.error("Failed to load reservations:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredReservations = reservations.filter(r => {
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
      case 'cancelled': return '#f44336';
      case 'no-show': return '#9e9e9e';
      default: return '#666';
    }
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
            { value: "cancelled", label: "Cancelled", icon: "❌" },
            { value: "no-show", label: "No Show", icon: "🚫" }
          ].map((filterOption) => (
            <button
              key={filterOption.value}
              onClick={() => setFilter(filterOption.value)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "20px",
                border: filter === filterOption.value ? "2px solid #C91A4D" : "1px solid #d1d5db",
                backgroundColor: filter === filterOption.value ? "#FBE6EC" : "#fff",
                color: filter === filterOption.value ? "#C91A4D" : "#374151",
                fontSize: "0.8125rem",
                fontWeight: filter === filterOption.value ? "700" : "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                transition: "all 0.2s",
                whiteSpace: "nowrap"
              }}
              onMouseEnter={(e) => {
                if (filter !== filterOption.value) {
                  e.currentTarget.style.borderColor = "#C91A4D";
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (filter !== filterOption.value) {
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
                      {reservation.customerName || 'Guest'}
                    </div>
                    <div style={{
                      padding: "0.25rem 0.75rem",
                      backgroundColor: getStatusColor(reservation.status) + "20",
                      color: getStatusColor(reservation.status),
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: "600"
                    }}>
                      {reservation.status || 'PENDING'}
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
                  {(reservation.status || '').toUpperCase() !== 'ARRIVED' && 
                   (reservation.status || '').toUpperCase() !== 'SEATED' && 
                   (reservation.status || '').toUpperCase() !== 'CANCELLED' && (
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
                  {((reservation.status || '').toUpperCase() === 'ARRIVED' || 
                     (reservation.status || '').toUpperCase() === 'CONFIRMED' ||
                     !reservation.status) && 
                   (reservation.status || '').toUpperCase() !== 'SEATED' && 
                   (reservation.status || '').toUpperCase() !== 'CANCELLED' && (
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

