# Recette des correctifs de recherche et de lecture directe

17 novembre 2026 · VAYRA 0.9.42 · base `538fd214` et correctifs locaux. Cette
recette vérifie les deux écarts prioritaires de la [revue des parcours](2026-11-17-parcours-macos-windows-android.md).

## Recherche

Une même classification distingue les recherches de texte, les magnets, les
liens vidéo pris en charge et les autres liens. Une saisie de lien ne déclenche
aucune requête de catalogue, d'extension ou d'IA. L'interface garde l'action
Lecture pour les liens vidéo reconnus et affiche une indication en français pour
les autres liens. Les liens restent exclus des recherches récentes.
[Classification](../../src/lib/search-input.ts), [routage des requêtes](../../src/lib/search-context.tsx).

- **Tests simulés** · zéro appel à TMDB, Cinemeta, à la recherche anime ou aux
  catalogues d'extensions avec des URL synthétiques, plusieurs formes de liens et
  un magnet. La recherche IA est absente de l'interface pour ces saisies. La suite
  couvre aussi la recherche textuelle ordinaire.
  [Tests des fournisseurs](../../src/lib/search-context.test.tsx),
  [interaction clavier](../../src/components/search/search-interactions.test.tsx).
- **macOS natif de développement** · URL HTTPS sans extension avec paramètre
  synthétique, indication locale, effacement, recherche de « dune », résultat
  « Dune: Part Two », fermeture par Échap et retour à l'accueil.
- **Android sur émulateur** · nouvel APK aarch64, quatre scénarios de recette
  réussis. Le contrôle ciblé vérifie aussi l'indication pour un lien sans
  extension, son absence de l'historique après Entrée et effacement, puis le
  résultat d'une recherche par titre. [Scénarios Android](../../recette/android/).
- **Lien direct sur Android** · le même MP4 affiche la mire. Pause, reprise et
  retour à l'accueil vérifiés. SHA-256 de l'APK de recette
  `f5d0e43bfee79871c628bd89153eb40780ac255c6f64d24c9c6f011a67ee8296`.

## Lecture directe macOS

La recette de référence a reproduit une boucle entre la notification de durée,
le seek et l'émission d'un nouvel état mpv. Quand le premier état reçu contient
déjà la durée et que la progression enregistrée est proche de la fin, la
correction appelle `seek(0)` avant que l'abonnement synchrone ait rendu sa
fonction de désinscription. La notification émise par le seek réentrait alors
dans le même traitement.

La garde marque la vérification comme terminée avant de demander le seek.
L'abonnement est retiré dès que possible, ou à la sortie de l'effet s'il attend
encore la durée. Le test charge un clip de 30 secondes à 16 secondes avec un
bridge qui émet pendant l'abonnement et le seek. Il vérifie un seul seek à zéro,
une seule désinscription et le lancement de la lecture.
[Correctif](../../src/views/player/hooks/use-bridge-load.ts),
[test de régression](../../src/views/player/hooks/use-bridge-load.test.tsx).

L'instance macOS isolée a rejoué trois ouvertures du même MP4 H.264 local, dont
une après rechargement de la WebView. À chaque essai, pause, reprise et sortie
confirmée vers Accueil ont réussi, sans erreur dans le journal du pilote.

Un contrôle supplémentaire a préchargé une reprise synthétique à 16 secondes
sur le clip de 30 secondes. Les relevés natifs de mpv montrent une position
de 0,50 seconde après réouverture, puis de 0,96 seconde en lecture. Une image
de la mire a été extraite avec mpv. Pause, reprise et sortie confirmée ont
également réussi, avec un journal sans erreur.

## Contrôles et limites

- 1 282 tests sur 230 fichiers avec Node 24. TypeScript, lint et 14 contrôles
  design réussis.
- Les parcours natifs ont été exécutés avec le pilote VAYRA. Promethee était
  absent des serveurs MCP accessibles dans cette session.
- L'application macOS quotidienne n'a pas été remplacée. Windows reste
  sans recette native pour ce lot.
