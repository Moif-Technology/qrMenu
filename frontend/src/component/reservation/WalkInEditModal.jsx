// frontend/src/component/reservation/WalkInEditModal.jsx
import { useState, useEffect } from "react";
import { updateReservation } from "../../services/reservation.service";
import { getAreas } from "../../services/menu.service";
import { getTablesByArea } from "../../services/table.service";
import { getFloorLayoutByArea } from "../../services/floorLayout.service";
import FloorMapContainer from "./FloorMapContainer";

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
    hostessId: null,
    areaId: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [areas, setAreas] = useState([]);
  const [selectedTables, setSelectedTables] = useState([]);
  const [tempSelectedTables, setTempSelectedTables] = useState([]);
  const [showFloorMapModal, setShowFloorMapModal] = useState(false);
  const [displayTables, setDisplayTables] = useState([]);
  const [floorLayout, setFloorLayout] = useState(null);
  const [loadingFloorMap, setLoadingFloorMap] = useState(false);

  // Hardcoded hostesses (same as WalkInPage)
  const hostesses = [
    { id: 1, name: "HANA" },
    { id: 2, name: "YOUSSRA" },
    { id: 3, name: "TAKOUA" },
    { id: 4, name: "SANDOS" },
    { id: 5, name: "NOUR" },
    { id: 6, name: "ANISA" }
  ];

  // Load areas on mount
  useEffect(() => {
    loadAreas();
  }, []);

  // Load reservation data and tables
  useEffect(() => {
    if (reservation) {
      const areaId = reservation.areaId || reservation.AreaID || null;
      const tableId = reservation.tableId || reservation.TableID || null;
      const tableInfo = reservation.tableInfo || reservation.TableInfo || reservation.tableName || reservation.TableName || null;
      
      setFormData({
        guestName: reservation.customerName || reservation.CustomerName || "",
        phone: reservation.customerPhone || reservation.CustomerPhone || "",
        partySize: reservation.numberOfGuests || reservation.NumberOfGuests || 2,
        notes: reservation.specialRequests || reservation.SpecialRequests || "",
        hostessId: reservation.hostessId || reservation.HostessID || null,
        areaId: areaId
      });

      // Set initial table selection if exists
      if (tableId && tableInfo) {
        setSelectedTables([{
          id: tableId,
          number: tableId,
          name: tableInfo,
          capacity: reservation.numberOfGuests || reservation.NumberOfGuests || 2,
          areaId: areaId
        }]);
      }
    }
  }, [reservation]);

  const loadAreas = async () => {
    try {
      const result = await getAreas();
      if (result.ok && result.areas) {
        setAreas(result.areas);
      }
    } catch (err) {
      console.error("Failed to load areas:", err);
    }
  };

  // Handle area change - load tables
  const handleAreaChange = async (e) => {
    const areaId = e.target.value;
    setFormData(prev => ({ ...prev, areaId: areaId || null }));
    
    if (areaId) {
      try {
        const tablesResult = await getTablesByArea(areaId);
        if (tablesResult.ok) {
          setDisplayTables(tablesResult.tables || []);
        }
      } catch (err) {
        console.error("Failed to load tables:", err);
      }
    } else {
      setDisplayTables([]);
      setSelectedTables([]);
    }
  };

  // Handle table selection in modal
  const handleTableSelectInModal = (table) => {
    const tableId = table.id || table.number || table.tableNo;
    const tableName = table.tableName || table.name || `Table ${table.number || table.tableNo || table.id}`;
    const tableStatus = (table.status || '').toLowerCase();
    
    const isSelected = tempSelectedTables.some(t => {
      const tId = t.id || t.number;
      return String(tId) === String(tableId);
    });
    
    if (isSelected) {
      setTempSelectedTables(prev => prev.filter(t => {
        const tId = t.id || t.number;
        return String(tId) !== String(tableId);
      }));
    } else {
      // Check if table is occupied
      if (tableStatus === 'occupied') {
        alert(
          `⚠️ ${tableName} is Currently Occupied\n\n` +
          `This table has guests seated or running orders.\n` +
          `Please choose an available table or wait for this table to be cleared.`
        );
        return;
      }
      
      // Warn for reserved tables
      if (tableStatus === 'reserved') {
        if (!confirm(
          `⚠️ ${tableName} is Reserved\n\n` +
          `This table is reserved for today.\n` +
          `Do you want to move the reservation here anyway?`
        )) {
          return;
        }
      }
      
      setTempSelectedTables(prev => {
        const alreadyExists = prev.some(t => String(t.id || t.number) === String(tableId));
        if (alreadyExists) return prev;
        
        return [...prev, {
          id: table.id || table.number || table.tableNo,
          number: table.number || table.tableNo || table.id,
          name: tableName,
          capacity: table.capacity || table.seats || 0,
          areaId: table.areaId,
          status: table.status
        }];
      });
    }
  };

  // Open floor map modal
  const handleOpenFloorMap = async () => {
    if (!formData.areaId) {
      alert("Please select an area first");
      return;
    }

    setLoadingFloorMap(true);
    try {
      // Load tables
      const tablesResult = await getTablesByArea(formData.areaId);
      if (tablesResult.ok) {
        setDisplayTables(tablesResult.tables || []);
      }

      // Load floor layout
      const layoutResult = await getFloorLayoutByArea(formData.areaId);
      if (layoutResult.ok && layoutResult.layout) {
        setFloorLayout(layoutResult.layout);
      }

      // Set temp selection to current selection
      setTempSelectedTables([...selectedTables]);
      setShowFloorMapModal(true);
    } catch (err) {
      console.error("Failed to load floor map:", err);
      alert("Failed to load floor map");
    } finally {
      setLoadingFloorMap(false);
    }
  };

  // Confirm table selection
  const handleConfirmTableSelection = () => {
    setSelectedTables(tempSelectedTables);
    setShowFloorMapModal(false);
    setTimeout(() => setTempSelectedTables([]), 300);
  };

  // Cancel table selection
  const handleCancelTableSelection = () => {
    setTempSelectedTables([]);
    setShowFloorMapModal(false);
  };

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
          : null,
        areaId: formData.areaId ? parseInt(formData.areaId) : null,
        tableIds: selectedTables.length > 0 
          ? selectedTables.map(t => t.id || t.number) 
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

          {/* Area Selection */}
          <div>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "700",
              fontSize: "14px",
              color: "#374151"
            }}>
              Seating Area
            </label>
            <select
              name="areaId"
              value={formData.areaId || ""}
              onChange={handleAreaChange}
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
              <option value="">No area selected</option>
              {areas.map((area) => (
                <option key={area.areaId || area.AreaID} value={area.areaId || area.AreaID}>
                  {area.areaName || area.AreaName}
                </option>
              ))}
            </select>
          </div>

          {/* Table Selection */}
          <div>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "700",
              fontSize: "14px",
              color: "#374151"
            }}>
              Table Assignment
            </label>
            <div style={{
              display: "flex",
              gap: "8px",
              alignItems: "stretch"
            }}>
              <div style={{
                flex: 1,
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
                color: selectedTables.length > 0 ? "#111827" : "#9ca3af",
                background: "#f9fafb",
                display: "flex",
                alignItems: "center",
                minHeight: "44px"
              }}>
                {selectedTables.length > 0 
                  ? selectedTables.map(t => t.name || `Table ${t.number}`).join(", ")
                  : "No tables selected"
                }
              </div>
              <button
                type="button"
                onClick={handleOpenFloorMap}
                disabled={!formData.areaId || loadingFloorMap}
                style={{
                  padding: "12px 16px",
                  background: !formData.areaId || loadingFloorMap 
                    ? "#e5e7eb" 
                    : "linear-gradient(135deg, #7A0026, #C91A4D)",
                  color: !formData.areaId || loadingFloorMap ? "#9ca3af" : "#fff",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: "700",
                  cursor: !formData.areaId || loadingFloorMap ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap"
                }}
                onMouseEnter={(e) => {
                  if (formData.areaId && !loadingFloorMap) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(201, 26, 77, 0.3)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (formData.areaId && !loadingFloorMap) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }
                }}
              >
                {loadingFloorMap ? "Loading..." : "Select Table"}
              </button>
            </div>
            {!formData.areaId && (
              <div style={{
                marginTop: "6px",
                fontSize: "12px",
                color: "#6b7280",
                fontStyle: "italic"
              }}>
                Select an area first to choose tables
              </div>
            )}
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

      {/* Floor Map Modal */}
      {showFloorMapModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)"
          }}
          onClick={handleCancelTableSelection}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "20px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              width: "100%",
              maxWidth: "900px",
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
                  Select Tables
                </div>
                <div style={{ fontSize: "13px", opacity: 0.9 }}>
                  Choose tables for this reservation
                </div>
              </div>
              <button
                onClick={handleCancelTableSelection}
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

            {/* Floor Map */}
            <div style={{
              flex: 1,
              overflow: "auto",
              padding: "16px"
            }}>
              <FloorMapContainer
                layout={floorLayout}
                tables={displayTables}
                selectedTables={tempSelectedTables}
                onTableClick={handleTableSelectInModal}
              />
            </div>

            {/* Footer with selection info and actions */}
            <div style={{
              padding: "16px",
              borderTop: "1px solid #e5e7eb",
              background: tempSelectedTables.length > 0 ? "#FBE6EC" : "#f9fafb",
              transition: "all 0.2s"
            }}>
              {tempSelectedTables.length > 0 ? (
                <div>
                  <div style={{
                    fontSize: "13px",
                    fontWeight: "700",
                    color: "#7A0026",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}>
                    Selected Tables ({tempSelectedTables.length})
                  </div>
                  <div style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginBottom: "12px"
                  }}>
                    {tempSelectedTables.map((table, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: "6px 12px",
                          background: "linear-gradient(135deg, #7A0026, #C91A4D)",
                          color: "#fff",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: "700",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px"
                        }}
                      >
                        {table.name || `Table ${table.number}`}
                        <button
                          type="button"
                          onClick={() => handleTableSelectInModal(table)}
                          style={{
                            background: "rgba(255,255,255,0.2)",
                            border: "none",
                            borderRadius: "4px",
                            width: "18px",
                            height: "18px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            padding: 0
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{
                display: "flex",
                gap: "12px"
              }}>
                <button
                  type="button"
                  onClick={handleCancelTableSelection}
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
                  onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "#f9fafb"}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmTableSelection}
                  disabled={tempSelectedTables.length === 0}
                  style={{
                    flex: 1,
                    padding: "14px",
                    background: tempSelectedTables.length === 0 
                      ? "#d1d5db" 
                      : "linear-gradient(135deg, #7A0026, #C91A4D)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "12px",
                    fontSize: "15px",
                    fontWeight: "700",
                    cursor: tempSelectedTables.length === 0 ? "not-allowed" : "pointer",
                    boxShadow: tempSelectedTables.length === 0 
                      ? "none" 
                      : "0 4px 12px rgba(201, 26, 77, 0.3)",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    if (tempSelectedTables.length > 0) {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 6px 16px rgba(201, 26, 77, 0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (tempSelectedTables.length > 0) {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(201, 26, 77, 0.3)";
                    }
                  }}
                >
                  Done ({tempSelectedTables.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

