// backend/scripts/gen-qr-103.js
import "dotenv/config";
import QRCode from "qrcode";
import { makeToken } from "../utils/qr.utils.js";

// Get frontend URL from environment variable, with fallback for development
// For production, set FRONTEND_URL in .env file
// Example: FRONTEND_URL=https://yourdomain.com
const FRONT = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || "http://192.168.0.34:5173";
// Restaurant base path (e.g. opaia) – must match frontend RESTAURANT_BASE_PATH
const BASE_PATH = (process.env.RESTAURANT_BASE_PATH || "opaia").replace(/^\/|\/$/g, "") || "opaia";

// Table ID and area - can be passed as command line args or set in env
// Usage: node scripts/gen-qr-103.js [tableId] [area]
const tableId = process.argv[2] || process.env.TABLE_ID || "2";
const area = process.argv[3] || process.env.TABLE_AREA || "DININ";

const token = makeToken(tableId, area);
const base = FRONT.replace(/\/$/, "");
const url = `${base}/${BASE_PATH}/r/${token}`;

console.log("Generating QR code for:");
console.log("  Table ID:", tableId);
console.log("  Area:", area);
console.log("  Frontend URL:", FRONT);
console.log("  Full URL:", url);

const outputFile = `./qr_table_${tableId}.png`;
await QRCode.toFile(outputFile, url, { width: 512, margin: 1 });
console.log(`\n✅ Saved: ${outputFile}`);
