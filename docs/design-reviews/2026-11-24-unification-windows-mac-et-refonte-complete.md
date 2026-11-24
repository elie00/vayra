# Unification Windows / macOS et achèvement de la refonte post-Harbor de VAYRA — 24 novembre 2026

## Périmètre et objectif

1. **Synchroniser et unifier Windows et macOS** : intégrer les mises à jour poussées depuis Windows (`origin/main` jusqu'à `3d8f413b`, ainsi que les 15 scénarios `.recette` et correctifs d'accessibilité des Réglages `5a6826de`) avec les correctifs locaux réalisés sur macOS, afin de former une base unique sur `feat/refonte-unifiee-vayra`.
2. **Supprimer les divergences visuelles et d'interaction entre Windows et macOS** (`desktopUx()` / `hasNativeDesktopUx()`) : typographie d'affichage partagée, barre supérieure stable en `h-16` sur toutes les vues bureau, absence de barre de recherche flottante parasite au-dessus des Réglages ou du Sélecteur de sources, pilules minérales dépolies `h-9` et capsule unifiée des boutons de fenêtre.
3. **Achever la refonte post-Harbor de VAYRA** sur les surfaces restantes (Recherche, Fiche détail, Sélecteur de sources, sous-univers d'Explorer et Extensions), en conservant le nom **VAYRA**, la marque `HarborMark` et toutes les fonctionnalités existantes.

## Lots livrés

### 1. Socle commun Windows + macOS et fiabilisation des Téléchargements
- **Synchronisation Bibliothèque ↔ Téléchargements** (`src/views/library.tsx`, `src/views/library/library-downloads-integration.test.tsx`) : l'onglet « Téléchargements » de `Ma bibliothèque` et l'entrée imbriquée de la barre latérale partagent désormais le même état de navigation sur macOS et Windows.
- **Nettoyage sûr des sous-dossiers vides** (`src-tauri/src/download.rs`, `src/lib/download/video-download.ts`, `src/lib/download/downloads-store.ts`, `src/components/delete-download-dialog.tsx`) : la suppression d'un téléchargement retire uniquement son sous-dossier immédiat lorsqu'il est vide et situé à l'intérieur de la racine des téléchargements, sans jamais supprimer la racine ni un dossier contenant d'autres fichiers ou téléchargements actifs.
- **Correctifs transverses** : état de recherche sur saisie de lien direct (`src/lib/search-context.tsx`), garde de reprise synchrone du lecteur (`src/views/player/hooks/use-bridge-load.ts`) et police par défaut du studio de thème (`src/views/settings/theme-panel/theme-studio.tsx`).

### 2. Chrome bureau unifié Windows et macOS (`src/styles/mac-ux.css`, `src/chrome/*`, `src/components/downloads-popover.tsx`)
- **Hiérarchie typographique commune** : extension de la règle `h1, h2, h3, h4 { font-family: var(--font-display); }` à `[data-desktop-ux]:not([data-desktop-ux="none"])` pour aligner Windows et macOS.
- **Barre supérieure stable (`h-16`)** : suppression du saut à `h-20` et de la pilule de recherche redondante sur les vues `Paramètres` et `PlayPicker` sur bureau.
- **Pilules minérales `.vayra-chrome-pill` (`h-9`) et capsule de fenêtre** : harmonisation de `BackChrome`, `FloatingBack`, `RecordingPill`, `DownloadsButton`, `TogetherButton` et regroupement des trois contrôles de fenêtre (`Réduire`, `Zoom / Agrandir`, `Fermer`) dans une capsule dépolie unifiée, sans modifier l'ordre ni le nombre de contrôles interactifs attendus par `recette/desktop/navigation.recette`.

### 3. Recherche — Palette cinéma VAYRA (`src/components/search/*`)
- Barre de commande dépolie (`data-search-field=""`, conservation stricte du contrat `h-16 min-w-0 flex-1 bg-transparent` vérifié par `search-field.test.ts`).
- Carte « Meilleur résultat » (`TopMatch`) cadrée dans `.vayra-stage` avec vignette atmosphérique, étiquette `.vayra-kicker` et bouton d'ouverture sobre en `rounded-xl`.
- État initial (`EmptyState`) et listes (`MetaList`) harmonisés autour de `.vayra-kicker`, de tuiles minérales `rounded-xl` et d'un bouton « Surprenez-moi » secondaire discret.

### 4. Fiche détail et Sélecteur de sources (`src/views/detail*`, `src/views/play-picker*`)
- **Fiche détail** : scène `h-[74vh]` avec voile supérieur de lisibilité, titre fluide `clamp(38px, 4.4vw, 64px)`, puces métadonnées minérales `rounded-lg` sans rebond d'échelle, et suite d'actions entièrement harmonisée en `h-11 rounded-xl` (Lecture, Choisir une autre source, Liste à voir, Favori, Liste, Collection, Vu, Bande-annonce, Téléchargement, Plus d'actions).
- **Sélecteur de sources** : en-tête éditorial compact (`PickerHeader` avec pilules `.vayra-chrome-pill` Retour / Actualiser et filet `.vayra-header-rule`), scène principale `.vayra-stage` (`PrimaryCard`) avec détails techniques encadrés et actions `h-11 rounded-xl`, et bande de qualité (`TierStrip`) dotée d'`aria-pressed`.

### 5. Sous-univers Explorer et Extensions (`cinema-hero.tsx`, `shows.tsx`, `anime.tsx`, `calendar.tsx`, `catalogs.tsx`, `addons.tsx`)
- Alignement de l'espacement supérieur bureau (`pt-16 lg:pt-20` sous `hasNativeDesktopUx()`) sur `Séries`, `Anime`, `Calendrier`, `Catalogues` et `Extensions`.
- Harmonisation de `CinemaHero` (`Films`), des en-têtes éditoriaux (`.vayra-kicker` + `.mac-page-title` + `.vayra-header-rule`) et des barres de filtres segmentées (`.vayra-pill-track` avec `aria-pressed`).

## Qualification et limites honnêtes

- **Vérifications exécutées localement sur macOS** :
  - `pnpm test:design` (14/14 contrôles Checklist Design, 0 `transition-all`),
  - `pnpm exec tsc -b` (0 erreur TypeScript),
  - `pnpm lint` (ESLint `--max-warnings 0`),
  - `pnpm test` (suite Vitest complète incluant `fr.coverage.test.ts`),
  - `cargo test --manifest-path src-tauri/Cargo.toml` (tests unitaires Rust dont les 12 tests de sécurité et nettoyage de `download::tests`),
  - `pnpm perf:budget` (budgets gzip JS/CSS/WASM),
  - compilation complète `pnpm tauri:build:macos`, installation dans `/Applications/VAYRA.app` avec sauvegarde préalable et vérification `codesign --verify --deep --strict`.
- **Ce qui reste à vérifier sur matériel cible** :
  - Exécution en direct des scénarios `.recette` dans WebView2 sur un poste Windows physique et dans WebView Android sur appareil / émulateur Android (les contrats DOM, rôles ARIA, noms accessibles français et indices de navigation ont été préservés dans les sources et vérifiés sous jsdom).
