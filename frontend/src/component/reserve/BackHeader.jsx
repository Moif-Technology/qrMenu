// ─────────────────────────────────────────────────────────────
// File: src/components/reserve/BackHeader.jsx
// ─────────────────────────────────────────────────────────────
export default function BackHeader({ title, onBack, step = 1, total = 3 }) {
  // step 1 => ~33%, step 2 => ~66%, step 3 => 100%
  const pct = Math.max(0, Math.min(100, Math.round((step / total) * 100)));

  return (
    <div className="sticky top-0 z-20 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
          aria-label="Go back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Progress track */}
        <div
          className="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Reservation progress"
        >
          <div
            className="h-full bg-gray-900 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
    </div>
  );
}
