import { useEffect, useState } from "react";
import { formatAED } from "../utils/currency";
import { useTranslation } from "react-i18next";

export default function ItemModal({ open, item, onClose, onAdd }) {
  const [selected, setSelected] = useState({}); // { groupName: option }
  const { t } = useTranslation();

  // reset selections when item changes or modal re-opens
  useEffect(() => {
    if (open) setSelected({});
  }, [open, item]);

  // lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !item) return null;

  const selectedMods = Object.values(selected);
  const addPrice = selectedMods.reduce((s, m) => s + (m.price || 0), 0);
  const total = item.price + addPrice;

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* centered panel */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="item-modal-title"
          className="w-full max-w-lg rounded-2xl bg-white shadow-xl ring-1 ring-black/5 grid max-h-[90vh] grid-rows-[auto_1fr_auto] overflow-hidden"
        >
          {/* header image + close */}
          <div className="relative h-44">
            <img
              src={item.img}
              alt={item.name}
              className="h-full w-full object-cover"
            />
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white hover:bg-black/70"
            >
              ×
            </button>
          </div>

          {/* body (scrollable) */}
          <div className="p-4 overflow-y-auto">
            <div className="mb-3">
              <div id="item-modal-title" className="text-xl font-semibold">
                {item.name}
              </div>
              {item.desc ? (
                <div className="mt-1 text-sm text-gray-500">{item.desc}</div>
              ) : null}
            </div>

            {item.modifiers?.map((g) => (
              <div key={g.group} className="mb-4">
                <div className="font-medium mb-2">{g.group}</div>
                <div className="flex flex-wrap gap-2">
                  {g.options.map((opt) => {
                    const isSel = selected[g.group]?.name === opt.name;
                    return (
                      <button
                        key={opt.name}
                        onClick={() =>
                          setSelected((s) => ({ ...s, [g.group]: opt }))
                        }
                        className={`px-3 py-2 rounded-xl border text-sm transition ${
                          isSel
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {opt.name}
                        {opt.price ? ` +${formatAED(opt.price)}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* footer (sticky inside modal) */}
          <div className="p-4 border-t bg-white">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">{formatAED(total)}</div>
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={onClose}>
                  {t("modal.cancel")}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    onAdd(selectedMods);
                    onClose();
                  }}
                >
                  {t("modal.add_button")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
