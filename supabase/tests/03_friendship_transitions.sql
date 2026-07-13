-- CIRA tests 03 - friendship transitions and stable error codes.
-- send/accept/decline/cancel/remove, forced acceptance impossible,
-- ALREADY_RELATED, REQUEST_NOT_AVAILABLE, PROFILE_REQUIRED,
-- NOT_AUTHENTICATED, INVALID_PROFILE, HANDLE_UNAVAILABLE, no-oracle send.
-- Users: A (03a1), B (03b2), C (03c3), D (03d4: auth only, NO profile).
\echo '=== 03_friendship_transitions ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000003a1'),
  ('00000000-0000-4000-8000-0000000003b2'),
  ('00000000-0000-4000-8000-0000000003c3'),
  ('00000000-0000-4000-8000-0000000003d4');

create temporary table tvars (k text primary key, v text);
grant select on tvars to authenticated;  -- read while impersonating users

-- Profile management: NOT_AUTHENTICATED / INVALID_PROFILE / HANDLE_UNAVAILABLE.
do $do$
begin
  -- authenticated role but empty claims
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.cira_upsert_profile('f03_nobody', 'X');
    raise exception 'TEST_FAILED: RPC without JWT claims succeeded';
  exception when others then
    if sqlerrm <> 'NOT_AUTHENTICATED' then raise; end if;
  end;

  -- valid-looking JWT whose sub no longer exists in auth.users
  perform test.login('00000000-0000-4000-8000-00000000dead');
  begin
    perform public.cira_upsert_profile('f03_ghost', 'X');
    raise exception 'TEST_FAILED: RPC with deleted-user JWT succeeded';
  exception when others then
    if sqlerrm <> 'NOT_AUTHENTICATED' then raise; end if;
  end;

  -- invalid inputs are rejected before any write
  perform test.login('00000000-0000-4000-8000-0000000003d4');
  begin
    perform public.cira_upsert_profile('ab', 'X');
    raise exception 'TEST_FAILED: short handle accepted';
  exception when others then
    if sqlerrm <> 'INVALID_PROFILE' then raise; end if;
  end;
  begin
    perform public.cira_upsert_profile('f03_dave', 'a<script>');
    raise exception 'TEST_FAILED: HTML display_name accepted';
  exception when others then
    if sqlerrm <> 'INVALID_PROFILE' then raise; end if;
  end;
  begin
    perform public.cira_upsert_profile('f03_dave', 'Dave', 'https://evil/x.png');
    raise exception 'TEST_FAILED: URL avatar_key accepted';
  exception when others then
    if sqlerrm <> 'INVALID_PROFILE' then raise; end if;
  end;
end;
$do$;

-- Create the three real profiles; taking someone else's handle fails.
do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000003a1');
  perform public.cira_upsert_profile('f03_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000003b2');
  perform public.cira_upsert_profile('f03_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000003c3');
  perform public.cira_upsert_profile('f03_carol', 'Carol');

  begin
    perform public.cira_upsert_profile('f03_alice', 'Fake Alice');
    raise exception 'TEST_FAILED: handle takeover succeeded';
  exception when others then
    if sqlerrm <> 'HANDLE_UNAVAILABLE' then raise; end if;
  end;
end;
$do$;

-- D has no profile: every social RPC requires one.
do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000003d4');
  begin
    perform public.cira_send_request('f03_alice');
    raise exception 'TEST_FAILED: send_request without profile succeeded';
  exception when others then
    if sqlerrm <> 'PROFILE_REQUIRED' then raise; end if;
  end;
  begin
    perform public.cira_list_relationships();
    raise exception 'TEST_FAILED: list_relationships without profile succeeded';
  exception when others then
    if sqlerrm <> 'PROFILE_REQUIRED' then raise; end if;
  end;
end;
$do$;

-- A -> B: pending, visible on both sides with the right direction; pending
-- counterparts never expose presence (NULL).
do $do$
declare
  v jsonb;
  rid uuid;
  r record;
