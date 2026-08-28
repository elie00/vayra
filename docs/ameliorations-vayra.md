# Comment améliorer VAYRA

Dernière mise à jour : 28 août 2026. Constats tirés d'un audit du dépôt mené sur
plusieurs séances, puis suivi de correction jusqu'à la PR #89. Le document
conserve les faits qui ont motivé le chantier et indique désormais leur état.

## Résumé

Le code lui-même est de bonne facture : typage strict, lint sans avertissement
et CI multiplateforme. La majorité des défauts corrigés ne venaient pas
d'erreurs de logique mais **de code livré puis débranché**, et de valeurs qui ne
circulaient pas jusqu'à leur destination. Ce sont des défauts qu'aucun des
garde-fous en place ne pouvait voir.

La suite est organisée dans l'ordre suivant : consolider l'UX/UI, qualifier une
bêta Windows signable, construire VAYRA Lite pour le web, réduire les bundles,
puis terminer par la qualification réelle de LUMA, CIRA, VARA et VEYA. Le
périmètre de l'édition web est défini dans [`docs/vayra-lite.md`](vayra-lite.md).

### État au 28 août 2026

| Chantier | État vérifié |
|---|---|
| UX/UI | navigation commune, retours d'action globaux et états de source livrés |
| VAYRA Lite | application web en production, pack d'addons géré, source HTTP et lecture express |
| Performance | avatar réduit, Lottie différé et budgets de bundle bloquants en CI |
| Windows | binaire `VAYRA.exe`, libmpv et outils externes vérifiés par installation silencieuse CI |
| Linux/Flatpak | sources pnpm hors ligne actualisées, métadonnées et bundle validés en CI |
| Identité interne | exécutables Cargo et package JavaScript renommés `vayra` |
| LUMA/CIRA/VARA/VEYA | 228 tests ciblés et 23 suites SQL reproductibles via `pnpm qualify:systems` |

La validation locale finale couvre 95 fichiers et 682 tests frontend. Le
contrôle `release:check` valide en plus l'identité, la version et les ressources
natives attendues par les paquets de release.

Les seules validations qui ne peuvent pas être simulées honnêtement restent la
recette de lecture sur deux comptes/appareils réels, le cast matériel et les
contrôles d'accessibilité assistée. Elles sont des jalons de release, pas des
fonctionnalités manquantes.

---

## 1. Le problème principal : la façon dont le code arrive dans `main`

**11 commits sur 816** portent un message du type « beta sync », « v0.9.21 sync »
ou « Clean-Repush ». Ces onze commits sont à l'origine de la majorité des
régressions trouvées — non par ce qu'ils ajoutent, mais par ce qu'ils écrasent.

Fonctionnalités livrées, montées, puis débranchées par un de ces commits :

| Fonctionnalité | Livrée | Débranchée | Rétablie par |
|---|---|---|---|
| UI complète de la bibliothèque locale | 9 juil. | 12 juil. | #13 |
| Onglet MyAnimeList | 11 juil. | lendemain | #18 |
| Onglets Listes et Letterboxd | 9 juil. | 12 juil. | #21 |
| Palette de commandes + raccourcis de room | 28 juin | plus tard | #22 |
| Barre « modifications non enregistrées » | 10 juil. | **le jour même** | #25 |
| Bouton Retour matériel Android | 2 juil. | plus tard | #23 |
| Vue Stats, salle Sports | — | jamais rendues | #19, #20 |
| Shift+Entrée et bouton web de la recherche | 9 juil. | plus tard | #27, #38 |

Le schéma est constant : un fichier de montage (`App.tsx`, `library.tsx`,
`settings.tsx`) résolu sur une copie antérieure. Le code livré reste dans
l'arbre, seul le point de montage disparaît — **ce qui ne casse ni le build, ni
les tests, ni le lint**. Invisible en CI, invisible en revue.

### Pistes

- **Interdire les commits fourre-tout.** Un sync qui touche 200 fichiers ne peut
  pas être relu. Si le flux impose des imports depuis une autre source, les
  faire passer par une PR au diff lisible.
- **Ajouter un garde-fou mécanique.** Un test qui monte l'application et vérifie
  que chaque vue déclarée dans le type `View` a un rendu, et que chaque onglet du
  type `Tab` a un bouton, aurait attrapé six des sept régressions ci-dessus.

### État

**Corrigé.** `App.tsx` possède un contrat exhaustif `primaryViewMounts` vérifié
par TypeScript et `src/chrome/nav-items.test.tsx` verrouille la navigation
standard. Les layouts partagent désormais la même source de vérité.

