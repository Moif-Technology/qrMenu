// backend/services/settings.service.js
// Lightweight key/value app settings persisted in dbo.QrAppSettings.
// Two QR-menu feature switches live here:
//   OrderingEnabled : "1" | "0"        -> customers can order (all tables) vs menu-only
//   KotRouting      : "kitchen" | "counter"
//        kitchen -> KOT saved with KotStatus = 'HOLD'   (goes straight to kitchen)
//        counter -> KOT saved with KotStatus = 'SUBMIT' (goes to POS/counter to approve first)
import { query } from "../config/dbConfig.js";

const T_SETTINGS = "dbo.QrAppSettings";

const KEYS = {
  ORDERING_ENABLED: "OrderingEnabled",
  KOT_ROUTING: "KotRouting",
  CHEF_SPECIAL: "ChefSpecial",
};

const DEFAULTS = {
  orderingEnabled: false,
  kotRouting: "kitchen", // direct-to-kitchen by default (existing behaviour)
  chefSpecial: null,
};

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await query(`
    IF OBJECT_ID('${T_SETTINGS}', 'U') IS NULL
    BEGIN
      CREATE TABLE ${T_SETTINGS} (
        SettingKey   NVARCHAR(100) NOT NULL PRIMARY KEY,
        SettingValue NVARCHAR(500) NULL
      );
    END
    ELSE IF EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('${T_SETTINGS}') AND name = 'SettingValue' AND max_length <> -1
    )
    BEGIN
      -- Widen value column so JSON settings (e.g. ChefSpecial) fit comfortably.
      ALTER TABLE ${T_SETTINGS} ALTER COLUMN SettingValue NVARCHAR(MAX) NULL;
    END
  `);
  tableReady = true;
}

function normalizeKotRouting(v) {
  return String(v || "").trim().toLowerCase() === "counter" ? "counter" : "kitchen";
}

/**
 * Chef's Special of the Week — featured-dish spotlight stored as one JSON value.
 * Shape: { productIds: number[], title, titleAr, subtitle, subtitleAr, from, until }
 * Legacy single `productId` values are upgraded to a one-element array.
 * `null` (or missing/invalid) means the feature is off.
 */
function normalizeChefSpecial(v) {
  if (v == null) return null;
  const src = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  if (!src || typeof src !== "object") return null;

  const rawIds = Array.isArray(src.productIds)
    ? src.productIds
    : src.productId != null
    ? [src.productId]
    : [];
  const productIds = [...new Set(
    rawIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0)
  )].slice(0, 8); // hard cap so the banner stays a spotlight, not a category
  if (productIds.length === 0) return null;

  const str = (x, max = 200) => {
    const s = String(x ?? "").trim();
    return s ? s.slice(0, max) : "";
  };
  // Dates kept as YYYY-MM-DD strings; empty means open-ended.
  const date = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x ?? "").trim()) ? String(x).trim() : "");

  return {
    productIds,
    title: str(src.title) || "Chef's Special of the Week",
    titleAr: str(src.titleAr),
    subtitle: str(src.subtitle, 300),
    subtitleAr: str(src.subtitleAr, 300),
    from: date(src.from),
    until: date(src.until),
  };
}

/** Returns parsed settings with safe defaults applied. */
export async function getSettings() {
  await ensureTable();
  const rows = await query(`SELECT SettingKey, SettingValue FROM ${T_SETTINGS}`);
  const map = new Map(rows.map((r) => [r.SettingKey, r.SettingValue]));

  const orderingRaw = map.get(KEYS.ORDERING_ENABLED);
  const kotRaw = map.get(KEYS.KOT_ROUTING);
  const chefSpecialRaw = map.get(KEYS.CHEF_SPECIAL);

  return {
    orderingEnabled: orderingRaw == null ? DEFAULTS.orderingEnabled : String(orderingRaw) === "1",
    kotRouting: kotRaw == null ? DEFAULTS.kotRouting : normalizeKotRouting(kotRaw),
    chefSpecial: chefSpecialRaw == null ? DEFAULTS.chefSpecial : normalizeChefSpecial(chefSpecialRaw),
  };
}

async function upsert(key, value) {
  await query(
    `
    MERGE ${T_SETTINGS} AS target
    USING (SELECT @key AS SettingKey) AS src
      ON target.SettingKey = src.SettingKey
    WHEN MATCHED THEN UPDATE SET SettingValue = @value
    WHEN NOT MATCHED THEN INSERT (SettingKey, SettingValue) VALUES (@key, @value);
    `,
    { key, value }
  );
}

/** Update one or both settings; only provided fields are written. */
export async function updateSettings(patch = {}) {
  await ensureTable();

  if (patch.orderingEnabled !== undefined) {
    await upsert(KEYS.ORDERING_ENABLED, patch.orderingEnabled ? "1" : "0");
  }
  if (patch.kotRouting !== undefined) {
    await upsert(KEYS.KOT_ROUTING, normalizeKotRouting(patch.kotRouting));
  }
  if (patch.chefSpecial !== undefined) {
    // null clears the feature; otherwise store the sanitized JSON.
    const normalized = normalizeChefSpecial(patch.chefSpecial);
    await upsert(KEYS.CHEF_SPECIAL, normalized ? JSON.stringify(normalized) : null);
  }

  return getSettings();
}
