import React from "react";

/**
 * SplitOptionsSheet
 *
 * onEqual / onItems / onCustom:
 *   - function  → option is active, clicking calls the function
 *   - string    → option is shown but DISABLED; the string is the reason shown to the user
 *   - undefined → option is hidden entirely
 */
export default function SplitOptionsSheet({
  variant = "pill",
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
                Choose how you'd like to pay your share
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
            {variant === "pill"  && <PillList  onEqual={onEqual} onItems={onItems} onCustom={onCustom} />}
            {variant === "cards" && <Cards     onEqual={onEqual} onItems={onItems} onCustom={onCustom} />}
            {variant === "radio" && <RadioList onEqual={onEqual} onItems={onItems} onCustom={onCustom} />}
            {variant === "grid"  && <GridTiles onEqual={onEqual} onItems={onItems} onCustom={onCustom} />}
          </div>

          <div className="h-3 safe-bottom" />
        </div>
      </div>
    </div>
  );
}

/* ─── helpers ─── */

/** Returns true when the prop is an active handler, false when it is a locked-reason string. */
const isActive   = (p) => typeof p === "function";
/** Returns true when the prop is a string (disabled reason). */
const isDisabled = (p) => typeof p === "string";
/** Returns true when the prop should render at all (active or disabled, not hidden). */
const isVisible  = (p) => p !== undefined && p !== null;

