import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Les fichiers tmdb-episode-*.test.ts sont des vérifications de TYPES (pas de
    // suites de test) — couvertes par tsc, à ne pas exécuter par vitest.
    exclude: ["**/node_modules/**", "**/providers/tmdb/tmdb-episode-*.test.ts"],
    // `@tauri-apps/api` n'est chargé qu'à travers des imports dynamiques, que
    // vi.mock ne réussissait à intercepter que si le pré-bundling de Vite ne
    // s'intercalait pas : sous charge le vrai module passait, et `listen`
    // échouait sur `window is not defined` (flake de local-transport.test.ts).
    server: { deps: { inline: [/@tauri-apps\/api/] } },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
