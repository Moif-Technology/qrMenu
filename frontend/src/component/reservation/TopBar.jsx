// frontend/src/component/reservation/TopBar.jsx
import { useState, useEffect } from "react";
import { useReservationStore } from "../../store/reservationStore";

export default function TopBar({ onSearch, onDateChange }) {
  const { 
    selectedDate, 
    setSelectedDate,
    availableTablesCount,
    reservedCount,
    walkInsCount,
    waitlistCount
  } = useReservationStore();
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (dateString === today.toISOString().split('T')[0]) {
      return 'Today';
    } else if (dateString === tomorrow.toISOString().split('T')[0]) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchQuery);
    }
    setShowSearch(false);
  };

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    if (onDateChange) {
      onDateChange(newDate);
    }
  };

  return (
    <div style={{
      backgroundColor: "#ffffff",
      borderBottom: "1px solid #e5e7eb",
      padding: "1rem",
      position: "sticky",
      top: 0,
      zIndex: 100,
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    }}>
      {/* Header Row */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "0.75rem"
      }}>
        <div style={{ flex: 1 }}>
          <h1 style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: "700",
            color: "#111827"
          }}>
            Floor Plan
          </h1>
          <div style={{
            fontSize: "0.75rem",
            color: "#6b7280",
            marginTop: "0.25rem"
          }}>
            {formatDate(selectedDate)} • {formatTime(currentTime)}
          </div>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            border: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#6b7280"
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <form onSubmit={handleSearch} style={{ marginBottom: "0.75rem" }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guest, phone, table..."
            autoFocus
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              border: "1px solid #d1d5db",
              borderRadius: "10px",
              fontSize: "0.875rem",
              outline: "none",
              backgroundColor: "#f9fafb"
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = "#3b82f6"}
            onBlur={(e) => e.currentTarget.style.borderColor = "#d1d5db"}
          />
        </form>
      )}

      {/* Date Selector */}
      <div style={{ marginBottom: "0.75rem" }}>
        <input
          type="date"
          value={selectedDate}
          onChange={handleDateChange}
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            border: "1px solid #d1d5db",
            borderRadius: "10px",
            fontSize: "0.875rem",
            fontWeight: "500",
            cursor: "pointer",
            backgroundColor: "#fff",
            color: "#374151",
            outline: "none"
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = "#3b82f6"}
          onBlur={(e) => e.currentTarget.style.borderColor = "#d1d5db"}
        />
      </div>

      {/* Stats Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "0.5rem"
      }}>
        <div style={{
          padding: "0.75rem 0.5rem",
          backgroundColor: "#ecfdf5",
          borderRadius: "10px",
          textAlign: "center",
          border: "1px solid #d1fae5"
        }}>
          <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#059669", lineHeight: "1.2" }}>
            {availableTablesCount}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#047857", marginTop: "0.25rem", fontWeight: "600" }}>Available</div>
        </div>
        <div style={{
          padding: "0.75rem 0.5rem",
          backgroundColor: "#fffbeb",
          borderRadius: "10px",
          textAlign: "center",
          border: "1px solid #fef3c7"
        }}>
          <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#d97706", lineHeight: "1.2" }}>
            {reservedCount}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#b45309", marginTop: "0.25rem", fontWeight: "600" }}>Reserved</div>
        </div>
        <div style={{
          padding: "0.75rem 0.5rem",
          backgroundColor: "#eff6ff",
          borderRadius: "10px",
          textAlign: "center",
          border: "1px solid #dbeafe"
        }}>
          <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#2563eb", lineHeight: "1.2" }}>
            {walkInsCount}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#1e40af", marginTop: "0.25rem", fontWeight: "600" }}>Walk-ins</div>
        </div>
        <div style={{
          padding: "0.75rem 0.5rem",
          backgroundColor: "#f5f3ff",
          borderRadius: "10px",
          textAlign: "center",
          border: "1px solid #e9d5ff"
        }}>
          <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#7c3aed", lineHeight: "1.2" }}>
            {waitlistCount}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#6d28d9", marginTop: "0.25rem", fontWeight: "600" }}>Waitlist</div>
        </div>
      </div>
    </div>
  );
}
