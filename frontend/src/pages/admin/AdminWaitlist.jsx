import { useCallback, useEffect, useState } from "react";
import { Phone, Users, Clock, BellRing, Check, Trash2, Loader2, RefreshCw } from "lucide-react";
import { getWaitlistEntries, updateWaitlistStatus, deleteWaitlistEntry } from "../../services/waitlist.service.js";

export default function AdminWaitlist() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getWaitlistEntries();
      if (result.ok) setList(result.waitlist || []);
      else setError(result.error || "Failed to load waitlist");
    } catch (err) {
      setError(err?.message || "Failed to load waitlist");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const idOf = (item) => item.waitlistId || item.waitlistID;

  const act = async (item, fn) => {
    setBusyId(idOf(item));
    try {
      await fn();
      await load();
    } catch (err) {
      alert(err?.message || "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const notify = (item) => act(item, () => updateWaitlistStatus(idOf(item), "NOTIFIED"));
  const seat = (item) => act(item, () => updateWaitlistStatus(idOf(item), "SEATED"));
  const remove = (item) => {
    if (!confirm(`Remove ${item.guestName || "guest"} from the waitlist?`)) return;
    act(item, () => deleteWaitlistEntry(idOf(item)));
  };

  const Meta = ({ icon, children }) => {
    const Icon = icon;
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ink-faint)]">
        <Icon className="h-3.5 w-3.5" /> {children}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="admin-eyebrow">The bar · waiting</p>
          <h1 className="font-display text-[40px] sm:text-[48px] leading-[0.95] text-[var(--ink)] mt-1">Waitlist</h1>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 text-[13px] font-semibold text-[var(--ink-soft)] hover:border-[var(--brass)] transition disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {error && <div className="rounded-xl bg-[#F6E7E2] border border-[#E3C4BB] text-[var(--danger)] text-sm px-4 py-3">{error}</div>}

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--brass)]" /></div>
      ) : list.length === 0 ? (
        <div className="admin-card py-20 text-center">
          <p className="font-display text-2xl text-[var(--ink-faint)]">No one waiting</p>
          <p className="text-sm text-[var(--ink-faint)] mt-1">The waitlist is clear.</p>
        </div>
      ) : (
        <div className="grid gap-3.5">
          {list.map((item, i) => {
            const busy = busyId === idOf(item);
            return (
              <div key={idOf(item) || i} className="admin-card p-5 flex flex-col sm:flex-row sm:items-center gap-4 admin-rise" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="h-11 w-11 rounded-full bg-[var(--brass-soft)] border border-[var(--line)] flex items-center justify-center font-display text-lg text-[var(--brass-2)] shrink-0">
                  {(item.guestName || "G").trim().slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-[19px] text-[var(--ink)]">{item.guestName || "Guest"}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    <Meta icon={Phone}>{item.phone || "—"}</Meta>
                    <Meta icon={Users}>{item.pax || item.partySize || "—"} guests</Meta>
                    {item.addedTime && <Meta icon={Clock}>Added {item.addedTime}</Meta>}
                    {item.waitTimeMinutes && <Meta icon={Clock}>~{item.waitTimeMinutes} min</Meta>}
                  </div>
                  {item.notes && <p className="text-[12.5px] italic text-[var(--ink-faint)] mt-2">{item.notes}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => notify(item)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--paper)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-soft)] hover:border-[var(--brass)] disabled:opacity-50 transition">
                    <BellRing className="h-3.5 w-3.5" /> Notify
                  </button>
                  <button onClick={() => seat(item)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--forest)] px-3.5 py-2 text-[12.5px] font-semibold text-[#EAF0E6] hover:opacity-90 disabled:opacity-50 transition">
                    <Check className="h-3.5 w-3.5" /> Seat
                  </button>
                  <button onClick={() => remove(item)} disabled={busy} className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-[var(--line)] text-[var(--ink-faint)] hover:text-[var(--danger)] hover:border-[#E3C4BB] disabled:opacity-50 transition">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
