import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, ChevronRight, Utensils, Clock, X, ScanLine } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

const SCANNER_ID = "opaia-qr-scanner";

const isAppDomain =
  typeof window !== "undefined" &&
  window.location.hostname.startsWith("app.");

const MENU_URL = isAppDomain
  ? "https://deynoqr.com/opaia/menu"
  : "/menu";

export default function OpaiaEntryPage() {
  const navigate = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState("");
  const scannerRef = useRef(null);

  useEffect(() => {
    const prev = document.title;
    document.title = "Opaia - Welcome";
    return () => { document.title = prev; };
  }, []);

  async function startScanner() {
    setScanError("");
    setScannerOpen(true);
  }

  useEffect(() => {
    if (!scannerOpen) return;

    let scanner;

    async function init() {
      if (!window.isSecureContext) {
        setScanError("Camera requires HTTPS. Open via localhost or a secure (https://) address.");
        return;
      }
      try {
        scanner = new Html5Qrcode(SCANNER_ID);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            handleScanResult(decodedText, scanner);
          },
          () => {}
        );
      } catch (err) {
        setScanError(
          err?.message?.includes("Permission") || err?.name === "NotAllowedError"
            ? "Camera access denied. Allow camera permission in browser settings."
            : "Could not start camera. Try again."
        );
      }
    }

    init();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [scannerOpen]);

  function handleScanResult(text, scanner) {
    if (scanner) scanner.stop().catch(() => {});
    scannerRef.current = null;
    setScannerOpen(false);

    try {
      const url = new URL(text);
      // Same origin — use react-router navigate
      if (url.origin === window.location.origin) {
        navigate(url.pathname + url.search + url.hash);
      } else {
        window.location.href = text;
      }
    } catch {
      // Not a URL — treat as table token path
      navigate(`/r/${text}`);
    }
  }

  function closeScanner() {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    setScannerOpen(false);
    setScanError("");
  }

  return (
    <div className="min-h-[100dvh] bg-stone-50 text-zinc-900 flex flex-col">
      {/* Ambient glow */}
      <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[160px] opacity-30"
          style={{ background: "#780829" }}
        />
      </div>

      {/* Top bar */}
      <header
        className="relative z-10 flex items-center justify-between px-6 py-4 border-b bg-white/80 backdrop-blur-sm"
        style={{ borderColor: "#e4cdd4" }}
      >
        <a href="/" className="flex items-center gap-2 group" title="DeynoQR Home">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center transition-opacity group-hover:opacity-80"
            style={{ background: "#780829" }}
          >
            <QrCode className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-xs text-zinc-400 group-hover:text-zinc-600 transition-colors">
            Powered by DeynoQR
          </span>
        </a>
        <a
          href={MENU_URL}
          className="text-xs font-medium transition-colors hover:opacity-70"
          style={{ color: "#780829" }}
        >
          Skip to menu
        </a>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        {/* Hero image */}
        <div className="relative mb-8">
          <div
            className="w-28 h-28 rounded-3xl overflow-hidden border-2 shadow-lg"
            style={{ borderColor: "#e4cdd4", boxShadow: "0 8px 32px rgba(120,8,41,0.12)" }}
          >
            <img
              src="/opaia.avif"
              alt="Opaia restaurant"
              className="w-full h-full object-cover"
              loading="eager"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
          <div
            className="absolute -bottom-2 -right-2 flex items-center gap-1 bg-white rounded-full px-2.5 py-1 border shadow-sm"
            style={{ borderColor: "#e4cdd4" }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-semibold text-zinc-700">Open</span>
          </div>
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-zinc-900 mb-2">
          Opaia
        </h1>
        <p className="text-base mb-1" style={{ color: "#780829" }}>Welcome</p>
        <p className="text-zinc-400 text-sm max-w-[28ch] leading-relaxed mb-10">
          Browse our menu and place your order directly from this page.
        </p>

        {/* Info chips */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border"
            style={{ background: "#f1e6e9", borderColor: "#e4cdd4", color: "#780829" }}
          >
            <Utensils className="w-3.5 h-3.5" strokeWidth={1.75} />
            International Cuisine
          </div>
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border"
            style={{ background: "#f1e6e9", borderColor: "#e4cdd4", color: "#780829" }}
          >
            <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
            Dine-in & Takeaway
          </div>
        </div>

        {/* Scan QR card */}
        <div
          className="mb-8 w-full max-w-sm bg-white rounded-2xl p-4 flex items-center gap-4 text-left border"
          style={{ borderColor: "#e4cdd4", boxShadow: "0 2px 12px rgba(120,8,41,0.06)" }}
        >
          <div
            className="flex-none w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "#f1e6e9" }}
          >
            <QrCode className="w-6 h-6" style={{ color: "#780829" }} strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-zinc-800 mb-0.5">At your table?</p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Scan the QR code on your table for a personalised ordering experience.
            </p>
          </div>
          <button
            onClick={startScanner}
            className="flex-none flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-opacity hover:opacity-85 active:scale-95"
            style={{ background: "#780829" }}
          >
            <ScanLine className="w-3.5 h-3.5" strokeWidth={2} />
            Scan
          </button>
        </div>

        {/* Primary CTA */}
        <a
          href={MENU_URL}
          className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full text-white font-bold text-base active:scale-95 transition-all shadow-lg hover:opacity-90"
          style={{ background: "#780829", boxShadow: "0 8px 24px rgba(120,8,41,0.25)" }}
        >
          Go to Menu
          <ChevronRight className="w-5 h-5" strokeWidth={2.5} />
        </a>

        <p className="mt-4 text-xs text-zinc-400">No account or app needed</p>
      </main>

      {/* Footer */}
      <footer
        className="relative z-10 py-5 text-center border-t bg-white/60"
        style={{ borderColor: "#e4cdd4" }}
      >
        <a
          href="/"
          className="text-xs transition-colors hover:opacity-70"
          style={{ color: "#780829" }}
        >
          Powered by DeynoQR
        </a>
      </footer>

      {/* QR Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
          {/* Modal header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-white" strokeWidth={2} />
              <span className="text-sm font-semibold text-white">Scan Table QR Code</span>
            </div>
            <button
              onClick={closeScanner}
              className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition-colors"
            >
              <X className="w-4 h-4 text-zinc-300" />
            </button>
          </div>

          {/* Camera view */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
            {scanError ? (
              <div className="text-center">
                <p className="text-red-400 text-sm mb-4">{scanError}</p>
                <button
                  onClick={() => { setScanError(""); startScanner(); }}
                  className="px-4 py-2 rounded-xl text-white text-sm font-medium"
                  style={{ background: "#780829" }}
                >
                  Try Again
                </button>
              </div>
            ) : (
              <>
                <p className="text-zinc-400 text-sm text-center">
                  Point your camera at the QR code on your table
                </p>
                {/* Scanner mounts here */}
                <div
                  id={SCANNER_ID}
                  className="w-full max-w-sm rounded-2xl overflow-hidden"
                  style={{ minHeight: 300 }}
                />
                {/* Scan line animation overlay hint */}
                <p className="text-zinc-600 text-xs">Hold steady until detected</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
