# VAYRA — compte rendu VARA Collections

**Produit :** VAYRA — *A product by EYBO*

**Date :** 14 juillet 2026

**Dépôt :** `elie00/vayra`

**Branche de référence :** `main`

**État de référence :** `5dc5205`

**Verdict :** fonctionnalité complète, testée et poussée sur `main`. Le déploiement
des migrations sur le projet Supabase et la recette manuelle multi-comptes de
l'interface restent à réaliser avant élargissement de la bêta.

## 1. Résumé exécutif

Les travaux ont livré **VARA Collections** : des listes privées de contenus
catalogue, partagées à l'intérieur d'un groupe CIRA, avec un chemin explicite et
sûr vers une VARA, sans aucune synchronisation de lecture automatique.

Un membre d'un groupe CIRA peut désormais :

- consulter les collections visibles dans ses groupes ;
- créer une collection privée de groupe (owner/admin) ;
- ajouter une référence catalogue publique, l'ordonner, la retirer et la lire ;
- voir qui a créé la collection et qui l'a modifiée en dernier ;
- ajouter le titre affiché à une collection directement depuis la fiche média ;
- lancer une VARA depuis une collection par une action explicite, jamais
  automatiquement.

La confidentialité reste un invariant d'architecture : une collection ne stocke
que `metaId`, type, saison/épisode, titre, image publique HTTPS validée, position
d'ordre, auteur et dates. Aucune source, URL de stream, addon, info-hash,
progression, bibliothèque locale, chemin de fichier, IP, appareil, session
Stremio ni analytics n'est enregistré, partagé ou révélé.

Au cours de ces travaux, une faille d'autorisation préexistante sur les groupes
CIRA a été découverte et corrigée (voir §6).

## 2. VARA Collections livré

### 2.1 Modèle de données

- Deux tables : `vara_collections` et `vara_collection_items`.
- Une collection appartient à un groupe CIRA (`on delete cascade`) et porte un
  nom, une description, une option `members_can_edit`, un auteur, un dernier
  modificateur et des horodatages.
- Un item ne porte qu'une référence catalogue publique : `meta_id`, `media_type`
  (`movie`/`series`/`anime`/`tv`/`channel`), `season`/`episode`, `title`,
  `poster_url` HTTPS validée, `position` et auteur d'ajout.
- Limites dures : 50 collections par groupe, 500 items par collection.
- Dédoublonnage par `(collection_id, meta_id, saison, épisode)`.

### 2.2 Droits par défaut

- **owner / admin** du groupe : créent, renomment, suppriment et configurent une
  collection.
- **member** : lecture seule.
- **Option par collection** : `members_can_edit` autorise les membres à ajouter
  et réordonner les items, jamais à supprimer la collection ; un membre-éditeur
  ne retire que les items qu'il a lui-même ajoutés.
- Un utilisateur bloqué ne partage jamais une collection : la frontière de
  blocage héritée des groupes CIRA garantit qu'une paire bloquée ne partage
  aucun groupe, donc aucune collection. L'attribution est en outre masquée dès
  qu'un blocage existe dans un sens.

### 2.3 Réordonnancement transactionnel

- Rang dense `1..n` maintenu par les RPC sous verrou de la ligne collection.
- Ajout en fin de liste, retrait qui referme le trou, déplacement par
  renumérotation dense.
- Contrainte `unique (collection_id, position) deferrable initially deferred`
  couvrant les collisions transitoires d'un déplacement au sein d'une même
  transaction.
- Toute mutation d'item met à jour l'auteur et la date de dernière modification
  de la collection, ce qui garantit une surface « modifié par / le » fidèle et
  un unique signal Realtime par mutation.

### 2.4 Intégration explicite collection → VARA

- Depuis une collection, l'action « Lancer une VARA » crée une room privée puis
  l'active, jamais automatiquement.
- La VARA ne reçoit aucune autorité de lecture ni source : elle reste une room
  vide et les membres ouvrent les items depuis la collection. Le flux
  d'invitation VARA existant, déjà soumis aux blocages, s'applique ensuite.

### 2.5 Ajout depuis la fiche média

- La fiche média affiche une action « Ajouter à une collection » (à côté de
  « Ajouter à une liste »), visible uniquement lorsque VARA est prêt (compte
  bêta et profil CIRA).
- Le menu liste toutes les collections que l'appelant peut éditer, groupées par
  groupe, et ajoute le titre courant en un clic.
- Seule une référence publique est envoyée ; si le poster servi par le CDN a un
  format rejeté par la whitelist, le titre est ajouté sans image.

### 2.6 Surface technique

- 9 RPC publiques `security definer`, `search_path` vide, caller dérivé de
  `auth.uid()` et garde d'identité VAYRA ; aucun droit d'exécution `anon`.
