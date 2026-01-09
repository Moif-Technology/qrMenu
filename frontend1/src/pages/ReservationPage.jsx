// frontend/src/pages/ReservationPage.jsx - Floor View (Main Landing Page)
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useReservationStore } from "../store/reservationStore";
import { getTablesByArea } from "../services/table.service";
import { getAreas } from "../services/menu.service";
import { getAllReservations } from "../services/reservation.service";
import { getFloorLayoutByArea } from "../services/floorLayout.service";
import FloorMapView from "../component/reserve/FloorMapView";
import TopBar from "../component/reservation/TopBar";
import TableCard from "../component/reservation/TableCard";
import BottomNav from "../component/reservation/BottomNav";

// Convert floorLayout data to format expected by FloorMapView
function convertFloorLayoutToMapData(floorLayout, displayTables) {
  if (!floorLayout) return null;
  
  const hasLayout = (
    floorLayout.borderPoints?.length > 0 || 
    floorLayout.shapes?.length > 0 || 
    floorLayout.tables?.length > 0
  );
  
  return {
    hasLayout,
    // Convert border points: {x, y} -> {posXPercent, posYPercent}
    borderPoints: floorLayout.borderPoints?.map(p => ({
      posXPercent: Number(p.x) || Number(p.posXPercent) || 0,
      posYPercent: Number(p.y) || Number(p.posYPercent) || 0
    })) || [],
    
    // Convert shapes: position object -> flat structure
    shapes: floorLayout.shapes?.map(shape => ({
      shapeType: shape.type || shape.shapeType || 'RECTANGLE',
      posXPercent: Number(shape.position.x) || 0,
      posYPercent: Number(shape.position.y) || 0,
      widthPercent: Number(shape.position.width) || 0,
      heightPercent: Number(shape.position.height) || 0,
      backColorArgb: shape.style.backgroundColor 
        ? parseInt(shape.style.backgroundColor.replace('#', ''), 16) 
        : null,
      borderColorArgb: shape.style.borderColor 
        ? parseInt(shape.style.borderColor.replace('#', ''), 16) 
        : null,
      displayText: shape.style.text || null,
      fontSize: shape.style.fontSize || null
    })) || [],
    
    // Convert tables: match with displayTables and convert position
    tables: floorLayout.tables?.map(layoutTable => {
      // Find matching table from displayTables
      const table = displayTables.find(
        t => t.id === layoutTable.tableId || 
             t.number === layoutTable.tableNo || 
             t.tableId === layoutTable.tableId
      ) || {
        id: layoutTable.tableId,
        number: layoutTable.tableNo,
        name: layoutTable.tableNo,
        status: 'available'
      };
      
      return {
        tableId: layoutTable.tableId,
        tableNo: layoutTable.tableNo,
        tableName: layoutTable.tableNo || String(layoutTable.tableId),
        posXPercent: Number(layoutTable.position.x) || 0,
        posYPercent: Number(layoutTable.position.y) || 0,
        widthPercent: Number(layoutTable.position.width) || 5,
        heightPercent: Number(layoutTable.position.height) || 5,
        rotationDeg: Number(layoutTable.position.rotation) || 0,
        state: table.status?.toLowerCase() || 'available'
      };
    }) || []
  };
}

