# VAYRA mobile — spécification de mise en page

L’app Android ne doit pas réduire l’interface du Mac : elle suit les règles des
plateformes mobiles. La référence est **Material Design 3** (le S24 Ultra est un
téléphone Android), recoupée avec les **Human Interface Guidelines** d’Apple.
Les valeurs ci-dessous viennent des jetons officiels de Jetpack Compose
Material 3 (`androidx/compose/material3/tokens`, octobre 2026) ; 1 dp = 1 px CSS
dans la WebView.

## Mesures

| Élément | Valeur | Source (jeton M3) |
| --- | --- | --- |
| Cible tactile minimale | 48 × 48 dp, 8 dp entre deux cibles | Accessibilité Android, M3 |
| Marges latérales (fenêtre compacte < 600 dp) | 16 dp | M3 Layout |
| Grille d’espacement | 8 dp, 4 dp pour les petits éléments | M3 Spacing |
| Barre du haut | 64 dp, titre Title Large | `AppBarSmallTokens.ContainerHeight` |
| Barre de navigation | 64 dp (80 dp avec libellés) | `NavigationBarTokens` |
| Champ de recherche | 56 dp, coins ronds complets, texte Body Large | `SearchBarTokens` |
| Bouton | 40 dp (petit), 56 dp (moyen) | `ButtonSmallTokens`, `ButtonMediumTokens` |
| Puce de filtre | 32 dp, icône 18 dp | `FilterChipTokens` |
| Ligne de liste | 56 / 72 / 88 dp (1, 2, 3 lignes), image de tête 56 dp | `ListTokens` |
| Feuille du bas | coins 28 dp, poignée 32 × 4 dp | `SheetBottomTokens`, `CornerExtraLarge` |
| Coins | 4 / 8 / 12 (cartes) / 16 / 28 dp | `ShapeTokens` |

## Texte

Échelle M3 (taille / hauteur de ligne, en sp) et rôle VAYRA correspondant
(`src/index.css`, utilitaires `type-*`) :

| Rôle VAYRA | M3 | Taille / ligne | Usage |
| --- | --- | --- | --- |
| `type-micro` | Label Small | 11 / 16 | Pastilles, étiquettes minuscules |
| `type-caption` | Body Small | 12 / 16 | Métadonnées secondaires |
| `type-footnote` | Body Medium | 14 / 20 | Texte secondaire, résumés courts |
| `type-callout` | Title Medium | 16 / 24 | Titres de ligne, boutons |
| `type-body` | Body Large | 16 / 24 | Paragraphes, champs |
| `type-title-3` | Title Large (VAYRA 20) | 20 / 28 | Titres de rail et de section |
| `type-title-2` | Title Large | 22 / 28 | Titres de page, barre du haut |
| `type-title-1` | Headline Medium | 28 / 36 | Grands titres |
| `type-display` | Headline Large | 32 / 40 | Titres d’affiche |

Un résumé se lit en 14 sp au moins avec une hauteur de ligne de 20 ; en dessous
de 13 sp, le texte ne sert qu’aux étiquettes. Les champs restent à 16 sp pour
éviter le zoom à la saisie.

## Emplacements

- Navigation principale en bas (Accueil · Ma liste · Recherche), le reste dans
  le menu de la barre du haut ; profil en haut à droite.
- Actions principales en bas de l’écran ou en pleine largeur sous le titre, à
  portée du pouce ; jamais une action seule dans un coin supérieur.
- Contenu d’un titre en une colonne : image, titre, actions, texte, puis onglets.
- Feuilles du bas pour les choix rapides (aperçu, sources, options), fermées par
  glissement, par l’arrière-plan ou par Retour.

## Sources

- Material Design 3 — <https://m3.material.io> (Layout, Spacing, Typography,
  Lists, Navigation bar, Top app bar, Search, Bottom sheets).
- Jetons Jetpack Compose Material 3 —
  <https://github.com/androidx/androidx/tree/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens>.
- Accessibilité Android, taille des cibles —
  <https://support.google.com/accessibility/android/answer/7101858>.
- Apple Human Interface Guidelines — <https://developer.apple.com/design/human-interface-guidelines>
  (cibles de 44 pt, texte courant 17 pt).
