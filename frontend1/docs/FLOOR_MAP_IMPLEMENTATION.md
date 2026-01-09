# Floor Map Implementation Guide - Complete Code Documentation

## Overview
The floor map uses a **Canvas-based rendering system** (HTML5 Canvas) to display restaurant floor layouts with border points, shapes, and tables. This is more robust than SVG for complex layouts.

---

## Complete Code Architecture

### File Structure
```
backend/
  ├── routes/floorLayout.routes.js          # API routes
  ├── controllers/floorLayout.controller.js  # Request handlers
  └── services/floorLayout.service.js       # Database queries

frontend/
  ├── services/floorLayout.service.js        # API client
  ├── component/reserve/FloorMapView.jsx     # Canvas rendering component
  └── pages/ReservationPage.jsx              # Usage example
```

---

## Backend Implementation

### 1. Routes (`backend/routes/floorLayout.routes.js`)

```javascript
import { Router } from "express";
import { getFloorLayoutByAreaController, getAllFloorLayoutsController } from "../controllers/floorLayout.controller.js";

const router = Router();

// GET /api/floor-layout/area/:areaId
router.get("/area/:areaId", getFloorLayoutByAreaController);

// GET /api/floor-layout/all
router.get("/all", getAllFloorLayoutsController);

export default router;
```

**Endpoints:**
- `GET /api/floor-layout/area/:areaId` - Get layout for specific area
- `GET /api/floor-layout/all` - Get layouts for all areas

### 2. Controller (`backend/controllers/floorLayout.controller.js`)

```javascript
import { getFloorLayoutByArea, getAllFloorLayouts } from "../services/floorLayout.service.js";

/**
 * GET /api/floor-layout/area/:areaId
 * Get floor layout for a specific area
 */
export async function getFloorLayoutByAreaController(req, res, next) {
  try {
    const { areaId } = req.params;
    
    if (!areaId) {
      return res.status(400).json({
        ok: false,
        error: "areaId parameter is required"
      });
    }
    
    const layout = await getFloorLayoutByArea(areaId);
    
    res.json({
      ok: true,
      layout
    });
  } catch (error) {
    console.error("[FLOOR_LAYOUT][CONTROLLER] Error:", error?.message || error);
    next(error);
  }
}

/**
 * GET /api/floor-layout/all
 * Get floor layouts for all areas
 */
export async function getAllFloorLayoutsController(req, res, next) {
  try {
    const layouts = await getAllFloorLayouts();
    
    res.json({
      ok: true,
      layouts
    });
  } catch (error) {
    console.error("[FLOOR_LAYOUT][CONTROLLER] Error:", error?.message || error);
    next(error);
  }
}
```

**Functions:**
- `getFloorLayoutByAreaController(req, res, next)` - Handles GET request for single area
- `getAllFloorLayoutsController(req, res, next)` - Handles GET request for all areas

### 3. Service (`backend/services/floorLayout.service.js`)

**Key Function: `getFloorLayoutByArea(areaId)`**