---

## 2. Le typage donne une assurance partielle

Le projet est en TypeScript strict avec `--max-warnings 0`. Malgré cela :

- `buffering` : champ déclaré sur le snapshot du lecteur, lu par trois
  consommateurs, qu'aucun bridge ne renseignait (#11) ;
- `runSignal` : attendu par un effet avant de lancer la recherche IA, jamais
  transmis (#27) ;
- `localMinFileSizeMb` : réglage exposé à l'utilisateur, jamais passé au
  scanner, qui retombait sur sa valeur par défaut (#12) ;
- `hdrPassthrough` : champ de capacité renseigné par quatre bridges qui se
  contredisaient, lu par personne (#39) ;
- `mpvBufferBoost` : réglage nommé « Build a bigger buffer » qui **réduisait** le
  buffer de 120 s à 20 s (#9).

Le compilateur valide les formes, pas les circuits. Ces cinq cas ont en commun
d'être **optionnels** : `prop?`, `param = 0`, `unwrap_or(...)`. L'optionalité est
le point aveugle.

### Piste

Se méfier des valeurs par défaut silencieuses aux frontières. `runSignal = 0`
aurait dû être requis ; `min_size_mb.unwrap_or(50)` aurait dû être une erreur
explicite plutôt qu'un repli muet.

### État

Les circuits cités ont été corrigés et les contrôles de release vérifient aussi
les ressources natives obligatoires. La règle demeure active pour les nouvelles
frontières : une valeur nécessaire ne doit plus devenir optionnelle uniquement
pour faciliter le montage.

---

## 3. La couverture de tests est inverse du risque

**76 fichiers de test pour 1675 fichiers source**, soit 254 000 lignes.

La répartition pose plus de problème que le volume : `together/sync` compte sept
fichiers de test pour du code qui fonctionnait déjà, tandis que le **debrid
(1791 lignes)** et les **sous-titres (1204 lignes)** n'en avaient aucun — et les
premiers tests écrits y ont immédiatement révélé des défauts visibles à l'écran
(#29, #31, #33).

Plus gros modules encore sans test :

| Module | Lignes |
|---|---|
| `lib/theme.ts` | 1752 |
| `lib/player/html5/bridge.ts` | 799 |
| `lib/together/client.ts` | 718 |
| `lib/sports/espn.ts` | 663 |
| `lib/stremboxd/client.ts` | 660 |

### Piste

Cibler les **fonctions pures qui décident** : quel fichier lire, quel sous-titre
afficher, quel épisode est vu, quelle source jouer. Ce sont elles qui produisent
les symptômes que l'utilisateur remarque, et elles se testent sans mock.

### État

**Corrigé pour cette liste.** Les décisions de thème et ESPN, le client
Stremboxd, la file/reconnexion Together et la machine d'état HTML5 possèdent
maintenant des tests directs. Le bridge HTML5 délègue ses transitions visibles
à une fonction pure couvrant lecture, pause, chargement, buffering, fin, erreur
et premier rendu.

---

## 4. Les erreurs sont avalées par habitude

Le motif `.catch(() => {})` est répandu. Il a masqué :

- des appels système de fichiers **refusés par les permissions Tauri** : export
  `.nfo`, export de playlist IPTV, lecture des `.nfo`, suppression des fichiers
  téléchargés (#10) ;
- l'invocation d'une commande Rust qui n'a jamais existé (#24).

Dans chaque cas, l'utilisateur voit un bouton qui semble fonctionner et ne
produit rien.

### Pistes

- Un `catch` vide devrait être une décision motivée par un commentaire, pas un
  réflexe.
- **Revoir les capabilities Tauri.** Le scope actuel se limite à
  `$PICTURE/Harbor`, ce qui condamne toute fonctionnalité disque écrite côté
  frontend. Le contournement retenu (#10) passe par des commandes backend, ce
  qui est cohérent avec le reste du projet, mais mérite d'être posé comme règle
  explicite.

### État

Les actions disque concernées utilisent les commandes backend autorisées. Les
échecs d'installation, de reconfiguration et de suppression d'addon sont
désormais visibles et l'interface ne confirme plus une suppression refusée.
Le lint possède en outre une jauge bloquante : les 271 rejets Promise historiques
ne peuvent plus augmenter. Ils doivent décroître au fil des changements, ou être
remplacés par un traitement, un retour utilisateur ou un commentaire justifiant
le caractère best-effort.

---

## 5. Un cap produit : ne jamais jouer autre chose que ce qui est demandé

Trois défauts distincts menaient au même symptôme — **le mauvais épisode se
lance** :

- le numéro d'épisode absolu, implémenté et testé, n'était transmis par aucun
  chemin de lecture (#7) ;
- Real-Debrid renvoyait le lien d'un autre fichier quand l'épisode demandé
  n'était pas sélectionné dans un pack déjà présent au compte (#33) ;
- les quatre autres debrids repliaient sur « le plus gros fichier » quand la
  correspondance d'épisode échouait (#37).

Aucun ne produit d'erreur : ils livrent silencieusement autre chose. C'est la
classe de défaut la plus coûteuse en confiance.

### Piste

Tenir un principe simple : **quand on ne sait pas, échouer plutôt que deviner.**
C'est ce qui a été appliqué aux cinq services debrid.

---

## 6. Deux dettes visibles pour l'utilisateur francophone

- **979 clés sur 4904 (19 %) sans traduction française.** Ce n'est pas un
  défaut de fonctionnement, mais un utilisateur francophone rencontre de
  l'anglais quotidiennement. Deux cas déjà corrigés montrent le genre de
  résultat : « Vu 3 days ago » (#35) et un message d'erreur MAL (#26).
- **Le bundle initial pèse 3 Mo** (906 Ko gzip). Sur desktop, les fichiers sont
  lus depuis le disque local : l'impact porte sur le temps d'analyse du
  JavaScript, pas sur le réseau. Les sept catalogues i18n y sont chargés d'un
  bloc alors qu'un seul sert par session.

### État

**Corrigé et protégé.** Le français contient toutes les clés du catalogue
anglais et un test de parité empêche toute nouvelle clé manquante. Seul l'anglais
est chargé d'emblée ; les six autres catalogues sont importés à la demande.
Lottie a également quitté le chemin critique et l'avatar par défaut est passé
de 2,1 Mo à 51 Ko. Le chargement initial vérifié est de 800,8 Kio gzip, avec un
budget CI fixé à 840 Kio ; des budgets séparés couvrent l'entrée, les réglages,
le player, le WASM et l'avatar.

---

## 7. Reprise bloquée quand un téléchargement se termine pendant la pause

**Corrigé par la PR #59.** Scénario observé :

1. lancer la lecture d'un épisode pendant son téléchargement ;
2. mettre la lecture en pause ;
3. attendre que le téléchargement passe à l'état terminé ;
4. appuyer sur Play.

La lecture ne redémarre pas. La transition du téléchargement vers l'état
terminé ne doit ni invalider le média courant, ni désynchroniser l'état
pause/lecture du bridge. Play doit reprendre **le même épisode, à la même
position**, que la source soit encore en téléchargement ou désormais locale.

### Correction livrée

- le bridge mpv renseignait bien `buffering`, mais le hook React filtrait les
  changements de ce champ : la transition de fin de téléchargement n'atteignait
  donc pas toujours le bouton Play ;
- `buffering` fait désormais partie du contrat de publication du snapshot, avec
  un test de régression couvrant `paused + buffering → paused + terminé` ;
- la fin d'un téléchargement n'ouvre plus automatiquement le dossier système,
  ce qui évite de voler le focus au lecteur. Le bouton de téléchargement terminé
  conserve l'action explicite d'ouverture du dossier.

---

## Prochain jalon de release

Le garde-fou sur les points de montage est livré. Le prochain jalon n'est plus
une correction de code connue : il s'agit d'exécuter la recette réelle
multi-appareils de LUMA/CIRA/VARA/VEYA et les contrôles matériels listés dans
`docs/compte-rendu-luma-complet.md` et
`docs/compte-rendu-cira-vara-beta-privee.md`, sur les binaires de release.

---

## 8. VAYRA Lite : connexion puis lecture, sans configuration d'addons

**Pris en charge.** L'édition web embarque un pack géré d'addons officiels pour
la découverte, les disponibilités et les sous-titres. À la connexion, les
addons du compte Stremio sont fusionnés sans doublon et restent prioritaires.
Lorsqu'une clé debrid est présente, VAYRA construit automatiquement la source
configurée correspondante sans modifier la collection distante du compte.

Le bouton principal utilise toujours la lecture express sur le web. VAYRA tente
la meilleure source directement compatible avec le navigateur ; si le titre
n'est disponible que chez un fournisseur externe, Lite affiche ces offres au
lieu d'un message technique demandant d'installer un addon.

Cette simplification ne promet pas une disponibilité universelle : la lecture
directe reste conditionnée aux droits du fournisseur, à un service debrid le
cas échéant, aux règles CORS et aux codecs pris en charge par le navigateur.
