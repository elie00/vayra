# Theme Studio : UI, vitesse et sécurité — 4 octobre 2026

## État et périmètre

Travail local sur `feat/android-meta-preview-sheet`, base `bf1459d9`, avec les lots du 3 octobre et les modifications Android préexistantes conservés. Références checklist-design et boucle de vérification : modales, focus, actions, chargement et intégrations. Aucun compte, média ou téléchargement réel modifié. Pas de publication web.

## Corrections

### Sécurité

L’app filtrait le HTML d’un thème importé, mais Theme Studio injectait son aperçu brut par `innerHTML`. Le même filtrage couvre maintenant l’app et le studio : suppression des scripts, frames, objets, formulaires et gestionnaires inline. Les commandes de navigation correspondant exactement à `window.vayra.navigate('vue')` ou à l’alias Harbor sont converties en attributs déclaratifs puis exécutées par un gestionnaire limité aux vues connues. Une commande comportant du code supplémentaire n’est pas conservée. Le JavaScript local explicitement saisi/exécuté reste une fonctionnalité distincte ; ceci n’est pas un sandbox du système de thèmes.

Audit npm initial : 17 alertes (4 faibles, 7 modérées, 6 élevées). Corrections ciblées : DOMPurify 3.4.16, Undici 7.29.1, brace-expansion 1.1.21 et 5.0.12 dans les branches transitives concernées. `pnpm audit --audit-level=low` retourne ensuite « No known vulnerabilities found ». Le changement majeur transitif de brace-expansion est encadré par la compilation, le lint et les tests ; il n’équivaut pas à une qualification universelle de tous ses consommateurs.

Audit Rust : sept vulnérabilités initiales, puis deux restantes après mises à jour ciblées de h2, quinn-proto, rustls et plist. Les deux restantes concernent quick-xml 0.39.2 via wayland-scanner, dans le graphe Linux ; cette version est absente du graphe macOS. Les avertissements de maintenance et de soundness (glib 0.18.5, rand 0.7.3) restent présents : cet audit ne signifie pas une sécurité complète.

La dépendance librqbit-upnp 1.0.0 est conservée localement sous `src-tauri/vendor`, avec provenance, sources et licence Apache-2.0. Seule son exigence quick-xml passe à 0.42.0 ; son test XML amont passe. Ce patch devra disparaître lorsque l’amont proposera une version compatible corrigée. Les 75 tests de la bibliothèque native passent, avec un test ignoré.

La CSP `unsafe-eval` possède des consommateurs concrets : JavaScript local et bouton d’exécution de Theme Studio. La supprimer immédiatement casserait ces fonctions. Les permissions réseau larges et le scope asset général restent à revoir avec les contrats addons/fichiers locaux ; aucune restriction aveugle n’a été faite. Le repli du trousseau vers localStorage demeure une limite connue et signalée.

### UI et UX

Le dialogue « Quitter sans enregistrer ? » utilise maintenant `ConfirmationDialog` : rôle et description, focus initial sur « Continuer à modifier », cycle Tab, Échap, restauration du focus et bouton explicite d’abandon. Deux conteneurs cliquables non sémantiques et un autofocus disparaissent. Les budgets sont abaissés à 120 cibles non sémantiques et 35 autofocus pour empêcher leur réintroduction. Le style reprend les composants existants ; pas de refonte esthétique globale.

### Vitesse

L’effet d’application globale du thème dépend maintenant de ses seules valeurs visuelles (couleurs, police, layout, styles et bokeh), au lieu de tout le brouillon. Renommer le thème ou saisir du CSS/HTML/JS ne réapplique plus les variables globales et la police. Un test composant vérifie une application au montage et aucune application supplémentaire après renommage. Les effets CSS/HTML dédiés restent actifs.

Observation du binaire installé pendant MobLand : échantillon `top` du processus principal, 23,2 % CPU et mémoire affichée 1 858 Mo. C’est une mesure ponctuelle en lecture, avec d’autres travaux sur le Mac, pas une mesure du démarrage, de la première image, de la mémoire totale WebKit ou une preuve de fuite. Aucun gain natif n’est revendiqué à partir de cet échantillon.

## Matrice de preuves

| Contrat | État | Preuve |
|---|---|---|
| HTML importé filtré dans le studio | Couvert en source et simulation | Filtrage partagé ; scripts, iframe et handlers retirés |
| Navigation de thème sûre | Couvert en simulation | Route connue déclenchée une fois, code supplémentaire/route inconnue refusés, retrait du listener |
| Dialogue de sortie | Couvert en simulation | Focus sûr, rôle modal, Échap sans abandon et retour au bouton de fermeture |
| Application du thème pendant saisie | Couvert en simulation | Compteur d’appels stable après renommage |
| Dépendances npm | Couvert au moment du contrôle | 17 alertes avant, aucune connue après |
| UI installée | Partiel | Observation du lecteur et de sous-titres français ; aucun autre écran navigué pendant la lecture |
| Performance native | Partiel | Échantillon CPU/mémoire pendant lecture ; démarrage et fluidité non mesurés |
| Sécurité complète | Non vérifiée | CSP, scopes, coffre dégradé et commandes natives restent des frontières à qualifier |

Validation finale du code : TypeScript, 160 fichiers / 1 009 tests, lint et 14/14 contrôles design réussis. Les tests sont simulés et ne prouvent pas le rendu WebKit. Le compteur des catch vides reste à 269/269 ; transition-all à 163.

Paquet macOS reconstruit après les mises à jour Rust : compilation réussie, 47 dylibs embarquées et vérification `codesign --verify --deep --strict` réussie (signature ad hoc locale). Les six budgets de bundle passent, dont 819,2 Kio gzip pour le chargement initial. Le paquet se trouve dans `src-tauri/target/release/bundle/macos/VAYRA.app` ; cela ne valide pas les parcours de l’app installée.

## Installation et recette

La session vidéo en cours est préservée. Un créneau de fermeture/relance a été demandé ; sans réponse, aucun remplacement du binaire personnel n’est réalisé. La boucle du skill checklist-design demande : « Ne pas interrompre une vidéo ni manipuler l’app en concurrence avec l’utilisateur ». Recette restante : thème importé isolé, navigation custom, renommage, sortie annulée puis abandon confirmé, largeur minimale et focus clavier. Ne pas tester un payload sur le thème personnel de l’utilisateur.
