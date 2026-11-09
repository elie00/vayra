# Sous-titres TV pendant un cast — revue du 24 octobre 2026

## Périmètre

- Branche `feat/cast-tv-subtitle-style`, PR #170, commit `c7828c20`.
- Surface : bouton « Sous-titres sur la TV » de la barre de cast
  (`src/views/player/cast-session-bar.tsx`) et son panneau
  (`src/views/player/cast-sub-style-menu.tsx`).
- Parcours : régler taille, hauteur à l’écran, couleur du texte, couleur et
  épaisseur du contour pendant un cast avec sous-titres incrustés ; la TV
  recharge le flux à la position en cours.
- Exclus : réglages de sous-titres du lecteur Mac, cast sans sous-titres
  incrustés (le bouton n’apparaît pas), AirPlay (non utilisable sur cette TV).

Checklists retenues : Slider (appliquée aux sélecteurs − / +), Dropdown Menu,
Settings (web app). Les autres items de Settings (compte, sécurité,
facturation) ne s’appliquent pas.

## Matrice

| Checklist | Item | État | Preuve |
|---|---|---|---|
| Slider | Style | couvert | réutilise `Stepper` du menu avancé des sous-titres |
| Slider | Intervalles | couvert | pas de 2 (taille), 1 (hauteur, contour) |
| Slider | Poignées | non applicable | sélecteur − / +, pas de glissière |
| Slider | Libellés | couvert | libellé de ligne, valeur affichée, `{n} %` en français |
| Slider | États d’interaction | partiel | survol et bouton désactivé aux bornes ; pas d’infobulle expliquant la borne |
| Dropdown Menu | Déclencheur | couvert | icône, `aria-haspopup`, `aria-expanded`, `title` |
| Dropdown Menu | Anatomie, groupes | couvert | taille et hauteur, puis couleurs, puis séparateur et réinitialisation |
| Dropdown Menu | Action destructive | non applicable | la réinitialisation ne touche que ces 5 réglages, placée en fin après séparateur |
| Dropdown Menu | Sous-menu | couvert | un seul niveau : sélecteur de couleur libre |
| Dropdown Menu | Positionnement | partiel | centré sous le bouton, borné à la fenêtre au redimensionnement ; **non vérifié** dans WebKit en fenêtre étroite |
| Settings | Structure | couvert | réglages les plus changés en premier |
| Settings | Retour à l’état initial | couvert | « Rétablir les valeurs par défaut » |

## États

- Nominal : « Chaque changement relance brièvement la vidéo sur la TV. »
- En attente (moins de 1,2 s après un réglage) : « Envoi à la TV dans un instant ».
- Chargement : « Application sur la TV… », icône animée (fixe en mouvement réduit).
- Erreur : bandeau d’erreur du cast existant ; le style essayé n’est pas
  relancé en boucle.
- Vide : non applicable, le bouton n’existe pas sans sous-titres incrustés.

## Clavier et focus

- Le panneau prend le focus à l’ouverture ; Échap le ferme, rend le focus au
  bouton et n’atteint pas les raccourcis du lecteur (test automatisé).
- Ordre de tabulation : le panneau est rendu en portail en fin de document ;
  **non vérifié** dans l’app installée.

## Preuves

- Source et tests jsdom : `cast-session-bar.test.tsx`, `use-cast-session.test.tsx`,
  `cast_subs` (Rust). Les tests d’Échap et d’arrêt pendant un rechargement
  échouent quand leur garde est retirée.
- Rendu ffmpeg-full d’une image avec le nouveau style : texte d’environ 6 % de la
  hauteur, couleur et contour conformes.
- `pnpm test:design` : 14/14 ; `pnpm test`, `tsc -b`, `pnpm lint` verts.
- **Non vérifié** : rechargement réel sur la Samsung QN97A pendant un cast.

## Écarts et critères

1. Rechargement sur la TV non observé. Critère : pendant un cast DLNA avec
   sous-titres, changer la taille ; la TV reprend à la même minute avec la
   nouvelle taille.
2. Ordre de tabulation du panneau en portail. Critère : depuis le bouton, Tab
   atteint les contrôles du panneau avant de quitter la barre de cast.
