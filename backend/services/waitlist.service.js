// backend/services/waitlist.service.js
import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";
import { getNextID } from "../utils/commonUtils.js";

const T_IDCTRL = "dbo.IDControlManager";
const T_WAITLISTM = "dbo.WaitlistMaster";
const T_WAITLISTC = "dbo.WaitlistChild";
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

/**
 * Create a waitlist entry
 * @param {Object} waitlistData
 * @param {string} waitlistData.guestName - Guest name
 * @param {string} waitlistData.phone - Phone number
 * @param {string} waitlistData.email - Email (optional)
 * @param {number} waitlistData.partySize - Party size
 * @param {number} waitlistData.waitTimeMinutes - Wait time in minutes
 * @param {number|Array} waitlistData.tableIds - Preferred table IDs (optional)
 * @param {number} waitlistData.areaId - Preferred area ID (optional)
 * @param {string} waitlistData.notes - Notes (optional)
 * @param {string} waitlistData.specialRequests - Special requests (optional)
 * @param {number} waitlistData.hostessId - Hostess ID (optional)
 * @param {string} waitlistData.hostessName - Hostess name (optional)
 * @returns {Promise<Object>} Waitlist entry result
 */
export async function createWaitlistEntry(waitlistData) {
  const {
    guestName,
    phone,
    email,
    partySize,
    waitTimeMinutes,
    tableIds = [],
    areaId,
    notes,
    specialRequests,
    hostessId,
    hostessName,
  } = waitlistData;

  // Validation
  if (!guestName || !phone || !partySize || !waitTimeMinutes) {
    throw new Error("Missing required fields: guestName, phone, partySize, waitTimeMinutes");
  }

  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);

  try {
    await tx.begin();

    // Get server date/time
    const dateTimeReq = new mssql.Request(tx);
    const dateTimeResult = await dateTimeReq.query("SELECT GETDATE() AS ServerDateTime");
    const addedDate = dateTimeResult.recordset[0]?.ServerDateTime || new Date();

    // Calculate estimated ready time
    const estimatedReadyTime = new Date(addedDate.getTime() + waitTimeMinutes * 60000);

    // Get next WaitlistID
    const waitlistID = await getNextIdTx("WaitlistMaster", tx);
    console.log("[WAITLIST] Generated WaitlistID:", waitlistID);

    // Insert into WaitlistMaster
    const waitlistMasterReq = new mssql.Request(tx);
    waitlistMasterReq.input("WaitlistID", mssql.BigInt, waitlistID);
    waitlistMasterReq.input("GuestName", mssql.VarChar(150), guestName);
    waitlistMasterReq.input("GuestPhone", mssql.VarChar(20), phone || null);
    waitlistMasterReq.input("GuestEmail", mssql.VarChar(150), email || null);
    waitlistMasterReq.input("PartySize", mssql.BigInt, parseInt(partySize));
    waitlistMasterReq.input("WaitTimeMinutes", mssql.BigInt, parseInt(waitTimeMinutes));
    waitlistMasterReq.input("AddedDate", mssql.DateTime, addedDate);
    waitlistMasterReq.input("EstimatedReadyTime", mssql.DateTime, estimatedReadyTime);
    waitlistMasterReq.input("Status", mssql.VarChar(50), "WAITING");
    waitlistMasterReq.input("HostessID", mssql.BigInt, hostessId || null);
    waitlistMasterReq.input("HostessName", mssql.VarChar(100), hostessName || null);
    waitlistMasterReq.input("SpecialRequests", mssql.NVarChar(500), specialRequests || null);
    waitlistMasterReq.input("Notes", mssql.NVarChar(500), notes || null);
    waitlistMasterReq.input("NotifiedCount", mssql.Int, 0);
    waitlistMasterReq.input("LastNotifiedDate", mssql.DateTime, null);
    waitlistMasterReq.input("SeatedDate", mssql.DateTime, null);
    waitlistMasterReq.input("SeatedBookingID", mssql.BigInt, null);
    waitlistMasterReq.input("StationID", mssql.BigInt, 10);
    waitlistMasterReq.input("CreatedBy", mssql.VarChar(50), "ONLINE");
    waitlistMasterReq.input("CreatedOn", mssql.DateTime, addedDate);
    waitlistMasterReq.input("ModifiedBy", mssql.VarChar(50), null);
    waitlistMasterReq.input("ModifiedOn", mssql.DateTime, null);

    const waitlistMasterSql = `
      INSERT INTO ${T_WAITLISTM} (
        ${q("WaitlistID")}, ${q("GuestName")}, ${q("GuestPhone")}, ${q("GuestEmail")},
        ${q("PartySize")}, ${q("WaitTimeMinutes")}, ${q("AddedDate")}, ${q("EstimatedReadyTime")},
        ${q("Status")}, ${q("HostessID")}, ${q("HostessName")}, ${q("SpecialRequests")},
        ${q("Notes")}, ${q("NotifiedCount")}, ${q("LastNotifiedDate")}, ${q("SeatedDate")},
        ${q("SeatedBookingID")}, ${q("StationID")}, ${q("CreatedBy")}, ${q("CreatedOn")},
        ${q("ModifiedBy")}, ${q("ModifiedOn")}
      )
      VALUES (
        @WaitlistID, @GuestName, @GuestPhone, @GuestEmail,
        @PartySize, @WaitTimeMinutes, @AddedDate, @EstimatedReadyTime,
        @Status, @HostessID, @HostessName, @SpecialRequests,
        @Notes, @NotifiedCount, @LastNotifiedDate, @SeatedDate,
        @SeatedBookingID, @StationID, @CreatedBy, @CreatedOn,
        @ModifiedBy, @ModifiedOn
      )
    `;

    await waitlistMasterReq.query(waitlistMasterSql);
    console.log("[WAITLIST] Inserted WaitlistMaster:", waitlistID);

    // Insert WaitlistChild for each preferred table (if table exists)
    const waitlistChildIDs = [];
    const tableIdsArray = Array.isArray(tableIds) ? tableIds : (tableIds ? [tableIds] : []);
    
    if (tableIdsArray.length > 0) {
      try {
        // Check if WaitlistChild table exists
        const checkTableReq = new mssql.Request(tx);
        const checkTableResult = await checkTableReq.query(`
          SELECT COUNT(*) AS TableExists
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'WaitlistChild'
        `);
        
        const tableExists = checkTableResult.recordset[0]?.TableExists > 0;
        
        if (tableExists) {
          for (let i = 0; i < tableIdsArray.length; i++) {
            const currentTableId = parseInt(tableIdsArray[i]);
            if (!currentTableId) continue;

            // Get areaId for this table if not provided
            let tableAreaId = parseInt(areaId) || 0;
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

            const waitlistChildID = await getNextIdTx("WaitlistChild", tx);
            waitlistChildIDs.push(waitlistChildID);

            const waitlistChildReq = new mssql.Request(tx);
            waitlistChildReq.input("WaitlistChildID", mssql.BigInt, waitlistChildID);
            waitlistChildReq.input("WaitlistID", mssql.BigInt, waitlistID);
            waitlistChildReq.input("TableID", mssql.BigInt, currentTableId);
            waitlistChildReq.input("AreaID", mssql.BigInt, tableAreaId);
            waitlistChildReq.input("Priority", mssql.Int, i); // First table has priority 0
            waitlistChildReq.input("Status", mssql.VarChar(50), "PENDING");
            waitlistChildReq.input("CreatedOn", mssql.DateTime, addedDate);

            const waitlistChildSql = `
              INSERT INTO ${T_WAITLISTC} (
                ${q("WaitlistChildID")}, ${q("WaitlistID")}, ${q("TableID")},
                ${q("AreaID")}, ${q("Priority")}, ${q("Status")}, ${q("CreatedOn")}
              )
              VALUES (
                @WaitlistChildID, @WaitlistID, @TableID,
                @AreaID, @Priority, @Status, @CreatedOn
              )
            `;

            await waitlistChildReq.query(waitlistChildSql);
            console.log("[WAITLIST] Inserted WaitlistChild:", waitlistChildID, "for Table:", currentTableId);
          }
        } else {
          console.log("[WAITLIST] WaitlistChild table does not exist yet, skipping child entries");
        }
      } catch (childError) {
        // If WaitlistChild table doesn't exist or error, just log and continue
        console.warn("[WAITLIST] Error inserting WaitlistChild entries (table may not exist):", childError?.message);
      }
    }

    // Commit transaction
    await tx.commit();

    return {
      ok: true,
      waitlistID,
      waitlistChildIDs,
      message: "Waitlist entry created successfully",
    };
  } catch (error) {
    await tx.rollback();
    console.error("[WAITLIST] Error creating waitlist entry:", error);
    throw error;
  }
}

