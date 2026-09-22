# Audit global VAYRA — 5 septembre 2026

## Verdict

VAYRA est une application fonctionnellement avancée. À la suite de cet audit,
l'utilisateur a fixé le périmètre : **usage personnel sur son Mac uniquement**.
Le web, les autres plateformes et la diffusion publique sont mis en pause.
Le chantier actif est la fiabilité de l'application macOS installée : plein
écran, lecture, téléchargements et confidentialité des données locales.
Une réécriture générale n'est pas justifiée par les constats.

Les constats web et les exigences de distribution ci-dessous restent archivés
pour une éventuelle reprise ; ils ne bloquent pas l'usage local sur ce Mac.
La signature Developer ID, la notarisation et les validations multiplateformes
ne sont pas des objectifs actuels. « Mise en pause » désigne le développement :
aucun service déployé n'a été arrêté et aucune intégration nécessaire au client
macOS n'a été désactivée.

Base examinée : `codex/pause-resume-downloads`, commit `a6aa152` ; branche distante
identique vérifiée avec `git ls-remote`. `main` distant est à `d041edd` : les quatre
derniers commits ne sont donc pas encore dans `main`. Version applicative : 0.9.36.

Méthode : cartographie du dépôt, revue ciblée des frontières à risque, exécution
des suites disponibles, build web, inspection GitHub Actions et de la signature
du binaire installé. Environ 1 956 fichiers TS/JS/Rust/SQL et 305 561 lignes dans
les répertoires examinés, tests et traductions compris. Il ne s'agit pas d'une
lecture exhaustive de chaque ligne, d'un pentest ou d'une qualification matérielle.

## Architecture et produit

| Ensemble | Appréciation |
| --- | --- |
| React 19 / TypeScript / Vite | Typage, lint strict, vues différées et contrat exhaustif de montage des vues. Point positif contre les régressions de navigation. |
| Tauri 2 / Rust / libmpv | Lecture native, fenêtres, fichiers, torrent et cast regroupés dans le backend ; comportements spécifiques à chaque OS à qualifier séparément. |
| `vayra-core` | Parsing, confiance et classement des sources isolés dans un noyau Rust utilisable en WASM ; 56 tests natifs passent. |
| Compte VAYRA | Identité Supabase indépendante de Stremio, e-mail/OTP et OAuth dans le code ; onboarding utilise bien `useVayraAccount`. Aucun nouveau compte créé pendant cet audit. |
| Stremio et addons | Intégration facultative avec installation centralisée et validation de l'origine des messages de configuration. Indépendance du compte ne signifie pas abandon du protocole d'addons Stremio. |
| LUMA | Activité/reprise locale par profil avec validation et récupération de stockage. Ne pas assimiler cela à une synchronisation cloud universelle des réglages. |
| CIRA / VARA / VEYA | Séparation entre identité/social, autorisation des salles et synchronisation de lecture. Tests SQL et logique de synchronisation substantiels ; recette réelle multi-appareils distincte. |
| Lite et site | Deux configurations de déploiement : app web et proxy à la racine, site et API sous `site/`. La documentation doit les distinguer explicitement. |

La maintenance devient coûteuse aux points d'intégration : `App.tsx` dépasse
1 100 lignes, la vue détail 1 600, `mpv.rs` 1 900. La priorité n'est pas de découper
pour découper, mais de supprimer les circuits concurrents pour une même action,
en premier lieu les téléchargements et la persistance des réglages.

## Constats prioritaires

### P1 — Secrets conservés en clair malgré le trousseau système

**Confirmé par exécution isolée sur le code avec des valeurs fictives.**

`src/lib/settings.tsx:125` appelle `persistEffective`, puis `persistSettings`.
`src/lib/settings/profile-store.ts:15` sérialise tous les réglages, et les lignes
72–76 les écrivent dans le miroir et le stockage partagé/par profil. Le stockage
sécurisé nettoie ensuite uniquement le miroir (`file-store.ts:88`), pas les
copies de profil. Les clés de debrid, jetons Trakt ou Cloudflare peuvent donc y
rester en clair même lorsque le trousseau fonctionne.

