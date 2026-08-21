// backend/services/whatsapp.service.js
//
// Drives WhatsApp Web through whatsapp-web.js (a headless Chromium session
// logged in as the restaurant's own number) so the admin console can send
// messages without a Meta Business API account.
//
// Two things to know before touching this file:
//
//   1. This is unofficial automation. WhatsApp's terms do not permit it, and a
//      number that draws blocks/reports can be banned. The throttle below is
//      not decoration - it is the only thing standing between "send to my
//      guest list" and "burn the restaurant's number".
//
//   2. The client is a process-wide singleton holding a real browser. Never
//      construct a second one; go through startClient().

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { normalizeMobileForUae } from "./messagecentral.service.js";

// whatsapp-web.js is loaded on demand, NEVER at module scope.
//
// It drags in puppeteer and a ~300MB Chromium, so it is routinely absent on a
// host where `npm install` could not complete it. A static ESM import of a
// missing package throws while the module graph is being built, which kills
// the entire API process at boot - that took production down with 502s on
// every route (menu, settings, payments) because of an admin-only feature
// nobody was even using. Keep this dynamic.
let waModulePromise = null;

async function loadWhatsAppWeb() {
  if (!waModulePromise) {
    waModulePromise = import("whatsapp-web.js")
      .then((mod) => mod.default ?? mod)
      .catch((e) => {
        waModulePromise = null; // let a later attempt retry after an install
        console.error("[WA] whatsapp-web.js unavailable:", e?.message || e);
        const err = new Error(
          "WhatsApp support is not installed on this server. Run `npm install` in backend/ " +
            "- it downloads a ~300MB Chromium, which some shared hosts cannot run."
        );
        err.statusCode = 503;
        throw err;
      });
  }
  return waModulePromise;
}

// Offer posters ride along as base64 in the send request - WhatsApp takes the
// bytes directly, so there is no upload step and nothing to store. The caps
// exist because this is a trust boundary: the payload is whatever the browser
// posted, and express is holding all of it in memory.
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB; base64 inflates ~33%, express caps at 10mb

const COUNTRY_CODE = process.env.MC_COUNTRY_CODE || "971";
const SESSION_PATH = process.env.WA_SESSION_PATH || "./.wwebjs_auth";

// Ban-avoidance knobs. Defaults are deliberately conservative.
export const HOURLY_LIMIT = Math.max(1, Number(process.env.WA_HOURLY_LIMIT) || 10);
// Server-side floor between two sends. The UI paces itself far slower than
// this; the floor only exists so a bug or a retry storm cannot machine-gun.
const MIN_GAP_MS = Math.max(0, Number(process.env.WA_MIN_GAP_MS) || 5000);

// ---- connection state -------------------------------------------------

export const STATES = {
  DISCONNECTED: "DISCONNECTED", // no client running
  STARTING: "STARTING",         // booting Chromium
  QR: "QR",                     // waiting for a phone to scan
  READY: "READY",               // logged in, can send
  AUTH_FAILED: "AUTH_FAILED",
};

let client = null;
let state = STATES.DISCONNECTED;
let qrDataUrl = null;   // latest QR as a data: URL, or null
let meNumber = null;    // the logged-in number, once known
let lastError = null;
let lastSentAt = 0;     // epoch ms of the last successful send

function setState(next, extra = {}) {
  state = next;
  if ("qr" in extra) qrDataUrl = extra.qr;
  if ("me" in extra) meNumber = extra.me;
  if ("error" in extra) lastError = extra.error;
  console.log("[WA] state -> " + next + (extra.error ? " (" + extra.error + ")" : ""));
}

// ---- browser cleanup --------------------------------------------------
//
// Chromium locks its profile directory. If a browser is left running - the
// phone unlinks the device, the client throws during boot, the backend is
// killed with Ctrl+C - the next launch dies with "The browser is already
// running for <userDataDir>". Nothing recovers on its own, so connecting
// sweeps first.

const sessionAbsPath = path.resolve(SESSION_PATH);

/**
 * Kill Chromium processes still holding OUR profile directory.
 *
 * Deliberately narrow: a process must be running from the puppeteer download
 * cache AND have our session path on its command line. Matching on the name
 * "chrome.exe" alone would kill the operator's personal browser, which is a
 * far worse outcome than a stale lock.
 */
