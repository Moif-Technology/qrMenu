// src/components/ModifierModal.jsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAllModifiers } from "../services/modifier.service";
import Icon from "./Icon";

export default function ModifierModal({
  open,
  item,                // the item passed from ItemCard (id, name, price, etc.)
  onClose,             // () => void
  onApply,             // (selectedMods) => void   selectedMods: [{ id, label, arLabel, raw }]
  initialSelectedIds = [], // ✅ new: preselect previously chosen mods
}) {
  const [loading, setLoading] = useState(false);
  const [mods, setMods] = useState([]); // raw rows from API
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(() => new Set(initialSelectedIds));

  // load data when opening
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr("");
    // preselect current
    setSelected(new Set(initialSelectedIds));
    fetchAllModifiers()
      .then((rows) => setMods(rows))
      .catch((e) => setErr(e.message || "Error loading modifiers"))
      .finally(() => setLoading(false));
    // Reset selection only when the modal opens — NOT on every render.
    // `initialSelectedIds` defaults to a fresh [] each render, so depending on
    // it here re-ran this effect on every toggle and wiped the user's click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // reset when closed
  useEffect(() => {
    if (!open) {
      setQ("");
      setErr("");
      setMods([]);
      setLoading(false);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return mods;
    return mods.filter((m) => {
      const en = String(m.Modifier || "").toLowerCase();
      const ar = String(m.ModifierArabic || "").toLowerCase();
      return en.includes(needle) || ar.includes(needle);
    });
  }, [mods, q]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const apply = () => {
    const picked = mods
      .filter((m) => selected.has(m.ModifierID))
      .map((m) => ({
        id: m.ModifierID,
        label: m.Modifier,
        arLabel: m.ModifierArabic,
        raw: m,
      }));
    onApply?.(picked);
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000]"
      aria-modal="true"
      role="dialog"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose?.();
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog */}
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">Customize</div>
              <h3 className="text-lg font-semibold text-gray-900">
                {item?.name || "Item"}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-full grid place-items-center hover:bg-gray-100"
              aria-label="Close"
              title="Close"
            >
              <Icon name="x" className="w-5 h-5 text-gray-700" />
            </button>
          </div>

          {/* Tools */}
          <div className="px-4 sm:px-5 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Icon
                  name="search"
                  className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search modifiers…"
                  className="w-full pl-9 pr-3 h-10 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
              <button
                onClick={() => setSelected(new Set())}
                className="h-10 px-3 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
                title="Clear selections"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Body (2 columns on small screens) */}
          <div className="px-4 sm:px-5 pb-4">
            {loading ? (
              <div className="py-10 text-center text-gray-500">Loading…</div>
            ) : err ? (
              <div className="py-10 text-center text-red-600">{err}</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-[52vh] overflow-auto pr-1">
                {filtered.map((m) => {
                  const checked = selected.has(m.ModifierID);
                  return (
                    <label
                      key={m.ModifierID}
                      className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer select-none transition
                        ${checked ? "border-[var(--grad-end)] bg-[var(--grad-start-soft)]" : "border-gray-200 hover:bg-gray-50"}`}
                      onClick={(e) => {
                        e.preventDefault();
                        toggle(m.ModifierID);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="h-4 w-4"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {m.Modifier}
                        </div>
                        {m.ModifierArabic ? (
                          <div className="text-xs text-gray-500 truncate">
                            {m.ModifierArabic}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
                {!filtered.length && (
                  <div className="col-span-full py-8 text-center text-gray-500">
                    No modifiers found.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-5 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="h-10 px-4 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              className="h-10 px-4 rounded-lg text-white font-semibold shadow"
              style={{ background: "linear-gradient(90deg,var(--grad-start),var(--grad-end))" }}
            >
              Add selection
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
