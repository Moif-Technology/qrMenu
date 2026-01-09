import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../component/Icon";
import { getReservationsByDate } from "../services/reservation.service";

export default function ReservationReport() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load reservations when date changes
  useEffect(() => {
    loadReservations();
  }, [selectedDate]);

  const loadReservations = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getReservationsByDate(selectedDate);
      if (data && data.reservations) {
        setReservations(data.reservations);
      } else {
        setReservations([]);
      }
    } catch (err) {
      console.error("Failed to load reservations:", err);
      setError("Failed to load reservations");
      setReservations([]);
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const stats = {
    total: reservations.length,
    arrived: reservations.filter((r) => {
      const status = (r.status || "").toLowerCase();
      return status === "arrived" || status === "checked_in";
    }).length,
    noShow: reservations.filter((r) => {
      const status = (r.status || "").toLowerCase();
      return status === "no_show";
    }).length,
    upcoming: reservations.filter((r) => {
      const status = (r.status || "").toLowerCase();
      const resDate = r.date || r.reservationDate;
      const resTime = r.time || r.reservationTime;
      
      if (!resDate || !resTime) return false;
      
      const now = new Date();
      const resDateTime = new Date(`${resDate}T${resTime}`);
      
      return (
        resDateTime > now &&
        (status === "booked" || status === "confirmed" || !status)
      );
    }).length,
    cancelled: reservations.filter((r) => {
      const status = (r.status || "").toLowerCase();
      return status === "cancelled";
    }).length,
    confirmed: reservations.filter((r) => {
      const status = (r.status || "").toLowerCase();
      return status === "confirmed" || status === "booked";
    }).length,
  };

  // Group reservations by status
  const groupedReservations = {
    upcoming: reservations.filter((r) => {
      const status = (r.status || "").toLowerCase();
      const resDate = r.date || r.reservationDate;
      const resTime = r.time || r.reservationTime;
      
      if (!resDate || !resTime) return false;
      
      const now = new Date();
      const resDateTime = new Date(`${resDate}T${resTime}`);
      
      return (
        resDateTime > now &&
        (status === "booked" || status === "confirmed" || !status) &&
        status !== "cancelled" &&
        status !== "no_show"
      );
    }),
    arrived: reservations.filter((r) => {
      const status = (r.status || "").toLowerCase();
      return status === "arrived" || status === "checked_in";
    }),
    noShow: reservations.filter((r) => {
      const status = (r.status || "").toLowerCase();
      return status === "no_show";
    }),
    cancelled: reservations.filter((r) => {
      const status = (r.status || "").toLowerCase();
      return status === "cancelled";
    }),
    other: reservations.filter((r) => {
      const status = (r.status || "").toLowerCase();
      return (
        status !== "arrived" &&
        status !== "checked_in" &&
        status !== "no_show" &&
        status !== "cancelled" &&
        !(status === "booked" || status === "confirmed" || !status)
      );
    }),
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "arrived" || s === "checked_in") return "bg-green-100 text-green-800 border-green-300";
    if (s === "no_show") return "bg-red-100 text-red-800 border-red-300";
    if (s === "cancelled") return "bg-gray-100 text-gray-800 border-gray-300";
    if (s === "confirmed" || s === "booked") return "bg-blue-100 text-blue-800 border-blue-300";
    return "bg-yellow-100 text-yellow-800 border-yellow-300";
  };

  const getStatusIcon = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "arrived" || s === "checked_in") return "check-circle";
    if (s === "no_show") return "alert-circle";
    if (s === "cancelled") return "x";
    if (s === "confirmed" || s === "booked") return "calendar";
    return "clock";
  };

  const StatCard = ({ icon, value, label, gradient, borderColor, delay = 0 }) => (
    <div
      className="group relative bg-white rounded-2xl p-5 border-2 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
      style={{
        borderColor: borderColor,
        animationDelay: `${delay}ms`,
      }}
    >
      {/* Gradient Background */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300"
        style={{
          background: gradient,
        }}
      />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300"
            style={{
              background: gradient,
            }}
          >
            <Icon name={icon} className="h-7 w-7 text-white" />
          </div>
        </div>
        <div className="text-3xl font-bold mb-1" style={{ color: borderColor }}>
          {value}
        </div>
        <div className="text-sm font-medium text-gray-600">{label}</div>
      </div>
    </div>
  );

  const ReservationCard = ({ reservation, statusColor, statusIcon, buttonColor, buttonHover }) => (
    <div className="group bg-white rounded-xl p-5 border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 shadow-sm ${getStatusColor(
              reservation.status
            )}`}>
              <span className="flex items-center gap-1.5">
                <Icon
                  name={getStatusIcon(reservation.status)}
                  className="h-3.5 w-3.5"
                />
                {(reservation.status || "BOOKED").toUpperCase()}
              </span>
            </div>
            <div className="font-bold text-lg text-gray-900">
              {reservation.name || reservation.customerName || "Guest"}
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
              <Icon name="calendar" className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{formatDate(reservation.date || reservation.reservationDate)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
              <Icon name="clock" className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{formatTime(reservation.time || reservation.reservationTime)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
              <Icon name="users" className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{reservation.guests || reservation.numberOfGuests || 0} guests</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
              <Icon name="map-pin" className="h-4 w-4 text-gray-500" />
              <span className="font-medium">Table {reservation.tableNumber || reservation.tableId || "N/A"}</span>
            </div>
          </div>
          
          {reservation.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 rounded-lg px-3 py-2 w-fit">
              <Icon name="phone" className="h-4 w-4 text-blue-600" />
              <span className="font-medium">{reservation.phone}</span>
            </div>
          )}
        </div>
        
        <button
          onClick={() => navigate(`/reservation/${reservation.bookingID || reservation.id}`)}
          className={`px-5 py-2.5 rounded-xl text-white font-semibold shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 text-sm whitespace-nowrap`}
          style={{
            background: `linear-gradient(135deg, ${buttonColor}, ${buttonHover})`,
          }}
        >
          <span className="flex items-center gap-2">
            View Details
            <Icon name="arrow-right" className="h-4 w-4" />
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen relative"
      style={{
        background:
          "radial-gradient(120% 60% at 50% 0%, rgba(201,26,77,0.16), transparent 55%), #fdf8fa",
      }}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-100/80 bg-white/95 backdrop-blur-xl shadow-sm">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <button
              onClick={() => navigate("/reserve")}
              className="flex items-center gap-2 text-gray-700 hover:text-[var(--grad-start)] transition active:scale-95 touch-manipulation px-3 py-2 rounded-lg hover:bg-gray-100"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <Icon name="arrow-left" className="h-5 w-5" />
              <span className="font-medium text-sm sm:text-base">Back</span>
            </button>
            <h1
              className="text-xl sm:text-2xl font-bold"
              style={{
                background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Reservation Report
            </h1>
            <div className="w-20"></div>
          </div>
        </div>
      </header>

      <div className="px-4 py-8 max-w-7xl mx-auto">
        {/* Date Selector */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl p-5 sm:p-6 border-2 border-gray-100 shadow-lg">
            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--grad-start)] to-[var(--grad-end)] flex items-center justify-center">
                <Icon name="calendar" className="h-5 w-5 text-white" />
              </div>
              <span>Select Date</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full input h-14 text-base sm:text-lg font-medium border-2 border-gray-200 focus:border-[var(--grad-start)] rounded-xl"
            />
            {selectedDate && (
              <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-[var(--grad-start-soft)] to-white border-2 border-[var(--grad-start)] shadow-sm">
                <div className="text-sm font-bold text-[var(--grad-start)] mb-1">
                  Viewing Report For
                </div>
                <div className="text-lg text-gray-800 font-bold">
                  {new Date(selectedDate).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border-2 border-red-200 text-red-700 shadow-sm">
            <div className="flex items-center gap-2">
              <Icon name="alert-circle" className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard
            icon="calendar"
            value={stats.total}
            label="Total"
            gradient="linear-gradient(135deg, #3b82f6, #2563eb)"
            borderColor="#3b82f6"
            delay={0}
          />
          <StatCard
            icon="clock"
            value={stats.upcoming}
            label="Upcoming"
            gradient="linear-gradient(135deg, #3b82f6, #1d4ed8)"
            borderColor="#3b82f6"
            delay={50}
          />
          <StatCard
            icon="check"
            value={stats.arrived}
            label="Arrived"
            gradient="linear-gradient(135deg, #10b981, #059669)"
            borderColor="#10b981"
            delay={100}
          />
          <StatCard
            icon="alert-circle"
            value={stats.noShow}
            label="No Show"
            gradient="linear-gradient(135deg, #ef4444, #dc2626)"
            borderColor="#ef4444"
            delay={150}
          />
          <StatCard
            icon="check-circle"
            value={stats.confirmed}
            label="Confirmed"
            gradient="linear-gradient(135deg, #8b5cf6, #7c3aed)"
            borderColor="#8b5cf6"
            delay={200}
          />
          <StatCard
            icon="x"
            value={stats.cancelled}
            label="Cancelled"
            gradient="linear-gradient(135deg, #6b7280, #4b5563)"
            borderColor="#6b7280"
            delay={250}
          />
        </div>

        {/* Reservations Lists */}
        {loading ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-lg">
            <div className="inline-block w-10 h-10 border-3 border-[var(--grad-start)] border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-600 text-base font-medium">Loading reservations...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Upcoming Reservations */}
            {groupedReservations.upcoming.length > 0 && (
              <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-xl overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-blue-100 bg-gradient-to-r from-blue-50 via-blue-50/50 to-white">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                      <Icon name="clock" className="h-5 w-5 text-white" />
                    </div>
                    <span>Upcoming Reservations</span>
                    <span className="ml-auto px-3 py-1 bg-blue-600 text-white text-sm font-bold rounded-full">
                      {groupedReservations.upcoming.length}
                    </span>
                  </h2>
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                  {groupedReservations.upcoming.map((reservation) => (
                    <ReservationCard
                      key={reservation.bookingID || reservation.id}
                      reservation={reservation}
                      buttonColor="#3b82f6"
                      buttonHover="#2563eb"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Arrived Reservations */}
            {groupedReservations.arrived.length > 0 && (
              <div className="bg-white rounded-2xl border-2 border-green-200 shadow-xl overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-green-100 bg-gradient-to-r from-green-50 via-green-50/50 to-white">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-md">
                      <Icon name="check-circle" className="h-5 w-5 text-white" />
                    </div>
                    <span>Arrived Reservations</span>
                    <span className="ml-auto px-3 py-1 bg-green-600 text-white text-sm font-bold rounded-full">
                      {groupedReservations.arrived.length}
                    </span>
                  </h2>
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                  {groupedReservations.arrived.map((reservation) => (
                    <ReservationCard
                      key={reservation.bookingID || reservation.id}
                      reservation={reservation}
                      buttonColor="#10b981"
                      buttonHover="#059669"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* No Show Reservations */}
            {groupedReservations.noShow.length > 0 && (
              <div className="bg-white rounded-2xl border-2 border-red-200 shadow-xl overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-red-100 bg-gradient-to-r from-red-50 via-red-50/50 to-white">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md">
                      <Icon name="alert-circle" className="h-5 w-5 text-white" />
                    </div>
                    <span>No Show Reservations</span>
                    <span className="ml-auto px-3 py-1 bg-red-600 text-white text-sm font-bold rounded-full">
                      {groupedReservations.noShow.length}
                    </span>
                  </h2>
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                  {groupedReservations.noShow.map((reservation) => (
                    <ReservationCard
                      key={reservation.bookingID || reservation.id}
                      reservation={reservation}
                      buttonColor="#ef4444"
                      buttonHover="#dc2626"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Cancelled Reservations */}
            {groupedReservations.cancelled.length > 0 && (
              <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 via-gray-50/50 to-white">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center shadow-md">
                      <Icon name="x" className="h-5 w-5 text-white" />
                    </div>
                    <span>Cancelled Reservations</span>
                    <span className="ml-auto px-3 py-1 bg-gray-600 text-white text-sm font-bold rounded-full">
                      {groupedReservations.cancelled.length}
                    </span>
                  </h2>
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                  {groupedReservations.cancelled.map((reservation) => (
                    <ReservationCard
                      key={reservation.bookingID || reservation.id}
                      reservation={reservation}
                      buttonColor="#6b7280"
                      buttonHover="#4b5563"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {reservations.length === 0 && !loading && (
              <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-300 shadow-lg">
                <div className="text-6xl mb-4">📅</div>
                <p className="text-gray-700 font-bold text-lg mb-2">No reservations found</p>
                <p className="text-sm text-gray-500">
                  There are no reservations for the selected date.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
