// Fix existing GUEST_ONLINE reservations by adding BookingChild records
import dotenv from 'dotenv';
import { connectToDb } from './config/dbConfig.js';
import mssql from 'mssql';

dotenv.config();

async function fixGuestReservations() {
  console.log('[FIX] Starting to fix GUEST_ONLINE reservations...');
  
  try {
    const pool = await connectToDb();
    console.log('[FIX] Connected to database');

    // Step 1: Find GUEST_ONLINE reservations without BookingChild records
    console.log('\n[FIX] Step 1: Finding GUEST_ONLINE reservations without BookingChild...');
    const findSql = `
      SELECT 
        bm.BookingID,
        bm.GuestName,
        bm.PartySize,
        bm.BookingDate,
        bm.BookingStatus,
        bm.BookingSource,
        bm.SpecialRequests
      FROM dbo.BookingMaster bm
      LEFT JOIN dbo.BookingChild bc ON bc.BookingID = bm.BookingID
      WHERE bm.BookingSource = 'GUEST_ONLINE'
        AND bc.BookingChildID IS NULL
      ORDER BY bm.BookingID
    `;
    
    const findResult = await pool.request().query(findSql);
    const missingBookings = findResult.recordset;
    
    console.log(`[FIX] Found ${missingBookings.length} GUEST_ONLINE reservations without BookingChild records:`);
    missingBookings.forEach(booking => {
      console.log(`  - BookingID ${booking.BookingID}: ${booking.GuestName}, ${booking.PartySize} guests, Status: ${booking.BookingStatus}`);
    });

    if (missingBookings.length === 0) {
      console.log('[FIX] No reservations to fix. All GUEST_ONLINE reservations have BookingChild records.');
      process.exit(0);
    }

    // Step 2: Get current max BookingChildID
    console.log('\n[FIX] Step 2: Getting current max BookingChildID...');
    const maxIdSql = `SELECT ISNULL(MAX(BookingChildID), 0) AS MaxID FROM dbo.BookingChild`;
    const maxIdResult = await pool.request().query(maxIdSql);
    let nextBookingChildID = Number(maxIdResult.recordset[0].MaxID) + 1;
    console.log(`[FIX] Current max BookingChildID: ${nextBookingChildID - 1}, starting from: ${nextBookingChildID}`);

    // Step 3: Insert BookingChild records for each missing booking
    console.log('\n[FIX] Step 3: Creating BookingChild records...');
    
    for (const booking of missingBookings) {
      const insertSql = `
        INSERT INTO dbo.BookingChild (
          BookingChildID,
          BookingID,
          TableID,
          AreaID,
          Status,
          Notes,
          SeatedTime,
          VacatedTime,
          CreatedOn,
          ModifiedOn
        )
        VALUES (
          @BookingChildID,
          @BookingID,
          @TableID,
          @AreaID,
          @Status,
          @Notes,
          @SeatedTime,
          @VacatedTime,
          @CreatedOn,
          @ModifiedOn
        )
      `;
      
      const request = pool.request();
      request.input('BookingChildID', mssql.BigInt, nextBookingChildID);
      request.input('BookingID', mssql.BigInt, booking.BookingID);
      request.input('TableID', mssql.BigInt, 0); // Unassigned
      request.input('AreaID', mssql.BigInt, 0); // No area assigned
      request.input('Status', mssql.VarChar(50), booking.BookingStatus || 'PENDING');
      request.input('Notes', mssql.NVarChar(500), booking.SpecialRequests || null);
      request.input('SeatedTime', mssql.DateTime, null);
      request.input('VacatedTime', mssql.DateTime, null);
      request.input('CreatedOn', mssql.DateTime, new Date());
      request.input('ModifiedOn', mssql.DateTime, null);
      
      await request.query(insertSql);
      console.log(`  ✓ Created BookingChildID ${nextBookingChildID} for BookingID ${booking.BookingID} (${booking.GuestName})`);
      nextBookingChildID++;
    }

    // Step 4: Update IDControlManager
    console.log('\n[FIX] Step 4: Updating IDControlManager...');
    const updateIdSql = `
      IF EXISTS (SELECT 1 FROM dbo.IDControlManager WHERE ControlName = 'BookingChild')
      BEGIN
        UPDATE dbo.IDControlManager
        SET ControlValue = @NewValue
        WHERE ControlName = 'BookingChild'
      END
      ELSE
      BEGIN
        INSERT INTO dbo.IDControlManager (ControlName, ControlValue, ControlStep, CreatedOn, CreatedBy, ModifiedOn, ModifiedBy)
        VALUES ('BookingChild', @NewValue, '1', GETDATE(), 'System', GETDATE(), 'System')
      END
    `;
    
    const updateIdRequest = pool.request();
    updateIdRequest.input('NewValue', mssql.BigInt, nextBookingChildID - 1);
    await updateIdRequest.query(updateIdSql);
    console.log(`[FIX] Updated IDControlManager.BookingChild to ${nextBookingChildID - 1}`);

    // Step 5: Verify the fix
    console.log('\n[FIX] Step 5: Verifying the fix...');
    const verifySql = `
      SELECT 
        bm.BookingID,
        bm.GuestName,
        bm.PartySize,
        bm.BookingDate,
        bm.BookingStatus,
        bm.BookingSource,
        bc.BookingChildID,
        bc.TableID,
        bc.Status
      FROM dbo.BookingMaster bm
      INNER JOIN dbo.BookingChild bc ON bc.BookingID = bm.BookingID
      WHERE bm.BookingSource = 'GUEST_ONLINE'
      ORDER BY bm.BookingID
    `;
    
    const verifyResult = await pool.request().query(verifySql);
    console.log(`\n[FIX] Verification - Found ${verifyResult.recordset.length} GUEST_ONLINE reservations with BookingChild records:`);
    verifyResult.recordset.forEach(booking => {
      console.log(`  ✓ BookingID ${booking.BookingID} (${booking.GuestName}): BookingChildID ${booking.BookingChildID}, TableID ${booking.TableID}, Status: ${booking.Status}`);
    });

    console.log('\n[FIX] ✅ Fix completed successfully!');
    console.log('[FIX] Guest online reservations should now appear in the reservation list.');
    
    process.exit(0);
  } catch (error) {
    console.error('[FIX] ❌ Error:', error);
    process.exit(1);
  }
}

fixGuestReservations();

