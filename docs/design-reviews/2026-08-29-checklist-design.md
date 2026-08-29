# Revue UI/UX VAYRA — Checklist Design

Date : 29 août 2026  
Références : checklist Design de Pilot OS et Web Interface Guidelines de Vercel  
Surfaces du premier lot : socle global, démarrage web, authentification VAYRA,
authentification Stremio, menus contextuels et overlays légers.

## Checklists appliquées

- Design System : couleurs système, focus, mouvement, typographie, contrôles et
  états asynchrones ;
- Web App : navigation clavier, formulaires d'authentification, responsive
  étroit et thèmes sombres ;
- Flows : ouverture/fermeture de dialogue, saisie d'e-mail, code OTP et retour
  d'erreur ;
- Progressive governance : les écarts historiques sont comptés et ne peuvent
  plus augmenter dans la CI.

## Résultat initial

| Domaine | État | Évidence | Décision |
|---|---|---|---|
| Zoom navigateur | Conforme | viewport sans blocage du zoom | Bloquant en régression |
| Thème natif | Corrigé | `theme-color` aligné sur le canvas VAYRA | Maintenir |
| Focus clavier | Corrigé | focus visible global sur boutons, liens, champs et zones éditables | Bloquant en régression |
| Mouvement réduit | Corrigé | arrêt du boot et repli global des animations/transitions | Bloquant en régression |
| Navigation assistée | Conforme | lien d'évitement et annonces de changement de vue | Maintenir |
| Authentification | Corrigé | noms de champs, autocomplete OTP, erreurs annoncées, mot de passe accessible au clavier | Contrat automatisé |
| Overlays du lot | Corrigé | cibles de fermeture sémantiques et scroll contenu | Étendre progressivement |
| Cibles non sémantiques | Dette : 123 | inventaire AST des `div`/`span` cliquables | Interdiction d'augmenter, réduction par lot |
| Autofocus | Dette : 36 | inventaire AST des champs autofocus | Vérifier desktop/mobile puis réduire |
| `transition-all` | Dette : 167 | inventaire source | Remplacer par propriétés explicites par composant |

## Corrections de ce lot

- les champs obtiennent un focus clavier visible même lorsqu'un composant
  supprime l'outline natif ;
- les utilisateurs qui réduisent les animations n'ont plus le boot animé ni
  les longues transitions de l'interface ;
- les champs d'authentification exposent un nom stable, le code OTP annonce son
  format et les erreurs asynchrones sont lues par les technologies d'assistance ;
- le bouton afficher/masquer le mot de passe revient dans l'ordre de tabulation ;
- les fonds cliquables corrigés utilisent de vrais boutons nommés ;
- les interactions tactiles utilisent `touch-action: manipulation` et les
  champs autorisent explicitement la sélection de texte.
- l'onboarding passe devant tous les chromes, devient un vrai dialogue nommé,
  reste scrollable à faible hauteur et adapte ses cartes à une seule colonne
  sur les écrans étroits ;
- le dialogue reçoit le focus à l'ouverture et peut être quitté avec Échap ;
- le splash réduit son titrage et son espacement sous 640 px, sans troncature.

## Critères de sortie permanents

- aucun nouveau `div` ou `span` cliquable ;
- aucune augmentation de l'autofocus ou de `transition-all` ;
- zoom navigateur, focus visible, mouvement réduit et skip-link toujours
  actifs ;
- champs d'authentification nommés, autocomplétion adaptée et erreur annoncée ;
- typage, lint, tests unitaires, build web et `pnpm test:design` verts.

## Prochains lots

1. convertir les overlays historiques restants en backdrop sémantique partagé ;
2. remplacer les cartes `role="button"` par des boutons ou liens natifs ;
3. réduire `transition-all` en commençant par la navigation, les addons et les
   cartes de bibliothèque ;
4. contrôler les dimensions d'images, les textes sous 12 px et les états vides ;
5. poursuivre la recette clavier et responsive à 390 × 844 sur les parcours
   Recherche, Lecture, Addons, Compte et Réglages (Accueil et onboarding validés).

## Vérification du premier lot

- `pnpm test:design` : 10/10 contrôles réussis ;
- dette figée : 123 cibles non sémantiques, 36 autofocus et 167
  `transition-all` ;
- `pnpm lint` : réussi, dont 271/271 contrôles d'erreurs silencieuses ;
- `pnpm test` : 708 tests réussis dans 103 fichiers ;
- `pnpm build:web` : réussi, smoke test WASM et budgets inclus ;
- recette navigateur 390 × 844 : onboarding entièrement visible, cartes sans
  troncature, dialogue nommé et actif dans l'arbre d'accessibilité ;
- ESLint ciblé et TypeScript après correction responsive : réussis.
