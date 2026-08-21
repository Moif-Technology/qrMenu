import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, Clock, ImagePlus, Loader2, LogOut, MessageCircle,
  QrCode, RefreshCw, RotateCcw, Search, Send, Smartphone, Square, Users, X,
} from "lucide-react";
import {
  connectWhatsApp, getWhatsAppCustomers, getWhatsAppStatus,
  logoutWhatsApp, resetWhatsApp, sendWhatsAppMessage,
} from "../../services/whatsapp.service";

const cn = (...c) => c.filter(Boolean).join(" ");
const inputCls =
  "h-12 w-full rounded-xl bg-[var(--paper)] border border-[var(--line)] px-4 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--brass)] focus:ring-2 focus:ring-[var(--brass-soft)] transition";

// Gap between two sends. Randomised inside this window so the traffic does not
// look like a metronome - a perfectly regular cadence is exactly the pattern
// that gets a number flagged.
const GAP_MIN_S = 8;
const GAP_MAX_S = 20;

// Kept in step with the same caps in backend/services/whatsapp.service.js.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const randomGap = () => GAP_MIN_S + Math.floor(Math.random() * (GAP_MAX_S - GAP_MIN_S + 1));

const initial = (n) => (n || "?").trim().charAt(0).toUpperCase();

const fmtDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const STATE_LABEL = {
  DISCONNECTED: { text: "Not connected", tone: "idle" },
  STARTING: { text: "Starting browser…", tone: "busy" },
  QR: { text: "Waiting for QR scan", tone: "busy" },
  READY: { text: "Connected", tone: "good" },
  AUTH_FAILED: { text: "Authentication failed", tone: "bad" },
};

