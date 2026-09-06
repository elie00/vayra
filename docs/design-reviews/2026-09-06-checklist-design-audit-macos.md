# Audit Checklist Design — VAYRA macOS 0.9.41

6 septembre 2026. Premier audit transversal terminé, sans correction des fonctions
du produit. **12 écarts confirmés : 4 P1 et 8 P2**, plus un contrôle design en échec.
Sources de départ : commit `990911be`, application installée `0.9.41`.
Intégration du skill : commit `e60a9e15`. Le code exécuté par l’app n’a pas changé.

## Périmètre et méthode

Skill local `.agents/skills/checklist-design/SKILL.md`, références Checklist
Design figées au 8 août 2026. Contrôle de l’accueil, des cartes, de la recherche,
de la navigation, des téléchargements et de l’interface du lecteur, puis des
réglages, sauvegardes et add-ons. Application personnelle macOS uniquement.

Checklists sélectionnées : Typography, Tokens, Button, Icon, Spacing / Grid,
Color System, Card, Skeleton, Carousel, Input Field, Searchbar, Loading, Modal,
Dropdown Menu, Tabs, Toggle, Tooltip, Banner, Toast ; Search Results, Empty State,
Settings, Account, Integrations ; Filtering items, Saving changes, Submitting a
form, Showing input error. Les renvois servent à préciser les composants liés.
Les paiements, fonctions d’entreprise, pages marketing et versions web/mobile
sont hors périmètre. Ce n’est ni un audit de sécurité exhaustif ni une validation
réseau prolongée des sources vidéo.

Évaluation : **couvert**, **partiel**, **manquant** ; **non vérifié** indique une
preuve absente, pas un défaut démontré. Chaque constat distingue code, tests
simulés et observation dans l’application installée.

## Résultats des contrôles

- `pnpm test` : 136 fichiers / 870 tests passent.
- `pnpm exec tsc -b` et `pnpm lint` : passent, 271/271 contrôles d’erreurs
  silencieuses dans la tolérance existante.
- `pnpm test:design` : échec du plafond `nonSemanticClick`, 124 > 123.
  Le chemin imprimé est `src/views/settings/unsaved-changes.tsx:171` ; il s’agit
  du point dépassant le budget dans l’ordre d’inventaire, pas de la preuve qu’il
  est le dernier défaut introduit.
- Inventaire reproduit avec les mêmes règles AST : 124 zones `div`/`span` avec
  `onClick`, 36 usages d’autofocus et 167 usages de `transition-all`. Ces nombres
  sont des signaux d’inventaire, pas autant de défauts utilisateur démontrés.
- Skill : liens des 110 checklists résolus, six références identiques à la
  source Claude. `quick_validate.py` passe avec PyYAML dans un environnement
  isolé `uv` ; aucune dépendance du produit n’a été ajoutée.
- Passes ciblées indépendantes : téléchargements/lecteur 46 tests dans 5 fichiers,
  accueil/recherche 26 tests dans 7 fichiers, sauvegardes/add-ons 9 tests dans
  3 fichiers. Ils recoupent la suite de 870 tests : ne pas additionner ces nombres.
- Reproductions isolées en mémoire : export/restauration avec stockage fictif,
  recherche avec fournisseurs simulés, détecteur de genres et fermeture du
  popover dans jsdom. Aucun jeton réel, fichier utilisateur ou réseau tiers utilisé.

## Recette dans l’app installée

Sur la 0.9.41 déjà installée : Accueil → ouverture de la recherche vide → fermeture
sans saisie → Téléchargements → À reprendre → Tout → Paramètres → Confidentialité
et sauvegardes → retour → Accueil.

- Recherche : barre arrondie sans rectangle intérieur ; raccourcis de navigation
  et pastilles de genres en français visibles, champ et fermeture nommés dans AX.
- Téléchargements : 18 entrées affichées avant/après le filtrage, états sélectionnés
  exposés dans AX et message vide propre pour À reprendre. Aucun clic sur une
  action de lecture, pause, suppression, dossier, quota ou concurrence.
- Réglages : catégories françaises visibles, e-mail masqué ; le texte promettant
  l’exclusion des connexions dans l’export est bien présent dans l’app.
- Retour à l’accueil sans sortie du plein écran ; barre principale repliée et
  fond sans séparation conservés. Les cartes visibles sont alignées.

