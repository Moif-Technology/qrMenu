
// ─────────────────────────────────────────────────────────────────────────────
// File: src/components/reserve/SummaryCard.jsx
// ─────────────────────────────────────────────────────────────────────────────
function Row({ k, v }) {
  return (
    <div className="grid grid-cols-2 items-center gap-2 py-3 text-[15px]">
      <div className="text-gray-600">{k}</div>
      <div className="text-right font-medium text-gray-900">{v}</div>
    </div>
  );
}

export default function SummaryCard({ form, table, subtotal, tax, total }) {
  return (
    <div className="space-y-2">
      <div className="rounded-3xl bg-white p-1">
        <div className="p-3">
          <Row k="Name" v={form.name || "Giorgano Williams"} />
          <Row k="Phone Number" v={form.phone || "+12 3456 7890"} />
          <Row k="Email" v={form.email || "giorgano12@gmail.com"} />
          <Row k="Date" v={form.date || "20 July 2024"} />
          <Row k="Hours" v={form.time || "14:00"} />
          <Row k="Number of Person" v={form.persons || "2"} />
        </div>
        <div className="mx-3 border-dashed border-t border-gray-200" />
        <div className="p-3 text-[15px]">
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-600">Subtotal</span>
            <span className="text-gray-900">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-600">Tax</span>
            <span className="text-gray-900">${tax.toFixed(1)}</span>
          </div>
          <div className="flex items-center justify-between py-2 text-base font-semibold">
            <span>Grand Total</span>
            <span>${total}</span>
          </div>
        </div>
      </div>
      <div className="text-center text-sm text-gray-500">Table #{table} — Selected</div>
    </div>
  );
}
