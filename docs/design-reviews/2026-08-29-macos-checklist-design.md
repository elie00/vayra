# Revue UI/UX VAYRA macOS — Checklist Design

Date : 29 août 2026  
Références : checklist Design de Pilot OS, Web Interface Guidelines et
conventions d'interaction macOS.

## Périmètre contrôlé

- fenêtre Tauri installée et bundle Apple Silicon ;
- barre supérieure, contrôles de fenêtre et zones de déplacement ;
- recherche, focus clavier, commandes globales et dialogues ;
- redimensionnement, plein écran, titre natif optionnel et mouvement réduit ;
- arbre d'accessibilité macOS et comportement visuel de l'application réelle.

## Corrections appliquées

| Contrat macOS | Avant | Après |
|---|---|---|
| Bouton vert | annoncé « Agrandir/Restaurer » alors qu'il ouvre le plein écran | annoncé « Passer/Quitter le plein écran » |
| Recherche | raccourci configurable `/` uniquement | `⌘F` en plus du raccourci configuré |
| Raccourcis fenêtre | non exposés aux technologies d'assistance | `⌘M`, `⌘W` et `⌃⌘F` exposés |
| Contrôles détachés | cible de 36 × 36 px | cible de 44 × 44 px |
| Icônes | SVG décoratifs non explicités | SVG masqués et non focalisables |
| Poignées de resize | huit zones invisibles présentes dans le DOM | conteneur masqué à l'arbre d'accessibilité |
| Recherche topbar | deux écouteurs identiques | un seul contrat global centralisé |

## Recette native

- application installée ouverte et lisible dans l'arbre d'accessibilité macOS ;
- navigation latérale, recherche et contrôles de fenêtre tous nommés ;
- ouverture de la recherche, focus visible et sortie par Échap validés ;
- mode fenêtre et plein écran contrôlés avec des libellés cohérents ;
- bundle signé, libmpv embarqué et application indépendante de Homebrew.

## Garde-fous

`pnpm test:design` vérifie désormais 14 contrats, dont quatre spécifiques à
macOS. Les tests unitaires couvrent le chemin plein écran, les libellés et
raccourcis de fenêtre, ainsi que `⌘F`. La CI macOS continue de compiler le bundle
natif en parallèle de la CI frontend.
