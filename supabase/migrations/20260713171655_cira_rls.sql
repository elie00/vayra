-- CIRA PR1 - migration 2/3: RLS, privileges, private helpers.
--
-- Access model:
--   * RLS enabled on all 5 public cira_ tables.
--   * anon: no access at all (all privileges revoked, no policy targets anon).
--   * authenticated: SELECT only, through restrictive policies; NO direct
--     INSERT/UPDATE/DELETE anywhere - all mutations go through RPCs.
--   * cira_invitations: no raw access at all (contains token_hash) - no grant,
--     no policy; only reachable through RPCs.
--   * Helpers used by policies live in schema `private` as SECURITY DEFINER
--     with search_path = '' and fully-qualified objects, so policy evaluation
--     cannot recurse into RLS and cannot be hijacked via search_path.

------------------------------------------------------------------------------
-- Privileges
-- Supabase default privileges normally grant broad access on new public
-- tables to anon/authenticated; revoke everything, then grant back the strict
-- minimum. service_role is intentionally left untouched (admin plane).
------------------------------------------------------------------------------
revoke all on table public.cira_profiles    from public, anon, authenticated;
revoke all on table public.cira_friendships from public, anon, authenticated;
revoke all on table public.cira_blocks      from public, anon, authenticated;
revoke all on table public.cira_presence    from public, anon, authenticated;
revoke all on table public.cira_invitations from public, anon, authenticated;
revoke all on table private.cira_rate_limits from public, anon, authenticated;

grant select on table public.cira_profiles    to authenticated;
grant select on table public.cira_friendships to authenticated;
grant select on table public.cira_blocks      to authenticated;
grant select on table public.cira_presence    to authenticated;
-- cira_invitations: no grant on purpose (token_hash must never be readable).
-- private.cira_rate_limits: no grant on purpose (never API-exposed).

-- Needed so `authenticated` can execute the policy helpers below.
-- USAGE alone grants no access to any object in the schema.
grant usage on schema private to authenticated;

------------------------------------------------------------------------------
-- Private policy helpers (SECURITY DEFINER: bypass RLS to avoid recursive
-- policy evaluation between cira_profiles / cira_friendships / cira_blocks).
--
-- Both helpers derive the CALLER identity internally from auth.uid() and take
-- only the OTHER side as an argument. Because they are SECURITY DEFINER they
-- bypass RLS, so a free two-uuid signature would let any authenticated user
-- probe the friendship/block relationship of ARBITRARY pairs (RLS bypass /
-- social-graph enumeration). Fixing auth.uid() as one side means a caller can
-- only ever probe pairs that include themselves - knowledge they are already
-- entitled to - which is exactly what the RLS policies below require.
------------------------------------------------------------------------------

-- True if any friendship row (pending or accepted) links the caller (auth.uid)
-- to p_other. Caller-scoped: cannot probe pairs the caller is not part of.
create function private.cira_pair_exists(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cira_friendships f
    where f.user_low = least(auth.uid(), p_other)
      and f.user_high = greatest(auth.uid(), p_other)
  );
$$;

-- True if the caller (auth.uid) has blocked p_blocked (directional).
-- Caller-scoped: cannot probe who other users have blocked.
create function private.cira_block_exists(p_blocked uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cira_blocks b
    where b.blocker_id = auth.uid()
      and b.blocked_id = p_blocked
  );
$$;

-- True if a block exists in either direction.
create function private.cira_any_block(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cira_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- Server-authoritative private-beta gate. raw_app_meta_data is writable only
-- through Supabase's admin plane, never by the authenticated user. Looking up
-- the auth row on every request also makes access revocation immediate instead
-- of waiting for a JWT refresh.
create function private.cira_beta_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and u.raw_app_meta_data ->> 'cira_beta' = 'true'
  );
$$;

revoke all on function private.cira_pair_exists(uuid)   from public, anon;
revoke all on function private.cira_block_exists(uuid)  from public, anon;
revoke all on function private.cira_any_block(uuid, uuid)    from public, anon;
revoke all on function private.cira_beta_access() from public, anon;
grant execute on function private.cira_pair_exists(uuid)   to authenticated;
grant execute on function private.cira_block_exists(uuid)  to authenticated;
grant execute on function private.cira_beta_access() to authenticated;
-- cira_any_block is only called from SECURITY DEFINER RPCs (owner privileges
-- apply inside them): no grant needed, and none given.

------------------------------------------------------------------------------
-- Private RPC helpers (never granted to API roles; only callable from within
-- the SECURITY DEFINER RPCs of migration 3).
------------------------------------------------------------------------------

-- Resolve and validate the caller. Also verifies the auth.users row still
-- exists: a JWT can remain valid for a while after account deletion.
create function private.cira_require_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_uid) then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not private.cira_beta_access() then
    raise exception 'BETA_ACCESS_REQUIRED';
  end if;
  return v_uid;
end;
$$;

-- All RPCs (except profile creation itself) also require a CIRA profile.
create function private.cira_require_profile(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.cira_profiles p where p.user_id = p_user_id) then
    raise exception 'PROFILE_REQUIRED';
  end if;
end;
$$;

