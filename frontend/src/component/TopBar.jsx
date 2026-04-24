import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCart } from "../store/cartStore";
import { useUI } from "../store/uiStore";
import Icon from "./Icon";

const CONDENSE_ON = 180;
const CONDENSE_OFF = 100;
const TOGGLE_LOCK_MS = 250;

/**
 * Props:
 * - onCart: () => void
 * - onHome?: () => void
 * - isHome?: boolean
 * - restaurantName? (optional): string
 * - tableLabel? (optional): string
 */
export default function TopBar({ onCart, onHome, isHome = true, restaurantName, tableLabel }) {
  const lang = useUI((s) => s.lang);
  const setLang = useUI((s) => s.setLang);
  const storeRestaurant = useUI((s) => s.restaurantName);
  const name = restaurantName || storeRestaurant || "OPAIA Restaurant & Lounge";

  const count = useCart((s) => s.items.reduce((n, x) => n + x.qty, 0));
  const { t } = useTranslation();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef(null);
  // const [assistMenuOpen, setAssistMenuOpen] = useState(false);
  // const assistMenuRef = useRef(null);
  const [condensed, setCondensed] = useState(false);
  // const [toast, setToast] = useState(null);
  const rafRef = useRef(null);
  const toggleLockRef = useRef(0);

  useEffect(() => {
    const updateCondensed = () => {
      rafRef.current = null;
      const y = window.scrollY;
      setCondensed((prev) => {
        let next = prev;
        if (prev) {
          if (y < CONDENSE_OFF) next = false;
        } else {
          if (y > CONDENSE_ON) next = true;
        }
        if (next !== prev) {
          const now = Date.now();
          if (toggleLockRef.current > now) {
            return prev;
          }
          toggleLockRef.current = now + TOGGLE_LOCK_MS;
          return next;
        }
        return prev;
      });
    };

    const handleScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(updateCondensed);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    updateCondensed();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!langMenuOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setLangMenuOpen(false);
    };
    const handleClickOutside = (e) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) {
        setLangMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [langMenuOpen]);

  // useEffect(() => {
  //   if (!assistMenuOpen) return;
  //   const handleKey = (e) => {
  //     if (e.key === "Escape") setAssistMenuOpen(false);
  //   };
  //   const handleClickOutside = (e) => {
  //     if (assistMenuRef.current && !assistMenuRef.current.contains(e.target)) {
  //       setAssistMenuOpen(false);
  //     }
  //   };
  //   window.addEventListener("keydown", handleKey);
  //   window.addEventListener("mousedown", handleClickOutside);
  //   return () => {
  //     window.removeEventListener("keydown", handleKey);
  //     window.removeEventListener("mousedown", handleClickOutside);
  //   };
  // }, [assistMenuOpen]);

  // useEffect(() => {
  //   if (!toast) return;
  //   const timer = setTimeout(() => setToast(null), 2500);
  //   return () => clearTimeout(timer);
  // }, [toast]);


  return (
    <header
      className={`sticky top-0 z-40 border-b border-gray-100/80 bg-white/90 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70 transition-all duration-300 ${
        condensed ? "shadow-[0_10px_20px_rgba(58,46,46,0.08)]" : ""
      }`}
    >
      <div className={`mx-auto max-w-6xl px-4 sm:px-6 transition-all duration-300 ${condensed ? "py-1.5" : "py-3"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Smart Back Button - Only visible when NOT on Home */}
            {!isHome && (
              <button
                onClick={onHome}
                className="group flex items-center gap-1.5 px-2 py-2 -ml-2 rounded-xl hover:bg-gray-50 active:scale-95 transition-all duration-300"
                aria-label={t("common.back", "Back")}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--grad-start-soft)] text-[#B8860B] shadow-sm group-hover:shadow-md transition-all duration-300">
                  <Icon name={lang === 'ar' ? "chevron-right" : "chevron-left"} className="h-4 w-4 stroke-[3px]" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B8860B] hidden xs:inline-block">
                  {t("sidebar.home", "Home")}
                </span>
              </button>
            )}

            <div 
              className={`flex flex-col gap-1 items-start transition-all duration-500 ${!isHome ? "cursor-pointer" : ""}`}
              onClick={!isHome ? onHome : undefined}
            >
              {/* Tagline ABOVE the logo - ALIGNED LEFT */}
              <p 
                className={`text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.32em] transition-all duration-300 ${condensed ? "opacity-0 h-0" : "opacity-100"}`} 
                style={{ 
                  letterSpacing: "0.32em", 
                  color: 'var(--text-tertiary)',
                  textAlign: 'left'
                }}
              >
                {t("topbar.tagline")}
              </p>
              {/* Logo Image - ALIGNED LEFT */}
              <img 
                src="/opaia-logo.png" 
                alt="OPAIA Restaurant & Lounge"
                className={`transition-all duration-300 ${condensed ? "h-8 sm:h-10" : "h-16 sm:h-16 md:h-20"} ${!isHome ? "hover:opacity-100" : ""}`}
                style={{ 
                  objectFit: "contain",
                  objectPosition: "left center",
                  filter: "brightness(0) saturate(100%)",
                  opacity: isHome ? 0.85 : 0.6,
                  maxWidth: "280px"
                }}
                title={name}
              />
            </div>
          </div>

          {/* <div className="sm:hidden flex-1 text-center">
            <h1
              className={`font-bold px-2 whitespace-normal break-words leading-tight max-w-[90vw] mx-auto ${
                condensed ? "text-base" : "text-lg"
              }`}
              style={{
                background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {name}
            </h1>
          </div> */}

          <div className="flex items-center gap-2" >
            {/* Help and Call Waiter buttons hidden */}
            {/* <div className="sm:hidden relative" ref={assistMenuRef}>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-2.5 py-2 text-gray-700 transition-all duration-200 hover:bg-gray-50 hover:shadow-sm active:scale-95"
                onClick={() => setAssistMenuOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={assistMenuOpen}
                aria-label={t("topbar.help")}
              >
                <Icon name="help" className="h-4 w-4" />
              </button>

              {assistMenuOpen && (
                <div className="absolute left-0 mt-2 w-[min(11rem,80vw)] rounded-2xl border border-white/70 bg-white/95 shadow-[0_16px_32px_rgba(58,46,46,0.12)] backdrop-blur-xl py-1 z-50">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition hover:bg-[var(--grad-start-soft)]"
                    onClick={() => {
                      setToast({ message: t("topbar.help_message"), kind: "help" });
                      setAssistMenuOpen(false);
                    }}
                  >
                    <Icon name="help" className="h-4 w-4 text-[var(--grad-start)]" />
                    <span>{t("topbar.help")}</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition hover:bg-[var(--grad-start-soft)]"
                    onClick={() => {
                      setToast({ message: t("topbar.call_message"), kind: "call" });
                      setAssistMenuOpen(false);
                    }}
                  >
                    <Icon name="phone-call" className="h-4 w-4 text-[var(--grad-start)]" />
                    <span>{t("topbar.call")}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 hover:shadow-sm active:scale-95"
                onClick={() => {
                  setToast({ message: t("topbar.help_message"), kind: "help" });
                }}
              >
                <Icon name="help" className="h-4 w-4" />
                {t("topbar.help")}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 hover:shadow-sm active:scale-95"
                onClick={() => {
                  setToast({ message: t("topbar.call_message"), kind: "call" });
                }}
              >
                <Icon name="phone-call" className="h-4 w-4" />
                {t("topbar.call")}
              </button>
            </div> */}

            <div className="relative" ref={langMenuRef}>
              <button
                className="relative flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 transition-all duration-200 hover:shadow-sm active:scale-95"
                onClick={() => setLangMenuOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={langMenuOpen}
              >
                <Icon name="globe" className="h-4 w-4 text-gray-700" />
                <span className="text-sm font-medium text-gray-700 hidden sm:inline">{t("common.language")}</span>
                <Icon name="arrow-down" className={`h-4 w-4 text-gray-400 transition-transform ${langMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {langMenuOpen && (
                <div className="absolute right-0 mt-2 w-36 rounded-2xl border border-white/70 bg-white/95 shadow-[0_16px_32px_rgba(58,46,46,0.12)] backdrop-blur-xl py-1 z-50">
                  {[
                    { id: "en", label: "English" },
                    { id: "ar", label: "العربية" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setLang(opt.id);
                        setLangMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-sm transition ${
                        lang === opt.id
                          ? "text-[var(--grad-start)] font-semibold"
                          : "text-gray-600 hover:text-gray-900 hover:bg-[var(--grad-start-soft)]"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {lang === opt.id && <Icon name="check" className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* OLD TOP BAR CART BUTTON - full restore block.
                To bring back the header cart button, uncomment this block.

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-[var(--text-primary)] transition-all duration-200 hover:bg-gray-50 hover:shadow-sm active:scale-95"
              onClick={onCart}
              title="Open cart"
              aria-label="Open cart"
            >
              <Icon name="cart" className="h-4 w-4" />
              <span className="text-sm font-semibold">
                {t("common.cart")}
              </span>
              <span className="text-sm font-semibold tabular-nums text-[var(--grad-end)]">
                ({count > 99 ? "99+" : count})
              </span>
            </button>
            */}
          </div>
        </div>

        <div
          className={`h-[3px] w-full rounded-full opacity-90 transition-transform duration-300 ${
            lang === "ar" ? "origin-right" : "origin-left"
          } ${langMenuOpen ? "scale-x-100" : "scale-x-0"}`}
          style={{
            background: "linear-gradient(90deg, var(--grad-start), var(--grad-end))",
          }}
        />
      </div>

      {/* Toast notification hidden */}
      {/* {toast && (
        <div className="absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 w-[90%] max-w-sm">
          <div className="rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-sm text-gray-700 shadow-[0_16px_32px_rgba(58,46,46,0.12)] backdrop-blur-xl">
            {toast.message}
          </div>
        </div>
      )} */}
    </header>
  );
}