begin
  perform test.login('00000000-0000-4000-8000-0000000003a1');
  v := public.cira_send_request('f03_bob');
  if v <> '{"status":"ok"}'::jsonb then
    raise exception 'TEST_FAILED: unexpected send_request payload: %', v;
  end if;

  select * into r from public.cira_list_relationships() where handle = 'f03_bob';
  if r.friendship_id is null or r.status <> 'pending' or r.direction <> 'outgoing' then
    raise exception 'TEST_FAILED: requester view wrong: %', r;
  end if;
  if r.presence is not null then
    raise exception 'TEST_FAILED: pending counterpart exposes presence %', r.presence;
  end if;
  rid := r.friendship_id;

  perform test.login('00000000-0000-4000-8000-0000000003b2');
  select * into r from public.cira_list_relationships() where handle = 'f03_alice';
  if r.friendship_id <> rid or r.status <> 'pending' or r.direction <> 'incoming' then
    raise exception 'TEST_FAILED: addressee view wrong: %', r;
  end if;

  perform test.logout();
  insert into tvars values ('req_ab', rid::text);
end;
$do$;

-- Anti-oracle regression (finding: handle-enumeration via repeat send).
-- A duplicate send (in either direction) on an existing pending pair must
-- return the SAME generic success as a first send - NOT ALREADY_RELATED -
-- otherwise a second call distinguishes real handles (error) from unknown
-- handles (ok). It must also stay idempotent: no second friendship row.
do $do$
declare
  v jsonb;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000003a1');
  v := public.cira_send_request('f03_bob');
  if v <> '{"status":"ok"}'::jsonb then
    raise exception 'TEST_FAILED: duplicate send leaked (not generic ok): %', v;
  end if;
  perform test.login('00000000-0000-4000-8000-0000000003b2');
  v := public.cira_send_request('f03_alice');
  if v <> '{"status":"ok"}'::jsonb then
    raise exception 'TEST_FAILED: reverse duplicate send leaked: %', v;
  end if;

  -- No duplicate row: still exactly one pending pair between A and B.
  perform test.logout();
  select count(*) into n from public.cira_friendships
  where user_low = least('00000000-0000-4000-8000-0000000003a1'::uuid,
                         '00000000-0000-4000-8000-0000000003b2'::uuid)
    and user_high = greatest('00000000-0000-4000-8000-0000000003a1'::uuid,
                             '00000000-0000-4000-8000-0000000003b2'::uuid);
  if n <> 1 then
    raise exception 'TEST_FAILED: duplicate send created % rows (expected 1)', n;
  end if;
end;
$do$;

-- Forced acceptance is impossible: neither a third party nor the requester
-- can accept; wrong-side decline/cancel are refused too.
do $do$
declare
  rid uuid := (select t.v from tvars t where t.k = 'req_ab')::uuid;
begin
  perform test.login('00000000-0000-4000-8000-0000000003c3');
  begin
    perform public.cira_accept_request(rid);
    raise exception 'TEST_FAILED: third party accepted a foreign request';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;
  begin
    perform public.cira_decline_request(rid);
    raise exception 'TEST_FAILED: third party declined a foreign request';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;

  perform test.login('00000000-0000-4000-8000-0000000003a1');
  begin
    perform public.cira_accept_request(rid);
    raise exception 'TEST_FAILED: requester accepted its own request';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;
  begin
    perform public.cira_decline_request(rid);
    raise exception 'TEST_FAILED: requester declined its own request';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;

  perform test.login('00000000-0000-4000-8000-0000000003b2');
  begin
    perform public.cira_cancel_request(rid);
    raise exception 'TEST_FAILED: addressee cancelled the request';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;

  -- unknown request id
  begin
    perform public.cira_accept_request(gen_random_uuid());
    raise exception 'TEST_FAILED: accepting an unknown request succeeded';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;
end;
$do$;

