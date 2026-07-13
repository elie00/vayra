-- VARA remote invitations: CIRA-only direct invites, hashed links and blocks.
\echo '=== 17_vara_invites ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000017a1'),
  ('00000000-0000-4000-8000-0000000017b2'),
  ('00000000-0000-4000-8000-0000000017c3'),
  ('00000000-0000-4000-8000-0000000017d4');

do $do$
declare
  v_request uuid;
begin
  perform test.login('00000000-0000-4000-8000-0000000017a1');
  perform public.cira_upsert_profile('f17_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000017b2');
  perform public.cira_upsert_profile('f17_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000017c3');
  perform public.cira_upsert_profile('f17_carol', 'Carol');
  perform test.login('00000000-0000-4000-8000-0000000017d4');
  perform public.cira_upsert_profile('f17_dave', 'Dave');

  -- A-B and A-C are accepted CIRA relations; D remains a stranger.
  perform test.login('00000000-0000-4000-8000-0000000017a1');
  perform public.cira_send_request('f17_bob');
  perform test.login('00000000-0000-4000-8000-0000000017b2');
  select friendship_id into v_request from public.cira_list_relationships()
  where handle = 'f17_alice' and direction = 'incoming';
  perform public.cira_accept_request(v_request);

  perform test.login('00000000-0000-4000-8000-0000000017a1');
  perform public.cira_send_request('f17_carol');
  perform test.login('00000000-0000-4000-8000-0000000017c3');
  select friendship_id into v_request from public.cira_list_relationships()
  where handle = 'f17_alice' and direction = 'incoming';
  perform public.cira_accept_request(v_request);
end;
$do$;

create temporary table vara_invite_state (key text primary key, value text);
grant select on vara_invite_state to authenticated;

-- A creates a room and directly invites friend B. Stranger D is rejected.
do $do$
declare
  v_room jsonb;
  v_invite jsonb;
begin
  perform test.login('00000000-0000-4000-8000-0000000017a1');
  v_room := public.vara_create_room(3600, 4);
  v_invite := public.vara_invite_member(
    (v_room ->> 'room_id')::uuid,
    '00000000-0000-4000-8000-0000000017b2'
  );
  perform test.logout();
  insert into vara_invite_state values
    ('room_id', v_room ->> 'room_id'),
    ('topic_1', v_room ->> 'topic'),
    ('direct_invite_id', v_invite ->> 'invitation_id');

  perform test.login('00000000-0000-4000-8000-0000000017a1');
  begin
    perform public.vara_invite_member(
      (v_room ->> 'room_id')::uuid,
      '00000000-0000-4000-8000-0000000017d4'
    );
    raise exception 'TEST_FAILED: stranger received direct VARA invite';
  exception when others then
    if sqlerrm <> 'VARA_INVITE_UNAVAILABLE' then raise; end if;
  end;
end;
$do$;

-- B sees and accepts the direct invitation. Admission rotates the topic.
do $do$
declare
  v_listed uuid;
  v_room uuid := (select value::uuid from vara_invite_state where key = 'room_id');
begin
  perform test.login('00000000-0000-4000-8000-0000000017b2');
  select (x ->> 'invitation_id')::uuid into v_listed
  from public.vara_list_room_invites() x
  where x ->> 'direction' = 'incoming';
  if v_listed <> (select value::uuid from vara_invite_state where key = 'direct_invite_id') then
    raise exception 'TEST_FAILED: direct invite not listed for B';
  end if;
  perform public.vara_accept_room_invite(v_listed);
  perform test.logout();

  if not exists (
    select 1 from public.vara_room_members
    where room_id = v_room and user_id = '00000000-0000-4000-8000-0000000017b2'
  ) then
    raise exception 'TEST_FAILED: B not admitted';
  end if;
  if (select topic from public.vara_rooms where id = v_room)
       = (select value from vara_invite_state where key = 'topic_1') then
    raise exception 'TEST_FAILED: direct admission did not rotate topic';
  end if;
end;
$do$;

-- A creates a one-use link. The secret is never persisted in plaintext.
-- D gets the same generic error as any unusable token; friend C can accept it.
do $do$
declare
  v_room uuid := (select value::uuid from vara_invite_state where key = 'room_id');
  v_link jsonb;
  v_preview jsonb;
  v_before_topic text;
