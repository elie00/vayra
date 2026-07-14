-- CIRA tests 00 - structural audit.
-- RLS flags, SECURITY DEFINER + search_path on every function, privileges
-- (anon = nothing, authenticated = no direct DML, no raw invitations/rate
-- limits), the 9 required indexes, and the column whitelists that make media
-- leaks / decliner tracking structurally impossible.
\echo '=== 00_audit ==='

-- RLS enabled on all CIRA tables (11 public + private.cira_rate_limits).
do $do$
declare
  n integer;
begin
  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where c.relname like 'cira\_%' and c.relkind = 'r'
    and ns.nspname in ('public', 'private');
  if n <> 12 then
    raise exception 'TEST_FAILED: expected 12 cira_ tables, found %', n;
  end if;

  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where c.relname like 'cira\_%' and c.relkind = 'r'
    and ns.nspname in ('public', 'private')
    and c.relrowsecurity;
  if n <> 12 then
    raise exception 'TEST_FAILED: RLS is not enabled on all 12 cira_ tables (only %)', n;
  end if;
end;
$do$;

-- Realtime and group integrity triggers are explicit and reviewable.
do $do$
declare
  n integer;
begin
  select count(*) into n from pg_trigger
  where tgname like 'cira\_%' and not tgisinternal;
  if n <> 14 then
    raise exception 'TEST_FAILED: expected 14 CIRA triggers, found %', n;
  end if;
end;
$do$;

-- Public RPCs: SECURITY DEFINER, pinned search_path, anon cannot
-- execute, authenticated can.
do $do$
declare
  r record;
  n integer := 0;
begin
  for r in
    select p.oid, p.proname, p.prosecdef,
           coalesce(array_to_string(p.proconfig, ','), '') as cfg
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname like 'cira\_%'
  loop
    n := n + 1;
    if not r.prosecdef then
      raise exception 'TEST_FAILED: public.% is not SECURITY DEFINER', r.proname;
    end if;
    if r.cfg not like '%search_path=%' then
      raise exception 'TEST_FAILED: public.% does not pin search_path', r.proname;
    end if;
    if has_function_privilege('anon', r.oid, 'execute') then
      raise exception 'TEST_FAILED: anon can execute public.%', r.proname;
    end if;
    if not has_function_privilege('authenticated', r.oid, 'execute') then
      raise exception 'TEST_FAILED: authenticated cannot execute public.%', r.proname;
    end if;
  end loop;
  if n <> 45 then
    raise exception 'TEST_FAILED: expected 45 public cira_ RPCs, found %', n;
  end if;
end;
$do$;

-- Private helpers: SECURITY DEFINER, pinned search_path, never executable by
-- anon.
do $do$
declare
  r record;
begin
  for r in
    select p.oid, p.proname, p.prosecdef,
           coalesce(array_to_string(p.proconfig, ','), '') as cfg
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'private' and p.proname like 'cira\_%'
  loop
    if not r.prosecdef then
      raise exception 'TEST_FAILED: private.% is not SECURITY DEFINER', r.proname;
    end if;
    if r.cfg not like '%search_path=%' then
      raise exception 'TEST_FAILED: private.% does not pin search_path', r.proname;
    end if;
    if has_function_privilege('anon', r.oid, 'execute') then
      raise exception 'TEST_FAILED: anon can execute private.%', r.proname;
    end if;
    -- Exposure surface: the ONLY private helpers authenticated may execute are
    -- the two caller-scoped policy helpers and the argument-free beta gate
    -- referenced by SELECT policies. Any other private.cira_* reachable by authenticated (e.g.
    -- an arbitrary-pair probe helper) is a social-graph enumeration hole.
    if has_function_privilege('authenticated', r.oid, 'execute')
       and r.proname not in ('cira_pair_exists', 'cira_block_exists', 'cira_beta_access') then
      raise exception 'TEST_FAILED: authenticated can execute unexpected private helper %', r.proname;
    end if;
  end loop;
end;
$do$;

-- Table privileges: anon holds nothing at all; authenticated never holds
-- direct DML; invitations and rate limits are not even selectable.
do $do$
declare
  r record;
  priv text;
