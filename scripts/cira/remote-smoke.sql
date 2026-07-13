-- Transactional CIRA smoke recipe for a linked Supabase project.
--
-- The two synthetic auth accounts and every CIRA row are rolled back. This
-- validates the deployed auth gate, RPCs, RLS-visible views, presence, groups,
-- and cross-surface blocking without leaving test identities or user data.
-- Run with:
--   supabase db query --linked --file scripts/cira/remote-smoke.sql

begin;
set local statement_timeout = '30s';

insert into auth.users (
  id,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-00000000be01',
    'cira-beta-smoke-a@example.invalid',
    now(),
    '{"provider":"email","providers":["email"],"cira_beta":true}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-00000000be02',
    'cira-beta-smoke-b@example.invalid',
    now(),
    '{"provider":"email","providers":["email"],"cira_beta":true}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

create temporary table cira_remote_smoke_state (
  key text primary key,
  value jsonb not null
) on commit drop;
grant select, insert, update on cira_remote_smoke_state to authenticated;

-- Account A creates its minimal profile.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000be01","role":"authenticated"}',
  true
);
set local role authenticated;
select public.cira_upsert_profile('cira_beta_smoke_a', 'CIRA Beta Smoke A', null);
reset role;

-- Account B creates its profile.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000be02","role":"authenticated"}',
  true
);
set local role authenticated;
select public.cira_upsert_profile('cira_beta_smoke_b', 'CIRA Beta Smoke B', null);
reset role;

-- A sends the blind handle request; B retrieves the real incoming request.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000be01","role":"authenticated"}',
  true
);
set local role authenticated;
select public.cira_send_request('cira_beta_smoke_b');
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000be02","role":"authenticated"}',
  true
);
set local role authenticated;
insert into cira_remote_smoke_state (key, value)
select 'request_id', to_jsonb(friendship_id)
from public.cira_list_relationships()
where handle = 'cira_beta_smoke_a'
  and status = 'pending'
  and direction = 'incoming';
reset role;

do $$
begin
  if not exists (
    select 1 from cira_remote_smoke_state where key = 'request_id'
  ) then
    raise exception 'REMOTE_SMOKE_FAILED: B did not receive A request';
  end if;
end;
$$;

-- B accepts and publishes opt-in presence; A must see it as an accepted peer.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000be02","role":"authenticated"}',
  true
);
set local role authenticated;
select public.cira_accept_request(
  (select (value #>> '{}')::uuid
   from cira_remote_smoke_state where key = 'request_id')
);
select public.cira_set_presence_consent(true);
select public.cira_heartbeat_presence(
  '00000000-0000-4000-8000-00000000be12',
  'online'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000be01","role":"authenticated"}',
  true
);
set local role authenticated;
insert into cira_remote_smoke_state (key, value)
select 'presence', to_jsonb(presence)
from public.cira_list_relationships()
where handle = 'cira_beta_smoke_b'
  and status = 'accepted';
reset role;

do $$
begin
  if (select value #>> '{}' from cira_remote_smoke_state where key = 'presence') <> 'online' then
    raise exception 'REMOTE_SMOKE_FAILED: accepted peer presence is not visible';
  end if;
end;
$$;

-- A creates a private group, invites its accepted peer, and B joins it.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000be01","role":"authenticated"}',
  true
);
set local role authenticated;
insert into cira_remote_smoke_state (key, value)
select 'group_id', public.cira_create_group(
  'CIRA remote smoke',
  'Transactional production recipe',
  null,
  8
) -> 'group_id';

insert into cira_remote_smoke_state (key, value)
select 'group_invitation_id', public.cira_invite_group_member(
  (select (value #>> '{}')::uuid
   from cira_remote_smoke_state where key = 'group_id'),
  '00000000-0000-4000-8000-00000000be02'
) -> 'invitation_id';
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000be02","role":"authenticated"}',
  true
);
set local role authenticated;
select public.cira_accept_group_invite(
  (select (value #>> '{}')::uuid
   from cira_remote_smoke_state where key = 'group_invitation_id')
);
insert into cira_remote_smoke_state (key, value)
select 'group_count', to_jsonb(count(*))
from public.cira_list_groups();
reset role;

do $$
begin
  if (select (value #>> '{}')::integer from cira_remote_smoke_state where key = 'group_count') <> 1 then
    raise exception 'REMOTE_SMOKE_FAILED: B did not join A group';
  end if;
end;
$$;

-- A block is a hard boundary: relationship and shared group disappear for B.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000be02","role":"authenticated"}',
  true
);
set local role authenticated;
select public.cira_block_user('00000000-0000-4000-8000-00000000be01');
insert into cira_remote_smoke_state (key, value)
select 'relationships_after_block', to_jsonb(count(*))
from public.cira_list_relationships();
insert into cira_remote_smoke_state (key, value)
select 'groups_after_block', to_jsonb(count(*))
from public.cira_list_groups();
reset role;

do $$
begin
  if (select (value #>> '{}')::integer from cira_remote_smoke_state where key = 'relationships_after_block') <> 0 then
    raise exception 'REMOTE_SMOKE_FAILED: block retained a relationship';
  end if;
  if (select (value #>> '{}')::integer from cira_remote_smoke_state where key = 'groups_after_block') <> 0 then
    raise exception 'REMOTE_SMOKE_FAILED: block retained a shared group';
  end if;
end;
$$;

select jsonb_build_object(
  'status', 'pass',
  'accounts', 2,
  'profile', true,
  'friendship', true,
  'presence', true,
  'group_invitation', true,
  'blocking_boundary', true,
  'persistent_test_data', false
) as cira_remote_smoke;

rollback;
