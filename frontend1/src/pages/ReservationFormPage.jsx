// frontend/src/pages/ReservationFormPage.jsx
// TODO: See RESERVATION_FEATURES_BACKLOG.md for pending features:
// - Table Conflict Checking (overlap detection) - not yet implemented
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReservationStore } from "../store/reservationStore";
// Using mock data for now - backend not connected
// import { createReservation } from "../services/reservation.service";
import BottomNav from "../component/reservation/BottomNav";

export default function ReservationFormPage() {
  const navigate = useNavigate();
  const { selectedDate, tables, areas } = useReservationStore();

  // Hardcoded hostesses for now
  const hostesses = [
    { id: 1, name: "Sarah Johnson" },
    { id: 2, name: "Emily Chen" },
    { id: 3, name: "Michael Brown" },
    { id: 4, name: "Jessica Martinez" }
  ];

  // Reservation tags options
  const tagOptions = [
    "VIP",
    "Birthday",
    "Anniversary",
    "Regular Customer",
    "First Time",
    "Special Occasion",
    "Corporate",
    "Large Party"
  ];

  const [formData, setFormData] = useState({
    firstName: "",
    phone: "",
    email: "",
    cover: 2, // Party size
    section: "", // Area/Floor selection
    comments: "",
    tags: [],
    hostessId: null,
    reservationDate: selectedDate,
    reservationTime: ""
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestedTables, setSuggestedTables] = useState([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState(null); // "morning", "afternoon", "evening", "lateNight"
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [timeMode, setTimeMode] = useState("AM"); // AM or PM
  const [fieldErrors, setFieldErrors] = useState({});

  const today = new Date().toISOString().split("T")[0];
  const coverQuick = [1, 2, 3, 4, 5, 6, 8, 10];

  const selectedHostess = useMemo(
    () => hostesses.find((h) => h.id === formData.hostessId)?.name || "Unassigned",
    [formData.hostessId]
  );

  const selectedAreaName = useMemo(() => {
    if (!formData.section) return "Any section";
    const a = (areas || []).find((x) => (x.areaId || x.AreaID) == formData.section);
    return a?.areaName || a?.AreaName || `Area ${formData.section}`;
  }, [formData.section, areas]);

  // Validation functions
  const validatePhone = (phone) => {
    if (!phone) return false; // Phone is required in reservation
    // Must start with 0, then exactly 9 more digits/letters (total 10 characters)
    const phoneRegex = /^0[a-zA-Z0-9]{9}$/;
    return phoneRegex.test(phone);
  };

  const validateEmail = (email) => {
    if (!email) return true; // Email is optional
    // Standard email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let processedValue = value;
    
    // Phone validation - only allow if starts with 0 and max 11 chars
    if (name === "phone") {
      // Remove any non-alphanumeric
      processedValue = value.replace(/[^0-9a-zA-Z]/g, '');
      // If doesn't start with 0, force it
      if (processedValue && !processedValue.startsWith('0')) {
        processedValue = '0' + processedValue.replace(/^0+/, '');
      }
      // Limit to 10 characters (0 + 9)
      if (processedValue.length > 10) {
        processedValue = processedValue.substring(0, 10);
      }
      
      // Validate
      if (processedValue && !validatePhone(processedValue)) {
        setFieldErrors(prev => ({ ...prev, phone: "Phone must start with 0 and have 9 more digits/letters (10 total)" }));
      } else {
        setFieldErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.phone;
          return newErrors;
        });
      }
    }
    
    // Email validation
    if (name === "email") {
      if (value && !validateEmail(value)) {
        setFieldErrors(prev => ({ ...prev, email: "Please enter a valid email address" }));
      } else {
        setFieldErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.email;
          return newErrors;
        });
      }
    }
    
    setFormData((prev) => ({
      ...prev,
      [name]: name === "cover" ? parseInt(processedValue) || 1 : processedValue
    }));
  };

  const setField = (name, value) => setFormData((p) => ({ ...p, [name]: value }));

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "Select date";
    const date = new Date(dateString + "T00:00:00");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

  // Format time for display
  const formatTime = (timeString) => {
    if (!timeString) return "Select time";
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Calendar helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const handleDateSelect = (date) => {
    if (!date) return;
    const dateString = date.toISOString().split("T")[0];
    setField("reservationDate", dateString);
    setShowDatePicker(false);
  };

  const handleTimeSelect = (hour, minute) => {
    const timeString = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    setField("reservationTime", timeString);
    setShowTimePicker(false);
  };

  const handleTimeConfirm = () => {
    let hour = selectedHour;
    if (timeMode === "PM" && hour !== 12) hour += 12;
    if (timeMode === "AM" && hour === 12) hour = 0;
    handleTimeSelect(hour, selectedMinute);
  };

  const handleOpenTimePicker = () => {
    // Determine period from existing time if available
    if (formData.reservationTime) {
      const [hours, minutes] = formData.reservationTime.split(":");
      const hour = parseInt(hours);
      const minute = parseInt(minutes);
      
      if (hour >= 7 && hour < 12) {
        setSelectedTimePeriod("morning");
      } else if (hour >= 12 && hour < 18) {
        setSelectedTimePeriod("afternoon");
      } else if (hour >= 18 && hour < 24) {
        setSelectedTimePeriod("evening");
      } else if (hour >= 0 && hour < 4) {
        setSelectedTimePeriod("lateNight");
      } else {
        setSelectedTimePeriod(null);
      }
      
      if (hour >= 12) {
        setTimeMode("PM");
        setSelectedHour(hour === 12 ? 12 : hour - 12);
      } else {
        setTimeMode("AM");
        setSelectedHour(hour === 0 ? 12 : hour);
      }
      setSelectedMinute(minute);
    } else {
      setSelectedTimePeriod(null);
      setSelectedHour(12);
      setSelectedMinute(0);
      setTimeMode("PM");
    }
    setShowTimePicker(true);
  };

  // Quick date options
  const getQuickDates = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const thisWeek = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      thisWeek.push(date);
    }
    
    return {
      today: today.toISOString().split("T")[0],
      tomorrow: tomorrow.toISOString().split("T")[0],
      thisWeek
    };
  };

  const quickDates = getQuickDates();

  const navigateMonth = (direction) => {
    setCalendarMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  // Update calendar month when opening date picker
  const handleOpenDatePicker = () => {
    if (formData.reservationDate) {
      setCalendarMonth(new Date(formData.reservationDate + "T00:00:00"));
    }
    setShowDatePicker(true);
  };

  const handleTagToggle = (tag) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag]
    }));
  };

  const checkAvailability = async () => {
    if (!formData.reservationDate || !formData.reservationTime || !formData.cover) {
      setError("Please fill Date, Time and Cover first.");
      return;
    }

    setCheckingAvailability(true);
    setError(null);
    setSuggestedTables([]);

    try {
      const available = (tables || []).filter((t) => {
        const capacity = t.capacity || t.seats || 0;
        const areaOk = formData.section ? (t.areaId || t.AreaID) == formData.section : true;
        return capacity >= formData.cover && areaOk;
      });

      const sorted = available.sort((a, b) => {
        const aCap = a.capacity || a.seats || 0;
        const bCap = b.capacity || b.seats || 0;
        return (aCap - formData.cover) - (bCap - formData.cover);
      });

      setSuggestedTables(sorted.slice(0, 9));
    } catch {
      setError("Failed to check availability");
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();

    if (!formData.firstName || !formData.phone || !formData.reservationDate || !formData.reservationTime) {
      setError("Please fill required fields: Name, Phone, Date, Time.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Using mock data - simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Generate a dummy reservation ID
      const reservationId = `R-${Date.now()}`;
      
      // Navigate to success page with data
      const params = new URLSearchParams({
        id: reservationId,
        name: formData.firstName || '',
        phone: formData.phone || '',
        email: formData.email || '',
        guests: formData.cover || '',
        date: formData.reservationDate || '',
        time: formData.reservationTime || '',
        tableId: formData.selectedTableId || '',
        tableName: formData.selectedTableName || '',
        comments: formData.comments || ''
      });
      navigate(`/reservation-success?${params.toString()}`);
    } catch (err) {
      setError(err?.message || "Failed to create reservation");
    } finally {
      setLoading(false);
    }
  };

  // ---------------- UI styles (hostess/tablet friendly, less scrolling) ----------------
  const S = {
    page: {
      minHeight: "100vh",
      background: "radial-gradient(120% 60% at 50% 0%, rgba(201,26,77,0.16), transparent 55%), #fdf8fa",
      display: "flex",
      flexDirection: "column",
      paddingBottom: 140 // space for sticky actions + BottomNav
    },
    header: {
      background: "#ffffff",
      borderBottom: "1px solid #e5e7eb",
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      position: "sticky",
      top: 0,
      zIndex: 20,
      boxShadow: "0 1px 6px rgba(0,0,0,0.06)"
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      border: "1px solid #e5e7eb",
      background: "#f9fafb",
      cursor: "pointer",
      display: "grid",
      placeItems: "center"
    },
    titleWrap: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
    title: { margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" },
    subtitle: { margin: 0, fontSize: 13.5, fontWeight: 600, color: "#6b7280" },

    container: { maxWidth: 1100, width: "100%", margin: "0 auto" },
    content: { padding: 16, display: "grid", gap: 14 },

    error: {
      padding: "12px 14px",
      borderRadius: 14,
      background: "#fef2f2",
      border: "1px solid #fecaca",
      color: "#b91c1c",
      fontWeight: 700,
      fontSize: 14
    },

    gridResponsive: { display: "grid", gridTemplateColumns: "1fr", gap: 14 },

    card: {
      background: "#fff",
      borderRadius: 18,
      border: "1px solid #e5e7eb",
      boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
      padding: 16
    },

    cardTitleRow: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 12
    },
    cardTitle: { margin: 0, fontSize: 16, fontWeight: 800, color: "#111827" },
    cardHint: { fontSize: 13, fontWeight: 600, color: "#6b7280" },

    label: { display: "block", marginBottom: 8, fontWeight: 700, fontSize: 14, color: "#374151" },
    input: {
      width: "100%",
      padding: "14px 14px",
      borderRadius: 14,
      border: "1px solid #d1d5db",
      fontSize: 16,
      outline: "none",
      background: "#fff",
      boxSizing: "border-box",
      transition: "all 0.2s"
    },
    textarea: {
      width: "100%",
      padding: "14px 14px",
      borderRadius: 14,
      border: "1px solid #d1d5db",
      fontSize: 16,
      outline: "none",
      background: "#fff",
      resize: "vertical",
      boxSizing: "border-box",
      fontFamily: "inherit",
      transition: "all 0.2s"
    },

    // ✅ IMPORTANT: ALWAYS 2 columns (Name|Phone, Date|Time)
    row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },

    chipRow: { display: "flex", flexWrap: "wrap", gap: 10 },
    chip: (active) => ({
      padding: "12px 14px",
      borderRadius: 999,
      border: active ? "2px solid #C91A4D" : "1px solid #d1d5db",
      background: active ? "#FBE6EC" : "#fff",
      color: active ? "#C91A4D" : "#374151",
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer",
      userSelect: "none"
    }),
    chipGreen: (active) => ({
      padding: "12px 14px",
      borderRadius: 999,
      border: active ? "2px solid #C91A4D" : "1px solid #d1d5db",
      background: active ? "#FBE6EC" : "#fff",
      color: active ? "#7A0026" : "#374151",
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer"
    }),

    tablesGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
    tableCard: {
      borderRadius: 16,
      border: "1px solid #e5e7eb",
      background: "#f9fafb",
      padding: 14,
      cursor: "pointer"
    },
    tableTitle: { fontSize: 16, fontWeight: 800, color: "#111827" },
    tableSub: { marginTop: 4, fontSize: 13.5, fontWeight: 600, color: "#6b7280" },

    stickyBar: {
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 70,
      zIndex: 40,
      background: "rgba(255,255,255,0.95)",
      backdropFilter: "blur(10px)",
      borderTop: "1px solid #e5e7eb",
      padding: 12
    },
    stickyInner: { maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr", gap: 10 },
    bigBtn: (kind, disabled) => {
      const base = {
        width: "100%",
        padding: "16px 16px",
        borderRadius: 16,
        fontSize: 16,
        fontWeight: 800,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        touchAction: "manipulation"
      };
      if (kind === "check") {
        return {
          ...base,
          background: disabled ? "#e5e7eb" : "linear-gradient(#fff, #fff) padding-box, linear-gradient(90deg, #7A0026, #C91A4D) border-box",
          color: disabled ? "#9ca3af" : "#C91A4D",
          border: "1.5px solid transparent"
        };
      }
      return {
        ...base,
        background: disabled ? "#d1d5db" : "radial-gradient(160px 80px at 50% 55%, rgba(255,255,255,.22), transparent 60%), linear-gradient(90deg, #7A0026, #C91A4D)",
        color: "#fff",
        boxShadow: disabled ? "none" : "0 8px 24px rgba(201, 26, 77, 0.35)"
      };
    }
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate("/reservation")} style={S.backBtn} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        <div style={S.titleWrap}>
          <h1 style={S.title}>New Reservation</h1>
          <p style={S.subtitle}>
            {formData.reservationDate || "—"} • {formData.reservationTime || "—"} • Cover {formData.cover}
            {" "}• {selectedAreaName} • {selectedHostess}
          </p>
        </div>
        <button
          onClick={() => navigate("/reservation")}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            color: "#6b7280",
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#FBE6EC";
            e.currentTarget.style.borderColor = "#C91A4D";
            e.currentTarget.style.color = "#C91A4D";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#f9fafb";
            e.currentTarget.style.borderColor = "#e5e7eb";
            e.currentTarget.style.color = "#6b7280";
          }}
          aria-label="Home"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
      </div>

      <div style={S.container}>
        <div style={S.content}>
          {error && <div style={S.error}>{error}</div>}

          <div style={S.gridResponsive} className="rf-grid">
            {/* Reservation */}
            <div style={S.card}>
              <div style={S.cardTitleRow}>
                <h2 style={S.cardTitle}>Reservation</h2>
                <span style={S.cardHint}>Date, time & cover</span>
              </div>

              {/* ✅ Date | Time ALWAYS side-by-side */}
              <div style={S.row2} className="rf-datetime-row">
                <div>
                  <label style={S.label}>
                    Date <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleOpenDatePicker}
                    style={{
                      ...S.input,
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: formData.reservationDate ? "#fff" : "#f9fafb",
                      color: formData.reservationDate ? "#111827" : "#9ca3af"
                    }}
                  >
                    <span>{formatDate(formData.reservationDate)}</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C91A4D" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </button>
                </div>

                <div>
                  <label style={S.label}>
                    Time <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleOpenTimePicker}
                    style={{
                      ...S.input,
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: formData.reservationTime ? "#fff" : "#f9fafb",
                      color: formData.reservationTime ? "#111827" : "#9ca3af"
                    }}
                  >
                    <span>{formatTime(formData.reservationTime)}</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C91A4D" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={S.label}>
                  Cover <span style={{ color: "#ef4444" }}>*</span>
                </label>
                {/* Compact Stepper - Under label */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#fff",
                  border: "1px solid #d1d5db",
                  borderRadius: "12px",
                  overflow: "hidden",
                  transition: "all 0.2s",
                  marginTop: "8px"
                }}>
                  {/* Minus Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (formData.cover > 1) {
                        setField("cover", formData.cover - 1);
                      }
                    }}
                    disabled={formData.cover <= 1}
                    style={{
                      width: "44px",
                      height: "44px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: formData.cover <= 1 ? "#f3f4f6" : "#FBE6EC",
                      border: "none",
                      cursor: formData.cover <= 1 ? "not-allowed" : "pointer",
                      transition: "all 0.2s",
                      touchAction: "manipulation",
                      WebkitTapHighlightColor: "transparent",
                      padding: 0
                    }}
                    onMouseEnter={(e) => {
                      if (formData.cover > 1) {
                        e.currentTarget.style.background = "#FDE9EF";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (formData.cover > 1) {
                        e.currentTarget.style.background = "#FBE6EC";
                      }
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={formData.cover <= 1 ? "#9ca3af" : "#C91A4D"} strokeWidth="3" strokeLinecap="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>

                  {/* Value Display */}
                  <div style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: "18px",
                    fontWeight: "800",
                    color: "#111827",
                    padding: "0 4px",
                    minWidth: "40px"
                  }}>
                    {formData.cover}
                  </div>

                  {/* Plus Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setField("cover", formData.cover + 1);
                    }}
                    style={{
                      width: "44px",
                      height: "44px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#FBE6EC",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      touchAction: "manipulation",
                      WebkitTapHighlightColor: "transparent",
                      padding: 0
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#FDE9EF";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#FBE6EC";
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C91A4D" strokeWidth="3" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={S.label}>Section (optional)</label>
                <select
                  name="section"
                  value={formData.section}
                  onChange={handleChange}
                  style={{ ...S.input, cursor: "pointer" }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#C91A4D";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(201, 26, 77, 0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#d1d5db";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <option value="">Any section</option>
                  {(areas || []).map((area) => {
                    const id = area.areaId || area.AreaID;
                    const name = area.areaName || area.AreaName || `Area ${id}`;
                    return (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Guest */}
            <div style={S.card}>
              <div style={S.cardTitleRow}>
                <h2 style={S.cardTitle}>Guest</h2>
                <span style={S.cardHint}>Name & phone required</span>
              </div>

              {/* ✅ Name | Phone ALWAYS side-by-side */}
              <div style={S.row2} className="rf-guest-row">
                <div>
                  <label style={S.label}>
                    Name <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                    placeholder="Guest name"
                    style={S.input}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#C91A4D";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(201, 26, 77, 0.15)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#d1d5db";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                <div>
                  <label style={S.label}>
                    Phone <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    placeholder="05xxxxxxxx (10 digits)"
                    maxLength={10}
                    style={{
                      ...S.input,
                      borderColor: fieldErrors.phone ? "#ef4444" : "#d1d5db"
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = fieldErrors.phone ? "#ef4444" : "#C91A4D";
                      e.currentTarget.style.boxShadow = fieldErrors.phone ? "0 0 0 3px rgba(239, 68, 68, 0.15)" : "0 0 0 3px rgba(201, 26, 77, 0.15)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = fieldErrors.phone ? "#ef4444" : "#d1d5db";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  {fieldErrors.phone && (
                    <div style={{
                      marginTop: "6px",
                      fontSize: "12px",
                      color: "#ef4444",
                      fontWeight: "600"
                    }}>
                      {fieldErrors.phone}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={S.label}>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="guest@email.com"
                  style={{
                    ...S.input,
                    borderColor: fieldErrors.email ? "#ef4444" : "#d1d5db"
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = fieldErrors.email ? "#ef4444" : "#C91A4D";
                    e.currentTarget.style.boxShadow = fieldErrors.email ? "0 0 0 3px rgba(239, 68, 68, 0.15)" : "0 0 0 3px rgba(201, 26, 77, 0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = fieldErrors.email ? "#ef4444" : "#d1d5db";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                {fieldErrors.email && (
                  <div style={{
                    marginTop: "6px",
                    fontSize: "12px",
                    color: "#ef4444",
                    fontWeight: "600"
                  }}>
                    {fieldErrors.email}
                  </div>
                )}
              </div>
            </div>

            {/* Tags + Hostess */}
            <div style={S.card}>
              <div style={S.cardTitleRow}>
                <h2 style={S.cardTitle}>Tags</h2>
                <span style={S.cardHint}>Tap to select</span>
              </div>

              <div style={S.chipRow}>
                {tagOptions.map((tag) => {
                  const active = formData.tags.includes(tag);
                  return (
                    <div key={tag} style={S.chip(active)} onClick={() => handleTagToggle(tag)}>
                      {tag}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ ...S.cardTitleRow, marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#111827" }}>Hostess</h3>
                  <span style={S.cardHint}>Optional</span>
                </div>

                <select
                  value={formData.hostessId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setField("hostessId", v === "" ? null : Number(v));
                  }}
                  style={{ ...S.input, cursor: "pointer" }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#C91A4D";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(201, 26, 77, 0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#d1d5db";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <option value="">Unassigned</option>
                  {hostesses.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Comments */}
            <div style={S.card}>
              <div style={S.cardTitleRow}>
                <h2 style={S.cardTitle}>Comments</h2>
                <span style={S.cardHint}>Special requests</span>
              </div>

              <textarea
                name="comments"
                value={formData.comments}
                onChange={handleChange}
                rows={5}
                placeholder="Allergies, birthday, baby chair, etc."
                style={S.textarea}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#C91A4D";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(201, 26, 77, 0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#d1d5db";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
          </div>

          {/* Suggested Tables */}
          {suggestedTables.length > 0 && (
            <div style={S.card}>
              <div style={S.cardTitleRow}>
                <h2 style={S.cardTitle}>Suggested Tables</h2>
                <span style={S.cardHint}>Tap to set Section</span>
              </div>

              <div style={S.tablesGrid} className="rf-tables">
                {suggestedTables.map((t) => {
                  const label = t.number || t.tableNo || t.id;
                  const cap = t.capacity || t.seats || 0;
                  const areaId = t.areaId || t.AreaID;

                  return (
                    <div
                      key={t.id || t.number || label}
                      style={S.tableCard}
                      onClick={() => {
                        if (areaId) setField("section", String(areaId));
                      }}
                      title={areaId ? `Area ${areaId}` : "No area"}
                    >
                      <div style={S.tableTitle}>Table {label}</div>
                      <div style={S.tableSub}>Seats {cap}</div>
                      {areaId ? <div style={S.tableSub}>Area {areaId}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Actions */}
      <div style={S.stickyBar}>
        <div style={S.stickyInner} className="rf-actions">
          <button
            type="button"
            onClick={checkAvailability}
            disabled={checkingAvailability}
            style={S.bigBtn("check", checkingAvailability)}
            onMouseEnter={(e) => {
              if (!checkingAvailability) {
                e.currentTarget.style.background = "linear-gradient(#fff, #fff) padding-box, linear-gradient(90deg, #C91A4D, #7A0026) border-box";
                e.currentTarget.style.color = "#7A0026";
              }
            }}
            onMouseLeave={(e) => {
              if (!checkingAvailability) {
                e.currentTarget.style.background = "linear-gradient(#fff, #fff) padding-box, linear-gradient(90deg, #7A0026, #C91A4D) border-box";
                e.currentTarget.style.color = "#C91A4D";
              }
            }}
          >
            {checkingAvailability ? "Checking Availability..." : "Check Availability"}
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            style={S.bigBtn("save", loading)}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "radial-gradient(160px 80px at 50% 55%, rgba(255,255,255,.24), transparent 60%), linear-gradient(90deg, #C91A4D, #7A0026)";
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 12px 28px rgba(201, 26, 77, 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "radial-gradient(160px 80px at 50% 55%, rgba(255,255,255,.22), transparent 60%), linear-gradient(90deg, #7A0026, #C91A4D)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 8px 24px rgba(201, 26, 77, 0.35)";
              }
            }}
          >
            {loading ? "Creating Reservation..." : "Create Reservation"}
          </button>
        </div>
      </div>

      {/* Date Picker Modal - Enhanced */}
      {showDatePicker && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          background: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)"
        }}
        onClick={() => setShowDatePicker(false)}
        >
          <div style={{
            background: "#fff",
            borderRadius: "24px",
            boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
            width: "100%",
            maxWidth: "420px",
            overflow: "hidden",
            maxHeight: "90vh",
            overflowY: "auto"
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Calendar Header */}
            <div style={{
              padding: "24px 20px",
              background: "linear-gradient(135deg, #7A0026, #C91A4D)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <button
                type="button"
                onClick={() => navigateMonth(-1)}
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  border: "none",
                  background: "rgba(255,255,255,0.25)",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.35)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: "800", letterSpacing: "0.5px" }}>
                  {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigateMonth(1)}
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  border: "none",
                  background: "rgba(255,255,255,0.25)",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.35)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            {/* Quick Date Options */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#6b7280", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Quick Select
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => handleDateSelect(new Date(quickDates.today + "T00:00:00"))}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "12px",
                    border: "none",
                    background: formData.reservationDate === quickDates.today 
                      ? "linear-gradient(135deg, #7A0026, #C91A4D)"
                      : "#FBE6EC",
                    color: formData.reservationDate === quickDates.today ? "#fff" : "#C91A4D",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleDateSelect(new Date(quickDates.tomorrow + "T00:00:00"))}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "12px",
                    border: "none",
                    background: formData.reservationDate === quickDates.tomorrow 
                      ? "linear-gradient(135deg, #7A0026, #C91A4D)"
                      : "#FBE6EC",
                    color: formData.reservationDate === quickDates.tomorrow ? "#fff" : "#C91A4D",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  Tomorrow
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div style={{ padding: "20px" }}>
              {/* Day labels */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "6px",
                marginBottom: "14px"
              }}>
                {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => (
                  <div key={idx} style={{
                    textAlign: "center",
                    fontSize: "13px",
                    fontWeight: "800",
                    color: idx === 0 || idx === 6 ? "#C91A4D" : "#6b7280",
                    padding: "8px 0"
                  }}>
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar days */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "6px"
              }}>
                {getDaysInMonth(calendarMonth).map((date, idx) => {
                  if (!date) {
                    return <div key={`empty-${idx}`} style={{ aspectRatio: "1" }} />;
                  }
                  
                  const dateString = date.toISOString().split("T")[0];
                  const isToday = dateString === today;
                  const isSelected = dateString === formData.reservationDate;
                  const isPast = dateString < today;
                  
                  return (
                    <button
                      key={dateString}
                      type="button"
                      onClick={() => !isPast && handleDateSelect(date)}
                      disabled={isPast}
                      style={{
                        aspectRatio: "1",
                        borderRadius: "14px",
                        border: isToday && !isSelected ? "2px solid #C91A4D" : "none",
                        background: isSelected 
                          ? "linear-gradient(135deg, #7A0026, #C91A4D)"
                          : isToday
                          ? "#FBE6EC"
                          : "transparent",
                        color: isSelected 
                          ? "#fff"
                          : isPast
                          ? "#d1d5db"
                          : "#111827",
                        fontSize: "15px",
                        fontWeight: isSelected ? "800" : isToday ? "700" : "600",
                        cursor: isPast ? "not-allowed" : "pointer",
                        transition: "all 0.2s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative"
                      }}
                      onMouseEnter={(e) => {
                        if (!isPast && !isSelected) {
                          e.currentTarget.style.background = "#FBE6EC";
                          e.currentTarget.style.transform = "scale(1.1)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isPast && !isSelected) {
                          e.currentTarget.style.background = isToday ? "#FBE6EC" : "transparent";
                          e.currentTarget.style.transform = "scale(1)";
                        }
                      }}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Time Picker Modal - Two Step Selection */}
      {showTimePicker && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          background: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)"
        }}
        onClick={() => {
          setShowTimePicker(false);
          setSelectedTimePeriod(null);
        }}
        >
          <div style={{
            background: "#fff",
            borderRadius: "20px",
            boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
            width: "100%",
            maxWidth: "420px",
            maxHeight: "85vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: "20px",
              background: "linear-gradient(135deg, #7A0026, #C91A4D)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: "12px"
            }}>
              <div style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", fontWeight: "600", opacity: 0.9, marginBottom: "2px" }}>Step 2</div>
                <div style={{ fontSize: "18px", fontWeight: "800" }}>
                  {selectedTimePeriod ? "Choose Time" : "Select Period"}
                </div>
              </div>
              {selectedTimePeriod && (
                <button
                  type="button"
                  onClick={() => setSelectedTimePeriod(null)}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    border: "none",
                    background: "rgba(255,255,255,0.2)",
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s",
                    marginRight: "8px"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.3)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowTimePicker(false);
                  setSelectedTimePeriod(null);
                }}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  border: "none",
                  background: "rgba(255,255,255,0.2)",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.3)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
              {!selectedTimePeriod ? (
                /* Step 1: Period Selection */
                <div style={{ display: "grid", gap: "16px" }}>
                  {[
                    { id: "morning", label: "Morning", timeRange: "7:00 AM - 11:30 AM", color: "#F59E0B", icon: "☀️" },
                    { id: "afternoon", label: "Afternoon", timeRange: "12:00 PM - 5:30 PM", color: "#F97316", icon: "🌤️" },
                    { id: "evening", label: "Evening", timeRange: "6:00 PM - 11:30 PM", color: "#A855F7", icon: "🌙" },
                    { id: "lateNight", label: "Late Night", timeRange: "12:00 AM - 3:00 AM", color: "#6366F1", icon: "🌃" }
                  ].map((period) => (
                    <button
                      key={period.id}
                      type="button"
                      onClick={() => setSelectedTimePeriod(period.id)}
                      style={{
                        padding: "20px",
                        borderRadius: "16px",
                        border: "2px solid #e5e7eb",
                        background: "#fff",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                        textAlign: "left",
                        width: "100%"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = period.color;
                        e.currentTarget.style.background = "#f9fafb";
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = `0 4px 12px ${period.color}33`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.background = "#fff";
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <div style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "14px",
                        background: `${period.color}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "28px"
                      }}>
                        {period.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "18px", fontWeight: "800", color: "#111827", marginBottom: "4px" }}>
                          {period.label}
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: "600", color: "#6b7280" }}>
                          {period.timeRange}
                        </div>
                      </div>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={period.color} strokeWidth="2.5">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  ))}
                </div>
              ) : (
                /* Step 2: Time Selection */
                (() => {
                  let times = [];
                  let periodLabel = "";
                  let periodColor = "";

                  if (selectedTimePeriod === "morning") {
                    for (let h = 7; h <= 11; h++) {
                      times.push({ hour: h, minute: 0 });
                      times.push({ hour: h, minute: 30 });
                    }
                    periodLabel = "Morning";
                    periodColor = "#F59E0B";
                  } else if (selectedTimePeriod === "afternoon") {
                    for (let h = 12; h <= 17; h++) {
                      times.push({ hour: h, minute: 0 });
                      times.push({ hour: h, minute: 30 });
                    }
                    periodLabel = "Afternoon";
                    periodColor = "#F97316";
                  } else if (selectedTimePeriod === "evening") {
                    for (let h = 18; h <= 23; h++) {
                      times.push({ hour: h, minute: 0 });
                      times.push({ hour: h, minute: 30 });
                    }
                    periodLabel = "Evening";
                    periodColor = "#A855F7";
                  } else if (selectedTimePeriod === "lateNight") {
                    for (let h = 0; h <= 3; h++) {
                      times.push({ hour: h, minute: 0 });
                      times.push({ hour: h, minute: 30 });
                    }
                    periodLabel = "Late Night";
                    periodColor = "#6366F1";
                  }

                  return (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                        <div style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: periodColor
                        }} />
                        <div style={{ fontSize: "16px", fontWeight: "800", color: "#374151" }}>
                          {periodLabel}
                        </div>
                      </div>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(5, 1fr)",
                        gap: "10px"
                      }}>
                        {times.map(({ hour, minute }) => {
                          const hour24 = hour;
                          const timeValue = `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
                          const isSelected = formData.reservationTime === timeValue;
                          const displayTime = `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
                          
                          return (
                            <button
                              key={timeValue}
                              type="button"
                              onClick={() => handleTimeSelect(hour24, minute)}
                              style={{
                                padding: "14px 10px",
                                borderRadius: "12px",
                                border: "none",
                                background: isSelected 
                                  ? "linear-gradient(135deg, #7A0026, #C91A4D)"
                                  : "#f3f4f6",
                                color: isSelected ? "#fff" : "#374151",
                                fontSize: "14px",
                                fontWeight: isSelected ? "800" : "700",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                boxShadow: isSelected ? "0 2px 8px rgba(201, 26, 77, 0.3)" : "none"
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.background = "#FBE6EC";
                                  e.currentTarget.style.transform = "scale(1.05)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.background = "#f3f4f6";
                                  e.currentTarget.style.transform = "scale(1)";
                                }
                              }}
                            >
                              {displayTime}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      <BottomNav />

      <style>{`
        @media (min-width: 900px) {
          .rf-grid {
            grid-template-columns: 1fr 1fr;
            align-items: start;
          }
          .rf-actions {
            grid-template-columns: 1fr 1fr;
          }
          .rf-tables {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        /* ✅ Only on very tiny phones stack (otherwise always side-by-side) */
        @media (max-width: 380px) {
          .rf-guest-row,
          .rf-datetime-row {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 420px) {
          .rf-tables {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
