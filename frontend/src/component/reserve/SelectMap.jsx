// ─────────────────────────────────────────────────────────────
// File: src/component/reserve/SelectMap.jsx
// Floating-editor UI (speed-dial). Map-only editing for drag / rotate / resize.
// No quick-add, no properties sidebar.
// Exports: default SelectMap, named ModernLegendBar
// ─────────────────────────────────────────────────────────────
import { memo, useEffect, useRef, useState } from "react";

/* ===== palette ===== */
const COL = {
  table:       "#9ca3af",
  tableLite:   "#e5e7eb",
  chair:       "#6b7280",
  chairActive: "#374151",
  text:        "#4b5563",
};

/* ===== geometry ===== */
const SEAT_R = 6.2;
const EDGE   = SEAT_R + 2.0;
const TAU    = Math.PI * 2;
const deg    = (r) => (r * 180) / Math.PI;

/* ===== helpers ===== */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const snapTo = (v, step) => Math.round(v / step) * step;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/* ===== auto type rule ===== */
function autoTypeForSeats(seats) {
  if (!Number.isFinite(seats) || seats <= 0) return "square";
  if (seats % 2 === 1) return "round";
  return ((seats / 2) % 2 === 1) ? "square" : "rect";
}

/* ===== chair ===== */
function LeafChair({ x, y, angle = 0, active = false }) {
  const stroke = active ? COL.chairActive : COL.chair;
  const seatW = SEAT_R * 3.2, seatH = SEAT_R * 1.5, rx = seatH * 0.5;
  const yBot = y + seatH / 2;
  const backArcY = (y - seatH / 2) - 3.4;
  const backArcRx = seatW * 0.46, backArcRy = seatH * 0.55;

  return (
    <g transform={`rotate(${angle} ${x} ${y})`}>
      <path d={`M ${x - backArcRx} ${backArcY} A ${backArcRx} ${backArcRy} 0 0 1 ${x + backArcRx} ${backArcY}`}
            fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <rect x={x - seatW/2} y={y - seatH/2} width={seatW} height={seatH} rx={rx}
            fill={active ? "rgba(55,65,81,0.06)" : "transparent"}
            stroke={stroke} strokeWidth="1.55" />
      <line x1={x - seatW*0.32} y1={yBot - 0.8} x2={x - seatW*0.336} y2={yBot + 5.5}
            stroke={stroke} strokeWidth="1.25" strokeLinecap="round" />
      <line x1={x + seatW*0.32} y1={yBot - 0.8} x2={x + seatW*0.336} y2={yBot + 5.5}
            stroke={stroke} strokeWidth="1.25" strokeLinecap="round" />
      <line x1={x - seatW*0.21} y1={yBot + 5.5} x2={x + seatW*0.21} y2={yBot + 5.5}
            stroke={stroke} strokeWidth="1.1" strokeLinecap="round" />
    </g>
  );
}

/* ===== layouts ===== */
function circleLayout(cx, cy, r, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU - Math.PI / 2;
    out.push({ x: cx + (r + EDGE) * Math.cos(t), y: cy + (r + EDGE) * Math.sin(t), angle: deg(t) + 90 });
  }
  return out;
}
function splitRectSeats(N) {
  const s = { top: 0, right: 0, bottom: 0, left: 0 };
  if (N <= 4) { ["top","right","bottom","left"].slice(0, N).forEach(k => s[k]++); return s; }
  s.left = 1; s.right = 1;
  const rem = N - 2; s.top = Math.ceil(rem / 2); s.bottom = Math.floor(rem / 2);
  return s;
}
function rectLayoutTight(x0, y0, x1, y1, sides) {
  const out = []; const pad = 12;
  const add = (sx, sy, ex, ey, n, angle) => {
    if (!n) return;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      out.push({ x: sx + (ex - sx) * t, y: sy + (ey - sy) * t, angle });
    }
  };
  const topY = y0 - EDGE, rightX = x1 + EDGE, bottomY = y1 + EDGE, leftX = x0 - EDGE;
  add(x0 + pad, topY,     x1 - pad, topY,     sides.top,    0);
  add(rightX,   y0 + pad, rightX,   y1 - pad, sides.right, 90);
  add(x1 - pad, bottomY,  x0 + pad, bottomY,  sides.bottom, 180);
  add(leftX,    y1 - pad, leftX,    y0 + pad, sides.left,  270);
  return out;
}

/* small screw dots */
function ScrewDots({ points = [] }) {
  return <g fill={COL.table} opacity="0.65">{points.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="1.6" />)}</g>;
}

