# Corrections de l’audit Checklist Design — macOS

Demande : couvrir les 12 écarts confirmés dans l’audit du 6 septembre 2026.
Périmètre : application personnelle macOS ; aucun déploiement web/public.
Skill : `.agents/skills/checklist-design/SKILL.md`, catégories Design System,
Web App (interfaces React/Tauri), Flows.

## Critères avant livraison

| Écart | Résultat attendu | État initial du lot |
| --- | --- | --- |
| D01 | Export sans sessions ni secrets imbriqués ; import sans écraser les connexions | À corriger |
| D02 | Restauration contrôlée, retour arrière et erreur explicite ; aucun rechargement en échec | À corriger |
| D03 | Confirmation explicite avant suppression d’un fichier téléchargé | À corriger |
| D04 | Statut installé distinct de la désinstallation, avec confirmation et portée | À corriger |
| D05 | Suppression en attente/échec conservée, quota et réservations cohérents, nouvel essai | À corriger |
| D06 | Recherche progressive sans état vide définitif tant que les sources attendent | À corriger |
| D07 | Erreur réseau distincte de zéro résultat, résultats partiels et réessai | À corriger |
| D08 | Accueil local disponible sans dépendre du chargement des catalogues | À corriger |
| D09 | Genres français reconnus sans modifier les identifiants API | À corriger |
| D10 | Synchronisation Stremio absente/réussie/échouée présentée fidèlement | À corriger |
| D11 | Restauration nommée, focus initial sûr, Tab/Escape et retour du focus | À corriger |
| D12 | Popover téléchargements : état exposé et focus rendu au déclencheur sur Escape | À corriger |
| Garde design | Réduire la dette réelle ; ne pas augmenter les budgets | À corriger |

## Vérifications prévues

- Régressions sur données fictives : secrets, quota, échecs d’écriture/suppression,
  requêtes lentes/échouées, annulation et focus.
- TypeScript, suite complète, lint, garde design, construction macOS.
- Installation sauvegardant l’ancienne application ; contrôle natif non destructif.
- Préserver le fond uniforme, les animations, le focus arrondi et le plein écran.
- Ne pas supprimer/restaurer/désinstaller de données réelles pendant les essais.

Les résultats seront renseignés après exécution ; cette liste n’est pas une
preuve préalable de réussite ni une qualification exhaustive de tous les parcours.
