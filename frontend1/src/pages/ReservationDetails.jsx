import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Icon from "../component/Icon";
import { getReservationById, updateReservationStatus } from "../services/reservation.service";

export default function ReservationDetails() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (bookingId) {
      loadReservation();
    }
  }, [bookingId]);

  const loadReservation = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getReservationById(bookingId);
      setReservation(data.reservation);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to load reservation");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!reservation || updating) return;
    
    if (!window.confirm(`Change reservation status to "${newStatus}"?`)) {
      return;
    }

    try {
      setUpdating(true);
      await updateReservationStatus(bookingId, newStatus);
      await loadReservation(); // Reload to get updated status
    } catch (err) {
      alert(err?.response?.data?.error || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const formatTime = (dateTimeStr) => {
    if (!dateTimeStr) return "";
    const date = new Date(dateTimeStr);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (dateTimeStr) => {
    if (!dateTimeStr) return "";
    const date = new Date(dateTimeStr);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusColor = (status) => {
    switch (status?.toUpperCase()) {
      case 'BOOKED':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'CONFIRMED':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'LEFT_MESSAGE':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'ARRIVED':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'CHECKED_IN':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'CANCELLED':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'NO_SHOW':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const statusOptions = [
    { value: 'BOOKED', label: 'Booked', icon: 'calendar' },
    { value: 'CONFIRMED', label: 'Confirmed', icon: 'check' },
    { value: 'LEFT_MESSAGE', label: 'Left Message', icon: 'phone' },
    { value: 'ARRIVED', label: 'Arrived', icon: 'users' },
    { value: 'CHECKED_IN', label: 'Checked In', icon: 'check' },
    { value: 'CANCELLED', label: 'Cancelled', icon: 'x' },
    { value: 'NO_SHOW', label: 'No Show', icon: 'alert-circle' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-3 border-[var(--grad-start)] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-600">Loading reservation...</p>
        </div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">😕</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Reservation Not Found</h2>
          <p className="text-gray-600 mb-4">{error || "The reservation you're looking for doesn't exist."}</p>
          <button
            onClick={() => navigate("/reserve")}
            className="btn-pill"
          >
            <Icon name="arrow-left" className="h-4 w-4 mr-2" />
            Back to Reservations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{
      background: "radial-gradient(120% 60% at 50% 0%, rgba(201,26,77,0.16), transparent 55%), #fdf8fa",
    }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-100/80 bg-white/95 backdrop-blur-xl shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate("/reserve")}
              className="flex items-center gap-2 text-gray-700 hover:text-[var(--grad-start)] transition"
            >
              <Icon name="arrow-left" className="h-5 w-5" />
              <span className="font-medium">Back</span>
            </button>
            <h1 className="text-lg sm:text-xl font-bold" style={{
              background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}>
              Reservation Details
            </h1>
            <div className="w-20"></div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Status Badge */}
        <div className="mb-6">
          <div className={`inline-flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${getStatusColor(reservation.bookingStatus)}`}>
            <div className={`w-3 h-3 rounded-full ${
              reservation.bookingStatus === 'BOOKED' ? 'bg-yellow-500' :
              reservation.bookingStatus === 'CONFIRMED' ? 'bg-blue-500' :
              reservation.bookingStatus === 'LEFT_MESSAGE' ? 'bg-purple-500' :
              reservation.bookingStatus === 'ARRIVED' || reservation.bookingStatus === 'CHECKED_IN' ? 'bg-green-500' :
              reservation.bookingStatus === 'CANCELLED' ? 'bg-red-500' :
              reservation.bookingStatus === 'NO_SHOW' ? 'bg-gray-500' :
              'bg-gray-400'
            }`}></div>
            <span className="font-bold text-sm uppercase">{reservation.bookingStatus}</span>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg overflow-hidden mb-6">
          {/* Customer Info */}
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Icon name="user" className="h-5 w-5" />
              Customer Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Name</label>
                <p className="text-lg font-semibold text-gray-900">{reservation.customerName || "Guest"}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Phone</label>
                <p className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Icon name="phone" className="h-4 w-4 text-gray-400" />
                  {reservation.customerPhone || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Email</label>
                <p className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Icon name="mail" className="h-4 w-4 text-gray-400" />
                  {reservation.customerEmail || "N/A"}
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Party Size</label>
                <p className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Icon name="users" className="h-4 w-4 text-gray-400" />
                  {reservation.partySize} {reservation.partySize === 1 ? 'guest' : 'guests'}
                </p>
              </div>
            </div>
          </div>

          {/* Booking Details */}
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Icon name="calendar" className="h-5 w-5" />
              Booking Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Booking ID</label>
                <p className="text-lg font-semibold text-gray-900">#{reservation.bookingID}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Source</label>
                <p className="text-lg font-semibold text-gray-900">{reservation.bookingSource || "ONLINE"}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Date</label>
                <p className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Icon name="calendar" className="h-4 w-4 text-gray-400" />
                  {formatDate(reservation.bookingDate)}
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Time</label>
                <p className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Icon name="clock" className="h-4 w-4 text-gray-400" />
                  {formatTime(reservation.bookingDate)}
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Created On</label>
                <p className="text-sm text-gray-600">{new Date(reservation.enteredDate).toLocaleString()}</p>
              </div>
              {reservation.advancePayment > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Advance Payment</label>
                  <p className="text-lg font-semibold text-gray-900">${reservation.advancePayment.toFixed(2)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Tables */}
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Icon name="map-pin" className="h-5 w-5" />
              Reserved Tables
            </h2>
            <div className="space-y-3">
              {reservation.tables.map((table) => (
                <div
                  key={table.bookingChildID}
                  className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-gray-900 text-lg">
                        Table {table.tableNo || table.tableID}
                      </p>
                      <p className="text-sm text-gray-600">{table.areaName || "Dining"}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(table.status)}`}>
                      {table.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Status Change Section */}
        <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Icon name="edit" className="h-5 w-5" />
            Change Status
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Update the reservation status to track the customer's progress
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {statusOptions.map((option) => {
              const isCurrentStatus = reservation.bookingStatus?.toUpperCase() === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => !isCurrentStatus && handleStatusChange(option.value)}
                  disabled={isCurrentStatus || updating}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    isCurrentStatus
                      ? `border-[var(--grad-start)] bg-gradient-to-br from-[var(--grad-start-soft)] to-white cursor-default`
                      : "border-gray-200 bg-white hover:border-[var(--grad-start)] hover:shadow-md active:scale-95"
                  } ${updating ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Icon 
                      name={option.icon} 
                      className={`h-6 w-6 ${
                        isCurrentStatus ? "text-[var(--grad-start)]" : "text-gray-600"
                      }`} 
                    />
                    <span className={`text-sm font-semibold ${
                      isCurrentStatus ? "text-[var(--grad-start)]" : "text-gray-700"
                    }`}>
                      {option.label}
                    </span>
                    {isCurrentStatus && (
                      <span className="text-xs text-[var(--grad-start)] font-bold">Current</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