/* ===== table token ===== */
const TableToken = memo(function TableToken({
  id, type, label = "", seats = 4, reserved = false, selected = false, onClick,
  size = "clamp(92px,8.5vmin,160px)",
}) {
  const resolved = type || autoTypeForSeats(seats);
  const cx = 80, cy = 80;
  let chairs = []; let tableEl = null;

  const ring =
    selected ? "ring-2 ring-gray-700"
    : reserved ? "ring-1 ring-gray-300"
    : "ring-1 ring-gray-200";

  if (resolved === "square") {
    const s = 94; const x0 = cx - s/2, y0 = cy - s/2, x1 = cx + s/2, y1 = cy + s/2; const inset = 5.5;
    tableEl = (
      <>
        <rect x={x0} y={y0} width={s} height={s} rx="14" fill="none" stroke={COL.table} strokeWidth="1.9" />
        <rect x={x0 + inset} y={y0 + inset} width={s - inset*2} height={s - inset*2} rx="10" fill="none" stroke={COL.tableLite} strokeWidth="1.2" />
        <ScrewDots points={[[x0+12,y0+12],[x1-12,y0+12],[x1-12,y1-12],[x0+12,y1-12]]}/>
      </>
    );
    chairs = rectLayoutTight(x0, y0, x1, y1, splitRectSeats(seats));
  } else if (resolved === "rect") {
    const w = 126, h = 74; const x0 = cx - w/2, y0 = cy - h/2, x1 = cx + w/2, y1 = cy + h/2; const inset = 6;
    tableEl = (
      <>
        <rect x={x0} y={y0} width={w} height={h} rx="14" fill="none" stroke={COL.table} strokeWidth="1.9" />
        <rect x={x0 + inset} y={y0 + inset} width={w - inset*2} height={h - inset*2} rx="10" fill="none" stroke={COL.tableLite} strokeWidth="1.2" />
        <ScrewDots points={[[x0+12,y0+12],[x1-12,y0+12],[x1-12,y1-12],[x0+12,y1-12]]}/>
      </>
    );
    chairs = rectLayoutTight(x0, y0, x1, y1, splitRectSeats(seats));
  } else {
    const r = 46;
    tableEl = (
      <>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={COL.table} strokeWidth="1.9" />
        <circle cx={cx} cy={cy} r={r - 4} fill="none" stroke={COL.tableLite} strokeWidth="1.2" />
        <ScrewDots points={[[cx,cy-(r-10)],[cx+(r-10),cy],[cx,cy+(r-10)],[cx-(r-10),cy]]}/>
      </>
    );
    chairs = circleLayout(cx, cy, r, seats);
  }

  return (
    <button
      type="button"
      disabled={reserved}
      onClick={() => !reserved && onClick?.(id)}
      aria-pressed={selected}
      className={"relative select-none bg-transparent p-0 " + ring + " " + (reserved ? "cursor-not-allowed opacity-95" : "hover:scale-[1.01] active:scale-[0.99]") + " rounded-2xl"}
      title={`${label || id}${reserved ? " (reserved)" : ""}`}
      style={{ width: size, height: size }}
    >
      <span className="pointer-events-none absolute right-2.5 top-2.5 z-10 rounded-full bg-black/55 px-1.5 py-[2px] text-[10px] font-medium text-white">
        {seats}
      </span>
      <svg viewBox="0 0 160 160" className="block h-full w-full">
        {chairs.map((c, i) => <LeafChair key={i} x={c.x} y={c.y} angle={c.angle} active={selected} />)}
        {tableEl}
        <text x="80" y="86" textAnchor="middle" fontSize="12" fontFamily="ui-sans-serif,system-ui" fill={COL.text}>
          {label || id}
        </text>
      </svg>
    </button>
  );
});

/* ===== viewport with aspect-ratio and grid overlay ===== */
function MapViewport({ src, children, showGrid = false, gridStepPct = 5 }) {
  const [ratio, setRatio] = useState(16 / 9);
  const gridBg = showGrid
    ? {
        backgroundImage:
          `linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)`,
        backgroundSize: `${gridStepPct}% ${gridStepPct}%`,
      }
    : {};
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm"
         style={{ aspectRatio: ratio }}>
      <img
        src={src}
        alt="Floor plan"
        className="absolute inset-0 h-full w-full object-fill"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) {
            setRatio(img.naturalWidth / img.naturalHeight);
          }
        }}
      />
      <div className="absolute inset-0" style={gridBg}>{children}</div>
    </div>
  );
}

