import { useEffect, useMemo, useState } from "react";
import floorImg from "../assets/floor/restaurant-map.png";
import SelectMapBlueprintLeaf from "../component/reserve/SelectMap";

export default function FloorOverlayDemo() {
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState(() => {
    // try restore
    try {
      const txt = localStorage.getItem("floorPlanDemoItems");
      if (txt) return JSON.parse(txt);
    } catch {}
    // default demo
    return [
      { id: "T1", label: "T1", type: "rect",   seats: 6, x: 22,  y: 32,  rot: 90 },
      { id: "T2", label: "T2", type: "round",  seats: 5, x: 48,  y: 38 },
      { id: "T3", label: "T3", type: "square", seats: 4, x: 72,  y: 31 },
      { id: "T4", label: "T4", type: "rect",   seats: 8, x: 35,  y: 64 },
      { id: "T5", label: "T5", type: "round",  seats: 6, x: 64,  y: 62 },
      { id: "T6", label: "T6", type: "rect",   seats: 6, x: 86,  y: 49, rot: 90, reserved: true },
    ];
  });

  // optional: show quick JSON preview below the map for manager
  const json = useMemo(() => JSON.stringify(items, null, 2), [items]);

  useEffect(() => {
    // keep selected valid after deletes
    if (selected && !items.find(it => String(it.id) === String(selected))) {
      setSelected(null);
    }
  }, [items, selected]);

  return (
    <div className="w-full min-h-screen p-3">
      <div className="mx-auto max-w-[1600px]">
        <SelectMapBlueprintLeaf
          mapImg={floorImg}
          items={items}
          selected={selected}
          onSelect={setSelected}
          startMode="map"
          editable
          onItemsChange={setItems}
          // sizes remain from component defaults (grid bigger, map original)
        />
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-xs font-mono text-gray-700">
          <div className="mb-1 font-semibold">Current layout JSON</div>
          <pre className="overflow-auto max-h-64">{json}</pre>
        </div>
      </div>
    </div>
  );
}
