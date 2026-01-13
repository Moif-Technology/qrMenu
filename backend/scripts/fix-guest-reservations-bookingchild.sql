-- Fix existing GUEST_ONLINE reservations by adding BookingChild records
-- This script creates BookingChild records with TableID = 0 for guest reservations that don't have them

-- First, let's see which GUEST_ONLINE reservations are missing BookingChild records
SELECT 
    bm.BookingID,
    bm.GuestName,
    bm.PartySize,
    bm.BookingDate,
    bm.BookingStatus,
    bm.BookingSource
FROM dbo.BookingMaster bm
LEFT JOIN dbo.BookingChild bc ON bc.BookingID = bm.BookingID
WHERE bm.BookingSource = 'GUEST_ONLINE'
    AND bc.BookingChildID IS NULL
ORDER BY bm.BookingID;

-- Now insert BookingChild records for these reservations
-- Note: You may need to adjust the BookingChildID values based on your IDControlManager

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
SELECT 
    -- Generate sequential BookingChildIDs (adjust starting number as needed)
    ROW_NUMBER() OVER (ORDER BY bm.BookingID) + 
        (SELECT ISNULL(MAX(BookingChildID), 0) FROM dbo.BookingChild) AS BookingChildID,
    bm.BookingID,
    0 AS TableID,  -- Unassigned table
    0 AS AreaID,   -- No area assigned yet
    bm.BookingStatus AS Status,  -- Match the booking status
    bm.SpecialRequests AS Notes,
    NULL AS SeatedTime,
    NULL AS VacatedTime,
    GETDATE() AS CreatedOn,
    NULL AS ModifiedOn
FROM dbo.BookingMaster bm
LEFT JOIN dbo.BookingChild bc ON bc.BookingID = bm.BookingID
WHERE bm.BookingSource = 'GUEST_ONLINE'
    AND bc.BookingChildID IS NULL;

-- Update IDControlManager to reflect the new BookingChildIDs
UPDATE dbo.IDControlManager
SET ControlValue = (SELECT MAX(BookingChildID) FROM dbo.BookingChild)
WHERE ControlName = 'BookingChild';

-- Verify the fix
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
ORDER BY bm.BookingID;

