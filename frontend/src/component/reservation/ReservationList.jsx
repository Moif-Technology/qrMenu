// frontend/src/component/reservation/ReservationList.jsx
import { useState, useEffect } from "react";
import { useReservationStore } from "../../store/reservationStore";
import { getAllReservations } from "../../services/reservation.service";

export default function ReservationList() {
  const { 
    closeReservationList,
    selectedDate,
    reservations,
    setReservations
  } = useReservationStore();

  const [filter, setFilter] = useState('all'); // all, pending, confirmed, arrived, seated
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReservations();
  }, [selectedDate, filter]);

  const loadReservations = async () => {
    setLoading(true);
    try {
      const result = await getAllReservations({ 
        date: selectedDate,
        status: filter === 'all' ? undefined : filter.toUpperCase()
      });
      setReservations(result.reservations || []);
    } catch (err) {
      console.error("Failed to load reservations:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredReservations = reservations.filter(r => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        (r.customerName || '').toLowerCase().includes(query) ||
        (r.customerPhone || '').includes(query) ||
        String(r.tableId || '').includes(query)
      );
    }
    return true;
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
        if (e.target === e.currentTarget) closeReservationList();
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          padding: "2rem",
          maxWidth: "900px",
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
            Reservations - {selectedDate}
          </h2>
          <button
            onClick={closeReservationList}
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

        {/* Filters */}
        <div style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap"
        }}>
          <input
            type="text"
            placeholder="Search guest, phone, table..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: "200px",
              padding: "0.75rem",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontSize: "1rem"
            }}
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: "0.75rem",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontSize: "1rem",
              cursor: "pointer"
            }}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="arrived">Arrived</option>
            <option value="seated">Seated</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* List */}
        <div style={{
          flex: 1,
          overflow: "auto",
          border: "1px solid #e0e0e0",
          borderRadius: "4px"
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
            <div style={{ display: "flex", flexDirection: "column" }}>
              {filteredReservations.map((reservation, index) => (
                <div
                  key={reservation.reservationId || index}
                  style={{
                    padding: "1rem",
                    borderBottom: index < filteredReservations.length - 1 ? "1px solid #e0e0e0" : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    transition: "background-color 0.2s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f5f5f5"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#fff"}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      marginBottom: "0.5rem"
                    }}>
                      <div style={{
                        fontSize: "1.125rem",
                        fontWeight: "600"
                      }}>
                        {reservation.customerName || 'Guest'}
                      </div>
                      <div style={{
                        padding: "0.25rem 0.75rem",
                        backgroundColor: getStatusColor(reservation.status) + "20",
                        color: getStatusColor(reservation.status),
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: "600"
                      }}>
                        {reservation.status || 'PENDING'}
                      </div>
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
                        {(() => {
                          // Get table display name - prefer tableName, then tableNo, never show tableId
                          const tableName = reservation.tableName || reservation.TableName;
                          const tableNo = reservation.tableNo || reservation.TableNO;
                          const tableId = reservation.tableId || reservation.TableID;
                          
                          if (tableName) {
                            return tableName;
                          } else if (tableNo) {
                            return `Table ${tableNo}`;
                          } else if (tableId && tableId !== 0) {
                            // Fallback: only show ID if no name/number available
                            return `Table ${tableId}`;
                          } else {
                            return 'Unassigned';
                          }
                        })()}
                      </span>
                    </div>
                    {reservation.specialRequests && (
                      <div style={{
                        fontSize: "0.875rem",
                        color: "#999",
                        marginTop: "0.25rem",
                        fontStyle: "italic"
                      }}>
                        {reservation.specialRequests}
                      </div>
                    )}
                  </div>
                  <div style={{
                    display: "flex",
                    gap: "0.5rem"
                  }}>
                    <button
                      onClick={() => alert("Mark Arrived - Coming soon")}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "#9c27b0",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "0.875rem",
                        cursor: "pointer"
                      }}
                    >
                      Arrived
                    </button>
                    <button
                      onClick={() => alert("Seat - Coming soon")}
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
                      Seat
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

