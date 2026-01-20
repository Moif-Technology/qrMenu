// frontend/src/pages/ReservationFormPage.jsx
// TODO: See RESERVATION_FEATURES_BACKLOG.md for pending features:
// - Table Conflict Checking (overlap detection) - not yet implemented
import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useReservationStore } from "../store/reservationStore";
import { getFloorLayoutByArea } from "../services/floorLayout.service";
import { getTablesByArea } from "../services/table.service";
import { getAreas } from "../services/menu.service";
import { getReservationById, getCustomerHistory } from "../services/reservation.service";
import FloorMapContainer from "../component/reservation/FloorMapContainer";
import AutocompleteInput from "../component/reservation/AutocompleteInput";
// Using mock data for now - backend not connected
// import { createReservation } from "../services/reservation.service";
import BottomNav from "../component/reservation/BottomNav";

export default function ReservationFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedDate, tables, areas, setAreas } = useReservationStore();
  
  // Check if we're in edit mode
  const searchParams = new URLSearchParams(location.search);
  const editBookingId = searchParams.get('edit');
  const isEditMode = !!editBookingId;
  
  // Check if customer data was passed from Customers page
  const prefilledCustomer = location.state?.customerData;

  // Hardcoded hostesses for now
  const hostesses = [
    { id: 1, name: "HANA" },
    { id: 2, name: "YOUSSRA" },
    { id: 3, name: "TAKOUA" },
    { id: 4, name: "SANDOS" },
    { id: 5, name: "NOUR" },
    { id: 6, name: "ANISA" },
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
    firstName: prefilledCustomer?.name || "",
    phone: prefilledCustomer?.phone || "",
    email: prefilledCustomer?.email || "",
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
  const [floorLayout, setFloorLayout] = useState(null);
  const [displayTables, setDisplayTables] = useState([]);
  const [loadingFloorMap, setLoadingFloorMap] = useState(false);
  const [showFloorMapModal, setShowFloorMapModal] = useState(false);
  const [selectedTables, setSelectedTables] = useState([]); // Array of selected tables (final selection)
  const [tempSelectedTables, setTempSelectedTables] = useState([]); // Temporary selection in modal
  const processedTableRef = useRef(null); // Track if we've processed the table from navigation
  const [loadingReservation, setLoadingReservation] = useState(false); // Loading reservation data for edit mode
  const [customerHistory, setCustomerHistory] = useState([]); // Customer autocomplete history

  // Get today's date in local timezone (YYYY-MM-DD format)
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const today = getTodayDateString();
  const coverQuick = [1, 2, 3, 4, 5, 6, 8, 10];

  // Load areas on mount (same as ReservationPage)
  useEffect(() => {
    let mounted = true;
    
    const loadAreas = async () => {
      try {
        const areasData = await getAreas();
        if (mounted && areasData && areasData.length > 0) {
          setAreas(areasData);
        }
      } catch (err) {
        console.error("Failed to load areas:", err);
      }
    };
    
    loadAreas();
    
    return () => {
      mounted = false;
    };
  }, [setAreas]); // Only run once on mount (setAreas is stable)

  // Load customer history for autocomplete
  useEffect(() => {
    let mounted = true;
    
    const loadCustomers = async () => {
      try {
        const result = await getCustomerHistory();
        if (mounted && result.ok) {
          setCustomerHistory(result.customers || []);
        }
      } catch (err) {
        console.error("Failed to load customer history:", err);
      }
    };
    
    loadCustomers();
    
    return () => {
      mounted = false;
    };
  }, []); // Only run once on mount

  // Load reservation data when in edit mode
  useEffect(() => {
    if (!isEditMode || !editBookingId) return;

    const loadReservationData = async () => {
      setLoadingReservation(true);
      setError(null);
      try {
        console.log("[RESERVATION_FORM] Loading reservation for edit:", editBookingId);
        const result = await getReservationById(editBookingId);
        
        if (result.ok && result.reservation) {
          const reservation = result.reservation;
          console.log("[RESERVATION_FORM] Loaded reservation data:", reservation);
          
          // Extract area and tables from reservation
          // Check if reservation has tables array (from getReservationById) or single table fields
          let areaIdFromTables = null;
          let tablesData = [];
          
          if (reservation.tables && Array.isArray(reservation.tables) && reservation.tables.length > 0) {
            // Use tables array from API response
            tablesData = reservation.tables.map(table => ({
              id: table.tableId || table.tableID || table.id,
              number: table.tableNo || table.number || table.tableId || table.tableID || table.id,
              name: table.tableName || table.name || `Table ${table.tableNo || table.tableId || table.id}`,
              capacity: table.capacity || table.seats || reservation.numberOfGuests || 2,
              areaId: table.areaId || table.areaID || null
            }));
            
            // Get area from first table if available
            if (tablesData.length > 0 && tablesData[0].areaId) {
              areaIdFromTables = tablesData[0].areaId;
            }
          } else if (reservation.tableId || reservation.TableID) {
            // Fallback: handle single table ID (legacy format)
            const tableIds = Array.isArray(reservation.tableId || reservation.TableID) 
              ? (reservation.tableId || reservation.TableID)
              : [reservation.tableId || reservation.TableID];
            
            // Load table details for the selected tables
            const areaId = reservation.areaId || reservation.AreaID || areaIdFromTables;
            for (const tableId of tableIds) {
              if (areaId) {
                try {
                  const tablesResult = await getTablesByArea(areaId);
                  if (tablesResult.ok && tablesResult.tables) {
                    const table = tablesResult.tables.find(t => 
                      (t.id || t.number) == tableId
                    );
                    if (table) {
                      tablesData.push({
                        id: table.id || table.number,
                        number: table.number || table.tableNo || table.id,
                        name: table.tableName || table.name || `Table ${table.number || table.id}`,
                        capacity: table.capacity || table.seats || 0,
                        areaId: areaId
                      });
                    }
                  }
                } catch (err) {
                  console.warn("Failed to load table details:", err);
                }
              }
            }
          }
          
          // Determine final area ID - prefer from tables, then from reservation object
          const finalAreaId = areaIdFromTables || reservation.areaId || reservation.AreaID || null;
          
          // Pre-populate form with reservation data
          setFormData(prev => ({
            ...prev,
            firstName: reservation.customerName || reservation.CustomerName || "",
            phone: reservation.customerPhone || reservation.CustomerPhone || "",
            email: reservation.customerEmail || reservation.CustomerEmail || "",
            cover: reservation.numberOfGuests || reservation.NumberOfGuests || reservation.pax || 2,
            section: finalAreaId ? String(finalAreaId) : "",
            comments: reservation.specialRequests || reservation.SpecialRequests || "",
            reservationDate: reservation.reservationDate || reservation.ReservationDate || selectedDate,
            reservationTime: reservation.reservationTime || reservation.ReservationTime || ""
          }));

          // Set selected tables if we have table data
          if (tablesData.length > 0) {
            setSelectedTables(tablesData);
          }

          // Set tags if available
          if (reservation.tags) {
            const tagsArray = typeof reservation.tags === 'string' 
              ? reservation.tags.split(',').map(t => t.trim()).filter(Boolean)
              : Array.isArray(reservation.tags) 
                ? reservation.tags 
                : [];
            setFormData(prev => ({ ...prev, tags: tagsArray }));
          }

          // Set hostess if available - check all possible field name variations
          const hostessIdValue = reservation.hostessID || reservation.hostessId || reservation.HostessID;
          if (hostessIdValue != null && hostessIdValue !== '') {
            setFormData(prev => ({ 
              ...prev, 
              hostessId: parseInt(hostessIdValue) 
            }));
          }
        } else {
          setError("Failed to load reservation data. Please try again.");
        }
      } catch (err) {
        console.error("[RESERVATION_FORM] Failed to load reservation:", err);
        setError("Failed to load reservation data. Please try again.");
      } finally {
        setLoadingReservation(false);
      }
    };

    loadReservationData();
  }, [isEditMode, editBookingId, selectedDate]);

  // Handle table passed from ReservationPage navigation
  useEffect(() => {
    const tableFromState = location.state?.selectedTable;
    const areaIdFromState = location.state?.selectedAreaId;
    
    // Only process if we have a table and haven't processed this one yet
    if (tableFromState && tableFromState !== processedTableRef.current) {
      processedTableRef.current = tableFromState;
      
      // Convert the table to our format
      // Table from ReservationPage has: id, number, tableNo, name, tableName, capacity, seats, areaId, area
      const tableId = tableFromState.id || tableFromState.number || tableFromState.tableNo;
      const tableNumber = tableFromState.number || tableFromState.tableNo || tableFromState.id;
      // Try multiple possible field names for areaId, fallback to areaIdFromState from navigation
      const areaIdValue = tableFromState.areaId || 
                          areaIdFromState ||
                          tableFromState.area?.areaId || 
                          tableFromState.area?.AreaID || 
                          (tableFromState.area && typeof tableFromState.area === 'object' ? 
                           (tableFromState.area.areaId || tableFromState.area.AreaID) : null);
      
      console.log("[RESERVATION_FORM] Table from state:", {
        tableFromState,
        areaIdFromState,
        areaIdValue,
        areaId: tableFromState.areaId,
        area: tableFromState.area
      });
      
      const tableData = {
        id: tableId,
        number: tableNumber,
        name: tableFromState.tableName || tableFromState.name || `Table ${tableNumber}`,
        capacity: tableFromState.capacity || tableFromState.seats || 0,
        areaId: areaIdValue
      };
      
      // Check if already in selectedTables to avoid duplicates
      const alreadyExists = selectedTables.some(t => {
        const tId = t.id || t.number;
        return String(tId) === String(tableId) || String(tId) === String(tableNumber);
      });
      
      if (!alreadyExists && tableData.id) {
        setSelectedTables(prev => [...prev, tableData]);
      }
      
      // Set the section/area - use areaIdValue or areaIdFromState
      const finalAreaId = areaIdValue || areaIdFromState;
      if (finalAreaId) {
        const areaIdStr = String(finalAreaId);
        console.log("[RESERVATION_FORM] Setting section to:", areaIdStr);
        // Always set it immediately
        setFormData(prev => ({ ...prev, section: areaIdStr }));
      } else {
        console.warn("[RESERVATION_FORM] No areaId found in table or state:", {
          table: tableFromState,
          state: location.state
        });
      }
      
      // Clear the location state immediately to prevent re-adding on re-render
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.selectedTable, location.state?.selectedAreaId]);

  const selectedHostess = useMemo(
    () => hostesses.find((h) => h.id === formData.hostessId)?.name || "Unassigned",
    [formData.hostessId]
  );

  const selectedAreaName = useMemo(() => {
    if (!formData.section) return "Any section";
    const a = (areas || []).find((x) => (x.areaId || x.AreaID) == formData.section);
    return a?.areaName || a?.AreaName || `Area ${formData.section}`;
  }, [formData.section, areas]);

  // Load floor map when section/area is selected
  useEffect(() => {
    const loadFloorMap = async () => {
      if (!formData.section) {
        setFloorLayout(null);
        setDisplayTables([]);
        return;
      }

      setLoadingFloorMap(true);
      try {
        const areaId = parseInt(formData.section);
        
        // Load tables first
        const tablesResult = await getTablesByArea(areaId);
        if (tablesResult.ok) {
          setDisplayTables(tablesResult.tables || []);
        }
        
        // Load floor layout (same as ReservationPage)
        try {
          const layout = await getFloorLayoutByArea(areaId);
          console.log("[FLOOR_LAYOUT] Loaded layout:", {
            areaId,
            tables: layout?.tables?.length || 0,
            shapes: layout?.shapes?.length || 0,
            borderPoints: layout?.borderPoints?.length || 0
          });
          setFloorLayout(layout);
        } catch (layoutErr) {
          console.warn("[FLOOR_LAYOUT] Failed to load floor layout:", layoutErr);
          setFloorLayout(null); // Continue without layout if it fails
        }
      } catch (err) {
        console.error("Failed to load floor map:", err);
        setFloorLayout(null);
        setDisplayTables([]);
      } finally {
        setLoadingFloorMap(false);
      }
    };

    loadFloorMap();
  }, [formData.section]);

  // Handle table selection in the modal (temporary selection)
  const handleTableSelectInModal = (table) => {
    // Use a consistent ID - prefer id, then number, then tableNo
    const tableId = table.id || table.number || table.tableNo;
    // Check if already selected using strict comparison on all possible ID fields
    const isSelected = tempSelectedTables.some(t => {
      const tId = t.id || t.number;
      return String(tId) === String(tableId) || 
             String(t.id) === String(table.id) || 
             String(t.number) === String(table.number) ||
             String(t.number) === String(table.tableNo);
    });
    
    if (isSelected) {
      // Remove from temporary selection - remove by all possible matches
      setTempSelectedTables(prev => prev.filter(t => {
        const tId = t.id || t.number;
        return String(tId) !== String(tableId) && 
               String(t.id) !== String(table.id) && 
               String(t.number) !== String(table.number) &&
               String(t.number) !== String(table.tableNo);
      }));
    } else {
      // Add to temporary selection - ensure we don't add duplicates
      setTempSelectedTables(prev => {
        // Double-check it's not already there
        const alreadyExists = prev.some(t => {
          const tId = t.id || t.number;
          return String(tId) === String(tableId) || 
                 String(t.id) === String(table.id) || 
                 String(t.number) === String(table.number);
        });
        if (alreadyExists) return prev;
        
        return [...prev, {
          id: table.id || table.number || table.tableNo,
          number: table.number || table.tableNo || table.id,
          name: table.tableName || table.name || `Table ${table.number || table.tableNo || table.id}`,
          capacity: table.capacity || table.seats || 0,
          areaId: table.areaId
        }];
      });
    }
  };

  // Confirm selection from modal - apply temp selection to final selection
  const handleConfirmTableSelection = () => {
    setSelectedTables(tempSelectedTables);
    setShowFloorMapModal(false);
    // Clear temp selection after a delay
    setTimeout(() => setTempSelectedTables([]), 300);
  };

  // Cancel modal - reset temp selection
  const handleCancelTableSelection = () => {
    setTempSelectedTables([]);
    setShowFloorMapModal(false);
  };

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

  // Handle customer selection from autocomplete
  const handleCustomerSelect = (customer) => {
    setFormData(prev => ({
      ...prev,
      firstName: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || ''
    }));
    // Clear any field errors
    setFieldErrors({});
  };

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
    // Convert date to YYYY-MM-DD format in local timezone (not UTC)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
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
    
    // Convert dates to YYYY-MM-DD format in local timezone
    const formatDateToString = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    return {
      today: formatDateToString(today),
      tomorrow: formatDateToString(tomorrow),
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

    if (!formData.section) {
      setError("Please select a Section/Area first.");
      return;
    }

    setCheckingAvailability(true);
    setError(null);
    setSuggestedTables([]);

    try {
      // Load floor map for the selected area (same as ReservationPage)
      const areaId = parseInt(formData.section);
      
      // Load tables
      const tablesResult = await getTablesByArea(areaId);
      if (tablesResult.ok) {
        // Filter tables by capacity (cover/party size)
        const availableTables = (tablesResult.tables || []).filter((t) => {
        const capacity = t.capacity || t.seats || 0;
          return capacity >= formData.cover;
        });
        setDisplayTables(availableTables);
        
        if (availableTables.length === 0) {
          setError(`No tables available for ${formData.cover} guests in ${selectedAreaName}`);
          setCheckingAvailability(false);
          return;
        }
      }
      
      // Load floor layout (same as ReservationPage)
      try {
        const layout = await getFloorLayoutByArea(areaId);
        console.log("[FLOOR_LAYOUT] Loaded layout for availability check:", {
          areaId,
          tables: layout?.tables?.length || 0,
          shapes: layout?.shapes?.length || 0,
          borderPoints: layout?.borderPoints?.length || 0
        });
        setFloorLayout(layout);
      } catch (layoutErr) {
        console.warn("[FLOOR_LAYOUT] Failed to load floor layout:", layoutErr);
        setFloorLayout(null); // Continue without layout if it fails
      }

      // Pre-populate temp selection with currently selected tables when opening modal
      // This allows users to see and deselect previously selected tables
      setTempSelectedTables([...selectedTables]);
      // Show the floor map modal
      setShowFloorMapModal(true);
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

    // Table selection is now OPTIONAL - allow reservations without tables
    // Restaurant can assign tables later

    setLoading(true);
    setError(null);

    try {
      // Call real API
      const { createReservation } = await import("../services/reservation.service.js");
      
      // Prepare reservation data
      // Handle optional table selection
      let tableIdsArray = [];
      if (selectedTables && selectedTables.length > 0) {
        tableIdsArray = selectedTables.map(t => {
          const id = t.id || t.number || t.tableId;
          return parseInt(id);
        }).filter(id => !isNaN(id) && id > 0);
      }

      // Ensure guests is a valid number
      const guestsValue = parseInt(formData.cover || formData.guests || 1);
      if (isNaN(guestsValue) || guestsValue < 1) {
        setError("Please enter a valid number of guests (at least 1).");
        setLoading(false);
        return;
      }

      const reservationData = {
        // Only include tableIds if tables are selected, otherwise send null
        tableIds: tableIdsArray.length > 0 
          ? (tableIdsArray.length === 1 ? tableIdsArray[0] : tableIdsArray)
          : null,
        // Only include areaId if section is selected
        areaId: formData.section ? parseInt(formData.section) : null,
        date: formData.reservationDate,
        time: formData.reservationTime,
        name: (formData.firstName || '').trim(),
        email: (formData.email || '').trim(),
        phone: (formData.phone || '').trim(),
        guests: guestsValue, // Ensure it's a number
        specialRequests: (formData.comments || '').trim(),
        tags: Array.isArray(formData.tags) ? formData.tags.join(',') : (formData.tags || ''),
        hostessId: formData.hostessId ? parseInt(formData.hostessId) : null,
        hostessName: formData.hostessId ? (hostesses.find(h => h.id === formData.hostessId)?.name || null) : null,
        isWalkIn: false,
        bookingSource: "ONLINE"
      };

      console.log("[RESERVATION_FORM] Sending reservation data:", {
        tableIds: reservationData.tableIds,
        name: reservationData.name,
        phone: reservationData.phone,
        date: reservationData.date,
        time: reservationData.time,
        guests: reservationData.guests
      });

      let result;
      
      if (isEditMode && editBookingId) {
        // Update existing reservation
        const { updateReservation } = await import("../services/reservation.service.js");
        result = await updateReservation(editBookingId, {
          date: formData.reservationDate,
          time: formData.reservationTime,
          guests: guestsValue,
          name: (formData.firstName || '').trim(),
          email: (formData.email || '').trim(),
          phone: (formData.phone || '').trim(),
          specialRequests: (formData.comments || '').trim(),
          tags: Array.isArray(formData.tags) ? formData.tags.join(',') : (formData.tags || ''),
          hostessId: formData.hostessId ? parseInt(formData.hostessId) : null,
          hostessName: formData.hostessId ? (hostesses.find(h => h.id === formData.hostessId)?.name || null) : null,
          // Only include tableIds if tables are selected, otherwise send null
          tableIds: tableIdsArray.length > 0 
            ? (tableIdsArray.length === 1 ? tableIdsArray[0] : tableIdsArray)
            : null,
          areaId: formData.section ? parseInt(formData.section) : null
        });
        
        if (result.ok) {
          alert("Reservation updated successfully!");
          navigate("/reservation-list");
        } else {
          throw new Error(result.error || "Failed to update reservation");
        }
      } else {
        // Create new reservation
        result = await createReservation(reservationData);
        
        if (result.ok) {
      // Navigate to success page with data
      const params = new URLSearchParams({
            id: result.bookingID || result.reservationId,
        name: formData.firstName || '',
        phone: formData.phone || '',
        email: formData.email || '',
        guests: formData.cover || '',
        date: formData.reservationDate || '',
        time: formData.reservationTime || '',
            // Handle optional table selection
            tableIds: selectedTables && selectedTables.length > 0 
              ? selectedTables.map(t => t.id || t.number).join(',')
              : 'unassigned',
            tableNames: selectedTables && selectedTables.length > 0
              ? selectedTables.map(t => `Table ${t.number}`).join(', ')
              : 'Table will be assigned',
            comments: formData.comments || '',
            confirmationCode: result.confirmationCode || ''
      });
      navigate(`/reservation-success?${params.toString()}`);
        } else {
          throw new Error(result.error || "Failed to create reservation");
        }
      }
    } catch (err) {
      console.error("Reservation creation error:", err);
      console.error("Error details:", {
        message: err?.message,
        response: err?.response?.data,
        status: err?.response?.status,
        error: err?.response?.data?.error,
        debug: err?.response?.data?.debug
      });
      
      // Extract error message
      let errorMessage = "Failed to create reservation";
      if (err?.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err?.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ---------------- UI styles (hostess/tablet friendly, less scrolling) ----------------
  const S = {
    page: {
      minHeight: "100vh",
      background: "radial-gradient(120% 60% at 50% 0%, rgba(139,111,71,0.12), transparent 55%), var(--bg-paper)",
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

  // Show loading state when loading reservation data for edit
  if (loadingReservation) {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <button onClick={() => navigate("/reservation")} style={S.backBtn} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>

          <div style={S.titleWrap}>
            <h1 style={S.title}>Edit Reservation</h1>
            <p style={S.subtitle}>Loading reservation details...</p>
          </div>
        </div>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "400px",
          gap: "1rem"
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C91A4D" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
            <circle cx="12" cy="12" r="10" opacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          <div style={{
            fontSize: "16px",
            fontWeight: "600",
            color: "#6b7280"
          }}>
            Loading reservation data...
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

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
          <h1 style={S.title}>{isEditMode ? "Edit Reservation" : "New Reservation"}</h1>
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
                
                {/* Selected Tables Pills - Show below section field */}
                {selectedTables.length > 0 && (
                  <div style={{
                    marginTop: "12px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    alignItems: "center"
                  }}>
                    <div style={{
                      fontSize: "12px",
                      fontWeight: "700",
                      color: "#6b7280",
                      marginRight: "4px"
                    }}>
                      Selected:
                    </div>
                    {selectedTables.map((table, idx) => (
                      <div
                        key={`selected-pill-${table.id}-${idx}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 12px",
                          background: "linear-gradient(135deg, #7A0026, #C91A4D)",
                          color: "#fff",
                          borderRadius: "20px",
                          fontSize: "13px",
                          fontWeight: "700",
                          boxShadow: "0 2px 6px rgba(201, 26, 77, 0.3)",
                          animation: "fadeIn 0.2s ease-in"
                        }}
                      >
                        <span>Table {table.number}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTables(prev => prev.filter(t => {
                              const tId = t.id || t.number;
                              const tableId = table.id || table.number;
                              return String(tId) !== String(tableId);
                            }));
                          }}
                          style={{
                            width: "18px",
                            height: "18px",
                            borderRadius: "50%",
                            border: "none",
                            background: "rgba(255,255,255,0.3)",
                            color: "#fff",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            fontSize: "12px",
                            fontWeight: "800",
                            lineHeight: "1",
                            transition: "all 0.2s"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.5)";
                            e.currentTarget.style.transform = "scale(1.1)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.3)";
                            e.currentTarget.style.transform = "scale(1)";
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {selectedTables.length > 0 && (
                      <button
                        onClick={() => setSelectedTables([])}
                        style={{
                          padding: "6px 12px",
                          background: "#f3f4f6",
                          color: "#6b7280",
                          border: "1px solid #e5e7eb",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#fee2e2";
                          e.currentTarget.style.color = "#dc2626";
                          e.currentTarget.style.borderColor = "#dc2626";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "#f3f4f6";
                          e.currentTarget.style.color = "#6b7280";
                          e.currentTarget.style.borderColor = "#e5e7eb";
                        }}
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                )}
                
                {/* Helpful hint about optional table selection */}
                {selectedTables.length === 0 && (
                  <div style={{
                    marginTop: "12px",
                    padding: "10px 12px",
                    background: "#eff6ff",
                    borderRadius: "10px",
                    border: "1px solid #dbeafe",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#1e40af",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                    <span>Table selection is optional. You can assign tables later from the reports page.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Guest */}
            <div style={S.card}>
              <div style={S.cardTitleRow}>
                <h2 style={S.cardTitle}>Guest</h2>
                <span style={S.cardHint}>Name & phone required</span>
              </div>

              {/* ✅ Name | Phone ALWAYS side-by-side with Autocomplete */}
              <div style={S.row2} className="rf-guest-row">
                <div>
                  <label style={S.label}>
                    Name <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <AutocompleteInput
                    value={formData.firstName}
                    onChange={handleChange}
                    onSelect={handleCustomerSelect}
                    suggestions={customerHistory}
                    field="name"
                    name="firstName"
                    required
                    placeholder="Guest name (start typing...)"
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
                  <AutocompleteInput
                    value={formData.phone}
                    onChange={handleChange}
                    onSelect={handleCustomerSelect}
                    suggestions={customerHistory}
                    field="phone"
                    name="phone"
                    type="tel"
                    required
                    placeholder="05xxxxxxxx (start typing...)"
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
          {suggestedTables.length > 0 && !formData.section && (
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
            {checkingAvailability ? "Checking Availability..." : "Select Tables (Optional)"}
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
            {loading ? (isEditMode ? "Saving Changes..." : "Creating Reservation...") : (isEditMode ? "Save Changes" : "Create Reservation")}
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
                  
                  // Convert date to YYYY-MM-DD format in local timezone (not UTC)
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  const dateString = `${year}-${month}-${day}`;
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
                    { id: "lateNight", label: "Late Night", timeRange: "12:00 AM - 3:00 AM", color: "#6366F1", icon: "🌃" },
                    { id: "custom", label: "Custom Time", timeRange: "Enter any time", color: "#10B981", icon: "🕐" }
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
                  // If custom time is selected, show elegant time picker
                  if (selectedTimePeriod === "custom") {
                    const [customHour = "12", customMinute = "00"] = (formData.reservationTime || "12:00").split(":");
                    
                    return (
                      <div>
                        {/* Header */}
                        <div style={{ 
                          textAlign: "center", 
                          marginBottom: "24px",
                          padding: "20px",
                          background: "linear-gradient(135deg, #10B981, #059669)",
                          borderRadius: "16px",
                          color: "#fff"
                        }}>
                          <div style={{ fontSize: "14px", fontWeight: "600", opacity: 0.9, marginBottom: "8px" }}>
                            Select Custom Time
                          </div>
                          <div style={{ fontSize: "48px", fontWeight: "800", fontFamily: "monospace", letterSpacing: "4px" }}>
                            {customHour}:{customMinute}
                          </div>
                          <div style={{ fontSize: "13px", fontWeight: "600", opacity: 0.9, marginTop: "4px" }}>
                            {parseInt(customHour) >= 12 ? "PM" : "AM"}
                          </div>
                        </div>

                        {/* Time Selectors */}
                        <div style={{ marginBottom: "24px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "12px", alignItems: "center" }}>
                            {/* Hour Selector */}
                            <div>
                              <label style={{
                                display: "block",
                                marginBottom: "8px",
                                fontWeight: "700",
                                fontSize: "13px",
                                color: "#6b7280",
                                textAlign: "center",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px"
                              }}>
                                Hour
                              </label>
                              <select
                                value={customHour}
                                onChange={(e) => {
                                  const newTime = `${e.target.value}:${customMinute}`;
                                  setFormData(prev => ({ ...prev, reservationTime: newTime }));
                                }}
                                style={{
                                  width: "100%",
                                  padding: "16px 12px",
                                  borderRadius: "14px",
                                  border: "2px solid #10B981",
                                  fontSize: "24px",
                                  fontWeight: "800",
                                  fontFamily: "monospace",
                                  textAlign: "center",
                                  outline: "none",
                                  background: "#fff",
                                  cursor: "pointer",
                                  transition: "all 0.2s",
                                  color: "#111827",
                                  appearance: "none",
                                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2310B981' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                                  backgroundRepeat: "no-repeat",
                                  backgroundPosition: "center right 12px"
                                }}
                                onFocus={(e) => {
                                  e.currentTarget.style.boxShadow = "0 0 0 4px rgba(16, 185, 129, 0.2)";
                                  e.currentTarget.style.borderColor = "#059669";
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.boxShadow = "none";
                                  e.currentTarget.style.borderColor = "#10B981";
                                }}
                              >
                                {Array.from({ length: 24 }, (_, i) => (
                                  <option key={i} value={String(i).padStart(2, "0")}>
                                    {String(i).padStart(2, "0")}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Separator */}
                            <div style={{ 
                              fontSize: "36px", 
                              fontWeight: "800", 
                              color: "#10B981",
                              fontFamily: "monospace"
                            }}>
                              :
                            </div>

                            {/* Minute Input */}
                            <div>
                              <label style={{
                                display: "block",
                                marginBottom: "8px",
                                fontWeight: "700",
                                fontSize: "13px",
                                color: "#6b7280",
                                textAlign: "center",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px"
                              }}>
                                Minute
                              </label>
                              <input
                                type="number"
                                min="0"
                                max="59"
                                value={customMinute}
                                onChange={(e) => {
                                  let value = e.target.value;
                                  // Ensure value is between 0-59
                                  if (value === "") {
                                    value = "00";
                                  } else {
                                    const numValue = parseInt(value);
                                    if (numValue < 0) value = "00";
                                    else if (numValue > 59) value = "59";
                                    else value = String(numValue).padStart(2, "0");
                                  }
                                  const newTime = `${customHour}:${value}`;
                                  setFormData(prev => ({ ...prev, reservationTime: newTime }));
                                }}
                                onBlur={(e) => {
                                  // Ensure proper formatting on blur
                                  let value = e.target.value;
                                  if (value === "" || isNaN(value)) {
                                    value = "00";
                                  } else {
                                    value = String(parseInt(value)).padStart(2, "0");
                                  }
                                  const newTime = `${customHour}:${value}`;
                                  setFormData(prev => ({ ...prev, reservationTime: newTime }));
                                  e.currentTarget.style.boxShadow = "none";
                                  e.currentTarget.style.borderColor = "#10B981";
                                }}
                                style={{
                                  width: "100%",
                                  padding: "16px 12px",
                                  borderRadius: "14px",
                                  border: "2px solid #10B981",
                                  fontSize: "24px",
                                  fontWeight: "800",
                                  fontFamily: "monospace",
                                  textAlign: "center",
                                  outline: "none",
                                  background: "#fff",
                                  cursor: "text",
                                  transition: "all 0.2s",
                                  color: "#111827",
                                  appearance: "textfield"
                                }}
                                onFocus={(e) => {
                                  e.currentTarget.style.boxShadow = "0 0 0 4px rgba(16, 185, 129, 0.2)";
                                  e.currentTarget.style.borderColor = "#059669";
                                  e.currentTarget.select();
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Quick Time Buttons */}
                        <div style={{ marginBottom: "24px" }}>
                          <div style={{ fontSize: "13px", fontWeight: "700", color: "#6b7280", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            Quick Select
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                            {[
                              { time: "12:00", label: "Noon" },
                              { time: "13:00", label: "1 PM" },
                              { time: "18:00", label: "6 PM" },
                              { time: "20:00", label: "8 PM" }
                            ].map(({ time, label }) => (
                              <button
                                key={time}
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, reservationTime: time }))}
                                style={{
                                  padding: "10px 8px",
                                  borderRadius: "10px",
                                  border: formData.reservationTime === time ? "2px solid #10B981" : "1px solid #e5e7eb",
                                  background: formData.reservationTime === time ? "#f0fdf4" : "#fff",
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: formData.reservationTime === time ? "#059669" : "#6b7280",
                                  cursor: "pointer",
                                  transition: "all 0.2s"
                                }}
                                onMouseEnter={(e) => {
                                  if (formData.reservationTime !== time) {
                                    e.currentTarget.style.background = "#f9fafb";
                                    e.currentTarget.style.borderColor = "#10B981";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (formData.reservationTime !== time) {
                                    e.currentTarget.style.background = "#fff";
                                    e.currentTarget.style.borderColor = "#e5e7eb";
                                  }
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Confirm Button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (formData.reservationTime) {
                              setShowTimeModal(false);
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: "16px",
                            borderRadius: "14px",
                            border: "none",
                            background: "linear-gradient(135deg, #7A0026, #C91A4D)",
                            color: "#fff",
                            fontSize: "16px",
                            fontWeight: "800",
                            cursor: "pointer",
                            transition: "all 0.2s",
                            boxShadow: "0 4px 12px rgba(201, 26, 77, 0.3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 6px 20px rgba(201, 26, 77, 0.4)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 4px 12px rgba(201, 26, 77, 0.3)";
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          Confirm Time
                        </button>
                      </div>
                    );
                  }

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

      {/* Floor Map Modal - Shows when Check Availability is clicked */}
      {showFloorMapModal && (
        <div
          onClick={handleCancelTableSelection}
          style={{
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
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "20px",
              boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
              width: "100%",
              maxWidth: "95vw",
              maxHeight: "90vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column"
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: "20px",
              background: "linear-gradient(135deg, #7A0026, #C91A4D)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: "800", marginBottom: "4px" }}>
                  Select Table
                </div>
                <div style={{ fontSize: "14px", opacity: 0.9 }}>
                  {selectedAreaName} • {formData.cover} guests
                </div>
              </div>
              <button
                onClick={handleCancelTableSelection}
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "12px",
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Floor Map */}
            <div style={{
              flex: 1,
              height: "70vh",
              minHeight: "500px",
              overflow: "hidden"
            }}>
              {checkingAvailability ? (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: "1rem",
                  color: "#6b7280"
                }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  <div style={{ fontSize: "16px", fontWeight: "600" }}>
                    Loading floor map...
                  </div>
                </div>
              ) : (
                <FloorMapContainer
                  floorLayout={floorLayout}
                  displayTables={displayTables}
                  onTableClick={handleTableSelectInModal}
                  showZoomControls={true}
                  selectedTables={tempSelectedTables}
                />
              )}
            </div>

            {/* Footer - Show selected tables and confirm button */}
            <div style={{
              padding: "16px 20px",
              borderTop: "1px solid #e5e7eb",
              background: tempSelectedTables.length > 0 ? "#FBE6EC" : "#f9fafb",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}>
              {tempSelectedTables.length > 0 ? (
                <>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#6b7280", marginBottom: "8px" }}>
                      Selected Tables ({tempSelectedTables.length})
                    </div>
                    <div style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px"
                    }}>
                      {tempSelectedTables.map((table, idx) => (
                        <div
                          key={`footer-${table.id}-${idx}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            background: "#fff",
                            color: "#C91A4D",
                            borderRadius: "20px",
                            fontSize: "13px",
                            fontWeight: "700",
                            border: "1px solid #C91A4D"
                          }}
                        >
                          Table {table.number}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{
                    display: "flex",
                    gap: "10px"
                  }}>
                    <button
                      onClick={() => {
                        setTempSelectedTables([]);
                      }}
                      style={{
                        flex: 1,
                        padding: "10px",
                        background: "#fff",
                        color: "#6b7280",
                        border: "1px solid #e5e7eb",
                        borderRadius: "10px",
                        fontSize: "14px",
                        fontWeight: "700",
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#f3f4f6";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#fff";
                      }}
                    >
                      Clear All
                    </button>
                    <button
                      onClick={handleConfirmTableSelection}
                      style={{
                        flex: 2,
                        padding: "12px 24px",
                        background: "linear-gradient(135deg, #7A0026, #C91A4D)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "12px",
                        fontSize: "16px",
                        fontWeight: "800",
                        cursor: "pointer",
                        boxShadow: "0 4px 12px rgba(201, 26, 77, 0.3)",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 6px 16px rgba(201, 26, 77, 0.4)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(201, 26, 77, 0.3)";
                      }}
                    >
                      Done ({tempSelectedTables.length})
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ 
                  fontSize: "14px", 
                  fontWeight: "600", 
                  color: "#6b7280", 
                  textAlign: "center",
                  padding: "8px 0"
                }}>
                  Tap tables on the map to select
                </div>
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

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
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
