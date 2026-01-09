# Reservation System Database Design

## Analysis of Existing Tables

### BookingMaster (Current)
```sql
[BookingID] [bigint] NOT NULL,          -- PK
[BookingDate] [datetime] NOT NULL,      -- Reservation date
[EnteredDate] [datetime] NOT NULL,      -- When record was created
[CustomerID] [bigint] NOT NULL,          -- FK to CustomerMaster (if exists)
[AdavncePayment] [money] NOT NULL,       -- ⚠️ TYPO: Should be "AdvancePayment"
[BookingStatus] [varchar](50) NOT NULL, -- Status: BOOKED, CONFIRMED, CANCELLED, COMPLETED, NO-SHOW
[PartySize] [bigint] NOT NULL,           -- Number of guests
[BookingSource] [varchar](50) NOT NULL,  -- Source: WEB, PHONE, WALK-IN, APP, etc.
[StationID] [bigint] NOT NULL
```

### BookingChild (Current)
```sql
[BookingChildID] [bigint] NOT NULL,     -- PK
[BookingID] [bigint] NOT NULL,          -- FK to BookingMaster
[TableID] [bigint] NOT NULL,            -- FK to TableMaster
[AreaID] [bigint] NOT NULL,              -- FK to AreaMaster
[Status] [varchar](50) NOT NULL          -- Status: BOOKED, SEATED, CANCELLED, COMPLETED
```

---

## Required Changes to Existing Tables

### 1. BookingMaster - ADD Fields
```sql
-- Guest Information (if CustomerMaster doesn't exist or for walk-ins)
[GuestName] [varchar](150) NULL,              -- Guest name
[GuestPhone] [varchar](20) NULL,               -- Phone number
[GuestEmail] [varchar](150) NULL,              -- Email (optional)

-- Reservation Details
[ReservationTime] [time] NOT NULL,              -- ⚠️ MISSING: Reservation time (not just date)
[ReservationEndTime] [time] NULL,              -- Expected end time (optional)
[SpecialRequests] [nvarchar](500) NULL,          -- Comments/Notes
[Tags] [varchar](500) NULL,                    -- Comma-separated tags: VIP,Birthday,Anniversary

-- Staff Assignment
[HostessID] [bigint] NULL,                      -- FK to StaffMaster or hardcoded
[HostessName] [varchar](100) NULL,              -- Hostess name (if no StaffMaster)

-- Confirmation & Communication
[ConfirmationCode] [varchar](50) NULL,          -- Unique confirmation code
[ConfirmationSent] [bit] NOT NULL DEFAULT 0,   -- Whether confirmation was sent
[ReminderSent] [bit] NOT NULL DEFAULT 0,        -- Whether reminder was sent
[LastNotificationDate] [datetime] NULL,         -- Last notification sent date

-- Additional Metadata
[CreatedBy] [varchar](50) NULL,                -- User who created reservation
[ModifiedBy] [varchar](50) NULL,               -- User who last modified
[ModifiedOn] [datetime] NULL,                  -- Last modification date
[IsWalkIn] [bit] NOT NULL DEFAULT 0,            -- Whether this is a walk-in (not pre-booked)
[WalkInArrivalTime] [datetime] NULL,           -- When walk-in guest arrived
```

### 2. BookingMaster - FIX Typo
```sql
-- Rename column
EXEC sp_rename 'BookingMaster.AdavncePayment', 'AdvancePayment', 'COLUMN';
```

### 3. BookingChild - ADD Fields
```sql
-- Additional Details
[Notes] [nvarchar](500) NULL,                   -- Table-specific notes
[SeatedTime] [datetime] NULL,                  -- When guest was seated at this table
[VacatedTime] [datetime] NULL,                 -- When guest left this table
[CreatedOn] [datetime] NOT NULL DEFAULT GETDATE(),
[ModifiedOn] [datetime] NULL
```

---

## New Tables Required

