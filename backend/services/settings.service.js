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
};

const DEFAULTS = {
  orderingEnabled: false,
  kotRouting: "kitchen", // direct-to-kitchen by default (existing behaviour)
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
  `);
  tableReady = true;
}

function normalizeKotRouting(v) {
  return String(v || "").trim().toLowerCase() === "counter" ? "counter" : "kitchen";
}

/** Returns parsed settings with safe defaults applied. */
export async function getSettings() {
  await ensureTable();
  const rows = await query(`SELECT SettingKey, SettingValue FROM ${T_SETTINGS}`);
  const map = new Map(rows.map((r) => [r.SettingKey, r.SettingValue]));

  const orderingRaw = map.get(KEYS.ORDERING_ENABLED);
  const kotRaw = map.get(KEYS.KOT_ROUTING);

  return {
    orderingEnabled: orderingRaw == null ? DEFAULTS.orderingEnabled : String(orderingRaw) === "1",
    kotRouting: kotRaw == null ? DEFAULTS.kotRouting : normalizeKotRouting(kotRaw),
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

  return getSettings();
}
