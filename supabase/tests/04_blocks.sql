-- CIRA tests 04 - blocks.
-- Block erases the relation, hides profiles/presence, keeps re-requests
-- oracle-free; idempotent block/unblock; accept-vs-block race guard.
-- Users: A (04a1), B (04b2), C (04c3).
\echo '=== 04_blocks ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000004a1'),
  ('00000000-0000-4000-8000-0000000004b2'),
  ('00000000-0000-4000-8000-0000000004c3');

do $do$
declare
  rid uuid;
begin
  perform test.login('00000000-0000-4000-8000-0000000004a1');
  perform public.cira_upsert_profile('f04_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000004b2');
  perform public.cira_upsert_profile('f04_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000004c3');
  perform public.cira_upsert_profile('f04_carol', 'Carol');

  -- A <-> B accepted
  perform test.login('00000000-0000-4000-8000-0000000004a1');
  perform public.cira_send_request('f04_bob');
  perform test.login('00000000-0000-4000-8000-0000000004b2');
  select friendship_id into rid from public.cira_list_relationships() where handle = 'f04_alice';
  perform public.cira_accept_request(rid);
end;
$do$;

-- B blocks A: the accepted relation is erased and the block row exists.
do $do$
declare
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000004b2');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000004a1');

  perform test.logout();
  select count(*) into n from public.cira_friendships
  where user_low = '00000000-0000-4000-8000-0000000004a1'
    and user_high = '00000000-0000-4000-8000-0000000004b2';
  if n <> 0 then raise exception 'TEST_FAILED: block did not erase the relation'; end if;
  select count(*) into n from public.cira_blocks
  where blocker_id = '00000000-0000-4000-8000-0000000004b2'
    and blocked_id = '00000000-0000-4000-8000-0000000004a1';
  if n <> 1 then raise exception 'TEST_FAILED: block row missing'; end if;
end;
$do$;

-- Anti-oracle: for A, sending to the blocking user, to an unknown handle and
-- to itself returns the exact same payload, and nothing is written.
do $do$
declare
  v1 jsonb; v2 jsonb; v3 jsonb;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000004a1');
  v1 := public.cira_send_request('f04_bob');        -- B blocks A
  v2 := public.cira_send_request('f04_ghost_none'); -- unknown handle
  v3 := public.cira_send_request('f04_alice');      -- own handle
  if v1 <> v2 or v2 <> v3 or v1 <> '{"status":"ok"}'::jsonb then
    raise exception 'TEST_FAILED: send_request oracle leak: % / % / %', v1, v2, v3;
  end if;

  perform test.logout();
  select count(*) into n from public.cira_friendships
  where requester_id = '00000000-0000-4000-8000-0000000004a1';
  if n <> 0 then raise exception 'TEST_FAILED: blocked send created a row'; end if;
end;
$do$;

-- Visibility under block: blocker still sees the blocked profile (to render
-- the list); the blocked user sees nothing; both relationship lists are
-- empty (=> no presence can leak through the only presence channel).
do $do$
declare
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000004b2');
  select count(*) into n from public.cira_profiles
  where user_id = '00000000-0000-4000-8000-0000000004a1';
  if n <> 1 then raise exception 'TEST_FAILED: blocker lost sight of blocked profile'; end if;
  select count(*) into n from public.cira_list_relationships();
  if n <> 0 then raise exception 'TEST_FAILED: blocker still lists the relation'; end if;
  select count(*) into n from public.cira_list_blocks() where handle = 'f04_alice';
  if n <> 1 then raise exception 'TEST_FAILED: cira_list_blocks misses the block'; end if;

  perform test.login('00000000-0000-4000-8000-0000000004a1');
  select count(*) into n from public.cira_profiles
  where user_id = '00000000-0000-4000-8000-0000000004b2';
  if n <> 0 then raise exception 'TEST_FAILED: blocked user still sees blocker profile'; end if;
  select count(*) into n from public.cira_list_relationships();
  if n <> 0 then raise exception 'TEST_FAILED: blocked user still lists the relation'; end if;
end;
$do$;