- 6 fonctions `private` (cartes de profil, sérialisation JSON, verrou de
  collection, contrôle d'édition, trigger de notification), toutes révoquées des
  rôles API.
- RLS activée sur les deux tables sans policy : accès direct refusé, tout passe
  par les RPC. Invalidations Realtime privées à payload vide, réservées aux
  membres du groupe.
- Client typé dans `src/lib/vara/` : repository, types, codes d'erreur et miroir
  client strict de la whitelist catalogue et image.
- Interface dans les réglages VAYRA (carte des groupes CIRA) et sur la fiche
  média.
- Traductions en anglais, français, allemand, espagnol, italien, portugais et
  arabe (parité de clés vérifiée par test).

## 3. Validation stricte des références

- `meta_id` restreint à un identifiant catalogue public
  (`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`) : aucune URL, aucun chemin, aucun
  espace ne peut s'y cacher.
- Image poster limitée à HTTPS avec **TLD alphabétique obligatoire**, ce qui
  exclut structurellement toute forme d'IP littérale (décimale, octale et
  hexadécimale comme `0x7f.0.0.1`), `localhost`, une partie userinfo `user@hôte`
  et IPv6.
- Saison et épisade ramenés à nul pour les types non épisodiques.
- La même règle est appliquée côté base (contrainte `check` et RPC) et côté
  client (`requireValidCollectionItem`), de sorte qu'aucune référence non
  publique ni image non conforme n'atteint jamais la base.

## 4. Matrice RLS et RPC

| Opération | owner | admin | member (option off) | member (option on) | non-membre |
| --- | --- | --- | --- | --- | --- |
| Lire collections et items | oui | oui | oui | oui | non |
| Créer / renommer / supprimer / configurer une collection | oui | oui | non | non | non |
| Ajouter / réordonner un item | oui | oui | non | oui | non |
| Retirer un item | tous | tous | non | les siens | non |
| Lancer une VARA depuis une collection | oui | oui | oui | oui | non |

Un non-membre reçoit `COLLECTION_NOT_FOUND` de façon uniforme, sans que le
message ne révèle l'existence d'une collection ou d'un item hors de ses groupes.

## 5. Validations réellement exécutées

| Commande ou contrôle | Résultat |
| --- | --- |
| `bash scripts/cira/db-test.sh` | Succès — 20 fichiers SQL sur 20 |
| `pnpm test` (`vitest run`) | Succès — 41 fichiers, 364 tests |
| `pnpm exec tsc -b` | Succès |
| `pnpm lint` (`eslint --max-warnings 0`) | Succès |
| `pnpm exec vite build` | Succès — bundle produit en 7,11 s |
| Transformation Vite dev des modules modifiés | Succès — HTTP 200, ESM valide |

Le build conserve uniquement les avertissements Vite préexistants sur la taille
de certains chunks ; ils ne bloquent pas le build.

### 5.1 Tests ajoutés

- `supabase/tests/18_vara_collections.sql` : matrice multi-comptes — refus
  d'accès direct aux tables, droits de création par rôle, validation des
  références et images malveillantes (http, IP littérale, IP hexadécimale,
  localhost, userinfo, schéma non https), réordonnancement dense, retrait avec
  fermeture de trou, doublons, pagination bornée, oracle d'existence uniforme,
  ping Realtime réservé aux membres, frontière de blocage, plafonds et cascades.
- `supabase/tests/19_groups_authz.sql` : régression du contournement
  d'autorisation à rôle nul sur les neuf RPC de groupe concernées.
- `src/lib/vara/repository.test.ts` : décodeurs de collection et d'item,
  validation client (identifiant à slash, image http, IP littérale, IP
  hexadécimale, TLD numérique, hôte à label unique, userinfo, titre à
  crochets, schéma non https) et câblage RPC.

## 6. Durcissement de sécurité

Une revue adversariale multi-angle (sécurité SQL, concurrence, intégration
front) a accompagné la livraison. Les points suivants ont été corrigés.