/* ===== Floating Action Button + speed-dial ===== */
function FloatingDial({ editing, onToggleEdit, onSave, onRevert, onExport, onDelete, canDelete, snap, onToggleSnap }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!editing) setOpen(false); }, [editing]);

  const Btn = ({ title, onClick, children, disabled }) => (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={"flex h-11 w-11 items-center justify-center rounded-full shadow-md transition " +
                 (disabled ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                           : "bg-white text-gray-700 hover:bg-gray-50")}
    >
      {children}
    </button>
  );

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {editing && open && (
        <div className="mb-1 flex flex-col items-end gap-2">
          <Btn title={snap ? "Snap: On" : "Snap: Off"} onClick={onToggleSnap}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={snap ? "currentColor" : "none"} stroke="currentColor"><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
          </Btn>
          <Btn title="Save" onClick={onSave}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21V8l-4-4H6a2 2 0 0 0-2 2v15h16Z"/><path d="M7 21v-8h10v8"/><path d="M7 3v5h8"/></svg>
          </Btn>
          <Btn title="Revert" onClick={onRevert}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 14l-4-4 4-4"/><path d="M5 10h8a6 6 0 1 1 0 12h-1"/></svg>
          </Btn>
          <Btn title="Export JSON" onClick={onExport}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 20h16"/><path d="M12 14v-9"/><path d="M7 9l5-5 5 5"/></svg>
          </Btn>
          <Btn title="Delete selected" onClick={onDelete} disabled={!canDelete}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </Btn>
        </div>
      )}
      <button
        onClick={() => editing ? setOpen(!open) : onToggleEdit()}
        title={editing ? (open ? "Close actions" : "More actions") : "Edit layout"}
        className={"flex h-14 w-14 items-center justify-center rounded-full shadow-lg text-white transition " +
                   (editing ? "bg-gray-800 hover:bg-gray-900" : "bg-indigo-600 hover:bg-indigo-700")}
      >
        {editing ? (
          open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
          )
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>
        )}
      </button>
      {editing && (
        <button
          onClick={onToggleEdit}
          className="text-[11px] text-gray-600 underline decoration-dotted"
          title="Exit edit mode"
        >
          Exit edit
        </button>
      )}
    </div>
  );
}

/* ===== Modern Legend (named export) ===== */
export function ModernLegendBar() {
  return (
    <div className="mx-auto flex max-w-md items-center justify-center gap-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-[12px] shadow-sm">
      <span className="inline-flex items-center gap-2">
        <i className="inline-block h-2.5 w-4 rounded border border-gray-300 bg-transparent" />
        <span className="text-gray-700">Available</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <i className="inline-block h-2.5 w-4 rounded border-2 border-gray-800 bg-transparent" />
        <span className="text-gray-700">Selected</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <i className="inline-block h-2.5 w-4 rounded border border-gray-300 bg-gray-100" />
        <span className="text-gray-700">Reserved</span>
      </span>
    </div>
  );
}

