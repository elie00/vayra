# Revue UI/UX — Refonte identitaire VAYRA (rail gauche, Accueil, Explorer, Ma bibliothèque + Téléchargements, Paramètres)

- **Date** : 2026-11-23
- **Branche** : `feat/refonte-surfaces-principales` (depuis `5161adf8`)
- **Version** : VAYRA 0.9.42
- **Objectif** : rompre définitivement avec l’héritage visuel et ergonomique Harbor / Stremio / Steam pour affirmer une identité **VAYRA** fluide, éditoriale et calme (tout en conservant le nom VAYRA, le logo existant et l’intégralité des fonctionnalités).
- **Périmètre** :
  - **Chrome & barre de gauche** (`Sidebar`, `SidebarSearchTrigger`, `ProfileChip`, `CollapseToggle`, `Topbar` allégée sur bureau, alignement responsive à 960 px).
  - **Accueil « Soirée Cinéma »** (`Home`, `MacPersonalSections`, `MacDiscoveryBanner`, `LumaResumeCard`, `CustomizeBar`).
  - **Explorer « Curateur Cinéma »** (`Discover`, `FeaturedBanner`, `SidePanel`, `BigCardStack`, `DiscoveryQueueCta`, `AskHarbor`, `CatalogCustomizeBar`).
  - **Ma bibliothèque + Téléchargements fusionnés** (`LibraryView`, `DownloadsView`, `DownloadDirBar`, `DownloadPolicyControls`, `FilterBar`, `SortControl`, `GroupedGrid`, `WatchlistTab`, `HistoryTab`, `LocalTab`, `MyListsTab`).
  - **Paramètres « L’essentiel » simplifiés** (`Settings`, `MacSettingsNav`, `BasicsPanel`, `MacConnectionsPanel`, `MacDownloadsPanel`, `Section`, `ToggleRow`, `Segmented`).
- **Exclusions** : modifications locales antérieures des 17–18 nov. (17 fichiers modifiés + 6 non suivis préservés intacts hors lot), version web publique, comptes tiers, données privées, reconstruction du paquet `/Applications/VAYRA.app` (non demandée sur ce lot).
- **Note outil** : le serveur MCP `promethee` a été ajouté à la configuration MCP globale, puis le lot a été exécuté sans lui à la demande explicite de l’utilisateur, sur la base du skill `checklist-design`, des tests automatisés, des contrôles statiques et du build Vite.

## Matrice Checklist Design & rupture post-Harbor

