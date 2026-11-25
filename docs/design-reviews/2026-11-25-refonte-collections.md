# Refonte complète des Collections VAYRA

Revue du 25 novembre 2026 sur VAYRA 0.9.42 (branche `feat/refonte-unifiee-vayra`, commits `53095c65`, `65746883`, `f85a94c1`, `3a484e6c` et `aba89374`). Plateformes couvertes : bureau macOS / Windows (contrat partagé) et adaptation mobile des grilles et filtres. Hors périmètre : version web.

## Problèmes initiaux et choix de refonte VAYRA

| Priorité | Constat initial | Refonte VAYRA et fichiers |
| --- | --- | --- |
| Images & couvertures | Les cartes téléchargeaient des fonds `original` non redimensionnés, sans sélection de visuels sans texte ni repli vers le meilleur film de la saga ; aucune affiche des films n’apparaissait pour distinguer une saga d’un média unique. | `src/lib/providers/tmdb/tmdb-collection.ts`, `src/lib/providers/tmdb.ts`. Passage en `w780` (cartes) et `w1280` (héros), sélection des couvertures panoramiques sans texte via `/collection/{id}/images`, repli automatique sur le meilleur film de la saga, nettoyage des suffixes (`- Saga`, `Collection`), calcul de la plage d’années, de la note moyenne et d’un éventail de 3 affiches (`posterStack`). |
| Identité des cartes | Les cartes ressemblaient à des vignettes génériques 16:9 avec un badge générique et un titre brut souvent en anglais malgré une interface en français. | `src/components/collection-card.tsx`, `src/components/collections-row.tsx`, `src/components/row.tsx`. Création de la carte « Collector’s Folio » VAYRA : voiles éditoriaux multidirectionnels, éventail animé de 3 affiches (respectant `prefers-reduced-motion`), titre localisé nettoyé, plage d’années, note moyenne, badge et barre de progression personnelle (`vus / total`). |
| Galerie Collections | Page brute limitée à un champ « TMDB » et une grille uniforme sans mise en avant éditoriale ni tri ni état vide guidé. | `src/views/collections.tsx`, `src/views/collections/featured-stage.tsx`, `src/views/collections/use-category-feed.ts`. Ajout de la scène éditoriale **Saga à la une** (`.vayra-stage`, 6 sagas phares rotatives avec bande interactive d’affiches ouvrant chaque film), barre collante de recherche/filtres/tri (`Sélection` / `A–Z`), réinitialisation rapide et libellés 100 % VAYRA. |
| Fiche Collection & détail | Fiche minimale sans suivi de progression, sans fil d’Ariane, sans tri ni vue chronologique et sans état d’erreur avec réessai. | `src/views/collection.tsx`, `src/views/detail/collection-row.tsx`, `src/lib/collections-progress.ts`, `src/lib/watched-flag.ts`. En-tête cinématographique avec couverture superposée, fil d’Ariane, barre de progression et bouton principal intelligent (**Commencer** / **Continuer : \<prochain film non vu\>** / **Revoir**), bascule **Grille numérotée** / **Chronologie éditoriale**, tri (`Chronologique`, `Plus récents`, `Mieux notés`), squelette structuré et réessai réseau. |

## Matrice de vérification (Checklist Design)

| Checklist | État | Nature de la preuve |
| --- | --- | --- |
| Card & Carousel (`CollectionCard`, `CollectionsRow`, `FeaturedCollectionStage`) | Couvert | **Source + tests simulés** : `src/components/collection-card.test.tsx`, `src/lib/providers/tmdb/tmdb-collection.test.ts` (sélection sans texte, éventail 3 affiches, titres localisés nettoyés, progression vue, clic clavier/souris, `motion-reduce`). |
| Searchbar, Filtering items & Empty States (`CollectionsView`) | Couvert | **Source + tests simulés** : `src/views/collections.test.tsx` (scène éditoriale, tri `A–Z`, réinitialisation des filtres, état sans clé avec accès direct aux Paramètres, résultats vides avec action d’effacement). |
| Single Item Detail & Loading / Error (`CollectionView`) | Couvert | **Source + tests simulés** : `src/views/collection.test.tsx` (progression, CTA « Continuer » vers le prochain opus non vu, bascule Chronologie, état d’erreur avec bouton Réessayer, fil d’Ariane). |
| Traductions FR / AR / EN | Couvert | **Source** : `src/lib/i18n/locales/fr/discover.ts` et `src/lib/i18n/locales/ar/discover.ts` complétés, sans mention de marque tierce dans l’interface Collections. |
| Rendu visuel réel dans WebKit macOS | Partiel | **Observation réelle à confirmer après relance** : le paquet de production `aba89374` est compilé, signé et installé dans `/Applications/VAYRA.app` ; l’instance déjà ouverte n’a pas été fermée de force. |

## Contrôles automatiques (état `aba89374`)

- `pnpm exec tsc -b` : 0 erreur.
- `pnpm lint` (`eslint . --max-warnings 0` + `lint:silent-errors`) : 0 erreur, 0 avertissement, 265/267.
- `pnpm test:design` : 14/14 contrôles réussis (`0 transition-all`).
- `pnpm test` (Node 24.22.1) : 250/250 fichiers, 1 353/1 353 tests réussis.

## Paquet macOS et installation

- Compilation production : `pnpm tauri:build:macos` réussi (50 bibliothèques `libmpv` embarquées, autonome hors Homebrew).
- Sauvegarde récupérable avant remplacement : `~/Library/Application Support/VAYRA-backups/VAYRA-2026-11-25-pre-collections-aba89374.app` (`codesign --verify --deep --strict` OK).
- Installation dans `/Applications/VAYRA.app` : `codesign --verify --deep --strict` OK, SHA-256 identique au paquet de production (`590fb6ddb1c83dd9c6b724f80cb3a4c500c241321d552f4f36ffa79d6f14d6d3`).
