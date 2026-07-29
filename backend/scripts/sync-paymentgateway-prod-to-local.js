// Reads PaymentGateway schema from PROD (moifopaia.selfip.com) READ-ONLY and
// brings LOCAL (MOIF\SQLEXPRESS2019) up to match: missing tables + missing columns.
// Prod is never written. Local gets CREATE TABLE / ALTER TABLE ADD only (no drops).
//
//   node scripts/sync-paymentgateway-prod-to-local.js          # dry run, prints plan
//   node scripts/sync-paymentgateway-prod-to-local.js --apply   # executes on LOCAL
import mssql from "mssql";

const DB_NAME = "PaymentGateway";
const APPLY = process.argv.includes("--apply");

// SOURCE = production (read-only). TARGET = local (writes here).
const PROD = {
  user: "sa", password: "gtarc", server: "moifopaia.selfip.com", port: 1433,
  database: DB_NAME,
  options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true },
  connectionTimeout: 20000, requestTimeout: 60000,
};
// Local targets. Pick with --target=<name> (default moif2019).
const TARGETS = {
  moif2019: { server: "MOIF", instanceName: "SQLEXPRESS2019", password: "motech" },
  sb:       { server: "SB",   instanceName: "SQLEXPRESS",     password: "gtarc"  },
};
const targetKey = (process.argv.find(a => a.startsWith("--target=")) || "--target=moif2019").split("=")[1];
const T = TARGETS[targetKey];
if (!T) { console.error(`Unknown --target=${targetKey}. Options: ${Object.keys(TARGETS).join(", ")}`); process.exit(1); }
const LOCAL = {
  user: "sa", password: T.password, server: T.server,
  database: DB_NAME,
  options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true, instanceName: T.instanceName },
  connectionTimeout: 20000, requestTimeout: 60000,
};

function colType(c) {
  const t = c.DATA_TYPE;
  if (["varchar", "char", "varbinary", "nvarchar", "nchar"].includes(t)) {
    return `${t}(${c.CHARACTER_MAXIMUM_LENGTH === -1 ? "MAX" : c.CHARACTER_MAXIMUM_LENGTH})`;
  }
  if (["decimal", "numeric"].includes(t)) {
    return `${t}(${c.NUMERIC_PRECISION},${c.NUMERIC_SCALE})`;
  }
  return t;
}

async function getSchema(pool) {
  const rows = (await pool.request().query(`
    SELECT t.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH,
           c.NUMERIC_PRECISION, c.NUMERIC_SCALE, c.IS_NULLABLE, c.COLUMN_DEFAULT, c.ORDINAL_POSITION
    FROM INFORMATION_SCHEMA.TABLES t
    JOIN INFORMATION_SCHEMA.COLUMNS c
      ON c.TABLE_NAME = t.TABLE_NAME AND c.TABLE_SCHEMA = t.TABLE_SCHEMA
    WHERE t.TABLE_TYPE = 'BASE TABLE' AND t.TABLE_SCHEMA = 'dbo'
    ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
  `)).recordset;
  const tables = new Map();
  for (const r of rows) {
    if (!tables.has(r.TABLE_NAME)) tables.set(r.TABLE_NAME, new Map());
    tables.get(r.TABLE_NAME).set(r.COLUMN_NAME, r);
  }
  return tables;
}

async function getTableDDL(pool, tableName, cols) {
  const pk = (await pool.request().query(`
    SELECT ku.COLUMN_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
    WHERE tc.TABLE_NAME = '${tableName}' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    ORDER BY ku.ORDINAL_POSITION
  `)).recordset.map(r => r.COLUMN_NAME);

  const identityCols = new Set((await pool.request().query(`
    SELECT ic.name AS COLUMN_NAME
    FROM sys.identity_columns ic
    JOIN sys.tables t ON ic.object_id = t.object_id
    WHERE t.name = '${tableName}'
  `)).recordset.map(r => r.COLUMN_NAME));

  const colLines = [...cols.values()].map(c => {
    const identityStr = identityCols.has(c.COLUMN_NAME) ? " IDENTITY(1,1)" : "";
    const nullStr = c.IS_NULLABLE === "YES" ? "NULL" : "NOT NULL";
    const defStr = c.COLUMN_DEFAULT ? ` DEFAULT ${c.COLUMN_DEFAULT}` : "";
    return `  [${c.COLUMN_NAME}] ${colType(c)}${identityStr} ${nullStr}${defStr}`;
  });
  if (pk.length) {
    colLines.push(`  CONSTRAINT [PK_${tableName}] PRIMARY KEY (${pk.map(c => `[${c}]`).join(", ")})`);
  }
  return `CREATE TABLE [dbo].[${tableName}] (\n${colLines.join(",\n")}\n);`;
}

