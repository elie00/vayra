# Interface VAYRA avec Google Sans

22 novembre 2026 · VAYRA 0.9.42 · changements locaux à partir de `538fd214` (modifications étrangères au lot préservées).

**Google Sans** devient la police principale de l’interface VAYRA (titres, navigation, cartes et commandes), avec des fichiers variables `woff2` embarqués (droit et italique, jeux `latin` et `latin-ext`, SIL OFL 1.1) et une mise en cohérence des proportions typographiques de l’interface pour accompagner le passage d’une paire serif + sans (`Fraunces` + `Inter`) à une famille géométrique unifiée.

Les choix explicites existants (`Fraunces + Inter`, `Geist`, `Sentient + Switzer`, etc.) restent disponibles dans **Thème et apparence → Typographie** et sont conservés lorsqu’un utilisateur les a sélectionnés manuellement ; un réglage par défaut sans choix explicite bascule sur `Google Sans`.

## Périmètre et exclusions

- **Inclus** : embarquement des polices locales ([fonts-embedded.css](../../src/styles/fonts-embedded.css), [OFL.txt](../../src/assets/fonts/google/OFL.txt)), résolution par défaut ([theme.ts](../../src/lib/theme.ts)), réglages optiques et échelle typographique ([index.css](../../src/index.css), [mac-ux.css](../../src/styles/mac-ux.css)), harmonisation de la barre latérale, des rails, des cartes, des en-têtes display, des métadonnées, des téléchargements et des réglages ([sidebar.tsx](../../src/chrome/sidebar.tsx), [row.tsx](../../src/components/row.tsx), [pick-card.tsx](../../src/components/pick-card.tsx), [top-match.tsx](../../src/components/search/top-match.tsx), [info-block.tsx](../../src/views/detail/info-block.tsx), [downloads.tsx](../../src/views/downloads.tsx), [shared.tsx](../../src/views/settings/shared.tsx), [font-grid.tsx](../../src/views/settings/theme-panel/font-grid.tsx)), traductions FR/AR et tests unitaires.
- **Exclus** : publication web, modification de comptes/bibliothèque/téléchargements, reconstruction/remplacement du paquet quotidien `/Applications/VAYRA.app` (en attente de feu vert explicite).

## Matrice Checklist Design (Typography, Tokens, Button, Card, Settings)

| Vérification | Statut | Preuve |
| --- | --- | --- |
| Embarquement hors-ligne et licence OFL | **Couvert** | Source & build : 4 fichiers `GoogleSans*.woff2` (177 Kio total) dans `src/assets/fonts/google/` et `dist/assets/`, sans requête CDN. |
| Réglage optique, italique réel, anti-faux-gras | **Couvert** | Source : `font-optical-sizing: auto`, `font-synthesis: none` et `font-feature-settings: normal` sur `:root` (les alternates Inter `cv11`/`ss01` restent isolés sur `fraunces-inter`). |
| Hiérarchie unifiée sans serif (titres, rails, cartes, boutons) | **Couvert** | Source & rendu aperçu : `.mac-page-title` (32 px / 1.12 / −0.025em), rails bureau à 18 px (`opsz` Display), interlignages display ≥ 1.04 pour les capitales accentuées françaises, `tabular-nums` sur notes et téléchargements, `font-weight: 500` sur l’item actif sans tuile décorative ni séparateur vertical. |
| Échelle mobile / Material 3 (`type-*`) | **Couvert** | Source : utilitaires `type-micro` à `type-display` alignés sur Google Sans. |
| Sélection de police, état actif et accessibilité (`aria-pressed`) | **Couvert** | Tests & aperçu : `Google Sans` en première tuile active, bascule vers `Fraunces + Inter` puis retour sur `Google Sans`, `type="button"` et `aria-pressed` ajoutés sur `FontGrid` et `FontPicker`. |
| Rendu français et fenêtre étroite (960 × 600) | **Couvert** | Observation aperçu (`vite preview` à 1 280 × 800 et 960 × 600) : capture vérifiée sur **Thème et apparence → Typographie** sans débordement horizontal ni rognage des accents français. |
| Rendu natif macOS WebKit (`/Applications/VAYRA.app`), Windows et Android | **Non vérifié** | Aucune reconstruction/installation du binaire natif sur ce lot ; à contrôler après `pnpm tauri:build:macos` si livraison demandée. |

## Contrôles exécutés sur l’état final

- `pnpm test:design` : 14/14 contrôles réussis, budgets de dette inchangés.
- `pnpm exec tsc -b` : 0 erreur.
- `pnpm lint` (`eslint . --max-warnings 0` + `check-silent-errors`) : 0 avertissement, 267/267.
- `pnpm test` (Node 26, `--no-experimental-webstorage`) : 230/230 fichiers, 1 285/1 285 tests réussis (dont `theme.test.ts` et `sidebar-motion.test.tsx`).
- `pnpm exec vite build && pnpm perf:budget` : 6/6 budgets passés (chargement initial 792,0 Kio gzip / 840 Kio).
