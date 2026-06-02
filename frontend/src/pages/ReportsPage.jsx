// frontend/src/pages/ReportsPage.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
// Backend fetch imports - will be added back after cleanup
// import { getAllReservations, updateReservationStatus } from "../services/reservation.service";
// import { getMockReservations, updateMockReservationStatus } from "../services/reservation.mock";
import BottomNav from "../component/reservation/BottomNav";
import { formatLocalDate } from "../utils/date";
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
  FileDown,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";

// Mock data removed - using backend API only

// tiny className helper (no external deps)
const cn = (...classes) => classes.filter(Boolean).join(" ");
const ACTIVE_EXCLUDED_STATUSES = new Set(["CANCELLED", "CANCELLED_NOTIFY", "NO_SHOW", "LEFT"]);
const isActiveStatus = (status) => !ACTIVE_EXCLUDED_STATUSES.has((status || "").toUpperCase());

export default function ReportsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [dateMode, setDateMode] = useState("single"); // "single" or "range"
  const [selectedDate, setSelectedDate] = useState(formatLocalDate());
  const [startDate, setStartDate] = useState(formatLocalDate());
  const [endDate, setEndDate] = useState(formatLocalDate());

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
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportConfig, setExportConfig] = useState({
    reportType: "current",
    dateMode: "single",
    selectedDate: formatLocalDate(),
    startDate: formatLocalDate(),
    endDate: formatLocalDate(),
    status: "all_active",
    search: "",
  });

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

  const firstValue = (...values) => {
    for (const value of values) {
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return value;
      }
    }
    return "";
  };

  const getReservationId = (r) =>
    firstValue(r.reservationId, r.bookingID, r.BookingID, r.ReservationID, r.id);
  const getReservationDateValue = (r) =>
    firstValue(r.reservationDate, r.ReservationDate, r.bookingDate, r.BookingDate);
  const getReservationTimeValue = (r) =>
    firstValue(r.reservationTime, r.ReservationTime, r.time, r.Time);
  const getCustomerName = (r) =>
    firstValue(r.customerName, r.CustomerName, r.guestName, r.GuestName, r.customerNameFromMaster, r.CustomerNameFromMaster, r.name, r.Name, "Guest");
  const getCustomerPhone = (r) =>
    firstValue(r.customerPhone, r.CustomerPhone, r.guestPhone, r.GuestPhone, r.customerPhoneFromMaster, r.CustomerPhoneFromMaster, r.phone, r.Phone);
  const getCustomerEmail = (r) =>
    firstValue(r.customerEmail, r.CustomerEmail, r.guestEmail, r.GuestEmail, r.customerEmailFromMaster, r.CustomerEmailFromMaster, r.email, r.Email);
  const getGuestCount = (r) =>
    firstValue(r.numberOfGuests, r.NumberOfGuests, r.pax, r.Pax, r.guests, r.Guests, r.partySize, r.PartySize);
  const getSource = (r) => firstValue(r.bookingSource, r.BookingSource, r.source, r.Source);
  const getHostessName = (r) => firstValue(r.hostessName, r.HostessName, r.hostess, r.Hostess);
  const getConfirmationCode = (r) => firstValue(r.confirmationCode, r.ConfirmationCode);
  const getSpecialRequests = (r) => firstValue(r.specialRequests, r.SpecialRequests, r.notes, r.Notes, r.comments, r.Comments);
  const getTags = (r) => firstValue(r.tags, r.Tags);

  // Helper to check if reservation is walk-in
  const isWalkIn = (r) =>
    (r.isWalkIn || r.IsWalkIn) || (String(getSource(r)).toUpperCase() === "WALKIN");

  const getTableLabel = (r) => {
    const tableName = r.tableName || r.TableName;
    const tableNo = r.tableNo || r.TableNO;
    const tableId = r.tableId || r.TableID;
    if (tableName) return tableName;
    if (tableNo) return `Table ${tableNo}`;
    if (tableId && tableId !== 0) return `Table ${tableId}`;
    return "Unassigned";
  };

  // Count tables assigned to a reservation (supports tables array or tableIds)
  const getTableCount = (r) => {
    if (r.tables && Array.isArray(r.tables) && r.tables.length > 0) {
      return r.tables.filter((t) => (t.tableId ?? t.tableID ?? t.TableID) != null && (t.tableId ?? t.tableID ?? t.TableID) !== 0).length;
    }
    if (r.tableIds && String(r.tableIds).trim() && String(r.tableIds) !== "0") {
      return String(r.tableIds)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== "0").length;
    }
    const tid = r.tableId ?? r.TableID;
    return tid != null && tid !== 0 && tid !== "" ? 1 : 0;
  };

  // Single source of truth for effective status calculation
  // Child status (BookingChild.Status) always wins over master status (BookingMaster.BookingStatus)
  const getEffectiveStatus = (res) => {
    const childStatus = (res.status || res.Status || "").toUpperCase().trim();
    const masterStatus = (res.bookingStatus || res.BookingStatus || "").toUpperCase().trim();
    return childStatus || masterStatus; // child always wins
  };

  const isActiveReservation = (res) => isActiveStatus(getEffectiveStatus(res));

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
    if (filter === "all") return allReservations.filter(isActiveReservation).length;
    
    const now = new Date();
    
    return allReservations.filter((res) => {
      const status = getEffectiveStatus(res);
      const resDate = getReservationDateValue(res);
      const resTime = getReservationTimeValue(res);
      
      if (filter === "upcoming") {
        if (!resDate || !resTime) return false;
        const resDateTime = new Date(`${resDate}T${resTime}`);
        const isToday = resDate === formatLocalDate();
        if (isToday) {
          return resDateTime > now && isActiveStatus(status);
        }
        return isActiveStatus(status);
      }
      
      if (filter === "cancelled") return status === "CANCELLED" || status === "CANCELLED_NOTIFY";
      if (filter === "no-show") return status === "NO_SHOW";
      if (filter === "left") return status === "LEFT";
      if (filter === "online") return isActiveStatus(status) && String(getSource(res)).toUpperCase() === "GUEST_ONLINE";
      if (filter === "walkins") return isActiveStatus(status) && isWalkIn(res);
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
        const backendFilteredStatuses = ["confirmed", "arrived", "seated"];
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
  const activeReservations = safeReservations.filter(isActiveReservation);
  const activeAllReservations = safeAllReservations.filter(isActiveReservation);
  
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
    total: activeReservations.length,
    totalGuests: activeReservations.reduce((sum, r) => {
      const guests = parseInt(getGuestCount(r) || 0, 10);
      return sum + (isNaN(guests) ? 0 : guests);
    }, 0),
    confirmed: activeReservations.filter((r) => (r.status || r.Status || "").toUpperCase() === "CONFIRMED" || !r.status).length,
    seated: activeReservations.filter((r) => (r.status || r.Status || "").toUpperCase() === "SEATED").length,
    walkInGuests: activeAllReservations.reduce((sum, r) => {
      if (isWalkIn(r)) {
        const guests = parseInt(getGuestCount(r) || 0, 10);
        return sum + (isNaN(guests) ? 0 : guests);
      }
      return sum;
    }, 0),
    walkInCount: activeAllReservations.filter((r) => isWalkIn(r)).length,
    cancelled: safeAllReservations.filter((r) => {
      const status = getEffectiveStatus(r);
      return status === "CANCELLED" || status === "CANCELLED_NOTIFY";
    }).length,
    noShow: safeAllReservations.filter((r) => getEffectiveStatus(r) === "NO_SHOW").length,
    left: safeAllReservations.filter((r) => getEffectiveStatus(r) === "LEFT").length,
    // Lunch reservations (8 AM to 6 PM)
    lunchReservations: activeAllReservations.filter((r) => {
      const time = getReservationTimeValue(r);
      return getTimeCategory(time) === "lunch";
    }).length,
    lunchGuests: activeAllReservations.reduce((sum, r) => {
      const time = getReservationTimeValue(r);
      if (getTimeCategory(time) === "lunch") {
        const guests = parseInt(getGuestCount(r) || 0, 10);
        return sum + (isNaN(guests) ? 0 : guests);
      }
      return sum;
    }, 0),
    lunchTables: activeAllReservations.reduce((sum, r) => {
      const time = getReservationTimeValue(r);
      if (getTimeCategory(time) === "lunch") return sum + getTableCount(r);
      return sum;
    }, 0),
    // Dinner reservations (after 6 PM)
    dinnerReservations: activeAllReservations.filter((r) => {
      const time = getReservationTimeValue(r);
      return getTimeCategory(time) === "dinner";
    }).length,
    dinnerGuests: activeAllReservations.reduce((sum, r) => {
      const time = getReservationTimeValue(r);
      if (getTimeCategory(time) === "dinner") {
        const guests = parseInt(getGuestCount(r) || 0, 10);
        return sum + (isNaN(guests) ? 0 : guests);
      }
      return sum;
    }, 0),
    dinnerTables: activeAllReservations.reduce((sum, r) => {
      const time = getReservationTimeValue(r);
      if (getTimeCategory(time) === "dinner") return sum + getTableCount(r);
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
    const reservationId = getReservationId(reservation);
    // Use single source of truth for status
    const status = getEffectiveStatus(reservation);
    const isProcessing = processingId === reservationId;
    
    const chip = getStatusChip(status);
    const tableLabel = getTableLabel(reservation);

    const canMarkArrived = !["ARRIVED", "SEATED", "CANCELLED", "LEFT", "NO_SHOW"].includes(status);
    const canSeat = ["ARRIVED", "CONFIRMED", "BOOKED", "PENDING", ""].includes(status) && !["SEATED", "CANCELLED", "LEFT"].includes(status);
    const canMarkLeft = ["SEATED", "ARRIVED", "CHECKED_IN"].includes(status) && !["LEFT", "CANCELLED"].includes(status);

    const isOnline = String(getSource(reservation)).toUpperCase() === "GUEST_ONLINE";
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
                  {getCustomerName(reservation)}
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
                    {getCustomerPhone(reservation) || "—"}
                </span>
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span className="font-semibold text-gray-600">
                    {getGuestCount(reservation) || "—"} guests
                </span>
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <Hash className="w-4 h-4" />
                  <span className="font-semibold text-gray-600">{tableLabel}</span>
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span className="font-extrabold text-gray-900">
                    {formatTime(getReservationTimeValue(reservation))}
                  </span>
                </span>
              </div>

              {/* note */}
              {getSpecialRequests(reservation) && (
                <p className="mt-2 text-sm text-gray-400 italic line-clamp-1">
                  {getSpecialRequests(reservation)}
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
                  {formatTime(getReservationTimeValue(reservation))}
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
    { value: "all", label: "All Active", icon: ListFilter },
    { value: "upcoming", label: "Upcoming", icon: Clock },
    { value: "online", label: "Online", icon: Globe },
    { value: "walkins", label: "Walk-ins", icon: Users },
    { value: "confirmed", label: "Confirmed", icon: CheckCircle2 },
    { value: "arrived", label: "Arrived", icon: Hand },
    { value: "seated", label: "Seated", icon: Armchair },
  ];

  const exceptionFilters = [
    { value: "cancelled", label: "Cancelled", count: stats.cancelled, icon: XCircle, color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
    { value: "no-show", label: "No Show", count: stats.noShow, icon: UserX, color: "text-gray-700", bg: "bg-gray-100", border: "border-gray-200" },
    { value: "left", label: "Left", count: stats.left, icon: LogOut, color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  ];

  const groupOptions = [
    { value: "none", label: "None", icon: ListFilter },
    { value: "hour", label: "By Hour", icon: Clock },
    { value: "day", label: "By Day", icon: Calendar },
  ];

  const exportReportTypes = [
    { value: "current", label: "Current view", hint: "Exports the exact list currently shown on this page." },
    { value: "detailed", label: "Reservation detail", hint: "Full reservation rows with selected date/status/search filters." },
    { value: "summary", label: "Summary report", hint: "Totals for active, guests, lunch, dinner, walk-ins, and exceptions." },
    { value: "status-wise", label: "Status-wise report", hint: "Separate Excel sheets by reservation status." },
    { value: "meal-period", label: "Lunch / Dinner report", hint: "Separate sheets for lunch and dinner reservations." },
    { value: "exceptions", label: "Exception report", hint: "Cancelled, no-show, and left reservations only." },
    { value: "customer", label: "Customer report", hint: "Groups visits by customer name and phone." },
    { value: "table", label: "Table report", hint: "Groups reservations and guests by assigned table." },
  ];

  const exportStatusOptions = [
    { value: "all_active", label: "All Active" },
    { value: "all", label: "All Statuses" },
    { value: "upcoming", label: "Upcoming" },
    { value: "online", label: "Online" },
    { value: "walkins", label: "Walk-ins" },
    { value: "confirmed", label: "Confirmed" },
    { value: "arrived", label: "Arrived" },
    { value: "seated", label: "Seated" },
    { value: "cancelled", label: "Cancelled" },
    { value: "no-show", label: "No Show" },
    { value: "left", label: "Left" },
  ];

  // Filter for display
  const displayList = useMemo(() => {
    // Start with reservations data
    let filtered = Array.isArray(reservations) ? [...reservations] : [];
    
    if (statusFilter === "all") {
      filtered = filtered.filter(isActiveReservation);
    } else {
      const backendFilteredStatuses = ["confirmed", "arrived", "seated"];
      const isBackendFiltered = backendFilteredStatuses.includes(statusFilter);
      
      if (!isBackendFiltered) {
        // Frontend filtering for: upcoming, online, walkins, exceptions
        const now = new Date();
        filtered = filtered.filter((res) => {
          const status = getEffectiveStatus(res);
          const resDate = getReservationDateValue(res);
          const resTime = getReservationTimeValue(res);
          
          if (statusFilter === "upcoming") {
            if (!resDate || !resTime) return false;
            const resDateTime = new Date(`${resDate}T${resTime}`);
            const isToday = resDate === formatLocalDate();
            if (isToday) {
              return resDateTime > now && isActiveStatus(status);
            }
            return isActiveStatus(status);
          }
          
          if (statusFilter === "online") {
            return isActiveStatus(status) && String(getSource(res)).toUpperCase() === "GUEST_ONLINE";
          }
          
          if (statusFilter === "walkins") {
            return isActiveStatus(status) && isWalkIn(res);
          }

          if (statusFilter === "cancelled") {
            return status === "CANCELLED" || status === "CANCELLED_NOTIFY";
          }

          if (statusFilter === "no-show") {
            return status === "NO_SHOW";
          }

          if (statusFilter === "left") {
            return status === "LEFT";
          }
          
          return true;
        });
      }
    }
    
    // Apply search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((r) => {
        const name = String(getCustomerName(r)).toLowerCase();
        const phone = String(getCustomerPhone(r));
        const tableText = getTableLabel(r).toLowerCase();
        return name.includes(q) || phone.includes(q) || tableText.includes(q);
      });
    }
    
    return filtered;
  }, [reservations, statusFilter, searchQuery]);

  // Apply sort controls (same order as export)
  const sortedDisplayList = useMemo(() => {
    const list = [...displayList];
    const mult = sortOrder === "asc" ? 1 : -1;
    const timeOf = (r) => {
      const d = getReservationDateValue(r) || "";
      const t = String(getReservationTimeValue(r) || "00:00").slice(0, 8);
      const ts = Date.parse(`${d}T${t}`);
      return Number.isNaN(ts) ? 0 : ts;
    };
    list.sort((a, b) => {
      if (sortBy === "name") {
        const na = String(getCustomerName(a)).toLowerCase();
        const nb = String(getCustomerName(b)).toLowerCase();
        return mult * na.localeCompare(nb);
      }
      if (sortBy === "date") {
        const da = getReservationDateValue(a) || "";
        const db = getReservationDateValue(b) || "";
        const c = da.localeCompare(db);
        if (c !== 0) return mult * c;
        return mult * (timeOf(a) - timeOf(b));
      }
      return mult * (timeOf(a) - timeOf(b));
    });
    return list;
  }, [displayList, sortBy, sortOrder]);

  const sortReservationRows = useCallback((rows) => {
    const list = [...rows];
    const mult = sortOrder === "asc" ? 1 : -1;
    const timeOf = (r) => {
      const d = getReservationDateValue(r) || "";
      const t = String(getReservationTimeValue(r) || "00:00").slice(0, 8);
      const ts = Date.parse(`${d}T${t}`);
      return Number.isNaN(ts) ? 0 : ts;
    };

    list.sort((a, b) => {
      if (sortBy === "name") {
        const na = String(getCustomerName(a)).toLowerCase();
        const nb = String(getCustomerName(b)).toLowerCase();
        return mult * na.localeCompare(nb);
      }
      if (sortBy === "date") {
        const da = getReservationDateValue(a) || "";
        const db = getReservationDateValue(b) || "";
        const c = da.localeCompare(db);
        if (c !== 0) return mult * c;
        return mult * (timeOf(a) - timeOf(b));
      }
      return mult * (timeOf(a) - timeOf(b));
    });

    return list;
  }, [sortBy, sortOrder]);

  const matchesExportStatus = useCallback((res, filter) => {
    const status = getEffectiveStatus(res);
    const source = String(getSource(res)).toUpperCase();

    if (filter === "all") return true;
    if (filter === "all_active") return isActiveStatus(status);
    if (filter === "upcoming") {
      const resDate = getReservationDateValue(res);
      const resTime = getReservationTimeValue(res);
      if (!resDate || !resTime || !isActiveStatus(status)) return false;
      return new Date(`${resDate}T${resTime}`) > new Date();
    }
    if (filter === "online") return isActiveStatus(status) && source === "GUEST_ONLINE";
    if (filter === "walkins") return isActiveStatus(status) && isWalkIn(res);
    if (filter === "confirmed") return status === "CONFIRMED" || status === "" || !status;
    if (filter === "arrived") return status === "ARRIVED";
    if (filter === "seated") return status === "SEATED";
    if (filter === "cancelled") return status === "CANCELLED" || status === "CANCELLED_NOTIFY";
    if (filter === "no-show") return status === "NO_SHOW";
    if (filter === "left") return status === "LEFT";
    return true;
  }, []);

  const filterExportRows = useCallback((rows, config) => {
    let filtered = Array.isArray(rows) ? [...rows] : [];
    filtered = filtered.filter((r) => matchesExportStatus(r, config.status));

    const q = String(config.search || "").trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((r) => {
        const name = String(getCustomerName(r)).toLowerCase();
        const phone = String(getCustomerPhone(r));
        const tableText = getTableLabel(r).toLowerCase();
        return name.includes(q) || phone.includes(q) || tableText.includes(q);
      });
    }

    return sortReservationRows(filtered);
  }, [matchesExportStatus, sortReservationRows]);

  const getReservationExportRows = useCallback((rows) => rows.map((r) => {
      const status = getEffectiveStatus(r);
      const statusLabel = getStatusChip(status).label;
      const meal = getTimeCategory(getReservationTimeValue(r));
      const mealLabel = meal === "lunch" ? "Lunch" : meal === "dinner" ? "Dinner" : "";
      const requests = String(getSpecialRequests(r) || "").replace(/\r?\n/g, " ");
      return {
        "Reservation ID": getReservationId(r) || "",
        Date: getReservationDateValue(r) || "",
        Time: getReservationTimeValue(r) || "",
        "Meal period": mealLabel,
        "Customer name": getCustomerName(r),
        Phone: getCustomerPhone(r),
        Email: getCustomerEmail(r),
        Guests: getGuestCount(r) || "",
        Table: getTableLabel(r),
        Status: statusLabel,
        Source: getSource(r) || "",
        "Walk-in": isWalkIn(r) ? "Yes" : "No",
        Hostess: getHostessName(r),
        "Confirmation code": getConfirmationCode(r),
        Tags: getTags(r),
        "Special requests": requests,
      };
    }), []);

  const sumGuests = useCallback((items) => items.reduce((sum, r) => {
    const guests = parseInt(getGuestCount(r) || 0, 10);
    return sum + (isNaN(guests) ? 0 : guests);
  }, 0), []);

  const getExportStats = useCallback((rows) => {
    const activeRows = rows.filter(isActiveReservation);
    const lunchRows = activeRows.filter((r) => getTimeCategory(getReservationTimeValue(r)) === "lunch");
    const dinnerRows = activeRows.filter((r) => getTimeCategory(getReservationTimeValue(r)) === "dinner");
    const walkInRows = activeRows.filter(isWalkIn);
    const onlineRows = activeRows.filter((r) => String(getSource(r)).toUpperCase() === "GUEST_ONLINE");
    const confirmedRows = rows.filter((r) => getEffectiveStatus(r) === "CONFIRMED" || !getEffectiveStatus(r));
    const arrivedRows = rows.filter((r) => getEffectiveStatus(r) === "ARRIVED");
    const seatedRows = rows.filter((r) => getEffectiveStatus(r) === "SEATED");
    const cancelledRows = rows.filter((r) => ["CANCELLED", "CANCELLED_NOTIFY"].includes(getEffectiveStatus(r)));
    const noShowRows = rows.filter((r) => getEffectiveStatus(r) === "NO_SHOW");
    const leftRows = rows.filter((r) => getEffectiveStatus(r) === "LEFT");
    const unassignedRows = rows.filter((r) => getTableCount(r) === 0);

    const tableTotal = (items) => items.reduce((sum, r) => sum + getTableCount(r), 0);
    return [
      { Metric: "All records", Count: rows.length, Guests: sumGuests(rows), Tables: tableTotal(rows) },
      { Metric: "Active reservations", Count: activeRows.length, Guests: sumGuests(activeRows), Tables: tableTotal(activeRows) },
      { Metric: "Lunch", Count: lunchRows.length, Guests: sumGuests(lunchRows), Tables: tableTotal(lunchRows) },
      { Metric: "Dinner", Count: dinnerRows.length, Guests: sumGuests(dinnerRows), Tables: tableTotal(dinnerRows) },
      { Metric: "Walk-ins", Count: walkInRows.length, Guests: sumGuests(walkInRows), Tables: tableTotal(walkInRows) },
      { Metric: "Online", Count: onlineRows.length, Guests: sumGuests(onlineRows), Tables: tableTotal(onlineRows) },
      { Metric: "Confirmed", Count: confirmedRows.length, Guests: sumGuests(confirmedRows), Tables: tableTotal(confirmedRows) },
      { Metric: "Arrived", Count: arrivedRows.length, Guests: sumGuests(arrivedRows), Tables: tableTotal(arrivedRows) },
      { Metric: "Seated", Count: seatedRows.length, Guests: sumGuests(seatedRows), Tables: tableTotal(seatedRows) },
      { Metric: "Cancelled", Count: cancelledRows.length, Guests: sumGuests(cancelledRows), Tables: tableTotal(cancelledRows) },
      { Metric: "No Show", Count: noShowRows.length, Guests: sumGuests(noShowRows), Tables: tableTotal(noShowRows) },
      { Metric: "Left", Count: leftRows.length, Guests: sumGuests(leftRows), Tables: tableTotal(leftRows) },
      { Metric: "Unassigned table", Count: unassignedRows.length, Guests: sumGuests(unassignedRows), Tables: 0 },
    ];
  }, [sumGuests]);

  const buildCustomerRows = useCallback((rows) => {
    const grouped = new Map();
    rows.forEach((r) => {
      const name = getCustomerName(r);
      const phone = getCustomerPhone(r);
      const email = getCustomerEmail(r);
      const key = `${phone || email || "no-contact"}|${String(name).toLowerCase()}`;
      const current = grouped.get(key) || {
        "Customer name": name,
        Phone: phone,
        Email: email,
        Reservations: 0,
        Guests: 0,
        "Last visit": "",
        "Walk-ins": 0,
        "Last table": "",
        "Last status": "",
        Hostess: "",
        Cancelled: 0,
        "No Show": 0,
      };
      const date = getReservationDateValue(r) || "";
      current.Reservations += 1;
      current.Guests += parseInt(getGuestCount(r) || 0, 10) || 0;
      if (!current["Last visit"] || date >= current["Last visit"]) {
        current["Last visit"] = date;
        current["Last table"] = getTableLabel(r);
        current["Last status"] = getStatusChip(getEffectiveStatus(r)).label;
        current.Hostess = getHostessName(r);
      }
      current["Walk-ins"] += isWalkIn(r) ? 1 : 0;
      current.Cancelled += ["CANCELLED", "CANCELLED_NOTIFY"].includes(getEffectiveStatus(r)) ? 1 : 0;
      current["No Show"] += getEffectiveStatus(r) === "NO_SHOW" ? 1 : 0;
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => b.Reservations - a.Reservations || a["Customer name"].localeCompare(b["Customer name"]));
  }, []);

  const buildTableRows = useCallback((rows) => {
    const grouped = new Map();
    rows.forEach((r) => {
      const table = getTableLabel(r);
      const current = grouped.get(table) || {
        Table: table,
        Reservations: 0,
        "Active reservations": 0,
        Guests: 0,
        "Customer names": "",
        Phones: "",
        Lunch: 0,
        Dinner: 0,
        Cancelled: 0,
        "No Show": 0,
      };
      const meal = getTimeCategory(getReservationTimeValue(r));
      current.Reservations += 1;
      current["Active reservations"] += isActiveReservation(r) ? 1 : 0;
      current.Guests += parseInt(getGuestCount(r) || 0, 10) || 0;
      const customerName = getCustomerName(r);
      const customerPhone = getCustomerPhone(r);
      if (customerName && !String(current["Customer names"]).split(", ").includes(customerName)) {
        current["Customer names"] = current["Customer names"] ? `${current["Customer names"]}, ${customerName}` : customerName;
      }
      if (customerPhone && !String(current.Phones).split(", ").includes(customerPhone)) {
        current.Phones = current.Phones ? `${current.Phones}, ${customerPhone}` : customerPhone;
      }
      current.Lunch += meal === "lunch" ? 1 : 0;
      current.Dinner += meal === "dinner" ? 1 : 0;
      current.Cancelled += ["CANCELLED", "CANCELLED_NOTIFY"].includes(getEffectiveStatus(r)) ? 1 : 0;
      current["No Show"] += getEffectiveStatus(r) === "NO_SHOW" ? 1 : 0;
      grouped.set(table, current);
    });
    return [...grouped.values()].sort((a, b) => b.Reservations - a.Reservations || a.Table.localeCompare(b.Table));
  }, []);

  const addSheet = useCallback((wb, sheetName, rows, cols = null) => {
    const safeName = String(sheetName || "Sheet").replace(/[\[\]*?:/\\]/g, " ").slice(0, 31);
    const data = rows.length ? rows : [{ Message: "No records found for the selected filters." }];
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = cols || Object.keys(data[0] || {}).map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }, []);

  const detailCols = useMemo(() => [
    { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
    { wch: 26 }, { wch: 18 }, { wch: 28 }, { wch: 8 },
    { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 8 },
    { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 44 },
  ], []);

  const handleOpenExportModal = useCallback(() => {
    setExportError(null);
    setExportConfig({
      reportType: "current",
      dateMode,
      selectedDate,
      startDate,
      endDate,
      status: statusFilter === "all" ? "all_active" : statusFilter,
      search: searchQuery,
    });
    setShowExportModal(true);
  }, [dateMode, selectedDate, startDate, endDate, statusFilter, searchQuery]);

  const normalizeExportConfig = useCallback((config) => {
    if (config.reportType === "exceptions") {
      return {
        ...config,
        status: ["cancelled", "no-show", "left", "all"].includes(config.status) ? config.status : "all",
      };
    }

    if (["summary", "status-wise"].includes(config.reportType) && config.status === "all_active") {
      return { ...config, status: "all" };
    }

    return config;
  }, []);

  const handleExportExcel = useCallback(async () => {
    setExportLoading(true);
    setExportError(null);

    try {
      const activeExportConfig = normalizeExportConfig(exportConfig);
      let sourceRows = [];
      if (activeExportConfig.reportType === "current") {
        sourceRows = sortedDisplayList;
      } else {
        const { getAllReservations } = await import("../services/reservation.service");
        const filters = activeExportConfig.dateMode === "single"
          ? { date: activeExportConfig.selectedDate }
          : { fromDate: activeExportConfig.startDate, toDate: activeExportConfig.endDate };
        const response = await getAllReservations(filters);
        sourceRows = Array.isArray(response) ? response : response?.reservations || [];
      }

      const rows = activeExportConfig.reportType === "current"
        ? sortReservationRows(sourceRows)
        : filterExportRows(sourceRows, activeExportConfig);

      if (!rows.length) {
        setExportError("No records found for the selected export filters.");
        return;
      }

      const wb = XLSX.utils.book_new();
      const reportLabel = exportReportTypes.find((r) => r.value === activeExportConfig.reportType)?.label || "Report";
      addSheet(wb, "Report Info", [
        { Field: "Report", Value: reportLabel },
        { Field: "Date mode", Value: activeExportConfig.dateMode === "single" ? "Single date" : "Date range" },
        { Field: "Date", Value: activeExportConfig.dateMode === "single" ? activeExportConfig.selectedDate : `${activeExportConfig.startDate} to ${activeExportConfig.endDate}` },
        { Field: "Status filter", Value: exportStatusOptions.find((s) => s.value === activeExportConfig.status)?.label || activeExportConfig.status },
        { Field: "Search", Value: activeExportConfig.search || "" },
        { Field: "Records", Value: rows.length },
      ], [{ wch: 18 }, { wch: 34 }]);

      if (activeExportConfig.reportType === "summary") {
        addSheet(wb, "Summary", getExportStats(rows), [{ wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]);
        addSheet(wb, "Reservations", getReservationExportRows(rows), detailCols);
      } else if (activeExportConfig.reportType === "status-wise") {
        addSheet(wb, "Status Summary", getExportStats(rows), [{ wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]);
        ["CONFIRMED", "ARRIVED", "SEATED", "LEFT", "CANCELLED", "CANCELLED_NOTIFY", "NO_SHOW", "BOOKED", "PENDING"].forEach((status) => {
          const statusRows = rows.filter((r) => getEffectiveStatus(r) === status || (status === "CONFIRMED" && !getEffectiveStatus(r)));
          if (statusRows.length) addSheet(wb, getStatusChip(status).label, getReservationExportRows(statusRows), detailCols);
        });
      } else if (activeExportConfig.reportType === "meal-period") {
        addSheet(wb, "Meal Summary", getExportStats(rows), [{ wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]);
        addSheet(wb, "Lunch", getReservationExportRows(rows.filter((r) => getTimeCategory(getReservationTimeValue(r)) === "lunch")), detailCols);
        addSheet(wb, "Dinner", getReservationExportRows(rows.filter((r) => getTimeCategory(getReservationTimeValue(r)) === "dinner")), detailCols);
      } else if (activeExportConfig.reportType === "exceptions") {
        const exceptionRows = rows.filter((r) => ["CANCELLED", "CANCELLED_NOTIFY", "NO_SHOW", "LEFT"].includes(getEffectiveStatus(r)));
        addSheet(wb, "Exception Summary", getExportStats(exceptionRows), [{ wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]);
        addSheet(wb, "Cancelled", getReservationExportRows(exceptionRows.filter((r) => ["CANCELLED", "CANCELLED_NOTIFY"].includes(getEffectiveStatus(r)))), detailCols);
        addSheet(wb, "No Show", getReservationExportRows(exceptionRows.filter((r) => getEffectiveStatus(r) === "NO_SHOW")), detailCols);
        addSheet(wb, "Left", getReservationExportRows(exceptionRows.filter((r) => getEffectiveStatus(r) === "LEFT")), detailCols);
      } else if (activeExportConfig.reportType === "customer") {
        addSheet(wb, "Customers", buildCustomerRows(rows), [
          { wch: 26 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 },
        ]);
        addSheet(wb, "Reservations", getReservationExportRows(rows), detailCols);
      } else if (activeExportConfig.reportType === "table") {
        addSheet(wb, "Tables", buildTableRows(rows), [
          { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 34 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
        ]);
        addSheet(wb, "Reservations", getReservationExportRows(rows), detailCols);
      } else {
        addSheet(wb, "Reservations", getReservationExportRows(rows), detailCols);
      }

      const stamp = activeExportConfig.dateMode === "single"
        ? activeExportConfig.selectedDate
        : `${activeExportConfig.startDate}_to_${activeExportConfig.endDate}`;
      const safeStamp = String(stamp).replace(/[\\/:*?"<>|]/g, "-");
      const safeType = String(activeExportConfig.reportType).replace(/[\\/:*?"<>|]/g, "-");
      XLSX.writeFile(wb, `${safeType}-reservations-report-${safeStamp}.xlsx`);
      setShowExportModal(false);
    } catch (err) {
      console.error("Export report error:", err);
      setExportError(err?.response?.data?.error || err?.message || "Failed to export report.");
    } finally {
      setExportLoading(false);
    }
  }, [
    addSheet,
    buildCustomerRows,
    buildTableRows,
    detailCols,
    exportConfig,
    exportReportTypes,
    exportStatusOptions,
    filterExportRows,
    getExportStats,
    getReservationExportRows,
    normalizeExportConfig,
    sortReservationRows,
    sortedDisplayList,
  ]);

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
            type="button"
            onClick={handleOpenExportModal}
            disabled={loading || exportLoading}
            className={cn(
              "shrink-0 h-11 px-3 sm:px-4 rounded-2xl border text-sm font-extrabold transition-all inline-flex items-center gap-2",
              loading || exportLoading
                ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 hover:border-emerald-300"
            )}
            title="Choose and download an Excel report"
          >
            <FileDown className="w-5 h-5 shrink-0" />
            <span className="hidden sm:inline">Export</span>
          </button>

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
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide">Active Reservations</p>
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
            <p className="text-[10px] text-gray-400 mt-0.5 font-bold">({formatNumber(stats.lunchTables)} tables reserved)</p>
          </div>

          <div className="relative overflow-hidden bg-white rounded-3xl border border-gray-200 shadow-sm p-4">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-600 to-blue-500 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white mb-2 shadow-sm">
              <Moon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatNumber(stats.dinnerReservations)}</p>
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide">Dinner</p>
            <p className="text-[10px] text-gray-400 mt-0.5 font-bold">({formatNumber(stats.dinnerGuests)} guests)</p>
            <p className="text-[10px] text-gray-400 mt-0.5 font-bold">({formatNumber(stats.dinnerTables)} tables reserved)</p>
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

          <button
            type="button"
            onClick={() => setStatusFilter("cancelled")}
            className={cn(
              "relative overflow-hidden rounded-3xl border shadow-sm p-4 text-left transition-all hover:-translate-y-[1px]",
              statusFilter === "cancelled" ? "border-red-300 bg-red-50" : "border-gray-200 bg-white hover:border-red-200"
            )}
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-red-600 to-rose-500 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-2xl bg-gradient-to-br from-red-600 to-rose-500 text-white mb-2 shadow-sm">
              <XCircle className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{formatNumber(stats.cancelled)}</p>
            <p className="text-xs font-extrabold text-gray-500 uppercase tracking-wide">Cancelled</p>
          </button>
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
          
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-gray-500">Active reservations</p>
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

            <div className="mt-5">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-gray-500">Exceptions</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {exceptionFilters.map((f) => {
                  const Icon = f.icon;
                  const active = statusFilter === f.value;

                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setStatusFilter(f.value)}
                      className={cn(
                        "rounded-2xl border p-4 text-left transition-all hover:-translate-y-[1px] hover:shadow-sm",
                        active ? `${f.border} ${f.bg} shadow-sm` : "border-gray-200 bg-white hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", f.bg, f.color)}>
                            <Icon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-extrabold text-gray-900">{f.label}</p>
                            <p className="text-[11px] font-bold text-gray-500">Hidden from active totals</p>
                          </div>
                        </div>
                        <span className={cn("inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-black", active ? "bg-white text-gray-900" : `${f.bg} ${f.color}`)}>
                          {formatNumber(f.count)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
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
        ) : sortedDisplayList.length === 0 ? (
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
                sortedDisplayList.forEach((res) => {
                  const t = getReservationTimeValue(res) || "";
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
                sortedDisplayList.forEach((res) => {
                  const d = getReservationDateValue(res) || "";
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
              return sortedDisplayList.map((r, idx) => renderReservationCard(r, idx));
            })()}
          </div>
        )}
      </div>

      {showExportModal && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 px-0 pb-[88px] pt-8 sm:pb-[96px]">
          <div className="flex max-h-[calc(100dvh-120px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-[28px] border border-gray-200 bg-white shadow-2xl">
            <div className="shrink-0 border-b border-gray-100 bg-white px-4 pb-4 pt-3 sm:px-5">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-300" />
              <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">Excel Export</p>
                <h2 className="mt-1 text-lg font-black text-gray-900">Choose reservation report</h2>
                <p className="mt-1 text-sm font-semibold text-gray-500">Generated from reservation API data for the selected filters.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                disabled={exportLoading}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close export modal"
              >
                <X className="h-5 w-5" />
              </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-6 sm:px-5 sm:py-5 sm:pb-6">
              <div>
                <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-gray-500">Report type</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                  {exportReportTypes.map((type) => {
                    const active = exportConfig.reportType === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setExportConfig((prev) => ({
                          ...prev,
                          reportType: type.value,
                          status: type.value === "exceptions"
                            ? "all"
                            : (["summary", "status-wise"].includes(type.value) && prev.status === "all_active" ? "all" : prev.status),
                        }))}
                        className={cn(
                          "rounded-2xl border p-3 text-left transition-all sm:p-4",
                          active
                            ? "border-emerald-300 bg-emerald-50 shadow-sm"
                            : "border-gray-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className={cn(
                            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                            active ? "border-emerald-600 bg-emerald-600" : "border-gray-300 bg-white"
                          )}>
                            {active && <span className="h-2 w-2 rounded-full bg-white" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-black text-gray-900">{type.label}</span>
                            <span className="mt-1 block text-xs font-semibold leading-4 text-gray-500 sm:leading-5">{type.hint}</span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-500">Date filter</p>
                  <div className="inline-flex rounded-2xl border border-gray-200 bg-white p-1">
                    {[
                      { value: "single", label: "Single" },
                      { value: "range", label: "Range" },
                    ].map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setExportConfig((prev) => ({ ...prev, dateMode: mode.value }))}
                        className={cn(
                          "rounded-xl px-4 py-2 text-xs font-extrabold transition-all",
                          exportConfig.dateMode === mode.value
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "text-gray-600 hover:text-gray-900"
                        )}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {exportConfig.dateMode === "single" ? (
                    <div className="mt-4">
                      <label className="mb-2 block text-xs font-extrabold uppercase tracking-wide text-gray-500">Date</label>
                      <input
                        type="date"
                        value={exportConfig.selectedDate}
                        onChange={(e) => setExportConfig((prev) => ({ ...prev, selectedDate: e.target.value }))}
                        className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-extrabold uppercase tracking-wide text-gray-500">From</label>
                        <input
                          type="date"
                          value={exportConfig.startDate}
                          max={exportConfig.endDate}
                          onChange={(e) => setExportConfig((prev) => ({ ...prev, startDate: e.target.value }))}
                          className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-extrabold uppercase tracking-wide text-gray-500">To</label>
                        <input
                          type="date"
                          value={exportConfig.endDate}
                          min={exportConfig.startDate}
                          onChange={(e) => setExportConfig((prev) => ({ ...prev, endDate: e.target.value }))}
                          className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-500">Reservation filters</p>
                  <label className="mb-2 block text-xs font-extrabold uppercase tracking-wide text-gray-500">Status</label>
                  <select
                    value={exportConfig.status}
                    onChange={(e) => setExportConfig((prev) => ({ ...prev, status: e.target.value }))}
                    disabled={exportConfig.reportType === "current"}
                    className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    {exportStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>

                  <label className="mb-2 mt-4 block text-xs font-extrabold uppercase tracking-wide text-gray-500">Search</label>
                  <input
                    type="text"
                    value={exportConfig.search}
                    onChange={(e) => setExportConfig((prev) => ({ ...prev, search: e.target.value }))}
                    disabled={exportConfig.reportType === "current"}
                    placeholder="Guest / phone / table"
                    className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-800 outline-none placeholder:text-gray-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                  />
                  {exportConfig.reportType === "current" && (
                    <p className="mt-3 text-xs font-semibold leading-5 text-gray-500">
                      Current view uses the filters already applied on the Reports page.
                    </p>
                  )}
                </div>
              </div>

              {exportError && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  {exportError}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                disabled={exportLoading}
                className="h-11 flex-1 rounded-2xl border border-gray-200 bg-white px-5 text-sm font-extrabold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exportLoading}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-600 bg-emerald-600 px-5 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70 sm:flex-none"
              >
                {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Generate Excel
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
