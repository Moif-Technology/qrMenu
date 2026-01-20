// frontend/src/component/reservation/FloorMapContainer.jsx
// Reusable Floor Map Container with zoom/pan support
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import TableCard from "./TableCard";

// Floor Map Container Component - Renders the floor map with tables, shapes, and border lines
// Based on VB.NET TableFloorRuntimeFrm logic
// Full size canvas with zoom and pan (pinch support)
export default function FloorMapContainer({ floorLayout, displayTables, onTableClick, showZoomControls = true, selectedTables = [] }) {
  // Large canvas size - full floor plan
  const CANVAS_WIDTH = 1600;
  const CANVAS_HEIGHT = 1200;
  const containerSize = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };

  // Convert percentage to pixels (matches VB: w * (PosXPercent / 100D))
  const percentToPx = (percent, dimension) => {
    return (containerSize[dimension] * percent) / 100;
  };

  // Get border points as pixel coordinates (matches VB LoadBorder logic)
  const getBorderPointsPx = () => {
    if (!floorLayout?.borderPoints || floorLayout.borderPoints.length === 0) {
      return [];
    }
    return floorLayout.borderPoints.map(p => ({
      x: percentToPx(Number(p.x) || Number(p.posXPercent) || 0, 'width'),
      y: percentToPx(Number(p.y) || Number(p.posYPercent) || 0, 'height')
    }));
  };

  const borderPointsPx = getBorderPointsPx();
  const hasBorder = borderPointsPx.length >= 3; // BorderClosed = (BorderPoints.Count >= 3)

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: "#f3f4f6",
        borderRadius: "12px",
        overflow: "hidden"
      }}
    >
      <TransformWrapper
        initialScale={1}
        minScale={0.3}
        maxScale={3}
        wheel={{ step: 0.1 }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: true }}
        panning={{ disabled: false, velocityDisabled: false }}
        centerOnInit={true}
        limitToBounds={false}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {/* Zoom Controls */}
            {showZoomControls && (
              <div style={{
                position: "absolute",
                top: "1rem",
                right: "1rem",
                zIndex: 100,
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                backgroundColor: "white",
                padding: "0.5rem",
                borderRadius: "8px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
              }}>
                <button
                  onClick={() => zoomIn()}
                  style={{
                    width: "36px",
                    height: "36px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    backgroundColor: "white",
                    cursor: "pointer",
                    fontSize: "1.2rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  title="Zoom In"
                >
                  +
                </button>
                <button
                  onClick={() => zoomOut()}
                  style={{
                    width: "36px",
                    height: "36px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    backgroundColor: "white",
                    cursor: "pointer",
                    fontSize: "1.2rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  title="Zoom Out"
                >
                  −
                </button>
                <button
                  onClick={() => resetTransform()}
                  style={{
                    width: "36px",
                    height: "36px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    backgroundColor: "white",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  title="Reset Zoom"
                >
                  ⌂
                </button>
              </div>
            )}

            <TransformComponent
              wrapperClass="w-full h-full"
              contentClass="w-full h-full flex items-center justify-center"
            >
              {/* Canvas container */}
              <div
                style={{
                  position: "relative",
                  width: `${CANVAS_WIDTH}px`,
                  height: `${CANVAS_HEIGHT}px`,
                  minWidth: `${CANVAS_WIDTH}px`,
                  minHeight: `${CANVAS_HEIGHT}px`,
                  backgroundColor: "#ffffff",
                  // Grid background (matches VB grid drawing)
                  backgroundImage: `
                    linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)
                  `,
                  backgroundSize: "20px 20px"
                }}
              >
                {/* Render border (matches VB: DrawClosedCurve or DrawLines) */}
                {borderPointsPx.length >= 2 && (
                  <svg
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                      zIndex: 1
                    }}
                    viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
                    preserveAspectRatio="none"
                  >
                    {hasBorder ? (
                      // Closed curve (matches VB: DrawClosedCurve)
                      <path
                        d={`M ${borderPointsPx.map(p => `${p.x},${p.y}`).join(' L ')} Z`}
                        fill="none"
                        stroke="rgba(64, 0, 0, 1)"
                        strokeWidth="3"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ) : (
                      // Open lines (matches VB: DrawLines)
                      <polyline
                        points={borderPointsPx.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke="rgba(64, 0, 0, 1)"
                        strokeWidth="3"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                )}

                {/* Render floor shapes (matches VB: LoadFloorShapes - walls, zones, labels) */}
                {floorLayout?.shapes && floorLayout.shapes.map((shape, idx) => {
                  const shapeType = (shape.shapeType || '').toUpperCase();
                  const leftPx = percentToPx(shape.position.x, 'width');
                  const topPx = percentToPx(shape.position.y, 'height');
                  const widthPx = percentToPx(shape.position.width, 'width');
                  const heightPx = percentToPx(shape.position.height, 'height');

                  if (shapeType === 'LABEL') {
                    // Label (matches VB: Label with DisplayText)
                    return (
                      <div
                        key={`shape-label-${idx}`}
                        style={{
                          position: "absolute",
                          left: `${shape.position.x}%`,
                          top: `${shape.position.y}%`,
                          width: `${shape.position.width}%`,
                          height: `${shape.position.height}%`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "transparent",
                          color: "rgba(64, 0, 0, 1)",
                          fontSize: shape.style.fontSize ? `${shape.style.fontSize}px` : "10px",
                          fontWeight: "bold",
                          zIndex: 2,
                          pointerEvents: "none"
                        }}
                      >
                        {shape.style.text || ''}
                      </div>
                    );
                  } else {
                    // Panel/Wall/Zone (matches VB: Panel with BackColor)
                    const bgColor = shape.style.backgroundColor != null
                      ? `rgba(${(shape.style.backgroundColor >>> 16) & 0xFF}, ${(shape.style.backgroundColor >>> 8) & 0xFF}, ${shape.style.backgroundColor & 0xFF}, 1)`
                      : "#d3d3d3"; // LightGray default
                    
                    return (
                      <div
                        key={`shape-${idx}`}
                        style={{
                          position: "absolute",
                          left: `${shape.position.x}%`,
                          top: `${shape.position.y}%`,
                          width: `${shape.position.width}%`,
                          height: `${shape.position.height}%`,
                          backgroundColor: bgColor,
                          border: "1px solid #999",
                          zIndex: 2,
                          pointerEvents: "none"
                        }}
                      />
                    );
                  }
                })}
                
                {/* Show message if no layout but map is displayed (matches VB: "No floor map defined for this Area") */}
                {floorLayout && (!floorLayout.borderPoints || floorLayout.borderPoints.length === 0) && 
                 (!floorLayout.tables || floorLayout.tables.length === 0) && 
                 (displayTables || []).length > 0 && (
                  <div style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: "0.5rem",
                    backgroundColor: "rgba(220, 38, 38, 0.1)",
                    color: "#991b1b",
                    textAlign: "center",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    zIndex: 5,
                    borderBottom: "1px solid rgba(220, 38, 38, 0.2)"
                  }}>
                    No floor map defined for this Area. Showing default table layout.
                  </div>
                )}
                
                {/* Render tables (matches VB: LoadTables with position from AreaTableLayout or grid fallback) */}
                {(() => {
                  // Get tables with layout positions (position is not null)
                  const tablesWithLayout = (floorLayout?.tables || []).filter(t => t.position != null);
                  // Get tables without layout positions (position is null - need grid fallback)
                  const tablesWithoutLayout = (floorLayout?.tables || []).filter(t => t.position == null);
                  
                  // Also include any displayTables that aren't in floorLayout (shouldn't happen, but safety check)
                  const layoutTableIds = new Set((floorLayout?.tables || []).map(t => t.tableId));
                  const missingTables = (displayTables || []).filter(t => 
                    !layoutTableIds.has(t.id) && 
                    !layoutTableIds.has(Number(t.id)) &&
                    !layoutTableIds.has(Number(t.number))
                  );
                  
                  // Render tables with layout positions (exact positions from database)
                  const layoutTables = tablesWithLayout.map((layoutTable) => {
                    // Merge layout table data with displayTables (prefer status from layout which includes KOT/reservation)
                    const displayTable = (displayTables || []).find(t => 
                      (t.id === layoutTable.tableId) || 
                      (t.number === layoutTable.tableNo) ||
                      (String(t.id) === String(layoutTable.tableId))
                    );
                    
                    // Use status from layout (includes KOT/reservation logic) or fallback to displayTable status
                    const tableData = {
                      id: layoutTable.tableId,
                      number: layoutTable.tableNo,
                      tableName: layoutTable.tableName,
                      seats: layoutTable.seats,
                      capacity: layoutTable.seats,
                      status: layoutTable.status || displayTable?.status || 'Available',
                      // Include KOT info if available
                      ...(layoutTable.kotInfo && {
                        kotInfo: layoutTable.kotInfo
                      }),
                      // Include reservation info from displayTable if available
                      ...(displayTable?.reservationInfo && {
                        reservationInfo: displayTable.reservationInfo
                      })
                    };
                    
                    // Check if table is selected
                    const isSelected = selectedTables.some(t => 
                      (t.id || t.number) === tableData.id || 
                      (t.id || t.number) === tableData.number
                    );
                    
                    const x = layoutTable.position.x;
                    const y = layoutTable.position.y;
                    const width = layoutTable.position.width;
                    const height = layoutTable.position.height;
                    const rotation = layoutTable.position.rotation || 0;

                    return (
                      <div
                        key={`table-${layoutTable.tableId}`}
                        onClick={() => onTableClick && onTableClick(tableData)}
                        style={{
                          position: "absolute",
                          left: `${x}%`,
                          top: `${y}%`,
                          width: `${Math.max(width, 3)}%`,
                          height: `${Math.max(height, 3)}%`,
                          transform: `rotate(${rotation}deg)`,
                          transformOrigin: "center",
                          cursor: "pointer",
                          zIndex: 10
                        }}
                      >
                        <TableCard table={tableData} onClick={onTableClick} isSelected={isSelected} />
                      </div>
                    );
                  });

                  // Render tables without layout positions using grid fallback (matches VB: grid positioning)
                  const gridTables = [...tablesWithoutLayout, ...missingTables].map((table, idx) => {
                    const displayTable = (displayTables || []).find(t => 
                      (t.id === table.tableId || t.id === table.id) || 
                      (t.number === table.tableNo || t.number === table.number)
                    );
                    
                    const tableData = {
                      id: table.tableId || table.id,
                      number: table.tableNo || table.number || table.id,
                      tableName: table.tableName || table.name,
                      seats: table.seats || table.capacity,
                      capacity: table.seats || table.capacity,
                      status: table.status || displayTable?.status || 'Available',
                      ...(displayTable?.reservationInfo && {
                        reservationInfo: displayTable.reservationInfo
                      })
                    };

                    // Check if table is selected
                    const isSelected = selectedTables.some(t => 
                      (t.id || t.number) === tableData.id || 
                      (t.id || t.number) === tableData.number
                    );

                    // Grid fallback (matches VB: col = idx Mod 5, rowIdx = idx \ 5, Left = 20 + col * 100, Top = 60 + rowIdx * 70)
                    const col = idx % 5;
                    const rowIdx = Math.floor(idx / 5);
                    const gridLeft = 20 + col * 100;
                    const gridTop = 60 + rowIdx * 70;

                    return (
                      <div
                        key={`table-grid-${tableData.id}-${idx}`}
                        onClick={() => onTableClick && onTableClick(tableData)}
                        style={{
                          position: "absolute",
                          left: `${gridLeft}px`,
                          top: `${gridTop}px`,
                          width: "110px",
                          height: "90px",
                          cursor: "pointer",
                          zIndex: 10
                        }}
                      >
                        <TableCard table={tableData} onClick={onTableClick} isSelected={isSelected} />
                      </div>
                    );
                  });
                  
                  return [...layoutTables, ...gridTables];
                })()}
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