`src/lib/backup.ts:24` exporte ces entrées. La reproduction obtient : miroir
nettoyé = vrai, secret toujours présent dans le profil = vrai, secret présent
dans la sauvegarde = vrai. Aucun vrai secret utilisateur n'a été lu.
Le texte `backup-row.tsx:70` promet pourtant un export sans connexions.

**Action :** un sérialiseur non sensible commun à tous les stockages ; secrets
sécurisés avec portée explicite ; migration des anciennes copies ; export par
liste d'autorisation avec tests de non-divulgation. Prévenir du caractère sensible
des sauvegardes déjà produites. Ce constat ne prouve pas une compromission passée.

### P1 — Le proxy Lite ne revalide pas les redirections

**Confirmé à la lecture du code ; pas d'exploitation sur la production.**

`api/_lib/web-proxy-policy.js:47` valide la première URL, mais
`api/web-proxy.js:99` utilise `redirect: "follow"`. Les destinations suivantes
ne repassent pas par la politique. Des domaines d'hébergement contrôlables par
des tiers sont acceptés, notamment `*.workers.dev` et `*.vercel.app`.

Une redirection peut donc contourner la liste des destinations autorisées. Le
risque d'accès à des adresses internes dépend du filtrage réseau de l'hébergeur,
non vérifié ici.

**Action :** redirections manuelles avec limite de sauts et validation de chaque
destination, politique anti-adresses privées/locales et tests du handler complet.

### P1 — Limites du proxy appliquées trop tard

`api/web-proxy.js:108` retire le délai d'annulation après réception des en-têtes.
La lecture du corps continue sans ce délai. À la ligne 115, `arrayBuffer()` charge
le corps entier avant le contrôle de taille réel : sans `Content-Length`, le
plafond annoncé de 10 Mio ne protège pas l'allocation mémoire.

**Action :** lire en streaming avec un compteur bloquant et maintenir le délai
jusqu'à la fin ; tester corps lent, taille inconnue et interruption. Les limites
de fréquence en mémoire du processus ne constituent pas un quota distribué.

### P1 — Reprise du téléchargement lecteur sur une autre source

**Reproduit avec hooks et transport simulés, sans téléchargement réseau.**

`src/views/player/hooks/use-video-download.ts:52` mémorise seulement l'identifiant
et le chemin. `begin` réutilise l'URL courante (ligne 72). Après pause puis
changement de source dans le même lecteur, reprendre utilise le même fichier
avec la nouvelle URL. La clé du lecteur est fondée sur le média, pas la source
(`src/App.tsx:1128`), donc un changement de source ne force pas un démontage.

Si le serveur renvoie 206, le backend ajoute les nouveaux octets à l'ancien
fichier partiel sans vérifier l'identité de la ressource. Risque de fichier mixte.

**Action :** figer URL et en-têtes au démarrage ; vérifier les validateurs HTTP et
la plage retournée ; proposer un redémarrage explicite lors d'un changement.

### P2 — Faux succès et échec de fin de reprise dans le backend

Dans `src-tauri/src/download.rs` :

- Lignes 167–170 : tout HTTP 416 avec un partiel devient « terminé », sans
  comparaison avec la taille distante ; l'erreur de renommage est ignorée.
- Ligne 189 : une réponse de moins de 65 536 octets est refusée avant de distinguer
  une reprise. Une vidéo valide à laquelle il reste 32 Kio ne peut pas finir ainsi.
- Lignes 204–216 : le début du `Content-Range` et l'identité de la ressource ne
  sont pas vérifiés avant l'ajout au fichier.
- Ligne 255 : l'erreur du flush final est ignorée avant renommage et succès.

**Action :** contrat de reprise HTTP complet et tests natifs avec serveur local
contrôlé : 200, 206 correct/incorrect, 416, changement d'ETag, corps tronqué,
derniers kilo-octets, annulation et erreur disque.

