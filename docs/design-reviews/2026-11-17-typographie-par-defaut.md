# Typographie par défaut de VAYRA

17 novembre 2026 · VAYRA 0.9.42 · changement local à partir de `538fd214`.

Fraunces revient pour les titres et Inter pour le texte et les commandes.
Les fichiers de police sont embarqués avec l'application. Les palettes partagent
ce défaut et les choix explicites, dont Geist, restent disponibles dans
Apparence. Un ancien réglage Geist sans choix explicite suit le nouveau défaut.
Le premier écran et les nouveaux brouillons du studio utilisent la même paire.
[Styles de démarrage](../../src/index.css), [résolution de la paire](../../src/lib/theme.ts).

| Vérification | Résultat |
| --- | --- |
| Familles et caractères français | **Couvert** dans WebKit natif. Fraunces 600 et Inter 500 chargées pour « Épisodes déjà vus · Œuvre française ». |
| Hiérarchie des titres et du texte | **Couvert** par les styles calculés sur Accueil et Thème et apparence à 1 280 px, puis sur Thème et apparence à 960 px. |
| Changement de paire | **Couvert** par sélection de Geist puis de Fraunces + Inter dans l'instance de test macOS. Les tests automatisés couvrent les anciens réglages implicites et les choix explicites. |
| Rendu des autres plateformes | **Partiel**. La paire par défaut et les fichiers sont communs. Rendu natif Windows et Android non vérifié sur ce lot. |

La recette a utilisé une instance macOS isolée. Le paquet quotidien sous
`/Applications` n'a pas été remplacé.
