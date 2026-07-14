-- CIRA groups authorization hardening: null-safe role guards.
--
-- private.cira_group_role() returns NULL for a non-member. In SQL,
-- `NULL <> 'owner'` and `NULL not in ('owner','admin')` evaluate to NULL, and
-- `if NULL then raise` does NOT raise. Nine group RPCs therefore skipped their
-- role guard entirely for callers who are not members of the target group:
-- any authenticated beta profile knowing a group id could update, delete or
-- take over that group, mint admission links for it, or cancel its invites.
--
-- This migration re-creates those nine functions with explicit null-safe
-- guards (`v_role is null or …` / `coalesce(role, '') …`). Bodies are
-- otherwise byte-identical to their previous definitions.

------------------------------------------------------------------------------
-- From 20260713230000_cira_groups_rpc.sql
------------------------------------------------------------------------------

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
    'created_at', v_group.created_at,
    'updated_at', v_group.updated_at
  );
end;
$$;

create or replace function public.cira_delete_group(p_group_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform 1 from public.cira_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  if coalesce(private.cira_group_role(p_group_id, v_uid), '') <> 'owner' then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  delete from public.cira_groups where id = p_group_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.cira_set_group_role(p_group_id uuid, p_user_id uuid, p_role text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_target_role text;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform 1 from public.cira_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_FORBIDDEN'; end if;
  if coalesce(private.cira_group_role(p_group_id, v_uid), '') <> 'owner' then
    raise exception 'GROUP_FORBIDDEN';
  end if;
  if p_role not in ('admin', 'member') or p_user_id = v_uid then
    raise exception 'INVALID_GROUP_ROLE';
  end if;
  v_target_role := private.cira_group_role(p_group_id, p_user_id);
  if v_target_role is null or v_target_role = 'owner' then
    raise exception 'GROUP_MEMBER_NOT_FOUND';
  end if;

  update public.cira_group_members set role = p_role
  where group_id = p_group_id and user_id = p_user_id;
  update public.cira_groups set updated_at = now() where id = p_group_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.cira_transfer_group_ownership(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform 1 from public.cira_groups where id = p_group_id for update;
  if coalesce(private.cira_group_role(p_group_id, v_uid), '') <> 'owner' then
    raise exception 'GROUP_FORBIDDEN';
  end if;
  if p_user_id = v_uid or private.cira_group_role(p_group_id, p_user_id) is null then
    raise exception 'GROUP_MEMBER_NOT_FOUND';
  end if;

  -- Demote first to satisfy the partial unique owner index, then promote.
  update public.cira_group_members set role = 'admin'
  where group_id = p_group_id and user_id = v_uid;
  update public.cira_group_members set role = 'owner'
  where group_id = p_group_id and user_id = p_user_id;
  update public.cira_groups
  set owner_id = p_user_id, updated_at = now()
  where id = p_group_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- From 20260713240000_cira_group_invitations.sql
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

create or replace function public.cira_cancel_group_invite(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_invite public.cira_group_invites;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  select * into v_invite from public.cira_group_invites where id = p_invitation_id for update;
  if found then
    perform 1 from public.cira_groups where id = v_invite.group_id for update;
  end if;
  if not found or (v_invite.inviter_id <> v_uid
      and coalesce(private.cira_group_role(v_invite.group_id, v_uid), '')
          not in ('owner', 'admin')) then
    raise exception 'GROUP_INVITE_UNAVAILABLE';
  end if;
  delete from public.cira_group_invites where id = v_invite.id;
  return jsonb_build_object('status', 'ok');
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

create or replace function public.cira_list_group_links(p_group_id uuid)
returns setof jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform 1 from public.cira_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_FORBIDDEN'; end if;
  if coalesce(private.cira_group_role(p_group_id, v_uid), '')
     not in ('owner', 'admin') then
    raise exception 'GROUP_FORBIDDEN';
  end if;
  delete from public.cira_group_links where group_id = p_group_id and expires_at <= now();
  return query
  select jsonb_build_object(
    'link_id', l.id, 'creator_id', l.creator_id,
    'created_at', l.created_at, 'expires_at', l.expires_at)
  from public.cira_group_links l
  where l.group_id = p_group_id
  order by l.created_at desc, l.id;
end;
$$;

create or replace function public.cira_revoke_group_link(p_link_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_link public.cira_group_links;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  select * into v_link from public.cira_group_links where id = p_link_id for update;
  if found then
    perform 1 from public.cira_groups where id = v_link.group_id for update;
  end if;
  if not found or (v_link.creator_id <> v_uid
      and coalesce(private.cira_group_role(v_link.group_id, v_uid), '')
          not in ('owner', 'admin')) then
    raise exception 'GROUP_INVITE_UNAVAILABLE';
  end if;
  delete from public.cira_group_links where id = v_link.id;
  return jsonb_build_object('status', 'ok');
end;
$$;