| Surface / Checklist | Statut | Détail & preuves |
|---|---|---|
| **Chrome bureau & rail gauche** (`design-system.md`, `SKILL.md`) | **Couvert** (sources + tests) | Recherche rapide déplacée dans le rail gauche (`SidebarSearchTrigger` + raccourci `⌘F` / `Ctrl F`, icône seule en mode réduit) ; suppression de la pilule flottante Harbor dans `Topbar` sur bureau (`h-16` calme) ; fond uniforme `var(--color-canvas)`, aucune bordure verticale ni tuile active décorative (`sidebar-motion.test.tsx`). Indicateur actif fin `2,5 px`, rupture responsive harmonisée à `960 px`, fermeture `Escape` et `role="menu"` sur `ProfileChip`. |
| **Accueil « Soirée Cinéma »** (`design-system.md`, `flows.md`) | **Couvert** (sources + tests) | Ouverture directe sur une scène cinéma plein cadre `.vayra-stage` (`MacDiscoveryBanner` avec pellicule de vignettes cliquables en bas à droite et surtitre « Ce soir sur VAYRA »), salutation calme sur une ligne selon l’heure (`Bonjour` / `Bon après-midi` / `Bonsoir`) + raccourcis rapides, suppression du bloc vide bruyant lorsqu’une scène est présente, transition éditoriale « Choisi pour vous » vers les recommandations. Contrats de gabarit des cartes hors ligne verrouillés (`mac-personal-sections.test.tsx`, `mac-discovery-banner.test.tsx`). |
| **Explorer « Curateur Cinéma »** (`design-system.md`) | **Couvert** (sources + build) | Remplacement du panneau latéral façon Steam/Harbor (grille 2×2 de captures) par un rail éditorial **« Dans cette sélection »** (liste cliquable des titres en vedette + synopsis + note + bouton discret « Voir les images » ouvrant la lightbox) ; remplacement du collage 6 bandes façon Steam de `DiscoveryQueueCta` par une carte panoramique éditoriale à 3 affiches en éventail. |
| **Ma bibliothèque + Téléchargements** (`design-system.md`, `web-app.md`, `flows.md`) | **Couvert** (sources + tests) | Fusion des Téléchargements dans **Ma bibliothèque** sur bureau (`MAC_PRIMARY_VIEWS = ["home", "discover", "library"]`, badge d’activité transféré, routage `downloads` redirigé avec pile de retour préservée). `DownloadDirBar` condensé en une barre compacte avec espace libre inline et bouton pliable **« Options de stockage »** (`aria-expanded`) afin que les vidéos hors ligne apparaissent immédiatement au-dessus de la ligne de flottaison. Vrai `role="tablist"`, états vides filtrés actionnables, confirmation de suppression et retour de focus préservés (`downloads.test.tsx`, `download-dir-bar.test.tsx`). |
| **Paramètres « L’essentiel »** (`web-app.md`, `flows.md`) | **Couvert** (sources + tests) | Simplification radicale de `BasicsPanel` : retrait du jargon technique (débridage, mpv, verrou saisonnier — toujours accessibles dans `Lecture` / `Extensions et connexions`) au profit de 4 blocs du quotidien (compte, lancement de la lecture en 2 cartes « Instantané » / « Choisir d’abord », sélecteur instantané des 4 palettes VAYRA en 1 clic, et raccourcis Langues / Extensions). Rail `MacSettingsNav` réorganisé en deux groupes explicites **« Essentiel »** (L’essentiel en premier) et **« Plus d’options »**, avec recherche clavier `↑/↓`, `Entrée`, `Échap` (`basics-panel.test.tsx`, `mac-settings-nav.test.tsx`). |
| **Rendu visuel en direct macOS / VoiceOver** | **Non vérifié** | Aucune session WebKit native, capture `/Applications/VAYRA.app` ni audit VoiceOver exécuté sur ce lot. |

## Contrôles exécutés

- **`pnpm test:design`** : **14/14** contrôles passés (`22` cibles non sémantiques / budget 25, `30` autofocus / budget 30, **`0` `transition-all`**).
- **`pnpm exec tsc -b`** : 0 erreur.
- **`pnpm lint`** : 0 erreur, 0 avertissement (`eslint . --max-warnings 0`), contrôle `silent-errors` 266/267.
- **`pnpm test`** (Node 24.22.1) : **235/235** fichiers · **1 302/1 302** tests réussis (incluant `mac-discovery-banner.test.tsx`, `mac-settings-nav.test.tsx` et `basics-panel.test.tsx`).
- **`pnpm exec vite build && pnpm perf:budget`** : **6/6** budgets passés (payload initial 559,0 / 620 KiB gzip, entry JS 366,4 / 420 KiB, settings JS 35,8 / 60 KiB, player JS 97,5 / 135 KiB, WASM 482,2 / 520 KiB, avatar 51,0 / 75 KiB).

## Prochain contrôle recommandé

Reconstruire et inspecter `/Applications/VAYRA.app` (`pnpm tauri:build:macos`) aux largeurs `960 × 600` et `1 280 × 800` pour valider le rendu WebKit natif, les animations réduites et le contraste sur les quatre palettes VAYRA (`VAYRA par défaut`, `Obsidienne`, `Sauge`, `Ivoire`).
