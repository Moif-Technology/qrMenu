import { useEffect, useState } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { getAdminSettings, updateAdminSettings } from "../../services/settings.service";

export default function AdminSettings() {
  const [settings, setSettings] = useState({ orderingEnabled: false, kotRouting: "kitchen" });
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
