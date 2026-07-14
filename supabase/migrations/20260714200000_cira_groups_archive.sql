-- CIRA Groups v2 — archive / restore.
--
-- Archiving freezes admissions and content creation for a group without
-- destroying any data: members, collections and items stay readable, but no new
-- member, invitation, link, collection, item or group-scoped VARA can be added
-- until the group is restored. Blocks and account deletion keep priority over
-- archiving (security > archiving). A nullable column is fully backward
-- compatible: every existing group reads as active.

alter table public.cira_groups
  add column archived_at timestamptz;

create index cira_groups_active_idx
  on public.cira_groups (owner_id, updated_at desc)
  where archived_at is null;

------------------------------------------------------------------------------
-- Helper
------------------------------------------------------------------------------
create function private.cira_group_is_archived(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cira_groups
    where id = p_group_id and archived_at is not null
  );
$$;

revoke all on function private.cira_group_is_archived(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Admission guard: no new membership on an archived group, by ANY path
-- (accept invite, accept link, direct insert). Defence in depth at the row.
-- Re-created from 20260713250000; the archived check is added before the
-- existing block-conflict logic, under the same canonical lock order.
------------------------------------------------------------------------------
create or replace function private.cira_tg_group_members_block_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_user_id uuid;
begin
  perform 1 from public.cira_groups where id = new.group_id for update;
  if private.cira_group_is_archived(new.group_id) then
    raise exception 'GROUP_ARCHIVED';
  end if;
  for v_existing_user_id in
    select m.user_id
    from public.cira_group_members m
    where m.group_id = new.group_id
    order by m.user_id
  loop
    perform private.cira_lock_pair(new.user_id, v_existing_user_id);
  end loop;

  if exists (
    select 1
    from public.cira_group_members existing
    join public.cira_blocks b
      on (b.blocker_id = new.user_id and b.blocked_id = existing.user_id)
      or (b.blocker_id = existing.user_id and b.blocked_id = new.user_id)
    where existing.group_id = new.group_id
  ) then
    raise exception 'GROUP_BLOCK_CONFLICT';
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- Archive / restore RPCs (owner/admin, null-safe, idempotent)
------------------------------------------------------------------------------
create function public.cira_archive_group(p_group_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role text;
  v_group public.cira_groups;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  select * into v_group from public.cira_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  v_role := private.cira_group_role(p_group_id, v_uid);
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'GROUP_FORBIDDEN';
  end if;

  if v_group.archived_at is null then
    -- Pending invitations and links are kept but rendered inert: the admission
    -- trigger refuses any join on an archived group, so accept-invite and
    -- accept-link cannot admit anyone. We deliberately do NOT delete them here —
    -- that would take the invite/link row locks AFTER the group lock, inverting
    -- the invite→group lock order of cira_accept_group_invite/link and
    -- deadlocking under concurrency. Keeping them is also truer to "archive
    -- without destroying data": restore re-enables any that have not expired.
    update public.cira_groups
    set archived_at = now(), updated_at = now()
    where id = p_group_id
    returning * into v_group;
    perform private.cira_notify(private.cira_group_member_ids(p_group_id));
  end if;

  return jsonb_build_object('group_id', v_group.id, 'archived_at', v_group.archived_at, 'status', 'ok');
end;
$$;

create function public.cira_restore_group(p_group_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role text;
  v_group public.cira_groups;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  select * into v_group from public.cira_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  v_role := private.cira_group_role(p_group_id, v_uid);
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'GROUP_FORBIDDEN';
  end if;

  if v_group.archived_at is not null then
    update public.cira_groups
    set archived_at = null, updated_at = now()
    where id = p_group_id
    returning * into v_group;
    perform private.cira_notify(private.cira_group_member_ids(p_group_id));
  end if;

  return jsonb_build_object('group_id', v_group.id, 'archived_at', null, 'status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- Expose archived_at on the read/write surfaces (additive JSON field).
------------------------------------------------------------------------------
create or replace function public.cira_list_groups()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'group_id', g.id,
    'name', g.name,
    'description', g.description,
    'avatar_key', g.avatar_key,
    'max_members', g.max_members,
    'role', mine.role,
    'member_count', (select count(*) from public.cira_group_members c where c.group_id = g.id),
    'archived_at', g.archived_at,
    'created_at', g.created_at,
    'updated_at', g.updated_at
  )
  from public.cira_group_members mine
  join public.cira_groups g on g.id = mine.group_id
  where mine.user_id = private.cira_require_uid()
  order by (g.archived_at is not null), g.updated_at desc, g.id;
$$;

create or replace function public.cira_create_group(
  p_name text,
  p_description text default null,
  p_avatar_key text default null,
  p_max_members integer default 100
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_group public.cira_groups;
  v_description text;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform private.cira_enforce_rate_limit(v_uid, 'group_create', 5, interval '1 hour');

  v_description := nullif(p_description, '');
  if p_name is null or char_length(p_name) not between 1 and 48
     or p_name ~ '[<>[:cntrl:]]'
     or (v_description is not null and
         (char_length(v_description) > 240 or v_description ~ '[<>[:cntrl:]]'))
     or (p_avatar_key is not null and
         p_avatar_key !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$')
     or p_max_members not between 2 and 250 then
    raise exception 'INVALID_GROUP';
  end if;

  insert into public.cira_groups (owner_id, name, description, avatar_key, max_members)
  values (v_uid, p_name, v_description, p_avatar_key, p_max_members)
  returning * into v_group;

  insert into public.cira_group_members (group_id, user_id, role)
  values (v_group.id, v_uid, 'owner');

  return jsonb_build_object(
    'group_id', v_group.id,
    'name', v_group.name,
    'description', v_group.description,
    'avatar_key', v_group.avatar_key,
    'max_members', v_group.max_members,
    'role', 'owner',
    'member_count', 1,
    'archived_at', null,
    'created_at', v_group.created_at,
    'updated_at', v_group.updated_at
  );
end;
$$;

create or replace function public.cira_update_group(
  p_group_id uuid,
  p_name text,
  p_description text default null,
  p_avatar_key text default null,
  p_max_members integer default 100
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role text;
  v_count integer;
  v_group public.cira_groups;
  v_description text;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform 1 from public.cira_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  v_role := private.cira_group_role(p_group_id, v_uid);
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'GROUP_FORBIDDEN';
  end if;

  v_description := nullif(p_description, '');
  if p_name is null or char_length(p_name) not between 1 and 48
     or p_name ~ '[<>[:cntrl:]]'
     or (v_description is not null and
         (char_length(v_description) > 240 or v_description ~ '[<>[:cntrl:]]'))
     or (p_avatar_key is not null and
         p_avatar_key !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$')
     or p_max_members not between 2 and 250 then
    raise exception 'INVALID_GROUP';
  end if;

  select count(*) into v_count
  from public.cira_group_members where group_id = p_group_id;
  if p_max_members < v_count then raise exception 'GROUP_CAP_TOO_SMALL'; end if;

  update public.cira_groups
  set name = p_name,
      description = v_description,
      avatar_key = p_avatar_key,
      max_members = p_max_members,
      updated_at = now()
  where id = p_group_id
  returning * into v_group;

  return jsonb_build_object(
    'group_id', v_group.id,
    'name', v_group.name,
    'description', v_group.description,
    'avatar_key', v_group.avatar_key,
    'max_members', v_group.max_members,
    'role', v_role,
    'member_count', v_count,
    'archived_at', v_group.archived_at,
    'created_at', v_group.created_at,
    'updated_at', v_group.updated_at
  );
end;
$$;

------------------------------------------------------------------------------
-- Freeze content-creation paths on an archived group (GROUP_ARCHIVED).
-- Re-created from 20260714100000 / 20260713240000 with the archived guard.
------------------------------------------------------------------------------
create or replace function public.cira_invite_group_member(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role text;
  v_group public.cira_groups;
  v_member_count integer;
  v_pending_count integer;
  v_invite public.cira_group_invites;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  select * into v_group from public.cira_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_FORBIDDEN'; end if;
  v_role := private.cira_group_role(p_group_id, v_uid);
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'GROUP_FORBIDDEN';
  end if;
  if v_group.archived_at is not null then raise exception 'GROUP_ARCHIVED'; end if;
  perform private.cira_lock_pair(v_uid, p_user_id);
  if p_user_id = v_uid or private.cira_any_block(v_uid, p_user_id) then
    raise exception 'GROUP_INVITE_UNAVAILABLE';
  end if;
  if not exists (
    select 1 from public.cira_friendships f
    where f.status = 'accepted'
      and f.user_low = least(v_uid, p_user_id)
      and f.user_high = greatest(v_uid, p_user_id)
  ) then
    raise exception 'GROUP_INVITE_UNAVAILABLE';
  end if;
  if private.cira_group_role(p_group_id, p_user_id) is not null then
    raise exception 'ALREADY_GROUP_MEMBER';
  end if;

  select count(*) into v_member_count from public.cira_group_members where group_id = p_group_id;
  delete from public.cira_group_invites
  where group_id = p_group_id and expires_at <= now();
  select count(*) into v_pending_count from public.cira_group_invites where group_id = p_group_id;
  if v_member_count + v_pending_count >= v_group.max_members then raise exception 'GROUP_FULL'; end if;

  insert into public.cira_group_invites (group_id, inviter_id, invitee_id, expires_at)
  values (p_group_id, v_uid, p_user_id, now() + interval '7 days')
  on conflict (group_id, invitee_id) do update
    set inviter_id = excluded.inviter_id,
        created_at = now(),
        expires_at = excluded.expires_at
  returning * into v_invite;

  return jsonb_build_object('invitation_id', v_invite.id, 'expires_at', v_invite.expires_at);
end;
$$;

create or replace function public.cira_create_group_link(p_group_id uuid, p_ttl_seconds integer default 900)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_code text;
  v_link public.cira_group_links;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform 1 from public.cira_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_FORBIDDEN'; end if;
  if coalesce(private.cira_group_role(p_group_id, v_uid), '')
     not in ('owner', 'admin') then
    raise exception 'GROUP_FORBIDDEN';
  end if;
  if private.cira_group_is_archived(p_group_id) then raise exception 'GROUP_ARCHIVED'; end if;
  if p_ttl_seconds < 300 or p_ttl_seconds > 86400 then raise exception 'INVALID_GROUP_INVITE'; end if;
  perform private.cira_enforce_rate_limit(v_uid, 'group_link_create', 10, interval '1 hour');
  delete from public.cira_group_links where expires_at <= now() and creator_id = v_uid;
  v_code := 'CIRAG' || private.cira_generate_invite_secret();
  insert into public.cira_group_links (group_id, creator_id, token_hash, expires_at)
  values (p_group_id, v_uid, private.cira_hash_invite_code(v_code),
          now() + make_interval(secs => p_ttl_seconds))
  returning * into v_link;
  return jsonb_build_object(
    'link_id', v_link.id, 'code', v_code, 'expires_at', v_link.expires_at);
end;
$$;

------------------------------------------------------------------------------
-- Collections: no creation on an archived group. Re-created from 20260714120000
-- with the archived guard right after the role check.
------------------------------------------------------------------------------
create or replace function public.vara_create_collection(
  p_group_id uuid,
  p_name text,
  p_description text default null,
  p_members_can_edit boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role text;
  v_description text;
  v_col public.vara_collections;
begin
  v_uid := private.vara_require_uid();
  perform 1 from public.cira_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  v_role := private.cira_group_role(p_group_id, v_uid);
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  if private.cira_group_is_archived(p_group_id) then raise exception 'GROUP_ARCHIVED'; end if;

  v_description := nullif(p_description, '');
  if p_name is null or char_length(p_name) not between 1 and 64
     or p_name ~ '[<>[:cntrl:]]'
     or (v_description is not null and
         (char_length(v_description) > 240 or v_description ~ '[<>[:cntrl:]]'))
     or p_members_can_edit is null then
    raise exception 'INVALID_COLLECTION';
  end if;

  if (select count(*) from public.vara_collections c
      where c.group_id = p_group_id) >= 50 then
    raise exception 'COLLECTION_LIMIT_REACHED';
  end if;

  perform private.cira_enforce_rate_limit(
    v_uid, 'vara_collection_create', 15, interval '1 hour'
  );

  insert into public.vara_collections (
    group_id, created_by, updated_by, name, description, members_can_edit
  )
  values (p_group_id, v_uid, v_uid, p_name, v_description, p_members_can_edit)
  returning * into v_col;

  return private.vara_collection_json(v_col.id, v_uid);
end;
$$;

------------------------------------------------------------------------------
-- Collection content is read-only on an archived group. vara_lock_collection is
-- the single serialization point for every collection/item mutation (update,
-- delete, add/remove/move item); guarding it here freezes them all at once,
-- while reads (which never take this lock) stay open. Re-created from
-- 20260714120000 with the archived check after membership is proven.
------------------------------------------------------------------------------
create or replace function private.vara_lock_collection(p_collection_id uuid, p_user_id uuid)
returns public.vara_collections
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_col public.vara_collections;
begin
  select * into v_col from public.vara_collections
  where id = p_collection_id
  for update;
  if not found
     or private.cira_group_role(v_col.group_id, p_user_id) is null then
    raise exception 'COLLECTION_NOT_FOUND';
  end if;
  if private.cira_group_is_archived(v_col.group_id) then
    raise exception 'GROUP_ARCHIVED';
  end if;
  return v_col;
end;
$$;

------------------------------------------------------------------------------
-- VARA from a group context: vara_create_room gains an optional p_group_id so
-- the server can refuse launching a room for an archived group (answers Q1).
-- The prior 2-arg signature is dropped and replaced by a 3-arg one whose last
-- parameter defaults to null, so existing 2-arg calls keep working.
------------------------------------------------------------------------------
drop function if exists public.vara_create_room(integer, integer);

create function public.vara_create_room(
  p_ttl_seconds integer default 14400,
  p_max_members integer default 8,
  p_group_id uuid default null
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

  -- Group-scoped launch (e.g. from a collection): the caller must be a member
  -- of the group and the group must not be archived. Membership existence is
  -- indistinguishable from a missing group.
  if p_group_id is not null then
    if private.cira_group_role(p_group_id, v_uid) is null then
      raise exception 'GROUP_NOT_FOUND';
    end if;
    if private.cira_group_is_archived(p_group_id) then
      raise exception 'GROUP_ARCHIVED';
    end if;
  end if;

  perform private.cira_enforce_rate_limit(
    v_uid, 'vara_create_room', 5, interval '1 hour'
  );

  insert into public.vara_rooms (
    owner_id, host_id, topic, max_members, host_lease_until, expires_at
  )
  values (
    v_uid, v_uid, private.vara_new_topic(), p_max_members,
    now() + interval '90 seconds', now() + make_interval(secs => p_ttl_seconds)
  )
  returning * into v_room;

  insert into public.vara_room_members (room_id, user_id)
  values (v_room.id, v_uid);

  return private.vara_room_json(v_room.id, v_uid);
end;
$$;

------------------------------------------------------------------------------
-- API privileges
------------------------------------------------------------------------------
revoke all on function public.cira_archive_group(uuid) from public, anon;
revoke all on function public.cira_restore_group(uuid) from public, anon;
revoke all on function public.vara_create_room(integer, integer, uuid) from public, anon;

grant execute on function public.cira_archive_group(uuid) to authenticated;
grant execute on function public.cira_restore_group(uuid) to authenticated;
grant execute on function public.vara_create_room(integer, integer, uuid) to authenticated;
