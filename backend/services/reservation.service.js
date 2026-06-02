// backend/services/reservation.service.js
import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";
import { getNextID } from "../utils/commonUtils.js";
import { sendReservationSms, buildGuestReservationMessage } from "./messagecentral.service.js";


const T_IDCTRL = "dbo.IDControlManager";
const T_BOOKINGM = "dbo.BookingMaster";
const T_BOOKINGC = "dbo.BookingChild";
const T_CUSTOMER = "dbo.CustomerMaster";
const q = (n) => `[${n}]`;

function formatLocalDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper to get next ID within a transaction
async function getNextIdTx(controlName, tx) {
  const req = new mssql.Request(tx);
  req.input("name", mssql.VarChar, String(controlName));

  const sql = `
    IF EXISTS (
      SELECT 1
      FROM ${T_IDCTRL} WITH (UPDLOCK, HOLDLOCK)
      WHERE ${q("ControlName")} = @name
    )
    BEGIN
      UPDATE ${T_IDCTRL}
        SET ${q("ControlValue")} = ${q("ControlValue")} + 1
      WHERE ${q("ControlName")} = @name;

      SELECT ${q("ControlValue")} AS val
      FROM ${T_IDCTRL}
      WHERE ${q("ControlName")} = @name;
    END
    ELSE
    BEGIN
      INSERT INTO ${T_IDCTRL} (${q("ControlName")}, ${q("ControlValue")}, ${q("ControlStep")}, ${q("CreatedOn")}, ${q("CreatedBy")}, ${q("ModifiedOn")}, ${q("ModifiedBy")})
      VALUES (@name, 1, '1', GETDATE(), 'System', GETDATE(), 'System');

      SELECT CAST(1 AS BIGINT) AS val;
    END
  `;

  const rs = await req.query(sql);
  return Number(rs.recordset[0].val);
}

/**
 * Get next BookingChildID within a transaction (for use by update reservation route).
 * @param {mssql.Transaction} tx - Active transaction
 * @returns {Promise<number>} Next BookingChildID
 */
export async function getNextBookingChildIdTx(tx) {
  return getNextIdTx("BookingChild", tx);
}

// Helper to check if customer exists by phone number
async function findCustomerByPhone(phone, tx) {
  const trimmed = String(phone || "").trim();
  if (!trimmed) return null; // No phone - cannot match by phone
  const req = new mssql.Request(tx);
  req.input("phone", mssql.VarChar(25), trimmed);

  const sql = `
    SELECT TOP 1 ${q("CustomerID")}
    FROM ${T_CUSTOMER}
    WHERE ${q("MobileNo")} = @phone
  `;

  const result = await req.query(sql);
  return result.recordset.length > 0 ? Number(result.recordset[0].CustomerID) : null;
}

// Helper to create a new customer
export async function createCustomer(customerData, tx) {
  const {
    name,
    email,
    phone,
  } = customerData;

  try {
    // Get next CustomerID
    const customerID = await getNextIdTx("CustomerMaster", tx);
    console.log("[RESERVATION] Generated CustomerID:", customerID);
    
    // Generate customer code (just the numeric ID, e.g., 1006)
    const customerCode = String(customerID);
    const customerNoNumeric = customerID;

    // Clean and validate inputs
    const cleanName = String(name || "").trim() || "0";
    const cleanEmail = String(email || "").trim() || "0";
    const cleanPhone = String(phone || "").trim().replace(/[^0-9+]/g, "") || "0"; // Remove non-numeric except +

    const req = new mssql.Request(tx);
    
    // Set all required fields with defaults
    req.input("CustomerID", mssql.BigInt, customerID);
    req.input("CustomerCode", mssql.VarChar(20), customerCode);
    req.input("CustomerNoNumeric", mssql.Numeric(18, 0), customerNoNumeric);
    req.input("CustomerName", mssql.VarChar(200), cleanName);
    req.input("Address", mssql.VarChar(300), "0");
    req.input("POBox", mssql.VarChar(15), "0");
    req.input("City", mssql.VarChar(50), "00.00");
    req.input("Country", mssql.VarChar(50), "0");
    req.input("Telephone", mssql.VarChar(15), "0");
    req.input("Fax", mssql.VarChar(15), "0");
    req.input("Email", mssql.VarChar(75), cleanEmail);
    req.input("ContactPerson", mssql.VarChar(200), cleanName);
    req.input("MobileNo", mssql.VarChar(25), cleanPhone);
    req.input("PaymentMode", mssql.VarChar(50), "0");
    req.input("CreditBalance", mssql.Money, 0);
    req.input("CreditLimit", mssql.Money, 0);
    req.input("CreditPeriod", mssql.Numeric(18, 0), 0);
    req.input("PriceLevelID", mssql.BigInt, 0);
    req.input("StationID", mssql.BigInt, 10);
    req.input("Remarks", mssql.VarChar(750), "0");
    req.input("UploadStatus", mssql.VarChar(50), "0");
    req.input("CrBy", mssql.VarChar(50), "ONLINE");
    req.input("CrOn", mssql.DateTime, new Date());
    req.input("ModBy", mssql.VarChar(50), "ONLINE");
    req.input("ModOn", mssql.DateTime, new Date());
    req.input("CreditStatus", mssql.VarChar(50), "0");
    req.input("LoyalityStatus", mssql.VarChar(50), "0");
    req.input("CustomerType", mssql.VarChar(50), "0");
    req.input("CustomerNameArabic", mssql.NVarChar(200), "0");
    req.input("AddressArabic", mssql.NVarChar(300), "0");
    req.input("CityArabic", mssql.NVarChar(100), "0");
    req.input("AdvanceAmount", mssql.Money, 0);
    req.input("ServerStatus", mssql.VarChar(50), "0");
    req.input("CustomerTaxRegNo", mssql.VarChar(100), " ");
    req.input("CustomerPrefix", mssql.Char(1), " ");
    req.input("Designation", mssql.VarChar(200), " ");
    req.input("ContactPerson2", mssql.VarChar(200), " ");
    req.input("Designation2", mssql.VarChar(100), " ");
    req.input("MobileNo2", mssql.VarChar(50), " ");
    req.input("LabourProfitPercentage", mssql.Money, 0);
    req.input("PartsProfitPercentage", mssql.Money, 0);
    req.input("SubletProfitPercentage", mssql.Money, 0);
    req.input("ConsumableProfitPercentage", mssql.Money, 0);
    req.input("LubricantProfitPercentage", mssql.Money, 0);
    req.input("ManagedBy", mssql.BigInt, 0);
    req.input("AccountBalance", mssql.Money, 0);
    req.input("MessMasterID", mssql.BigInt, 0);
    req.input("MessStartDate", mssql.DateTime, new Date("1900-01-01"));
    req.input("CompanyID", mssql.BigInt, 0);

    const insertSql = `
      INSERT INTO ${T_CUSTOMER} (
        ${q("CustomerID")}, ${q("CustomerCode")}, ${q("CustomerNoNumeric")},
        ${q("CustomerName")}, ${q("Address")}, ${q("POBox")}, ${q("City")}, ${q("Country")},
        ${q("Telephone")}, ${q("Fax")}, ${q("Email")}, ${q("ContactPerson")}, ${q("MobileNo")},
        ${q("PaymentMode")}, ${q("CreditBalance")}, ${q("CreditLimit")}, ${q("CreditPeriod")},
        ${q("PriceLevelID")}, ${q("StationID")}, ${q("Remarks")}, ${q("UploadStatus")},
        ${q("CrBy")}, ${q("CrOn")}, ${q("ModBy")}, ${q("ModOn")},
        ${q("CreditStatus")}, ${q("LoyalityStatus")}, ${q("CustomerType")},
        ${q("CustomerNameArabic")}, ${q("AddressArabic")}, ${q("CityArabic")},
        ${q("AdvanceAmount")}, ${q("ServerStatus")}, ${q("CustomerTaxRegNo")},
        ${q("CustomerPrefix")}, ${q("Designation")}, ${q("ContactPerson2")},
        ${q("Designation2")}, ${q("MobileNo2")},
        ${q("LabourProfitPercentage")}, ${q("PartsProfitPercentage")},
        ${q("SubletProfitPercentage")}, ${q("ConsumableProfitPercentage")},
        ${q("LubricantProfitPercentage")}, ${q("ManagedBy")}, ${q("AccountBalance")},
        ${q("MessMasterID")}, ${q("MessStartDate")}, ${q("CompanyID")}
      )
      VALUES (
        @CustomerID, @CustomerCode, @CustomerNoNumeric,
        @CustomerName, @Address, @POBox, @City, @Country,
        @Telephone, @Fax, @Email, @ContactPerson, @MobileNo,
        @PaymentMode, @CreditBalance, @CreditLimit, @CreditPeriod,
        @PriceLevelID, @StationID, @Remarks, @UploadStatus,
        @CrBy, @CrOn, @ModBy, @ModOn,
        @CreditStatus, @LoyalityStatus, @CustomerType,
        @CustomerNameArabic, @AddressArabic, @CityArabic,
        @AdvanceAmount, @ServerStatus, @CustomerTaxRegNo,
        @CustomerPrefix, @Designation, @ContactPerson2,
        @Designation2, @MobileNo2,
        @LabourProfitPercentage, @PartsProfitPercentage,
        @SubletProfitPercentage, @ConsumableProfitPercentage,
        @LubricantProfitPercentage, @ManagedBy, @AccountBalance,
        @MessMasterID, @MessStartDate, @CompanyID
      )
    `;

    console.log("[RESERVATION] Attempting to insert customer:", {
      customerID,
      customerCode,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone
    });

    await req.query(insertSql);
    console.log("[RESERVATION] Successfully inserted customer with ID:", customerID);
    return customerID;
  } catch (error) {
    console.error("[RESERVATION] Error in createCustomer:", error);
    console.error("[RESERVATION] Error details:", {
      message: error.message,
      number: error.number,
      state: error.state,
      class: error.class,
      serverName: error.serverName,
      procName: error.procName,
      lineNumber: error.lineNumber
    });
    throw new Error(`Failed to create customer: ${error.message}`);
  }
}

/**
 * Update an existing customer in CustomerMaster (name, phone, email).
 * Used when user selects a customer then changes their details on the reservation form.
 * @param {number} customerId - CustomerID to update
 * @param {{ name?: string, email?: string, phone?: string }} customerData
 * @param {mssql.Transaction} tx - Active transaction
 */