-- B accepts; double-accept fails; send on accepted pair fails; only the
-- accepted relation can be removed, by a participant only.
do $do$
declare
  rid uuid := (select t.v from tvars t where t.k = 'req_ab')::uuid;
  r record;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000003b2');
  perform public.cira_accept_request(rid);

  select * into r from public.cira_list_relationships() where handle = 'f03_alice';
  if r.status <> 'accepted' or r.responded_at is null then
    raise exception 'TEST_FAILED: acceptance not recorded: %', r;
  end if;
  -- accepted + counterpart not opted in -> presence must read 'offline'
  if r.presence is distinct from 'offline' then
    raise exception 'TEST_FAILED: expected offline presence, got %', r.presence;
  end if;

  begin
    perform public.cira_accept_request(rid);
    raise exception 'TEST_FAILED: double accept succeeded';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;

  -- send on an accepted pair: generic ok (idempotent, no oracle), no new row.
  perform test.login('00000000-0000-4000-8000-0000000003a1');
  if public.cira_send_request('f03_bob') <> '{"status":"ok"}'::jsonb then
    raise exception 'TEST_FAILED: send on accepted pair leaked (not generic ok)';
  end if;
  select count(*) into n from public.cira_list_relationships() where handle = 'f03_bob';
  if n <> 1 then
    raise exception 'TEST_FAILED: send on accepted pair changed the relation set';
  end if;

  -- outsider removal refused
  perform test.login('00000000-0000-4000-8000-0000000003c3');
  begin
    perform public.cira_remove_friend('00000000-0000-4000-8000-0000000003a1');
    raise exception 'TEST_FAILED: outsider removed a foreign relation';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;

  -- removal by a participant deletes the row
  perform test.login('00000000-0000-4000-8000-0000000003a1');
  perform public.cira_remove_friend('00000000-0000-4000-8000-0000000003b2');
  begin
    perform public.cira_remove_friend('00000000-0000-4000-8000-0000000003b2');
    raise exception 'TEST_FAILED: second removal succeeded';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;

  perform test.logout();
  select count(*) into n from public.cira_friendships
  where user_low = '00000000-0000-4000-8000-0000000003a1';
  if n <> 0 then
    raise exception 'TEST_FAILED: friendship row survived removal';
  end if;
end;
$do$;

-- Cancel flow: the requester cancels, the row is deleted.
do $do$
declare
  rid uuid;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000003a1');
  perform public.cira_send_request('f03_bob');
  select friendship_id into rid from public.cira_list_relationships() where handle = 'f03_bob';
  perform public.cira_cancel_request(rid);
  begin
    perform public.cira_cancel_request(rid);
    raise exception 'TEST_FAILED: second cancel succeeded';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;
  perform test.logout();
  select count(*) into n from public.cira_friendships
  where user_low = '00000000-0000-4000-8000-0000000003a1';
  if n <> 0 then raise exception 'TEST_FAILED: cancelled row survived'; end if;
end;
$do$;

-- Decline flow: the addressee declines, the row is deleted (no history),
-- and a later re-send works.
do $do$
declare
  rid uuid;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000003a1');
  perform public.cira_send_request('f03_bob');
  perform test.login('00000000-0000-4000-8000-0000000003b2');
  select friendship_id into rid from public.cira_list_relationships() where handle = 'f03_alice';
  perform public.cira_decline_request(rid);

  perform test.logout();
  select count(*) into n from public.cira_friendships
  where user_low = '00000000-0000-4000-8000-0000000003a1';
  if n <> 0 then raise exception 'TEST_FAILED: declined row survived (history kept)'; end if;

  -- re-send after decline is allowed
  perform test.login('00000000-0000-4000-8000-0000000003a1');
  perform public.cira_send_request('f03_bob');
  select friendship_id into rid from public.cira_list_relationships() where handle = 'f03_bob';
  perform public.cira_cancel_request(rid);  -- cleanup
end;
$do$;

-- remove_friend only applies to ACCEPTED relations, never to pending ones.
do $do$
declare
  rid uuid;
begin
  perform test.login('00000000-0000-4000-8000-0000000003a1');
  perform public.cira_send_request('f03_carol');
  begin
    perform public.cira_remove_friend('00000000-0000-4000-8000-0000000003c3');
    raise exception 'TEST_FAILED: remove_friend deleted a pending request';
  exception when others then
    if sqlerrm <> 'REQUEST_NOT_AVAILABLE' then raise; end if;
  end;
  select friendship_id into rid from public.cira_list_relationships() where handle = 'f03_carol';
  perform public.cira_cancel_request(rid);  -- cleanup
end;
$do$;

-- No enumeration oracle: unknown handle answers exactly like a success and
-- writes nothing.
do $do$
declare
  v jsonb;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000003a1');
  v := public.cira_send_request('f03_nobody_here');
  if v <> '{"status":"ok"}'::jsonb then
    raise exception 'TEST_FAILED: unknown handle leaked: %', v;
  end if;
  perform test.logout();
  select count(*) into n from public.cira_friendships
  where requester_id = '00000000-0000-4000-8000-0000000003a1';
  if n <> 0 then raise exception 'TEST_FAILED: ghost request row created'; end if;
end;
$do$;

drop table tvars;
\echo '03_friendship_transitions OK'
