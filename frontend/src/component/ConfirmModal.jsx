import { createPortal } from "react-dom";

/**
 * ConfirmModal – drop-in replacement for window.confirm().
 *
 * Usage in a parent component:
 *   const [confirmState, setConfirmState] = useState(null);
 *
 *   // To show:
 *   setConfirmState({ title, message, onConfirm: () => doSomething(), confirmLabel, variant });
 *
 *   // In JSX:
 *   <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
 *
 * Props:
 *   state        – null (hidden) or { title, message, confirmLabel, cancelLabel, variant }
 *   onClose      – called when dismissed (Cancel or backdrop)
 */
export default function ConfirmModal({ state, onClose }) {
  if (!state) return null;

  const {
    title       = "Confirm",
    message     = "",
    confirmLabel = "Confirm",
    cancelLabel  = "Cancel",
    onConfirm,
    variant      = "default", // "default" | "danger" | "success"
  } = state;

  const confirmColors =
    variant === "danger"
      ? "bg-red-500 hover:bg-red-600 text-white"
      : variant === "success"
      ? "bg-emerald-500 hover:bg-emerald-600 text-white"
      : "bg-gray-900 hover:bg-gray-800 text-white";

  const handleConfirm = () => {
    onClose();
    onConfirm?.();
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        {/* Drag handle */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-6 pt-4 pb-6">
          {/* Title */}
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>

          {/* Message — supports newlines */}
          <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed mb-6">
            {message}
          </p>

          {/* Buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleConfirm}
              className={`w-full h-12 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] ${confirmColors}`}
            >
              {confirmLabel}
            </button>
            <button
              onClick={onClose}
              className="w-full h-12 rounded-xl font-semibold text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all active:scale-[0.98]"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
