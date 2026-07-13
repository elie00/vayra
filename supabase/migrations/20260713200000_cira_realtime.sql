-- CIRA PR2 - migration 4: Realtime broadcast triggers.
--
-- The client subscribes to the PRIVATE broadcast channel `cira:<userId>`
-- (src/lib/cira/repository.ts, subscribeInvalidations) and refetches its
-- lists on any "changed" event. The payload is always an empty object: the
-- channel carries a pure invalidation ping, never data, so nothing can leak
-- through the realtime plane (no handle, no token, no presence state).
--
-- Design:
--   * private.cira_notify(uuid[]) wraps realtime.send per recipient inside
--     an exception guard: a realtime outage must never abort the data write.
--   * Presence pings go to ACCEPTED friends only, and only while the user
--     has presence_opt_in = true (a non-consented user never generates
--     presence traffic toward observers).
--   * Heartbeats that only refresh expires_at (state unchanged) do NOT ping
--     (trigger WHEN clause) - friends poll expiry client-side anyway.
--   * Invitation state changes ping the creator only; the token never
--     travels on the channel.
--   * Receiving is authorized by a SELECT policy on realtime.messages
--     restricted to the caller's own `cira:<uid>` topic.

------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------

-- Accepted-friend user ids of p_user ('{}' when none).
create function private.cira_friend_ids(p_user uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(case when f.requester_id = p_user
                   then f.addressee_id
                   else f.requester_id end),
    '{}')
  from public.cira_friendships f
  where f.status = 'accepted'
    and (f.requester_id = p_user or f.addressee_id = p_user);
$$;

-- Ping `cira:<uid>` for each distinct non-null recipient. Every send is
-- individually guarded: realtime unavailability must never make the
-- surrounding data write fail.
create function private.cira_notify(p_users uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
begin
  if p_users is null then
    return;
  end if;
  for u in select distinct t.x from unnest(p_users) as t(x) where t.x is not null loop
    begin
      perform realtime.send('{}'::jsonb, 'changed', 'cira:' || u::text, true);
    exception when others then
      null;
    end;
  end loop;
end;
$$;

revoke all on function private.cira_friend_ids(uuid) from public, anon, authenticated;
revoke all on function private.cira_notify(uuid[])   from public, anon, authenticated;

------------------------------------------------------------------------------
-- Trigger functions (SECURITY DEFINER + empty search_path, like every other
-- private helper; they run underneath the security-definer RPCs).
------------------------------------------------------------------------------

-- Any friendship change concerns exactly the two members of the pair.
create function private.cira_tg_friendships_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.cira_notify(array[old.requester_id, old.addressee_id]);
  else
    perform private.cira_notify(array[new.requester_id, new.addressee_id]);
  end if;
  return null;
end;
$$;

-- Profile changes are visible to the owner (multi-device) and accepted
-- friends (display name / avatar shown in their lists; presence_opt_in
-- flips their aggregate presence view).
create function private.cira_tg_profiles_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cira_notify(
    array[new.user_id] || private.cira_friend_ids(new.user_id));
  return null;
end;
$$;

-- Presence concerns accepted friends only, and only under explicit consent.
-- The opt-in re-check matters on DELETE: the opt-out purge fires row deletes
-- after presence_opt_in is already false, so the (uninformative) delete pings
-- are suppressed - friends are reached by the profile trigger instead.
create function private.cira_tg_presence_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_opt  boolean;
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id;
  else
    v_user := new.user_id;
  end if;
  select p.presence_opt_in into v_opt
  from public.cira_profiles p
  where p.user_id = v_user;
  if coalesce(v_opt, false) then
    perform private.cira_notify(private.cira_friend_ids(v_user));
  end if;
  return null;
end;
$$;

-- Invitation lifecycle concerns the creator only (multi-device list sync,
-- and the decline path which touches no friendship row).
create function private.cira_tg_invitations_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cira_notify(array[new.creator_id]);
  return null;
end;
$$;

-- Blocks concern the blocker only: the blocked side must not receive a
-- signal dedicated to the block itself (the friendship deletion that a block
-- may cause already pings both members through the friendship trigger).
create function private.cira_tg_blocks_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.cira_notify(array[old.blocker_id]);
  else
    perform private.cira_notify(array[new.blocker_id]);
  end if;
  return null;
end;
$$;

revoke all on function private.cira_tg_friendships_notify() from public, anon, authenticated;
revoke all on function private.cira_tg_profiles_notify()    from public, anon, authenticated;
revoke all on function private.cira_tg_presence_notify()    from public, anon, authenticated;
revoke all on function private.cira_tg_invitations_notify() from public, anon, authenticated;
revoke all on function private.cira_tg_blocks_notify()      from public, anon, authenticated;

------------------------------------------------------------------------------
-- Triggers
------------------------------------------------------------------------------

create trigger cira_friendships_notify
  after insert or update or delete on public.cira_friendships
  for each row execute function private.cira_tg_friendships_notify();

create trigger cira_profiles_notify
  after update on public.cira_profiles
  for each row
  when (old.handle          is distinct from new.handle
     or old.display_name    is distinct from new.display_name
     or old.avatar_key      is distinct from new.avatar_key
     or old.presence_opt_in is distinct from new.presence_opt_in)
  execute function private.cira_tg_profiles_notify();

create trigger cira_presence_notify_ins
  after insert on public.cira_presence
  for each row execute function private.cira_tg_presence_notify();

-- State-only: a heartbeat that merely refreshes expires_at stays silent.
create trigger cira_presence_notify_upd
  after update on public.cira_presence
  for each row
  when (old.state is distinct from new.state)
  execute function private.cira_tg_presence_notify();

create trigger cira_presence_notify_del
  after delete on public.cira_presence
  for each row execute function private.cira_tg_presence_notify();

create trigger cira_invitations_notify
  after insert or update on public.cira_invitations
  for each row execute function private.cira_tg_invitations_notify();

create trigger cira_blocks_notify
  after insert or delete on public.cira_blocks
  for each row execute function private.cira_tg_blocks_notify();

------------------------------------------------------------------------------
-- Realtime authorization: an authenticated user may receive broadcasts on
-- their own `cira:<uid>` topic and nothing else. (realtime.messages is
-- managed by Supabase with RLS already enabled; policies are additive.)
------------------------------------------------------------------------------

create policy cira_receive_own_channel
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'cira:' || (select auth.uid()::text)
    -- Redundant with realtime's own per-topic authorization flow, but keeps
    -- the policy self-contained: a row is only ever visible on its own topic.
    and realtime.messages.topic = realtime.topic()
  );