function killOrphanBrowsers() {
  let procs = [];
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
            "Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress",
        ],
        { encoding: "utf8", timeout: 15000, windowsHide: true }
      );
      const parsed = JSON.parse(out || "[]");
      procs = (Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({
        pid: p.ProcessId,
        exe: p.ExecutablePath || "",
        cmd: p.CommandLine || "",
      }));
    } else {
      const out = execFileSync("ps", ["-eo", "pid=,command="], {
        encoding: "utf8",
        timeout: 15000,
      });
      procs = out
        .split("\n")
        .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
        .filter(Boolean)
        .map((m) => ({ pid: Number(m[1]), exe: m[2], cmd: m[2] }));
    }
  } catch (e) {
    console.warn("[WA] could not list processes:", e?.message || e);
    return 0;
  }

  const isOurs = (p) =>
    p.cmd.includes(sessionAbsPath) && /[\\/]\.cache[\\/]puppeteer[\\/]/.test(p.exe + p.cmd);

  let killed = 0;
  for (const p of procs.filter(isOurs)) {
    try {
      process.kill(p.pid, "SIGKILL");
      killed++;
    } catch {
      /* already gone, or not ours to kill */
    }
  }
  if (killed) console.log("[WA] killed " + killed + " orphaned browser process(es)");
  return killed;
}

/** Drop the profile lock Chromium leaves behind when it dies badly. */
function clearProfileLock() {
  for (const name of ["lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    const target = path.join(sessionAbsPath, "session", name);
    try {
      fs.rmSync(target, { force: true, recursive: true });
    } catch {
      /* nothing there, or held by something we already killed */
    }
  }
}

/**
 * Put the service back to a state where connecting can succeed.
 *
 * wipeSession also deletes the cached WhatsApp login, which is what switching
 * to a different phone number requires - otherwise LocalAuth silently restores
 * the previous account.
 */
export async function resetClient({ wipeSession = false } = {}) {
  const stale = client;
  client = null;

  if (stale) {
    try {
      await stale.destroy();
    } catch (e) {
      console.warn("[WA] destroy during reset failed:", e?.message || e);
    }
  }

  killOrphanBrowsers();
  clearProfileLock();

  if (wipeSession) {
    try {
      fs.rmSync(sessionAbsPath, { force: true, recursive: true });
      console.log("[WA] wiped cached session at " + sessionAbsPath);
    } catch (e) {
      console.warn("[WA] session wipe failed:", e?.message || e);
    }
  }

  setState(STATES.DISCONNECTED, { qr: null, me: null, error: null });
  return { ok: true, wiped: wipeSession };
}

/**
 * Boot the WhatsApp Web client if it is not already running.
 * Returns immediately; poll getStatus() for the QR and READY transitions.
 */
export async function startClient() {
  if (client) return { ok: true, state };

  setState(STATES.STARTING, { qr: null, error: null });

  // Resolved here rather than at import time - see loadWhatsAppWeb().
  let Client;
  let LocalAuth;
  try {
    ({ Client, LocalAuth } = await loadWhatsAppWeb());
  } catch (e) {
    setState(STATES.DISCONNECTED, { qr: null, error: e.message });
    throw e;
  }

  // Self-heal: clear anything still holding the profile before launching, so a
  // previous crash or an unlinked device does not permanently wedge the
  // feature behind "browser is already running".
  killOrphanBrowsers();
  clearProfileLock();

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });

  client.on("qr", async (qr) => {
    try {
      const url = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      setState(STATES.QR, { qr: url });
    } catch (e) {
      console.error("[WA] QR render failed:", e?.message || e);
    }
  });

  client.on("ready", () => {
    const me = client?.info?.wid?.user || null;
    setState(STATES.READY, { qr: null, me, error: null });
  });

  client.on("auth_failure", (msg) => {
    setState(STATES.AUTH_FAILED, { qr: null, error: String(msg || "auth failure") });
  });

  client.on("disconnected", (reason) => {
    console.warn("[WA] disconnected:", reason);
    // Unlinking the device from the phone fires this, but leaves Chromium
    // running and still holding the profile lock. Tearing it down here is what
    // stops the next connect from failing with "browser is already running".
    const stale = client;
    client = null;
    setState(STATES.DISCONNECTED, { qr: null, me: null, error: String(reason || "") });
    Promise.resolve()
      .then(() => stale?.destroy())
      .catch((e) => console.warn("[WA] destroy after disconnect failed:", e?.message || e))
      .finally(() => {
        killOrphanBrowsers();
        clearProfileLock();
      });
  });

  client.initialize().catch((e) => {
    const msg = e?.message || "initialize failed";
    console.error("[WA] initialize failed:", msg);
    const stale = client;
    client = null;
    // A half-launched client can still have spawned a browser. Clean up rather
    // than leaving the profile locked for every later attempt.
    Promise.resolve()
      .then(() => stale?.destroy())
      .catch(() => {})
      .finally(() => {
        killOrphanBrowsers();
        clearProfileLock();
      });
    setState(STATES.DISCONNECTED, { qr: null, error: msg });
  });

  return { ok: true, state };
}