/* ===== Main component (map-only editor focus) ===== */
export default function SelectMap({
  items = [],
  selected,
  onSelect,
  mapImg,
  startMode = "map",
  editable = false,
  onItemsChange,
  tokenSizeMap  = "clamp(92px,8.5vmin,160px)",
}) {
  const [mode, setMode] = useState(startMode);
  const [editing, setEditing] = useState(false);
  const [snap, setSnap] = useState(true);
  const SNAP_STEP = 2.5;

  const normalized = (items.length
    ? items.map((it, i) => ({
        ...it,
        id: String(it.id ?? `t${i+1}`),
        type: it.type || autoTypeForSeats(it.seats ?? (i + 1)),
        scale: isNum(it.scale) ? Number(it.scale) : 1,
        rot: isNum(it.rot) ? Number(it.rot) : 0,
      }))
    : []
  );

  const mapPossible = !!mapImg && normalized.every(x => isNum(x.x) && isNum(x.y));
  const effectiveMode = (mode === "map" && mapPossible) ? "map" : "grid";

  const [workItems, setWorkItems] = useState(normalized);
  useEffect(() => { if (!editing) setWorkItems(normalized); }, [normalized, editing]);

  const selectedId = selected ? String(selected) : null;
  const selIdx = selectedId ? workItems.findIndex(it => String(it.id) === selectedId) : -1;
  const selItem = selIdx >= 0 ? workItems[selIdx] : null;

  const save = () => {
    onItemsChange?.(workItems);
    try { localStorage.setItem("floorPlanDemoItems", JSON.stringify(workItems)); } catch {}
  };
  const revert = () => setWorkItems(normalized);
  const doExport = async () => {
    const txt = JSON.stringify(workItems, null, 2);
    try { await navigator.clipboard.writeText(txt); alert("Copied JSON to clipboard!"); }
    catch {
      const blob = new Blob([txt], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "floor-plan.json";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }
  };
  const delSelected = () => {
    if (!selectedId) return;
    const ok = window.confirm(`Delete table ${selectedId}?`);
    if (!ok) return;
    setWorkItems(prev => prev.filter(it => String(it.id) !== selectedId));
    onSelect?.(null);
  };

  const containerRef = useRef(null);
  const dragRef = useRef({ id: null, type: null, centerPx: null });

  const startDrag = (e, id) => {
    if (!editing) return;
    e.preventDefault();
    dragRef.current = { id, type: "move" };
    onSelect?.(id);
  };
  const startRotate = (e, id, centerPx) => {
    if (!editing) return;
    e.preventDefault();
    dragRef.current = { id, type: "rotate", centerPx };
    onSelect?.(id);
  };

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d.id) return;
      if (d.type === "move") {
        const rect = containerRef.current.getBoundingClientRect();
        let xPct = ((e.clientX - rect.left) / rect.width) * 100;
        let yPct = ((e.clientY - rect.top) / rect.height) * 100;
        if (snap) { xPct = snapTo(xPct, SNAP_STEP); yPct = snapTo(yPct, SNAP_STEP); }
        xPct = clamp(xPct, 0, 100); yPct = clamp(yPct, 0, 100);
        setWorkItems(prev => prev.map(it => it.id === d.id ? { ...it, x: xPct, y: yPct } : it));
      } else if (d.type === "rotate") {
        const { centerPx } = d;
        const dx = e.clientX - centerPx.x;
        const dy = e.clientY - centerPx.y;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        const rot = snap ? snapTo(angle, 5) : angle;
        setWorkItems(prev => prev.map(it => it.id === d.id ? { ...it, rot } : it));
      }
    };
    const onUp = () => { dragRef.current = { id: null, type: null, centerPx: null }; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [snap]);

  useEffect(() => {
    if (!editing || !selectedId) return;
    const onKey = (e) => {
      const step = e.shiftKey ? 2 : 0.5;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","q","Q","e","E"].includes(e.key)) e.preventDefault();
      setWorkItems(prev => prev.map(it => {
        if (String(it.id) !== selectedId) return it;
        if (e.key === "ArrowUp")   return { ...it, y: clamp(snap ? snapTo(it.y - step, SNAP_STEP) : it.y - step, 0, 100) };
        if (e.key === "ArrowDown") return { ...it, y: clamp(snap ? snapTo(it.y + step, SNAP_STEP) : it.y + step, 0, 100) };
        if (e.key === "ArrowLeft") return { ...it, x: clamp(snap ? snapTo(it.x - step, SNAP_STEP) : it.x - step, 0, 100) };
        if (e.key === "ArrowRight")return { ...it, x: clamp(snap ? snapTo(it.x + step, SNAP_STEP) : it.x + step, 0, 100) };
        if (e.key === "q" || e.key === "Q") return { ...it, rot: (snap ? snapTo(it.rot - 2, 5) : it.rot - 2) };
        if (e.key === "e" || e.key === "E") return { ...it, rot: (snap ? snapTo(it.rot + 2, 5) : it.rot + 2) };
        return it;
      }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, selectedId, snap]);

  const setSelectedScale = (nv) => {
    if (!selItem) return;
    setWorkItems(prev => prev.map((it, i) => i === selIdx ? { ...it, scale: clamp(+nv, 0.6, 1.6) } : it));
  };
  const setSelectedRot = (nv) => {
    if (!selItem) return;
    setWorkItems(prev => prev.map((it, i) => i === selIdx ? { ...it, rot: +nv } : it));
  };

  // Small Grid/Map toggle pill — now used in BOTH modes
  const TogglePill = () => (
    <div className="absolute left-3 top-3 z-30">
      <div className="inline-flex items-center rounded-full bg-white/90 backdrop-blur border border-gray-200 shadow-sm">
        <button
          onClick={() => setMode("grid")}
          className={"px-3 py-1.5 text-xs rounded-l-full " + (effectiveMode==="grid"?"bg-gray-900 text-white":"text-gray-700 hover:bg-gray-100")}
        >
          Grid
        </button>
        <button
          onClick={() => mapPossible && setMode("map")}
          title={mapPossible ? "Map" : "Add x,y and mapImg"}
          className={"px-3 py-1.5 text-xs rounded-r-full " + (effectiveMode==="map"?"bg-gray-900 text-white":(mapPossible?"text-gray-700 hover:bg-gray-100":"text-gray-400 cursor-not-allowed"))}
        >
          Map
        </button>
      </div>
    </div>
  );

  const SelectionOverlay = () => {
    if (!editing || !selItem) return null;
    const { x, y, rot = 0, scale = 1 } = selItem;
    return (
      <div
        className="absolute pointer-events-none"
        style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})` }}
      >
        <div className="pointer-events-none h-[calc(var(--tsz,120px))] w-[calc(var(--tsz,120px))] -translate-x-1/2 -translate-y-1/2"></div>
        <div
          className="pointer-events-auto absolute left-1/2 -translate-x-1/2 -top-8 h-6 w-6 rounded-full bg-white shadow border border-gray-300 flex items-center justify-center cursor-rotate"
          onPointerDown={(e) => {
            const rect = containerRef.current.getBoundingClientRect();
            const cx = rect.left + (x/100) * rect.width;
            const cy = rect.top + (y/100) * rect.height;
            startRotate(e, selItem.id, { x: cx, y: cy });
          }}
          title="Rotate (drag)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/></svg>
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full">
      {effectiveMode === "map" ? (
        <div className="relative">
          <MapViewport src={mapImg} showGrid={editing && snap} gridStepPct={SNAP_STEP}>
            {/* Toggle pill (top-left) */}
            <TogglePill />

            {/* overlay tokens */}
            <div ref={containerRef} className={"relative h-full w-full " + (editing ? "cursor-grab" : "")}>
              {(editing ? workItems : normalized).map(({ id, type, label, seats, x, y, rot = 0, scale = 1, reserved }) => (
                <div
                  key={id}
                  className={"absolute " + (editing ? "touch-none select-none" : "")}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`,
                  }}
                  onPointerDown={(e) => editing && startDrag(e, id)}
                  onClick={() => !editing && onSelect?.(id)}
                >
                  <TableToken
                    id={id}
                    type={type}
                    label={label}
                    seats={seats}
                    reserved={!!reserved}
                    selected={String(selected) === String(id)}
                    onClick={onSelect}
                    size={tokenSizeMap}
                  />
                </div>
              ))}

              {/* selection ring & rotate handle */}
              <SelectionOverlay />
            </div>

            {/* floating size/rotate when selected & editing */}
            {editing && selItem && (
              <div className="pointer-events-auto fixed left-1/2 bottom-5 z-40 -translate-x-1/2">
                <div className="flex items-center gap-4 rounded-full bg-white/95 backdrop-blur border border-gray-200 shadow-lg px-4 py-3">
                  <span className="text-xs font-medium text-gray-700">Size</span>
                  <input
                    type="range" min="0.6" max="1.6" step="0.05"
                    value={selItem.scale ?? 1}
                    onChange={(e) => setSelectedScale(parseFloat(e.target.value))}
                    className="h-2 w-36 accent-gray-800"
                  />
                  <span className="text-xs w-10 text-right text-gray-600">{Math.round((selItem.scale??1)*100)}%</span>

                  <span className="mx-2 h-5 w-px bg-gray-200" />

                  <span className="text-xs font-medium text-gray-700">Rotate</span>
                  <input
                    type="range" min="-180" max="180" step="1"
                    value={Math.round(selItem.rot ?? 0)}
                    onChange={(e) => setSelectedRot(parseFloat(e.target.value))}
                    className="h-2 w-36 accent-gray-800"
                  />
                  <span className="text-xs w-10 text-right text-gray-600">{Math.round(selItem.rot ?? 0)}°</span>
                </div>
              </div>
            )}

            {/* floating dial (edit/save/etc) */}
            {editable && (
              <FloatingDial
                editing={editing}
                onToggleEdit={() => setEditing(!editing)}
                onSave={save}
                onRevert={revert}
                onExport={doExport}
                onDelete={delSelected}
                canDelete={!!selItem}
                snap={snap}
                onToggleSnap={() => setSnap(!snap)}
              />
            )}
          </MapViewport>
        </div>
      ) : (
        // Grid fallback — now with the SAME toggle pill so you can switch back to Map
        <div className="relative rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          <TogglePill />
          <div className="mt-10 text-gray-600">
            Map editing requires items with <code>x</code>, <code>y</code> (percent) and a floor image. Provide those to enable Map mode.
          </div>
        </div>
      )}
    </div>
  );
}
