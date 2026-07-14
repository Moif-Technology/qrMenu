import { useEffect, useRef, useState } from "react";
import { Loader2, Check, AlertCircle, Star, Search, X } from "lucide-react";
import { getAdminSettings, updateAdminSettings, isChefSpecialActive } from "../../services/settings.service";
import { getQrMenuItems } from "../../services/menu.service";

export default function AdminSettings() {
  const [settings, setSettings] = useState({ orderingEnabled: false, kotRouting: "kitchen", chefSpecial: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    let active = true;
    getAdminSettings()
      .then((s) => { if (active) setSettings(s); })
      .catch((e) => { if (active) setError(e?.response?.data?.error || e.message || "Failed to load settings"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(0), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const save = async (patch, field) => {
    setSaving(field);
    setError("");
    const prev = settings;
    setSettings({ ...settings, ...patch });
    try {
      const fresh = await updateAdminSettings(patch);
      setSettings(fresh);
      setSavedAt(Date.now());
    } catch (e) {
      setSettings(prev);
      setError(e?.response?.data?.error || e.message || "Failed to save");
    } finally {
      setSaving("");
    }
  };

  const { orderingEnabled, kotRouting } = settings;

  return (
    <div className="space-y-8">
      <div>
        <p className="admin-eyebrow">The kitchen · controls</p>
        <h1 className="font-display text-[40px] sm:text-[48px] leading-[0.95] text-[var(--ink)] mt-1">Settings</h1>
        <p className="text-[15px] text-[var(--ink-faint)] mt-3 max-w-lg">
          Turn QR ordering on or off, and choose how orders reach the kitchen.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-[#F6E7E2] border border-[#E3C4BB] text-[var(--danger)] text-sm px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {savedAt > 0 && !error && (
        <div className="flex items-center gap-2 rounded-xl bg-[#E7F2EA] border border-[#BBD9C4] text-[#1F6B3B] text-sm px-4 py-3">
          <Check className="h-4 w-4 shrink-0" /> Saved
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--ink-faint)] py-16">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] divide-y divide-[var(--line)]">
          {/* Ordering */}
          <div className="flex items-center justify-between gap-6 px-6 py-5">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-[16px] font-bold text-[var(--ink)]">Customer ordering</h2>
                {saving === "ordering" && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--brass)]" />}
              </div>
              <p className="text-[13.5px] text-[var(--ink-faint)] mt-1 max-w-md">
                On — guests at every table can send orders. Off — menu is view-only.
              </p>
            </div>
            <Toggle checked={orderingEnabled} disabled={!!saving} onChange={(v) => save({ orderingEnabled: v }, "ordering")} />
          </div>

          {/* Routing */}
          <div className="px-6 py-5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[16px] font-bold text-[var(--ink)]">Order routing</h2>
              {saving === "routing" && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--brass)]" />}
            </div>
            <p className="text-[13.5px] text-[var(--ink-faint)] mt-1">Where an order goes when a guest taps send.</p>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <RoutingOption
                active={kotRouting === "kitchen"}
                disabled={!!saving}
                title="Direct to kitchen"
                desc="Saved as HOLD."
                onClick={() => save({ kotRouting: "kitchen" }, "routing")}
              />
              <RoutingOption
                active={kotRouting === "counter"}
                disabled={!!saving}
                title="Counter first"
                desc="Saved as SUBMIT — counter approves before kitchen."
                onClick={() => save({ kotRouting: "counter" }, "routing")}
              />
            </div>
          </div>

          {/* Chef's Special of the Week */}
          <ChefSpecialEditor
            value={settings.chefSpecial}
            saving={saving === "chefSpecial"}
            disabled={!!saving}
            onSave={(cs) => save({ chefSpecial: cs }, "chefSpecial")}
          />
        </div>
      )}
    </div>
  );
}

/* ---------------- Chef's Special editor ---------------- */

function rowToDish(row) {
  return {
    productId: Number(row["pm.ProductID"] ?? row.ProductID ?? row.id) || 0,
    name:
      row["pm.ShortDescription"] ||
      row["pm.Description"] ||
      row.Description ||
      "Untitled",
    nameAr: row["pm.DescriptionArabic"] || "",
    price: Number(row.price ?? 0),
    image: row.cloudinaryUrl || null,
  };
}

