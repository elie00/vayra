-- VARA Collections v2 — per-collection edit policy and optional collection
-- delegation, so one group can hold editorial and collaborative collections
-- without any new social graph.
--
-- Policy enum (member_policy) replaces the members_can_edit boolean:
--   reader       : read only (editorial).
--   contributor  : a member manages ONLY their own items (add, move/remove own).
--   collaborator : a member edits ANY item (add, move/remove any).
-- members_can_edit is kept as a generated column so existing clients keep
-- working. Backfill maps the old boolean true -> 'contributor' (least
-- privilege, matches the shipped behaviour), false -> 'reader'.
--
-- Delegation: an owner/admin may name a MEMBER as the delegate of a single
-- collection, granting collection management (rename, set policy, delete) —
-- never group admin. Rights cease immediately on group removal, block,
-- deletion, group archival or collection deletion, because every call
-- re-checks membership and archival; a purge trigger also clears dead rows.

------------------------------------------------------------------------------
-- Schema: policy enum (source of truth) + generated members_can_edit.
------------------------------------------------------------------------------
alter table public.vara_collections
  add column member_policy text not null default 'reader'
  check (member_policy in ('reader', 'contributor', 'collaborator'));

update public.vara_collections
  set member_policy = case when members_can_edit then 'contributor' else 'reader' end;

alter table public.vara_collections drop column members_can_edit;

alter table public.vara_collections
  add column members_can_edit boolean
  generated always as (member_policy <> 'reader') stored;

------------------------------------------------------------------------------
-- Delegation table (deny-all, RPC only).
------------------------------------------------------------------------------
create table public.vara_collection_delegates (
  collection_id uuid not null references public.vara_collections (id) on delete cascade,
  user_id       uuid not null references public.cira_profiles (user_id) on delete cascade,
  granted_by    uuid references public.cira_profiles (user_id) on delete set null,
  granted_at    timestamptz not null default now(),
  constraint vara_collection_delegates_pkey primary key (collection_id, user_id)
);
create index vara_collection_delegates_user_idx
  on public.vara_collection_delegates (user_id);

revoke all on table public.vara_collection_delegates from public, anon, authenticated;
alter table public.vara_collection_delegates enable row level security;

------------------------------------------------------------------------------
-- Permission helpers (null-safe; delegation always re-verifies membership).
------------------------------------------------------------------------------
-- Manage = owner/admin of the group, OR an active delegate (still a member).
create or replace function private.vara_collection_can_manage(
  p_col public.vara_collections,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.cira_group_role(p_col.group_id, p_user_id) in ('owner', 'admin')
    or (private.cira_group_role(p_col.group_id, p_user_id) is not null
        and exists (
          select 1 from public.vara_collection_delegates d
          where d.collection_id = p_col.id and d.user_id = p_user_id
        )),
    false);
$$;

