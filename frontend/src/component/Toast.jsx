import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Toast – drop-in replacement for alert().
 *
 * Usage:
 *   const [toast, setToast] = useState(null);
 *
 *   // Show:
 *   setToast({ message: "Done!", variant: "success" });
 *   // or with title:
 *   setToast({ title: "Payment Failed", message: errorMsg, variant: "error" });
 *
 *   // In JSX:
 *   <Toast toast={toast} onClose={() => setToast(null)} />
 *
 * Variants: "success" | "error" | "info" | "warning"
 * Auto-dismisses after `duration` ms (default 4000). Pass duration=0 to disable.
 */
export default function Toast({ toast, onClose, duration = 4000 }) {
  useEffect(() => {
    if (!toast || duration === 0) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [toast, duration, onClose]);

  if (!toast) return null;

  const { title, message, variant = "info" } = toast;

  const styles = {
    success: {
      bg:     "bg-emerald-500",
      icon:   "✓",
      iconBg: "bg-emerald-600",
    },
    error: {
      bg:     "bg-red-500",
      icon:   "✕",
      iconBg: "bg-red-600",
    },
    warning: {
      bg:     "bg-amber-500",
      icon:   "!",
      iconBg: "bg-amber-600",
    },
    info: {
      bg:     "bg-gray-800",
      icon:   "i",
      iconBg: "bg-gray-700",
    },
  };

  const s = styles[variant] ?? styles.info;

  return createPortal(
    <div className="fixed bottom-6 inset-x-0 z-[300] flex justify-center px-4 pointer-events-none">
      <div
        className={`
          ${s.bg} text-white rounded-2xl shadow-2xl
          flex items-start gap-3 px-4 py-3
          max-w-sm w-full pointer-events-auto
          animate-in slide-in-from-bottom-4 duration-200
        `}
      >
        {/* Icon */}
        <div className={`${s.iconBg} rounded-full w-7 h-7 flex-shrink-0 flex items-center justify-center font-bold text-sm mt-0.5`}>
          {s.icon}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          {title && <div className="font-semibold text-sm leading-tight mb-0.5">{title}</div>}
          <div className="text-sm leading-snug opacity-90 whitespace-pre-line">{message}</div>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity text-lg leading-none mt-0.5"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>,
    document.body
  );
}
