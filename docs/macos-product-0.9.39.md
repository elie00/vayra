# VAYRA macOS — lot 0.9.39

6 septembre 2026. Périmètre : application personnelle installée sur le Mac.
Pas de déploiement web ni de qualification de diffusion publique.

## Livré dans le code

- La saisie ou l'effacement invalide immédiatement les anciennes recherches,
  y compris pendant le debounce et après démontage. Les sources secondaires
  restent utilisables lorsque la recherche principale échoue.
- Entrée ne valide plus un ancien résultat, une composition IME, une touche
  maintenue ou un raccourci système. Maj+Entrée explicite reste disponible.
- Effacer replace le focus dans la barre arrondie existante. Genres, titres
  de navigation par genre/année et état vide avec plateforme sont traduits.
- Le bouton Télécharger du lecteur transmet les en-têtes de la source et
  capture une copie de l'URL et des en-têtes au démarrage. Reprendre conserve
  cette source même si celle du lecteur change. Les en-têtes restent en mémoire.

## Vérifications

- 131 fichiers, 830 tests frontend réussis ; TypeScript et lint réussis.
- Régressions montées avec transports simulés : ancien provider de recherche,
  7 échecs sur 10 et un rejet non géré ; nouveau provider, 10 réussites.
- Téléchargement lecteur : 3 échecs reproduits avant correctif, 4 tests réussis
  ensuite ; vrai adaptateur `startDownload` jusqu'au canal Tauri simulé.
- UI recherche : 4 tests montés couvrant clavier, focus et genres français
  sans changement des identifiants envoyés aux fournisseurs.
- Aucun téléchargement réseau avec des identifiants utilisateur pendant ces
  tests. Ils ne remplacent pas une recette réelle de lecture/pause prolongée.

Le contrôle natif est indisponible pendant ce lot (`noWindowsAvailable` pour
VAYRA, `cgWindowNotFound` pour le Finder). La validation utilisateur du contour
de recherche concerne la version précédente 0.9.38, pas ce nouveau lot.

## Prochain lot à prioriser

Constats de lecture du code, pas encore reproduits par test ni corrigés :

1. Unifier les transferts du lecteur avec le magasin central : aujourd'hui
   `use-video-download.ts` les annule au démontage et la recherche de copie
   hors ligne dans `use-bridge-load.ts` ne consulte que `downloadSnapshot()`.
   Recette : télécharger depuis le lecteur, fermer la vidéo, retrouver le
   transfert puis reprendre exactement sa copie hors ligne.
2. Réserver atomiquement les destinations dans `downloads-store.ts` : deux
   `enqueueDownload` concurrents peuvent parcourir `uniquePath` avant que le
   premier ne soit inscrit. Recette : deux enqueues de même nom en parallèle,
   appels `exists` différés, deux chemins distincts et aucun `.part` partagé.

Ne pas présenter ce lot comme une garantie universelle de reprise des liens
expirés ou de fonctionnement hors ligne de tous les téléchargements.