/**
 * Get all waitlist entries
 * @param {Object} filters - Optional filters
 * @param {string} filters.status - Filter by status
 * @returns {Promise<Array>} Waitlist entries
 */
export async function getWaitlistEntries(filters = {}) {
  const pool = await connectToDb();
  
  // Check if WaitlistMaster table exists
  try {
    const checkTableReq = pool.request();
    const checkTableResult = await checkTableReq.query(`
      SELECT COUNT(*) AS TableExists
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'WaitlistMaster'
    `);
    
    const tableExists = checkTableResult.recordset[0]?.TableExists > 0;
    
    if (!tableExists) {
      console.log("[WAITLIST] WaitlistMaster table does not exist yet, returning empty array");
      return [];
    }
  } catch (checkError) {
    console.warn("[WAITLIST] Error checking WaitlistMaster table:", checkError?.message);
    return [];
  }

  const request = pool.request();

  let sql = `
    SELECT 
      wm.[WaitlistID],
      wm.[GuestName],
      wm.[GuestPhone],
      wm.[GuestEmail],
      wm.[PartySize],
      wm.[WaitTimeMinutes],
      wm.[AddedDate],
      wm.[EstimatedReadyTime],
      wm.[Status],
      wm.[HostessID],
      wm.[HostessName],
      wm.[SpecialRequests],
      wm.[Notes],
      wm.[NotifiedCount],
      wm.[LastNotifiedDate],
      wm.[SeatedDate],
      wm.[SeatedBookingID],
      wm.[StationID],
      wm.[CreatedOn]
    FROM ${T_WAITLISTM} wm
    WHERE 1=1
  `;

  if (filters.status) {
    request.input("status", mssql.VarChar(50), filters.status);
    sql += ` AND wm.[Status] = @status`;
  }

  sql += ` ORDER BY wm.[AddedDate] ASC`;

  let result;
  try {
    result = await request.query(sql);
  } catch (queryError) {
    console.warn("[WAITLIST] Error querying WaitlistMaster:", queryError?.message);
    return [];
  }
  
  // Get child entries (preferred tables) for each waitlist entry
  const waitlistIDs = result.recordset.map(row => row.WaitlistID);
  
  let childEntries = [];
  if (waitlistIDs.length > 0) {
    const childRequest = pool.request();
    const childSql = `
      SELECT 
        wc.[WaitlistChildID],
        wc.[WaitlistID],
        wc.[TableID],
        wc.[AreaID],
        wc.[Priority],
        wc.[Status]
      FROM ${T_WAITLISTC} wc
      WHERE wc.[WaitlistID] IN (${waitlistIDs.map((_, i) => `@id${i}`).join(',')})
      ORDER BY wc.[WaitlistID], wc.[Priority]
    `;
    
    waitlistIDs.forEach((id, i) => {
      childRequest.input(`id${i}`, mssql.BigInt, id);
    });
    
    const childResult = await childRequest.query(childSql);
    childEntries = childResult.recordset;
  }

  // Group child entries by WaitlistID
  const childMap = new Map();
  childEntries.forEach(child => {
    if (!childMap.has(child.WaitlistID)) {
      childMap.set(child.WaitlistID, []);
    }
    childMap.get(child.WaitlistID).push({
      waitlistChildID: child.WaitlistChildID,
      tableID: child.TableID,
      areaID: child.AreaID,
      priority: child.Priority,
      status: child.Status
    });
  });

  // Map results
  const entries = result.recordset.map(row => ({
    waitlistId: row.WaitlistID,
    waitlistID: row.WaitlistID, // Support both formats
    guestName: row.GuestName,
    phone: row.GuestPhone || '',
    email: row.GuestEmail || '',
    partySize: row.PartySize,
    pax: row.PartySize, // Support both formats
    waitTimeMinutes: row.WaitTimeMinutes,
    addedTime: row.AddedDate ? new Date(row.AddedDate).toLocaleTimeString("en-US", { 
      hour: "2-digit", 
      minute: "2-digit",
      hour12: true 
    }) : '',
    addedDate: row.AddedDate ? new Date(row.AddedDate).toISOString() : null,
    estimatedReadyTime: row.EstimatedReadyTime ? new Date(row.EstimatedReadyTime).toLocaleTimeString("en-US", { 
      hour: "2-digit", 
      minute: "2-digit",
      hour12: true 
    }) : '',
    status: row.Status,
    hostess: row.HostessName || 'Unassigned',
    hostessId: row.HostessID,
    notes: row.Notes || '',
    specialRequests: row.SpecialRequests || '',
    notifiedCount: row.NotifiedCount || 0,
    lastNotifiedDate: row.LastNotifiedDate,
    seatedDate: row.SeatedDate,
    seatedBookingID: row.SeatedBookingID,
    preferredTables: childMap.get(row.WaitlistID) || []
  }));

  return entries;
}

