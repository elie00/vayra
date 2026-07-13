-- CIRA tests 08 - account deletion.
-- DELETE on auth.users cascades everywhere (zero orphans: profile,
-- friendships, blocks in both directions, presence, invitations, rate
-- limits), the other users' data survives, outstanding invitation codes die
-- with their creator, and a still-valid JWT of the deleted account gets
-- NOT_AUTHENTICATED.
-- Users: A (08a1, deleted), B (08b2), C (08c3).
\echo '=== 08_account_deletion ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000008a1'),
  ('00000000-0000-4000-8000-0000000008b2'),
  ('00000000-0000-4000-8000-0000000008c3');

create temporary table tvars (k text primary key, v text);
grant select on tvars to authenticated;  -- read while impersonating users

-- Build a full graph around A.
do $do$
declare
  rid uuid;
  v jsonb;
begin
  perform test.login('00000000-0000-4000-8000-0000000008a1');
  perform public.cira_upsert_profile('f08_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000008b2');
  perform public.cira_upsert_profile('f08_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000008c3');
  perform public.cira_upsert_profile('f08_carol', 'Carol');

  -- A <-> B accepted
  perform test.login('00000000-0000-4000-8000-0000000008a1');
  perform public.cira_send_request('f08_bob');
  perform test.login('00000000-0000-4000-8000-0000000008b2');
  select friendship_id into rid from public.cira_list_relationships() where handle = 'f08_alice';
  perform public.cira_accept_request(rid);

  -- blocks in both directions around A, plus one that must survive (B -> C)
  perform test.login('00000000-0000-4000-8000-0000000008a1');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000008c3');
  perform test.login('00000000-0000-4000-8000-0000000008c3');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000008a1');
  perform test.login('00000000-0000-4000-8000-0000000008b2');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000008c3');

  -- presence and an open invitation for A
  perform test.login('00000000-0000-4000-8000-0000000008a1');
  perform public.cira_set_presence_consent(true);
  perform public.cira_heartbeat_presence('00000000-0000-4000-8000-000000000811', 'online');
  v := public.cira_create_invitation();
  perform test.logout();
  insert into tvars values ('code', v ->> 'code');
end;
$do$;

-- Sanity: A does have rows everywhere before deletion.
do $do$
begin
  if (select count(*) from private.cira_rate_limits
      where user_id = '00000000-0000-4000-8000-0000000008a1') = 0 then
    raise exception 'TEST_FAILED: fixture has no rate-limit rows for A';
  end if;
  if (select count(*) from public.cira_presence
      where user_id = '00000000-0000-4000-8000-0000000008a1') = 0 then
    raise exception 'TEST_FAILED: fixture has no presence for A';
  end if;
end;
$do$;

-- Account deletion.
delete from auth.users where id = '00000000-0000-4000-8000-0000000008a1';

-- Zero orphans; B and C survive untouched.
do $do$
declare
  a constant uuid := '00000000-0000-4000-8000-0000000008a1';
  n integer;
begin
  select count(*) into n from public.cira_profiles where user_id = a;
  if n <> 0 then raise exception 'TEST_FAILED: orphan profile'; end if;
  select count(*) into n from public.cira_friendships where requester_id = a or addressee_id = a;
  if n <> 0 then raise exception 'TEST_FAILED: orphan friendship'; end if;
  select count(*) into n from public.cira_blocks where blocker_id = a or blocked_id = a;
  if n <> 0 then raise exception 'TEST_FAILED: orphan block'; end if;
  select count(*) into n from public.cira_presence where user_id = a;
  if n <> 0 then raise exception 'TEST_FAILED: orphan presence'; end if;
  select count(*) into n from public.cira_invitations where creator_id = a;
  if n <> 0 then raise exception 'TEST_FAILED: orphan invitation'; end if;
  select count(*) into n from private.cira_rate_limits where user_id = a;
  if n <> 0 then raise exception 'TEST_FAILED: orphan rate-limit row'; end if;

  -- survivors
  select count(*) into n from public.cira_profiles
  where user_id in ('00000000-0000-4000-8000-0000000008b2', '00000000-0000-4000-8000-0000000008c3');
  if n <> 2 then raise exception 'TEST_FAILED: B/C profiles damaged by cascade'; end if;
  select count(*) into n from public.cira_blocks
  where blocker_id = '00000000-0000-4000-8000-0000000008b2'
    and blocked_id = '00000000-0000-4000-8000-0000000008c3';
  if n <> 1 then raise exception 'TEST_FAILED: unrelated block lost in cascade'; end if;
end;
$do$;

-- B no longer lists the relation; A's outstanding invitation code is dead.
do $do$
declare
  n integer;
  v jsonb;
begin
  perform test.login('00000000-0000-4000-8000-0000000008b2');
  select count(*) into n from public.cira_list_relationships();
  if n <> 0 then raise exception 'TEST_FAILED: B still lists the deleted account'; end if;

  v := public.cira_accept_invitation((select t.v from tvars t where t.k = 'code'));
  if v ->> 'error' is distinct from 'INVITATION_UNAVAILABLE' then
    raise exception 'TEST_FAILED: deleted-account invite response %', v;
  end if;
end;
$do$;

-- A JWT that outlives the account gets NOT_AUTHENTICATED everywhere.
do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000008a1');
  begin
    perform public.cira_list_relationships();
    raise exception 'TEST_FAILED: deleted account can still list relationships';
  exception when others then
    if sqlerrm <> 'NOT_AUTHENTICATED' then raise; end if;
  end;
  begin
    perform public.cira_upsert_profile('f08_alice2', 'Ghost');
    raise exception 'TEST_FAILED: deleted account can recreate a profile';
  exception when others then
    if sqlerrm <> 'NOT_AUTHENTICATED' then raise; end if;
  end;
end;
$do$;

drop table tvars;
\echo '08_account_deletion OK'
