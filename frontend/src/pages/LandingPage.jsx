import { useEffect, useLayoutEffect } from "react";
import {
  QrCode,
  ShoppingCart,
  LayoutDashboard,
  Smartphone,
  CreditCard,
  Calendar,
  Zap,
  ChevronRight,
  Utensils,
  Users,
  Globe,
  Wallet,
  ArrowRight,
  GitFork,
  Receipt,
  Scissors,
  Star,
} from "lucide-react";
import { clients } from "../data/clients";

/* Brand palette
   Primary:  #780829
   Dark:     #85203e  (hover)
   Mid:      #933953 / #a05269
   Soft:     #c99ca9 / #d6b4be
   Light:    #e4cdd4 / #f1e6e9
*/

function useScrollSmooth() {
  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "smooth";
    return () => { document.documentElement.style.scrollBehavior = prev; };
  }, []);
}

function useReveal() {
  useLayoutEffect(() => {
    const markVisible = () => {
      const vh = window.innerHeight;
      document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => {
        const { top, bottom } = el.getBoundingClientRect();
        if (top < vh + 400 && bottom > 0) el.classList.add("is-visible");
      });
    };
    markVisible();
    const raf = requestAnimationFrame(markVisible);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(markVisible));

    // Scroll listener — fires markVisible on every scroll tick
    window.addEventListener("scroll", markVisible, { passive: true });

    // Nuclear fallback — after 600ms make everything visible regardless
    const timer = setTimeout(() => {
      document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => el.classList.add("is-visible"));
    }, 600);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add("is-visible"); observer.unobserve(e.target); }
        });
      },
      { threshold: 0, rootMargin: "0px 0px 400px 0px" }
    );
    document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => observer.observe(el));
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
      clearTimeout(timer);
      window.removeEventListener("scroll", markVisible);
      observer.disconnect();
    };
  }, []);
}

