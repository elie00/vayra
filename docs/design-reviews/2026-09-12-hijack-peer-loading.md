# Hijack S2E01 — préparation des sources, macOS

Périmètre : test demandé de la source MULTI 1080p HiggsBoson (3,52 Go),
audio français et tolérance du moteur aux pairs intermittents. Application
personnelle uniquement. Base : `136469be`, version 0.9.42.

## Observations dans l'application installée avant ajustement

- La source HiggsBoson fournit une vidéo H.264 1918 × 802 et deux pistes
  E-AC3 5.1 : français et anglais. Le journal mpv indique le français sélectionné.
- La reprise à 8:35 reste en préparation, puis affiche une erreur de chargement.
  Dernier état observé : 0 pair, 0 Ko/s, progression affichée de 14 %.
- La présence des pistes ne valide pas une lecture fluide. Aucun gain de débit
  ni lecture continue n'est démontré par cette observation.

## Changement du moteur

Dans `src-tauri/src/torrent_engine.rs`, délai d'inactivité des pairs porté de
10 à 60 secondes, keep-alive à 20 secondes, même configuration appliquée aux
options de session et aux nouveaux torrents. Délai de connexion TCP conservé à
7 secondes. Le moteur librqbit 8.1.1 autorise déjà 128 connexions par torrent.

Cet ajustement vise à conserver les pairs intermittents ; il ne crée pas de
seeders et peut également conserver plus longtemps des connexions improductives.
La cause exacte de la perte des pairs n'a pas été établie par un journal réseau.

## Vérification

- 60 tests Rust de bibliothèque passent, dont 5 tests du moteur. Ils couvrent
  des régressions existantes, pas le gain de débit ni ce scénario réseau réel.
- `pnpm tauri:build:macos` réussi, incluant TypeScript, Vite et compilation Rust.
- Signature du bundle vérifiée avec `codesign --verify --deep --strict`.
- Nouvelle application installée et relancée ; SHA-256 du binaire construit et
  installé : `02f383dda34f9e1b261889423402248f8c1138355415aab9a7e000de61cd7e36`.
- Ancienne application conservée dans
  `/Users/eybo/Library/Application Support/VAYRA-backups/20260912-165303/VAYRA.app`.
- Recette après ajustement : partielle. Le contrôle natif échoue par moments
  avec `noWindowsAvailable` ou `elementHasNoFrame`, malgré un état lisible.
  Ces erreurs d'automatisation ne constituent pas une preuve de plantage VAYRA.
- Test réseau après installation : réponses UDP de connexion validées pour
  opentrackr, demonii et exodus (0,05 à 0,40 seconde). Ce contrôle ne mesure pas
  les seeders du torrent ni l'accessibilité entrante.
- Première tentative après installation revenue à la liste avec HiggsBoson
  marqué indisponible. Le dossier `Library/Caches/app.vayra/engine` était alors
  absent malgré des fichiers ouverts par le processus ; cause de disparition
  inconnue. Un redémarrage propre a recréé le dossier, sans suppression de notre
  part. Après redémarrage, une lecture avance, mais le sélecteur indique
  NoTorrent Audio Latino ; le journal suivant indique une autre vidéo HEVC 4K
  avec audio anglais seul. Aucun dossier HiggsBoson n'est alors présent dans
  le nouveau cache. Ces lectures ne valident donc pas la source demandée.
- Les tentatives de sélectionner exactement HiggsBoson sont ensuite interrompues
  par le contrôle natif (`The user changed ... Re-query the latest state`).
  Gain de débit sur HiggsBoson et lecture française après ajustement non vérifiés.

## Checklist ciblée

| État | Résultat | Preuve |
| --- | --- | --- |
| Chargement visible et libellé | Couvert | Préparation du stream observée |
| Explication du blocage | Partiel | Libellé générique, sans cause précise |
| Erreur et récupération | Partiel | Proposition d'une autre source visible ; reprise non validée |
| Succès en français | Non vérifié | Piste française confirmée, lecture continue non obtenue |

Critère restant : relancer exactement HiggsBoson, vérifier l'image et l'audio
français, puis observer plusieurs minutes de progression et de débit sans
confondre cache déjà présent et amélioration du réseau. Aucun fichier utilisateur
ni téléchargement supprimé pour cette recette.
