-- CIRA hardening: keep every unusable invitation path behind the same
-- INVITATION_UNAVAILABLE response. This additive migration intentionally
-- replaces only the two affected RPCs; existing data and signatures stay
-- unchanged.

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

  select * into v_inv
  from public.cira_invitations
  where token_hash = private.cira_hash_invite_code(p_code);

  if not found
     or v_inv.consumed_at is not null
     or v_inv.revoked_at is not null
     or v_inv.expires_at <= now()
     or v_inv.creator_id = v_uid
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

  select * into v_inv
  from public.cira_invitations
  where token_hash = private.cira_hash_invite_code(p_code)
  for update;

  if not found
     or v_inv.consumed_at is not null
     or v_inv.revoked_at is not null
     or v_inv.expires_at <= now()
     or v_inv.creator_id = v_uid
     or private.cira_any_block(v_uid, v_inv.creator_id) then
    raise exception 'INVITATION_UNAVAILABLE';
  end if;

  update public.cira_invitations
  set consumed_at = now(), outcome = 'declined'
  where id = v_inv.id;

  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.cira_preview_invitation(text) from public, anon;
revoke all on function public.cira_decline_invitation(text) from public, anon;
grant execute on function public.cira_preview_invitation(text) to authenticated;
grant execute on function public.cira_decline_invitation(text) to authenticated;
