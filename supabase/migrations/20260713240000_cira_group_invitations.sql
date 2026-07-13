-- CIRA complete: private group invitations by relationship and opaque link.
-- Pending rows are deleted on accept, decline, cancellation or revocation:
-- CIRA keeps no invitation-response history.

create table public.cira_group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.cira_groups (id) on delete cascade,
  inviter_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  invitee_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint cira_group_invites_no_self check (inviter_id <> invitee_id),
  constraint cira_group_invites_ttl
    check (expires_at > created_at and expires_at - created_at <= interval '7 days')
);

create unique index cira_group_invites_target_key
  on public.cira_group_invites (group_id, invitee_id);
create index cira_group_invites_invitee_idx
  on public.cira_group_invites (invitee_id, expires_at desc);

create table public.cira_group_links (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.cira_groups (id) on delete cascade,
  creator_id uuid not null references public.cira_profiles (user_id) on delete cascade,
  token_hash bytea not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint cira_group_links_ttl
    check (expires_at > created_at and expires_at - created_at <= interval '24 hours')
);

create unique index cira_group_links_token_hash_key
  on public.cira_group_links (token_hash);
create index cira_group_links_group_expires_idx
  on public.cira_group_links (group_id, expires_at desc);

revoke all on table public.cira_group_invites from public, anon, authenticated;
revoke all on table public.cira_group_links from public, anon, authenticated;
alter table public.cira_group_invites enable row level security;
alter table public.cira_group_links enable row level security;

------------------------------------------------------------------------------
-- Direct invitations: accepted CIRA relations only, never public discovery.
------------------------------------------------------------------------------
create function public.cira_invite_group_member(p_group_id uuid, p_user_id uuid)
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
  v_role := private.cira_group_role(p_group_id, v_uid);
  if v_role not in ('owner', 'admin') then raise exception 'GROUP_FORBIDDEN'; end if;
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

  select * into v_group from public.cira_groups where id = p_group_id for update;
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

create function public.cira_list_group_invites()
returns setof jsonb
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
  delete from public.cira_group_invites
  where expires_at <= now()
    and (invitee_id = v_uid or inviter_id = v_uid
      or private.cira_group_role(group_id, v_uid) in ('owner', 'admin'));

  return query
  select jsonb_build_object(
    'invitation_id', i.id,
    'group_id', g.id,
    'group_name', g.name,
    'group_avatar_key', g.avatar_key,
    'direction', case when i.invitee_id = v_uid then 'incoming' else 'outgoing' end,
    'inviter_id', inviter.user_id,
    'inviter_handle', inviter.handle,
    'inviter_display_name', inviter.display_name,
    'invitee_id', invitee.user_id,
    'invitee_handle', invitee.handle,
    'invitee_display_name', invitee.display_name,
    'created_at', i.created_at,
    'expires_at', i.expires_at
  )
  from public.cira_group_invites i
  join public.cira_groups g on g.id = i.group_id
  join public.cira_profiles inviter on inviter.user_id = i.inviter_id
  join public.cira_profiles invitee on invitee.user_id = i.invitee_id
  where (i.invitee_id = v_uid
      or private.cira_group_role(i.group_id, v_uid) in ('owner', 'admin'))
    and not private.cira_any_block(v_uid,
      case when i.invitee_id = v_uid then i.inviter_id else i.invitee_id end)
  order by i.created_at desc, i.id;
end;
$$;

