# Database Setup Checklist ✅

## Quick Checklist

- [ ] **STEP 1:** Add 17 new fields to BookingMaster
  - Script: `02_ADD_Fields_BookingMaster.sql`
  - ⚠️ **CRITICAL:** `ReservationTime` field is added (was missing!)

- [ ] **STEP 2:** Add 5 new fields to BookingChild
  - Script: `03_ADD_Fields_BookingChild.sql`

- [ ] **STEP 3:** Create WaitlistMaster table
  - Script: `04_CREATE_WaitlistMaster.sql`

- [ ] **STEP 4:** Create WaitlistChild table
  - Script: `05_CREATE_WaitlistChild.sql`

- [ ] **STEP 5:** Create ReservationStatusHistory table
  - Script: `06_CREATE_ReservationStatusHistory.sql`

- [ ] **STEP 6:** Create performance indexes
  - Script: `08_CREATE_Indexes.sql`

---

## OR Run All at Once

- [ ] **Run master script:** `00_RUN_ALL_SCRIPTS.sql`
  - This runs all steps 1-6 automatically (skips typo fix)

---

## After Setup

- [ ] Verify tables exist: `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('WaitlistMaster', 'WaitlistChild', 'ReservationStatusHistory')`
- [ ] Verify BookingMaster has new fields: `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'BookingMaster' AND COLUMN_NAME IN ('ReservationTime', 'GuestName', 'Tags')`
- [ ] Test creating a reservation
- [ ] Test adding to waitlist
- [ ] Update backend API to use new fields

---

## Summary

**Tables Modified:** 2
- BookingMaster (fixed typo + 17 new fields)
- BookingChild (5 new fields)

**Tables Created:** 3
- WaitlistMaster
- WaitlistChild
- ReservationStatusHistory

**Tables NOT Created:** 2
- ❌ NotificationLog (removed - not needed)
- ❌ CustomerMaster (already exists)

**Indexes Created:** 8
- Performance indexes on BookingMaster and BookingChild

