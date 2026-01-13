// Check GUEST_ONLINE reservations
import dotenv from 'dotenv';
import { connectToDb } from './config/dbConfig.js';

dotenv.config();

async function checkReservations() {
  try {
    const pool = await connectToDb();
    
    console.log('\n=== GUEST_ONLINE Reservations in BookingMaster ===');
    const r1 = await pool.request().query(`
      SELECT 
        BookingID,
        GuestName,
        PartySize,
        CONVERT(varchar, BookingDate, 120) as BookingDate,
        BookingStatus,
        BookingSource
      FROM dbo.BookingMaster 
      WHERE BookingSource='GUEST_ONLINE' 
      ORDER BY BookingID
    `);
    console.table(r1.recordset);
    
    console.log('\n=== BookingChild records for GUEST_ONLINE reservations ===');
    const r2 = await pool.request().query(`
      SELECT 
        bc.BookingChildID,
        bc.BookingID,
        bc.TableID,
        bc.AreaID,
        bc.Status,
        bm.GuestName
      FROM dbo.BookingChild bc 
      INNER JOIN dbo.BookingMaster bm ON bc.BookingID=bm.BookingID 
      WHERE bm.BookingSource='GUEST_ONLINE' 
      ORDER BY bc.BookingID
    `);
    console.table(r2.recordset);
    
    console.log('\n=== Reservations for 2026-01-09 ===');
    const r3 = await pool.request().query(`
      SELECT 
        bm.BookingID,
        bm.GuestName,
        bm.PartySize,
        CONVERT(varchar, bm.BookingDate, 120) as BookingDate,
        bm.BookingStatus,
        bm.BookingSource,
        bc.BookingChildID,
        bc.TableID,
        bc.Status as ChildStatus
      FROM dbo.BookingMaster bm
      LEFT JOIN dbo.BookingChild bc ON bc.BookingID = bm.BookingID
      WHERE CONVERT(date, bm.BookingDate) = '2026-01-09'
      ORDER BY bm.BookingID
    `);
    console.table(r3.recordset);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkReservations();

