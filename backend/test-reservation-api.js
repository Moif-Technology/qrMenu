// Test reservation API
import http from 'node:http';

const url = 'http://localhost:5001/api/reservation?date=2026-01-09';

console.log('Testing API:', url);

http.get(url, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\n=== API Response for date 2026-01-09 ===');
    console.log('Status Code:', res.statusCode);
    
    try {
      const json = JSON.parse(data);
      console.log('Response OK:', json.ok);
      console.log('Count:', json.count);
      console.log('\nReservations:');
      
      if (json.reservations && json.reservations.length > 0) {
        json.reservations.forEach((res, i) => {
          console.log(`\n${i + 1}. BookingID: ${res.bookingID}`);
          console.log(`   Name: ${res.customerName}`);
          console.log(`   Party Size: ${res.partySize}`);
          console.log(`   Status: ${res.status}`);
          console.log(`   Source: ${res.bookingSource || 'N/A'}`);
          console.log(`   Table: ${res.tableId || 'unassigned'}`);
          console.log(`   Date: ${res.reservationDate}`);
          console.log(`   Time: ${res.reservationTime}`);
        });
      } else {
        console.log('  No reservations returned');
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e.message);
      console.log('Raw response:', data);
    }
    
    process.exit(0);
  });
}).on('error', (e) => {
  console.error('Error:', e.message);
  process.exit(1);
});

