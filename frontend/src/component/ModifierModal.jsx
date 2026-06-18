// src/components/ModifierModal.jsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAllModifiers } from "../services/modifier.service";
import Icon from "./Icon";

export default function ModifierModal({
  open,
  item,
  onClose,
  onApply,
  initialSelectedIds = [],
  initialSelectedMods = [],
}) {
  const [loading, setLoading] = useState(false);
  const [mods, setMods] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [customText, setCustomText] = useState("");
  const [customMods, setCustomMods] = useState([]);
  const [selected, setSelected] = useState(() => new Set(initialSelectedIds));

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setErr("");
    setSelected(new Set(initialSelectedIds));
    setCustomText("");
    setCustomMods(
      (Array.isArray(initialSelectedMods) ? initialSelectedMods : [])
        .filter((m) => m?.isCustom || String(m?.id ?? "").startsWith("custom:"))
        .map((m) => {
          const name = String(m.name ?? m.label ?? m.Modifier ?? "").trim();
          return name
            ? {
                id: m.id ?? `custom:${name.toLowerCase()}`,
                label: name,
                name,
                price: Number(m.price || 0),
                isCustom: true,
              }
            : null;
        })
        .filter(Boolean)
    );

    fetchAllModifiers()
      .then((rows) => setMods(rows))
      .catch((e) => setErr(e.message || "Error loading modifiers"))
      .finally(() => setLoading(false));
    // Reset selection only when the modal opens. initialSelectedIds defaults to
    // a fresh array, so including it here would wipe user clicks on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setErr("");
      setMods([]);
      setLoading(false);
      setCustomText("");
      setCustomMods([]);
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

  const normalizeCustomName = (value) => value.trim().replace(/\s+/g, " ");

  const addCustom = () => {
    const name = normalizeCustomName(customText);
    if (!name) return;

    const duplicateCustom = customMods.some(
      (m) => m.name.toLowerCase() === name.toLowerCase()
    );
    const duplicateSaved = mods.some(
      (m) => String(m.Modifier || "").trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicateCustom || duplicateSaved) {
      setCustomText("");
      return;
    }

    setCustomMods((prev) => [
      ...prev,
      {
        id: `custom:${name.toLowerCase()}`,
        label: name,
        name,
        price: 0,
        isCustom: true,
      },
    ]);
    setCustomText("");
  };

  const removeCustom = (id) => {
    setCustomMods((prev) => prev.filter((m) => m.id !== id));
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
    onApply?.([...picked, ...customMods]);
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
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-gray-100 p-4 sm:p-5">
            <div>
              <div className="text-xs text-gray-500">Customize</div>
              <h3 className="text-lg font-semibold text-gray-900">
                {item?.name || "Item"}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-gray-100"
              aria-label="Close"
              title="Close"
            >
              <Icon name="x" className="h-5 w-5 text-gray-700" />
            </button>
          </div>

          <div className="space-y-3 px-4 pb-3 pt-3 sm:px-5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search modifiers..."
                  className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
              <button
                onClick={() => {
                  setSelected(new Set());
                  setCustomMods([]);
                }}
                className="h-10 rounded-lg border border-gray-200 px-3 text-sm hover:bg-gray-50"
                title="Clear selections"
              >
                Clear
              </button>
            </div>

            <div className="rounded-xl border border-dashed border-[rgba(201,26,77,0.28)] bg-[var(--grad-start-soft)] p-3">
              <div
                className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[var(--grad-end)]"
                style={{ letterSpacing: "0.12em" }}
              >
                <Icon name="edit-3" className="h-3.5 w-3.5" />
                Custom modifier
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customText}
                  maxLength={80}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                  placeholder="E.g. sauce on the side, no onions"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-white bg-white/90 px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <button
                  type="button"
                  onClick={addCustom}
                  disabled={!customText.trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--text-primary)] text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Add custom modifier"
                  title="Add custom modifier"
                >
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              </div>
              {customMods.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customMods.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white bg-white px-2.5 py-1 text-xs font-medium text-gray-800 shadow-sm"
                    >
                      <span className="truncate">{m.name}</span>
                      <button
                        type="button"
                        onClick={() => removeCustom(m.id)}
                        className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                        aria-label={`Remove ${m.name}`}
                        title="Remove"
                      >
                        <Icon name="x" className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="px-4 pb-4 sm:px-5">
            {loading ? (
              <div className="py-10 text-center text-gray-500">Loading...</div>
            ) : err ? (
              <div className="py-10 text-center text-red-600">{err}</div>
            ) : (
              <div className="grid max-h-[42vh] grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2">
                {filtered.map((m) => {
                  const checked = selected.has(m.ModifierID);
                  return (
                    <label
                      key={m.ModifierID}
                      className={`flex cursor-pointer select-none items-center gap-3 rounded-xl border p-3 transition ${
                        checked
                          ? "border-[var(--grad-end)] bg-[var(--grad-start-soft)]"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
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
                        <div className="truncate text-sm font-medium text-gray-900">
                          {m.Modifier}
                        </div>
                        {m.ModifierArabic ? (
                          <div className="truncate text-xs text-gray-500">
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

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 p-4 sm:p-5">
            <button
              onClick={onClose}
              className="h-10 rounded-lg border border-gray-200 px-4 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              className="h-10 rounded-lg px-4 font-semibold text-white shadow"
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
