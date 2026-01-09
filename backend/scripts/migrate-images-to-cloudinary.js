// backend/scripts/migrate-images-to-cloudinary.js
/**
 * Migration Script: Upload all images from ImageMaster to Cloudinary
 * 
 * This script:
 * 1. Fetches all product images from ImageMaster
 * 2. Uploads each image to Cloudinary
 * 3. Updates ImageMaster with Cloudinary URL
 * 
 * Usage: node scripts/migrate-images-to-cloudinary.js
 */

import { uploadImageToCloudinary, isCloudinaryConfigured } from '../services/cloudinary.service.js';
import mssql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create direct database connection for migration (bypasses cached pool)
 * This ensures we connect to the correct server from .env
 */
async function createDirectConnection() {
  const config = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'motech',
    server: process.env.DB_SERVER || 'MOIF\\SQLEXPRESS',
    database: 'Moifcore',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      enableArithAbort: true,
      trustServerCertificate: process.env.DB_TRUST_CERT === undefined ? true : process.env.DB_TRUST_CERT === 'true'
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };

  // Handle server with instance name (MOIF\SQLEXPRESS) or IP/domain (moifopaia.selfip.com)
  if (config.server && config.server.includes('\\')) {
    const [host, instanceName] = config.server.split('\\');
    config.server = host;
    config.options.instanceName = instanceName;
    delete config.port;
  }

  console.log(`[MIGRATION] Connecting directly to: ${config.server}${config.options.instanceName ? '\\' + config.options.instanceName : ''}${config.port ? ':' + config.port : ''} -> ${config.database}`);

  const pool = new mssql.ConnectionPool(config);
  await pool.connect();
  return pool;
}

const T_IMAGES = "dbo.ImageMaster";
const q = (n) => `[${n}]`;

// Configuration
const BATCH_SIZE = 10; // Process 10 images at a time
const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay between batches

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if CloudinaryUrl column exists, create if not
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
      console.log('[MIGRATION] Adding CloudinaryUrl column to ImageMaster...');
      await pool.request().query(`
        ALTER TABLE ${T_IMAGES}
        ADD ${q("CloudinaryUrl")} NVARCHAR(500) NULL
      `);
      console.log('[MIGRATION] ✅ CloudinaryUrl column added');
    } else {
      console.log('[MIGRATION] ✅ CloudinaryUrl column already exists');
    }
  } catch (error) {
    console.error('[MIGRATION] ❌ Failed to ensure CloudinaryUrl column:', error.message);
    throw error;
  }
}

/**
 * Get all images that need migration
 */
