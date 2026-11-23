# Revue UI/UX — Refonte de la barre de gauche et des 5 écrans principaux (macOS / bureau)

- **Date** : 2026-11-23
- **Branche** : `feat/refonte-surfaces-principales` (depuis `5161adf8`)
- **Version** : VAYRA 0.9.42
- **Périmètre** : toute la barre de gauche (`Sidebar`, `ProfileChip`, `CollapseToggle`, alignement `Topbar` à 960 px), `Home` (`MacPersonalSections`, `MacDiscoveryBanner`, `LumaResumeCard`, `CustomizeBar`), `Discover` (`FeaturedBanner`, `SidePanel`, `DiscoveryQueueCta`, `AskHarbor`, `CatalogCustomizeBar`), `Library` (`Header`, `FilterBar`, `SortControl`, `GroupedGrid`, `WatchlistTab`, `HistoryTab`, `LocalTab`, `MyListsTab`), `Downloads` (`DownloadsView`, `DownloadDirBar`, `DownloadPolicyControls`) et `Settings` (`Settings`, `MacSettingsNav`, `SettingsNav`, `Section`, `ToggleRow`, `Segmented`, `BasicsPanel`, `MacConnectionsPanel`, `MacDownloadsPanel`).
- **Exclusions** : modifications locales antérieures des 17–18 nov. (17 fichiers préservés intacts hors lot), version web publique, comptes tiers, données privées, reconstruction du paquet `/Applications/VAYRA.app` (non demandée sur ce lot).
- **Note outil** : le serveur MCP `promethee` a été ajouté à la configuration MCP globale, puis le lot a été exécuté sans lui à la demande explicite de l’utilisateur, sur la base du skill `checklist-design`, des tests automatisés, des contrôles statiques et du build Vite.

## Matrice Checklist Design

| Checklist | Statut | Détail & preuves |
|---|---|---|
| **Navigation latérale & contrat VAYRA** (`design-system.md`, `SKILL.md`) | **Couvert** (sources + tests) | Fond uniforme `var(--color-canvas)`, absence de bordure verticale et absence de tuile active décorative préservés dans `src/styles/mac-ux.css` (`sidebar-motion.test.tsx`). Indicateur actif vertical fin `2,5 px`, guide vertical d’arborescence pour les catégories Explorer, épingles révélées au survol/focus, rupture responsive harmonisée à `960 px` (`min-[960px]:`) en phase avec `Topbar`, fermeture `Escape` et sémantique `role="menu"` sur `ProfileChip`. |
| **Typography & Tokens** (`design-system.md`) | **Couvert** (sources + build) | Grammaire éditoriale unifiée dans `src/styles/mac-ux.css` (`.mac-page-title`, `.vayra-kicker`, `.vayra-surface`, `.vayra-pill-track`, `.vayra-header-rule`), titres `display`, chiffres alignés (`tabular-nums`) sur tous les compteurs, vitesses, tailles et progressions, traductions françaises vérifiées (`fr.coverage.test.ts`). |
| **Card / Carousel / Row** (`design-system.md`) | **Couvert** (sources + tests) | Contrats de gabarit des cartes hors ligne de l’Accueil verrouillés (`mac-personal-sections.test.tsx`), `MacDiscoveryBanner` plein cadre avec sélecteur multi-slides (`mac-discovery-banner.test.tsx`), `FeaturedBanner` adaptatif sous `1060 px` (`grid-cols-1`). |
| **Tabs / Filtering items / Empty State** (`design-system.md`, `web-app.md`, `flows.md`) | **Couvert** (sources + tests) | Vrai `role="tablist"` / `role="tab"` / `aria-selected` dans `Library`, champ de recherche avec icône et effacement rapide, `aria-pressed` sur tous les segments, boutons « Effacer les filtres » ajoutés sur les états vides filtrés de `HistoryTab` et `LocalTab`, et CTA « Explorer » sur les états vides réels. |
| **Téléchargements & états distincts** (Contrat VAYRA) | **Couvert** (sources + tests) | Badges d’état distincts (actif, attente, pause, interrompu, erreur, prêt à regarder), bandeau de synthèse chiffrée, carte de stockage unifiée (`DownloadDirBar` + `DownloadPolicyControls`), conservation stricte de la confirmation de suppression et du retour de focus (`downloads.test.tsx`, `download-dir-bar.test.tsx`). |
| **Settings & recherche clavier** (`web-app.md`, `flows.md`) | **Couvert** (sources + tests) | `MacSettingsNav` doté d’icônes, groupement visuel, arborescence des sous-sections, recherche clavier `↑/↓`, `Entrée`, `Échap` (`mac-settings-nav.test.tsx`), fil d’Ariane cliquable dans `Settings`, grilles 2 colonnes sur `BasicsPanel` et `MacConnectionsPanel`. |
| **Rendu visuel en direct macOS / VoiceOver** | **Non vérifié** | Aucune session WebKit native, capture `/Applications/VAYRA.app` ni audit VoiceOver exécuté sur ce lot. |

## Contrôles exécutés

- **`pnpm test:design`** : **14/14** contrôles passés (`22` cibles non sémantiques / budget 25, `30` autofocus / budget 30, **`0` `transition-all`**).
- **`pnpm exec tsc -b`** : 0 erreur.
- **`pnpm lint`** : 0 erreur, 0 avertissement (`eslint . --max-warnings 0`), contrôle `silent-errors` 266/267.
- **`pnpm test`** (Node 24.22.1) : **234/234** fichiers · **1 301/1 301** tests réussis (incluant `mac-discovery-banner.test.tsx` et `mac-settings-nav.test.tsx`).
- **`pnpm exec vite build && pnpm perf:budget`** : **6/6** budgets passés (payload initial 557,6 / 620 KiB gzip, entry JS 365,2 / 420 KiB, settings JS 35,8 / 60 KiB, player JS 97,5 / 135 KiB, WASM 482,2 / 520 KiB, avatar 51,0 / 75 KiB).

## Prochain contrôle recommandé

Reconstruire et inspecter `/Applications/VAYRA.app` (`pnpm tauri:build:macos`) aux largeurs `960 × 600` et `1 280 × 800` pour valider le rendu WebKit natif, les animations réduites et le contraste sur les différents thèmes personnalisés.
