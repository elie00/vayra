# Plein écran macOS, unification des cartes de reprise et barre latérale

Revue mise à jour le 25 novembre 2026 sur VAYRA 0.9.42 (branche `feat/refonte-unifiee-vayra`, commits `8fa3c99e`, `5ebef56b`, `b6dfb05c` et `fd11ae40`). Plateformes couvertes : bureau macOS (application principale installée sur MacBook Pro 14" à encoche, écran intégré 1 512 × 982 points @2×) et contrat partagé macOS / Windows pour les cartes de reprise et la barre latérale. Hors périmètre : version web et Android.

## Écarts constatés et critères d’acceptation

| Priorité | Observation | Correction et critère |
| --- | --- | --- |
| Fonctionnelle | L’entrée en plein écran depuis une fenêtre maximisée lançait `unmaximize()` en parallèle de `toggleFullScreen:` ; l’état JS lisait `is_fullscreen()` avant la fin de la transition AppKit et `WKWebView` pouvait garder une géométrie obsolète. | `src-tauri/src/fullscreen_mac.rs`, `src-tauri/src/mpv_render_mac.rs`, `src/lib/fullscreen-state.ts`, `src/App.tsx`, `src/views/settings/player-layout-panel/editor-overlay.tsx`. Ne plus appeler `unmaximize()` avant le plein écran macOS ; synchroniser l’état sur `NSWindowWillEnterFullScreenNotification` / `DidEnter` / `DidExit` et `window_fullscreen_status` ; recaler les sous-vues de `contentView` aux bornes de la fenêtre ; prendre en charge `⌃⌘F` et router l’éditeur de lecteur sur `toggleWindowFullscreen()`. |
| Visuelle | En mode clair macOS, la barre de titre native révélée en plein écran peignait une bande blanche (`VAYRA`) au-dessus de l’en-tête sombre, et l’arrondi de 14 pt de `contentView.layer` restait actif dans les angles. | `src-tauri/src/fullscreen_mac.rs`, `src-tauri/src/mpv_render_mac.rs`, `src/styles/mac-ux.css`. Forcer `NSAppearanceNameDarkAqua` sur `NSApplication` et `NSWindow`, rendre la barre de titre transparente et masquer son titre (`NSWindowTitleVisibility::Hidden`) dès `WillEnter`, passer `cornerRadius` à `0` en plein écran, et raccorder le haut de l’interface hors lecteur via `[data-mac-fullscreen-chrome]::after`. |
| Visuelle | Dans « Reprendre la lecture », une reprise locale LUMA (`LumaResumeCard`) affichait le titre à l’intérieur de l’image et un bouton lecture blanc permanent, contrairement aux reprises connectées (`ContinueCard`). | `src/views/home/luma-resume-section.tsx`. Aligner `LumaResumeCard` sur `ContinueCard` : cadre 16:9 `rounded-xl`, résolution de logo officiel centré, pastille compacte en bas à gauche (`▶ SxEy · temps restant`), barre de progression 3 px `bg-accent`, titre sous la carte, bouton lecture au survol/focus uniquement et bouton de retrait au survol. |
| Navigation | La barre latérale bureau conservait un élément « Téléchargements » dès qu’au moins un téléchargement existait alors que les téléchargements sont désormais un onglet de « Ma bibliothèque ». | `src/chrome/sidebar.tsx`. Retirer l’élément « Téléchargements » de la barre latérale bureau tout en gardant « Ma bibliothèque » active sur la vue téléchargements et son indicateur de téléchargements en cours. |

## Matrice de vérification

| Checklist | État | Nature de la preuve et détail |
| --- | --- | --- |
| Plein écran macOS — état, raccourcis (`F11`, `⌃⌘F`) et éditeur | Couvert | **Source + test simulé** : `src/lib/fullscreen-state.test.ts` (écoute `fs://entered` / `fs://exited` + `window_fullscreen_status`), `src-tauri/src/fullscreen_mac.rs` compilé et contrôlé par `cargo test` / `cargo clippy` / `rustfmt`. |
| Plein écran macOS — rendu réel de la barre de titre sombre et du cadrage sous l’encoche | Partiel | **Observation réelle à rejouer après relance** : l’ancien binaire en mémoire (lancé le 24 nov.) n’a pas été interrompu ; le paquet de production `fd11ae40` est installé et signé dans `/Applications/VAYRA.app`, prêt à être vérifié après `⌘Q` puis réouverture. |
| Lecture vidéo en plein écran | Non vérifié | **Source** : le raccord `[data-mac-fullscreen-chrome]` exclut explicitement l’état lecteur actif dans `src/App.tsx`. Aucune lecture média réelle n’a été lancée pendant cette recette. |
| Cartes « Reprendre la lecture » (`LumaResumeCard` vs `ContinueCard`) | Couvert | **Source + test simulé** : `src/views/home/luma-resume-section.test.tsx` et `src/views/home/mac-personal-sections.test.tsx` valident la structure, le logo centré, le titre hors cadre, la pastille compacte et les actions de clic/reprise/suppression. |
| Barre latérale bureau (retrait de « Téléchargements ») | Couvert | **Source + test simulé** : `src/chrome/sidebar-downloads.test.tsx`, `src/chrome/sidebar-motion.test.tsx` et `src/views/library/library-downloads-integration.test.tsx` vérifient l’absence d’entrée séparée, l’état actif de « Ma bibliothèque » et le badge des téléchargements en cours. |

## Contrôles automatiques (état `fd11ae40`)

- `rustfmt --edition 2021 --check src-tauri/src/fullscreen_mac.rs` : réussi.
- `cargo test --manifest-path src-tauri/Cargo.toml` : 164 réussis, 0 échec, 2 ignorés.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` : 0 avertissement.
- `pnpm exec tsc -b` : 0 erreur.
- `pnpm lint` (`eslint . --max-warnings 0` + `lint:silent-errors`) : 0 erreur, 0 avertissement, 266/267.
- `pnpm test:design` : 14/14 contrôles réussis.
- `pnpm test` (Node 24.22.1) : 246/246 fichiers, 1 344/1 344 tests réussis.

## Paquet macOS et application installée

- Compilation production : `pnpm tauri:build:macos` réussi (`bundle-libmpv` : 50 bibliothèques embarquées, autonome hors Homebrew).
- Sauvegarde récupérable créée avant remplacement : `~/Library/Application Support/VAYRA-backups/VAYRA-2026-11-25-pre-fd11ae40.app` (`codesign --verify --deep --strict` réussi).
- Installation dans `/Applications/VAYRA.app` : `codesign --verify --deep --strict` réussi et empreinte SHA-256 identique au paquet de production (`2f8b5cfc2d940a950cb59550d078f8d3099ab0d4e1715f9a64afa119b7f07192`).
- L’instance VAYRA ouverte avant l’installation n’a pas été arrêtée de force ; quitter puis relancer VAYRA est nécessaire pour charger le nouveau binaire et confirmer visuellement les trois corrections.
