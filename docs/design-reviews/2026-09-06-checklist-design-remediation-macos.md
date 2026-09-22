# Corrections de l’audit Checklist Design — macOS

Demande : couvrir les 12 écarts confirmés dans l’audit du 6 septembre 2026.
Périmètre : application personnelle macOS ; aucun déploiement web/public.
Skill : `.agents/skills/checklist-design/SKILL.md`, catégories Design System,
Web App (interfaces React/Tauri), Flows.

## Critères avant livraison

| Écart | Résultat attendu | Couverture source et automatique à la livraison |
| --- | --- | --- |
| D01 | Export sans sessions ni secrets imbriqués ; import sans écraser les connexions | Couvert — schémas et tests d’export/import ancien |
| D02 | Restauration contrôlée, retour arrière et erreur explicite ; aucun rechargement en échec | Couvert — échecs d’écriture, quota, image et récupération réessayable |
| D03 | Confirmation explicite avant suppression d’un fichier téléchargé | Couvert — liste et popover montés, annulation sans suppression |
| D04 | Statut installé distinct de la désinstallation, avec confirmation et portée | Couvert — cartes, détail, liste, réglages et tests de portée |
| D05 | Suppression en attente/échec conservée, quota et réservations cohérents, nouvel essai | Couvert — attente du writer, refus natif simulé, quota et réessai |
| D06 | Recherche progressive sans état vide définitif tant que les sources attendent | Couvert — réponses ordonnées/différées et progression réelle |
| D07 | Erreur réseau distincte de zéro résultat, résultats partiels et réessai | Couvert — échec total/partiel, délai borné et réponses périmées |
| D08 | Accueil local disponible sans dépendre du chargement des catalogues | Couvert — 7 scénarios Home montés |
| D09 | Genres français reconnus sans modifier les identifiants API | Couvert — Horreur, Comédie, Science-fiction et compatibilité anglaise |
| D10 | Synchronisation Stremio absente/réussie/échouée présentée fidèlement | Couvert — vrais adaptateurs stricts et modale montée |
| D11 | Restauration nommée, focus initial sûr, Tab/Escape et retour du focus | Couvert — 6 scénarios BackupRow montés |
| D12 | Popover téléchargements : état exposé et focus rendu au déclencheur sur Escape | Couvert — Escape, clic extérieur, confirmation imbriquée |
| Garde design | Réduire la dette réelle ; ne pas augmenter les budgets | Couvert — 14/14 contrôles, budgets inchangés |

## Contrat de vérification du lot

- Régressions sur données fictives : secrets, quota, échecs d’écriture/suppression,
  requêtes lentes/échouées, annulation et focus.
- TypeScript, suite complète, lint, garde design, construction macOS.
- Installation sauvegardant l’ancienne application ; contrôle natif non destructif.
- Préserver le fond uniforme, les animations, le focus arrondi et le plein écran.
- Ne pas supprimer/restaurer/désinstaller de données réelles pendant les essais.

## Preuves automatiques exécutées

