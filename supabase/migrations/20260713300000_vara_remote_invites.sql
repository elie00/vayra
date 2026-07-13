-- VARA remote invitations through CIRA relationships.
-- Direct invitations and opaque, short-lived links admit authenticated CIRA
-- profiles only. Link secrets are returned once and stored only as SHA-256.

create table public.vara_room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.vara_rooms (id) on delete cascade,
  inviter_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  invitee_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint vara_room_invites_unique unique (room_id, invitee_id),
  constraint vara_room_invites_pair_valid check (inviter_id <> invitee_id),
  constraint vara_room_invites_expiry_valid
    check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);

create index vara_room_invites_invitee_expiry_idx
  on public.vara_room_invites (invitee_id, expires_at);

create table public.vara_room_links (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.vara_rooms (id) on delete cascade,
  creator_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  token_hash bytea not null unique,
  max_uses integer not null default 1,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint vara_room_links_uses_valid
    check (max_uses between 1 and 15 and use_count between 0 and max_uses),
  constraint vara_room_links_expiry_valid
    check (expires_at > created_at and expires_at <= created_at + interval '1 hour')
);

create index vara_room_links_room_expiry_idx
  on public.vara_room_links (room_id, expires_at desc);

revoke all on table public.vara_room_invites from public, anon, authenticated;
revoke all on table public.vara_room_links from public, anon, authenticated;
alter table public.vara_room_invites enable row level security;
alter table public.vara_room_links enable row level security;

-------------------------------------------------------------------------------
-- Admission helpers
-------------------------------------------------------------------------------

create function private.vara_are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cira_friendships f
    where f.status = 'accepted'
      and f.user_low = least(p_a, p_b)
      and f.user_high = greatest(p_a, p_b)
  ) and not private.cira_any_block(p_a, p_b)
$$;

create function private.vara_is_manager(p_room_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vara_rooms r
    join public.vara_room_members m
      on m.room_id = r.id and m.user_id = p_user_id
    where r.id = p_room_id
      and r.status = 'active'
      and r.expires_at > now()
      and p_user_id in (r.owner_id, r.host_id)
  )
$$;