begin
  perform test.login('00000000-0000-4000-8000-0000000017a1');
  v_link := public.vara_create_room_link(v_room, 900, 1);
  perform test.logout();
  insert into vara_invite_state values
    ('link_code', v_link ->> 'code'),
    ('link_id', v_link ->> 'link_id');

  if v_link ->> 'code' !~ '^VARA[0-9A-HJKMNP-TV-Z]{20}$'
     or v_link ->> 'url' <> 'https://vayra.eybo.tech/vara/invite#t=' || (v_link ->> 'code') then
    raise exception 'TEST_FAILED: invalid VARA link payload: %', v_link;
  end if;
  if exists (
    select 1 from public.vara_room_links
    where id = (v_link ->> 'link_id')::uuid
      and encode(token_hash, 'hex') = lower(v_link ->> 'code')
  ) then
    raise exception 'TEST_FAILED: room link stored plaintext secret';
  end if;

  perform test.login('00000000-0000-4000-8000-0000000017d4');
  v_preview := public.vara_preview_room_link(v_link ->> 'code');
  if v_preview <> '{"error":"VARA_INVITE_UNAVAILABLE"}'::jsonb then
    raise exception 'TEST_FAILED: stranger link preview leaked: %', v_preview;
  end if;

  perform test.login('00000000-0000-4000-8000-0000000017c3');
  v_preview := public.vara_preview_room_link(v_link ->> 'code');
  if v_preview ->> 'creator_handle' <> 'f17_alice' then
    raise exception 'TEST_FAILED: friend preview failed: %', v_preview;
  end if;
  perform test.logout();
  select topic into v_before_topic from public.vara_rooms where id = v_room;

  perform test.login('00000000-0000-4000-8000-0000000017c3');
  perform public.vara_accept_room_link(v_link ->> 'code');
  perform test.logout();

  if exists (select 1 from public.vara_room_links where id = (v_link ->> 'link_id')::uuid)
     or not exists (
       select 1 from public.vara_room_members
       where room_id = v_room and user_id = '00000000-0000-4000-8000-0000000017c3'
     )
     or (select topic from public.vara_rooms where id = v_room) = v_before_topic then
    raise exception 'TEST_FAILED: one-use link admission not consumed/rotated';
  end if;
end;
$do$;

-- Blocking the room owner removes the blocker from the shared room and rotates
-- the topic. A later link stays unusable to the blocked account.
do $do$
declare
  v_room uuid := (select value::uuid from vara_invite_state where key = 'room_id');
  v_before_topic text;
  v_link jsonb;
  v_preview jsonb;
begin
  perform test.logout();
  select topic into v_before_topic from public.vara_rooms where id = v_room;
  perform test.login('00000000-0000-4000-8000-0000000017b2');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000017a1');
  perform test.logout();
  if exists (
    select 1 from public.vara_room_members
    where room_id = v_room and user_id = '00000000-0000-4000-8000-0000000017b2'
  ) or (select topic from public.vara_rooms where id = v_room) = v_before_topic then
    raise exception 'TEST_FAILED: CIRA block did not remove/rotate VARA';
  end if;

  perform test.login('00000000-0000-4000-8000-0000000017a1');
  v_link := public.vara_create_room_link(v_room, 900, 1);
  perform test.login('00000000-0000-4000-8000-0000000017b2');
  v_preview := public.vara_preview_room_link(v_link ->> 'code');
  if v_preview <> '{"error":"VARA_INVITE_UNAVAILABLE"}'::jsonb then
    raise exception 'TEST_FAILED: blocked user can preview VARA link';
  end if;
end;
$do$;

-- Storage and RPC exposure audit.
do $do$
declare
  anon_exec integer;
begin
  perform test.logout();
  if has_table_privilege('authenticated', 'public.vara_room_invites', 'select')
     or has_table_privilege('authenticated', 'public.vara_room_links', 'select') then
    raise exception 'TEST_FAILED: VARA invitation tables exposed';
  end if;
  select count(*) into anon_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'vara_%'
    and has_function_privilege('anon', p.oid, 'execute');
  if anon_exec <> 0 then
    raise exception 'TEST_FAILED: anon can execute % VARA RPCs', anon_exec;
  end if;
end;
$do$;

\echo '17_vara_invites OK'
