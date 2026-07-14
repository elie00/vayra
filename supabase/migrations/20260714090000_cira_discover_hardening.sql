-- CIRA Discover: minimise invitation lifecycle data while preserving every
-- existing RPC signature. Active bearer secrets remain revocable and visible
-- to their creator; terminal rows are deleted instead of becoming a social
-- activity history.

create function private.cira_prune_creator_invitations(p_creator_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.cira_invitations
  where creator_id = p_creator_id
    and (consumed_at is not null or revoked_at is not null or expires_at <= now());
$$;

revoke all on function private.cira_prune_creator_invitations(uuid)
  from public, anon, authenticated;

-- Remove legacy terminal rows before DELETE starts broadcasting invalidations.
delete from public.cira_invitations
where consumed_at is not null or revoked_at is not null or expires_at <= now();

-- Invitation lifecycle concerns the creator only. DELETE must invalidate the
-- creator's active list without exposing the redeemer or the outcome.
create or replace function private.cira_tg_invitations_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cira_notify(array[
    case when tg_op = 'DELETE' then old.creator_id else new.creator_id end
  ]);
  return null;
end;
$$;

drop trigger cira_invitations_notify on public.cira_invitations;
create trigger cira_invitations_notify
  after insert or update or delete on public.cira_invitations
  for each row execute function private.cira_tg_invitations_notify();

create or replace function public.cira_create_invitation(p_ttl_seconds integer default 900)
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

  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 1800 then
    raise exception 'INVALID_TRANSITION';
  end if;

  perform private.cira_prune_creator_invitations(v_uid);

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
        if v_attempt >= 3 then raise; end if;
    end;
  end loop;

  return jsonb_build_object(
    'invitation_id', v_id,
    'code',          v_code,
    'expires_at',    v_expires
  );
end;
$$;

create or replace function public.cira_preview_invitation(p_code text)
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
  where token_hash = private.cira_hash_invite_code(p_code)
  for update;

  if not found then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;
  if v_inv.consumed_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    delete from public.cira_invitations where id = v_inv.id;
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;
  if v_inv.creator_id = v_uid or private.cira_any_block(v_uid, v_inv.creator_id) then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;

  select * into v_creator from public.cira_profiles where user_id = v_inv.creator_id;
  if not found then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;

  return jsonb_build_object(
    'creator_handle',       v_creator.handle,
    'creator_display_name', v_creator.display_name,
    'creator_avatar_key',   v_creator.avatar_key,
    'expires_at',           v_inv.expires_at
  );
end;
$$;

create or replace function public.cira_accept_invitation(p_code text)
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

  if p_code is null or char_length(p_code) > 64
     or private.cira_normalize_invite_code(p_code) !~ '^CIRA[0-9A-HJKMNP-TV-Z]{20}$' then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;

  select * into v_inv
  from public.cira_invitations
  where token_hash = private.cira_hash_invite_code(p_code)
  for update;

  if not found then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;
  if v_inv.consumed_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    delete from public.cira_invitations where id = v_inv.id;
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;
  if v_inv.creator_id = v_uid then
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
  else
    insert into public.cira_friendships
      (requester_id, addressee_id, status, responded_at)
    values (v_inv.creator_id, v_uid, 'accepted', now());
  end if;

  -- Deleting is the single-use marker: a replay is indistinguishable from an
  -- unknown token and no terminal social event remains at rest.
  delete from public.cira_invitations where id = v_inv.id;

  return jsonb_build_object(
    'status',               'ok',
    'friend_user_id',       v_creator.user_id,
    'friend_handle',        v_creator.handle,
    'friend_display_name',  v_creator.display_name,
    'friend_avatar_key',    v_creator.avatar_key
  );
end;
$$;

create or replace function public.cira_decline_invitation(p_code text)
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

  if p_code is null or char_length(p_code) > 64
     or private.cira_normalize_invite_code(p_code) !~ '^CIRA[0-9A-HJKMNP-TV-Z]{20}$' then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;

  select * into v_inv
  from public.cira_invitations
  where token_hash = private.cira_hash_invite_code(p_code)
  for update;

  if not found then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;
  if v_inv.consumed_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    delete from public.cira_invitations where id = v_inv.id;
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;
  if v_inv.creator_id = v_uid or private.cira_any_block(v_uid, v_inv.creator_id) then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;

  delete from public.cira_invitations where id = v_inv.id;
  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.cira_revoke_invitation(p_invitation_id uuid)
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

  if not found then
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;
  if v_inv.consumed_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    delete from public.cira_invitations where id = v_inv.id;
    return jsonb_build_object('error', 'INVITATION_UNAVAILABLE');
  end if;

  delete from public.cira_invitations where id = v_inv.id;
  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.cira_list_invitations()
returns table (
  invitation_id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  status text,
  outcome text
)
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
  perform private.cira_prune_creator_invitations(v_uid);

  return query
  select i.id, i.created_at, i.expires_at, 'active'::text, null::text
  from public.cira_invitations i
  where i.creator_id = v_uid and i.expires_at > now()
  order by i.created_at desc;
end;
$$;
