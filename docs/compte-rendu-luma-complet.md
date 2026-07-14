# Compte rendu complet — LUMA

Date de consolidation : 14 juillet 2026  
Branche de référence : `main`  
Dernier commit fonctionnel audité : `42c21b2`

## Verdict

L'implémentation logicielle de LUMA est complète pour le périmètre demandé :
continuité personnelle locale, reprise de lecture, file ordonnée, panneau player,
commandes accessibles, persistance privée, récupération et arbitrage de
l'autorité de lecture.

Le code est prêt pour une recette de release. La qualification manuelle sur de
vrais lecteurs reste volontairement un jalon distinct : elle doit être exécutée
sur desktop mpv/HTML5, Android ExoPlayer et web, puis avec un cast, une session
Together et une room VARA. Aucun de ces essais matériels ne doit être considéré
comme passé sur la seule base des tests automatisés.

## État du produit avant LUMA

LUMA s'appuie sur l'état de référence livré avant ce chantier :

- CIRA fournit les relations sociales privées et leurs invitations ;
- VARA fournit les rooms privées distantes ;
- VEYA synchronise l'intention de lecture dans une room ;
- la session Stremio demeure indépendante du compte VAYRA ;
- le player et ses moteurs existants restent l'unique autorité technique de
  lecture ;
- la file historique `harbor.queue.v1`, la reprise locale historique
  `harbor.localcw.v1` et la bibliothèque locale restent compatibles.

Les états CIRA, VARA et VEYA ne sont ni lus ni écrits par LUMA. Le détail de la
bêta privée antérieure reste consigné dans
`docs/compte-rendu-cira-vara-beta-privee.md` et
`docs/vara-veya-implementation-report.md`.

## Fonctionnalités livrées

### Reprendre la lecture

- Rail « Reprendre avec LUMA » sur les accueils desktop et mobile.
- Enregistrement local de la position, de la durée et de la date de lecture.
- Reprise disponible après 10 secondes de lecture.
- Exclusion des contenus de moins de 150 secondes et des directs/IPTV.
- Suppression automatique d'une reprise à 92 % ou à la fin du média.
- Conservation maximale de 60 reprises pendant 90 jours.
- Désactivation explicite de la mémorisation avec effacement immédiat des
  reprises déjà stockées.
- Écriture de progression limitée à une fois toutes les quatre secondes, avec
  vidage forcé lors de `pagehide`, de la fin de lecture et du démontage du
  player pour éviter la perte de la dernière position.

### File de lecture locale

- Ajout depuis les fiches, les épisodes et les menus contextuels.
- Limite explicite de 50 films ou épisodes.
- Détection des doublons par identité de média et d'épisode.
- Suppression individuelle et vidage complet.
- Réorganisation par glisser-déposer, boutons et `Alt` + flèches.
- Lecture manuelle de l'élément suivant.
- Avance automatique configurable.
- Une entrée en cours de résolution reste dans la file en cas d'erreur.
- L'entrée n'est retirée qu'après `PlayerSnapshot.rendered`, c'est-à-dire après
  le premier rendu confirmé par le player.

### Panneau player

- Panneau LUMA directement accessible depuis les transports du player.
- Raccourci `Q`, intégré au système de raccourcis remappables.
- Compteur, état de persistance, préférences, file, réorganisation et actions
  de lecture réunis dans le même panneau.
- Présentation en modale sur desktop et en feuille basse sur petit écran.

### Bibliothèque locale

- Un fichier local est lu directement depuis la bibliothèque locale ; il ne
  passe pas par le sélecteur de sources réseau.
- Si le fichier n'existe plus dans la bibliothèque, une erreur explicite est
  retournée et l'entrée n'est pas détruite.
- L'identité `localLibraryEntryId` est transmise au player séparément du chemin.
- Même si le fichier possède un identifiant IMDb, la persistance LUMA utilise
  `local:<entryId>` et ne transforme jamais le fichier en référence catalogue.

## Architecture et cycle des données

```text
Fiche / épisode / bibliothèque locale
                |
                v
          lumaInput (sanitisation)
                |
                v
       LumaStore du profil actif
          |                |
          v                v
  vayra.luma.v1.*    état React abonné
  + copie last-good        |
                           v
                accueil + panneau player
                           |
                           v
             resolveLumaPlaybackTarget
                 |                  |
                 v                  v
          source catalogue    fichier bibliothèque
          -> Play Picker      -> PlayerSrc direct
                 \                  /
                  v                v
             player existant, autorité unique
```

Le cœur est découpé ainsi :

- `src/lib/luma/types.ts` : schéma, limites, erreurs et contrats de données ;
- `src/lib/luma/storage.ts` : clés, validation, sanitisation, migration et copie
  saine ;
- `src/lib/luma/store.ts` : mutations, abonnements, progression et état de
  persistance ;
- `src/lib/luma/authority.ts` : résolution pure de l'autorité de lecture ;
- `src/lib/luma/playback.ts` : résolution catalogue ou bibliothèque locale ;
- `src/lib/luma/index.ts` : surface publique du module ;
- `src/views/player/hooks/use-resume-autosave.ts` : capture et vidage de la
  progression ;
