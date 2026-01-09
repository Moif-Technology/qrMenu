// frontend/src/pages/ReservationPage.jsx - Floor View (Main Landing Page)
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useReservationStore } from "../store/reservationStore";
import { getTablesByArea } from "../services/table.service";
import { getAreas } from "../services/menu.service";
import { getAllReservations } from "../services/reservation.service";
import { getFloorLayoutByArea } from "../services/floorLayout.service";
import TopBar from "../component/reservation/TopBar";
import TableCard from "../component/reservation/TableCard";
import FloorMapContainer from "../component/reservation/FloorMapContainer";
import BottomNav from "../component/reservation/BottomNav";

// Table Action Menu Modal
function TableActionMenu({ table, onClose, onMakeReservation, onMakeWalkIn }) {
  if (!table) return null;

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
          maxWidth: "400px",
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px",
          background: "linear-gradient(135deg, #7A0026, #C91A4D)",
          color: "#fff",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>
            Table {table.number || table.tableNo || table.id}
          </div>
          <div style={{ fontSize: "14px", opacity: 0.9 }}>
            {table.capacity || table.seats || '-'} seats • {table.status || 'Available'}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            onClick={onMakeReservation}
            style={{
              width: "100%",
              padding: "16px",
              background: "linear-gradient(135deg, #7A0026, #C91A4D)",
              color: "#fff",
              border: "none",
              borderRadius: "14px",
              fontSize: "16px",
              fontWeight: "800",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              boxShadow: "0 4px 12px rgba(201, 26, 77, 0.3)"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Make Reservation
          </button>

          <button
            onClick={onMakeWalkIn}
            style={{
              width: "100%",
              padding: "16px",
              background: "#fff",
              color: "#C91A4D",
              border: "1.5px solid #C91A4D",
              borderRadius: "14px",
              fontSize: "16px",
              fontWeight: "800",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            Make Walk-in Guest
          </button>

          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: "12px",
              background: "#f9fafb",
              color: "#6b7280",
              border: "1px solid #e5e7eb",
              borderRadius: "14px",
              fontSize: "14px",
              fontWeight: "700",
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Validation Modal Component
function ValidationModal({ message, onClose }) {
  if (!message) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1001,
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
        {/* Header */}
        <div style={{
          padding: "20px",
          background: "linear-gradient(135deg, #f59e0b, #f97316)",
          color: "#fff",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "24px", fontWeight: "800", marginBottom: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Table Occupied
          </div>
        </div>

        {/* Message */}
        <div style={{ padding: "24px", textAlign: "center" }}>
          <p style={{
            fontSize: "16px",
            fontWeight: "500",
            color: "#374151",
            lineHeight: "1.6",
            margin: 0
          }}>
            {message}
          </p>
        </div>

        {/* Action Button */}
        <div style={{ padding: "16px", paddingTop: "0" }}>
          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: "16px",
              background: "linear-gradient(135deg, #7A0026, #C91A4D)",
              color: "#fff",
              border: "none",
              borderRadius: "14px",
              fontSize: "16px",
              fontWeight: "800",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(201, 26, 77, 0.3)"
            }}
          >
            OK, I Understand
          </button>
        </div>
      </div>
    </div>
  );
}

// Area Selector Component
function AreaSelector() {
  const { selectedAreaId, setSelectedAreaId, areas } = useReservationStore();
  
  // Convert selectedAreaId to string for select element (HTML selects use strings)
  const selectedValue = selectedAreaId ? String(selectedAreaId) : "";
  
  return (
    <div style={{
      padding: "0.75rem 1rem",
      background: "#ffffff",
      borderBottom: "1px solid #e5e7eb"
    }}>
      <select
        value={selectedValue}
        onChange={(e) => {
          const value = e.target.value;
          setSelectedAreaId(value ? parseInt(value, 10) : null);
        }}
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
      >
        <option value="">All Areas</option>
        {(areas || []).map(area => {
          const areaId = area.areaId || area.AreaID;
          const areaName = area.areaName || area.AreaName || `Area ${areaId}`;
          return (
            <option key={areaId} value={String(areaId)}>
              {areaName}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export default function ReservationPage() {
  const navigate = useNavigate();
  const {
    selectedDate,
    selectedAreaId,
    setSelectedAreaId,
    setAreas,
    initializeAreas,
    setTables,
    setReservations,
    tables
  } = useReservationStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [floorLayout, setFloorLayout] = useState(null);
  const initialLoadRef = useRef(false);
  const isLoadingTablesRef = useRef(false);

  // Load tables and floor layout for a specific area
  const loadTables = useCallback(async (areaId) => {
    if (!areaId) {
      console.warn("[FLOOR_LAYOUT] No areaId provided to loadTables");
      return;
    }
    
    isLoadingTablesRef.current = true;
    console.log("[FLOOR_LAYOUT] Loading tables for areaId:", areaId);
    setLoading(true);
    setError(null);
    try {
      // Load tables
      const tablesData = await getTablesByArea(areaId);
      console.log("[FLOOR_LAYOUT] Loaded tables:", tablesData?.length || 0);
      setTables(tablesData || []);
      
      // Load floor layout
      try {
        const layout = await getFloorLayoutByArea(areaId);
        console.log("[FLOOR_LAYOUT] Loaded layout:", {
          areaId,
          tables: layout?.tables?.length || 0,
          shapes: layout?.shapes?.length || 0,
          borderPoints: layout?.borderPoints?.length || 0
        });
        setFloorLayout(layout);
      } catch (layoutErr) {
        console.warn("[FLOOR_LAYOUT] Failed to load floor layout:", layoutErr);
        setFloorLayout(null); // Continue without layout if it fails
      }
    } catch (err) {
      console.error("[FLOOR_LAYOUT] Failed to load tables:", err);
      setError("Failed to load tables. Please try again.");
      setTables([]);
      setFloorLayout(null);
    } finally {
      setLoading(false);
      isLoadingTablesRef.current = false;
    }
  }, [setTables]);

  // Load areas on mount and auto-select first area - THIS RUNS FIRST
  useEffect(() => {
    let mounted = true;
    
    const initialize = async () => {
      try {
        // Set flag first to prevent area change useEffect from triggering
        initialLoadRef.current = true;
        
        // Step 1: Load areas
        const areas = await getAreas();
        if (!mounted) return;
        
        if (!areas || areas.length === 0) {
          setLoading(false);
          initialLoadRef.current = false;
          return;
        }
        
        // Step 2: Always auto-select first area on initial load
        const firstAreaId = areas[0].areaId || areas[0].AreaID;
        
        // Set areas and selectedAreaId together in a single update to prevent flickering
        // This ensures AreaSelector renders once with both areas and selectedAreaId set
        initializeAreas(areas, firstAreaId);
        
        // Step 3: Load tables and floor layout for the first area directly (don't rely on useEffect)
        isLoadingTablesRef.current = true;
        setLoading(true);
        setError(null);
        
        try {
          // Load tables
          const tablesData = await getTablesByArea(firstAreaId);
          if (!mounted) return;
          console.log("[FLOOR_LAYOUT] Tables loaded:", tablesData?.length || 0, tablesData);
          setTables(tablesData || []);
          
          // Load floor layout
          try {
            const layout = await getFloorLayoutByArea(firstAreaId);
            if (!mounted) return;
            console.log("[FLOOR_LAYOUT] Layout loaded:", {
              hasLayout: !!layout,
              borderPoints: layout?.borderPoints?.length || 0,
              tables: layout?.tables?.length || 0,
              shapes: layout?.shapes?.length || 0,
              fullLayout: layout
            });
            setFloorLayout(layout);
          } catch (layoutErr) {
            console.warn("[FLOOR_LAYOUT] Floor layout error:", layoutErr);
            if (mounted) setFloorLayout(null);
          }
        } catch (err) {
          console.error("[FLOOR_LAYOUT] Tables error:", err);
          if (mounted) {
            setError("Failed to load tables.");
            setTables([]);
            setFloorLayout(null);
          }
        } finally {
          if (mounted) {
            setLoading(false);
            isLoadingTablesRef.current = false;
            // Clear the flag after initial load is complete
            initialLoadRef.current = false;
          }
        }
      } catch (err) {
        console.error("[FLOOR_LAYOUT] Init error:", err);
        if (mounted) {
          setLoading(false);
          initialLoadRef.current = false;
        }
      }
    };
    
    initialize();
    
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run ONLY once on mount

  // Load tables and floor layout when area changes (for manual area selection)
  useEffect(() => {
    // Skip if this is the initial load (handled in initialize function)
    if (initialLoadRef.current) {
      return; // Don't clear the flag here, it's cleared after initial load completes
    }
    
    // Load tables when area is manually changed (not during initial load)
    if (selectedAreaId) {
      console.log("[FLOOR_LAYOUT] Area changed, loading tables for:", selectedAreaId);
      loadTables(selectedAreaId);
    }
  }, [selectedAreaId, loadTables]);

  // Load reservations for selected date
  const loadReservations = useCallback(async () => {
    // Don't update tables if we're currently loading tables (prevents flickering)
    if (isLoadingTablesRef.current) {
      return;
    }
    
    try {
      const result = await getAllReservations({ 
        date: selectedDate,
        status: 'PENDING,CONFIRMED,ARRIVED,SEATED'
      });
      setReservations(result.reservations || []);
      
      // Update table statuses based on reservations - use current tables from store
      // Only update if we have tables and reservations
      if (result.reservations && result.reservations.length > 0) {
        // Use get() to get current tables from store instead of dependency
        const currentTables = useReservationStore.getState().tables;
        if (currentTables && currentTables.length > 0) {
          const updatedTables = currentTables.map(table => {
            const tableReservation = result.reservations.find(
              r => r.tableId === table.id || r.tableId === table.number
            );
            if (tableReservation) {
              return {
                ...table,
                status: 'Reserved',
                reservationInfo: {
                  guestName: tableReservation.customerName,
                  time: tableReservation.reservationTime,
                  date: tableReservation.reservationDate
                }
              };
            }
            return table;
          });
          setTables(updatedTables);
        }
      }
    } catch (err) {
      console.error("Failed to load reservations:", err);
    }
  }, [selectedDate, setReservations, setTables]);

  useEffect(() => {
    loadReservations();
    // Refresh every 15 seconds
    const interval = setInterval(loadReservations, 15000);
    return () => clearInterval(interval);
  }, [selectedDate, loadReservations]);

  const [selectedTable, setSelectedTable] = useState(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  const handleTableClick = (table) => {
    setSelectedTable(table);
    setShowActionMenu(true);
  };

  const handleMakeReservation = () => {
    if (selectedTable) {
      setShowActionMenu(false);
      navigate("/reservation-form", { 
        state: { 
          selectedTable,
          selectedAreaId: selectedAreaId || selectedTable.areaId
        } 
      });
    }
  };

  const handleMakeWalkIn = () => {
    if (selectedTable) {
      // Check if table is occupied, reserved, or seated
      const tableStatus = (selectedTable.status || '').toLowerCase();
      const isOccupied = tableStatus === 'occupied' || 
                        tableStatus === 'reserved' || 
                        tableStatus === 'seated' ||
                        selectedTable.reservationInfo; // Also check if reservationInfo exists
      
      if (isOccupied) {
        setShowActionMenu(false);
        setValidationMessage(
          `Table ${selectedTable.number || selectedTable.tableNo || selectedTable.id} is ${selectedTable.status || 'occupied'}. ` +
          `Please use reservation to do reserving for any other time.`
        );
        setShowValidationModal(true);
        return;
      }
      
      // Table is available, proceed with walk-in
      setShowActionMenu(false);
      navigate("/walk-in", { 
        state: { 
          selectedTable,
          selectedAreaId: selectedAreaId || selectedTable.areaId
        } 
      });
    }
  };

  const handleSearch = (query) => {
    console.log("Search:", query);
  };

  const handleDateChange = (newDate) => {
    loadReservations();
  };

  // Tables are already filtered by area from getTablesByArea, so use them directly
  const displayTables = tables;

  return (
    <div style={{
      height: "100vh",
      background: "radial-gradient(120% 60% at 50% 0%, rgba(201,26,77,0.16), transparent 55%), #fdf8fa",
      display: "flex",
      flexDirection: "column",
      paddingBottom: "70px",
      WebkitOverflowScrolling: "touch",
      overflow: "hidden"
    }}>
      {/* Top Bar */}
      <TopBar onSearch={handleSearch} onDateChange={handleDateChange} />

      {/* Area Selector */}
      <AreaSelector />

      {/* Floor Layout - Tables Grid - Full Size */}
      <div style={{
        flex: 1,
        padding: "0",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minHeight: 0 // Important for flex children to shrink
      }}>
        {loading ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "400px",
            gap: "1rem"
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C91A4D" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
              <circle cx="12" cy="12" r="10" opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
            <div style={{
              fontSize: "0.875rem",
              fontWeight: "500",
              color: "#6b7280"
            }}>
              Loading tables...
            </div>
          </div>
        ) : error ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "400px",
            gap: "1rem",
            padding: "2rem"
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div style={{
              fontSize: "0.875rem",
              fontWeight: "600",
              color: "#ef4444",
              textAlign: "center"
            }}>
              {error}
            </div>
          </div>
        ) : displayTables.length === 0 ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "400px",
            gap: "1rem"
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="9" x2="15" y2="9" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <div style={{
              fontSize: "0.875rem",
              fontWeight: "500",
              color: "#6b7280"
            }}>
              No tables found for this area
            </div>
          </div>
        ) : (floorLayout && (floorLayout.borderPoints?.length > 0 || floorLayout.tables?.length > 0 || floorLayout.shapes?.length > 0)) || displayTables.length > 0 ? (
          <FloorMapContainer 
            floorLayout={floorLayout}
            displayTables={displayTables}
            onTableClick={handleTableClick}
          />
        ) : (
          // Fallback to grid layout if no floor layout data
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
            gap: "0.75rem",
            maxWidth: "100%"
          }}>
            {displayTables.map(table => (
              <TableCard
                key={table.id || table.number}
                table={table}
                onClick={handleTableClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Table Action Menu */}
      {showActionMenu && (
        <TableActionMenu
          table={selectedTable}
          onClose={() => {
            setShowActionMenu(false);
            setSelectedTable(null);
          }}
          onMakeReservation={handleMakeReservation}
          onMakeWalkIn={handleMakeWalkIn}
        />
      )}

      {/* Validation Modal */}
      {showValidationModal && (
        <ValidationModal
          message={validationMessage}
          onClose={() => {
            setShowValidationModal(false);
            setValidationMessage("");
          }}
        />
      )}

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Add CSS animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        * {
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>
    </div>
  );
}
