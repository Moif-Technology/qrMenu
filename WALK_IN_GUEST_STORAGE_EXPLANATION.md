# Walk-In Guest Storage Explanation

## Where Walk-In Guests Are Saved

Walk-in guests are saved in the **same tables as regular reservations**, but with special flags to distinguish them:

### 1. **BookingMaster Table** (Main Booking Record)
   - **Primary Table**: `dbo.BookingMaster`
   - **Key Fields for Walk-Ins**:
     - `IsWalkIn` = `1` (bit) - Marks this as a walk-in guest
     - `WalkInArrivalTime` = Current date/time when guest was seated
     - `BookingSource` = `"WALKIN"` (instead of "ONLINE")
     - `BookingDate` = Current date
     - `BookingStatus` = `"BOOKED"` or `"CHECKED_IN"`
     - All other fields same as reservations (GuestName, GuestPhone, PartySize, etc.)

### 2. **BookingChild Table** (Table Assignments)
   - **Table**: `dbo.BookingChild`
   - **Purpose**: Links the booking to one or more tables
   - **Key Fields**:
     - `BookingID` - Links to BookingMaster
     - `TableID` - The table(s) assigned to the walk-in guest
     - `AreaID` - The area where the table is located
     - `Status` = `"BOOKED"` or `"CHECKED_IN"`
     - `SeatedTime` - When the guest was actually seated (if column exists)

### 3. **CustomerMaster Table** (Customer Information)
   - **Table**: `dbo.CustomerMaster`
   - **Purpose**: Stores customer information (if phone number provided)
   - **Behavior**: 
     - If customer with same phone exists → Uses existing CustomerID
     - If new customer → Creates new customer record
     - Customer is linked via `BookingMaster.CustomerID`

## How to Identify Walk-In Guests

### SQL Query to Get All Walk-In Guests:
```sql
SELECT 
    bm.BookingID,
    bm.GuestName,
    bm.GuestPhone,
    bm.PartySize,
    bm.WalkInArrivalTime,
    bm.BookingDate,
    bm.BookingStatus,
    bc.TableID,
    bc.AreaID,
    t.TableName,
    a.AreaName
FROM dbo.BookingMaster bm
INNER JOIN dbo.BookingChild bc ON bc.BookingID = bm.BookingID
LEFT JOIN dbo.TableMaster t ON t.TableID = bc.TableID
LEFT JOIN dbo.AreaMaster a ON a.AreaID = bc.AreaID
WHERE bm.IsWalkIn = 1
ORDER BY bm.WalkInArrivalTime DESC;
```

### SQL Query to Get Today's Walk-Ins:
```sql
SELECT *
FROM dbo.BookingMaster
WHERE IsWalkIn = 1
  AND CONVERT(date, WalkInArrivalTime) = CONVERT(date, GETDATE())
ORDER BY WalkInArrivalTime DESC;
```

## Difference Between Reservations and Walk-Ins

| Field | Reservation | Walk-In |
|-------|------------|---------|
| `IsWalkIn` | `0` (false) | `1` (true) |
| `BookingSource` | `"ONLINE"` or `"POS"` | `"WALKIN"` |
| `BookingDate` | Future date (reserved date) | Current date (today) |
| `ReservationTime` | Future time (reserved time) | Current time |
| `WalkInArrivalTime` | `NULL` | Current date/time |
| `ConfirmationCode` | Generated (e.g., RES-2025-000123) | Generated (same format) |

## What Happens When You Click "Seat Now"

1. **Frontend** (`WalkInPage.jsx`):
   - Collects guest information (name, phone, party size, selected tables)
   - Calls `createReservation()` API with `isWalkIn: true`

2. **Backend** (`reservation.service.js`):
   - Creates/updates customer in `CustomerMaster`
   - Creates booking record in `BookingMaster` with:
     - `IsWalkIn = 1`
     - `WalkInArrivalTime = current server time`
     - `BookingSource = "WALKIN"`
   - Creates table assignments in `BookingChild` (one record per selected table)
   - Returns booking ID and confirmation code

3. **Database**:
   - All data is saved in a transaction (all or nothing)
   - If any step fails, everything is rolled back

## Summary

**Walk-in guests are saved in:**
- ✅ **BookingMaster** - Main booking record (with `IsWalkIn = 1`)
- ✅ **BookingChild** - Table assignments (one per table)
- ✅ **CustomerMaster** - Customer information (if phone provided)

**They are NOT saved in a separate table** - they use the same structure as reservations, just marked differently with the `IsWalkIn` flag.

This design allows you to:
- Query all bookings (reservations + walk-ins) together
- Filter by walk-ins only (`WHERE IsWalkIn = 1`)
- Filter by reservations only (`WHERE IsWalkIn = 0`)
- Track arrival times for walk-ins separately
- Use the same reporting/analytics for both types

