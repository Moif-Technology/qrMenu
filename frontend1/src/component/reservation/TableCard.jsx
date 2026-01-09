// frontend/src/component/reservation/TableCard.jsx
import { memo } from "react";

const TableCard = memo(({ table, onClick }) => {
  const getStatusConfig = (status) => {
    const statusLower = (status || '').toLowerCase();
    switch (statusLower) {
      case 'available':
        return { 
          bg: '#ecfdf5',
          border: '#10b981',
          text: '#065f46',
          numberColor: '#059669'
        };
      case 'reserved':
        return { 
          bg: '#fffbeb',
          border: '#f59e0b',
          text: '#92400e',
          numberColor: '#d97706'
        };
      case 'seated':
        return { 
          bg: '#eff6ff',
          border: '#3b82f6',
          text: '#1e40af',
          numberColor: '#2563eb'
        };
      case 'occupied':
        return { 
          bg: '#fef2f2',
          border: '#ef4444',
          text: '#991b1b',
          numberColor: '#dc2626'
        };
      case 'blocked':
      case 'out of service':
        return { 
          bg: '#f9fafb',
          border: '#9ca3af',
          text: '#374151',
          numberColor: '#6b7280'
        };
      case 'dirty':
        return { 
          bg: '#fff7ed',
          border: '#f97316',
          text: '#9a3412',
          numberColor: '#ea580c'
        };
      default:
        return { 
          bg: '#f9fafb',
          border: '#d1d5db',
          text: '#6b7280',
          numberColor: '#9ca3af'
        };
    }
  };

  const config = getStatusConfig(table.status);
  const hasReservation = table.reservationInfo || (table.status === 'Reserved');
  const reservationName = table.reservationInfo?.guestName || table.reservationInfo?.customerName;
  const reservationTime = table.reservationInfo?.time || table.reservationInfo?.reservationTime;

  return (
    <div
      onClick={() => onClick && onClick(table)}
      style={{
        background: config.bg,
        border: `2px solid ${config.border}`,
        borderRadius: "14px",
        padding: "1rem",
        minHeight: "110px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        cursor: "pointer",
        transition: "all 0.2s",
        position: "relative",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent"
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.transform = "scale(0.97)";
        e.currentTarget.style.opacity = "0.9";
      }}
      onTouchEnd={(e) => {
        setTimeout(() => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.opacity = "1";
        }, 150);
      }}
    >
      {/* Status Indicator */}
      <div style={{
        position: "absolute",
        top: "0.5rem",
        right: "0.5rem",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        backgroundColor: config.border
      }} />

      {/* Table Number */}
      <div style={{
        fontSize: "1.75rem",
        fontWeight: "800",
        textAlign: "center",
        color: config.numberColor,
        marginTop: "0.25rem"
      }}>
        {table.number || table.tableNo || table.id}
      </div>

      {/* Seats */}
      <div style={{
        fontSize: "0.75rem",
        textAlign: "center",
        color: config.text,
        fontWeight: "600",
        marginTop: "0.25rem"
      }}>
        {table.capacity || table.seats || '-'} seats
      </div>

      {/* Reservation Info */}
      {hasReservation && (
        <div style={{
          marginTop: "0.5rem",
          paddingTop: "0.5rem",
          borderTop: `1px solid ${config.border}40`
        }}>
          {reservationName && (
            <div style={{ 
              fontSize: "0.6875rem",
              fontWeight: "700", 
              color: config.text,
              textAlign: "center",
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap"
            }}>
              {reservationName.length > 10 
                ? reservationName.substring(0, 10) + '...' 
                : reservationName}
            </div>
          )}
          {reservationTime && (
            <div style={{ 
              fontSize: "0.625rem",
              color: config.text,
              textAlign: "center",
              marginTop: "0.125rem",
              opacity: 0.8
            }}>
              {reservationTime}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

TableCard.displayName = 'TableCard';

export default TableCard;