```javascript
export async function getFloorLayoutByArea(areaId) {
  if (!areaId) {
    throw new Error("areaId is required");
  }
  
  const pool = await connectToDb();
  const req = pool.request();
  
  // Convert areaId to BigInt to match database type
  const areaIdBigInt = BigInt(Number(areaId));
  req.input("AreaID", mssql.BigInt, areaIdBigInt);
  
  try {
    // 1. Get border points
    const borderPointsSql = `
      SELECT 
        [SequenceNo],
        [PosXPercent],
        [PosYPercent]
      FROM dbo.[AreaFloorBorderPoint]
      WHERE [AreaID] = @AreaID
      ORDER BY [SequenceNo] ASC
    `;
    
    let borderPoints = [];
    try {
      const borderPointsResult = await req.query(borderPointsSql);
      borderPoints = (borderPointsResult.recordset || []).map(row => ({
        sequenceNo: Number(row.SequenceNo),
        x: Number(row.PosXPercent),      // Percentage (0-100)
        y: Number(row.PosYPercent)       // Percentage (0-100)
      }));
    } catch (err) {
      console.warn("[FLOOR_LAYOUT] Error loading border points:", err?.message);
      // Continue without border points
    }
    
    // 2. Get floor shapes
    const shapesSql = `
      SELECT 
        [ShapeType],
        [PosXPercent],
        [PosYPercent],
        [WidthPercent],
        [HeightPercent],
        [BackColorArgb],
        [BorderColorArgb],
        [DisplayText],
        [FontSize]
      FROM dbo.[AreaFloorShape]
      WHERE [AreaID] = @AreaID
    `;
    
    let shapes = [];
    try {
      const shapesResult = await req.query(shapesSql);
      shapes = (shapesResult.recordset || []).map(row => ({
        shapeType: String(row.ShapeType || ''),
        position: {
          x: Number(row.PosXPercent || 0),
          y: Number(row.PosYPercent || 0),
          width: Number(row.WidthPercent || 0),
          height: Number(row.HeightPercent || 0)
        },
        style: {
          backgroundColor: row.BackColorArgb != null ? row.BackColorArgb : null,
          borderColor: row.BorderColorArgb != null ? row.BorderColorArgb : null,
          text: row.DisplayText != null ? String(row.DisplayText) : null,
          fontSize: row.FontSize != null ? Number(row.FontSize) : null
        }
      }));
    } catch (err) {
      console.warn("[FLOOR_LAYOUT] Error loading shapes:", err?.message);
      // Continue without shapes
    }
    
    // 3. Get table layouts
    const tablesSql = `
      SELECT 
        atl.[TableID],
        atl.[PosXPercent],
        atl.[PosYPercent],
        atl.[WidthPercent],
        atl.[HeightPercent],
        atl.[RotationDeg],
        tm.[TableNo],
        tm.[TableName],
        ISNULL(tm.[Seats], ISNULL(tm.[NoOfChairs], ISNULL(tm.[Capacity], 4))) AS Seats
      FROM dbo.[AreaTableLayout] atl
      LEFT JOIN dbo.[TableMaster] tm 
        ON tm.[TableID] = atl.[TableID] 
        AND tm.[AreaID] = @AreaID
      WHERE atl.[AreaID] = @AreaID
      ORDER BY atl.[TableID] ASC
    `;
    
    let tables = [];
    try {
      const tablesResult = await req.query(tablesSql);
      tables = (tablesResult.recordset || []).map(row => ({
        tableId: Number(row.TableID),
        tableNo: row.TableNo != null ? String(row.TableNo) : String(row.TableID),
        tableName: row.TableName != null ? String(row.TableName) : `Table ${row.TableID}`,
        seats: Number(row.Seats || 4),
        position: {
          x: Number(row.PosXPercent || 0),        // Percentage (0-100)
          y: Number(row.PosYPercent || 0),        // Percentage (0-100)
          width: Number(row.WidthPercent || 5),   // Percentage (0-100)
          height: Number(row.HeightPercent || 5), // Percentage (0-100)
          rotation: row.RotationDeg != null ? Number(row.RotationDeg) : 0  // Degrees
        }
      }));
    } catch (err) {
      console.warn("[FLOOR_LAYOUT] Error loading tables:", err?.message);
      // Continue without tables
    }
    
    return {
      areaId: Number(areaId),
      tables,
      shapes,
      borderPoints
    };
  } catch (error) {
    console.error("[FLOOR_LAYOUT] Error fetching floor layout:", error);
    throw error;
  }
}
```

**SQL Queries Explained:**

1. **Border Points Query:**
   - Selects `SequenceNo`, `PosXPercent`, `PosYPercent` from `AreaFloorBorderPoint`
   - Orders by `SequenceNo` to maintain point order
   - Converts DECIMAL to Number

2. **Shapes Query:**
   - Selects all shape properties from `AreaFloorShape`
   - Includes colors (ARGB integers), text, and dimensions
   - Handles NULL values gracefully

