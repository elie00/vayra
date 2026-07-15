# VAYRA Private Beta — runbook opérateur

Ce runbook complète `docs/private-beta-launch.md`. Toutes les actions sont à
effectuer par un opérateur autorisé dans Supabase. Ne jamais utiliser une clé
`service_role` dans le client, dans un ticket ou dans un log.

## 1. Ajouter un compte à la bêta

1. Demander à la personne de créer elle-même son compte email VAYRA.
2. Dans Auth > Users, identifier l’utilisateur et confirmer son UUID exact.
3. Modifier **app metadata**, jamais `user_metadata`, avec `cira_beta: true`.
4. Vérifier qu’une seule ligne a été affectée.
5. Demander à l’utilisateur de cliquer **Actualiser l’accès bêta** dans CIRA.

Équivalent SQL réservé à l’éditeur SQL d’administration :

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('cira_beta', true)
where id = '<UUID_CONFIRME>'::uuid
returning id, raw_app_meta_data -> 'cira_beta' as cira_beta;
```

Zéro ligne ou plusieurs lignes est un incident opérateur : arrêter la procédure.

## 2. Retirer un compte de la bêta

1. Retirer le flag pour l’UUID exact :

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'cira_beta'
where id = '<UUID_CONFIRME>'::uuid
returning id, raw_app_meta_data ? 'cira_beta' as still_present;
```

2. Révoquer les sessions via l’outil Auth Admin/Dashboard. Le retrait du flag ne
   rend pas instantanément invalide un JWT déjà émis.
3. Vérifier avec un nouveau JWT que CIRA et VARA reviennent à `restricted`.
4. Pour un incident actif, fermer/révoquer les rooms et liens concernés avec les
   opérations produit existantes ; ne jamais publier un topic Realtime.

## 3. Refresh JWT

Chemin normal : bouton **Actualiser l’accès bêta**, qui appelle
`supabase.auth.refreshSession()`. En échec, déconnexion/reconnexion par email.
Interdit : copier un JWT, modifier le stockage local ou injecter un token dans la
console.

## 4. Incident et support

### Triage sans fuite

Demander uniquement : version VAYRA, code d’erreur visible, étape du parcours et
heure approximative. Ne jamais demander contenu, URL, source, addon, info-hash,
progression, bibliothèque, chemin, IP, appareil, session Stremio, topic ou token.

Le testeur peut consulter, copier ou effacer le diagnostic local. Il doit
l’inspecter avant tout partage. Les captures/vidéos sont refusées si elles
montrent du contenu regardé, une source, un compte ou un chemin local.

### Sévérités

- **P0 privacy** : donnée interdite observée hors appareil ou dans un log partagé —
  geler les invitations, préserver uniquement les preuves redacted, révoquer les
  accès nécessaires et préparer un rollback.
- **P1 access** : un compte retiré garde un accès avec un JWT renouvelé — bloquer
  l’élargissement de bêta et auditer le gate/RLS.
- **P1 room** : admission non autorisée, blocage contourné ou topic réutilisé —
  fermer la room, révoquer les liens, arrêter la bêta concernée.
- **P2 UX** : parcours, QR, refresh ou message d’erreur bloquant — garder la bêta
  limitée et corriger atomiquement.

## 5. Rollback client

Ce chantier ne contient aucune migration. Rollback ciblé avec `git revert`, du
plus récent au plus ancien si nécessaire :

```text
932b821 fix(privacy): clear beta progress on sign-out
283fe27 fix(privacy): keep beta diagnostics local
f3e5c8e feat(i18n): register private beta launch copy
39b98db feat(beta): add private room recovery guidance
00ee699 feat(beta): guide the first private watch room
4a7a212 feat(beta): track privacy-safe launch progress
103365e feat(beta): refresh invited account access
1ba96f2 fix(privacy): make beta diagnostics explicitly safe
```

Après revert : `pnpm exec tsc -b`, `pnpm lint`, `pnpm test`, `pnpm build`, puis
recette du gate et d’une room existante. Ne jamais rollbacker les migrations
CIRA/VARA pour un défaut exclusivement client.

## 6. Supprimer un compte de test

1. Retirer `cira_beta` et révoquer toutes les sessions.
2. Fermer les rooms/liens actifs du compte.
3. Supprimer l’utilisateur via Auth Admin > Delete user, après double
   confirmation de l’UUID. Les FK CIRA partent de `auth.users(id) on delete
   cascade` (`20260713171654_cira_schema.sql`).
4. Vérifier l’absence du profil :

```sql
select not exists (
  select 1 from public.cira_profiles where user_id = '<UUID_CONFIRME>'::uuid
) as profile_deleted;
```

5. Sur l’appareil de test, se déconnecter puis effacer les données de
   l’application si l’appareil doit être réaffecté. La déconnexion supprime déjà
   les flags du guide bêta ; elle ne doit pas supprimer l’historique personnel
   local sans décision explicite du testeur.

## 7. Checklist de sortie

### PASS

- gate ajouté/retiré et JWT renouvelé réellement ;
- recette deux comptes desktop + Android ;
- profil, handle exact/QR, relation, groupe, VARA, transfert et sortie réussis ;
- aucun champ interdit dans réseau, logs ou diagnostic ;
- clavier, lecteur d’écran, RTL, stockage indisponible et erreurs testés ;
- politique de conservation du support manuel confirmée.

### PASS AVEC LIMITES

- logiciel et tests automatisés verts, mais une plateforme ou la rétention du
  support manuel attend encore une preuve opérateur.

### BLOQUÉ

- fuite privacy ; accès après révocation avec JWT neuf ; contournement de
  blocage/RLS ; recette réelle impossible ; modification involontaire du player,
  cast, Stremio ou protocole.
