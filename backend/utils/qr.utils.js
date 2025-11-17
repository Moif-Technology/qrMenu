// backend/utils/qr.utils.js
import "dotenv/config";
import crypto from "crypto";

function getSecret() {
  const s = process.env.QR_SECRET;
  if (!s) throw new Error("QR_SECRET is missing – set it in backend/.env");
  return s;
}

function sign(payload) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url")
    .slice(0, 22);
}

// Make opaque token for { table, area? }
export function makeToken(table, area = "DININ") {
  const payloadObj = { t: String(table), a: String(area) };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = sign(payload);
  return `${sig}.${payload}`;
}

// Validate and decode token
export function decodeToken(token) {
  const raw = decodeURIComponent(String(token || "").trim());
  const parts = raw.split(".");
  if (parts.length !== 2) throw new Error("Bad token format");
  const [sig, payload] = parts;

  const expected = sign(payload);
  if (sig !== expected) throw new Error("Invalid token signature");

  const obj = JSON.parse(Buffer.from(payload, "base64url").toString());
  const table = obj?.t;
  const area = obj?.a || "DININ";
  if (!table) throw new Error("Missing table");
  return { tableId: table, area };
}