3. **Tables Query:**
   - Joins `AreaTableLayout` with `TableMaster` to get table details
   - Uses `ISNULL` to handle missing seat counts
   - Returns position, rotation, and table info

**Error Handling:**
- Each query is wrapped in try-catch
- If one query fails, others continue
- Returns empty arrays instead of throwing errors

---

## Frontend Implementation

### 1. Service (`frontend/src/services/floorLayout.service.js`)

```javascript
import { API } from "../lib/api";

/**
 * GET /api/floor-layout/area/:areaId
 * Get floor layout for a specific area
 */
export async function getFloorLayoutByArea(areaId) {
  if (!areaId) {
    throw new Error("areaId is required");
  }

  try {
    const { data } = await API.get(`/floor-layout/area/${encodeURIComponent(areaId)}`);
    
    if (!data || !data.ok) {
      throw new Error(data?.error || "Failed to fetch floor layout");
    }
    
    return data.layout || {
      areaId: Number(areaId),
      tables: [],
      shapes: [],
      borderPoints: []
    };
  } catch (error) {
    console.error("[FLOOR_LAYOUT] Failed to fetch floor layout by area:", error);
    throw error;
  }
}

/**
 * GET /api/floor-layout/all
 * Get floor layouts for all areas
 */
export async function getAllFloorLayouts() {
  try {
    const { data } = await API.get("/floor-layout/all");
    
    if (!data || !data.ok) {
      throw new Error(data?.error || "Failed to fetch floor layouts");
    }
    
    return data.layouts || {};
  } catch (error) {
    console.error("[FLOOR_LAYOUT] Failed to fetch all floor layouts:", error);
    throw error;
  }
}
```

**Functions:**
- `getFloorLayoutByArea(areaId)` - Fetches layout for one area
- `getAllFloorLayouts()` - Fetches layouts for all areas
- Uses `encodeURIComponent` to safely encode areaId in URL
- Returns default empty structure if API fails

### 2. FloorMapView Component (`frontend/src/component/reserve/FloorMapView.jsx`)

**Component Structure:**

```javascript
export default function FloorMapView({ 
  tables,           // Array of table objects
  layoutData,       // Layout data (borderPoints, shapes, tables)
  selectedTables,   // Array of selected table IDs
  onSelect,         // Callback when table is clicked
  selectedArea      // Current area object
})
```

**Key Hooks and Functions:**

#### A. Canvas Size Management

```javascript
const canvasRef = useRef(null);
const containerRef = useRef(null);
const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

// Update canvas size on resize
useEffect(() => {
  const updateSize = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const newSize = { 
        width: rect.width || 800, 
        height: Math.max(500, rect.height || 600) 
      };
      setCanvasSize(newSize);
    }
  };
  
  updateSize();
  
  // Use ResizeObserver for better performance
  let resizeObserver;
  if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
    resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(containerRef.current);
  }
  
  window.addEventListener('resize', updateSize);
  return () => {
    window.removeEventListener('resize', updateSize);
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  };
}, []);
```

**Purpose:** Tracks container size and updates canvas dimensions

#### B. Canvas Drawing Effect

