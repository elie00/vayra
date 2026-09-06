# VAYRA macOS — téléchargements unifiés, 0.9.40

6 septembre 2026. Application personnelle sur Mac ; aucun déploiement web.

## Changements

- Le bouton du lecteur utilise désormais le même magasin, la même file, les
  mêmes limites disque/concurrence et les mêmes commandes que Téléchargements.
  Quitter la vidéo ne supprime ni n'annule son transfert. Rouvrir le même
  film/épisode retrouve sa progression ; une autre source ne remplace pas celle
  du fichier partiel. Les copies terminées deviennent visibles pour la recherche
  de reprise locale existante, avec sa validation native de taille inchangée.
- Le choix Enregistrer reste disponible. Les pressions répétées pendant le
  dialogue n'en créent pas plusieurs. L'état en attente est visible et peut
  être suspendu. Un échec se réessaie avec le même identifiant et chemin ; un
  fichier terminé reste accessible, sans remise à zéro au bout de douze secondes.
- Les chemins final, partiel et identité de reprise sont réservés avant les
  vérifications asynchrones. Les collisions utilisent un suffixe ; aucun repli
  vers le nom occupé après épuisement des suffixes. Une erreur de vérification
  disque bloque l'opération ; un lien symbolique pendant reste occupé.
- Une suppression attend l'arrêt du transfert puis la suppression physique
  avant de rendre le nom réutilisable.
- Chaque copie issue du moteur local retient sa source, même en attente ou en
  pause. La fermeture du lecteur diffère la suppression du torrent jusqu'au
  dernier transfert terminé/annulé/supprimé. Rouvrir la lecture annule cette
  suppression différée. Les en-têtes sont copiés et restent uniquement en mémoire.

## Validation automatique

- 135 fichiers / 866 tests frontend passent ; TypeScript et lint passent.
- 60 tests natifs passent, dont les contrôles HTTP de reprise et de destination.
- Tests montés : vrai hook, magasin, rétention et adaptateur de téléchargement,
  avec uniquement le dialogue Enregistrer et les commandes natives simulés.
  Parcours en attente → fermeture → pause → réouverture → reprise du même
  fichier → fermeture → reprise centrale → fin et libération.
- Régressions : séparation des épisodes, en-têtes figés, doubles pressions,
  dialogue annulé après fermeture, sélection native rejetée pendant pause ou
  annulation, collisions concurrentes, partiels existants et suppression différée.

## Limites

Les tests de transfert n'utilisent pas les sources ni identifiants personnels.
Ils ne remplacent pas une observation réseau prolongée d'un vrai torrent.
La rétention protège la session courante ; elle ne reconstruit pas encore une
source locale après arrêt forcé/redémarrage du moteur. La pause suspend la copie
du fichier, pas nécessairement tout trafic P2P de lecture/cache. La réservation
des noms protège cette instance, pas une création externe concurrente ni tous
les alias de chemins par casse/liens symboliques. Les anciens fichiers ne sont
ni migrés ni supprimés automatiquement.