/**
 * Log out and wipe the stored session. Next connect needs a fresh QR scan.
 *
 * Falls through to resetClient() either way so a logout on an already-broken
 * client still leaves the profile usable.
 */
export async function logoutClient() {
  if (client) {
    try {
      await client.logout();
    } catch (e) {
      console.warn("[WA] logout error (continuing):", e?.message || e);
    }
  }
  return resetClient({ wipeSession: true });
}

export function getStatus() {
  return {
    state,
    qr: state === STATES.QR ? qrDataUrl : null,
    me: meNumber,
    error: lastError,
    hourlyLimit: HOURLY_LIMIT,
  };
}

// ---- phone handling ---------------------------------------------------

/**
 * Turn whatever the POS stored into a WhatsApp chat id.
 *
 * normalizeMobileForUae() returns the LOCAL part only (MessageCentral takes the
 * country code as its own parameter), so the country code goes back on here.
 * '055 123 4567', '+971501234567' and '00971501234567' all land on one id.
 */
export function toWhatsAppId(phone) {
  const local = normalizeMobileForUae(phone);
  if (!local || !/^\d{6,15}$/.test(local)) return null;
  return COUNTRY_CODE + local + "@c.us";
}

// ---- send log ---------------------------------------------------------
//
// ponytail: in-memory only, no table. database_scripts/11_CREATE_WhatsAppLog.sql
// holds the durable version for when this stops being a demo. The cost of
// staying in memory is real, not cosmetic: a backend restart forgets the
// hourly count, so the rate guard starts from zero again. Swap to the table
// before this is trusted to protect the number unattended.

const MAX_LOG = 500; // trims oldest; only the trailing hour drives the guard
const sendLog = [];

function logSend(entry) {
  sendLog.unshift({ ...entry, sentAt: new Date().toISOString() });
  if (sendLog.length > MAX_LOG) sendLog.length = MAX_LOG;
}

/** Recent sends, newest first. */
export function getSendLog(limit = 100) {
  return sendLog.slice(0, Math.max(1, limit));
}

/** When we last messaged each customer id, for the picker's "Last messaged". */
export function getLastMessagedMap() {
  const map = {};
  for (const e of sendLog) {
    if (e.status !== "SENT" || e.customerId == null) continue;
    if (!map[e.customerId]) map[e.customerId] = e.sentAt; // log is newest-first
  }
  return map;
}

// ---- rate guard -------------------------------------------------------

/** How many messages went out in the trailing hour, and what is left. */
export function getHourlyUsage() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  const sent = sendLog.filter(
    (e) => e.status === "SENT" && new Date(e.sentAt).getTime() >= cutoff
  ).length;
  return { sent, limit: HOURLY_LIMIT, remaining: Math.max(0, HOURLY_LIMIT - sent) };
}

// ---- sending ----------------------------------------------------------

/**
 * Normalise and check an incoming poster.
 *
 * Accepts either a bare base64 string or a full `data:image/png;base64,...`
 * URL, since the browser's FileReader produces the latter. Returns null when
 * no image was attached; throws on anything attached but unusable.
 */
