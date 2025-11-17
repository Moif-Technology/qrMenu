// ──────────────────────────────────────────────────────────
// File: src/pages/ReservePage.jsx
// ──────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import floorImg from "../assets/floor/restaurant-map.png";
import BackHeader from "../component/reserve/BackHeader";
import InfoForm from "../component/reserve/InfoForm";
import { ModernLegendBar } from "../component/reserve/SelectMap";
import SummaryCard from "../component/reserve/SummaryCard";
import SelectMap from "../component/reserve/SelectMap";

const coordsByFloor = {
  "Ground Floor": [
    { id: "T1", label: "T1", type: "rect",   seats: 6, x: 22,  y: 32,  rot: 90 },
    { id: "T2", label: "T2", type: "round",  seats: 5, x: 48,  y: 38 },
    { id: "T3", label: "T3", type: "square", seats: 4, x: 72,  y: 31 },
    { id: "T4", label: "T4", type: "rect",   seats: 8, x: 35,  y: 64 },
    { id: "T5", label: "T5", type: "round",  seats: 6, x: 64,  y: 62 },
    { id: "T6", label: "T6", type: "rect",   seats: 6, x: 86,  y: 49, rot: 90, reserved: true },
  ],
  "1st Floor": [],
  "2nd Floor": [],
  Rooftop: [],
};

export default function ReservePage() {
  const [step, setStep] = useState(1);
  const [floor, setFloor] = useState("Ground Floor");
  const [selectedTable, setSelectedTable] = useState(null);

  // load items for current floor
  const [items, setItems] = useState(coordsByFloor[floor] || []);
  useEffect(() => {
    setItems(coordsByFloor[floor] || []);
  }, [floor]);

  // form
  const [form, setForm] = useState({
    name: "", phone: "", email: "", date: "", time: "", persons: "", notes: "",
  });

  const canContinue = useMemo(() => {
    if (step === 1) return !!selectedTable;
    if (step === 2) return form.name.trim() && form.phone.trim() && form.date && form.time && form.persons;
    return true;
  }, [step, selectedTable, form]);

  const subtotal = 206.45, tax = 20.6;
  const total = useMemo(() => (subtotal + tax).toFixed(2), [subtotal, tax]);

  return (
    <div className="min-h-svh w-full bg-gray-50 text-gray-900">
      <BackHeader
        title={step === 1 ? "Select table" : step === 2 ? "Information Detail" : "Order summary"}
        onBack={() => setStep((s) => Math.max(1, s - 1))}
        step={step}
        total={3}
      />

      <main className="mx-auto w-full px-4 sm:px-6 lg:px-8 pb-[140px] pt-2">
        {step === 1 && (
          <section aria-label="Table selection" className="w-full">
            <SelectMap
              mapImg={floorImg}
              items={items}
              selected={selectedTable}
              onSelect={setSelectedTable}
              startMode="map"    // change to "grid" if you want to start on the grid view
              editable
              onItemsChange={setItems}
            />
          </section>
        )}

        {step === 2 && <InfoForm value={form} onChange={setForm} />}
        {step === 3 && <SummaryCard form={form} table={selectedTable} subtotal={subtotal} tax={tax} total={total} />}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-white/90 via-white/70 to-transparent p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {step === 1 && <ModernLegendBar />}
        <button
          disabled={!canContinue}
          onClick={() => setStep((s) => Math.min(3, s + 1))}
          className="mx-auto mt-2 flex w-full items-center justify-center rounded-full bg-gray-900 py-4 text-base font-medium text-white disabled:opacity-40"
        >
          {step === 1 && "Reserve"}
          {step === 2 && "Continue"}
          {step === 3 && "Pay and Reserve"}
        </button>
      </div>
    </div>
  );
}