/* ───────────────────────────── PILL LIST ───────────────────────────── */
function PillList({ onEqual, onItems, onCustom }) {
  const Row = ({ icon, title, handler, lockedReason }) => {
    const active = isActive(handler);
    const disabled = isDisabled(handler);
    if (!isVisible(handler)) return null;

    return (
      <button
        onClick={active ? handler : undefined}
        disabled={disabled}
        className={[
          "w-full flex items-center justify-between rounded-2xl border px-4 py-4 text-left transition",
          active   ? "bg-white hover:bg-gray-50" : "bg-gray-50 opacity-60 cursor-not-allowed",
        ].join(" ")}
        style={{ borderColor: "var(--grad-end-soft)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-9 h-9 flex-shrink-0 grid place-items-center rounded-xl border"
            style={{ borderColor: "var(--grad-end-soft)", background: "var(--grad-start-soft)", color: "var(--text-rose)" }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-gray-900">{title}</div>
            {disabled && lockedReason && (
              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <span>🔒</span> {lockedReason}
              </div>
            )}
          </div>
        </div>
        {active && <span className="text-gray-400 text-xl">›</span>}
      </button>
    );
  };

  const hasAny = isVisible(onEqual) || isVisible(onItems) || isVisible(onCustom);
  if (!hasAny) {
    return <div className="text-center py-8 text-gray-500">No split options available</div>;
  }

  return (
    <div className="space-y-3">
      <Row icon="➗" title="Divide the bill equally"  handler={onEqual} />
      <Row icon="🧾" title="Pay for your items"       handler={onItems}  lockedReason={isDisabled(onItems)  ? onItems  : undefined} />
      <Row icon="✍️" title="Pay a custom amount"      handler={onCustom} lockedReason={isDisabled(onCustom) ? onCustom : undefined} />
    </div>
  );
}

/* ───────────────────────────── CARDS ───────────────────────────── */
function Cards({ onEqual, onItems, onCustom }) {
  const Card = ({ icon, title, desc, handler, lockedReason }) => {
    const active = isActive(handler);
    const disabled = isDisabled(handler);
    if (!isVisible(handler)) return null;

    return (
      <button
        onClick={active ? handler : undefined}
        disabled={disabled}
        className={[
          "w-full text-left rounded-2xl border p-4 transition",
          active ? "bg-white hover:bg-gray-50" : "bg-gray-50 opacity-60 cursor-not-allowed",
        ].join(" ")}
        style={{ borderColor: "var(--grad-end-soft)" }}
      >
        <div className="flex items-start gap-3">
          <span
            className="w-10 h-10 flex-shrink-0 grid place-items-center rounded-xl"
            style={{ background: "var(--grad-start-soft)", color: "var(--text-rose)" }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900">{title}</div>
            <div className="text-sm text-gray-500 mt-0.5">
              {disabled && lockedReason ? <span className="flex items-center gap-1"><span>🔒</span>{lockedReason}</span> : desc}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const hasAny = isVisible(onEqual) || isVisible(onItems) || isVisible(onCustom);
  if (!hasAny) {
    return <div className="text-center py-8 text-gray-500">No split options available</div>;
  }

  return (
    <div className="space-y-3">
      <Card icon="➗" title="Divide the bill equally" desc="Split total into equal shares"    handler={onEqual} />
      <Card icon="🧾" title="Pay for your items"      desc="Only the dishes you ordered"     handler={onItems}  lockedReason={isDisabled(onItems)  ? onItems  : undefined} />
      <Card icon="✍️" title="Pay a custom amount"     desc="Enter any amount you wish"        handler={onCustom} lockedReason={isDisabled(onCustom) ? onCustom : undefined} />
    </div>
  );
}

/* ───────────────────────────── RADIO LIST ───────────────────────────── */
function RadioList({ onEqual, onItems, onCustom }) {
  const allOptions = [
    { id: "equal",  icon: "➗", title: "Divide the bill equally", desc: "Same amount for everyone",    handler: onEqual  },
    { id: "items",  icon: "🧾", title: "Pay for your items",      desc: "Select only your dishes",      handler: onItems  },
    { id: "custom", icon: "✍️", title: "Pay a custom amount",     desc: "Enter any value you prefer",   handler: onCustom },
  ].filter(o => isVisible(o.handler));

  const activeOptions = allOptions.filter(o => isActive(o.handler));
  const [pick, setPick] = React.useState(activeOptions[0]?.id || "");

  const go = () => {
    const option = allOptions.find(o => o.id === pick);
    if (option && isActive(option.handler)) option.handler();
  };

  if (allOptions.length === 0) {
    return <div className="text-center py-8 text-gray-500">No split options available</div>;
  }

  return (
    <>
      <div className="space-y-3">
        {allOptions.map(({ id, title, desc, handler }) => {
          const active   = isActive(handler);
          const disabled = isDisabled(handler);
          return (
            <label
              key={id}
              className={[
                "flex items-start gap-3 rounded-2xl border p-4",
                active ? "cursor-pointer bg-white hover:bg-gray-50" : "bg-gray-50 opacity-60 cursor-not-allowed",
              ].join(" ")}
              style={{ borderColor: "var(--grad-end-soft)" }}
            >
              <input
                type="radio"
                name="split"
                value={id}
                checked={pick === id}
                disabled={disabled}
                onChange={() => active && setPick(id)}
                className="mt-1 accent-[#C91A4D]"
              />
              <div>
                <div className="font-semibold text-gray-900">{title}</div>
                <div className="text-sm text-gray-500">
                  {disabled && typeof handler === "string"
                    ? <span className="flex items-center gap-1"><span>🔒</span>{handler}</span>
                    : desc}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div className="mt-4">
        <button onClick={go} disabled={!pick} className="btn w-full h-12 rounded-xl disabled:opacity-50">Continue</button>
      </div>
    </>
  );
}

/* ───────────────────────────── GRID TILES ───────────────────────────── */
function GridTiles({ onEqual, onItems, onCustom }) {
  const allOptions = [
    { key: "equal",  icon: "➗", label: "Equal",      handler: onEqual  },
    { key: "items",  icon: "🧾", label: "Your items", handler: onItems  },
    { key: "custom", icon: "✍️", label: "Custom",     handler: onCustom },
  ].filter(o => isVisible(o.handler));

  if (allOptions.length === 0) {
    return <div className="text-center py-8 text-gray-500">No split options available</div>;
  }

  const cols = allOptions.length === 1 ? "grid-cols-1" : allOptions.length === 2 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className={`grid gap-3 ${cols}`}>
      {allOptions.map(({ key, icon, label, handler }) => {
        const active   = isActive(handler);
        const disabled = isDisabled(handler);
        return (
          <button
            key={key}
            onClick={active ? handler : undefined}
            disabled={disabled}
            className={[
              "flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 transition",
              active ? "bg-white hover:bg-gray-50" : "bg-gray-50 opacity-60 cursor-not-allowed",
            ].join(" ")}
            style={{ borderColor: "var(--grad-end-soft)" }}
          >
            <span
              className="w-12 h-12 grid place-items-center rounded-2xl"
              style={{ background: "var(--grad-start-soft)", color: "var(--text-rose)" }}
            >
              {disabled ? "🔒" : icon}
            </span>
            <span className="text-sm font-medium text-gray-900">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