export async function updateCustomer(customerId, customerData, tx) {
  const { name, email, phone } = customerData;
  const cleanName = String(name ?? "").trim() || null;
  const cleanEmail = String(email ?? "").trim() || null;
  const cleanPhone = String(phone ?? "").trim().replace(/[^0-9+]/g, "") || null;

  const req = new mssql.Request(tx);
  req.input("CustomerID", mssql.BigInt, Number(customerId));
  req.input("CustomerName", mssql.VarChar(200), cleanName);
  req.input("Email", mssql.VarChar(75), cleanEmail);
  req.input("MobileNo", mssql.VarChar(25), cleanPhone);
  req.input("ModBy", mssql.VarChar(50), "ONLINE");
  req.input("ModOn", mssql.DateTime, new Date());

  const sql = `
    UPDATE ${T_CUSTOMER}
    SET ${q("CustomerName")} = @CustomerName,
        ${q("Email")} = @Email,
        ${q("MobileNo")} = @MobileNo,
        ${q("ModBy")} = @ModBy,
        ${q("ModOn")} = @ModOn
    WHERE ${q("CustomerID")} = @CustomerID
  `;
  await req.query(sql);
  console.log("[RESERVATION] Updated customer ID:", customerId);
}

/**
 * Create a reservation (BookingMaster + BookingChild)
 * @param {Object} reservationData
 * @param {number|Array} reservationData.tableId - Table ID or array of table IDs
 * @param {number} reservationData.areaId - Area ID
 * @param {string} reservationData.date - Booking date (YYYY-MM-DD)
 * @param {string} reservationData.time - Booking time (HH:mm)
 * @param {string} reservationData.name - Customer name
 * @param {string} reservationData.email - Customer email
 * @param {string} reservationData.phone - Customer phone
 * @param {number} reservationData.guests - Number of guests
 * @param {string} reservationData.specialRequests - Special requests (optional)
 * @param {string} reservationData.tags - Comma-separated tags (optional)
 * @param {number} reservationData.hostessId - Hostess ID (optional)
 * @param {string} reservationData.hostessName - Hostess name (optional)
 * @param {boolean} reservationData.isWalkIn - Is walk-in (optional)
 * @returns {Promise<Object>} Reservation result with bookingID
 */
