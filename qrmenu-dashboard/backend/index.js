// qrmenu-dashboard/backend/index.js
// DeynoQR payout tracker API.
// Reads the same PaymentGateway database the main qrMenu backend writes to.
import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import transactionsRoutes from "./routes/transactions.routes.js";
import payoutsRoutes from "./routes/payouts.routes.js";
import restaurantsRoutes from "./routes/restaurants.routes.js";
import methodsRoutes from "./routes/methods.routes.js";
import { connectToDb } from "./config/db.js";

const app = express();
const PORT = process.env.DASHBOARD_PORT || 5002;

app.use(cors({ origin: process.env.DASHBOARD_CORS_ORIGIN || true }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "qrmenu-dashboard" }));

app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/payouts", payoutsRoutes);
app.use("/api/restaurants", restaurantsRoutes);
app.use("/api/methods", methodsRoutes);

app.use((req, res) => res.status(404).json({ ok: false, error: "Not found" }));

app.listen(PORT, async () => {
  console.log(`[DASH] Payout tracker API listening on port ${PORT}`);
  try {
    await connectToDb();
  } catch {
    console.error("[DASH] DB not reachable at startup — will retry on first request.");
  }
});
