import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Les fichiers tmdb-episode-*.test.ts sont des vérifications de TYPES (pas de
    // suites de test) — couvertes par tsc, à ne pas exécuter par vitest.
    exclude: ["**/node_modules/**", "**/providers/tmdb/tmdb-episode-*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
