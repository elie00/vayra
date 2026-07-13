-- CIRA tests 01 - table constraints (superuser direct inserts).
-- CHECK constraints (handle, display_name, avatar_key whitelist, friendship
-- consistency, presence TTL, invitation TTL/consumed/outcome/revoked),
-- unique indexes, foreign keys and generated pair columns.
\echo '=== 01_constraints ==='

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000001a1', 'f01a@test'),
  ('00000000-0000-4000-8000-0000000001b2', 'f01b@test'),
  ('00000000-0000-4000-8000-0000000001c3', 'f01c@test');

-- Two valid profiles (c3 intentionally stays profile-less for negative tests).
insert into public.cira_profiles (user_id, handle, display_name, avatar_key)
values ('00000000-0000-4000-8000-0000000001a1', 'f01_alice', 'Alice', 'avatar_01.png');
insert into public.cira_profiles (user_id, handle, display_name)
values ('00000000-0000-4000-8000-0000000001b2', 'f01_bob', 'Bob');

-- Every statement below must fail with the exact SQLSTATE listed
-- (23514 check_violation, 23505 unique_violation, 23503 foreign_key_violation).
do $do$
declare
  rec record;
begin
  for rec in
    select * from (values
      -- handle format
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', 'ab', 'X')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', 'Abc', 'X')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', rpad('a', 25, 'b'), 'X')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', 'bad-dash', 'X')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', '_lead', 'X')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', 'has space', 'X')$q$, '23514'),
      -- display_name length / HTML / control characters
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', 'f01_carol', '')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', 'f01_carol', repeat('x', 49))$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', 'f01_carol', 'a<script>')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', 'f01_carol', 'a' || chr(10) || 'b')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', 'f01_carol', 'a' || chr(27))$q$, '23514'),
      -- avatar_key whitelist: URLs, data URIs, traversal, empty, too long
      ($q$insert into public.cira_profiles (user_id, handle, display_name, avatar_key) values ('00000000-0000-4000-8000-0000000001c3', 'f01_carol', 'C', 'http://evil.example/a.png')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name, avatar_key) values ('00000000-0000-4000-8000-0000000001c3', 'f01_carol', 'C', 'data:image/png;base64,AAAA')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name, avatar_key) values ('00000000-0000-4000-8000-0000000001c3', 'f01_carol', 'C', '../../etc/passwd')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name, avatar_key) values ('00000000-0000-4000-8000-0000000001c3', 'f01_carol', 'C', 'a/b')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name, avatar_key) values ('00000000-0000-4000-8000-0000000001c3', 'f01_carol', 'C', '')$q$, '23514'),
      ($q$insert into public.cira_profiles (user_id, handle, display_name, avatar_key) values ('00000000-0000-4000-8000-0000000001c3', 'f01_carol', 'C', repeat('a', 65))$q$, '23514'),
      -- friendships: self-relation, bad status, responded_at consistency
      ($q$insert into public.cira_friendships (requester_id, addressee_id, status) values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000001a1', 'pending')$q$, '23514'),
      ($q$insert into public.cira_friendships (requester_id, addressee_id, status) values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000001b2', 'blocked')$q$, '23514'),
      ($q$insert into public.cira_friendships (requester_id, addressee_id, status, responded_at) values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000001b2', 'pending', now())$q$, '23514'),
      ($q$insert into public.cira_friendships (requester_id, addressee_id, status) values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000001b2', 'accepted')$q$, '23514'),
      -- blocks: self-block
      ($q$insert into public.cira_blocks (blocker_id, blocked_id) values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000001a1')$q$, '23514'),
      -- presence: TTL > 120 s, expiry before update, bad state
      ($q$insert into public.cira_presence (user_id, session_id, state, expires_at) values ('00000000-0000-4000-8000-0000000001a1', gen_random_uuid(), 'online', now() + interval '200 seconds')$q$, '23514'),
      ($q$insert into public.cira_presence (user_id, session_id, state, expires_at) values ('00000000-0000-4000-8000-0000000001a1', gen_random_uuid(), 'online', now() - interval '1 second')$q$, '23514'),
      ($q$insert into public.cira_presence (user_id, session_id, state, expires_at) values ('00000000-0000-4000-8000-0000000001a1', gen_random_uuid(), 'busy', now() + interval '90 seconds')$q$, '23514'),
      -- invitations: TTL cap 30 min, expiry before creation, outcome <-> consumed, consumed XOR revoked, bad outcome
      ($q$insert into public.cira_invitations (creator_id, token_hash, expires_at) values ('00000000-0000-4000-8000-0000000001a1', sha256('t1'::bytea), now() + interval '31 minutes')$q$, '23514'),
      ($q$insert into public.cira_invitations (creator_id, token_hash, expires_at) values ('00000000-0000-4000-8000-0000000001a1', sha256('t2'::bytea), now() - interval '1 second')$q$, '23514'),
      ($q$insert into public.cira_invitations (creator_id, token_hash, expires_at, outcome) values ('00000000-0000-4000-8000-0000000001a1', sha256('t3'::bytea), now() + interval '15 minutes', 'accepted')$q$, '23514'),
      ($q$insert into public.cira_invitations (creator_id, token_hash, expires_at, consumed_at) values ('00000000-0000-4000-8000-0000000001a1', sha256('t4'::bytea), now() + interval '15 minutes', now())$q$, '23514'),
      ($q$insert into public.cira_invitations (creator_id, token_hash, expires_at, consumed_at, outcome, revoked_at) values ('00000000-0000-4000-8000-0000000001a1', sha256('t5'::bytea), now() + interval '15 minutes', now(), 'accepted', now())$q$, '23514'),
      ($q$insert into public.cira_invitations (creator_id, token_hash, expires_at, consumed_at, outcome) values ('00000000-0000-4000-8000-0000000001a1', sha256('t6'::bytea), now() + interval '15 minutes', now(), 'maybe')$q$, '23514'),
      -- rate limits: negative counter
      ($q$insert into private.cira_rate_limits (user_id, action, window_start, count) values ('00000000-0000-4000-8000-0000000001a1', 'x', now(), -1)$q$, '23514'),
      -- unique: duplicate handle
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-0000000001c3', 'f01_alice', 'Fake')$q$, '23505'),
      -- FK: profile without auth user, friendship without profile
      ($q$insert into public.cira_profiles (user_id, handle, display_name) values ('00000000-0000-4000-8000-00000000dead', 'f01_ghost', 'G')$q$, '23503'),
      ($q$insert into public.cira_friendships (requester_id, addressee_id, status) values ('00000000-0000-4000-8000-0000000001c3', '00000000-0000-4000-8000-0000000001a1', 'pending')$q$, '23503')
    ) as t(stmt, state)
  loop
    begin
      execute rec.stmt;
      raise exception 'TEST_FAILED: statement did not fail: %', rec.stmt;
    exception
      when others then
        if sqlstate <> rec.state then
          raise exception 'TEST_FAILED: expected % got % (%) for: %',
            rec.state, sqlstate, sqlerrm, rec.stmt;
        end if;
    end;
  end loop;
end;
$do$;

-- Valid edges are accepted: presence TTL exactly 120 s, invitation TTL
-- exactly 30 min.
insert into public.cira_presence (user_id, session_id, state, expires_at)
values ('00000000-0000-4000-8000-0000000001a1', gen_random_uuid(), 'online',
        now() + interval '120 seconds');
insert into public.cira_invitations (creator_id, token_hash, expires_at)
values ('00000000-0000-4000-8000-0000000001a1', sha256('edge30min'::bytea),
        now() + interval '30 minutes');

-- Generated pair columns: canonical regardless of direction, and the pair
-- unique index rejects the reversed duplicate.
do $do$
declare
  v_low uuid;
  v_high uuid;
begin
  insert into public.cira_friendships (requester_id, addressee_id, status)
  values ('00000000-0000-4000-8000-0000000001b2',  -- requester = the HIGH uuid
          '00000000-0000-4000-8000-0000000001a1', 'pending')
  returning user_low, user_high into v_low, v_high;

  if v_low <> '00000000-0000-4000-8000-0000000001a1'
     or v_high <> '00000000-0000-4000-8000-0000000001b2' then
    raise exception 'TEST_FAILED: user_low/user_high not canonical: % / %', v_low, v_high;
  end if;

  begin
    insert into public.cira_friendships (requester_id, addressee_id, status)
    values ('00000000-0000-4000-8000-0000000001a1',
            '00000000-0000-4000-8000-0000000001b2', 'pending');
    raise exception 'TEST_FAILED: reversed duplicate pair accepted';
  exception
    when unique_violation then null;
  end;

  -- duplicate block PK
  insert into public.cira_blocks (blocker_id, blocked_id)
  values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000001b2');
  begin
    insert into public.cira_blocks (blocker_id, blocked_id)
    values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000001b2');
    raise exception 'TEST_FAILED: duplicate block accepted';
  exception
    when unique_violation then null;
  end;

  -- duplicate token_hash
  begin
    insert into public.cira_invitations (creator_id, token_hash, expires_at)
    values ('00000000-0000-4000-8000-0000000001a1', sha256('edge30min'::bytea),
            now() + interval '15 minutes');
    raise exception 'TEST_FAILED: duplicate token_hash accepted';
  exception
    when unique_violation then null;
  end;
end;
$do$;

\echo '01_constraints OK'
