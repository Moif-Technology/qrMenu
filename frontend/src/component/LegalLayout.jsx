import { useEffect } from "react";
import { QrCode, ArrowLeft } from "lucide-react";
import { useReveal } from "../hooks/useReveal";

/* Brand palette (matches LandingPage)
   Primary: #780829 | Dark: #85203e | Mid: #933953 | Soft: #c99ca9 | Light: #f1e6e9
*/

export default function LegalLayout({ title, toc, children, pageTitle }) {
  useReveal();

  useEffect(() => {
    const prev = document.title;
    if (pageTitle) document.title = pageTitle;
    return () => { document.title = prev; };
  }, [pageTitle]);

  return (
    <div
      className="min-h-[100dvh] bg-stone-50 text-zinc-900"
      style={{ fontFamily: '"Hanken Grotesk", system-ui, sans-serif' }}
    >
      <header className="border-b bg-stone-50/95 backdrop-blur-sm sticky top-0 z-10" style={{ borderColor: "rgba(120,8,41,0.15)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#780829" }}>
              <QrCode className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-zinc-900 text-sm tracking-tight">DeynoQR</span>
          </a>
          <a href="/" className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: "#780829" }}>
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10 reveal">{title}</h1>

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-10 lg:gap-16">
          {toc && toc.length > 0 && (
            <nav className="hidden md:block reveal">
              <ul className="sticky top-24 space-y-2.5 text-sm border-l pl-4" style={{ borderColor: "rgba(120,8,41,0.15)" }}>
                {toc.map(({ id, label }) => (
                  <li key={id}>
                    <a href={`#${id}`} className="text-zinc-500 hover:text-zinc-900 transition-colors">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="min-w-0 space-y-10 text-[15px] leading-relaxed text-zinc-700">
            {children}
          </div>
        </div>
      </main>

      <footer className="py-8 border-t text-center text-xs" style={{ background: "#3d0416", borderColor: "rgba(120,8,41,0.4)", color: "#933953" }}>
        2026 DeynoQR. All rights reserved.
      </footer>
    </div>
  );
}

export function LegalSection({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 reveal">
      <h2 className="text-lg font-semibold text-zinc-900 mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function ContactCard() {
  return (
    <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: "rgba(120,8,41,0.2)", background: "#f1e6e9" }}>
      <p className="font-semibold text-zinc-900">DEYNO TECHNOLOGIES FZE</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-0.5">
          <p className="font-medium text-zinc-900">Sharjah (Registered Office)</p>
          <p>Office No. 08, Business Center</p>
          <p>Sharjah Publishing City Free Zone (SPCFZ)</p>
          <p>P.O. Box 502449, Sharjah</p>
          <p>United Arab Emirates</p>
        </div>
        <div className="space-y-0.5">
          <p className="font-medium text-zinc-900">Abu Dhabi Office</p>
          <p>Office 83, Al Hashim Building</p>
          <p>Al Kawakib Street, Musaffah M39</p>
          <p>Abu Dhabi 20319</p>
          <p>United Arab Emirates</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <p>
          Email:{" "}
          <a href="mailto:info@deynotech.com" className="font-medium hover:underline" style={{ color: "#780829" }}>
            info@deynotech.com
          </a>
        </p>
        <p>
          Phone:{" "}
          <a href="tel:+971542578600" className="font-medium hover:underline" style={{ color: "#780829" }}>
            +971 54 257 8600
          </a>
        </p>
      </div>
    </div>
  );
}