export default function AdminWhatsApp() {
  const [status, setStatus] = useState({ state: "DISCONNECTED", qr: null, me: null, usage: null });
  const [connecting, setConnecting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [reloadKey, setReloadKey] = useState(0);

  const [message, setMessage] = useState("");
  const [image, setImage] = useState(null); // { data, mimetype, filename, sizeKb }
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  // Queue state. `results` is keyed by customer id so rows can show their own
  // outcome without a second lookup.
  const [sending, setSending] = useState(false);
  const [current, setCurrent] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [results, setResults] = useState({});
  const stopRef = useRef(false);

  const ready = status.state === "READY";
  const usage = status.usage || { sent: 0, limit: 10, remaining: 10 };
  const selectedList = useMemo(
    () => customers.filter((c) => selected.has(c.id)),
    [customers, selected]
  );

  // ---- status polling -------------------------------------------------
  // Poll only while a connection is being established. Once READY the state
  // is stable, so a slow heartbeat is enough to notice a drop or refresh the
  // hourly counter.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const res = await getWhatsAppStatus();
      if (alive && res?.ok) setStatus(res);
    };
    tick();
    const interval = setInterval(tick, ready ? 30000 : 3000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [ready]);

  // ---- customer loading -----------------------------------------------
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const res = await getWhatsAppCustomers(debounced, { page: 1, pageSize: 100 });
      if (!alive) return;
      if (res?.ok) setCustomers(res.customers || []);
      else setError(res?.error || "Failed to load customers");
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [debounced, reloadKey]);

  // ---- connection actions ---------------------------------------------
  const handleConnect = async () => {
    setConnecting(true);
    setError("");
    const res = await connectWhatsApp();
    if (!res?.ok) setError(res?.error || "Failed to start WhatsApp");
    setConnecting(false);
  };

  const handleLogout = async () => {
    if (!window.confirm("Log out of WhatsApp? You will need to scan the QR code again.")) return;
    await logoutWhatsApp();
    setStatus({ state: "DISCONNECTED", qr: null, me: null, usage: status.usage });
  };

  /**
   * wipe=false clears a stuck browser but keeps the cached login.
   * wipe=true forgets the account too - the only way to link a different phone.
   */
  const handleReset = async (wipe) => {
    if (wipe && !window.confirm("Forget the linked number and start fresh? You will scan a new QR code.")) {
      return;
    }
    setResetting(true);
    setError("");
    const res = await resetWhatsApp(wipe);
    if (!res?.ok) setError(res?.error || "Reset failed");
    setStatus((s) => ({ ...s, state: "DISCONNECTED", qr: null, me: null, error: null }));
    setResetting(false);
  };

  // ---- offer poster ---------------------------------------------------
  // Read straight to base64 and hold it in state. The bytes go to WhatsApp with
  // each send, so there is nothing to upload and nothing to clean up after.

  const handlePickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Poster must be a JPEG, PNG or WebP image");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Poster is ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum is 5MB.`);
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setError("");
      setImage({
        data: reader.result, // data: URL; the backend accepts it as-is
        mimetype: file.type,
        filename: file.name,
        sizeKb: Math.round(file.size / 1024),
      });
    };
    reader.onerror = () => setError("Could not read that image");
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ---- selection ------------------------------------------------------
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allShownSelected = customers.length > 0 && customers.every((c) => selected.has(c.id));
  const toggleAll = () =>
    setSelected(allShownSelected ? new Set() : new Set(customers.map((c) => c.id)));

  // ---- the queue ------------------------------------------------------

  /** Abortable pause that also drives the visible countdown. */
  const waitWithCountdown = (seconds) =>
    new Promise((resolve) => {
      let left = seconds;
      setCountdown(left);
      const id = setInterval(() => {
        if (stopRef.current) {
          clearInterval(id);
          setCountdown(0);
          return resolve();
        }
        left -= 1;
        setCountdown(left);
        if (left <= 0) {
          clearInterval(id);
          resolve();
        }
      }, 1000);
    });

  const runQueue = async () => {
    // A poster with no caption is a legitimate blast, so either one is enough.
    if (!message.trim() && !image) return setError("Write a message or attach a poster");
    if (selectedList.length === 0) return setError("Select at least one customer");

    setError("");
    setResults({});
    setSending(true);
    stopRef.current = false;

    for (let i = 0; i < selectedList.length; i++) {
      if (stopRef.current) break;
      const c = selectedList[i];
      setCurrent({ index: i, total: selectedList.length, customer: c });

      // ponytail: the poster is re-uploaded on every send. Fine on localhost
      // and at the 10/hour throttle; if this ever runs against a remote backend
      // with big lists, POST it once and pass a handle instead.
      const res = await sendWhatsAppMessage({
        customerId: c.id,
        name: c.name,
        phone: c.phone,
        message,
        image: image
          ? { data: image.data, mimetype: image.mimetype, filename: image.filename }
          : undefined,
      });

      setResults((prev) => ({
        ...prev,
        [c.id]: res?.ok ? { ok: true } : { ok: false, error: res?.error || "Failed" },
      }));

      if (res?.usage) setStatus((s) => ({ ...s, usage: res.usage }));

      // The server refuses past the hourly cap. Stop the whole run rather than
      // grinding through the rest of the list collecting identical errors.
      if (!res?.ok && /hourly limit/i.test(res?.error || "")) {
        setError(res.error);
        break;
      }

      if (i < selectedList.length - 1 && !stopRef.current) {
        await waitWithCountdown(randomGap());
      }
    }

    setCurrent(null);
    setCountdown(0);
    setSending(false);
  };

  const stopQueue = () => {
    stopRef.current = true;
  };

  const preview = useMemo(() => {
    const sample = selectedList[0] || customers[0];
    return message
      .replace(/\{\{\s*name\s*\}\}/gi, sample?.name || "Customer")
      .replace(/\{\{\s*phone\s*\}\}/gi, sample?.phone || "");
  }, [message, selectedList, customers]);

  const stateInfo = STATE_LABEL[status.state] || STATE_LABEL.DISCONNECTED;

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="admin-eyebrow">Guest outreach</p>
          <div className="flex items-baseline gap-3 mt-1">
            <h1 className="font-display text-[40px] sm:text-[48px] leading-[0.95] text-[var(--ink)]">
              WhatsApp
            </h1>
            <span className="rounded-full bg-[var(--brass-soft)] text-[var(--brass-2)] text-[13px] font-bold px-3 py-1">
              {usage.sent}/{usage.limit} this hour
            </span>
          </div>
        </div>
      </div>

      {/* Standing warning. This is unofficial automation and the person using
          it should be reminded every single time, not once in a changelog. */}
      <div className="flex gap-3 rounded-xl border border-[#E3C4BB] bg-[#F6E7E2] px-4 py-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--danger)] mt-0.5" />
        <div className="text-[13px] leading-relaxed text-[var(--ink-soft)]">
          <p className="font-bold text-[var(--danger)]">Unofficial WhatsApp automation</p>
          <p className="mt-0.5">
            This sends from your own number through WhatsApp Web, which WhatsApp's terms do not
            permit. Message only guests who gave you their number, keep an opt-out line in the
            text, and stay under the hourly limit. A number that collects blocks or reports can be
            banned permanently.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-[#F6E7E2] border border-[#E3C4BB] text-[var(--danger)] text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Connection */}
      <div className="admin-card p-5 admin-rise">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-[var(--brass-soft)] border border-[var(--line)]">
              <Smartphone className="h-5 w-5 text-[var(--brass-2)]" />
            </div>
            <div>
              <p className="admin-eyebrow">Sending number</p>
              <p className="font-semibold text-[15px] text-[var(--ink)]">
                {status.me ? `+${status.me}` : stateInfo.text}
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-bold",
                stateInfo.tone === "good" && "bg-[#E4EFE4] text-[#3B6B3B]",
                stateInfo.tone === "bad" && "bg-[#F6E7E2] text-[var(--danger)]",
                stateInfo.tone === "busy" && "bg-[var(--brass-soft)] text-[var(--brass-2)]",
                stateInfo.tone === "idle" && "bg-[var(--cream-2)] text-[var(--ink-faint)]"
              )}
            >
              {stateInfo.text}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {ready ? (
              <button
                onClick={handleLogout}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 text-[14px] font-bold text-[var(--ink-soft)] hover:border-[var(--brass)] transition"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            ) : (
              <>
                {/* Escape hatch for a wedged Chromium profile, and the only way
                    to link a different phone once one is cached. */}
                <button
                  onClick={() => handleReset(false)}
                  disabled={resetting}
                  title="Kill a stuck browser and clear the profile lock"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 text-[14px] font-bold text-[var(--ink-soft)] hover:border-[var(--brass)] disabled:opacity-50 transition"
                >
                  {resetting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Reset
                </button>
                <button
                  onClick={() => handleReset(true)}
                  disabled={resetting}
                  title="Forget the linked number so a different phone can scan"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 text-[14px] font-bold text-[var(--ink-soft)] hover:border-[var(--brass)] disabled:opacity-50 transition"
                >
                  <Smartphone className="h-4 w-4" /> Switch number
                </button>
                <button
                  onClick={handleConnect}
                  disabled={connecting || resetting || status.state === "STARTING"}
                  className="admin-btn-brass inline-flex h-11 items-center gap-2 px-5 text-[14px] font-bold disabled:opacity-50"
                >
                  {connecting || status.state === "STARTING" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <QrCode className="h-4 w-4" />
                  )}
                  Connect WhatsApp
                </button>
              </>
            )}
          </div>
        </div>

        {status.qr && (
          <div className="mt-5 flex flex-col items-center gap-3 border-t border-[var(--line)] pt-5">
            <img
              src={status.qr}
              alt="WhatsApp QR code"
              className="h-[260px] w-[260px] rounded-xl border border-[var(--line)] bg-white p-2"
            />
            <p className="text-[13px] text-[var(--ink-faint)] text-center max-w-sm">
              On the phone holding the restaurant number: WhatsApp → Settings → Linked devices →
              Link a device, then scan this code.
            </p>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="admin-card p-5 admin-rise space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="admin-eyebrow">Message</p>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePickImage}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1 text-[12px] font-bold text-[var(--ink-soft)] hover:border-[var(--brass)] disabled:opacity-50 transition"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              {image ? "Replace poster" : "Attach poster"}
            </button>
            <button
              onClick={() => setMessage((m) => `${m}{{name}}`)}
              className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1 text-[12px] font-bold text-[var(--ink-soft)] hover:border-[var(--brass)] transition"
            >
              Insert {"{{name}}"}
            </button>
          </div>
        </div>

        {image && (
          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--cream)] p-3">
            <img
              src={image.data}
              alt="Offer poster"
              className="h-16 w-16 shrink-0 rounded-lg border border-[var(--line)] object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-[var(--ink)]">
                {image.filename}
              </p>
              <p className="text-[12px] text-[var(--ink-faint)]">
                {image.sizeKb} KB · sent as an image, your text becomes the caption
              </p>
            </div>
            <button
              onClick={clearImage}
              disabled={sending}
              title="Remove poster"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--paper)] text-[var(--ink-soft)] hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-50 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <textarea
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={"Hi {{name}}, this week we have…\n\nReply STOP to opt out."}
          className="w-full rounded-xl bg-[var(--paper)] border border-[var(--line)] p-4 text-[15px] leading-relaxed text-[var(--ink)] outline-none focus:border-[var(--brass)] focus:ring-2 focus:ring-[var(--brass-soft)] transition resize-y"
        />
        {(message.trim() || image) && (
          <div className="rounded-xl bg-[var(--cream)] border border-[var(--line)] px-4 py-3">
            <p className="admin-eyebrow mb-2">Preview</p>
            {image && (
              <img
                src={image.data}
                alt="Offer poster preview"
                className="mb-2 max-h-64 w-auto rounded-lg border border-[var(--line)]"
              />
            )}
            {message.trim() && (
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--ink-soft)]">
                {preview}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Send bar */}
      <div className="admin-card p-5 admin-rise">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[14px] text-[var(--ink-soft)]">
            <Users className="h-4 w-4 text-[var(--brass)]" />
            <span className="font-bold text-[var(--ink)]">{selectedList.length}</span> selected
            <span className="text-[var(--ink-faint)]">·</span>
            <Clock className="h-4 w-4 text-[var(--brass)]" />
            <span className="font-bold text-[var(--ink)]">{usage.remaining}</span> left this hour
          </div>

          <div className="flex items-center gap-2">
            {sending && (
              <button
                onClick={stopQueue}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 text-[14px] font-bold text-[var(--danger)] hover:border-[var(--danger)] transition"
              >
                <Square className="h-3.5 w-3.5" /> Stop
              </button>
            )}
            <button
              onClick={runQueue}
              disabled={
                sending || !ready || selectedList.length === 0 || (!message.trim() && !image)
              }
              className="admin-btn-brass inline-flex h-11 items-center gap-2 px-5 text-[14px] font-bold disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending
                ? `Sending ${(current?.index ?? 0) + 1} of ${current?.total ?? selectedList.length}`
                : `Send to ${selectedList.length}`}
            </button>
          </div>
        </div>

        {sending && (
          <div className="mt-4 border-t border-[var(--line)] pt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--cream-2)]">
              <div
                className="h-full rounded-full bg-[var(--brass)] transition-all duration-500"
                style={{
                  width: `${(((current?.index ?? 0) + 1) / (current?.total || 1)) * 100}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[13px] text-[var(--ink-faint)]">
              {countdown > 0
                ? `Pausing ${countdown}s before the next message…`
                : current
                  ? `Sending to ${current.customer.name}…`
                  : "Working…"}
            </p>
          </div>
        )}

        {!ready && (
          <p className="mt-3 text-[13px] text-[var(--ink-faint)]">
            Connect WhatsApp above before sending.
          </p>
        )}
      </div>

      {/* Recipients */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[var(--ink-faint)]" />
        <input
          type="text"
          placeholder="Search name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputCls} pl-11`}
        />
      </div>

      <div className="admin-card overflow-hidden admin-rise">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--cream-2)]/60 border-b border-[var(--line)]">
                <th className="px-5 py-3.5 w-12">
                  <input
                    type="checkbox"
                    checked={allShownSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 accent-[var(--brass)]"
                  />
                </th>
                <th className="admin-eyebrow font-bold px-5 py-3.5">Customer</th>
                <th className="admin-eyebrow font-bold px-5 py-3.5 hidden sm:table-cell">Phone</th>
                <th className="admin-eyebrow font-bold px-5 py-3.5 hidden md:table-cell">
                  Last messaged
                </th>
                <th className="admin-eyebrow font-bold px-5 py-3.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--brass)] mx-auto" />
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <p className="font-display text-2xl text-[var(--ink-faint)]">
                      No customers found
                    </p>
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const result = results[c.id];
                  const isCurrent = current?.customer?.id === c.id;
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        "border-b border-[var(--line)] last:border-0 transition-colors",
                        isCurrent ? "bg-[var(--brass-soft)]" : "hover:bg-[var(--cream)]"
                      )}
                    >
                      <td className="px-5 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggle(c.id)}
                          disabled={sending}
                          className="h-4 w-4 accent-[var(--brass)]"
                        />
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--brass-soft)] border border-[var(--line)] font-display text-[15px] text-[var(--brass-2)]">
                            {initial(c.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[15px] text-[var(--ink)] truncate">
                              {c.name || "Unknown"}
                            </p>
                            <p className="text-[12px] text-[var(--ink-faint)] sm:hidden">
                              {c.phone || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell text-[14px] text-[var(--ink-soft)]">
                        {c.phone || "—"}
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell text-[14px] text-[var(--ink-faint)]">
                        {fmtDate(c.lastMessagedAt) || "Never"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {isCurrent ? (
                          <Loader2 className="ml-auto h-4 w-4 animate-spin text-[var(--brass)]" />
                        ) : result?.ok ? (
                          <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[#3B6B3B]">
                            <Check className="h-4 w-4" /> Sent
                          </span>
                        ) : result ? (
                          <span
                            title={result.error}
                            className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--danger)]"
                          >
                            <X className="h-4 w-4" /> Failed
                          </span>
                        ) : (
                          <span className="text-[13px] text-[var(--ink-faint)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="flex items-center gap-2 text-[13px] text-[var(--ink-faint)]">
        <MessageCircle className="h-4 w-4" />
        Messages go out one at a time with a {GAP_MIN_S}–{GAP_MAX_S} second gap. Keep this tab open
        until the run finishes.
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="ml-auto inline-flex items-center gap-1.5 text-[var(--ink-soft)] hover:text-[var(--brass-2)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </p>
    </div>
  );
}
