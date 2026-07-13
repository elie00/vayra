# CIRA — rapport d'implémentation complète

**Date** : 2026-07-13
**Branche** : `feat/cira-complete`
**Produit** : VAYRA, A product by EYBO

## Résultat

CIRA couvre désormais les relations et groupes privés internes à VAYRA :

- profil privé avec handle unique, nom affiché et avatar du catalogue local ;
- demandes directes, invitations opaques, acceptation, refus, annulation,
  suppression, blocage et déblocage ;
- présence volontaire limitée à `offline`, `online` ou `in_vara` ;
- groupes privés avec nom, description, limite de 2 à 250 membres et rôles
  `owner`, `admin`, `member` ;
- création, édition, suppression, départ, exclusion, promotion/rétrogradation
  et transfert explicite de propriété ;
- invitations de groupe directes réservées aux relations acceptées ;
- liens de groupe opaques, temporaires, révocables et à usage unique ;
- parcours web → deep link → aperçu → décision dans l'application ;
- boîte sociale synchronisée entre appareils sans table d'historique ;
- pagination serveur bornée pour relations et membres ;
- invalidations Realtime privées sans donnée métier dans le payload.

Le chat, les fils publics, likes, followers, recherche publique, recommandations
et import de contacts restent volontairement absents. Ils contredisent le
périmètre privacy-first défini pour CIRA et nécessiteraient une décision produit
distincte.

## Garanties de confidentialité

- L'identité CIRA est `auth.users.id`, indépendante de Stremio et des profils
  locaux de lecture.
- Aucun schéma CIRA ne peut stocker bibliothèque, historique, source, addon,
  position de lecture, IP, appareil ou session Stremio.
- La présence est désactivée par défaut. Les observateurs ne reçoivent qu'un
  état agrégé ; aucun `last_seen_at` n'existe.
- Les codes clairs ne sont jamais stockés. Seul leur SHA-256 normalisé existe
  au repos ; les pages web les transportent dans le fragment URL.
- Un blocage supprime la relation, les invitations directes communes et toute
  appartenance de groupe partagée. Une garde serveur empêche le retour
  indirect par lien ou par un tiers.
- La boîte sociale ne conserve qu'un `seen_at` par utilisateur et dérive les
  compteurs des demandes encore en attente.
- Les réponses refusées et les invitations de groupe consommées sont
  supprimées, sans journal social rémanent.
- Les demandes par handle utilisent un reçu aveugle de 24 heures : le
  demandeur ne peut distinguer une cible réelle, inconnue, personnelle ou
  bloquée avant que la personne réelle accepte explicitement.

## Modèle et opérations

Les 11 tables publiques sont `cira_profiles`, `cira_friendships`,
`cira_request_receipts`, `cira_blocks`, `cira_presence`, `cira_invitations`,
`cira_groups`, `cira_group_members`, `cira_group_invites`, `cira_group_links`
et `cira_inbox_state`. Le ledger `private.cira_rate_limits` est la douzième
table. La table de reçus n'est jamais directement lisible par les rôles API.

Les 42 RPC publiques sont `security definer`, utilisent un `search_path` vide,
dérivent le caller avec `auth.uid()` et ne sont jamais exécutables par `anon`.
Les tables de tokens, reçus aveugles, groupes et boîte sociale n'ont aucun
accès direct pour `authenticated`.

## Client et surfaces

- Repository typé : `src/lib/cira/`.
- Provider session/Realtime/présence : `src/lib/cira/provider.tsx`.
- Réglages : `src/views/settings/cira-panel.tsx` et
  `src/views/settings/cira-groups-card.tsx`.
- Deep links : `src/components/cira-invite-bridge.tsx` et
  `src/lib/deep-link.ts`.
- Pages publiques sans backend : `site/public/cira/invite.html` et
  `site/public/cira/group.html`.
- Traductions : `src/lib/i18n/locales/cira.ts`.

## Migrations

Les 11 fichiers `supabase/migrations/20260713*.sql` doivent être appliqués
strictement dans l'ordre. Les ajouts complets vont de
`20260713220000_cira_groups_schema.sql` à
`20260713270000_cira_pagination.sql`. La procédure d'installation et de mise à
niveau est détaillée dans `supabase/README.md`.

Ces migrations n'ont pas été appliquées à la production depuis cette branche :
aucun credential d'administration Supabase n'est présent dans le dépôt et le
déploiement reste un acte séparé, auditable.

## Validation automatisée

```bash
bash scripts/cira/db-test.sh
pnpm exec tsc -b
pnpm lint
pnpm test
pnpm build
git diff --check
```

Le harnais PostgreSQL applique toutes les migrations sur une instance 15
jetable et exécute 16 fichiers SQL de menace. Ils couvrent RLS, transitions,
blocs, présence, tokens, suppression de compte, Realtime, rôles, propriété,
groupes, invitations, blocage transversal, boîte sociale et pagination.

## Recette manuelle avant production

1. Utiliser deux comptes et deux appareils distincts.
2. Tester handle, demande, refus, annulation, acceptation et suppression.
3. Activer/désactiver la présence et vérifier la TTL après fermeture brutale.
4. Créer un groupe, promouvoir un admin, transférer la propriété et quitter.
5. Tester une invitation directe et un lien de groupe consommé une seule fois.
6. Vérifier qu'un blocage dissout tous les groupes partagés concernés.
7. Tester plus de 50 relations/membres et les actions « charger plus ».
8. Vérifier les pages web en LTR et en arabe RTL, sans token dans le réseau.
9. Confirmer que la session Stremio, VARA/VEYA, le player et le cast ne sont
   pas affectés.

## Limites opérationnelles

- Les parcours par token retournent leurs erreurs métier dans le résultat SQL,
  afin que les tentatives invalides soient comptées sans fuite d'existence.
- Windows et Linux doivent rester validés par GitHub Actions.
- Aucun test manuel multi-appareils ni migration Supabase de production n'est
  affirmé tant qu'ils n'ont pas été exécutés séparément.
