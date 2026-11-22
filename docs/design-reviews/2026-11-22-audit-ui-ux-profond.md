# Audit UI/UX approfondi de VAYRA

22 novembre 2026 · VAYRA 0.9.42 · base `538fd214` + intégration locale Google Sans.

## Périmètre, exclusions et provenance

- **Périmètre** : applications personnelles **macOS**, **Windows** (bureau Tauri) et **Android** (`src/mobile/`), en français.
- **Exclusions** : version web publique, Linux/Flatpak, facturation/paiement, administration publique, fonctions sociales publiques. Aucune modification du code produit n’a été effectuée pour cet audit.
- **Provenance des preuves** :
  - **Source** : lecture directe des composants, styles et hooks dans `src/` et `src-tauri/tauri.conf.json`.
  - **Calcul** : ratios de contraste WCAG 2.1 calculés sur les jetons hexadécimaux de [theme.ts](../../src/lib/theme.ts#L113-L125) et [index.css](../../src/index.css#L78-L90).
  - **Tests automatisés** : `pnpm test:design` (14/14 contrôles, dette mesurée : 111 cibles de clic non sémantiques, 35 `autoFocus`, 162 `transition-all`).
  - **Observation visuelle** : aperçu `vite preview` à `1 280 × 800` et `960 × 600` réalisé juste avant l’audit (barre supérieure transparente sur Réglages, troncatures FR).
  - **Non vérifié** : VoiceOver, Narrateur Windows, TalkBack, comportement natif WebView2/Windows, haptique et contraste effectif de toutes les palettes personnalisées.

---

## Matrice Checklist Design

| Checklist | Statut | Synthèse et preuves |
| --- | --- | --- |
| **Color System** (`design-system.md`) | **Manquant** | Source & calcul : 12 boutons `bg-accent text-white` tombent à **2,33:1** sur `cool-grey` (et **1,66:1** sur `sage`) ; `ink-subtle` (`#737579`) est à **3,81–4,27:1** sur `elevated`/`canvas` (< 4,5:1 AA). |
| **Modal** (`design-system.md`) | **Partiel** | Source : `ConfirmationDialog` est solide, mais 12 modales n’ont ni `role="dialog"` ni `useFocusTrap`, 8 + les 6 feuilles Android n’ont pas de piège de focus, et 2 modales lecteur détournent `Entrée` en capture globale. |
| **Button / Toggle / Checkbox / Input Field** (`design-system.md`) | **Partiel** | Source : `role="checkbox"` inversé dans `StremioAuthModal`, `<input>` imbriqué dans `<button>` dans `ParentalPinModal`, `ToggleRow` sans `role="switch"`/`aria-checked`, `KeyField` sans liaison `<label htmlFor>`, 56 `<div/span onClick>` sans clavier. |
| **Searchbar / Search Results** (`design-system.md`, `web-app.md`) | **Partiel** | Source & aperçu : relance et erreurs partielles présentes, mais absence de navigation `↑/↓` dans les résultats, icône `↵` trompeuse sur la bannière d’intention, et placeholder FR tronqué dans `SearchPill`. |
| **Settings / Saving changes** (`web-app.md`, `flows.md`) | **Partiel** | Source & aperçu : contradiction entre sauvegarde instantanée et alerte « Modifications non enregistrées », ancres de recherche cassées hors anglais (`id="set-"` en arabe), badge `libraryKeys/5` affiché sur Sources de streaming, recherche absente sur Android. |
| **Empty State / Loading / Filtering** (`web-app.md`, `flows.md`) | **Partiel** | Source : erreurs réseau avalées silencieusement dans `Discover`, états vides filtrés sans bouton d’action (`WatchlistTab`, `InstalledPane`, `DownloadsView`), consigne de survol inadaptée sur Android. |
| **Toast** (`design-system.md`) | **Partiel** | Source : `AppFeedbackHost` est accessible, mais 13 composants toast parallèles sont montés séparément dans `App.tsx` avec risque de chevauchement. |
| **Navigation bureau & mobile** (`design-system.md`, `mobile.md`) | **Partiel** | Source & aperçu : `Topbar` bureau transparent qui chevauche le contenu défilé (résolu sur `MobileHeader` mais pas sur bureau), rupture `lg:` (1 024 px) vs `minWidth: 960` sur la barre latérale, `MobileDetail` privé de la marge basse `--harbor-tabbar`. |
| **Lecteur & raccourcis clavier** (Contrat VAYRA) | **Partiel** | Source : `Échap` ferme le plein écran ou propose de quitter au lieu de fermer les menus Audio/Sous-titres ; contrôles masqués toujours cliquables/focalisables (`pointer-events-auto`) ; aucune aide rapide `?` des raccourcis. |
| **VoiceOver / TalkBack / Windows natif** | **Non vérifié** | Aucun essai lecteur d’écran natif ni session Windows WebView2 exécuté sur ce lot. |

---

## Constats priorisés et pistes d’amélioration

### P0 — Critique (action erronée, blocage clavier ou illisibilité WCAG)

1. **Détournement global de la touche `Entrée` dans les modales du lecteur** — *Preuve : source*
   - **Impact** : appuyer sur `Entrée` lorsque le focus est sur « Continuer à regarder » ou la case « Ne plus demander » quitte quand même la vidéo ; même piège sur la modale de choix local/stream.
   - **Fichiers** : [leave-confirm-modal.tsx](../../src/components/player/leave-confirm-modal.tsx#L18-L82), [watch-local-modal.tsx](../../src/components/player/watch-local-modal.tsx#L36-L52).
   - **Correction** : basculer sur [confirmation-dialog.tsx](../../src/components/confirmation-dialog.tsx) (ou ajouter `role="dialog"`, `aria-modal="true"`, `useFocusTrap`, focus initial sur l’action sûre, suppression de l’interception globale d’`Entrée`).
   - **Critère** : `Entrée` sur « Continuer à regarder » maintient la lecture ; `Entrée` sur « Quitter » sort ; `Tab` reste piégé dans la boîte ; `Échap` ferme et rend le focus.

2. **Conflit `Échap` dans le lecteur avec les menus Audio et Sous-titres** — *Preuve : source*
   - **Impact** : appuyer sur `Échap` pour fermer le sélecteur de pistes audio ou de sous-titres déclenche `playerEscapeAction` (sortie plein écran ou confirmation de sortie).
   - **Fichiers** : [audio-menu.tsx](../../src/components/player/audio-menu.tsx#L46-L125), [subtitle-menu.tsx](../../src/components/player/subtitle-menu.tsx#L31-L124), [use-keyboard-shortcuts.ts](../../src/views/player/hooks/use-keyboard-shortcuts.ts#L139-L160).
   - **Correction** : ajouter `aria-expanded`, `aria-haspopup`, gestion `Échap` prioritaire qui ferme uniquement le menu ouvert et rend le focus au bouton déclencheur.
   - **Critère** : menu Audio/Sous-titres ouvert → `Échap` ferme le menu seul, la lecture et le plein écran restent intacts.

3. **Contrastes WCAG AA en échec sur boutons primaires d’accent et texte tertiaire** — *Preuve : source + calcul WCAG*
   - **Impact** :
     - `bg-accent text-white` tombe à **2,33:1** sur `cool-grey` (`#a8aaad`), **2,12:1** sur `obsidian`/`nord`, **1,66:1** sur `sage` — boutons « Vérifier » / « Recevoir un lien de connexion » quasi illisibles.
     - `--color-ink-subtle` (`#737579`) atteint **4,27:1** sur `canvas` (`#0a0b0d`), **3,81:1** sur `elevated` (`#18191c`) et **3,32:1** sur `raised` (`#242529`), sous le seuil 4,5:1 AA (et chute vers ~2,5:1 avec `/60`–`/80`).
   - **Fichiers** : [auth-modal.tsx](../../src/components/auth-modal.tsx#L152-L198), [account-step.tsx](../../src/components/onboarding/account-step.tsx#L123-L185), [theme.ts](../../src/lib/theme.ts#L113-L125), [index.css](../../src/index.css#L78-L90).
   - **Correction** : remplacer `bg-accent text-white` par `bg-ink text-canvas` (ou `text-canvas` + jeton `--color-accent-ink`) sur les 12 occurrences ; relever `--color-ink-subtle` de `cool-grey` autour de `#8a8d93` (≥ 4,9:1 sur `elevated` et ≥ 5,5:1 sur `canvas`) et étendre le test de contraste de [theme.test.ts](../../src/lib/theme.test.ts#L78-L93) à `cool-grey`.
   - **Critère** : tous les couples texte/fond de `cool-grey` et les boutons d’authentification dépassent 4,5:1 en test automatisé.

---

### P1 — Haute priorité (navigation, compréhension et ergonomie quotidienne)

4. **Barre supérieure fixe (`Topbar`) transparente qui chevauche le contenu défilé sur bureau** — *Preuve : source + observation aperçu*
   - **Impact** : au défilement dans Réglages, Accueil, Bibliothèque, Téléchargements, Explorer, Fiche et Sélecteur de sources (`z-50` au-dessus du voile `z-30`), les titres et cartes passent visiblement derrière la pilule de recherche sans flou ni fond. Android dispose déjà d’un fond adaptatif (`useScrolledPast`).
   - **Fichiers** : [topbar.tsx](../../src/chrome/topbar.tsx#L77-L81), [App.tsx](../../src/App.tsx#L1190-L1193), [play-picker.tsx](../../src/views/play-picker.tsx#L788), référence mobile [header.tsx](../../src/mobile/header.tsx#L21-L28).
   - **Correction** : ajouter un fond progressif au scroll (`bg-canvas/88 backdrop-blur-xl` + fondu doux en bordure basse, avec variante `prefers-reduced-transparency: reduce`) sur `Topbar`, et corriger l’empilement `z-index` sur `PlayPicker`.
   - **Critère** : en défilant sur Réglages et Téléchargements à 1 280 px et 960 px, aucun texte n’interfère derrière la barre de recherche.

5. **Incohérence de la barre latérale entre `960 px` (`minWidth`) et `1 024 px` (`lg:`)** — *Preuve : source + observation aperçu*
   - **Impact** : la fenêtre minimale est `960 px` ([tauri.conf.json](../../src-tauri/tauri.conf.json#L19)), mais la barre latérale bascule en 72 px icônes seules sous `lg:` (`1 024 px`). Entre 960 et 1 023 px : le bouton [collapse-toggle.tsx](../../src/chrome/sidebar/collapse-toggle.tsx#L5-L28) bascule son libellé « Replier / Déplier » sans effet visuel, et les titres/boutons épingle de [sidebar.tsx](../../src/chrome/sidebar.tsx#L248-L253) ne sont pas masqués sous `lg:` et débordent dans le rail de 72 px.
   - **Correction** : masquer le libellé/bouton d’épingle sous `lg:` (ou abaisser le seuil d’expansion à `md:` / rendre `collapsed` maître dès 960 px) et masquer/désactiver `CollapseToggle` quand la largeur force le rail réduit.
   - **Critère** : à `960 × 600` et `1 280 × 800`, le bouton de repli reflète l’état réel et aucun bouton épingle ne déborde dans le rail.

6. **Contrôles masqués du lecteur toujours cliquables et focalisables (`opacity-0` + `pointer-events-auto`)** — *Preuve : source*
   - **Impact** : une fois le HUD masqué pendant un film, cliquer près du haut/bas de l’écran ou presser `Tab` active des boutons invisibles (Retour, Seek, Volume, Réglages).
   - **Fichiers** : [transport.tsx](../../src/components/player/transport.tsx#L439-L487).
   - **Correction** : appliquer `pointer-events-none` et `inert` (ou `tabIndex={-1}` / `aria-hidden`) sur les barres de transport quand `visible === false`, en gardant un clic/mouvement sur la scène pour réafficher le HUD.
   - **Critère** : HUD masqué → un clic sur le bord supérieur ne quitte pas le lecteur, `Tab` réaffiche le HUD avant de focaliser un contrôle.

7. **Contradiction « sauvegarde automatique » vs alerte « Modifications non enregistrées » + recherche cassée dans Réglages** — *Preuve : source*
   - **Impact** :
     - Chaque réglage s’enregistre immédiatement (`KeyField` affiche même « Enregistré »), mais quitter Réglages ouvre [unsaved-changes.tsx](../../src/views/settings/unsaved-changes.tsx#L12-L78) demandant d’appliquer ou d’annuler des changements déjà persistés.
     - `settingsAnchor(t(title))` dans [shared.tsx](../../src/views/settings/shared.tsx#L54-L68) génère des identifiants dépendants de la langue (en arabe, toutes les sections partagent `id="set-"` ; dans `SettingsNav`, la recherche ne trouve pas les libellés français).
     - [nav.tsx](../../src/views/settings/nav.tsx#L1218) affiche le compteur de clés Bibliothèque (`libraryKeys/5`) sur « Sources de streaming ».
     - [settings.tsx](../../src/views/settings.tsx#L413) place `data-tauri-drag-region` sur toute la colonne centrale, déplaçant la fenêtre au clic-glissé entre deux cartes.
   - **Correction** : remplacer la modale « Modifications non enregistrées » par une confirmation discrète d’auto-enregistrement (plus un bouton « Annuler la dernière modification » non bloquant si souhaité) ; utiliser un `anchorId` stable indépendant de la langue sur `Section` ; retirer le mauvais chip sur `streaming` et limiter `data-tauri-drag-region` à la zone d’en-tête.
   - **Critère** : quitter Réglages ne bloque plus après un changement auto-enregistré ; rechercher « sous-titres » en français ou en arabe fait défiler exactement jusqu’à la bonne carte.

8. **Sémantique ARIA cassée sur formulaires clés et contrôles partagés** — *Preuve : source*
   - **Fichiers** :
     - [auth-modal.tsx](../../src/components/auth-modal.tsx#L316-L349) : `role="checkbox" aria-checked={remember}` posé sur le bouton de bascule clé de session au lieu de « Se souvenir de moi » ; fond cliquable sans `tabIndex={-1}` (idem [search-overlay.tsx](../../src/components/search/search-overlay.tsx#L106-L110)).
     - [parental-pin-modal.tsx](../../src/components/parental-pin-modal.tsx#L152-L184) : `<input type="tel">` imbriqué dans `<button>`, erreur sans `role="alert"`.
     - [shared.tsx](../../src/views/settings/shared.tsx#L136-L183), [shared.tsx](../../src/views/settings/shared.tsx#L312-L401) : `ToggleRow` sans `role="switch"` / `aria-checked`, `Segmented` sans `aria-pressed`, `KeyField` sans `htmlFor`/`id`.
   - **Critère** : chaque interrupteur, case à cocher et champ annonce son rôle, son libellé et son état à VoiceOver/TalkBack et aucun élément interactif n’est imbriqué.

9. **Navigation immédiate vers Téléchargements avant validation de la mise en file** — *Preuve : source*
   - **Impact** : [use-pick-handler.ts](../../src/views/play-picker/use-pick-handler.ts#L215-L228) lance `void enqueueDownload(...)` sans attendre ni gérer le rejet, et ouvre immédiatement Téléchargements. En cas d’échec, l’utilisateur arrive sur une liste inchangée sans message d’erreur.
   - **Correction** : attendre l’acceptation de `enqueueDownload`, afficher une erreur exploitable dans le sélecteur en cas d’échec, et ne naviguer (ou afficher un toast avec action « Voir les téléchargements ») qu’en cas de succès.
   - **Critère** : dossier invalide → le sélecteur reste ouvert avec message d’erreur ; dossier valide → l’entrée apparaît dans Téléchargements.

---

### P2 — Priorité moyenne (fluidité, cohérence et confort sur bureau et Android)

10. **Recherche globale : navigation clavier `↑/↓`, touche `Entrée` sur l’intention et largeur FR** — *Preuve : source + aperçu*
    - **Constat** : [search-overlay.tsx](../../src/components/search/search-overlay.tsx#L120-L140) ne supporte pas les flèches pour parcourir les résultats ; la bannière d’intention (ex. année ou genre, lignes 208–232) affiche `↵` mais `Entrée` l’ignore ; `SearchPill` ([topbar.tsx](../../src/chrome/topbar.tsx#L60-L62)) tronque le placeholder français et change brusquement de largeur au survol.
    - **Amélioration** : ajouter une sélection clavier `↑/↓` + `Entrée` (incluant l’intention quand aucun `topMatch` n’est ciblé), stabiliser la largeur de `SearchPill` sans saut au survol, et raccourcir/élargir pour lire le placeholder français en entier.

11. **États vides, erreurs silencieuses et consignes tactiles** — *Preuve : source*
    - **Constat** :
      - [discover.tsx](../../src/views/discover.tsx#L167-L172) avale les erreurs réseau en tableaux vides (écran silencieux sans « Réessayer »).
      - Les états « aucun résultat de filtre » de [watchlist-tab.tsx](../../src/views/library/watchlist-tab.tsx#L73-L76), [installed-pane.tsx](../../src/views/addons/installed-pane.tsx#L45-L61) et [downloads.tsx](../../src/views/downloads.tsx#L132) n’offrent aucun bouton de réinitialisation.
      - L’état vide de [downloads.tsx](../../src/views/downloads.tsx#L166) conseille de « survoler un épisode » même sur Android tactile.
      - L’assistant de premier lancement présente encore une double numérotation d’étapes ([tmdb-step.tsx](../../src/components/onboarding/tmdb-step.tsx#L38), [streaming-step.tsx](../../src/components/onboarding/streaming-step.tsx#L12)).
    - **Amélioration** : unifier un composant d’état vide/erreur avec bouton d’action (« Réinitialiser les filtres », « Réessayer », « Découvrir les add-ons »), adapter la consigne Android au toucher et synchroniser la numérotation d’onboarding.

12. **Découvrabilité du lecteur et confort des contrôles** — *Preuve : source*
    - **Constat** : [tooltip.tsx](../../src/components/player/transport/tooltip.tsx#L17) ne s’ouvre qu’au survol (pas au focus clavier `focus-within`) et n’affiche pas les raccourcis clavier ; aucun panneau d’aide `?` n’existe dans le lecteur pour les ~30 raccourcis. [resume-prompt.tsx](../../src/components/player/resume-prompt.tsx#L82-L118) et [source-error-card.tsx](../../src/views/player/source-error-card.tsx#L59-L103) manquent de `role="dialog"` / `useFocusTrap` / `Échap`.
    - **Amélioration** : ajouter `focus-within` + badge de raccourci dans les infobulles, un panneau `?` léger consultable en pause, et un bouton « Retour » direct sur `SourceErrorCard`.

13. **Ergonomie et parité Android (`src/mobile/`)** — *Preuve : source*
    - **Constat** :
      - [detail.tsx](../../src/mobile/detail.tsx#L134-L135) omet la classe `.flex-1` et n’hérite pas de `padding-bottom: var(--harbor-tabbar)` ([index.css](../../src/index.css#L1544)) : la barre d’onglets ou `MacNowPlayingBar` peuvent recouvrir le bas de la fiche.
      - [home.tsx](../../src/mobile/home.tsx#L114) utilise un `<div onClick>` pour la carte héro.
      - Les 6 feuilles/modales Android n’utilisent pas `useFocusTrap`, et [settings-list.tsx](../../src/mobile/settings-list.tsx#L18-L46) omet l’entrée Téléchargements et la recherche de réglages.
    - **Amélioration** : ajouter `pb-[calc(var(--harbor-tabbar)+1rem)]` sur `MobileDetail`, convertir la carte héro en `<button>`, ajouter l’entrée Téléchargements et un champ de filtrage rapide dans les réglages mobiles.

14. **Cohérence du système de design et réduction de la dette UI** — *Preuve : source + `test:design`*
    - **Constat** :
      - **13 implémentations de toast** coexistent dans [App.tsx](../../src/App.tsx#L296-L309) au lieu de passer par [app-feedback-host.tsx](../../src/components/app-feedback-host.tsx).
      - **56 cibles `<div/span onClick>`** sans `role`/`tabIndex`/`onKeyDown` bloquent le clavier sur des surfaces clés (`peek-hero.tsx:231`, `hover-preview.tsx:344`, `anilist-entry-card.tsx:75`, `mal-entry-card.tsx:73`, `source-folder-card.tsx:185`, `multiview/cell.tsx:104`).
      - `.mac-primary-button` / `.mac-secondary-button` ne sont utilisés que dans 12 fichiers, alors que le reste mélange pilules, coins arrondis et hauteurs ad hoc ; `SourceDrawer` ([source-drawer.tsx](../../src/views/play-picker/source-drawer.tsx#L103)) tronque silencieusement à 80 flux sans indication.
      - **162 `transition-all`** (coût de repaint et risque de transitions involontaires de géométrie).
    - **Amélioration** : converger les toasts sur `AppFeedbackHost`, migrer en priorité les 10 `<div onClick>` les plus visibles vers `<button>`, unifier les primitives bouton/badge autour du design system Google Sans, et afficher un indicateur « +N autres sources » quand `SourceDrawer` dépasse 80 flux.

---

## Feuille de route recommandée (par lots incrémentaux)

1. **Lot 1 — Sécurité d’interaction, clavier & contrastes (P0)** — **Implémenté et vérifié**.
2. **Lot 2 — Chrome bureau & fiabilité Réglages (P1)** — **Implémenté et vérifié**.
3. **Lot 3 — Recherche, états vides & parité Android (P2)** — **Implémenté et vérifié**.
4. **Lot 4 — Consolidation Design System & polissage lecteur (P2)** — **Implémenté et vérifié** (aide raccourcis `?`, tooltips `focus-within`, `SourceErrorCard` + `ResumePrompt` accessibles, troncature `SourceDrawer` > 80 flux, réduction des `<div/span onClick>` majeurs ; la fusion des 13 toasts secondaires et le remplacement global des 162 `transition-all` restent en chantier de fond non bloquant).

### Vérification finale (Lots 1 à 4 + paquet macOS)

- `pnpm test:design` : 14/14 réussis ; dette réduite à **104 cibles non sémantiques (−7)** et **30 `autoFocus` (−5)**.
- `pnpm exec tsc -b` : 0 erreur.
- `pnpm lint` (`eslint . --max-warnings 0` + `check-silent-errors`) : 0 avertissement, 267/267.
- `pnpm test` : **231/231 fichiers · 1 288/1 288 tests** réussis.
- `pnpm exec vite build && pnpm perf:budget` : 6/6 budgets passés (chargement initial 792,7 Kio / 840 Kio gzip, réglages 310,1 Kio / 325 Kio gzip, lecteur 296,8 Kio / 310 Kio gzip).
- **Paquet macOS installé (`/Applications/VAYRA.app`)** : construit via `pnpm tauri:build:macos` (50 dylibs embarquées, sans dépendance Homebrew), copie récupérable de l’ancienne version enregistrée dans `_backups/VAYRA-2026-11-22-prev.app`, signature validée (`codesign --verify --deep --strict`), empreinte SHA-256 identique entre le binaire construit et installé (`26edead20bb9d546e57db13f6e31859fd6cc4d9f421a6a5db540899a751f9ee7`), démarrage de `/Applications/VAYRA.app` confirmé. Rendu natif Windows et Android non testés en exécution sur ce lot.
