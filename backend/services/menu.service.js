// backend/services/menu.service.js
import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";

const T_ITEMS = "dbo.ProductMaster";
const T_CATS  = "dbo.GroupMaster";
const T_CHILD = "dbo.ProductChild";
const T_IMAGES = "dbo.ImageMaster";

const q = (n) => `[${n}]`;

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

  const rs = await pool
    .request()
    .input("schema", mssql.VarChar, schema)
    .input("table", mssql.VarChar, table)
    .query(`
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
    ORDER BY ${q("GroupDescription")} ASC
  `;
  const rs = await pool.request().query(sql);
  return rs.recordset;
}

// keep old controller compatibility if it imports listCategories
export const listCategories = listGroups;


/**
 * Returns ALL columns from ProductMaster (pm.* labels) and ONE ProductChild (pc.* labels).
 * - Picks child row by station match (if given) else newest (ModOn/CrOn)
 * - Robust group filter:
 *    * If groupId fits INT32 -> pm.[GroupID] = @gid
 *    * Else / non-int -> gm.[GroupCode] = @gcode
 */
export async function listMenuItems({
  page = 1,
  pageSize = 24,
  search = "",
  groupId,
  groupCode,
  stationId = null,
  sort = "new",
}) {
    const pool = await connectToDb();
    const { offset, limit } = toPaging(String(page), String(pageSize));

    // Build SELECT lists from sys.columns (cached)
    const [pmCols, pcCols] = await Promise.all([
      fetchColumns(pool, T_ITEMS),
      fetchColumns(pool, T_CHILD),
    ]);
    const pmList = buildAliasedList(pmCols, "pm");
    const pcList = buildAliasedList(pcCols, "pc");

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

    if (groupId != null && String(groupId).trim() !== "") {
      const n = Number(groupId);
      if (Number.isInteger(n) && n >= INT_MIN && n <= INT_MAX) {
        where.push(`pm.${q("GroupID")} = @gid`);
        req.input("gid", mssql.Int, n);
        appliedGroupId = true;
      } else {
        // groupId is too large / not an int -> treat as GroupCode
        where.push(`gm.${q("GroupCode")} = @gcode`);
        req.input("gcode", mssql.VarChar, String(groupId));
        appliedGroupCode = true;
      }
    }

    if (!appliedGroupCode && groupCode != null && String(groupCode).trim() !== "") {
      where.push(`gm.${q("GroupCode")} = @gcode`);
      req.input("gcode", mssql.VarChar, String(groupCode));
      appliedGroupCode = true;
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
        SELECT TOP (1) pcs.*
        FROM ${T_CHILD} pcs
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

    if (appliedGroupId) {
      const n = Number(groupId);
      totalReq.input("gid", mssql.Int, n);
    }
    if (appliedGroupCode) {
      totalReq.input("gcode", mssql.VarChar, String(groupId));
    } else if (groupCode != null && String(groupCode).trim() !== "") {
      totalReq.input("gcode", mssql.VarChar, String(groupCode));
    }

    const totalSql = `
      SELECT COUNT(*) AS total
      FROM ${T_ITEMS} pm
      ${join}
      ${whereSql}
    `;
    const totalRs = await totalReq.query(totalSql);
    const total = Number(totalRs.recordset[0]?.total || 0);

    // paging
    req.input("skip", mssql.Int, offset);
    req.input("take", mssql.Int, limit);

    // data — back-compat ids + full pm.* and pc.*
    const dataSql = `
      SELECT
        -- Back-compat friendly aliases
        pm.${q("ID")}                AS id,
        pm.${q("ProductID")}         AS product_id,
        pm.${q("Description")}       AS name,
        pm.${q("DescriptionArabic")} AS name_ar,
        pm.${q("GroupID")}           AS group_id,

        -- some useful group fields
        gm.${q("GroupDescription")}  [gm.GroupDescription],
        gm.${q("GroupCode")}         [gm.GroupCode],

        pm.${q("ShortDescription")}  AS short_description,
        images.imagesConcat           AS imagesConcat,

        -- everything from ProductMaster labeled as pm.*
        ${pmList},

        -- chosen ProductChild row labeled as pc.*
        ${pcList}

      FROM ${T_ITEMS} pm
      ${join}
      OUTER APPLY (
        SELECT STUFF((
          SELECT '|||' + ISNULL(
            CAST(
              CAST('' AS XML).value('xs:base64Binary(xs:hexBinary(sql:column("imgBinary")))', 'NVARCHAR(MAX)')
              AS NVARCHAR(MAX)
            ),
            ''
          )
          FROM (
            SELECT CAST(imap.${q("DocImage")} AS VARBINARY(MAX)) AS imgBinary,
                   imap.${q("ID")} AS imgId
            FROM ${T_IMAGES} imap
            WHERE imap.${q("DocID")} = pm.${q("ProductID")}
              AND imap.${q("DocType")} = 'PRODUCT'
          ) AS bin
          ORDER BY bin.imgId DESC
          FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 3, '') AS imagesConcat
      ) images
      ${childApply}
      ${whereSql}
      ORDER BY ${orderBy}
      OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
    `;

    const dataRs = await req.query(dataSql);
    const data = dataRs.recordset.map((row) => {
      const images = typeof row.imagesConcat === "string" && row.imagesConcat.trim()
        ? row.imagesConcat.split("|||").filter(Boolean)
        : [];

      const primaryImage = images[0] ?? null;

      const { imagesConcat, ...rest } = row;
      return {
        ...rest,
        image: primaryImage,
        images,
      };
    });

    return { total, data, page, pageSize };
}

