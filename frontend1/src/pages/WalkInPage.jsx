// frontend/src/pages/WalkInPage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReservationStore } from "../store/reservationStore";
import BottomNav from "../component/reservation/BottomNav";

export default function WalkInPage() {
  const navigate = useNavigate();
  const { tables, updateTableStatus } = useReservationStore();
  
  // Hardcoded hostesses for now
  const hostesses = [
    { id: 1, name: "Sarah Johnson" },
    { id: 2, name: "Emily Chen" },
    { id: 3, name: "Michael Brown" },
    { id: 4, name: "Jessica Martinez" }
  ];
  
  const [formData, setFormData] = useState({
    guestName: "",
    phone: "",
    partySize: 1,
    seatingPreference: "",
    notes: "",
    hostessId: null
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestedTables, setSuggestedTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Validation functions
  const validatePhone = (phone) => {
    if (!phone) return true; // Phone is optional in walk-in
    // Must start with 0, then exactly 9 more digits/letters (total 10 characters)
    const phoneRegex = /^0[a-zA-Z0-9]{9}$/;
    return phoneRegex.test(phone);
  };

  const validateEmail = (email) => {
    if (!email) return true; // Email is optional in walk-in
    // Standard email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let processedValue = value;
    
    // Phone validation - only allow if starts with 0 and max 11 chars
    if (name === "phone") {
      // Remove any non-alphanumeric except we want to keep it simple
      processedValue = value.replace(/[^0-9a-zA-Z]/g, '');
      // If doesn't start with 0, force it
      if (processedValue && !processedValue.startsWith('0')) {
        processedValue = '0' + processedValue.replace(/^0+/, '');
      }
      // Limit to 10 characters (0 + 9)
      if (processedValue.length > 10) {
        processedValue = processedValue.substring(0, 10);
      }
      
      // Validate
      if (processedValue && !validatePhone(processedValue)) {
        setFieldErrors(prev => ({ ...prev, phone: "Phone must start with 0 and have 9 more digits/letters (10 total)" }));
      } else {
        setFieldErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.phone;
          return newErrors;
        });
      }
    }
    
    // Email validation
    if (name === "email") {
      if (value && !validateEmail(value)) {
        setFieldErrors(prev => ({ ...prev, email: "Please enter a valid email address" }));
      } else {
        setFieldErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.email;
          return newErrors;
        });
      }
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: name === "partySize" ? parseInt(processedValue) || 1 : processedValue
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
      setError("Please select a table to proceed");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tableId = selectedTable.id || selectedTable.number;
      const tableName = `Table ${tableId}`;
      const hostessName = formData.hostessId ? hostesses.find(h => h.id === formData.hostessId)?.name || '' : '';
      
      updateTableStatus(tableId, 'Seated', {
        guestName: formData.guestName || 'Walk-in Guest',
        arrivalTime: new Date().toLocaleTimeString(),
        hostess: hostessName
      });

      // Navigate to success page with data
      const params = new URLSearchParams({
        name: formData.guestName || 'Walk-in Guest',
        phone: formData.phone || '',
        partySize: formData.partySize.toString(),
        tableId: tableId.toString(),
        tableName: tableName,
        hostess: hostessName
      });
      navigate(`/walk-in-success?${params.toString()}`);
      setFormData({
        guestName: "",
        phone: "",
        partySize: 1,
        seatingPreference: "",
        notes: "",
        hostessId: null
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
      navigate("/reservation");
    } catch (err) {
      setError(err.message || "Failed to add to waitlist");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(120% 60% at 50% 0%, rgba(201,26,77,0.16), transparent 55%), #fdf8fa",
      display: "flex",
      flexDirection: "column",
      paddingBottom: "70px"
    }}>
      {/* Header - Matching App Theme */}
      <div style={{
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        position: "sticky",
        top: 0,
        zIndex: 20,
        boxShadow: "0 1px 6px rgba(0,0,0,0.06)"
      }}>
        <button
          onClick={() => navigate("/reservation")}
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "14px",
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            color: "#374151",
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f3f4f6";
            e.currentTarget.style.borderColor = "#d1d5db";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#f9fafb";
            e.currentTarget.style.borderColor = "#e5e7eb";
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: "20px", 
            fontWeight: "800",
            color: "#111827"
          }}>
            Walk-in Guest
          </h1>
          <p style={{ 
            margin: 0, 
            color: "#6b7280", 
            fontSize: "13.5px",
            fontWeight: "600"
          }}>
            Seat a guest immediately
          </p>
        </div>
        <button
          onClick={() => navigate("/reservation")}
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "14px",
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            color: "#374151",
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#FBE6EC";
            e.currentTarget.style.borderColor = "#C91A4D";
            e.currentTarget.style.color = "#C91A4D";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#f9fafb";
            e.currentTarget.style.borderColor = "#e5e7eb";
            e.currentTarget.style.color = "#374151";
          }}
          aria-label="Home"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        padding: "16px",
        overflow: "auto",
        WebkitOverflowScrolling: "touch",
        maxWidth: "1100px",
        width: "100%",
        margin: "0 auto"
      }}>
        {error && (
          <div style={{
            padding: "12px 14px",
            marginBottom: "14px",
            borderRadius: "14px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            fontWeight: "700",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Guest Information Card */}
          <div style={{
            background: "#fff",
            borderRadius: "18px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
            padding: "16px"
          }}>
            <div style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "10px",
              marginBottom: "12px"
            }}>
              <h2 style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "800",
                color: "#111827"
              }}>
                Guest Information
              </h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ 
                  display: "block", 
                  marginBottom: "8px", 
                  fontWeight: "700",
                  fontSize: "14px",
                  color: "#374151"
                }}>
                  Guest Name
                </label>
                <input
                  type="text"
                  name="guestName"
                  value={formData.guestName}
                  onChange={handleChange}
                  placeholder="Enter guest name"
                  style={{
                    width: "100%",
                    padding: "14px",
                    borderRadius: "14px",
                    border: "1px solid #d1d5db",
                    fontSize: "16px",
                    outline: "none",
                    background: "#fff",
                    boxSizing: "border-box",
                    transition: "all 0.2s",
                    fontFamily: "inherit",
                    color: "#111827"
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ 
                    display: "block", 
                    marginBottom: "8px", 
                    fontWeight: "700",
                    fontSize: "14px",
                    color: "#374151"
                  }}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="05xxxxxxxx (10 digits)"
                    maxLength={10}
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: "14px",
                      border: fieldErrors.phone ? "1px solid #ef4444" : "1px solid #d1d5db",
                      fontSize: "16px",
                      outline: "none",
                      background: "#fff",
                      boxSizing: "border-box",
                      transition: "all 0.2s",
                      fontFamily: "inherit",
                      color: "#111827"
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = fieldErrors.phone ? "#ef4444" : "#C91A4D";
                      e.currentTarget.style.boxShadow = fieldErrors.phone ? "0 0 0 3px rgba(239, 68, 68, 0.15)" : "0 0 0 3px rgba(201, 26, 77, 0.15)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = fieldErrors.phone ? "#ef4444" : "#d1d5db";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  {fieldErrors.phone && (
                    <div style={{
                      marginTop: "6px",
                      fontSize: "12px",
                      color: "#ef4444",
                      fontWeight: "600"
                    }}>
                      {fieldErrors.phone}
                    </div>
                  )}
                </div>

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
                  {/* Compact Stepper - Under label */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "#fff",
                    border: "1px solid #d1d5db",
                    borderRadius: "12px",
                    overflow: "hidden",
                    transition: "all 0.2s"
                  }}>
                    {/* Minus Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (formData.partySize > 1) {
                          setFormData(prev => ({ ...prev, partySize: prev.partySize - 1 }));
                        }
                      }}
                      disabled={formData.partySize <= 1}
                      style={{
                        width: "44px",
                        height: "44px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: formData.partySize <= 1 ? "#f3f4f6" : "#FBE6EC",
                        border: "none",
                        cursor: formData.partySize <= 1 ? "not-allowed" : "pointer",
                        transition: "all 0.2s",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                        padding: 0
                      }}
                      onMouseEnter={(e) => {
                        if (formData.partySize > 1) {
                          e.currentTarget.style.background = "#FDE9EF";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (formData.partySize > 1) {
                          e.currentTarget.style.background = "#FBE6EC";
                        }
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={formData.partySize <= 1 ? "#9ca3af" : "#C91A4D"} strokeWidth="3" strokeLinecap="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>

                    {/* Value Display */}
                    <div style={{
                      flex: 1,
                      textAlign: "center",
                      fontSize: "18px",
                      fontWeight: "800",
                      color: "#111827",
                      padding: "0 4px",
                      minWidth: "40px"
                    }}>
                      {formData.partySize}
                    </div>

                    {/* Plus Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, partySize: prev.partySize + 1 }));
                      }}
                      style={{
                        width: "44px",
                        height: "44px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#FBE6EC",
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                        padding: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#FDE9EF";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#FBE6EC";
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C91A4D" strokeWidth="3" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preferences Card */}
          <div style={{
            background: "#fff",
            borderRadius: "18px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
            padding: "16px"
          }}>
            <div style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "10px",
              marginBottom: "12px"
            }}>
              <h2 style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "800",
                color: "#111827"
              }}>
                Preferences
              </h2>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#6b7280" }}>
                Optional
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ 
                  display: "block", 
                  marginBottom: "8px", 
                  fontWeight: "700",
                  fontSize: "14px",
                  color: "#374151"
                }}>
                  Seating Preference
                  <span style={{ color: "#9ca3af", fontWeight: "400", marginLeft: "4px" }}>(Optional)</span>
                </label>
                <select
                  name="seatingPreference"
                  value={formData.seatingPreference}
                  onChange={handleChange}
                  style={{
                    width: "100%",
                    padding: "14px",
                    borderRadius: "14px",
                    border: "1px solid #d1d5db",
                    fontSize: "16px",
                    outline: "none",
                    background: "#fff",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    color: "#111827",
                    appearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%232563eb' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 14px center",
                    paddingRight: "40px"
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
                  <option value="">Select preference</option>
                  <option value="indoor">Indoor Seating</option>
                  <option value="outdoor">Outdoor Seating</option>
                  <option value="window">Window View</option>
                  <option value="quiet">Quiet Area</option>
                  <option value="smoking">Smoking Section</option>
                  <option value="non-smoking">Non-Smoking</option>
                </select>
              </div>

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
                    padding: "14px",
                    borderRadius: "14px",
                    border: "1px solid #d1d5db",
                    fontSize: "16px",
                    outline: "none",
                    background: "#fff",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    color: "#111827",
                    appearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23C91A4D' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 14px center",
                    paddingRight: "40px"
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

              <div>
                <label style={{ 
                  display: "block", 
                  marginBottom: "8px", 
                  fontWeight: "700",
                  fontSize: "14px",
                  color: "#374151"
                }}>
                  Special Notes
                  <span style={{ color: "#9ca3af", fontWeight: "400", marginLeft: "4px" }}>(Optional)</span>
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows="4"
                  placeholder="VIP guest, birthday celebration, highchair needed, dietary restrictions, etc."
                  style={{
                    width: "100%",
                    padding: "14px",
                    borderRadius: "14px",
                    border: "1px solid #d1d5db",
                    fontSize: "16px",
                    resize: "vertical",
                    outline: "none",
                    background: "#fff",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    transition: "all 0.2s",
                    color: "#111827",
                    lineHeight: "1.5"
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
            </div>
          </div>

          {/* Find Table Button - Matching App Theme */}
          <button
            onClick={findAvailableTables}
            style={{
              width: "100%",
              padding: "16px",
              background: "linear-gradient(#fff, #fff) padding-box, linear-gradient(90deg, #7A0026, #C91A4D) border-box",
              color: "#C91A4D",
              border: "1.5px solid transparent",
              borderRadius: "16px",
              fontSize: "16px",
              fontWeight: "800",
              cursor: "pointer",
              touchAction: "manipulation",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "linear-gradient(#fff, #fff) padding-box, linear-gradient(90deg, #C91A4D, #7A0026) border-box";
              e.currentTarget.style.color = "#7A0026";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "linear-gradient(#fff, #fff) padding-box, linear-gradient(90deg, #7A0026, #C91A4D) border-box";
              e.currentTarget.style.color = "#C91A4D";
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            Find Available Tables
          </button>

          {/* Suggested Tables - Matching App Theme */}
          {suggestedTables.length > 0 && (
            <div style={{
              background: "#fff",
              borderRadius: "18px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
              padding: "16px"
            }}>
              <div style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "10px",
                marginBottom: "12px"
              }}>
                <h3 style={{ 
                  margin: 0,
                  fontSize: "16px",
                  fontWeight: "800",
                  color: "#111827"
                }}>
                  Available Tables
                </h3>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#6b7280" }}>
                  {suggestedTables.length} found
                </span>
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "12px"
              }}>
                {suggestedTables.map(table => (
                  <div
                    key={table.id || table.number}
                    onClick={() => setSelectedTable(table)}
                    style={{
                      borderRadius: "16px",
                      border: selectedTable?.id === table.id ? "2px solid #C91A4D" : "1px solid #e5e7eb",
                      background: selectedTable?.id === table.id ? "#FBE6EC" : "#f9fafb",
                      padding: "14px",
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTable?.id !== table.id) {
                        e.currentTarget.style.borderColor = "#d1d5db";
                        e.currentTarget.style.background = "#f3f4f6";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTable?.id !== table.id) {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.background = "#f9fafb";
                      }
                    }}
                  >
                    <div style={{ 
                      fontWeight: "800", 
                      fontSize: "16px", 
                      color: selectedTable?.id === table.id ? "#C91A4D" : "#111827",
                      marginBottom: "4px"
                    }}>
                      Table {table.number || table.tableNo || table.id}
                    </div>
                    <div style={{ 
                      fontSize: "13.5px", 
                      fontWeight: "600",
                      color: selectedTable?.id === table.id ? "#C91A4D" : "#6b7280"
                    }}>
                      {table.capacity || table.seats} seats
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons - Matching App Theme */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginTop: "4px"
          }}>
            <button
              onClick={handleSeatNow}
              disabled={loading || !selectedTable}
              style={{
                width: "100%",
                padding: "16px",
                background: loading || !selectedTable 
                  ? "#d1d5db" 
                  : "radial-gradient(160px 80px at 50% 55%, rgba(255,255,255,.22), transparent 60%), linear-gradient(90deg, #7A0026, #C91A4D)",
                color: "#fff",
                border: "none",
                borderRadius: "16px",
                fontSize: "16px",
                fontWeight: "800",
                cursor: loading || !selectedTable ? "not-allowed" : "pointer",
                touchAction: "manipulation",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                transition: "all 0.2s",
                boxShadow: loading || !selectedTable ? "none" : "0 8px 24px rgba(201, 26, 77, 0.35)",
                opacity: loading || !selectedTable ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading && selectedTable) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.background = "radial-gradient(160px 80px at 50% 55%, rgba(255,255,255,.24), transparent 60%), linear-gradient(90deg, #C91A4D, #7A0026)";
                  e.currentTarget.style.boxShadow = "0 12px 28px rgba(201, 26, 77, 0.4)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading && selectedTable) {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.background = "radial-gradient(160px 80px at 50% 55%, rgba(255,255,255,.22), transparent 60%), linear-gradient(90deg, #7A0026, #C91A4D)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(201, 26, 77, 0.35)";
                }
              }}
            >
              {loading ? (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  Seating Guest...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                padding: "14px 16px",
                background: loading ? "#d1d5db" : "#f9fafb",
                color: loading ? "#9ca3af" : "#374151",
                border: "1px solid #e5e7eb",
                borderRadius: "16px",
                fontSize: "15px",
                fontWeight: "700",
                cursor: loading ? "not-allowed" : "pointer",
                touchAction: "manipulation",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                transition: "all 0.2s",
                opacity: loading ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = "#f3f4f6";
                  e.currentTarget.style.borderColor = "#d1d5db";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = "#f9fafb";
                  e.currentTarget.style.borderColor = "#e5e7eb";
                }
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Add to Waitlist
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Animations */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

