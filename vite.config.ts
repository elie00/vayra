import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __IS_BETA_BUILD__: JSON.stringify(process.env.HARBOR_CHANNEL !== "stable"),
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  resolve: {
    alias: { "@": "/src" },
  },
});
