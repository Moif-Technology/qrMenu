import mssql from "mssql";
import fs from "fs";

const TARGET_BASE = { server: "SB\\SQLEXPRESS", user: "sa", password: "gtarc" };

function buildConfig(database) {
  const [host, instanceName] = TARGET_BASE.server.split("\\");
  return {
    user: TARGET_BASE.user,
    password: TARGET_BASE.password,
    server: host,
    database,
    options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true, instanceName },
    connectionTimeout: 15000,
    requestTimeout: 30000
  };
}

async function runFile(dbName, filePath) {
  const sql = fs.readFileSync(filePath, "utf-8");
  const batches = sql.split(/\n(?=CREATE TABLE|ALTER TABLE|UPDATE )/i).filter(b => b.trim());
  const pool = await new mssql.ConnectionPool(buildConfig(dbName)).connect();
  console.log(`\n== Running ${filePath} against ${dbName} ==`);
  for (const batch of batches) {
    const stripped = batch.replace(/--.*$/gm, "").trim();
    if (!stripped) continue;
    try {
      await pool.request().query(stripped);
      const firstLine = stripped.split("\n")[0].slice(0, 80);
      console.log(`OK: ${firstLine}`);
    } catch (err) {
      console.error(`FAILED batch:\n${stripped}\nERROR: ${err.message}`);
      throw err;
    }
  }
  await pool.close();
}

async function main() {
  await runFile("Moifcore", "./scripts/sync-Moifcore.sql");
  await runFile("PaymentGateway", "./scripts/sync-PaymentGateway.sql");
  console.log("\nAll sync scripts applied successfully.");
  process.exit(0);
}

main().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
