-- CIRA tests 02 - full RLS / privilege matrix.
-- anon: zero access (tables + RPCs). authenticated: SELECT strictly scoped,
-- no direct INSERT/UPDATE/DELETE anywhere, no raw access to invitations or
-- rate limits. Uses A (02a1), B (02b2), C (02c3) with a pending A->B pair.
\echo '=== 02_rls ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000002a1'),
  ('00000000-0000-4000-8000-0000000002b2'),
  ('00000000-0000-4000-8000-0000000002c3');

-- Fixtures through the real RPCs.
do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000002a1');
  perform public.cira_upsert_profile('f02_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000002b2');
  perform public.cira_upsert_profile('f02_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000002c3');
  perform public.cira_upsert_profile('f02_carol', 'Carol');
  perform test.login('00000000-0000-4000-8000-0000000002a1');
  perform public.cira_send_request('f02_bob');
end;
$do$;

-- One raw presence row for A (inserted by the superuser: valid fixture).
insert into public.cira_presence (user_id, session_id, state, expires_at)
values ('00000000-0000-4000-8000-0000000002a1', gen_random_uuid(), 'online',
        now() + interval '90 seconds');

-- anon: no table access at all, no RPC execution.
do $do$
declare
  t text;
begin
  perform test.login_anon();
  foreach t in array array[
    'public.cira_profiles', 'public.cira_friendships', 'public.cira_blocks',
    'public.cira_presence', 'public.cira_invitations', 'private.cira_rate_limits'
  ] loop
    begin
      execute 'select count(*) from ' || t;
      raise exception 'TEST_FAILED: anon can select from %', t;
    exception
      when insufficient_privilege then null;
    end;
  end loop;

  begin
    perform public.cira_upsert_profile('f02_anon', 'Anon');
    raise exception 'TEST_FAILED: anon can execute cira_upsert_profile';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.cira_list_relationships();
    raise exception 'TEST_FAILED: anon can execute cira_list_relationships';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform private.cira_generate_invite_secret();
    raise exception 'TEST_FAILED: anon can execute private.cira_generate_invite_secret';
  exception
    when insufficient_privilege then null;
  end;
end;
$do$;

-- authenticated: every direct DML statement is denied (42501), on every
-- table, including the ones the user could SELECT.
do $do$
declare
  rec record;
