// frontend/src/pages/ReservationDetailsPage.jsx
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAllReservations, updateReservationStatus } from "../services/reservation.service";
import { getMockReservations, updateMockReservationStatus } from "../services/reservation.mock";
import BottomNav from "../component/reservation/BottomNav";
import StatusSelector from "../component/reservation/StatusSelector";
import WalkInEditModal from "../component/reservation/WalkInEditModal";

// Toggle this to use mock data instead of API
const USE_MOCK_DATA = false;

// -------------------------
// Small UI helpers (same file)
// -------------------------
function Icon({ name, className = "h-5 w-5" }) {
  const common = { className, fill: "none", stroke: "currentColor", strokeWidth: 2, viewBox: "0 0 24 24" };
  switch (name) {
    case "back":
      return (
        <svg {...common}>
          <path d="M19 12H5" />
          <path d="M12 19 5 12 12 5" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M9 22V12h6v10" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="M12 21s7-4.35 7-11a7 7 0 0 0-14 0c0 6.65 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="7" r="4" />
          <path d="M20 21a8 8 0 0 0-16 0" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.09 2h3a2 2 0 0 1 2 1.72c.12.86.32 1.7.59 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.14a2 2 0 0 1 2.11-.45c.8.27 1.64.47 2.5.59A2 2 0 0 1 22 16.92Z" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    default:
      return null;
  }
}

function Chip({ icon, children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm backdrop-blur">
      {icon}
      {children}
    </span>
  );
}

function Card({ title, icon, children }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur">
      {title ? (
        <div className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-zinc-700">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[#7A0026] to-[#C91A4D]" />
          {icon}
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Row({ label, icon, value, last }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 ${last ? "" : "border-b border-zinc-100"}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="max-w-[60%] truncate text-right text-sm font-extrabold text-zinc-900">{value}</div>
    </div>
  );
}

function statusBadgeClass(status) {
  const s = (status || "").toUpperCase();
  const isCancelled = s === "CANCELLED" || s === "CANCELLED_NOTIFY";
  const isSeated =
    s === "SEATED" || s === "CHECKED_IN" || s === "PARTIALLY_SEATED" || s === "PAID" || s === "BUS_TABLE";
  const isArrived = s === "ARRIVED" || s === "PARTIALLY_ARRIVED";
  const isLeft = s === "LEFT";
  const isNoShow = s === "NO_SHOW";
  const isBooked = s === "BOOKED" || s === "HOLD" || s === "PENDING";
  const isConfirmed = s === "CONFIRMED" || !s;

  if (isCancelled) return "bg-red-50 text-red-700 border-red-200";
  if (isSeated) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (isLeft) return "bg-amber-50 text-amber-700 border-amber-200";
  if (isArrived) return "bg-violet-50 text-violet-700 border-violet-200";
  if (isNoShow) return "bg-zinc-100 text-zinc-600 border-zinc-200";
  if (isBooked) return "bg-amber-50 text-amber-800 border-amber-200";
  if (isConfirmed) return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-zinc-50 text-zinc-700 border-zinc-200";
}

// -------------------------
// Page
// -------------------------
export default function ReservationDetailsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reservationId = searchParams.get("id");

  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showStatusSelector, setShowStatusSelector] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showWalkInEditModal, setShowWalkInEditModal] = useState(false);

  useEffect(() => {
    if (reservationId) loadReservation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  const loadReservation = async () => {
    setLoading(true);
    setError(null);
    try {
      let data;
      if (USE_MOCK_DATA) {
        const result = getMockReservations({});
        const allReservations = result.reservations || [];
        const found = allReservations.find((r) => r.reservationId === parseInt(reservationId));
        data = found || null;
      } else {
        const { getReservationById } = await import("../services/reservation.service.js");
        const result = await getReservationById(reservationId);

        if (result.ok && result.reservation) {
          data = result.reservation;
        } else {
          const allResult = await getAllReservations({});
          const allReservations = Array.isArray(allResult) ? allResult : allResult?.reservations || [];
          const found = allReservations.find(
            (r) => (r.reservationId || r.bookingID || r.ReservationID) === parseInt(reservationId)
          );
          data = found || null;
        }
      }

      if (!data) setError("Reservation not found");
      else setReservation(data);
    } catch (err) {
      console.error("Failed to load reservation:", err);
      setError("Failed to load reservation details");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (reservation, newStatus) => {
    const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
    if (!reservationId) return alert("Reservation ID not found");
    if (!confirm(`Change status to ${newStatus}?`)) return;

    setProcessing(true);
    try {
      let result = null;
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, newStatus);
        result = { ok: true, status: newStatus };
      } else {
        result = await updateReservationStatus(reservationId, newStatus);
        if (!result.ok) throw new Error(result.error || "Failed to update status");
      }

      const mappedStatus = result?.status || newStatus;

      setReservation((prev) =>
        !prev
          ? prev
          : {
              ...prev,
              status: mappedStatus,
              Status: mappedStatus,
              bookingStatus: mappedStatus,
              BookingStatus: mappedStatus,
            }
      );

      setShowStatusSelector(false);
      alert(`Status updated to ${mappedStatus} successfully!`);

      setTimeout(async () => {
        try {
          await loadReservation();
        } catch (e) {
          console.error("Failed to reload reservation:", e);
        }
      }, 500);
    } catch (err) {
      console.error("Failed to update status:", err);
      const errorMsg = err?.response?.data?.error || err?.message || "Please try again.";
      alert(`Failed to update status: ${errorMsg}`);
    } finally {
      setProcessing(false);
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return "—";
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString + "T00:00:00");
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(140%_70%_at_50%_0%,rgba(201,26,77,0.10),transparent_55%),radial-gradient(120%_60%_at_0%_20%,rgba(139,111,71,0.10),transparent_55%)] bg-zinc-50 pb-24">
        <Header navigate={navigate} title="Loading..." subtitle="Fetching reservation details" />
        <div className="mx-auto max-w-3xl px-4 py-12 text-center text-sm font-semibold text-zinc-500">
          Loading reservation details...
        </div>
        <BottomNav />
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen bg-[radial-gradient(140%_70%_at_50%_0%,rgba(201,26,77,0.10),transparent_55%),radial-gradient(120%_60%_at_0%_20%,rgba(139,111,71,0.10),transparent_55%)] bg-zinc-50 pb-24">
        <Header navigate={navigate} title="Error" subtitle="Couldn’t load reservation" />
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-sm font-extrabold text-red-700">
            {error || "Reservation not found"}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const name = reservation.customerName || reservation.CustomerName || "—";
  const phone = reservation.customerPhone || reservation.CustomerPhone || "—";
  const email = reservation.customerEmail || reservation.CustomerEmail || "—";
  const guests = reservation.numberOfGuests || reservation.NumberOfGuests || 0;
  const date = reservation.reservationDate || reservation.ReservationDate || "";
  const time = reservation.reservationTime || reservation.ReservationTime || "";
  const status = reservation.status || reservation.bookingStatus || reservation.Status || reservation.BookingStatus || "";

  // Table info — support single table or multiple (tables array / tableIds comma-separated)
  let tableId = reservation.tableId || reservation.TableID;
  let tableName = reservation.tableName || reservation.TableName;
  let tableNo = reservation.tableNo || reservation.TableNO;
  let tableInfo = reservation.tableInfo || reservation.TableInfo;

  let table = "Unassigned";

  if (reservation.tables && Array.isArray(reservation.tables) && reservation.tables.length > 0) {
    const firstTable = reservation.tables[0];
    tableId = firstTable.tableId ?? firstTable.tableID ?? firstTable.TableID ?? tableId;
    tableName = firstTable.tableName ?? firstTable.TableName ?? tableName;
    tableNo = firstTable.tableNo ?? firstTable.TableNO ?? tableNo;
    if (reservation.tables.length === 1) {
      if (firstTable.tableName || firstTable.TableName) table = firstTable.tableName || firstTable.TableName;
      else if (firstTable.tableNo != null || firstTable.TableNO != null) table = `Table ${firstTable.tableNo ?? firstTable.TableNO}`;
      else table = `Table ${firstTable.tableId ?? firstTable.tableID ?? firstTable.TableID}`;
    } else {
      table = reservation.tables
        .map((t) => t.tableName || t.TableName || (t.tableNo != null || t.TableNO != null ? `Table ${t.tableNo ?? t.TableNO}` : `Table ${t.tableId ?? t.tableID ?? t.TableID}`))
        .join(", ");
    }
  } else if (reservation.tableIds && String(reservation.tableIds).trim() && String(reservation.tableIds) !== "0") {
    const ids = String(reservation.tableIds).split(",").map((s) => s.trim()).filter(Boolean);
    table = ids.map((id) => `Table ${id}`).join(", ");
  } else {
    if (tableName) table = tableName;
    else if (tableInfo) table = tableInfo;
    else if (tableNo) table = `Table ${tableNo}`;
    else if (tableId != null && tableId !== "" && tableId !== 0) table = `Table ${tableId}`;
  }

  // Area info
  let areaId = reservation.areaId || reservation.AreaID;
  let areaName = reservation.areaName || reservation.AreaName;

  if (reservation.tables && Array.isArray(reservation.tables) && reservation.tables.length > 0) {
    const firstTable = reservation.tables[0];
    areaId = firstTable.areaId || firstTable.areaID || firstTable.AreaID || areaId;
    areaName = firstTable.areaName || firstTable.AreaName || areaName;
  }

  const area = areaName || (areaId ? `Area ${areaId}` : "—");
  const comments = reservation.specialRequests || reservation.SpecialRequests || "";

  const initials = (() => {
    const n = (name || "").trim();
    if (!n || n === "—") return "G";
    const parts = n.split(" ").filter(Boolean);
    return ((parts[0]?.[0] || "G") + (parts[1]?.[0] || "")).toUpperCase();
  })();

  return (
    <div className="min-h-screen bg-[radial-gradient(140%_70%_at_50%_0%,rgba(201,26,77,0.10),transparent_55%),radial-gradient(120%_60%_at_0%_20%,rgba(139,111,71,0.10),transparent_55%)] bg-zinc-50 pb-24">
      <Header navigate={navigate} title="Reservation Details" subtitle={`ID: ${reservationId}`} />

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {/* HERO (single place for date/time/table/area/status + change status) */}
        <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#7A0026] to-[#C91A4D] text-sm font-black text-white shadow-[0_14px_30px_rgba(201,26,77,0.30)]">
                {initials}
              </div>

              <div className="min-w-0">
                <div className="truncate text-base font-black text-zinc-900">{name}</div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip icon={<Icon name="calendar" className="h-4 w-4" />}>{formatDate(date)}</Chip>
                  <Chip icon={<Icon name="clock" className="h-4 w-4" />}>{formatTime(time)}</Chip>
                  <Chip icon={<Icon name="pin" className="h-4 w-4" />}>{table}</Chip>
                  {area && area !== "—" && <Chip>{area}</Chip>}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-extrabold tracking-wide shadow-sm ${statusBadgeClass(
                  (status || "CONFIRMED").toUpperCase()
                )}`}
              >
                {(status || "CONFIRMED").toUpperCase()}
              </span>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStatusSelector(true);
                }}
                disabled={processing}
                className="inline-flex items-center gap-2 rounded-full border border-[#C91A4D]/50 bg-white/90 px-3 py-1.5 text-xs font-extrabold text-[#C91A4D] shadow-[0_10px_24px_rgba(201,26,77,0.12)] transition hover:bg-[#FBE6EC] disabled:opacity-60"
              >
                <Icon name="edit" className="h-4 w-4" />
                Change
              </button>
            </div>
          </div>
        </div>

        {/* Guest Information */}
        <Card title="Guest Information">
          <Row label="Name" icon={<Icon name="user" className="h-4 w-4 text-zinc-400" />} value={name} />
          <Row label="Phone" icon={<Icon name="phone" className="h-4 w-4 text-zinc-400" />} value={phone} />
          {email && email !== "—" ? (
            <Row label="Email" icon={<Icon name="mail" className="h-4 w-4 text-zinc-400" />} value={email} />
          ) : null}
          <Row
            label="Guests"
            icon={<Icon name="users" className="h-4 w-4 text-zinc-400" />}
            value={guests}
            last
          />
        </Card>

        {/* Special Requests */}
        {comments ? (
          <Card title="Special Requests">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold leading-relaxed text-zinc-700">
              {comments}
            </div>
          </Card>
        ) : null}

        {/* Actions */}
        <Card title="Actions">
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setShowStatusSelector(true)}
              disabled={processing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#7A0026] to-[#C91A4D] px-4 py-4 text-sm font-black text-white shadow-[0_14px_34px_rgba(201,26,77,0.34)] transition hover:brightness-105 disabled:opacity-70"
            >
              <Icon name="clock" className="h-5 w-5" />
              Change Status
            </button>

            <button
              type="button"
              onClick={() => {
                const bookingSource = reservation?.bookingSource || reservation?.BookingSource || "";
                const isWalkIn = bookingSource.toUpperCase() === "WALKIN";
                if (isWalkIn) setShowWalkInEditModal(true);
                else navigate(`/reservation-form?edit=${reservationId}`);
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#C91A4D]/50 bg-white/90 px-4 py-4 text-sm font-black text-[#C91A4D] shadow-[0_10px_26px_rgba(201,26,77,0.12)] transition hover:bg-[#FBE6EC]"
            >
              <Icon name="edit" className="h-5 w-5" />
              Edit Reservation
            </button>
          </div>
        </Card>
      </div>

      <BottomNav />

      {/* Status Selector Modal */}
      {showStatusSelector && reservation && (
        <StatusSelector reservation={reservation} onStatusChange={handleStatusChange} onClose={() => setShowStatusSelector(false)} />
      )}

      {/* Walk-In Edit Modal */}
      {showWalkInEditModal && reservation && (
        <WalkInEditModal
          reservation={reservation}
          onClose={() => setShowWalkInEditModal(false)}
          onSave={() => {
            setShowWalkInEditModal(false);
            loadReservation();
          }}
        />
      )}
    </div>
  );
}

function Header({ navigate, title, subtitle }) {
  return (
    <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="grid h-11 w-11 place-items-center rounded-2xl border border-zinc-200 bg-white/80 shadow-sm transition hover:bg-zinc-50"
          aria-label="Back"
        >
          <Icon name="back" className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black text-zinc-900">{title}</div>
          {subtitle ? <div className="truncate text-xs font-semibold text-zinc-500">{subtitle}</div> : null}
        </div>

        <button
          onClick={() => navigate("/reservation")}
          className="grid h-11 w-11 place-items-center rounded-2xl border border-zinc-200 bg-white/80 text-zinc-600 shadow-sm transition hover:bg-[#FBE6EC] hover:text-[#C91A4D] hover:border-[#C91A4D]/50"
          aria-label="Home"
        >
          <Icon name="home" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
