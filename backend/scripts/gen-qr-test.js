// backend/scripts/gen-qr-test.js
// Generates a DEFAULT TEST QR code (order-taking / send-to-kitchen mode).
// The ?order=1 flag unlocks add-to-cart + send-to-kitchen (see frontend/src/lib/orderMode.js).
// Uses the REAL public domain by default (not the local dev IP) so the link is shareable.
//
// Usage: node scripts/gen-qr-test.js [tableId] [area]
// Defaults: tableId=200, area="RIGHT OUT DOOR"

import "dotenv/config";
import QRCode from "qrcode";
import { makeToken } from "../utils/qr.utils.js";

// Real public frontend domain. Override with PUBLIC_FRONTEND_URL or FRONTEND_URL if needed.
const FRONT = process.env.PUBLIC_FRONTEND_URL || "https://deynoqr.com";
// Restaurant base path (e.g. opaia) – must match frontend RESTAURANT_BASE_PATH
const BASE_PATH = (process.env.RESTAURANT_BASE_PATH || "opaia").replace(/^\/|\/$/g, "") || "opaia";

// Default test table.
const tableId = process.argv[2] || process.env.TABLE_ID || "200";
const area = process.argv[3] || process.env.TABLE_AREA || "RIGHT OUT DOOR";

const token = makeToken(tableId, area);
const base = FRONT.replace(/\/$/, "");
// ?order=1 -> menu + bill + add-to-cart + send-to-kitchen (testing order taking)
const url = `${base}/${BASE_PATH}/r/${token}?order=1`;

console.log("Generating DEFAULT TEST QR code (order-taking mode):");
console.log("  Table ID:", tableId);
console.log("  Area:", area);
console.log("  Frontend URL:", FRONT);
console.log("  Full URL:", url);

const outputFile = `./qr_test_table_${tableId}.png`;
await QRCode.toFile(outputFile, url, { width: 512, margin: 1 });
console.log(`\n✅ Saved: ${outputFile}`);
