// frontend/src/pages/WalkInPage.jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useReservationStore } from "../store/reservationStore";
import { getFloorLayoutByArea } from "../services/floorLayout.service";
import { getTablesByArea } from "../services/table.service";
import { getAreas } from "../services/menu.service";
import { getCustomerHistory } from "../services/reservation.service";
import FloorMapContainer from "../component/reservation/FloorMapContainer";
import AutocompleteInput from "../component/reservation/AutocompleteInput";
import PhoneInputWithCountry from "../component/reservation/PhoneInputWithCountry";
import BottomNav from "../component/reservation/BottomNav";

export default function WalkInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tables, updateTableStatus, selectedAreaId, areas, setAreas, waitlist, setWaitlist } = useReservationStore();
  
  // Check if customer data was passed from Customers page
  const prefilledCustomer = location.state?.customerData;
  
  // Hardcoded hostesses for now
  // Hardcoded hostesses for now
  const hostesses = [
    { id: 1, name: "HANA" },
    { id: 2, name: "YOUSSRA" },
    { id: 3, name: "TAKOUA" },
    { id: 4, name: "SANDOS" },
    { id: 5, name: "NOUR" },
    { id: 6, name: "ANISA" },
  ];
  
  const [formData, setFormData] = useState({
    guestName: prefilledCustomer?.name || "",
    phone: prefilledCustomer?.phone || "",
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
  const [floorLayout, setFloorLayout] = useState(null);
  const [displayTables, setDisplayTables] = useState([]);
  const [loadingFloorMap, setLoadingFloorMap] = useState(false);
  const [showFloorMapModal, setShowFloorMapModal] = useState(false);
  const [selectedTables, setSelectedTables] = useState([]); // Array of selected tables (final selection)
  const [tempSelectedTables, setTempSelectedTables] = useState([]); // Temporary selection in modal
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitTimeMinutes, setWaitTimeMinutes] = useState(15); // Default 15 minutes
  const processedTableRef = useRef(null);
  const [customerHistory, setCustomerHistory] = useState([]); // Customer autocomplete history

  // Get selected area name
  const selectedAreaName = formData.seatingPreference 
    ? (areas || []).find(a => String(a.areaId || a.AreaID) === String(formData.seatingPreference))?.areaName || 
      (areas || []).find(a => String(a.areaId || a.AreaID) === String(formData.seatingPreference))?.AreaName ||
      `Area ${formData.seatingPreference}`
    : "Any area";

  // Validation functions - accept international format (+country + number) or local
  const validatePhone = (phone) => {
    if (!phone) return true; // Phone is optional in walk-in
    // Accept E.164: + followed by digits (and spaces/dashes from lib)
    const cleaned = (phone || "").replace(/\D/g, "");
    return cleaned.length >= 9 && cleaned.length <= 15;
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

  // Handle customer selection from autocomplete
  const handleCustomerSelect = (customer) => {
    setFormData(prev => ({
      ...prev,
      guestName: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || ''
    }));
    // Clear any field errors
    setFieldErrors({});
  };

  // Load areas on mount
  useEffect(() => {
    let mounted = true;
    
    const loadAreas = async () => {
      try {
        const areasData = await getAreas();
        if (mounted && areasData && areasData.length > 0) {
          setAreas(areasData);
        }
      } catch (err) {
        console.error("Failed to load areas:", err);
      }
    };
    
    loadAreas();
    
    return () => {
      mounted = false;
    };
  }, [setAreas]); // Only run once on mount (setAreas is stable)

  // Load customer history for autocomplete
  useEffect(() => {
    let mounted = true;
    
    const loadCustomers = async () => {
      try {
        const result = await getCustomerHistory();
        if (mounted && result.ok) {
          setCustomerHistory(result.customers || []);
        }
      } catch (err) {
        console.error("Failed to load customer history:", err);
      }
    };
    
    loadCustomers();
    
    return () => {
      mounted = false;
    };
  }, []); // Only run once on mount

  const findAvailableTables = async () => {
    if (!formData.seatingPreference) {
      setError("Please select an area first.");
      return;
    }

    setCheckingAvailability(true);
    setError(null);
    setSuggestedTables([]);

    try {
      const areaId = parseInt(formData.seatingPreference);
      
      // Load tables
      const tablesResult = await getTablesByArea(areaId);
      if (tablesResult.ok) {
        // Filter tables by capacity (party size)
        const availableTables = (tablesResult.tables || []).filter((t) => {
          const capacity = t.capacity || t.seats || 0;
          return capacity >= formData.partySize;
        });
        setDisplayTables(availableTables);
        
        if (availableTables.length === 0) {
          setError(`No tables available for ${formData.partySize} guests in this area`);
          setCheckingAvailability(false);
          return;
        }
      }
      
      // Load floor layout
      try {
        const layout = await getFloorLayoutByArea(areaId);
        setFloorLayout(layout);
      } catch {
        setFloorLayout(null);
      }

      // Pre-populate temp selection with currently selected tables when opening modal
      setTempSelectedTables([...selectedTables]);
      // Show the floor map modal
      setShowFloorMapModal(true);
    } catch {
      setError("Failed to check availability");
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleSeatNow = async () => {
    if (!selectedTables || selectedTables.length === 0) {
      setError("Please select at least one table to proceed");
      return;
    }

    if (!formData.guestName || formData.guestName.trim() === '') {
      setError("Please enter guest name");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call API to create walk-in reservation/booking
      const { createReservation, updateReservationStatus } = await import("../services/reservation.service.js");
      
      // Prepare reservation data for walk-in
      const tableIdsArray = selectedTables.map(t => {
        const id = t.id || t.number || t.tableId;
        return parseInt(id);
      }).filter(id => !isNaN(id) && id > 0);

      if (tableIdsArray.length === 0) {
        setError("Please select at least one valid table.");
        setLoading(false);
        return;
      }

      const now = new Date();
      const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const currentTime = now.toTimeString().slice(0, 5); // HH:mm
      
      const reservationData = {
        tableIds: tableIdsArray.length === 1 ? tableIdsArray[0] : tableIdsArray,
        areaId: formData.seatingPreference ? parseInt(formData.seatingPreference) : null,
        date: currentDate,
        time: currentTime,
        name: (formData.guestName || 'Walk-in Guest').trim(),
        email: (formData.email || '').trim(),
        phone: (formData.phone || '').trim(),
        guests: parseInt(formData.partySize) || 1,
        specialRequests: (formData.notes || '').trim(),
        tags: '',
        hostessId: formData.hostessId ? parseInt(formData.hostessId) : null,
        hostessName: formData.hostessId ? (hostesses.find(h => h.id === formData.hostessId)?.name || null) : null,
        isWalkIn: true, // Mark as walk-in
        bookingSource: "WALKIN",
        initialStatus: "SEATED" // Create directly as SEATED, skip CHECKED_IN
      };
      const result = await createReservation(reservationData);
      if (result.ok) {
        // No need to update status - already created as SEATED
        
        // Update local table status
        const firstTable = selectedTables[0];
        const tableId = firstTable.id || firstTable.number;
        const hostessName = formData.hostessId ? hostesses.find(h => h.id === formData.hostessId)?.name || '' : '';
        
        updateTableStatus(tableId, 'Seated', {
          guestName: formData.guestName || 'Walk-in Guest',
          arrivalTime: new Date().toLocaleTimeString(),
          hostess: hostessName
        });

        // Navigate to success page with data
        const tableIds = selectedTables.map(t => t.id || t.number).join(',');
        const tableNames = selectedTables.map(t => `Table ${t.number || t.id}`).join(', ');
        
        const params = new URLSearchParams({
          id: result.bookingID || result.reservationId,
          name: formData.guestName || 'Walk-in Guest',
          phone: formData.phone || '',
          partySize: formData.partySize.toString(),
          areaId: formData.seatingPreference || '',
          tableIds: tableIds,
          tableNames: tableNames,
          arrivalTime: new Date().toLocaleTimeString("en-US", { 
            hour: "2-digit", 
            minute: "2-digit",
            hour12: true 
          }),
          hostess: hostessName,
          bookingID: result.bookingID || '',
          confirmationCode: result.confirmationCode || ''
        });
        navigate(`/walk-in-success?${params.toString()}`);
        
        // Clear form after successful seating
        setFormData({
          guestName: "",
          phone: "",
          partySize: 1,
          seatingPreference: "",
          notes: "",
          hostessId: null
        });
        setSelectedTables([]);
        setSuggestedTables([]);
      } else {
        throw new Error(result.error || "Failed to seat walk-in guest");
      }
    } catch (err) {
      console.error("Walk-in seating error:", err);
      setError(err?.response?.data?.error || err?.message || "Failed to seat walk-in guest");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToWaitlist = () => {
    // Validate required fields
    if (!formData.guestName) {
      setError("Please enter guest name");
      return;
    }
    if (!formData.partySize || formData.partySize < 1) {
      setError("Please enter party size");
      return;
    }
    
    // Open waitlist modal to select wait time
    setShowWaitlistModal(true);
  };

  const handleConfirmWaitlist = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Call real API
      const { createWaitlistEntry } = await import("../services/waitlist.service.js");
      
      const waitlistData = {
        guestName: formData.guestName || 'Walk-in Guest',
        phone: formData.phone || '',
        email: '',
        partySize: formData.partySize,
        waitTimeMinutes: waitTimeMinutes,
        tableIds: selectedTables.map(t => t.id || t.number),
        areaId: formData.seatingPreference ? parseInt(formData.seatingPreference) : null,
        notes: formData.notes || '',
        specialRequests: '',
        hostessId: formData.hostessId || null,
        hostessName: formData.hostessId ? hostesses.find(h => h.id === formData.hostessId)?.name || null : null
      };

      const result = await createWaitlistEntry(waitlistData);
      
      if (result.ok) {
        // Refresh waitlist from API
        const { getWaitlistEntries } = await import("../services/waitlist.service.js");
        const updatedWaitlist = await getWaitlistEntries();
        setWaitlist(updatedWaitlist.waitlist || []);
        
        // Close modal and reset form
        setShowWaitlistModal(false);
        setFormData({
          guestName: "",
          phone: "",
          partySize: 1,
          seatingPreference: "",
          notes: "",
          hostessId: null
        });
        setSelectedTables([]);
        
        // Navigate to waitlist page
        navigate("/waitlist");
      } else {
        throw new Error(result.error || "Failed to add to waitlist");
      }
    } catch (err) {
      console.error("Waitlist creation error:", err);
      setError(err?.response?.data?.error || err?.message || "Failed to add to waitlist");
    } finally {
      setLoading(false);
    }
  };

  // Handle table selection in the modal (temporary selection)
  const handleTableSelectInModal = (table) => {
    const tableId = table.id || table.number || table.tableNo;
    const tableName = table.tableName || table.name || `Table ${table.number || table.tableNo || table.id}`;
    const tableStatus = (table.status || '').toLowerCase();
    
    const isSelected = tempSelectedTables.some(t => {
      const tId = t.id || t.number;
      return String(tId) === String(tableId) || 
             String(t.id) === String(table.id) || 
             String(t.number) === String(table.number) ||
             String(t.number) === String(table.tableNo);
    });
    
    if (isSelected) {
      setTempSelectedTables(prev => prev.filter(t => {
        const tId = t.id || t.number;
        return String(tId) !== String(tableId) && 
               String(t.id) !== String(table.id) && 
               String(t.number) !== String(table.number) &&
               String(t.number) !== String(table.tableNo);
      }));
    } else {
      // Check if table is occupied or has running orders
      if (tableStatus === 'occupied') {
        alert(
          `⚠️ ${tableName} is Currently Occupied\n\n` +
          `This table has guests seated or running orders.\n` +
          `Please choose an available table or wait for this table to be cleared.`
        );
        return;
      }
      
      // Optionally warn for reserved tables
      if (tableStatus === 'reserved') {
        if (!confirm(
          `⚠️ ${tableName} is Reserved\n\n` +
          `This table is reserved for today.\n` +
          `Do you want to seat the walk-in guest here anyway?`
        )) {
          return;
        }
      }
      
      setTempSelectedTables(prev => {
        const alreadyExists = prev.some(t => {
          const tId = t.id || t.number;
          return String(tId) === String(tableId) || 
                 String(t.id) === String(table.id) || 
                 String(t.number) === String(table.number);
        });
        if (alreadyExists) return prev;
        
        return [...prev, {
          id: table.id || table.number || table.tableNo,
          number: table.number || table.tableNo || table.id,
          name: table.tableName || table.name || `Table ${table.number || table.tableNo || table.id}`,
          capacity: table.capacity || table.seats || 0,
          areaId: table.areaId,
          status: table.status
        }];
      });
    }
  };

  // Confirm selection from modal - apply temp selection to final selection
  const handleConfirmTableSelection = () => {
    setSelectedTables(tempSelectedTables);
    setShowFloorMapModal(false);
    setTimeout(() => setTempSelectedTables([]), 300);
  };

  // Cancel modal - reset temp selection
  const handleCancelTableSelection = () => {
    setTempSelectedTables([]);
    setShowFloorMapModal(false);
  };

  // Handle table passed from ReservationPage navigation
  useEffect(() => {
    const tableFromState = location.state?.selectedTable;
    const areaIdFromState = location.state?.selectedAreaId;
    
    // Only process if we have a table and haven't processed this one yet
    if (tableFromState && tableFromState !== processedTableRef.current) {
      processedTableRef.current = tableFromState;
      
      // Convert the table to our format
      const tableId = tableFromState.id || tableFromState.number || tableFromState.tableNo;
      const tableNumber = tableFromState.number || tableFromState.tableNo || tableFromState.id;
      // Try multiple possible field names for areaId, fallback to areaIdFromState from navigation
      const areaIdValue = tableFromState.areaId || 
                          areaIdFromState ||
                          tableFromState.area?.areaId || 
                          tableFromState.area?.AreaID || 
                          (tableFromState.area && typeof tableFromState.area === 'object' ? 
                           (tableFromState.area.areaId || tableFromState.area.AreaID) : null);
      
      const tableData = {
        id: tableId,
        number: tableNumber,
        name: tableFromState.tableName || tableFromState.name || `Table ${tableNumber}`,
        capacity: tableFromState.capacity || tableFromState.seats || 0,
        areaId: areaIdValue
      };
      
      // Check if already in selectedTables to avoid duplicates
      const alreadyExists = selectedTables.some(t => {
        const tId = t.id || t.number;
        return String(tId) === String(tableId) || String(tId) === String(tableNumber);
      });
      
      if (!alreadyExists && tableData.id) {
        setSelectedTables(prev => [...prev, tableData]);
      }
      
      // Set the section/area - use areaIdValue or areaIdFromState
      const finalAreaId = areaIdValue || areaIdFromState;
      if (finalAreaId && !formData.seatingPreference) {
        setFormData(prev => ({ ...prev, seatingPreference: String(finalAreaId) }));
      }
      
      // Clear the location state immediately to prevent re-adding on re-render
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.selectedTable, location.state?.selectedAreaId]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(120% 60% at 50% 0%, rgba(139,111,71,0.12), transparent 55%), var(--bg-paper)",
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
                <AutocompleteInput
                  value={formData.guestName}
                  onChange={handleChange}
                  onSelect={handleCustomerSelect}
                  suggestions={customerHistory}
                  field="name"
                  name="guestName"
                  placeholder="Enter guest name (start typing...)"
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
                    Phone <span style={{ color: "#9ca3af", fontSize: 12, fontWeight: 500 }}>(optional)</span>
                  </label>
                  <PhoneInputWithCountry
                    value={formData.phone}
                    onChange={(phone) => {
                      setFormData(prev => ({ ...prev, phone: phone || "" }));
                      if (fieldErrors.phone) {
                        setFieldErrors(prev => {
                          const next = { ...prev };
                          delete next.phone;
                          return next;
                        });
                      }
                    }}
                    placeholder="Phone number"
                    defaultCountry="ae"
                    hasError={!!fieldErrors.phone}
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

          {/* Area Selector - Moved to main form */}
          <div style={{
            background: "#fff",
            borderRadius: "18px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
            padding: "16px"
          }}>
            <label style={{ 
              display: "block", 
              marginBottom: "8px", 
              fontWeight: "700",
              fontSize: "14px",
              color: "#374151"
            }}>
              Select Area
              <span style={{ color: "#9ca3af", fontWeight: "400", marginLeft: "4px" }}>(Optional)</span>
            </label>
            <select
              name="seatingPreference"
              value={formData.seatingPreference || ""}
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
              <option value="">Select an area</option>
              {(areas || []).map((area) => {
                const id = area.areaId || area.AreaID;
                const name = area.areaName || area.AreaName || `Area ${id}`;
                return (
                  <option key={id} value={id}>
                    {name}
                  </option>
                );
              })}
            </select>
            
            {/* Selected Tables Pills - Show below area field */}
            {selectedTables.length > 0 && (
              <div style={{
                marginTop: "12px",
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                alignItems: "center"
              }}>
                <div style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "#6b7280",
                  marginRight: "4px"
                }}>
                  Selected:
                </div>
                {selectedTables.map((table, idx) => (
                  <div
                    key={`selected-pill-${table.id}-${idx}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      background: "linear-gradient(135deg, #7A0026, #C91A4D)",
                      color: "#fff",
                      borderRadius: "20px",
                      fontSize: "13px",
                      fontWeight: "700",
                      boxShadow: "0 2px 6px rgba(201, 26, 77, 0.3)",
                      animation: "fadeIn 0.2s ease-in"
                    }}
                  >
                    <span>Table {table.number}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTables(prev => prev.filter(t => {
                          const tId = t.id || t.number;
                          const tableId = table.id || table.number;
                          return String(tId) !== String(tableId);
                        }));
                      }}
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        border: "none",
                        background: "rgba(255,255,255,0.3)",
                        color: "#fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        fontSize: "12px",
                        fontWeight: "800",
                        lineHeight: "1",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.5)";
                        e.currentTarget.style.transform = "scale(1.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.3)";
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {selectedTables.length > 0 && (
                  <button
                    onClick={() => setSelectedTables([])}
                    style={{
                      padding: "6px 12px",
                      background: "#f3f4f6",
                      color: "#6b7280",
                      border: "1px solid #e5e7eb",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#fee2e2";
                      e.currentTarget.style.color = "#dc2626";
                      e.currentTarget.style.borderColor = "#dc2626";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#f3f4f6";
                      e.currentTarget.style.color = "#6b7280";
                      e.currentTarget.style.borderColor = "#e5e7eb";
                    }}
                  >
                    Clear All
                  </button>
                )}
              </div>
            )}
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
              {/* Selected Tables Tags in Preferences */}
              {selectedTables.length > 0 && (
                <div>
                  <label style={{ 
                    display: "block", 
                    marginBottom: "8px", 
                    fontWeight: "700",
                    fontSize: "14px",
                    color: "#374151"
                  }}>
                    Selected Tables
                  </label>
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    padding: "12px",
                    background: "#f9fafb",
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    minHeight: "50px"
                  }}>
                    {selectedTables.map((table, idx) => (
                      <div
                        key={`pref-tag-${table.id}-${idx}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "8px 14px",
                          background: "linear-gradient(135deg, #7A0026, #C91A4D)",
                          color: "#fff",
                          borderRadius: "20px",
                          fontSize: "13px",
                          fontWeight: "700",
                          boxShadow: "0 2px 6px rgba(201, 26, 77, 0.3)"
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                        </svg>
                        <span>Table {table.number}</span>
                        {table.capacity && (
                          <span style={{ 
                            fontSize: "11px", 
                            opacity: 0.9,
                            marginLeft: "4px"
                          }}>
                            ({table.capacity} seats)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

          {/* Find Table Button - Only show when area is selected */}
          {formData.seatingPreference && (
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
          )}

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
              disabled={loading || !selectedTables || selectedTables.length === 0}
              style={{
                width: "100%",
                padding: "16px",
                background: loading || !selectedTables || selectedTables.length === 0
                  ? "#d1d5db" 
                  : "radial-gradient(160px 80px at 50% 55%, rgba(255,255,255,.22), transparent 60%), linear-gradient(90deg, #7A0026, #C91A4D)",
                color: "#fff",
                border: "none",
                borderRadius: "16px",
                fontSize: "16px",
                fontWeight: "800",
                cursor: loading || !selectedTables || selectedTables.length === 0 ? "not-allowed" : "pointer",
                touchAction: "manipulation",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                transition: "all 0.2s",
                boxShadow: loading || !selectedTables || selectedTables.length === 0 ? "none" : "0 8px 24px rgba(201, 26, 77, 0.35)",
                opacity: loading || !selectedTables || selectedTables.length === 0 ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading && selectedTables && selectedTables.length > 0) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.background = "radial-gradient(160px 80px at 50% 55%, rgba(255,255,255,.24), transparent 60%), linear-gradient(90deg, #C91A4D, #7A0026)";
                  e.currentTarget.style.boxShadow = "0 12px 28px rgba(201, 26, 77, 0.4)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading && selectedTables && selectedTables.length > 0) {
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

      {/* Floor Map Modal - Shows when Find Available Tables is clicked */}
      {showFloorMapModal && (
        <div
          onClick={handleCancelTableSelection}
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
              maxWidth: "95vw",
              maxHeight: "90vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column"
            }}
          >
            {/* Modal Header */}
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
                  Select Table
                </div>
                <div style={{ fontSize: "14px", opacity: 0.9 }}>
                  {selectedAreaName} • {formData.partySize} guests
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
              minHeight: 0,
              overflow: "hidden",
              position: "relative"
            }}>
              {loadingFloorMap ? (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: "1rem",
                  padding: "3rem"
                }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  <div style={{ fontSize: "16px", fontWeight: "600" }}>
                    Loading floor map...
                  </div>
                </div>
              ) : (
                <FloorMapContainer
                  floorLayout={floorLayout}
                  displayTables={displayTables}
                  onTableClick={handleTableSelectInModal}
                  showZoomControls={true}
                  selectedTables={tempSelectedTables}
                />
              )}
            </div>

            {/* Footer - Show selected tables and confirm button */}
            <div style={{
              padding: "16px 20px",
              borderTop: "1px solid #e5e7eb",
              background: tempSelectedTables.length > 0 ? "#FBE6EC" : "#f9fafb",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}>
              {tempSelectedTables.length > 0 ? (
                <>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#6b7280", marginBottom: "8px" }}>
                      Selected Tables ({tempSelectedTables.length})
                    </div>
                    <div style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px"
                    }}>
                      {tempSelectedTables.map((table, idx) => (
                        <div
                          key={`footer-${table.id}-${idx}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            background: "#fff",
                            color: "#C91A4D",
                            borderRadius: "20px",
                            fontSize: "13px",
                            fontWeight: "700",
                            border: "1px solid #C91A4D"
                          }}
                        >
                          Table {table.number}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{
                    display: "flex",
                    gap: "10px"
                  }}>
                    <button
                      onClick={() => {
                        setTempSelectedTables([]);
                      }}
                      style={{
                        flex: 1,
                        padding: "10px",
                        background: "#fff",
                        color: "#6b7280",
                        border: "1px solid #e5e7eb",
                        borderRadius: "10px",
                        fontSize: "14px",
                        fontWeight: "700",
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#f3f4f6";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#fff";
                      }}
                    >
                      Clear All
                    </button>
                    <button
                      onClick={handleConfirmTableSelection}
                      style={{
                        flex: 2,
                        padding: "12px 24px",
                        background: "linear-gradient(135deg, #7A0026, #C91A4D)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "12px",
                        fontSize: "16px",
                        fontWeight: "800",
                        cursor: "pointer",
                        boxShadow: "0 4px 12px rgba(201, 26, 77, 0.3)",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 6px 16px rgba(201, 26, 77, 0.4)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(201, 26, 77, 0.3)";
                      }}
                    >
                      Done ({tempSelectedTables.length})
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ 
                  fontSize: "14px", 
                  fontWeight: "600", 
                  color: "#6b7280", 
                  textAlign: "center",
                  padding: "8px 0"
                }}>
                  Tap tables on the map to select
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Waitlist Modal - Wait Time Selection */}
      {showWaitlistModal && (
        <div
          onClick={() => setShowWaitlistModal(false)}
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
              maxWidth: "400px",
              overflow: "hidden"
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: "20px",
              background: "linear-gradient(135deg, #7A0026, #C91A4D)",
              color: "#fff",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>
                Add to Waitlist
              </div>
              <div style={{ fontSize: "14px", opacity: 0.9 }}>
                {formData.guestName || 'Guest'} • {formData.partySize} guests
              </div>
            </div>

            {/* Modal Content */}
            <div style={{ padding: "24px" }}>
              <div style={{ marginBottom: "20px" }}>
                <label style={{ 
                  display: "block", 
                  marginBottom: "12px", 
                  fontWeight: "700",
                  fontSize: "14px",
                  color: "#374151"
                }}>
                  Estimated Wait Time
                </label>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "10px",
                  marginBottom: "16px"
                }}>
                  {[5, 10, 15, 20, 30, 45, 60, 90].map((minutes) => (
                    <button
                      key={minutes}
                      onClick={() => setWaitTimeMinutes(minutes)}
                      style={{
                        padding: "12px 8px",
                        borderRadius: "12px",
                        border: "none",
                        background: waitTimeMinutes === minutes 
                          ? "linear-gradient(135deg, #7A0026, #C91A4D)"
                          : "#f3f4f6",
                        color: waitTimeMinutes === minutes ? "#fff" : "#374151",
                        fontSize: "14px",
                        fontWeight: waitTimeMinutes === minutes ? "800" : "700",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        boxShadow: waitTimeMinutes === minutes ? "0 2px 8px rgba(201, 26, 77, 0.3)" : "none"
                      }}
                      onMouseEnter={(e) => {
                        if (waitTimeMinutes !== minutes) {
                          e.currentTarget.style.background = "#FBE6EC";
                          e.currentTarget.style.transform = "scale(1.05)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (waitTimeMinutes !== minutes) {
                          e.currentTarget.style.background = "#f3f4f6";
                          e.currentTarget.style.transform = "scale(1)";
                        }
                      }}
                    >
                      {minutes} min
                    </button>
                  ))}
                </div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px",
                  background: "#f9fafb",
                  borderRadius: "12px",
                  border: "1px solid #e5e7eb"
                }}>
                  <label style={{ 
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#6b7280",
                    minWidth: "120px"
                  }}>
                    Custom (minutes):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="240"
                    value={waitTimeMinutes}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 15;
                      setWaitTimeMinutes(Math.max(1, Math.min(240, value)));
                    }}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: "1px solid #d1d5db",
                      fontSize: "16px",
                      fontWeight: "700",
                      color: "#111827",
                      outline: "none",
                      textAlign: "center"
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
                <div style={{
                  marginTop: "12px",
                  padding: "12px",
                  background: "#eff6ff",
                  borderRadius: "12px",
                  border: "1px solid #dbeafe",
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "#1e40af",
                  textAlign: "center"
                }}>
                  Estimated ready time: {new Date(Date.now() + waitTimeMinutes * 60000).toLocaleTimeString("en-US", { 
                    hour: "2-digit", 
                    minute: "2-digit",
                    hour12: true 
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <button
                  onClick={handleConfirmWaitlist}
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "16px",
                    background: loading 
                      ? "#d1d5db" 
                      : "linear-gradient(135deg, #7A0026, #C91A4D)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "14px",
                    fontSize: "16px",
                    fontWeight: "800",
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
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
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
                        <circle cx="12" cy="12" r="10" opacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                      Adding...
                    </>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      Add to Waitlist
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowWaitlistModal(false)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: "#f9fafb",
                    color: "#6b7280",
                    border: "1px solid #e5e7eb",
                    borderRadius: "14px",
                    fontSize: "14px",
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
              </div>
            </div>
          </div>
        </div>
      )}

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