- `src/views/player/hooks/use-queue-advance.ts` : passage au média suivant ;
- `src/components/player/cast-modal/queue-panel.tsx` : panneau LUMA ;
- `src/views/home/luma-resume-section.tsx` : rail de reprise.

## Modèle local et confidentialité

Chaque profil possède un document versionné :

```text
vayra.luma.v1.<profileId>
vayra.luma.v1.<profileId>.last-good
```

Le document contient uniquement :

- une référence catalogue `metaId`, ou un `entryId` de bibliothèque locale ;
- le type de média, la saison et l'épisode éventuels ;
- le titre, le titre d'épisode et une illustration publique HTTP(S) ;
- les positions, durées, dates locales et préférences LUMA.

Sont explicitement absents ou rejetés :

- URL de flux et chemins de fichiers ;
- en-têtes HTTP et jetons ;
- info-hash et identifiants d'addon ;
- session Stremio ;
- adresse IP et identifiant d'appareil ;
- compte, relation, invitation ou présence CIRA ;
- room, participants ou transport VARA/VEYA.

LUMA n'utilise ni Supabase, ni Realtime, ni backend. L'export de son activité
dans une sauvegarde VAYRA est séparé et soumis à un consentement explicite.

## Persistance, migration et récupération

- Le document est isolé par profil actif.
- La file et les reprises historiques sont importées une seule fois depuis
  `harbor.queue.v1` et `harbor.localcw.v1`.
- `vayra.luma.legacy-owner.v1` empêche l'import de la même ancienne file dans
  plusieurs profils.
- Les anciennes clés ne sont jamais supprimées.
- La lecture réapplique toutes les limites et la sanitisation, y compris sur un
  document modifié ou ancien.
- Une copie `.last-good` permet la récupération après JSON principal corrompu.
- Un schéma provenant d'une version future place LUMA en lecture seule et n'est
  jamais écrasé.
- Un échec du quota ou du stockage bascule en mode volatil visible ; les
  fonctions restent utilisables en mémoire.
- Les événements `storage` mettent à jour les autres vues partageant le profil,
  avec contrôle de révision pour ignorer un état obsolète.

## Règles d'autorité et interopérabilité

| Contexte | Éditer la file | Lancer/reprendre | Avance automatique |
|---|---:|---:|---:|
| Solo | oui | oui | oui, si activée |
| Cast actif | oui | non | non |
| Together, hôte | oui | non | non |
| Together, invité | oui | non | non |
| VARA/VEYA, hôte | oui | non | non |
| VARA/VEYA, invité | oui | non | non |
| Minuteur de sommeil actif | oui | manuel | non |

Une session Together est bloquante dès qu'elle est rejointe, même avec un seul
participant. Une room VARA active reste bloquante pendant une reconnexion de
transport. Le cast garde la priorité dans la résolution de l'autorité.

Aucun protocole, message ou comportement de cast, Together, VARA ou VEYA n'a
été modifié. LUMA choisit seulement s'il est autorisé à demander une lecture au
player existant.

## Accessibilité et interaction

- focus captif dans le panneau et restauration au déclencheur à la fermeture ;
- fermeture par `Échap` ;
- commandes nommées et états annoncés avec `aria-live` ;
- ordre de la file annoncé après réorganisation ;
- commandes clavier utilisables sans glisser-déposer ;
- disposition RTL compatible ;
- animations neutralisées avec `prefers-reduced-motion` ;
- feuille mobile pleine largeur et cibles tactiles adaptées.

## Fichiers touchés par domaine

### Cœur, stockage et tests

- `src/lib/luma/index.ts`
- `src/lib/luma/types.ts`
- `src/lib/luma/storage.ts`
- `src/lib/luma/store.ts`
- `src/lib/luma/authority.ts`
- `src/lib/luma/playback.ts`
- `src/lib/luma/store.test.ts`
- `src/lib/luma/authority.test.ts`
- `src/lib/luma/playback.test.ts`
- `src/lib/queue.ts`
- `src/lib/backup.ts`
- `src/lib/backup.test.ts`
- `src/lib/view.tsx`
- `src/lib/local-library/player-src.ts`

### Player et surfaces utilisateur

- `src/views/player.tsx`
- `src/views/player/hooks/use-resume-autosave.ts`
- `src/views/player/hooks/use-queue-advance.ts`
- `src/views/player/hooks/use-keyboard-shortcuts.ts`
- `src/views/player/hooks/use-player-hotkeys.ts`
- `src/components/player/cast-modal.tsx`
- `src/components/player/cast-modal/queue-panel.tsx`
- `src/components/player/cast-modal/title-panel.tsx`
- `src/components/player/cast-modal/episode-picker.tsx`
- `src/components/player/transport.tsx`
- `src/components/player/transport-stremio.tsx`
- `src/components/player/transport/control-renderer.tsx`
- `src/components/player/transport/control-renderer-stremio.tsx`
- `src/lib/player-chrome.ts`
- `src/lib/hotkeys.ts`
- `src/components/context-menu.tsx`
- `src/views/home.tsx`
- `src/views/home/luma-resume-section.tsx`
- `src/mobile/home.tsx`
- `src/views/settings/advanced-panel.tsx`
- `src/views/settings/backup-row.tsx`

