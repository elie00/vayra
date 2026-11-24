# Boucle de vérification UI/UX — VAYRA

## Cadrer

Lire le skill `.agents/skills/checklist-design/SKILL.md`. Définir les écrans,
parcours et checklists applicables dans `docs/design-reviews/`. Le corpus est un
guide de conception, pas une obligation d’ajouter toutes les fonctions décrites.
Le périmètre est celui d’`AGENTS.md` ; nommer les plateformes que la revue
couvre.

## Examiner les états

Pour chaque surface concernée, examiner le nominal, le chargement, le vide,
l’erreur/récupération et le succès. Marquer les états non applicables avec une
raison. Vérifier noms accessibles, clavier, focus/restauration, texte français,
titres longs, images absentes, densité, défilement et dimensions cohérentes.

Sur le bureau (macOS, Windows), distinguer fenêtre normale, plein écran et
lecteur. La taille minimale configurée est à relire dans
`src-tauri/tauri.conf.json` ; comparer une fenêtre étroite à une fenêtre large
lorsque le contrôle est disponible. Sur Android, comparer une largeur de
téléphone étroite (360 dp) à une courante (412 dp), et vérifier les cibles
tactiles et la barre d’onglets. Ne pas changer les réglages système pour simuler
une taille, une échelle de police ou le mouvement réduit sans accord.

## Contrôler

- `pnpm test:design` : contrats statiques et budgets de dette existants.
- `pnpm exec tsc -b`, `pnpm test`, `pnpm lint` : résultats distincts du rendu.
- Si du code d’interface a changé : compiler et vérifier les parcours affectés
  sur chaque plateforme touchée. Les builds pilotables et les scénarios
  rejouables sont décrits dans `docs/agent-driver.md` ; une version pilotable
  ne s’installe jamais comme appli de tous les jours.
- Livraison autorisée, en gardant toujours une copie récupérable de l’ancienne
  version : sur Mac, `pnpm tauri:build:macos`, puis vérifier le paquet et l’app
  installée ; sous Windows, l’installeur de
  `pnpm tauri build --config src-tauri/tauri.windows.conf.json` installe dans
  `%LOCALAPPDATA%\VAYRA` : vérifier ensuite que la date de `VAYRA.exe` a changé
  (une instance encore ouverte peut le garder) ; sur Android, garder l’APK
  précédent.
- Si seuls le skill et le rapport changent : valider le skill et ses liens ;
  inutile de changer la version ou réinstaller le binaire.

`pnpm test:design` passant ne signifie pas zéro dette ni conformité générale.
Les tests jsdom ne calculent pas le rendu de la WebView (WebKit sur macOS,
WebView2 sous Windows, WebView Android) : un contrat CSS testé n’est pas une
preuve de dimensions, de contraste ou de navigation dans l’app installée.
Après une correction, relancer les contrôles pertinents sur le dernier état.

## Recette locale sûre

Consulter l’état courant de VAYRA avant de naviguer. Ne pas interrompre une vidéo
ni manipuler l’app en concurrence avec l’utilisateur ; demander un créneau si
nécessaire. Navigation, filtres et fermeture de dialogues peuvent être contrôlés
sans modifier la bibliothèque. Utiliser des fixtures isolées pour les actions
destructives, erreurs réseau et essais de persistance ; ne pas les provoquer sur
les fichiers ou identifiants de l’utilisateur. Sur le bureau, lancer l’instance
de recette avec un dossier de données jetable (`VAYRA_DATA_DIR`, dont
`docs/agent-driver.md` donne les limites) ; sur Android, recetter sur
l’émulateur plutôt que sur le téléphone de tous les jours.

Une pause de plusieurs heures, une reprise après redémarrage, la veille réseau,
l’intégrité d’un vrai fichier ou un compte tiers ne sont pas validés par un simple
montage de composant. Inscrire ces essais comme non réalisés si aucun scénario
sûr n’a été exécuté. Ne jamais imprimer de clé, URL authentifiée ou export privé
dans les rapports et commits.

## Rapporter et livrer

Le rapport daté contient version/commit examinés, plateformes couvertes,
périmètre/exclusions, matrice par checklist (**couvert**, **partiel**,
**manquant**, avec **non vérifié** pour les preuves absentes), écarts priorisés,
fichier/ligne et critère d’acceptation. Identifier la nature de la preuve :
source, test simulé, observation réelle.

Présenter les défauts confirmés et les prochains lots proposés sans promettre
de supprimer toutes les régressions. Préserver les modifications étrangères aux
micro-commits ; pousser seulement dans le cadre autorisé par l’utilisateur.
