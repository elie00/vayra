-- CIRA tests 05 - presence.
-- Opt-in required, aggregate-only visibility (in_vara > online > offline),
-- TTL expiry -> offline, opt-out purges sessions and reads as a plain
-- offline, raw rows never visible, PROFILE_REQUIRED without profile.
-- Users: A (05a1) <-> B (05b2) accepted; A -> C (05c3) pending; D (05d4) no
-- profile.
\echo '=== 05_presence ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000005a1'),
  ('00000000-0000-4000-8000-0000000005b2'),
  ('00000000-0000-4000-8000-0000000005c3'),
  ('00000000-0000-4000-8000-0000000005d4');

do $do$
declare
  rid uuid;
begin
  perform test.login('00000000-0000-4000-8000-0000000005a1');
  perform public.cira_upsert_profile('f05_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000005b2');
  perform public.cira_upsert_profile('f05_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000005c3');
  perform public.cira_upsert_profile('f05_carol', 'Carol');

  perform test.login('00000000-0000-4000-8000-0000000005a1');
  perform public.cira_send_request('f05_bob');
  perform public.cira_send_request('f05_carol');
  perform test.login('00000000-0000-4000-8000-0000000005b2');
  select friendship_id into rid from public.cira_list_relationships() where handle = 'f05_alice';
  perform public.cira_accept_request(rid);
end;
$do$;

-- Consent gate: presence_opt_in defaults to false and heartbeats are
-- refused until consent is given; without a profile everything is refused.
do $do$
declare
  v boolean;
begin
  perform test.logout();
  select presence_opt_in into v from public.cira_profiles
  where user_id = '00000000-0000-4000-8000-0000000005a1';
  if v then raise exception 'TEST_FAILED: presence_opt_in not false by default'; end if;

  perform test.login('00000000-0000-4000-8000-0000000005a1');
  begin
    perform public.cira_heartbeat_presence('00000000-0000-4000-8000-000000000511', 'online');
    raise exception 'TEST_FAILED: heartbeat accepted without opt-in';
  exception when others then
    if sqlerrm <> 'INVALID_TRANSITION' then raise; end if;
  end;

  perform test.login('00000000-0000-4000-8000-0000000005d4');
  begin
    perform public.cira_heartbeat_presence('00000000-0000-4000-8000-000000000512', 'online');
    raise exception 'TEST_FAILED: heartbeat accepted without profile';
  exception when others then
    if sqlerrm <> 'PROFILE_REQUIRED' then raise; end if;
  end;
  begin
    perform public.cira_set_presence_consent(true);
    raise exception 'TEST_FAILED: consent accepted without profile';
  exception when others then
    if sqlerrm <> 'PROFILE_REQUIRED' then raise; end if;
  end;
end;
$do$;

-- Aggregate visibility: friend sees online, then in_vara (priority), then
-- back to online after the in_vara session is cleared. Raw rows stay hidden.
do $do$
declare
  p text;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000005a1');
  perform public.cira_set_presence_consent(true);
  perform public.cira_heartbeat_presence('00000000-0000-4000-8000-000000000511', 'online');

  perform test.login('00000000-0000-4000-8000-0000000005b2');
  select presence into p from public.cira_list_relationships() where handle = 'f05_alice';
  if p is distinct from 'online' then
    raise exception 'TEST_FAILED: friend should see online, got %', p;
  end if;
  select count(*) into n from public.cira_presence;
  if n <> 0 then raise exception 'TEST_FAILED: friend can read raw presence rows'; end if;

  -- second session in_vara wins the aggregate
  perform test.login('00000000-0000-4000-8000-0000000005a1');
  perform public.cira_heartbeat_presence('00000000-0000-4000-8000-000000000522', 'in_vara');
  select count(*) into n from public.cira_presence;  -- owner sees own raw rows
  if n <> 2 then raise exception 'TEST_FAILED: owner sees % raw presence rows (expected 2)', n; end if;

  perform test.login('00000000-0000-4000-8000-0000000005b2');
  select presence into p from public.cira_list_relationships() where handle = 'f05_alice';
  if p is distinct from 'in_vara' then
    raise exception 'TEST_FAILED: in_vara should win the aggregate, got %', p;
  end if;

  -- pending counterpart C: presence stays NULL even while A is online
  perform test.login('00000000-0000-4000-8000-0000000005c3');
  select presence into p from public.cira_list_relationships() where handle = 'f05_alice';
  if p is not null then
    raise exception 'TEST_FAILED: pending counterpart sees presence %', p;
  end if;
  select count(*) into n from public.cira_presence;
  if n <> 0 then raise exception 'TEST_FAILED: pending counterpart reads raw presence'; end if;

  -- clearing the in_vara session drops the aggregate back to online
  perform test.login('00000000-0000-4000-8000-0000000005a1');
  perform public.cira_clear_presence('00000000-0000-4000-8000-000000000522');
  perform test.login('00000000-0000-4000-8000-0000000005b2');
  select presence into p from public.cira_list_relationships() where handle = 'f05_alice';
  if p is distinct from 'online' then
    raise exception 'TEST_FAILED: expected online after clear, got %', p;
  end if;
end;
$do$;

-- TTL: an expired session reads as offline (stale mobile session), without
-- any WebSocket dependency. Expiry is simulated by backdating.
do $do$
declare
  p text;
begin
  update public.cira_presence
  set updated_at = now() - interval '100 seconds',
      expires_at = now() - interval '10 seconds'
  where user_id = '00000000-0000-4000-8000-0000000005a1';

  perform test.login('00000000-0000-4000-8000-0000000005b2');
  select presence into p from public.cira_list_relationships() where handle = 'f05_alice';
  if p is distinct from 'offline' then
    raise exception 'TEST_FAILED: expired session should read offline, got %', p;
  end if;
end;
$do$;

-- Heartbeat input validation.
do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000005a1');
  begin
    perform public.cira_heartbeat_presence('00000000-0000-4000-8000-000000000511', 'busy');
    raise exception 'TEST_FAILED: invalid state accepted';
  exception when others then
    if sqlerrm <> 'INVALID_TRANSITION' then raise; end if;
  end;
  begin
    perform public.cira_heartbeat_presence(null, 'online');
    raise exception 'TEST_FAILED: null session accepted';
  exception when others then
    if sqlerrm <> 'INVALID_TRANSITION' then raise; end if;
  end;
end;
$do$;

-- Opt-out: immediate purge of every session; the friend reads a plain
-- 'offline' (indistinguishable from really being offline).
do $do$
declare
  p text;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000005a1');
  perform public.cira_heartbeat_presence('00000000-0000-4000-8000-000000000511', 'online');
  perform public.cira_set_presence_consent(false);

  perform test.logout();
  select count(*) into n from public.cira_presence
  where user_id = '00000000-0000-4000-8000-0000000005a1';
  if n <> 0 then raise exception 'TEST_FAILED: opt-out left % sessions behind', n; end if;

  perform test.login('00000000-0000-4000-8000-0000000005b2');
  select presence into p from public.cira_list_relationships() where handle = 'f05_alice';
  if p is distinct from 'offline' then
    raise exception 'TEST_FAILED: opted-out user should read offline, got %', p;
  end if;
end;
$do$;

\echo '05_presence OK'