-- Idempotence and edge cases: re-block, self-block, unknown target, unblock.
do $do$
declare
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000004b2');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000004a1');  -- idempotent
  perform test.logout();
  select count(*) into n from public.cira_blocks
  where blocker_id = '00000000-0000-4000-8000-0000000004b2';
  if n <> 1 then raise exception 'TEST_FAILED: double block duplicated the row'; end if;

  perform test.login('00000000-0000-4000-8000-0000000004b2');
  begin
    perform public.cira_block_user('00000000-0000-4000-8000-0000000004b2');
    raise exception 'TEST_FAILED: self-block succeeded';
  exception when others then
    if sqlerrm <> 'INVALID_TRANSITION' then raise; end if;
  end;

  -- Unknown target: generic ok (no oracle), no row.
  perform public.cira_block_user('00000000-0000-4000-8000-00000000dead');
  perform test.logout();
  select count(*) into n from public.cira_blocks
  where blocked_id = '00000000-0000-4000-8000-00000000dead';
  if n <> 0 then raise exception 'TEST_FAILED: block row for non-profile target'; end if;

  -- Unblock, twice (idempotent), then A can send again.
  perform test.login('00000000-0000-4000-8000-0000000004b2');
  perform public.cira_unblock_user('00000000-0000-4000-8000-0000000004a1');
  perform public.cira_unblock_user('00000000-0000-4000-8000-0000000004a1');
  perform test.logout();
  select count(*) into n from public.cira_blocks
  where blocker_id = '00000000-0000-4000-8000-0000000004b2';
  if n <> 0 then raise exception 'TEST_FAILED: unblock did not delete the row'; end if;

  perform test.login('00000000-0000-4000-8000-0000000004a1');
  perform public.cira_send_request('f04_bob');
  perform test.logout();
  select count(*) into n from public.cira_friendships
  where requester_id = '00000000-0000-4000-8000-0000000004a1'
    and addressee_id = '00000000-0000-4000-8000-0000000004b2'
    and status = 'pending';
  if n <> 1 then raise exception 'TEST_FAILED: post-unblock request missing'; end if;
end;
$do$;

-- Accept-vs-block race guard (defensive branch): even if a block + pending
-- row coexist (a state the RPCs cannot produce, since cira_block_user erases
-- the pair under the same canonical lock - injected here by the superuser),
-- accepting is refused with the same generic error and the row is never
-- upgraded to accepted.
do $do$
declare
  rid uuid;
  n integer;
begin
  select id into rid from public.cira_friendships
  where requester_id = '00000000-0000-4000-8000-0000000004a1'
    and addressee_id = '00000000-0000-4000-8000-0000000004b2';

  insert into public.cira_blocks (blocker_id, blocked_id)
  values ('00000000-0000-4000-8000-0000000004b2', '00000000-0000-4000-8000-0000000004a1');

  perform test.login('00000000-0000-4000-8000-0000000004b2');
  begin
    perform public.cira_accept_request(rid);
    raise exception 'TEST_FAILED: accept succeeded despite block';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;

  perform test.logout();
  select count(*) into n from public.cira_friendships where id = rid and status = 'accepted';
  if n <> 0 then raise exception 'TEST_FAILED: blocked accept upgraded the row'; end if;

  -- the canonical RPC path cleans the pair up: blocking again erases it
  perform test.login('00000000-0000-4000-8000-0000000004b2');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000004a1');
  perform test.logout();
  select count(*) into n from public.cira_friendships where id = rid;
  if n <> 0 then raise exception 'TEST_FAILED: block_user left the pending row'; end if;

  delete from public.cira_blocks
  where blocker_id = '00000000-0000-4000-8000-0000000004b2';
end;
$do$;

-- Blocking a PENDING pair (via the RPC this time) erases it too.
do $do$
declare
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000004a1');
  perform public.cira_send_request('f04_carol');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000004c3');
  perform test.logout();
  select count(*) into n from public.cira_friendships
  where user_low = least('00000000-0000-4000-8000-0000000004a1'::uuid, '00000000-0000-4000-8000-0000000004c3'::uuid);
  if n <> 0 then raise exception 'TEST_FAILED: blocking did not erase the pending row'; end if;
  perform test.login('00000000-0000-4000-8000-0000000004a1');
  perform public.cira_unblock_user('00000000-0000-4000-8000-0000000004c3');
end;
$do$;

\echo '04_blocks OK'
