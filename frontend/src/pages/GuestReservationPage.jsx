// frontend/src/pages/GuestReservationPage.jsx
// Minimal reservation-system style (RTL/LTR + Tailwind) + i18n toggle
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getAreas } from "../services/menu.service";
import { createGuestReservation } from "../services/reservation.service";

export default function GuestReservationPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const isAr = i18n.language === "ar";

  const today = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const timeOptions = useMemo(() => {
    // 12:00 -> 23:30 (30-min slots)
    const slots = [];
    for (let h = 12; h <= 23; h++) {
      for (let m of [0, 30]) {
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        slots.push(`${hh}:${mm}`);
      }
    }
    return slots;
  }, []);

  const occasions = useMemo(
    () => [
      { id: "birthday", emoji: "🎂", label: t("reservation.occasions.birthday") },
      { id: "anniversary", emoji: "💑", label: t("reservation.occasions.anniversary") },
      { id: "business", emoji: "💼", label: t("reservation.occasions.business") },
      { id: "dateNight", emoji: "❤️", label: t("reservation.occasions.dateNight") },
      { id: "family", emoji: "👨‍👩‍👧‍👦", label: t("reservation.occasions.family") },
      { id: "celebration", emoji: "🥳", label: t("reservation.occasions.celebration") },
      { id: "casual", emoji: "😊", label: t("reservation.occasions.casual") }
    ],
    [t]
  );

  const [formData, setFormData] = useState({
    reservationDate: "",
    reservationTime: "",
    partySize: 2,
    areaId: "",

    guestName: "",
    phone: "",
    email: "",

    occasion: "",
    specialRequests: ""
  });

  const [areas, setAreas] = useState([]);
  const [loadingAreas, setLoadingAreas] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);

  // Time picker modal state
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState("");

  // Ensure html dir/lang updates when language changes
  useEffect(() => {
    document.documentElement.lang = i18n.language || "en";
    document.documentElement.dir = isAr ? "rtl" : "ltr";
  }, [i18n.language, isAr]);

  // Init defaults
  useEffect(() => {
    setFormData((p) => ({
      ...p,
      reservationDate: p.reservationDate || today,
      reservationTime: p.reservationTime || "20:00"
    }));
  }, [today]);

  // Load areas
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingAreas(true);
        const data = await getAreas();
        if (!alive) return;
        setAreas(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Failed to load areas:", e);
      } finally {
        if (alive) setLoadingAreas(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const setField = (name, value) => {
    setFormData((p) => ({ ...p, [name]: value }));
    if (error) setError("");
  };

  const incGuests = () =>
    setFormData((p) => ({
      ...p,
      partySize: Math.min(30, (p.partySize || 1) + 1)
    }));

  const decGuests = () =>
    setFormData((p) => ({
      ...p,
      partySize: Math.max(1, (p.partySize || 1) - 1)
    }));

  const validate = () => {
    if (!formData.reservationDate) return t("reservation.errors.date");
    if (!formData.reservationTime) return t("reservation.errors.time");
    if (!formData.partySize || Number(formData.partySize) < 1) return t("reservation.errors.guests");
    if (!formData.areaId) return t("reservation.errors.area");
    if (!formData.guestName.trim()) return t("reservation.errors.name");
    if (!formData.phone.trim()) return t("reservation.errors.phone");
    return "";
  };

  const toggleLanguage = () => {
    const next = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(next);
    localStorage.setItem("i18nextLng", next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  };

  // Time picker functions
  const formatTime = (timeString) => {
    if (!timeString) return "";
    const [hh, mm] = timeString.split(":");
    const h = parseInt(hh, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 || 12;
    return `${displayHour}:${mm} ${ampm}`;
  };

  const handleOpenTimePicker = () => {
    setShowTimePicker(true);
  };

  const handleTimeSelect = (hour, minute) => {
    const timeString = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    setField("reservationTime", timeString);
    setShowTimePicker(false);
    setCustomTimeInput("");
  };

  const handleCustomTimeSubmit = () => {
    if (customTimeInput && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(customTimeInput)) {
      setField("reservationTime", customTimeInput);
      setShowTimePicker(false);
      setCustomTimeInput("");
    }
  };

  // Generate all time slots from 7:00 AM to 11:30 PM
  const getAllTimeSlots = useMemo(() => {
    const slots = [];
    // From 7:00 AM to 11:30 PM (30-minute intervals)
    for (let h = 7; h <= 23; h++) {
      slots.push({ hour: h, minute: 0 });
      if (h < 23) slots.push({ hour: h, minute: 30 });
    }
    return slots;
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();

    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Call backend API to create guest reservation
      const result = await createGuestReservation(formData);
      
      console.log("[GuestReservation] Reservation created successfully:", result);
      
      // Store confirmation data
      setConfirmationData({
        confirmationCode: result.confirmationCode,
        bookingId: result.bookingID,
        date: formData.reservationDate,
        time: formData.reservationTime,
        guests: formData.partySize,
        name: formData.guestName,
        phone: formData.phone,
        area: areaOptions.find(a => a.id === formData.areaId)?.name || "Dining Area"
      });
      
      // Show success screen (stay on page - no redirect)
      setSubmitting(false);
      setSuccess(true);
    } catch (error) {
      console.error("[GuestReservation] Failed to create reservation:", error);
      setSubmitting(false);
      setError(error.message || "Failed to create reservation. Please try again.");
    }
  };

  const areaOptions = (areas || []).map((a) => {
    const id = a.areaId ?? a.AreaID ?? a.id;
    const name = a.areaName ?? a.AreaName ?? a.name ?? `Area ${id}`;
    return { id: String(id ?? ""), name: String(name ?? "") };
  });

  // SUCCESS SCREEN
  if (success && confirmationData) {
    return (
      <div
        dir={isAr ? "rtl" : "ltr"}
        className="min-h-screen bg-gradient-to-br from-[#7A0026] via-[#B01243] to-[#C91A4D] p-4 flex items-center justify-center"
      >
        <div className="w-full max-w-md">
          {/* Success Animation Card */}
          <div className="rounded-3xl bg-white shadow-2xl p-6 sm:p-8 animate-[fadeIn_0.5s_ease-out]">
            {/* Success Icon with animation */}
            <div className="flex items-center justify-center mb-6">
              <div className="relative">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-[#7A0026] to-[#C91A4D] flex items-center justify-center shadow-lg animate-[scaleIn_0.6s_ease-out]">
                  <svg viewBox="0 0 24 24" className="h-10 w-10 text-white animate-[checkmark_0.8s_ease-out_0.3s_both]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                {/* Ripple effect */}
                <div className="absolute inset-0 rounded-full bg-[#C91A4D] opacity-25 animate-[ping_1.5s_ease-out_infinite]"></div>
              </div>
            </div>

            {/* Thank You Message */}
            <div className="text-center mb-6">
              <p className="text-xs font-extrabold tracking-widest text-gray-500 uppercase mb-2">
                OPAIA Restaurant & Lounge
              </p>
              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">
                {isAr ? "شكراً لك!" : "Thank You!"}
              </h1>
              <p className="text-base font-semibold text-gray-600 leading-relaxed px-2">
                {isAr 
                  ? "تم تأكيد حجزك بنجاح! سنتواصل معك قريباً لتأكيد ترتيبات الطاولة."
                  : "Your reservation has been confirmed! We'll contact you shortly to confirm your table arrangements."}
              </p>
            </div>

            {/* Confirmation Code - Highlighted */}
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-rose-50 to-orange-50 border-2 border-[#C91A4D] shadow-inner">
              <p className="text-xs font-extrabold text-gray-500 uppercase text-center mb-2">
                {isAr ? "رمز التأكيد" : "Confirmation Code"}
              </p>
              <p className="text-2xl sm:text-3xl font-black text-[#7A0026] text-center tracking-wider">
                {confirmationData.confirmationCode}
              </p>
              <p className="text-xs font-bold text-gray-600 text-center mt-2">
                {isAr ? "يرجى الاحتفاظ بهذا الرمز" : "Please keep this code for reference"}
              </p>
            </div>

            {/* Reservation Details */}
            <div className="mb-6 space-y-3">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start gap-3 mb-3 pb-3 border-b border-gray-200">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#7A0026] to-[#C91A4D] flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-extrabold text-gray-500 uppercase mb-1">
                      {isAr ? "اسم الضيف" : "Guest Name"}
                    </p>
                    <p className="text-base font-black text-gray-900 truncate">{confirmationData.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-extrabold text-gray-500 uppercase mb-1 flex items-center gap-1">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      {isAr ? "التاريخ" : "Date"}
                    </p>
                    <p className="text-sm font-black text-gray-900">{confirmationData.date}</p>
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-gray-500 uppercase mb-1 flex items-center gap-1">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                      {isAr ? "الوقت" : "Time"}
                    </p>
                    <p className="text-sm font-black text-gray-900">{confirmationData.time}</p>
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-gray-500 uppercase mb-1 flex items-center gap-1">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                      </svg>
                      {isAr ? "عدد الضيوف" : "Guests"}
                    </p>
                    <p className="text-sm font-black text-gray-900">{confirmationData.guests} {isAr ? "أشخاص" : "People"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-gray-500 uppercase mb-1 flex items-center gap-1">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {isAr ? "المنطقة" : "Area"}
                    </p>
                    <p className="text-sm font-black text-gray-900 truncate">{confirmationData.area}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold text-blue-900 uppercase mb-1">
                    {isAr ? "معلومات مهمة" : "Important Info"}
                  </p>
                  <p className="text-sm font-semibold text-blue-800 leading-relaxed">
                    {isAr 
                      ? "سيتم الاتصال بك على رقم " + confirmationData.phone + " لتأكيد حجزك وترتيبات الطاولة."
                      : "We'll call you at " + confirmationData.phone + " to confirm your booking and table arrangements."}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => {
                  setSuccess(false);
                  setConfirmationData(null);
                  setFormData({
                    guestName: "",
                    phone: "",
                    email: "",
                    reservationDate: "",
                    reservationTime: "",
                    partySize: 2,
                    areaId: "",
                    occasion: "",
                    specialRequests: "",
                  });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="w-full rounded-2xl bg-gradient-to-r from-[#7A0026] to-[#C91A4D] py-4 text-white font-extrabold shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 4v16m8-8H4" />
                </svg>
                {isAr ? "إنشاء حجز جديد" : "Make Another Reservation"}
              </button>
            </div>

            {/* Footer Note */}
            <div className="mt-6 pt-6 border-t border-gray-200 text-center">
              <p className="text-xs font-bold text-gray-500 leading-relaxed">
                {isAr 
                  ? "نتطلع لاستقبالكم في مطعم وصالة أوبايا"
                  : "We look forward to welcoming you at OPAIA Restaurant & Lounge"}
              </p>
              <p className="text-xs font-extrabold text-[#C91A4D] mt-2">
                ✨ {isAr ? "شكراً لاختياركم أوبايا" : "Thank you for choosing OPAIA"} ✨
              </p>
            </div>
          </div>
        </div>

        <style jsx>{`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes scaleIn {
            from {
              transform: scale(0);
            }
            to {
              transform: scale(1);
            }
          }
          @keyframes checkmark {
            from {
              stroke-dashoffset: 100;
              stroke-dasharray: 100;
            }
            to {
              stroke-dashoffset: 0;
              stroke-dasharray: 100;
            }
          }
        `}</style>
      </div>
    );
  }

  // MAIN PAGE
  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#fdf8fa]">
      {/* Top bar - Compact */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#7A0026] to-[#C91A4D] shadow-md">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 text-center">
              <h1 className="text-base sm:text-lg font-black text-white leading-tight tracking-tight">
                OPAIA Restaurant & Lounge
              </h1>
            </div>

            {/* Language switch */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="h-9 min-w-[44px] rounded-xl bg-white/15 border border-white/25 backdrop-blur px-3 flex items-center justify-center hover:bg-white/25 active:scale-95"
              aria-label="Toggle language"
            >
              <span className="text-xs font-black text-white">{i18n.language === "ar" ? "EN" : "AR"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 font-bold text-sm flex items-start gap-2">
            <svg viewBox="0 0 24 24" className="h-5 w-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v5" />
              <path d="M12 16h.01" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Card */}
        <div className="rounded-3xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          {/* Booking module */}
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-[#7A0026] to-[#C91A4D] flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </div>
              <div>
                <p className="text-gray-900 font-black">{t("reservation.reservation_details")}</p>
                <p className="text-gray-500 text-xs font-semibold">
                  {t("reservation.date")} • {t("reservation.guests")} • {t("reservation.time")} • {t("reservation.area")}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-extrabold text-gray-600 mb-1">{t("reservation.date")} *</label>
                <input
                  type="date"
                  min={today}
                  value={formData.reservationDate}
                  onChange={(e) => setField("reservationDate", e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900 font-semibold focus:outline-none focus:ring-4 focus:ring-[#C91A4D]/15 focus:border-[#C91A4D]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-gray-600 mb-1">{t("reservation.guests")} *</label>
                <div className="w-full rounded-2xl border border-gray-200 px-3 py-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={decGuests}
                    disabled={formData.partySize <= 1}
                    className="h-10 w-10 rounded-xl font-black text-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                  >
                    −
                  </button>
                  <div className="text-center">
                    <div className="text-lg font-black text-gray-900">{formData.partySize}</div>
                    <div className="text-[11px] font-semibold text-gray-500 -mt-1">Guests</div>
                  </div>
                  <button
                    type="button"
                    onClick={incGuests}
                    className="h-10 w-10 rounded-xl font-black text-lg text-white bg-gradient-to-br from-[#7A0026] to-[#C91A4D] shadow active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-gray-600 mb-1">{t("reservation.time")} *</label>
                <button
                  type="button"
                  onClick={handleOpenTimePicker}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900 font-semibold bg-white focus:outline-none focus:ring-4 focus:ring-[#C91A4D]/15 focus:border-[#C91A4D] flex items-center justify-between hover:border-[#C91A4D] transition-all"
                >
                  <span className={formData.reservationTime ? "text-gray-900" : "text-gray-400"}>
                    {formData.reservationTime ? formatTime(formData.reservationTime) : t("reservation.select_time")}
                  </span>
                  <svg className="w-5 h-5 text-[#C91A4D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </button>
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-extrabold text-gray-600 mb-1">{t("reservation.area")} *</label>
                <select
                  value={formData.areaId}
                  onChange={(e) => setField("areaId", e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900 font-semibold bg-white focus:outline-none focus:ring-4 focus:ring-[#C91A4D]/15 focus:border-[#C91A4D]"
                >
                  <option value="">
                    {loadingAreas ? t("reservation.loading_areas") : t("reservation.choose_area")}
                  </option>
                  {areaOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Guest details */}
          <form onSubmit={handleSubmit} className="p-5">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-2xl bg-gray-900/5 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#C91A4D]" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <p className="text-gray-900 font-black">{t("reservation.guest_details")}</p>
                <p className="text-gray-500 text-xs font-semibold">Guest contact details</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-extrabold text-gray-600 mb-1">{t("reservation.full_name")} *</label>
                <input
                  type="text"
                  value={formData.guestName}
                  onChange={(e) => setField("guestName", e.target.value)}
                  placeholder={isAr ? "مثال: أحمد محمد" : "Example: Ahmed Mohammed"}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900 font-semibold focus:outline-none focus:ring-4 focus:ring-[#C91A4D]/15 focus:border-[#C91A4D]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-gray-600 mb-1">{t("reservation.phone")} *</label>
                <input
                  dir="ltr"
                  inputMode="tel"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="05xxxxxxxx"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900 font-semibold focus:outline-none focus:ring-4 focus:ring-[#C91A4D]/15 focus:border-[#C91A4D]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-gray-600 mb-1">
                  {t("reservation.email")} <span className="text-gray-400 font-bold">({t("reservation.optional")})</span>
                </label>
                <input
                  dir="ltr"
                  inputMode="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="you@email.com"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900 font-semibold focus:outline-none focus:ring-4 focus:ring-[#C91A4D]/15 focus:border-[#C91A4D]"
                />
              </div>
            </div>

            {/* Occasion chips */}
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-extrabold text-gray-600 mb-2">
                  {t("reservation.occasion")} <span className="text-gray-400 font-bold">({t("reservation.optional")})</span>
                </label>

                {formData.occasion ? (
                  <button
                    type="button"
                    onClick={() => setField("occasion", "")}
                    className="text-xs font-extrabold text-[#C91A4D] hover:underline"
                  >
                    {t("reservation.occasion_clear")}
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {occasions.map((o) => {
                  const selected = formData.occasion === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setField("occasion", selected ? "" : o.id)}
                      className={[
                        "rounded-2xl px-3 py-2 text-sm font-extrabold border transition active:scale-[0.99]",
                        selected
                          ? "border-[#C91A4D] bg-[#C91A4D]/10 text-[#C91A4D]"
                          : "border-gray-200 bg-white text-gray-700 hover:border-[#C91A4D]/60"
                      ].join(" ")}
                    >
                      <span className={isAr ? "ml-1" : "mr-1"}>{o.emoji}</span>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div className="mt-5">
              <label className="block text-xs font-extrabold text-gray-600 mb-1">
                {t("reservation.notes")} <span className="text-gray-400 font-bold">({t("reservation.optional")})</span>
              </label>
              <textarea
                value={formData.specialRequests}
                onChange={(e) => setField("specialRequests", e.target.value)}
                rows={4}
                placeholder={t("reservation.notes_placeholder")}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900 font-semibold focus:outline-none focus:ring-4 focus:ring-[#C91A4D]/15 focus:border-[#C91A4D] resize-y"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className={[
                "mt-6 w-full rounded-2xl py-4 font-black text-white shadow-lg transition active:scale-[0.99]",
                submitting
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-gradient-to-r from-[#7A0026] to-[#C91A4D] hover:shadow-xl"
              ].join(" ")}
            >
              {submitting ? t("reservation.submitting") : t("reservation.submit")}
            </button>

            {/* Note */}
            <div className="mt-4 rounded-2xl border border-[#C91A4D]/15 bg-[#C91A4D]/5 p-4 text-sm">
              <p className="font-extrabold text-[#C91A4D]">{t("reservation.quick_note_title")}</p>
              <p className="mt-1 font-semibold text-gray-600 leading-6">{t("reservation.quick_note_text")}</p>
            </div>
          </form>
        </div>

        <div className="h-8" />
      </div>

      {/* Time Picker Modal - Direct Selection */}
      {showTimePicker && (
        <div 
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md"
          style={{ animation: "fadeIn 0.25s ease-out" }}
          onClick={() => setShowTimePicker(false)}
        >
          <div
            className="w-full sm:max-w-3xl bg-gradient-to-br from-white via-white to-pink-50 sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh]"
            style={{ animation: "slideUpModal 0.35s cubic-bezier(0.16, 1, 0.3, 1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button - Top Right */}
            <button
              type="button"
              onClick={() => setShowTimePicker(false)}
              className="absolute top-4 right-4 sm:top-5 sm:right-5 z-10 w-10 h-10 rounded-full bg-white/90 backdrop-blur border border-gray-200 shadow-lg flex items-center justify-center hover:bg-white transition-all hover:scale-110 active:scale-95"
            >
              <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>

            {/* Header */}
            <div className="relative px-6 pt-8 pb-6 sm:px-8 sm:pt-10 sm:pb-8">
              <div className="flex items-center justify-center mb-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7A0026] to-[#C91A4D] flex items-center justify-center shadow-xl">
                  <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-gray-900 text-center mb-2">
                {t("reservation.choose_time")}
              </h2>
              <p className="text-sm font-semibold text-gray-500 text-center">
                Select your preferred dining time (7:00 AM - 11:30 PM)
              </p>
            </div>

            {/* Content - All Time Slots */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 sm:px-8 sm:pb-8">
              {/* Custom Time Input */}
              <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#C91A4D]/10 to-[#7A0026]/10 border-2 border-[#C91A4D]/30">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-[#C91A4D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  <h3 className="text-base sm:text-lg font-black text-gray-900">
                    Custom Time
                  </h3>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-gray-600 mb-3">
                  Enter a specific time if you don't see it below
                </p>
                <div className="flex gap-2 sm:gap-3">
                  <input
                    type="time"
                    value={customTimeInput}
                    onChange={(e) => setCustomTimeInput(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-[#C91A4D] focus:ring-4 focus:ring-[#C91A4D]/20 outline-none text-base font-bold text-gray-900 bg-white transition-all"
                    placeholder="HH:MM"
                  />
                  <button
                    type="button"
                    onClick={handleCustomTimeSubmit}
                    disabled={!customTimeInput}
                    className={`px-6 sm:px-8 py-3 rounded-xl font-black text-sm sm:text-base transition-all ${
                      customTimeInput
                        ? "bg-gradient-to-br from-[#7A0026] to-[#C91A4D] text-white shadow-lg hover:shadow-xl active:scale-95"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Set
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t-2 border-gray-200"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="px-4 bg-gradient-to-br from-white via-white to-pink-50 text-sm font-bold text-gray-500">
                    Or choose from quick slots
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5 sm:gap-3">
                {getAllTimeSlots.map(({ hour, minute }, idx) => {
                  const timeValue = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
                  const isSelected = formData.reservationTime === timeValue;
                  
                  return (
                    <button
                      key={timeValue}
                      type="button"
                      onClick={() => handleTimeSelect(hour, minute)}
                      className={`
                        relative py-3.5 sm:py-4 px-2 sm:px-3 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base transition-all
                        ${isSelected 
                          ? "bg-gradient-to-br from-[#7A0026] to-[#C91A4D] text-white shadow-2xl scale-105 ring-4 ring-[#C91A4D]/30" 
                          : "bg-white border-2 border-gray-200 text-gray-800 hover:border-[#C91A4D] hover:shadow-lg hover:scale-105 active:scale-95"
                        }
                      `}
                      style={{
                        animation: `fadeInUp 0.3s ease-out ${idx * 0.015}s both`
                      }}
                    >
                      {formatTime(timeValue)}
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 bg-white rounded-full flex items-center justify-center shadow-lg">
                          <svg className="w-3 h-3 sm:w-4 sm:h-4 text-[#C91A4D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUpModal {
          from { 
            opacity: 0;
            transform: translateY(100%) scale(0.9);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        @media (min-width: 640px) {
          @keyframes slideUpModal {
            from { 
              opacity: 0;
              transform: translateY(40px) scale(0.95);
            }
            to { 
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
