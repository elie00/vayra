# Android sur émulateur — recette et revue du 11 novembre 2026

## Périmètre

- `main` = `a2ed8375` (0.9.42). APK release aarch64 construit le 11/11
  (`pnpm tauri android build --target aarch64`), installé sur l'émulateur
  `vayra_s24_ultra` (1080 × 2340, Android 16), profil invité de l'émulateur.
- Parcours : démarrage et accueil, onglet Recherche (historique, requête sans
  résultat, requête « dune »), aperçu d'un titre (ouverture, fermeture en tirant
  vers le bas, bouton Retour), menu, Paramètres, Aide, retour à l'accueil.
- Exclus : lecture d'une vidéo (aucune source configurée sur l'émulateur),
  Connect, cast, téléchargements, comptes tiers. La lecture sur le S24 Ultra
  réel reste à confirmer sur le téléphone.
- Limite de l'outil : le clavier de l'émulateur affiche une barre flottante à
  gauche de l'écran. Elle appartient au clavier, pas à VAYRA.

Checklists retenues (mobile) : Tab Bar Navigation, Search, Action Sheet
(appliquée à l'aperçu), Gesture navigation, Settings. Paywall, Cart, Checkout,
Billing, Login, Chat, Map, Camera et Invite ne s'appliquent pas.

## Matrice

Preuve : **obs.** = observé sur l'émulateur, **src.** = lu dans le code.

| Checklist | Item | État | Preuve |
|---|---|---|---|
| Tab Bar | Nombre d'onglets | couvert | obs. 3 onglets (accueil, ma liste, recherche) |
| Tab Bar | Icône et libellé | partiel | src. icônes seules, libellé dans `aria-label` (`shell.tsx:113`) |
| Tab Bar | États actif / défaut | couvert | obs. icône pleine et plus épaisse sur l'onglet actif |
| Tab Bar | Badges | non applicable | aucun compteur à signaler |
| Tab Bar | Présence fixe | partiel | obs. masquée au défilement dans les Paramètres (voulu, `scrolledAway`) |
| Tab Bar | Taille des cibles | couvert | src. boutons de 64 px de haut sur un tiers de la largeur |
| Tab Bar | Retour haptique | non vérifié | rien dans le code, l'émulateur ne le rend pas |
| Search | Champ fixe en haut | couvert | obs. le champ reste en place, les résultats défilent dessous |
| Search | Clavier ouvert d'emblée | couvert | obs. `mInputShown=true` à l'ouverture de l'onglet |
| Search | Résultats en direct | couvert | obs. grille affichée pendant la saisie |
| Search | Recherches récentes | partiel | obs. présentes ; elles gardent aussi les URL et magnets collés (écart 2) |
| Search | Filtres | non applicable | pas de filtre dans la recherche mobile |
| Search | Squelettes de chargement | couvert | obs. 6 cartes grises pendant la recherche |
| Search | État sans résultat | partiel | src. prévu (`search.tsx:174`), masqué par le message réseau quand une source tombe (écart 1) |
| Search | Bouton d'effacement | partiel | obs. présent ; cible de 32 px (écart 4) |
| Action Sheet | Titre et actions | couvert | obs. titre du film, Lecture, À voir, Détails et plus |
| Action Sheet | Fermeture par glisser ou fond | couvert | obs. glisser vers le bas et Retour ferment ; src. le fond est un bouton de fermeture |
| Action Sheet | Action destructive | non applicable | aucune |
| Action Sheet | Annuler | partiel | obs. croix de fermeture ; cible de 32 px (écart 4) |
| Action Sheet | Points d'arrêt, poignée | couvert | obs. poignée en haut, hauteur maximale 80 dvh |
| Action Sheet | Défilement | couvert | src. contenu défilant dans le panneau, en-tête fixe |
| Action Sheet | Clavier | non applicable | pas de champ dans l'aperçu |
| Action Sheet | Fond assombri | couvert | obs. |
| Gesture | Retour système | couvert | obs. Retour ferme l'aperçu, puis l'Aide, puis les Paramètres |
| Gesture | Tirer pour actualiser | manquant | src. aucun ; non demandé |
| Gesture | Appui long, glisser pour réordonner | non vérifié | non essayés |
| Settings | Groupes titrés | couvert | obs. Lecture, Application, Plus ; libellé en double (écart 5) |
| Settings | Interrupteurs natifs | non vérifié | pages de détail non ouvertes |
| Settings | Actions destructives groupées | non applicable | aucune au premier niveau |
| Settings | Compte en tête | couvert | obs. avatar, nom, « Profil local » |
| Settings | Lien direct vers un réglage | couvert | src. `mobileEntryFor` (`settings-list.tsx:58`) |
| Settings | Aide et retour | couvert | obs. Aide = formulaire de rapport de bug |
| Settings | Version de l'appli | partiel | src. dans les diagnostics de l'Aide, pas en bas de la liste |
| Settings | Mentions légales | non applicable | appli personnelle, hors boutique |

## Écarts, par priorité

1. **Une recherche sans résultat accuse la connexion dès qu'une source tombe.**
   Scénario : le 11/11, Jikan (une des deux sources anime) ne répond plus
   (délai dépassé, même pour « naruto ») ; « zzqxwvkj » affiche « La recherche n'a
   pas pu aboutir. Vérifiez votre connexion puis réessayez. » alors que Cinemeta
   et AniList ont répondu, sans résultat. Le réseau de l'émulateur marche (les
   tendances se chargent). Cause : le statut passe à `error` dès qu'une seule
   source échoue (`src/lib/search-context.tsx:151`), et la page mobile affiche le
   message réseau quand il n'y a aucun titre (`src/mobile/search.tsx:151`). Le
   bureau a le même message (`search-overlay.tsx:171`), mais avec un bouton
   « Réessayer », absent sur mobile.
   Correction proposée : quand au moins une source a répondu et qu'aucun titre
   n'est trouvé, afficher l'état sans résultat avec une mention « certaines
   sources sont indisponibles » ; garder le message réseau quand aucune source
   n'a répondu ; ajouter « Réessayer » sur mobile.
   Critère : test de `search-context` avec l'anime rejeté et Cinemeta vide → état
   sans résultat ; sur l'émulateur, « zzqxwvkj » affiche « Aucun résultat ».

