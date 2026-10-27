/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Capacitor bundles assets locally inside a WebView, where a PWA service worker
// only causes stale-asset bugs after an app update. Skip the SW for native builds
// (CAPACITOR=true, see the build:native script); keep it for the web/Vercel build.
const isCapacitor = process.env.CAPACITOR === "true";

export default defineConfig({
  plugins: [
    react(),
    ...(isCapacitor
      ? []
      : [
          VitePWA({
            registerType: "autoUpdate",
            manifest: false,
          }),
        ]),
  ],
  server: {
    proxy: {
      "/auth": "http://localhost:8000",
      "/scan": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
