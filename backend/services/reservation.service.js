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

// Helper to check if customer exists by phone number
async function findCustomerByPhone(phone, tx) {
  const req = new mssql.Request(tx);
  req.input("phone", mssql.VarChar(25), String(phone).trim());

  const sql = `
    SELECT TOP 1 ${q("CustomerID")}
    FROM ${T_CUSTOMER}
    WHERE ${q("MobileNo")} = @phone
  `;

  const result = await req.query(sql);
  return result.recordset.length > 0 ? Number(result.recordset[0].CustomerID) : null;
}

// Helper to create a new customer
async function createCustomer(customerData, tx) {
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
  } = reservationData;

  // Convert tableId to array if single value
  let tableIds = [];
  if (Array.isArray(tableId)) {
    tableIds = tableId.filter(id => id != null && id !== '');
  } else if (tableId != null && tableId !== '') {
    tableIds = [tableId];
  }
  
  // Convert all table IDs to numbers
  tableIds = tableIds.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  
  // Check if this is a guest reservation (no tables selected)
  const isGuestReservation = bookingSource === "GUEST_ONLINE" && tableIds.length === 0;
  
  console.log("[RESERVATION] Validating input:", {
    tableIds,
    isGuestReservation,
    bookingSource,
    date,
    time,
    name: name?.substring(0, 20),
    phone: phone?.substring(0, 15),
    guests
  });

  // Validation - allow guest reservations without tables
  if (!tableIds.length && !isGuestReservation) {
    throw new Error("Missing required field: tableId (at least one table must be selected)");
  }
  
  // For guest reservations, require areaId
  if (isGuestReservation && (!areaId || parseInt(areaId) <= 0)) {
    throw new Error("Missing required field: areaId (required for guest reservations)");
  }
  if (!date || date.trim() === '') {
    throw new Error("Missing required field: date");
  }
  if (!time || time.trim() === '') {
    throw new Error("Missing required field: time");
  }
  if (!name || name.trim() === '') {
    throw new Error("Missing required field: name");
  }
  if (!phone || phone.trim() === '') {
    throw new Error("Missing required field: phone");
  }
  
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

    // 1. Check if customer exists by phone, if not create new customer
    let customerID = await findCustomerByPhone(phone, tx);
    
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

    // 6. Insert BookingChild for each table (or one entry for guest reservations)
    const bookingChildIDs = [];
    
    if (isGuestReservation) {
      // Guest reservation: Create single BookingChild without TableID
      const bookingChildID = await getNextIdTx("BookingChild", tx);
      bookingChildIDs.push(bookingChildID);
      console.log("[RESERVATION] Creating guest reservation BookingChild (no table):", bookingChildID);

      const bookingChildReq = new mssql.Request(tx);
      bookingChildReq.input("BookingChildID", mssql.BigInt, bookingChildID);
      bookingChildReq.input("BookingID", mssql.BigInt, bookingID);
      bookingChildReq.input("TableID", mssql.BigInt, null); // No table assigned yet
      bookingChildReq.input("AreaID", mssql.BigInt, finalAreaId);
      bookingChildReq.input("Status", mssql.VarChar(50), "PENDING"); // PENDING status for guest reservations
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
      console.log("[RESERVATION] Guest reservation BookingChild created successfully");
    } else {
      // Regular reservation: Create BookingChild for each table
      for (let i = 0; i < tableIds.length; i++) {
        const currentTableId = parseInt(tableIds[i]);
        
        // Get areaId for this table if not provided
        let tableAreaId = finalAreaId;
        if (!tableAreaId && currentTableId) {
          const areaReq = new mssql.Request(tx);
          areaReq.input("tableId", mssql.BigInt, currentTableId);
          const areaResult = await areaReq.query(`
            SELECT TOP 1 ${q("AreaId")} AS AreaID
            FROM dbo.[TableMaster]
            WHERE ${q("TableID")} = @tableId
          `);
          if (areaResult.recordset.length > 0) {
            tableAreaId = parseInt(areaResult.recordset[0].AreaID) || 0;
          }
        }

        const bookingChildID = await getNextIdTx("BookingChild", tx);
        bookingChildIDs.push(bookingChildID);

        const bookingChildReq = new mssql.Request(tx);
        bookingChildReq.input("BookingChildID", mssql.BigInt, bookingChildID);
        bookingChildReq.input("BookingID", mssql.BigInt, bookingID);
        bookingChildReq.input("TableID", mssql.BigInt, currentTableId);
        bookingChildReq.input("AreaID", mssql.BigInt, tableAreaId);
        // Use initialStatus if provided (e.g., "SEATED" for walk-ins), otherwise default to "BOOKED"
        const childStatus = initialStatus || "BOOKED";
        bookingChildReq.input("Status", mssql.VarChar(50), childStatus);
        bookingChildReq.input("Notes", mssql.NVarChar(500), null);
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
        console.log("[RESERVATION] Inserted BookingChild:", bookingChildID, "for Table:", currentTableId);
      }
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
  if (!phone || phone.trim() === '') {
    throw new Error("Phone number is required");
  }
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
    const bookingDate = new Date(`${date}T${time}:00`);
    console.log("[GUEST RESERVATION] Booking date/time:", bookingDate);

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
    bookingMasterReq.input("GuestPhone", mssql.VarChar(25), phone);
    bookingMasterReq.input("GuestEmail", mssql.VarChar(100), email || null);
    bookingMasterReq.input("ReservationTime", mssql.VarChar(10), time);
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

    // Note: No BookingChild records created for guest reservations
    // Staff will assign tables later when reviewing pending reservations

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

