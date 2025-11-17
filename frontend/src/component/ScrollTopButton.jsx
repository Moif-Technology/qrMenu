import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useTranslation } from "react-i18next";

export default function ScrollTopButton() {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 480);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className="fixed bottom-24 right-4 z-[70] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-gradient-to-br from-[var(--grad-start)] to-[var(--grad-end)] text-white shadow-[0_18px_30px_rgba(122,0,38,0.25)] transition hover:shadow-[0_22px_40px_rgba(122,0,38,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:bottom-8 sm:right-8"
      aria-label={t("common.back_to_top")}
      title={t("common.back_to_top")}
    >
      <Icon name="arrow-up" className="h-4 w-4" />
    </button>
  );
}
