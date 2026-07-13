-- Transactional two-account smoke recipe for deployed remote VARA RPCs.
-- Run with:
--   supabase db query --linked --file scripts/vara/remote-smoke.sql
-- Every synthetic account and row is rolled back.

begin;
set local statement_timeout = '30s';

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000fa01', 'vara-smoke-a@example.invalid', now(), '{"provider":"email","providers":["email"],"cira_beta":true}', '{}', now(), now()),
  ('00000000-0000-4000-8000-00000000fa02', 'vara-smoke-b@example.invalid', now(), '{"provider":"email","providers":["email"],"cira_beta":true}', '{}', now(), now());

create temporary table vara_smoke_state (key text primary key, value jsonb not null) on commit drop;
grant select, insert, update on vara_smoke_state to authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000fa01","role":"authenticated"}', true);
set local role authenticated;
select public.cira_upsert_profile('vara_smoke_a', 'VARA Smoke A', null);
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000fa02","role":"authenticated"}', true);
set local role authenticated;
select public.cira_upsert_profile('vara_smoke_b', 'VARA Smoke B', null);
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000fa01","role":"authenticated"}', true);
set local role authenticated;
select public.cira_send_request('vara_smoke_b');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000fa02","role":"authenticated"}', true);
set local role authenticated;
insert into vara_smoke_state
select 'friendship_id', to_jsonb(friendship_id)
from public.cira_list_relationships()
where handle = 'vara_smoke_a' and direction = 'incoming';
select public.cira_accept_request((select (value #>> '{}')::uuid from vara_smoke_state where key = 'friendship_id'));
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000fa01","role":"authenticated"}', true);
set local role authenticated;
insert into vara_smoke_state
select 'room_id', result -> 'room_id' from (select public.vara_create_room(3600, 4) result) q;
insert into vara_smoke_state
select 'initial_topic', result -> 'topic' from (
  select public.vara_get_room((select (value #>> '{}')::uuid from vara_smoke_state where key = 'room_id')) result
) q;
insert into vara_smoke_state
select 'invite_id', public.vara_invite_member(
  (select (value #>> '{}')::uuid from vara_smoke_state where key = 'room_id'),
  '00000000-0000-4000-8000-00000000fa02'
) -> 'invitation_id';
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000fa02","role":"authenticated"}', true);
set local role authenticated;
select public.vara_accept_room_invite((select (value #>> '{}')::uuid from vara_smoke_state where key = 'invite_id'));
insert into vara_smoke_state
select 'member_count', to_jsonb(jsonb_array_length(result -> 'members')) from (
  select public.vara_get_room((select (value #>> '{}')::uuid from vara_smoke_state where key = 'room_id')) result
) q;
reset role;

do $$
begin
  if (select (value #>> '{}')::integer from vara_smoke_state where key = 'member_count') <> 2 then
    raise exception 'VARA_REMOTE_SMOKE_FAILED: expected two admitted members';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000fa01","role":"authenticated"}', true);
set local role authenticated;
insert into vara_smoke_state
select 'link_code', to_jsonb(result ->> 'code') from (
  select public.vara_create_room_link(
    (select (value #>> '{}')::uuid from vara_smoke_state where key = 'room_id'), 300, 1
  ) result
) q;
select public.vara_transfer_host(
  (select (value #>> '{}')::uuid from vara_smoke_state where key = 'room_id'),
  '00000000-0000-4000-8000-00000000fa02'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000fa02","role":"authenticated"}', true);
set local role authenticated;
insert into vara_smoke_state
select 'host_id', result -> 'host_id' from (
  select public.vara_get_room((select (value #>> '{}')::uuid from vara_smoke_state where key = 'room_id')) result
) q;
insert into vara_smoke_state
select 'final_topic', result -> 'topic' from (
  select public.vara_get_room((select (value #>> '{}')::uuid from vara_smoke_state where key = 'room_id')) result
) q;
reset role;

do $$
begin
  if (select value #>> '{}' from vara_smoke_state where key = 'host_id') <> '00000000-0000-4000-8000-00000000fa02' then
    raise exception 'VARA_REMOTE_SMOKE_FAILED: host transfer did not persist';
  end if;
  if (select value from vara_smoke_state where key = 'initial_topic') =
     (select value from vara_smoke_state where key = 'final_topic') then
    raise exception 'VARA_REMOTE_SMOKE_FAILED: security topic did not rotate';
  end if;
  if exists (
    select 1 from public.vara_room_links l
    where l.token_hash = private.cira_hash_invite_code(
      (select value #>> '{}' from vara_smoke_state where key = 'link_code')
    ) and octet_length(l.token_hash) = 32
  ) then null;
  else
    raise exception 'VARA_REMOTE_SMOKE_FAILED: invitation hash not found';
  end if;
end;
$$;

select jsonb_build_object(
  'status', 'pass', 'accounts', 2, 'friendship', true, 'room', true,
  'direct_invitation', true, 'members', 2, 'hashed_link', true,
  'host_transfer', true, 'persistent_test_data', false
) as vara_remote_smoke;

rollback;