```javascript
useEffect(() => {
  const canvas = canvasRef.current;
  const container = containerRef.current;
  if (!canvas || !container) return;

  const ctx = canvas.getContext('2d');
  
  // Get actual container dimensions
  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width || 800, 800);
  const height = Math.max(rect.height || 600, 500);
  
  // Set canvas internal size
  canvas.width = width;
  canvas.height = height;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Draw grid
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  const gridSize = 20;
  for (let x = 0; x <= width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Draw border points
  if (layoutData.borderPoints && layoutData.borderPoints.length >= 2) {
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const points = layoutData.borderPoints.map(p => ({
      x: (p.posXPercent / 100) * width,   // Convert % to pixels
      y: (p.posYPercent / 100) * height   // Convert % to pixels
    }));
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    if (points.length >= 3) {
      ctx.closePath();  // Close the polygon
    }
    ctx.stroke();
  }

  // Draw shapes
  if (layoutData.shapes) {
    layoutData.shapes.forEach(shape => {
      const x = (shape.posXPercent / 100) * width;
      const y = (shape.posYPercent / 100) * height;
      const w = (shape.widthPercent / 100) * width;
      const h = (shape.heightPercent / 100) * height;

      if (shape.shapeType?.toUpperCase() === 'LABEL') {
        // Draw label text
        ctx.fillStyle = '#400000';
        ctx.font = `${shape.fontSize || 12}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shape.displayText || '', x + w / 2, y + h / 2);
      } else {
        // Draw shape rectangle
        ctx.fillStyle = shape.backColorArgb 
          ? `rgba(${(shape.backColorArgb >> 16) & 0xFF}, ${(shape.backColorArgb >> 8) & 0xFF}, ${shape.backColorArgb & 0xFF}, 0.3)`
          : '#f3f4f6';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = shape.borderColorArgb
          ? `rgb(${(shape.borderColorArgb >> 16) & 0xFF}, ${(shape.borderColorArgb >> 8) & 0xFF}, ${shape.borderColorArgb & 0xFF})`
          : '#9ca3af';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    });
  }

  // Draw tables
  if (layoutData.tables && layoutData.tables.length > 0) {
    layoutData.tables.forEach(tableLayout => {
      // Find matching table
      let table = tables.find(t => String(t.id) === String(tableLayout.tableId));
      if (!table && tableLayout.tableNo) {
        table = tables.find(t => String(t.number) === String(tableLayout.tableNo));
      }

      const x = (tableLayout.posXPercent / 100) * width;
      const y = (tableLayout.posYPercent / 100) * height;
      const w = tableLayout.widthPercent ? (tableLayout.widthPercent / 100) * width : 60;
      const h = tableLayout.heightPercent ? (tableLayout.heightPercent / 100) * height : 60;

      const isSelected = selectedTables.some(t => String(t.id) === String(table.id));
      const state = (table?.status && table.status.toLowerCase()) || tableLayout.state || 'available';

      // Determine colors
      let bgColor, borderColor, textColor;
      if (isSelected) {
        const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
        gradient.addColorStop(0, '#c91a4d');
        gradient.addColorStop(1, '#e91e63');
        bgColor = gradient;
        borderColor = '#c91a4d';
        textColor = '#ffffff';
      } else if (state === 'reserved' || state === 'Reserved') {
        bgColor = '#f59e0b';
        borderColor = '#d97706';
        textColor = '#ffffff';
      } else {
        bgColor = '#ffffff';
        borderColor = '#d1d5db';
        textColor = '#1f2937';
      }

      // Draw table with rotation
      ctx.save();
      if (tableLayout.rotationDeg) {
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((tableLayout.rotationDeg * Math.PI) / 180);
        ctx.translate(-(x + w / 2), -(y + h / 2));
      }

      // Draw ellipse (table shape)
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
      ctx.fillStyle = bgColor;
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.stroke();

      // Draw table number
      ctx.fillStyle = textColor;
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tableLayout.tableName || tableLayout.tableNo || '', x + w / 2, y + h / 2);

      ctx.restore();
    });
  }
}, [canvasSize, layoutData, tables, selectedTables, containerRef]);
```

**Drawing Order:**
1. Clear canvas
2. Draw grid background
3. Draw border points (area boundaries)
4. Draw shapes (walls, labels)
5. Draw tables (with status colors)

**Key Canvas Operations:**
- `ctx.clearRect()` - Clear canvas
- `ctx.beginPath()` / `ctx.moveTo()` / `ctx.lineTo()` - Draw lines
- `ctx.fillRect()` - Draw rectangles
- `ctx.ellipse()` - Draw table circles
- `ctx.save()` / `ctx.restore()` - Save/restore transformation state
- `ctx.translate()` / `ctx.rotate()` - Apply rotation to tables

#### C. Click/Touch Handling

```javascript
const handleCanvasInteraction = (e) => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  // Get coordinates from event
  let clientX, clientY;
  if (e.clientX !== undefined && e.clientY !== undefined) {
    clientX = e.clientX;
    clientY = e.clientY;
  } else if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if (e.changedTouches && e.changedTouches.length > 0) {
    clientX = e.changedTouches[0].clientX;
    clientY = e.changedTouches[0].clientY;
  } else {
    return;
  }

  // Get canvas bounding rect and actual canvas size
  const rect = canvas.getBoundingClientRect();
  const canvasInternalWidth = canvas.width;
  const canvasInternalHeight = canvas.height;
  
  // Calculate scale factors (canvas might be scaled by CSS)
  const scaleX = rect.width > 0 ? canvasInternalWidth / rect.width : 1;
  const scaleY = rect.height > 0 ? canvasInternalHeight / rect.height : 1;
  
  // Get click position relative to canvas viewport
  const viewportX = clientX - rect.left;
  const viewportY = clientY - rect.top;
  
  // Convert to canvas internal coordinates
  const clickX = viewportX * scaleX;
  const clickY = viewportY * scaleY;
  
  // Find clicked table
  for (const tableLayout of layoutData.tables) {
    const tableX = (tableLayout.posXPercent / 100) * canvasInternalWidth;
    const tableY = (tableLayout.posYPercent / 100) * canvasInternalHeight;
    const tableW = tableLayout.widthPercent ? (tableLayout.widthPercent / 100) * canvasInternalWidth : 60;
    const tableH = tableLayout.heightPercent ? (tableLayout.heightPercent / 100) * canvasInternalHeight : 60;

    // Calculate center of table
    const centerX = tableX + tableW / 2;
    const centerY = tableY + tableH / 2;
    
    // Calculate distance from click to table center
    const dx = clickX - centerX;
    const dy = clickY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Check if click is within table radius
    const radius = Math.max(tableW, tableH) / 2;

    if (distance <= radius) {
      // Find matching table and call onSelect
      let table = tables.find(t => String(t.id) === String(tableLayout.tableId));
      if (table) {
        onSelect(table);
        return;
      }
    }
  }
};
```

**Click Detection Logic:**
1. Get click coordinates (mouse or touch)
2. Convert viewport coordinates to canvas coordinates
3. Calculate distance from click to each table center
4. If within table radius, trigger `onSelect` callback

#### D. Grid Fallback Function

```javascript
const drawGridFallback = (ctx, width, height, tables, selectedTables) => {
  const cols = 5;
  const spacing = 20;
  const tableSize = 60;

  tables.forEach((table, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = spacing + col * (tableSize + spacing);
    const y = spacing + row * (tableSize + spacing);

    const isSelected = selectedTables.some(t => String(t.id) === String(table.id));
    const status = (table.status || '').toLowerCase();
    const isReserved = status === 'reserved';

    // Determine colors
    let bgColor, borderColor, textColor;
    if (isSelected) {
      bgColor = '#c91a4d';
      borderColor = '#c91a4d';
      textColor = '#ffffff';
    } else if (isReserved) {
      bgColor = '#f59e0b';
      borderColor = '#d97706';
      textColor = '#ffffff';
    } else {
      bgColor = '#ffffff';
      borderColor = '#d1d5db';
      textColor = '#1f2937';
    }

    // Draw table
    ctx.beginPath();
    ctx.ellipse(x + tableSize / 2, y + tableSize / 2, tableSize / 2, tableSize / 2, 0, 0, 2 * Math.PI);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isSelected ? 4 : 2;
    ctx.stroke();

    // Draw table number
    ctx.fillStyle = textColor;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(table.name || table.number || '', x + tableSize / 2, y + tableSize / 2);
  });
};
```

**Purpose:** Draws tables in a grid layout when no floor layout data exists

---

### 3. Data Conversion Function

**Location:** `frontend/src/pages/ReservationPage.jsx`

```javascript
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
```

**Conversion Logic:**
1. **Border Points:** `{x, y}` → `{posXPercent, posYPercent}`
2. **Shapes:** Nested `position` object → flat structure with `posXPercent`, etc.
3. **Colors:** Hex strings → ARGB integers (for Canvas)
4. **Tables:** Match with `displayTables`, extract status, convert position

---

### 4. Usage in ReservationPage

```javascript
// Load floor layout
const layout = await getFloorLayoutByArea(areaId);
setFloorLayout(layout);