### 1. WaitlistMaster
```sql
CREATE TABLE [dbo].[WaitlistMaster](
    [ID] [bigint] IDENTITY(1,1) NOT NULL,
    [WaitlistID] [bigint] NOT NULL,
    [GuestName] [varchar](150) NOT NULL,
    [GuestPhone] [varchar](20) NULL,
    [GuestEmail] [varchar](150) NULL,
    [PartySize] [bigint] NOT NULL,
    [WaitTimeMinutes] [bigint] NOT NULL,       -- Estimated wait time
    [AddedDate] [datetime] NOT NULL DEFAULT GETDATE(),
    [EstimatedReadyTime] [datetime] NULL,       -- Calculated: AddedDate + WaitTimeMinutes
    [Status] [varchar](50) NOT NULL DEFAULT 'WAITING', -- WAITING, NOTIFIED, SEATED, CANCELLED, NO-SHOW
    [HostessID] [bigint] NULL,
    [HostessName] [varchar](100) NULL,
    [SpecialRequests] [nvarchar](500) NULL,
    [Notes] [nvarchar](500) NULL,
    [NotifiedCount] [int] NOT NULL DEFAULT 0,   -- How many times notified
    [LastNotifiedDate] [datetime] NULL,
    [SeatedDate] [datetime] NULL,               -- When guest was seated
    [SeatedBookingID] [bigint] NULL,             -- FK to BookingMaster (if converted to reservation)
    [StationID] [bigint] NOT NULL,
    [CreatedBy] [varchar](50) NULL,
    [CreatedOn] [datetime] NOT NULL DEFAULT GETDATE(),
    [ModifiedBy] [varchar](50) NULL,
    [ModifiedOn] [datetime] NULL,
    CONSTRAINT [PK_WaitlistMaster] PRIMARY KEY CLUSTERED ([WaitlistID] ASC)
) ON [PRIMARY];
GO
```

### 2. WaitlistChild
```sql
CREATE TABLE [dbo].[WaitlistChild](
    [ID] [bigint] IDENTITY(1,1) NOT NULL,
    [WaitlistChildID] [bigint] NOT NULL,
    [WaitlistID] [bigint] NOT NULL,             -- FK to WaitlistMaster
    [TableID] [bigint] NOT NULL,                -- Preferred table
    [AreaID] [bigint] NOT NULL,                 -- Preferred area
    [Priority] [int] NOT NULL DEFAULT 0,         -- Priority order (0 = highest)
    [Status] [varchar](50) NOT NULL DEFAULT 'PENDING', -- PENDING, ASSIGNED, CANCELLED
    [CreatedOn] [datetime] NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_WaitlistChild] PRIMARY KEY CLUSTERED ([WaitlistChildID] ASC),
    CONSTRAINT [FK_WaitlistChild_WaitlistMaster] FOREIGN KEY ([WaitlistID]) 
        REFERENCES [dbo].[WaitlistMaster] ([WaitlistID])
) ON [PRIMARY];
GO
```

### 3. ReservationStatusHistory (Audit Trail)
```sql
CREATE TABLE [dbo].[ReservationStatusHistory](
    [ID] [bigint] IDENTITY(1,1) NOT NULL,
    [HistoryID] [bigint] NOT NULL,
    [BookingID] [bigint] NOT NULL,              -- FK to BookingMaster
    [OldStatus] [varchar](50) NULL,              -- Previous status
    [NewStatus] [varchar](50) NOT NULL,         -- New status
    [ChangedBy] [varchar](50) NULL,             -- User who made change
    [ChangedOn] [datetime] NOT NULL DEFAULT GETDATE(),
    [Notes] [nvarchar](500) NULL,               -- Reason for change
    [StationID] [bigint] NOT NULL,
    CONSTRAINT [PK_ReservationStatusHistory] PRIMARY KEY CLUSTERED ([HistoryID] ASC),
    CONSTRAINT [FK_ReservationStatusHistory_BookingMaster] FOREIGN KEY ([BookingID]) 
        REFERENCES [dbo].[BookingMaster] ([BookingID])
) ON [PRIMARY];
GO
```

### 4. CustomerMaster (Already Exists - No Need to Create)
```sql
CREATE TABLE [dbo].[CustomerMaster](
    [ID] [bigint] IDENTITY(1,1) NOT NULL,
    [CustomerID] [bigint] NOT NULL,
    [CustomerName] [varchar](150) NOT NULL,
    [Phone] [varchar](20) NULL,
    [Email] [varchar](150) NULL,
    [DateOfBirth] [date] NULL,
    [AnniversaryDate] [date] NULL,
    [PreferredArea] [bigint] NULL,              -- FK to AreaMaster
    [PreferredTable] [bigint] NULL,               -- FK to TableMaster
    [DietaryRestrictions] [nvarchar](500) NULL,
    [Allergies] [nvarchar](500) NULL,
    [VIPStatus] [bit] NOT NULL DEFAULT 0,
    [TotalVisits] [int] NOT NULL DEFAULT 0,
    [LastVisitDate] [datetime] NULL,
    [LoyaltyPoints] [bigint] NOT NULL DEFAULT 0,
    [Notes] [nvarchar](1000) NULL,
    [IsActive] [bit] NOT NULL DEFAULT 1,
    [CreatedBy] [varchar](50) NULL,
    [CreatedOn] [datetime] NOT NULL DEFAULT GETDATE(),
    [ModifiedBy] [varchar](50) NULL,
    [ModifiedOn] [datetime] NULL,
    [StationID] [bigint] NOT NULL,
    CONSTRAINT [PK_CustomerMaster] PRIMARY KEY CLUSTERED ([CustomerID] ASC)
) ON [PRIMARY];
GO
```

