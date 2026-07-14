# LUMA — continuité personnelle et locale

LUMA est l’espace personnel de VAYRA pour reprendre une lecture et préparer ce
qui sera lu ensuite. Il complète le mode salon immersif déjà présent, sans
devenir une seconde autorité de lecture et sans dépendre d’un réseau.

## Produit livré

- rail **Reprendre avec LUMA** sur les accueils desktop et Android ;
- file locale limitée à 50 films ou épisodes, ajoutable depuis les fiches, les
  épisodes et les menus contextuels ;
- lecture, suppression, vidage et réorganisation par glisser-déposer, boutons
  ou `Alt` + flèches ;
- panneau LUMA directement dans le player et raccourci remappable `Q` ;
- passage automatique à l’élément suivant, désactivable ;
- reprise locale désactivable avec effacement immédiat des points enregistrés ;
- export de l’activité uniquement après consentement explicite dans la
  sauvegarde VAYRA.

LUMA n’envoie rien à Supabase et ne lit ou n’écrit aucune table CIRA/VARA.

## Modèle local

Le document `LumaDocumentV1` est stocké par profil sous
`vayra.luma.v1.<profileId>`, avec une copie `.last-good`. Il contient uniquement :

- une référence de catalogue (`metaId`) ou un identifiant stable de la
  bibliothèque locale (`entryId`) ;
- le type, la saison et l’épisode éventuels ;
- un titre, un intitulé d’épisode et une illustration publique éventuelle ;
- position, durée et dates locales.

Les URL de flux, chemins de fichiers, en-têtes HTTP, info-hash, identifiants
d’addon, sessions Stremio, appareils, IP et identifiants sociaux sont refusés
par le sérialiseur. Un chemin local direct n’est pas éligible : le média doit
d’abord appartenir à la bibliothèque locale afin que LUMA ne conserve que son
identifiant stable.

Les reprises sont limitées à 60 entrées et 90 jours. Les médias de moins de
150 secondes, les positions inférieures à 10 secondes, les directs/IPTV et les
lectures terminées à 92 % sont exclus ou retirés.

## Compatibilité et récupération

La première ouverture importe une seule fois `harbor.queue.v1` et
`harbor.localcw.v1` dans le profil actif. Le propriétaire de cette migration est
marqué par `vayra.luma.legacy-owner.v1`, ce qui empêche de dupliquer l’ancienne
file dans plusieurs profils. Les clés historiques ne sont pas supprimées.

Un JSON principal corrompu est remplacé en mémoire par le dernier document sain.
Un schéma provenant d’une version plus récente place LUMA en lecture seule et
n’est jamais écrasé. Si le quota ou le stockage WebView est indisponible, LUMA
continue en mémoire et affiche clairement son état volatil.

## Autorité de lecture

| Contexte | Modifier la file | Reprendre / lire LUMA | Avance automatique |
|---|---:|---:|---:|
| Solo | oui | oui | oui, si activée |
| Cast | oui | non | non |
| Together hôte ou invité | oui | non | non |
| VARA/VEYA hôte ou invité | oui | non | non |
| Minuteur de sommeil actif | oui | manuel | non |

Une entrée réservée reste dans la file pendant la résolution de la source. Elle
n’est retirée qu’après `PlayerSnapshot.rendered`, donc après la première image
réellement rendue. Une source absente ou en erreur ne détruit jamais l’entrée.
Le player, libmpv, ExoPlayer, HTML5, le cast, le P2P, HDR et les shaders n’ont pas
été modifiés par LUMA.

## Accessibilité

Le panneau est une modale avec focus captif et restauration du focus, fermeture
par `Échap`, statut `aria-live`, commandes nommées, ordre annoncé, navigation
clavier, disposition RTL et animations neutralisées avec `prefers-reduced-motion`.
Sur petit écran il devient une feuille basse pleine largeur.

## Validation

Les tests unitaires couvrent la confidentialité du document, l’isolation des
profils, les doublons et limites, l’autorité, l’acquittement après démarrage,
la migration unique, la corruption, les schémas futurs, la rétention et
l’export opt-in. Les validations générales restent celles du dépôt :

```sh
pnpm exec tsc -b
pnpm lint
pnpm test
pnpm build
git diff --check
```

La recette manuelle de lecture doit couvrir au minimum desktop HTML5/mpv,
Android ExoPlayer, le web, un cast actif, une room Together et une room VARA.
Elle est obligatoire avant toute modification future du décodage, HDR, des
shaders, du P2P ou des protocoles de synchronisation.
