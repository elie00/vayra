# Studio : clavier et livraison macOS — 8 octobre 2026

## Périmètre

Base `bf1459d9`, branche `feat/android-meta-preview-sheet`. Les lots précédents et les changements Android préexistants sont conservés. Skill checklist-design : Button, Modal et Saving changes ; boucle de vérification du dépôt. Aucun compte ni téléchargement modifié.

## Corrections confirmées

- `CustomCodeMount` masquait toute la navigation HTML des thèmes par `aria-hidden`. Le conteneur n'est plus exclu de l'arbre d'accessibilité ; les décorations peuvent conserver leurs propres attributs. Le masquage pendant le lecteur reste effectif.
- Le panneau réduit de Theme Studio était simplement déplacé hors écran, laissant ses commandes accessibles au clavier. Il devient `inert` une fois réduit ; le focus rejoint « Modifier le thème », puis revient au bouton de réduction quand le panneau est réouvert.
- Échap respecte maintenant les événements déjà traités, la composition IME et les répétitions. Son traitement stoppe la propagation pour éviter qu'une même frappe ferme plusieurs niveaux. Le raccourci de prévisualisation respecte aussi ces gardes.
- L'audit npm actualisé a découvert une nouvelle alerte élevée GHSA-68fv-2mgg-jv7q dans source-map-js 1.2.1, dépendance de compilation CSS. La résolution est contrainte à 1.2.2.

## Preuves

Tests du studio : réduction/réouverture, focus, composition, événement déjà consommé, Échap normal, dialogue d'abandon et absence de réapplication globale du thème au renommage. Le calcul du rendu et le parcours Tab natif ne sont pas validés par jsdom.

L'app installée a été observée sur Slow Horses en pause. L'utilisateur a autorisé explicitement l'installation et la relance pour vérifier les écrans. La recette utilise un brouillon jetable, sans enregistrer de thème ni modifier la bibliothèque.

## Résultats finaux

- 160 fichiers / 1 010 tests réussis sur le dernier code ; TypeScript, lint et 14/14 contrôles design réussis.
- Audit npm du 8 octobre : aucune vulnérabilité connue après correction de source-map-js. Audit Rust non répété ce jour ; les réserves du rapport du 4 octobre restent applicables.
- Compilation macOS réussie, 47 dylibs embarquées, signature ad hoc vérifiée. Six budgets respectés : chargement initial 819,2 Kio gzip ; réglages 308,2 Kio gzip. Aucun gain FPS ou temps de démarrage mesuré.
- Installation finale dans `/Applications/VAYRA.app`, relance réelle et empreinte du binaire identique au paquet construit : SHA-256 `52fe7a560049455b4de263fe5ec6376c69f13d7c3c8d49b0d927b97fd9c74318`.
- Copie récupérable de l'app antérieure : `/Users/eybo/Library/Application Support/VAYRA-app-backups/2026-10-08-1fd2c1e2/VAYRA.app`.

| Parcours / contrat | État | Preuve |
|---|---|---|
| Panneau réduit | Couvert | Capture native : panneau invisible ; arbre AX sans commandes du panneau ; focus sur « Modifier le thème » |
| Retour du focus | Couvert | Entrée rouvre le panneau puis permet de le réduire à nouveau ; test automatisé |
| Échap et navigation globale | Couvert | Test avec le vrai hook global ; recette finale : Échap rouvre le panneau réduit puis propose l'abandon du brouillon |
| Protection du brouillon | Couvert | « Recette temporaire » conservé après Entrée sur l'action sûre et après Échap dans le dialogue |
| Abandon explicite | Couvert | Retour aux réglages après abandon du seul brouillon de recette ; thème VAYRA par défaut toujours actif |
| Navigation HTML et lecteur d'écran | Partiel | Suppression de aria-hidden en source ; aucun thème personnel remplacé pour une recette VoiceOver |
| Taille minimale, mouvement réduit, lecture prolongée | Non vérifié | Recette effectuée dans la fenêtre plein écran existante ; aucune lecture lancée |

La première recette native a révélé un masquage visuel incomplet malgré `inert`, corrigé par `visibility:hidden`, et l'interception d'Échap par la navigation globale, corrigée avec une frontière `data-local-back`. Ces deux corrections sont dans le paquet final. L'outil CUA a rencontré des erreurs AX/timeout et des refus pour changement d'état ; la connexion a été réinitialisée et les parcours finaux ci-dessus ont ensuite été exécutés. Ces erreurs d'outil ne constituent pas une preuve de crash applicatif.

App laissée sur l'accueil. Les lots antérieurs sont inclus dans le paquet, mais tous leurs parcours ne sont pas requalifiés par cette recette ciblée. Aucun commit ni push effectué ; changements Android étrangers conservés.