### Traductions et documentation

- `src/lib/i18n/locales/luma.ts`
- `src/lib/i18n/locales/luma.parity.test.ts`
- locales `ar`, `de`, `en`, `es`, `fr`, `it` et `pt`
- `README.md`
- `docs/luma.md`
- `docs/branding-compatibility.md`

## Historique des micro-commits LUMA

| Commit | Objet |
|---|---|
| `3ae5b86` | `feat(luma): add private local continuity store` |
| `f7bb1dc` | `feat(luma): enforce solo playback authority` |
| `8e83e4a` | `feat(luma): add accessible player continuity panel` |
| `991075f` | `feat(luma): surface local resume across home` |
| `d56dfe8` | `feat(luma): complete episodes privacy and locales` |
| `b168bbc` | `fix(luma): harden migration and end-of-playback rules` |
| `21d2f93` | `docs(luma): document complete local continuity contract` |
| `ec64cee` | `fix(luma): close persistence and local playback gaps` |
| `42c21b2` | `fix(luma): preserve stable local library identity` |

Tous ces commits sont présents sur `origin/main` au moment de cette
consolidation.

## Validations réellement exécutées

Validation finale du 14 juillet 2026 :

| Commande | Résultat |
|---|---|
| `pnpm exec tsc -b --pretty false` | succès |
| `pnpm lint` | succès, zéro avertissement ESLint autorisé |
| `pnpm test` | succès, 39 fichiers et 336 tests |
| `PATH="$HOME/.cargo/bin:$PATH" pnpm build` | succès, WASM et production Vite construits |
| `git diff --check` | succès avant la génération de ce rapport |

Les tests directement liés à LUMA couvrent notamment :

- sanitisation et absence de chemin local ;
- identité stable de bibliothèque locale ;
- isolation entre profils ;
- limites, doublons, ordre et acquittement après rendu ;
- migration unique et conservation des clés historiques ;
- corruption, copie saine et schéma futur ;
- rétention et seuil de fin ;
- résolution de lecture catalogue/local ;
- autorité cast/Together/VARA ;
- parité des traductions ;
- export de sauvegarde opt-in.

Le build émet encore des avertissements non bloquants déjà présents concernant
les imports Vite mixtes, `eval` dans `lottie-web` et la taille de certains
chunks. Ils ne sont pas introduits par LUMA et n'ont pas été masqués.

## Recette manuelle obligatoire avant diffusion

Les cases suivantes ne sont pas déclarées validées par ce rapport :

- [ ] Desktop mpv : reprise, seek, fin à 92 %, média suivant et redémarrage.
- [ ] Desktop HTML5 : mêmes scénarios et fermeture brutale de fenêtre.
- [ ] Android ExoPlayer : persistance après mise en arrière-plan et redémarrage.
- [ ] Web : rechargement, quota indisponible et synchronisation entre onglets.
- [ ] Fichier local présent, puis supprimé/déplacé après ajout à la file.
- [ ] Cast actif : file éditable, lecture et avance LUMA bloquées.
- [ ] Together hôte et invité : aucune seconde autorité de lecture.
- [ ] VARA/VEYA hôte et invité, y compris perte/reprise du transport.
- [ ] Clavier seul, lecteur d'écran, RTL, reduced motion et format mobile.

Cette recette vérifie les seams existants ; elle ne nécessite ni changement de
décodage ni instrumentation invasive.

## Limites connues et frontières préservées

- LUMA est volontairement local et personnel : aucune synchronisation cloud ou
  sociale n'est prévue dans ce périmètre.
- Un fichier direct qui n'appartient pas à la bibliothèque locale n'est pas
  persistable, afin de ne jamais stocker son chemin.
- Les données restent dans le stockage du WebView du profil ; la protection au
  repos dépend donc de celle du système et du compte utilisateur local.
- L'export d'activité reste désactivable et séparé des sauvegardes ordinaires.
- Aucun changement n'a été fait dans libmpv, ExoPlayer, HTML5, HDR, shaders,
  P2P, cast, Stremio, Supabase ou les protocoles Together/VARA/VEYA.
- Les identifiants Harbor historiques conservés le sont uniquement pour la
  migration et la compatibilité des données existantes.

## Conclusion

Il ne reste pas de fonctionnalité LUMA connue à implémenter dans le périmètre
convenu. Le prochain travail peut commencer après la recette manuelle ci-dessus
si la cible est une diffusion utilisateur. Toute future synchronisation de
LUMA devra constituer un chantier séparé, avec consentement explicite, modèle de
menaces et migration compatible installation neuve/installation existante.