Les captures et arbres AX sont observés dans la session, pas une mesure exhaustive
du DOM ou de pixels. Aucune exportation, restauration, désinstallation, connexion
ou modification de préférences. Aucun contrôle VoiceOver, fenêtre étroite, thème
alternatif ou scénario de lecture prolongée n’a été exécuté dans cette recette.

## Matrice des checklists

Cette matrice décrit les items effectivement examinés, pas une certification des
110 checklists. Les items hors périmètre ne deviennent pas des fonctions à ajouter.
Un état **partiel / non vérifié** n’est pas compté dans les 12 défauts ci-dessous.

| Checklist | Couvert sur le périmètre | Partiel, manquant ou non vérifié |
|---|---|---|
| Typography | Français et hiérarchie des écrans observés ; lignes bornées des cartes hors ligne testées | Partiel : pas de mesure de lisibilité minimale ni zoom 200 % dans WebKit ; échelles typographiques globales non certifiées |
| Tokens | Tokens de canvas, encre et surfaces réutilisés dans `src/styles/mac-ux.css` | Partiel / non vérifié : gouvernance et exhaustivité des valeurs arbitraires, synchronisation avec un outil de design non pertinente ici |
| Button | Noms et actions principales téléchargements, focus source, dimensions minimales des commandes de liste | Manquant : conséquences explicites et protection des actions D03/D04 ; états secondaires D05 |
| Icon | Icônes de navigation nommées via leurs boutons, style principal conservé | Partiel : cohérence globale des tailles/traits hors écrans observés non vérifiée |
| Spacing / Grid | Largeur de colonnes et hauteur des cartes hors ligne, absence d’image, redimensionnement couverts par tests | Partiel / non vérifié : rendu de toutes les familles à la largeur minimale, densité et alignement global |
| Color System | Canvas et focus présents, labels textuels des statuts de téléchargement | Partiel / non vérifié : ratios de contraste de tous les thèmes, déficiences de perception des couleurs |
| Card | Gabarit commun hors ligne, affiches réservées, hiérarchie et textes longs : 4 tests du composant | Partiel : familles non observées et responsive natif étroit non vérifiés |
| Skeleton | Gabarit compact et taille intrinsèque identiques aux cartes hors ligne | Manquant : fin explicite du chargement de catalogues D08 ; autres transitions non vérifiées |
| Carousel | Colonnes calculées sans boucle React, cartes homogènes, contrôles existants | Partiel / non vérifié : parcours clavier complet de toutes les rangées et annonce de position |
| Input Field | Champ de recherche nommé et zone de focus scoped ; champs d’authentification contrôlés par le script existant | Partiel : pas de recette réelle de formulaire de compte ni de tous les formats/hints |
| Searchbar | Recherche accessible depuis la barre supérieure, historique et liens rapides visibles | Partiel : langue de détection D09 et états asynchrones D06/D07 |
| Search Results | Types de résultats, intent, récents et résultats progressifs existent | Manquant : différencier attente, échec et zéro correspondance D06/D07 ; compte de résultats exhaustif non vérifié |
| Empty State | État vide filtré de Téléchargements distinct de la liste complète, retour Tout accessible | Manquant : erreur de recherche distincte du vide D07 et fin de chargement de l’accueil D08 |
| Loading | Attente/actif/pause des téléchargements testés dans la file centrale | Manquant : fin de recherche et synchro fidèles D06/D10 ; durée/annonces de chaque chargement non vérifiées |
| Modal | Titres et actions de restauration visibles en source | Manquant : contrat clavier de restauration D11 ; protection de suppression D03/D04 |
| Dropdown Menu / Tooltip | Libellés et infobulles sur les commandes de liste | Manquant : retour du focus et état ouvert du popover D12 ; collision au bord de fenêtre et tous les raccourcis non vérifiés |
| Tabs / Toggle | Filtres de téléchargements avec `aria-pressed` observés ; sélecteur d’activation d’extension avec `role=switch` en source | Partiel : autres réglages et navigation clavier des groupes non vérifiés ; ne pas supposer tous les toggles accessibles |
| Banner / Toast | Messages d’installation locale et erreur présents dans le flux add-on | Partiel : message final ne corrige pas l’étape de synchro inexacte D10 ; annonce de suppression échouée absente D05 ; durées globales non vérifiées |
| Settings / Account | Rubriques macOS, confidentialité séparée, e-mail masqué, liaison Stremio facultative dans le code | Manquant : fidélité de la promesse d’export D01 et récupération de restauration D02 ; compte distant réel non exercé |
| Integrations | Installation locale et remplacement/reconfiguration testés sans doublon | Manquant : libellé de désinstallation D04 et exactitude de synchro D10 ; données accédées et journaux de tous services non vérifiés |
| Filtering items | Filtres à proximité, état actif, retour Tout et vide vérifiés dans Téléchargements | Partiel : pas de compteur par filtre ; filtres d’autres collections non vérifiés |
| Saving changes | Préférences automatiques avec liste autorisée testées ; état busy de restauration existe | Manquant : échec/restauration conservant l’ancien état D02 ; confirmation fiable de synchro D10 |
| Submitting a form / Showing input error | Résolution d’URL add-on, erreurs de parsing et compte existantes en source | Manquant : certaines fins d’opération D02/D05/D10 ; pas de soumission réelle de compte ni de modification utilisateur |

