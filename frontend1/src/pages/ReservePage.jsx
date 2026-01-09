import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../component/Icon";
import {
  getAvailableTables,
  checkTableAvailability,
  createReservation,
  getAvailableTimeSlots,
  getReservationsByDate,
  getAreaLayout,
} from "../services/reservation.service";
import { getAreas } from "../services/menu.service";
import { STEPS } from "../component/reserve/constants";
import TableSelectionStep from "../component/reserve/TableSelectionStep";
import DateTimeSelectionStep from "../component/reserve/DateTimeSelectionStep";
import InfoFormStep from "../component/reserve/InfoFormStep";
import SuccessStep from "../component/reserve/SuccessStep";
import ReservationsSidebar from "../component/reserve/ReservationsSidebar";
import FloorMapModal from "../component/reserve/FloorMapModal";

export default function ReservePage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(STEPS.TABLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reservation mode: "online" or "walkin"
  const [reservationMode, setReservationMode] = useState("online");

  // Reservation data
  const [tables, setTables] = useState([]);
  const [areas, setAreas] = useState([]);
  const [selectedTables, setSelectedTables] = useState([]); // Changed to array for multiple selection
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [availableTimeSlots, setAvailableTimeSlots] = useState([]);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    guests: 2,
    specialRequests: "",
  });
  const [reservationId, setReservationId] = useState(null);

  // Sidebar state
  const [showSidebar, setShowSidebar] = useState(false);
  const [reservationsDate, setReservationsDate] = useState(() => {
    // Default to today's date
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [reservations, setReservations] = useState([]);
  const [loadingReservations, setLoadingReservations] = useState(false);

  // Floor map modal state
  const [showFloorMap, setShowFloorMap] = useState(false);

  // Load areas on mount
  useEffect(() => {
    loadAreas();
  }, []);

  // Set current date/time for walk-in mode and update every minute
  useEffect(() => {
    if (reservationMode === "walkin") {
      const updateTime = () => {
        const now = new Date();
        const today = now.toISOString().split("T")[0];
        const hours = now.getHours().toString().padStart(2, "0");
        const minutes = now.getMinutes().toString().padStart(2, "0");
        const currentTime = `${hours}:${minutes}`;
        setSelectedDate(today);
        setSelectedTime(currentTime);
      };
      
      updateTime();
      const today = new Date().toISOString().split("T")[0];
      loadTables(null, today);
      
      const interval = setInterval(updateTime, 60000);
      return () => clearInterval(interval);
    } else {
      setSelectedDate("");
      setSelectedTime("");
    }
  }, [reservationMode]);

  // Load reservations when date changes
  useEffect(() => {
    if (reservationsDate) {
      loadReservations();
    }
  }, [reservationsDate]);

  // Load time slots when date changes
  useEffect(() => {
    if (selectedDate && selectedTables.length > 0) {
      loadTimeSlots();
    }
  }, [selectedDate, selectedTables]);

  const loadTables = async (areaId = null, date = null) => {
    try {
      setLoading(true);
      setError("");
      const data = await getAvailableTables(areaId, date);
      // If no tables returned, use empty array (don't use dummy data)
      if (!data || data.length === 0) {
        setTables([]);
      } else {
        setTables(data);
      }
    } catch (err) {
      console.warn("Failed to load tables:", err);
      // Use empty array on error
      setTables([]);
      setError("");
    } finally {
      setLoading(false);
    }
  };

  const loadAreas = async () => {
    try {
      const data = await getAreas();
      if (data && data.length > 0) {
        setAreas(data);
      }
    } catch (err) {
      console.error("Failed to load areas:", err);
      // Keep empty areas array on error
      setAreas([]);
    }
  };

  const loadReservations = async () => {
    try {
      setLoadingReservations(true);
      const data = await getReservationsByDate(reservationsDate);
      if (data && data.reservations) {
        setReservations(data.reservations);
      } else {
        setReservations([]);
      }
    } catch (err) {
      console.error("Failed to load reservations:", err);
      setReservations([]);
    } finally {
      setLoadingReservations(false);
    }
  };

  const loadTimeSlots = async () => {
    try {
      setLoading(true);
      const slots = await getAvailableTimeSlots(selectedDate);
      setAvailableTimeSlots(slots);
    } catch (err) {
      console.error("Error loading time slots:", err);
      generateDefaultTimeSlots();
    } finally {
      setLoading(false);
    }
  };

  const generateDefaultTimeSlots = () => {
    const slots = [];
    
    // First part: 7:00 AM to 11:30 PM (same day)
    for (let hour = 7; hour <= 23; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        slots.push(timeStr);
      }
    }
    
    // Second part: 12:00 AM (midnight) to 3:00 AM (next day)
    for (let hour = 0; hour <= 3; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        // Skip 3:30 AM since we only go up to 3:00 AM
        if (hour === 3 && minute > 0) break;
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        slots.push(timeStr);
      }
    }
    
    setAvailableTimeSlots(slots);
  };

  const handleTableSelect = (table) => {
    // Prevent selecting reserved tables
    const status = table.status?.toLowerCase() || 'available';
    if (status === 'reserved') {
      setError(`Table ${table.number || table.id} is already reserved for today. Please select another table.`);
      return;
    }
    
    // Prevent selecting occupied tables (with running KOT)
    if (status === 'occupied' || table.isOccupied) {
      const kotInfo = table.kotNumber ? ` (KOT: ${table.kotNumber})` : '';
      setError(`Table ${table.number || table.id} has an active order${kotInfo} and cannot be assigned. Please select another table.`);
      return;
    }
    
    setSelectedTables(prev => {
      // Toggle selection - if already selected, remove it; otherwise add it
      // Use String comparison to handle both string and number IDs
      const isSelected = prev.some(t => String(t.id) === String(table.id));
      if (isSelected) {
        return prev.filter(t => String(t.id) !== String(table.id));
      } else {
        return [...prev, table];
      }
    });
    setError("");
  };

  const handleNext = async () => {
    if (currentStep === STEPS.TABLE) {
      if (selectedTables.length === 0) {
        setError("Please select at least one table");
        return;
      }
      
      // Double-check: Ensure no reserved or occupied tables are selected
      const hasReservedTable = selectedTables.some(table => {
        const status = table.status?.toLowerCase() || 'available';
        return status === 'reserved';
      });
      
      const hasOccupiedTable = selectedTables.some(table => {
        const status = table.status?.toLowerCase() || 'available';
        return status === 'occupied' || table.isOccupied;
      });
      
      if (hasReservedTable) {
        setError("One or more selected tables are already reserved. Please select available tables only.");
        return;
      }
      
      if (hasOccupiedTable) {
        setError("One or more selected tables have active orders (KOT) and cannot be assigned. Please select available tables only.");
        return;
      }
      
      // Skip DATETIME step for walk-in mode
      if (reservationMode === "walkin") {
        setCurrentStep(STEPS.INFO);
        setError("");
        return;
      }
      setCurrentStep(STEPS.DATETIME);
    } else if (currentStep === STEPS.DATETIME) {
      if (!selectedDate || !selectedTime) {
        setError("Please select both date and time");
        return;
      }
      try {
        setLoading(true);
        // Check availability for all selected tables
        const availabilityChecks = await Promise.all(
          selectedTables.map(table => 
            checkTableAvailability(table.id, selectedDate, selectedTime)
          )
        );
        const available = availabilityChecks.every(check => check === true);
        if (!available) {
          setError("This time slot is no longer available. Please choose another time.");
          return;
        }
        setCurrentStep(STEPS.INFO);
        setError("");
      } catch (err) {
        setError(err?.response?.data?.error || "Failed to check availability");
      } finally {
        setLoading(false);
      }
    } else if (currentStep === STEPS.INFO) {
      if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
        setError("Please fill in all required fields");
        return;
      }
      if (formData.guests < 1) {
        setError("Number of guests must be at least 1");
        return;
      }
      await handleSubmit();
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError("");
      // Create reservation for the first selected table (or handle multiple if needed)
      const firstTable = selectedTables[0];
      
      // For walk-in, use current date/time
      let finalDate = selectedDate;
      let finalTime = selectedTime;
      
      if (reservationMode === "walkin") {
        const now = new Date();
        finalDate = now.toISOString().split("T")[0];
        const hours = now.getHours().toString().padStart(2, "0");
        const minutes = now.getMinutes().toString().padStart(2, "0");
        finalTime = `${hours}:${minutes}`;
      }
      
      const result = await createReservation({
        tableId: firstTable.id,
        areaId: firstTable.areaId || firstTable.areaID,
        date: finalDate,
        time: finalTime,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        guests: formData.guests,
        specialRequests: formData.specialRequests,
        bookingSource: reservationMode === "walkin" ? "WALKIN" : "ONLINE",
      });
      setReservationId(result.reservationId || result.bookingID || result.id);
      setCurrentStep(STEPS.SUCCESS);
      
      // Reload reservations if sidebar is open
      if (showSidebar) {
        loadReservations();
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to create reservation");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (currentStep > STEPS.TABLE) {
      setCurrentStep(currentStep - 1);
      setError("");
    }
    // Removed navigation to menu - stay on reserve page
  };

  // Reset reservation form to start over
  const handleReset = () => {
    setCurrentStep(STEPS.TABLE);
    setSelectedTables([]);
    if (reservationMode === "walkin") {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const hours = now.getHours().toString().padStart(2, "0");
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const currentTime = `${hours}:${minutes}`;
      setSelectedDate(today);
      setSelectedTime(currentTime);
    } else {
      setSelectedDate("");
      setSelectedTime("");
    }
    setAvailableTimeSlots([]);
    setFormData({
      name: "",
      email: "",
      phone: "",
      guests: 2,
      specialRequests: "",
    });
    setReservationId(null);
    setError("");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return maxDate.toISOString().split("T")[0];
  };

  return (
    <div
      className="min-h-screen relative"
      style={{
        background:
          "radial-gradient(120% 60% at 50% 0%, rgba(201,26,77,0.16), transparent 55%), #fdf8fa",
      }}
    >
      {/* Reservations Sidebar */}
      <ReservationsSidebar
        isOpen={showSidebar}
        onClose={() => setShowSidebar(false)}
        reservationsDate={reservationsDate}
        onDateChange={setReservationsDate}
        reservations={reservations}
        loading={loadingReservations}
      />

      {/* Floor Map Modal */}
      <FloorMapModal
        open={showFloorMap}
        onClose={() => setShowFloorMap(false)}
        areas={areas}
      />

      {/* Mobile-First Header */}
      <header className="sticky top-0 z-40 border-b border-gray-100/80 bg-white/95 backdrop-blur-xl shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-700 hover:text-[var(--grad-start)] transition active:scale-95 touch-manipulation"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <Icon name="arrow-left" className="h-5 w-5" />
              <span className="font-medium text-sm sm:text-base">Back</span>
            </button>
            <h1
              className="text-lg sm:text-xl font-bold"
              style={{
                background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Reserve Table
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/reservation-report")}
                className="flex items-center gap-2 text-gray-700 hover:text-[var(--grad-start)] transition active:scale-95 touch-manipulation"
                style={{ WebkitTapHighlightColor: "transparent" }}
                title="View Reservation Report"
              >
                <Icon name="receipt" className="h-5 w-5" />
                <span className="font-medium text-sm sm:text-base hidden sm:inline">Report</span>
              </button>
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="flex items-center gap-2 text-gray-700 hover:text-[var(--grad-start)] transition active:scale-95 touch-manipulation"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <Icon name="calendar" className="h-5 w-5" />
                <span className="font-medium text-sm sm:text-base hidden sm:inline">Reservations</span>
              </button>
            </div>
          </div>
          
          {/* Reservation Mode Toggle with Floor Map Button */}
          <div className="mt-3 flex items-center justify-center gap-3">
            <div className="inline-flex rounded-lg bg-gray-100 p-1 border border-gray-200">
              <button
                onClick={() => {
                  setReservationMode("online");
                  setCurrentStep(STEPS.TABLE);
                  setSelectedTables([]);
                  setError("");
                }}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                  reservationMode === "online"
                    ? "bg-gradient-to-r from-[var(--grad-start)] to-[var(--grad-end)] text-white shadow-md"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon name="globe" className="h-4 w-4" />
                  Online
                </span>
              </button>
              <button
                onClick={() => {
                  setReservationMode("walkin");
                  setCurrentStep(STEPS.TABLE);
                  setSelectedTables([]);
                  setError("");
                }}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                  reservationMode === "walkin"
                    ? "bg-gradient-to-r from-[var(--grad-start)] to-[var(--grad-end)] text-white shadow-md"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon name="users" className="h-4 w-4" />
                  Walk-in
                </span>
              </button>
            </div>
            {/* Special Floor Map Button */}
            <button
              onClick={() => setShowFloorMap(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all active:scale-95 touch-manipulation"
              style={{
                background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                WebkitTapHighlightColor: "transparent",
              }}
              title="View Floor Map"
            >
              <span className="flex items-center gap-2">
                <Icon name="map" className="h-4 w-4" />
                <span className="hidden sm:inline">Floor Map</span>
                <span className="sm:hidden">Map</span>
              </span>
            </button>
          </div>
        </div>
      </header>

        {/* Mobile-Optimized Progress Steps */}
      <div className="px-4 py-4 sm:py-6">
        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-6">
          {reservationMode === "walkin" ? (
            [1, 2, 3].map((step) => {
              const stepMap = { 1: STEPS.TABLE, 2: STEPS.INFO, 3: STEPS.SUCCESS };
              const isActive = currentStep >= stepMap[step];
              const labels = { 1: "Table", 2: "Details", 3: "Done" };
              return (
                <div key={step} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full grid place-items-center font-semibold text-xs sm:text-sm transition ${
                        isActive
                          ? "bg-gradient-to-r from-[var(--grad-start)] to-[var(--grad-end)] text-white shadow-md"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {step}
                    </div>
                    <span className="text-xs mt-1 text-gray-600 hidden sm:inline">{labels[step]}</span>
                  </div>
                  {step < 3 && (
                    <div
                      className={`w-6 sm:w-12 h-0.5 sm:h-1 mx-0.5 sm:mx-1 transition ${
                        currentStep > stepMap[step]
                          ? "bg-gradient-to-r from-[var(--grad-start)] to-[var(--grad-end)]"
                          : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              );
            })
          ) : (
            [1, 2, 3, 4].map((step) => {
              const stepMap = { 1: STEPS.TABLE, 2: STEPS.DATETIME, 3: STEPS.INFO, 4: STEPS.SUCCESS };
              const isActive = currentStep >= stepMap[step];
              const labels = { 1: "Table", 2: "Time", 3: "Details", 4: "Done" };
              return (
                <div key={step} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full grid place-items-center font-semibold text-xs sm:text-sm transition ${
                        isActive
                          ? "bg-gradient-to-r from-[var(--grad-start)] to-[var(--grad-end)] text-white shadow-md"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {step}
                    </div>
                    <span className="text-xs mt-1 text-gray-600 hidden sm:inline">{labels[step]}</span>
                  </div>
                  {step < 4 && (
                    <div
                      className={`w-6 sm:w-12 h-0.5 sm:h-1 mx-0.5 sm:mx-1 transition ${
                        currentStep > stepMap[step]
                          ? "bg-gradient-to-r from-[var(--grad-start)] to-[var(--grad-end)]"
                          : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Error Message - Mobile Friendly */}
        {error && (
          <div className="mb-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm sm:text-base">
            {error}
          </div>
        )}

        {/* Step Content - Mobile First */}
        <div className="max-w-2xl mx-auto">
          {currentStep === STEPS.TABLE && (
            <TableSelectionStep
              tables={tables}
              areas={areas}
              selectedTables={selectedTables}
              selectedDate={selectedDate}
              onSelect={handleTableSelect}
              onDateChange={setSelectedDate}
              onLoadTables={loadTables}
              loading={loading}
              reservationMode={reservationMode}
              selectedTime={selectedTime}
            />
          )}

          {currentStep === STEPS.DATETIME && reservationMode === "online" && (
            <DateTimeSelectionStep
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              availableTimeSlots={availableTimeSlots}
              onDateChange={setSelectedDate}
              onTimeChange={setSelectedTime}
              minDate={getMinDate()}
              maxDate={getMaxDate()}
              loading={loading}
            />
          )}

          {currentStep === STEPS.INFO && (
            <InfoFormStep
              formData={formData}
              onFormDataChange={setFormData}
              selectedTables={selectedTables}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              reservationMode={reservationMode}
            />
          )}

          {currentStep === STEPS.SUCCESS && (
            <SuccessStep
              reservationId={reservationId}
              selectedTables={selectedTables}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              formData={formData}
              onNavigate={navigate}
              onReset={handleReset}
            />
          )}
        </div>

        {/* Mobile-Optimized Navigation Buttons - Fixed at Bottom with Safe Area */}
        {currentStep !== STEPS.SUCCESS && (
          <div 
            className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
            style={{
              paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
              paddingTop: "12px"
            }}
          >
            <div className="max-w-2xl mx-auto px-4 sm:px-6 flex gap-3 sm:gap-4">
              <button
                onClick={handleBack}
                className="flex-1 btn-pill-outline h-12 sm:h-14 text-sm sm:text-base font-semibold active:scale-95 touch-manipulation"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {currentStep === STEPS.TABLE ? "Cancel" : "Back"}
              </button>
              <button
                onClick={handleNext}
                disabled={loading}
                className="flex-1 btn-pill h-12 sm:h-14 text-sm sm:text-base font-semibold disabled:opacity-50 active:scale-95 touch-manipulation"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {loading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    <span className="hidden sm:inline">Processing...</span>
                    <span className="sm:hidden">Wait...</span>
                  </>
                ) : (
                  <>
                    {currentStep === STEPS.INFO ? (
                      <>
                        <span className="hidden sm:inline">Confirm Reservation</span>
                        <span className="sm:hidden">Confirm</span>
                      </>
                    ) : (
                      "Next"
                    )}
                    <span className="btn-ripple" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
