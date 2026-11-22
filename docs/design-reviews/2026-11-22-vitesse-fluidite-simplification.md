# Vitesse, fluidité 120 Hz, simplification, accessibilité & parcours cœur

- **Date** : 22 novembre 2026
- **Branche** : `feat/ui-ux-perf-android` (31 micro-commits poussés automatiquement sur GitHub)
- **Périmètre** : Démarrage (`src/main.tsx`, `src/App.tsx`, `src/views/home.tsx`, `src/chrome/topbar.tsx`, `src/lib/i18n/translate.ts`, `src/index.css`), Réglages (`src/views/settings.tsx`, `src/views/settings/nav.tsx`, `src/views/settings/mac-settings-nav.tsx`), 5 parcours cœur (Accueil, Recherche, Fiche détail, Play Picker, Lecteur), transitions CSS (`112` fichiers), accessibilité sémantique et garde-fous CI.

---

## 1. Mesures avant / après (build production + `pnpm perf:budget` + `pnpm test:design`)

| Métrique | Avant | Après | Gain | Plafond CI |
| --- | ---: | ---: | ---: | ---: |
| **Initial linked payload (gzip)** | `793.6 KiB` | **`552.0 KiB`** | **−241.6 KiB (−30,4 %)** | `620 KiB` (vs 840) |
| **Entry JS (`index-*.js`, gzip)** | `599.1 KiB` (`2 115 kB`) | **`361.6 KiB`** (`1 227 kB`) | **−237.5 KiB (−39,6 % / −888 kB brut)** | `420 KiB` (vs 650) |
| **i18n FR bloquant au boot (`fr-core`)** | `191.6 KiB` (`539 kB` brut) | **`29.6 KiB`** (`79.6 kB` brut) | **−162.0 KiB (−84,6 % / −85,2 % brut)** | hydratation idle `fr-extended` |
| **CSS initial (`index-*.css`)** | `474.4 kB` (`53.9 KiB` gzip) | **`441.1 kB`** (`49.8 KiB` gzip) | **−33.3 kB brut (−4.1 KiB gzip)** | facettes thèmes + mobile lazy |
| **Settings JS (`settings-*.js`, gzip)** | `310.3 KiB` (`1 159 kB`) | **`35.0 KiB`** (`133 kB`) | **−275.3 KiB (−88,7 % / −1,03 Mo brut)** | `60 KiB` (vs 325) |
| **Player JS (`player-*.js`, gzip)** | `296.8 KiB` (`665 kB`) | **`96.8 KiB`** (`334 kB`) | **−200.0 KiB (−67,4 % / −331 kB brut)** | `135 KiB` (vs 310) |
| **Detail JS (`detail-*.js`, gzip)** | `73.2 KiB` (`264 kB`) | **`24.9 KiB`** (`84.8 kB`) | **−48.3 KiB (−66,0 % / −67,9 % brut)** | — |
| **Play Picker JS (`play-picker-*.js`, gzip)** | `35.7 KiB` (`123 kB`) | **`22.8 KiB`** (`71.4 kB`) | **−12.9 KiB (−36,2 % / −42,0 % brut)** | — |
| **Dette `transition-all`** | `162` occurrences | **`0`** | **−100 %** | **`0`** (vs 167) |
| **Cibles non sémantiques (`<div/span onClick>`)** | `111` occurrences | **`22`** | **−89 (−80,2 %)** | **`25`** (vs 111) |

---

## 2. Finition UX & qualité perçue sur les 5 parcours cœur

1. **Accueil** : suppression du `decoding="sync"` bloquant dans [continue-card.tsx](file:///Users/eybo/PycharmProjects/vayra/src/components/continue-card.tsx) + retrait de la promotion GPU permanente (`willChange: "transform"`) sur chaque rail inactif dans [row.tsx](file:///Users/eybo/PycharmProjects/vayra/src/components/row.tsx).
2. **Recherche** : correction du libellé non traduit `"Movie" / "Series"` dans [top-match.tsx](file:///Users/eybo/PycharmProjects/vayra/src/components/search/top-match.tsx), ajout des repères clavier (`↑↓`, `↵`, `Esc`) et lazy-loading des cartes secondaires (`GuideModal`, `AiSearchSection`, `MagnetCard`, `UrlCard`) dans [search-overlay.tsx](file:///Users/eybo/PycharmProjects/vayra/src/components/search/search-overlay.tsx).
3. **Fiche détail** : découpage de 14 sous-vues/sections lourdes (`264 → 85 kB`), raccourcis clavier desktop (`Esc` retour/fermeture trailer, `P` lecture, `W` watchlist) dans [detail.tsx](file:///Users/eybo/PycharmProjects/vayra/src/views/detail.tsx).
4. **Play Picker** : découpage des vues mobile/Stremio/tiroir/modales (`123 → 71 kB`), raccourcis clavier desktop (`Enter` lancer la meilleure source, `R` rafraîchir, `Esc` retour) et `decoding="async"` / `fetchPriority="high"` sur la carte principale dans [play-picker.tsx](file:///Users/eybo/PycharmProjects/vayra/src/views/play-picker.tsx) et [primary-card.tsx](file:///Users/eybo/PycharmProjects/vayra/src/views/play-picker/primary-card.tsx).
5. **Lecteur** : scrubbing 120 Hz zéro reflow (`DOMRect` mis en cache sur pointerdown/enter), infobulle temporelle bornée aux bords (`clamp`), et support complet `role="slider"` + flèches/Début/Fin au clavier dans [seek-bar.tsx](file:///Users/eybo/PycharmProjects/vayra/src/components/player/transport/seek-bar.tsx).

---

## 3. Vérifications automatiques

- `pnpm test:design` : **14/14** contrôles passés (`22 non-semantic click`, `30 autofocus`, `0 transition-all`).
- `pnpm exec tsc -b` : **0 erreur**.
- `pnpm lint` : **0 avertissement**, **267/267** contrôles d'erreurs silencieuses.
- `pnpm test` : **231/231 fichiers, 1 291/1 291 tests passés**.
- `vite build && pnpm perf:budget` : **6/6 budgets passés** avec plafonds resserrés.
- Application macOS `/Applications/VAYRA.app` : non réinstallée (en attente du feu vert utilisateur).