2. **L'historique enregistre les URL et magnets collés, en clair.**
   Scénario : les recherches récentes de l'émulateur listent trois
   `http://10.0.2.2:8765/test-2mi…`. `recordRecent` garde toute saisie
   (`src/lib/search-context.tsx:243`) ; une URL de flux avec jeton ou un magnet
   resterait dans le `localStorage` et s'afficherait à l'écran.
   Correction proposée : ne pas enregistrer une saisie reconnue par
   `isMagnetInput` ou `isDirectVideoUrl`.
   Critère : test unitaire, puis plus d'URL dans l'historique après en avoir collé une.

3. **Le bouton « Envoyer le rapport de bug » déborde sur téléphone.**
   Scénario : page Aide à 1080 px de large, le libellé passe sur deux lignes dans
   un bouton de hauteur fixe, « bug » sort du bouton.
   Fichier : `src/views/settings/bug-report-panel.tsx:236` (`h-11`).
   Correction proposée : `min-h-11` et `whitespace-nowrap` avec un texte d'état
   qui se replie, ou un bouton pleine largeur sous le texte sur mobile.
   Critère : libellé entier dans le bouton sur l'émulateur.

4. **Cibles tactiles de 32 px.** Effacement de la recherche
   (`src/mobile/search.tsx:88`) et croix de l'aperçu
   (`src/mobile/meta-preview-sheet.tsx:89`) : `h-8 w-8`, sous les 48 dp
   d'Android. Correction : zone de 48 px, l'icône peut rester petite.

5. **Français.** « Viewing » est traduit « Lecture », comme « Playback » : le
   groupe « LECTURE » contient l'élément « Lecture »
   (`src/lib/i18n/locales/fr/coverage.ts:1900`, proposer « Visionnage »). Les
   niveaux de gravité ne s'accordent pas avec « gravité » : « Normal », « Élevé »
   au lieu de « Normale », « Élevée » (`severity-picker.tsx:5-8` réutilise des
   clés partagées ; il faut des clés propres).

6. **Menu : la croix défile avec le contenu**, et le texte passe sous la barre
   d'état transparente (« Horreur » sur l'heure). `src/mobile/shell.tsx:161-171`.
   Correction : en-tête fixe hors de la zone défilante, fond sous la barre d'état.

7. **Titres sur deux lignes** dans la recherche : « Recherches récentes » et
   « Effacer l'historique » se replient tous deux à 1080 px
   (`src/mobile/search.tsx:103-110`). Cosmétique.

## Non réalisé

- Lecture d'une vidéo, sélecteur de sources, reprise : aucune source
  configurée sur l'émulateur. À faire sur le S24 Ultra réel.
- Pages de détail des Paramètres, Connect, cast, téléchargements.
- Aucun plantage pendant la recette : même processus du lancement à la fin.

## Suivi du 11 novembre

Écarts corrigés sur la branche `fix/android-review`, puis vérifiés sur le même
émulateur avec un APK reconstruit (Jikan toujours en panne) :

1. « zzqxwvkj » affiche « Certaines sources n’ont pas répondu : un résultat peut
   manquer. », « Réessayer la recherche », puis « Aucun résultat ». Le message réseau
   reste réservé au cas où aucune source n’a répondu (`emptySearchOutcome`, testé).
   Même logique sur le Mac.
2. Les URL de test ont disparu de l’historique : les liens et magnets ne sont plus
   enregistrés, et ceux déjà enregistrés sont retirés au chargement (testé).
3. « Envoyer le rapport de bug » tient sur une ligne, sous le texte d’état.
4. Effacement de la recherche et croix de l’aperçu : zone de 48 px, la croix reste
   au même endroit et ferme l’aperçu.
5. « VISIONNAGE » pour le groupe ; gravités « Faible », « Normale », « Élevée »,
   « Critique » (clés propres, traduites aussi en allemand, espagnol et italien).
6. La croix du menu reste en haut, la liste ne passe plus sous l’heure.
7. « Effacer l’historique » tient sur une ligne ; le titre « Recherches récentes »
   passe encore sur deux lignes à 1080 px (non traité).