export async function createReservation(reservationData) {
  const {
    tableId, // Can be single ID or array
    tableIds: tableIdsParam, // Alternative field name (plural) - support both for compatibility
    areaId,
    date,
    time,
    name,
    email,
    phone,
    guests,
    specialRequests,
    tags,
    hostessId,
    hostessName,
    isWalkIn = false,
    bookingSource = "ONLINE", // Default to ONLINE, can be "ONLINE", "WALKIN", or "POS"
    initialStatus = null, // Initial status: null = default (BOOKED), "SEATED" for walk-ins, etc.
    customerId: providedCustomerId, // If user selected existing customer, update that customer with form name/phone/email
  } = reservationData;

  // Convert tableId to array if single value
  // Support both tableId (singular) and tableIds (plural) for compatibility
  // Prefer tableIds if both are provided (frontend sends tableIds)
  const rawTableId = tableIdsParam !== undefined ? tableIdsParam : tableId;
  
  let tableIds = [];
  if (Array.isArray(rawTableId)) {
    tableIds = rawTableId.filter(id => id != null && id !== '' && id !== 0);
  } else if (rawTableId != null && rawTableId !== '' && rawTableId !== 0) {
    tableIds = [rawTableId];
  }
  
  // Convert all table IDs to numbers
  tableIds = tableIds.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  
  // Check if this is a reservation without tables (tables will be assigned later)
  const isGuestReservation = tableIds.length === 0;
  
  console.log("[RESERVATION] Validating input:", {
    rawTableId,
    tableId,
    tableIdsParam: tableIds,
    processedTableIds: tableIds,
    hasNoTables: isGuestReservation,
    bookingSource,
    date,
    time,
    name: name?.substring(0, 20),
    phone: phone?.substring(0, 15),
    guests
  });
  
  // Additional validation: if tableIds is empty but we expect tables, log warning
  if (tableIds.length === 0 && rawTableId != null && rawTableId !== '' && rawTableId !== 0) {
    console.warn("[RESERVATION] WARNING: tableId provided but filtered out:", {
      rawTableId,
      type: typeof rawTableId,
      isArray: Array.isArray(rawTableId)
    });
  }

  // Allow creating reservations without tables - they can be assigned later when guest arrives
  // No validation error for missing tableIds or areaId - both can be assigned later
  
  // Validate required fields for creating a reservation
  if (!date || date.trim() === '') {
    throw new Error("Missing required field: date");
  }
  if (!time || time.trim() === '') {
    throw new Error("Missing required field: time");
  }
  if (!name || name.trim() === '') {
    throw new Error("Missing required field: name");
  }
  // Phone is optional - some guests prefer not to share
  
  // Validate guests - handle both number and string
  if (guests == null || guests === '' || guests === undefined) {
    throw new Error("Missing required field: guests");
  }
  
  let guestsNum;
  if (typeof guests === 'number') {
    guestsNum = guests;
  } else if (typeof guests === 'string') {
    guestsNum = parseInt(guests.trim());
  } else {
    guestsNum = parseInt(guests);
  }
  
  if (isNaN(guestsNum) || guestsNum < 1) {
    throw new Error(`Invalid field: guests (must be at least 1, got: ${guests} (${typeof guests}))`);
  }
  
  console.log("[RESERVATION] Validation passed, guests:", guestsNum);

  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);

  try {
    await tx.begin();

    // 0. Get areaId from first table if not provided
    let finalAreaId = parseInt(areaId) || 0;
    if (!finalAreaId && tableIds.length > 0) {
      const firstTableId = parseInt(tableIds[0]);
      if (firstTableId) {
      const areaReq = new mssql.Request(tx);
        areaReq.input("tableId", mssql.BigInt, firstTableId);
      const areaResult = await areaReq.query(`
        SELECT TOP 1 ${q("AreaId")} AS AreaID
        FROM dbo.[TableMaster]
        WHERE ${q("TableID")} = @tableId
      `);
      if (areaResult.recordset.length > 0) {
        finalAreaId = parseInt(areaResult.recordset[0].AreaID) || 0;
        }
      }
    }

    // 1. Resolve customer: if selected customer (customerId) provided, update that customer and use it; else find by phone or create new
    let customerID;
    const providedId = providedCustomerId != null && providedCustomerId !== "" ? parseInt(providedCustomerId, 10) : null;
    if (providedId && !isNaN(providedId)) {
      await updateCustomer(providedId, { name, email, phone }, tx);
      customerID = providedId;
      console.log("[RESERVATION] Using selected customer ID (updated):", customerID);
    } else {
      customerID = await findCustomerByPhone(phone, tx);
      if (!customerID) {
        console.log("[RESERVATION] Customer not found for phone:", phone, "- Creating new customer");
        try {
          customerID = await createCustomer({ name, email, phone }, tx);
          console.log("[RESERVATION] Successfully created customer with ID:", customerID);
        } catch (customerError) {
          console.error("[RESERVATION] Failed to create customer:", customerError);
          throw new Error(`Customer creation failed: ${customerError.message}`);
        }
      } else {
        console.log("[RESERVATION] Found existing customer ID:", customerID);
      }
    }

    // 2. Get server date/time for EnteredDate (within transaction)
    const dateTimeReq = new mssql.Request(tx);
    const dateTimeResult = await dateTimeReq.query("SELECT GETDATE() AS ServerDateTime");
    const enteredDate = dateTimeResult.recordset[0]?.ServerDateTime || new Date();

    // 3. Combine date and time for BookingDate
    const bookingDateTime = new Date(`${date}T${time}`);
    if (isNaN(bookingDateTime.getTime())) {
      throw new Error("Invalid date or time format");
    }

    // 4. Get next BookingID
    const bookingID = await getNextIdTx("BookingMaster", tx);
    console.log("[RESERVATION] Generated BookingID:", bookingID);

    // Generate confirmation code
    const confirmationCode = `RES-${new Date().getFullYear()}-${String(bookingID).padStart(6, '0')}`;

    // 5. Check if columns exist in BookingMaster
    const checkColumnsReq = new mssql.Request(tx);
    const columnsResult = await checkColumnsReq.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'BookingMaster'
    `);
    const existingColumns = new Set(columnsResult.recordset.map(row => row.COLUMN_NAME));
    
    // Check for advance payment column (handle typo)
    const advancePaymentColumn = existingColumns.has('AdvancePayment') ? 'AdvancePayment' : 
                                 existingColumns.has('AdavncePayment') ? 'AdavncePayment' : null;
    
    const hasNewFields = existingColumns.has('ReservationTime') || 
                         existingColumns.has('GuestName') || 
                         existingColumns.has('ConfirmationCode');
    
    const hasWalkInFields = existingColumns.has('IsWalkIn') && existingColumns.has('WalkInArrivalTime');
    
    console.log("[RESERVATION] Existing columns check:", {
      hasAdvancePayment: existingColumns.has('AdvancePayment'),
      hasAdavncePayment: existingColumns.has('AdavncePayment'),
      advancePaymentColumn,
      hasNewFields
    });

    // 6. Insert into BookingMaster (with or without new fields)
    const bookingMasterReq = new mssql.Request(tx);
    bookingMasterReq.input("BookingID", mssql.BigInt, bookingID);
    bookingMasterReq.input("BookingDate", mssql.DateTime, bookingDateTime);
    bookingMasterReq.input("EnteredDate", mssql.DateTime, enteredDate);
    bookingMasterReq.input("CustomerID", mssql.BigInt, customerID);
    // Only add advance payment if column exists
    if (advancePaymentColumn) {
      bookingMasterReq.input("AdvancePayment", mssql.Money, 0);
    }
    // Use initialStatus if provided (e.g., "SEATED" for walk-ins), otherwise default to "BOOKED"
    const bookingStatus = initialStatus || "BOOKED";
    bookingMasterReq.input("BookingStatus", mssql.VarChar(50), bookingStatus);
    bookingMasterReq.input("PartySize", mssql.Int, guestsNum);
    bookingMasterReq.input("BookingSource", mssql.VarChar(50), bookingSource || "ONLINE");
    bookingMasterReq.input("StationID", mssql.BigInt, 10);

    let bookingMasterSql;
    
    if (hasNewFields) {
      // Use new fields if they exist
      bookingMasterReq.input("GuestName", mssql.VarChar(150), name || null);
      bookingMasterReq.input("GuestPhone", mssql.VarChar(20), phone || null);
      bookingMasterReq.input("GuestEmail", mssql.VarChar(150), email || null);
      // Convert time string (HH:mm) to SQL Server Time format
      // SQL Server Time accepts Date objects or properly formatted strings
      let timeValue = null;
      if (time) {
        try {
          // Parse time string (HH:mm) and create a Date object with today's date
          const timeParts = time.split(':');
          if (timeParts.length >= 2) {
            const hours = parseInt(timeParts[0]);
            const minutes = parseInt(timeParts[1]);
            if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
              // Create a date object with just the time portion
              const timeDate = new Date();
              timeDate.setHours(hours, minutes, 0, 0);
              timeValue = timeDate;
            } else {
              console.warn("[RESERVATION] Invalid time format, skipping ReservationTime:", time);
              timeValue = null;
            }
          } else {
            console.warn("[RESERVATION] Invalid time format, skipping ReservationTime:", time);
            timeValue = null;
          }
        } catch (timeError) {
          console.warn("[RESERVATION] Error parsing time, skipping ReservationTime:", timeError);
          timeValue = null;
        }
      }
      bookingMasterReq.input("ReservationTime", mssql.Time, timeValue);
      bookingMasterReq.input("SpecialRequests", mssql.NVarChar(500), specialRequests || null);
      bookingMasterReq.input("Tags", mssql.VarChar(500), tags || null);
      bookingMasterReq.input("HostessID", mssql.BigInt, hostessId || null);
      bookingMasterReq.input("HostessName", mssql.VarChar(100), hostessName || null);
      bookingMasterReq.input("ConfirmationCode", mssql.VarChar(50), confirmationCode);
      bookingMasterReq.input("ConfirmationSent", mssql.Bit, 0);
      bookingMasterReq.input("ReminderSent", mssql.Bit, 0);
      bookingMasterReq.input("IsWalkIn", mssql.Bit, isWalkIn ? 1 : 0);
      // Set WalkInArrivalTime if it's a walk-in
      bookingMasterReq.input("WalkInArrivalTime", mssql.DateTime, isWalkIn ? enteredDate : null);
      bookingMasterReq.input("CreatedBy", mssql.VarChar(50), "ONLINE");
      bookingMasterReq.input("ModifiedBy", mssql.VarChar(50), null);
      bookingMasterReq.input("ModifiedOn", mssql.DateTime, null);

      // Build column list dynamically based on what exists
      const advancePaymentField = advancePaymentColumn ? `${q(advancePaymentColumn)},` : '';
      const advancePaymentParam = advancePaymentColumn ? '@AdvancePayment,' : '';
      
      bookingMasterSql = `
        INSERT INTO ${T_BOOKINGM} (
          ${q("BookingID")}, ${q("BookingDate")}, ${q("EnteredDate")},
          ${q("CustomerID")}, ${advancePaymentField} ${q("BookingStatus")},
          ${q("PartySize")}, ${q("BookingSource")}, ${q("StationID")},
          ${q("GuestName")}, ${q("GuestPhone")}, ${q("GuestEmail")},
          ${q("ReservationTime")}, ${q("SpecialRequests")}, ${q("Tags")},
          ${q("HostessID")}, ${q("HostessName")}, ${q("ConfirmationCode")},
          ${q("ConfirmationSent")}, ${q("ReminderSent")}, ${q("IsWalkIn")}, ${q("WalkInArrivalTime")},
          ${q("CreatedBy")}, ${q("ModifiedBy")}, ${q("ModifiedOn")}
        )
        VALUES (
          @BookingID, @BookingDate, @EnteredDate,
          @CustomerID, ${advancePaymentParam} @BookingStatus,
          @PartySize, @BookingSource, @StationID,
          @GuestName, @GuestPhone, @GuestEmail,
          @ReservationTime, @SpecialRequests, @Tags,
          @HostessID, @HostessName, @ConfirmationCode,
          @ConfirmationSent, @ReminderSent, @IsWalkIn, @WalkInArrivalTime,
          @CreatedBy, @ModifiedBy, @ModifiedOn
        )
      `;
    } else {
      // Fallback: Use only existing columns (before database update)
      console.log("[RESERVATION] New fields not found in database, using basic INSERT");
      const fallbackAdvancePaymentField = advancePaymentColumn ? `${q(advancePaymentColumn)},` : '';
      const fallbackAdvancePaymentParam = advancePaymentColumn ? '@AdvancePayment,' : '';
      
      bookingMasterSql = `
      INSERT INTO ${T_BOOKINGM} (
        ${q("BookingID")}, ${q("BookingDate")}, ${q("EnteredDate")},
          ${q("CustomerID")}, ${fallbackAdvancePaymentField} ${q("BookingStatus")},
        ${q("PartySize")}, ${q("BookingSource")}, ${q("StationID")}
      )
      VALUES (
        @BookingID, @BookingDate, @EnteredDate,
          @CustomerID, ${fallbackAdvancePaymentParam} @BookingStatus,
        @PartySize, @BookingSource, @StationID
      )
    `;
    }

    try {
    await bookingMasterReq.query(bookingMasterSql);
    console.log("[RESERVATION] Inserted BookingMaster:", bookingID);
    } catch (insertError) {
      // If insert fails, try fallback without new fields
      if (hasNewFields && insertError?.message?.includes("Invalid column name")) {
        console.warn("[RESERVATION] New fields not available, retrying with basic INSERT");
        const fallbackReq = new mssql.Request(tx);
        fallbackReq.input("BookingID", mssql.BigInt, bookingID);
        fallbackReq.input("BookingDate", mssql.DateTime, bookingDateTime);
        fallbackReq.input("EnteredDate", mssql.DateTime, enteredDate);
        fallbackReq.input("CustomerID", mssql.BigInt, customerID);
        // Only add advance payment if column exists
        if (advancePaymentColumn) {
          fallbackReq.input("AdvancePayment", mssql.Money, 0);
        }
        // Use initialStatus if provided (e.g., "SEATED" for walk-ins), otherwise default to "BOOKED"
        const fallbackBookingStatus = initialStatus || "BOOKED";
        fallbackReq.input("BookingStatus", mssql.VarChar(50), fallbackBookingStatus);
        fallbackReq.input("PartySize", mssql.Int, guestsNum);
        fallbackReq.input("BookingSource", mssql.VarChar(50), bookingSource || "ONLINE");
        fallbackReq.input("StationID", mssql.BigInt, 10);
        
        // Build fallback SQL dynamically (only include columns that exist)
        const finalFallbackAdvancePaymentField = advancePaymentColumn ? `${q(advancePaymentColumn)},` : '';
        const finalFallbackAdvancePaymentParam = advancePaymentColumn ? '@AdvancePayment,' : '';
        
        const fallbackSql = `
          INSERT INTO ${T_BOOKINGM} (
            ${q("BookingID")}, ${q("BookingDate")}, ${q("EnteredDate")},
            ${q("CustomerID")}, ${finalFallbackAdvancePaymentField} ${q("BookingStatus")},
            ${q("PartySize")}, ${q("BookingSource")}, ${q("StationID")}
          )
          VALUES (
            @BookingID, @BookingDate, @EnteredDate,
            @CustomerID, ${finalFallbackAdvancePaymentParam} @BookingStatus,
            @PartySize, @BookingSource, @StationID
          )
        `;
        await fallbackReq.query(fallbackSql);
        console.log("[RESERVATION] Inserted BookingMaster (fallback):", bookingID);
      } else {
        throw insertError;
      }
    }

    // 6. Insert BookingChild for each table (or with TableID = 0 if no table assigned yet)
    const bookingChildIDs = [];
    
    if (isGuestReservation) {
      // No tables selected - Create BookingChild with TableID = "0" (unassigned)
      const bookingChildID = await getNextIdTx("BookingChild", tx);
      bookingChildIDs.push(bookingChildID);
      console.log("[RESERVATION] No tables selected - creating BookingChild with TableID = 0 (unassigned):", bookingChildID);

      const bookingChildReq = new mssql.Request(tx);
      bookingChildReq.input("BookingChildID", mssql.BigInt, bookingChildID);
      bookingChildReq.input("BookingID", mssql.BigInt, bookingID);
      bookingChildReq.input("TableID", mssql.BigInt, 0); // 0 = no table assigned yet
      bookingChildReq.input("AreaID", mssql.BigInt, finalAreaId || 0); // 0 if no area selected
      // Use initialStatus if provided, otherwise default to "BOOKED"
      const bookingStatus = initialStatus || "BOOKED";
      bookingChildReq.input("Status", mssql.VarChar(50), bookingStatus);
      bookingChildReq.input("Notes", mssql.NVarChar(500), specialRequests || null);
      bookingChildReq.input("SeatedTime", mssql.DateTime, null);
      bookingChildReq.input("VacatedTime", mssql.DateTime, null);
      bookingChildReq.input("CreatedOn", mssql.DateTime, enteredDate);
      bookingChildReq.input("ModifiedOn", mssql.DateTime, null);

      const bookingChildSql = `
        INSERT INTO ${T_BOOKINGC} (
          ${q("BookingChildID")}, ${q("BookingID")}, ${q("TableID")},
          ${q("AreaID")}, ${q("Status")}, ${q("Notes")},
          ${q("SeatedTime")}, ${q("VacatedTime")}, ${q("CreatedOn")}, ${q("ModifiedOn")}
        )
        VALUES (
          @BookingChildID, @BookingID, @TableID,
          @AreaID, @Status, @Notes,
          @SeatedTime, @VacatedTime, @CreatedOn, @ModifiedOn
        )
      `;

      await bookingChildReq.query(bookingChildSql);
      console.log("[RESERVATION] BookingChild created with TableID = 0 (unassigned)");
    } else {
      // Regular reservation: one BookingChild row per table (TableID bigint - no DB migration needed)
      for (const tid of tableIds) {
        const tidNum = typeof tid === "number" ? tid : parseInt(tid, 10);
        if (isNaN(tidNum) || tidNum <= 0) continue;

        let tableAreaId = finalAreaId || 0;
        const areaReq = new mssql.Request(tx);
        areaReq.input("tableId", mssql.BigInt, tidNum);
        const areaRes = await areaReq.query(`SELECT TOP 1 ${q("AreaId")} AS AreaID FROM dbo.[TableMaster] WHERE ${q("TableID")} = @tableId`);
        if (areaRes.recordset.length > 0) tableAreaId = parseInt(areaRes.recordset[0].AreaID) || tableAreaId;

        const bookingChildID = await getNextIdTx("BookingChild", tx);
        bookingChildIDs.push(bookingChildID);

        const bookingChildReq = new mssql.Request(tx);
        bookingChildReq.input("BookingChildID", mssql.BigInt, bookingChildID);
        bookingChildReq.input("BookingID", mssql.BigInt, bookingID);
        bookingChildReq.input("TableID", mssql.BigInt, tidNum);
        bookingChildReq.input("AreaID", mssql.BigInt, tableAreaId);
        bookingChildReq.input("Status", mssql.VarChar(50), initialStatus || "BOOKED");
        bookingChildReq.input("Notes", mssql.NVarChar(500), null);
        bookingChildReq.input("SeatedTime", mssql.DateTime, null);
        bookingChildReq.input("VacatedTime", mssql.DateTime, null);
        bookingChildReq.input("CreatedOn", mssql.DateTime, enteredDate);
        bookingChildReq.input("ModifiedOn", mssql.DateTime, null);

        await bookingChildReq.query(`
          INSERT INTO ${T_BOOKINGC} (
            ${q("BookingChildID")}, ${q("BookingID")}, ${q("TableID")},
            ${q("AreaID")}, ${q("Status")}, ${q("Notes")},
            ${q("SeatedTime")}, ${q("VacatedTime")}, ${q("CreatedOn")}, ${q("ModifiedOn")}
          )
          VALUES (
            @BookingChildID, @BookingID, @TableID,
            @AreaID, @Status, @Notes,
            @SeatedTime, @VacatedTime, @CreatedOn, @ModifiedOn
          )
        `);
      }
      console.log("[RESERVATION] Inserted", tableIds.length, "BookingChild row(s) for tables:", tableIds.join(", "));
    }

    // Commit transaction
    await tx.commit();

    return {
      ok: true,
      bookingID,
      bookingChildIDs,
      customerID,
      confirmationCode,
      message: "Reservation created successfully",
    };
  } catch (error) {
    await tx.rollback();
    console.error("[RESERVATION] Error creating reservation:", error);
    throw error;
  }
}

/**
 * Create a guest reservation (online booking without table assignment)
 * Creates only BookingMaster record with PENDING status
 * Staff will assign tables later
 * Note: AreaID is stored in SpecialRequests as a preference (not in BookingMaster schema)
 */
export async function createGuestReservation(guestData) {
  const {
    name,
    phone,
    email,
    date,
    time,
    guests,
    areaId,
    tags,
    specialRequests,
  } = guestData;

  console.log("[GUEST RESERVATION] Creating guest reservation:", { name, phone, date, time, guests, areaId });
  
  // Add area preference to special requests if provided
  let fullSpecialRequests = specialRequests || '';
  if (areaId) {
    const areaNote = `[Preferred Area ID: ${areaId}]`;
    fullSpecialRequests = fullSpecialRequests 
      ? `${areaNote} ${fullSpecialRequests}`
      : areaNote;
  }

  // Validation
  if (!date || !time) {
    throw new Error("Date and time are required");
  }
  if (!name || name.trim() === '') {
    throw new Error("Customer name is required");
  }
  // Phone is optional - some guests prefer not to share
  if (!guests || guests < 1) {
    throw new Error("Number of guests must be at least 1");
  }
  // AreaId is optional but preferred for better service
  // It will be stored in SpecialRequests as a note for staff

  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);

  try {
    await tx.begin();

    // 1. Find or create customer
    let customerID = await findCustomerByPhone(phone, tx);
    if (!customerID) {
      customerID = await createCustomer({ name, phone, email }, tx);
      console.log("[GUEST RESERVATION] Created new customer:", customerID);
    } else {
      console.log("[GUEST RESERVATION] Found existing customer:", customerID);
    }

    // 2. Get server date/time
    const dateReq = new mssql.Request(tx);
    const dateResult = await dateReq.query("SELECT GETDATE() AS ServerDate");
    const enteredDate = dateResult.recordset[0].ServerDate;

    // 3. Combine date and time for BookingDate
    // Create date string without timezone to avoid conversion issues
    // SQL Server will interpret this as local server time
    const bookingDateStr = `${date}T${time}:00`;
    const bookingDate = new Date(bookingDateStr);
    console.log("[GUEST RESERVATION] Booking date/time string:", bookingDateStr, "Date object:", bookingDate, "ISO:", bookingDate.toISOString());

    // 4. Get next BookingID
    const bookingID = await getNextIdTx("BookingMaster", tx);
    console.log("[GUEST RESERVATION] Generated BookingID:", bookingID);

    // 5. Check for AdvancePayment column (handle typo variant)
    const schemaReq = new mssql.Request(tx);
    const schemaSql = `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'BookingMaster' AND TABLE_SCHEMA = 'dbo'
    `;
    const schemaResult = await schemaReq.query(schemaSql);
    const existingColumns = new Set(schemaResult.recordset.map(r => r.COLUMN_NAME));
    const advancePaymentColumn = existingColumns.has('AdvancePayment') ? 'AdvancePayment' : 
                                 existingColumns.has('AdavncePayment') ? 'AdavncePayment' : null;
    
    console.log("[GUEST RESERVATION] AdvancePayment column:", advancePaymentColumn);

    // 6. Generate confirmation code
    const confirmationCode = `OPA${bookingID.toString().padStart(6, "0")}`;

    // 7. Insert BookingMaster with PENDING status
    // Using correct column names from existing schema
    const bookingMasterReq = new mssql.Request(tx);
    bookingMasterReq.input("BookingID", mssql.BigInt, bookingID);
    bookingMasterReq.input("CustomerID", mssql.BigInt, customerID);
    bookingMasterReq.input("BookingDate", mssql.DateTime, bookingDate);
    bookingMasterReq.input("EnteredDate", mssql.DateTime, enteredDate);
    // Add AdvancePayment if column exists (required, cannot be null)
    if (advancePaymentColumn) {
      bookingMasterReq.input("AdvancePayment", mssql.Money, 0);
    }
    bookingMasterReq.input("PartySize", mssql.Int, parseInt(guests)); // Correct: PartySize not NoOfGuests
    bookingMasterReq.input("BookingStatus", mssql.VarChar(50), "PENDING"); // PENDING for guest reservations
    bookingMasterReq.input("BookingSource", mssql.VarChar(50), "GUEST_ONLINE");
    bookingMasterReq.input("StationID", mssql.BigInt, 10); // Default station
    bookingMasterReq.input("GuestName", mssql.NVarChar(100), name);
    bookingMasterReq.input("GuestPhone", mssql.VarChar(25), phone || null);
    bookingMasterReq.input("GuestEmail", mssql.VarChar(100), email || null);
    // Convert time string (HH:mm) to SQL Server Time format
    // Parse time and create Date object using local time (not UTC) to match server timezone
    let reservationTimeValue = null;
    if (time) {
      try {
        const timeParts = time.split(':');
        if (timeParts.length >= 2) {
          const hours = parseInt(timeParts[0], 10);
          const minutes = parseInt(timeParts[1], 10);
          if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            // Create a Date object using local time (not UTC) to match server timezone
            // Use a fixed date and set local hours/minutes (not UTC)
            const baseDate = new Date('2000-01-01T00:00:00'); // Local time, no Z
            baseDate.setHours(hours, minutes, 0, 0); // Use setHours (local), not setUTCHours
            reservationTimeValue = baseDate;
            console.log("[GUEST RESERVATION] Parsed time:", time, "-> Time value:", reservationTimeValue.toTimeString(), "Local hours:", hours, "minutes:", minutes);
          } else {
            console.warn("[GUEST RESERVATION] Invalid time format, skipping ReservationTime:", time);
          }
        }
      } catch (timeError) {
        console.warn("[GUEST RESERVATION] Error parsing time, skipping ReservationTime:", timeError);
      }
    }
    // Save as TIME type (database column is TIME type based on query results)
    if (reservationTimeValue) {
      bookingMasterReq.input("ReservationTime", mssql.Time, reservationTimeValue);
    } else {
      // Fallback: save as string if time parsing failed
      bookingMasterReq.input("ReservationTime", mssql.VarChar(10), time || null);
    }
    bookingMasterReq.input("SpecialRequests", mssql.NVarChar(500), fullSpecialRequests || null);
    bookingMasterReq.input("Tags", mssql.NVarChar(200), tags || null);
    bookingMasterReq.input("ConfirmationCode", mssql.VarChar(50), confirmationCode);
    bookingMasterReq.input("ConfirmationSent", mssql.Bit, 0);
    bookingMasterReq.input("ReminderSent", mssql.Bit, 0);
    bookingMasterReq.input("IsWalkIn", mssql.Bit, 0);
    bookingMasterReq.input("WalkInArrivalTime", mssql.DateTime, null);
    bookingMasterReq.input("HostessID", mssql.BigInt, null);
    bookingMasterReq.input("HostessName", mssql.VarChar(100), null);
    bookingMasterReq.input("CreatedBy", mssql.VarChar(50), "Guest"); // Correct: CreatedBy not EnteredBy
    bookingMasterReq.input("ModifiedBy", mssql.VarChar(50), null);
    bookingMasterReq.input("ModifiedOn", mssql.DateTime, null); // Correct: ModifiedOn not ModifiedDate

    // Build SQL dynamically based on column existence
    const advancePaymentField = advancePaymentColumn ? `${q(advancePaymentColumn)},` : '';
    const advancePaymentParam = advancePaymentColumn ? '@AdvancePayment,' : '';

    const bookingMasterSql = `
      INSERT INTO ${T_BOOKINGM} (
        ${q("BookingID")}, ${q("BookingDate")}, ${q("EnteredDate")},
        ${q("CustomerID")}, ${advancePaymentField} ${q("BookingStatus")},
        ${q("PartySize")}, ${q("BookingSource")}, ${q("StationID")},
        ${q("GuestName")}, ${q("GuestPhone")}, ${q("GuestEmail")},
        ${q("ReservationTime")}, ${q("SpecialRequests")}, ${q("Tags")},
        ${q("HostessID")}, ${q("HostessName")}, ${q("ConfirmationCode")},
        ${q("ConfirmationSent")}, ${q("ReminderSent")}, ${q("IsWalkIn")}, ${q("WalkInArrivalTime")},
        ${q("CreatedBy")}, ${q("ModifiedBy")}, ${q("ModifiedOn")}
      )
      VALUES (
        @BookingID, @BookingDate, @EnteredDate,
        @CustomerID, ${advancePaymentParam} @BookingStatus,
        @PartySize, @BookingSource, @StationID,
        @GuestName, @GuestPhone, @GuestEmail,
        @ReservationTime, @SpecialRequests, @Tags,
        @HostessID, @HostessName, @ConfirmationCode,
        @ConfirmationSent, @ReminderSent, @IsWalkIn, @WalkInArrivalTime,
        @CreatedBy, @ModifiedBy, @ModifiedOn
      )
    `;

    await bookingMasterReq.query(bookingMasterSql);
    console.log("[GUEST RESERVATION] Inserted BookingMaster:", bookingID, "Status: PENDING");

    // 8. Create BookingChild with TableID = 0 (unassigned) so reservation appears in list
    // Staff will assign actual tables later when guest arrives
    const bookingChildID = await getNextIdTx("BookingChild", tx);
    console.log("[GUEST RESERVATION] Creating BookingChild with TableID = 0 (unassigned):", bookingChildID);

    const bookingChildReq = new mssql.Request(tx);
    bookingChildReq.input("BookingChildID", mssql.BigInt, bookingChildID);
    bookingChildReq.input("BookingID", mssql.BigInt, bookingID);
    bookingChildReq.input("TableID", mssql.NVarChar(200), "0"); // 0 = no table assigned yet
    bookingChildReq.input("AreaID", mssql.BigInt, parseInt(areaId) || 0); // Use preferred area if provided
    bookingChildReq.input("Status", mssql.VarChar(50), "PENDING");
    bookingChildReq.input("Notes", mssql.NVarChar(500), fullSpecialRequests || null);
    bookingChildReq.input("SeatedTime", mssql.DateTime, null);
    bookingChildReq.input("VacatedTime", mssql.DateTime, null);
    bookingChildReq.input("CreatedOn", mssql.DateTime, enteredDate);
    bookingChildReq.input("ModifiedOn", mssql.DateTime, null);

    const bookingChildSql = `
      INSERT INTO ${T_BOOKINGC} (
        ${q("BookingChildID")}, ${q("BookingID")}, ${q("TableID")},
        ${q("AreaID")}, ${q("Status")}, ${q("Notes")},
        ${q("SeatedTime")}, ${q("VacatedTime")}, ${q("CreatedOn")}, ${q("ModifiedOn")}
      )
      VALUES (
        @BookingChildID, @BookingID, @TableID,
        @AreaID, @Status, @Notes,
        @SeatedTime, @VacatedTime, @CreatedOn, @ModifiedOn
      )
    `;

    await bookingChildReq.query(bookingChildSql);
    console.log("[GUEST RESERVATION] BookingChild created with TableID = 0 (unassigned)");

    await tx.commit();



    // Send SMS after commit (don't rollback if SMS fails)
try {
  const smsText = buildGuestReservationMessage({
    name,
    confirmationCode,
    date,
    time,
    guests,
  });

  await sendReservationSms({
    phone,
    message: smsText,
  });

  console.log("[GUEST RESERVATION] SMS sent:", phone);
} catch (e) {
  console.warn("[GUEST RESERVATION] SMS failed but booking saved:", e.message);
}

    return {
      ok: true,
      bookingID,
      customerID,
      confirmationCode,
      status: "PENDING",
      message: "Guest reservation created successfully. Table will be assigned upon arrival.",
    };
  } catch (error) {
    await tx.rollback();
    console.error("[GUEST RESERVATION] Error creating guest reservation:", error);
    throw error;
  }
}

/**
 * Helper function to check which columns exist in BookingMaster and BookingChild
 * @returns {Promise<Object>} Object with existingColumns sets for both tables
 */
async function checkReservationColumns() {
  console.log("[RESERVATION-SERVICE-CHECK-COLUMNS] ENTRY");
  const pool = await connectToDb();
  const checkColumnsReq = pool.request();
  console.log("[RESERVATION-SERVICE-CHECK-COLUMNS] ABOUT TO RUN QUERY (INFORMATION_SCHEMA)");
  const [masterColumns, childColumns] = await Promise.all([
    checkColumnsReq.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'BookingMaster'
    `),
    pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'BookingChild'
    `)
  ]);
  
  return {
    masterColumns: new Set(masterColumns.recordset.map(row => row.COLUMN_NAME)),
    childColumns: new Set(childColumns.recordset.map(row => row.COLUMN_NAME))
  };
}

/**
 * Helper function to build dynamic SELECT fields based on existing columns
 * @param {Set} existingColumns - Set of existing column names
 * @returns {Object} Object with field strings for SQL query
 */
function buildReservationSelectFields(existingColumns) {
  const guestNameField = existingColumns.masterColumns.has('GuestName') ? 'bm.[GuestName] AS guestName,' : '';
  const guestPhoneField = existingColumns.masterColumns.has('GuestPhone') ? 'bm.[GuestPhone] AS guestPhone,' : '';
  const guestEmailField = existingColumns.masterColumns.has('GuestEmail') ? 'bm.[GuestEmail] AS guestEmail,' : '';
  const reservationTimeField = existingColumns.masterColumns.has('ReservationTime') ? 'bm.[ReservationTime] AS reservationTime,' : '';
  const specialRequestsField = existingColumns.masterColumns.has('SpecialRequests') ? 'bm.[SpecialRequests] AS specialRequests,' : '';
  const tagsField = existingColumns.masterColumns.has('Tags') ? 'bm.[Tags] AS tags,' : '';
  const hostessIdField = existingColumns.masterColumns.has('HostessID') ? 'bm.[HostessID] AS hostessID,' : '';
  const hostessNameField = existingColumns.masterColumns.has('HostessName') ? 'bm.[HostessName] AS hostessName,' : '';
  const confirmationCodeField = existingColumns.masterColumns.has('ConfirmationCode') ? 'bm.[ConfirmationCode] AS confirmationCode,' : '';
  const isWalkInField = existingColumns.masterColumns.has('IsWalkIn') ? 'bm.[IsWalkIn] AS isWalkIn,' : '';
  const walkInArrivalTimeField = existingColumns.masterColumns.has('WalkInArrivalTime') ? 'bm.[WalkInArrivalTime] AS walkInArrivalTime,' : '';
  
  const advancePaymentColumn = existingColumns.masterColumns.has('AdvancePayment') ? 'AdvancePayment' : 
                               existingColumns.masterColumns.has('AdavncePayment') ? 'AdavncePayment' : null;
  const advancePaymentField = advancePaymentColumn ? `bm.[${advancePaymentColumn}] AS advancePayment,` : '';
  
  const tableNotesField = existingColumns.childColumns.has('Notes') ? 'bc.[Notes] AS tableNotes,' : '';
  const seatedTimeField = existingColumns.childColumns.has('SeatedTime') ? 'bc.[SeatedTime] AS seatedTime,' : '';
  const vacatedTimeField = existingColumns.childColumns.has('VacatedTime') ? 'bc.[VacatedTime] AS vacatedTime,' : '';
  
  return {
    guestNameField,
    guestPhoneField,
    guestEmailField,
    reservationTimeField,
    specialRequestsField,
    tagsField,
    hostessIdField,
    hostessNameField,
    confirmationCodeField,
    isWalkInField,
    walkInArrivalTimeField,
    advancePaymentField,
    tableNotesField,
    seatedTimeField,
    vacatedTimeField
  };
}

/**
 * Helper function to map database row to reservation object
 * @param {Object} row - Database row
 * @param {string} selectedDate - Selected date for fallback
 * @returns {Object} Formatted reservation object
 */
function mapReservationRow(row, selectedDate) {
  const customerName = row.guestName || row.customerNameFromMaster || "Guest";
  const customerPhone = row.guestPhone || row.customerPhoneFromMaster || "";
  const customerEmail = row.guestEmail || row.customerEmailFromMaster || "";
  
  // Format reservation time
  let reservationTime = null;
  if (row.reservationTime) {
    if (typeof row.reservationTime === 'string') {
      reservationTime = row.reservationTime.slice(0, 5); // HH:mm
    } else if (row.reservationTime instanceof Date) {
      reservationTime = row.reservationTime.toTimeString().slice(0, 5);
    } else {
      const timeStr = String(row.reservationTime);
      reservationTime = timeStr.slice(0, 5);
    }
  } else if (row.bookingDate) {
    reservationTime = new Date(row.bookingDate).toTimeString().slice(0, 5);
  }
  
  return {
    reservationId: row.bookingID,
    bookingID: row.bookingID,
    bookingChildID: row.bookingChildID,
    reservationDate: row.bookingDate ? formatLocalDate(row.bookingDate) : selectedDate,
    reservationTime: reservationTime,
    customerID: row.customerID,
    customerName: customerName,
    customerPhone: customerPhone,
    customerEmail: customerEmail,
    numberOfGuests: row.partySize || 1,
    pax: row.partySize || 1,
    tableId: row.tableId && String(row.tableId).indexOf(",") >= 0
      ? parseInt(String(row.tableId).split(",")[0], 10)
      : Number(row.tableId),
    tableIds: row.tableId && String(row.tableId).indexOf(",") >= 0 ? String(row.tableId).trim() : null,
    tableNo: row.tableNo,
    tableName: row.tableName,
    areaId: row.areaId ? Number(row.areaId) : null,
    areaName: row.areaName || "Dining",
    status: row.status || row.bookingStatus || "PENDING",
    partySize: row.partySize || 1,
    advancePayment: parseFloat(row.advancePayment || 0),
    specialRequests: row.specialRequests || "",
    tags: row.tags || "",
    hostessID: row.hostessID,
    hostessName: row.hostessName || "",
    confirmationCode: row.confirmationCode || "",
    confirmationSent: row.confirmationSent || false,
    reminderSent: row.reminderSent || false,
    isWalkIn: row.isWalkIn || false,
    bookingSource: row.bookingSource || "ONLINE",
    walkInArrivalTime: row.walkInArrivalTime,
    tableNotes: row.tableNotes || "",
    seatedTime: row.seatedTime,
    vacatedTime: row.vacatedTime
  };
}

/**
 * Get reservations by date range (from date to date)
 * @param {Object} filters - Filter options
 * @param {string} filters.fromDate - Start date (YYYY-MM-DD)
 * @param {string} filters.toDate - End date (YYYY-MM-DD)
 * @param {string|Array} filters.status - Status filter (optional)
 * @param {number} filters.tableId - Table ID filter (optional)
 * @returns {Promise<Array>} Array of reservations
 */
export async function getReservationsByDateRange(filters = {}) {
  const { fromDate, toDate, status, tableId } = filters;
  console.log("[RESERVATION-SERVICE-DATE-RANGE] ENTRY", { fromDate, toDate, status, tableId });
  if (!fromDate || !toDate) {
    throw new Error("fromDate and toDate are required for date range query");
  }
  
  const pool = await connectToDb();
  const request = pool.request();
  request.input("fromDate", mssql.Date, fromDate);
  request.input("toDate", mssql.Date, toDate);
  
  if (tableId) {
    request.input("tableIdNum", mssql.BigInt, parseInt(tableId, 10) || 0);
  }
  
  // Working query: direct joins and explicit column list (matches SSMS-tested query)
  const reservationSelectFromJoins = `
    SELECT 
      bm.[BookingID] AS bookingID,
      bm.[BookingDate] AS bookingDate,
      bm.[EnteredDate] AS enteredDate,
      bm.[CustomerID] AS customerID,
      bm.[AdavncePayment] AS advancePayment,
      bm.[BookingStatus] AS bookingStatus,
      bm.[PartySize] AS partySize,
      bm.[BookingSource] AS bookingSource,
      bm.[GuestName] AS guestName,
      bm.[GuestPhone] AS guestPhone,
      bm.[GuestEmail] AS guestEmail,
      bm.[ReservationTime] AS reservationTime,
      bm.[SpecialRequests] AS specialRequests,
      bm.[Tags] AS tags,
      bm.[HostessID] AS hostessID,
      bm.[HostessName] AS hostessName,
      bm.[ConfirmationCode] AS confirmationCode,
      bm.[IsWalkIn] AS isWalkIn,
      bm.[WalkInArrivalTime] AS walkInArrivalTime,
      bc.[BookingChildID] AS bookingChildID,
      bc.[TableID] AS tableId,
      bc.[AreaID] AS areaId,
      bc.[Status] AS status,
      bc.[Notes] AS tableNotes,
      bc.[SeatedTime] AS seatedTime,
      bc.[VacatedTime] AS vacatedTime,
      cm.[CustomerName] AS customerNameFromMaster,
      cm.[MobileNo] AS customerPhoneFromMaster,
      cm.[Email] AS customerEmailFromMaster,
      t.[TableNO] AS tableNo,
      t.[TableName] AS tableName,
      a.[AreaName] AS areaName
    FROM dbo.[BookingMaster] bm
    INNER JOIN dbo.[BookingChild] bc ON bc.[BookingID] = bm.[BookingID]
    LEFT JOIN dbo.[CustomerMaster] cm ON cm.[CustomerID] = bm.[CustomerID]
    LEFT JOIN dbo.[TableMaster] t ON t.[TableID] = bc.[TableID]
    LEFT JOIN dbo.[AreaMaster] a ON a.[AreaID] = bc.[AreaID]
  `;
  let sql = reservationSelectFromJoins + `
    WHERE CONVERT(date, bm.[BookingDate]) >= @fromDate
      AND CONVERT(date, bm.[BookingDate]) <= @toDate
  `;
  
  // Apply status filter if provided
  if (status) {
    const statusList = Array.isArray(status) ? status : status.split(',').map(s => s.trim().toUpperCase());
    
    // Log cancelled filter processing
    if (statusList.includes('CANCELLED')) {
      console.log("[BACKEND][SERVICE][CANCELLED FILTER] Processing cancelled filter:", {
        fromDate,
        toDate,
        statusList,
        tableId,
        timestamp: new Date().toISOString()
      });
    }
    
    if (statusList.length === 1) {
      const statusValue = statusList[0];
      if (statusValue === 'BOOKED') {
        sql += ` AND bc.[Status] = 'BOOKED'`;
      } else if (statusValue === 'CONFIRMED') {
        sql += ` AND (COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = 'CONFIRMED' OR COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = '')`;
      } else if (statusValue === 'CANCELLED') {
        sql += ` AND COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) IN ('CANCELLED', 'CANCELLED_NOTIFY')`;
        console.log("[BACKEND][SERVICE][CANCELLED FILTER] SQL filter added for CANCELLED status (includes CANCELLED and CANCELLED_NOTIFY)");
      } else {
        sql += ` AND COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = @status`;
        request.input("status", mssql.NVarChar, statusValue);
      }
    } else {
      const statusConditions = statusList.map((s, i) => {
        if (s === 'CONFIRMED') {
          return `(COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = 'CONFIRMED' OR COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = '')`;
        } else if (s === 'BOOKED') {
          return `bc.[Status] = 'BOOKED'`;
        } else {
          request.input(`status${i}`, mssql.NVarChar, s);
          return `COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = @status${i}`;
        }
      });
      sql += ` AND (${statusConditions.join(' OR ')})`;
    }
  }
  
  // Apply tableId filter (one row per table, TableID = bigint)
  if (tableId) {
    request.input("tableIdNum", mssql.BigInt, parseInt(tableId, 10) || 0);
    sql += ` AND bc.[TableID] = @tableIdNum`;
  }
  
  sql += ` ORDER BY bm.[BookingDate], bc.[TableID]`;
  
  // Log SQL query for cancelled filter
  if (status && (status.toUpperCase() === 'CANCELLED' || (Array.isArray(status) && status.includes('CANCELLED')))) {
    console.log("[BACKEND][SERVICE][CANCELLED FILTER] Executing SQL query (preview):", sql.substring(0, 500) + "...");
  }
  
  // ---- Query test logging: exact SQL that runs (params inlined for copy to SSMS) ----
  const esc = (s) => String(s).replace(/'/g, "''");
  let sqlInlined = sql
    .replace(/@fromDate/g, `'${fromDate}'`)
    .replace(/@toDate/g, `'${toDate}'`);
  if (tableId != null) sqlInlined = sqlInlined.replace(/@tableIdNum/g, String(parseInt(tableId, 10) || 0));
  if (status) {
    const statusList = Array.isArray(status) ? status : status.split(',').map((s) => s.trim().toUpperCase());
    if (statusList.length === 1 && !['BOOKED', 'CONFIRMED', 'CANCELLED'].includes(statusList[0])) {
      sqlInlined = sqlInlined.replace(/@status\b/g, `N'${esc(statusList[0])}'`);
    } else {
      statusList.forEach((s, i) => {
        if (s !== 'BOOKED' && s !== 'CONFIRMED' && s !== 'CANCELLED')
          sqlInlined = sqlInlined.replace(new RegExp(`@status${i}\\b`, 'g'), `N'${esc(s)}'`);
      });
    }
  }
  console.log("[RESERVATION-QUERY-TEST] getReservationsByDateRange PARAMS: fromDate=" + fromDate + ", toDate=" + toDate + ", tableId=" + (tableId ?? 'null') + ", status=" + (status ?? 'null'));
  console.log("[RESERVATION-QUERY-TEST] --- QUERY THAT RUNS IN SQL (copy to SSMS) ---\n" + sqlInlined + "\n--- END QUERY ---");
  const queryStartMs = Date.now();
  const result = await request.query(sql);
  const queryTimeMs = Date.now() - queryStartMs;
  console.log("[RESERVATION-QUERY-TEST] getReservationsByDateRange EXECUTION TIME: " + queryTimeMs + " ms, ROWS: " + (result.recordset?.length ?? 0));
  console.log("[RESERVATION-SERVICE-DATE-RANGE] QUERY OK rows:", result.recordset?.length);
  
  // Log query results for cancelled filter
  if (status && (status.toUpperCase() === 'CANCELLED' || (Array.isArray(status) && status.includes('CANCELLED')))) {
    console.log("[BACKEND][SERVICE][CANCELLED FILTER] Query results:", {
      totalRows: result.recordset.length,
      first5Rows: result.recordset.slice(0, 5).map(row => ({
        bookingID: row.bookingID,
        bookingStatus: row.bookingStatus,
        childStatus: row.status,
        customerName: row.guestName || row.customerNameFromMaster,
        bookingDate: row.bookingDate
      })),
      allStatuses: result.recordset.map(row => row.status || row.bookingStatus),
      timestamp: new Date().toISOString()
    });
  }
  
  const rows = result.recordset || [];
  const byBooking = new Map();
  for (const row of rows) {
    const key = row.bookingID;
    if (!byBooking.has(key)) byBooking.set(key, []);
    byBooking.get(key).push(row);
  }
  return Array.from(byBooking.values()).map((group) => {
    const first = group[0];
    const tableIds = group.map((r) => Number(r.tableId)).filter((n) => !isNaN(n));
    const merged = mapReservationRow(first, fromDate);
    merged.tableId = tableIds[0] ?? merged.tableId;
    merged.tableIds = tableIds.length > 1 ? tableIds.join(",") : (merged.tableIds || null);
    return merged;
  });
}

/**
 * Get reservations for a specific date (current day)
 * @param {Object} filters - Filter options
 * @param {string} filters.date - Date (YYYY-MM-DD), defaults to today
 * @param {string|Array} filters.status - Status filter (optional)
 * @param {number} filters.tableId - Table ID filter (optional)
 * @returns {Promise<Array>} Array of reservations
 */
export async function getReservationsByDate(filters = {}) {
  const { date, status, tableId } = filters;
  const selectedDate = date || formatLocalDate();
  console.log("[RESERVATION-SERVICE-DATE] ENTRY", { date, selectedDate, status, tableId });
  
  const pool = await connectToDb();
  const request = pool.request();
  request.input("selectedDate", mssql.Date, selectedDate);
  
  if (tableId) {
    request.input("tableIdNum", mssql.BigInt, parseInt(tableId, 10) || 0);
  }
  
  // Use working query: direct joins and explicit column list (matches SSMS-tested query)
  const reservationSelectFromJoinsDate = `
    SELECT 
      bm.[BookingID] AS bookingID,
      bm.[BookingDate] AS bookingDate,
      bm.[EnteredDate] AS enteredDate,
      bm.[CustomerID] AS customerID,
      bm.[AdavncePayment] AS advancePayment,
      bm.[BookingStatus] AS bookingStatus,
      bm.[PartySize] AS partySize,
      bm.[BookingSource] AS bookingSource,
      bm.[GuestName] AS guestName,
      bm.[GuestPhone] AS guestPhone,
      bm.[GuestEmail] AS guestEmail,
      bm.[ReservationTime] AS reservationTime,
      bm.[SpecialRequests] AS specialRequests,
      bm.[Tags] AS tags,
      bm.[HostessID] AS hostessID,
      bm.[HostessName] AS hostessName,
      bm.[ConfirmationCode] AS confirmationCode,
      bm.[IsWalkIn] AS isWalkIn,
      bm.[WalkInArrivalTime] AS walkInArrivalTime,
      bc.[BookingChildID] AS bookingChildID,
      bc.[TableID] AS tableId,
      bc.[AreaID] AS areaId,
      bc.[Status] AS status,
      bc.[Notes] AS tableNotes,
      bc.[SeatedTime] AS seatedTime,
      bc.[VacatedTime] AS vacatedTime,
      cm.[CustomerName] AS customerNameFromMaster,
      cm.[MobileNo] AS customerPhoneFromMaster,
      cm.[Email] AS customerEmailFromMaster,
      t.[TableNO] AS tableNo,
      t.[TableName] AS tableName,
      a.[AreaName] AS areaName
    FROM dbo.[BookingMaster] bm
    INNER JOIN dbo.[BookingChild] bc ON bc.[BookingID] = bm.[BookingID]
    LEFT JOIN dbo.[CustomerMaster] cm ON cm.[CustomerID] = bm.[CustomerID]
    LEFT JOIN dbo.[TableMaster] t ON t.[TableID] = bc.[TableID]
    LEFT JOIN dbo.[AreaMaster] a ON a.[AreaID] = bc.[AreaID]
    WHERE CONVERT(date, bm.[BookingDate]) = @selectedDate
  `;
  let sql = reservationSelectFromJoinsDate;
  
  // Apply status filter if provided
  if (status) {
    const statusList = Array.isArray(status) ? status : status.split(',').map(s => s.trim().toUpperCase());
    
    // Log cancelled filter processing (single date)
    if (statusList.includes('CANCELLED')) {
      console.log("[BACKEND][SERVICE][CANCELLED FILTER] Processing cancelled filter (single date):", {
        date: selectedDate,
        statusList,
        tableId,
        timestamp: new Date().toISOString()
      });
    }
    
    if (statusList.length === 1) {
      const statusValue = statusList[0];
      if (statusValue === 'BOOKED') {
        sql += ` AND bc.[Status] = 'BOOKED'`;
      } else if (statusValue === 'CONFIRMED') {
        sql += ` AND (COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = 'CONFIRMED' OR COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = '')`;
      } else if (statusValue === 'CANCELLED') {
        sql += ` AND COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) IN ('CANCELLED', 'CANCELLED_NOTIFY')`;
        console.log("[BACKEND][SERVICE][CANCELLED FILTER] SQL filter added for CANCELLED status (includes CANCELLED and CANCELLED_NOTIFY)");
      } else {
        sql += ` AND COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = @status`;
        request.input("status", mssql.NVarChar, statusValue);
      }
    } else {
      const statusConditions = statusList.map((s, i) => {
        if (s === 'CONFIRMED') {
          return `(COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = 'CONFIRMED' OR COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = '')`;
        } else if (s === 'BOOKED') {
          return `bc.[Status] = 'BOOKED'`;
        } else {
          request.input(`status${i}`, mssql.NVarChar, s);
          return `COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(bc.[Status], ''))), ''), LTRIM(RTRIM(ISNULL(bm.[BookingStatus], '')))) = @status${i}`;
        }
      });
      sql += ` AND (${statusConditions.join(' OR ')})`;
    }
  }
  
  // Apply tableId filter if provided
  if (tableId) {
    sql += ` AND bc.[TableID] = @tableIdNum`;
  }
  
  sql += ` ORDER BY bm.[BookingDate], bc.[TableID]`;
  
  // Log SQL query for cancelled filter (single date)
  if (status && (status.toUpperCase() === 'CANCELLED' || (Array.isArray(status) && status.includes('CANCELLED')))) {
    console.log("[BACKEND][SERVICE][CANCELLED FILTER] Executing SQL query (preview):", sql.substring(0, 500) + "...");
  }
  
  // ---- Query test logging: exact SQL that runs (params inlined for copy to SSMS) ----
  const escDate = (s) => String(s).replace(/'/g, "''");
  let sqlInlinedDate = sql.replace(/@selectedDate/g, `'${selectedDate}'`);
  if (tableId != null) sqlInlinedDate = sqlInlinedDate.replace(/@tableIdNum/g, String(parseInt(tableId, 10) || 0));
  if (status) {
    const statusList = Array.isArray(status) ? status : status.split(',').map((s) => s.trim().toUpperCase());
    if (statusList.length === 1 && !['BOOKED', 'CONFIRMED', 'CANCELLED'].includes(statusList[0])) {
      sqlInlinedDate = sqlInlinedDate.replace(/@status\b/g, `N'${escDate(statusList[0])}'`);
    } else {
      statusList.forEach((s, i) => {
        if (s !== 'BOOKED' && s !== 'CONFIRMED' && s !== 'CANCELLED')
          sqlInlinedDate = sqlInlinedDate.replace(new RegExp(`@status${i}\\b`, 'g'), `N'${escDate(s)}'`);
      });
    }
  }
  console.log("[RESERVATION-QUERY-TEST] getReservationsByDate PARAMS: selectedDate=" + selectedDate + ", tableId=" + (tableId ?? 'null') + ", status=" + (status ?? 'null'));
  console.log("[RESERVATION-QUERY-TEST] --- QUERY THAT RUNS IN SQL (copy to SSMS) ---\n" + sqlInlinedDate + "\n--- END QUERY ---");
  const queryStartMsDate = Date.now();
  const result = await request.query(sql);
  const queryTimeMsDate = Date.now() - queryStartMsDate;
  console.log("[RESERVATION-QUERY-TEST] getReservationsByDate EXECUTION TIME: " + queryTimeMsDate + " ms, ROWS: " + (result.recordset?.length ?? 0));
  console.log("[RESERVATION-SERVICE-DATE] QUERY OK rows:", result.recordset?.length);
  
  // Log query results for cancelled filter (single date)
  if (status && (status.toUpperCase() === 'CANCELLED' || (Array.isArray(status) && status.includes('CANCELLED')))) {
    console.log("[BACKEND][SERVICE][CANCELLED FILTER] Query results (single date):", {
      totalRows: result.recordset.length,
      first5Rows: result.recordset.slice(0, 5).map(row => ({
        bookingID: row.bookingID,
        bookingStatus: row.bookingStatus,
        childStatus: row.status,
        customerName: row.guestName || row.customerNameFromMaster,
        bookingDate: row.bookingDate
      })),
      allStatuses: result.recordset.map(row => row.status || row.bookingStatus),
      timestamp: new Date().toISOString()
    });
  }
  
  const rows = result.recordset || [];
  const byBooking = new Map();
  for (const row of rows) {
    const key = row.bookingID;
    if (!byBooking.has(key)) byBooking.set(key, []);
    byBooking.get(key).push(row);
  }
  return Array.from(byBooking.values()).map((group) => {
    const first = group[0];
    const tableIds = group.map((r) => Number(r.tableId)).filter((n) => !isNaN(n));
    const merged = mapReservationRow(first, selectedDate);
    merged.tableId = tableIds[0] ?? merged.tableId;
    merged.tableIds = tableIds.length > 1 ? tableIds.join(",") : (merged.tableIds || null);
    return merged;
  });
}

/**
 * Get all reservations with optional filters
 * Supports both single date and date range queries
 * @param {Object} filters - Filter options
 * @param {string} filters.date - Single date (YYYY-MM-DD) - for current day query
 * @param {string} filters.fromDate - Start date (YYYY-MM-DD) - for date range query
 * @param {string} filters.toDate - End date (YYYY-MM-DD) - for date range query
 * @param {string|Array} filters.status - Status filter (optional)
 * @param {number} filters.tableId - Table ID filter (optional)
 * @returns {Promise<Array>} Array of reservations
 */
export async function getAllReservations(filters = {}) {
  const { fromDate, toDate, date } = filters;
  console.log("[RESERVATION-SERVICE-GET-ALL] ENTRY", { fromDate, toDate, date });
  // If both fromDate and toDate are provided, use date range query
  if (fromDate && toDate) {
    console.log("[RESERVATION-SERVICE-GET-ALL] -> calling getReservationsByDateRange");
    return await getReservationsByDateRange(filters);
  }
  // Otherwise, use single date query (defaults to today if no date provided)
  console.log("[RESERVATION-SERVICE-GET-ALL] -> calling getReservationsByDate");
  return await getReservationsByDate(filters);
}

/**
 * Get a single reservation by booking ID
 * @param {number|string} bookingId - Booking ID
 * @returns {Promise<Object|null>} Reservation object or null if not found
 */
export async function getReservationById(bookingId) {
  console.log("[RESERVATION-SERVICE-BY-ID] ENTRY", bookingId);
  if (!bookingId) {
    throw new Error("Booking ID is required");
  }
  
  const pool = await connectToDb();
  const request = pool.request();
  request.input("BookingID", mssql.BigInt, parseInt(bookingId, 10));
  
  // Use working query: direct joins and explicit column list (matches SSMS-tested query)
  console.log("[RESERVATION-SERVICE-BY-ID] ABOUT TO RUN QUERY (getReservationById SELECT)");
  const sql = `
    SELECT 
      bm.[BookingID] AS bookingID,
      bm.[BookingDate] AS bookingDate,
      bm.[EnteredDate] AS enteredDate,
      bm.[CustomerID] AS customerID,
      bm.[AdavncePayment] AS advancePayment,
      bm.[BookingStatus] AS bookingStatus,
      bm.[PartySize] AS partySize,
      bm.[BookingSource] AS bookingSource,
      bm.[GuestName] AS guestName,
      bm.[GuestPhone] AS guestPhone,
      bm.[GuestEmail] AS guestEmail,
      bm.[ReservationTime] AS reservationTime,
      bm.[SpecialRequests] AS specialRequests,
      bm.[Tags] AS tags,
      bm.[HostessID] AS hostessID,
      bm.[HostessName] AS hostessName,
      bm.[ConfirmationCode] AS confirmationCode,
      bm.[IsWalkIn] AS isWalkIn,
      bm.[WalkInArrivalTime] AS walkInArrivalTime,
      bc.[BookingChildID] AS bookingChildID,
      bc.[TableID] AS tableId,
      bc.[AreaID] AS areaId,
      bc.[Status] AS status,
      bc.[Notes] AS tableNotes,
      bc.[SeatedTime] AS seatedTime,
      bc.[VacatedTime] AS vacatedTime,
      cm.[CustomerName] AS customerNameFromMaster,
      cm.[MobileNo] AS customerPhoneFromMaster,
      cm.[Email] AS customerEmailFromMaster,
      t.[TableNO] AS tableNo,
      t.[TableName] AS tableName,
      a.[AreaName] AS areaName
    FROM dbo.[BookingMaster] bm
    INNER JOIN dbo.[BookingChild] bc ON bc.[BookingID] = bm.[BookingID]
    LEFT JOIN dbo.[CustomerMaster] cm ON cm.[CustomerID] = bm.[CustomerID]
    LEFT JOIN dbo.[TableMaster] t ON t.[TableID] = bc.[TableID]
    LEFT JOIN dbo.[AreaMaster] a ON a.[AreaID] = bc.[AreaID]
    WHERE bm.[BookingID] = @BookingID
    ORDER BY bc.[TableID]
  `;
  
  const result = await request.query(sql);
  console.log("[RESERVATION-SERVICE-BY-ID] QUERY OK rows:", result.recordset?.length);
  
  if (result.recordset.length === 0) {
    return null;
  }
  
  // Use first row for master data (all rows have same BookingMaster data)
  const row = result.recordset[0];
  const customerName = row.guestName || row.customerNameFromMaster || "Guest";
  const customerPhone = row.guestPhone || row.customerPhoneFromMaster || "";
  const customerEmail = row.guestEmail || row.customerEmailFromMaster || "";
  
  // Format reservation time
  let reservationTime = null;
  if (row.reservationTime) {
    if (typeof row.reservationTime === 'string') {
      reservationTime = row.reservationTime.slice(0, 5);
    } else if (row.reservationTime instanceof Date) {
      reservationTime = row.reservationTime.toTimeString().slice(0, 5);
    } else {
      const timeStr = String(row.reservationTime);
      reservationTime = timeStr.slice(0, 5);
    }
  } else if (row.bookingDate) {
    reservationTime = new Date(row.bookingDate).toTimeString().slice(0, 5);
  }
  
  const reservationDate = row.bookingDate ? formatLocalDate(row.bookingDate) : null;

  // Build tables from ALL BookingChild rows (one row per table)
  const tables = (result.recordset || []).map((r) => {
    const tid = r.tableId != null ? Number(r.tableId) : null;
    return {
      bookingChildID: r.bookingChildID,
      tableID: tid,
      tableId: tid,
      tableNo: r.tableNo,
      tableName: r.tableName,
      areaID: r.areaId ? Number(r.areaId) : null,
      areaId: r.areaId ? Number(r.areaId) : null,
      areaName: r.areaName || "Dining",
      status: r.status,
      notes: r.tableNotes || "",
      seatedTime: r.seatedTime,
      vacatedTime: r.vacatedTime
    };
  });
  const tableIdsStr = tables.map((t) => t.tableId).filter((id) => id != null && id !== 0).join(",") || null;

  return {
    reservationId: row.bookingID,
    bookingID: row.bookingID,
    bookingDate: row.bookingDate,
    enteredDate: row.enteredDate,
    reservationDate: reservationDate,
    reservationTime: reservationTime,
    customerID: row.customerID,
    customerName: customerName,
    customerPhone: customerPhone,
    customerEmail: customerEmail,
    numberOfGuests: row.partySize || 1,
    partySize: row.partySize || 1,
    advancePayment: parseFloat(row.advancePayment || 0),
    bookingStatus: row.bookingStatus,
    status: row.status || row.bookingStatus || "PENDING",
    bookingSource: row.bookingSource,
    specialRequests: row.specialRequests || "",
    tags: row.tags || "",
    hostessID: row.hostessID,
    hostessName: row.hostessName || "",
    confirmationCode: row.confirmationCode || "",
    isWalkIn: row.isWalkIn || false,
    walkInArrivalTime: row.walkInArrivalTime,
    tables,
    tableIds: tableIdsStr
  };
}

/**
 * Get reservations for a specific table
 * @param {number|string} tableId - Table ID
 * @returns {Promise<Array>} Array of reservations for the table
 */
export async function getReservationsByTable(tableId) {
  console.log("[RESERVATION-SERVICE-GET-BY-TABLE] ENTRY", tableId);
  if (!tableId) {
    throw new Error("Table ID is required");
  }
  // Use getAllReservations with tableId filter
  return await getAllReservations({ tableId: parseInt(tableId) });
}

/**
 * Update reservation status
 * @param {number|string} bookingId - Booking ID
 * @param {string} status - New status
 * @returns {Promise<Object>} Update result
 */
export async function updateReservationStatus(bookingId, status) {
  console.log("[RESERVATION-SERVICE-UPDATE-STATUS] ENTRY", { bookingId, status });
  if (!bookingId) {
    throw new Error("Booking ID is required");
  }
  
  if (!status) {
    throw new Error("Status is required");
  }
  
  // NO STATUS MAPPINGS - Every status remains exactly as set
  // Each status is independent and won't be converted to another status
  const statusMapping = {
    // All mappings removed - statuses stay as-is
  };
  
  const statusUpper = status.toUpperCase();
  // All valid statuses - NO MAPPINGS, each status stays exactly as set
  const validStatuses = [
    'BOOKED', 'CONFIRMED', 'LEFT_MESSAGE', 'ARRIVED', 'CHECKED_IN', 'CANCELLED', 
    'NO_SHOW', 'SEATED', 'PENDING', 'HOLD', 'LEFT', 'BUS_TABLE', 'PAID', 
    'PARTIALLY_SEATED', 'NO_ANSWER', 'WRONG_NUMBER', 'PARTIALLY_ARRIVED', 
    'LATE', 'CANCELLED_NOTIFY'
  ];
  
  // Map status if needed, otherwise use as-is
  let statusToUse = statusMapping[statusUpper] || statusUpper;
  
  // Validate the final status
  if (!validStatuses.includes(statusToUse)) {
    throw new Error(`Invalid status: ${status}. Valid statuses: ${validStatuses.join(', ')}`);
  }
  
  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);
  
  try {
    await tx.begin();
    
    const request = new mssql.Request(tx);
    request.input("BookingID", mssql.BigInt, parseInt(bookingId));
    request.input("Status", mssql.VarChar(50), statusToUse);
    
    // Update BookingMaster status (BookingID column may be varchar in DB)
    const updateMasterSql = `
      UPDATE dbo.[BookingMaster]
      SET ${q("BookingStatus")} = @Status
      WHERE TRY_CAST(${q("BookingID")} AS BIGINT) = @BookingID
    `;
    
    // Update BookingChild status (BookingID column may be varchar in DB)
    const updateChildSql = `
      UPDATE dbo.[BookingChild]
      SET ${q("Status")} = @Status
      WHERE TRY_CAST(${q("BookingID")} AS BIGINT) = @BookingID
    `;
    
    console.log("[RESERVATION-SERVICE-UPDATE-STATUS] ABOUT TO RUN QUERY (UPDATE BookingMaster)");
    const masterResult = await request.query(updateMasterSql);
    console.log("[RESERVATION-SERVICE-UPDATE-STATUS] ABOUT TO RUN QUERY (UPDATE BookingChild)");
    const childResult = await request.query(updateChildSql);
    
    // Check if any rows were updated
    const masterRowsAffected = masterResult.rowsAffected[0] || 0;
    const childRowsAffected = childResult.rowsAffected[0] || 0;
    
    console.log(`[RESERVATION][UPDATE-STATUS] Update attempt for BookingID ${bookingId}: ${statusUpper} -> ${statusToUse}`);
    console.log(`[RESERVATION][UPDATE-STATUS] Rows affected - Master: ${masterRowsAffected}, Child: ${childRowsAffected}`);
    
    if (masterRowsAffected === 0 && childRowsAffected === 0) {
      await tx.rollback();
      throw new Error(`Reservation with ID ${bookingId} not found`);
    }
    
    // Verify the update by reading back the status before committing
    const verifyRequest = new mssql.Request(tx);
    verifyRequest.input("BookingID", mssql.BigInt, parseInt(bookingId));
    const verifySql = `
      SELECT TOP 1 
        bm.[BookingStatus] AS bookingStatus,
        bc.[Status] AS status
      FROM dbo.[BookingMaster] bm
      INNER JOIN dbo.[BookingChild] bc ON TRY_CAST(bc.[BookingID] AS BIGINT) = TRY_CAST(bm.[BookingID] AS BIGINT)
      WHERE TRY_CAST(bm.[BookingID] AS BIGINT) = @BookingID
    `;
    console.log("[RESERVATION-SERVICE-UPDATE-STATUS] ABOUT TO RUN QUERY (verify SELECT)");
    const verifyResult = await verifyRequest.query(verifySql);
    
    if (verifyResult.recordset.length > 0) {
      const verifiedStatus = verifyResult.recordset[0].status;
      const verifiedBookingStatus = verifyResult.recordset[0].bookingStatus;
      console.log(`[RESERVATION][UPDATE-STATUS] Verified status before commit - Status: ${verifiedStatus}, BookingStatus: ${verifiedBookingStatus}`);
      
      if (verifiedStatus !== statusToUse || verifiedBookingStatus !== statusToUse) {
        console.error(`[RESERVATION][UPDATE-STATUS] WARNING: Status mismatch! Expected: ${statusToUse}, Got Status: ${verifiedStatus}, BookingStatus: ${verifiedBookingStatus}`);
      }
    }
    
    await tx.commit();
    console.log(`[RESERVATION][UPDATE-STATUS] Transaction committed for BookingID ${bookingId}: ${statusUpper} -> ${statusToUse} (Master: ${masterRowsAffected} rows, Child: ${childRowsAffected} rows)`);
    
    return {
      ok: true,
      message: `Reservation status updated to ${statusToUse}`,
      bookingID: parseInt(bookingId),
      status: statusToUse,
      originalStatus: statusUpper !== statusToUse ? statusUpper : undefined
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