// Convert and render
const layoutData = convertFloorLayoutToMapData(floorLayout, displayTables);

<FloorMapView
  tables={displayTables}
  layoutData={layoutData}
  selectedTables={[]}
  onSelect={(table) => handleTableClick(table)}
  selectedArea={areas.find(a => (a.areaId || a.AreaID) === selectedAreaId) || null}
/>
```

---

## Data Flow Diagram

```
Database (SQL Server)
    ↓
[AreaFloorBorderPoint, AreaFloorShape, AreaTableLayout]
    ↓
Backend Service (floorLayout.service.js)
    ↓
SQL Queries → Transform to JavaScript objects
    ↓
Backend Controller (floorLayout.controller.js)
    ↓
Express Route (floorLayout.routes.js)
    ↓
GET /api/floor-layout/area/:areaId
    ↓
Frontend Service (floorLayout.service.js)
    ↓
API.get() → Transform response
    ↓
ReservationPage Component
    ↓
convertFloorLayoutToMapData() → Convert format
    ↓
FloorMapView Component
    ↓
Canvas Rendering (HTML5 Canvas API)
    ↓
Visual Floor Map Display
```

---

## Coordinate System

**All coordinates are percentages (0-100), not pixels!**

### Conversion Formula:
```javascript
// Percentage to Pixels
pixelX = (posXPercent / 100) * canvasWidth
pixelY = (posYPercent / 100) * canvasHeight