-- Edit level: 'full' (any item), 'own' (own items only) or 'none'.
create or replace function private.vara_collection_edit_level(
  p_col public.vara_collections,
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.vara_collection_can_manage(p_col, p_user_id) then 'full'
    when private.cira_group_role(p_col.group_id, p_user_id) = 'member'
         and p_col.member_policy = 'collaborator' then 'full'
    when private.cira_group_role(p_col.group_id, p_user_id) = 'member'
         and p_col.member_policy = 'contributor' then 'own'
    else 'none'
  end;
$$;

-- Kept for compatibility: "can add/edit at all".
create or replace function private.vara_collection_can_edit(
  p_col public.vara_collections,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.vara_collection_edit_level(p_col, p_user_id) <> 'none';
$$;

revoke all on function private.vara_collection_can_manage(public.vara_collections, uuid)
  from public, anon, authenticated;
revoke all on function private.vara_collection_edit_level(public.vara_collections, uuid)
  from public, anon, authenticated;

------------------------------------------------------------------------------
-- JSON surface: expose member_policy, manage/edit capabilities, delegate flag.
------------------------------------------------------------------------------
create or replace function private.vara_collection_json(p_collection_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'collection_id', c.id,
    'group_id', c.group_id,
    'name', c.name,
    'description', c.description,
    'member_policy', c.member_policy,
    'members_can_edit', c.members_can_edit,
    'item_count', (
      select count(*) from public.vara_collection_items i
      where i.collection_id = c.id
    ),
    'created_by', private.vara_profile_card(p_user_id, c.created_by),
    'updated_by', private.vara_profile_card(p_user_id, c.updated_by),
    'my_role', private.cira_group_role(c.group_id, p_user_id),
    'can_manage', private.vara_collection_can_manage(c, p_user_id),
    'is_delegate', exists (
      select 1 from public.vara_collection_delegates d
      where d.collection_id = c.id and d.user_id = p_user_id
    ),
    'can_edit_items', private.vara_collection_edit_level(c, p_user_id) <> 'none',
    'can_edit_all', private.vara_collection_edit_level(c, p_user_id) = 'full',
    'created_at', c.created_at,
    'updated_at', c.updated_at
  )
  from public.vara_collections c
  where c.id = p_collection_id
    and private.cira_group_role(c.group_id, p_user_id) is not null;
$$;

------------------------------------------------------------------------------
-- Manage RPCs now honour delegates; policy has its own RPC.
------------------------------------------------------------------------------
create or replace function public.vara_update_collection(
  p_collection_id uuid,
  p_name text,
  p_description text default null,
  p_members_can_edit boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_col public.vara_collections;
  v_description text;
begin
  v_uid := private.vara_require_uid();
  v_col := private.vara_lock_collection(p_collection_id, v_uid);
  if not private.vara_collection_can_manage(v_col, v_uid) then
    raise exception 'COLLECTION_FORBIDDEN';
  end if;

  v_description := nullif(p_description, '');
  if p_name is null or char_length(p_name) not between 1 and 64
     or p_name ~ '[<>[:cntrl:]]'
     or (v_description is not null and
         (char_length(v_description) > 240 or v_description ~ '[<>[:cntrl:]]')) then
    raise exception 'INVALID_COLLECTION';
  end if;

  update public.vara_collections
  set name = p_name,
      description = v_description,
      -- Legacy boolean maps to contributor/reader; null leaves the policy
      -- untouched so a v2 client can rename without resetting the policy.
      member_policy = case
        when p_members_can_edit is null then member_policy
        when p_members_can_edit then 'contributor'
        else 'reader'
      end,
      updated_by = v_uid,
      updated_at = now()
  where id = p_collection_id;

  return private.vara_collection_json(p_collection_id, v_uid);
end;
$$;

-- Re-created from 20260714200000: insert member_policy (members_can_edit is now
-- a generated column), keep the archived guard and the legacy boolean param.
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
    group_id, created_by, updated_by, name, description, member_policy
  )
  values (
    p_group_id, v_uid, v_uid, p_name, v_description,
    case when p_members_can_edit then 'contributor' else 'reader' end
  )
  returning * into v_col;

  return private.vara_collection_json(v_col.id, v_uid);
end;
$$;

create function public.vara_set_collection_policy(
  p_collection_id uuid,
  p_member_policy text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_col public.vara_collections;
begin
  v_uid := private.vara_require_uid();
  v_col := private.vara_lock_collection(p_collection_id, v_uid);
  if not private.vara_collection_can_manage(v_col, v_uid) then
    raise exception 'COLLECTION_FORBIDDEN';
  end if;
  if p_member_policy is null
     or p_member_policy not in ('reader', 'contributor', 'collaborator') then
    raise exception 'INVALID_COLLECTION_POLICY';
  end if;

  update public.vara_collections
  set member_policy = p_member_policy, updated_by = v_uid, updated_at = now()
  where id = p_collection_id;

  return private.vara_collection_json(p_collection_id, v_uid);
end;
$$;

create or replace function public.vara_delete_collection(p_collection_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_col public.vara_collections;
begin
  v_uid := private.vara_require_uid();
  v_col := private.vara_lock_collection(p_collection_id, v_uid);
  if not private.vara_collection_can_manage(v_col, v_uid) then
    raise exception 'COLLECTION_FORBIDDEN';
  end if;
  delete from public.vara_collections where id = p_collection_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- Item mutations honour the edit level: 'own' restricts move/remove (and the
-- effective scope of add is already the caller) to the caller's own items.
------------------------------------------------------------------------------
create or replace function public.vara_move_collection_item(
  p_item_id uuid,
  p_position integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_item public.vara_collection_items;
  v_col public.vara_collections;
  v_level text;
  v_count integer;
  v_target integer;
begin
  v_uid := private.vara_require_uid();
  if p_position is null or p_position < 1 then
    raise exception 'INVALID_COLLECTION_ITEM';
  end if;
  select i.* into v_item from public.vara_collection_items i where i.id = p_item_id;
  if not found then raise exception 'COLLECTION_NOT_FOUND'; end if;
  v_col := private.vara_lock_collection(v_item.collection_id, v_uid);

  select i.* into v_item from public.vara_collection_items i where i.id = p_item_id;
  if not found then raise exception 'COLLECTION_ITEM_NOT_FOUND'; end if;
  v_level := private.vara_collection_edit_level(v_col, v_uid);
  if v_level = 'none' or (v_level = 'own' and v_item.added_by is distinct from v_uid) then
    raise exception 'COLLECTION_FORBIDDEN';
  end if;

  perform private.cira_enforce_rate_limit(
    v_uid, 'vara_collection_edit', 300, interval '1 hour'
  );

  select count(*) into v_count from public.vara_collection_items i
  where i.collection_id = v_item.collection_id;
  v_target := least(p_position, v_count);

  if v_target <> v_item.position then
    update public.vara_collection_items
    set position = position - 1
    where collection_id = v_item.collection_id and position > v_item.position;
    update public.vara_collection_items
    set position = position + 1
    where collection_id = v_item.collection_id
      and position >= v_target and id <> p_item_id;
    update public.vara_collection_items
    set position = v_target
    where id = p_item_id;
  end if;

  update public.vara_collections
  set updated_by = v_uid, updated_at = now()
  where id = v_item.collection_id;

  return private.vara_collection_item_json(p_item_id, v_uid);
end;
$$;

create or replace function public.vara_remove_collection_item(p_item_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_item public.vara_collection_items;
  v_col public.vara_collections;
  v_level text;
begin
  v_uid := private.vara_require_uid();
  select i.* into v_item from public.vara_collection_items i where i.id = p_item_id;
  if not found then raise exception 'COLLECTION_NOT_FOUND'; end if;
  v_col := private.vara_lock_collection(v_item.collection_id, v_uid);

  select i.* into v_item from public.vara_collection_items i where i.id = p_item_id;
  if not found then raise exception 'COLLECTION_ITEM_NOT_FOUND'; end if;

  v_level := private.vara_collection_edit_level(v_col, v_uid);
  -- 'full' removes anything; 'own' only the caller's own adds; 'none' forbidden.
  if v_level = 'none' or (v_level = 'own' and v_item.added_by is distinct from v_uid) then
    raise exception 'COLLECTION_FORBIDDEN';
  end if;

  perform private.cira_enforce_rate_limit(
    v_uid, 'vara_collection_edit', 300, interval '1 hour'
  );

  delete from public.vara_collection_items where id = p_item_id;
  update public.vara_collection_items
  set position = position - 1
  where collection_id = v_item.collection_id and position > v_item.position;

  update public.vara_collections
  set updated_by = v_uid, updated_at = now()
  where id = v_item.collection_id;

  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- Delegation RPCs (owner/admin grant; delegate = a group member only).
------------------------------------------------------------------------------
create function public.vara_add_collection_delegate(p_collection_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_col public.vara_collections;
begin
  v_uid := private.vara_require_uid();
  v_col := private.vara_lock_collection(p_collection_id, v_uid);
  -- Only group owner/admin may delegate (not a delegate — no re-delegation).
  if coalesce(private.cira_group_role(v_col.group_id, v_uid) in ('owner', 'admin'), false) is not true then
    raise exception 'COLLECTION_FORBIDDEN';
  end if;
  -- The delegate must be a member of the owning group (never a non-member).
  if p_user_id is null or private.cira_group_role(v_col.group_id, p_user_id) is null then
    raise exception 'COLLECTION_DELEGATE_UNAVAILABLE';
  end if;

  insert into public.vara_collection_delegates (collection_id, user_id, granted_by)
  values (p_collection_id, p_user_id, v_uid)
  on conflict (collection_id, user_id) do nothing;

  update public.vara_collections set updated_at = now() where id = p_collection_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.vara_remove_collection_delegate(p_collection_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_col public.vara_collections;
begin
  v_uid := private.vara_require_uid();
  v_col := private.vara_lock_collection(p_collection_id, v_uid);
  if coalesce(private.cira_group_role(v_col.group_id, v_uid) in ('owner', 'admin'), false) is not true then
    raise exception 'COLLECTION_FORBIDDEN';
  end if;

  delete from public.vara_collection_delegates
  where collection_id = p_collection_id and user_id = p_user_id;
  update public.vara_collections set updated_at = now() where id = p_collection_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

create function public.vara_list_collection_delegates(p_collection_id uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_col public.vara_collections;
begin
  v_uid := private.vara_require_uid();
  select * into v_col from public.vara_collections where id = p_collection_id;
  if not found or not private.vara_collection_can_manage(v_col, v_uid) then
    raise exception 'COLLECTION_NOT_FOUND';
  end if;

  return query
  select private.vara_profile_card(v_uid, d.user_id)
  from public.vara_collection_delegates d
  where d.collection_id = p_collection_id
    and private.vara_profile_card(v_uid, d.user_id) is not null
  order by d.granted_at, d.user_id;
end;
$$;

------------------------------------------------------------------------------
-- Purge dead delegations when a member leaves/loses a group (data hygiene;
-- the permission helpers already treat a non-member delegate as powerless).
------------------------------------------------------------------------------
create function private.vara_tg_purge_delegates_on_member_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.vara_collection_delegates d
  using public.vara_collections c
  where d.collection_id = c.id
    and c.group_id = old.group_id
    and d.user_id = old.user_id;
  return old;
end;
$$;

revoke all on function private.vara_tg_purge_delegates_on_member_removal()
  from public, anon, authenticated;

create trigger vara_purge_delegates_on_member_removal
  after delete on public.cira_group_members
  for each row execute function private.vara_tg_purge_delegates_on_member_removal();

------------------------------------------------------------------------------
-- API privileges
------------------------------------------------------------------------------
revoke all on function public.vara_set_collection_policy(uuid, text) from public, anon;
revoke all on function public.vara_add_collection_delegate(uuid, uuid) from public, anon;
revoke all on function public.vara_remove_collection_delegate(uuid, uuid) from public, anon;
revoke all on function public.vara_list_collection_delegates(uuid) from public, anon;

grant execute on function public.vara_set_collection_policy(uuid, text) to authenticated;
grant execute on function public.vara_add_collection_delegate(uuid, uuid) to authenticated;
grant execute on function public.vara_remove_collection_delegate(uuid, uuid) to authenticated;
grant execute on function public.vara_list_collection_delegates(uuid) to authenticated;