-- Lock both profile rows of a pair in CANONICAL order (user_low first, then
-- user_high). Every pair mutation goes through this before checking blocks or
-- relations: prevents accept/block races and lock-order deadlocks.
create function private.cira_lock_pair(p_a uuid, p_b uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform 1 from public.cira_profiles where user_id = least(p_a, p_b) for update;
  perform 1 from public.cira_profiles where user_id = greatest(p_a, p_b) for update;
end;
$$;

-- Fixed-window rate limiting backed by private.cira_rate_limits.
-- Raises RATE_LIMITED when the counter exceeds p_limit for the current window.
-- Also prunes rows older than 1 hour (max retention).
--
-- Known v1 caveat (inherent to SQL-only RPCs, no Edge Function): when an RPC
-- later raises an error, the whole transaction - including this counter
-- increment - is rolled back, so only non-erroring calls are counted.
-- Primary defenses remain the 100-bit invitation tokens and generic
-- (non-erroring) responses of cira_send_request, which ARE counted.
create function private.cira_enforce_rate_limit(
  p_user_id uuid,
  p_action  text,
  p_limit   integer,
  p_window  interval
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  delete from private.cira_rate_limits
  where window_start < now() - interval '1 hour';

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / extract(epoch from p_window))
    * extract(epoch from p_window)
  );

  insert into private.cira_rate_limits as rl (user_id, action, window_start, count)
  values (p_user_id, p_action, v_window_start, 1)
  on conflict (user_id, action, window_start)
  do update set count = rl.count + 1
  returning rl.count into v_count;

  if v_count > p_limit then
    raise exception 'RATE_LIMITED';
  end if;
end;
$$;

-- Invitation-code normalisation: case and dashes (any non-alphanumeric) are
-- ignored. Both creation and redemption hash the SAME normalised form.
create function private.cira_normalize_invite_code(p_code text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select regexp_replace(upper(coalesce(p_code, '')), '[^0-9A-Z]', '', 'g');
$$;

-- SHA-256 of the normalised code (sha256() is core since PG11).
create function private.cira_hash_invite_code(p_code text)
returns bytea
language sql
immutable
security definer
set search_path = ''
as $$
  select sha256(convert_to(private.cira_normalize_invite_code(p_code), 'UTF8'));
$$;

-- 20-character secret over the Crockford base32 alphabet (no I, L, O, U):
-- 20 x 5 bits = 100 bits of entropy, generated server-side from
-- gen_random_uuid() (core CSPRNG). The version/variant bytes of each UUID are
-- discarded so every consumed byte is fully random (uniform modulo 32).
create function private.cira_generate_invite_secret()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := ''::bytea;
  v_uuid  bytea;
  v_out   text := '';
  i integer;
begin
  while octet_length(v_bytes) < 20 loop
    v_uuid := uuid_send(gen_random_uuid());
    -- Keep bytes 0-5, 7 and 9-15 (0-based): drop the version nibble byte (6)
    -- and the variant bits byte (8).
    v_bytes := v_bytes
      || substring(v_uuid from 1 for 6)
      || substring(v_uuid from 8 for 1)
      || substring(v_uuid from 10 for 7);
  end loop;
  for i in 0..19 loop
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_out;
end;
$$;

revoke all on function private.cira_require_uid()                                       from public, anon;
revoke all on function private.cira_require_profile(uuid)                               from public, anon;
revoke all on function private.cira_lock_pair(uuid, uuid)                               from public, anon;
revoke all on function private.cira_enforce_rate_limit(uuid, text, integer, interval)   from public, anon;
revoke all on function private.cira_normalize_invite_code(text)                         from public, anon;
revoke all on function private.cira_hash_invite_code(text)                              from public, anon;
revoke all on function private.cira_generate_invite_secret()                            from public, anon;

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------
alter table public.cira_profiles     enable row level security;
alter table public.cira_friendships  enable row level security;
alter table public.cira_blocks       enable row level security;
alter table public.cira_presence     enable row level security;
alter table public.cira_invitations  enable row level security;
alter table private.cira_rate_limits enable row level security;

-- Profiles: visible to oneself, to the counterpart of a pending/accepted
-- relation, and to people the viewer has blocked (so the block list can be
-- rendered). Nothing else - no browsing, no search.
create policy cira_profiles_select on public.cira_profiles
  for select
  to authenticated
  using (
    private.cira_beta_access()
    and (
      user_id = (select auth.uid())
      or private.cira_pair_exists(user_id)
      or private.cira_block_exists(user_id)
    )
  );

-- Friendships: only participants can see the row.
create policy cira_friendships_select on public.cira_friendships
  for select
  to authenticated
  using (
    private.cira_beta_access()
    and (
      requester_id = (select auth.uid())
      or addressee_id = (select auth.uid())
    )
  );

-- Blocks: a user only sees the blocks they created.
create policy cira_blocks_select on public.cira_blocks
  for select
  to authenticated
  using (private.cira_beta_access() and blocker_id = (select auth.uid()));

-- Presence: raw rows are visible only to their owner. Relations see presence
-- exclusively through the cira_list_relationships() aggregation.
create policy cira_presence_select on public.cira_presence
  for select
  to authenticated
  using (private.cira_beta_access() and user_id = (select auth.uid()));

-- cira_invitations: NO policy and NO grant -> no raw access for anyone
-- through the API. private.cira_rate_limits: same.
-- No INSERT/UPDATE/DELETE policy anywhere: direct DML is impossible for
-- authenticated (and anon has no privilege at all).
