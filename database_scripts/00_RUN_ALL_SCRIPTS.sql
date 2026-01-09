-- Master script to run all database changes
-- Run this script to apply all changes to the reservation system
USE [Moifcore]
GO

PRINT '========================================';
PRINT 'Reservation System Database Setup';
PRINT '========================================';
PRINT '';

-- 1. Add fields to BookingMaster
PRINT 'Step 1: Adding fields to BookingMaster...';
:r 02_ADD_Fields_BookingMaster.sql
GO

-- 2. Add fields to BookingChild
PRINT '';
PRINT 'Step 2: Adding fields to BookingChild...';
:r 03_ADD_Fields_BookingChild.sql
GO

-- 3. Create WaitlistMaster
PRINT '';
PRINT 'Step 3: Creating WaitlistMaster table...';
:r 04_CREATE_WaitlistMaster.sql
GO

-- 4. Create WaitlistChild
PRINT '';
PRINT 'Step 4: Creating WaitlistChild table...';
:r 05_CREATE_WaitlistChild.sql
GO

-- 5. Create ReservationStatusHistory
PRINT '';
PRINT 'Step 5: Creating ReservationStatusHistory table...';
:r 06_CREATE_ReservationStatusHistory.sql
GO

-- 6. Create indexes
PRINT '';
PRINT 'Step 6: Creating indexes...';
:r 08_CREATE_Indexes.sql
GO

PRINT '';
PRINT '========================================';
PRINT 'Database setup completed successfully!';
PRINT '========================================';
GO

