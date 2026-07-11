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
    // Les deux familles de défauts de hooks sont bloquantes : une dépendance
    // oubliée produit une closure périmée et doit être corrigée avant intégration.
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
