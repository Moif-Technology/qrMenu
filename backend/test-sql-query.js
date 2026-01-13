// Test the exact SQL query used by the reservation API
import dotenv from 'dotenv';
import mssql from 'mssql';
import { connectToDb } from './config/dbConfig.js';

dotenv.config();

async function testQuery() {
  try {
    const pool = await connectToDb();
    const date = '2026-01-09';
    
    console.log('\n=== Testing Reservation Query ===');
    console.log('Date parameter:', date);
    
    const request = pool.request();
    request.input("selectedDate", mssql.Date, date);
    
    const testSql = `
      SELECT 
        bm.BookingID,
        bm.GuestName,
        bm.PartySize,
        CONVERT(varchar, bm.BookingDate, 120) as BookingDate,
        CONVERT(date, bm.BookingDate) as BookingDateOnly,
        bm.BookingStatus,
        bm.BookingSource,
        bc.BookingChildID,
        bc.TableID,
        bc.Status
      FROM dbo.BookingMaster bm
      INNER JOIN dbo.BookingChild bc ON bc.BookingID = bm.BookingID
      WHERE CONVERT(date, bm.BookingDate) = @selectedDate
      ORDER BY bm.BookingID
    `;
    
    console.log('\nExecuting query...');
    const result = await request.query(testSql);
    
    console.log(`\nQuery returned ${result.recordset.length} rows:`);
    console.table(result.recordset);
    
    // Test without CONVERT
    console.log('\n\n=== Testing with string comparison ===');
    const request2 = pool.request();
    request2.input("selectedDate", mssql.NVarChar, date);
    
    const testSql2 = `
      SELECT 
        bm.BookingID,
        bm.GuestName,
        CONVERT(varchar, bm.BookingDate, 23) as BookingDateStr,
        CONVERT(date, bm.BookingDate) as BookingDateOnly
      FROM dbo.BookingMaster bm
      INNER JOIN dbo.BookingChild bc ON bc.BookingID = bm.BookingID
      WHERE CONVERT(varchar, bm.BookingDate, 23) = @selectedDate
      ORDER BY bm.BookingID
    `;
    
    const result2 = await request2.query(testSql2);
    console.log(`\nString comparison returned ${result2.recordset.length} rows:`);
    console.table(result2.recordset);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testQuery();

