# Améliorations macOS — 3 octobre 2026

Suite autorisée de l’analyse du projet, selon checklist-design et la boucle de vérification locale. Les changements Android préexistants sont conservés. Aucune manipulation de compte, de bibliothèque ou de téléchargement réel.

## Changements

- Sous-titres avant lecture : Entrée confirme la sélection actuelle. Répétition, composition IME, modificateurs et chargement sont exclus. Retour, Ignorer et Lancer conservent leur activation native ; les champs éditables sont exclus.
- Coffre : l’échec de lecture/écriture du trousseau produit un état observable et un avertissement persistant traduit dans les six langues du catalogue. Le repli existant préserve les clés ; son risque de stockage local reste explicitement signalé. Les erreurs natives brutes ne sont plus imprimées par ce chemin pour éviter une fuite éventuelle de détails sensibles. Une hydratation réussie efface l’avertissement.
- Vues principales : un statut de chargement apparaît après 250 ms si l’import différé est encore en cours. L’indicateur utilise les tokens et la traduction existants, sans nouvelle animation.

## Matrice et preuves

| Contrat | État | Preuve |
|---|---|---|
| Clavier sous-titres | Couvert en simulation | Test composant : sélection française transmise une fois, répétition/composition/modificateurs/chargement exclus |
| Protection des secrets et information | Partiel | Migration et repli conservés ; test notification de panne et récupération ; aucun vrai trousseau mis en panne |
| Chargement différé | Couvert en simulation | Statut retardé et minuterie annulée au démontage |
| Traductions | Couvert par catalogue/tests | Message ajouté en anglais, français, allemand, espagnol, italien et portugais |
| Rendu WebKit et app installée | Non vérifié | L’app personnelle est en lecture ; pas d’interruption ou remplacement |

TypeScript, suite complète finale de 993 tests, lint et 14/14 contrôles design réussis. Les 12 tests ciblés passent, dont le cas de récupération. Build Vite et budgets de bundle réussis, avec avertissement existant de taille de chunk. La dette statique reste à 122 cibles non sémantiques, 36 autofocus, 163 transition-all et 270 catch Promise vides.

## Recette native restante

`pnpm tauri:build:macos` final réussi : paquet dans `src-tauri/target/release/bundle/macos/VAYRA.app`, 47 bibliothèques embarquées, vérification codesign réussie. Signature locale ad hoc (aucune identité Apple Development valide retenue par le script). Les fichiers WASM régénérés, propres avant le lot, ont été remis à leur état initial après compilation. Le paquet n’a pas remplacé `/Applications/VAYRA.app` pendant la lecture. Il contient l’état de travail local, y compris les changements Android préexistants, qui restent séparés des modifications de ce lot.

Sur le prochain paquet installé, vérifier Entrée depuis une option de sous-titre et les boutons Retour/Ignorer/Lancer, le défilement à 960 × 600 et les transitions froides/chaudes des vues principales. Le coffre doit être testé avec fixtures isolées, sans verrouiller ou altérer le trousseau personnel. Une compilation ne vaut pas recette native.
