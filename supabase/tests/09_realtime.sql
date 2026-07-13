-- CIRA tests 09 - realtime invalidation pings.
-- Every mutation pings `cira:<uid>` of the concerned users only, payload is
-- always an empty object, silent heartbeats stay silent, presence pings
-- respect consent, and the realtime.messages policy only exposes the
-- caller's own topic.
-- Users: A (09a1) <-> B (09b2) accepted; C (09c3) via invitation; D (09d4)
-- declines an invitation.
\echo '=== 09_realtime ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000009a1'),
  ('00000000-0000-4000-8000-0000000009b2'),
  ('00000000-0000-4000-8000-0000000009c3'),
  ('00000000-0000-4000-8000-0000000009d4');

-- Start from a clean slate: the previous test files already pinged.
delete from realtime.messages;

-- Message-count helper (superuser only; RLS is bypassed by the owner).
create function pg_temp.pings(p_uid uuid)
returns integer
language sql
as $$
  select count(*)::integer from realtime.messages
  where topic = 'cira:' || p_uid::text;
$$;

-- Profiles (INSERT path: the profile trigger is UPDATE-only, no ping).
do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform public.cira_upsert_profile('f09_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000009b2');
  perform public.cira_upsert_profile('f09_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000009c3');
  perform public.cira_upsert_profile('f09_carol', 'Carol');
  perform test.login('00000000-0000-4000-8000-0000000009d4');
  perform public.cira_upsert_profile('f09_dave', 'Dave');
end;
$do$;

do $do$
begin
  perform test.logout();
  if (select count(*) from realtime.messages) <> 0 then
    raise exception 'TEST_FAILED: profile creation pinged (% messages)',
      (select count(*) from realtime.messages);
  end if;
end;
$do$;

-- Friendship request + acceptance ping exactly the two members, with an
-- empty broadcast payload on the private channel.
do $do$
declare
  rid uuid;
begin
  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform public.cira_send_request('f09_bob');

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009a1') <> 1
  or pg_temp.pings('00000000-0000-4000-8000-0000000009b2') <> 1 then
    raise exception 'TEST_FAILED: send_request should ping A and B once';
  end if;
  if exists (select 1 from realtime.messages
             where event <> 'changed' or extension <> 'broadcast'
                or private is not true or payload <> '{}'::jsonb) then
    raise exception 'TEST_FAILED: unexpected message shape';
  end if;

  perform test.login('00000000-0000-4000-8000-0000000009b2');
  select friendship_id into rid from public.cira_list_relationships()
  where handle = 'f09_alice';
  perform public.cira_accept_request(rid);

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009a1') <> 2
  or pg_temp.pings('00000000-0000-4000-8000-0000000009b2') <> 2 then
    raise exception 'TEST_FAILED: accept should ping A and B once more';
  end if;
  if pg_temp.pings('00000000-0000-4000-8000-0000000009c3') <> 0 then
    raise exception 'TEST_FAILED: stranger C pinged by A<->B friendship';
  end if;
end;
$do$;

-- Presence: consent flip pings self + friends (profile trigger); heartbeats
-- ping friends on state change only; a pure TTL refresh stays silent.
do $do$
declare
  a0 integer; b0 integer; c0 integer;
begin
  perform test.logout();
  a0 := pg_temp.pings('00000000-0000-4000-8000-0000000009a1');
  b0 := pg_temp.pings('00000000-0000-4000-8000-0000000009b2');

  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform public.cira_set_presence_consent(true);

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009a1') <> a0 + 1
  or pg_temp.pings('00000000-0000-4000-8000-0000000009b2') <> b0 + 1 then
    raise exception 'TEST_FAILED: consent flip should ping A and friend B';
  end if;

  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform public.cira_heartbeat_presence('00000000-0000-4000-8000-000000000911', 'online');

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009b2') <> b0 + 2 then
    raise exception 'TEST_FAILED: first heartbeat should ping friend B';
  end if;

  -- Same state again: only expires_at moves -> no ping.
  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform public.cira_heartbeat_presence('00000000-0000-4000-8000-000000000911', 'online');

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009b2') <> b0 + 2 then
    raise exception 'TEST_FAILED: TTL-only heartbeat must stay silent';
  end if;

  -- State change on the same session -> ping.
  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform public.cira_heartbeat_presence('00000000-0000-4000-8000-000000000911', 'in_vara');

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009b2') <> b0 + 3 then
    raise exception 'TEST_FAILED: state change should ping friend B';
  end if;
  c0 := pg_temp.pings('00000000-0000-4000-8000-0000000009c3');
  if c0 <> 0 then
    raise exception 'TEST_FAILED: presence pinged non-friend C (%)', c0;
  end if;
end;
$do$;

-- Invitations: creation pings the creator; acceptance pings the creator
-- (invitation consumed) and both members (friendship created); a decline
-- pings the creator only.
do $do$
declare
  v      jsonb;
  v_code text;
  a0 integer; c0 integer; d0 integer;
