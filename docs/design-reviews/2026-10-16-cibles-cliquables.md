# Cibles cliquables non sémantiques — 16 octobre 2026

## Périmètre

Base `27dc1c83`, branche `fix/a11y-click-targets`. Skill checklist-design : Button, Rating, Modal ; boucle de vérification du dépôt. Revue de la dette mesurée par `pnpm test:design` : 120 cibles `div`/`span` avec `onClick`, 35 `autoFocus`, 163 `transition-all`. Revue de source et tests jsdom ; l'app installée n'a pas été recontrôlée.

## Tri des 120 cibles

| Famille | Nombre | État | Raison |
|---|---|---|---|
| `onClick` qui stoppe la propagation (panneau dans un fond de modale) | 37 | Couvert | Pas une commande |
| Rôle, `tabIndex` et `onKeyDown` présents | 15 | Couvert | Équivalent clavier |
| Fond de modale qui ferme au clic | ~45 | Couvert | Échap ferme la modale ; le fond n'a pas à être une commande |
| Commande à l'intérieur d'un vrai bouton ou lien (sports, commentaires AniList) | 2 | Couvert | Le clic de l'élément natif remonte |
| Commande doublée par un bouton (multivue « Activer le son », carrousel « Lecture »/« Épisodes »/points) | 2 | Couvert | Équivalent clavier existant |
| Note SIMKL (10 demi-étoiles) | 2 | **Corrigé** | Notation impossible au clavier |
| Note Trakt au-dessus des commentaires | 1 | **Corrigé** | Notation impossible au clavier |
| Boutons de survol des cartes (`pick-card/*-hover.tsx`) | 6 | Partiel | `role="button"` sans focus, mais imbriqués dans le `<button>` de la carte : un bouton focalisable n'y est pas permis. La carte reste ouvrable au clavier et la fiche propose Lecture, Vu et Liste de suivi |
| Toast d'identification musicale | 2 | Partiel | Toast transitoire du lecteur ; ouverture YouTube à la souris seulement |

## Corrections

- `SimklRatingPicker` : chaque demi-étoile devient un `<button type="button">` nommé « Noter n/10 », `aria-pressed` sur la note actuelle, aperçu au survol et au focus.
- `StarRow` (Trakt) : même modèle. La demi-étoile suit maintenant le pointeur ; avant, elle restait celle choisie à l'entrée dans l'étoile.
- Budget `nonSemanticClick` abaissé de 120 à 117.

## autoFocus et transition-all

Les 35 `autoFocus` apparaissent dans une modale ou après une action (recherche, renommage, nommage d'un préréglage) : usage conforme, non modifié. Les 163 `transition-all` relèvent du coût de rendu et non de l'accessibilité ; non modifiés.

## Preuves

Tests `simkl-rating-picker.test.tsx` et `trakt-star-row.test.tsx` (échec avant correction : aucun bouton), couverture fr, `tsc`, `pnpm test:design`. Le parcours Tab natif et VoiceOver dans l'app installée : non vérifiés.

## Lot suivant proposé

Restructurer la carte (`pick-card.tsx`) pour que la zone d'ouverture et les actions de survol soient des boutons frères, puis rendre les actions focalisables. Critère : Tab atteint Lecture, Vu et Liste de suivi d'une carte, sans perdre l'anneau de focus ni le gabarit de la carte.
