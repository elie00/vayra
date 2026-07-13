-- VARA remote rooms: private lifecycle, host lease and Realtime authorization.
\echo '=== 16_vara_rooms ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000016a1'),
  ('00000000-0000-4000-8000-0000000016b2'),
  ('00000000-0000-4000-8000-0000000016c3');

do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000016a1');
  perform public.cira_upsert_profile('f16_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000016b2');
  perform public.cira_upsert_profile('f16_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000016c3');
  perform public.cira_upsert_profile('f16_carol', 'Carol');
end;
$do$;

create temporary table vara_test_state (key text primary key, value text);
grant select on vara_test_state to authenticated;

-- A creates a room. C cannot discover it; direct table grants stay closed.
do $do$
declare
  v jsonb;
begin
  perform test.login('00000000-0000-4000-8000-0000000016a1');
  v := public.vara_create_room(3600, 4);
  perform test.logout();

  if v ->> 'owner_id' <> '00000000-0000-4000-8000-0000000016a1'
     or v ->> 'host_id' <> '00000000-0000-4000-8000-0000000016a1'
     or jsonb_array_length(v -> 'members') <> 1
     or v ->> 'topic' !~ '^vara:[0-9a-f]{32}$' then
    raise exception 'TEST_FAILED: invalid created room payload: %', v;
  end if;

  insert into vara_test_state values
    ('room_id', v ->> 'room_id'),
    ('topic_1', v ->> 'topic');

  if has_table_privilege('authenticated', 'public.vara_rooms', 'select')
     or has_table_privilege('authenticated', 'public.vara_room_members', 'select') then
    raise exception 'TEST_FAILED: VARA base tables exposed to authenticated';
  end if;

  perform test.login('00000000-0000-4000-8000-0000000016c3');
  begin
    perform public.vara_get_room((select value::uuid from vara_test_state where key = 'room_id'));
    raise exception 'TEST_FAILED: non-member discovered room';
  exception when others then
    if sqlerrm <> 'VARA_ROOM_UNAVAILABLE' then raise; end if;
  end;
end;
$do$;

-- Test setup admits B directly; invitation RPCs arrive in the next migration.
do $do$
begin
  perform test.logout();
  insert into public.vara_room_members (room_id, user_id, invited_by)
  values (
    (select value::uuid from vara_test_state where key = 'room_id'),
    '00000000-0000-4000-8000-0000000016b2',
    '00000000-0000-4000-8000-0000000016a1'
  );
end;
$do$;

-- Realtime authorization: members receive; any member may send commands;
-- only the leased host may publish authoritative state/snapshots.
do $do$
declare
  v_room uuid := (select value::uuid from vara_test_state where key = 'room_id');
  v_topic text := (select value from vara_test_state where key = 'topic_1');
  n integer;
begin
  perform test.logout();
  insert into realtime.messages (topic, extension, event, payload, private)
  values (v_topic, 'broadcast', 'state', '{"rev":1}'::jsonb, true);

  perform test.login('00000000-0000-4000-8000-0000000016a1');
  perform set_config('realtime.topic', v_topic, true);
  select count(*) into n from realtime.messages where topic = v_topic;
  if n <> 1 then raise exception 'TEST_FAILED: host cannot receive room topic'; end if;
  insert into realtime.messages (topic, extension, event, payload, private)
  values (v_topic, 'broadcast', 'state', '{"rev":2}'::jsonb, true);

  perform test.login('00000000-0000-4000-8000-0000000016b2');
  perform set_config('realtime.topic', v_topic, true);
  select count(*) into n from realtime.messages where topic = v_topic;
  if n <> 2 then raise exception 'TEST_FAILED: member cannot receive room topic'; end if;
  insert into realtime.messages (topic, extension, event, payload, private)
  values (v_topic, 'broadcast', 'cmd', '{"action":"play"}'::jsonb, true);
  begin
    insert into realtime.messages (topic, extension, event, payload, private)
    values (v_topic, 'broadcast', 'state', '{"rev":3}'::jsonb, true);
    raise exception 'TEST_FAILED: guest published authoritative state';
  exception when insufficient_privilege then null;
  end;

  perform test.login('00000000-0000-4000-8000-0000000016c3');
  perform set_config('realtime.topic', v_topic, true);
  select count(*) into n from realtime.messages where topic = v_topic;
  if n <> 0 then raise exception 'TEST_FAILED: stranger received room messages'; end if;
  begin
    insert into realtime.messages (topic, extension, event, payload, private)
    values (v_topic, 'broadcast', 'cmd', '{}'::jsonb, true);
    raise exception 'TEST_FAILED: stranger sent to room topic';
  exception when insufficient_privilege then null;
  end;

  -- A transfers authority to B. Topic rotation invalidates cached old access.
  perform test.login('00000000-0000-4000-8000-0000000016a1');
  perform public.vara_transfer_host(v_room, '00000000-0000-4000-8000-0000000016b2');
  perform test.logout();
  insert into vara_test_state
  select 'topic_2', topic from public.vara_rooms where id = v_room;
  if (select value from vara_test_state where key = 'topic_2') = v_topic then
    raise exception 'TEST_FAILED: host transfer did not rotate topic';
  end if;
  if (select host_epoch from public.vara_rooms where id = v_room) <> 2 then
    raise exception 'TEST_FAILED: host transfer did not increment epoch';
  end if;
end;
$do$;

-- B leaves while host: A is elected, epoch/topic rotate again. Owner close
-- deletes all room state rather than retaining viewing history.
do $do$
declare
  v_room uuid := (select value::uuid from vara_test_state where key = 'room_id');
  v_topic_2 text := (select value from vara_test_state where key = 'topic_2');
begin
  perform test.login('00000000-0000-4000-8000-0000000016b2');
  perform public.vara_leave_room(v_room);
  perform test.logout();

  if (select host_id from public.vara_rooms where id = v_room)
       <> '00000000-0000-4000-8000-0000000016a1'::uuid
     or (select host_epoch from public.vara_rooms where id = v_room) <> 3
     or (select topic from public.vara_rooms where id = v_room) = v_topic_2 then
    raise exception 'TEST_FAILED: leave did not re-elect and rotate';
  end if;

  perform test.login('00000000-0000-4000-8000-0000000016a1');
  perform public.vara_close_room(v_room);
  perform test.logout();
  if exists (select 1 from public.vara_rooms where id = v_room)
     or exists (select 1 from public.vara_room_members where room_id = v_room) then
    raise exception 'TEST_FAILED: close retained room state';
  end if;
end;
$do$;

\echo '16_vara_rooms OK'