function ChefSpecialEditor({ value, saving, disabled, onSave }) {
  const active = isChefSpecialActive(value);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null); // draft config while editing
  const [dish, setDish] = useState(null); // picked dish preview { productId, name, price, image }

  // Dish search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  // Resolve current dish name for the summary row
  useEffect(() => {
    let live = true;
    if (value?.productId) {
      getQrMenuItems({ productId: value.productId, pageSize: 1 })
        .then((res) => {
          if (live && res?.data?.[0]) setDish(rowToDish(res.data[0]));
        })
        .catch(() => {});
    } else {
      setDish(null);
    }
    return () => { live = false; };
  }, [value?.productId]);

  const startEdit = () => {
    setForm({
      productId: value?.productId || 0,
      title: value?.title || "Chef's Special of the Week",
      titleAr: value?.titleAr || "",
      subtitle: value?.subtitle || "",
      subtitleAr: value?.subtitleAr || "",
      from: value?.from || "",
      until: value?.until || "",
    });
    setQuery("");
    setResults([]);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(null);
    setResults([]);
  };

  const runSearch = (text) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const term = text.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await getQrMenuItems({ search: term, pageSize: 8 });
        setResults((res?.data || []).map(rowToDish).filter((d) => d.productId));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const pickDish = (d) => {
    setDish(d);
    setForm((f) => ({ ...f, productId: d.productId }));
    setQuery("");
    setResults([]);
  };

  const submit = () => {
    if (!form?.productId) return;
    onSave(form);
    setEditing(false);
  };

  const clear = () => {
    onSave(null);
    setEditing(false);
    setDish(null);
  };

  const inputCls =
    "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--brass)]";

  return (
    <div className="px-6 py-5">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-[16px] font-bold text-[var(--ink)] flex items-center gap-2">
              <Star className="h-4 w-4 text-[var(--brass)]" /> Chef&apos;s Special of the Week
            </h2>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--brass)]" />}
          </div>
          <p className="text-[13.5px] text-[var(--ink-faint)] mt-1 max-w-md">
            Spotlight one dish at the top of the QR menu. Pick the dish, set a label and
            optional dates — the banner shows and hides itself automatically.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            disabled={disabled}
            className="shrink-0 rounded-full border border-[var(--brass)] px-4 py-1.5 text-[13px] font-bold text-[var(--brass)] transition-colors hover:bg-[var(--brass-soft)] disabled:opacity-50"
          >
            {value ? "Edit" : "Set up"}
          </button>
        )}
      </div>

      {/* Summary (not editing) */}
      {!editing && value && (
        <div className="mt-4 flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--brass-soft)]/40 p-3">
          {dish?.image ? (
            <img src={dish.image} alt="" className="h-14 w-14 rounded-lg object-cover" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-lg bg-[var(--line)]">
              <Star className="h-5 w-5 text-[var(--ink-faint)]" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--brass)]">{value.title}</p>
            <p className="truncate text-[15px] font-bold text-[var(--ink)]">
              {dish?.name || `Product #${value.productId}`}
            </p>
            <p className="text-[12.5px] text-[var(--ink-faint)]">
              {value.from || value.until
                ? `${value.from || "now"} → ${value.until || "no end date"}`
                : "Runs until cleared"}
              {" · "}
              {active ? "Live on menu" : "Not currently visible (outside dates)"}
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="shrink-0 rounded-full border border-[var(--line)] px-3 py-1.5 text-[12.5px] font-bold text-[var(--ink-faint)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}

      {!editing && !value && (
        <p className="mt-3 text-[13px] italic text-[var(--ink-faint)]">No dish featured right now.</p>
      )}

      {/* Editor */}
      {editing && form && (
        <div className="mt-4 space-y-4 rounded-xl border border-[var(--line)] bg-white/60 p-4">
          {/* Dish picker */}
          <div>
            <label className="text-[12.5px] font-bold text-[var(--ink)]">Dish</label>
            {form.productId ? (
              <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-[var(--brass)] bg-[var(--brass-soft)] px-3 py-2">
                {dish?.image && <img src={dish.image} alt="" className="h-9 w-9 rounded object-cover" />}
                <span className="flex-1 truncate text-[14px] font-bold text-[var(--ink)]">
                  {dish?.name || `Product #${form.productId}`}
                  {dish?.price ? <span className="ml-2 font-normal text-[var(--ink-faint)]">AED {dish.price.toFixed(2)}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, productId: 0 }))}
                  className="text-[var(--ink-faint)] hover:text-[var(--danger)]"
                  aria-label="Remove dish"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative mt-1.5">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => runSearch(e.target.value)}
                  placeholder="Search menu dishes…"
                  className={`${inputCls} pl-9`}
                />
                {(searching || results.length > 0) && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
                    {searching && (
                      <div className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-[var(--ink-faint)]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                      </div>
                    )}
                    {!searching &&
                      results.map((d) => (
                        <button
                          key={d.productId}
                          type="button"
                          onClick={() => pickDish(d)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--brass-soft)]"
                        >
                          {d.image ? (
                            <img src={d.image} alt="" className="h-9 w-9 rounded object-cover" />
                          ) : (
                            <div className="h-9 w-9 rounded bg-[var(--line)]" />
                          )}
                          <span className="flex-1 truncate text-[14px] text-[var(--ink)]">{d.name}</span>
                          <span className="text-[12.5px] text-[var(--ink-faint)]">AED {d.price.toFixed(2)}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Labels */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[12.5px] font-bold text-[var(--ink)]">Label</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Chef's Special of the Week"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="text-[12.5px] font-bold text-[var(--ink)]">Label (Arabic)</label>
              <input
                type="text"
                dir="rtl"
                value={form.titleAr}
                onChange={(e) => setForm((f) => ({ ...f, titleAr: e.target.value }))}
                placeholder="طبق الشيف لهذا الأسبوع"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="text-[12.5px] font-bold text-[var(--ink)]">
                Tagline <span className="font-normal text-[var(--ink-faint)]">(optional — replaces dish description)</span>
              </label>
              <input
                type="text"
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                placeholder="Chargrilled over open charcoal for a rich, smoky finish"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="text-[12.5px] font-bold text-[var(--ink)]">Tagline (Arabic)</label>
              <input
                type="text"
                dir="rtl"
                value={form.subtitleAr}
                onChange={(e) => setForm((f) => ({ ...f, subtitleAr: e.target.value }))}
                className={`${inputCls} mt-1.5`}
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[12.5px] font-bold text-[var(--ink)]">
                Show from <span className="font-normal text-[var(--ink-faint)]">(optional)</span>
              </label>
              <input
                type="date"
                value={form.from}
                onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="text-[12.5px] font-bold text-[var(--ink)]">
                Show until <span className="font-normal text-[var(--ink-faint)]">(optional — hides automatically after)</span>
              </label>
              <input
                type="date"
                value={form.until}
                onChange={(e) => setForm((f) => ({ ...f, until: e.target.value }))}
                className={`${inputCls} mt-1.5`}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-full px-4 py-2 text-[13px] font-bold text-[var(--ink-faint)] hover:text-[var(--ink)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={disabled || !form.productId}
              className="rounded-full bg-[var(--brass)] px-5 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Save special
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-[var(--brass)]" : "bg-[#D8CFC6]"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function RoutingOption({ active, title, desc, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-xl border p-4 transition-colors disabled:opacity-60 ${
        active
          ? "border-[var(--brass)] bg-[var(--brass-soft)]"
          : "border-[var(--line)] bg-[var(--paper)] hover:border-[var(--brass)]/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[14.5px] font-bold text-[var(--ink)]">{title}</span>
        <span className={`h-4 w-4 rounded-full border-2 grid place-items-center ${active ? "border-[var(--brass)]" : "border-[#C7BCB0]"}`}>
          {active && <span className="h-2 w-2 rounded-full bg-[var(--brass)]" />}
        </span>
      </div>
      <p className="text-[12.5px] text-[var(--ink-faint)] mt-1">{desc}</p>
    </button>
  );
}
