import { useRef } from "react";
import { Rnd } from "react-rnd";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import {
  Circle,
  Square,
  RectangleHorizontal,
  Trash2,
  RotateCcw,
  RotateCw,
  Save,
  Download,
  Upload,
  Grid3X3,
  Move,
  LayoutGrid,
} from "lucide-react";

/* ----------------------- Store (Zustand + persist) ----------------------- */
const usePlanner = create(
  persist(
    (set, get) => ({
      nodes: [],
      selectedId: null,
      gridSize: 32,
      // NOTE: keep the given id if provided, otherwise make one
      addNode: (node) =>
        set((s) => ({
          nodes: [...s.nodes, { id: node.id ?? nanoid(6), ...node }],
        })),
      addMany: (arr) =>
        set((s) => ({
          nodes: [
            ...s.nodes,
            ...arr.map((n) => ({ id: n.id ?? nanoid(6), ...n })),
          ],
        })),
      updateNode: (id, patch) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        })),
      removeNode: (id) =>
        set((s) => ({
          nodes: s.nodes.filter((n) => n.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),
      clearPlan: () => set({ nodes: [], selectedId: null }),
      select: (id) => set({ selectedId: id }),
      setGrid: (g) => set({ gridSize: g }),
      importJson: (payload) =>
        set({
          nodes: Array.isArray(payload?.nodes) ? payload.nodes : [],
          selectedId: null,
        }),
    }),
    { name: "floor_plan_v1" }
  )
);

/* ------------------------- Visual helpers / styles ------------------------ */
const canvasGridBg =
  "bg-white [background-image:linear-gradient(to_right,rgba(0,0,0,.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,.06)_1px,transparent_1px)]";
const shadow =
  "shadow-[0_1px_1px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)]";

/* ------------------------------ Seat hints ------------------------------- */
function SeatDots({ type, w, h }) {
  const dot =
    "absolute h-2.5 w-2.5 rounded-full bg-gray-700/70 ring-2 ring-white/80";
  if (type === "round2") {
    return (
      <>
        <div className={dot} style={{ left: -6, top: h / 2 - 5 }} />
        <div className={dot} style={{ right: -6, top: h / 2 - 5 }} />
      </>
    );
  }
  if (type === "square4") {
    return (
      <>
        <div className={dot} style={{ left: w / 2 - 5, top: -6 }} />
        <div className={dot} style={{ left: w / 2 - 5, bottom: -6 }} />
        <div className={dot} style={{ left: -6, top: h / 2 - 5 }} />
        <div className={dot} style={{ right: -6, top: h / 2 - 5 }} />
      </>
    );
  }
  if (type === "long6") {
    return (
      <>
        {[1, 2, 3].map((i) => (
          <div key={`t${i}`} className={dot} style={{ left: (w / 4) * i - 5, top: -6 }} />
        ))}
        {[1, 2, 3].map((i) => (
          <div key={`b${i}`} className={dot} style={{ left: (w / 4) * i - 5, bottom: -6 }} />
        ))}
      </>
    );
  }
  return null;
}