## Écarts prioritaires

P1 : risque de confidentialité/perte de configuration ou action destructrice
surprise. P2 : parcours trompeur, récupération absente ou interaction clavier
incomplète. Les constats en source ne prouvent pas qu’un incident a déjà eu lieu.

### D01 — P1 — Export présenté sans connexions, mais sessions tierces incluses

**Scénario / impact :** exporter une configuration avec Trakt, SIMKL ou AniList
connecté peut embarquer leur session, donc des jetons d’accès, dans un fichier
annoncé sans connexions. Risque si le fichier est partagé ou mal protégé ; aucune
exposition réelle constatée.

**Preuves :** `src/lib/backup.ts:24` autorise les clés `harbor.*` sauf auth Stremio ;
`src/lib/trakt/session.ts:5`, `src/lib/simkl/session.ts:4` et
`src/lib/anilist/session.ts:4` y stockent leurs sessions. Promesse UI dans
`src/views/settings/mac-panels.tsx:30` et `src/lib/i18n/locales/fr/desktop.ts:128`,
également observée dans l’app. Fixture du vrai module rejouée en mémoire :
`thirdPartySessionIncluded=true`, `stremioAuthExcluded=true`, jetons fictifs uniquement.

**Correction / acceptation :** exclure explicitement toutes les sessions et les
secrets imbriqués de l’export standard ; décrire honnêtement le contenu restant.
Fixtures par service absentes de l’export par défaut. Ne pas partager les exports
actuels comme s’ils étaient garantis sans identifiants avant cette correction.

### D02 — P1 — Restauration destructive malgré une écriture refusée

**Scénario / impact :** un quota local dépassé ou une écriture refusée durant une
restauration laisse une configuration incomplète après effacement de l’ancienne.

**Preuves :** `src/lib/backup.ts:104` retire les anciennes clés, absorbe les erreurs
d’écriture, puis résout normalement. `src/views/settings/backup-row.tsx:47` recharge
ensuite. Fixture en mémoire rejouée : `promiseRejected=false`, `oldSetupLost=true`,
`newEntryMissing=true`. Pas de restauration de données réelles.

**Correction / acceptation :** état de sécurité et rollback, résultat d’erreur
explicite, pas de rechargement sur échec. Avec une écriture refusée simulée, l’état
antérieur est conservé et une erreur française propose une récupération.

### D03 — P1 — Suppression définitive d’un fichier sans confirmation

**Scénario / impact :** un clic accidentel sur la corbeille efface un téléchargement
terminé ou partiel, sans passage par la Corbeille macOS.

**Preuves :** appel direct à `removeDownload` dans `src/views/downloads.tsx:305` et
`src/components/downloads-popover.tsx:164` ; `src-tauri/src/download.rs:115` utilise
`remove_file`. Le popover indique seulement « Remove ». Chaîne source confirmée ;
aucune suppression réelle essayée.

**Correction / acceptation :** confirmation nommant fichier et conséquence, ou
suppression récupérable/annulable. Premier clic non irréversible ; Annuler/Échap
préservent la fixture, y compris un partiel.

### D04 — P1 — Le bouton d’état « Installé » désinstalle

**Scénario / impact :** cliquer sur le badge pour consulter l’extension retire sa
configuration, avec propagation possible à la collection Stremio liée.

**Preuves :** `src/views/addons/installed-pane.tsx:194` relie le libellé « Installed »
à `handleUninstall` ; `src/views/addons.tsx:251` et `src/lib/addon-store.ts:313`
effectuent la suppression sans confirmation. Vérification source, aucune action
sur les extensions personnelles.