const navItems = [
  { href: "#features", label: "Features" },
  { href: "#clients", label: "Clients" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#payments", label: "Billing" },
];

const marqueeItems = [
  { icon: QrCode, text: "Digital QR menu" },
  { icon: ShoppingCart, text: "Customer ordering" },
  { icon: GitFork, text: "Bill splitting" },
  { icon: Zap, text: "Real-time kitchen orders" },
  { icon: Calendar, text: "Table reservations" },
  { icon: Users, text: "Waitlist management" },
  { icon: Smartphone, text: "Mobile-first design" },
  { icon: CreditCard, text: "Payment integration" },
  { icon: LayoutDashboard, text: "Admin dashboard" },
  { icon: Receipt, text: "Itemised billing" },
];

const steps = [
  {
    num: "01",
    icon: LayoutDashboard,
    title: "Set up your menu",
    desc: "Add items, categories, photos, and prices through the admin panel. Go live in minutes.",
  },
  {
    num: "02",
    icon: QrCode,
    title: "Print your table QR codes",
    desc: "Generate unique QR codes for each table. Customers scan with any phone camera. No app required.",
  },
  {
    num: "03",
    icon: Zap,
    title: "Orders and payments flow in",
    desc: "Customers browse, order, and settle the bill from their seats. The kitchen receives orders instantly.",
  },
];

const smallFeatures = [
  {
    icon: Utensils,
    title: "Table ordering",
    desc: "Each table has its own QR. Orders are tracked automatically by table number.",
  },
  {
    icon: Smartphone,
    title: "Mobile-first design",
    desc: "Built for phones. Fast, responsive, works on any device without installation.",
  },
  {
    icon: Calendar,
    title: "Reservations",
    desc: "Table bookings with floor-plan management, walk-in queues, and SMS confirmations.",
  },
  {
    icon: Users,
    title: "Waitlist management",
    desc: "Real-time waitlist updates and automatic SMS notifications keep guests informed.",
  },
  {
    icon: CreditCard,
    title: "Payment ready",
    desc: "Cash, card, online, and full bill-splitting built in. Right from the table.",
  },
];

/* Card scheme acceptance marks (Telr/bank website requirement:
   accepted card logos must be visible on the home page) */
function VisaLogo({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Visa" fill="#1A1F71">
      <path d="M9.112 8.262 5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 0 1 .894.764l.817 4.338 2.018-5.102h2.037zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 0 1 1.913.336l.34-1.59a5.207 5.207 0 0 0-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 0 0-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656 1.02-2.815.588 2.815zm-8.16-4.84-1.603 7.496H8.34l1.605-7.496z" />
    </svg>
  );
}

function MastercardLogo({ className }) {
  return (
    <svg viewBox="0 0 48 30" className={className} role="img" aria-label="Mastercard">
      <circle cx="19" cy="15" r="14" fill="#EB001B" />
      <circle cx="29" cy="15" r="14" fill="#F79E1B" />
      <path d="M24 1.92 A14 14 0 0 1 24 28.08 A14 14 0 0 1 24 1.92 Z" fill="#FF5F00" />
    </svg>
  );
}

export default function LandingPage() {
  useScrollSmooth();
  useReveal();

  useEffect(() => {
    const prev = document.title;
    document.title = "DeynoQR - Ordering and Payment Partner for Restaurants";
    return () => { document.title = prev; };
  }, []);

  const marqueeList = [...marqueeItems, ...marqueeItems];

  return (
    <div
      className="min-h-[100dvh] bg-stone-50 text-zinc-900 overflow-x-hidden"
      style={{ fontFamily: '"Hanken Grotesk", system-ui, sans-serif' }}
    >
      <div aria-hidden className="lp-noise" />

      {/* ══════════════════════════════════════
          NAV
      ══════════════════════════════════════ */}
      <div className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
        <header className="pointer-events-auto flex items-center gap-1 px-1.5 py-1.5 rounded-full bg-zinc-900/96 backdrop-blur-md border border-zinc-800/70 shadow-xl shadow-black/40">
          <a href="/" className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-zinc-800/60 transition-all duration-200 group flex-none">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center group-hover:opacity-90 transition-opacity"
              style={{ background: "#780829" }}
            >
              <QrCode className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-zinc-50 text-sm tracking-tight">DeynoQR</span>
          </a>

          <div className="hidden md:block w-px h-5 bg-zinc-700/60 mx-0.5" />

          <nav className="hidden md:flex items-center">
            {navItems.map(({ href, label }) => (
              <a key={href} href={href} className="px-3 py-1.5 rounded-full text-[13px] text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/60 transition-all duration-200">
                {label}
              </a>
            ))}
          </nav>

          <div className="hidden md:block w-px h-5 bg-zinc-700/60 mx-0.5" />

          <a
            href="mailto:info@deynotech.com"
            className="flex-none inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-[13px] font-semibold active:scale-95 transition-all duration-200"
            style={{ background: "#780829" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#85203e"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#780829"; }}
          >
            Get started
          </a>
        </header>
      </div>

      {/* ══════════════════════════════════════
          HERO — bento grid
      ══════════════════════════════════════ */}
      <section className="relative min-h-[100dvh] flex items-center pt-24 pb-12 overflow-hidden" style={{ background: "#f1e6e9" }}>
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            backgroundImage: "radial-gradient(circle, #c99ca9 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid grid-cols-12 gap-3 sm:gap-4">

            {/* Main headline card */}
            <div
              className="col-span-12 lg:col-span-7 bg-white rounded-3xl p-8 sm:p-10 border flex flex-col justify-between min-h-[320px] lg:min-h-[380px] landing-fade-in-up"
              style={{ borderColor: "#e4cdd4", boxShadow: "0 1px 4px rgba(120,8,41,0.04), 0 8px 28px rgba(120,8,41,0.06)" }}
            >
              <div>
                <h1
                  className="text-[2rem] sm:text-[2.75rem] lg:text-[3.25rem] font-bold tracking-[-0.03em] leading-[1.08] text-zinc-950 mb-5"
                  style={{ textWrap: "balance" }}
                >
                  <span style={{ color: "#780829" }}>Your payment partner</span>
                  <br />
                  built for restaurants.
                </h1>

                <p className="text-zinc-500 text-sm sm:text-base leading-relaxed max-w-[44ch]">
                  Stop chasing bills at the end of the night. DeynoQR lets guests
                  split, pay, and settle — any method, any split — while your
                  staff focus on what actually matters.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 mt-8">
                <a
                  href="mailto:info@deynotech.com"
                  className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full text-white font-semibold text-sm active:scale-[0.97] transition-all duration-200 group"
                  style={{ background: "#780829", boxShadow: "0 6px 20px rgba(120,8,41,0.28)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#85203e"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#780829"; }}
                >
                  Get started
                  <span className="w-5 h-5 rounded-full flex items-center justify-center group-hover:translate-x-0.5 transition-transform" style={{ background: "rgba(255,255,255,0.18)" }}>
                    <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
                  </span>
                </a>
                <a
                  href="/opaia"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full border font-semibold text-sm hover:bg-stone-50 active:scale-[0.97] transition-all duration-200"
                  style={{ borderColor: "#e4cdd4", color: "#780829" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#c99ca9"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e4cdd4"; }}
                >
                  See live demo
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </a>
              </div>
            </div>

            {/* QR brand card */}
            <div
              className="col-span-12 lg:col-span-5 rounded-3xl flex flex-col items-center justify-center text-center relative overflow-hidden landing-fade-in"
              style={{
                background: "linear-gradient(145deg, #780829 0%, #85203e 55%, #933953 100%)",
                boxShadow: "0 4px 20px rgba(120,8,41,0.28), 0 12px 40px rgba(120,8,41,0.18)",
                padding: "clamp(2rem, 5vw, 3rem)",
                minHeight: "clamp(280px, 40vw, 380px)",
              }}
            >
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none opacity-[0.08]"
                style={{
                  backgroundImage: "radial-gradient(circle, #f1e6e9 1px, transparent 1px)",
                  backgroundSize: "18px 18px",
                }}
              />

              {/* QR double-bezel */}
              <div className="relative mb-4 p-2.5 rounded-[1.5rem] border" style={{ background: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.2)" }}>
                <div
                  className="p-3.5 rounded-[1rem] bg-white"
                  style={{ boxShadow: "inset 0 1px 0 rgba(0,0,0,0.04), 0 4px 12px rgba(120,8,41,0.15)" }}
                >
                  <QrCode className="w-12 h-12 sm:w-14 sm:h-14" style={{ color: "#780829" }} strokeWidth={1.5} />
                </div>
              </div>

              <p className="relative text-white text-xl sm:text-2xl font-bold tracking-tight mb-1">Payments, handled.</p>
              <p className="relative text-sm font-medium mb-6" style={{ color: "#d6b4be" }}>Cash · Card · Online</p>

              {/* Badge inline (not absolute) so it never overlaps on small screens */}
              <div className="relative rounded-xl px-3 py-1.5" style={{ background: "rgba(255,255,255,0.13)" }}>
                <p className="text-[11px] font-semibold text-white">Zero extra hardware</p>
              </div>
            </div>

            {/* Stat card */}
            <div
              className="col-span-12 sm:col-span-6 rounded-2xl p-6 flex flex-col justify-between min-h-[140px] landing-fade-in-up"
              style={{ background: "#780829", boxShadow: "0 4px 16px rgba(120,8,41,0.2)" }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#c99ca9" }}>Settlement speed</p>
              <div>
                <p className="text-4xl font-bold text-white tracking-tight leading-none">Instant</p>
                <p className="text-xs mt-1.5" style={{ color: "#c99ca9" }}>Every payment method</p>
              </div>
            </div>

            {/* Bill split card */}
            <div
              className="col-span-12 sm:col-span-6 bg-white border rounded-2xl p-6 flex flex-col justify-between min-h-[140px] landing-fade-in-up-delay-1"
              style={{ borderColor: "#e4cdd4", boxShadow: "0 1px 4px rgba(120,8,41,0.04), 0 4px 12px rgba(120,8,41,0.06)" }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#c99ca9" }}>Bill splitting</p>
              <div className="flex flex-col gap-2">
                {["Equal split", "Split by items", "Custom amount"].map((label) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: "#780829" }} />
                    <span className="text-sm font-medium text-zinc-700">{label}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px]" style={{ color: "#c99ca9" }}>3 ways to pay, every time</p>
            </div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          MARQUEE STRIP
      ══════════════════════════════════════ */}
      <div className="bg-white border-y py-4 overflow-hidden" style={{ borderColor: "#e4cdd4" }}>
        <div className="lp-marquee-track select-none" aria-hidden>
          {marqueeList.map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-7 flex-shrink-0">
              <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: "#780829" }} strokeWidth={1.75} />
              <span className="text-sm font-medium text-zinc-500 whitespace-nowrap">{item.text}</span>
              <span className="w-1 h-1 rounded-full ml-4 flex-shrink-0" style={{ background: "#d6b4be" }} />
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════
          CLIENTS
      ══════════════════════════════════════ */}
      <section id="clients" className="py-24 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-14 reveal">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-3" style={{ color: "#780829" }}>Our clients</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
              Restaurants using DeynoQR
            </h2>
            <p className="text-zinc-500 mt-3 text-sm sm:text-base max-w-md">
              Businesses that have gone digital with our platform.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {clients.map((client) => (
              <a
                key={client.id}
                href={client.entryPath}
                className="group bg-white border rounded-2xl hover:-translate-y-1.5 transition-all duration-300 block reveal"
                style={{ borderColor: "#e4cdd4", boxShadow: "0 1px 3px rgba(120,8,41,0.04), 0 4px 12px rgba(120,8,41,0.05)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#c99ca9";
                  e.currentTarget.style.boxShadow = "0 8px 32px rgba(120,8,41,0.12), 0 2px 8px rgba(120,8,41,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#e4cdd4";
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(120,8,41,0.04), 0 4px 12px rgba(120,8,41,0.05)";
                }}
              >
                {/* Cover image with centered logo overlay */}
                <div className="h-52 overflow-hidden rounded-t-2xl relative">
                  <img
                    src={client.imageUrl}
                    alt={`${client.name} dining area`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <div className="absolute inset-0 bg-zinc-950/50" />
                  {client.status === "live" && (
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 border border-zinc-200/60">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-semibold text-zinc-700">Live</span>
                    </div>
                  )}
                  {client.status === "coming_soon" && (
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 border border-zinc-200/60">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[10px] font-semibold text-zinc-700">Launching Soon</span>
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-zinc-900 text-lg">{client.name}</h3>
                    <span className="text-[11px] text-zinc-400 border border-zinc-200 rounded-full px-2.5 py-0.5">
                      {client.category}
                    </span>
                  </div>
                  <p className="text-zinc-500 text-sm mb-5 line-clamp-2">{client.description}</p>
                  {client.status !== "coming_soon" && (
                    <div className="flex items-center gap-1.5 text-sm font-semibold transition-colors group-hover:opacity-80" style={{ color: "#780829" }}>
                      View menu
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" strokeWidth={2.5} />
                    </div>
                  )}
                </div>
              </a>
            ))}

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FEATURES
      ══════════════════════════════════════ */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-14 reveal">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
              Everything your restaurant needs
            </h2>
            <p className="text-zinc-500 mt-3 text-sm sm:text-base max-w-md">
              From QR menus to admin panels, DeynoQR covers the full digital dining experience.
            </p>
          </div>

          {/* Bento grid — 3 col, 4 rows, 12 cells */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Row 1 col 1-2 — QR Menu hero tile */}
            <div
              className="lg:col-span-2 relative rounded-2xl overflow-hidden flex flex-col justify-between p-8 min-h-[280px] reveal"
              style={{ background: "linear-gradient(135deg, #f1e6e9 0%, #e4cdd4 55%, #c99ca9 100%)" }}
            >
              <div className="relative z-10 max-w-[36ch]">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-6"
                  style={{ background: "rgba(120,8,41,0.1)", border: "1px solid rgba(120,8,41,0.18)" }}
                >
                  <QrCode className="w-5 h-5" style={{ color: "#780829" }} strokeWidth={2} />
                </div>
                <h3 className="font-bold text-zinc-950 text-2xl mb-3 tracking-tight">Digital QR menu</h3>
                <p className="text-zinc-700 text-sm leading-relaxed">
                  Scan and browse the full menu instantly. Photos, descriptions, and modifiers all on the customer&apos;s phone. Updates are live.
                </p>
              </div>
              <div className="relative z-10 mt-6 flex flex-wrap gap-2">
                {["No app required", "Real-time updates", "Multi-language"].map((tag) => (
                  <span
                    key={tag}
                    className="text-xs rounded-full px-3 py-1 font-medium"
                    style={{ background: "rgba(120,8,41,0.09)", border: "1px solid rgba(120,8,41,0.15)", color: "#780829" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Row 1-2 col 3 — Admin Dashboard, spans 2 rows */}
            <div
              className="lg:row-span-2 relative rounded-2xl p-7 flex flex-col justify-between min-h-[280px] overflow-hidden reveal"
              style={{ background: "linear-gradient(160deg, #4a0518 0%, #780829 60%, #9a1035 100%)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
              <div className="relative z-10">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-6"
                  style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
                >
                  <LayoutDashboard className="w-5 h-5 text-white" strokeWidth={1.75} />
                </div>
                <h3 className="font-bold text-white text-xl mb-3 tracking-tight">Admin dashboard</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
                  Manage your menu, view live orders, handle reservations, and control all settings from one place.
                </p>
              </div>
              <div className="relative z-10 mt-6 flex flex-col gap-2.5">
                {[
                  ["Live orders", "Updated instantly"],
                  ["Menu control", "Edit anytime"],
                  ["Reservations", "Full calendar"],
                ].map(([label, sub]) => (
                  <div
                    key={label}
                    className="rounded-xl px-4 py-3 flex items-center justify-between"
                    style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 2 col 1 — Table ordering */}
            <div className="bg-stone-50 border rounded-2xl p-6 reveal" style={{ borderColor: "#e4cdd4" }}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "#f1e6e9", border: "1px solid #e4cdd4" }}
              >
                <Utensils className="w-5 h-5" style={{ color: "#780829" }} strokeWidth={1.75} />
              </div>
              <h3 className="font-bold text-zinc-900 text-base mb-1.5 tracking-tight">Table ordering</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">Each table has its own QR. Orders tracked automatically by table number.</p>
            </div>

            {/* Row 2 col 2 — Mobile-first */}
            <div className="bg-white border rounded-2xl p-6 reveal" style={{ borderColor: "#e4cdd4", boxShadow: "0 1px 3px rgba(120,8,41,0.03)" }}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "#f1e6e9", border: "1px solid #e4cdd4" }}
              >
                <Smartphone className="w-5 h-5" style={{ color: "#780829" }} strokeWidth={1.75} />
              </div>
              <h3 className="font-bold text-zinc-900 text-base mb-1.5 tracking-tight">Mobile-first design</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">Built for phones. Fast, responsive, works on any device without installation.</p>
            </div>

            {/* Row 3 col 1-2 — Reservations, wider */}
            <div
              className="lg:col-span-2 relative rounded-2xl p-6 overflow-hidden reveal"
              style={{ background: "#fdf5f7", border: "1px solid #e4cdd4" }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex-none w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "#f1e6e9", border: "1px solid #e4cdd4" }}
                >
                  <Calendar className="w-5 h-5" style={{ color: "#780829" }} strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 text-base mb-1.5 tracking-tight">Reservations</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed max-w-[44ch]">Table bookings with floor-plan management, walk-in queues, and SMS confirmations.</p>
                </div>
              </div>
              <div className="absolute right-5 top-1/2 -translate-y-1/2 hidden sm:flex flex-col gap-1.5 opacity-40 pointer-events-none">
                {["12:00 reserved", "1:30 reserved", "6:00 reserved"].map((t) => (
                  <div
                    key={t}
                    className="text-[10px] font-medium text-zinc-500 bg-white rounded-lg px-2.5 py-1 border"
                    style={{ borderColor: "#e4cdd4" }}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Row 3 col 3 — Waitlist */}
            <div className="bg-white border rounded-2xl p-6 reveal" style={{ borderColor: "#e4cdd4" }}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "#f1e6e9", border: "1px solid #e4cdd4" }}
              >
                <Users className="w-5 h-5" style={{ color: "#780829" }} strokeWidth={1.75} />
              </div>
              <h3 className="font-bold text-zinc-900 text-base mb-1.5 tracking-tight">Waitlist</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">SMS notifications keep guests informed as tables free up.</p>
              <div className="mt-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-zinc-400">Live updates</span>
              </div>
            </div>

            {/* Row 4 col 1-3 — Payment, full-width band */}
            <div
              className="lg:col-span-3 rounded-2xl p-7 border reveal"
              style={{ background: "#fdf5f7", borderColor: "#e4cdd4" }}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div
                    className="flex-none w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: "#f1e6e9", border: "1px solid #e4cdd4" }}
                  >
                    <CreditCard className="w-5 h-5" style={{ color: "#780829" }} strokeWidth={1.75} />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 text-base mb-1 tracking-tight">Payment ready</h3>
                    <p className="text-zinc-500 text-sm max-w-[44ch] leading-relaxed">Cash, card, online, and full bill-splitting built in. Right from the table.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Cash", "Card", "Online", "Bill split"].map((method) => (
                    <span
                      key={method}
                      className="text-xs font-semibold rounded-full px-4 py-2"
                      style={{ background: "rgba(120,8,41,0.08)", border: "1px solid rgba(120,8,41,0.14)", color: "#780829" }}
                    >
                      {method}
                    </span>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════ */}
      <section id="how-it-works" className="py-24 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-16 items-start">
            <div className="lg:sticky lg:top-28 reveal">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 mb-4">
                Up and running in three steps
              </h2>
              <p className="text-zinc-500 text-sm sm:text-base leading-relaxed max-w-xs">
                DeynoQR is built to deploy fast. Most restaurants go live the same day.
              </p>
              <a
                href="mailto:info@deynotech.com"
                className="inline-flex items-center gap-2.5 mt-8 px-6 py-3 rounded-full text-white font-semibold text-sm active:scale-[0.97] transition-all duration-200 group"
                style={{ background: "#780829" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#85203e"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#780829"; }}
              >
                Get started
                <span className="w-5 h-5 rounded-full flex items-center justify-center group-hover:translate-x-0.5 transition-transform" style={{ background: "rgba(255,255,255,0.18)" }}>
                  <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
                </span>
              </a>
            </div>

            <div className="flex flex-col">
              {steps.map((step, i) => (
                <div key={step.num} className={`flex gap-6 reveal${i > 0 ? ` reveal-d${i}` : ""}`}>
                  <div className="flex flex-col items-center flex-none">
                    <div
                      className="w-12 h-12 rounded-xl bg-white border flex items-center justify-center flex-none"
                      style={{ borderColor: "#e4cdd4", boxShadow: "0 2px 8px rgba(120,8,41,0.06)" }}
                    >
                      <span className="text-sm font-bold font-mono" style={{ color: "#c99ca9" }}>{step.num}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className="w-px flex-1 mt-4 mb-4 min-h-[3rem]" style={{ background: "linear-gradient(to bottom, #e4cdd4, #f1e6e9)" }} />
                    )}
                  </div>
                  <div className={`pt-2.5 ${i < steps.length - 1 ? "pb-10" : ""}`}>
                    <div
                      className="w-11 h-11 rounded-xl border flex items-center justify-center mb-4"
                      style={{ background: "#f1e6e9", borderColor: "#e4cdd4" }}
                    >
                      <step.icon className="w-5 h-5" style={{ color: "#780829" }} strokeWidth={1.75} />
                    </div>
                    <h3 className="font-bold text-zinc-900 text-xl mb-2">{step.title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed max-w-[38ch]">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          PAYMENTS
      ══════════════════════════════════════ */}
      <section id="payments" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="mb-14 reveal">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[-0.02em] text-zinc-900 mb-4">
              Flexible payment, built into the experience
            </h2>
            <p className="text-zinc-500 text-base sm:text-lg max-w-2xl leading-relaxed">
              DeynoQR handles checkout and bill splitting right at the table. No separate terminal, no back-and-forth with staff.
            </p>
          </div>

          <p className="text-[11px] font-semibold tracking-[0.14em] uppercase mb-6 reveal" style={{ color: "#780829" }}>
            Bill splitting
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
            {/* Equal Split featured */}
            <div
              className="md:col-span-2 relative rounded-2xl p-7 overflow-hidden group hover:-translate-y-0.5 transition-all duration-200 reveal"
              style={{
                background: "linear-gradient(135deg, #f1e6e9 0%, #e4cdd4 70%, #c99ca9 100%)",
                boxShadow: "0 2px 8px rgba(120,8,41,0.08), 0 8px 24px rgba(120,8,41,0.06)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(120,8,41,0.16), 0 4px 12px rgba(120,8,41,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(120,8,41,0.08), 0 8px 24px rgba(120,8,41,0.06)"; }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{ background: "rgba(120,8,41,0.1)", border: "1px solid rgba(120,8,41,0.18)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)" }}
              >
                <GitFork className="w-6 h-6" style={{ color: "#780829" }} strokeWidth={2} />
              </div>
              <h3 className="font-bold text-zinc-950 text-xl mb-1">Equal split</h3>
              <p className="text-sm font-medium mb-4" style={{ color: "#933953" }}>Fair and instant for the whole group</p>
              <p className="text-zinc-700 text-sm leading-relaxed max-w-[50ch]">
                Divide the total bill evenly among everyone at the table. Each person pays
                the same amount with a single tap. No mental math, no awkward moments.
              </p>
            </div>

            {/* Custom Split */}
            <div
              className="bg-white border rounded-2xl p-7 group hover:-translate-y-0.5 transition-all flex flex-col reveal reveal-d1"
              style={{ borderColor: "#e4cdd4", boxShadow: "0 1px 3px rgba(120,8,41,0.04), 0 4px 12px rgba(120,8,41,0.05)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#c99ca9"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(120,8,41,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e4cdd4"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(120,8,41,0.04), 0 4px 12px rgba(120,8,41,0.05)"; }}
            >
              <div
                className="w-12 h-12 rounded-xl border flex items-center justify-center mb-5 transition-colors"
                style={{ background: "#f1e6e9", borderColor: "#e4cdd4" }}
              >
                <Scissors className="w-5 h-5" style={{ color: "#780829" }} strokeWidth={1.75} />
              </div>
              <h3 className="font-bold text-zinc-900 text-lg mb-1">Custom split</h3>
              <p className="text-sm font-medium text-zinc-400 mb-4">Set any amount, any arrangement</p>
              <p className="text-zinc-500 text-sm leading-relaxed flex-1">
                Full control over who pays what. Assign a specific amount to each person.
                Ideal when someone is treating the group.
              </p>
            </div>
          </div>

          {/* Split by Items */}
          <div
            className="bg-white border rounded-2xl p-7 hover:-translate-y-0.5 transition-all reveal"
            style={{ borderColor: "#e4cdd4", boxShadow: "0 1px 3px rgba(120,8,41,0.04), 0 4px 12px rgba(120,8,41,0.05)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#c99ca9"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e4cdd4"; }}
          >
            <div className="flex flex-col sm:flex-row sm:items-start gap-7">
              <div
                className="flex-none w-12 h-12 rounded-xl border flex items-center justify-center mt-0.5"
                style={{ background: "#f1e6e9", borderColor: "#e4cdd4" }}
              >
                <Receipt className="w-5 h-5" style={{ color: "#780829" }} strokeWidth={1.75} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-zinc-900 text-lg mb-1">Split by items</h3>
                <p className="text-sm font-medium text-zinc-400 mb-4">Each person pays only for what they ordered</p>
                <p className="text-zinc-500 text-sm leading-relaxed max-w-[55ch]">
                  Every guest selects the dishes they had and pays only for those. Perfect for
                  groups where people ordered very different amounts.
                </p>
              </div>
            </div>
          </div>

          {/* Standard checkout */}
          <div className="mt-10 pt-10 border-t reveal" style={{ borderColor: "#f1e6e9" }}>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-zinc-400 uppercase mb-5">
              Standard checkout
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { icon: Wallet, label: "Cash at counter", desc: "Guest settles at the till" },
                { icon: CreditCard, label: "Card payment", desc: "Tap or swipe at checkout" },
                { icon: Globe, label: "Online checkout", desc: "Pay via browser link" },
              ].map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="flex items-center gap-3.5 bg-white border rounded-xl px-5 py-3.5 group transition-all"
                  style={{ borderColor: "#e4cdd4", boxShadow: "0 1px 3px rgba(120,8,41,0.04)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#c99ca9"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(120,8,41,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e4cdd4"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(120,8,41,0.04)"; }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-none transition-colors"
                    style={{ background: "#f1e6e9" }}
                  >
                    <Icon className="w-4 h-4" style={{ color: "#780829" }} strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-800">{label}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Accepted cards + confirmation */}
          <div className="mt-10 pt-10 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 reveal" style={{ borderColor: "#f1e6e9" }}>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-zinc-400 uppercase mb-4">
                We accept
              </p>
              <div className="flex items-center gap-2.5">
                <span
                  className="inline-flex items-center justify-center h-11 px-4 rounded-lg border"
                  style={{ borderColor: "#e4cdd4", background: "white" }}
                  aria-label="Visa"
                >
                  <VisaLogo className="h-4 w-auto" />
                </span>
                <span
                  className="inline-flex items-center justify-center h-11 px-4 rounded-lg border"
                  style={{ borderColor: "#e4cdd4", background: "white" }}
                  aria-label="Mastercard"
                >
                  <MastercardLogo className="h-6 w-auto" />
                </span>
              </div>
            </div>
            <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">
              Every order is confirmed instantly on-screen, and a payment confirmation
              is sent to the customer by email within 24 hours of payment.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          CTA
      ══════════════════════════════════════ */}
      <section className="relative py-28 overflow-hidden" style={{ background: "#780829" }}>
        <div
          aria-hidden
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] blur-[80px] pointer-events-none"
          style={{ background: "rgba(255,255,255,0.06)" }}
        />
        <div
          aria-hidden
          className="absolute bottom-0 right-0 w-[400px] h-[400px] blur-[100px] pointer-events-none"
          style={{ background: "rgba(255,255,255,0.04)" }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-1 mb-6 reveal">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-4 h-4" style={{ fill: "#f1e6e9", color: "#f1e6e9" }} strokeWidth={0} />
            ))}
          </div>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.025em] text-white mb-4 reveal"
            style={{ textWrap: "balance" }}
          >
            Take your restaurant digital today
          </h2>
          <p className="text-base sm:text-lg mb-10 max-w-md mx-auto leading-relaxed reveal" style={{ color: "#d6b4be" }}>
            Contact us to set up DeynoQR for your business. Quick setup, no hardware required.
          </p>
          <a
            href="mailto:info@deynotech.com"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-full font-semibold text-sm active:scale-[0.97] transition-all duration-200 group reveal"
            style={{ background: "white", color: "#780829", boxShadow: "0 8px 28px rgba(0,0,0,0.2)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f1e6e9"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "white"; }}
          >
            Get in touch
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center group-hover:translate-x-0.5 transition-transform duration-200"
              style={{ background: "rgba(120,8,41,0.08)" }}
            >
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </span>
          </a>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FOOTER
      ══════════════════════════════════════ */}
      <footer className="py-10 border-t" style={{ background: "#3d0416", borderColor: "rgba(120,8,41,0.4)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
            <a href="/" className="flex items-center gap-2 group">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center group-hover:opacity-85 transition-opacity"
                style={{ background: "#780829", border: "1px solid rgba(255,255,255,0.15)" }}
              >
                <QrCode className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-white text-sm">DeynoQR</span>
            </a>

            <nav className="flex flex-wrap items-center justify-center gap-5 text-xs" style={{ color: "#c99ca9" }}>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#clients" className="hover:text-white transition-colors">Clients</a>
              <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
              <a href="#payments" className="hover:text-white transition-colors">Billing</a>
              <a href="/about" className="hover:text-white transition-colors">About Us</a>
              <a href="/terms" className="hover:text-white transition-colors">Terms</a>
              <a href="/privacy-policy" className="hover:text-white transition-colors">Privacy</a>
              <a href="/refund-policy" className="hover:text-white transition-colors">Refund &amp; Cancellation</a>
              <a href="mailto:info@deynotech.com" className="hover:text-white transition-colors">Contact</a>
            </nav>
          </div>

          <div
            className="mt-8 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
            style={{ borderColor: "rgba(120,8,41,0.4)", color: "#933953" }}
          >
            <p>
              DEYNO TECHNOLOGIES FZE &middot; Sharjah, United Arab Emirates &middot;{" "}
              <a href="mailto:info@deynotech.com" className="hover:text-white transition-colors">info@deynotech.com</a>
              {" "}&middot;{" "}
              <a href="tel:+971542578600" className="hover:text-white transition-colors">+971 54 257 8600</a>
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-8 px-2.5 rounded-md bg-white" aria-label="Visa">
                  <VisaLogo className="h-3 w-auto" />
                </span>
                <span className="inline-flex items-center justify-center h-8 px-2.5 rounded-md bg-white" aria-label="Mastercard">
                  <MastercardLogo className="h-4 w-auto" />
                </span>
              </div>
              <p>2026 DeynoQR. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
