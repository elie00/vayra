-- CIRA complete: transactional private-group operations.
-- Direct table access remains denied. Every function derives the caller from
-- auth.uid(), verifies membership and returns only caller-authorised data.

------------------------------------------------------------------------------
-- Private helpers
------------------------------------------------------------------------------
create function private.cira_group_role(p_group_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.cira_group_members m
  where m.group_id = p_group_id and m.user_id = p_user_id;
$$;

create function private.cira_group_member_ids(p_group_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id), '{}')
  from public.cira_group_members m
  where m.group_id = p_group_id;
$$;

revoke all on function private.cira_group_role(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.cira_group_member_ids(uuid)
  from public, anon, authenticated;

------------------------------------------------------------------------------
-- Create / edit / delete
------------------------------------------------------------------------------
create function public.cira_create_group(
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
    'created_at', v_group.created_at,
    'updated_at', v_group.updated_at
  );
end;
$$;

create function public.cira_update_group(
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
  v_role := private.cira_group_role(p_group_id, v_uid);
  if v_role is null then raise exception 'GROUP_NOT_FOUND'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'GROUP_FORBIDDEN'; end if;

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

create function public.cira_delete_group(p_group_id uuid)
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
  if private.cira_group_role(p_group_id, v_uid) <> 'owner' then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  delete from public.cira_groups where id = p_group_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- Caller-scoped lists
------------------------------------------------------------------------------
create function public.cira_list_groups()
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
    'created_at', g.created_at,
    'updated_at', g.updated_at
  )
  from public.cira_group_members mine
  join public.cira_groups g on g.id = mine.group_id
  where mine.user_id = private.cira_require_uid()
  order by g.updated_at desc, g.id;
$$;

create function public.cira_list_group_members(p_group_id uuid)
returns setof jsonb
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
  if private.cira_group_role(p_group_id, v_uid) is null then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  return query
  select jsonb_build_object(
    'user_id', p.user_id,
    'handle', p.handle,
    'display_name', p.display_name,
    'avatar_key', p.avatar_key,
    'role', m.role,
    'joined_at', m.joined_at
  )
  from public.cira_group_members m
  join public.cira_profiles p on p.user_id = m.user_id
  where m.group_id = p_group_id
    and (m.user_id = v_uid or not private.cira_any_block(v_uid, m.user_id))
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
           lower(p.display_name), p.user_id;
end;
$$;

------------------------------------------------------------------------------
-- Membership administration
------------------------------------------------------------------------------
create function public.cira_remove_group_member(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_actor_role text;
  v_target_role text;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  v_actor_role := private.cira_group_role(p_group_id, v_uid);
  v_target_role := private.cira_group_role(p_group_id, p_user_id);
  if v_actor_role is null or v_target_role is null then raise exception 'GROUP_MEMBER_NOT_FOUND'; end if;
  if p_user_id = v_uid or v_target_role = 'owner' then raise exception 'GROUP_FORBIDDEN'; end if;
  if v_actor_role = 'member' or (v_actor_role = 'admin' and v_target_role <> 'member') then
    raise exception 'GROUP_FORBIDDEN';
  end if;

  delete from public.cira_group_members
  where group_id = p_group_id and user_id = p_user_id;
  update public.cira_groups set updated_at = now() where id = p_group_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.cira_set_group_role(p_group_id uuid, p_user_id uuid, p_role text)
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
  if private.cira_group_role(p_group_id, v_uid) <> 'owner' then
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

create function public.cira_transfer_group_ownership(p_group_id uuid, p_user_id uuid)
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
  if private.cira_group_role(p_group_id, v_uid) <> 'owner' then
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

create function public.cira_leave_group(p_group_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role text;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  v_role := private.cira_group_role(p_group_id, v_uid);
  if v_role is null then raise exception 'GROUP_NOT_FOUND'; end if;
  if v_role = 'owner' then raise exception 'GROUP_OWNER_MUST_TRANSFER'; end if;

  delete from public.cira_group_members
  where group_id = p_group_id and user_id = v_uid;
  update public.cira_groups set updated_at = now() where id = p_group_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- Realtime invalidation: empty pings only, using the existing private sender.
------------------------------------------------------------------------------
create function private.cira_tg_groups_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cira_notify(private.cira_group_member_ids(coalesce(new.id, old.id)));
  return null;
end;
$$;

create function private.cira_tg_group_members_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := coalesce(new.group_id, old.group_id);
  v_user uuid := coalesce(new.user_id, old.user_id);
begin
  perform private.cira_notify(array[v_user] || private.cira_group_member_ids(v_group));
  return null;
end;
$$;

revoke all on function private.cira_tg_groups_notify()
  from public, anon, authenticated;
revoke all on function private.cira_tg_group_members_notify()
  from public, anon, authenticated;

create trigger cira_groups_notify
  after update on public.cira_groups
  for each row execute function private.cira_tg_groups_notify();
create trigger cira_group_members_notify
  after insert or update or delete on public.cira_group_members
  for each row execute function private.cira_tg_group_members_notify();

------------------------------------------------------------------------------
-- API privileges
------------------------------------------------------------------------------
revoke all on function public.cira_create_group(text, text, text, integer) from public, anon;
revoke all on function public.cira_update_group(uuid, text, text, text, integer) from public, anon;
revoke all on function public.cira_delete_group(uuid) from public, anon;
revoke all on function public.cira_list_groups() from public, anon;
revoke all on function public.cira_list_group_members(uuid) from public, anon;
revoke all on function public.cira_remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.cira_set_group_role(uuid, uuid, text) from public, anon;
revoke all on function public.cira_transfer_group_ownership(uuid, uuid) from public, anon;
revoke all on function public.cira_leave_group(uuid) from public, anon;

grant execute on function public.cira_create_group(text, text, text, integer) to authenticated;
grant execute on function public.cira_update_group(uuid, text, text, text, integer) to authenticated;
grant execute on function public.cira_delete_group(uuid) to authenticated;
grant execute on function public.cira_list_groups() to authenticated;
grant execute on function public.cira_list_group_members(uuid) to authenticated;
grant execute on function public.cira_remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.cira_set_group_role(uuid, uuid, text) to authenticated;
grant execute on function public.cira_transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.cira_leave_group(uuid) to authenticated;

