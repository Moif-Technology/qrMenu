import { create } from "zustand";
import i18n from "../i18n/config";

const LANG_KEY = "ui.lang";

const getInitialLang = () => {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LANG_KEY);
  return stored || "en";
};

const applyLang = (lang) => {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", lang);
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANG_KEY, lang);
  }
  i18n.changeLanguage(lang);
};

const initialLang = getInitialLang();
applyLang(initialLang);

export const useUI = create((set) => ({
  lang: initialLang, // 'en' | 'ar'
  setLang: (lang) => {
    applyLang(lang);
    set({ lang });
  },
  theme: "light",
  setTheme: (theme) => set({ theme }),


  // --- new success overlay state ---
  successOpen: false,
  lastOrder: null,
  showAddMoreOptions: false, // Flag to show "add more items" buttons
  showSuccess: (orderMeta, showOptions = false) => set({
    successOpen: true,
    lastOrder: orderMeta,
    showAddMoreOptions: showOptions,
  }),
  hideSuccess: () => set({ successOpen: false, lastOrder: null, showAddMoreOptions: false }),
}));
