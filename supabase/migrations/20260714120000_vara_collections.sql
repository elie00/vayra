-- VARA Collections: private, group-shared catalogue lists inside CIRA groups.
--
-- Privacy boundary: a collection item is a PUBLIC catalogue reference only
-- (meta id, type, season/episode, title, validated https image). These tables
-- never store stream sources, URLs of media, addons, info-hashes, playback
-- positions, local libraries, file paths, IPs, devices or Stremio state.
-- Reading an item and starting a VARA from a collection are explicit client
-- actions; nothing here grants playback authority or syncs playback.
--
-- Access model is inherited from CIRA groups: visibility = group membership,
-- management = owner/admin, and the existing block boundary (a blocked pair
-- can never share a group) transitively guarantees a blocked pair can never
-- share a collection. Removing a member, deleting a group or blocking a user
-- revokes access immediately because every read re-derives the caller's role.

------------------------------------------------------------------------------
-- public.vara_collections
------------------------------------------------------------------------------
create table public.vara_collections (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.cira_groups (id) on delete cascade,
  created_by       uuid references public.cira_profiles (user_id) on delete set null,
  updated_by       uuid references public.cira_profiles (user_id) on delete set null,
  name             text not null,
  description      text,
  members_can_edit boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint vara_collections_name_length check (char_length(name) between 1 and 64),
  constraint vara_collections_name_clean check (name !~ '[<>[:cntrl:]]'),
  constraint vara_collections_description_length
    check (description is null or char_length(description) between 1 and 240),
  constraint vara_collections_description_clean
    check (description is null or description !~ '[<>[:cntrl:]]')
);

create index vara_collections_group_updated_idx
  on public.vara_collections (group_id, updated_at desc, id);

