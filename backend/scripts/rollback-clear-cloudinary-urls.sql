-- ROLLBACK Script for clear-cloudinary-urls.sql
-- WARNING: This script cannot restore the original Cloudinary URLs
-- because they were cleared from the database.
-- 
-- This script is provided for reference only.
-- If you need to restore URLs, you must:
-- 1. Have a backup of the ImageMaster table with CloudinaryUrl values
-- 2. Restore from that backup
-- 
-- OR manually update URLs after migrating to new Cloudinary account

USE [Moifcore]
GO

PRINT '⚠️  WARNING: This rollback script cannot restore cleared CloudinaryUrl values.';
PRINT '⚠️  The URLs were cleared and cannot be recovered without a database backup.';
PRINT '';
PRINT 'If you have a backup, restore it using:';
PRINT '  RESTORE DATABASE [Moifcore] FROM DISK = ''path_to_backup.bak'' WITH REPLACE;';
PRINT '';
PRINT 'Otherwise, you will need to:';
PRINT '  1. Upload images to your new Cloudinary account';
PRINT '  2. Update ImageMaster.CloudinaryUrl with the new URLs';
GO

-- Check current status
SELECT 
    COUNT(*) AS TotalRecords,
    COUNT(CASE WHEN [CloudinaryUrl] IS NOT NULL AND [CloudinaryUrl] <> '' THEN 1 END) AS RecordsWithCloudinaryUrl,
    COUNT(CASE WHEN [CloudinaryUrl] IS NULL OR [CloudinaryUrl] = '' THEN 1 END) AS RecordsWithoutCloudinaryUrl
FROM [dbo].[ImageMaster];
GO

PRINT 'ℹ️  Rollback check completed.';
PRINT 'ℹ️  To restore URLs, use a database backup or manually update after migration.';
GO