- `pnpm test` : **947 tests / 146 fichiers**, réussite le 6 septembre à 14:20
  sur le dernier correctif `046463ac`.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` : **60 tests réussis**.
- `pnpm exec tsc -b` : réussite.
- `pnpm lint` : réussite ; erreurs silencieuses 270/271.
- `pnpm test:design` : **14/14 contrôles** ; cibles non sémantiques 124 → 122,
  usages transition-all 167 → 163, autofocus 36 inchangé. Aucun budget relevé.
- Tests ciblés : téléchargements/lecteur 65 ; sauvegardes 22 ; recherche/accueil/
  adaptateur add-ons 49 ; installation/désinstallation 28. Ces ensembles se
  recoupent et ne sont pas à additionner au total global.
- Contre-revue indépendante : défaut supplémentaire de Maj+Tab depuis le
  conteneur focalisé après échec asynchrone, corrigé dans `use-focus-trap.ts`
  et vérifié par la confirmation de suppression montée. La construction native
  a été relancée après ce correctif, avant installation.
- La recette native a révélé un `0` parasite pendant la recherche sans résultats
  immédiats. `hasResults` est désormais explicitement booléen ; les tests montés
  vérifient l’absence de nœud texte `0` pendant le chargement et à l’état vide.
  Suite complète et construction relancées après cette correction.

## Portée et limites importantes

L’export v2 sélectionne les préférences connues par schéma. Les connexions, clés,
profils, extensions configurées, liens externes et code personnalisé sont exclus,
y compris dans les anciennes sauvegardes importées. Listes, bibliothèque locale
et progression peuvent être incluses explicitement ; les médias ne sont pas
copiés et les données liées à un profil nécessitent le même profil. L’interface
explique cette portée : ce n’est pas un clone complet du Mac.

Le retour arrière d’une restauration utilise un snapshot en mémoire et expose
une récupération réessayable en cas de refus du stockage. Il ne constitue pas une
garantie de récupération après arrêt forcé/crash du processus. Les délais de
15 s (recherche) et 20 s (catalogues Home) bornent l’attente de l’interface ; ils
ne prouvent pas l’annulation physique d’un transport natif déjà lancé.

Aucune suppression, désinstallation, restauration ni export de données privées
réelles n’a été exécuté pour les tests. Les pannes/quota sont injectés dans des
fixtures. VoiceOver complet, attente de plusieurs heures, veille/réseau réels et
tous les thèmes ne sont pas qualifiés par cette suite. Les 12 écarts confirmés
sont traités ; ce rapport n’affirme pas l’absence de tout futur défaut du produit.

## Construction, installation et recette native

Version livrée : **0.9.42**, application Apple Silicon personnelle, construite
depuis `046463ac4b1d5fbc55d9de2f0d26c1b48067e43d` avec
`pnpm tauri:build:macos`, puis installée dans `/Applications/VAYRA.app`.

- TypeScript, Vite, compilation Rust release et intégration de libmpv terminés
  avec succès ; dépendances natives embarquées dans le paquet.
- `codesign --verify --deep --strict` : réussite sur le paquet construit et
  installé ; signature ad hoc locale, pas une notarisation publique.
- `file` : exécutable Mach-O 64 bits **arm64** ; version Info.plist **0.9.42**.
- SHA-256 identique du binaire construit et installé :
  `175fb88c3c757f0f263a2240b5c26b0aa5b3a60adf83845f9aeca83d2d1155c2`.
- Copies récupérables dans la Corbeille :
  `VAYRA-before-checklist-remediation-20260906.app` (0.9.41) et
  `VAYRA-before-search-zero-polish-20260906.app` (première construction 0.9.42).
  Aucun fichier média ni donnée de compte déplacé ou supprimé.
- Avertissements de construction non bloquants conservés : taille de certains
  chunks, imports statiques/dynamiques mixtes et `eval` dans lottie.

### Observations dans l’application installée

Contrôle non destructif, après accord de l’utilisateur pour laisser l’app libre.
Les captures et arbres d’accessibilité ont été consultés directement pendant la
session ; aucun export de données privées n’a été produit.

| Parcours | Preuve native observée | Limite |
| --- | --- | --- |
| Accueil | Ouverture réussie, contenus locaux et hors connexion présents ; fond principal uniforme | Réseau coupé uniquement simulé dans les tests Home |
| Recherche | Saisie « Horreur », proposition « Films · Horreur », état « Recherche… », focus extérieur arrondi, aucun `0` parasite ; Escape ferme la recherche | Pannes et réessai des fournisseurs couverts automatiquement, pas provoqués sur le réseau réel |
| Téléchargements — liste | Confirmation française avec le contenu visé et l’irréversibilité ; Escape annule, même nombre d’éléments et volume enregistré | Suppression réelle et refus natif testés sur fixtures uniquement |
| Téléchargements — popover | États accessible ouvert/fermé, confirmation puis annulation, fermeture avec Escape observés sur la première construction 0.9.42 ; code inchangé dans la dernière | Retour exact du focus au déclencheur couvert en test monté, observation native partielle |
| Extensions | Statut installé séparé du bouton Désinstaller ; confirmation nommée, portée Stremio/autres appareils explicite, focus visible sur Annuler ; Escape conserve l’extension et le compte d’extensions | Aucun appel réel de désinstallation ou synchronisation effectué |
| Sauvegardes | Portée de l’export/import et exclusions des comptes/clés affichées ; données privées facultatives non cochées | Import/export et retour arrière testés sur fixtures, pas sur les sauvegardes privées |
| Plein écran | Maintenu pendant la recherche, les réglages et les confirmations ; retour à l’accueil en fin de contrôle | Aucune séquence de lecture vidéo prolongée ajoutée à cette recette |

L’outil d’accessibilité a rencontré `AXError.cannotComplete` à la sélection de
l’app et une erreur ponctuelle de capture ; une nouvelle lecture a permis de
continuer. Ces erreurs d’outil ne sont pas présentées comme des plantages VAYRA.

Les micro-commits produit sont poussés sur `codex/pause-resume-downloads`.
Les preuves ci-dessus sont locales ; aucune exécution CI indépendante n’est
revendiquée. La matrice couvre les **12 écarts confirmés** de l’audit initial,
pas toute la dette historique ni tous les scénarios matériels possibles.