---

## Summary of Changes

### Immediate Actions Required:

1. **Fix Typo in BookingMaster**
   - Rename `AdavncePayment` → `AdvancePayment`

2. **Add Missing Fields to BookingMaster**
   - GuestName, GuestPhone, GuestEmail (if no CustomerMaster)
   - ReservationTime (CRITICAL - currently missing)
   - SpecialRequests, Tags
   - HostessID, HostessName
   - ConfirmationCode, ConfirmationSent, ReminderSent
   - IsWalkIn, WalkInArrivalTime
   - CreatedBy, ModifiedBy, ModifiedOn

3. **Add Fields to BookingChild**
   - Notes, SeatedTime, VacatedTime
   - CreatedOn, ModifiedOn

4. **Create New Tables**
   - WaitlistMaster (for waitlist functionality)
   - WaitlistChild (for preferred tables in waitlist)
   - ReservationStatusHistory (audit trail)
   - ~~NotificationLog~~ (NOT NEEDED - removed)
   - ~~CustomerMaster~~ (ALREADY EXISTS - no need to create)

---

## Recommended Indexes

```sql
-- BookingMaster
CREATE NONCLUSTERED INDEX [IX_BookingMaster_BookingDate] ON [dbo].[BookingMaster] ([BookingDate] ASC);
CREATE NONCLUSTERED INDEX [IX_BookingMaster_BookingStatus] ON [dbo].[BookingMaster] ([BookingStatus] ASC);
CREATE NONCLUSTERED INDEX [IX_BookingMaster_CustomerID] ON [dbo].[BookingMaster] ([CustomerID] ASC);
CREATE NONCLUSTERED INDEX [IX_BookingMaster_StationID] ON [dbo].[BookingMaster] ([StationID] ASC);

-- BookingChild
CREATE NONCLUSTERED INDEX [IX_BookingChild_BookingID] ON [dbo].[BookingChild] ([BookingID] ASC);
CREATE NONCLUSTERED INDEX [IX_BookingChild_TableID] ON [dbo].[BookingChild] ([TableID] ASC);
CREATE NONCLUSTERED INDEX [IX_BookingChild_AreaID] ON [dbo].[BookingChild] ([AreaID] ASC);
CREATE NONCLUSTERED INDEX [IX_BookingChild_Status] ON [dbo].[BookingChild] ([Status] ASC);

-- WaitlistMaster
CREATE NONCLUSTERED INDEX [IX_WaitlistMaster_Status] ON [dbo].[WaitlistMaster] ([Status] ASC);
CREATE NONCLUSTERED INDEX [IX_WaitlistMaster_AddedDate] ON [dbo].[WaitlistMaster] ([AddedDate] ASC);
CREATE NONCLUSTERED INDEX [IX_WaitlistMaster_StationID] ON [dbo].[WaitlistMaster] ([StationID] ASC);
```

---

## Notes

1. **Hostess Management**: Currently hardcoded in frontend. Consider creating a `StaffMaster` table if you need proper staff management.

2. **CustomerMaster**: Already exists. Use `CustomerID` in BookingMaster to link to existing customers. The GuestName/Phone/Email fields in BookingMaster serve as a fallback for walk-ins or when customer doesn't exist.

3. **Confirmation Codes**: Generate unique codes (e.g., "RES-2025-001234") for easy reference.

4. **Status Values**:
   - BookingMaster.BookingStatus: `BOOKED`, `CONFIRMED`, `SEATED`, `COMPLETED`, `CANCELLED`, `NO-SHOW`
   - BookingChild.Status: `BOOKED`, `SEATED`, `VACATED`, `CANCELLED`
   - WaitlistMaster.Status: `WAITING`, `NOTIFIED`, `SEATED`, `CANCELLED`, `NO-SHOW`

5. **Time Handling**: Use `time` data type for ReservationTime, and `datetime` for full timestamps.

