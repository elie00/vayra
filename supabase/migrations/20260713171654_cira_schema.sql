-- CIRA PR1 - migration 1/3: schema, constraints, indexes.
--
-- Defensive rules (validated by project owner):
--   * Only cira_-prefixed objects are created (plus `create schema if not exists private`).
--   * Plain CREATE everywhere: any collision with a pre-existing object must fail loudly.
--   * No existing object is altered.
--   * gen_random_uuid() is core since PG13 - no extension is created.
--
-- CIRA identity = auth.users.id (global Supabase account), never local profiles,
-- never Stremio identity, never Together/Discord/player presence.

-- Private schema for non-API helpers and the rate-limit ledger.
-- (IF NOT EXISTS is the single allowed exception: the schema may pre-exist.)
create schema if not exists private;

------------------------------------------------------------------------------
-- public.cira_profiles
------------------------------------------------------------------------------
create table public.cira_profiles (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  handle          text not null,
  display_name    text not null,
  -- VAYRA avatar identifier only. The whitelist format structurally excludes
  -- ':' and '/', so external URLs ('://') and data URIs ('data:') are impossible.
  avatar_key      text,
  presence_opt_in boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint cira_profiles_handle_format
    check (handle = lower(handle) and handle ~ '^[a-z0-9][a-z0-9_]{2,23}$'),
  constraint cira_profiles_display_name_length
    check (char_length(display_name) between 1 and 48),
  -- Reject HTML brackets and Unicode control characters (XSS/injection hardening).
  constraint cira_profiles_display_name_clean
    check (display_name !~ '[<>[:cntrl:]]'),
  constraint cira_profiles_avatar_key_format
    check (avatar_key is null or avatar_key ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$')
);

create unique index cira_profiles_handle_key on public.cira_profiles (handle);

------------------------------------------------------------------------------
-- public.cira_friendships
-- One row per pair. Declines / cancellations / removals DELETE the row
-- (data minimisation): no history of refused or removed relations is kept.
------------------------------------------------------------------------------
create table public.cira_friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  addressee_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  -- Canonical pair columns: uniqueness and canonical locking order.
  user_low     uuid generated always as (least(requester_id, addressee_id)) stored,
  user_high    uuid generated always as (greatest(requester_id, addressee_id)) stored,
  status       text not null,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  updated_at   timestamptz not null default now(),

  constraint cira_friendships_status_valid
    check (status in ('pending', 'accepted')),
  constraint cira_friendships_no_self
    check (requester_id <> addressee_id),
  constraint cira_friendships_responded_consistent
    check ((status = 'pending' and responded_at is null)
        or (status = 'accepted' and responded_at is not null))
);

create unique index cira_friendships_pair_key
  on public.cira_friendships (user_low, user_high);
create index cira_friendships_requester_status_idx
  on public.cira_friendships (requester_id, status);
create index cira_friendships_addressee_status_idx
  on public.cira_friendships (addressee_id, status);

------------------------------------------------------------------------------
-- public.cira_blocks
------------------------------------------------------------------------------
create table public.cira_blocks (
  blocker_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  blocked_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint cira_blocks_pkey primary key (blocker_id, blocked_id),
  constraint cira_blocks_no_self check (blocker_id <> blocked_id)
);

create index cira_blocks_blocked_idx on public.cira_blocks (blocked_id);

------------------------------------------------------------------------------
-- public.cira_presence
-- One row per app session. 'offline' is computed (no unexpired session).
-- Whitelist schema: NO room, media, IP, device, position or last-seen column.
------------------------------------------------------------------------------
create table public.cira_presence (
  user_id    uuid not null references public.cira_profiles (user_id) on delete cascade,
  session_id uuid not null,
  state      text not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint cira_presence_pkey primary key (user_id, session_id),
  constraint cira_presence_state_valid check (state in ('online', 'in_vara')),
  -- Client heartbeats every 30 s with a 90 s TTL; the schema hard-caps at 120 s.
  constraint cira_presence_ttl
    check (expires_at > updated_at and expires_at - updated_at <= interval '120 seconds')
);

create index cira_presence_expires_idx on public.cira_presence (expires_at);
create index cira_presence_user_expires_idx on public.cira_presence (user_id, expires_at desc);

------------------------------------------------------------------------------
-- public.cira_invitations
-- Only SHA-256 of the normalised token is stored; the clear token is returned
-- exactly once by cira_create_invitation and never logged.
-- The identity of a decliner is NOT stored (only outcome = 'declined').
------------------------------------------------------------------------------
create table public.cira_invitations (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.cira_profiles (user_id) on delete cascade,
  token_hash  bytea not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  outcome     text,
  revoked_at  timestamptz,

  constraint cira_invitations_outcome_valid
    check (outcome is null or outcome in ('accepted', 'declined')),
  -- Default TTL is 15 min (enforced by RPC); hard cap 30 min.
  constraint cira_invitations_ttl
    check (expires_at > created_at and expires_at - created_at <= interval '30 minutes'),
  constraint cira_invitations_outcome_iff_consumed
    check ((consumed_at is null) = (outcome is null)),
  constraint cira_invitations_consumed_xor_revoked
    check (consumed_at is null or revoked_at is null)
);

create unique index cira_invitations_token_hash_key
  on public.cira_invitations (token_hash);
create index cira_invitations_creator_expires_idx
  on public.cira_invitations (creator_id, expires_at desc);

------------------------------------------------------------------------------
-- private.cira_rate_limits
-- Fixed-window counters. No IP, never exposed through the API (schema private
-- is not served by PostgREST). Retention <= 1 h, enforced opportunistically by
-- private.cira_enforce_rate_limit().
-- Limited actions: invitation creation, code redemption attempts, handle
-- checks (profile upsert), direct friend requests.
------------------------------------------------------------------------------
create table private.cira_rate_limits (
  user_id      uuid not null references auth.users (id) on delete cascade,
  action       text not null,
  window_start timestamptz not null,
  count        integer not null default 0,

  constraint cira_rate_limits_pkey primary key (user_id, action, window_start),
  constraint cira_rate_limits_count_positive check (count >= 0)
);
