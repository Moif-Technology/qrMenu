// Generates CREATE TABLE / ALTER TABLE scripts to bring SB\SQLEXPRESS (target)
// up to date with MOIF\SQLEXPRESS2019 (source), for missing tables/columns only.
// Does NOT execute anything — writes .sql files for review.
import mssql from "mssql";
import fs from "fs";

const SOURCE = { server: "MOIF\\SQLEXPRESS2019", user: "sa", password: "motech" };

function buildConfig(base, database) {
  const [host, instanceName] = base.server.split("\\");
  return {
    user: base.user,
    password: base.password,
    server: host,
    database,
    options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true, instanceName },
    connectionTimeout: 15000,
    requestTimeout: 30000
  };
}

async function getTableDDL(pool, tableName) {
  // Column definitions for a full CREATE TABLE
  const cols = await pool.request().query(`
    SELECT c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH,
           c.NUMERIC_PRECISION, c.NUMERIC_SCALE, c.IS_NULLABLE, c.COLUMN_DEFAULT,
           c.ORDINAL_POSITION
    FROM INFORMATION_SCHEMA.COLUMNS c
    WHERE c.TABLE_NAME = '${tableName}'
    ORDER BY c.ORDINAL_POSITION
  `);

  const pk = await pool.request().query(`
    SELECT ku.COLUMN_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
      ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
    WHERE tc.TABLE_NAME = '${tableName}' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
  `);

  const identity = await pool.request().query(`
    SELECT ic.name AS COLUMN_NAME
    FROM sys.identity_columns ic
    JOIN sys.tables t ON ic.object_id = t.object_id
    WHERE t.name = '${tableName}'
  `);

  const identityCols = new Set(identity.recordset.map(r => r.COLUMN_NAME));
  const pkCols = pk.recordset.map(r => r.COLUMN_NAME);

  const colLines = cols.recordset.map(c => {
    let type = colType(c);
    const isIdentity = identityCols.has(c.COLUMN_NAME);
    const identityStr = isIdentity ? " IDENTITY(1,1)" : "";
    const nullStr = c.IS_NULLABLE === "YES" ? "NULL" : "NOT NULL";
    return `  [${c.COLUMN_NAME}] ${type}${identityStr} ${nullStr}`;
  });

  if (pkCols.length) {
    colLines.push(`  CONSTRAINT [PK_${tableName}] PRIMARY KEY (${pkCols.map(c => `[${c}]`).join(", ")})`);
  }

  return `CREATE TABLE [dbo].[${tableName}] (\n${colLines.join(",\n")}\n);`;
}

function colType(c) {
  const t = c.DATA_TYPE;
  if (["varchar", "char", "varbinary"].includes(t)) {
    return `${t}(${c.CHARACTER_MAXIMUM_LENGTH === -1 ? "MAX" : c.CHARACTER_MAXIMUM_LENGTH})`;
  }
  if (["nvarchar", "nchar"].includes(t)) {
    return `${t}(${c.CHARACTER_MAXIMUM_LENGTH === -1 ? "MAX" : c.CHARACTER_MAXIMUM_LENGTH})`;
  }
  if (["decimal", "numeric"].includes(t)) {
    return `${t}(${c.NUMERIC_PRECISION},${c.NUMERIC_SCALE})`;
  }
  return t;
}

async function main() {
  const diff = JSON.parse(fs.readFileSync("./scripts/schema-diff-output.json", "utf-8"));
  let sql = { Moifcore: [], PaymentGateway: [] };

  for (const dbName of ["Moifcore", "PaymentGateway"]) {
    const pool = await new mssql.ConnectionPool(buildConfig(SOURCE, dbName)).connect();
    const d = diff[dbName];

    sql[dbName].push(`-- ===== Sync script for ${dbName} (SB\\SQLEXPRESS target) =====`);
    sql[dbName].push(`-- Generated from MOIF\\SQLEXPRESS2019 source. REVIEW BEFORE RUNNING.\n`);

    for (const tableName of d.missingTables) {
      sql[dbName].push(`-- Missing table: ${tableName}`);
      const ddl = await getTableDDL(pool, tableName);
      sql[dbName].push(ddl + "\n");
    }

    for (const m of d.missingColumns) {
      const c = m.def;
      const type = colType(c);
      const nullStr = c.IS_NULLABLE === "YES" ? "NULL" : "NULL"; // add as nullable regardless, to avoid breaking existing rows
      sql[dbName].push(
        `-- Missing column: ${m.table}.${m.column}\n` +
        `ALTER TABLE [dbo].[${m.table}] ADD [${m.column}] ${type} ${nullStr};\n`
      );
    }

    for (const m of d.typeMismatches) {
      sql[dbName].push(
        `-- NOTE: ${m.table}.${m.column} nullability/type differs (source=${m.source} target=${m.target}). ` +
        `Review manually — not auto-altering existing NOT NULL columns.\n`
      );
    }

    await pool.close();
  }

  for (const dbName of ["Moifcore", "PaymentGateway"]) {
    const outPath = `./scripts/sync-${dbName}.sql`;
    fs.writeFileSync(outPath, sql[dbName].join("\n"));
    console.log(`Written: backend/scripts/sync-${dbName}.sql`);
  }
  process.exit(0);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
