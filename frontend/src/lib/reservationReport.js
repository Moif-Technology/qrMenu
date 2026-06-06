// frontend/src/lib/reservationReport.js
// Shared reservation-report logic. Mirrors the export behavior in ReportsPage.jsx
// so the admin portal produces identical Excel reports. Pure functions only —
// no React, no component state.
import * as XLSX from "xlsx";

const ACTIVE_EXCLUDED_STATUSES = new Set(["CANCELLED", "CANCELLED_NOTIFY", "NO_SHOW", "LEFT"]);
export const isActiveStatus = (status) => !ACTIVE_EXCLUDED_STATUSES.has((status || "").toUpperCase());

// ---- field accessors (rows arrive with mixed casing) ----
export const firstValue = (...values) => {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return "";
};

export const getReservationId = (r) => firstValue(r.reservationId, r.bookingID, r.BookingID, r.ReservationID, r.id);
export const getReservationDateValue = (r) => firstValue(r.reservationDate, r.ReservationDate, r.bookingDate, r.BookingDate);
export const getReservationTimeValue = (r) => firstValue(r.reservationTime, r.ReservationTime, r.time, r.Time);
export const getCustomerName = (r) => firstValue(r.customerName, r.CustomerName, r.guestName, r.GuestName, r.customerNameFromMaster, r.CustomerNameFromMaster, r.name, r.Name, "Guest");
export const getCustomerPhone = (r) => firstValue(r.customerPhone, r.CustomerPhone, r.guestPhone, r.GuestPhone, r.customerPhoneFromMaster, r.CustomerPhoneFromMaster, r.phone, r.Phone);
export const getCustomerEmail = (r) => firstValue(r.customerEmail, r.CustomerEmail, r.guestEmail, r.GuestEmail, r.customerEmailFromMaster, r.CustomerEmailFromMaster, r.email, r.Email);
export const getGuestCount = (r) => firstValue(r.numberOfGuests, r.NumberOfGuests, r.pax, r.Pax, r.guests, r.Guests, r.partySize, r.PartySize);
export const getSource = (r) => firstValue(r.bookingSource, r.BookingSource, r.source, r.Source);
export const getHostessName = (r) => firstValue(r.hostessName, r.HostessName, r.hostess, r.Hostess);
export const getConfirmationCode = (r) => firstValue(r.confirmationCode, r.ConfirmationCode);
export const getSpecialRequests = (r) => firstValue(r.specialRequests, r.SpecialRequests, r.notes, r.Notes, r.comments, r.Comments);
export const getTags = (r) => firstValue(r.tags, r.Tags);

export const isWalkIn = (r) => (r.isWalkIn || r.IsWalkIn) || (String(getSource(r)).toUpperCase() === "WALKIN");

export const getTableLabel = (r) => {
  const tableName = r.tableName || r.TableName;
  const tableNo = r.tableNo || r.TableNO;
  const tableId = r.tableId || r.TableID;
  if (tableName) return tableName;
  if (tableNo) return `Table ${tableNo}`;
  if (tableId && tableId !== 0) return `Table ${tableId}`;
  return "Unassigned";
};

export const getTableCount = (r) => {
  if (r.tables && Array.isArray(r.tables) && r.tables.length > 0) {
    return r.tables.filter((t) => (t.tableId ?? t.tableID ?? t.TableID) != null && (t.tableId ?? t.tableID ?? t.TableID) !== 0).length;
  }
  if (r.tableIds && String(r.tableIds).trim() && String(r.tableIds) !== "0") {
    return String(r.tableIds).split(",").map((s) => s.trim()).filter((s) => s && s !== "0").length;
  }
  const tid = r.tableId ?? r.TableID;
  return tid != null && tid !== 0 && tid !== "" ? 1 : 0;
};

// Child status (BookingChild.Status) always wins over master status.
export const getEffectiveStatus = (res) => {
  const childStatus = (res.status || res.Status || "").toUpperCase().trim();
  const masterStatus = (res.bookingStatus || res.BookingStatus || "").toUpperCase().trim();
  return childStatus || masterStatus;
};

export const isActiveReservation = (res) => isActiveStatus(getEffectiveStatus(res));

export const getStatusChip = (status) => {
  const s = (status || "").toUpperCase();
  const map = {
    BOOKED: { label: "Booked" },
    PENDING: { label: "Pending" },
    CONFIRMED: { label: "Confirmed" },
    ARRIVED: { label: "Arrived" },
    SEATED: { label: "Seated" },
    LEFT: { label: "Left" },
    CANCELLED: { label: "Cancelled" },
    CANCELLED_NOTIFY: { label: "Cancelled" },
    NO_SHOW: { label: "No Show" },
  };
  return map[s] || { label: s || "Unknown" };
};