------------------------------------------------------------------------------
-- public.vara_collection_items
------------------------------------------------------------------------------
create table public.vara_collection_items (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.vara_collections (id) on delete cascade,
  added_by      uuid references public.cira_profiles (user_id) on delete set null,
  meta_id       text not null,
  media_type    text not null,
  season        integer,
  episode       integer,
  title         text not null,
  poster_url    text,
  position      integer not null,
  added_at      timestamptz not null default now(),

  -- Public catalogue identifier only (tt…, kitsu:…, tmdb:…). The whitelist
  -- structurally excludes '/', whitespace and brackets: no URL can hide here.
  constraint vara_collection_items_meta_id_format
    check (meta_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
  constraint vara_collection_items_media_type_valid
    check (media_type in ('movie', 'series', 'anime', 'tv', 'channel')),
  constraint vara_collection_items_season_range
    check (season is null or season between 0 and 99999),
  constraint vara_collection_items_episode_range
    check (episode is null or episode between 0 and 99999),
  constraint vara_collection_items_episode_scope
    check (media_type in ('series', 'anime') or (season is null and episode is null)),
  constraint vara_collection_items_title_length
    check (char_length(title) between 1 and 200),
  constraint vara_collection_items_title_clean
    check (title !~ '[<>[:cntrl:]]'),
  -- Validated public https image: dotted host (no localhost, no IP literal,
  -- no userinfo, no IPv6 bracket), sane path charset, bounded length.
  constraint vara_collection_items_poster_https
    check (
      poster_url is null or (
        char_length(poster_url) <= 2048
        and poster_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?(/[^[:space:][:cntrl:]<>"''\\]*)?$'
        and poster_url !~ '^https://[0-9]+(\.[0-9]+)+([:/]|$)'
      )
    ),
  constraint vara_collection_items_position_positive check (position >= 1),
  -- Dense rank is renumbered inside a single transaction under the collection
  -- row lock; uniqueness is deferred so shifts never trip on themselves.
  constraint vara_collection_items_position_key
    unique (collection_id, position) deferrable initially deferred
);

create index vara_collection_items_collection_position_idx
  on public.vara_collection_items (collection_id, position);
create unique index vara_collection_items_dedupe_key
  on public.vara_collection_items (
    collection_id, meta_id, coalesce(season, -1), coalesce(episode, -1)
  );

------------------------------------------------------------------------------
-- API boundary
------------------------------------------------------------------------------
revoke all on table public.vara_collections from public, anon, authenticated;
revoke all on table public.vara_collection_items from public, anon, authenticated;
alter table public.vara_collections enable row level security;
alter table public.vara_collection_items enable row level security;

------------------------------------------------------------------------------
-- Private helpers
------------------------------------------------------------------------------

-- Caller-facing profile card, masked when a block exists in either direction
-- (only reachable when the profile already left the group: a blocked pair can
-- never share a group, therefore never a collection).
create function private.vara_profile_card(p_viewer uuid, p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user is null then null
    when p_viewer <> p_user and private.cira_any_block(p_viewer, p_user) then null
    else (
      select jsonb_build_object(
        'user_id', p.user_id,
        'handle', p.handle,
        'display_name', p.display_name,
        'avatar_key', p.avatar_key
      )
      from public.cira_profiles p
      where p.user_id = p_user
    )
  end;
$$;

create function private.vara_collection_json(p_collection_id uuid, p_user_id uuid)
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
    'members_can_edit', c.members_can_edit,
    'item_count', (
      select count(*) from public.vara_collection_items i
      where i.collection_id = c.id
    ),
    'created_by', private.vara_profile_card(p_user_id, c.created_by),
    'updated_by', private.vara_profile_card(p_user_id, c.updated_by),
    'my_role', private.cira_group_role(c.group_id, p_user_id),
    'can_manage',
      private.cira_group_role(c.group_id, p_user_id) in ('owner', 'admin'),
    'can_edit_items',
      private.cira_group_role(c.group_id, p_user_id) in ('owner', 'admin')
      or (private.cira_group_role(c.group_id, p_user_id) = 'member'
          and c.members_can_edit),
    'created_at', c.created_at,
    'updated_at', c.updated_at
  )
  from public.vara_collections c
  where c.id = p_collection_id
    and private.cira_group_role(c.group_id, p_user_id) is not null;
$$;

create function private.vara_collection_item_json(p_item_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'item_id', i.id,
    'collection_id', i.collection_id,
    'meta_id', i.meta_id,
    'media_type', i.media_type,
    'season', i.season,
    'episode', i.episode,
    'title', i.title,
    'poster_url', i.poster_url,
    'position', i.position,
    'added_by', private.vara_profile_card(p_user_id, i.added_by),
    'added_at', i.added_at
  )
  from public.vara_collection_items i
  where i.id = p_item_id;
$$;

-- Locks the collection row (serialization boundary for every collection and
-- item mutation) and returns it, or raises when the caller is not a member of
-- the owning group. Existence and membership are indistinguishable.
create function private.vara_lock_collection(p_collection_id uuid, p_user_id uuid)
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
  return v_col;
end;
$$;

create function private.vara_collection_can_edit(
  p_col public.vara_collections,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- coalesce: a NULL role (non-member) must read as an explicit false, never
  -- as SQL NULL that would silently skip an `if not …` guard.
  select coalesce(
    private.cira_group_role(p_col.group_id, p_user_id) in ('owner', 'admin')
      or (private.cira_group_role(p_col.group_id, p_user_id) = 'member'
          and p_col.members_can_edit),
    false);
$$;

revoke all on function private.vara_profile_card(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.vara_collection_json(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.vara_collection_item_json(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.vara_lock_collection(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.vara_collection_can_edit(public.vara_collections, uuid)
  from public, anon, authenticated;

------------------------------------------------------------------------------
-- Collection lifecycle RPCs
------------------------------------------------------------------------------

create function public.vara_create_collection(
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

create function public.vara_update_collection(
  p_collection_id uuid,
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
  v_col public.vara_collections;
  v_description text;
begin
  v_uid := private.vara_require_uid();
  v_col := private.vara_lock_collection(p_collection_id, v_uid);
  v_role := private.cira_group_role(v_col.group_id, v_uid);
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'COLLECTION_FORBIDDEN';
  end if;

  v_description := nullif(p_description, '');
  if p_name is null or char_length(p_name) not between 1 and 64
     or p_name ~ '[<>[:cntrl:]]'
     or (v_description is not null and
         (char_length(v_description) > 240 or v_description ~ '[<>[:cntrl:]]'))
     or p_members_can_edit is null then
    raise exception 'INVALID_COLLECTION';
  end if;

  update public.vara_collections
  set name = p_name,
      description = v_description,
      members_can_edit = p_members_can_edit,
      updated_by = v_uid,
      updated_at = now()
  where id = p_collection_id;

  return private.vara_collection_json(p_collection_id, v_uid);
end;
$$;

create function public.vara_delete_collection(p_collection_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role text;
  v_col public.vara_collections;
begin
  v_uid := private.vara_require_uid();
  v_col := private.vara_lock_collection(p_collection_id, v_uid);
  v_role := private.cira_group_role(v_col.group_id, v_uid);
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'COLLECTION_FORBIDDEN';
  end if;
  delete from public.vara_collections where id = p_collection_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- Caller-scoped reads (bounded pagination, same envelope as CIRA pages)
------------------------------------------------------------------------------

create function public.vara_list_group_collections_page(
  p_group_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_rows jsonb;
  v_count integer;
begin
  v_uid := private.vara_require_uid();
  if private.cira_group_role(p_group_id, v_uid) is null then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'INVALID_PAGE';
  end if;

  with page as (
    select c.id
    from public.vara_collections c
    where c.group_id = p_group_id
    order by c.updated_at desc, c.id
    limit p_limit + 1 offset p_offset
  ), numbered as (
    select page.id, row_number() over () as rn from page
  )
  select coalesce(jsonb_agg(private.vara_collection_json(numbered.id, v_uid)
             order by rn)
           filter (where rn <= p_limit), '[]'::jsonb), count(*)
  into v_rows, v_count from numbered;
  return jsonb_build_object('items', v_rows, 'has_more', v_count > p_limit);
end;
$$;

create function public.vara_get_collection(p_collection_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_result jsonb;
begin
  v_uid := private.vara_require_uid();
  select private.vara_collection_json(p_collection_id, v_uid) into v_result;
  if v_result is null then
    raise exception 'COLLECTION_NOT_FOUND';
  end if;
  return v_result;
end;
$$;

create function public.vara_list_collection_items_page(
  p_collection_id uuid,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_group uuid;
  v_rows jsonb;
  v_count integer;
begin
  v_uid := private.vara_require_uid();
  select c.group_id into v_group from public.vara_collections c
  where c.id = p_collection_id;
  if not found or private.cira_group_role(v_group, v_uid) is null then
    raise exception 'COLLECTION_NOT_FOUND';
  end if;
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'INVALID_PAGE';
  end if;

  with page as (
    select i.id
    from public.vara_collection_items i
    where i.collection_id = p_collection_id
    order by i.position
    limit p_limit + 1 offset p_offset
  ), numbered as (
    select page.id, row_number() over () as rn from page
  )
  select coalesce(jsonb_agg(private.vara_collection_item_json(numbered.id, v_uid)
             order by rn)
           filter (where rn <= p_limit), '[]'::jsonb), count(*)
  into v_rows, v_count from numbered;
  return jsonb_build_object('items', v_rows, 'has_more', v_count > p_limit);
end;
$$;

------------------------------------------------------------------------------
-- Item mutations: append, remove (gap closed), transactional dense move.
-- Every mutation bumps the collection row (single Realtime ping, and the
-- "last modified by / at" surface stays truthful).
------------------------------------------------------------------------------

create function public.vara_add_collection_item(
  p_collection_id uuid,
  p_meta_id text,
  p_media_type text,
  p_title text,
  p_season integer default null,
  p_episode integer default null,
  p_poster_url text default null
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
  v_poster text;
  v_item public.vara_collection_items;
begin
  v_uid := private.vara_require_uid();
  v_col := private.vara_lock_collection(p_collection_id, v_uid);
  if not private.vara_collection_can_edit(v_col, v_uid) then
    raise exception 'COLLECTION_FORBIDDEN';
  end if;

  v_poster := nullif(p_poster_url, '');
  if p_meta_id is null or p_meta_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
     or p_media_type is null
     or p_media_type not in ('movie', 'series', 'anime', 'tv', 'channel')
     or (p_season is not null and p_season not between 0 and 99999)
     or (p_episode is not null and p_episode not between 0 and 99999)
     or (p_media_type not in ('series', 'anime')
         and (p_season is not null or p_episode is not null))
     or p_title is null or char_length(p_title) not between 1 and 200
     or p_title ~ '[<>[:cntrl:]]'
     or (v_poster is not null and (
           char_length(v_poster) > 2048
        or v_poster !~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?(/[^[:space:][:cntrl:]<>"''\\]*)?$'
        or v_poster ~ '^https://[0-9]+(\.[0-9]+)+([:/]|$)'
     )) then
    raise exception 'INVALID_COLLECTION_ITEM';
  end if;

  if (select count(*) from public.vara_collection_items i
      where i.collection_id = p_collection_id) >= 500 then
    raise exception 'COLLECTION_ITEM_LIMIT_REACHED';
  end if;
  if exists (
    select 1 from public.vara_collection_items i
    where i.collection_id = p_collection_id
      and i.meta_id = p_meta_id
      and coalesce(i.season, -1) = coalesce(p_season, -1)
      and coalesce(i.episode, -1) = coalesce(p_episode, -1)
  ) then
    raise exception 'COLLECTION_ITEM_DUPLICATE';
  end if;

  perform private.cira_enforce_rate_limit(
    v_uid, 'vara_collection_edit', 300, interval '1 hour'
  );

  insert into public.vara_collection_items (
    collection_id, added_by, meta_id, media_type,
    season, episode, title, poster_url, position
  )
  values (
    p_collection_id, v_uid, p_meta_id, p_media_type,
    p_season, p_episode, p_title, v_poster,
    (select coalesce(max(i.position), 0) + 1
     from public.vara_collection_items i
     where i.collection_id = p_collection_id)
  )
  returning * into v_item;

  update public.vara_collections
  set updated_by = v_uid, updated_at = now()
  where id = p_collection_id;

  return private.vara_collection_item_json(v_item.id, v_uid);
end;
$$;

create function public.vara_remove_collection_item(p_item_id uuid)
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
  v_manager boolean;
begin
  v_uid := private.vara_require_uid();
  select i.* into v_item from public.vara_collection_items i
  where i.id = p_item_id;
  if not found then raise exception 'COLLECTION_ITEM_NOT_FOUND'; end if;
  v_col := private.vara_lock_collection(v_item.collection_id, v_uid);

  -- Re-read under the lock: the item may have moved or vanished meanwhile.
  select i.* into v_item from public.vara_collection_items i
  where i.id = p_item_id;
  if not found then raise exception 'COLLECTION_ITEM_NOT_FOUND'; end if;

  v_manager := coalesce(
    private.cira_group_role(v_col.group_id, v_uid) in ('owner', 'admin'), false);
  -- Managers remove anything; an editing member only removes their own adds.
  if not v_manager
     and not (private.vara_collection_can_edit(v_col, v_uid)
              and v_item.added_by = v_uid) then
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

create function public.vara_move_collection_item(
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
  v_count integer;
  v_target integer;
begin
  v_uid := private.vara_require_uid();
  if p_position is null or p_position < 1 then
    raise exception 'INVALID_COLLECTION_ITEM';
  end if;
  select i.* into v_item from public.vara_collection_items i
  where i.id = p_item_id;
  if not found then raise exception 'COLLECTION_ITEM_NOT_FOUND'; end if;
  v_col := private.vara_lock_collection(v_item.collection_id, v_uid);

  select i.* into v_item from public.vara_collection_items i
  where i.id = p_item_id;
  if not found then raise exception 'COLLECTION_ITEM_NOT_FOUND'; end if;
  if not private.vara_collection_can_edit(v_col, v_uid) then
    raise exception 'COLLECTION_FORBIDDEN';
  end if;

  perform private.cira_enforce_rate_limit(
    v_uid, 'vara_collection_edit', 300, interval '1 hour'
  );

  select count(*) into v_count from public.vara_collection_items i
  where i.collection_id = v_item.collection_id;
  v_target := least(p_position, v_count);

  if v_target <> v_item.position then
    -- Dense renumber under the collection lock; the deferred unique
    -- constraint validates the final 1..n ranking at commit.
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

------------------------------------------------------------------------------
-- Realtime invalidation: one empty ping per mutation, to group members only.
-- Item RPCs always bump the collection row, so this single trigger covers
-- collection AND item changes; cascade deletes of items stay silent because
-- the group-delete path already notifies through the membership trigger.
------------------------------------------------------------------------------

create function private.vara_tg_collections_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cira_notify(
    private.cira_group_member_ids(coalesce(new.group_id, old.group_id)));
  return null;
end;
$$;

revoke all on function private.vara_tg_collections_notify()
  from public, anon, authenticated;

create trigger vara_collections_notify
  after insert or update or delete on public.vara_collections
  for each row execute function private.vara_tg_collections_notify();

------------------------------------------------------------------------------
-- API privileges
------------------------------------------------------------------------------
revoke all on function public.vara_create_collection(uuid, text, text, boolean) from public, anon;
revoke all on function public.vara_update_collection(uuid, text, text, boolean) from public, anon;
revoke all on function public.vara_delete_collection(uuid) from public, anon;
revoke all on function public.vara_list_group_collections_page(uuid, integer, integer) from public, anon;
revoke all on function public.vara_get_collection(uuid) from public, anon;
revoke all on function public.vara_list_collection_items_page(uuid, integer, integer) from public, anon;
revoke all on function public.vara_add_collection_item(uuid, text, text, text, integer, integer, text) from public, anon;
revoke all on function public.vara_remove_collection_item(uuid) from public, anon;
revoke all on function public.vara_move_collection_item(uuid, integer) from public, anon;

grant execute on function public.vara_create_collection(uuid, text, text, boolean) to authenticated;
grant execute on function public.vara_update_collection(uuid, text, text, boolean) to authenticated;
grant execute on function public.vara_delete_collection(uuid) to authenticated;
grant execute on function public.vara_list_group_collections_page(uuid, integer, integer) to authenticated;
grant execute on function public.vara_get_collection(uuid) to authenticated;
grant execute on function public.vara_list_collection_items_page(uuid, integer, integer) to authenticated;
grant execute on function public.vara_add_collection_item(uuid, text, text, text, integer, integer, text) to authenticated;
grant execute on function public.vara_remove_collection_item(uuid) to authenticated;
grant execute on function public.vara_move_collection_item(uuid, integer) to authenticated;