/* -------------------------------- TableNode ------------------------------- */
function TableNode({ node, scale }) {
  const { id, type, x, y, w, h, rot = 0, label = "" } = node;
  const { updateNode, removeNode, select, selectedId, gridSize } = usePlanner();
  const selected = selectedId === id;
  const border = selected ? "ring-2 ring-purple-500/70" : "ring-1 ring-gray-200/80";

  const baseRound =
    "grid place-items-center bg-gradient-to-b from-white to-gray-50 " + border;
  const baseRect =
    "grid place-items-center rounded-xl bg-gradient-to-b from-white to-gray-50 " + border;

  const body =
    type === "round2" ? (
      <div className={`${baseRound} rounded-full ${shadow}`} />
    ) : (
      <div className={`${baseRect} ${shadow}`} />
    );

  return (
    <Rnd
      bounds="parent"
      size={{ width: w, height: h }}
      position={{ x, y }}
      dragGrid={[gridSize, gridSize]}
      resizeGrid={[gridSize, gridSize]}
      scale={scale}                // ✅ critical for zoom-aware dragging/resizing
      onDragStart={() => select(id)}
      onResizeStart={() => select(id)}
      onDragStop={(_, data) => updateNode(id, { x: data.x, y: data.y })}
      onResizeStop={(_, __, ref, ___, pos) =>
        updateNode(id, { w: ref.offsetWidth, h: ref.offsetHeight, ...pos })
      }
      enableResizing={{
        top: true, right: true, bottom: true, left: true,
        topRight: true, bottomRight: true, bottomLeft: true, topLeft: true,
      }}
      style={{
        transform: `rotate(${rot}deg)`,
        transformOrigin: "center",
      }}
      className="select-none"
    >
      <div
        className="relative h-full w-full"
        onMouseDown={(e) => {
          e.stopPropagation();
          select(id);
        }}
      >
        {body}
        <SeatDots type={type} w={w} h={h} />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded px-2 py-0.5 text-sm font-medium text-gray-700">
            {label || id}
          </div>
        </div>

        {selected && (
          <div className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/95 px-2 py-1 text-gray-700 ring-1 ring-gray-200 backdrop-blur">
            <div className="flex items-center gap-1.5">
              <button
                className="rounded p-1 hover:bg-gray-100"
                title="Rotate -15°"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => updateNode(id, { rot: (rot - 15) % 360 })}
              >
                <RotateCcw size={16} />
              </button>
              <button
                className="rounded p-1 hover:bg-gray-100"
                title="Rotate +15°"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => updateNode(id, { rot: (rot + 15) % 360 })}
              >
                <RotateCw size={16} />
              </button>
              <button
                className="rounded p-1 text-red-600 hover:bg-red-50"
                title="Delete"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => removeNode(id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </Rnd>
  );
}

/* --------------------------------- Sidebar -------------------------------- */
function Sidebar() {
  const { addNode, addMany, nodes, select, clearPlan, setGrid, gridSize } =
    usePlanner();

  const addPreset = (preset) => {
    const id = nanoid(6);
    const base = { id, x: 48, y: 48, rot: 0, label: "" };
    addNode({ ...base, ...preset });
    select(id);
  };

  const addSampleLayout = () => {
    const items = [];
    let x = 80, y = 80;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        items.push({
          id: nanoid(6),
          type: "square4",
          x: x + c * 180,
          y: y + r * 180,
          w: 110,
          h: 110,
          label: `T${r * 3 + c + 1}`,
        });
      }
    }
    items.push({ id: nanoid(6), type: "round2", x: 700, y: 100, w: 88, h: 88, label: "C1" });
    items.push({ id: nanoid(6), type: "long6",  x: 700, y: 260, w: 180, h: 100, label: "B1" });
    addMany(items);
  };

  return (
    <aside className="h-full w-80 shrink-0 border-r bg-white/95 p-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Floor palette</h2>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-2 text-xs font-medium text-gray-500">Tables</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => addPreset({ type: "round2", w: 88, h: 88 })}
              className="flex items-center gap-2 rounded-lg border p-2 hover:bg-gray-50"
              title="2-seat round"
            >
              <Circle size={18} />
              <span className="text-sm">Round (2)</span>
            </button>
            <button
              onClick={() => addPreset({ type: "square4", w: 110, h: 110 })}
              className="flex items-center gap-2 rounded-lg border p-2 hover:bg-gray-50"
              title="4-seat square"
            >
              <Square size={18} />
              <span className="text-sm">Square (4)</span>
            </button>
            <button
              onClick={() => addPreset({ type: "long6", w: 180, h: 100 })}
              className="col-span-2 flex items-center gap-2 rounded-lg border p-2 hover:bg-gray-50"
              title="6-seat long"
            >
              <RectangleHorizontal size={18} />
              <span className="text-sm">Long (6)</span>
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 mt-4 text-xs font-medium text-gray-500">
            Canvas grid
          </div>
          <div className="flex items-center gap-2">
            <Grid3X3 size={16} />
            <select
              className="rounded border px-2 py-1 text-sm"
              value={gridSize}
              onChange={(e) => setGrid(parseInt(e.target.value || "32", 10))}
            >
              {[8, 16, 24, 32, 40, 48].map((g) => (
                <option key={g} value={g}>
                  {g}px
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-gray-500">Quick demo</div>
          <button
            onClick={addSampleLayout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
          >
            <LayoutGrid size={16} />
            Add sample layout
          </button>
        </div>

        <div className="pt-3">
          <button
            onClick={clearPlan}
            className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Clear floor
          </button>
        </div>
      </div>
    </aside>
  );
}

/* --------------------------------- Toolbar -------------------------------- */
function Toolbar() {
  const fileRef = useRef(null);
  const { nodes, importJson } = usePlanner();

  const download = () => {
    const data = { nodes };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "floor_plan.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result || "{}"));
        importJson(obj);
      } catch {
        alert("Invalid JSON");
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  };

  return (
    <div className={`pointer-events-auto absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-white/95 px-2 py-1 text-gray-700 ring-1 ring-gray-200 backdrop-blur ${shadow}`}>
      <div className="flex items-center gap-1.5">
        <div className="mr-1 hidden items-center gap-1 rounded-full bg-gray-50 px-2 py-1 text-xs text-gray-500 sm:flex">
          <Move size={14} />
          Drag, resize, rotate
        </div>
        <button className="rounded p-1 hover:bg-gray-100" title="Export JSON" onClick={download}>
          <Download size={16} />
        </button>
        <button className="rounded p-1 hover:bg-gray-100" title="Import JSON" onClick={() => fileRef.current?.click()}>
          <Upload size={16} />
        </button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={onFile} />
        <div className="mx-1 h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
          <Save size={14} />
          Autosaved
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Page ---------------------------------- */
export default function FloorPlanner() {
  const { nodes, select, gridSize } = usePlanner();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="relative flex-1">
        <Toolbar />
        <div className="absolute inset-0">
          <TransformWrapper minScale={0.5} maxScale={3} wheel={{ step: 0.1 }} doubleClick={{ disabled: true }}>
            {({ state: { scale } }) => (
              <TransformComponent wrapperClass="h-full w-full" contentClass="h-full w-full">
                <div
                  className={`${canvasGridBg} h-full w-full`}
                  style={{ backgroundSize: `${gridSize}px ${gridSize}px` }}
                  onMouseDown={() => select(null)}
                >
                  <div className="relative h-[2000px] w-[2000px]">
                    {nodes.map((n) => (
                      <TableNode key={n.id} node={n} scale={scale} />
                    ))}
                  </div>
                </div>
              </TransformComponent>
            )}
          </TransformWrapper>
        </div>
      </div>
    </div>
  );
}
