-- VARA remote rooms: private membership and a server-authoritative host lease.
--
-- Privacy boundary: these tables never store media identifiers, sources,
-- URLs, playback positions, history, IP addresses, devices, addons or Stremio
-- state. Playback intent remains ephemeral on a private Realtime channel.

create table public.vara_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  host_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  topic text not null unique,
  status text not null default 'active',
  max_members integer not null default 8,
  host_epoch bigint not null default 1,
  host_lease_until timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint vara_rooms_topic_valid
    check (topic ~ '^vara:[0-9a-f]{32}$'),
  constraint vara_rooms_status_valid
    check (status in ('active', 'closed')),
  constraint vara_rooms_capacity_valid
    check (max_members between 2 and 16),
  constraint vara_rooms_epoch_positive
    check (host_epoch > 0),
  constraint vara_rooms_expiry_valid
    check (expires_at > created_at and expires_at <= created_at + interval '24 hours')
);

create index vara_rooms_owner_created_idx
  on public.vara_rooms (owner_id, created_at desc);
create index vara_rooms_expiry_idx
  on public.vara_rooms (expires_at)
  where status = 'active';

create table public.vara_room_members (
  room_id uuid not null references public.vara_rooms (id) on delete cascade,
  user_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  invited_by uuid references public.cira_profiles (user_id) on delete set null,
  joined_at timestamptz not null default now(),

  constraint vara_room_members_pkey primary key (room_id, user_id),
  constraint vara_room_members_inviter_valid
    check (invited_by is null or invited_by <> user_id)
);

create index vara_room_members_user_joined_idx
  on public.vara_room_members (user_id, joined_at desc);

revoke all on table public.vara_rooms from public, anon, authenticated;
revoke all on table public.vara_room_members from public, anon, authenticated;
alter table public.vara_rooms enable row level security;
alter table public.vara_room_members enable row level security;

-------------------------------------------------------------------------------
-- Private helpers
-------------------------------------------------------------------------------

create function private.vara_require_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  return v_uid;
end;
$$;

create function private.vara_new_topic()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'vara:' || replace(gen_random_uuid()::text, '-', '')
$$;

-- Used exclusively by Realtime Authorization. It deliberately returns only a
-- boolean and never exposes room or membership rows to the API role.
create function private.vara_topic_access(
  p_topic text,
  p_require_host boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.cira_beta_access()
    and exists (
      select 1
      from public.vara_rooms r
      join public.vara_room_members m
        on m.room_id = r.id and m.user_id = auth.uid()
      where r.topic = p_topic
        and r.status = 'active'
        and r.expires_at > now()
        and (
          not p_require_host
          or (r.host_id = auth.uid() and r.host_lease_until > now())
        )
    )
$$;

create function private.vara_room_json(p_room_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'room_id', r.id,
    'owner_id', r.owner_id,
    'host_id', r.host_id,
    'topic', r.topic,
    'host_epoch', r.host_epoch,
    'host_lease_until', r.host_lease_until,
    'max_members', r.max_members,
    'created_at', r.created_at,
    'expires_at', r.expires_at,
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', p.user_id,
          'handle', p.handle,
          'display_name', p.display_name,
          'avatar_key', p.avatar_key,
          'is_host', p.user_id = r.host_id,
          'joined_at', m.joined_at
        ) order by m.joined_at, p.user_id
      )
      from public.vara_room_members m
      join public.cira_profiles p on p.user_id = m.user_id
      where m.room_id = r.id
        and not private.cira_any_block(p_user_id, m.user_id)
    ), '[]'::jsonb)
  )
  from public.vara_rooms r
  where r.id = p_room_id
    and r.status = 'active'
    and r.expires_at > now()
    and exists (
      select 1 from public.vara_room_members mine
      where mine.room_id = r.id and mine.user_id = p_user_id
    )
$$;

revoke all on function private.vara_require_uid() from public, anon, authenticated;
revoke all on function private.vara_new_topic() from public, anon, authenticated;
revoke all on function private.vara_topic_access(text, boolean) from public, anon;
revoke all on function private.vara_room_json(uuid, uuid) from public, anon, authenticated;
grant execute on function private.vara_topic_access(text, boolean) to authenticated;

-------------------------------------------------------------------------------
-- Base room lifecycle RPCs
-------------------------------------------------------------------------------

