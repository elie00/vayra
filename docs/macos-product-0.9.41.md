# VAYRA macOS — cartes hors connexion uniformes, 0.9.41

6 septembre 2026. Application personnelle sur Mac ; aucun déploiement web.

## Correction

La rangée « Disponibles hors connexion » utilisait des colonnes égales, mais ses
boutons se dimensionnaient selon leur texte. Ils remplissent désormais leur
colonne, avec une hauteur commune de 7 rem. Les affiches gardent un emplacement
fixe, même sans image ; les titres sont limités à deux lignes et les sous-titres
à une ligne avec ellipse. Le texte complet reste dans le DOM et dans l'infobulle.

Le gabarit de chargement compact et sa taille intrinsèque hors écran réservent
la même hauteur. Aucun changement aux mesures, au défilement ou aux effets de
Row, ni aux animations de navigation et au focus clavier. La validation native
d'un fichier avant lecture reste inchangée.

## Vérifications

- 136 fichiers / 870 tests frontend passent ; TypeScript et lint passent.
- Quatre nouveaux tests montent l'accueil avec la vraie rangée : titres courts,
  longs et sans espaces, sous-titres longs, absence d'affiche, chargement différé,
  redimensionnement et ouverture d'un fichier valide/invalide.
- Les gardes de régression React #185 de Row et de l'accueil/bibliothèque passent.
- Les tests jsdom verrouillent les règles de dimensions, pas le rendu WebKit.
- Paquet natif arm64 construit avec 47 bibliothèques embarquées ; signature
  stricte vérifiée sur le paquet construit et l'application installée.
- `/Applications/VAYRA.app` installée en 0.9.41. SHA-256 du binaire identique
  au paquet construit : `28bc1ca14506f84557be929774a252eafff6ba989a1ce4bf00466bba018ebb65`.
- Ancienne application récupérable dans
  `/Users/eybo/.Trash/VAYRA-before-uniform-cards-20260906.app`.

## Contrôle dans l'application installée

Après fermeture propre et relance, la capture de l'accueil montre Dark Matter,
Perfect Blue, MobLand et deux épisodes Star Wars côte à côte : mêmes largeur et
hauteur visibles, bords alignés et espacement régulier. Les titres Star Wars sont
contenus sur deux lignes avec ellipse ; les sous-titres restent dans leur carte.
Le plein écran et la barre latérale repliée sont conservés. L'accès à l'arbre
d'accessibilité a temporairement expiré au redémarrage, mais la capture native
de la nouvelle fenêtre a permis de confirmer le rendu.

Aucune modification des téléchargements, de l'historique ou des préférences
utilisateur. Aucun lancement de lecture pendant ce contrôle visuel ; les cas
sans affiche, chargement différé et redimensionnement sont couverts par les
tests de contrat, pas par une mesure automatisée des pixels dans WebKit.