export const formatTime = (timeString) => {
  if (!timeString) return "—";
  const [hours, minutes] = String(timeString).split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

export const formatDate = (dateString) => {
  if (!dateString) return "—";
  const date = new Date(dateString + "T00:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
};

export const getTimeCategory = (timeString) => {
  if (!timeString) return null;
  try {
    const hour24 = parseInt(String(timeString).split(":")[0], 10);
    if (isNaN(hour24)) return null;
    if (hour24 >= 8 && hour24 < 18) return "lunch";
    if (hour24 >= 18 || hour24 < 8) return "dinner";
    return null;
  } catch {
    return null;
  }
};

// ---- option lists (same as ReportsPage) ----
export const EXPORT_REPORT_TYPES = [
  { value: "detailed", label: "Reservation detail", hint: "Full reservation rows with selected date/status/search filters." },
  { value: "summary", label: "Summary report", hint: "Totals for active, guests, lunch, dinner, walk-ins, and exceptions." },
  { value: "status-wise", label: "Status-wise report", hint: "Separate sections by reservation status." },
  { value: "meal-period", label: "Lunch / Dinner report", hint: "Separate sections for lunch and dinner reservations." },
  { value: "exceptions", label: "Exception report", hint: "Cancelled, no-show, and left reservations only." },
  { value: "customer", label: "Customer report", hint: "Groups visits by customer name and phone." },
  { value: "table", label: "Table report", hint: "Groups reservations and guests by assigned table." },
];

export const EXPORT_STATUS_OPTIONS = [
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

// ---- filtering / sorting ----
export function sortReservationRows(rows, sortBy = "time", sortOrder = "asc") {
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
      return mult * String(getCustomerName(a)).toLowerCase().localeCompare(String(getCustomerName(b)).toLowerCase());
    }
    if (sortBy === "date") {
      const c = (getReservationDateValue(a) || "").localeCompare(getReservationDateValue(b) || "");
      if (c !== 0) return mult * c;
      return mult * (timeOf(a) - timeOf(b));
    }
    return mult * (timeOf(a) - timeOf(b));
  });
  return list;
}

export function matchesExportStatus(res, filter) {
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
}

export function filterExportRows(rows, config) {
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
  return sortReservationRows(filtered, config.sortBy, config.sortOrder);
}

export const getReservationExportRows = (rows) => rows.map((r) => {
  const status = getEffectiveStatus(r);
  const meal = getTimeCategory(getReservationTimeValue(r));
  const mealLabel = meal === "lunch" ? "Lunch" : meal === "dinner" ? "Dinner" : "";
  const requests = String(getSpecialRequests(r) || "").replace(/\r?\n/g, " ");
  const rawDate = getReservationDateValue(r) || "";
  const rawTime = getReservationTimeValue(r) || "";
  return {
    "Reservation ID": getReservationId(r) || "",
    Date: rawDate ? formatDate(rawDate) : "",
    Time: rawTime ? formatTime(rawTime) : "",
    "Meal period": mealLabel,
    "Customer name": getCustomerName(r),
    Phone: getCustomerPhone(r),
    Email: getCustomerEmail(r),
    Guests: getGuestCount(r) || "",
    Table: getTableLabel(r),
    Status: getStatusChip(status).label,
    Source: getSource(r) || "",
    "Walk-in": isWalkIn(r) ? "Yes" : "No",
    Hostess: getHostessName(r),
    "Confirmation code": getConfirmationCode(r),
    Tags: getTags(r),
    "Special requests": requests,
  };
});

const sumGuests = (items) => items.reduce((sum, r) => {
  const guests = parseInt(getGuestCount(r) || 0, 10);
  return sum + (isNaN(guests) ? 0 : guests);
}, 0);

export function getExportStats(rows) {
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
}

