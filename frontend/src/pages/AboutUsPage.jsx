import { useEffect } from "react";
import { QrCode, ArrowLeft } from "lucide-react";

/* Brand palette (matches LandingPage)
   Primary: #780829 | Dark: #85203e | Mid: #933953 | Soft: #c99ca9 | Light: #f1e6e9
*/

export default function AboutUsPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = "About Us - DeynoQR";
    return () => { document.title = prev; };
  }, []);

  return (
    <div
      className="min-h-[100dvh] bg-stone-50 text-zinc-900"
      style={{ fontFamily: '"Hanken Grotesk", system-ui, sans-serif' }}
    >
      <header className="border-b" style={{ borderColor: "rgba(120,8,41,0.15)" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">About Us</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated 20 July 2026</p>

        <div className="space-y-8 text-[15px] leading-relaxed text-zinc-700">
          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">Who we are</h2>
            <p>
              DeynoQR is a digital ordering and payment platform for restaurants, built and
              operated by <strong>DEYNO TECHNOLOGIES FZE</strong>, registered in Sharjah, United
              Arab Emirates. We provide QR-code based menus, in-seat ordering, table reservations,
              waitlist management, and integrated payment/bill-splitting tools so restaurants can
              serve guests faster without extra hardware.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">What we do</h2>
            <p>
              Guests scan a QR code at their table to browse the menu, place orders, and pay
              directly from their phone. Restaurant staff manage menus, orders, reservations, and
              reports through our admin dashboard. DeynoQR acts as the technology and payment
              facilitation partner between restaurants and their guests.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">Contact details</h2>
            <div className="rounded-2xl border p-5 space-y-1.5" style={{ borderColor: "rgba(120,8,41,0.2)", background: "#f1e6e9" }}>
              <p className="font-semibold text-zinc-900">DEYNO TECHNOLOGIES FZE</p>
              <p>Sharjah, United Arab Emirates</p>
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
          </section>
        </div>
      </main>

      <footer className="py-8 border-t text-center text-xs" style={{ background: "#3d0416", borderColor: "rgba(120,8,41,0.4)", color: "#933953" }}>
        2026 DeynoQR. All rights reserved.
      </footer>
    </div>
  );
}
