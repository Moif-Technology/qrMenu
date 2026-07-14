import { useEffect } from "react";
import { QrCode, ArrowLeft } from "lucide-react";

/* Brand palette (matches LandingPage)
   Primary: #780829 | Dark: #85203e | Mid: #933953 | Soft: #c99ca9 | Light: #f1e6e9
*/

const clauses = [
  `Refunds are subject to the applicable payment service provider's rules and technical capabilities.`,
  `Automated Refund Transaction Fee: AED 90 per automated Refund Transaction.`,
  `Original Transaction Fees and applicable processing charges are non-refundable following a Refund.`,
  `The Merchant is responsible for chargebacks, payment disputes, reversals, and related charges arising from Merchant Transactions.`,
  `Deyno may deduct Refunds, Chargebacks, reversals, disputes, and related fees from current or future Settlement amounts.`,
  `The Merchant shall provide transaction records and supporting documents reasonably requested to respond to payment disputes or Chargebacks.`,
];

export default function RefundPolicyPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Refund & Cancellation Policy - DeynoQR";
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
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">Refund &amp; Cancellation Policy</h1>

        <div className="space-y-4 text-[15px] leading-relaxed text-zinc-700">
          <ol className="space-y-4 list-decimal list-outside pl-5">
            {clauses.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </div>

        <div className="mt-10 rounded-2xl border p-5 space-y-1.5" style={{ borderColor: "rgba(120,8,41,0.2)", background: "#f1e6e9" }}>
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
      </main>

      <footer className="py-8 border-t text-center text-xs" style={{ background: "#3d0416", borderColor: "rgba(120,8,41,0.4)", color: "#933953" }}>
        2026 DeynoQR. All rights reserved.
      </footer>
    </div>
  );
}
