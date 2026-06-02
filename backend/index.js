import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { closeDb, closePaymentDb, connectToDb, connectToPaymentDb, INVENTORY_DB_NAME, PAYMENT_DB_NAME, pingDb, pingPaymentDb } from "./config/dbConfig.js";
import floorLayoutRoutes from "./routes/floorLayout.routes.js";
import kotSaveRoutes from "./routes/kotSave.routes.js";
import menuRoutes from "./routes/menu.routes.js";
import modifierRoutes from "./routes/modifier.routes.js";
import packageRoutes from "./routes/package.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import qrRoutes from "./routes/qr.routes.js";
import qrMenuRoutes from "./routes/qrMenu.routes.js";
import reservationRoutes from "./routes/reservation.routes.js";
import tableRoutes from "./routes/table.routes.js";
import waitlistRoutes from "./routes/waitlist.routes.js";
import { getAutoMigrationStatus, startAutoMigration, stopAutoMigration } from "./services/imageAutoMigration.service.js";
import telrRoutes from "./telr.routes.js";
const app = express();
const PORT = process.env.PORT || 5001;
const isDevelopment = process.env.NODE_ENV !== "production";

if (!isDevelopment) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
}

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const publicReadPaths = new Set([
  "/menu/group",
  "/menu/items",
  "/menu/areas",
  "/menu/images/mapping",
  "/qr-menu/categories",
  "/qr-menu/menu-items",
]);

const isPublicMenuRead = (req) => {
  return req.method === "GET" && publicReadPaths.has(req.path);
};

const isCustomerSessionRead = (req) => {
  return req.method === "POST" && req.path === "/r/resolve";
};

// In production, only the actual frontend domain is allowed.
// In development, all origins are allowed so local testing works.
const CORS_ORIGIN = process.env.CORS_ORIGIN
  || (isDevelopment ? "*" : (process.env.FRONTEND_URL || null));

app.use(cors({
  origin: CORS_ORIGIN,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "10mb" }));
// Rate limiting configuration
// DISABLED in development - React Strict Mode causes double API calls
// Only enabled in production for security

// Create a no-op middleware for development (no rate limiting)
const noOpLimiter = (req, res, next) => next();

// Production rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Math.max(parsePositiveInt(process.env.RATE_LIMIT_MAX, 1000), 1000),
  message: { ok: false, error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path === "/health"
      || req.path === "/health/db"
      || req.path.startsWith("/payment")
      || isCustomerSessionRead(req)
      || isPublicMenuRead(req);
  }
});

const publicMenuReadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parsePositiveInt(process.env.RATE_LIMIT_PUBLIC_MENU_MAX, 1200),
  message: { ok: false, error: "Menu is busy. Please try again in a moment." },
  standardHeaders: true,
  legacyHeaders: false,
});

const customerSessionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parsePositiveInt(process.env.RATE_LIMIT_CUSTOMER_SESSION_MAX, 300),
  message: { ok: false, error: "Session is refreshing too often. Please wait a moment." },
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: Math.max(parsePositiveInt(process.env.RATE_LIMIT_PAYMENT_MAX, 100), 100),
  message: { ok: false, error: "Too many payment requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.method === 'GET' && (
      req.path.includes('/balance/') || 
      req.path.includes('/paid-items/') ||
      req.path.includes('/methods')
    );
  },
});

 // Apply rate limiting.
// Explicitly set NODE_ENV=development to disable. Any other value (including
// unset / empty) defaults to ENABLED so production servers are always protected.
if (process.env.NODE_ENV === "development") {
  console.log("[RATE LIMIT] DISABLED — NODE_ENV=development");
  app.use("/api/menu/images/mapping", noOpLimiter);
  app.use("/api/menu/group", noOpLimiter);
  app.use("/api/menu/items", noOpLimiter);
  app.use("/api/menu/areas", noOpLimiter);
  app.use("/api/qr-menu/categories", noOpLimiter);
  app.use("/api/qr-menu/menu-items", noOpLimiter);
  app.use("/api/r/resolve", noOpLimiter);
  app.use("/api/payment", noOpLimiter);
  app.use("/api", noOpLimiter);
} else {
  console.log("[RATE LIMIT] ENABLED — NODE_ENV:", process.env.NODE_ENV || "(not set, defaulting to production rules)");
  app.use("/api/menu/images/mapping", publicMenuReadLimiter);
  app.use("/api/menu/group", publicMenuReadLimiter);
  app.use("/api/menu/items", publicMenuReadLimiter);
  app.use("/api/menu/areas", publicMenuReadLimiter);
  app.use("/api/qr-menu/categories", publicMenuReadLimiter);
  app.use("/api/qr-menu/menu-items", publicMenuReadLimiter);
  app.use("/api/r/resolve", customerSessionLimiter);
  app.use("/api/payment", paymentLimiter);
  app.use("/api", apiLimiter);
}




