-- CIRA PR1 - migration 3/3: the 19 RPCs (transactional SQL, no Edge Function).
--
-- Every RPC is SECURITY DEFINER with `set search_path = ''` and only
-- fully-qualified object references (public.*, private.*, auth.*).
-- EXECUTE is revoked from public and anon and granted to authenticated only.
--
-- Stable error codes (raised as the exception MESSAGE, errcode P0001, directly
-- usable by the TS client): NOT_AUTHENTICATED, PROFILE_REQUIRED,
-- INVALID_PROFILE, HANDLE_UNAVAILABLE, REQUEST_NOT_AVAILABLE, ALREADY_RELATED,
-- INVALID_TRANSITION, INVITATION_UNAVAILABLE, RATE_LIMITED.
--
-- Anti-oracle rules:
--   * cira_send_request RESPONSE and caller-visible receipt are identical for:
--     unknown handle, own handle, blocked (either direction) targets, and an
--     already-existing relation - so the returned value carries no handle
--     enumeration signal, and repeat sends are idempotent. This is a
--     a blind receipt is always persisted for a valid handle. Only the real
--     recipient sees the underlying pending friendship; the requester learns
--     the counterpart identity only after explicit acceptance.
--   * All invitation failures (unknown, expired, consumed, revoked, blocked,
--     self) collapse into the single INVITATION_UNAVAILABLE error.
--
-- Pair mutations always lock both profiles in canonical order (user_low then
-- user_high) via private.cira_lock_pair() BEFORE checking blocks/relations.

