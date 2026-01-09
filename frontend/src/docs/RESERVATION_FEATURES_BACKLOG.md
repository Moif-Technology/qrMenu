# Reservation System - Feature Backlog

This document tracks pending features for the reservation system that can be implemented in the future.

---

## 🔴 High Priority - Table Operations

### 1. Move Table (Shift Guests)
**Status:** Not Implemented  
**Location:** `frontend/src/pages/TableActionPage.jsx` (line 307 - shows "Coming soon" alert)

**What it does:**
- Transfers a seated party from one table to another
- Moves their order/KOT with them
- Updates both table statuses

**Real-world use case:**
```
Guest seated at Table 5 → Need to move to Table 12
- Table 5 becomes Available/Dirty
- Table 12 becomes Seated/Occupied
- Order transfers to Table 12
```

**Implementation notes:**
- Add modal/page to select target table
- Check target table is available and has enough capacity
- Update table statuses in store
- If integrated with KOT: Update KOTMaster TableID
- Update walk-in/reservation record with new table
- Show confirmation before moving

**Files to modify:**
- `frontend/src/pages/TableActionPage.jsx` - Add move table handler
- `frontend/src/store/reservationStore.js` - Add moveTable function
- `frontend/src/services/table.service.js` - Add API call (if backend needed)
- `backend/services/reservation.service.js` - Add move table logic (if backend needed)

**UI Flow:**
1. Click "Move Table" on seated/occupied table
2. Show modal with available tables (filter by capacity)
3. Select target table
4. Confirm action
5. Update both tables and order

---

### 2. Reassign Table (Change Reservation Table)
**Status:** Not Implemented  
**Location:** `frontend/src/pages/TableActionPage.jsx` (line 268 - shows "Coming soon" alert)

**What it does:**
- Changes which table is assigned to a future reservation
- Updates reservation record
- Updates both table statuses

**Real-world use case:**
```
Reservation: John Smith, 7:00 PM, Table 8
→ Reassign to Table 12 (Table 8 still occupied)
- Table 8 becomes Available
- Table 12 becomes Reserved
- Reservation record updated
```

**Implementation notes:**
- Add modal/page to select new table
- Check new table is available at reservation time
- Check new table has enough capacity
- Update reservation record (TableID)
- Update both table statuses
- Show confirmation

**Files to modify:**
- `frontend/src/pages/TableActionPage.jsx` - Add reassign handler
- `frontend/src/pages/ReservationDetailsPage.jsx` - Add reassign button
- `frontend/src/store/reservationStore.js` - Add reassignTable function
- `frontend/src/services/reservation.service.js` - Add reassign API call
- `backend/services/reservation.service.js` - Add reassign logic
- `backend/routes/reservation.routes.js` - Add PATCH /api/reservation/:id/table endpoint

**UI Flow:**
1. Click "Reassign Table" on reserved table or reservation details
2. Show modal with available tables (filter by capacity and time)
3. Select new table
4. Confirm action
5. Update reservation and both tables

---

### 3. Table Conflict Checking (Overlap Detection)
**Status:** Not Implemented  
**Location:** `frontend/src/pages/ReservationFormPage.jsx` - No conflict checking when creating/editing

**What it does:**
- Prevents double-booking by detecting overlapping reservations
- Shows conflict warnings with suggested alternatives
- Blocks reservation if conflict exists

**Real-world use case:**
```
Reservation 1: Table 5, 7:00 PM - 8:30 PM (90 min)
Reservation 2: Table 5, 8:00 PM - 9:30 PM (90 min)
→ OVERLAP! System blocks and suggests Table 8 or Table 12
```

**Implementation notes:**
- Check existing reservations for selected table on same date
- Calculate time windows: startTime to (startTime + duration)
- Detect overlaps: newStart < existingEnd AND newEnd > existingStart
- Show conflict warning with:
  - Conflicting reservation details
  - Overlap duration
  - Suggested alternative tables
- Block save if conflict exists (or allow override with warning)

**Files to modify:**
- `frontend/src/pages/ReservationFormPage.jsx` - Add conflict check in handleSubmit
- `frontend/src/services/reservation.service.js` - Add checkConflicts function
- `backend/services/reservation.service.js` - Add conflict checking logic
- `backend/routes/reservation.routes.js` - Add GET /api/reservation/conflicts endpoint

**Conflict Detection Logic:**
```javascript
function hasConflict(newReservation, existingReservations) {
  const newStart = new Date(`${newReservation.date}T${newReservation.time}`);
  const newEnd = new Date(newStart.getTime() + (durationMinutes * 60000));
  
  return existingReservations.some(existing => {
    const existingStart = new Date(`${existing.date}T${existing.time}`);
    const existingEnd = new Date(existingStart.getTime() + (existing.durationMinutes * 60000));
    
    // Overlap: new starts before existing ends AND new ends after existing starts
    return newStart < existingEnd && newEnd > existingStart;
  });
}
```

**UI Flow:**
1. User selects table, date, time in reservation form
2. On "Check Availability" or "Create Reservation" click
3. System checks for conflicts
4. If conflict:
   - Show error modal with conflict details
   - Show suggested alternative tables
   - Block save (or allow with warning)
5. If no conflict:
   - Proceed normally

---

## 📋 Implementation Checklist

### Move Table
- [ ] Create MoveTableModal component
- [ ] Add moveTable function to store
- [ ] Add API endpoint (if backend needed)
- [ ] Update table statuses
- [ ] Transfer order/KOT (if integrated)
- [ ] Update reservation/walk-in record
- [ ] Add confirmation dialog
- [ ] Test with different scenarios

### Reassign Table
- [ ] Create ReassignTableModal component
- [ ] Add reassignTable function to store
- [ ] Add API endpoint: PATCH /api/reservation/:id/table
- [ ] Update reservation record
- [ ] Update both table statuses
- [ ] Add confirmation dialog
- [ ] Test with different scenarios

### Conflict Checking
- [ ] Add conflict detection function
- [ ] Add API endpoint: GET /api/reservation/conflicts
- [ ] Create ConflictWarningModal component
- [ ] Integrate check in ReservationFormPage
- [ ] Show conflict details and suggestions
- [ ] Block save or allow override
- [ ] Test with overlapping reservations

---

## 🔧 Technical Details

### Default Reservation Duration
- **Current:** Not set (should be configurable)
- **Recommended:** 90 minutes (1.5 hours)
- **Location:** Should be in settings/config or per reservation

### Table Status Flow
```
Available → Reserved → Seated → Occupied → Dirty → Available
                ↓
            Cancelled → Available
```

### Conflict Detection Formula
```
Overlap exists if:
(newStart < existingEnd) AND (newEnd > existingStart)

Example:
Reservation A: 7:00 PM - 8:30 PM
Reservation B: 8:00 PM - 9:30 PM
→ 8:00 PM < 8:30 PM AND 9:30 PM > 7:00 PM = CONFLICT ✅
```

---

## 📝 Notes

- All three features are currently showing "Coming soon" alerts
- Conflict checking is the most critical (prevents double-booking)
- Move and Reassign are useful for daily operations
- Consider adding these features incrementally (one at a time)
- Test thoroughly with real-world scenarios before production

---

## 🚀 Future Enhancements (Optional)

- **Auto-suggest tables:** Based on party size, preferences, availability
- **Table combination:** Merge multiple tables for large parties
- **Reservation duration settings:** Per reservation or configurable default
- **Conflict resolution wizard:** Step-by-step guide to resolve conflicts
- **Audit log:** Track all table moves and reassignments

---

**Last Updated:** 2024  
**Status:** Ready for implementation when requested

