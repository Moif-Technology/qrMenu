// backend/scripts/test-image-query.js
/**
 * Test script to check what images exist in ImageMaster
 * Run: node scripts/test-image-query.js
 */

import { connectToDb } from '../config/dbConfig.js';
import mssql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const T_IMAGES = "dbo.ImageMaster";
const q = (n) => `[${n}]`;

async function testImageQuery() {
  console.log('\n🔍 Testing ImageMaster Table Queries...\n');

  let pool;
  try {
    pool = await connectToDb();
    console.log('✅ Connected to database\n');

    // 0. Show table structure
    console.log('📋 ImageMaster Table Structure:');
    const tableStructure = await pool.request().query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'ImageMaster'
      ORDER BY ORDINAL_POSITION
    `);
    if (tableStructure.recordset.length === 0) {
      console.log('  ⚠️  Table ImageMaster not found!');
    } else {
      tableStructure.recordset.forEach(col => {
        const length = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
        console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE}${length} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
    }
    console.log('');

    // 1. Check total records
    const totalCheck = await pool.request().query(`
      SELECT COUNT(*) AS TotalRecords
      FROM ${T_IMAGES}
    `);
    console.log(`📊 Total records in ImageMaster: ${totalCheck.recordset[0]?.TotalRecords || 0}`);

    // 2. Check records with image data
    const withImageCheck = await pool.request().query(`
      SELECT COUNT(*) AS WithImageData
      FROM ${T_IMAGES}
      WHERE ${q("DocImage")} IS NOT NULL
    `);
    console.log(`📊 Records with DocImage data: ${withImageCheck.recordset[0]?.WithImageData || 0}`);

    // 3. Check DocType distribution
    const docTypeCheck = await pool.request().query(`
      SELECT 
        ${q("DocType")},
        COUNT(*) AS Count,
        COUNT(CASE WHEN ${q("DocImage")} IS NOT NULL THEN 1 END) AS WithImages
      FROM ${T_IMAGES}
      GROUP BY ${q("DocType")}
      ORDER BY Count DESC
    `);
    console.log('\n📊 DocType Distribution:');
    if (docTypeCheck.recordset.length === 0) {
      console.log('  ⚠️  No records found!');
    } else {
      docTypeCheck.recordset.forEach(row => {
        console.log(`  - DocType: "${row.DocType || '(NULL)'}" - Total: ${row.Count}, With Images: ${row.WithImages}`);
      });
    }

    // 4. Check CloudinaryUrl column
    const cloudinaryCheck = await pool.request().query(`
      SELECT 
        COUNT(*) AS TotalWithCloudinary
      FROM ${T_IMAGES}
      WHERE ${q("CloudinaryUrl")} IS NOT NULL 
        AND ${q("CloudinaryUrl")} <> ''
    `);
    console.log(`\n📊 Records with CloudinaryUrl: ${cloudinaryCheck.recordset[0]?.TotalWithCloudinary || 0}`);

    // 5. Sample records that need migration
    const sampleCheck = await pool.request().query(`
      SELECT TOP 5
        ${q("ID")},
        ${q("DocID")} AS ProductID,
        ${q("DocType")},
        CASE WHEN ${q("DocImage")} IS NOT NULL THEN 'Yes' ELSE 'No' END AS HasImage,
        CASE WHEN ${q("CloudinaryUrl")} IS NOT NULL AND ${q("CloudinaryUrl")} <> '' THEN 'Yes' ELSE 'No' END AS HasCloudinaryUrl,
        LEN(CAST(${q("DocImage")} AS VARBINARY(MAX))) AS ImageSizeBytes
      FROM ${T_IMAGES}
      WHERE ${q("DocImage")} IS NOT NULL
        AND (${q("CloudinaryUrl")} IS NULL OR ${q("CloudinaryUrl")} = '')
      ORDER BY ${q("ID")}
    `);
    console.log(`\n📊 Sample records needing migration: ${sampleCheck.recordset.length}`);
    if (sampleCheck.recordset.length > 0) {
      console.log('\nSample data:');
      sampleCheck.recordset.forEach((row, idx) => {
        console.log(`  ${idx + 1}. ID: ${row.ID}, DocID: ${row.ProductID}, DocType: "${row.DocType || '(NULL)'}", ImageSize: ${row.ImageSizeBytes} bytes`);
      });
    }

    // 7. Count images ready for migration
    const readyCheck = await pool.request().query(`
      SELECT COUNT(*) AS ReadyForMigration
      FROM ${T_IMAGES}
      WHERE ${q("DocImage")} IS NOT NULL
        AND (${q("CloudinaryUrl")} IS NULL OR ${q("CloudinaryUrl")} = '')
    `);
    console.log(`\n✅ Images ready for migration: ${readyCheck.recordset[0]?.ReadyForMigration || 0}\n`);

    // 8. Check if DocImage column exists and its data type
    const docImageCheck = await pool.request().query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'ImageMaster'
        AND COLUMN_NAME = 'DocImage'
    `);
    if (docImageCheck.recordset.length > 0) {
      const col = docImageCheck.recordset[0];
      console.log(`📋 DocImage column type: ${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : ''}`);
    } else {
      console.log('⚠️  DocImage column not found!');
    }
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    if (pool) {
      await pool.close();
      console.log('✅ Database connection closed');
    }
  }
}

testImageQuery()
  .then(() => {
    console.log('✅ Test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });

