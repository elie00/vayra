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
| Boutons de survol des cartes (`pick-card/*-hover.tsx`) | 6 | **Corrigé** (second lot) | Imbriqués dans le `<button>` de la carte, ils ne pouvaient pas prendre le focus |
| Toast d'identification musicale | 2 | Partiel | Toast transitoire du lecteur ; ouverture YouTube à la souris seulement |

## Corrections

- `SimklRatingPicker` : chaque demi-étoile devient un `<button type="button">` nommé « Noter n/10 », `aria-pressed` sur la note actuelle, aperçu au survol et au focus.
- `StarRow` (Trakt) : même modèle. La demi-étoile suit maintenant le pointeur ; avant, elle restait celle choisie à l'entrée dans l'étoile.
- Budget `nonSemanticClick` abaissé de 120 à 117.

## autoFocus et transition-all

Les 35 `autoFocus` apparaissent dans une modale ou après une action (recherche, renommage, nommage d'un préréglage) : usage conforme, non modifié. Les 163 `transition-all` relèvent du coût de rendu et non de l'accessibilité ; non modifiés.

## Preuves

Tests `simkl-rating-picker.test.tsx` et `trakt-star-row.test.tsx` (échec avant correction : aucun bouton), couverture fr, `tsc`, `pnpm test:design`. Le parcours Tab natif et VoiceOver dans l'app installée : non vérifiés.

## Second lot : actions de survol des cartes

- `HoverAction` : vrai `<button>` sur une carte ; simple dessin `aria-hidden` dans les aperçus des Réglages, qui sont eux-mêmes des commandes.
- `PickCard` : un conteneur `group` réunit le bouton de la carte et les actions, posées au-dessus de l'affiche et soulevées avec elle au survol. Les sélecteurs `button.group` du thème Stremio restent valables.
- Navigation aux flèches : les actions portent `data-spatial-skip` et sont ignorées, pour passer de carte en carte ; Tab les atteint, et le focus rend les actions visibles (`group-focus-within`).
- Budget `nonSemanticClick` abaissé à 111.

Preuves : test `pick-card.test.tsx` sur la vraie carte (échec avant correction : actions dans le bouton de la carte) et `hover-actions.test.tsx` pour les styles élégant, givré, cinéma et personnalisé. Rendu non observé : hors de Tauri, le serveur de développement n'affiche aucun catalogue ; alignement au survol, anneau de focus et VoiceOver restent **non vérifiés** dans l'app installée.
