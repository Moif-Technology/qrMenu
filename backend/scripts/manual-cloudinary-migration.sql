-- ============================================================
-- MANUAL CLOUDINARY MIGRATION SQL SCRIPT
-- ============================================================
-- This script helps you manually migrate images to Cloudinary
-- Run each section step by step
-- ============================================================

-- ============================================================
-- STEP 1: Add CloudinaryUrl column to ImageMaster table
-- ============================================================
-- Check if column exists first
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
    
    PRINT '✅ CloudinaryUrl column added successfully!';
END
ELSE
BEGIN
    PRINT 'ℹ️  CloudinaryUrl column already exists.';
END
GO

-- ============================================================
-- STEP 2: Check how many product images exist
-- ============================================================
-- Check total product images
SELECT 
    COUNT(*) AS TotalProductImages,
    COUNT(CASE WHEN [DocImage] IS NOT NULL THEN 1 END) AS ImagesWithData,
    COUNT(CASE WHEN [CloudinaryUrl] IS NOT NULL AND [CloudinaryUrl] <> '' THEN 1 END) AS ImagesWithCloudinaryUrl,
    COUNT(CASE WHEN [DocImage] IS NOT NULL AND ([CloudinaryUrl] IS NULL OR [CloudinaryUrl] = '') THEN 1 END) AS ImagesNeedingMigration
FROM dbo.ImageMaster
WHERE [DocType] = 'PRODUCT';
GO

-- ============================================================
-- STEP 3: View sample images that need migration
-- ============================================================
-- See first 10 images that need to be migrated
SELECT TOP 10
    [ID],
    [DocID] AS ProductID,
    [DocType],
    CASE 
        WHEN [DocImage] IS NOT NULL THEN 'Has Image Data'
        ELSE 'No Image Data'
    END AS ImageStatus,
    CASE 
        WHEN [CloudinaryUrl] IS NOT NULL AND [CloudinaryUrl] <> '' THEN 'Has Cloudinary URL'
        ELSE 'No Cloudinary URL'
    END AS CloudinaryStatus,
    LEN(CAST([DocImage] AS VARBINARY(MAX))) AS ImageSizeBytes
FROM dbo.ImageMaster
WHERE [DocType] = 'PRODUCT'
  AND [DocImage] IS NOT NULL
  AND ([CloudinaryUrl] IS NULL OR [CloudinaryUrl] = '')
ORDER BY [ID];
GO

-- ============================================================
-- STEP 4: Check different DocType values (if PRODUCT doesn't work)
-- ============================================================
-- See what DocType values exist in your database
SELECT 
    [DocType],
    COUNT(*) AS Count,
    COUNT(CASE WHEN [DocImage] IS NOT NULL THEN 1 END) AS WithImages
FROM dbo.ImageMaster
GROUP BY [DocType]
ORDER BY Count DESC;
GO

-- ============================================================
-- STEP 5: Manual update example (for testing)
-- ============================================================
-- After uploading an image to Cloudinary, update the URL manually
-- Replace 'YOUR_PRODUCT_ID' and 'YOUR_CLOUDINARY_URL' with actual values

/*
UPDATE dbo.ImageMaster
SET [CloudinaryUrl] = 'https://res.cloudinary.com/YOUR_CLOUD_NAME/image/upload/v1234567890/qr-menu/products/YOUR_PRODUCT_ID.jpg'
WHERE [DocID] = 'YOUR_PRODUCT_ID'
  AND [DocType] = 'PRODUCT';
GO
*/

-- ============================================================
-- STEP 6: Verify column was added
-- ============================================================
-- Check all columns in ImageMaster table
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = 'ImageMaster'
ORDER BY ORDINAL_POSITION;
GO

-- ============================================================
-- STEP 7: Find images by different criteria (if needed)
-- ============================================================
-- If DocType = 'PRODUCT' doesn't work, try these:

-- Option A: All images regardless of DocType
/*
SELECT COUNT(*) AS TotalImages
FROM dbo.ImageMaster
WHERE [DocImage] IS NOT NULL;
*/

-- Option B: Images with specific DocID pattern
/*
SELECT COUNT(*) AS TotalImages
FROM dbo.ImageMaster
WHERE [DocImage] IS NOT NULL
  AND ISNUMERIC([DocID]) = 1;  -- Only numeric DocIDs (product IDs)
*/

-- ============================================================
-- NOTES:
-- ============================================================
-- 1. Run Step 1 first to add the column
-- 2. Run Step 2 to see how many images need migration
-- 3. Run Step 3 to see sample images
-- 4. Run Step 4 if Step 2 shows 0 images (check DocType values)
-- 5. After uploading to Cloudinary via Node.js script, URLs will be auto-updated
-- 6. Or manually update URLs using Step 5 template
-- ============================================================

