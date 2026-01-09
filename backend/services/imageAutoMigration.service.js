// backend/services/imageAutoMigration.service.js
/**
 * Auto-Migration Service: Automatically migrate new ImageMaster entries to Cloudinary
 * 
 * This service runs in the background and periodically checks for new ImageMaster entries
 * that have DocImage but no CloudinaryUrl, then automatically uploads them to Cloudinary.
 */

import { uploadImageToCloudinary, isCloudinaryConfigured } from './cloudinary.service.js';
import { connectToDb } from '../config/dbConfig.js';
import mssql from 'mssql';

const T_IMAGES = "dbo.ImageMaster";
const q = (n) => `[${n}]`;

// Configuration
const POLL_INTERVAL = process.env.IMAGE_AUTO_MIGRATION_INTERVAL 
  ? Number(process.env.IMAGE_AUTO_MIGRATION_INTERVAL) 
  : 30000; // Default: 30 seconds

const BATCH_SIZE = process.env.IMAGE_AUTO_MIGRATION_BATCH_SIZE
  ? Number(process.env.IMAGE_AUTO_MIGRATION_BATCH_SIZE)
  : 5; // Process 5 images at a time to avoid overwhelming the system

let isRunning = false;
let intervalId = null;
let lastCheckTime = null;

/**
 * Ensure CloudinaryUrl column exists
 */