------------------------------------------------------------------------------
-- 1. cira_upsert_profile
------------------------------------------------------------------------------
create function public.cira_upsert_profile(
  p_handle       text,
  p_display_name text,
  p_avatar_key   text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid;
  v_handle text;
  v_name   text;
  v_row    public.cira_profiles;
begin
  v_uid := private.cira_require_uid();
  -- Handle uniqueness probing ("handle check") is rate limited.
  perform private.cira_enforce_rate_limit(v_uid, 'handle_check', 10, interval '5 minutes');

  v_handle := lower(coalesce(p_handle, ''));
  if v_handle !~ '^[a-z0-9][a-z0-9_]{2,23}$' then
    raise exception 'INVALID_PROFILE';
  end if;

  v_name := coalesce(p_display_name, '');
  if char_length(v_name) < 1 or char_length(v_name) > 48 or v_name ~ '[<>[:cntrl:]]' then
    raise exception 'INVALID_PROFILE';
  end if;

  if p_avatar_key is not null and p_avatar_key !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$' then
    raise exception 'INVALID_PROFILE';
  end if;

  begin
    insert into public.cira_profiles as p (user_id, handle, display_name, avatar_key)
    values (v_uid, v_handle, v_name, p_avatar_key)
    on conflict (user_id) do update
      set handle       = excluded.handle,
          display_name = excluded.display_name,
          avatar_key   = excluded.avatar_key,
          updated_at   = now()
    returning p.* into v_row;
  exception
    when unique_violation then
      -- Only the handle unique index can fire here (PK is the conflict target).
      raise exception 'HANDLE_UNAVAILABLE';
  end;

  return jsonb_build_object(
    'user_id',         v_row.user_id,
    'handle',          v_row.handle,
    'display_name',    v_row.display_name,
    'avatar_key',      v_row.avatar_key,
    'presence_opt_in', v_row.presence_opt_in,
    'updated_at',      v_row.updated_at
  );
end;
$$;

------------------------------------------------------------------------------
-- 2. cira_send_request
------------------------------------------------------------------------------
create function public.cira_send_request(p_handle text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid;
  v_target   public.cira_profiles;
  v_relation public.cira_friendships;
  v_friendship_id uuid;
  v_handle   text;
  v_generic  constant jsonb := jsonb_build_object('status', 'ok');
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform private.cira_enforce_rate_limit(v_uid, 'direct_request', 20, interval '10 minutes');

  v_handle := lower(coalesce(p_handle, ''));

  -- Invalid syntax carries no existence information and creates no receipt.
  if v_handle !~ '^[a-z0-9][a-z0-9_]{2,23}$' then
    return v_generic;
  end if;

  delete from public.cira_request_receipts
  where requester_id = v_uid and expires_at <= now();

  select * into v_target from public.cira_profiles where handle = v_handle;

  if found and v_target.user_id <> v_uid then
    perform private.cira_lock_pair(v_uid, v_target.user_id);

    if not private.cira_any_block(v_uid, v_target.user_id) then
      select * into v_relation
      from public.cira_friendships f
      where f.user_low = least(v_uid, v_target.user_id)
        and f.user_high = greatest(v_uid, v_target.user_id);

      -- An accepted counterpart is already known to the caller; sending again
      -- remains a no-op and does not add a duplicate blind receipt.
      if found and v_relation.status = 'accepted' then
        return v_generic;
      end if;

      if found then
        if v_relation.requester_id = v_uid then
          v_friendship_id := v_relation.id;
        else
          -- The caller already sees this incoming request and therefore
          -- already knows the requester. Do not create a duplicate receipt.
          return v_generic;
        end if;
      else
        insert into public.cira_friendships (requester_id, addressee_id, status)
        values (v_uid, v_target.user_id, 'pending')
        returning id into v_friendship_id;
      end if;
    end if;
  end if;

  -- The caller sees this same row for real, unknown, self and blocked handles.
  insert into public.cira_request_receipts as r
    (requester_id, requested_handle, friendship_id, created_at, expires_at)
  values
    (v_uid, v_handle, v_friendship_id, now(), now() + interval '24 hours')
  on conflict (requester_id, requested_handle) do update
  set friendship_id = excluded.friendship_id,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at;

  return v_generic;
end;
$$;

------------------------------------------------------------------------------
-- 3. cira_accept_request (addressee only)
------------------------------------------------------------------------------
create function public.cira_accept_request(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_req public.cira_friendships;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);

  select * into v_req from public.cira_friendships where id = p_request_id;
  if not found or v_req.addressee_id <> v_uid or v_req.status <> 'pending' then
    raise exception 'REQUEST_NOT_AVAILABLE';
  end if;

  -- Canonical pair lock, then re-read under lock (accept/block race guard).
  perform private.cira_lock_pair(v_req.user_low, v_req.user_high);

  select * into v_req
  from public.cira_friendships
  where id = p_request_id and addressee_id = v_uid and status = 'pending'
  for update;
  if not found then
    raise exception 'REQUEST_NOT_AVAILABLE';
  end if;

  if private.cira_any_block(v_req.requester_id, v_req.addressee_id) then
    -- Defensive only: cira_block_user erases the pair row in the same
    -- transaction, under the same canonical lock, so block + pending row is
    -- normally unreachable. No DELETE here: it would be rolled back by the
    -- RAISE anyway. Same error as an unknown id (no oracle).
    raise exception 'REQUEST_NOT_AVAILABLE';
  end if;

  update public.cira_friendships
  set status = 'accepted', responded_at = now(), updated_at = now()
  where id = v_req.id;

  delete from public.cira_request_receipts where friendship_id = v_req.id;

  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- 4. cira_decline_request (addressee only; the row is DELETED)
------------------------------------------------------------------------------
create function public.cira_decline_request(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_req public.cira_friendships;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);

  select * into v_req from public.cira_friendships where id = p_request_id;
  if not found or v_req.addressee_id <> v_uid or v_req.status <> 'pending' then
    raise exception 'REQUEST_NOT_AVAILABLE';
  end if;

  perform private.cira_lock_pair(v_req.user_low, v_req.user_high);

  delete from public.cira_friendships
  where id = p_request_id and addressee_id = v_uid and status = 'pending';
  if not found then
    raise exception 'REQUEST_NOT_AVAILABLE';
  end if;

  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- 5. cira_cancel_request (requester-owned blind receipt)
------------------------------------------------------------------------------
create function public.cira_cancel_request(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_receipt public.cira_request_receipts;
  v_req public.cira_friendships;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);

  select * into v_receipt
  from public.cira_request_receipts
  where id = p_request_id and requester_id = v_uid and expires_at > now()
  for update;
  if not found then
    return jsonb_build_object('status', 'ok');
  end if;

  if v_receipt.friendship_id is not null then
    select * into v_req
    from public.cira_friendships
    where id = v_receipt.friendship_id
      and requester_id = v_uid
      and status = 'pending';

    if found then
      perform private.cira_lock_pair(v_req.user_low, v_req.user_high);
      delete from public.cira_friendships
      where id = v_req.id and requester_id = v_uid and status = 'pending';
    end if;
  end if;

  delete from public.cira_request_receipts where id = v_receipt.id;

  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- 6. cira_remove_friend (either side; the row is DELETED)
------------------------------------------------------------------------------
create function public.cira_remove_friend(p_user_id uuid)
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
    raise exception 'REQUEST_NOT_AVAILABLE';
  end if;

  perform private.cira_lock_pair(v_uid, p_user_id);

  delete from public.cira_friendships
  where user_low = least(v_uid, p_user_id)
    and user_high = greatest(v_uid, p_user_id)
    and status = 'accepted';
  if not found then
    raise exception 'REQUEST_NOT_AVAILABLE';
  end if;

  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- 7. cira_block_user (erases any relation; idempotent)
------------------------------------------------------------------------------
create function public.cira_block_user(p_user_id uuid)
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

  perform private.cira_lock_pair(v_uid, p_user_id);

  -- Anti-oracle: blocking a non-existent user answers like a success.
  if not exists (select 1 from public.cira_profiles p where p.user_id = p_user_id) then
    return jsonb_build_object('status', 'ok');
  end if;

  insert into public.cira_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  -- A block erases any pending or accepted relation (data minimisation).
  delete from public.cira_friendships
  where user_low = least(v_uid, p_user_id)
    and user_high = greatest(v_uid, p_user_id);

  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- 8. cira_unblock_user (idempotent)
------------------------------------------------------------------------------
create function public.cira_unblock_user(p_user_id uuid)
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

  delete from public.cira_blocks
  where blocker_id = v_uid and blocked_id = p_user_id;

  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- 9. cira_create_invitation
-- The clear code is returned HERE and only here, and is never stored/logged.
------------------------------------------------------------------------------
create function public.cira_create_invitation(p_ttl_seconds integer default 900)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid;
  v_secret  text;
  v_code    text;
  v_id      uuid;
  v_expires timestamptz;
  v_attempt integer := 0;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform private.cira_enforce_rate_limit(v_uid, 'invitation_create', 10, interval '10 minutes');

  -- Default 15 min, hard cap 30 min (also enforced by table CHECK).
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 1800 then
    raise exception 'INVALID_TRANSITION';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_secret := private.cira_generate_invite_secret();
    v_code := 'CIRA-' || substr(v_secret, 1, 4)
           || '-' || substr(v_secret, 5, 4)
           || '-' || substr(v_secret, 9, 4)
           || '-' || substr(v_secret, 13, 4)
           || '-' || substr(v_secret, 17, 4);
    begin
      insert into public.cira_invitations (creator_id, token_hash, expires_at)
      values (v_uid, private.cira_hash_invite_code(v_code),
              now() + make_interval(secs => p_ttl_seconds))
      returning id, expires_at into v_id, v_expires;
      exit;
    exception
      when unique_violation then
        -- Astronomically unlikely 100-bit collision; retry a couple of times.
        if v_attempt >= 3 then
          raise;
        end if;
    end;
  end loop;

  return jsonb_build_object(
    'invitation_id', v_id,
    'code',          v_code,
    'expires_at',    v_expires
  );
end;
$$;

------------------------------------------------------------------------------
-- 10. cira_preview_invitation
------------------------------------------------------------------------------
create function public.cira_preview_invitation(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid;
  v_inv     public.cira_invitations;
  v_creator public.cira_profiles;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform private.cira_enforce_rate_limit(v_uid, 'invitation_redeem', 10, interval '5 minutes');

  if p_code is null or char_length(p_code) > 64
     or private.cira_normalize_invite_code(p_code) !~ '^CIRA[0-9A-HJKMNP-TV-Z]{20}$' then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;

  select * into v_inv
  from public.cira_invitations
  where token_hash = private.cira_hash_invite_code(p_code);

  -- Single collapsed error: no oracle on why the code is unusable.
  if not found
     or v_inv.consumed_at is not null
     or v_inv.revoked_at is not null
     or v_inv.expires_at <= now()
     or private.cira_any_block(v_uid, v_inv.creator_id) then
    raise exception 'INVITATION_UNAVAILABLE';
  end if;

  select * into v_creator from public.cira_profiles where user_id = v_inv.creator_id;
  if not found then
    raise exception 'INVITATION_UNAVAILABLE';
  end if;

  return jsonb_build_object(
    'creator_handle',       v_creator.handle,
    'creator_display_name', v_creator.display_name,
    'creator_avatar_key',   v_creator.avatar_key,
    'expires_at',           v_inv.expires_at
  );
end;
$$;

------------------------------------------------------------------------------
-- 11. cira_accept_invitation
-- No target_user_id from the client: the creator identity comes exclusively
-- from the token row locked FOR UPDATE. Consumption + relation creation are
-- atomic (same transaction, token row locked).
------------------------------------------------------------------------------
create function public.cira_accept_invitation(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid;
  v_inv     public.cira_invitations;
  v_creator public.cira_profiles;
  v_rel     public.cira_friendships;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform private.cira_enforce_rate_limit(v_uid, 'invitation_redeem', 10, interval '5 minutes');

  select * into v_inv
  from public.cira_invitations
  where token_hash = private.cira_hash_invite_code(p_code)
  for update;

  if not found
     or v_inv.consumed_at is not null
     or v_inv.revoked_at is not null
     or v_inv.expires_at <= now()
     or v_inv.creator_id = v_uid then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;

  perform private.cira_lock_pair(v_uid, v_inv.creator_id);

  if private.cira_any_block(v_uid, v_inv.creator_id) then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;

  select * into v_creator from public.cira_profiles where user_id = v_inv.creator_id;
  if not found then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;

  -- Single-use consumption, atomic with the relation upsert below.
  update public.cira_invitations
  set consumed_at = now(), outcome = 'accepted'
  where id = v_inv.id;

  select * into v_rel
  from public.cira_friendships f
  where f.user_low = least(v_uid, v_inv.creator_id)
    and f.user_high = greatest(v_uid, v_inv.creator_id)
  for update;

  if found then
    if v_rel.status = 'pending' then
      update public.cira_friendships
      set status = 'accepted', responded_at = now(), updated_at = now()
      where id = v_rel.id;
    end if;
    -- Already accepted: nothing to change.
  else
    insert into public.cira_friendships
      (requester_id, addressee_id, status, responded_at)
    values
      (v_inv.creator_id, v_uid, 'accepted', now());
  end if;

  return jsonb_build_object(
    'status',               'ok',
    'friend_user_id',       v_creator.user_id,
    'friend_handle',        v_creator.handle,
    'friend_display_name',  v_creator.display_name,
    'friend_avatar_key',    v_creator.avatar_key
  );
end;
$$;

------------------------------------------------------------------------------
-- 12. cira_decline_invitation
-- The decliner's identity is NOT stored anywhere (only outcome = 'declined').
------------------------------------------------------------------------------
create function public.cira_decline_invitation(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_inv public.cira_invitations;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  perform private.cira_enforce_rate_limit(v_uid, 'invitation_redeem', 10, interval '5 minutes');

  select * into v_inv
  from public.cira_invitations
  where token_hash = private.cira_hash_invite_code(p_code)
  for update;

  if not found
     or v_inv.consumed_at is not null
     or v_inv.revoked_at is not null
     or v_inv.expires_at <= now()
     or v_inv.creator_id = v_uid then
    raise exception 'INVITATION_UNAVAILABLE';
  end if;

  update public.cira_invitations
  set consumed_at = now(), outcome = 'declined'
  where id = v_inv.id;

  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- 13. cira_revoke_invitation (creator only)
------------------------------------------------------------------------------
create function public.cira_revoke_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_inv public.cira_invitations;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);

  select * into v_inv
  from public.cira_invitations
  where id = p_invitation_id and creator_id = v_uid
  for update;

  if not found
     or v_inv.consumed_at is not null
     or v_inv.revoked_at is not null
     or v_inv.expires_at <= now() then
    raise exception 'INVITATION_UNAVAILABLE';
  end if;

  update public.cira_invitations
  set revoked_at = now()
  where id = v_inv.id;

  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- 14. cira_list_relationships
-- The ONLY channel through which relations see each other's presence, as an
-- aggregate (in_vara > online > offline). Pending counterparts get NULL.
-- Opt-out users appear 'offline' (indistinguishable from really offline).
-- No last_seen_at, no session detail, no raw rows.
------------------------------------------------------------------------------
create function public.cira_list_relationships()
returns table (
  friendship_id uuid,
  counterpart_id uuid,
  handle text,
  display_name text,
  avatar_key text,
  status text,
  direction text,
  created_at timestamptz,
  responded_at timestamptz,
  presence text
)
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

  return query
  with visible as (
    select
      f.id as item_id,
      cp.user_id as other_id,
      cp.handle as other_handle,
      cp.display_name as other_name,
      cp.avatar_key as other_avatar,
      f.status as item_status,
      case when f.status = 'accepted' then 'accepted' else 'incoming' end as item_direction,
      f.created_at as item_created_at,
      f.responded_at as item_responded_at,
      case
        when f.status <> 'accepted' then null::text
        when not cp.presence_opt_in then 'offline'
        else case coalesce((
          select max(case p.state when 'in_vara' then 2 else 1 end)
          from public.cira_presence p
          where p.user_id = cp.user_id and p.expires_at > now()
        ), 0) when 2 then 'in_vara' when 1 then 'online' else 'offline' end
      end as item_presence
    from public.cira_friendships f
    join public.cira_profiles cp on cp.user_id = case
      when f.requester_id = v_uid then f.addressee_id else f.requester_id end
    where (f.status = 'accepted' and (f.requester_id = v_uid or f.addressee_id = v_uid))
       or (f.status = 'pending' and f.addressee_id = v_uid)

    union all

    select r.id, null::uuid, r.requested_handle, r.requested_handle, null::text,
      'pending'::text, 'outgoing'::text, r.created_at, null::timestamptz, null::text
    from public.cira_request_receipts r
    where r.requester_id = v_uid and r.expires_at > now()
  )
  select item_id, other_id, other_handle, other_name, other_avatar, item_status,
    item_direction, item_created_at, item_responded_at, item_presence
  from visible
  order by item_created_at desc, item_id;
end;
$$;

------------------------------------------------------------------------------
-- 15. cira_list_blocks
------------------------------------------------------------------------------
create function public.cira_list_blocks()
returns table (
  blocked_user_id uuid,
  handle text,
  display_name text,
  avatar_key text,
  blocked_at timestamptz
)
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

  return query
  select b.blocked_id, p.handle, p.display_name, p.avatar_key, b.created_at
  from public.cira_blocks b
  join public.cira_profiles p on p.user_id = b.blocked_id
  where b.blocker_id = v_uid
  order by b.created_at desc;
end;
$$;

------------------------------------------------------------------------------
-- 16. cira_list_invitations (creator's own; token_hash is NEVER returned)
------------------------------------------------------------------------------
create function public.cira_list_invitations()
returns table (
  invitation_id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  status text,
  outcome text
)
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

  return query
  select
    i.id,
    i.created_at,
    i.expires_at,
    case
      when i.consumed_at is not null then 'consumed'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at <= now() then 'expired'
      else 'active'
    end,
    i.outcome
  from public.cira_invitations i
  where i.creator_id = v_uid
  order by i.created_at desc;
end;
$$;

------------------------------------------------------------------------------
-- 17. cira_set_presence_consent
-- Opting out immediately deletes ALL presence sessions.
------------------------------------------------------------------------------
create function public.cira_set_presence_consent(p_opt_in boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid;
  v_opt_in boolean;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);

  v_opt_in := coalesce(p_opt_in, false);

  update public.cira_profiles
  set presence_opt_in = v_opt_in, updated_at = now()
  where user_id = v_uid;

  if not v_opt_in then
    delete from public.cira_presence where user_id = v_uid;
  end if;

  return jsonb_build_object('status', 'ok', 'presence_opt_in', v_opt_in);
end;
$$;

------------------------------------------------------------------------------
-- 18. cira_heartbeat_presence
-- 90 s TTL (client heartbeats every 30 s); schema hard-caps TTL at 120 s.
------------------------------------------------------------------------------
create function public.cira_heartbeat_presence(p_session_id uuid, p_state text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid;
  v_opt_in boolean;
begin
  v_uid := private.cira_require_uid();

  select presence_opt_in into v_opt_in
  from public.cira_profiles
  where user_id = v_uid;
  if not found then
    raise exception 'PROFILE_REQUIRED';
  end if;

  if not v_opt_in then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_session_id is null or p_state is null or p_state not in ('online', 'in_vara') then
    raise exception 'INVALID_TRANSITION';
  end if;

  insert into public.cira_presence (user_id, session_id, state, updated_at, expires_at)
  values (v_uid, p_session_id, p_state, now(), now() + interval '90 seconds')
  on conflict (user_id, session_id) do update
    set state = excluded.state,
        updated_at = now(),
        expires_at = now() + interval '90 seconds';

  -- Opportunistic cleanup of the caller's expired sessions.
  delete from public.cira_presence
  where user_id = v_uid and expires_at <= now();

  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- 19. cira_clear_presence (one session, or all when p_session_id is null)
------------------------------------------------------------------------------
create function public.cira_clear_presence(p_session_id uuid default null)
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

  delete from public.cira_presence
  where user_id = v_uid
    and (p_session_id is null or session_id = p_session_id);

  return jsonb_build_object('status', 'ok');
end;
$$;

------------------------------------------------------------------------------
-- Privileges: EXECUTE revoked from public/anon, granted to authenticated only.
------------------------------------------------------------------------------
revoke all on function public.cira_upsert_profile(text, text, text)  from public, anon;
revoke all on function public.cira_send_request(text)                from public, anon;
revoke all on function public.cira_accept_request(uuid)              from public, anon;
revoke all on function public.cira_decline_request(uuid)             from public, anon;
revoke all on function public.cira_cancel_request(uuid)              from public, anon;
revoke all on function public.cira_remove_friend(uuid)               from public, anon;
revoke all on function public.cira_block_user(uuid)                  from public, anon;
revoke all on function public.cira_unblock_user(uuid)                from public, anon;
revoke all on function public.cira_create_invitation(integer)        from public, anon;
revoke all on function public.cira_preview_invitation(text)          from public, anon;
revoke all on function public.cira_accept_invitation(text)           from public, anon;
revoke all on function public.cira_decline_invitation(text)          from public, anon;
revoke all on function public.cira_revoke_invitation(uuid)           from public, anon;
revoke all on function public.cira_list_relationships()              from public, anon;
revoke all on function public.cira_list_blocks()                     from public, anon;
revoke all on function public.cira_list_invitations()                from public, anon;
revoke all on function public.cira_set_presence_consent(boolean)     from public, anon;
revoke all on function public.cira_heartbeat_presence(uuid, text)    from public, anon;
revoke all on function public.cira_clear_presence(uuid)              from public, anon;

grant execute on function public.cira_upsert_profile(text, text, text)  to authenticated;
grant execute on function public.cira_send_request(text)                to authenticated;
grant execute on function public.cira_accept_request(uuid)              to authenticated;
grant execute on function public.cira_decline_request(uuid)             to authenticated;
grant execute on function public.cira_cancel_request(uuid)              to authenticated;
grant execute on function public.cira_remove_friend(uuid)               to authenticated;
grant execute on function public.cira_block_user(uuid)                  to authenticated;
grant execute on function public.cira_unblock_user(uuid)                to authenticated;
grant execute on function public.cira_create_invitation(integer)        to authenticated;
grant execute on function public.cira_preview_invitation(text)          to authenticated;
grant execute on function public.cira_accept_invitation(text)           to authenticated;
grant execute on function public.cira_decline_invitation(text)          to authenticated;
grant execute on function public.cira_revoke_invitation(uuid)           to authenticated;
grant execute on function public.cira_list_relationships()              to authenticated;
grant execute on function public.cira_list_blocks()                     to authenticated;
grant execute on function public.cira_list_invitations()                to authenticated;
grant execute on function public.cira_set_presence_consent(boolean)     to authenticated;
grant execute on function public.cira_heartbeat_presence(uuid, text)    to authenticated;
grant execute on function public.cira_clear_presence(uuid)              to authenticated;
