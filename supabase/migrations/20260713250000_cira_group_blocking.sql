-- CIRA complete: a block is a hard boundary across relationships and groups.
-- No blocked pair may share a private group, including through a link created
-- by a third member. Blocking resolves every existing shared group at once.

create function private.cira_tg_group_members_block_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_user_id uuid;
begin
  -- Group row first, then profile pairs: this is the canonical lock order for
  -- every group admission, role mutation and cross-group block cleanup.
  perform 1 from public.cira_groups where id = new.group_id for update;
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

revoke all on function private.cira_tg_group_members_block_guard()
  from public, anon, authenticated;

create trigger cira_group_members_block_guard
  before insert on public.cira_group_members
  for each row execute function private.cira_tg_group_members_block_guard();

create or replace function public.cira_block_user(p_user_id uuid)
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

  if p_user_id is null or p_user_id = v_uid then
    raise exception 'INVALID_TRANSITION';
  end if;

  -- Lock every currently shared group before the canonical profile pair.
  -- A concurrent join either owns the group lock first (and is then removed)
  -- or waits here, observes the committed block in its admission trigger and
  -- fails. Ownership transfers and role changes use the same group-first
  -- ordering, so block cleanup cannot orphan an owner membership.
  perform 1
  from public.cira_groups g
  where exists (
      select 1 from public.cira_group_members mine
      where mine.group_id = g.id and mine.user_id = v_uid
    )
    and exists (
      select 1 from public.cira_group_members theirs
      where theirs.group_id = g.id and theirs.user_id = p_user_id
    )
  order by g.id
  for update;

  perform private.cira_lock_pair(v_uid, p_user_id);
  if not exists (select 1 from public.cira_profiles p where p.user_id = p_user_id) then
    return jsonb_build_object('status', 'ok');
  end if;

  insert into public.cira_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.cira_friendships
  where user_low = least(v_uid, p_user_id)
    and user_high = greatest(v_uid, p_user_id);

  -- Pending direct group invitations in either direction carry no useful
  -- state after a block and are erased immediately.
  delete from public.cira_group_invites
  where (inviter_id = v_uid and invitee_id = p_user_id)
     or (inviter_id = p_user_id and invitee_id = v_uid);

  -- If the blocker owns a shared group, the blocked member is removed.
  -- Otherwise the blocker leaves it. If the blocked user owns the group this
  -- also means the blocker leaves, so ownership is never mutated implicitly.
  delete from public.cira_group_members m
  using public.cira_groups g
  where m.group_id = g.id
    and g.owner_id = v_uid
    and m.user_id = p_user_id
    and exists (
      select 1 from public.cira_group_members mine
      where mine.group_id = g.id and mine.user_id = v_uid
    );

  delete from public.cira_group_members mine
  where mine.user_id = v_uid
    and exists (
      select 1 from public.cira_group_members theirs
      join public.cira_groups g on g.id = theirs.group_id
      where theirs.group_id = mine.group_id
        and theirs.user_id = p_user_id
        and g.owner_id <> v_uid
    );

  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.cira_block_user(uuid) from public, anon;
grant execute on function public.cira_block_user(uuid) to authenticated;