- **Contournement d'autorisation à rôle nul (préexistant).**
  `private.cira_group_role()` renvoie `NULL` pour un non-membre ; en SQL,
  `NULL <> 'owner'` et `NULL not in (...)` valent `NULL`, et une garde
  `if NULL then raise` ne lève pas. Neuf RPC de groupe (mise à jour, suppression,
  changement de rôle, transfert de propriété, invitation, annulation
  d'invitation, création, listage et révocation de liens) sautaient donc leur
  garde de rôle pour tout compte bêta connaissant un identifiant de groupe. Elles
  ont été recréées avec des gardes explicitement null-safe, plus un test de
  régression.
- **Oracle d'existence d'item.** Le retrait et le déplacement résolvaient l'item
  avant de prouver l'appartenance, distinguant « item réel inaccessible » de
  « identifiant inexistant ». Un code `COLLECTION_NOT_FOUND` est désormais levé
  uniformément avant preuve d'appartenance ; le code spécifique à l'item n'est
  conservé qu'après le verrou.
- **Filtre d'IP contournable en hexadécimal.** Le filtre « pas d'IP littérale »
  ne couvrait que les labels tout-chiffres, laissant passer `https://0x7f.0.0.1/`
  (une forme hexadécimale de `127.0.0.1`). Le filtre a été remplacé par
  l'exigence d'un TLD alphabétique, qui rejette toutes les formes d'IP d'un coup.
- **Boucle de rechargement et resouscription Realtime.** `useT()` renvoyant une
  nouvelle fonction à chaque rendu, les loaders instables provoquaient une boucle
  de requêtes et une resouscription Realtime continue. Les loaders ont été
  stabilisés par une référence.
- **Réordonnancement par double-clic.** Un double-clic rapide pouvait déclencher
  deux déplacements concurrents avec une position périmée. Les mutations d'item
  sont désormais sérialisées et les boutons désactivés pendant l'opération, avec
  clamp du déplacement sur le total réel et garde d'annulation au démontage.

## 7. Micro-commits

- `1537cf1` — `fix(cira): close null-role authz bypass in group RPCs`
- `83401b8` — `feat(vara): collections backend — private group-shared catalogue lists`
- `150f7b0` — `feat(vara): collections client repository, types and validation`
- `5d43f58` — `feat(cira): collections UI inside group settings, i18n in 7 languages`
- `ef1dc62` — `fix(cira): stabilize collection loaders to stop realtime resubscribe loop`
- `1119036` — `fix(cira): guard collection reordering against double-click and unmount`
- `d2d76c6` — `fix(vara): close collection existence oracle and hex-IP poster bypass`
- `5dc5205` — `feat(cira): add "Add to a group collection" button on the media page`

Au moment de ce rapport, `main` et `origin/main` pointent sur `5dc5205`.

## 8. Limites et actions restantes

### 8.1 Déploiement base de données

Les deux migrations `20260714100000_cira_groups_authz_hardening.sql` et
`20260714120000_vara_collections.sql` sont validées par le harnais SQL local
mais n'ont pas encore été appliquées au projet Supabase VAYRA. Leur application
transactionnelle, puis un audit distant RLS/RPC/policies analogue à celui des
migrations VARA précédentes, restent à réaliser.

### 8.2 Recette manuelle de l'interface

Le chemin complet de l'interface — bouton visible sur la fiche média, ouverture
du menu, ajout, réordonnancement et lancement d'une VARA depuis une collection —
n'a pas pu être observé au niveau du rendu, faute d'un compte bêta connecté et
d'un navigateur pilotable dans l'environnement de travail. La compilation dev et
le build de production intègrent les modules concernés sans erreur, mais une
recette manuelle avec deux comptes bêta reste requise pour vérifier :

1. affichage du bouton uniquement pour un compte bêta doté d'un profil CIRA ;
2. liste des seules collections que l'appelant peut éditer ;
3. ajout, réordonnancement et retrait selon le rôle et l'option ;
4. respect immédiat d'un blocage ou d'un retrait de membre ;
5. lancement explicite d'une VARA sans autorité de lecture ni source.

### 8.3 Exploitation

- L'action reste réservée aux comptes explicitement autorisés à la bêta.
- Un compte auquel le flag `cira_beta` vient d'être ajouté doit rafraîchir son
  JWT et choisir un handle CIRA avant d'utiliser les collections.
- Les tests Windows et Linux restent confiés à GitHub Actions.

## 9. Fichiers de référence

- `supabase/migrations/20260714120000_vara_collections.sql` : schéma, RLS, RPC
  et réordonnancement des collections.
- `supabase/migrations/20260714100000_cira_groups_authz_hardening.sql` :
  correctif d'autorisation des groupes CIRA.
- `supabase/tests/18_vara_collections.sql` et `19_groups_authz.sql` : recettes
  SQL multi-comptes.
- `src/lib/vara/` : repository, types et validation client des collections.
- `src/views/settings/cira-collections.tsx` : interface des collections dans le
  détail d'un groupe.
- `src/components/lists/add-to-collection-menu.tsx` : ajout depuis la fiche
  média.
- `docs/compte-rendu-cira-vara-beta-privee.md` : état consolidé CIRA/VARA/VEYA
  antérieur.

Les anciens rapports restent des instantanés historiques ; le présent document
daté constitue l'état consolidé le plus récent pour VARA Collections.