begin
  perform test.login('00000000-0000-4000-8000-0000000002a1');
  for rec in
    select * from (values
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000002a1', 'f02_hack', 'H')$q$),
      ($q$update public.cira_profiles set display_name = 'Hacked' where user_id = '00000000-0000-4000-8000-0000000002a1'$q$),
      ($q$delete from public.cira_profiles where user_id = '00000000-0000-4000-8000-0000000002a1'$q$),
      ($q$insert into public.cira_friendships (requester_id, addressee_id, status) values ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002c3', 'pending')$q$),
      ($q$update public.cira_friendships set status = 'accepted', responded_at = now()$q$),
      ($q$delete from public.cira_friendships$q$),
      ($q$insert into public.cira_blocks (blocker_id, blocked_id) values ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002c3')$q$),
      ($q$update public.cira_blocks set created_at = now()$q$),
      ($q$delete from public.cira_blocks$q$),
      ($q$insert into public.cira_presence (user_id, session_id, state, expires_at) values ('00000000-0000-4000-8000-0000000002a1', gen_random_uuid(), 'online', now() + interval '90 seconds')$q$),
      ($q$update public.cira_presence set state = 'in_vara'$q$),
      ($q$delete from public.cira_presence$q$),
      ($q$select count(*) from public.cira_invitations$q$),
      ($q$insert into public.cira_invitations (creator_id, token_hash, expires_at) values ('00000000-0000-4000-8000-0000000002a1', sha256('h'::bytea), now() + interval '15 minutes')$q$),
      ($q$update public.cira_invitations set revoked_at = now()$q$),
      ($q$delete from public.cira_invitations$q$),
      ($q$select count(*) from private.cira_rate_limits$q$),
      ($q$insert into private.cira_rate_limits (user_id, action, window_start, count) values ('00000000-0000-4000-8000-0000000002a1', 'x', now(), 1)$q$),
      ($q$update private.cira_rate_limits set count = 0$q$),
      ($q$delete from private.cira_rate_limits$q$)
    ) as t(stmt)
  loop
    begin
      execute rec.stmt;
      raise exception 'TEST_FAILED: direct DML/read allowed: %', rec.stmt;
    exception
      when insufficient_privilege then null;
    end;
  end loop;
end;
$do$;

-- SELECT visibility matrix.
do $do$
declare
  n integer;
begin
  -- A sees itself + counterpart B, not C; sees the pending pair; sees only
  -- its own presence rows.
  perform test.login('00000000-0000-4000-8000-0000000002a1');
  select count(*) into n from public.cira_profiles;
  if n <> 2 then raise exception 'TEST_FAILED: A sees % profiles (expected 2: self + counterpart)', n; end if;
  select count(*) into n from public.cira_profiles where user_id = '00000000-0000-4000-8000-0000000002c3';
  if n <> 0 then raise exception 'TEST_FAILED: A can see stranger C profile'; end if;
  select count(*) into n from public.cira_friendships;
  if n <> 1 then raise exception 'TEST_FAILED: A sees % friendships (expected 1)', n; end if;
  select count(*) into n from public.cira_presence;
  if n <> 1 then raise exception 'TEST_FAILED: A sees % presence rows (expected 1: own)', n; end if;

  -- B (counterpart) sees A and itself.
  perform test.login('00000000-0000-4000-8000-0000000002b2');
  select count(*) into n from public.cira_profiles;
  if n <> 2 then raise exception 'TEST_FAILED: B sees % profiles (expected 2)', n; end if;
  select count(*) into n from public.cira_friendships;
  if n <> 1 then raise exception 'TEST_FAILED: B sees % friendships (expected 1)', n; end if;
  select count(*) into n from public.cira_presence;
  if n <> 0 then raise exception 'TEST_FAILED: B can read raw presence rows of A'; end if;

  -- C (stranger) sees only itself, no pair, no presence, no blocks.
  perform test.login('00000000-0000-4000-8000-0000000002c3');
  select count(*) into n from public.cira_profiles;
  if n <> 1 then raise exception 'TEST_FAILED: stranger C sees % profiles (expected 1: self)', n; end if;
  select count(*) into n from public.cira_friendships;
  if n <> 0 then raise exception 'TEST_FAILED: stranger C sees % friendships (expected 0)', n; end if;
  select count(*) into n from public.cira_presence;
  if n <> 0 then raise exception 'TEST_FAILED: stranger C sees % presence rows (expected 0)', n; end if;
  select count(*) into n from public.cira_blocks;
  if n <> 0 then raise exception 'TEST_FAILED: stranger C sees % blocks (expected 0)', n; end if;
end;
$do$;

-- Helper-probe regression (finding: RLS bypass / social-graph & block
-- enumeration via the SECURITY DEFINER policy helpers). The helpers are now
-- CALLER-SCOPED (single argument, caller = auth.uid()), so a third party can
-- no longer probe the friendship/block state of a pair it is not part of - the
-- arbitrary two-uuid probe that leaked the whole graph is structurally gone.
do $do$
begin
  -- Stranger C cannot learn that A and B are related (its only probes are
  -- C-vs-someone, and C has no relations).
  perform test.login('00000000-0000-4000-8000-0000000002c3');
  if private.cira_pair_exists('00000000-0000-4000-8000-0000000002a1') then
    raise exception 'TEST_FAILED: stranger C can probe A''s relations';
  end if;
  if private.cira_pair_exists('00000000-0000-4000-8000-0000000002b2') then
    raise exception 'TEST_FAILED: stranger C can probe B''s relations';
  end if;

  -- A, who IS in the pair, still gets the correct answer for its own side,
  -- and false for an unrelated third party.
  perform test.login('00000000-0000-4000-8000-0000000002a1');
  if not private.cira_pair_exists('00000000-0000-4000-8000-0000000002b2') then
    raise exception 'TEST_FAILED: participant A cannot see its own A-B pair';
  end if;
  if private.cira_pair_exists('00000000-0000-4000-8000-0000000002c3') then
    raise exception 'TEST_FAILED: A sees a non-existent A-C relation';
  end if;

  -- Block helper is caller-scoped too: A blocks C; only A can observe it.
  perform public.cira_block_user('00000000-0000-4000-8000-0000000002c3');
  if not private.cira_block_exists('00000000-0000-4000-8000-0000000002c3') then
    raise exception 'TEST_FAILED: blocker A cannot observe its own block';
  end if;
  perform test.login('00000000-0000-4000-8000-0000000002c3');
  if private.cira_block_exists('00000000-0000-4000-8000-0000000002a1') then
    raise exception 'TEST_FAILED: C can probe A''s block graph';
  end if;
  perform test.login('00000000-0000-4000-8000-0000000002a1');
  perform public.cira_unblock_user('00000000-0000-4000-8000-0000000002c3');
end;
$do$;

-- Blocks visibility: the blocker sees the block row and the blocked profile;
-- the blocked user sees neither.
do $do$
declare
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000002a1');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000002c3');

  select count(*) into n from public.cira_blocks;
  if n <> 1 then raise exception 'TEST_FAILED: blocker A sees % block rows (expected 1)', n; end if;
  select count(*) into n from public.cira_profiles where user_id = '00000000-0000-4000-8000-0000000002c3';
  if n <> 1 then raise exception 'TEST_FAILED: blocker A cannot see blocked profile C'; end if;

  perform test.login('00000000-0000-4000-8000-0000000002c3');
  select count(*) into n from public.cira_blocks;
  if n <> 0 then raise exception 'TEST_FAILED: blocked C can see the block row'; end if;
  select count(*) into n from public.cira_profiles where user_id = '00000000-0000-4000-8000-0000000002a1';
  if n <> 0 then raise exception 'TEST_FAILED: blocked C can see blocker A profile'; end if;

  -- cleanup for a neutral end-of-file state
  perform test.login('00000000-0000-4000-8000-0000000002a1');
  perform public.cira_unblock_user('00000000-0000-4000-8000-0000000002c3');
end;
$do$;

\echo '02_rls OK'
