# What Needs to be Updated - Summary

## ✅ Removed: Typo Fix (Will do later with senior)
- ~~Fix `AdavncePayment` → `AdvancePayment`~~ - **SKIPPED**

---

## 📋 What You Need to Do (6 Steps)

### **STEP 1: Add Fields to BookingMaster** ⚠️ CRITICAL
**Script:** `database_scripts/02_ADD_Fields_BookingMaster.sql`

**Adds 17 new fields:**
1. `GuestName` - Guest's name
2. `GuestPhone` - Phone number
3. `GuestEmail` - Email address
4. `ReservationTime` - ⚠️ **CRITICAL - This was missing!**
5. `ReservationEndTime` - Expected end time
6. `SpecialRequests` - Comments/Notes
7. `Tags` - Comma-separated tags (VIP,Birthday,etc.)
8. `HostessID` - Hostess ID
9. `HostessName` - Hostess name
10. `ConfirmationCode` - Unique confirmation code
11. `ConfirmationSent` - Whether confirmation sent
12. `ReminderSent` - Whether reminder sent
13. `LastNotificationDate` - Last notification date
14. `CreatedBy` - User who created
15. `ModifiedBy` - User who modified
16. `ModifiedOn` - Last modification date
17. `IsWalkIn` - Is walk-in guest
18. `WalkInArrivalTime` - When walk-in arrived

---

### **STEP 2: Add Fields to BookingChild**
**Script:** `database_scripts/03_ADD_Fields_BookingChild.sql`

**Adds 5 new fields:**
1. `Notes` - Table-specific notes
2. `SeatedTime` - When guest was seated
3. `VacatedTime` - When guest left
4. `CreatedOn` - Creation date
5. `ModifiedOn` - Last modification date

---

### **STEP 3: Create WaitlistMaster Table**
**Script:** `database_scripts/04_CREATE_WaitlistMaster.sql`

**New table for waitlist functionality:**
- Stores waitlist entries
- Guest info, wait time, status
- Notification tracking
- Links to booking if converted

---

### **STEP 4: Create WaitlistChild Table**
**Script:** `database_scripts/05_CREATE_WaitlistChild.sql`

**New table for waitlist table preferences:**
- Links waitlist entries to preferred tables
- Stores preferred area
- Priority and status

---

### **STEP 5: Create ReservationStatusHistory Table**
**Script:** `database_scripts/06_CREATE_ReservationStatusHistory.sql`

**New audit trail table:**
- Tracks all status changes
- Who changed it, when, why
- Old status → New status

---

### **STEP 6: Create Performance Indexes**
**Script:** `database_scripts/08_CREATE_Indexes.sql`

**Creates 8 indexes for better performance:**
- BookingMaster: BookingDate, BookingStatus, CustomerID, StationID
- BookingChild: BookingID, TableID, AreaID, Status

---

## 🚀 Quick Start

**Option 1: Run all at once**
```sql
-- Run this single script
database_scripts/00_RUN_ALL_SCRIPTS.sql
```

**Option 2: Run individually**
```sql
-- Run each script in order
02_ADD_Fields_BookingMaster.sql
03_ADD_Fields_BookingChild.sql
04_CREATE_WaitlistMaster.sql
05_CREATE_WaitlistChild.sql
06_CREATE_ReservationStatusHistory.sql
08_CREATE_Indexes.sql
```

---

## 📊 Summary

**Tables Modified:** 2
- ✅ BookingMaster (adds 17 fields)
- ✅ BookingChild (adds 5 fields)

**Tables Created:** 3
- ✅ WaitlistMaster
- ✅ WaitlistChild
- ✅ ReservationStatusHistory

**Indexes Created:** 8
- ✅ Performance indexes

**Total Changes:** 6 steps

---

## ⚠️ Important Notes

1. **ReservationTime is CRITICAL** - This field was completely missing and is required for reservations to work!

2. **All scripts are safe** - They check if fields/tables exist before creating, so you can run them multiple times

3. **Tags field** - Stores comma-separated values like "VIP,Birthday,Anniversary"

4. **CustomerMaster exists** - Use `CustomerID` in BookingMaster to link to existing customers

5. **Hostess can be hardcoded** - For now, you can hardcode hostess names in the application

