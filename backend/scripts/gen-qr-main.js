// backend/scripts/gen-qr-main.js
// Generates a QR code for the main menu URL (no table token).
// Run from backend folder: node scripts/gen-qr-main.js

import "dotenv/config";
import QRCode from "qrcode";

const FRONT = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || "http://192.168.0.34:5173";
const BASE_PATH = (process.env.RESTAURANT_BASE_PATH || "opaia").replace(/^\/|\/$/g, "") || "opaia";

const base = FRONT.replace(/\/$/, "");
const url = `${base}/${BASE_PATH}`;

console.log("Generating QR code for main menu URL:");
console.log("  Frontend URL:", FRONT);
console.log("  Main menu URL:", url);

const outputFile = "./qr_main_menu.png";
await QRCode.toFile(outputFile, url, { width: 512, margin: 1 });
console.log(`\n✅ Saved: ${outputFile}`);
