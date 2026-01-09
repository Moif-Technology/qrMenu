import React from "react";

export default function SplitOptionsSheet({
  variant = "pill",            // 'pill' | 'cards' | 'radio' | 'grid'
  onClose,
  onEqual,
  onItems,
  onCustom,
}) {
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0">
        <div
          className="mx-auto w-full max-w-md rounded-t-3xl bg-white shadow-2xl border-t"
          style={{ borderColor: "var(--grad-end-soft)" }}
        >
          {/* handle */}
          <div className="pt-3">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-200" />
          </div>

          {/* header */}
          <div className="px-6 pt-3 pb-4 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Split the bill</h3>
              <p className="text-sm text-gray-500 mt-1">
                You can pay your share by selecting one of the options below
              </p>
            </div>
            <button
              onClick={onClose}
              className="h-9 w-9 grid place-items-center rounded-full text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* body variants */}
          <div className="px-4 pb-4">
            {variant === "pill" && <PillList onEqual={onEqual} onItems={onItems} onCustom={onCustom} />}
            {variant === "cards" && <Cards onEqual={onEqual} onItems={onItems} onCustom={onCustom} />}
            {variant === "radio" && <RadioList onEqual={onEqual} onItems={onItems} onCustom={onCustom} />}
            {variant === "grid" && <GridTiles onEqual={onEqual} onItems={onItems} onCustom={onCustom} />}
          </div>

          <div className="h-3 safe-bottom" />
        </div>
      </div>
    </div>
  );
}

/* ───────────────── VARIANT: PILL LIST (screenshot-like) ───────────────── */
function PillList({ onEqual, onItems, onCustom }) {
  const Row = ({ icon, title, onClick }) => {
    if (!onClick) return null;
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between rounded-2xl border bg-white px-4 py-4 text-left hover:bg-gray-50"
        style={{ borderColor: "var(--grad-end-soft)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-9 h-9 grid place-items-center rounded-xl border"
            style={{ borderColor: "var(--grad-end-soft)", background: "var(--grad-start-soft)", color: "var(--text-rose)" }}
          >
            {icon}
          </span>
          <span className="text-[15px] font-medium text-gray-900">{title}</span>
        </div>
        <span className="text-gray-400 text-xl">›</span>
      </button>
    );
  };

  const options = [];
  if (onEqual) options.push(<Row key="equal" icon="➗" title="Divide the bill equally" onClick={onEqual} />);
  if (onItems) options.push(<Row key="items" icon="🧾" title="Pay for your items" onClick={onItems} />);
  if (onCustom) options.push(<Row key="custom" icon="✍️" title="Pay a custom amount" onClick={onCustom} />);

  if (options.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No split options available
      </div>
    );
  }

  return <div className="space-y-3">{options}</div>;
}

/* ───────────────── VARIANT: CARDS ───────────────── */
function Cards({ onEqual, onItems, onCustom }) {
  const Card = ({ icon, title, desc, onClick }) => {
    if (!onClick) return null;
    return (
      <button
        onClick={onClick}
        className="w-full text-left rounded-2xl border p-4 bg-white hover:bg-gray-50 transition"
        style={{ borderColor: "var(--grad-end-soft)" }}
      >
        <div className="flex items-start gap-3">
          <span
            className="w-10 h-10 grid place-items-center rounded-xl"
            style={{ background: "var(--grad-start-soft)", color: "var(--text-rose)" }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900">{title}</div>
            <div className="text-sm text-gray-500 mt-0.5">{desc}</div>
          </div>
        </div>
      </button>
    );
  };

  const options = [];
  if (onEqual) options.push(<Card key="equal" icon="➗" title="Divide the bill equally" desc="Split total into equal shares" onClick={onEqual} />);
  if (onItems) options.push(<Card key="items" icon="🧾" title="Pay for your items" desc="Only the dishes you ordered" onClick={onItems} />);
  if (onCustom) options.push(<Card key="custom" icon="✍️" title="Pay a custom amount" desc="Enter any amount you wish" onClick={onCustom} />);

  if (options.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No split options available
      </div>
    );
  }

  return <div className="space-y-3">{options}</div>;
}

/* ───────────────── VARIANT: RADIO + CONTINUE ───────────────── */
function RadioList({ onEqual, onItems, onCustom }) {
  const availableOptions = [];
  if (onEqual) availableOptions.push({ id: "equal", title: "Divide the bill equally", desc: "Same amount for everyone", handler: onEqual });
  if (onItems) availableOptions.push({ id: "items", title: "Pay for your items", desc: "Select only your dishes", handler: onItems });
  if (onCustom) availableOptions.push({ id: "custom", title: "Pay a custom amount", desc: "Enter any value you prefer", handler: onCustom });

  const [pick, setPick] = React.useState(availableOptions[0]?.id || "");

  const go = () => {
    const option = availableOptions.find(o => o.id === pick);
    if (option) option.handler();
  };

  const Row = ({ id, title, desc }) => (
    <label
      className="flex items-start gap-3 rounded-2xl border p-4 cursor-pointer bg-white hover:bg-gray-50"
      style={{ borderColor: "var(--grad-end-soft)" }}
    >
      <input
        type="radio"
        name="split"
        value={id}
        checked={pick === id}
        onChange={() => setPick(id)}
        className="mt-1 accent-[#C91A4D]"
      />
      <div>
        <div className="font-semibold text-gray-900">{title}</div>
        <div className="text-sm text-gray-500">{desc}</div>
      </div>
    </label>
  );

  if (availableOptions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No split options available
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {availableOptions.map(opt => (
          <Row key={opt.id} id={opt.id} title={opt.title} desc={opt.desc} />
        ))}
      </div>
      <div className="mt-4">
        <button onClick={go} className="btn w-full h-12 rounded-xl">Continue</button>
      </div>
    </>
  );
}

/* ───────────────── VARIANT: GRID TILES ───────────────── */
function GridTiles({ onEqual, onItems, onCustom }) {
  const Tile = ({ icon, label, onClick }) => {
    if (!onClick) return null;
    return (
      <button
        onClick={onClick}
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 bg-white hover:bg-gray-50"
        style={{ borderColor: "var(--grad-end-soft)" }}
      >
        <span
          className="w-12 h-12 grid place-items-center rounded-2xl"
          style={{ background: "var(--grad-start-soft)", color: "var(--text-rose)" }}
        >
          {icon}
        </span>
        <span className="text-sm font-medium text-gray-900">{label}</span>
      </button>
    );
  };

  const options = [];
  if (onEqual) options.push(<Tile key="equal" icon="➗" label="Equal" onClick={onEqual} />);
  if (onItems) options.push(<Tile key="items" icon="🧾" label="Your items" onClick={onItems} />);
  if (onCustom) options.push(<Tile key="custom" icon="✍️" label="Custom" onClick={onCustom} />);

  if (options.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No split options available
      </div>
    );
  }

  return <div className={`grid gap-3 ${options.length === 1 ? 'grid-cols-1' : options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>{options}</div>;
}
