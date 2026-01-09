// frontend/src/component/reservation/TableCard.jsx
import { memo } from "react";

const TableCard = memo(({ table, onClick, isSelected = false }) => {
  const getStatusConfig = (status) => {
    const statusLower = (status || '').toLowerCase();
    switch (statusLower) {
      case 'available':
        return { color: '#10b981' };
      case 'reserved':
        return { color: '#f59e0b' };
      case 'seated':
        return { color: '#3b82f6' };
      case 'occupied':
        return { color: '#ef4444' };
      case 'blocked':
      case 'out of service':
        return { color: '#6b7280' };
      case 'dirty':
        return { color: '#f97316' };
      default:
        return { color: '#9ca3af' };
    }
  };

  const config = getStatusConfig(table.status);
  const seats = table.capacity || table.seats || 0;
  const tableNumber = table.number || table.tableNo || table.id;
  
  // If selected, use selection color
  const borderColor = isSelected ? '#C91A4D' : config.color;
  const bgColor = isSelected ? '#FBE6EC' : 'white';
  const textColor = isSelected ? '#C91A4D' : config.color;

  return (
    <div
      onClick={() => onClick && onClick(table)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        width: "100%",
        height: "100%",
        padding: "0.5rem",
        position: "relative"
      }}
    >
      {/* Selection Indicator Badge */}
      {isSelected && (
        <div style={{
          position: "absolute",
          top: "2px",
          right: "2px",
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, #7A0026, #C91A4D)",
          border: "2px solid white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
        }}>
          <span style={{ 
            color: "white", 
            fontSize: "10px", 
            fontWeight: "800",
            lineHeight: "1"
          }}>✓</span>
        </div>
      )}

      {/* Simple Circle with Table Number */}
      <div
        style={{
          width: "50px",
          height: "50px",
          borderRadius: "50%",
          border: `2px solid ${borderColor}`,
          backgroundColor: bgColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "4px",
          transition: "all 0.2s",
          boxShadow: isSelected ? `0 0 0 3px ${borderColor}40` : "none"
        }}
      >
        <span
          style={{
            fontSize: "1.2rem",
            fontWeight: isSelected ? "700" : "500",
            color: textColor
          }}
        >
          {tableNumber}
        </span>
      </div>

      {/* Seats */}
      <div
        style={{
          fontSize: "0.7rem",
          fontWeight: "400",
          color: isSelected ? "#C91A4D" : "#6b7280",
          textAlign: "center"
        }}
      >
        {seats}
      </div>
    </div>
  );
});

TableCard.displayName = 'TableCard';

export default TableCard;
