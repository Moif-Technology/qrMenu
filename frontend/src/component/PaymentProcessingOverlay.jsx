import { createPortal } from "react-dom";

/**
 * PaymentProcessingOverlay – shown while a Telr payment session is being
 * created and the browser is about to be redirected to the gateway. No
 * close/cancel action on purpose: this is the window where a guest closing
 * the tab or hitting back can leave a payment authorised by the bank but
 * never recorded against the bill.
 *
 * Always shows English + Arabic together, regardless of the menu's current
 * language setting - most UAE dine-in tables mix both, and this message is
 * too important to gate behind whichever language happened to be selected.
 *
 * Usage:
 *   <PaymentProcessingOverlay show={isPaymentProcessing} />
 */
export default function PaymentProcessingOverlay({ show }) {
  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 pt-8 pb-7 flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-full border-[3px] border-gray-200 border-t-gray-900 animate-spin mb-4" />

          <h3 className="text-base font-semibold text-gray-900 mb-1.5">
            Redirecting to payment
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            You're being taken to the secure payment page. Please don't close this window or tap back until your payment is complete.
          </p>

          <div className="w-full h-px bg-gray-100 my-4" />

          <h3 className="text-base font-semibold text-gray-900 mb-1.5" dir="rtl">
            جارٍ التحويل إلى صفحة الدفع
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed" dir="rtl">
            سيتم تحويلك إلى صفحة الدفع الآمنة. يرجى عدم إغلاق هذه الصفحة أو الرجوع للخلف حتى تكتمل عملية الدفع.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
