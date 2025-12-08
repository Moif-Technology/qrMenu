import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { closeDb, connectToDb, pingDb, closePaymentDb, connectToPaymentDb, pingPaymentDb } from "./config/dbConfig.js";
import kotSaveRoutes from "./routes/kotSave.routes.js";
import menuRoutes from "./routes/menu.routes.js";
import modifierRoutes from "./routes/modifier.routes.js"
import tableRoutes from "./routes/table.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import telrRoutes from "./telr.routes.js";
const app = express();
const PORT = process.env.PORT || 5001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

// Rate limiting configuration
// General API rate limiter: 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 100,
  message: { ok: false, error: "Too many requests, please try again later." },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

// Stricter limit for payment endpoints: 100 requests per 5 minutes per IP
// Using shorter window (5 min) to allow more frequent payment attempts
// Increased limit to handle payment callbacks and retries
const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes (shorter window)
  max: process.env.RATE_LIMIT_PAYMENT_MAX ? Number(process.env.RATE_LIMIT_PAYMENT_MAX) : 100, // Increased from 20 to 100
  message: { ok: false, error: "Too many payment requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for read-only endpoints
  skip: (req) => {
    // Allow read-only payment queries without rate limiting
    return req.method === 'GET' && (
      req.path.includes('/balance/') || 
      req.path.includes('/paid-items/') ||
      req.path.includes('/methods')
    );
  },
});

// Apply rate limiting to API routes
app.use("/api", apiLimiter);
app.use("/api/payment", paymentLimiter);

// 🔎 request logger
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
}); // nodemon restart trigger

// Boot-time DB connect
(async () => {
  try {
    await connectToDb();
    console.log("[DB] Inventory database connection established");
  } catch (err) {
    console.error("[DB] Initial Inventory connection failed:", err?.message || err);
  }
  
  try {
    await connectToPaymentDb();
    console.log("[DB] PaymentGateway database connection established");
  } catch (err) {
    console.error("[DB] Initial PaymentGateway connection failed:", err?.message || err);
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

// API routes
app.use("/api/menu", menuRoutes);
app.use("/api/pos", kotSaveRoutes); 
app.use("/api/modifier",modifierRoutes);
app.use("/api", tableRoutes);
app.use("/api", paymentRoutes);
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
  server.close(async () => {
    try { 
      await closeDb?.(); 
      console.log("[DB] Inventory pool closed."); 
    }
    catch (e) { 
      console.error("[DB] Inventory close error:", e?.message || e); 
    }
    
    try { 
      await closePaymentDb?.(); 
      console.log("[DB] PaymentGateway pool closed."); 
    }
    catch (e) { 
      console.error("[DB] PaymentGateway close error:", e?.message || e); 
    }
    
    finally { process.exit(0); }
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