// Example:
// If posXPercent = 50, canvasWidth = 800
// pixelX = (50 / 100) * 800 = 400 (center of canvas)
```

### Why Percentages?
- **Responsive:** Works on any screen size
- **Scalable:** Canvas automatically scales
- **Database-friendly:** Stored as DECIMAL(5,2) in SQL

---

## Color System

### ARGB Integer Format
ARGB = Alpha, Red, Green, Blue (32-bit integer)

**Example:**
```javascript
// ARGB: 0xFF000000 = Black (Alpha=FF, R=00, G=00, B=00)
// ARGB: 0xFFFF0000 = Red (Alpha=FF, R=FF, G=00, B=00)

// Extract RGB from ARGB:
const r = (argb >> 16) & 0xFF;  // Red component
const g = (argb >> 8) & 0xFF;   // Green component
const b = argb & 0xFF;           // Blue component

// Convert to CSS rgba:
`rgba(${r}, ${g}, ${b}, 0.3)`
```

### Table Status Colors:
- **Available:** White (`#ffffff`)
- **Reserved:** Yellow/Orange (`#f59e0b`)
- **Selected:** Maroon gradient (`#c91a4d` to `#e91e63`)
- **Occupied:** Red (if implemented)

---

## Registration in Backend

**File:** `backend/index.js`

```javascript
import floorLayoutRoutes from "./routes/floorLayout.routes.js";

// Register routes
app.use("/api/floor-layout", floorLayoutRoutes);
```

This creates:
- `GET /api/floor-layout/area/:areaId`
- `GET /api/floor-layout/all`

---

## Complete Code Summary

### Backend Files:
1. **routes/floorLayout.routes.js** - Defines API endpoints
2. **controllers/floorLayout.controller.js** - Handles HTTP requests
3. **services/floorLayout.service.js** - Executes SQL queries

### Frontend Files:
1. **services/floorLayout.service.js** - API client functions
2. **component/reserve/FloorMapView.jsx** - Canvas rendering component
3. **pages/ReservationPage.jsx** - Usage example with data conversion

### Key Functions:
- `getFloorLayoutByArea(areaId)` - Backend: Query database
- `getFloorLayoutByArea(areaId)` - Frontend: Fetch from API
- `convertFloorLayoutToMapData()` - Convert data format
- `FloorMapView` - Render canvas map
- `handleCanvasInteraction()` - Handle clicks/touches
- `drawGridFallback()` - Fallback grid layout

