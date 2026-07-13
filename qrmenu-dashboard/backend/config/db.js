// qrmenu-dashboard/backend/config/db.js
// Connects to the same PaymentGateway database the main qrMenu backend writes to.
import mssql from "mssql";

if (!process.env.DB_PASSWORD) {
  console.error("[DASH:DB] DB_PASSWORD is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const baseConfig = {
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || "MOIF\\SQLEXPRESS",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME || "PaymentGateway",
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    enableArithAbort: true,
    trustServerCertificate:
      process.env.DB_TRUST_CERT === undefined
        ? true
        : process.env.DB_TRUST_CERT === "true"
  },
  pool: {
    max: process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : 20,
    min: process.env.DB_POOL_MIN ? Number(process.env.DB_POOL_MIN) : 2,
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
    delete conf.port;
  }
  return conf;
}

const dbConfig = buildMssqlConfig(baseConfig);

let poolPromise = null;

export async function connectToDb() {
  if (!poolPromise) {
    const pool = new mssql.ConnectionPool(dbConfig);
    poolPromise = pool.connect()
      .then((p) => {
        console.log("[DASH:DB] Connected to", dbConfig.database);
        return p;
      })
      .catch((err) => {
        poolPromise = null;
        console.error("[DASH:DB] Connection failed:", err?.message || err);
        throw err;
      });
  }
  return poolPromise;
}

export async function query(sqlText, params = {}) {
  const pool = await connectToDb();
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) {
    if (v && typeof v === "object" && "type" in v) {
      req.input(k, v.type, v.value);
    } else {
      req.input(k, v);
    }
  }
  const result = await req.query(sqlText);
  return result.recordset;
}

export { mssql };