// 🔎 request logger
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
}); // nodemon restart trigger

// Boot-time DB connect
(async () => {
  try {
    await connectToDb();
    console.log(`[DB] ${INVENTORY_DB_NAME} database connection established`);
  } catch (err) {
    console.error(`[DB] Initial ${INVENTORY_DB_NAME} connection failed:`, err?.message || err);
  }
  
  try {
    await connectToPaymentDb();
    console.log(`[DB] ${PAYMENT_DB_NAME} database connection established`);
  } catch (err) {
    console.error(`[DB] Initial ${PAYMENT_DB_NAME} connection failed:`, err?.message || err);
  }

  // Start auto-migration service after DB connections are established
  try {
    startAutoMigration();
    console.log(`[AUTO-MIGRATION] ✅ Auto-migration service started`);
  } catch (err) {
    console.error(`[AUTO-MIGRATION] ❌ Failed to start auto-migration service:`, err?.message || err);
  }
})();

// Health
app.get("/api/health", async (_req, res) => {
  try {
    const inventoryInfo = await pingDb(); // { db: "Inventory" }
    const paymentInfo = await pingPaymentDb(); // { db: "PaymentGateway" }
    res.json({ 
      ok: true, 
      databases: {
        inventory: inventoryInfo.db,
        paymentGateway: paymentInfo.db
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Database pool status endpoint (for monitoring)
app.get("/api/health/db", async (_req, res) => {
  try {
    const inventoryPool = await connectToDb();
    const paymentPool = await connectToPaymentDb();
    
    res.json({
      ok: true,
      inventory: {
        total: inventoryPool.totalCount || 0,
        idle: inventoryPool.idleCount || 0,
        waiting: inventoryPool.pending || 0
      },
      paymentGateway: {
        total: paymentPool.totalCount || 0,
        idle: paymentPool.idleCount || 0,
        waiting: paymentPool.pending || 0
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Auto-migration service status endpoint
app.get("/api/health/auto-migration", async (_req, res) => {
  try {
    const status = getAutoMigrationStatus();
    res.json({
      ok: true,
      autoMigration: status
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// API routes
app.use("/api/menu", menuRoutes);
app.use("/api/qr-menu", qrMenuRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/pos", kotSaveRoutes); 
app.use("/api/modifier",modifierRoutes);
app.use("/api", tableRoutes);
app.use("/api", paymentRoutes);
app.use("/api", reservationRoutes);
app.use("/api", waitlistRoutes);
app.use("/api", qrRoutes);
app.use("/api/floor-layout", floorLayoutRoutes);
app.use(telrRoutes);
// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Not found: ${req.method} ${req.originalUrl}` });
});

// Central error handler
app.use((err, _req, res, _next) => {
  console.error("[ERR]", err?.stack || err);
  const msg =
    err?.originalError?.info?.message ||
    err?.precedingErrors?.[0]?.message ||
    err?.message || "Internal error";
  res.status(500).json({ ok: false, error: msg });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running at http://0.0.0.0:${PORT}`);
});


// Graceful shutdown
function shutdown(signal) {
  console.log(`[SYS] ${signal} received. Shutting down...`);
  
  // Stop auto-migration service
  try {
    stopAutoMigration();
    console.log(`[AUTO-MIGRATION] Service stopped`);
  } catch (e) {
    console.error(`[AUTO-MIGRATION] Stop error:`, e?.message || e);
  }
  
  server.close(async () => {
    try { 
      await closeDb?.(); 
      console.log(`[DB] ${INVENTORY_DB_NAME} pool closed.`); 
    }
    catch (e) { 
      console.error(`[DB] ${INVENTORY_DB_NAME} close error:`, e?.message || e); 
    }
    
    try { 
      await closePaymentDb?.(); 
      console.log(`[DB] ${PAYMENT_DB_NAME} pool closed.`); 
    }
    catch (e) { 
      console.error(`[DB] ${PAYMENT_DB_NAME} close error:`, e?.message || e); 
    }
    
    finally { process.exit(0); }
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