**Correction / acceptation :** badge d’état non destructif, commande distincte
« Désinstaller… », confirmation de portée locale/Stremio. Cliquer ou valider
l’état n’écrit rien ; annuler ne change ni liste ni configuration.

### D05 — P2 — Un échec d’effacement rend le téléchargement invisible

**Scénario / impact :** sur refus du système, le fichier reste sur disque mais
l’entrée disparaît, sort du budget affiché et ne propose plus de reprise d’action.

**Preuves :** `src/lib/download/downloads-store.ts:471` retire l’entrée avant la
réponse ; ligne 478 l’erreur n’est que journalisée. Le test existant
`src/lib/download/downloads-store.test.ts:475`, exécuté, confirme l’absence de
l’entrée après un refus simulé.

**Correction / acceptation :** garder une entrée « Suppression impossible », la
comptabiliser et annoncer l’erreur ; proposer Réessayer/Ouvrir le dossier.
Ne retirer définitivement l’entrée qu’après succès.

### D06 — P2 — Recherche déclarée terminée alors que des sources travaillent

**Scénario / impact :** TMDB vide répond avant Cinemeta/add-ons ; « Aucun résultat »
apparaît, puis est remplacé par des résultats tardifs.

**Preuves :** `src/lib/search-context.tsx:133` publie `done` à la première réponse
TMDB ; `src/components/search/search-overlay.tsx:86` et ligne 223 interprètent cet
état comme définitif. Reproduction indépendante React/jsdom du vrai provider avec
sources simulées : `done` + listes vides pendant quatre réponses encore pendantes,
puis un film ajouté par Cinemeta. Pas de panne réseau provoquée sur l’app.

**Correction / acceptation :** suivre les sources pendantes, conserver l’affichage
progressif et n’annoncer le vide définitif qu’à la fin. Une réponse tardive ne doit
pas être précédée d’une conclusion définitive erronée.

### D07 — P2 — Échec des fournisseurs confondu avec zéro correspondance

**Scénario / impact :** hors ligne sans cache, l’aide suggère de changer la requête
alors qu’il faut rétablir la connexion ou réessayer.

**Preuves :** état sans erreur dans `src/lib/search-context.tsx:15`, erreurs
transformées en listes vides ligne 104 ; absorption complémentaire dans
`src/lib/search.ts:180`. Reproduction indépendante avec cinq rejets : `done`,
résultats vides, aucun état d’erreur exposé.

**Correction / acceptation :** bilan par source (attente/succès vide/échec),
indisponibilité avec Réessayer et requête conservée. Garder les résultats partiels
quand une seule source échoue.

### D08 — P2 — Squelettes persistants de catalogues malgré des rangées locales

**Scénario / impact :** catalogues distants vides ou indisponibles alors qu’une
liste personnalisée est épinglée ; sept squelettes persistent et cette liste
n’est pas rendue. Les sections personnelles macOS du haut restent accessibles.

**Preuves :** condition de cinq tableaux vides dans `src/views/home.tsx:925`, sans
état terminé ; les rangées personnalisées sont ajoutées ligne 631 et ligne 679,
mais ignorées par cette branche. Source et chaîne de construction vérifiées ;
pas de montage intégral de Home reproduisant ce scénario.

**Correction / acceptation :** état de chargement explicite, rendu indépendant
des rangées disponibles. Fixture hors ligne + liste personnalisée : liste visible ;
sans contenu, état vide/erreur et récupération, jamais des squelettes permanents.

### D09 — P2 — Genres français suggérés mais non reconnus à la saisie

**Scénario / impact :** « Horreur », « Comédie » ou « Science-fiction » sont traités
comme titres et ne donnent pas accès au raccourci de genre.

**Preuves :** exemple français `src/lib/i18n/locales/fr/desktop.ts:214`, mais
`src/lib/search.ts:366` ne compare que les noms canoniques anglais. Détecteur réel
exécuté en isolation : anglais reconnus, trois termes français retournent `null`.
Les pastilles françaises sont bien visibles dans l’app, sans résoudre ce défaut
de saisie libre.

**Correction / acceptation :** aliases localisés et normalisés vers les identifiants
de fournisseurs inchangés. Les trois termes français ouvrent les genres 27, 35 et
878 ; anglais, années et clics sur pastilles restent fonctionnels.

### D10 — P2 — Étape de synchronisation Stremio validée sans résultat fidèle