async function ensureCloudinaryUrlColumn(pool) {
  try {
    const checkColumn = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'dbo' 
        AND TABLE_NAME = 'ImageMaster' 
        AND COLUMN_NAME = 'CloudinaryUrl'
    `);

    if (checkColumn.recordset.length === 0) {
      console.log('[AUTO-MIGRATION] Adding CloudinaryUrl column to ImageMaster...');
      await pool.request().query(`
        ALTER TABLE ${T_IMAGES}
        ADD ${q("CloudinaryUrl")} NVARCHAR(500) NULL
      `);
      console.log('[AUTO-MIGRATION] ✅ CloudinaryUrl column added');
    }
  } catch (error) {
    console.error('[AUTO-MIGRATION] ❌ Failed to ensure CloudinaryUrl column:', error.message);
    // Don't throw - column might already exist or table might not be accessible
  }
}

/**
 * Get images that need migration (new entries without CloudinaryUrl)
 */
async function getImagesToMigrate(pool) {
  try {
    const sql = `
      SELECT TOP (${BATCH_SIZE})
        ${q("ID")},
        ${q("DocID")} AS ProductID,
        ${q("DocType")},
        CAST(${q("DocImage")} AS VARBINARY(MAX)) AS imgBinary,
        ${q("CloudinaryUrl")}
      FROM ${T_IMAGES}
      WHERE ${q("DocType")} = 'PRODUCT'
        AND ${q("DocImage")} IS NOT NULL
        AND (${q("CloudinaryUrl")} IS NULL OR ${q("CloudinaryUrl")} = '')
      ORDER BY ${q("ID")} DESC
    `;

    const request = pool.request();
    request.timeout = 30000; // 30 seconds timeout
    const result = await request.query(sql);
    
    return result.recordset;
  } catch (error) {
    console.error('[AUTO-MIGRATION] ❌ Failed to get images to migrate:', error.message);
    return [];
  }
}

/**
 * Migrate a single image to Cloudinary
 */
async function migrateSingleImage(pool, imageRecord) {
  const { ID, ProductID, DocType, imgBinary, CloudinaryUrl } = imageRecord;
  
  // Skip if already has Cloudinary URL
  if (CloudinaryUrl && CloudinaryUrl.trim()) {
    return { success: true, skipped: true, productId: ProductID };
  }

  // Handle different binary formats
  let imageBuffer = imgBinary;
  if (!imageBuffer) {
    return { success: false, error: 'No image data', productId: ProductID };
  }

  // Convert to Buffer if needed
  if (!Buffer.isBuffer(imageBuffer)) {
    if (imageBuffer instanceof Uint8Array) {
      imageBuffer = Buffer.from(imageBuffer);
    } else if (typeof imageBuffer === 'object' && imageBuffer !== null) {
      try {
        imageBuffer = Buffer.from(imageBuffer);
      } catch (err) {
        console.warn(`[AUTO-MIGRATION] ⚠️  Product ${ProductID} has invalid image data format`);
        return { success: false, error: 'Invalid image data format', productId: ProductID };
      }
    } else {
      console.warn(`[AUTO-MIGRATION] ⚠️  Product ${ProductID} has invalid image data`);
      return { success: false, error: 'Invalid image data', productId: ProductID };
    }
  }

  try {
    // Upload to Cloudinary
    const uploadResult = await uploadImageToCloudinary(
      imageBuffer,
      String(ProductID),
      {
        // Additional options if needed
      }
    );

    // Update database with Cloudinary URL
    const updateRequest = pool.request();
    updateRequest.input("ID", mssql.BigInt, ID);
    updateRequest.input("CloudinaryUrl", mssql.NVarChar(500), uploadResult.secure_url);

    await updateRequest.query(`
      UPDATE ${T_IMAGES}
      SET ${q("CloudinaryUrl")} = @CloudinaryUrl
      WHERE ${q("ID")} = @ID
    `);

    console.log(`[AUTO-MIGRATION] ✅ Migrated Product ${ProductID} -> ${uploadResult.secure_url.substring(0, 60)}...`);
    
    return {
      success: true,
      productId: ProductID,
      cloudinaryUrl: uploadResult.secure_url,
      bytes: uploadResult.bytes
    };
  } catch (error) {
    console.error(`[AUTO-MIGRATION] ❌ Failed to migrate Product ${ProductID}:`, error.message);
    return {
      success: false,
      error: error.message,
      productId: ProductID
    };
  }
}

/**
 * Process a batch of images
 */
async function processBatch() {
  if (isRunning) {
    // Skip if already processing
    return;
  }

  // Check if Cloudinary is configured
  if (!isCloudinaryConfigured()) {
    console.warn('[AUTO-MIGRATION] ⚠️  Cloudinary is not configured. Skipping auto-migration.');
    return;
  }

  isRunning = true;
  lastCheckTime = new Date();

  try {
    const pool = await connectToDb();
    
    // Ensure CloudinaryUrl column exists
    await ensureCloudinaryUrlColumn(pool);

    // Get images to migrate
    const imagesToMigrate = await getImagesToMigrate(pool);

    if (imagesToMigrate.length === 0) {
      // No images to migrate
      isRunning = false;
      return;
    }

    console.log(`[AUTO-MIGRATION] 📦 Found ${imagesToMigrate.length} new image(s) to migrate`);

    // Process images in parallel (but limit concurrency)
    const results = await Promise.allSettled(
      imagesToMigrate.map(img => migrateSingleImage(pool, img))
    );

    // Count results
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const r = result.value;
        if (r.skipped) {
          skippedCount++;
        } else if (r.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } else {
        errorCount++;
        console.error(`[AUTO-MIGRATION] ❌ Failed to process image ${index}:`, result.reason);
      }
    });

    if (successCount > 0 || errorCount > 0) {
      console.log(`[AUTO-MIGRATION] ✅ Batch completed: ${successCount} migrated, ${skippedCount} skipped, ${errorCount} errors`);
    }

  } catch (error) {
    console.error('[AUTO-MIGRATION] ❌ Error during batch processing:', error.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the auto-migration service
 */
export function startAutoMigration() {
  if (intervalId !== null) {
    console.log('[AUTO-MIGRATION] ⚠️  Service is already running');
    return;
  }

  if (!isCloudinaryConfigured()) {
    console.warn('[AUTO-MIGRATION] ⚠️  Cloudinary is not configured. Auto-migration will not start.');
    console.warn('[AUTO-MIGRATION] Please set the following environment variables:');
    console.warn('[AUTO-MIGRATION]   - CLOUDINARY_CLOUD_NAME');
    console.warn('[AUTO-MIGRATION]   - CLOUDINARY_API_KEY');
    console.warn('[AUTO-MIGRATION]   - CLOUDINARY_API_SECRET');
    return;
  }

  console.log(`[AUTO-MIGRATION] 🚀 Starting auto-migration service (interval: ${POLL_INTERVAL}ms, batch size: ${BATCH_SIZE})`);
  
  // Run immediately on startup
  processBatch();

  // Then run periodically
  intervalId = setInterval(() => {
    processBatch();
  }, POLL_INTERVAL);
}

/**
 * Stop the auto-migration service
 */
export function stopAutoMigration() {
  if (intervalId === null) {
    console.log('[AUTO-MIGRATION] ⚠️  Service is not running');
    return;
  }

  console.log('[AUTO-MIGRATION] 🛑 Stopping auto-migration service');
  clearInterval(intervalId);
  intervalId = null;
  isRunning = false;
}

/**
 * Get service status
 */
export function getAutoMigrationStatus() {
  return {
    isRunning: intervalId !== null,
    isProcessing: isRunning,
    lastCheckTime: lastCheckTime,
    pollInterval: POLL_INTERVAL,
    batchSize: BATCH_SIZE,
    cloudinaryConfigured: isCloudinaryConfigured()
  };
}

