// Compares table/column schema between two SQL Server instances for both
// Moifcore and PaymentGateway databases. Read-only — no writes.
import mssql from "mssql";

const SOURCE = { server: "MOIF\\SQLEXPRESS2019", user: "sa", password: "motech" };
const TARGET = { server: "SB\\SQLEXPRESS", user: "sa", password: "gtarc" };

function buildConfig(base, database) {
  const [host, instanceName] = base.server.split("\\");
  return {
    user: base.user,
    password: base.password,
    server: host,
    database,
    options: {
      encrypt: false,
      enableArithAbort: true,
      trustServerCertificate: true,
      instanceName
    },
    connectionTimeout: 15000,
    requestTimeout: 30000
  };
}

async function getSchema(config) {
  const pool = await new mssql.ConnectionPool(config).connect();
  const result = await pool.request().query(`
    SELECT
      t.TABLE_NAME,
      c.COLUMN_NAME,
      c.DATA_TYPE,
      c.CHARACTER_MAXIMUM_LENGTH,
      c.NUMERIC_PRECISION,
      c.NUMERIC_SCALE,
      c.IS_NULLABLE,
      c.ORDINAL_POSITION
    FROM INFORMATION_SCHEMA.TABLES t
    JOIN INFORMATION_SCHEMA.COLUMNS c
      ON c.TABLE_NAME = t.TABLE_NAME AND c.TABLE_SCHEMA = t.TABLE_SCHEMA
    WHERE t.TABLE_TYPE = 'BASE TABLE'
    ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
  `);
  await pool.close();

  const tables = new Map();
  for (const row of result.recordset) {
    if (!tables.has(row.TABLE_NAME)) tables.set(row.TABLE_NAME, new Map());
    tables.get(row.TABLE_NAME).set(row.COLUMN_NAME, row);
  }
  return tables;
}

function typeString(row) {
  let t = row.DATA_TYPE;
  if (["varchar", "nvarchar", "char", "nchar"].includes(t)) {
    const len = row.CHARACTER_MAXIMUM_LENGTH;
    t += `(${len === -1 ? "MAX" : len})`;
  } else if (["decimal", "numeric"].includes(t)) {
    t += `(${row.NUMERIC_PRECISION},${row.NUMERIC_SCALE})`;
  }
  return t;
}

async function compareDb(dbName) {
  console.log(`\n${"=".repeat(70)}\nDATABASE: ${dbName}\n${"=".repeat(70)}`);

  const [sourceTables, targetTables] = await Promise.all([
    getSchema(buildConfig(SOURCE, dbName)),
    getSchema(buildConfig(TARGET, dbName))
  ]);

  const missingTables = [];
  const missingColumns = [];
  const typeMismatches = [];

  for (const [tableName, sourceCols] of sourceTables) {
    if (!targetTables.has(tableName)) {
      missingTables.push(tableName);
      continue;
    }
    const targetCols = targetTables.get(tableName);
    for (const [colName, sourceCol] of sourceCols) {
      if (!targetCols.has(colName)) {
        missingColumns.push({ table: tableName, column: colName, def: sourceCol });
      } else {
        const targetCol = targetCols.get(colName);
        const st = typeString(sourceCol);
        const tt = typeString(targetCol);
        if (st !== tt || sourceCol.IS_NULLABLE !== targetCol.IS_NULLABLE) {
          typeMismatches.push({ table: tableName, column: colName, source: st, target: tt });
        }
      }
    }
  }

  console.log(`\n-- Tables in source (2019) missing on target (SB): ${missingTables.length}`);
  for (const t of missingTables) console.log(`   MISSING TABLE: ${t}`);

  console.log(`\n-- Columns missing on target: ${missingColumns.length}`);
  for (const m of missingColumns) {
    console.log(`   ${m.table}.${m.column}  (${typeString(m.def)}, ${m.def.IS_NULLABLE === "YES" ? "NULL" : "NOT NULL"})`);
  }

  console.log(`\n-- Type/nullability mismatches: ${typeMismatches.length}`);
  for (const m of typeMismatches) {
    console.log(`   ${m.table}.${m.column}  source=${m.source}  target=${m.target}`);
  }

  return { missingTables, missingColumns, typeMismatches, sourceTables };
}

async function main() {
  const results = {};
  for (const dbName of ["Moifcore", "PaymentGateway"]) {
    try {
      results[dbName] = await compareDb(dbName);
    } catch (err) {
      console.error(`\nERROR comparing ${dbName}:`, err.message);
    }
  }

  const fs = await import("fs");
  fs.writeFileSync(
    "./scripts/schema-diff-output.json",
    JSON.stringify(results, (k, v) => (v instanceof Map ? Object.fromEntries(v) : v), 2)
  );
  console.log("\nFull diff written to backend/scripts/schema-diff-output.json");
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
