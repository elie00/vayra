# Detective Conan S24E01 — lecture des sources torrent

Date : 2026-09-27 (Europe/Paris)  
Périmètre : VAYRA macOS personnel installé, version 0.9.42 ; dépôt `bf1459d9`  
Objet : diagnostic du parcours de sélection et de préparation des sources de « Conan and Heiji's Code of Love ».

## Preuves et limites

- **Déclaration utilisateur** : toutes les sources proposées pour cet épisode échouent à la lecture.
- **App installée** : neuf lignes Torrentio visibles. Deux lignes 720p portent « Indisponible, essayez-en une autre. » ; sept autres restent proposées. Aucun lecteur vidéo n'était ouvert pendant l'observation. Le nombre de pairs affiché vient des annonces de sources et ne prouve pas une connexion effective.
- **Journal local** : `~/Library/Logs/VAYRA/vayra.log` contient des expirations de connexion aux pairs, des refus de connexion et une relance après expiration du délai de récupération des métadonnées vers 00:08 (heure de Paris). Ce journal ne relie pas la tentative à une ligne de la liste sans exposer de lien ou d'identifiant torrent. Une autre lecture torrent, antérieure, a atteint une première image et 99,8 % de téléchargement ; cela exclut une panne systématique démontrée du moteur, mais ne valide aucune source de Conan.
- **Tests automatisés** : `pnpm exec vitest run src/lib/streams/episode-file.test.ts src/lib/streams/resolve.test.ts` : 2 fichiers et 15 tests réussis. Ces tests ne vérifient ni les pairs actuels, ni le démarrage vidéo dans l'app installée.
- **Exclusions** : aucune nouvelle lecture ni aucun téléchargement réel lancés pendant cet audit ; aucun compte, réglage ou fichier utilisateur modifié. La réussite ou l'échec individuel des neuf sources reste non vérifié par cet audit.

## Matrice ciblée

| Point | État | Preuve |
| --- | --- | --- |
| Découverte et identification des sources | Couvert | Neuf résultats Torrentio avec résolution, nom, taille et pairs annoncés dans l'app installée. |
| Retour d'erreur par ligne | Partiel | Deux lignes signalent l'échec ; le libellé ne distingue pas métadonnées, pairs, service débrid ou proxy. |
| Chargement puis lecture effective | Non vérifié | Aucun essai de lecture réel n'a été effectué pendant l'audit. |
| Récupération après une source en échec | Partiel | Le bouton Lecture reste disponible et une autre source peut être choisie ; aucune reprise réussie de cet épisode n'a été constatée. |

## Écart prioritaire

**P1 — Diagnostic insuffisant pour un échec partagé.** `src/views/play-picker/use-pick-handler.ts:146` marque une source comme échouée pour plusieurs codes de résolution. `src/views/play-picker/stremio-row.tsx:73` affiche le même message générique. Le moteur relance les métadonnées après 30 s puis 20 s (`src-tauri/src/torrent_engine.rs:359-360` et `:434-445`) ; le journal actuel montre cette relance et de nombreuses connexions infructueuses. Il est donc plausible qu'au moins une source soit bloquée avant l'ouverture du lecteur, sans preuve que les neuf échouent pour la même cause.

Correction proposée pour un lot ultérieur : conserver par tentative un diagnostic local expurgé (identifiant de ligne non sensible, étape, code d'erreur, pairs connectés, octets reçus), et afficher la cause et une action adaptée dans le sélecteur. Critère de vérification : sur une source de test disponible et une source sans pairs, distinguer clairement l'échec de métadonnées de l'échec de décodage ; confirmer une première image et une progression soutenue dans `/Applications/VAYRA.app` pour toute source annoncée comme fonctionnelle.