async function getImagesToMigrate(pool) {
  // First, verify table exists and check schema
  console.log('[MIGRATION] Verifying ImageMaster table exists...');
  const tableCheck = await pool.request().query(`
    SELECT 
      TABLE_SCHEMA,
      TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'ImageMaster'
  `);
  
  if (tableCheck.recordset.length === 0) {
    console.error('[MIGRATION] ❌ ImageMaster table not found!');
    console.error('[MIGRATION] Checking for similar table names...');
    const similarTables = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME LIKE '%Image%' OR TABLE_NAME LIKE '%image%'
    `);
    if (similarTables.recordset.length > 0) {
      console.log('[MIGRATION] Found similar tables:');
      similarTables.recordset.forEach(t => {
        console.log(`  - ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);
      });
    }
    return [];
  } else {
    console.log('[MIGRATION] ✅ Table found:');
    tableCheck.recordset.forEach(t => {
      console.log(`  - Schema: ${t.TABLE_SCHEMA}, Table: ${t.TABLE_NAME}`);
    });
  }

  // Check what DocType values exist
  console.log('\n[MIGRATION] Checking DocType values in ImageMaster...');
  const docTypeCheck = await pool.request().query(`
    SELECT 
      [DocType],
      COUNT(*) AS Count,
      COUNT(CASE WHEN [DocImage] IS NOT NULL THEN 1 END) AS WithImages
    FROM ${T_IMAGES}
    GROUP BY [DocType]
    ORDER BY Count DESC
  `);
  
  console.log('[MIGRATION] DocType distribution:');
  if (docTypeCheck.recordset.length === 0) {
    console.log('  ⚠️  No records found in ImageMaster table!');
  } else {
    docTypeCheck.recordset.forEach(row => {
      console.log(`  - ${row.DocType || '(NULL)'}: ${row.Count} total, ${row.WithImages} with images`);
    });
  }
  
  // Check total records in table
  const totalRecordsCheck = await pool.request().query(`
    SELECT COUNT(*) AS TotalRecords
    FROM ${T_IMAGES}
  `);
  console.log(`[MIGRATION] Total records in table: ${totalRecordsCheck.recordset[0]?.TotalRecords || 0}`);

  // Check total images with data
  const totalImagesCheck = await pool.request().query(`
    SELECT 
      COUNT(*) AS TotalWithImageData
    FROM ${T_IMAGES}
    WHERE [DocImage] IS NOT NULL
  `);
  console.log(`[MIGRATION] Total images with data: ${totalImagesCheck.recordset[0]?.TotalWithImageData || 0}`);
  
  // Check if DocImage column exists
  const docImageColumnCheck = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'ImageMaster'
      AND COLUMN_NAME = 'DocImage'
  `);
  if (docImageColumnCheck.recordset.length === 0) {
    console.warn('[MIGRATION] ⚠️  DocImage column not found! Checking all columns...');
    const allColumns = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'ImageMaster'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('[MIGRATION] Available columns:');
    allColumns.recordset.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
    });
  }
  
  // Check how many already have Cloudinary URLs
  const cloudinaryCheck = await pool.request().query(`
    SELECT 
      COUNT(*) AS TotalWithCloudinary
    FROM ${T_IMAGES}
    WHERE [CloudinaryUrl] IS NOT NULL 
      AND [CloudinaryUrl] <> ''
  `);
  console.log(`[MIGRATION] Images already with Cloudinary URLs: ${cloudinaryCheck.recordset[0]?.TotalWithCloudinary || 0}\n`);

  // Get images to migrate - try different query formats
  console.log('\n[MIGRATION] Executing query to find images...');
  console.log(`[MIGRATION] Using table: ${T_IMAGES}`);
  
  const request = pool.request();
  
  // Try query without brackets first (in case that's the issue)
  let sql = `
    SELECT 
      ID,
      DocID AS ProductID,
      DocType,
      CAST(DocImage AS VARBINARY(MAX)) AS imgBinary,
      CloudinaryUrl
    FROM dbo.ImageMaster
    WHERE DocType = 'PRODUCT'
      AND DocImage IS NOT NULL
      AND (CloudinaryUrl IS NULL OR CloudinaryUrl = '')
    ORDER BY ID
  `;

  request.timeout = 120000; // 2 minutes for large binary data
  let result;
  try {
    console.log('[MIGRATION] Trying query without brackets...');
    result = await request.query(sql);
    console.log(`[MIGRATION] ✅ Query executed successfully`);
    console.log(`[MIGRATION] 📊 Rows returned: ${result.recordset.length}`);
  } catch (error) {
    console.error(`[MIGRATION] ❌ Query without brackets failed:`, error.message);
    
    // Try with brackets
    console.log('[MIGRATION] 🔄 Trying query with brackets...');
    sql = `
      SELECT 
        ${q("ID")},
        ${q("DocID")} AS ProductID,
        ${q("DocType")},
        CAST(${q("DocImage")} AS VARBINARY(MAX)) AS imgBinary,
        ${q("CloudinaryUrl")}
      FROM ${T_IMAGES}
      WHERE ${q("DocType")} = 'PRODUCT'
        AND ${q("DocImage")} IS NOT NULL
        AND (${q("CloudinaryUrl")} IS NULL OR ${q("CloudinaryUrl")} = '')
      ORDER BY ${q("ID")}
    `;
    try {
      result = await request.query(sql);
      console.log(`[MIGRATION] ✅ Query with brackets executed successfully`);
      console.log(`[MIGRATION] 📊 Rows returned: ${result.recordset.length}`);
    } catch (error2) {
      console.error(`[MIGRATION] ❌ Query with brackets also failed:`, error2.message);
      
      // Last resort: try without DocType filter
      console.log('[MIGRATION] 🔄 Trying query without DocType filter...');
      const altSql = `
        SELECT 
          ID,
          DocID AS ProductID,
          DocType,
          CAST(DocImage AS VARBINARY(MAX)) AS imgBinary,
          CloudinaryUrl
        FROM dbo.ImageMaster
        WHERE DocImage IS NOT NULL
          AND (CloudinaryUrl IS NULL OR CloudinaryUrl = '')
        ORDER BY ID
      `;
      const altRequest = pool.request();
      altRequest.timeout = 120000;
      result = await altRequest.query(altSql);
      console.log(`[MIGRATION] Alternative query returned: ${result.recordset.length} rows`);
    }
  }
  
  console.log('');
  
  return result.recordset;
}

/**
 * Upload single image to Cloudinary and update database
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
        console.warn(`[MIGRATION] ⚠️  Product ${ProductID} has invalid image data format`);
        return { success: false, error: 'Invalid image data format', productId: ProductID };
      }
    } else {
      console.warn(`[MIGRATION] ⚠️  Product ${ProductID} has invalid image data`);
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

    console.log(`[MIGRATION] ✅ Migrated Product ${ProductID} -> ${uploadResult.secure_url.substring(0, 60)}...`);
    
    return {
      success: true,
      productId: ProductID,
      cloudinaryUrl: uploadResult.secure_url,
      bytes: uploadResult.bytes
    };
  } catch (error) {
    console.error(`[MIGRATION] ❌ Failed to migrate Product ${ProductID}:`, error.message);
    return {
      success: false,
      error: error.message,
      productId: ProductID
    };
  }
}

/**
 * Main migration function
 */
async function migrateImages() {
  console.log('\n🚀 Starting Image Migration to Cloudinary...\n');

  // Check Cloudinary configuration
  if (!isCloudinaryConfigured()) {
    console.error('❌ Cloudinary is not configured!');
    console.error('Please set the following environment variables:');
    console.error('  - CLOUDINARY_CLOUD_NAME');
    console.error('  - CLOUDINARY_API_KEY');
    console.error('  - CLOUDINARY_API_SECRET');
    process.exit(1);
  }

  console.log('✅ Cloudinary configuration found\n');

  let pool;
  try {
    // Create direct connection (bypasses cached pool to use correct server from .env)
    pool = await createDirectConnection();
    console.log('✅ Connected to database');
    
    // Verify database name and server
    const dbCheck = await pool.request().query(`
      SELECT 
        DB_NAME() AS CurrentDatabase,
        @@SERVERNAME AS ServerName
    `);
    const dbInfo = dbCheck.recordset[0];
    console.log(`📊 Connected to database: ${dbInfo?.CurrentDatabase}`);
    console.log(`📊 Server: ${dbInfo?.ServerName}`);
    
    if (dbInfo?.CurrentDatabase !== 'Moifcore') {
      console.warn(`⚠️  WARNING: Connected to '${dbInfo?.CurrentDatabase}' but expected 'Moifcore'!`);
    }
    console.log('');

    // Ensure CloudinaryUrl column exists
    await ensureCloudinaryUrlColumn(pool);

    // Get all images to migrate
    console.log('📦 Fetching images to migrate...');
    const imagesToMigrate = await getImagesToMigrate(pool);

    if (imagesToMigrate.length === 0) {
      console.log('✅ No images to migrate. All images already have Cloudinary URLs!');
      return;
    }

    console.log(`📊 Found ${imagesToMigrate.length} images to migrate\n`);

    // Process in batches
    const totalBatches = Math.ceil(imagesToMigrate.length / BATCH_SIZE);
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let totalBytes = 0;

    for (let i = 0; i < imagesToMigrate.length; i += BATCH_SIZE) {
      const batch = imagesToMigrate.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} images)...`);

      // Process batch in parallel
      const batchPromises = batch.map(img => migrateSingleImage(pool, img));
      const batchResults = await Promise.all(batchPromises);

      // Count results
      batchResults.forEach(result => {
        if (result.skipped) {
          skippedCount++;
        } else if (result.success) {
          successCount++;
          totalBytes += result.bytes || 0;
        } else {
          errorCount++;
        }
      });

      console.log(`✅ Batch ${batchNumber} completed: ${successCount} migrated, ${skippedCount} skipped, ${errorCount} errors`);

      // Delay between batches (except last batch)
      if (i + BATCH_SIZE < imagesToMigrate.length) {
        console.log(`⏳ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total images processed: ${imagesToMigrate.length}`);
    console.log(`✅ Successfully migrated: ${successCount}`);
    console.log(`⏭️  Already migrated (skipped): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📦 Total data uploaded: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    if (pool) {
      await pool.close();
      console.log('✅ Database connection closed');
    }
  }
}

// Run migration
migrateImages()
  .then(() => {
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });

