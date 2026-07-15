------------------------------------------------------------------------------
-- ARCHIVE-ROOM-GAP: archiving a group must truly freeze its VARA activity.
--
-- Until now vara_create_room checked p_group_id only at creation and never
-- persisted it, so a room launched from a group kept running (bounded only by
-- its <=24h TTL) after the group was archived — the group was half-frozen.
--
-- Decision: persist group_id on vara_rooms and CLOSE the group's still-open
-- rooms when it is archived. A VARA room carries no durable data (no media, no
-- history, no positions), so closing one destroys nothing persistent; it ends an
-- ephemeral live session, consistent with the archive contract ("freeze
-- group-VARA without destroying data").
--
-- Lock order is group -> room everywhere: vara_create_room locks the group row
-- before inserting the room, and cira_archive_group already holds the group row
-- lock before deleting rooms. admit/leave/close take only the room row, so no
-- path locks room-then-group and this cannot deadlock (unlike the invite/link
-- purge deliberately omitted in 20260714200000).
------------------------------------------------------------------------------

alter table public.vara_rooms
  add column group_id uuid references public.cira_groups (id) on delete set null;

create index vara_rooms_group_id_idx
  on public.vara_rooms (group_id)
  where group_id is not null;

------------------------------------------------------------------------------
-- Persist group_id and lock the group row so create serializes against archive.
-- Same 3-arg signature as 20260714200000, so grants carry over.
------------------------------------------------------------------------------
create or replace function public.vara_create_room(
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
  -- indistinguishable from a missing group. Lock the group row first (group ->
  -- room order) so a concurrent archive serializes cleanly: either it runs
  -- before us (we see archived) or after (it closes the room we just made).
  if p_group_id is not null then
    perform 1 from public.cira_groups where id = p_group_id for update;
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
    owner_id, host_id, topic, max_members, host_lease_until, expires_at, group_id
  )
  values (
    v_uid, v_uid, private.vara_new_topic(), p_max_members,
    now() + interval '90 seconds', now() + make_interval(secs => p_ttl_seconds),
    p_group_id
  )
  returning * into v_room;

  insert into public.vara_room_members (room_id, user_id)
  values (v_room.id, v_uid);

  return private.vara_room_json(v_room.id, v_uid);
end;
$$;

------------------------------------------------------------------------------
-- Archive also closes the group's still-open rooms. Same signature as
-- 20260714200000, so grants carry over.
------------------------------------------------------------------------------
create or replace function public.cira_archive_group(p_group_id uuid)
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
    -- Pending invitations and links are kept but inert (the admission trigger
    -- refuses any join on an archived group). We do NOT delete them here — that
    -- would take the invite/link locks AFTER the group lock, inverting the
    -- invite->group order of accept-invite/link and deadlocking.
    update public.cira_groups
    set archived_at = now(), updated_at = now()
    where id = p_group_id
    returning * into v_group;

    -- Close any still-open VARA room launched from this group. The group row is
    -- already locked (group -> room order), the delete cascades room members,
    -- and clients resolve VARA_ROOM_UNAVAILABLE and tear down cleanly. Rooms
    -- hold no durable data, so nothing persistent is destroyed.
    delete from public.vara_rooms where group_id = p_group_id;

    perform private.cira_notify(private.cira_group_member_ids(p_group_id));
  end if;

  return jsonb_build_object('group_id', v_group.id, 'archived_at', v_group.archived_at, 'status', 'ok');
end;
$$;
