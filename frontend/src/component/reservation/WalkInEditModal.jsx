// frontend/src/component/reservation/WalkInEditModal.jsx
import { useState, useEffect } from "react";
import { updateReservation } from "../../services/reservation.service";

export default function WalkInEditModal({ 
  reservation, 
  onClose, 
  onSave 
}) {
  const [formData, setFormData] = useState({
    guestName: "",
    phone: "",
    partySize: 2,
    notes: "",
    hostessId: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Hardcoded hostesses (same as WalkInPage)
  const hostesses = [
    { id: 1, name: "Sarah Johnson" },
    { id: 2, name: "Emily Chen" },
    { id: 3, name: "Michael Brown" },
    { id: 4, name: "Jessica Martinez" }
  ];

  // Load reservation data
  useEffect(() => {
    if (reservation) {
      setFormData({
        guestName: reservation.customerName || reservation.CustomerName || "",
        phone: reservation.customerPhone || reservation.CustomerPhone || "",
        partySize: reservation.numberOfGuests || reservation.NumberOfGuests || 2,
        notes: reservation.specialRequests || reservation.SpecialRequests || "",
        hostessId: reservation.hostessId || reservation.HostessID || null
      });
    }
  }, [reservation]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === "partySize" ? parseInt(value) || 1 : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.guestName || !formData.phone) {
      setError("Name and Phone are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const bookingId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
      
      const updateData = {
        name: formData.guestName.trim(),
        phone: formData.phone.trim(),
        guests: parseInt(formData.partySize) || 1,
        specialRequests: formData.notes.trim(),
        hostessId: formData.hostessId ? parseInt(formData.hostessId) : null,
        hostessName: formData.hostessId 
          ? (hostesses.find(h => h.id === formData.hostessId)?.name || null) 
          : null
      };

      const result = await updateReservation(bookingId, updateData);
      
      if (result.ok) {
        onSave?.();
        onClose();
      } else {
        throw new Error(result.error || "Failed to update reservation");
      }
    } catch (err) {
      console.error("Update error:", err);
      setError(err.message || "Failed to update reservation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)"
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "20px",
          boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
          width: "100%",
          maxWidth: "500px",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px",
          background: "linear-gradient(135deg, #7A0026, #C91A4D)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "800", marginBottom: "4px" }}>
              Edit Walk-In
            </div>
            <div style={{ fontSize: "13px", opacity: 0.9 }}>
              Quick update guest information
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              border: "none",
              background: "rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.3)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} style={{
          flex: 1,
          padding: "24px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "16px"
        }}>
          {error && (
            <div style={{
              padding: "12px",
              background: "#fee2e2",
              border: "1px solid #fecaca",
              borderRadius: "10px",
              color: "#dc2626",
              fontSize: "14px",
              fontWeight: "600"
            }}>
              {error}
            </div>
          )}

          {/* Guest Name */}
          <div>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "700",
              fontSize: "14px",
              color: "#374151"
            }}>
              Guest Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              name="guestName"
              value={formData.guestName}
              onChange={handleChange}
              required
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                fontSize: "15px",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#C91A4D";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(201, 26, 77, 0.15)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#d1d5db";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Phone */}
          <div>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "700",
              fontSize: "14px",
              color: "#374151"
            }}>
              Phone <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              maxLength={10}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                fontSize: "15px",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#C91A4D";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(201, 26, 77, 0.15)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#d1d5db";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Party Size */}
          <div>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "700",
              fontSize: "14px",
              color: "#374151"
            }}>
              Party Size <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: "10px",
              padding: "4px",
              overflow: "hidden"
            }}>
              <button
                type="button"
                onClick={() => {
                  if (formData.partySize > 1) {
                    setFormData(prev => ({ ...prev, partySize: prev.partySize - 1 }));
                  }
                }}
                disabled={formData.partySize <= 1}
                style={{
                  width: "40px",
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: formData.partySize <= 1 ? "#f3f4f6" : "#FBE6EC",
                  border: "none",
                  borderRadius: "8px",
                  cursor: formData.partySize <= 1 ? "not-allowed" : "pointer",
                  transition: "all 0.2s"
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={formData.partySize <= 1 ? "#9ca3af" : "#C91A4D"} strokeWidth="3">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              <div style={{
                flex: 1,
                textAlign: "center",
                fontSize: "18px",
                fontWeight: "800",
                color: "#111827"
              }}>
                {formData.partySize}
              </div>

              <button
                type="button"
                onClick={() => {
                  setFormData(prev => ({ ...prev, partySize: prev.partySize + 1 }));
                }}
                style={{
                  width: "40px",
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#FBE6EC",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C91A4D" strokeWidth="3">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Hostess */}
          <div>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "700",
              fontSize: "14px",
              color: "#374151"
            }}>
              Booked By (Hostess)
            </label>
            <select
              name="hostessId"
              value={formData.hostessId || ""}
              onChange={(e) => {
                const value = e.target.value;
                setFormData(prev => ({ ...prev, hostessId: value === "" ? null : Number(value) }));
              }}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                fontSize: "15px",
                outline: "none",
                boxSizing: "border-box",
                cursor: "pointer",
                fontFamily: "inherit",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23C91A4D' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                paddingRight: "36px"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#C91A4D";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(201, 26, 77, 0.15)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#d1d5db";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <option value="">Unassigned</option>
              {hostesses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          {/* Special Notes */}
          <div>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "700",
              fontSize: "14px",
              color: "#374151"
            }}>
              Special Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              placeholder="Any special requests or notes..."
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                fontSize: "15px",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#C91A4D";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(201, 26, 77, 0.15)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#d1d5db";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{
            display: "flex",
            gap: "12px",
            marginTop: "8px"
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "14px",
                background: "#f9fafb",
                color: "#6b7280",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                fontSize: "15px",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f3f4f6";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#f9fafb";
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: "14px",
                background: loading 
                  ? "#d1d5db" 
                  : "linear-gradient(135deg, #7A0026, #C91A4D)",
                color: "#fff",
                border: "none",
                borderRadius: "12px",
                fontSize: "15px",
                fontWeight: "700",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: loading ? "none" : "0 4px 12px rgba(201, 26, 77, 0.3)",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(201, 26, 77, 0.4)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(201, 26, 77, 0.3)";
                }
              }}
            >
              {loading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>

        {/* CSS Animation */}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}

