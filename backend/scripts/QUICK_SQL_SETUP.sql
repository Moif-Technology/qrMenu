-- ============================================================
-- QUICK SQL SETUP FOR CLOUDINARY MIGRATION
-- ============================================================
-- Run this in SQL Server Management Studio
-- Database: Moifcore (as per dbConfig.js)
-- ============================================================

USE Moifcore;
GO

-- ============================================================
-- STEP 1: Add CloudinaryUrl Column
-- ============================================================
IF NOT EXISTS (
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'dbo' 
      AND TABLE_NAME = 'ImageMaster' 
      AND COLUMN_NAME = 'CloudinaryUrl'
)
BEGIN
    ALTER TABLE dbo.ImageMaster
    ADD [CloudinaryUrl] NVARCHAR(500) NULL;
    
    PRINT '✅ CloudinaryUrl column added!';
END
ELSE
BEGIN
    PRINT 'ℹ️  CloudinaryUrl column already exists.';
END
GO

-- ============================================================
-- STEP 2: Check What Images Exist
-- ============================================================
-- See all DocType values and counts
SELECT 
    [DocType],
    COUNT(*) AS TotalCount,
    COUNT(CASE WHEN [DocImage] IS NOT NULL THEN 1 END) AS WithImageData,
    COUNT(CASE WHEN [CloudinaryUrl] IS NOT NULL AND [CloudinaryUrl] <> '' THEN 1 END) AS WithCloudinaryUrl
FROM dbo.ImageMaster
GROUP BY [DocType]
ORDER BY TotalCount DESC;
GO

-- ============================================================
-- STEP 3: See Images That Need Migration
-- ============================================================
-- This shows images that have data but no Cloudinary URL
SELECT TOP 20
    [ID],
    [DocID] AS ProductID,
    [DocType],
    CASE WHEN [DocImage] IS NOT NULL THEN 'Yes' ELSE 'No' END AS HasImage,
    CASE WHEN [CloudinaryUrl] IS NOT NULL AND [CloudinaryUrl] <> '' THEN 'Yes' ELSE 'No' END AS HasCloudinaryUrl,
    LEN(CAST([DocImage] AS VARBINARY(MAX))) AS ImageSizeBytes
FROM dbo.ImageMaster
WHERE [DocImage] IS NOT NULL
  AND ([CloudinaryUrl] IS NULL OR [CloudinaryUrl] = '')
ORDER BY [ID];
GO

-- ============================================================
-- STEP 4: Manual Update Template
-- ============================================================
-- After uploading to Cloudinary, update URLs like this:
-- Replace YOUR_PRODUCT_ID and YOUR_CLOUDINARY_URL

/*
UPDATE dbo.ImageMaster
SET [CloudinaryUrl] = 'https://res.cloudinary.com/YOUR_CLOUD_NAME/image/upload/v1234567890/qr-menu/products/YOUR_PRODUCT_ID.jpg'
WHERE [DocID] = 'YOUR_PRODUCT_ID';
GO
*/

-- ============================================================
-- STEP 5: Verify Column Exists
-- ============================================================
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'ImageMaster'
  AND COLUMN_NAME = 'CloudinaryUrl';
GO

-- ============================================================
-- STEP 6: Count Images Ready for Migration
-- ============================================================
SELECT 
    COUNT(*) AS ImagesNeedingMigration
FROM dbo.ImageMaster
WHERE [DocImage] IS NOT NULL
  AND ([CloudinaryUrl] IS NULL OR [CloudinaryUrl] = '');
GO