export function buildCustomerRows(rows) {
  const grouped = new Map();
  rows.forEach((r) => {
    const name = getCustomerName(r);
    const phone = getCustomerPhone(r);
    const email = getCustomerEmail(r);
    const key = `${phone || email || "no-contact"}|${String(name).toLowerCase()}`;
    const current = grouped.get(key) || {
      "Customer name": name, Phone: phone, Email: email, Reservations: 0, Guests: 0,
      "Last visit": "", "Walk-ins": 0, "Last table": "", "Last status": "", Hostess: "",
      Cancelled: 0, "No Show": 0,
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
}

export function buildTableRows(rows) {
  const grouped = new Map();
  rows.forEach((r) => {
    const table = getTableLabel(r);
    const current = grouped.get(table) || {
      Table: table, Reservations: 0, "Active reservations": 0, Guests: 0,
      "Customer names": "", Phones: "", Lunch: 0, Dinner: 0, Cancelled: 0, "No Show": 0,
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
}

export function normalizeExportConfig(config) {
  if (config.reportType === "exceptions") {
    return { ...config, status: ["cancelled", "no-show", "left", "all"].includes(config.status) ? config.status : "all" };
  }
  if (["summary", "status-wise"].includes(config.reportType) && config.status === "all_active") {
    return { ...config, status: "all" };
  }
  return config;
}

/**
 * Build the workbook for the given filtered rows + config, then trigger download.
 * Returns { ok, count } or throws on failure. Throws a plain Error with a
 * user-message when there are no rows.
 */
export function buildReportWorkbook(rows, config) {
  if (!rows.length) {
    const err = new Error("No records found for the selected export filters.");
    err.code = "EMPTY";
    throw err;
  }

  const wb = XLSX.utils.book_new();
  const reportLabel = EXPORT_REPORT_TYPES.find((r) => r.value === config.reportType)?.label || "Report";
  const reportType = config.reportType;

  const detailRows = reportType === "exceptions"
    ? rows.filter((r) => ["CANCELLED", "CANCELLED_NOTIFY", "NO_SHOW", "LEFT"].includes(getEffectiveStatus(r)))
    : rows;

  const ws = XLSX.utils.aoa_to_sheet([["Reservation Report"]]);
  let firstSection = true;
  const addTitle = (title) => {
    XLSX.utils.sheet_add_aoa(ws, firstSection ? [[title]] : [[], [title]], { origin: -1 });
    firstSection = false;
  };
  const addTable = (objs) => {
    const data = objs.length ? objs : [{ Info: "No records found for the selected filters." }];
    XLSX.utils.sheet_add_json(ws, data, { origin: -1 });
  };
  const addSection = (title, objs) => { addTitle(title); addTable(objs); };

  addSection("Report Info", [
    { Field: "Report", Value: reportLabel },
    { Field: "Date mode", Value: config.dateMode === "single" ? "Single date" : "Date range" },
    { Field: "Date", Value: config.dateMode === "single" ? config.selectedDate : `${config.startDate} to ${config.endDate}` },
    { Field: "Status filter", Value: EXPORT_STATUS_OPTIONS.find((s) => s.value === config.status)?.label || config.status },
    { Field: "Search", Value: config.search || "" },
    { Field: "Records", Value: rows.length },
  ]);

  addSection("Summary", getExportStats(detailRows));

  if (reportType === "status-wise") {
    ["CONFIRMED", "ARRIVED", "SEATED", "LEFT", "CANCELLED", "CANCELLED_NOTIFY", "NO_SHOW", "BOOKED", "PENDING"].forEach((status) => {
      const statusRows = rows.filter((r) => getEffectiveStatus(r) === status || (status === "CONFIRMED" && !getEffectiveStatus(r)));
      if (statusRows.length) addSection(getStatusChip(status).label, getReservationExportRows(statusRows));
    });
  } else if (reportType === "meal-period") {
    addSection("Lunch", getReservationExportRows(rows.filter((r) => getTimeCategory(getReservationTimeValue(r)) === "lunch")));
    addSection("Dinner", getReservationExportRows(rows.filter((r) => getTimeCategory(getReservationTimeValue(r)) === "dinner")));
  } else if (reportType === "exceptions") {
    addSection("Cancelled", getReservationExportRows(detailRows.filter((r) => ["CANCELLED", "CANCELLED_NOTIFY"].includes(getEffectiveStatus(r)))));
    addSection("No Show", getReservationExportRows(detailRows.filter((r) => getEffectiveStatus(r) === "NO_SHOW")));
    addSection("Left", getReservationExportRows(detailRows.filter((r) => getEffectiveStatus(r) === "LEFT")));
  } else if (reportType === "customer") {
    addSection("Customers", buildCustomerRows(rows));
  } else if (reportType === "table") {
    addSection("Tables", buildTableRows(rows));
  }

  addSection("Reservations", getReservationExportRows(detailRows));

  ws["!cols"] = [
    { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 12 },
    { wch: 26 }, { wch: 18 }, { wch: 28 }, { wch: 8 },
    { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 8 },
    { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 44 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Report");

  const stamp = config.dateMode === "single" ? config.selectedDate : `${config.startDate}_to_${config.endDate}`;
  const safeStamp = String(stamp).replace(/[\\/:*?"<>|]/g, "-");
  const safeType = String(config.reportType).replace(/[\\/:*?"<>|]/g, "-");
  XLSX.writeFile(wb, `${safeType}-reservations-report-${safeStamp}.xlsx`);
  return { ok: true, count: rows.length };
}
