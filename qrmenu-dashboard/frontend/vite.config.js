import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.DASHBOARD_API_URL || "http://localhost:5002",
        changeOrigin: true
      }
    }
  }
});
