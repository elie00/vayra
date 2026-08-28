# VAYRA Lite

Dernière mise à jour : 27 août 2026.

VAYRA Lite est l'édition web de VAYRA. Elle conserve la découverte, la
bibliothèque, la lecture compatible avec le navigateur et les usages sociaux,
sans prétendre reproduire les capacités natives du desktop.

## Périmètre de la première version

### Inclus

- accueil, découverte, catalogues, films, séries et anime ;
- recherche, fiches, saisons, épisodes et bandes-annonces compatibles web ;
- comptes, profils, contrôle parental et bibliothèque ;
- LUMA : reprise de lecture et file locale par profil ;
- lecture HTTP, HTTPS, HLS et DASH lorsque le format et les codecs sont pris en
  charge par le navigateur ;
- lecture de liens directement lisibles fournis par un addon ou un service
  debrid configuré ;
- pack géré préchargé : Cinemeta pour la découverte, WatchHub pour les offres
  disponibles, OpenSubtitles pour les sous-titres et une source HTTP orientée
  navigateur pour proposer des liens directs sans configuration ;
- import automatique des addons du compte Stremio, sans doublon ni écrasement ;
- source de streaming configurée automatiquement lorsqu'une clé debrid est
  enregistrée dans VAYRA ;
- CIRA : amis, groupes privés, invitations et blocages ;
- VARA : création et accès aux salons privés ;
- VEYA : synchronisation play, pause et seek entre les membres d'un salon ;
- préférences web pertinentes, thèmes, langues et accessibilité ;
- installation PWA lorsque l'hébergement et les icônes auront été qualifiés.

### Exclu de la première version

- moteur torrent natif et téléchargement torrent dans le navigateur ;
- moteur mpv, décodage natif et réglages propres à mpv ;
- lecture de fichiers locaux et indexation de dossiers ;
- sortie HDR native, RTX HDR et sélection native des périphériques audio ;
- Cast système et serveur web local ;
- téléchargements hors-ligne natifs ;
- associations de protocoles, ouverture de fichiers et intégration au système ;
- réglages Tauri, Windows, macOS, Linux ou Android sans effet dans un navigateur.

## Règles produit

1. Ne jamais afficher une commande native qui ne peut pas fonctionner sur le
   web.
2. Expliquer une incompatibilité avant que l'utilisateur lance la lecture.
3. Ne jamais transformer silencieusement un torrent en une autre source.
4. Conserver des comptes, profils, bibliothèques et salons compatibles avec les
   applications natives.
5. Afficher clairement les capacités de la source : lecture directe, debrid
   nécessaire, codec non pris en charge ou fonction réservée au desktop.
6. Le bouton principal est toujours une lecture express : VAYRA choisit la
   meilleure source web compatible. Si aucune lecture directe n'existe mais
   qu'une offre légale est connue, afficher ces choix sans exposer la mécanique
   des addons.
7. Les sources HTTP sont interrogées directement depuis le navigateur. Les
   liens nécessitant des en-têtes transmettent ceux autorisés à HLS.js ou
   mpegts.js et ne doivent jamais appeler le proxy natif Tauri.

## Architecture de livraison

- publier le build Vite complet à la place du site vitrine de `site/` ;
- conserver le projet et le domaine web existants comme point d'entrée de VAYRA Lite ;
- conserver `/api-proxy` pour les fournisseurs qui ne permettent pas les appels
  directs depuis le navigateur ;
- appliquer une politique CSP et une liste CORS explicites ;
- mesurer séparément le bundle initial, le lecteur et les fonctions sociales ;
- tester Chrome, Edge, Firefox et Safari avant l'ouverture de la bêta.

## Critères de sortie de bêta

- aucun contrôle natif inactif ou trompeur ;
- navigation clavier et lecteur utilisables à 200 % de zoom ;
- reprise LUMA fiable après rechargement et passage hors-ligne ;
- salon VARA et synchronisation VEYA validés avec deux comptes réels ;
- erreurs de codec, de CORS, de debrid et de réseau expliquées à l'écran ;
- budgets de performance respectés par la CI.
