# Vitesse, fluidité 120 Hz & simplification des Réglages

- **Date** : 22 novembre 2026
- **Branche** : `feat/ui-ux-perf-android` (micro-commits poussés sur GitHub)
- **Périmètre** : Démarrage (`src/main.tsx`, `src/App.tsx`), Réglages (`src/views/settings.tsx`, `src/views/settings/nav.tsx`, `src/views/settings/mac-settings-nav.tsx`), Lecteur (`src/components/player/transport.tsx`, `src/views/player/live-layer.tsx`, `src/views/player/panels-layer.tsx`), transitions CSS (`112` fichiers `src/`).

---

## 1. Mesures avant / après (build production + `pnpm perf:budget`)

| Métrique | Avant | Après | Gain |
| --- | ---: | ---: | ---: |
| **Initial linked payload (gzip)** | `793.6 KiB` / 840 | **`616.6 KiB`** / 840 | **−177.0 KiB (−22,3 %)** |
| **Entry JS (`index-*.js`, gzip)** | `599.1 KiB` (`2 115 kB` brut) | **`422.1 KiB`** (`1 477 kB` brut) | **−177.0 KiB (−29,5 % / −638 kB brut)** |
| **Settings JS (`settings-*.js`, gzip)** | `310.3 KiB` (`1 159 kB` brut) | **`34.8 KiB`** (`133 kB` brut) | **−275.5 KiB (−88,8 % / −1,03 Mo brut)** |
| **Player JS (`player-*.js`, gzip)** | `296.8 KiB` (`665 kB` brut) | **`287.4 KiB`** (`627 kB` brut) | **−9.4 KiB (−38 kB brut)** |
| **Dette `transition-all`** | `162` occurrences | **`0`** | **−100 %** |
| **Avertissement Vite > 1500 kB** | Présent | **Supprimé** | — |

---

## 2. Micro-commits poussés durant la session

1. `feat(typography): set Google Sans as primary interface font`
2. `fix(ui): resolve desktop UI/UX, a11y, focus traps, and player shortcuts`
3. `feat(android): upgrade native Kotlin/Media3 bridge and Material 3 mobile UX`
4. `perf(boot): lazy-load secondary window apps in main.tsx (-89 KiB gzip entry)`
5. `perf(boot): lazy-load alternative chrome layouts, mobile shell, and secondary modals (-88 KiB gzip)`
6. `perf(settings): lazy-load all 26 settings panels (310 -> 34.6 KiB gzip)`
7. `perf(player): lazy-load live TV overlay, DVR, cast modal, episode panel, and alt transports`
8. `perf(css): replace all 162 transition-all uses with targeted GPU-friendly transitions`
9. `feat(settings): collapse advanced technical sections behind toggle and show app version footer`

---

## 3. Vérifications

- `pnpm test:design` : **14/14** contrôles passés (`0 transition-all`).
- `pnpm exec tsc -b` : **0 erreur**.
- `pnpm lint` : **0 avertissement**, **267/267** contrôles d'erreurs silencieuses.
- `pnpm test` : **231/231 fichiers, 1 291/1 291 tests passés**.
- `vite build && pnpm perf:budget` : **6/6 budgets passés**.
