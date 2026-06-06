import { useState, useEffect } from "react";
import { Download, QrCode, Loader2, Copy, Check, ExternalLink } from "lucide-react";
import { generateQRCode } from "../../services/qr.service";
import { getAreas } from "../../services/menu.service";
import { getTablesByArea } from "../../services/table.service";

export default function AdminQRCodes() {
  const [tableId, setTableId] = useState("");
  const [tableNo, setTableNo] = useState("");
  const [area, setArea] = useState("");
  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrData, setQrData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoadingAreas(true);
        const data = await getAreas();
        setAreas(data || []);
      } catch {
        setError("Failed to load areas. Please refresh the page.");
      } finally {
        setLoadingAreas(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!area) { setTables([]); setTableId(""); return; }
      const selectedAreaObj = areas.find((a) => a.areaName === area);
      if (!selectedAreaObj || !selectedAreaObj.areaId) { setTables([]); setTableId(""); return; }
      try {
        setLoadingTables(true);
        setTableId(""); setTableNo(""); setError("");
        const tablesData = await getTablesByArea(selectedAreaObj.areaId);
        setTables(tablesData || []);
      } catch {
        setError("Failed to load tables for selected area.");
        setTables([]);
      } finally {
        setLoadingTables(false);
      }
    })();
  }, [area, areas]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!tableId.trim()) return setError("Table ID is required");
    if (!area || !area.trim()) return setError("Please select an area");
    setLoading(true); setError(""); setQrData(null); setCopied(false); setCopiedImage(false);
    if (!tableNo && tableId) {
      const t = tables.find((t) => String(t.id) === tableId);
      if (t) setTableNo(t.number || t.id);
    }
    const selectedArea = area.trim() || (areas.length > 0 ? areas[0].areaName : "DININ");
    try {
      const result = await generateQRCode(tableId.trim(), selectedArea);
      if (result.ok) setQrData(result);
      else setError(result.error || "Failed to generate QR code");
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!qrData?.qrCode) return;
    const link = document.createElement("a");
    link.href = qrData.qrCode;
    link.download = tableNo ? `qr_table_${tableNo}.png` : `qr_table_${qrData.tableId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyUrl = async () => {
    if (!qrData?.url) return;
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(qrData.url); setCopied(true); setTimeout(() => setCopied(false), 2000); return; } catch { /* fallthrough */ }
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = qrData.url; ta.style.position = "fixed"; ta.style.left = "-999999px";
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand("copy"); document.body.removeChild(ta);
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); } else throw new Error("copy failed");
    } catch {
      alert(`Please copy this URL manually:\n\n${qrData.url}`);
    }
  };

  const handleCopyQRCode = async () => {
    if (!qrData?.qrCode) return;
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        const blob = await (await fetch(qrData.qrCode)).blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        setCopiedImage(true); setTimeout(() => setCopiedImage(false), 2000); return;
      } catch { /* fallthrough */ }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(qrData.qrCode);
        setCopiedImage(true); setTimeout(() => setCopiedImage(false), 2000);
        alert("QR code data URL copied to clipboard."); return;
      } catch { /* fallthrough */ }
    }
    alert("Unable to copy QR code. Downloading the image instead…");
    handleDownload();
  };

  const selectCls = "w-full rounded-xl bg-[var(--paper)] border border-[var(--line)] px-4 py-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--brass)] focus:ring-2 focus:ring-[var(--brass-soft)] transition";

  return (
    <div className="space-y-8">
      <div>
        <p className="admin-eyebrow">The table · access</p>
        <h1 className="font-display text-[40px] sm:text-[48px] leading-[0.95] text-[var(--ink)] mt-1">QR codes</h1>
        <p className="text-[15px] text-[var(--ink-faint)] mt-3 max-w-lg">Generate a menu QR for any dine-in table, then download or share the link.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2 items-start">
      <div className="admin-card p-6 sm:p-7 admin-rise">
        <form onSubmit={handleGenerate} className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="admin-eyebrow mb-2">Area</p>
              {loadingAreas ? (
                <div className={`${selectCls} flex items-center gap-2`}><Loader2 className="h-4 w-4 animate-spin text-[var(--ink-faint)]" /><span className="text-[var(--ink-faint)] text-sm">Loading areas…</span></div>
              ) : (
                <select value={area} onChange={(e) => setArea(e.target.value)} disabled={loading || areas.length === 0} className={selectCls}>
                  <option value="">Select an area</option>
                  {areas.map((a) => <option key={a.areaId} value={a.areaName}>{a.areaName}</option>)}
                </select>
              )}
            </div>
            <div>
              <p className="admin-eyebrow mb-2">Table</p>
              {!area ? (
                <div className={`${selectCls} text-[var(--ink-faint)] text-sm`}>Select an area first</div>
              ) : loadingTables ? (
                <div className={`${selectCls} flex items-center gap-2`}><Loader2 className="h-4 w-4 animate-spin text-[var(--ink-faint)]" /><span className="text-[var(--ink-faint)] text-sm">Loading tables…</span></div>
              ) : (
                <select value={tableId} disabled={loading || tables.length === 0}
                  onChange={(e) => { const id = e.target.value; setTableId(id); const t = tables.find((t) => String(t.id) === id); setTableNo(t ? (t.number || t.id) : ""); }}
                  className={selectCls}>
                  <option value="">Select a table</option>
                  {tables.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name || `Table ${t.number || t.id}`}{t.capacity ? ` (${t.capacity} seats)` : ""}{t.status === "Occupied" ? " — Occupied" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {error && <div className="rounded-xl bg-[#F6E7E2] border border-[#E3C4BB] text-[var(--danger)] text-sm px-4 py-2.5">{error}</div>}

          <button type="submit" disabled={loading} className="admin-btn-brass inline-flex items-center gap-2 px-7 py-3.5 font-bold text-[15px] disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            Generate QR
          </button>
        </form>
      </div>

      {/* Result rail */}
      <div className="admin-card p-6 sm:p-7 admin-rise" style={{ animationDelay: "120ms" }}>
        {!qrData ? (
          <div className="h-full min-h-[320px] grid place-items-center text-center">
            <div>
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-[var(--cream-2)]">
                <QrCode className="h-7 w-7 text-[var(--brass)]" />
              </div>
              <p className="font-display text-2xl text-[var(--ink-faint)]">No code yet</p>
              <p className="text-sm text-[var(--ink-faint)] mt-1">Pick an area and table, then generate.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="relative group rounded-2xl bg-[var(--paper)] border border-[var(--line)] p-4 mb-6">
              <img src={qrData.qrCode} alt={`QR for table ${qrData.tableId}`} className="w-56 h-56 md:w-64 md:h-64" />
              <button onClick={handleCopyQRCode} title="Copy image"
                className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-[var(--ink)] text-[var(--cream)] px-3 py-1.5 text-xs opacity-0 group-hover:opacity-100 transition">
                {copiedImage ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            </div>

            <div className="w-full space-y-3 text-left">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[var(--cream-2)] px-4 py-3"><p className="admin-eyebrow">Table</p><p className="font-display text-lg text-[var(--ink)] mt-0.5">{qrData.tableId}</p></div>
                <div className="rounded-xl bg-[var(--cream-2)] px-4 py-3"><p className="admin-eyebrow">Area</p><p className="font-display text-lg text-[var(--ink)] mt-0.5">{qrData.area}</p></div>
              </div>
              <div className="rounded-xl bg-[var(--cream-2)] px-4 py-3">
                <p className="admin-eyebrow mb-2">Generated link</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="text" value={qrData.url} readOnly className="flex-1 min-w-0 rounded-lg bg-[var(--paper)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink-soft)]" />
                  <button type="button" onClick={() => window.open(qrData.url, "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--paper)] px-3.5 py-2 text-sm font-semibold text-[var(--ink-soft)] hover:border-[var(--brass)] transition"><ExternalLink className="h-4 w-4" /> Open</button>
                  <button onClick={handleCopyUrl} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--paper)] px-3.5 py-2 text-sm font-semibold text-[var(--ink-soft)] hover:border-[var(--brass)] transition">{copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}</button>
                </div>
              </div>
              <button onClick={handleDownload} className="admin-btn-brass w-full inline-flex items-center justify-center gap-2 py-3 font-bold text-[15px]"><Download className="h-4 w-4" /> Download QR</button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
