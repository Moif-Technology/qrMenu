import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, CalendarDays, Check, CheckCheck, Clock, Crown, Download, FileText, ListChecks,
  Loader2, LogOut,
  MessageCircle, MoreVertical, Paperclip, Plus, QrCode, RefreshCw, RotateCcw, Search, Send,
  Smartphone, Smile, Square, Sun, Tag, Trash2, Users, X,
} from "lucide-react";
import {
  connectWhatsApp, getWhatsAppCustomers, getWhatsAppStatus,
  logoutWhatsApp, resetWhatsApp, sendWhatsAppMessage,
} from "../../services/whatsapp.service";

const cn = (...c) => c.filter(Boolean).join(" ");

const iconBtn =
  "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--paper)] text-[var(--brass-2)] hover:border-[var(--brass)] disabled:opacity-50 transition";
const pillBtn =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 text-[13px] font-bold text-[var(--ink)] hover:border-[var(--brass)] disabled:opacity-50 transition";
const darkBtn =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#5A0A22] px-5 text-[13px] font-bold text-white hover:bg-[var(--brass-2)] disabled:opacity-40 transition";

const EMOJIS = ["😊", "😍", "🎉", "🙏", "👋", "❤️", "🔥", "✨", "🍽️", "🍷", "🥂", "🎁"];

// Chat wallpaper: two offset dot grids in the theme's wine tint.
const WALLPAPER = {
  backgroundColor: "#FCF3F5",
  backgroundImage:
    "radial-gradient(rgba(122,0,38,0.05) 1.2px, transparent 1.2px), radial-gradient(rgba(122,0,38,0.035) 1.2px, transparent 1.2px)",
  backgroundSize: "28px 28px, 28px 28px",
  backgroundPosition: "0 0, 14px 14px",
};

// Gap between two sends. Randomised inside this window so the traffic does not
// look like a metronome - a perfectly regular cadence is exactly the pattern
// that gets a number flagged.
const GAP_MIN_S = 8;
const GAP_MAX_S = 20;

// Kept in step with the same caps in backend/services/whatsapp.service.js.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const randomGap = () => GAP_MIN_S + Math.floor(Math.random() * (GAP_MAX_S - GAP_MIN_S + 1));

const downloadFile = (filename, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Hand-picked guest lists, one tab each. They live in this browser only: the
// customers API has no visit history or tags to derive them from.
// Lists made with the "+" tab are added after these and get the Tag icon.
const BUILT_IN_LISTS = [
  { key: "vip", label: "VIP", icon: Crown },
  { key: "daily", label: "Daily", icon: Sun },
  { key: "weekly", label: "Weekly", icon: CalendarDays },
];
const GROUPS_KEY = "admin.whatsapp.guestGroups";
const LEGACY_VIP_KEY = "admin.whatsapp.vipIds"; // VIPs saved before the other lists existed

/** "VIP customers", "daily customers", "Family customers". */
const listNoun = (l) => (l.key === "daily" || l.key === "weekly" ? l.label.toLowerCase() : l.label);

/** { custom: [{ key, label }], groups: { [key]: Set of customer ids } } */
const loadLists = () => {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(GROUPS_KEY)) || {};
  } catch {
    // Unreadable storage: start with empty lists.
  }
  const custom = Array.isArray(saved.custom) ? saved.custom : [];
  // The first version stored the id arrays at the top level, with no "members".
  const members = saved.members || saved;
  if (!members.vip) {
    try {
      members.vip = JSON.parse(localStorage.getItem(LEGACY_VIP_KEY)) || [];
    } catch {
      members.vip = [];
    }
  }
  const keys = [...BUILT_IN_LISTS, ...custom].map((l) => l.key);
  return {
    custom,
    groups: Object.fromEntries(keys.map((k) => [k, new Set(members[k] || [])])),
  };
};

const saveLists = ({ custom, groups }) => {
  try {
    localStorage.setItem(
      GROUPS_KEY,
      JSON.stringify({
        custom,
        members: Object.fromEntries(Object.entries(groups).map(([k, ids]) => [k, [...ids]])),
      })
    );
  } catch {
    // Storage blocked or full: the lists still apply until the page reloads.
  }
};

/** Small icons after a guest's name for each list they are on. */
function GroupIcons({ lists, groups, id, className }) {
  return lists.filter((g) => groups[g.key]?.has(id)).map((g) => {
    const Icon = g.icon;
    return (
      <span key={g.key} title={`${g.label} customer`} className="shrink-0">
        <Icon className={cn(className, "text-[var(--brass)]")} />
      </span>
    );
  });
}

/** Fill the {{name}} / {{phone}} placeholders for one guest. */
const fill = (text, c) =>
  text
    .replace(/\{\{\s*name\s*\}\}/gi, c?.name || "Customer")
    .replace(/\{\{\s*phone\s*\}\}/gi, c?.phone || "");

