// src/component/PaymentSuccess.jsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import Lottie from "lottie-react";
import successAnimation from "../assets/anim/success.json";

export default function PaymentSuccess({ open, onClose, paymentData }) {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const lottieRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      
      // Reset animation to start
      if (lottieRef.current) {
        lottieRef.current.goToAndPlay(0);
      }
    } else if (mounted) {
      // Graceful exit transition
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open, mounted]);

  if (!mounted || !paymentData) return null;

  const amountPaid = Number(paymentData.amountPaid || paymentData.totalPaid || 0);
  const paymentId = paymentData.paymentId || paymentData.PaymentID || "—";

  const handleViewMenu = () => {
    onClose();
    navigate("/");
  };

  const handleClose = () => {
    onClose();
    window.location.reload();
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Main Card */}
      <div
        className={`relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all duration-300 ${
          open ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
      >
        {/* Gradient Header */}
        <div className="relative bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600 p-8 pb-12">
          {/* Animated Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.3)_1px,transparent_1px)] bg-[length:20px_20px]" />
          </div>
          
          {/* Lottie Animation */}
          <div className="relative z-10 flex items-center justify-center">
            <div className="w-48 h-48 -mb-8">
              <Lottie
                lottieRef={lottieRef}
                animationData={successAnimation}
                loop={true}
                autoplay={true}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 pt-8">
          {/* Title */}
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Payment Complete!
            </h2>
            <p className="text-gray-600 text-base">
              Thank you for dining with us! Your bill has been paid successfully.
            </p>
          </div>

          {/* Payment Details */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-6 mb-6 border border-emerald-100">
            <div className="space-y-4">
              {/* Amount Paid */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 font-medium">Bill Amount</div>
                    <div className="text-2xl font-bold text-gray-900">{amountPaid.toFixed(2)} AED</div>
                  </div>
                </div>
              </div>

              {/* Payment ID */}
              <div className="pt-4 border-t border-emerald-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 font-medium">Payment ID</span>
                  <span className="text-sm font-semibold text-gray-700 font-mono">#{paymentId}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Success Message */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-green-800">
                Your payment has been processed successfully. We hope you enjoyed your dining experience! We look forward to serving you again soon.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Primary Button - View Menu */}
            <button
              onClick={handleViewMenu}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>View Menu</span>
            </button>

            {/* Secondary Button - Close */}
            <button
              onClick={handleClose}
              className="w-full bg-white text-emerald-600 font-semibold py-4 px-6 rounded-xl border-2 border-emerald-500 hover:bg-emerald-50 transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
            >
              <span>Close</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

