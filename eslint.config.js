// Config ESLint volontairement CIBLÉE sur les hooks React : c'est la classe de
// bugs (deps manquantes -> stale closures) qui n'était jamais vérifiée. On évite
// d'activer tout le recommended pour ne pas noyer le signal sous le bruit legacy.
// Pour durcir plus tard: passer exhaustive-deps en "error".
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "src-tauri/**",
      "node_modules/**",
      "**/*.d.ts",
      "vite.config.*",
      "vitest.config.*",
      "eslint.config.js",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser },
    },
    // typescript-eslint enregistré (sans règles actives) pour que les directives
    // `/* eslint-disable @typescript-eslint/... */` déjà présentes se résolvent.
    plugins: { "@typescript-eslint": tseslint.plugin, "react-hooks": reactHooks },
    // rules-of-hooks STRICT (0 violation après le fix de transport.tsx) : toute
    // nouvelle violation casse la CI. exhaustive-deps reste en "warn" le temps de
    // résorber les ~159 cas legacy (à durcir en "error" plus tard).
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