create function public.vara_create_room(
  p_ttl_seconds integer default 14400,
  p_max_members integer default 8
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_room public.vara_rooms;
begin
  v_uid := private.vara_require_uid();
  if p_ttl_seconds not between 900 and 86400
     or p_max_members not between 2 and 16 then
    raise exception 'INVALID_VARA_ROOM';
  end if;

  perform private.cira_enforce_rate_limit(
    v_uid, 'vara_create_room', 5, interval '1 hour'
  );

  insert into public.vara_rooms (
    owner_id,
    host_id,
    topic,
    max_members,
    host_lease_until,
    expires_at
  )
  values (
    v_uid,
    v_uid,
    private.vara_new_topic(),
    p_max_members,
    now() + interval '90 seconds',
    now() + make_interval(secs => p_ttl_seconds)
  )
  returning * into v_room;

  insert into public.vara_room_members (room_id, user_id)
  values (v_room.id, v_uid);

  return private.vara_room_json(v_room.id, v_uid);
end;
$$;

create function public.vara_get_room(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_result jsonb;
begin
  v_uid := private.vara_require_uid();
  select private.vara_room_json(p_room_id, v_uid) into v_result;
  if v_result is null then
    raise exception 'VARA_ROOM_UNAVAILABLE';
  end if;
  return v_result;
end;
$$;

create function public.vara_list_rooms()
returns setof jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_room_id uuid;
begin
  v_uid := private.vara_require_uid();

  delete from public.vara_rooms
  where status = 'active' and expires_at <= now();

  for v_room_id in
    select m.room_id
    from public.vara_room_members m
    join public.vara_rooms r on r.id = m.room_id
    where m.user_id = v_uid and r.status = 'active' and r.expires_at > now()
    order by m.joined_at desc, m.room_id
  loop
    return next private.vara_room_json(v_room_id, v_uid);
  end loop;
  return;
end;
$$;

create function public.vara_close_room(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_users uuid[];
begin
  v_uid := private.vara_require_uid();
  perform 1 from public.vara_rooms
  where id = p_room_id and owner_id = v_uid
  for update;
  if not found then
    raise exception 'VARA_ROOM_FORBIDDEN';
  end if;

  select coalesce(array_agg(user_id), '{}') into v_users
  from public.vara_room_members where room_id = p_room_id;
  delete from public.vara_rooms where id = p_room_id;
  perform private.cira_notify(v_users);
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.vara_leave_room(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_room public.vara_rooms;
  v_next_host uuid;
  v_users uuid[];
begin
  v_uid := private.vara_require_uid();
  select * into v_room from public.vara_rooms
  where id = p_room_id for update;
  if not found or not exists (
    select 1 from public.vara_room_members
    where room_id = p_room_id and user_id = v_uid
  ) then
    raise exception 'VARA_ROOM_UNAVAILABLE';
  end if;

  if v_room.owner_id = v_uid then
    select coalesce(array_agg(user_id), '{}') into v_users
    from public.vara_room_members where room_id = p_room_id;
    delete from public.vara_rooms where id = p_room_id;
    perform private.cira_notify(v_users);
    return jsonb_build_object('status', 'closed');
  end if;

  delete from public.vara_room_members
  where room_id = p_room_id and user_id = v_uid;

  if v_room.host_id = v_uid then
    select user_id into v_next_host
    from public.vara_room_members
    where room_id = p_room_id
    order by joined_at, user_id
    limit 1;
  else
    v_next_host := v_room.host_id;
  end if;

  update public.vara_rooms
  set host_id = v_next_host,
      host_epoch = case when v_next_host <> v_room.host_id
                        then host_epoch + 1 else host_epoch end,
      host_lease_until = case when v_next_host <> v_room.host_id
                              then now() + interval '90 seconds'
                              else host_lease_until end,
      topic = private.vara_new_topic()
  where id = p_room_id;

  select coalesce(array_agg(user_id), '{}') into v_users
  from public.vara_room_members where room_id = p_room_id;
  perform private.cira_notify(v_users || array[v_uid]);
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.vara_renew_host_lease(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_until timestamptz;
begin
  v_uid := private.vara_require_uid();
  update public.vara_rooms
  set host_lease_until = case
        when host_lease_until < now() + interval '60 seconds'
          then now() + interval '90 seconds'
        else host_lease_until
      end
  where id = p_room_id
    and status = 'active'
    and expires_at > now()
    and host_id = v_uid
    and exists (
      select 1 from public.vara_room_members m
      where m.room_id = p_room_id and m.user_id = v_uid
    )
  returning host_lease_until into v_until;
  if not found then
    raise exception 'VARA_NOT_HOST';
  end if;
  return jsonb_build_object('host_lease_until', v_until);
end;
$$;

create function public.vara_claim_host(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_room public.vara_rooms;
  v_users uuid[];
begin
  v_uid := private.vara_require_uid();
  select * into v_room from public.vara_rooms
  where id = p_room_id and status = 'active' and expires_at > now()
  for update;
  if not found or not exists (
    select 1 from public.vara_room_members
    where room_id = p_room_id and user_id = v_uid
  ) then
    raise exception 'VARA_ROOM_UNAVAILABLE';
  end if;
  if v_room.host_lease_until > now()
     and exists (
       select 1 from public.vara_room_members
       where room_id = p_room_id and user_id = v_room.host_id
     ) then
    raise exception 'VARA_HOST_LEASE_ACTIVE';
  end if;

  update public.vara_rooms
  set host_id = v_uid,
      host_epoch = host_epoch + 1,
      host_lease_until = now() + interval '90 seconds',
      topic = private.vara_new_topic()
  where id = p_room_id;

  select coalesce(array_agg(user_id), '{}') into v_users
  from public.vara_room_members where room_id = p_room_id;
  perform private.cira_notify(v_users);
  return private.vara_room_json(p_room_id, v_uid);
end;
$$;

create function public.vara_transfer_host(p_room_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_users uuid[];
begin
  v_uid := private.vara_require_uid();
  perform 1 from public.vara_rooms
  where id = p_room_id and host_id = v_uid
    and status = 'active' and expires_at > now()
  for update;
  if not found or p_user_id = v_uid or not exists (
    select 1 from public.vara_room_members
    where room_id = p_room_id and user_id = p_user_id
  ) then
    raise exception 'VARA_HOST_TRANSFER_UNAVAILABLE';
  end if;

  update public.vara_rooms
  set host_id = p_user_id,
      host_epoch = host_epoch + 1,
      host_lease_until = now() + interval '90 seconds',
      topic = private.vara_new_topic()
  where id = p_room_id;

  select coalesce(array_agg(user_id), '{}') into v_users
  from public.vara_room_members where room_id = p_room_id;
  perform private.cira_notify(v_users);
  return private.vara_room_json(p_room_id, v_uid);
end;
$$;

revoke all on function public.vara_create_room(integer, integer) from public, anon;
revoke all on function public.vara_get_room(uuid) from public, anon;
revoke all on function public.vara_list_rooms() from public, anon;
revoke all on function public.vara_close_room(uuid) from public, anon;
revoke all on function public.vara_leave_room(uuid) from public, anon;
revoke all on function public.vara_renew_host_lease(uuid) from public, anon;
revoke all on function public.vara_claim_host(uuid) from public, anon;
revoke all on function public.vara_transfer_host(uuid, uuid) from public, anon;

grant execute on function public.vara_create_room(integer, integer) to authenticated;
grant execute on function public.vara_get_room(uuid) to authenticated;
grant execute on function public.vara_list_rooms() to authenticated;
grant execute on function public.vara_close_room(uuid) to authenticated;
grant execute on function public.vara_leave_room(uuid) to authenticated;
grant execute on function public.vara_renew_host_lease(uuid) to authenticated;
grant execute on function public.vara_claim_host(uuid) to authenticated;
grant execute on function public.vara_transfer_host(uuid, uuid) to authenticated;

-------------------------------------------------------------------------------
-- Private Realtime channel authorization
-------------------------------------------------------------------------------

create policy vara_receive_room_channel
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.vara_topic_access((select realtime.topic()), false)
    and realtime.messages.topic = (select realtime.topic())
  );

create policy vara_send_room_channel
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.topic = (select realtime.topic())
    and (
      (
        realtime.messages.extension = 'presence'
        and private.vara_topic_access((select realtime.topic()), false)
      )
      or
      (
        realtime.messages.extension = 'broadcast'
        and realtime.messages.event in ('cmd', 'snapshot-request')
        and private.vara_topic_access((select realtime.topic()), false)
      )
      or
      (
        realtime.messages.extension = 'broadcast'
        and realtime.messages.event in ('state', 'snapshot')
        and private.vara_topic_access((select realtime.topic()), true)
      )
    )
  );
