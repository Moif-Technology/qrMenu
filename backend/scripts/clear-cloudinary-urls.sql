-- SQL Script to clear all CloudinaryUrl values from ImageMaster table
-- This script sets all CloudinaryUrl values to NULL
-- Use this when migrating to a new Cloudinary account

USE [Moifcore]
GO

-- Check current status before clearing
PRINT '=== BEFORE CLEARING ===';
GO

SELECT 
    COUNT(*) AS TotalRecords,
    COUNT(CASE WHEN [CloudinaryUrl] IS NOT NULL AND [CloudinaryUrl] <> '' THEN 1 END) AS RecordsWithCloudinaryUrl,
    COUNT(CASE WHEN [CloudinaryUrl] IS NULL OR [CloudinaryUrl] = '' THEN 1 END) AS RecordsWithoutCloudinaryUrl
FROM [dbo].[ImageMaster];
GO

-- Clear all CloudinaryUrl values (set to NULL)
PRINT '=== CLEARING ALL CLOUDINARY URLS ===';
GO

UPDATE [dbo].[ImageMaster]
SET [CloudinaryUrl] = NULL
WHERE [CloudinaryUrl] IS NOT NULL AND [CloudinaryUrl] <> '';
GO

-- Verify the clearing operation
PRINT '=== AFTER CLEARING ===';
GO

SELECT 
    COUNT(*) AS TotalRecords,
    COUNT(CASE WHEN [CloudinaryUrl] IS NOT NULL AND [CloudinaryUrl] <> '' THEN 1 END) AS RecordsWithCloudinaryUrl,
    COUNT(CASE WHEN [CloudinaryUrl] IS NULL OR [CloudinaryUrl] = '' THEN 1 END) AS RecordsWithoutCloudinaryUrl
FROM [dbo].[ImageMaster];
GO

PRINT '✅ All CloudinaryUrl values have been cleared successfully!';
PRINT 'ℹ️  You can now migrate images to your new Cloudinary account.';
GO
