// frontend/src/pages/ReportsPage.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getAllReservations, updateReservationStatus } from "../services/reservation.service";
import { getMockReservations, updateMockReservationStatus } from "../services/reservation.mock";
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
  CalendarRange
} from "lucide-react";

// Toggle this to use mock data instead of API
const USE_MOCK_DATA = false;

export default function ReportsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [dateMode, setDateMode] = useState("single"); // "single" or "range"
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState("all"); // all, upcoming, cancelled, no-show
  const [searchQuery, setSearchQuery] = useState("");
  const [reservations, setReservations] = useState([]);
  const [allReservations, setAllReservations] = useState([]); // Store all reservations for counting
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const prevLocationRef = useRef(location.pathname);

  // Define loadReservations BEFORE using it in useEffect hooks
  const loadReservations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let data = [];
      
      if (dateMode === "single") {
        // Single date mode
        if (USE_MOCK_DATA) {
          data = getMockReservations({ date: selectedDate });
          data = data.reservations || [];
        } else {
          data = await getAllReservations({ date: selectedDate });
          data = Array.isArray(data) ? data : (data?.reservations || []);
        }
      } else {
        // Date range mode - fetch data for each day in range
        const start = new Date(startDate);
        const end = new Date(endDate);
        const allData = [];
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          try {
            let dayData;
            if (USE_MOCK_DATA) {
              dayData = getMockReservations({ date: dateStr });
              dayData = dayData.reservations || [];
            } else {
              dayData = await getAllReservations({ date: dateStr });
              dayData = Array.isArray(dayData) ? dayData : (dayData?.reservations || []);
            }
            allData.push(...dayData);
          } catch (err) {
            console.error(`Failed to load data for ${dateStr}:`, err);
          }
        }
        data = allData;
      }
      
      // Ensure data is an array
      if (!Array.isArray(data)) {
        data = [];
      }
      
      // Store all reservations
      let filtered = data;
      setAllReservations(filtered);
      
      // Filter by status
      if (statusFilter !== 'all') {
        const now = new Date();
        filtered = filtered.filter(res => {
          const status = (res.status || res.Status || '').toUpperCase();
          const resDate = res.reservationDate || res.ReservationDate;
          const resTime = res.reservationTime || res.ReservationTime;
          
          if (statusFilter === 'upcoming') {
            // Show reservations for selected date that haven't happened yet
            if (!resDate || !resTime) return false;
            const resDateTime = new Date(`${resDate}T${resTime}`);
            const isToday = resDate === new Date().toISOString().split('T')[0];
            // For today: show future reservations, for other dates: show all non-cancelled/no-show
            if (isToday) {
              return resDateTime > now && status !== 'CANCELLED' && status !== 'NO_SHOW' && status !== 'LEFT';
            } else {
              return status !== 'CANCELLED' && status !== 'NO_SHOW' && status !== 'LEFT';
            }
          }
          
          if (statusFilter === 'cancelled') {
            return status === 'CANCELLED' || status === 'CANCELLED_NOTIFY';
          }
          
          if (statusFilter === 'no-show') {
            return status === 'NO_SHOW';
          }
          
          if (statusFilter === 'left') {
            return status === 'LEFT';
          }
          
          if (statusFilter === 'online') {
            return ((res.bookingSource || res.BookingSource) || '').toUpperCase() === 'GUEST_ONLINE';
          }
          
          return status === statusFilter.toUpperCase();
        });
      }
      
      // Sort by time
      filtered.sort((a, b) => {
        if (!a.reservationTime || !b.reservationTime) return 0;
        return a.reservationTime.localeCompare(b.reservationTime);
      });
      
      setReservations(filtered);
    } catch (err) {
      console.error("Failed to load reservations:", err);
      setError("Failed to load reservations");
      setReservations([]);
    } finally {
      setLoading(false);
    }
  }, [dateMode, selectedDate, startDate, endDate, statusFilter]);
  
  // Calculate status counts for filter badges
  const getStatusCount = useCallback((filter) => {
    if (!Array.isArray(allReservations)) return 0;
    
    const now = new Date();
    
    if (filter === 'all') return allReservations.length;
    
    return allReservations.filter(res => {
      const status = (res.status || res.Status || '').toUpperCase();
      const resDate = res.reservationDate || res.ReservationDate;
      const resTime = res.reservationTime || res.ReservationTime;
      
      if (filter === 'upcoming') {
        if (!resDate || !resTime) return false;
        const resDateTime = new Date(`${resDate}T${resTime}`);
        const isToday = resDate === new Date().toISOString().split('T')[0];
        if (isToday) {
          return resDateTime > now && status !== 'CANCELLED' && status !== 'NO_SHOW' && status !== 'LEFT';
        } else {
          return status !== 'CANCELLED' && status !== 'NO_SHOW' && status !== 'LEFT';
        }
      }
      
      if (filter === 'cancelled') {
        return status === 'CANCELLED' || status === 'CANCELLED_NOTIFY';
      }
      
      if (filter === 'no-show') {
        return status === 'NO_SHOW';
      }
      
      if (filter === 'left') {
        return status === 'LEFT';
      }
      
      if (filter === 'online') {
        return ((res.bookingSource || res.BookingSource) || '').toUpperCase() === 'GUEST_ONLINE';
      }
      
      return status === filter.toUpperCase();
    }).length;
  }, [allReservations]);

  // Load reservations
  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  // Reload reservations when navigating back to this page (e.g., from details page)
  useEffect(() => {
    // Check if we navigated back to this page
    const isNavigatingToReports = prevLocationRef.current !== location.pathname && location.pathname === '/reports';
    
    if (isNavigatingToReports) {
      // We're back on the reports page, reload data immediately
      // First immediate refresh
      loadReservations();
      
      // Then refresh multiple times to catch database commits (SQL Server read consistency)
      // SQL Server transactions might not be immediately visible to read queries
      const timeout1 = setTimeout(() => {
        loadReservations();
      }, 500); // First retry after 500ms
      
      const timeout2 = setTimeout(() => {
        loadReservations();
      }, 1500); // Second retry after 1.5s to catch delayed commits
      
      return () => {
        clearTimeout(timeout1);
        clearTimeout(timeout2);
      };
    }
    
    prevLocationRef.current = location.pathname;
  }, [location.pathname, loadReservations]);

  // Reload reservations when page becomes visible (e.g., returning from details page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page became visible, reload data immediately to get latest status updates
        // Immediate refresh
        loadReservations();
        
        // Then refresh again after delay to catch database commits
        const delayedRefresh = setTimeout(() => {
          loadReservations();
        }, 1000); // 1 second delay to catch SQL Server transaction visibility
        
        return () => clearTimeout(delayedRefresh);
      }
    };

    const handleFocus = () => {
      // Reload when window regains focus - immediate refresh
      loadReservations();
      
      // Also refresh after delay to catch any pending commits
      setTimeout(() => {
        loadReservations();
      }, 1000);
    };

    // Also reload immediately when component mounts if page is visible
    if (!document.hidden) {
      // Small delay to ensure component is fully mounted
      const initialTimeout = setTimeout(() => {
        loadReservations();
      }, 100);
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleFocus);

      return () => {
        clearTimeout(initialTimeout);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
      };
    } else {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleFocus);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [loadReservations]);

  // Format number with commas for thousands
  const formatNumber = (num) => {
    if (num === null || num === undefined) return "0";
    return Number(num).toLocaleString('en-US');
  };

  // Format time for display
  const formatTime = (timeString) => {
    if (!timeString) return "—";
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString + "T00:00:00");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

  // Calculate statistics
  const safeReservations = Array.isArray(reservations) ? reservations : [];
  const stats = {
    total: safeReservations.length,
    // FIX: Convert to number to prevent string concatenation
    totalGuests: safeReservations.reduce((sum, r) => {
      const guests = parseInt(r.numberOfGuests || r.NumberOfGuests || 0, 10);
      return sum + (isNaN(guests) ? 0 : guests);
    }, 0),
    confirmed: safeReservations.filter(r => (r.status || r.Status || "").toUpperCase() === "CONFIRMED" || !r.status).length,
    seated: safeReservations.filter(r => (r.status || r.Status || "").toUpperCase() === "SEATED").length
  };

  const handleMarkArrived = async (reservation) => {
    const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
    if (!reservationId) {
      alert("Reservation ID not found");
      return;
    }

    if (!confirm("Mark this reservation as ARRIVED?")) {
      return;
    }

    setProcessingId(reservationId);
    try {
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, "ARRIVED");
      } else {
        const result = await updateReservationStatus(reservationId, "ARRIVED");
        if (!result.ok) {
          throw new Error(result.error || "Failed to update status");
        }
        console.log("[Reports] Status update successful:", result);
      }
      // Update local state immediately
      setReservations(prev => {
        const current = Array.isArray(prev) ? prev : [];
        return current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return rId === reservationId
            ? { ...r, status: "ARRIVED" }
            : r;
        });
      });
      // Reload from database to ensure consistency
      await loadReservations();
    } catch (err) {
      console.error("Failed to mark as arrived:", err);
      const errorMsg = err?.response?.data?.error || err?.message || "Please try again.";
      alert(`Failed to mark as arrived: ${errorMsg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSeat = async (reservation) => {
    const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
    if (!reservationId) {
      alert("Reservation ID not found");
      return;
    }

    // If no table assigned, navigate to table selection
    if (!reservation.tableId && !reservation.TableID) {
      if (confirm("No table assigned. Would you like to assign a table now?")) {
        navigate(`/table-action/select?reservationId=${reservationId}`);
      }
      return;
    }

    if (!confirm("Mark this reservation as SEATED?")) {
      return;
    }

    setProcessingId(reservationId);
    try {
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, "SEATED");
      } else {
        const result = await updateReservationStatus(reservationId, "SEATED");
        if (!result.ok) {
          throw new Error(result.error || "Failed to update status");
        }
        console.log("[Reports] Status update successful:", result);
      }
      // Update local state immediately
      setReservations(prev => {
        const current = Array.isArray(prev) ? prev : [];
        return current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return rId === reservationId
            ? { ...r, status: "SEATED" }
            : r;
        });
      });
      // Reload from database to ensure consistency
      await loadReservations();
    } catch (err) {
      console.error("Failed to seat reservation:", err);
      const errorMsg = err?.response?.data?.error || err?.message || "Please try again.";
      alert(`Failed to seat reservation: ${errorMsg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkLeft = async (reservation) => {
    const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
    if (!reservationId) {
      alert("Reservation ID not found");
      return;
    }

    if (!confirm("Mark this reservation as LEFT?")) {
      return;
    }

    setProcessingId(reservationId);
    try {
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, "LEFT");
      } else {
        const result = await updateReservationStatus(reservationId, "LEFT");
        if (!result.ok) {
          throw new Error(result.error || "Failed to update status");
        }
        console.log("[Reports] Status update successful:", result);
      }
      // Update local state immediately
      setReservations(prev => {
        const current = Array.isArray(prev) ? prev : [];
        return current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return rId === reservationId
            ? { ...r, status: "LEFT" }
            : r;
        });
      });
      // Reload from database to ensure consistency
      await loadReservations();
    } catch (err) {
      console.error("Failed to mark as left:", err);
      const errorMsg = err?.response?.data?.error || err?.message || "Please try again.";
      alert(`Failed to mark as left: ${errorMsg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleStatusChange = async (reservation, newStatus) => {
    const reservationId = reservation.reservationId || reservation.bookingID || reservation.ReservationID;
    if (!reservationId) {
      alert("Reservation ID not found");
      return;
    }

    setProcessingId(reservationId);
    try {
      if (USE_MOCK_DATA) {
        updateMockReservationStatus(reservationId, newStatus);
      } else {
        const result = await updateReservationStatus(reservationId, newStatus);
        if (!result.ok) {
          throw new Error(result.error || "Failed to update status");
        }
        console.log("[Reports] Status update successful:", result);
      }
      // Update local state immediately
      setReservations(prev => {
        const current = Array.isArray(prev) ? prev : [];
        return current.map(r => {
          const rId = r.reservationId || r.bookingID || r.ReservationID;
          return rId === reservationId
            ? { ...r, status: newStatus }
            : r;
        });
      });
      // Reload from database to ensure consistency
      await loadReservations();
    } catch (err) {
      console.error("Failed to update status:", err);
      const errorMsg = err?.response?.data?.error || err?.message || "Please try again.";
      alert(`Failed to update status: ${errorMsg}`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50/50 to-white pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/reservation")}
            className="shrink-0 w-11 h-11 rounded-xl border border-gray-200 bg-transparent hover:bg-rose-50 hover:border-rose-300 transition-all flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">Daily Reports</h1>
            <p className="text-sm text-gray-500">
              Complete overview of all reservations
            </p>
          </div>
          <button
            onClick={() => navigate("/reservation")}
            className="shrink-0 w-11 h-11 rounded-xl border border-gray-200 bg-transparent hover:bg-rose-50 hover:border-rose-300 transition-all flex items-center justify-center"
            aria-label="Home"
          >
            <Home className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        {/* Date Selector */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          {/* Toggle between single date and range */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setDateMode("single")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                dateMode === "single"
                  ? "text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={dateMode === "single" ? { backgroundColor: '#C91A4D' } : {}}
            >
              <Calendar className="w-4 h-4" />
              Single Date
            </button>
            <button
              onClick={() => setDateMode("range")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                dateMode === "range"
                  ? "text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={dateMode === "range" ? { backgroundColor: '#C91A4D' } : {}}
            >
              <CalendarRange className="w-4 h-4" />
              Date Range
            </button>
          </div>

          {/* Date input(s) */}
          {dateMode === "single" ? (
            <div className="flex items-center gap-3">
              <label htmlFor="report-date" className="text-sm font-semibold text-gray-700 min-w-[80px]">
                Report Date:
              </label>
              <input
                id="report-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-medium focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition-all hover:border-gray-300"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label htmlFor="start-date" className="text-sm font-semibold text-gray-700 min-w-[80px]">
                  From Date:
                </label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate}
                  className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-medium focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition-all hover:border-gray-300"
                />
              </div>
              <div className="flex items-center gap-3">
                <label htmlFor="end-date" className="text-sm font-semibold text-gray-700 min-w-[80px]">
                  To Date:
                </label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-medium focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition-all hover:border-gray-300"
                />
              </div>
            </div>
          )}

          {/* Info banner */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <span 
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ backgroundColor: '#FBE6EC', color: '#C91A4D' }}
              >
                <Clock className="w-3.5 h-3.5" />
                Full Day
              </span>
              {dateMode === "single" ? (
                <span>Showing all reservations for {formatDate(selectedDate)}</span>
              ) : (
                <span>Showing all reservations from {formatDate(startDate)} to {formatDate(endDate)}</span>
              )}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-rose-500 to-pink-500 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 text-white mb-2">
              <Calendar className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.total)}</p>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Reservations</p>
          </div>

          <div className="relative overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white mb-2">
              <Users className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.totalGuests)}</p>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Guests</p>
          </div>

          <div className="relative overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white mb-2">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.confirmed)}</p>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Confirmed</p>
          </div>

          <div className="relative overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 opacity-10 rounded-bl-[40px]" />
            <div className="inline-flex p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white mb-2">
              <Armchair className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.seated)}</p>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Seated</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search guest, phone, table..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 border-0 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filter by Status</p>
            <div className="flex flex-wrap gap-2">
          {[
                { value: "all", label: "All", icon: <ListFilter className="w-3.5 h-3.5" /> },
                { value: "upcoming", label: "Upcoming", icon: <Clock className="w-3.5 h-3.5" /> },
                { value: "online", label: "Online", icon: <Globe className="w-3.5 h-3.5" /> },
                { value: "confirmed", label: "Confirmed", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
                { value: "arrived", label: "Arrived", icon: <Hand className="w-3.5 h-3.5" /> },
                { value: "seated", label: "Seated", icon: <Armchair className="w-3.5 h-3.5" /> },
                { value: "left", label: "Left", icon: <LogOut className="w-3.5 h-3.5" /> },
                { value: "cancelled", label: "Cancelled", icon: <XCircle className="w-3.5 h-3.5" /> },
                { value: "no-show", label: "No Show", icon: <UserX className="w-3.5 h-3.5" /> }
              ].map((filter) => {
                const isActive = statusFilter === filter.value;
                const count = getStatusCount(filter.value);
            
            return (
              <button
                    key={filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
                      transition-all duration-200 whitespace-nowrap
                      ${
                        isActive
                          ? "border-2 shadow-md"
                          : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:-translate-y-0.5"
                      }
                    `}
                    style={isActive ? {
                      borderColor: '#C91A4D',
                      backgroundColor: '#FBE6EC',
                      color: '#C91A4D',
                      boxShadow: '0 4px 6px -1px rgba(201, 26, 77, 0.2)'
                    } : {}}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = '#C91A4D';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = '#D1D5DB';
                      }
                    }}
              >
                    {filter.icon}
                    <span>{filter.label}</span>
                    <span 
                      className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-extrabold ml-0.5"
                      style={isActive ? {
                        background: 'linear-gradient(135deg, #7A0026, #C91A4D)',
                        color: '#FFFFFF',
                        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                      } : {
                        backgroundColor: '#E5E7EB',
                        color: '#6B7280'
                      }}
                    >
                  {count}
                </span>
              </button>
            );
          })}
            </div>
          </div>
        </div>

        {/* Reservation List */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            <Loader2 className="w-16 h-16 text-rose-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading reservations...</p>
          </div>
        ) : (Array.isArray(reservations) ? reservations : [])
          .filter(reservation => {
            // Apply search filter
            if (searchQuery) {
              const query = searchQuery.toLowerCase();
              const matchesSearch = (
                (reservation.customerName || reservation.CustomerName || '').toLowerCase().includes(query) ||
                (reservation.customerPhone || reservation.CustomerPhone || '').includes(query) ||
                String(reservation.tableId || reservation.TableID || '').includes(query)
              );
              if (!matchesSearch) return false;
            }
            return true;
          }).length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 mx-auto mb-4 flex items-center justify-center">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">No reservations found</h3>
            <p className="text-sm text-gray-500">
              Try adjusting your filters or selecting a different date/time period.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(Array.isArray(reservations) ? reservations : [])
              .filter(reservation => {
                // Apply search filter
                if (searchQuery) {
                  const query = searchQuery.toLowerCase();
                  const matchesSearch = (
                    (reservation.customerName || reservation.CustomerName || '').toLowerCase().includes(query) ||
                    (reservation.customerPhone || reservation.CustomerPhone || '').includes(query) ||
                    String(reservation.tableId || reservation.TableID || '').includes(query)
                  );
                  if (!matchesSearch) return false;
                }
                return true;
              })
              .map((reservation, index) => {
              const reservationId = reservation.reservationId || reservation.ReservationID;
              const status = (reservation.status || reservation.Status || '').toUpperCase();
              
              // Status configuration
              const statusConfig = {
                BOOKED: { label: "Booked", className: "border-amber-300 bg-amber-50 text-amber-700" },
                PENDING: { label: "Pending", className: "border-amber-300 bg-amber-50 text-amber-700" },
                CONFIRMED: { label: "Confirmed", className: "border-blue-300 bg-blue-50 text-blue-700" },
                ARRIVED: { label: "Arrived", className: "border-purple-300 bg-purple-50 text-purple-700" },
                SEATED: { label: "Seated", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
                LEFT: { label: "Left", className: "border-orange-300 bg-orange-50 text-orange-700" },
                CANCELLED: { label: "Cancelled", className: "bg-red-100 text-red-700 border-red-200" },
                NO_SHOW: { label: "No Show", className: "bg-gray-100 text-gray-600" }
              };
              
              const statusInfo = statusConfig[status] || { label: status || 'Unknown', className: 'bg-gray-100 text-gray-600' };
              const isProcessing = processingId === reservationId;
              
              // Check what actions can be performed
              const canMarkArrived = !["ARRIVED", "SEATED", "CANCELLED", "LEFT", "NO_SHOW"].includes(status);
              const canSeat = ["ARRIVED", "CONFIRMED", "BOOKED", "PENDING", ""].includes(status) && !["SEATED", "CANCELLED", "LEFT"].includes(status);
              const canMarkLeft = ["SEATED", "ARRIVED", "CHECKED_IN"].includes(status) && !["LEFT", "CANCELLED"].includes(status);
              
              return (
                <div
                  key={reservationId || index}
                  onClick={() => navigate(`/reservation-details?id=${reservationId}`)}
                  className="group bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:border-rose-300 transition-all duration-200 cursor-pointer"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Name and badges row */}
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {reservation.customerName || reservation.CustomerName || 'Guest'}
                          </h3>
                          <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${statusInfo.className}`}>
                            {statusInfo.label}
                          </span>
                          {(reservation.bookingSource || reservation.BookingSource) === 'GUEST_ONLINE' && (
                            <span className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-2 py-1 rounded border inline-flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              Online
                            </span>
                          )}
                          {((reservation.isWalkIn || reservation.IsWalkIn) || (reservation.bookingSource || reservation.BookingSource) === 'WALKIN') && (
                            <span className="border-violet-300 bg-violet-50 text-violet-700 text-[10px] font-semibold px-2 py-1 rounded border inline-flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              Walk-in
                            </span>
                          )}
                        </div>
                        {/* Details row */}
                        <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            {reservation.customerPhone || reservation.CustomerPhone || '—'}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {reservation.numberOfGuests || reservation.NumberOfGuests || reservation.pax || '—'} guests
                          </span>
                          <span className="inline-flex items-center gap-1 font-medium text-gray-900">
                            <Clock className="w-3.5 h-3.5" />
                            {formatTime(reservation.reservationTime || reservation.ReservationTime)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5" />
                            {reservation.tableId || reservation.TableID || 'Unassigned'}
                          </span>
                        </div>
                        {/* Special requests */}
                        {reservation.specialRequests && (
                          <p className="mt-2 text-sm text-gray-400 italic line-clamp-1">
                            {reservation.specialRequests}
                          </p>
                        )}
                      </div>
                      {/* Time display and arrow */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className="text-lg font-bold text-rose-600">
                            {formatTime(reservation.reservationTime || reservation.ReservationTime)}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-rose-600 transition-colors" />
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      {canMarkArrived && (
                        <button
                          onClick={() => handleMarkArrived(reservation)}
                          disabled={isProcessing}
                          className={`h-8 px-4 text-xs rounded-lg border transition-all ${
                            isProcessing
                              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                              : "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 hover:text-purple-800"
                          }`}
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />
                              Processing...
                            </>
                          ) : "Mark Arrived"}
                        </button>
                      )}
                      {canSeat && (
                        <button
                          onClick={() => handleSeat(reservation)}
                          disabled={isProcessing}
                          className={`h-8 px-4 text-xs rounded-lg border transition-all ${
                            isProcessing
                              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                              : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                          }`}
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />
                              Processing...
                            </>
                          ) : "Seat Now"}
                        </button>
                      )}
                      {canMarkLeft && (
                        <button
                          onClick={() => handleMarkLeft(reservation)}
                          disabled={isProcessing}
                          className={`h-8 px-4 text-xs rounded-lg border transition-all ${
                            isProcessing
                              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                              : "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:text-orange-800"
                          }`}
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />
                              Processing...
                            </>
                          ) : "Mark Left"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}