### P2 — Deux gestionnaires de téléchargements et reprise non durable

Le store global (`src/lib/download/downloads-store.ts`) gère file, persistance
et trois tâches simultanées. Le hook du lecteur gère séparément ses propres
transferts, les annule au démontage (lignes 60–65) et ne les enregistre pas dans
cette liste. Quitter le lecteur perd donc l'accès direct à leur reprise.

Le store global persiste l'URL mais pas ses en-têtes d'autorisation (lignes
68–70), puis propose la reprise après redémarrage (358–365). Une source protégée
ou une URL locale devenue périmée ne peut pas être reprise fiablement ainsi.

Autre défaut de cycle de vie : le store libère la sélection torrent lors d'une
pause (ligne 291), sans la réacquérir à la reprise. Si une lecture concurrente
réduit la sélection du pack, le téléchargement repris peut rester bloqué.
Ce dernier scénario n'a pas été rejoué sur un vrai torrent.

**Action :** faire passer tous les boutons par un service unique, conserver une
référence de source reconstructible et réacquérir les ressources à la reprise.

### P2 — CI rouge et angles morts de déclenchement

Le dernier run frontend du commit audité échoue à l'audit de dépendances, avant
les étapes suivantes :
https://github.com/elie00/vayra/actions/runs/33879335607

`pnpm audit` reproduit deux alertes high sur Browserslist 4.28.2 ; la correction
signalée est >=4.28.7. Il s'agit de la chaîne de compilation Babel/Vite, pas
d'une preuve de faille exploitable dans le lecteur installé. `pnpm audit --prod`
ne signale aucune vulnérabilité JS connue au moment du contrôle.

Les filtres de `.github/workflows/frontend.yml:5` et `:19` omettent `site/**` et
`api/**`, bien que certains tests concernent ces API. Aucun workflow examiné
n'exécute les tests de `vara-broker`. Un changement isolé dans ces zones peut
donc ne pas déclencher la vérification pertinente.

**Action :** actualiser la dépendance verrouillée, couvrir les chemins des deux
backends et ajouter la matrice du broker. Conserver les micro-commits, mais ne
pas assimiler « poussé » à « validé en CI ».

### P2 — Qualification UI et plein écran encore partielle

La navigation hors du lecteur ne demande plus automatiquement la sortie du
plein écran. En revanche, `use-keyboard-shortcuts.ts:128` la demande toujours
pour le raccourci de fermeture lorsque `playerEscExitsFullscreen` est activé,
ce qui est sa valeur par défaut. Ce comportement est explicite, pas une sortie
spontanée prouvée. Il faut décider si Échap doit fermer la vidéo en conservant
le plein écran ou sortir d'abord du plein écran.

`use-fullscreen.ts:51` entretient aussi une série de rafraîchissements puis un
intervalle de deux secondes. Ce n'est pas une preuve de la cause du bug, mais
c'est un point à mesurer sur le binaire plutôt qu'à modifier à l'aveugle.

Vitest tourne en environnement Node. Les tests de contrats et de fonctions
ne remplacent pas une recette de fermeture vidéo, changement d'épisode, PiP,
veille/réveil, écrans multiples, sous-titres et clavier sur les OS visés.

### P3 — Traductions, accessibilité et documentation

`src/views/downloads.tsx:95`, `:242`, `:275` et `:285` contiennent des textes
anglais en dur. Des nouveaux libellés du popover passent par `t()` mais leurs
traductions françaises ne sont pas toutes présentes.

La checklist design passe 14/14, tout en recensant 123 cibles de clic non
sémantiques, 36 usages d'autofocus et 167 `transition-all`. Ce sont des indicateurs
de dette à trier, pas 326 défauts d'accessibilité démontrés.

`HANDOFF.md` décrit encore une app Harbor installée. `site/VAYRA-STATUS.md`
mentionne une clé updater à choisir alors qu'une clé VAYRA est configurée, et
affirme une absence de zones anglaises contredite par la vue téléchargements.
Les documents historiques ne doivent pas servir de statut de release actuel.