/**
 * Update waitlist entry status
 * @param {number} waitlistID - Waitlist ID
 * @param {string} status - New status
 * @returns {Promise<Object>} Updated entry
 */
export async function updateWaitlistStatus(waitlistID, status) {
  const pool = await connectToDb();
  const request = pool.request();
  
  request.input("WaitlistID", mssql.BigInt, waitlistID);
  request.input("Status", mssql.VarChar(50), status);
  request.input("ModifiedOn", mssql.DateTime, new Date());

  const sql = `
    UPDATE ${T_WAITLISTM}
    SET ${q("Status")} = @Status,
        ${q("ModifiedOn")} = @ModifiedOn
    WHERE ${q("WaitlistID")} = @WaitlistID
  `;

  await request.query(sql);

  return {
    ok: true,
    waitlistID,
    status,
    message: "Waitlist status updated successfully"
  };
}

/**
 * Delete waitlist entry
 * @param {number} waitlistID - Waitlist ID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteWaitlistEntry(waitlistID) {
  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);

  try {
    await tx.begin();

    // Check if WaitlistChild table exists before trying to delete
    try {
      const checkTableReq = new mssql.Request(tx);
      const checkTableResult = await checkTableReq.query(`
        SELECT COUNT(*) AS TableExists
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'WaitlistChild'
      `);
      
      const tableExists = checkTableResult.recordset[0]?.TableExists > 0;
      
      if (tableExists) {
        // Delete child entries first
        const childReq = new mssql.Request(tx);
        childReq.input("WaitlistID", mssql.BigInt, waitlistID);
        await childReq.query(`
          DELETE FROM ${T_WAITLISTC}
          WHERE ${q("WaitlistID")} = @WaitlistID
        `);
      }
    } catch (childError) {
      // If WaitlistChild table doesn't exist, just continue
      console.warn("[WAITLIST] WaitlistChild table may not exist, skipping child deletion:", childError?.message);
    }

    // Delete master entry
    const masterReq = new mssql.Request(tx);
    masterReq.input("WaitlistID", mssql.BigInt, waitlistID);
    await masterReq.query(`
      DELETE FROM ${T_WAITLISTM}
      WHERE ${q("WaitlistID")} = @WaitlistID
    `);

    await tx.commit();

    return {
      ok: true,
      waitlistID,
      message: "Waitlist entry deleted successfully"
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

