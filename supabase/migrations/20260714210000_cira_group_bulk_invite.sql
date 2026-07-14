-- CIRA Groups v2 — bulk invite of already-accepted CIRA relations.
--
-- One transactional action invites several accepted relations to a group. The
-- server filters, under the group row lock, every ineligible target: existing
-- members, active invitations, blocks, non-accepted relations, archived group,
-- member capacity and insufficient caller role.
--
-- Privacy: the result is AGGREGATED and never attributable. It returns three
-- counters — invited, already_member, skipped — and never the per-user reason
-- or id list. Crucially, `skipped` folds in ONLY the conditions the existing
-- single-invite path already exposes to the caller (a caller↔target block, or
-- no accepted friendship) plus capacity; it never folds in whether the target
-- blocks an existing member, which would make a one-element call a one-bit
-- oracle on a third party's private block list. A target that blocks a member
-- is still invited here (as in single-invite) and rejected only at accept time
-- by the admission trigger, surfaced to the invitee alone. The call is thus no
-- more revealing than the single-invite path.

create function public.cira_invite_group_members(
  p_group_id uuid,
  p_user_ids uuid[]
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
  v_group public.cira_groups;
  v_ids uuid[];
  v_sorted uuid[];
  v_id uuid;
  v_member_count integer;
  v_pending_count integer;
  v_slots integer;
  v_invited integer := 0;
  v_already integer := 0;
  v_skipped integer := 0;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);

  -- Group row is the serialization boundary: concurrent bulk invites on the
  -- same group run in series and recompute capacity under the lock.
  select * into v_group from public.cira_groups where id = p_group_id for update;
  if not found then raise exception 'GROUP_FORBIDDEN'; end if;
  v_role := private.cira_group_role(p_group_id, v_uid);
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'GROUP_FORBIDDEN';
  end if;
  if v_group.archived_at is not null then raise exception 'GROUP_ARCHIVED'; end if;

  -- Deduplicate, drop nulls and the caller itself. Bounded to keep the
  -- per-pair lock work and the rate budget in check.
  select coalesce(array_agg(distinct u), '{}')
  into v_ids
  from unnest(p_user_ids) as t(u)
  where u is not null and u <> v_uid;
  if array_length(v_ids, 1) is null or array_length(v_ids, 1) > 50 then
    raise exception 'INVALID_BULK_INVITE';
  end if;

  perform private.cira_enforce_rate_limit(
    v_uid, 'group_bulk_invite', 20, interval '1 hour'
  );

  select count(*) into v_member_count from public.cira_group_members where group_id = p_group_id;
  delete from public.cira_group_invites where group_id = p_group_id and expires_at <= now();
  select count(*) into v_pending_count from public.cira_group_invites where group_id = p_group_id;
  v_slots := v_group.max_members - v_member_count - v_pending_count;

  -- Sorted iteration keeps a deterministic, deadlock-free lock order that
  -- matches cira_block_user (group first, then canonical profile pairs).
  select array_agg(x order by x) into v_sorted from unnest(v_ids) as s(x);
  foreach v_id in array v_sorted
  loop
    if private.cira_group_role(p_group_id, v_id) is not null then
      v_already := v_already + 1;
      continue;
    end if;

    perform private.cira_lock_pair(v_uid, v_id);

    -- Skipped (no reason exposed) only for the two conditions the single-invite
    -- path already surfaces to the caller: a block between caller and target, or
    -- no accepted friendship. We deliberately do NOT test whether the target
    -- blocks an EXISTING member: folding that into the aggregate `skipped` would
    -- turn the call into a one-bit oracle on a third party's private block list
    -- (a single-element array defeats aggregation). Such a doomed invitation is
    -- harmless — the admission trigger rejects it at accept time, surfaced only
    -- to the invitee, exactly as in the single-invite path.
    if private.cira_any_block(v_uid, v_id)
       or not exists (
         select 1 from public.cira_friendships f
         where f.status = 'accepted'
           and f.user_low = least(v_uid, v_id)
           and f.user_high = greatest(v_uid, v_id)
       ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Refreshing an existing invitation consumes no new slot.
    if exists (select 1 from public.cira_group_invites
               where group_id = p_group_id and invitee_id = v_id) then
      update public.cira_group_invites
      set inviter_id = v_uid, created_at = now(), expires_at = now() + interval '7 days'
      where group_id = p_group_id and invitee_id = v_id;
      v_invited := v_invited + 1;
      continue;
    end if;

    -- New invitation needs a free slot; otherwise it counts as skipped
    -- (capacity), still without revealing which target hit the cap.
    if v_slots <= 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.cira_group_invites (group_id, inviter_id, invitee_id, expires_at)
    values (p_group_id, v_uid, v_id, now() + interval '7 days');
    v_slots := v_slots - 1;
    v_invited := v_invited + 1;
  end loop;

  return jsonb_build_object(
    'invited', v_invited,
    'already_member', v_already,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.cira_invite_group_members(uuid, uuid[]) from public, anon;
grant execute on function public.cira_invite_group_members(uuid, uuid[]) to authenticated;
