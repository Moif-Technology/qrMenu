// backend/services/menu.service.js
import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";
import { getCloudinaryUrl, isCloudinaryConfigured, applyCloudinaryTransformations, generateBlurUpThumbnail } from "./cloudinary.service.js";

const T_ITEMS = "dbo.ProductMaster";
const T_CATS  = "dbo.GroupMaster";
const T_CHILD = "dbo.ProductChild";
const T_IMAGES = "dbo.ImageMaster";

const q = (n) => `[${n}]`;

// Cache for CloudinaryUrl column existence check (lifetime cache - column won't disappear)
let _hasCloudinaryColumnCache = null;

/**
 * Check if CloudinaryUrl column exists in ImageMaster table (CACHED)
 * This avoids repeated database queries for column existence
 * @returns {Promise<boolean>}
 */
export async function hasCloudinaryUrlColumn() {
  // Return cached value if available
  if (_hasCloudinaryColumnCache !== null) {
    return _hasCloudinaryColumnCache;
  }

  try {
    const pool = await connectToDb();
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'dbo' 
        AND TABLE_NAME = 'ImageMaster' 
        AND COLUMN_NAME = 'CloudinaryUrl'
    `);
    _hasCloudinaryColumnCache = colCheck.recordset.length > 0;
    return _hasCloudinaryColumnCache;
  } catch (err) {
    // Column doesn't exist yet, cache as false
    _hasCloudinaryColumnCache = false;
    return false;
  }
}

// simple paging helper
function toPaging(p = "1", s = "24") {
  const page = Math.max(1, parseInt(p, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(s, 10) || 24));
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

// ---- sys.columns helpers (no hand-listing columns) ----
const _colCache = new Map(); // key: "schema.table" -> [colName, ...]

function splitSchemaTable(fullyQualified) {
  const [schemaRaw, tableRaw] = fullyQualified.split(".");
  const strip = (s) => s.replace(/^\[|\]$/g, "");
  return { schema: strip(schemaRaw), table: strip(tableRaw) };
}

async function fetchColumns(pool, fullyQualified) {
  const { schema, table } = splitSchemaTable(fullyQualified);
  const key = `${schema}.${table}`;
  if (_colCache.has(key)) return _colCache.get(key);

  const req = pool
    .request()
    .input("schema", mssql.VarChar, schema)
    .input("table", mssql.VarChar, table);
  req.timeout = 10000; // 10 seconds for column metadata query
  const rs = await req.query(`
      SELECT c.name
      FROM sys.columns c
      JOIN sys.tables  t ON t.object_id = c.object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      WHERE s.name = @schema AND t.name = @table
      ORDER BY c.column_id
    `);

  const cols = rs.recordset.map((r) => r.name);
  _colCache.set(key, cols);
  return cols;
}

// Build: pm.[Col] [pm.Col] / pc.[Col] [pc.Col]
function buildAliasedList(cols, alias) {
  return cols
    .map((col) => `${alias}.${q(col)} [${alias}.${col}]`)
    .join(",\n      ");
}


/**
 * GET categories (GroupMaster)
 * Returns: groupId, name, code, name_ar
 */
export async function listGroups() {
  const pool = await connectToDb();
  const sql = `
    SELECT
      ${q("GroupID")}                AS groupId,
      ${q("GroupDescription")}       AS name,
      ${q("GroupCode")}              AS code,
      ${q("GroupDescriptionArabic")} AS name_ar
    FROM ${T_CATS}
    WHERE ${q("keyshift")} = 1
    ORDER BY ${q("GroupDescription")} ASC
  `;
  const req = pool.request();
  req.timeout = 30000; // 30 seconds for categories query
  const rs = await req.query(sql);
  return rs.recordset;
}

// keep old controller compatibility if it imports listCategories
export const listCategories = listGroups;


/**
 * Returns ALL columns from ProductMaster (pm.* labels) and ONE ProductChild (pc.* labels).
 * - Picks child row by station match (if given) else newest (ModOn/CrOn)
 * - Robust group filter:
 *    * If groupId fits INT32 -> pm.[GroupID] = @gid (as Int)
 *    * If groupId exceeds INT32 -> pm.[GroupID] = @gid (as BigInt)
 *    * If groupId is not a valid number -> gm.[GroupCode] = @gcode
 */
export async function listMenuItems({
  page = 1,
  pageSize = 24,
  search = "",
  groupId,
  groupCode,
  stationId = null,
  sort = "new",
  includeImages = false, // Make images optional for performance
}) {
    const pool = await connectToDb();
    const { offset, limit } = toPaging(String(page), String(pageSize));

    // Only fetch essential columns for performance
    // Essential ProductMaster columns
    const essentialPmCols = [
      "ID", "ProductID", "Description", "DescriptionArabic", "GroupID", 
      "ShortDescription", "ModOn", "CrOn", "BarCode", "Specification"
    ];
    
    // Essential ProductChild columns
    const essentialPcCols = [
      "ProductID", "UnitPrice", "Tax1Amount", "StationID", "ModOn", "CrOn"
    ];
    
    // Build aliased lists for essential columns only
    const pmList = essentialPmCols
      .map((col) => `pm.${q(col)} [pm.${col}]`)
      .join(",\n        ");
    const pcList = essentialPcCols
      .map((col) => `pc.${q(col)} [pc.${col}]`)
      .join(",\n        ");

    // Filters
    const where = [];
    const req = pool.request();

    // search
    if (search) {
      where.push(`(
        pm.${q("Description")}       LIKE @s OR
        pm.${q("ShortDescription")}  LIKE @s OR
        pm.${q("DescriptionArabic")} LIKE @s OR
        pm.${q("BarCode")}           LIKE @s
      )`);
      req.input("s", mssql.NVarChar, `%${search}%`);
    }

    // join for group filters
    const join = `LEFT JOIN ${T_CATS} gm ON gm.${q("GroupID")} = pm.${q("GroupID")}`;

    // ---- Robust group filter handling ----
    const INT_MIN = -2147483648;
    const INT_MAX =  2147483647;

    let appliedGroupId = false;
    let appliedGroupCode = false;
    let groupIdValue = null; // Store the actual groupId value for use in total query
    let groupCodeValue = null; // Store the actual groupCode value for use in total query

    if (groupId != null && String(groupId).trim() !== "") {
      const n = Number(groupId);
      if (Number.isInteger(n)) {
        // Use BigInt for large group IDs (exceeds INT32 range)
        if (n >= INT_MIN && n <= INT_MAX) {
          where.push(`pm.${q("GroupID")} = @gid`);
          req.input("gid", mssql.Int, n);
          appliedGroupId = true;
          groupIdValue = n;
        } else {
          // Large group ID - use BigInt type
          where.push(`pm.${q("GroupID")} = @gid`);
          req.input("gid", mssql.BigInt, BigInt(n));
          appliedGroupId = true;
          groupIdValue = n;
        }
      } else {
        // groupId is not a valid number -> treat as GroupCode
        where.push(`gm.${q("GroupCode")} = @gcode`);
        req.input("gcode", mssql.VarChar, String(groupId));
        appliedGroupCode = true;
        groupCodeValue = String(groupId);
      }
    }

    if (!appliedGroupCode && groupCode != null && String(groupCode).trim() !== "") {
      where.push(`gm.${q("GroupCode")} = @gcode`);
      req.input("gcode", mssql.VarChar, String(groupCode));
      appliedGroupCode = true;
      groupCodeValue = String(groupCode);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // choose ONE child row (prefer station match, then newest)
    const stationParsed =
      stationId != null && String(stationId).trim() !== "" && !Number.isNaN(Number(stationId))
        ? Number(stationId)
        : null;

    req.input("stationId", mssql.Int, stationParsed);

    const childApply = `
      OUTER APPLY (
        SELECT TOP (1) 
          pcs.${q("ProductID")} AS ${q("ProductID")},
          pcs.${q("UnitPrice")} AS ${q("UnitPrice")},
          pcs.${q("Tax1Amount")} AS ${q("Tax1Amount")},
          pcs.${q("StationID")} AS ${q("StationID")},
          pcs.${q("ModOn")} AS ${q("ModOn")},
          pcs.${q("CrOn")} AS ${q("CrOn")}
        FROM ${T_CHILD} pcs WITH (NOLOCK)
        WHERE pcs.${q("ProductID")} = pm.${q("ProductID")}
          AND ( @stationId IS NULL OR pcs.${q("StationID")} = @stationId )
        ORDER BY
          CASE WHEN @stationId IS NULL THEN 0
               WHEN pcs.${q("StationID")} = @stationId THEN 0 ELSE 1 END,
          pcs.${q("ModOn")} DESC,
          pcs.${q("CrOn")} DESC
      ) pc
    `;

    // Sorting (no price sorts)
    const orderByMap = {
      new:     `pm.${q("ModOn")} DESC, pm.${q("CrOn")} DESC`,
      name:    `pm.${q("Description")} ASC`,
      id_desc: `pm.${q("ID")} DESC`,
      id_asc:  `pm.${q("ID")} ASC`,
    };
    const orderBy = orderByMap[sort] || orderByMap.new;

    // total count (by products, not multiplied by child rows)
    const totalReq = pool.request();
    if (search) totalReq.input("s", mssql.NVarChar, `%${search}%`);

    if (appliedGroupId && groupIdValue !== null) {
      const n = Number(groupIdValue);
      // Use the same type as in the main query (Int or BigInt)
      if (n >= INT_MIN && n <= INT_MAX) {
        totalReq.input("gid", mssql.Int, n);
      } else {
        totalReq.input("gid", mssql.BigInt, BigInt(n));
      }
    }
    if (appliedGroupCode && groupCodeValue !== null) {
      totalReq.input("gcode", mssql.VarChar, groupCodeValue);
    } else if (!appliedGroupCode && groupCode != null && String(groupCode).trim() !== "") {
      totalReq.input("gcode", mssql.VarChar, String(groupCode));
    }

    const totalSql = `
      SELECT COUNT(*) AS total
      FROM ${T_ITEMS} pm WITH (NOLOCK)
      ${join}
      ${whereSql}
    `;
    // Set query timeout to 60 seconds (60000ms) to prevent hanging queries
    totalReq.timeout = 60000;
    const totalRs = await totalReq.query(totalSql);
    const total = Number(totalRs.recordset[0]?.total || 0);

    // paging
    req.input("skip", mssql.Int, offset);
    req.input("take", mssql.Int, limit);
    // Set query timeout to 60 seconds (60000ms) to prevent hanging queries
    req.timeout = 60000;

    // Optimized query - only essential columns, images optional
    // Images are expensive to process, so we make them optional
    const imageApply = includeImages ? `
      OUTER APPLY (
        SELECT TOP (1) CAST(imap.${q("DocImage")} AS VARBINARY(MAX)) AS imgBinary
        FROM ${T_IMAGES} imap WITH (NOLOCK)
        WHERE imap.${q("DocID")} = pm.${q("ProductID")}
          AND imap.${q("DocType")} = 'PRODUCT'
        ORDER BY imap.${q("ID")} DESC
      ) img
      OUTER APPLY (
        SELECT CASE WHEN img.imgBinary IS NOT NULL THEN
          CAST('' AS XML).value('xs:base64Binary(xs:hexBinary(sql:column("img.imgBinary")))', 'NVARCHAR(MAX)')
        ELSE NULL END AS primaryImage
      ) imgBase64
    ` : '';

    const dataSql = `
      SELECT
        -- Back-compat friendly aliases
        pm.${q("ID")}                AS id,
        pm.${q("ProductID")}         AS product_id,
        pm.${q("Description")}       AS name,
        pm.${q("DescriptionArabic")} AS name_ar,
        pm.${q("GroupID")}           AS group_id,

        -- some useful group fields
        gm.${q("GroupDescription")}  AS [gm.GroupDescription],
        gm.${q("GroupCode")}         AS [gm.GroupCode],

        pm.${q("ShortDescription")}  AS short_description,
        ${includeImages ? 'imgBase64.primaryImage AS imagesConcat' : 'NULL AS imagesConcat'},

        -- Essential ProductMaster columns labeled as pm.*
        ${pmList},

        -- Essential ProductChild columns labeled as pc.*
        ${pcList}

      FROM ${T_ITEMS} pm WITH (NOLOCK)
      ${join}
      ${imageApply}
      ${childApply}
      ${whereSql}
      ORDER BY ${orderBy}
      OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
    `;

    const dataRs = await req.query(dataSql);
    const data = dataRs.recordset.map((row) => {
      // Handle images - if included, process base64, otherwise empty array
      let images = [];
      let primaryImage = null;
      
      if (includeImages && row.imagesConcat) {
        if (typeof row.imagesConcat === "string" && row.imagesConcat.trim()) {
          // Single image (optimized query returns only primary image)
          primaryImage = row.imagesConcat.trim();
          images = [primaryImage];
        }
      }

      // Calculate price with tax: UnitPrice + Tax1Amount
      const unitPrice = Number(row["pc.UnitPrice"] ?? row["pc_UnitPrice"] ?? 0);
      const tax1Amount = Number(row["pc.Tax1Amount"] ?? row["pc_Tax1Amount"] ?? 0);
      const price = Number((unitPrice + tax1Amount).toFixed(2));

      const { imagesConcat, ...rest } = row;
      return {
        ...rest,
        image: primaryImage,
        images,
        price, // Add calculated price field
      };
    });

    return { total, data, page, pageSize };
}

/**
 * Batch load images for multiple products
 * Optimized: Returns binary from SQL, converts to base64 in Node.js (much faster)
 * @param {string[]} productIds - Array of ProductID values
 * @returns {Object} Map of productId -> { image: string, images: string[] }
 */
export async function batchLoadProductImages(productIds = []) {
  if (!productIds || productIds.length === 0) {
    return {};
  }

  const pool = await connectToDb();
  
  // Smaller batch size for better performance
  const batchSize = 20; // Reduced from 100 to 20 for faster processing
  const batches = [];
  
  for (let i = 0; i < productIds.length; i += batchSize) {
    batches.push(productIds.slice(i, i + batchSize));
  }

  const allResults = {};

  // Process each batch
  for (const batch of batches) {
    try {
      const batchReq = pool.request();
      
      // Create placeholders for IN clause
      const placeholders = batch.map((_, idx) => `@pid${idx}`).join(', ');
      batch.forEach((pid, idx) => {
        batchReq.input(`pid${idx}`, mssql.VarChar, String(pid));
      });

      // Check if CloudinaryUrl column exists (CACHED)
      const hasCloudinaryColumn = await hasCloudinaryUrlColumn();

      // Optimized query: Prefer Cloudinary URLs, fallback to binary
      const sql = hasCloudinaryColumn
        ? `
          SELECT 
            ranked.${q("DocID")} AS productId,
            ranked.${q("CloudinaryUrl")} AS cloudinaryUrl,
            ranked.imgBinary
          FROM (
            SELECT 
              imap.${q("DocID")},
              imap.${q("CloudinaryUrl")},
              CAST(imap.${q("DocImage")} AS VARBINARY(MAX)) AS imgBinary,
              ROW_NUMBER() OVER (PARTITION BY imap.${q("DocID")} ORDER BY imap.${q("ID")} DESC) AS rn
            FROM ${T_IMAGES} imap WITH (NOLOCK)
            WHERE imap.${q("DocID")} IN (${placeholders})
              AND imap.${q("DocType")} = 'PRODUCT'
              AND (imap.${q("CloudinaryUrl")} IS NOT NULL OR imap.${q("DocImage")} IS NOT NULL)
          ) ranked
          WHERE ranked.rn = 1
        `
        : `
        SELECT 
          ranked.${q("DocID")} AS productId,
          ranked.imgBinary
        FROM (
          SELECT 
            imap.${q("DocID")},
            CAST(imap.${q("DocImage")} AS VARBINARY(MAX)) AS imgBinary,
            ROW_NUMBER() OVER (PARTITION BY imap.${q("DocID")} ORDER BY imap.${q("ID")} DESC) AS rn
          FROM ${T_IMAGES} imap WITH (NOLOCK)
          WHERE imap.${q("DocID")} IN (${placeholders})
            AND imap.${q("DocType")} = 'PRODUCT'
            AND imap.${q("DocImage")} IS NOT NULL
        ) ranked
        WHERE ranked.rn = 1
      `;

      batchReq.timeout = 15000; // 15 seconds per batch (reduced timeout)
      const rs = await batchReq.query(sql);

      // Process results: Prefer Cloudinary URLs, fallback to base64
      rs.recordset.forEach((row) => {
        const productId = String(row.productId);
        
        // Prefer Cloudinary URL if available (with transformations)
        if (hasCloudinaryColumn && row.cloudinaryUrl && row.cloudinaryUrl.trim()) {
          const transformedUrl = applyCloudinaryTransformations(row.cloudinaryUrl);
          allResults[productId] = {
            image: transformedUrl,
            images: [transformedUrl],
            type: 'cloudinary'
          };
          return;
        }
        
        // Fallback to binary/base64 conversion
        if (row.imgBinary) {
          try {
            let base64Image = null;
            
            // Handle different binary formats from mssql
            if (Buffer.isBuffer(row.imgBinary)) {
              base64Image = row.imgBinary.toString('base64');
            } else if (row.imgBinary instanceof Uint8Array) {
              base64Image = Buffer.from(row.imgBinary).toString('base64');
            } else if (typeof row.imgBinary === 'string') {
              // Already a string, might be base64 or hex
              base64Image = row.imgBinary;
            } else {
              // Try to convert to buffer
              base64Image = Buffer.from(row.imgBinary).toString('base64');
            }
            
            if (base64Image && base64Image.trim()) {
              allResults[productId] = {
                image: base64Image.trim(),
                images: [base64Image.trim()],
                type: 'base64'
              };
            }
          } catch (err) {
            console.warn(`[MENU] Failed to convert image for product ${productId}:`, err.message);
          }
        }
      });
    } catch (batchError) {
      console.error(`[MENU] Error loading batch of ${batch.length} images:`, batchError?.message || batchError);
      // Continue with next batch even if this one fails
    }
  }

  return allResults;
}

/**
 * Get lightweight image mapping (productId -> hasImage)
 * Very fast - only returns which products have images, not the images themselves
 * @returns {Object} Map of productId -> boolean
 */
export async function getImageMapping() {
  const pool = await connectToDb();
  const req = pool.request();

  // Check if CloudinaryUrl column exists (CACHED)
  const hasCloudinaryColumn = await hasCloudinaryUrlColumn();

  // Very fast query - get product IDs that have images (prefer Cloudinary URLs)
  const sql = hasCloudinaryColumn
    ? `
      SELECT DISTINCT 
        imap.${q("DocID")} AS productId,
        CASE 
          WHEN imap.${q("CloudinaryUrl")} IS NOT NULL AND imap.${q("CloudinaryUrl")} <> '' 
          THEN imap.${q("CloudinaryUrl")}
          ELSE NULL
        END AS cloudinaryUrl
      FROM ${T_IMAGES} imap WITH (NOLOCK)
      WHERE imap.${q("DocType")} = 'PRODUCT'
        AND (imap.${q("DocImage")} IS NOT NULL OR imap.${q("CloudinaryUrl")} IS NOT NULL)
    `
    : `
    SELECT DISTINCT imap.${q("DocID")} AS productId
    FROM ${T_IMAGES} imap WITH (NOLOCK)
    WHERE imap.${q("DocType")} = 'PRODUCT'
      AND imap.${q("DocImage")} IS NOT NULL
  `;

  req.timeout = 10000; // 10 seconds
  const rs = await req.query(sql);

  // Create mapping with Cloudinary URLs and blur-up thumbnails if available
  const mapping = {};
  rs.recordset.forEach((row) => {
    const productId = String(row.productId);
    const cloudinaryUrl = row.cloudinaryUrl 
      ? applyCloudinaryTransformations(row.cloudinaryUrl)
      : null;
    const thumbnailUrl = row.cloudinaryUrl 
      ? generateBlurUpThumbnail(row.cloudinaryUrl)
      : null;
    mapping[productId] = {
      hasImage: true,
      cloudinaryUrl: cloudinaryUrl,
      thumbnailUrl: thumbnailUrl // Instant-loading blur placeholder
    };
  });

  return mapping;
}

/**
 * Get single product image as binary Buffer (FAST - no base64 conversion)
 * Returns Cloudinary URL if available, otherwise binary buffer
 * @param {string} productId - ProductID
 * @returns {Object|null} { type: 'cloudinary'|'binary', url?: string, buffer?: Buffer } or null
 */
export async function getSingleProductImageBinary(productId) {
  if (!productId) {
    return null;
  }

  const pool = await connectToDb();
  const req = pool.request();
  req.input("productId", mssql.VarChar, String(productId));

  // Check if CloudinaryUrl column exists (CACHED)
  const hasCloudinaryColumn = await hasCloudinaryUrlColumn();

  // Query: Prefer Cloudinary URL, fallback to binary
  const sql = hasCloudinaryColumn
    ? `
      SELECT TOP 1 
        imap.${q("CloudinaryUrl")},
        CAST(imap.${q("DocImage")} AS VARBINARY(MAX)) AS imgBinary
      FROM ${T_IMAGES} imap WITH (NOLOCK)
      WHERE imap.${q("DocID")} = @productId
        AND imap.${q("DocType")} = 'PRODUCT'
        AND (imap.${q("CloudinaryUrl")} IS NOT NULL OR imap.${q("DocImage")} IS NOT NULL)
    `
    : `
    SELECT TOP 1 CAST(imap.${q("DocImage")} AS VARBINARY(MAX)) AS imgBinary
    FROM ${T_IMAGES} imap WITH (NOLOCK)
    WHERE imap.${q("DocID")} = @productId
      AND imap.${q("DocType")} = 'PRODUCT'
      AND imap.${q("DocImage")} IS NOT NULL
  `;

  req.timeout = 10000; // 10 seconds for single image
  let rs;
  try {
    rs = await req.query(sql);
  } catch (err) {
    console.warn(`[MENU] Query failed for product ${productId}:`, err.message);
    return null;
  }

  if (rs.recordset.length === 0) {
    return null;
  }

  const record = rs.recordset[0];

  // Prefer Cloudinary URL if available (with transformations)
  if (hasCloudinaryColumn && record.CloudinaryUrl && record.CloudinaryUrl.trim()) {
    return {
      type: 'cloudinary',
      url: applyCloudinaryTransformations(record.CloudinaryUrl)
    };
  }

  // Fallback to binary
  if (record.imgBinary) {
  try {
      const imgBinary = record.imgBinary;
      let buffer;
      
    if (Buffer.isBuffer(imgBinary)) {
        buffer = imgBinary;
    } else if (imgBinary && typeof imgBinary === 'object') {
        buffer = Buffer.from(imgBinary);
    } else {
      return null;
    }

      return {
        type: 'binary',
        buffer: buffer
      };
  } catch (err) {
    console.warn(`[MENU] Failed to get binary image for product ${productId}:`, err.message);
    return null;
  }
  }

  return null;
}

/**
 * Get single product image (optimized - fastest possible query)
 * @param {string} productId - ProductID
 * @returns {string|null} Base64 image string or null
 */
export async function getSingleProductImage(productId) {
  if (!productId) {
    return null;
  }

  const pool = await connectToDb();
  const req = pool.request();
  req.input("productId", mssql.VarChar, String(productId));

  // Ultra-simple query - get first match only (fastest possible)
  const sql = `
    SELECT TOP 1 CAST(imap.${q("DocImage")} AS VARBINARY(MAX)) AS imgBinary
    FROM ${T_IMAGES} imap WITH (NOLOCK)
    WHERE imap.${q("DocID")} = @productId
      AND imap.${q("DocType")} = 'PRODUCT'
      AND imap.${q("DocImage")} IS NOT NULL
  `;

  req.timeout = 10000; // 10 seconds for single image (increased)
  let rs;
  try {
    rs = await req.query(sql);
  } catch (err) {
    // If query times out or fails, return null
    console.warn(`[MENU] Query failed for product ${productId}:`, err.message);
    return null;
  }

  if (rs.recordset.length === 0 || !rs.recordset[0].imgBinary) {
    return null;
  }

  try {
    const imgBinary = rs.recordset[0].imgBinary;
    let base64Image = null;

    // Fast conversion - check type and convert
    if (Buffer.isBuffer(imgBinary)) {
      // Direct buffer conversion (fastest)
      base64Image = imgBinary.toString('base64');
    } else if (imgBinary && typeof imgBinary === 'object') {
      // Convert array-like to buffer
      base64Image = Buffer.from(imgBinary).toString('base64');
    } else if (typeof imgBinary === 'string') {
      base64Image = imgBinary;
    } else {
      return null;
    }

    return base64Image?.trim() || null;
  } catch (err) {
    console.warn(`[MENU] Failed to convert image for product ${productId}:`, err.message);
    return null;
  }
}

/**
 * GET areas (AreaMaster) with SupplyType = 'Dining'
 * Returns: areaId, areaName, areaNameArabic, supplyType, kotPrefix, priceLevel
 */
export async function listAreas() {
  const pool = await connectToDb();
  const sql = `
    SELECT
      ${q("AreaID")}                AS areaId,
      ${q("AreaName")}              AS areaName,
      ${q("AreaNameArabic")}        AS areaNameArabic,
      ${q("SupplyType")}            AS supplyType,
      ${q("KotPrefix")}             AS kotPrefix,
      ${q("PriceLevel")}            AS priceLevel
    FROM dbo.AreaMaster
    WHERE ${q("SupplyType")} = 'DINE IN'
    ORDER BY ${q("AreaName")} ASC
  `;
  const req = pool.request();
  req.timeout = 30000; // 30 seconds for areas query
  const rs = await req.query(sql);
  return rs.recordset;
}

