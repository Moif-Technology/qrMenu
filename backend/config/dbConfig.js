// backend/config/dbconfig.js
import mssql from "mssql";

// ---- DIRECT CONFIG (env-driven; defaults kept for local dev) ----
const baseConfig = {
  user: process.env.DB_USER || "sa",
  // password: process.env.DB_PASSWORD || "gtarc",
  password: process.env.DB_PASSWORD || "motech",
  server: process.env.DB_SERVER || "MOIF\\SQLEXPRESS",
  // server: process.env.DB_SERVER || "INVENTPOS\\SQLEXPRESS",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    enableArithAbort: true,
    trustServerCertificate:
      process.env.DB_TRUST_CERT === undefined
        ? true
        : process.env.DB_TRUST_CERT === "true"
  },
  pool: {
    max: process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : 50,  // Increased from 10 to 50 for better concurrency
    min: process.env.DB_POOL_MIN ? Number(process.env.DB_POOL_MIN) : 5,    // Keep 5 connections warm
    idleTimeoutMillis: process.env.DB_POOL_IDLE
      ? Number(process.env.DB_POOL_IDLE)
      : 30000
  }
};

function buildMssqlConfig(cfg) {
  const conf = { ...cfg, options: { ...cfg.options } };
  if (conf.server && conf.server.includes("\\")) {
    const [host, instanceName] = conf.server.split("\\");
    conf.server = host;
    conf.options.instanceName = instanceName;
    delete conf.port; // avoid port when using instanceName
  }
  return conf;
}

// ---- Inventory Database Config ----
const inventoryDbConfig = buildMssqlConfig({
  ...baseConfig,
  database: "Moifcore"
});

// ---- PaymentGateway Database Config ----
const paymentGatewayDbConfig = buildMssqlConfig({
  ...baseConfig,
  database: "PaymentGateway"
});

// ---- Inventory Database Pool ----
let inventoryPoolPromise = null;

export async function connectToDb() {
  if (!inventoryPoolPromise) {
    const pool = new mssql.ConnectionPool(inventoryDbConfig);
    inventoryPoolPromise = pool.connect()
      .then((p) => {
        console.log("[DB] ✅ Connected to Inventory database");
        return p;
      })
      .catch((err) => { 
        inventoryPoolPromise = null; 
        console.error("[DB] ❌ Failed to connect to Inventory database:", err?.message || err);
        throw err; 
      });
  }
  return inventoryPoolPromise;
}

export async function closeDb() {
  if (inventoryPoolPromise) {
    const pool = await inventoryPoolPromise;
    await pool.close();
    inventoryPoolPromise = null;
    console.log("[DB] Inventory database connection closed");
  }
}

export async function query(sqlText, params = {}) {
  const pool = await connectToDb();
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  const result = await req.query(sqlText);
  return result.recordset;
}

export async function pingDb() {
  const rows = await query("SELECT DB_NAME() AS db");
  return { db: rows?.[0]?.db || null };
}

// ---- PaymentGateway Database Pool ----
let paymentGatewayPoolPromise = null;

export async function connectToPaymentDb() {
  if (!paymentGatewayPoolPromise) {
    const pool = new mssql.ConnectionPool(paymentGatewayDbConfig);
    paymentGatewayPoolPromise = pool.connect()
      .then((p) => {
        console.log("[DB] ✅ Connected to PaymentGateway database");
        return p;
      })
      .catch((err) => { 
        paymentGatewayPoolPromise = null; 
        console.error("[DB] ❌ Failed to connect to PaymentGateway database:", err?.message || err);
        throw err; 
      });
  }
  return paymentGatewayPoolPromise;
}

export async function closePaymentDb() {
  if (paymentGatewayPoolPromise) {
    const pool = await paymentGatewayPoolPromise;
    await pool.close();
    paymentGatewayPoolPromise = null;
    console.log("[DB] PaymentGateway database connection closed");
  }
}

export async function queryPaymentDb(sqlText, params = {}) {
  const pool = await connectToPaymentDb();
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  const result = await req.query(sqlText);
  return result.recordset;
}

export async function pingPaymentDb() {
  const rows = await queryPaymentDb("SELECT DB_NAME() AS db");
  return { db: rows?.[0]?.db || null };
}

// Export database names for logging purposes
export const INVENTORY_DB_NAME = inventoryDbConfig.database;
export const PAYMENT_DB_NAME = paymentGatewayDbConfig.database;
