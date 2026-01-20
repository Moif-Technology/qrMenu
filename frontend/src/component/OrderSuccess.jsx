// src/component/OrderSuccess.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useCart } from "../store/cartStore";
import { useUI } from "../store/uiStore";

/** Small chip row for order details */
function DetailItem({ icon, label, value }) {
  return (
    <div className="modern-detail-item">
      <div className="modern-detail-icon">{icon}</div>
      <div className="modern-detail-content">
        <div className="modern-detail-label">{label}</div>
        <div className="modern-detail-value">{String(value)}</div>
      </div>
    </div>
  );
}

const THEMES = ["emerald"]; // fixed color (single theme)

export default function OrderSuccess() {
  const successOpen = useUI((s) => s.successOpen);
  const lastOrder   = useUI((s) => s.lastOrder);
  const hideSuccess = useUI((s) => s.hideSuccess);
  const showAddMoreOptions = useUI((s) => s.showAddMoreOptions);
  const navigate = useNavigate();
  const { token } = useCart();

  // one-time animation state + mount/unmount for transitions
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  // keep the tick drawn even after we leave "animate" state
  const [tickDrawn, setTickDrawn] = useState(false);
  // NEW: when true, emojis stop animating and stay at final positions (and move in front of the circle)
  const [emojisStay, setEmojisStay] = useState(false);

  // refs for 3D tilt & CTA ripple
  const cardRef = useRef(null);
  const btnRef  = useRef(null);

  const theme = useMemo(() => {
    if (!successOpen) return "emerald";
    const orderTheme = lastOrder?.theme;
    return orderTheme && THEMES.includes(orderTheme)
      ? orderTheme
      : THEMES[Math.floor(Math.random() * THEMES.length)];
  }, [successOpen, lastOrder?.theme]);

  useEffect(() => {
    let unmountTimer;
    let animationTimer;
    let emojiSettleTimer;
    let tickTimer;

    if (successOpen) {
      setMounted(true);
      setPlaying(true);
      setTickDrawn(false);
      setEmojisStay(false);

      // stop hero pop after 2s (modal stays open)
      animationTimer = setTimeout(() => setPlaying(false), 2000);
      // mark tick as drawn (keeps stroke visible)
      tickTimer = setTimeout(() => setTickDrawn(true), 750);
      // after emojis finish their pop (≈800–900ms), lock them in place & bring to front
      emojiSettleTimer = setTimeout(() => setEmojisStay(true), 900);
    } else if (mounted) {
      // graceful exit transition before unmount
      unmountTimer = setTimeout(() => setMounted(false), 400);
    }

    return () => {
      clearTimeout(animationTimer);
      clearTimeout(emojiSettleTimer);
      clearTimeout(tickTimer);
      clearTimeout(unmountTimer);
    };
  }, [successOpen, mounted]);

  // 3D tilt on mouse move (ignored on touch)
  const onMouseMove = (e) => {
    if (!cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;  // 0..1
    const y = (e.clientY - r.top)  / r.height; // 0..1
    const rx = (0.5 - y) * 8;   // tilt up/down
    const ry = (x - 0.5) * 10;  // tilt left/right
    cardRef.current.style.setProperty("--rx", `${rx}deg`);
    cardRef.current.style.setProperty("--ry", `${ry}deg`);
    // glint follows cursor
    cardRef.current.style.setProperty("--mx", `${x * 100}%`);
    cardRef.current.style.setProperty("--my", `${y * 100}%`);
  };
  const onMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.setProperty("--rx", `0deg`);
    cardRef.current.style.setProperty("--ry", `0deg`);
  };

  // CTA ripple
  const onButtonDown = (e) => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX ? e.clientX - r.left : r.width / 2;
    const y = e.clientY ? e.clientY - r.top  : r.height / 2;
    el.style.setProperty("--rpx", `${x}px`);
    el.style.setProperty("--rpy", `${y}px`);
    el.classList.remove("rippling");
    // force reflow to restart animation
    void el.offsetWidth;
    el.classList.add("rippling");
  };

  if (!mounted) return null;

  // safe destructuring
  const {
    kotId,
    tableId,
    itemsCount = 0,
    subtotal  = 0,
    currency  = "AED",
    etaMin
  } = lastOrder || {};

  return createPortal(
    <div
      className={`modern-success modern-${theme} ${successOpen ? "modern-enter" : "modern-exit"}`}
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      {/* Backdrop (non-interactive; close via button only) */}
      <div className="modern-backdrop" />

      {/* Main card */}
      <div
        ref={cardRef}
        className="modern-card modern-tilt"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {/* cursor-following glint */}
        <div className="modern-glint" aria-hidden />

        {/* Hero */}
        <div
          className={[
            "modern-hero",
            playing ? "modern-animate" : "modern-idle",
            tickDrawn ? "is-drawn" : "",
            emojisStay ? "emojis-stay" : "",
          ].join(" ")}
        >
          <div className={`modern-shockwave ${playing ? "show" : ""}`} />
          <div className="modern-pulse-ring" />

          <div className="modern-circle">
            <div className="modern-check">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="modern-tick-path"
                />
              </svg>
            </div>
          </div>

          {/* Confetti: pop from behind the circle, then stay around it */}
          <div className="modern-floating">
            <div className="modern-float f1">🎉</div>
            <div className="modern-float f2">✨</div>
            <div className="modern-float f3">⭐</div>
          </div>
        </div>

        {/* Content */}
        <div className="modern-content">
          <h2 className="modern-title">Order Confirmed!</h2>
          <p className="modern-subtitle">
            {etaMin ? `Ready in approximately ${etaMin} minutes` : "We are preparing your order now."}
          </p>

          {/* Progress */}
          <div className="modern-progress">
            <div className="modern-progress-bar">
              <div className="modern-progress-fill" />
            </div>
          </div>

          {/* Details */}
          <div className="modern-details modern-stagger">
            <DetailItem icon="📍" label="Table"  value={tableId ? `Table ${tableId}` : "—"} />
            <DetailItem icon="📦" label="Items"  value={itemsCount} />
            <DetailItem icon="💰" label="Total"  value={`${currency} ${Number(subtotal).toFixed(2)}`} />
            {kotId && <DetailItem icon="📋" label="Order ID" value={`#${kotId}`} />}
          </div>

          {/* Action Buttons - Show different buttons based on showAddMoreOptions */}
          {showAddMoreOptions ? (
            <div className="modern-actions" style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '16px', 
              marginTop: '32px',
              width: '100%'
            }}>
              <p className="modern-subtitle" style={{ 
                marginBottom: '4px', 
                fontSize: '16px', 
                fontWeight: '500',
                color: 'rgba(0, 0, 0, 0.7)',
                textAlign: 'center'
              }}>
                Would you like to add more items?
              </p>
              <button
                ref={btnRef}
                className="modern-button"
                onMouseDown={onButtonDown}
                onClick={() => {
                  hideSuccess();
                  // Stay on menu page - user can add more items
                }}
                type="button"
                style={{ width: '100%', marginBottom: '0' }}
              >
                <span>Yes, Add More Items</span>
                <div className="modern-button-arrow">→</div>
              </button>
              <button
                className="modern-button"
                style={{ 
                  width: '100%', 
                  background: 'transparent',
                  border: '2px solid rgba(16, 185, 129, 0.3)',
                  color: 'rgb(16, 185, 129)',
                  marginTop: '0',
                  boxShadow: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                onClick={() => {
                  hideSuccess();
                  // Navigate to payment page if token is available
                  if (token) {
                    navigate(`/r/${token}`);
                  } else {
                    // If no token, show alert that payment page is not available
                    alert("Payment page is not available. Please scan the QR code again to view your orders.");
                  }
                }}
                type="button"
              >
                <span>No, Go to Payment</span>
              </button>
            </div>
          ) : (
            <button
              ref={btnRef}
              className="modern-button"
              onMouseDown={onButtonDown}
              onClick={hideSuccess}
              type="button"
            >
              <span>Got It!</span>
              <div className="modern-button-arrow">→</div>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