async function main() {
  console.log(`Connecting PROD (read-only) and LOCAL for DB ${DB_NAME}...`);
  const prodPool = await new mssql.ConnectionPool(PROD).connect();
  const localPool = await new mssql.ConnectionPool(LOCAL).connect();
  console.log("Connected both.\n");

  const [prod, local] = await Promise.all([getSchema(prodPool), getSchema(localPool)]);

  const missingTables = [];
  const missingColumns = [];
  const typeMismatches = [];

  for (const [tbl, prodCols] of prod) {
    if (!local.has(tbl)) { missingTables.push(tbl); continue; }
    const localCols = local.get(tbl);
    for (const [col, pc] of prodCols) {
      if (!localCols.has(col)) { missingColumns.push({ table: tbl, def: pc }); continue; }
      const lc = localCols.get(col);
      if (colType(pc) !== colType(lc) || pc.IS_NULLABLE !== lc.IS_NULLABLE) {
        typeMismatches.push({ table: tbl, column: col, prod: colType(pc) + "/" + pc.IS_NULLABLE, local: colType(lc) + "/" + lc.IS_NULLABLE });
      }
    }
  }

  console.log(`Prod tables: ${prod.size}   Local tables: ${local.size}`);
  console.log(`Missing tables on LOCAL: ${missingTables.length}`);
  missingTables.forEach(t => console.log(`   + TABLE ${t}`));
  console.log(`Missing columns on LOCAL: ${missingColumns.length}`);
  missingColumns.forEach(m => console.log(`   + ${m.table}.${m.def.COLUMN_NAME} (${colType(m.def)}, ${m.def.IS_NULLABLE === "YES" ? "NULL" : "NOT NULL"})`));
  console.log(`Type/nullability mismatches (NOT auto-changed): ${typeMismatches.length}`);
  typeMismatches.forEach(m => console.log(`   ! ${m.table}.${m.column}  prod=${m.prod}  local=${m.local}`));

  if (!APPLY) {
    console.log(`\nDRY RUN. Re-run with --apply to create the above on LOCAL.`);
    await prodPool.close(); await localPool.close(); process.exit(0);
  }

  console.log(`\n--- APPLYING to LOCAL (${LOCAL.server}\\${LOCAL.options.instanceName}) ---`);
  for (const tbl of missingTables) {
    const ddl = await getTableDDL(prodPool, tbl, prod.get(tbl));
    await localPool.request().query(ddl);
    console.log(`CREATED TABLE ${tbl}`);
  }
  for (const m of missingColumns) {
    // Add as NULL regardless of prod nullability, to not break any existing rows.
    const sql = `ALTER TABLE [dbo].[${m.table}] ADD [${m.def.COLUMN_NAME}] ${colType(m.def)} NULL${m.def.COLUMN_DEFAULT ? ` DEFAULT ${m.def.COLUMN_DEFAULT}` : ""};`;
    await localPool.request().query(sql);
    console.log(`ADDED COLUMN ${m.table}.${m.def.COLUMN_NAME}`);
  }
  console.log(`\nDone. Tables created: ${missingTables.length}, columns added: ${missingColumns.length}.`);
  console.log(`Note: ${typeMismatches.length} type/nullability mismatches left untouched (review manually).`);

  await prodPool.close(); await localPool.close(); process.exit(0);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