begin
  for r in
    select ns.nspname, c.relname, c.oid
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where c.relname like 'cira\_%' and c.relkind = 'r'
      and ns.nspname in ('public', 'private')
  loop
    foreach priv in array array['select', 'insert', 'update', 'delete'] loop
      if has_table_privilege('anon', r.oid, priv) then
        raise exception 'TEST_FAILED: anon has % on %.%', priv, r.nspname, r.relname;
      end if;
    end loop;
    foreach priv in array array['insert', 'update', 'delete'] loop
      if has_table_privilege('authenticated', r.oid, priv) then
        raise exception 'TEST_FAILED: authenticated has direct % on %.%', priv, r.nspname, r.relname;
      end if;
    end loop;
  end loop;

  if has_table_privilege('authenticated', 'public.cira_invitations', 'select') then
    raise exception 'TEST_FAILED: authenticated can select cira_invitations (token_hash!)';
  end if;
  if has_table_privilege('authenticated', 'public.cira_request_receipts', 'select') then
    raise exception 'TEST_FAILED: authenticated can read receipt friendship links';
  end if;
  if has_table_privilege('authenticated', 'private.cira_rate_limits', 'select') then
    raise exception 'TEST_FAILED: authenticated can select cira_rate_limits';
  end if;
end;
$do$;

-- Required privacy, lookup and uniqueness indexes.
do $do$
declare
  idx text;
begin
  foreach idx in array array[
    'cira_profiles_handle_key',
    'cira_friendships_requester_status_idx',
    'cira_friendships_addressee_status_idx',
    'cira_friendships_pair_key',
    'cira_request_receipts_requester_handle_key',
    'cira_request_receipts_friendship_key',
    'cira_request_receipts_requester_expires_idx',
    'cira_blocks_blocked_idx',
    'cira_presence_expires_idx',
    'cira_presence_user_expires_idx',
    'cira_invitations_token_hash_key',
    'cira_invitations_creator_expires_idx',
    'cira_groups_owner_idx',
    'cira_group_members_user_idx',
    'cira_group_members_one_owner',
    'cira_group_invites_target_key',
    'cira_group_invites_invitee_idx',
    'cira_group_links_token_hash_key',
    'cira_group_links_group_expires_idx'
  ] loop
    if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = idx) then
      raise exception 'TEST_FAILED: missing index %', idx;
    end if;
  end loop;

  if (select count(*) from pg_indexes
      where schemaname = 'public'
        and indexname in ('cira_profiles_handle_key',
                          'cira_friendships_pair_key',
                          'cira_invitations_token_hash_key')
        and indexdef like 'CREATE UNIQUE INDEX%') <> 3 then
    raise exception 'TEST_FAILED: handle / pair / token_hash indexes must be UNIQUE';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'cira_group_members_one_owner'
      and indexdef like 'CREATE UNIQUE INDEX%'
      and indexdef like '%WHERE (role = ''owner''::text)%'
  ) then
    raise exception 'TEST_FAILED: group membership must enforce one owner at most';
  end if;
end;
$do$;

-- Whitelist schema: presence carries NO room/media/IP/device/last-seen
-- column, and invitations carry NO column that could store who declined.
do $do$
declare
  cols text[];
begin
  select array_agg(attname order by attnum) into cols
  from pg_attribute
  where attrelid = 'public.cira_presence'::regclass
    and attnum > 0 and not attisdropped;
  if cols <> array['user_id', 'session_id', 'state', 'updated_at', 'expires_at'] then
    raise exception 'TEST_FAILED: unexpected cira_presence columns: %', cols;
  end if;

  select array_agg(attname order by attnum) into cols
  from pg_attribute
  where attrelid = 'public.cira_invitations'::regclass
    and attnum > 0 and not attisdropped;
  if cols <> array['id', 'creator_id', 'token_hash', 'created_at', 'expires_at',
                   'consumed_at', 'outcome', 'revoked_at'] then
    raise exception 'TEST_FAILED: unexpected cira_invitations columns: %', cols;
  end if;

  select array_agg(attname order by attnum) into cols
  from pg_attribute
  where attrelid = 'public.cira_request_receipts'::regclass
    and attnum > 0 and not attisdropped;
  if cols <> array['id', 'requester_id', 'requested_handle', 'friendship_id',
                   'created_at', 'expires_at'] then
    raise exception 'TEST_FAILED: unexpected cira_request_receipts columns: %', cols;
  end if;

  select array_agg(attname order by attnum) into cols
  from pg_attribute
  where attrelid = 'public.cira_groups'::regclass
    and attnum > 0 and not attisdropped;
  if cols <> array['id', 'owner_id', 'name', 'description', 'avatar_key',
                   'max_members', 'created_at', 'updated_at', 'archived_at'] then
    raise exception 'TEST_FAILED: unexpected cira_groups columns: %', cols;
  end if;
end;
$do$;

\echo '00_audit OK'