---

## Important Notes

1. **Error Handling:** Each query is independent - if one fails, others continue
2. **Data Types:** All percentages are 0-100, not 0-1
3. **Rotation:** Tables can be rotated 0°, 90°, 180°, 270°
4. **Matching:** Tables matched by `tableId`, `tableNo`, or `tableName`
5. **Fallback:** Grid layout if no floor layout data exists
6. **Performance:** Uses ResizeObserver for efficient size tracking
7. **Touch Support:** Handles both mouse and touch events

---

## Testing Checklist

- [ ] Border points render correctly
- [ ] Shapes (walls, labels) display properly
- [ ] Tables appear at correct positions
- [ ] Table status colors work (available, reserved, selected)
- [ ] Table clicks trigger `onSelect` callback
- [ ] Rotation works for rotated tables
- [ ] Grid fallback works when no layout data
- [ ] Responsive on different screen sizes
- [ ] Touch events work on mobile/tablet

## Key Component: `FloorMapView.jsx`

**Location:** `frontend/src/component/reserve/FloorMapView.jsx`

This is the main component that renders the floor map using HTML5 Canvas.

### How It Works

1. **Canvas Rendering**: Uses HTML5 Canvas API to draw:
   - Grid background
   - Border points (area boundaries)
   - Floor shapes (walls, zones, labels)
   - Tables (circles/ellipses with status colors)

2. **Data Structure Required**:
   ```javascript
   {
     hasLayout: boolean,           // true if layout data exists
     borderPoints: [               // Array of border points
       {
         posXPercent: number,      // X position (0-100)
         posYPercent: number       // Y position (0-100)
       }
     ],
     shapes: [                     // Array of floor shapes
       {
         shapeType: string,         // 'LABEL', 'WALL', 'ZONE', etc.
         posXPercent: number,
         posYPercent: number,
         widthPercent: number,
         heightPercent: number,
         backColorArgb: number,     // Background color (ARGB integer)
         borderColorArgb: number,  // Border color (ARGB integer)
         displayText: string,       // Text to display (for labels)
         fontSize: number
       }
     ],
     tables: [                     // Array of table layouts
       {
         tableId: number,
         tableNo: string,
         tableName: string,
         posXPercent: number,
         posYPercent: number,
         widthPercent: number,
         heightPercent: number,
         rotationDeg: number,        // Rotation in degrees (0, 90, 180, 270)
         state: string             // 'available', 'reserved', etc.
       }
     ]
   }
   ```

3. **Table Data Structure**:
   ```javascript
   tables: [
     {
       id: number,
       number: string,
       name: string,
       status: string,             // 'available', 'reserved', 'occupied', etc.
       seats: number,
       capacity: number
     }
   ]
   ```

## Usage Example

```javascript
import FloorMapView from "../component/reserve/FloorMapView";

// In your component:
<FloorMapView
  tables={displayTables}                    // Array of table objects
  layoutData={layoutData}                   // Layout data (see structure above)
  selectedTables={[]}                       // Array of selected table IDs
  onSelect={(table) => handleTableClick(table)}  // Callback when table is clicked
  selectedArea={areaObject}                 // Current area object
/>
```

## Data Conversion

If your backend returns data in a different format, you need to convert it:

```javascript
function convertFloorLayoutToMapData(floorLayout, displayTables) {
  if (!floorLayout) return null;
  
  const hasLayout = (
    floorLayout.borderPoints?.length > 0 || 
    floorLayout.shapes?.length > 0 || 
    floorLayout.tables?.length > 0
  );
  
  return {
    hasLayout,
    // Convert border points
    borderPoints: floorLayout.borderPoints?.map(p => ({
      posXPercent: Number(p.x) || Number(p.posXPercent) || 0,
      posYPercent: Number(p.y) || Number(p.posYPercent) || 0
    })) || [],
    
    // Convert shapes
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
    
    // Convert tables
    tables: floorLayout.tables?.map(layoutTable => {
      const table = displayTables.find(
        t => t.id === layoutTable.tableId || 
             t.number === layoutTable.tableNo
      ) || {
        id: layoutTable.tableId,
        number: layoutTable.tableNo,
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
```