const mentionLabel = (c) => c.name || c.phone || "Guest";

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
  // The guest whose chat is open. null means the Guest Outreach broadcast,
  // which sends to everyone ticked in the list.
  const [active, setActive] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [message, setMessage] = useState("");
  const [image, setImage] = useState(null); // { data, mimetype, filename, sizeKb }
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const taRef = useRef(null);
  const searchRef = useRef(null);

  const [lists, setLists] = useState(loadLists);
  const groups = lists.groups;
  const allLists = useMemo(
    () => [...BUILT_IN_LISTS, ...lists.custom.map((l) => ({ ...l, icon: Tag, custom: true }))],
    [lists.custom]
  );
  const [tab, setTab] = useState("all"); // "all" | a list key | "other"
  const [newListName, setNewListName] = useState(null); // null = dialog closed
  // null when the list picker is closed, otherwise { key, draft: Set of ids }.
  const [picker, setPicker] = useState(null);
  const [pickerSearch, setPickerSearch] = useState("");

  const [mobileView, setMobileView] = useState("list"); // "list" | "chat", below md only
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentions, setMentions] = useState([]); // guests picked through "@"
  const [mentionQuery, setMentionQuery] = useState(null); // null = picker closed
  const [mentionIndex, setMentionIndex] = useState(0);

  // Queue state. `results` is keyed by customer id so rows can show their own
  // outcome without a second lookup.
  const [sending, setSending] = useState(false);
  const [current, setCurrent] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [results, setResults] = useState({});
  // Bubbles for what was sent from this tab. Session-only: nothing is stored.
  const [sentLog, setSentLog] = useState([]);
  const logEndRef = useRef(null);
  const stopRef = useRef(false);

  const ready = status.state === "READY";
  const usage = status.usage || { sent: 0, limit: 10, remaining: 10 };
  const selectedList = useMemo(
    () => customers.filter((c) => selected.has(c.id)),
    [customers, selected]
  );
  // Guests @mentioned in the composer are sent the message too, for as long as
  // their mention is still in the text.
  const mentionedList = useMemo(
    () => mentions.filter((c) => message.includes(`@${mentionLabel(c)}`)),
    [mentions, message]
  );
  const recipients = useMemo(() => {
    const base = active ? [active] : selectedList;
    const ids = new Set(base.map((c) => c.id));
    return [...base, ...mentionedList.filter((c) => !ids.has(c.id))];
  }, [active, selectedList, mentionedList]);
  const extraMentions = recipients.length - (active ? 1 : selectedList.length);

  // Suggestions while the text before the caret ends in "@query".
  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return customers
      .filter((c) => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q))
      .slice(0, 6);
  }, [mentionQuery, customers]);
  // A guest's chat shows everything sent to them, broadcasts included.
  const visibleLog = useMemo(
    () => sentLog.filter((m) => (active ? m.ids.includes(active.id) : m.broadcast)),
    [sentLog, active]
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

  // Grow the composer with its content, up to the max-height set in CSS.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [message]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [visibleLog.length, active]);

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

  // ---- guest lists and tabs -------------------------------------------
  const commitLists = (next) => {
    setLists(next);
    saveLists(next);
  };

  const inAnyGroup = (id) => allLists.some((g) => groups[g.key]?.has(id));
  const rowsFor = (key) =>
    key === "all"
      ? customers
      : key === "other"
        ? customers.filter((c) => !inAnyGroup(c.id))
        : customers.filter((c) => groups[key]?.has(c.id));
  const tabs = [
    { key: "all", label: "All" },
    ...allLists,
    { key: "other", label: "Other" },
  ].map((t) => ({ ...t, count: rowsFor(t.key).length }));
  const tabRows = rowsFor(tab);
  const tabGroup = allLists.find((g) => g.key === tab);

  const openPicker = (key) => {
    setPickerSearch("");
    setPicker({ key, draft: new Set(groups[key] || []) });
  };

  const createList = () => {
    const label = (newListName || "").trim();
    if (!label) return;
    const key = `list-${Date.now()}`;
    commitLists({
      custom: [...lists.custom, { key, label }],
      groups: { ...groups, [key]: new Set() },
    });
    setNewListName(null);
    setTab(key);
    setPickerSearch("");
    setPicker({ key, draft: new Set() });
  };

  const deleteList = (list) => {
    if (!window.confirm(`Delete the "${list.label}" list? The guests themselves are not affected.`)) {
      return;
    }
    const rest = { ...groups };
    delete rest[list.key];
    commitLists({ custom: lists.custom.filter((l) => l.key !== list.key), groups: rest });
    setTab("all");
  };

  const togglePickerDraft = (id) =>
    setPicker((prev) => {
      const draft = new Set(prev.draft);
      if (draft.has(id)) draft.delete(id);
      else draft.add(id);
      return { ...prev, draft };
    });

  const savePicker = () => {
    commitLists({ ...lists, groups: { ...groups, [picker.key]: picker.draft } });
    setPicker(null);
  };

  const pickerGroup = picker && allLists.find((g) => g.key === picker.key);
  const pickerRows = customers.filter((c) => {
    const q = pickerSearch.trim().toLowerCase();
    return !q || (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q);
  });

  // ---- @mentions ------------------------------------------------------
  /** Open, narrow or close the mention picker from the text before the caret. */
  const handleMessageChange = (e) => {
    const { value, selectionStart } = e.target;
    setMessage(value);
    const match = value.slice(0, selectionStart).match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(match ? match[1] : null);
    setMentionIndex(0);
  };

  /** Swap the "@query" being typed for "@Name " and add that guest as a recipient. */
  const pickMention = (c) => {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? message.length;
    const before = message.slice(0, caret).replace(/@[^\s@]*$/, `@${mentionLabel(c)} `);
    setMessage(before + message.slice(caret));
    setMentions((prev) => (prev.some((m) => m.id === c.id) ? prev : [...prev, c]));
    setMentionQuery(null);
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(before.length, before.length);
    });
  };

  const handleMessageKeyDown = (e) => {
    if (mentionMatches.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setMentionIndex((i) => (i + step + mentionMatches.length) % mentionMatches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pickMention(mentionMatches[mentionIndex] || mentionMatches[0]);
    } else if (e.key === "Escape") {
      setMentionQuery(null);
    }
  };

  const openChat = (c) => {
    setActive(c);
    setMobileView("chat");
  };

  // "Select all" works on the open tab only, leaving other tabs' ticks alone.
  const allShownSelected = tabRows.length > 0 && tabRows.every((c) => selected.has(c.id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      tabRows.forEach((c) => (allShownSelected ? next.delete(c.id) : next.add(c.id)));
      return next;
    });

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
    if (recipients.length === 0) return setError("Select at least one customer");

    setError("");
    setResults({});
    setSending(true);
    stopRef.current = false;

    // Show it in the conversation and empty the composer, as a chat would. The
    // loop below keeps sending the `message` and `image` captured by this call.
    setSentLog((log) => [
      ...log,
      {
        id: Date.now(),
        text: message,
        image: image?.data,
        time: now,
        ids: recipients.map((c) => c.id),
        sample: recipients[0],
        broadcast: !active,
      },
    ]);
    setMessage("");
    setMentions([]);
    setMentionQuery(null);
    clearImage();

    for (let i = 0; i < recipients.length; i++) {
      if (stopRef.current) break;
      const c = recipients[i];
      setCurrent({ index: i, total: recipients.length, customer: c });

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

      if (i < recipients.length - 1 && !stopRef.current) {
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

  const stateInfo = STATE_LABEL[status.state] || STATE_LABEL.DISCONNECTED;
  const busy = connecting || status.state === "STARTING";
  const canSend = !sending && ready && recipients.length > 0 && (message.trim() || image);
  const now = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const exportGuests = () => {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = (selectedList.length > 0 ? selectedList : customers).map((c) =>
      [c.name, c.phone, fmtDate(c.lastMessagedAt) || "Never"].map(cell).join(",")
    );
    // BOM so Excel reads non-Latin names as UTF-8.
    downloadFile("guests.csv", `\uFEFFName,Phone,Last messaged\n${rows.join("\n")}`, "text/csv");
  };

  const exportChat = () =>
    downloadFile(
      "whatsapp-outreach.txt",
      visibleLog
        .map((m) => {
          const to = active ? active.name || active.phone : `${m.ids.length} guest(s)`;
          const poster = m.image ? " (with poster)" : "";
          return `[${m.time}] to ${to}${poster}\n${fill(m.text, active || m.sample)}`;
        })
        .join("\n\n"),
      "text/plain"
    );

  // `divider` draws a rule above the item, grouping the menu like WhatsApp's.
  const menuItems = [
    { label: "Search guests", icon: Search, onClick: () => focusSearch() },
    ...(active
      ? []
      : [
          ...BUILT_IN_LISTS.map((g) => ({
            label: `Select ${listNoun(g)} customers`,
            icon: g.icon,
            onClick: () => openPicker(g.key),
            disabled: customers.length === 0,
          })),
          { label: "New list", icon: Plus, onClick: () => setNewListName("") },
        ]),
    {
      label: allShownSelected ? "Clear selection" : "Select all guests",
      icon: ListChecks,
      onClick: toggleAll,
      disabled: sending || tabRows.length === 0,
    },
    { label: "Refresh guest list", icon: RefreshCw, onClick: () => setReloadKey((k) => k + 1) },
    {
      label: selectedList.length > 0 ? "Export selected guests" : "Export guest list",
      icon: Download,
      onClick: exportGuests,
      disabled: customers.length === 0,
      divider: true,
    },
    { label: "Export chat", icon: FileText, onClick: exportChat, disabled: visibleLog.length === 0 },
    {
      label: "Clear chat",
      icon: Trash2,
      onClick: () => setSentLog((log) => log.filter((m) => !visibleLog.includes(m))),
      disabled: sending || visibleLog.length === 0,
    },
    ...(active
      ? [{ label: "Close chat", icon: X, onClick: () => setActive(null), divider: true }]
      : []),
    ...(ready
      ? [{ label: "Log out", icon: LogOut, onClick: handleLogout, divider: !active }]
      : []),
  ];

  const focusSearch = () => {
    setMobileView("list");
    // The list is display:none on mobile until the view flips, so wait a frame.
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] lg:h-dvh min-h-[560px] flex-col overflow-hidden bg-[#FDF1F4] text-[var(--ink)]">
      {/* Title bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F8D3DC] text-[var(--brass)]">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[22px] font-semibold leading-none">WhatsApp</h1>
            <p className="admin-eyebrow mt-1 !text-[10px] !text-[var(--brass)]">Guest outreach</p>
          </div>
        </div>
        <span
          title="Messages sent this hour"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#F8D3DC] px-3 py-1.5 text-[12px] font-bold text-[var(--brass-2)]"
        >
          <Clock className="h-3.5 w-3.5" />
          {usage.sent}/{usage.limit} this hour
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Chat list - the broadcast row on top, then one row per guest */}
        <aside
          className={cn(
            "w-full md:w-[300px] xl:w-[340px] shrink-0 flex-col border-r border-[var(--line)]",
            mobileView === "list" ? "flex" : "hidden md:flex"
          )}
        >
          <div className="p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--brass)]" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search chats..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-full bg-[#F7E3E8] pl-11 pr-4 text-[13px] outline-none placeholder:text-[var(--ink-faint)] focus:bg-[var(--paper)] focus:ring-2 focus:ring-[#F8D3DC] transition"
              />
            </div>
          </div>

          <div className="px-2">
            <button
              type="button"
              onClick={() => openChat(null)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                active ? "hover:bg-[#F9E9ED]" : "bg-[#F8D3DC]"
              )}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F3BFCB] text-[var(--brass)]">
                <Smartphone className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold">Guest Outreach</span>
                <span className="block truncate text-[12px] text-[var(--ink-soft)]">
                  {status.me ? `+${status.me}` : stateInfo.text}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[11px] text-[var(--ink-soft)]">{now}</span>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-[var(--brass)]">
                  {usage.sent}/{usage.limit}
                </span>
              </span>
            </button>
          </div>

          <div className="mt-3 flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
            {tabs.map((t) => {
              const Icon = t.icon;
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold transition-colors",
                    on
                      ? "bg-[#5A0A22] text-white"
                      : "bg-[#F7E3E8] text-[var(--ink-soft)] hover:bg-[#F8D3DC]"
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {t.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px]",
                      on ? "bg-white/20" : "bg-white/70 text-[var(--brass)]"
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => setNewListName("")}
              title="New list"
              aria-label="New list"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F7E3E8] text-[var(--brass)] hover:bg-[#F8D3DC] transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 pb-2 text-[12px]">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                disabled={sending || tabRows.length === 0}
                className="font-bold text-[var(--brass)] hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {allShownSelected ? "Clear selection" : "Select all"}
              </button>
              {tabGroup && (
                <button
                  onClick={() => openPicker(tabGroup.key)}
                  disabled={customers.length === 0}
                  className="font-bold text-[var(--ink-soft)] hover:text-[var(--brass)] hover:underline disabled:opacity-50"
                >
                  Edit list
                </button>
              )}
              {tabGroup?.custom && (
                <button
                  onClick={() => deleteList(tabGroup)}
                  className="font-bold text-[var(--ink-soft)] hover:text-[var(--danger)] hover:underline"
                >
                  Delete list
                </button>
              )}
            </div>
            <span className="text-[var(--ink-soft)]">{selectedList.length} selected</span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-1">
            {loading ? (
              <div className="py-16">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--brass)]" />
              </div>
            ) : tabRows.length === 0 ? (
              <div className="px-6 py-16 text-center text-[13px] text-[var(--ink-faint)]">
                {tabGroup && customers.length > 0 ? (
                  <>
                    <p>No {listNoun(tabGroup)} customers yet</p>
                    <button
                      onClick={() => openPicker(tabGroup.key)}
                      className={cn(pillBtn, "mx-auto mt-3")}
                    >
                      <tabGroup.icon className="h-4 w-4 text-[var(--brass)]" />
                      Add customers
                    </button>
                  </>
                ) : (
                  <p>No customers found</p>
                )}
              </div>
            ) : (
              tabRows.map((c) => {
                const result = results[c.id];
                const isCurrent = current?.customer?.id === c.id;
                const isSelected = selected.has(c.id);
                const isOpen = active?.id === c.id;
                return (
                  // Two targets per row: the avatar ticks the guest for the
                  // broadcast, the rest of the row opens their own chat.
                  <div
                    key={c.id}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2 transition-colors",
                      isOpen || isCurrent
                        ? "bg-[#F8D3DC]"
                        : isSelected
                          ? "bg-[#F7E3E8]"
                          : "hover:bg-[#F9E9ED]"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      disabled={sending}
                      aria-pressed={isSelected}
                      title={isSelected ? "Remove from broadcast" : "Add to broadcast"}
                      className={cn(
                        "grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-bold transition-colors disabled:cursor-default",
                        isSelected
                          ? "bg-[var(--brass)] text-white"
                          : "bg-[#F8D3DC] text-[var(--brass-2)] hover:ring-2 hover:ring-[var(--brass)]"
                      )}
                    >
                      {isSelected ? <Check className="h-5 w-5" /> : initial(c.name)}
                    </button>
                    <button
                      type="button"
                      onClick={() => openChat(c)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold">
                          <span className="truncate">{c.name || "Unknown"}</span>
                          <GroupIcons
                            lists={tab === "all" ? BUILT_IN_LISTS.filter((l) => l.key === "vip") : allLists}
                            groups={groups}
                            id={c.id}
                            className="h-3.5 w-3.5"
                          />
                        </span>
                        <span
                          title="Last messaged"
                          className="shrink-0 text-[11px] text-[var(--ink-faint)]"
                        >
                          {fmtDate(c.lastMessagedAt) || "Never"}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[12px] text-[var(--ink-soft)]">
                        {isCurrent ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--brass)]" />
                            Sending…
                          </>
                        ) : result?.ok ? (
                          <>
                            <CheckCheck className="h-4 w-4 shrink-0 text-[var(--forest)]" />
                            Sent
                          </>
                        ) : result ? (
                          <>
                            <X className="h-4 w-4 shrink-0 text-[var(--danger)]" />
                            <span title={result.error} className="truncate text-[var(--danger)]">
                              {result.error}
                            </span>
                          </>
                        ) : (
                          <span className="truncate">{c.phone || "—"}</span>
                        )}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="shrink-0 border-t border-[var(--line)] p-3 md:hidden">
            <button
              onClick={() => openChat(null)}
              className={cn(darkBtn, "h-11 w-full justify-center")}
            >
              <Send className="h-4 w-4" />
              Write message ({selectedList.length})
            </button>
          </div>
        </aside>

        {/* Conversation */}
        <section
          className={cn(
            "min-w-0 flex-1 flex-col",
            mobileView === "chat" ? "flex" : "hidden md:flex"
          )}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 sm:px-5">
            <button
              onClick={() => setMobileView("list")}
              title="Back to guests"
              className={cn(iconBtn, "md:hidden")}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            {active ? (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--brass)] text-[17px] font-bold text-white">
                {initial(active.name)}
              </span>
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#F8D3DC] text-[var(--brass)]">
                <Smartphone className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold leading-tight">
                {active ? active.name || "Unknown" : "Guest Outreach"}
              </p>
              <p className="truncate text-[12px] leading-tight text-[var(--ink-soft)]">
                {active
                  ? `${active.phone || "No number"} · last messaged ${(fmtDate(active.lastMessagedAt) || "never").toLowerCase()}`
                  : selectedList.length > 0
                    ? selectedList.map((c) => c.name || c.phone).join(", ")
                    : stateInfo.text}
              </p>
            </div>

            <button onClick={focusSearch} title="Search guests" className={iconBtn}>
              <Search className="h-4 w-4" />
            </button>
            <div className="relative shrink-0">
              <button onClick={() => setMenuOpen((o) => !o)} title="Menu" className={iconBtn}>
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-[var(--line)] bg-[var(--paper)] py-1.5 shadow-[0_12px_30px_-12px_rgba(43,20,27,0.35)]">
                    {menuItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.label}
                          disabled={item.disabled}
                          onClick={() => {
                            setMenuOpen(false);
                            item.onClick();
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--brass-soft)] disabled:opacity-40 disabled:hover:bg-transparent",
                            item.divider && "mt-1.5 border-t border-[var(--line)] pt-3"
                          )}
                        >
                          <Icon className="h-4 w-4 text-[var(--brass)]" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4" style={WALLPAPER}>
            <div className="flex min-h-full flex-col gap-3">
              {/* Standing warning. This is unofficial automation and the person
                  using it should be reminded every single time, not once in a
                  changelog. */}
              <div className="flex gap-3 rounded-xl border border-[#F3C9BF] bg-[#FBE3DC] px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
                <div className="text-[12px] leading-relaxed text-[var(--ink-soft)]">
                  <p className="font-bold text-[var(--danger)]">Unofficial WhatsApp automation</p>
                  <p>
                    This sends from your own number through WhatsApp Web, which WhatsApp's terms do
                    not permit. Message only guests who gave you their number, keep an opt-out line
                    in the text, and stay under the hourly limit. A number that collects blocks or
                    reports can be banned permanently.
                  </p>
                </div>
              </div>

              {error && (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-[#F3C9BF] bg-[#FBE3DC] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--danger)]">
                  <p>{error}</p>
                  <button onClick={() => setError("")} title="Dismiss" className="shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Sending number */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F8D3DC] text-[var(--brass)]">
                      {busy ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Smartphone className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="admin-eyebrow !text-[9px] !text-[var(--brass)]">Sending number</p>
                      <p className="truncate text-[14px] font-bold">
                        {status.me ? `+${status.me}` : "Not connected"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                        stateInfo.tone === "good" && "bg-[#E4F1EA] text-[var(--forest)]",
                        stateInfo.tone === "bad" && "bg-[#F6E7E2] text-[var(--danger)]",
                        stateInfo.tone === "busy" && "bg-[#FFF1D6] text-[#8A5200] animate-pulse",
                        stateInfo.tone === "idle" && "bg-[var(--brass-soft)] text-[var(--brass-2)]"
                      )}
                    >
                      {stateInfo.text}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {ready ? (
                      <button onClick={handleLogout} className={pillBtn}>
                        <LogOut className="h-4 w-4 text-[var(--brass)]" />
                        Log out
                      </button>
                    ) : (
                      <>
                        {/* Escape hatch for a wedged Chromium profile, and the
                            only way to link a different phone once one is cached. */}
                        <button
                          onClick={() => handleReset(false)}
                          disabled={resetting}
                          title="Clear a stuck browser, keep the linked number"
                          className={pillBtn}
                        >
                          {resetting ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--brass)]" />
                          ) : (
                            <RotateCcw className="h-4 w-4 text-[var(--brass)]" />
                          )}
                          Reset
                        </button>
                        <button
                          onClick={() => handleReset(true)}
                          disabled={resetting}
                          title="Forget the linked number and scan a new QR code"
                          className={pillBtn}
                        >
                          <Smartphone className="h-4 w-4 text-[var(--brass)]" />
                          Switch number
                        </button>
                        <button
                          onClick={handleConnect}
                          disabled={busy || resetting || !!status.qr}
                          className={darkBtn}
                        >
                          {busy ? (
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

                {!ready && status.qr && (
                  <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-[var(--line)] pt-3">
                    <img
                      src={status.qr}
                      alt="WhatsApp QR code"
                      className="h-[200px] w-[200px] rounded-lg border border-[var(--line)] bg-white p-2"
                    />
                    <div className="min-w-0 flex-1 basis-[220px]">
                      <p className="font-display text-[20px] font-semibold">
                        Scan to link your number
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-soft)]">
                        On the phone holding the restaurant number: WhatsApp → Settings → Linked
                        devices → Link a device, then scan this code.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sent messages, right-aligned like an outgoing chat bubble */}
              {visibleLog.map((m) => (
                <div
                  key={m.id}
                  className="ml-auto mr-2 mt-1 w-fit max-w-[85%] rounded-xl rounded-tr-sm bg-[#DFF0DC] px-3 py-2 shadow-[0_1px_1px_rgba(43,20,27,0.08)] sm:mr-6 sm:max-w-[60%]"
                >
                  <p className="admin-eyebrow !text-[9px]">Message</p>
                  {m.image && (
                    <img src={m.image} alt="Offer poster" className="mt-1.5 max-h-64 w-auto rounded-lg" />
                  )}
                  {m.text.trim() && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--ink)]">
                      {fill(m.text, active || m.sample)}
                    </p>
                  )}
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[var(--ink-faint)]">
                    {!active && `${m.ids.length} ${m.ids.length === 1 ? "guest" : "guests"} · `}
                    {m.time}
                    <CheckCheck className="h-3.5 w-3.5" />
                  </p>
                </div>
              ))}
              <div ref={logEndRef} />

              <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-2">
                {image && (
                  <span className="inline-flex h-10 min-w-0 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] pl-1.5 pr-2 text-[12px] text-[var(--ink-soft)]">
                    <img
                      src={image.data}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-full object-cover"
                    />
                    <span className="max-w-[160px] truncate">{image.filename}</span>
                    <span className="shrink-0">· {image.sizeKb} KB</span>
                    <button
                      onClick={clearImage}
                      disabled={sending}
                      title="Remove poster"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-[var(--brass-soft)] disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
                <button
                  onClick={() => setMessage((m) => `${m}{{name}}`)}
                  disabled={sending}
                  title="Insert the guest's name"
                  className={pillBtn}
                >
                  <Users className="h-4 w-4 text-[var(--brass)]" />
                  {"Insert {{name}}"}
                </button>
              </div>
            </div>
          </div>

          <footer className="shrink-0 border-t border-[var(--line)]">
            {sending && (
              <div className="h-1 w-full bg-[#F8D3DC]">
                <div
                  className="h-full bg-[var(--brass)] transition-all duration-500"
                  style={{
                    width: `${(((current?.index ?? 0) + 1) / (current?.total || 1)) * 100}%`,
                  }}
                />
              </div>
            )}
            <div className="flex items-end gap-2 px-3 pt-3 sm:px-4">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePickImage}
                className="hidden"
              />
              <div className="relative flex min-w-0 flex-1 items-end rounded-[22px] border border-[var(--line)] bg-[var(--paper)] px-2 focus-within:border-[var(--brass)] transition">
                <button
                  onClick={() => setEmojiOpen((o) => !o)}
                  disabled={sending}
                  title="Emoji"
                  className="grid h-11 w-9 shrink-0 place-items-center text-[var(--brass)] disabled:opacity-50"
                >
                  <Smile className="h-5 w-5" />
                </button>
                {emojiOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setEmojiOpen(false)} />
                    <div className="absolute bottom-12 left-0 z-20 grid w-[200px] grid-cols-6 gap-1 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-2 shadow-[0_12px_30px_-12px_rgba(43,20,27,0.35)]">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => setMessage((m) => m + e)}
                          className="grid h-7 w-7 place-items-center rounded-md text-[17px] hover:bg-[var(--brass-soft)]"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {mentionMatches.length > 0 && (
                  <div className="absolute bottom-12 left-0 right-0 z-20 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)] py-1 shadow-[0_12px_30px_-12px_rgba(43,20,27,0.35)]">
                    {mentionMatches.map((c, i) => (
                      <button
                        key={c.id}
                        type="button"
                        // mousedown, not click: the textarea's blur would close
                        // the list before a click lands.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickMention(c);
                        }}
                        onMouseEnter={() => setMentionIndex(i)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left",
                          i === mentionIndex && "bg-[var(--brass-soft)]"
                        )}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F8D3DC] text-[13px] font-bold text-[var(--brass-2)]">
                          {initial(c.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
                            {c.name || "Unknown"}
                            <GroupIcons lists={allLists} groups={groups} id={c.id} className="h-3 w-3" />
                          </span>
                          <span className="block truncate text-[11px] text-[var(--ink-soft)]">
                            {c.phone || "—"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={taRef}
                  rows={1}
                  value={message}
                  onChange={handleMessageChange}
                  onKeyDown={handleMessageKeyDown}
                  onBlur={() => setMentionQuery(null)}
                  disabled={sending}
                  placeholder="Type a message... (@ to mention a guest)"
                  className="max-h-[120px] min-h-[44px] flex-1 resize-none bg-transparent px-1.5 py-[11px] text-[14px] leading-[22px] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-60"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={sending}
                  title={image ? "Replace poster" : "Attach poster"}
                  className="grid h-11 w-9 shrink-0 place-items-center text-[var(--ink-faint)] hover:text-[var(--brass)] disabled:opacity-50"
                >
                  <Paperclip className="h-5 w-5" />
                </button>
              </div>
              {sending ? (
                <button
                  onClick={stopQueue}
                  title="Stop sending"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--danger)] text-white transition"
                >
                  <Square className="h-4 w-4 fill-current" />
                </button>
              ) : (
                <button
                  onClick={runQueue}
                  disabled={!canSend}
                  title={active ? `Send to ${active.name || active.phone}` : `Send to ${recipients.length}`}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#7A0026] text-white hover:bg-[#5A0A22] disabled:opacity-40 transition"
                >
                  <Send className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
              <p className="flex min-w-0 items-center gap-1.5 truncate text-[12px] text-[var(--ink-soft)]">
                {sending ? (
                  countdown > 0 ? (
                    `Sent ${(current?.index ?? 0) + 1} of ${current?.total ?? recipients.length} · pausing ${countdown}s before the next message…`
                  ) : current ? (
                    `Sending ${current.index + 1} of ${current.total} to ${current.customer.name}… keep this tab open`
                  ) : (
                    "Working…"
                  )
                ) : (
                  <>
                    <Users className="h-4 w-4 shrink-0 text-[var(--brass)]" />
                    {active ? (
                      <>
                        Only <b className="truncate text-[var(--ink)]">{active.name || active.phone}</b>
                      </>
                    ) : (
                      <>
                        <b className="text-[var(--ink)]">{selectedList.length}</b> selected
                      </>
                    )}
                    {extraMentions > 0 && (
                      <>
                        {" "}
                        + <b className="text-[var(--ink)]">{extraMentions}</b> mentioned
                      </>
                    )}
                    <span className="mx-1 text-[var(--ink-faint)]">·</span>
                    <Clock className="h-4 w-4 shrink-0 text-[var(--brass)]" />
                    <b className="text-[var(--ink)]">{usage.remaining}</b> left this hour
                  </>
                )}
              </p>
              {sending ? (
                <button onClick={stopQueue} className={cn(darkBtn, "h-9 !bg-[var(--danger)]")}>
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={runQueue}
                  disabled={!canSend}
                  title={!ready ? "Connect WhatsApp before sending" : undefined}
                  className={cn(darkBtn, "h-9")}
                >
                  <Send className="h-3.5 w-3.5" />
                  {active && recipients.length === 1 ? "Send" : `Send to ${recipients.length}`}
                </button>
              )}
            </div>
          </footer>
        </section>
      </div>

      {newListName !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div
            className="absolute inset-0 bg-[var(--ink)]/50 backdrop-blur-sm"
            onClick={() => setNewListName(null)}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createList();
            }}
            className="relative w-full max-w-[380px] rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 shadow-[0_24px_60px_-20px_rgba(43,20,27,0.5)]"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F8D3DC] text-[var(--brass)]">
                <Tag className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[20px] font-semibold leading-none">New list</h2>
                <p className="mt-1 text-[12px] text-[var(--ink-soft)]">
                  It gets its own tab. You pick the guests next.
                </p>
              </div>
            </div>
            <input
              type="text"
              autoFocus
              maxLength={24}
              placeholder="List name, e.g. Family, Corporate"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              className="mt-4 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 text-[14px] outline-none focus:border-[var(--brass)] focus:ring-2 focus:ring-[var(--brass-soft)] transition"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setNewListName(null)} className={pillBtn}>
                Cancel
              </button>
              <button type="submit" disabled={!newListName.trim()} className={darkBtn}>
                <Plus className="h-4 w-4" />
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {picker && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div
            className="absolute inset-0 bg-[var(--ink)]/50 backdrop-blur-sm"
            onClick={() => setPicker(null)}
          />
          <div className="relative flex max-h-[85dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] shadow-[0_24px_60px_-20px_rgba(43,20,27,0.5)]">
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F8D3DC] text-[var(--brass)]">
                <pickerGroup.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[20px] font-semibold leading-none">
                  {pickerGroup.custom ? pickerGroup.label : `${pickerGroup.label} customers`}
                </h2>
                <p className="mt-1 text-[12px] text-[var(--ink-soft)]">
                  Tick the guests to show under the {pickerGroup.label} tab.
                </p>
              </div>
              <button onClick={() => setPicker(null)} title="Close" className={iconBtn}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 pt-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--brass)]" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search name or phone"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="h-10 w-full rounded-full bg-[#F7E3E8] pl-11 pr-4 text-[13px] outline-none placeholder:text-[var(--ink-faint)] focus:ring-2 focus:ring-[#F8D3DC] transition"
                />
              </div>
            </div>

            <div className="min-h-[160px] flex-1 overflow-y-auto px-2 py-2">
              {pickerRows.length === 0 ? (
                <p className="px-6 py-12 text-center text-[13px] text-[var(--ink-faint)]">
                  No customers found
                </p>
              ) : (
                pickerRows.map((c) => {
                  const ticked = picker.draft.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => togglePickerDraft(c.id)}
                      aria-pressed={ticked}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                        ticked ? "bg-[#F7E3E8]" : "hover:bg-[#F9E9ED]"
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                          ticked
                            ? "border-[var(--brass)] bg-[var(--brass)] text-white"
                            : "border-[var(--ink-faint)] bg-[var(--paper)]"
                        )}
                      >
                        {ticked && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F8D3DC] text-[14px] font-bold text-[var(--brass-2)]">
                        {initial(c.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">
                          {c.name || "Unknown"}
                        </span>
                        <span className="block truncate text-[12px] text-[var(--ink-soft)]">
                          {c.phone || "—"}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3">
              <span className="text-[12px] text-[var(--ink-soft)]">
                <b className="text-[var(--ink)]">{picker.draft.size}</b> selected
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPicker(null)} className={pillBtn}>
                  Cancel
                </button>
                <button onClick={savePicker} className={darkBtn}>
                  <Check className="h-4 w-4" />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