export function validateImage(image) {
  if (!image || !image.data) return null;

  const raw = String(image.data);
  const comma = raw.indexOf(",");
  const isDataUrl = raw.startsWith("data:");
  const base64 = isDataUrl && comma !== -1 ? raw.slice(comma + 1) : raw;

  // Prefer the mimetype declared inside the data URL over the caller's field.
  const declared = isDataUrl ? raw.slice(5, raw.indexOf(";")) : image.mimetype;
  const mimetype = String(declared || "").toLowerCase();

  if (!ALLOWED_IMAGE_TYPES.has(mimetype)) {
    const err = new Error("Image must be JPEG, PNG or WebP");
    err.statusCode = 415;
    throw err;
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    const err = new Error("Image data is not valid base64");
    err.statusCode = 400;
    throw err;
  }

  // Byte length without decoding: 4 base64 chars carry 3 bytes.
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = (base64.length * 3) / 4 - padding;
  if (bytes > MAX_IMAGE_BYTES) {
    const err = new Error(
      "Image is too large (" + Math.round(bytes / 1024 / 1024) + "MB). Maximum is 5MB."
    );
    err.statusCode = 413;
    throw err;
  }

  const filename = String(image.filename || "poster").slice(0, 120);
  return { base64, mimetype, filename };
}

/** Fill {{name}} (and {{phone}}) in a template for one recipient. */
export function renderTemplate(template, customer) {
  return String(template || "")
    .replace(/\{\{\s*name\s*\}\}/gi, String(customer?.name || "").trim())
    .replace(/\{\{\s*phone\s*\}\}/gi, String(customer?.phone || "").trim());
}

/**
 * Send one message and log the outcome.
 *
 * Deliberately one-at-a-time: no queue, no worker. The admin UI walks its
 * selection and calls this once per customer with a human-ish gap between
 * calls, which is both simpler and the behaviour least likely to get the
 * number flagged.
 */
export async function sendMessage({ customerId, phone, message, image, sentBy }) {
  if (state !== STATES.READY || !client) {
    const err = new Error("WhatsApp is not connected. Scan the QR code first.");
    err.statusCode = 409;
    throw err;
  }

  const text = String(message || "").trim();
  const poster = validateImage(image);

  // A poster on its own is a valid message; text is only required without one.
  if (!text && !poster) {
    const err = new Error("Add a message or an image");
    err.statusCode = 400;
    throw err;
  }

  const chatId = toWhatsAppId(phone);
  if (!chatId) {
    const err = new Error("Unusable phone number: " + phone);
    err.statusCode = 400;
    throw err;
  }

  const usage = getHourlyUsage();
  if (usage.remaining <= 0) {
    const err = new Error(
      "Hourly limit reached (" + usage.limit + "/hour). Wait before sending more."
    );
    err.statusCode = 429;
    throw err;
  }

  const sinceLast = Date.now() - lastSentAt;
  if (lastSentAt && sinceLast < MIN_GAP_MS) {
    const wait = Math.ceil((MIN_GAP_MS - sinceLast) / 1000);
    const err = new Error("Sending too fast. Wait " + wait + "s.");
    err.statusCode = 429;
    throw err;
  }

  try {
    // Confirms the number actually has WhatsApp before we spend a send on it.
    const registered = await client.isRegisteredUser(chatId);
    if (!registered) {
      const err = new Error("This number is not on WhatsApp");
      err.statusCode = 422;
      throw err;
    }

    if (poster) {
      // The text becomes the image caption rather than a second message - one
      // notification per customer instead of two.
      const { MessageMedia } = await loadWhatsAppWeb();
      const media = new MessageMedia(poster.mimetype, poster.base64, poster.filename);
      await client.sendMessage(chatId, media, text ? { caption: text } : {});
    } else {
      await client.sendMessage(chatId, text);
    }

    lastSentAt = Date.now();
    logSend({
      customerId,
      phone,
      message: text,
      hasImage: Boolean(poster),
      status: "SENT",
      error: null,
      sentBy,
    });
    return { ok: true, chatId };
  } catch (e) {
    logSend({
      customerId,
      phone,
      message: text,
      hasImage: Boolean(poster),
      status: "FAILED",
      error: String(e?.message || "send failed").slice(0, 500),
      sentBy,
    });
    if (!e.statusCode) e.statusCode = 502;
    throw e;
  }
}
