# Pilote pour agent

`scripts/agent.mjs` pilote une VAYRA en cours d’exécution, pour un agent ou une
personne : il vise les contrôles par leur nom accessible, attend la fin réelle
des animations et rend une ligne JSON par opération. Il remplace les appuis
`adb` à des coordonnées devinées et les `sleep` au hasard.

## Construire une version pilotable

Le pilote n’existe que dans une version construite avec `VITE_VAYRA_AGENT=1` ;
une version normale n’en contient rien (vérifié sur le bundle).

```sh
# Android (émulateur ou téléphone branché)
VITE_VAYRA_AGENT=1 pnpm tauri android build --target aarch64
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk

# Bureau
VITE_VAYRA_AGENT=1 pnpm tauri dev
```

Ne jamais installer une version pilotable comme appli de tous les jours ni la
publier : n’importe quel programme local pourrait la piloter.

## Utiliser

```sh
node scripts/agent.mjs android launch "wait Accueil 20000" settle \
  "tap Rechercher" settle "type Rechercher dune" settle \
  "tap 'Dune: Part Two'" settle state "screenshot /tmp/apercu.png"
```

| Dans l’appli | Effet |
| --- | --- |
| `tree` | Les contrôles visibles : rôle, nom, rectangle, état, `reachable`, `offscreen` |
| `tap <nom\|#i>` | Fait défiler le contrôle jusqu’à l’écran puis appuie ; refuse un contrôle recouvert ou désactivé |
| `type <champ> <texte>` | Saisit comme au clavier ; vise le champ si un bouton porte le même nom |
| `wait <nom> [ms]` | Attend qu’un contrôle apparaisse |
| `settle` | Attend qu’aucune animation ne tourne et que la page ne change plus |
| `state` | Panneaux ouverts, onglet courant, élément actif, taille d’écran |
| `rect <nom>` · `logs [n]` · `key <touche>` | Rectangle, dernières erreurs, touche clavier |

| Hôte | Effet |
| --- | --- |
| `launch` | (Android) Relance l’appli |
| `screenshot <fichier>` | Capture (Android par `adb`, macOS par `screencapture`) |
| `back` | Retour Android, ou Échap sur le bureau |
| `swipe <nom> <down\|up\|left\|right> [px]` | (Android) Glisser depuis le centre du contrôle |
| `sleep <ms>` | Pause explicite, à éviter au profit de `settle` |

Un nom ignore la casse et les accents, et peut n’être qu’une partie unique du nom.
Un nom ambigu est refusé avec la liste des candidats : préciser le nom ou utiliser
`#index` (lu dans `tree`). À ambiguïté égale, un contrôle atteignable passe avant
un contrôle hors de l’écran, qui passe avant un contrôle recouvert.

## Fonctionnement

L’appli interroge le script en boucle sur `http://127.0.0.1:47800`
(`VAYRA_AGENT_PORT`) ; sur Android le script relie ce port par `adb reverse`. Le
script envoie une opération à la fois et attend la réponse (30 s au plus).

## Limites

- `swipe` passe par `adb input` : Android seulement.
- Sur le bureau, `screenshot` capture tout l’écran du Mac, et Windows n’a pas
  encore de capture.
- `tap` déclenche un `click` : un contrôle qui n’écoute que `pointerdown` ne
  réagit pas ; utiliser alors `swipe` ou `adb`.
