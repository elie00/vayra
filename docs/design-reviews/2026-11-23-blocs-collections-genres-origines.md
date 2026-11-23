# Revue UI/UX — Blocs Collections, Genres et Langues / Origines (macOS)

- **Date** : 2026-11-23
- **Branche** : `feat/blocks-collections-genres-origins` (depuis `main` `81f47eb0`)
- **Périmètre** : `CollectionCard`, `CollectionsRow`, `CollectionsView`, `GenreTiles`, `LanguageTiles`, `AwardTiles`, `Discover`, `FilterView` (`Header`, `Rails`), `AnimeGenrePicker` (origines et genres), squelette `Row`.
- **Exclusions** : modifications locales antérieures des 17–18 nov. (préservées intactes), comptes tiers et données privées.

## Matrice Checklist Design

| Checklist | Statut | Détail & preuves |
|---|---|---|
| **Card** (style, cohérence, hiérarchie, responsive) | **Couvert** (sources + tests) | Famille unique minérale sur `CollectionCard` (`16:9`) et les tuiles `5:4` (`GenreTiles`, `LanguageTiles`, `AwardTiles`) : backdrop plein cadre unique, voile minéral basse chroma, scrim bas uniforme, `line-clamp-2` / `truncate`, focus visible (`focus-visible:ring-2`) et `motion-reduce`. |
| **Carousel / Row** (dimensions, squelettes, mémoire de scroll) | **Couvert** (sources + tests) | Nouveau gabarit squelette `shape="banner"` (`aspect-[16/9]` sans lignes fantômes) dans `Row` pour `CollectionsRow` ; `scrollKey` ajoutés sur `GenreTiles`, `LanguageTiles` et `AwardTiles` ; espacement dans `Discover` (`LanguageTiles` à `i === 2`, `CollectionsRow` à `i === 3`, `CriticsPick` à `i === 4`, `AwardTiles` à `i === 5`). |
| **Filtering items** (bascule média, feedback, cohérence) | **Couvert** (sources + tests unitaires) | `MediaTypeToggle` activé sur `genre` (conversion ID TMDB Films ↔ Séries via `GENRE_MOVIE_TO_TV` / `GENRE_TV_TO_MOVIE`), sélecteur `Tout / Films / Séries` sur `language`, correction du sélecteur `GenreSwitcher` en mode `tv` (IDs `TV_GENRES` au lieu de `MOVIE_GENRES`), traduction française complète des en-têtes. |
| **Typography & i18n** (titres longs, endonymes, français) | **Couvert** (sources + tests) | Endonymes `LanguageTiles` bornés (`max-w-[calc(100%-2rem)] truncate text-[26px]`), titres de tuiles harmonisés à `22px` avec `line-clamp-2`, traduction des 16 genres dans `AnimeGenrePicker` (`{t(opt.label)}`). |
| **Accessibilité clavier & dialogues** | **Couvert** (sources + tests) | `aria-pressed` sur chips `CollectionsView`, `MediaTypeToggle`, `LanguageScopeToggle`, `AnimeGenrePicker` ; `role="dialog" aria-modal="true"` sur `AnimeGenrePicker` ; `role="listbox"` / `role="option"` / `Escape` sur `GenreSwitcher` ; `aria-disabled` sur `CollectionCard` non résolu. |
| **Rendu visuel en direct macOS** | **Vérifié après build** | App `/Applications/VAYRA.app` reconstruite et vérifiée après validation CI (`codesign` + SHA-256). |

## Écarts corrigés

1. **Collage 3 tranches inclinées + `mix-blend-multiply`** (`src/components/genre-tiles.tsx`, `src/components/language-tiles.tsx`) : remplacé par un backdrop cinéma plein cadre avec déduplication inter-tuiles, `IntersectionObserver` (`450px`) et cache mémoire de session.
2. **Squelette décalé sur `CollectionsRow`** (`src/components/row.tsx`, `src/components/collections-row.tsx`) : ajout de `shape="banner"` sans lignes de légende fantômes.
3. **Genres verrouillés sur Films + bug d’IDs TV dans `GenreSwitcher`** (`src/views/filter/header.tsx`, `src/views/filter.tsx`, `src/views/filter/rails.tsx`) : ajout du basculeur Films/Séries sur les genres convertibles et `Tout / Films / Séries` sur les langues, avec mapping TMDB exact et tests dédiés (`src/views/filter/header.test.tsx`).
4. **Endonymes longs et titres longs non clampés** (`src/components/collection-card.tsx`, `src/components/genre-tiles.tsx`, `src/components/language-tiles.tsx`) : clamp/truncature sur desktop et mobile.
5. **Empilement vertical dans `Discover`** (`src/views/discover.tsx`) : séparation de `LanguageTiles` et `CollectionsRow` sur deux index distincts.
6. **Genres anglais bruts & sémantique ARIA dans `AnimeGenrePicker`** (`src/components/anime-genre-picker.tsx`) : traduction `{t(opt.label)}`, `role="dialog"`, `aria-pressed` et `role="checkbox"`.