begin
  perform test.logout();
  a0 := pg_temp.pings('00000000-0000-4000-8000-0000000009a1');

  perform test.login('00000000-0000-4000-8000-0000000009a1');
  v := public.cira_create_invitation();
  v_code := v ->> 'code';

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009a1') <> a0 + 1 then
    raise exception 'TEST_FAILED: create_invitation should ping creator A';
  end if;

  perform test.login('00000000-0000-4000-8000-0000000009c3');
  perform public.cira_accept_invitation(v_code);

  perform test.logout();
  -- +1 invitation consumed, +1 friendship insert.
  if pg_temp.pings('00000000-0000-4000-8000-0000000009a1') <> a0 + 3 then
    raise exception 'TEST_FAILED: acceptance should ping creator A twice';
  end if;
  if pg_temp.pings('00000000-0000-4000-8000-0000000009c3') <> 1 then
    raise exception 'TEST_FAILED: acceptance should ping acceptor C once';
  end if;

  -- Decline path: no friendship row is touched.
  perform test.login('00000000-0000-4000-8000-0000000009a1');
  v := public.cira_create_invitation();
  v_code := v ->> 'code';

  perform test.logout();
  a0 := pg_temp.pings('00000000-0000-4000-8000-0000000009a1');
  d0 := pg_temp.pings('00000000-0000-4000-8000-0000000009d4');

  perform test.login('00000000-0000-4000-8000-0000000009d4');
  perform public.cira_decline_invitation(v_code);

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009a1') <> a0 + 1 then
    raise exception 'TEST_FAILED: decline should ping creator A once';
  end if;
  if pg_temp.pings('00000000-0000-4000-8000-0000000009d4') <> d0 then
    raise exception 'TEST_FAILED: decline pinged the decliner D';
  end if;
end;
$do$;

-- Profile update pings the owner and accepted friends.
do $do$
declare
  b0 integer; c0 integer;
begin
  perform test.logout();
  b0 := pg_temp.pings('00000000-0000-4000-8000-0000000009b2');
  c0 := pg_temp.pings('00000000-0000-4000-8000-0000000009c3');

  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform public.cira_upsert_profile('f09_alice', 'Alice II');

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009b2') <> b0 + 1
  or pg_temp.pings('00000000-0000-4000-8000-0000000009c3') <> c0 + 1 then
    raise exception 'TEST_FAILED: profile update should ping friends B and C';
  end if;

  -- Idempotent upsert (no field changes) stays silent.
  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform public.cira_upsert_profile('f09_alice', 'Alice II');

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009b2') <> b0 + 1 then
    raise exception 'TEST_FAILED: no-op profile upsert must stay silent';
  end if;
end;
$do$;

-- Opt-out: the profile flip pings self + friends, but the presence-row purge
-- itself stays silent (consent is already false when the deletes fire).
do $do$
declare
  b0 integer;
begin
  perform test.logout();
  b0 := pg_temp.pings('00000000-0000-4000-8000-0000000009b2');

  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform public.cira_set_presence_consent(false);

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009b2') <> b0 + 1 then
    raise exception 'TEST_FAILED: opt-out should ping friend B exactly once, got %',
      pg_temp.pings('00000000-0000-4000-8000-0000000009b2') - b0;
  end if;
end;
$do$;

-- Blocks: blocking a friend deletes the friendship (pings both) and inserts
-- the block (pings the blocker only); unblocking pings the blocker only.
do $do$
declare
  a0 integer; b0 integer;
begin
  perform test.logout();
  a0 := pg_temp.pings('00000000-0000-4000-8000-0000000009a1');
  b0 := pg_temp.pings('00000000-0000-4000-8000-0000000009b2');

  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000009b2');

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009a1') <> a0 + 2 then
    raise exception 'TEST_FAILED: block should ping blocker A twice (friendship + block)';
  end if;
  if pg_temp.pings('00000000-0000-4000-8000-0000000009b2') <> b0 + 1 then
    raise exception 'TEST_FAILED: block should ping B once (friendship delete only)';
  end if;

  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform public.cira_unblock_user('00000000-0000-4000-8000-0000000009b2');

  perform test.logout();
  if pg_temp.pings('00000000-0000-4000-8000-0000000009a1') <> a0 + 3 then
    raise exception 'TEST_FAILED: unblock should ping blocker A once more';
  end if;
  if pg_temp.pings('00000000-0000-4000-8000-0000000009b2') <> b0 + 1 then
    raise exception 'TEST_FAILED: unblock must not ping the unblocked B';
  end if;
end;
$do$;

-- Channel authorization: an authenticated user only reads their own topic;
-- anon reads nothing at all.
do $do$
declare
  n integer;
  own integer;
begin
  perform test.logout();
  own := pg_temp.pings('00000000-0000-4000-8000-0000000009a1');
  if own = 0 then
    raise exception 'TEST_FAILED: expected messages on cira:A for the RLS check';
  end if;

  -- A authorized on their own topic: sees the pings.
  perform test.login('00000000-0000-4000-8000-0000000009a1');
  perform set_config('realtime.topic',
    'cira:00000000-0000-4000-8000-0000000009a1', true);
  select count(*) into n from realtime.messages;
  if n <> own then
    raise exception 'TEST_FAILED: A should see % own-topic messages, got %', own, n;
  end if;

  -- A probing B's topic: policy denies everything.
  perform set_config('realtime.topic',
    'cira:00000000-0000-4000-8000-0000000009b2', true);
  select count(*) into n from realtime.messages;
  if n <> 0 then
    raise exception 'TEST_FAILED: A can read B''s topic (% rows)', n;
  end if;

  -- anon: no access even on a valid topic.
  perform test.login_anon();
  perform set_config('realtime.topic',
    'cira:00000000-0000-4000-8000-0000000009a1', true);
  select count(*) into n from realtime.messages;
  if n <> 0 then
    raise exception 'TEST_FAILED: anon can read realtime.messages (% rows)', n;
  end if;
end;
$do$;

\echo '09_realtime OK'
