// frontend/src/pages/TableActionPage.jsx
// TODO: See RESERVATION_FEATURES_BACKLOG.md for pending features:
// - Move Table (line 307)
// - Reassign Table (line 268)
import { useNavigate, useLocation } from "react-router-dom";
import { useReservationStore } from "../store/reservationStore";
import BottomNav from "../component/reservation/BottomNav";

export default function TableActionPage() { 
  const navigate = useNavigate(); 
  const location = useLocation();
  const { 
    selectedTable,
    updateTableStatus
  } = useReservationStore();

  // Get table from location state or store
  const table = location.state?.table || selectedTable;

  if (!table) {
    navigate("/reservation");
    return null;
  }

  const handleBlockTable = () => {
    if (confirm(`Block Table ${table.number || table.id}?`)) {
      updateTableStatus(table.id || table.number, 'Blocked');
      navigate("/reservation");
    }
  };

  const handleMarkDirty = () => {
    if (confirm(`Mark Table ${table.number || table.id} as Dirty?`)) {
      updateTableStatus(table.id || table.number, 'Dirty');
      navigate("/reservation");
    }
  };

  const handleMarkAvailable = () => {
    if (confirm(`Mark Table ${table.number || table.id} as Available?`)) {
      updateTableStatus(table.id || table.number, 'Available');
      navigate("/reservation");
    }
  };

  const getStatusColor = (status) => {
    const statusLower = (status || '').toLowerCase();
    switch (statusLower) {
      case 'available': return '#4caf50';
      case 'reserved': return '#ff9800';
      case 'seated': return '#2196f3';
      case 'occupied': return '#f44336';
      case 'blocked': return '#9e9e9e';
      case 'dirty': return '#ff5722';
      default: return '#e0e0e0';
    }
  };

  const status = table.status || 'Unknown';
  const statusColor = getStatusColor(status);

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
        <div style={{ flex: 1 }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: "1.5rem", 
            fontWeight: "700",
            color: "#111827"
          }}>
            Table {table.number || table.tableNo || table.id}
          </h1>
          <p style={{ 
            margin: "0.25rem 0 0 0", 
            color: "#6b7280", 
            fontSize: "0.8125rem" 
          }}>
            Capacity: {table.capacity || table.seats || '-'} seats
          </p>
        </div>
      </div>

      {/* Status Badge */}
      <div style={{
        padding: "1rem 1.5rem",
        backgroundColor: statusColor + "20",
        borderBottom: "1px solid #e5e7eb"
      }}>
        <div style={{
          display: "inline-block",
          padding: "0.5rem 1rem",
          backgroundColor: statusColor,
          color: "#fff",
          borderRadius: "10px",
          fontSize: "0.875rem",
          fontWeight: "600"
        }}>
          {status}
        </div>
      </div>

      {/* Reservation Info */}
      {table.reservationInfo && (
        <div style={{
          padding: "1.5rem",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#fff"
        }}>
          <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", fontWeight: "600" }}>
            Reservation Details
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div>
              <strong>Guest:</strong> {table.reservationInfo.guestName || table.reservationInfo.customerName}
            </div>
            {table.reservationInfo.time && (
              <div>
                <strong>Time:</strong> {table.reservationInfo.time}
              </div>
            )}
            {table.reservationInfo.date && (
              <div>
                <strong>Date:</strong> {table.reservationInfo.date}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        flex: 1
      }}>
        {status === 'Available' && (
          <>
            <button
              onClick={() => navigate("/walk-in", { state: { table } })}
              style={{
                width: "100%",
                padding: "0.875rem 1.5rem",
                backgroundColor: "#2196f3",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
                touchAction: "manipulation"
              }}
            >
              Seat Walk-in
            </button>
            <button
              onClick={() => navigate("/reservation-form", { state: { table } })}
              style={{
                width: "100%",
                padding: "0.875rem 1.5rem",
                backgroundColor: "#4caf50",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
                touchAction: "manipulation"
              }}
            >
              Assign Reservation
            </button>
            <button
              onClick={handleBlockTable}
              style={{
                width: "100%",
                padding: "0.875rem 1.5rem",
                backgroundColor: "#9e9e9e",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
                touchAction: "manipulation"
              }}
            >
              Block Table
            </button>
          </>
        )}

        {status === 'Reserved' && (
          <>
            <button
              onClick={() => alert("Mark Arrived - Coming soon")}
              style={{
                width: "100%",
                padding: "0.875rem 1.5rem",
                backgroundColor: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
                touchAction: "manipulation"
              }}
            >
              Mark Arrived
            </button>
            <button
              onClick={() => alert("Seat Reservation - Coming soon")}
              style={{
                width: "100%",
                padding: "0.875rem 1.5rem",
                backgroundColor: "#4caf50",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
                touchAction: "manipulation"
              }}
            >
              Seat Reservation
            </button>
            <button
              onClick={() => alert("Reassign Table - Coming soon")}
              style={{
                width: "100%",
                padding: "0.875rem 1.5rem",
                backgroundColor: "#2196f3",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
                touchAction: "manipulation"
              }}
            >
              Reassign Table
            </button>
          </>
        )}

        {(status === 'Seated' || status === 'Occupied') && (
          <>
            <button
              onClick={() => alert("View Party Details - Coming soon")}
              style={{
                width: "100%",
                padding: "0.875rem 1.5rem",
                backgroundColor: "#2196f3",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
                touchAction: "manipulation"
              }}
            >
              View Party Details
            </button>
            <button
              onClick={() => alert("Move Table - Coming soon")}
              style={{
                width: "100%",
                padding: "0.875rem 1.5rem",
                backgroundColor: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
                touchAction: "manipulation"
              }}
            >
              Move Table
            </button>
            <button
              onClick={handleMarkAvailable}
              style={{
                width: "100%",
                padding: "0.875rem 1.5rem",
                backgroundColor: "#4caf50",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
                touchAction: "manipulation"
              }}
            >
              Mark Completed
            </button>
            <button
              onClick={handleMarkDirty}
              style={{
                width: "100%",
                padding: "0.875rem 1.5rem",
                backgroundColor: "#ff5722",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
                touchAction: "manipulation"
              }}
            >
              Mark Dirty
            </button>
          </>
        )}

        {status === 'Blocked' && (
          <button
            onClick={handleMarkAvailable}
            style={{
              width: "100%",
              padding: "0.875rem 1.5rem",
              backgroundColor: "#4caf50",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: "pointer",
              touchAction: "manipulation"
            }}
          >
            Unblock Table
          </button>
        )}

        {status === 'Dirty' && (
          <button
            onClick={handleMarkAvailable}
            style={{
              width: "100%",
              padding: "0.875rem 1.5rem",
              backgroundColor: "#4caf50",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: "pointer",
              touchAction: "manipulation"
            }}
          >
            Mark Clean (Available)
          </button>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}

