// frontend/src/pages/ReportsPage.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
// Backend fetch imports - will be added back after cleanup
// import { getAllReservations, updateReservationStatus } from "../services/reservation.service";
// import { getMockReservations, updateMockReservationStatus } from "../services/reservation.mock";
import BottomNav from "../component/reservation/BottomNav";
import { 
  ArrowLeft, 
  Home, 
  Search, 
  ListFilter, 
  Clock, 
  Globe, 
  CheckCircle2, 
  Hand, 
  Armchair, 
  LogOut, 
  XCircle, 
  UserX, 
  Phone, 
  Users, 
  Hash,
  ChevronRight,
  Loader2,
  Calendar,
  CalendarRange,
  UserRound,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sun,
  Moon,
} from "lucide-react";

// Mock data removed - using backend API only

// tiny className helper (no external deps)
const cn = (...classes) => classes.filter(Boolean).join(" ");

export default function ReportsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [dateMode, setDateMode] = useState("single"); // "single" or "range"
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  // all, upcoming, cancelled, no-show, left, online, walkins, confirmed, arrived, seated...
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState("none"); // none, hour, day
  const [sortBy, setSortBy] = useState("time"); // time, date, name
  const [sortOrder, setSortOrder] = useState("asc"); // asc, desc

  const [reservations, setReservations] = useState([]);
  const [allReservations, setAllReservations] = useState([]); // Store all reservations for counting
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const prevLocationRef = useRef(location.pathname);

  // ===== helpers =====
  const formatNumber = (num) => {
    if (num === null || num === undefined) return "0";
    return Number(num).toLocaleString("en-US");
  };

  const formatTime = (timeString) => {
    if (!timeString) return "—";
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString + "T00:00:00");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

  // Helper to check if reservation is walk-in
  const isWalkIn = (r) =>
    (r.isWalkIn || r.IsWalkIn) || ((r.bookingSource || r.BookingSource || "").toUpperCase() === "WALKIN");

  const getTableLabel = (r) => {
    const tableName = r.tableName || r.TableName;
    const tableNo = r.tableNo || r.TableNO;
    const tableId = r.tableId || r.TableID;
    if (tableName) return tableName;
    if (tableNo) return `Table ${tableNo}`;
    if (tableId && tableId !== 0) return `Table ${tableId}`;
    return "Unassigned";
  };

  // Single source of truth for effective status calculation
  // Child status (BookingChild.Status) always wins over master status (BookingMaster.BookingStatus)
  const getEffectiveStatus = (res) => {
    const childStatus = (res.status || res.Status || "").toUpperCase().trim();
    const masterStatus = (res.bookingStatus || res.BookingStatus || "").toUpperCase().trim();
    return childStatus || masterStatus; // child always wins
  };

  const getStatusChip = (status) => {
    const s = (status || "").toUpperCase();
    const map = {
      BOOKED: { label: "Booked", cls: "border-amber-200 bg-amber-50 text-amber-800" },
      PENDING: { label: "Pending", cls: "border-amber-200 bg-amber-50 text-amber-800" },
      CONFIRMED: { label: "Confirmed", cls: "border-blue-200 bg-blue-50 text-blue-800" },
      ARRIVED: { label: "Arrived", cls: "border-purple-200 bg-purple-50 text-purple-800" },
      SEATED: { label: "Seated", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
      LEFT: { label: "Left", cls: "border-orange-200 bg-orange-50 text-orange-800" },
      CANCELLED: { label: "Cancelled", cls: "border-red-200 bg-red-50 text-red-800" },
      CANCELLED_NOTIFY: { label: "Cancelled", cls: "border-red-200 bg-red-50 text-red-800" },
      NO_SHOW: { label: "No Show", cls: "border-gray-200 bg-gray-100 text-gray-700" },
    };
    return map[s] || { label: s || "Unknown", cls: "border-gray-200 bg-gray-100 text-gray-700" };
  };

  // ===== data loader =====
  // REMOVED: All fetch logic - will be rebuilt step by step
  // const loadReservations = useCallback(async () => {
  //   // Fetch logic removed - will be added back step by step
  // }, []);
  
  // counts for badges
  const getStatusCount = useCallback((filter) => {
    if (!Array.isArray(allReservations)) return 0;
    if (filter === "all") return allReservations.length;
    
    const now = new Date();
    
    return allReservations.filter((res) => {
      const status = getEffectiveStatus(res);
      const resDate = res.reservationDate || res.ReservationDate;
      const resTime = res.reservationTime || res.ReservationTime;
      
      if (filter === "upcoming") {
        if (!resDate || !resTime) return false;
        const resDateTime = new Date(`${resDate}T${resTime}`);
        const isToday = resDate === new Date().toISOString().split("T")[0];
        if (isToday) {
          return resDateTime > now && status !== "CANCELLED" && status !== "CANCELLED_NOTIFY" && status !== "NO_SHOW" && status !== "LEFT";
        }
        return status !== "CANCELLED" && status !== "CANCELLED_NOTIFY" && status !== "NO_SHOW" && status !== "LEFT";
      }
      
      if (filter === "cancelled") return status === "CANCELLED" || status === "CANCELLED_NOTIFY";
      if (filter === "no-show") return status === "NO_SHOW";
      if (filter === "left") return status === "LEFT";
      if (filter === "online") return ((res.bookingSource || res.BookingSource) || "").toUpperCase() === "GUEST_ONLINE";
      if (filter === "walkins") return isWalkIn(res);
      if (filter === "confirmed") return status === "CONFIRMED" || status === "" || !status;
      if (filter === "arrived") return status === "ARRIVED";
      if (filter === "seated") return status === "SEATED";
      
      return status === filter.toUpperCase();
    }).length;
  }, [allReservations]);

  // ===== effects =====
  // Clear reservations immediately when filter changes (before fetch)
  useEffect(() => {
    setReservations([]);
  }, [statusFilter]);
  
  // Fetch reservations when filters or dates change
  useEffect(() => {
    const fetchReservations = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const { getAllReservations } = await import("../services/reservation.service");
        
        // Determine if this is a backend-filtered status
        const backendFilteredStatuses = ["cancelled", "no-show", "left", "confirmed", "arrived", "seated"];
        const isBackendFiltered = statusFilter !== "all" && backendFilteredStatuses.includes(statusFilter);
        
        // Build filters based on date mode
        const baseFilters = dateMode === "single" 
          ? { date: selectedDate }
          : { fromDate: startDate, toDate: endDate };
        
        // If backend-filtered, add status to API call
        if (isBackendFiltered) {
          const filters = { ...baseFilters, status: statusFilter.toUpperCase() };
          const response = await getAllReservations(filters);
          const data = Array.isArray(response) ? response : response?.reservations || [];
          setReservations(data);
          
          // Also fetch all data for badge counts (without status filter)
          const allResponse = await getAllReservations(baseFilters);
          const allData = Array.isArray(allResponse) ? allResponse : allResponse?.reservations || [];
          setAllReservations(allData);
        } else {
          // Frontend-filtered (all, upcoming, online, walkins) - fetch all data
          const response = await getAllReservations(baseFilters);
          const data = Array.isArray(response) ? response : response?.reservations || [];
          setReservations(data);
          setAllReservations(data); // Same data for badge counts
        }
      } catch (err) {
        console.error("Failed to load reservations:", err);
        setError("Failed to load reservations");
        setReservations([]);
        setAllReservations([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchReservations();
  }, [statusFilter, dateMode, selectedDate, startDate, endDate]);
  
  // Scroll to top when filter or sort changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [statusFilter, sortBy, sortOrder]);

  // ===== stats =====
  const safeReservations = Array.isArray(reservations) ? reservations : [];
  const safeAllReservations = Array.isArray(allReservations) ? allReservations : [];
  
  // Helper to parse time and determine if it's lunch (8 AM - 6 PM) or dinner (after 6 PM)
  const getTimeCategory = (timeString) => {
    if (!timeString) return null;
    try {
      // Handle different time formats (HH:mm, HH:mm:ss, etc.)
      const timeParts = timeString.split(":");
      const hour24 = parseInt(timeParts[0], 10);
      
      if (isNaN(hour24)) return null;
      
      // Lunch: 8 AM (08:00) to 6 PM (18:00) - inclusive of 8 AM, exclusive of 6 PM
      // Dinner: 6 PM (18:00) onwards OR before 8 AM (late night/early morning)
      if (hour24 >= 8 && hour24 < 18) {
        return "lunch";
      } else if (hour24 >= 18 || hour24 < 8) {
        return "dinner";
      }
      return null;
    } catch (e) {
      return null;
    }
  };
  
  const stats = {
    total: safeReservations.length,
    totalGuests: safeReservations.reduce((sum, r) => {
      const guests = parseInt(r.numberOfGuests || r.NumberOfGuests || 0, 10);
      return sum + (isNaN(guests) ? 0 : guests);
    }, 0),
    confirmed: safeReservations.filter((r) => (r.status || r.Status || "").toUpperCase() === "CONFIRMED" || !r.status).length,
    seated: safeReservations.filter((r) => (r.status || r.Status || "").toUpperCase() === "SEATED").length,
    walkInGuests: safeAllReservations.reduce((sum, r) => {
      if (isWalkIn(r)) {
        const guests = parseInt(r.numberOfGuests || r.NumberOfGuests || 0, 10);
        return sum + (isNaN(guests) ? 0 : guests);
      }
      return sum;
    }, 0),
    walkInCount: safeAllReservations.filter((r) => isWalkIn(r)).length,
    // Lunch reservations (8 AM to 6 PM)
    lunchReservations: safeAllReservations.filter((r) => {
      const time = r.reservationTime || r.ReservationTime;
      return getTimeCategory(time) === "lunch";
    }).length,
    lunchGuests: safeAllReservations.reduce((sum, r) => {
      const time = r.reservationTime || r.ReservationTime;
      if (getTimeCategory(time) === "lunch") {
        const guests = parseInt(r.numberOfGuests || r.NumberOfGuests || 0, 10);
        return sum + (isNaN(guests) ? 0 : guests);
      }
      return sum;
    }, 0),
    // Dinner reservations (after 6 PM)
    dinnerReservations: safeAllReservations.filter((r) => {
      const time = r.reservationTime || r.ReservationTime;
      return getTimeCategory(time) === "dinner";
    }).length,
    dinnerGuests: safeAllReservations.reduce((sum, r) => {
      const time = r.reservationTime || r.ReservationTime;
      if (getTimeCategory(time) === "dinner") {
        const guests = parseInt(r.numberOfGuests || r.NumberOfGuests || 0, 10);
        return sum + (isNaN(guests) ? 0 : guests);
      }
      return sum;
    }, 0),
  };

  // ===== actions =====
  // REMOVED: All status update functions - will be added back step by step
  const handleMarkArrived = async (reservation) => {
    alert("Functionality removed - will be rebuilt");
  };

  const handleSeat = async (reservation) => {
    if (!reservation.tableId && !reservation.TableID) {
      if (confirm("No table assigned. Would you like to assign a table now?")) {
        navigate(`/table-action/select?reservationId=${reservation.reservationId || reservation.bookingID}`);
      }
      return;
    }
    alert("Functionality removed - will be rebuilt");
  };

  const handleMarkLeft = async (reservation) => {
    alert("Functionality removed - will be rebuilt");
  };

  // ===== card renderer =====
  const renderReservationCard = (reservation, index) => {
    const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID || reservation.ReservationID;
    // Use single source of truth for status
    const status = getEffectiveStatus(reservation);
    const isProcessing = processingId === reservationId;
    
    const chip = getStatusChip(status);
    const tableLabel = getTableLabel(reservation);

    const canMarkArrived = !["ARRIVED", "SEATED", "CANCELLED", "LEFT", "NO_SHOW"].includes(status);
    const canSeat = ["ARRIVED", "CONFIRMED", "BOOKED", "PENDING", ""].includes(status) && !["SEATED", "CANCELLED", "LEFT"].includes(status);
    const canMarkLeft = ["SEATED", "ARRIVED", "CHECKED_IN"].includes(status) && !["LEFT", "CANCELLED"].includes(status);

    const isOnline = ((reservation.bookingSource || reservation.BookingSource) || "").toUpperCase() === "GUEST_ONLINE";
    const isWalk = isWalkIn(reservation);
    
    return (
      <div
        key={reservationId || index}
        onClick={() => navigate(`/reservation-details?id=${reservationId}`)}
        className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:border-rose-300 cursor-pointer"
      >
        <div className="p-4 md:p-5">
          <div className="flex items-start gap-3">
            {/* left accent */}
            <div className="mt-0.5 h-10 w-10 rounded-xl bg-gradient-to-br from-rose-700 to-pink-600 text-white grid place-items-center shadow-sm">
              <UserRound className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              {/* name + chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-gray-900 truncate">
                  {reservation.customerName || reservation.CustomerName || "Guest"}
                </h3>

                <span className={cn("text-[11px] font-extrabold px-2.5 py-1 rounded-full border", chip.cls)}>
                  {chip.label}
                </span>

                {isOnline && (
                  <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 inline-flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    Online
                  </span>
                )}

                {isWalk && (
                  <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full border border-violet-200 bg-violet-50 text-violet-800 inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Walk-in
                  </span>
                )}
              </div>

              {/* meta row */}
              <div className="mt-2 flex items-center gap-4 flex-wrap text-sm text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-4 h-4" />
                  <span className="font-semibold text-gray-600">
                    {reservation.customerPhone || reservation.CustomerPhone || "—"}
                </span>
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span className="font-semibold text-gray-600">
                    {reservation.numberOfGuests || reservation.NumberOfGuests || reservation.pax || "—"} guests
                </span>
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <Hash className="w-4 h-4" />
                  <span className="font-semibold text-gray-600">{tableLabel}</span>
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span className="font-extrabold text-gray-900">
                    {formatTime(reservation.reservationTime || reservation.ReservationTime)}
                  </span>
                </span>
              </div>

              {/* note */}
              {(reservation.specialRequests || reservation.SpecialRequests) && (
                <p className="mt-2 text-sm text-gray-400 italic line-clamp-1">
                  {reservation.specialRequests || reservation.SpecialRequests}
                </p>
              )}

              {/* actions */}
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {canMarkArrived && (
              <button
                onClick={() => handleMarkArrived(reservation)}
                disabled={isProcessing}
                    className={cn(
                      "h-9 px-4 rounded-xl text-xs font-extrabold border transition-all inline-flex items-center gap-2",
                  isProcessing
                        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                        : "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100"
                    )}
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hand className="w-4 h-4" />}
                    Mark Arrived
              </button>
            )}

            {canSeat && (
              <button
                onClick={() => handleSeat(reservation)}
                disabled={isProcessing}
                    className={cn(
                      "h-9 px-4 rounded-xl text-xs font-extrabold border transition-all inline-flex items-center gap-2",
                  isProcessing
                        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                        : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                    )}
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Armchair className="w-4 h-4" />}
                    Seat Now
              </button>
            )}

            {canMarkLeft && (
              <button
                onClick={() => handleMarkLeft(reservation)}
                disabled={isProcessing}
                    className={cn(
                      "h-9 px-4 rounded-xl text-xs font-extrabold border transition-all inline-flex items-center gap-2",
                  isProcessing
                        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                        : "bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100"
                    )}
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                    Mark Left
              </button>
            )}
              </div>
            </div>

            {/* right time + arrow */}
            <div className="shrink-0 flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <p className="text-lg font-extrabold bg-gradient-to-r from-rose-700 to-pink-600 bg-clip-text text-transparent">
                  {formatTime(reservation.reservationTime || reservation.ReservationTime)}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-rose-600 transition-colors" />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ===== UI configs =====
  const statusFilters = [
    { value: "all", label: "All", icon: ListFilter },
    { value: "upcoming", label: "Upcoming", icon: Clock },
    { value: "online", label: "Online", icon: Globe },
    { value: "walkins", label: "Walk-ins", icon: Users },
    { value: "confirmed", label: "Confirmed", icon: CheckCircle2 },
    { value: "arrived", label: "Arrived", icon: Hand },
    { value: "seated", label: "Seated", icon: Armchair },
    { value: "left", label: "Left", icon: LogOut },
    { value: "cancelled", label: "Cancelled", icon: XCircle },
    { value: "no-show", label: "No Show", icon: UserX },
  ];

  const groupOptions = [
    { value: "none", label: "None", icon: ListFilter },
    { value: "hour", label: "By Hour", icon: Clock },
    { value: "day", label: "By Day", icon: Calendar },
  ];

  // Filter for display
  const displayList = useMemo(() => {
    // Start with reservations data
    let filtered = Array.isArray(reservations) ? [...reservations] : [];
    
    // Apply status filter for frontend-filtered statuses (upcoming, online, walkins)
    // Backend-filtered statuses (cancelled, no-show, left, confirmed, arrived, seated) are already filtered
    if (statusFilter !== "all") {
      const backendFilteredStatuses = ["cancelled", "no-show", "left", "confirmed", "arrived", "seated"];
      const isBackendFiltered = backendFilteredStatuses.includes(statusFilter);
      
      if (!isBackendFiltered) {
        // Frontend filtering for: upcoming, online, walkins
        const now = new Date();
        filtered = filtered.filter((res) => {
          const status = getEffectiveStatus(res);
          const resDate = res.reservationDate || res.ReservationDate;
          const resTime = res.reservationTime || res.ReservationTime;
          
          if (statusFilter === "upcoming") {
            if (!resDate || !resTime) return false;
            const resDateTime = new Date(`${resDate}T${resTime}`);
            const isToday = resDate === new Date().toISOString().split("T")[0];
            if (isToday) {
              return resDateTime > now && status !== "CANCELLED" && status !== "CANCELLED_NOTIFY" && status !== "NO_SHOW" && status !== "LEFT";
            }
            return status !== "CANCELLED" && status !== "CANCELLED_NOTIFY" && status !== "NO_SHOW" && status !== "LEFT";
          }
          
          if (statusFilter === "online") {
            return ((res.bookingSource || res.BookingSource) || "").toUpperCase() === "GUEST_ONLINE";
          }
          
          if (statusFilter === "walkins") {
            return isWalkIn(res);
          }
          
          return true;
        });
      }
    }
    
    // Apply search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((r) => {
        const name = (r.customerName || r.CustomerName || "").toLowerCase();
        const phone = (r.customerPhone || r.CustomerPhone || "");
        const tableText = getTableLabel(r).toLowerCase();
        return name.includes(q) || phone.includes(q) || tableText.includes(q);
      });
    }
    
    return filtered;
  }, [reservations, statusFilter, searchQuery]);

  // ===== render =====
  return (
    <div className="min-h-screen bg-[radial-gradient(120%_60%_at_50%_0%,rgba(201,26,77,0.10),transparent_55%),linear-gradient(to_bottom,#fff,#fff)] pb-24">
    {/* End of Selection */}
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/reservation")}
            className="shrink-0 w-11 h-11 rounded-2xl border border-gray-200 bg-white hover:bg-rose-50 hover:border-rose-300 transition-all grid place-items-center"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-gray-900 truncate">Reports</h1>
            <p className="text-sm text-gray-500 truncate">Daily overview for host &amp; reservation team</p>
          </div>

          <button
            onClick={() => navigate("/reservation")}
            className="shrink-0 w-11 h-11 rounded-2xl border border-gray-200 bg-white hover:bg-rose-50 hover:border-rose-300 transition-all grid place-items-center"
            aria-label="Home"
          >
            <Home className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* Top Controls */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex rounded-2xl border border-gray-200 bg-gray-50 p-1">
            <button
              onClick={() => setDateMode("single")}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-extrabold transition-all inline-flex items-center gap-2",
                dateMode === "single"
                      ? "text-white shadow-sm bg-gradient-to-r from-rose-700 to-pink-600"
                      : "text-gray-600 hover:text-gray-800"
                  )}
            >
              <Calendar className="w-4 h-4" />
                  Single
            </button>

            <button
              onClick={() => setDateMode("range")}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-extrabold transition-all inline-flex items-center gap-2",
                dateMode === "range"
                      ? "text-white shadow-sm bg-gradient-to-r from-rose-700 to-pink-600"
                      : "text-gray-600 hover:text-gray-800"
                  )}
            >
              <CalendarRange className="w-4 h-4" />
                  Range
            </button>
          </div>

              <p className="mt-2 text-sm text-gray-500">
                {dateMode === "single"
                  ? `Showing reservations for ${formatDate(selectedDate)}`
                  : `Showing reservations from ${formatDate(startDate)} to ${formatDate(endDate)}`}
              </p>
            </div>

            <div className="w-full md:w-[420px]">
          {dateMode === "single" ? (
            <div className="flex items-center gap-3">
                  <label className="text-sm font-extrabold text-gray-700 w-20">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                    className="flex-1 h-11 px-4 rounded-2xl border-2 border-gray-200 text-sm font-bold focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition-all"
              />
            </div>
          ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-3">
                    <label className="text-sm font-extrabold text-gray-700 w-20 sm:w-auto">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate}
                      className="flex-1 h-11 px-4 rounded-2xl border-2 border-gray-200 text-sm font-bold focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition-all"
                />
              </div>
              <div className="flex items-center gap-3">
                    <label className="text-sm font-extrabold text-gray-700 w-20 sm:w-auto">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                      className="flex-1 h-11 px-4 rounded-2xl border-2 border-gray-200 text-sm font-bold focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition-all"
                />
              </div>
            </div>
          )}
            </div>
          </div>

          {/* Search + group */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search guest / phone / table..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-11 pr-4 rounded-2xl border border-gray-200 bg-gray-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide">Organize</p>
              <div className="inline-flex rounded-2xl border border-gray-200 bg-gray-50 p-1">
                {groupOptions.map((opt) => {
                  const Icon = opt.icon;
                  const active = groupBy === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setGroupBy(opt.value)}
                      className={cn(
                        "px-3 py-2 rounded-xl text-xs font-extrabold transition-all inline-flex items-center gap-2",
                        active ? "text-white bg-gradient-to-r from-rose-700 to-pink-600 shadow-sm" : "text-gray-600 hover:text-gray-800"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  );
                })}
          </div>
        </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <div className="relative overflow-hidden bg-white rounded-3xl border border-gray-200 shadow-sm p-4">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-rose-700 to-pink-600 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-2xl bg-gradient-to-br from-rose-700 to-pink-600 text-white mb-2 shadow-sm">
              <Calendar className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatNumber(stats.total)}</p>
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide">Reservations</p>
          </div>

          <div className="relative overflow-hidden bg-white rounded-3xl border border-gray-200 shadow-sm p-4">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-600 to-cyan-500 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white mb-2 shadow-sm">
              <Users className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatNumber(stats.totalGuests)}</p>
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide">Total Guests</p>
          </div>

          <div className="relative overflow-hidden bg-white rounded-3xl border border-gray-200 shadow-sm p-4">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-emerald-600 to-teal-500 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white mb-2 shadow-sm">
              <Sun className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatNumber(stats.lunchReservations)}</p>
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide">Lunch</p>
            <p className="text-[10px] text-gray-400 mt-0.5 font-bold">({formatNumber(stats.lunchGuests)} guests)</p>
          </div>

          <div className="relative overflow-hidden bg-white rounded-3xl border border-gray-200 shadow-sm p-4">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-600 to-blue-500 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white mb-2 shadow-sm">
              <Moon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatNumber(stats.dinnerReservations)}</p>
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide">Dinner</p>
            <p className="text-[10px] text-gray-400 mt-0.5 font-bold">({formatNumber(stats.dinnerGuests)} guests)</p>
          </div>

          <div className="relative overflow-hidden bg-white rounded-3xl border border-gray-200 shadow-sm p-4">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-500 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 text-white mb-2 shadow-sm">
              <Users className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatNumber(stats.walkInGuests)}</p>
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide">Walk-in Guests</p>
            <p className="text-[10px] text-gray-400 mt-0.5 font-bold">({formatNumber(stats.walkInCount)} walk-ins)</p>
          </div>

          <div className="relative overflow-hidden bg-white rounded-3xl border border-gray-200 shadow-sm p-4">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-amber-600 to-orange-500 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-2xl bg-gradient-to-br from-amber-600 to-orange-500 text-white mb-2 shadow-sm">
              <Armchair className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatNumber(stats.seated)}</p>
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide">Seated</p>
          </div>
        </section>

        {/* Filters */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-rose-700 to-pink-600 text-white grid place-items-center shadow-sm">
                <ListFilter className="w-5 h-5" />
            </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">Filters</p>
                <p className="text-xs text-gray-500 font-semibold">Quickly narrow down your list</p>
          </div>
        </div>

            <div className="flex items-center gap-3">
              {/* Sort By */}
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-gray-500" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="h-10 px-3 rounded-2xl border border-gray-200 bg-white text-xs font-extrabold text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 cursor-pointer"
                >
                  <option value="time">Time</option>
                  <option value="date">Date</option>
                  <option value="name">Name</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                  className={cn(
                    "h-10 w-10 rounded-2xl border border-gray-200 bg-white transition-all inline-flex items-center justify-center",
                    "hover:bg-rose-50 hover:border-rose-300"
                  )}
                  title={`Sort ${sortOrder === "asc" ? "Ascending" : "Descending"}`}
                >
                  {sortOrder === "asc" ? (
                    <ArrowUp className="w-4 h-4 text-gray-700" />
                  ) : (
                    <ArrowDown className="w-4 h-4 text-gray-700" />
                  )}
                </button>
          </div>
          
                  <button
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setGroupBy("none");
                  setSortBy("time");
                  setSortOrder("asc");
                }}
                className="h-10 px-4 rounded-2xl border border-gray-200 bg-white text-sm font-extrabold text-gray-700 hover:bg-rose-50 hover:border-rose-300 transition-all"
              >
                Reset
                  </button>
            </div>
          </div>
          
            <div className="flex flex-wrap gap-2">
            {statusFilters.map((f) => {
              const Icon = f.icon;
              const active = statusFilter === f.value;
              const count = getStatusCount(f.value);
            
            return (
              <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-extrabold border transition-all",
                    active
                      ? "border-rose-300 text-white bg-gradient-to-r from-rose-700 to-pink-600 shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-rose-200"
                  )}
                >
                  <Icon className={cn("w-4 h-4", active ? "text-white" : "text-gray-500")} />
                  {f.label}

                    <span 
                    className={cn(
                      "ml-1 inline-flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold",
                      active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                    )}
                    >
                  {count}
                </span>
              </button>
            );
          })}
            </div>
        </section>

        {/* List */}
        {loading ? (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
            <Loader2 className="w-12 h-12 text-rose-700 animate-spin mx-auto mb-4" />
            <p className="text-gray-600 font-semibold">Loading reservations...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-3xl border border-red-200 shadow-sm p-6 text-center">
            <p className="text-red-700 font-extrabold">{error}</p>
            </div>
        ) : displayList.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 mx-auto mb-4 grid place-items-center">
              <Users className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-extrabold text-gray-900 mb-1">No reservations found</h3>
            <p className="text-sm text-gray-500 font-semibold">Try adjusting filters or search.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              // Group rendering (UI only)
              if (groupBy === "hour") {
                const grouped = {};
                displayList.forEach((res) => {
                  const t = res.reservationTime || res.ReservationTime || "";
                  const hour = t ? t.split(":")[0] : "Unknown";
                  const key = `${hour}:00`;
                  grouped[key] = grouped[key] || [];
                  grouped[key].push(res);
                });

                const sortedHours = Object.keys(grouped).sort((a, b) => {
                  if (a === "Unknown:00") return 1;
                  if (b === "Unknown:00") return -1;
                  return a.localeCompare(b);
                });

                return sortedHours.map((hourKey) => (
                  <div key={hourKey} className="space-y-3">
                    <div className="sticky top-20 z-10 rounded-3xl border border-rose-200 bg-gradient-to-r from-rose-50 to-pink-50 px-5 py-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-rose-700 to-pink-600 text-white grid place-items-center shadow-sm">
                            <Clock className="w-5 h-5" />
                        </div>
                          <div>
                            <p className="text-lg font-extrabold text-gray-900">
                              {hourKey.startsWith("Unknown") ? "Unknown Time" : formatTime(hourKey)}
                            </p>
                            <p className="text-xs font-semibold text-gray-500">Grouped by hour</p>
                          </div>
                        </div>

                        <span className="px-3 py-1.5 rounded-full border border-rose-200 bg-white text-sm font-extrabold text-rose-700">
                          {grouped[hourKey].length}
                        </span>
                      </div>
                    </div>

                    {grouped[hourKey].map((r, idx) => renderReservationCard(r, idx))}
                  </div>
                ));
              }

              if (groupBy === "day") {
                const grouped = {};
                displayList.forEach((res) => {
                  const d = res.reservationDate || res.ReservationDate || res.bookingDate || "";
                  const key = d ? d.split("T")[0] : "Unknown";
                  grouped[key] = grouped[key] || [];
                  grouped[key].push(res);
                });

                const sortedDays = Object.keys(grouped).sort((a, b) => {
                  if (a === "Unknown") return 1;
                  if (b === "Unknown") return -1;
                  return a.localeCompare(b);
                });

                return sortedDays.map((dayKey) => (
                  <div key={dayKey} className="space-y-3">
                    <div className="sticky top-20 z-10 rounded-3xl border border-rose-200 bg-gradient-to-r from-rose-50 to-pink-50 px-5 py-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-rose-700 to-pink-600 text-white grid place-items-center shadow-sm">
                            <Calendar className="w-5 h-5" />
                        </div>
                          <div>
                            <p className="text-lg font-extrabold text-gray-900">
                              {dayKey === "Unknown" ? "Unknown Date" : formatDate(dayKey)}
                            </p>
                            <p className="text-xs font-semibold text-gray-500">Grouped by day</p>
                          </div>
                        </div>

                        <span className="px-3 py-1.5 rounded-full border border-rose-200 bg-white text-sm font-extrabold text-rose-700">
                          {grouped[dayKey].length}
                        </span>
                      </div>
                    </div>

                    {grouped[dayKey].map((r, idx) => renderReservationCard(r, idx))}
                  </div>
                ));
              }

              // none
              return displayList.map((r, idx) => renderReservationCard(r, idx));
            })()}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
