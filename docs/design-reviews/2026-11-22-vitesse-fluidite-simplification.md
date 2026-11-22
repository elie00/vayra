# Vitesse, fluidité 120 Hz, simplification & accessibilité

- **Date** : 22 novembre 2026
- **Branche** : `feat/ui-ux-perf-android` (20+ micro-commits poussés automatiquement sur GitHub)
- **Périmètre** : Démarrage (`src/main.tsx`, `src/App.tsx`, `src/views/home.tsx`, `src/chrome/topbar.tsx`), Réglages (`src/views/settings.tsx`, `src/views/settings/nav.tsx`, `src/views/settings/mac-settings-nav.tsx`), Lecteur (`src/components/player/transport.tsx`, `src/components/player/cast-icon.tsx`, `src/views/player/{cast,live,panels,room}-layer.tsx`), transitions CSS (`112` fichiers `src/`), accessibilité sémantique (modales, lightboxes, contrôles) et garde-fous CI (`scripts/check-design.mjs`, `scripts/check-bundle-budgets.mjs`).

---

## 1. Mesures avant / après (build production + `pnpm perf:budget` + `pnpm test:design`)

| Métrique | Avant | Après | Gain | Nouveau plafond CI |
| --- | ---: | ---: | ---: | ---: |
| **Initial linked payload (gzip)** | `793.6 KiB` | **`555.8 KiB`** | **−237.8 KiB (−30,0 %)** | `620 KiB` (vs 840) |
| **Entry JS (`index-*.js`, gzip)** | `599.1 KiB` (`2 115 kB` brut) | **`361.3 KiB`** (`1 226 kB` brut) | **−237.8 KiB (−39,7 % / −889 kB brut)** | `420 KiB` (vs 650) |
| **Settings JS (`settings-*.js`, gzip)** | `310.3 KiB` (`1 159 kB` brut) | **`35.0 KiB`** (`133 kB` brut) | **−275.3 KiB (−88,7 % / −1,03 Mo brut)** | `60 KiB` (vs 325) |
| **Player JS (`player-*.js`, gzip)** | `296.8 KiB` (`665 kB` brut) | **`96.8 KiB`** (`334 kB` brut) | **−200.0 KiB (−67,4 % / −331 kB brut)** | `135 KiB` (vs 310) |
| **Dette `transition-all`** | `162` occurrences | **`0`** | **−100 %** | **`0`** (vs 167) |
| **Cibles non sémantiques (`<div/span onClick>`)** | `111` occurrences | **`22`** | **−89 (−80,2 %)** | **`25`** (vs 111) |
| **Avertissement Vite > 1500 kB** | Présent | **Supprimé** | — | — |

---

## 2. Micro-commits poussés durant la session (`feat/ui-ux-perf-android`)

1. `9d3d2e25` — `feat(typography): set Google Sans as primary interface font`
2. `98c01e35` — `fix(ui): resolve desktop UI/UX, a11y, focus traps, and player shortcuts`
3. `7d4d4d53` — `feat(android): upgrade native Kotlin/Media3 bridge and Material 3 mobile UX`
4. `efa71fca` — `perf(boot): lazy-load secondary window apps in main.tsx (-89 KiB gzip entry)`
5. `12aa415c` — `perf(boot): lazy-load alternative chrome layouts, mobile shell, and secondary modals (-88 KiB gzip)`
6. `42c2416f` — `perf(settings): lazy-load all 26 settings panels (310 -> 34.6 KiB gzip)`
7. `ab69a2cc` — `perf(player): lazy-load live TV overlay, DVR, cast modal, episode panel, and alt transports`
8. `4387bb5f` — `perf(css): replace all 162 transition-all uses with targeted GPU-friendly transitions`
9. `c185f705` — `feat(settings): collapse advanced technical sections behind toggle and show app version footer`
10. `e5fcf5e4` — `docs(perf): record boot, settings, player, and transition-all gains`
11. `55d3858e` — `perf(player): lazy-load cast device icons, cast layer, and room overlays (287 -> 96.6 KiB gzip)`
12. `5e90aae3` — `perf(boot): lazy-load TogetherPopover, MobileHome, HeroCarousel, HoverPreview, and global overlays (-61 KiB gzip)`
13. `73a5205c` — `a11y(controls): migrate interactive span/div role=button controls to semantic buttons`
14. `38eab497` — `a11y(modals): use semantic sibling backdrop buttons across 8 modals (-16 non-semantic clicks)`
15. `bd245ed9` — `a11y(modals): use semantic sibling backdrops and dialog roles across 10 modals (-20 non-semantic clicks)`
16. `0bb84c57` — `a11y(modals): replace backdrop click divs with semantic buttons in 10 component modals`
17. `bde56d58` — `a11y(modals): use semantic sibling backdrops across 9 player and view modals`
18. `b1ead0e2` — `a11y(modals): use semantic sibling backdrops across 5 modals and 3 lightboxes`
19. `2db09e3f` — `a11y(controls): make cast error backdrop and player layout editor selectors semantic buttons`
20. `chore(ci): tighten bundle budgets and design debt ratchets` (+ correctif clé i18n `Switch stream`)

---

## 3. Vérifications

- `pnpm test:design` : **14/14** contrôles passés (`22 non-semantic click`, `30 autofocus`, `0 transition-all`).
- `pnpm exec tsc -b` : **0 erreur**.
- `pnpm lint` : **0 avertissement**, **267/267** contrôles d'erreurs silencieuses.
- `pnpm test` : **231/231 fichiers, 1 291/1 291 tests passés**.
- `vite build && pnpm perf:budget` : **6/6 budgets passés** avec plafonds resserrés.
- Application macOS `/Applications/VAYRA.app` : reconstruite, signée (`codesign --verify --deep --strict`), parité SHA-256 vérifiée et relancée.