// Area Selector Component
function AreaSelector() {
  const { selectedAreaId, setSelectedAreaId, areas } = useReservationStore();
  
  return (
    <div style={{
      padding: "0.75rem 1rem",
      background: "#ffffff",
      borderBottom: "1px solid #e5e7eb"
    }}>
      <select
        value={selectedAreaId || ""}
        onChange={(e) => setSelectedAreaId(e.target.value ? parseInt(e.target.value) : null)}
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
        {areas.map(area => (
          <option key={area.areaId || area.AreaID} value={area.areaId || area.AreaID}>
            {area.areaName || area.AreaName || `Area ${area.areaId || area.AreaID}`}
          </option>
        ))}
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
    setTables,
    setReservations,
    tables,
    areas
  } = useReservationStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [floorLayout, setFloorLayout] = useState(null);

  // Load areas on mount
  useEffect(() => {
    const loadAreas = async () => {
      try {
        const areas = await getAreas();
        setAreas(areas || []);
        // Auto-select first area if available
        if (areas && areas.length > 0 && !selectedAreaId) {
          setSelectedAreaId(areas[0].areaId || areas[0].AreaID);
        }
      } catch (err) {
        console.error("Failed to load areas:", err);
      }
    };
    loadAreas();
  }, [setAreas, setSelectedAreaId, selectedAreaId]);

  // Load tables and floor layout when area changes
  const loadTables = useCallback(async (areaId) => {
    if (!areaId) return;
    
    setLoading(true);
    setError(null);
    try {
      // Load tables
      const tablesData = await getTablesByArea(areaId);
      setTables(tablesData || []);
      
      // Load floor layout
      try {
        const layout = await getFloorLayoutByArea(areaId);
        console.log("[FLOOR_LAYOUT] Loaded layout:", {
          areaId,
          tables: layout?.tables?.length || 0,
          shapes: layout?.shapes?.length || 0,
          borderPoints: layout?.borderPoints?.length || 0,
          fullLayout: layout
        });
        setFloorLayout(layout);
      } catch (layoutErr) {
        console.warn("[FLOOR_LAYOUT] Failed to load floor layout:", layoutErr);
        setFloorLayout(null); // Continue without layout if it fails
      }
    } catch (err) {
      console.error("Failed to load tables:", err);
      setError("Failed to load tables. Please try again.");
      setTables([]);
      setFloorLayout(null);
    } finally {
      setLoading(false);
    }
  }, [setTables]);

  useEffect(() => {
    if (selectedAreaId) {
      loadTables(selectedAreaId);
    }
  }, [selectedAreaId, loadTables]);

  // Load reservations for selected date
  const loadReservations = useCallback(async () => {
    try {
      const result = await getAllReservations({ 
        date: selectedDate,
        status: 'PENDING,CONFIRMED,ARRIVED,SEATED'
      });
      setReservations(result.reservations || []);
      
      // Update table statuses based on reservations
      if (result.reservations && result.reservations.length > 0) {
        const updatedTables = tables.map(table => {
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
    } catch (err) {
      console.error("Failed to load reservations:", err);
    }
  }, [selectedDate, setReservations, tables, setTables]);

  useEffect(() => {
    loadReservations();
    // Refresh every 15 seconds
    const interval = setInterval(loadReservations, 15000);
    return () => clearInterval(interval);
  }, [selectedDate, loadReservations]);

  const handleTableClick = (table) => {
    navigate("/table-action", { state: { table } });
  };

  const handleSearch = (query) => {
    console.log("Search:", query);
  };

  const handleDateChange = (newDate) => {
    loadReservations();
  };

  // Filter tables by area if needed
  const displayTables = selectedAreaId 
    ? tables.filter(t => t.areaId === selectedAreaId || !selectedAreaId)
    : tables;

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(120% 60% at 50% 0%, rgba(201,26,77,0.16), transparent 55%), #fdf8fa",
      display: "flex",
      flexDirection: "column",
      paddingBottom: "70px",
      WebkitOverflowScrolling: "touch"
    }}>
      {/* Top Bar */}
      <TopBar onSearch={handleSearch} onDateChange={handleDateChange} />

      {/* Area Selector */}
      <AreaSelector />

      {/* Floor Layout - Tables Grid */}
      <div style={{
        flex: 1,
        padding: "1rem",
        overflow: "auto",
        WebkitOverflowScrolling: "touch"
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
        ) : floorLayout && (floorLayout.borderPoints?.length > 0 || floorLayout.tables?.length > 0 || floorLayout.shapes?.length > 0) ? (
          (() => {
            const convertedData = convertFloorLayoutToMapData(floorLayout, displayTables);
            console.log("[RESERVATION_PAGE] Floor layout data:", {
              floorLayout,
              convertedData,
              hasLayout: convertedData?.hasLayout,
              borderPoints: convertedData?.borderPoints?.length || 0,
              shapes: convertedData?.shapes?.length || 0,
              tables: convertedData?.tables?.length || 0,
              displayTables: displayTables.length
            });
            
            if (!convertedData || !convertedData.hasLayout) {
              console.warn("[RESERVATION_PAGE] No layout data after conversion, falling back to grid");
              return (
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
              );
            }
            
            return (
              <div style={{
                position: "relative",
                width: "100%",
                minHeight: "600px",
                height: "600px",
                display: "flex",
                flexDirection: "column",
                backgroundColor: "#f9fafb",
                border: "2px solid #e5e7eb",
                borderRadius: "12px",
                padding: "0.5rem",
                boxShadow: "0 1px 6px rgba(0,0,0,0.05)"
              }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <FloorMapView
                    tables={displayTables}
                    layoutData={convertedData}
                    selectedTables={[]}
                    onSelect={handleTableClick}
                    selectedArea={areas?.find(a => (a.areaId || a.AreaID) === selectedAreaId) || null}
                  />
                </div>
              </div>
            );
          })()
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
