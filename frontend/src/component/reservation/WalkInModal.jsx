// frontend/src/component/reservation/WalkInModal.jsx
import { useState } from "react";
import { useReservationStore } from "../../store/reservationStore";

export default function WalkInModal() {
  const { closeWalkInModal, tables, updateTableStatus } = useReservationStore();
  
  const [formData, setFormData] = useState({
    guestName: "",
    phone: "",
    partySize: 1,
    seatingPreference: "",
    notes: ""
  });
   ///
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestedTables, setSuggestedTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === "partySize" ? parseInt(value) || 1 : value
    }));
  };

  const findAvailableTables = () => {
    const available = tables.filter(t => 
      t.status === 'Available' && 
      (t.capacity || t.seats) >= formData.partySize
    );
    
    const sorted = available.sort((a, b) => {
      const aCap = a.capacity || a.seats || 0;
      const bCap = b.capacity || b.seats || 0;
      const aDiff = aCap - formData.partySize;
      const bDiff = bCap - formData.partySize;
      
      if (aDiff === 0 && bDiff !== 0) return -1;
      if (bDiff === 0 && aDiff !== 0) return 1;
      return aDiff - bDiff;
    });
    
    setSuggestedTables(sorted.slice(0, 6));
  };

  const handleSeatNow = async () => {
    if (!selectedTable) {
      setError("Please select a table");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      updateTableStatus(selectedTable.id || selectedTable.number, 'Seated', {
        guestName: formData.guestName || 'Walk-in Guest',
        arrivalTime: new Date().toLocaleTimeString()
      });

      closeWalkInModal();
      setFormData({
        guestName: "",
        phone: "",
        partySize: 1,
        seatingPreference: "",
        notes: ""
      });
      setSelectedTable(null);
      setSuggestedTables([]);
    } catch (err) {
      setError(err.message || "Failed to seat walk-in");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToWaitlist = async () => {
    setLoading(true);
    setError(null);
    try {
      alert("Waitlist functionality coming soon!");
      closeWalkInModal();
    } catch (err) {
      setError(err.message || "Failed to add to waitlist");
    } finally {
      setLoading(false);
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
        alignItems: "flex-end",
        zIndex: 1000,
        padding: 0
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeWalkInModal();
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "20px 20px 0 0",
          padding: "1.5rem",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
          WebkitOverflowScrolling: "touch"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid #e5e7eb"
        }}>
          <div>
            <h2 style={{ 
              margin: 0, 
              fontSize: "1.5rem", 
              fontWeight: "700",
              color: "#111827"
            }}>
              Walk-in Guest
            </h2>
            <p style={{ 
              margin: "0.375rem 0 0 0", 
              color: "#6b7280", 
              fontSize: "0.8125rem" 
            }}>
              Seat a guest immediately
            </p>
          </div>
          <button
            onClick={closeWalkInModal}
            style={{
              background: "#f3f4f6",
              border: "none",
              width: "36px",
              height: "36px",
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && (
          <div style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            backgroundColor: "#fef2f2",
            color: "#dc2626",
            borderRadius: "10px",
            border: "1px solid #fecaca",
            fontSize: "0.875rem",
            fontWeight: "500"
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ 
              display: "block", 
              marginBottom: "0.5rem", 
              fontWeight: "600",
              color: "#374151",
              fontSize: "0.875rem"
            }}>
              Guest Name (Optional)
            </label>
            <input
              type="text"
              name="guestName"
              value={formData.guestName}
              onChange={handleChange}
              placeholder="Enter guest name"
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "0.875rem",
                outline: "none",
                backgroundColor: "#f9fafb",
                boxSizing: "border-box"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#3b82f6";
                e.currentTarget.style.backgroundColor = "#fff";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#d1d5db";
                e.currentTarget.style.backgroundColor = "#f9fafb";
              }}
            />
          </div>

          <div>
            <label style={{ 
              display: "block", 
              marginBottom: "0.5rem", 
              fontWeight: "600",
              color: "#374151",
              fontSize: "0.875rem"
            }}>
              Phone (Optional)
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Enter phone number"
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "0.875rem",
                outline: "none",
                backgroundColor: "#f9fafb",
                boxSizing: "border-box"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#3b82f6";
                e.currentTarget.style.backgroundColor = "#fff";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#d1d5db";
                e.currentTarget.style.backgroundColor = "#f9fafb";
              }}
            />
          </div>

          <div>
            <label style={{ 
              display: "block", 
              marginBottom: "0.5rem", 
              fontWeight: "600",
              color: "#374151",
              fontSize: "0.875rem"
            }}>
              Party Size <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="number"
              name="partySize"
              value={formData.partySize}
              onChange={handleChange}
              min="1"
              required
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "0.875rem",
                outline: "none",
                backgroundColor: "#f9fafb",
                boxSizing: "border-box"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#3b82f6";
                e.currentTarget.style.backgroundColor = "#fff";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#d1d5db";
                e.currentTarget.style.backgroundColor = "#f9fafb";
              }}
            />
          </div>

          <div>
            <label style={{ 
              display: "block", 
              marginBottom: "0.5rem", 
              fontWeight: "600",
              color: "#374151",
              fontSize: "0.875rem"
            }}>
              Seating Preference (Optional)
            </label>
            <select
              name="seatingPreference"
              value={formData.seatingPreference}
              onChange={handleChange}
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "0.875rem",
                outline: "none",
                backgroundColor: "#f9fafb",
                boxSizing: "border-box",
                cursor: "pointer"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#3b82f6";
                e.currentTarget.style.backgroundColor = "#fff";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#d1d5db";
                e.currentTarget.style.backgroundColor = "#f9fafb";
              }}
            >
              <option value="">No preference</option>
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
              <option value="smoking">Smoking</option>
              <option value="non-smoking">Non-smoking</option>
            </select>
          </div>

          <div>
            <label style={{ 
              display: "block", 
              marginBottom: "0.5rem", 
              fontWeight: "600",
              color: "#374151",
              fontSize: "0.875rem"
            }}>
              Notes (Optional)
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              placeholder="VIP, birthday, highchair, stroller, etc."
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "0.875rem",
                resize: "vertical",
                outline: "none",
                backgroundColor: "#f9fafb",
                boxSizing: "border-box",
                fontFamily: "inherit"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#3b82f6";
                e.currentTarget.style.backgroundColor = "#fff";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#d1d5db";
                e.currentTarget.style.backgroundColor = "#f9fafb";
              }}
            />
          </div>

          {/* Find Table Button */}
          <button
            onClick={findAvailableTables}
            style={{
              width: "100%",
              padding: "0.875rem 1rem",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: "pointer",
              touchAction: "manipulation",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            Find Table
          </button>

          {/* Suggested Tables */}
          {suggestedTables.length > 0 && (
            <div>
              <h3 style={{ 
                fontSize: "0.875rem", 
                marginBottom: "0.75rem",
                fontWeight: "600",
                color: "#374151"
              }}>
                Suggested Tables:
              </h3>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0.75rem"
              }}>
                {suggestedTables.map(table => (
                  <div
                    key={table.id || table.number}
                    onClick={() => setSelectedTable(table)}
                    style={{
                      padding: "0.75rem",
                      border: `2px solid ${selectedTable?.id === table.id ? '#3b82f6' : '#e5e7eb'}`,
                      borderRadius: "10px",
                      cursor: "pointer",
                      backgroundColor: selectedTable?.id === table.id ? '#eff6ff' : '#f9fafb',
                      textAlign: "center",
                      transition: "all 0.2s"
                    }}
                  >
                    <div style={{ fontWeight: "700", fontSize: "1rem", color: "#111827" }}>
                      Table {table.number || table.tableNo || table.id}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>
                      {table.capacity || table.seats} seats
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            marginTop: "1rem"
          }}>
            <button
              onClick={handleSeatNow}
              disabled={loading || !selectedTable}
              style={{
                width: "100%",
                padding: "0.875rem 1rem",
                background: loading || !selectedTable ? "#d1d5db" : "#10b981",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: loading || !selectedTable ? "not-allowed" : "pointer",
                touchAction: "manipulation",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem"
              }}
            >
              {loading ? (
                "Seating..."
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Seat Now
                </>
              )}
            </button>
            <button
              onClick={handleAddToWaitlist}
              disabled={loading}
              style={{
                width: "100%",
                padding: "0.875rem 1rem",
                background: loading ? "#d1d5db" : "#8b5cf6",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: loading ? "not-allowed" : "pointer",
                touchAction: "manipulation",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem"
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Add to Waitlist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