## Backend API Endpoint

The floor layout data comes from:
- **Endpoint:** `GET /api/floor-layout/area/:areaId`
- **Service:** `getFloorLayoutByArea(areaId)` in `frontend/src/services/floorLayout.service.js`

**Backend Service:** `backend/services/floorLayout.service.js`

Returns:
```javascript
{
  areaId: number,
  tables: [
    {
      tableId: number,
      tableNo: string,
      seats: number,
      position: {
        x: number,        // Percentage (0-100)
        y: number,        // Percentage (0-100)
        width: number,    // Percentage (0-100)
        height: number,   // Percentage (0-100)
        rotation: number  // Degrees
      }
    }
  ],
  shapes: [
    {
      shapeType: string,
      position: {
        x: number,
        y: number,
        width: number,
        height: number
      },
      style: {
        backgroundColor: number,  // ARGB integer
        borderColor: number,       // ARGB integer
        text: string,
        fontSize: number
      }
    }
  ],
  borderPoints: [
    {
      x: number,          // Percentage (0-100)
      y: number           // Percentage (0-100)
    }
  ]
}
```

## Database Tables

The floor layout data comes from these SQL tables:

1. **AreaFloorBorderPoint** - Border points defining area boundaries
   - `PosXPercent`, `PosYPercent` (0-100)
   - `SequenceNo` (order of points)

2. **AreaFloorShape** - Floor shapes (walls, zones, labels)
   - `PosXPercent`, `PosYPercent`, `WidthPercent`, `HeightPercent`
   - `BackColorArgb`, `BorderColorArgb`
   - `DisplayText`, `FontSize`
   - `ShapeType` ('WALL', 'ZONE', 'LABEL', etc.)

3. **AreaTableLayout** - Table positions on the floor
   - `TableID`, `PosXPercent`, `PosYPercent`
   - `WidthPercent`, `HeightPercent`
   - `RotationDeg` (0, 90, 180, 270)

## Key Points

1. **Coordinates are in percentages (0-100)**, not pixels
2. **Canvas automatically scales** to container size
3. **Tables are drawn as ellipses** (circles if width = height)
4. **Border points are connected** to form area boundaries
5. **Shapes can be rectangles or labels** (text)
6. **Table status colors**:
   - Available: White
   - Reserved: Yellow/Orange
   - Selected: Maroon/Red gradient

## Troubleshooting

### Map not showing?
1. Check if `layoutData.hasLayout` is `true`
2. Verify `borderPoints`, `shapes`, or `tables` arrays have data
3. Check browser console for errors
4. Ensure coordinates are 0-100 (percentages)

### Tables not visible?
1. Check if `tables` array matches `layoutData.tables` by `tableId`
2. Verify `posXPercent` and `posYPercent` are valid (0-100)
3. Check if `widthPercent` and `heightPercent` are > 0

### Border lines not showing?
1. Verify `borderPoints` array has at least 2 points
2. Check that `posXPercent` and `posYPercent` are valid numbers
3. Ensure canvas is rendering (check container size)

## Example: Integration in ReservationPage

```javascript
import FloorMapView from "../component/reserve/FloorMapView";
import { getFloorLayoutByArea } from "../services/floorLayout.service";

// Load layout data
const layout = await getFloorLayoutByArea(areaId);

// Convert to FloorMapView format
const layoutData = convertFloorLayoutToMapData(layout, displayTables);

// Render
<FloorMapView
  tables={displayTables}
  layoutData={layoutData}
  selectedTables={[]}
  onSelect={handleTableClick}
  selectedArea={selectedArea}
/>
```

## Notes

- The Canvas-based approach is more performant for complex layouts
- Supports touch and mouse interactions
- Automatically handles table selection and status colors
- Falls back to grid layout if no layout data exists
- Responsive and works on tablets/phones

