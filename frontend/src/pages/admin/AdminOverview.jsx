import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { getAllReservations } from "../../services/reservation.service";

// ---- field accessors (booking rows use mixed casing) ----
const firstValue = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");
const getStatus = (r) => String(firstValue(r.status, r.Status, r.reservationStatus, r.ReservationStatus, "") || "").toUpperCase();
const getName = (r) => firstValue(r.customerName, r.CustomerName, r.guestName, r.GuestName, r.name, r.Name) || "Guest";
const getTime = (r) => firstValue(r.reservationTime, r.ReservationTime, r.time, r.Time) || "";
const getPartySize = (r) => Number(firstValue(r.partySize, r.PartySize, r.guests, r.Guests, r.pax, 0)) || 0;
const getId = (r) => firstValue(r.reservationId, r.bookingID, r.BookingID, r.ReservationID, r.id);

const ACTIVE = ["CONFIRMED", "BOOKED", "PENDING", "ARRIVED", "SEATED"];
const isActive = (s) => ACTIVE.includes(s);

function mealPeriod(time) {
  if (!time) return null;
  const h = parseInt(String(time).split(":")[0], 10);
  if (Number.isNaN(h)) return null;
  return h >= 8 && h < 18 ? "lunch" : "dinner";
}

function prettyTime(t) {
  if (!t) return "—";
  const [hh, mm] = String(t).split(":");
  const h = parseInt(hh, 10);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${mm ?? "00"} ${ampm}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function longDate() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

const STATUS_STYLE = {
  SEATED: "border-[#B7C9B0] text-[#3B5236] bg-[#EAF0E6]",
  ARRIVED: "border-[#C9BBA6] text-[var(--brass-2)] bg-[var(--brass-soft)]",
  CONFIRMED: "border-[#C9BBA6] text-[var(--ink-soft)] bg-[#F2EADB]",
  BOOKED: "border-[#C9BBA6] text-[var(--ink-soft)] bg-[#F2EADB]",
  PENDING: "border-[#C9BBA6] text-[var(--ink-soft)] bg-[#F2EADB]",
  NO_SHOW: "border-[#E3C4BB] text-[var(--danger)] bg-[#F6E7E2]",
  CANCELLED: "border-[var(--line)] text-[var(--ink-faint)] bg-[var(--cream-2)]",
  LEFT: "border-[var(--line)] text-[var(--ink-faint)] bg-[var(--cream-2)]",
};

function Kpi({ label, value, sub, accent, delay }) {
  return (
    <div className="admin-card p-5 admin-rise" style={{ animationDelay: `${delay}ms` }}>
      <p className="admin-eyebrow">{label}</p>
      <p className={`font-display text-[44px] leading-none mt-2 ${accent ? "text-[var(--brass)]" : "text-[var(--ink)]"}`}>
        {value}
      </p>
      {sub && <p className="text-[13px] text-[var(--ink-faint)] mt-2">{sub}</p>}
    </div>
  );
}

export default function AdminOverview() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const date = todayISO();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllReservations({ date });
      const data = Array.isArray(res) ? res : res?.reservations || [];
      setRows(data);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to load reservations");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const activeRows = rows.filter((r) => isActive(getStatus(r)));
    const count = (s) => rows.filter((r) => getStatus(r) === s).length;
    const coversOf = (arr) => arr.reduce((sum, r) => sum + getPartySize(r), 0);
    const lunchRows = activeRows.filter((r) => mealPeriod(getTime(r)) === "lunch");
    const dinnerRows = activeRows.filter((r) => mealPeriod(getTime(r)) === "dinner");
    return {
      total: activeRows.length,
      covers: coversOf(activeRows),
      seated: count("SEATED"),
      noShow: count("NO_SHOW"),
      lunch: lunchRows.length,
      dinner: dinnerRows.length,
      lunchCovers: coversOf(lunchRows),
      dinnerCovers: coversOf(dinnerRows),
      breakdown: [
        { label: "Confirmed", value: count("CONFIRMED") + count("BOOKED") + count("PENDING") },
        { label: "Arrived", value: count("ARRIVED") },
        { label: "Seated", value: count("SEATED") },
        { label: "Left", value: count("LEFT") },
        { label: "Cancelled", value: count("CANCELLED") + count("CANCELLED_NOTIFY") },
        { label: "No-show", value: count("NO_SHOW") },
      ],
    };
  }, [rows]);

  const timeline = useMemo(
    () => [...rows].sort((a, b) => String(getTime(a)).localeCompare(String(getTime(b)))),
    [rows]
  );

  return (
    <div className="space-y-9">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="admin-eyebrow">{longDate()}</p>
          <h1 className="font-display text-[40px] sm:text-[48px] leading-[0.95] text-[var(--ink)] mt-1">
            The house tonight
          </h1>
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

      {error && (
        <div className="rounded-xl bg-[#F6E7E2] border border-[#E3C4BB] text-[var(--danger)] text-sm px-4 py-3">{error}</div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi label="Reservations" value={stats.total} sub={`${stats.covers} covers expected`} accent delay={0} />
        <Kpi label="Seated now" value={stats.seated} sub="currently dining" delay={60} />
        <Kpi label="Lunch · Dinner" value={`${stats.lunch} · ${stats.dinner}`} sub="by service" delay={120} />
        <Kpi label="No-shows" value={stats.noShow} sub="today" delay={180} />
      </div>

      {/* Timeline + right rail */}
      <div className="grid gap-5 xl:grid-cols-3">
        {/* Timeline */}
        <div className="xl:col-span-2 admin-card overflow-hidden admin-rise flex flex-col" style={{ animationDelay: "220ms" }}>
          <div className="flex items-baseline justify-between px-6 pt-5 pb-4">
            <h2 className="font-display text-[22px] text-[var(--ink)]">Service timeline</h2>
            <span className="text-[12px] text-[var(--ink-faint)] tracking-wide">{timeline.length} bookings</span>
          </div>
          <div className="admin-rule" />
          {loading ? (
            <div className="flex-1 py-24 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--brass)]" /></div>
          ) : timeline.length === 0 ? (
            <div className="flex-1 grid place-items-center py-24 text-center">
              <div>
                <p className="font-display text-2xl text-[var(--ink-faint)]">A quiet evening</p>
                <p className="text-sm text-[var(--ink-faint)] mt-1">No reservations on the book for today.</p>
              </div>
            </div>
          ) : (
            <ul>
              {timeline.map((r, i) => {
                const status = getStatus(r);
                return (
                  <li key={getId(r) ?? i} className="group flex items-center gap-5 px-6 py-4 border-b border-[var(--line)] last:border-0 hover:bg-[var(--cream)] transition-colors">
                    <div className="w-20 shrink-0">
                      <p className="font-display text-[19px] text-[var(--ink)] tabular-nums">{prettyTime(getTime(r))}</p>
                    </div>
                    <div className="w-px self-stretch bg-[var(--line)] group-hover:bg-[var(--brass)] transition-colors" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-bold text-[var(--ink)] truncate">{getName(r)}</p>
                      <p className="text-[12px] text-[var(--ink-faint)] mt-0.5">
                        {getPartySize(r)} {getPartySize(r) === 1 ? "guest" : "guests"}
                        {mealPeriod(getTime(r)) ? ` · ${mealPeriod(getTime(r)) === "lunch" ? "Lunch" : "Dinner"}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide uppercase ${STATUS_STYLE[status] || "border-[var(--line)] text-[var(--ink-faint)] bg-[var(--cream-2)]"}`}>
                      {(status || "—").replace("_", " ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          {/* Service split */}
          <div className="admin-card p-6 admin-rise" style={{ animationDelay: "260ms" }}>
            <h3 className="font-display text-[20px] text-[var(--ink)]">By service</h3>
            <div className="mt-5 space-y-5">
              {[
                { label: "Lunch", n: stats.lunch, covers: stats.lunchCovers },
                { label: "Dinner", n: stats.dinner, covers: stats.dinnerCovers },
              ].map((s) => {
                const max = Math.max(stats.lunch, stats.dinner, 1);
                return (
                  <div key={s.label}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-[13px] font-semibold text-[var(--ink-soft)]">{s.label}</span>
                      <span className="text-[12px] text-[var(--ink-faint)]">{s.n} bookings · {s.covers} covers</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-[var(--cream-2)] overflow-hidden">
                      <div className="h-full rounded-full bg-[var(--brass)] transition-all" style={{ width: `${(s.n / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status breakdown */}
          <div className="admin-card p-6 admin-rise" style={{ animationDelay: "300ms" }}>
            <h3 className="font-display text-[20px] text-[var(--ink)]">Status breakdown</h3>
            <ul className="mt-4 divide-y divide-[var(--line)]">
              {stats.breakdown.map((b) => (
                <li key={b.label} className="flex items-center justify-between py-2.5">
                  <span className="text-[14px] text-[var(--ink-soft)]">{b.label}</span>
                  <span className="font-display text-[18px] text-[var(--ink)] tabular-nums">{b.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
