import { useEffect } from "react";
import { Clock } from "lucide-react";

export default function LaunchingSoonPage({ name = "This restaurant" }) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${name} — Coming Soon`;
    return () => { document.title = prev; };
  }, [name]);

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center px-6">
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none overflow-hidden"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[400px] rounded-full bg-amber-400/5 blur-[140px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-8">
          <Clock className="w-7 h-7 text-amber-400" strokeWidth={1.5} />
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-3">{name}</h1>

        <div className="flex items-center gap-2 mb-6">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-sm font-semibold text-amber-400 tracking-wide uppercase">
            Launching Soon
          </span>
        </div>

        <p className="text-zinc-400 text-sm leading-relaxed mb-10">
          We're getting ready. Check back soon to explore the menu and place orders right from your table.
        </p>

        <a
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Back to DeynoQR
        </a>
      </div>
    </div>
  );
}
