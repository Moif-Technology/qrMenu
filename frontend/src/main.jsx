import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n/config";

const BUILD_RELOAD_KEY = "qrmenu:last-auto-reload-entry";

async function checkForNewDeployAndReloadOnce() {
  if (import.meta.env.DEV || typeof window === "undefined") return;

  try {
    const currentEntry = document
      .querySelector('script[type="module"][src]')
      ?.getAttribute("src");
    if (!currentEntry) return;

    const url = new URL(window.location.href);
    url.hash = "";

    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) return;

    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const latestEntry = parsed
      .querySelector('script[type="module"][src]')
      ?.getAttribute("src");

    if (!latestEntry) return;
    if (latestEntry === currentEntry) {
      window.sessionStorage.removeItem(BUILD_RELOAD_KEY);
      return;
    }

    // Prevent reload loops: auto-reload only once per detected entry file.
    if (window.sessionStorage.getItem(BUILD_RELOAD_KEY) === latestEntry) return;

    window.sessionStorage.setItem(BUILD_RELOAD_KEY, latestEntry);
    window.location.reload();
  } catch {
    // Non-blocking safety check; ignore network/parser failures.
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

checkForNewDeployAndReloadOnce();