**Scénario / impact :** une installation locale sans liaison, ou une synchro
échouée, peut quand même cocher l’étape Stremio.

**Preuves :** `src/views/addons/install-modal.tsx:111` crée systématiquement l’étape ;
`src/views/addons.tsx:534` ne transmet pas `syncedToStremio`, pourtant retourné
par le magasin. Un toast distingue déjà l’installation locale, mais l’étape
elle-même reste trompeuse. Vérification source uniquement.

**Correction / acceptation :** transmettre le résultat ; pas de synchro annoncée
sans liaison, et succès local distinct de l’échec de synchronisation. Trois fixtures
local/synchronisé/échec donnent trois messages exacts.

### D11 — P2 — Confirmation de restauration sans contrat clavier complet

**Scénario / impact :** après choix du fichier, le focus n’est pas explicitement
placé dans la modale de remplacement, ni confiné/restauré ; Échap n’est pas géré.

**Preuves :** `src/views/settings/backup-row.tsx:136` crée un portail `role=dialog`
sans nom lié au titre, focus initial ou gestion clavier. Absence confirmée dans
le composant ; comportement réel VoiceOver/WebKit non vérifié.

**Correction / acceptation :** modale nommée, focus initial sur Annuler, Tab/Shift+Tab
confinés, Échap avant application, retour au déclencheur. Test monté puis recette
native avec une fixture, sans remplacer la configuration utilisateur.

### D12 — P2 — Perte du focus en fermant le popover Téléchargements

**Scénario / impact :** Échap depuis une action interne démonte le contrôle
focalisé ; la navigation clavier ne reprend pas depuis le déclencheur.

**Preuves :** `src/components/downloads-popover.tsx:32` ferme sans restaurer le focus ;
déclencheur ligne 56 sans `aria-expanded`. Simulation indépendante jsdom du vrai
composant : après Échap focus sur `BODY`, retour au déclencheur faux. Comportement
VoiceOver/WebKit non vérifié dans cette recette.

**Correction / acceptation :** référence du déclencheur, état ouvert annoncé,
restauration du focus à la fermeture clavier ; Échap puis Tab suivent l’ordre
attendu depuis le bouton Téléchargements.

## Contrats solides à préserver

- Installation/reconfiguration locale unifiée sans dépendance obligatoire à
  Stremio : tests `src/lib/addon-store.test.ts`.
- Activité LUMA exclue des exports par défaut et préservée par une restauration
  qui ne la contient pas : `src/lib/backup.test.ts`. Cela ne couvre pas les sessions D01.
- Sauvegardes automatiques restreintes aux préférences autorisées, à ne pas
  confondre avec l’export complet : `src/lib/settings/history.test.ts`.
- File de téléchargement centrale, conservation identifiant/chemin/source,
  pause/reprise et rétention après sortie du lecteur :
  `src/views/player/hooks/downloads-player-retention.test.tsx` et
  `src/views/player/hooks/use-video-download.test.tsx`.
- Vérification du fichier local avant lecture : `src/lib/download/offline-playback.test.ts`.
- Recherche récente invalidée immédiatement, Entrée simple protégée contre IME et
  répétitions, ⌘F ; cartes hors ligne homogènes ; gardes contre boucles React #185
  et animations de la navigation avec mouvement réduit : tests correspondants verts.

## Lots proposés, non exécutés

1. **Protéger les données** : D01/D02/D03/D04, tests de refus/annulation avec fixtures.
2. **Rendre les états honnêtes** : D05/D06/D07/D08/D10, attentes et reprises explicites.
3. **Clavier et français** : D09/D11/D12, puis réduction ciblée de la dette design.
4. **Compléter la recette Mac** : fenêtre minimale/large, VoiceOver, thèmes et
   contrastes, sortie du lecteur plein écran, pause longue et veille/reprise sur
   média de test autorisé. Aucun de ces essais n’est déclaré réussi par cet audit.

## Livraison et limites

Seuls le skill, les consignes de projet, la boucle de vérification et ce rapport
sont ajoutés. Aucune correction des 12 écarts, aucun relèvement du budget design,
aucun nouveau paquet application, aucune publication web. VAYRA reste en 0.9.41.
Les tests passants ne prouvent pas l’absence de ces défauts : les fixtures
supplémentaires ont précisément exercé des chemins non couverts ou tolérés.
Le fichier local non suivi `docs/audit-global-2026-09-05.md` est laissé intact.
