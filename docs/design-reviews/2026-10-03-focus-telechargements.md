# Focus des téléchargements — 3 octobre 2026

## Périmètre

Quatrième lot autorisé d’amélioration de l’application macOS personnelle. Branche locale `feat/android-meta-preview-sheet`, base `bf1459d9`, changements précédents et Android conservés. Skill checklist-design : boutons, panneau non modal, focus et changements d’état ; boucle de vérification locale appliquée. Aucun téléchargement réel, compte ou réglage utilisateur modifié.

## Défaut reproduit et correction

`src/views/downloads.tsx` : dans le filtre En cours, focaliser Pause puis passer le téléchargement à Pausé retire sa ligne. Le focus retombait sur le corps du document. Le test de régression échouait avant correction, tandis que Pause/Reprendre dans la liste non filtrée conservait déjà son focus.

Le conteneur conserve la dernière cible de focus. Après un changement de groupes, il ne restaure le focus que si cette cible a disparu et que le document ne possède plus de cible utile. Il revient au filtre actif, ou au titre quand les filtres ont disparu. Quitter le conteneur vers un autre contrôle efface la cible conservée ; les changements de progression ne doivent pas attirer le focus. Les dialogues gardent leur mécanisme existant de restauration.

`src/components/downloads-popover.tsx` : la disparition d’une ligne focalisée restitue le focus au bouton Téléchargements, tant que le panneau est ouvert sans dialogue de suppression. Le panneau non modal se ferme lorsque le focus se déplace à l’extérieur ; il ne ramène pas le focus. Le dialogue de suppression suspend ce comportement pour ne pas être traité comme une sortie du panneau.

## Matrice

| Parcours | État | Preuve |
|---|---|---|
| Pause/Reprendre, liste non filtrée | Couvert en simulation | Comportement existant protégé par test |
| Pause retire une ligne du filtre En cours | Couvert en simulation | Reproduction avant correction ; retour sur le filtre actif |
| Focus ailleurs pendant une mise à jour | Couvert en simulation | Aucun déplacement de focus vers Téléchargements |
| Ligne supprimée du panneau compact | Couvert en simulation | Retour au déclencheur, panneau conservé |
| Sortie clavier du panneau | Couvert en simulation | Panneau fermé, contrôle extérieur garde le focus |
| Dialogue de suppression | Couvert en simulation | Tests existants Échap, cycle Tab, échec et restauration toujours appliqués |
| Rendu et clavier macOS installés | Non vérifié | Aucune navigation de la session personnelle durant ce lot |

Recette restante : sur l’app mise à jour et un téléchargement de test isolé, naviguer au clavier dans le filtre En cours, mettre en pause, puis revenir dans Besoin d’attention. Vérifier aussi Tab hors du panneau, Échap et suppression annulée. Les tests jsdom ne qualifient pas le comportement de focus WebKit.

Validation finale : TypeScript, 158 fichiers / 1 006 tests, lint, 14/14 contrôles design et budgets de bundle réussis. La dette statique reste à 269/269 rejets Promise vides, 122 cibles non sémantiques, 36 autofocus et 163 transition-all. La correction cible une perte de focus réelle, qui n’est pas mesurée par ces compteurs.

`pnpm tauri:build:macos` final réussi, avec 47 bibliothèques embarquées et vérification codesign stricte réussie (signature ad hoc). Le paquet est dans `src-tauri/target/release/bundle/macos/VAYRA.app`. Les fichiers WASM régénérés sont remis à leur état initial après le build. Le binaire personnel dans `/Applications` n’a pas été remplacé ; installation et recette native restent à effectuer lorsque la session vidéo est disponible.
