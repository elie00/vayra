# CIRA v1 — rapport de livraison consolidé

> Rapport historique du premier socle. Il est remplacé pour l'état courant
> par [`cira-complete-report.md`](./cira-complete-report.md).

**Date** : 2026-07-13
**Branche** : `fix/cira-presence-expiry`
**Base** : `main` à `6dfcf15`

## Périmètre livré

CIRA v1 permet à un compte VAYRA authentifié par Supabase de :

- créer et modifier un profil minimal avec handle unique et nom affiché ;
- envoyer une demande par handle, puis accepter, refuser ou annuler ;
- retirer une relation acceptée ;
- bloquer une relation ou une demande entrante, consulter ses blocages et
  débloquer une personne ;
- créer, copier, révoquer, prévisualiser, accepter ou refuser une invitation
  temporaire à usage unique ;
- partager volontairement une présence limitée à `online` ou `in_vara`, avec
  `offline` calculé par expiration ;
- recevoir les invalidations sociales par un canal Realtime privé, sans
  donnée sociale dans le payload.

Le panneau se trouve dans **Réglages → CIRA**. La page publique
`https://vayra.eybo.tech/cira/invite#t=…` transmet le code au deep link
`vayra://cira/invite#t=…` et propose la copie du code en secours.

## Garanties privacy et sécurité

- L'identité CIRA est exclusivement `auth.users.id`, jamais le profil local,
  l'identité Stremio ou l'identité VARA/VEYA.
- Les tables CIRA ne contiennent aucune bibliothèque, source, extension,
  position de lecture, adresse IP, information d'appareil ou historique.
- La présence est désactivée par défaut. La désactivation supprime toutes les
  sessions immédiatement ; la TTL serveur couvre les fermetures brutales.
- Les relations voient uniquement un agrégat `offline`, `online` ou
  `in_vara`, jamais les sessions brutes ni un `last_seen_at`.
- Les invitations utilisent 100 bits d'entropie. Seul le SHA-256 du code
  normalisé est stocké ; le code clair est renvoyé une seule fois.
- Le code reste dans le fragment URL : il n'est pas envoyé au serveur web,
  placé dans une query string ou transporté par Realtime.
- Les échecs d'invitation inconnue, expirée, consommée, révoquée, propre ou
  bloquée sont regroupés sous `INVITATION_UNAVAILABLE`.
- Un code reçu sous un compte ne survit pas à une déconnexion ou à un
  changement de compte. Un code reçu déconnecté peut être revendiqué par le
  compte qui se connecte ensuite.
- RLS est active sur toutes les tables publiques CIRA. Les mutations directes
  sont interdites aux rôles API et passent par 19 RPC `security definer` à
  `search_path = ''`.

## Cycle de vie client

- Heartbeat producteur toutes les 45 secondes, TTL SQL de 90 secondes et
  limite structurelle de 120 secondes.
- Relecture observateur toutes les 95 secondes uniquement lorsqu'au moins une
  relation est affichée active. Cela évite un statut en ligne figé après
  expiration sans produire de polling lorsque tout le monde est hors ligne.
- Horloge locale d'invitation toutes les 30 secondes, sans requête réseau.
- Invalidation Realtime coalescée à 250 ms et désabonnement explicite.
- Les erreurs de chargement initial affichent un état réessayable sans faire
  passer un profil existant pour un profil absent.

## Interfaces et langues

Toutes les chaînes CIRA de l'application sont disponibles en anglais,
français, allemand, espagnol, italien, portugais et arabe. La parité des clés
et des variables d'interpolation est testée. La page web d'invitation choisit
la langue du navigateur, utilise l'anglais en secours et active `dir=rtl` pour
l'arabe.

## Migrations

1. `20260713171654_cira_schema.sql` — tables, contraintes et index ;
2. `20260713171655_cira_rls.sql` — privilèges, helpers privés et RLS ;
3. `20260713171656_cira_rpc.sql` — 19 RPC transactionnelles ;
4. `20260713200000_cira_realtime.sql` — invalidations et policy Realtime ;
5. `20260713210000_cira_invitation_hardening.sql` — rejet de l'auto-preview
   et du refus d'invitation à travers un blocage.

La procédure installation neuve / mise à niveau se trouve dans
`supabase/README.md`. Aucune migration n'a été appliquée à Supabase production
depuis cette branche : aucun credential d'administration n'est disponible
localement et ce geste reste volontairement séparé du code.

## Validations disponibles

```bash
bash scripts/cira/db-test.sh
pnpm exec tsc -b
pnpm lint
pnpm test
PATH="$HOME/.cargo/bin:$PATH" pnpm build
git diff --check
```

La page statique peut être servie depuis `site/public` avec n'importe quel
serveur HTTP local. Vérifications manuelles recommandées :

1. ouvrir un lien valide et vérifier le bouton `vayra://cira/invite#t=…` ;
2. ouvrir un fragment absent, mal encodé ou au mauvais alphabet et vérifier
   l'état « invitation invalide » ;
3. tester la copie du code et le lien de téléchargement ;
4. tester au moins une langue LTR et l'arabe RTL ;
5. vérifier dans l'onglet réseau que le fragment/token n'apparaît dans aucune
   requête.

## Durcissement ultérieur

La branche complète retourne désormais les erreurs métier des parcours par
token dans le résultat SQL. Les tentatives invalides sont donc comptées et
committées sans révéler si le token a existé.