create function public.cira_accept_group_invite(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_invite public.cira_group_invites;
  v_group public.cira_groups;
  v_count integer;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  select * into v_invite from public.cira_group_invites
  where id = p_invitation_id and invitee_id = v_uid for update;
  if not found or v_invite.expires_at <= now()
     or private.cira_any_block(v_uid, v_invite.inviter_id) then
    raise exception 'GROUP_INVITE_UNAVAILABLE';
  end if;
  select * into v_group from public.cira_groups where id = v_invite.group_id for update;
  if not found then raise exception 'GROUP_INVITE_UNAVAILABLE'; end if;
  select count(*) into v_count from public.cira_group_members where group_id = v_group.id;
  if v_count >= v_group.max_members then raise exception 'GROUP_FULL'; end if;

  insert into public.cira_group_members (group_id, user_id, role, invited_by)
  values (v_group.id, v_uid, 'member', v_invite.inviter_id)
  on conflict (group_id, user_id) do nothing;
  delete from public.cira_group_invites where id = v_invite.id;
  update public.cira_groups set updated_at = now() where id = v_group.id;
  return jsonb_build_object('group_id', v_group.id, 'status', 'ok');
end;
$$;

create function public.cira_decline_group_invite(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  delete from public.cira_group_invites
  where id = p_invitation_id and invitee_id = v_uid;
  if not found then raise exception 'GROUP_INVITE_UNAVAILABLE'; end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.cira_cancel_group_invite(p_invitation_id uuid)
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
  if not found or (v_invite.inviter_id <> v_uid
      and private.cira_group_role(v_invite.group_id, v_uid) not in ('owner', 'admin')) then
    raise exception 'GROUP_INVITE_UNAVAILABLE';
  end if;
  delete from public.cira_group_invites where id = v_invite.id;
  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- Opaque, short-lived, single-use group links.
------------------------------------------------------------------------------
create function public.cira_create_group_link(p_group_id uuid, p_ttl_seconds integer default 900)
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
  if private.cira_group_role(p_group_id, v_uid) not in ('owner', 'admin') then
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

create function public.cira_list_group_links(p_group_id uuid)
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
  if private.cira_group_role(p_group_id, v_uid) not in ('owner', 'admin') then
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

create function public.cira_preview_group_link(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_link public.cira_group_links;
  v_group public.cira_groups;
  v_creator public.cira_profiles;
  v_count integer;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform private.cira_enforce_rate_limit(v_uid, 'group_link_redeem', 10, interval '5 minutes');
  select * into v_link from public.cira_group_links
  where token_hash = private.cira_hash_invite_code(p_code);
  if not found or v_link.expires_at <= now()
     or private.cira_group_role(v_link.group_id, v_uid) is not null
     or private.cira_any_block(v_uid, v_link.creator_id) then
    raise exception 'GROUP_INVITE_UNAVAILABLE';
  end if;
  select * into v_group from public.cira_groups where id = v_link.group_id;
  select * into v_creator from public.cira_profiles where user_id = v_link.creator_id;
  select count(*) into v_count from public.cira_group_members where group_id = v_link.group_id;
  if v_count >= v_group.max_members then raise exception 'GROUP_INVITE_UNAVAILABLE'; end if;
  return jsonb_build_object(
    'group_id', v_group.id, 'group_name', v_group.name,
    'group_description', v_group.description, 'group_avatar_key', v_group.avatar_key,
    'member_count', v_count, 'creator_handle', v_creator.handle,
    'creator_display_name', v_creator.display_name, 'expires_at', v_link.expires_at);
end;
$$;

create function public.cira_accept_group_link(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_link public.cira_group_links;
  v_group public.cira_groups;
  v_count integer;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform private.cira_enforce_rate_limit(v_uid, 'group_link_redeem', 10, interval '5 minutes');
  select * into v_link from public.cira_group_links
  where token_hash = private.cira_hash_invite_code(p_code) for update;
  if not found or v_link.expires_at <= now()
     or private.cira_group_role(v_link.group_id, v_uid) is not null
     or private.cira_any_block(v_uid, v_link.creator_id) then
    raise exception 'GROUP_INVITE_UNAVAILABLE';
  end if;
  select * into v_group from public.cira_groups where id = v_link.group_id for update;
  select count(*) into v_count from public.cira_group_members where group_id = v_group.id;
  if v_count >= v_group.max_members then raise exception 'GROUP_FULL'; end if;
  insert into public.cira_group_members (group_id, user_id, role, invited_by)
  values (v_group.id, v_uid, 'member', v_link.creator_id);
  delete from public.cira_group_links where id = v_link.id;
  update public.cira_groups set updated_at = now() where id = v_group.id;
  return jsonb_build_object('group_id', v_group.id, 'status', 'ok');
end;
$$;

create function public.cira_revoke_group_link(p_link_id uuid)
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
  if not found or (v_link.creator_id <> v_uid
      and private.cira_group_role(v_link.group_id, v_uid) not in ('owner', 'admin')) then
    raise exception 'GROUP_INVITE_UNAVAILABLE';
  end if;
  delete from public.cira_group_links where id = v_link.id;
  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- Realtime invalidations
------------------------------------------------------------------------------
create function private.cira_tg_group_invites_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.cira_notify(array[
    coalesce(new.inviter_id, old.inviter_id),
    coalesce(new.invitee_id, old.invitee_id)
  ] || private.cira_group_member_ids(coalesce(new.group_id, old.group_id)));
  return null;
end;
$$;
create function private.cira_tg_group_links_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.cira_notify(array[coalesce(new.creator_id, old.creator_id)]);
  return null;
end;
$$;
revoke all on function private.cira_tg_group_invites_notify() from public, anon, authenticated;
revoke all on function private.cira_tg_group_links_notify() from public, anon, authenticated;
create trigger cira_group_invites_notify after insert or update or delete
  on public.cira_group_invites for each row execute function private.cira_tg_group_invites_notify();
create trigger cira_group_links_notify after insert or delete
  on public.cira_group_links for each row execute function private.cira_tg_group_links_notify();

------------------------------------------------------------------------------
-- API privileges
------------------------------------------------------------------------------
revoke all on function public.cira_invite_group_member(uuid, uuid) from public, anon;
revoke all on function public.cira_list_group_invites() from public, anon;
revoke all on function public.cira_accept_group_invite(uuid) from public, anon;
revoke all on function public.cira_decline_group_invite(uuid) from public, anon;
revoke all on function public.cira_cancel_group_invite(uuid) from public, anon;
revoke all on function public.cira_create_group_link(uuid, integer) from public, anon;
revoke all on function public.cira_list_group_links(uuid) from public, anon;
revoke all on function public.cira_preview_group_link(text) from public, anon;
revoke all on function public.cira_accept_group_link(text) from public, anon;
revoke all on function public.cira_revoke_group_link(uuid) from public, anon;
grant execute on function public.cira_invite_group_member(uuid, uuid) to authenticated;
grant execute on function public.cira_list_group_invites() to authenticated;
grant execute on function public.cira_accept_group_invite(uuid) to authenticated;
grant execute on function public.cira_decline_group_invite(uuid) to authenticated;
grant execute on function public.cira_cancel_group_invite(uuid) to authenticated;
grant execute on function public.cira_create_group_link(uuid, integer) to authenticated;
grant execute on function public.cira_list_group_links(uuid) to authenticated;
grant execute on function public.cira_preview_group_link(text) to authenticated;
grant execute on function public.cira_accept_group_link(text) to authenticated;
grant execute on function public.cira_revoke_group_link(uuid) to authenticated;