-- Room row is the serialization boundary for capacity, topic rotation and
-- concurrent block/admission. Returns false with no partial write.
create function private.vara_admit_member(
  p_room_id uuid,
  p_user_id uuid,
  p_invited_by uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.vara_rooms;
  v_count integer;
  v_users uuid[];
begin
  select * into v_room from public.vara_rooms
  where id = p_room_id and status = 'active' and expires_at > now()
  for update;
  if not found then return false; end if;

  if exists (
    select 1 from public.vara_room_members
    where room_id = p_room_id and user_id = p_user_id
  ) then
    return true;
  end if;

  select count(*) into v_count
  from public.vara_room_members where room_id = p_room_id;
  if v_count >= v_room.max_members then return false; end if;

  if exists (
    select 1 from public.vara_room_members m
    where m.room_id = p_room_id
      and private.cira_any_block(p_user_id, m.user_id)
  ) then
    return false;
  end if;

  insert into public.vara_room_members (room_id, user_id, invited_by)
  values (p_room_id, p_user_id, p_invited_by);
  update public.vara_rooms
  set topic = private.vara_new_topic()
  where id = p_room_id;

  select coalesce(array_agg(user_id), '{}') into v_users
  from public.vara_room_members where room_id = p_room_id;
  perform private.cira_notify(v_users);
  return true;
end;
$$;

revoke all on function private.vara_are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function private.vara_is_manager(uuid, uuid) from public, anon, authenticated;
revoke all on function private.vara_admit_member(uuid, uuid, uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Direct CIRA invitations
-------------------------------------------------------------------------------

create function public.vara_invite_member(p_room_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_room public.vara_rooms;
  v_invite public.vara_room_invites;
  v_count integer;
begin
  v_uid := private.vara_require_uid();
  select * into v_room from public.vara_rooms
  where id = p_room_id and status = 'active' and expires_at > now()
  for update;
  if not found or not private.vara_is_manager(p_room_id, v_uid)
     or p_user_id = v_uid
     or not private.vara_are_friends(v_uid, p_user_id) then
    raise exception 'VARA_INVITE_UNAVAILABLE';
  end if;

  if exists (
    select 1 from public.vara_room_members
    where room_id = p_room_id and user_id = p_user_id
  ) then
    raise exception 'ALREADY_VARA_MEMBER';
  end if;
  select count(*) into v_count from public.vara_room_members where room_id = p_room_id;
  if v_count >= v_room.max_members then raise exception 'VARA_ROOM_FULL'; end if;

  perform private.cira_enforce_rate_limit(
    v_uid, 'vara_direct_invite', 20, interval '1 hour'
  );
  insert into public.vara_room_invites (
    room_id, inviter_id, invitee_id, expires_at
  )
  values (
    p_room_id, v_uid, p_user_id,
    least(v_room.expires_at, now() + interval '7 days')
  )
  on conflict (room_id, invitee_id) do update
    set inviter_id = excluded.inviter_id,
        created_at = now(),
        expires_at = excluded.expires_at
  returning * into v_invite;

  perform private.cira_notify(array[v_uid, p_user_id]);
  return jsonb_build_object(
    'invitation_id', v_invite.id,
    'expires_at', v_invite.expires_at
  );
end;
$$;

create function public.vara_list_room_invites()
returns setof jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := private.vara_require_uid();
  delete from public.vara_room_invites
  where expires_at <= now()
    and (invitee_id = v_uid or inviter_id = v_uid);

  return query
  select jsonb_build_object(
    'invitation_id', i.id,
    'room_id', i.room_id,
    'direction', case when i.invitee_id = v_uid then 'incoming' else 'outgoing' end,
    'inviter_id', inviter.user_id,
    'inviter_handle', inviter.handle,
    'inviter_display_name', inviter.display_name,
    'invitee_id', invitee.user_id,
    'invitee_handle', invitee.handle,
    'invitee_display_name', invitee.display_name,
    'member_count', (select count(*) from public.vara_room_members m where m.room_id = i.room_id),
    'created_at', i.created_at,
    'expires_at', i.expires_at
  )
  from public.vara_room_invites i
  join public.vara_rooms r on r.id = i.room_id
  join public.cira_profiles inviter on inviter.user_id = i.inviter_id
  join public.cira_profiles invitee on invitee.user_id = i.invitee_id
  where r.status = 'active' and r.expires_at > now()
    and (i.invitee_id = v_uid
      or (i.inviter_id = v_uid and private.vara_is_manager(i.room_id, v_uid)))
    and not private.cira_any_block(i.inviter_id, i.invitee_id)
  order by i.created_at desc, i.id;
end;
$$;

create function public.vara_accept_room_invite(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_invite public.vara_room_invites;
begin
  v_uid := private.vara_require_uid();
  select * into v_invite from public.vara_room_invites
  where id = p_invitation_id and invitee_id = v_uid
  for update;
  if not found or v_invite.expires_at <= now()
     or not private.vara_are_friends(v_invite.inviter_id, v_uid)
     or not private.vara_admit_member(
       v_invite.room_id, v_uid, v_invite.inviter_id
     ) then
    raise exception 'VARA_INVITE_UNAVAILABLE';
  end if;

  delete from public.vara_room_invites where id = v_invite.id;
  perform private.cira_notify(array[v_invite.inviter_id, v_uid]);
  return private.vara_room_json(v_invite.room_id, v_uid);
end;
$$;

create function public.vara_decline_room_invite(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_inviter uuid;
begin
  v_uid := private.vara_require_uid();
  delete from public.vara_room_invites
  where id = p_invitation_id and invitee_id = v_uid
  returning inviter_id into v_inviter;
  if not found then raise exception 'VARA_INVITE_UNAVAILABLE'; end if;
  perform private.cira_notify(array[v_inviter, v_uid]);
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.vara_cancel_room_invite(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_invite public.vara_room_invites;
begin
  v_uid := private.vara_require_uid();
  select * into v_invite from public.vara_room_invites
  where id = p_invitation_id for update;
  if not found or (
    v_invite.inviter_id <> v_uid
    and not private.vara_is_manager(v_invite.room_id, v_uid)
  ) then
    raise exception 'VARA_INVITE_UNAVAILABLE';
  end if;
  delete from public.vara_room_invites where id = v_invite.id;
  perform private.cira_notify(array[v_invite.inviter_id, v_invite.invitee_id]);
  return jsonb_build_object('status', 'ok');
end;
$$;

-------------------------------------------------------------------------------
-- Opaque room links
-------------------------------------------------------------------------------

create function public.vara_create_room_link(
  p_room_id uuid,
  p_ttl_seconds integer default 900,
  p_max_uses integer default 1
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
  v_code text;
  v_link public.vara_room_links;
  i integer;
begin
  v_uid := private.vara_require_uid();
  select * into v_room from public.vara_rooms
  where id = p_room_id and status = 'active' and expires_at > now()
  for update;
  if not found or not private.vara_is_manager(p_room_id, v_uid)
     or p_ttl_seconds not between 300 and 3600
     or p_max_uses not between 1 and least(15, v_room.max_members - 1) then
    raise exception 'INVALID_VARA_INVITE';
  end if;

  perform private.cira_enforce_rate_limit(
    v_uid, 'vara_link_create', 10, interval '1 hour'
  );
  for i in 1..5 loop
    v_code := 'VARA' || private.cira_generate_invite_secret();
    begin
      insert into public.vara_room_links (
        room_id, creator_id, token_hash, max_uses, expires_at
      )
      values (
        p_room_id,
        v_uid,
        private.cira_hash_invite_code(v_code),
        p_max_uses,
        least(v_room.expires_at, now() + make_interval(secs => p_ttl_seconds))
      )
      returning * into v_link;
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;

  return jsonb_build_object(
    'link_id', v_link.id,
    'code', v_code,
    'url', 'https://vayra.eybo.tech/vara/invite#t=' || v_code,
    'max_uses', v_link.max_uses,
    'expires_at', v_link.expires_at
  );
end;
$$;

create function public.vara_list_room_links(p_room_id uuid)
returns setof jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := private.vara_require_uid();
  if not private.vara_is_manager(p_room_id, v_uid) then
    raise exception 'VARA_ROOM_FORBIDDEN';
  end if;
  delete from public.vara_room_links
  where room_id = p_room_id and expires_at <= now();
  return query
  select jsonb_build_object(
    'link_id', l.id,
    'creator_id', l.creator_id,
    'max_uses', l.max_uses,
    'use_count', l.use_count,
    'created_at', l.created_at,
    'expires_at', l.expires_at
  )
  from public.vara_room_links l
  where l.room_id = p_room_id
  order by l.created_at desc, l.id;
end;
$$;

create function public.vara_preview_room_link(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_link public.vara_room_links;
  v_creator public.cira_profiles;
  v_count integer;
begin
  v_uid := private.vara_require_uid();
  perform private.cira_enforce_rate_limit(
    v_uid, 'vara_link_preview', 30, interval '15 minutes'
  );
  if p_code is null
     or private.cira_normalize_invite_code(p_code)
        !~ '^VARA[0-9A-HJKMNP-TV-Z]{20}$' then
    return jsonb_build_object('error', 'VARA_INVITE_UNAVAILABLE');
  end if;

  select l.* into v_link
  from public.vara_room_links l
  join public.vara_rooms r on r.id = l.room_id
  where l.token_hash = private.cira_hash_invite_code(p_code)
    and l.expires_at > now() and l.use_count < l.max_uses
    and r.status = 'active' and r.expires_at > now()
    and exists (
      select 1 from public.vara_room_members m
      where m.room_id = l.room_id and m.user_id = l.creator_id
    );
  if not found or not private.vara_are_friends(v_uid, v_link.creator_id) then
    return jsonb_build_object('error', 'VARA_INVITE_UNAVAILABLE');
  end if;

  select * into v_creator from public.cira_profiles
  where user_id = v_link.creator_id;
  select count(*) into v_count from public.vara_room_members
  where room_id = v_link.room_id;
  return jsonb_build_object(
    'room_id', v_link.room_id,
    'creator_handle', v_creator.handle,
    'creator_display_name', v_creator.display_name,
    'member_count', v_count,
    'expires_at', v_link.expires_at
  );
end;
$$;

create function public.vara_accept_room_link(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_link public.vara_room_links;
begin
  v_uid := private.vara_require_uid();
  perform private.cira_enforce_rate_limit(
    v_uid, 'vara_link_accept', 20, interval '15 minutes'
  );
  if p_code is null
     or private.cira_normalize_invite_code(p_code)
        !~ '^VARA[0-9A-HJKMNP-TV-Z]{20}$' then
    return jsonb_build_object('error', 'VARA_INVITE_UNAVAILABLE');
  end if;

  select * into v_link from public.vara_room_links
  where token_hash = private.cira_hash_invite_code(p_code)
  for update;
  if not found or v_link.expires_at <= now()
     or v_link.use_count >= v_link.max_uses
     or not private.vara_are_friends(v_uid, v_link.creator_id)
     or not exists (
       select 1 from public.vara_room_members
       where room_id = v_link.room_id and user_id = v_link.creator_id
     )
     or not private.vara_admit_member(
       v_link.room_id, v_uid, v_link.creator_id
     ) then
    return jsonb_build_object('error', 'VARA_INVITE_UNAVAILABLE');
  end if;

  update public.vara_room_links
  set use_count = use_count + 1
  where id = v_link.id;
  delete from public.vara_room_links
  where id = v_link.id and use_count >= max_uses;
  perform private.cira_notify(array[v_link.creator_id, v_uid]);
  return private.vara_room_json(v_link.room_id, v_uid);
end;
$$;

create function public.vara_revoke_room_link(p_link_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_link public.vara_room_links;
begin
  v_uid := private.vara_require_uid();
  select * into v_link from public.vara_room_links
  where id = p_link_id for update;
  if not found or (
    v_link.creator_id <> v_uid
    and not private.vara_is_manager(v_link.room_id, v_uid)
  ) then
    raise exception 'VARA_INVITE_UNAVAILABLE';
  end if;
  delete from public.vara_room_links where id = v_link.id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-------------------------------------------------------------------------------
-- A CIRA block is also an immediate VARA room boundary. Rotating the opaque
-- topic prevents a removed member from using Realtime's per-connection policy
-- cache to keep observing the old channel.
-------------------------------------------------------------------------------

create function private.vara_tg_cira_block_boundary()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room record;
  v_remove uuid;
  v_next_host uuid;
  v_users uuid[];
begin
  delete from public.vara_room_invites
  where (inviter_id = new.blocker_id and invitee_id = new.blocked_id)
     or (inviter_id = new.blocked_id and invitee_id = new.blocker_id);

  for v_room in
    select r.*
    from public.vara_rooms r
    where exists (
      select 1 from public.vara_room_members a
      where a.room_id = r.id and a.user_id = new.blocker_id
    ) and exists (
      select 1 from public.vara_room_members b
      where b.room_id = r.id and b.user_id = new.blocked_id
    )
    order by r.id
    for update
  loop
    if v_room.owner_id = new.blocker_id then
      v_remove := new.blocked_id;
    else
      v_remove := new.blocker_id;
    end if;

    delete from public.vara_room_members
    where room_id = v_room.id and user_id = v_remove;
    if v_room.host_id = v_remove then
      select user_id into v_next_host
      from public.vara_room_members
      where room_id = v_room.id
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
    where id = v_room.id;

    select coalesce(array_agg(user_id), '{}') into v_users
    from public.vara_room_members where room_id = v_room.id;
    perform private.cira_notify(v_users || array[new.blocker_id, new.blocked_id]);
  end loop;
  return new;
end;
$$;

revoke all on function private.vara_tg_cira_block_boundary()
  from public, anon, authenticated;
create trigger vara_cira_block_boundary
  after insert on public.cira_blocks
  for each row execute function private.vara_tg_cira_block_boundary();

revoke all on function public.vara_invite_member(uuid, uuid) from public, anon;
revoke all on function public.vara_list_room_invites() from public, anon;
revoke all on function public.vara_accept_room_invite(uuid) from public, anon;
revoke all on function public.vara_decline_room_invite(uuid) from public, anon;
revoke all on function public.vara_cancel_room_invite(uuid) from public, anon;
revoke all on function public.vara_create_room_link(uuid, integer, integer) from public, anon;
revoke all on function public.vara_list_room_links(uuid) from public, anon;
revoke all on function public.vara_preview_room_link(text) from public, anon;
revoke all on function public.vara_accept_room_link(text) from public, anon;
revoke all on function public.vara_revoke_room_link(uuid) from public, anon;

grant execute on function public.vara_invite_member(uuid, uuid) to authenticated;
grant execute on function public.vara_list_room_invites() to authenticated;
grant execute on function public.vara_accept_room_invite(uuid) to authenticated;
grant execute on function public.vara_decline_room_invite(uuid) to authenticated;
grant execute on function public.vara_cancel_room_invite(uuid) to authenticated;
grant execute on function public.vara_create_room_link(uuid, integer, integer) to authenticated;
grant execute on function public.vara_list_room_links(uuid) to authenticated;
grant execute on function public.vara_preview_room_link(text) to authenticated;
grant execute on function public.vara_accept_room_link(text) to authenticated;
grant execute on function public.vara_revoke_room_link(uuid) to authenticated;