## Vérifications exécutées

| Vérification | Résultat actuel |
| --- | --- |
| `pnpm test` | 107 fichiers, 726 tests passent |
| `pnpm exec tsc -b` | Passe |
| `pnpm lint` | Passe ; contrôle des catches vides 271/271 |
| `pnpm test:design` | 14/14, dette ci-dessus conservée |
| `pnpm release:check` | Passe ; vérification de configuration, pas certification de publication |
| `pnpm build:web` | Passe, smoke WASM et six budgets inclus ; WASM embarqué existant, pas régénéré ici |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib` | 53 tests passent sur ce Mac |
| `cargo test --locked --manifest-path vayra-core/Cargo.toml` | 56 tests passent |
| `cargo test --locked --manifest-path vara-broker/Cargo.toml` | 4 unitaires et 9 intégration passent |
| `pnpm test:database` | 23 suites SQL passent, tests de concurrence passent, base jetable locale |
| `pnpm audit` | Échec : deux alertes high Browserslist |
| `pnpm audit --prod --audit-level=moderate` | Aucune vulnérabilité JS connue signalée |
| Signature `/Applications/VAYRA.app` | Vérification stricte réussie ; signature ad hoc, sans TeamIdentifier ; exécutable arm64 |

Budgets mesurés : chargement initial lié 805,5 Kio gzip / plafond 840 ; entrée JS
615 / 650 ; paramètres 301,3 / 325 ; lecteur 289,8 / 310 ; WASM 482,2 / 520.
Ils passent, mais la marge est réduite. Ce n'est pas une mesure du temps jusqu'à
la première image, de la mémoire pendant un film ou de la consommation batterie.

## Distribution et limites de l'audit

La seule release listée par GitHub au contrôle est la prérelease Windows
`v0.9.36-test.1`, publiée le 31 août. Le binaire Mac installé est signé ad hoc,
pas avec une identité Developer ID. La validation de signature réussie ne
constitue donc pas une qualification de distribution Apple notarée.

Non exécutés ici : installation sur un Mac vierge, nouvel installateur/DMG,
mise à jour automatique de bout en bout, build et recette Windows/Linux/Android,
cast sur récepteur réel, deux comptes/deux appareils, audit du Supabase déployé,
scan RustSec des dépendances Rust et tests d'intrusion de production. L'interface
de l'app installée n'a pas été manipulée pendant cet audit.

## Ordre de travail recommandé

### Actif — application macOS personnelle

1. Stabiliser le plein écran et les sorties de lecture sur le Mac installé :
   retour, fermeture vidéo, changement d'épisode, PiP et veille/réveil. Clarifier
   le comportement d'Échap sans confondre sortie vidéo et sortie plein écran.
2. Unifier les téléchargements, sécuriser HTTP Range et la reprise après
   fermeture, changement de source, redémarrage ou indisponibilité réseau.
3. Protéger les secrets des profils et exports ; ajouter les reproductions
   comme tests permanents. L'usage personnel ne supprime pas ce risque local.
4. Améliorer les traductions et parcours clavier utilisés sur Mac ; mesurer
   première image, mémoire, réseau et consommation pendant la lecture.
5. Vérifier localement chaque correction, puis reconstruire et installer le
   binaire macOS avec possibilité de retour à la version précédente. Garder
   des micro-commits/push pour les changements applicatifs demandés.

### En pause

- Développement Lite/site et durcissement de leur proxy avant réexposition.
- Windows, Linux, Android, cast matériel hors de l'usage personnel demandé.
- Diffusion publique, notarisation, signature commerciale et qualification
  d'installateurs/mise à jour destinés à d'autres machines.
- Élargissement de la matrice CI aux composants hors périmètre. L'entretien des
  dépendances communes reste pertinent pour le build Mac, sans devenir un
  chantier de distribution.

Cet audit n'a modifié aucun code applicatif, publié aucune release et exécuté
aucun commit/push. Seul ce rapport a été ajouté au dépôt.
