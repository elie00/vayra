# Dossier et récupération des téléchargements — 3 octobre 2026

## Périmètre

Troisième lot autorisé de l’amélioration macOS personnelle, sur le travail local de la branche `feat/android-meta-preview-sheet` à partir de `bf1459d9`. Skill checklist-design et boucle de vérification : champs/actions, chargement, erreur, récupération et focus de dialogue. Les changements précédents et Android sont conservés. Aucun fichier, compte ni téléchargement réel modifié.

## Défauts corrigés

- `src/views/downloads/download-dir-bar.tsx` : une détection de dossier refusée restait sous « Détection… ». Un échec ou chemin vide produit désormais un message proposant de choisir un dossier ; l’action d’ouverture sans chemin est désactivée.
- Le sélecteur de dossier masquait les exceptions. Il affiche maintenant une erreur traduite et laisse réessayer. L’annulation ne modifie aucun réglage. Une garde synchrone et un bouton occupé empêchent deux sélecteurs concurrents.
- L’ouverture du dossier déclenchait un Promise rejeté sans traitement. Le refus produit désormais une alerte inline, sans détails système bruts et sans modifier le chemin.
- L’espace libre était annoncé comme indéterminable pendant le calcul initial. Les états attente, résultat et échec sont séparés. Une réponse tardive pour un ancien chemin est ignorée ; un résultat négatif ou non fini n’est pas présenté comme un espace disponible valide.
- `src/components/delete-download-dialog.tsx` : un rejet inattendu de suppression pouvait laisser le dialogue occupé avec un rejet non traité. Le dialogue retrouve ses actions et annonce l’échec ; une garde synchrone évite les soumissions simultanées. Le mécanisme existant de confirmation, de rétention du fichier et de retour du focus est conservé.

## Matrice de vérification

| Parcours | État | Preuve |
|---|---|---|
| Dossier nominal / choix | Couvert en simulation | Détection refusée puis chemin choisi transmis aux réglages |
| Échec du sélecteur puis récupération | Couvert en simulation | Erreur publique, nouvelle tentative annulée sans changement |
| Sélecteur occupé | Couvert en simulation | Deux clics, un seul appel ; bouton indisponible jusqu’au résultat |
| Ouverture du dossier refusée | Couvert en simulation | Alerte sans modification du chemin |
| Calcul d’espace libre | Couvert en simulation | Attente distinguée d’un échec ; ancien résultat ignoré |
| Suppression rejetée puis réessayée | Couvert en simulation | Dialogue non bloqué, erreur visible, nouvelle tentative possible |
| Focus et clavier natifs | Non vérifié | Session MobLand toujours ouverte et en pause dans l’app personnelle |

La recette de suppression utilise uniquement des fixtures et des mocks. Elle ne qualifie pas une suppression réelle ni la reprise réseau. Les traductions des nouveaux états sont présentes en anglais, français, allemand, espagnol, italien et portugais.

Validation finale : 158 fichiers / 1 001 tests réussis, TypeScript, lint et 14/14 contrôles design passants. Les budgets de bundle passent (818,7 Kio gzip de chargement initial lié, plafond 840 Kio). Le nombre de rejets Promise vides descend à 269 ; le plafond du contrôle est ramené à 269 pour empêcher de reprendre cette dette.

Build `pnpm tauri:build:macos` réussi : 47 bibliothèques embarquées, signature ad hoc et vérification codesign stricte réussie. Paquet final dans `src-tauri/target/release/bundle/macos/VAYRA.app`. Les fichiers WASM régénérés sont revenus à leur état initial. La session vidéo en pause est préservée : installation dans `/Applications` et recette native encore non réalisées.
