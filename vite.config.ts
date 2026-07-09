import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Pre-bundle these (esp. CommonJS) deps at dev-server start so Vite doesn't
  // pause to re-optimize them mid-navigation — which otherwise makes the first
  // visit to the product page (jsbarcode) or analytics pages stall and reload.
  optimizeDeps: {
    include: [
      "jsbarcode",
      "@tanstack/react-table",
      "xlsx",
      "jspdf",
      "jspdf-autotable",
    ],
  },

  // The app ships to Windows 7 via a pinned WebView2 v109 (Chromium 109) runtime,
  // so cap the JS/CSS output at what Chromium 109 supports. Without this, esbuild
  // may emit newer syntax that the frozen v109 engine can't parse.
  build: {
    target: "chrome109",
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1431,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
