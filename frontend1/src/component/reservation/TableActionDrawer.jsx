// frontend/src/component/reservation/TableActionDrawer.jsx
import { useReservationStore } from "../../store/reservationStore";

export default function TableActionDrawer() {
  const { 
    closeTableActionDrawer, 
    selectedTable,
    openWalkInModal,
    openReservationModal,
    updateTableStatus
  } = useReservationStore();

  if (!selectedTable) return null;

  const handleSeatWalkIn = () => {
    closeTableActionDrawer();
    openWalkInModal();
  };

  const handleAssignReservation = () => {
    closeTableActionDrawer();
    openReservationModal();
  };

  const handleBlockTable = () => {
    if (confirm(`Block Table ${selectedTable.number || selectedTable.id}?`)) {
      updateTableStatus(selectedTable.id || selectedTable.number, 'Blocked');
      closeTableActionDrawer();
    }
  };

  const handleMarkDirty = () => {
    if (confirm(`Mark Table ${selectedTable.number || selectedTable.id} as Dirty?`)) {
      updateTableStatus(selectedTable.id || selectedTable.number, 'Dirty');
      closeTableActionDrawer();
    }
  };

  const handleMarkAvailable = () => {
    if (confirm(`Mark Table ${selectedTable.number || selectedTable.id} as Available?`)) {
      updateTableStatus(selectedTable.id || selectedTable.number, 'Available');
      closeTableActionDrawer();
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

  const status = selectedTable.status || 'Unknown';
  const statusColor = getStatusColor(status);

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
        justifyContent: "flex-end",
        zIndex: 1000
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeTableActionDrawer();
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          width: "400px",
          maxWidth: "90vw",
          height: "100%",
          boxShadow: "-4px 0 16px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "auto"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "1.5rem",
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "600" }}>
              Table {selectedTable.number || selectedTable.tableNo || selectedTable.id}
            </h2>
            <div style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              color: "#666"
            }}>
              Capacity: {selectedTable.capacity || selectedTable.seats || '-'} seats
            </div>
          </div>
          <button
            onClick={closeTableActionDrawer}
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

        {/* Status Badge */}
        <div style={{
          padding: "1rem 1.5rem",
          backgroundColor: statusColor + "20",
          borderBottom: "1px solid #e0e0e0"
        }}>
          <div style={{
            display: "inline-block",
            padding: "0.5rem 1rem",
            backgroundColor: statusColor,
            color: "#fff",
            borderRadius: "4px",
            fontSize: "0.875rem",
            fontWeight: "600"
          }}>
            {status}
          </div>
        </div>

        {/* Reservation Info */}
        {selectedTable.reservationInfo && (
          <div style={{
            padding: "1.5rem",
            borderBottom: "1px solid #e0e0e0"
          }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", fontWeight: "600" }}>
              Reservation Details
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div>
                <strong>Guest:</strong> {selectedTable.reservationInfo.guestName || selectedTable.reservationInfo.customerName}
              </div>
              {selectedTable.reservationInfo.time && (
                <div>
                  <strong>Time:</strong> {selectedTable.reservationInfo.time}
                </div>
              )}
              {selectedTable.reservationInfo.date && (
                <div>
                  <strong>Date:</strong> {selectedTable.reservationInfo.date}
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
                onClick={handleSeatWalkIn}
                style={{
                  width: "100%",
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#2196f3",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                Seat Walk-in
              </button>
              <button
                onClick={handleAssignReservation}
                style={{
                  width: "100%",
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#4caf50",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                Assign Reservation
              </button>
              <button
                onClick={handleBlockTable}
                style={{
                  width: "100%",
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#9e9e9e",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer"
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
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#ff9800",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                Mark Arrived
              </button>
              <button
                onClick={() => alert("Seat Reservation - Coming soon")}
                style={{
                  width: "100%",
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#4caf50",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                Seat Reservation
              </button>
              <button
                onClick={() => alert("Reassign Table - Coming soon")}
                style={{
                  width: "100%",
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#2196f3",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer"
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
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#2196f3",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                View Party Details
              </button>
              <button
                onClick={() => alert("Move Table - Coming soon")}
                style={{
                  width: "100%",
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#ff9800",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                Move Table
              </button>
              <button
                onClick={handleMarkAvailable}
                style={{
                  width: "100%",
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#4caf50",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                Mark Completed
              </button>
              <button
                onClick={handleMarkDirty}
                style={{
                  width: "100%",
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#ff5722",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer"
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
                padding: "0.75rem 1.5rem",
                backgroundColor: "#4caf50",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "1rem",
                fontWeight: "600",
                cursor: "pointer"
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
                padding: "0.75rem 1.5rem",
                backgroundColor: "#4caf50",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "1rem",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              Mark Clean (Available)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

