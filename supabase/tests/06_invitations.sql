-- CIRA tests 06 - invitations.
-- Token format (CIRA-XXXX-... Crockford base32), normalisation (case and
-- dashes ignored), only the sha256 hash is stored, single use (double
-- acceptance: exactly one succeeds), expired/revoked/consumed/unknown/self/
-- blocked all collapse into INVITATION_UNAVAILABLE, decline stores no
-- identity, the target is derived from the token only.
-- Users: A (06a1), B (06b2), C (06c3), D (06d4).
\echo '=== 06_invitations ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000006a1'),
  ('00000000-0000-4000-8000-0000000006b2'),
  ('00000000-0000-4000-8000-0000000006c3'),
  ('00000000-0000-4000-8000-0000000006d4');

create temporary table tvars (k text primary key, v text);
grant select on tvars to authenticated;  -- read while impersonating users

do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000006a1');
  perform public.cira_upsert_profile('f06_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000006b2');
  perform public.cira_upsert_profile('f06_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000006c3');
  perform public.cira_upsert_profile('f06_carol', 'Carol');
  perform test.login('00000000-0000-4000-8000-0000000006d4');
  perform public.cira_upsert_profile('f06_dave', 'Dave');
end;
$do$;

-- Creation: code format, default TTL ~15 min, only the 32-byte sha256 of the
-- normalised code is stored.
do $do$
declare
  v jsonb;
  v_code text;
  v_id uuid;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000006a1');
  v := public.cira_create_invitation();
  v_code := v ->> 'code';
  v_id := (v ->> 'invitation_id')::uuid;

  -- Crockford base32 (no I, L, O, U), CIRA-XXXX-XXXX-XXXX-XXXX-XXXX.
  if v_code !~ '^CIRA(-[0-9A-HJKMNP-TV-Z]{4}){5}$' then
    raise exception 'TEST_FAILED: bad invitation code format: %', v_code;
  end if;
  if abs(extract(epoch from ((v ->> 'expires_at')::timestamptz - now())) - 900) > 5 then
    raise exception 'TEST_FAILED: default TTL is not ~15 min: %', v ->> 'expires_at';
  end if;

  perform test.logout();
  select count(*) into n from public.cira_invitations
  where id = v_id
    and octet_length(token_hash) = 32
    and token_hash = sha256(convert_to(regexp_replace(upper(v_code), '[^0-9A-Z]', '', 'g'), 'UTF8'));
  if n <> 1 then
    raise exception 'TEST_FAILED: stored token_hash is not sha256(normalised code)';
  end if;

  insert into tvars values ('code1', v_code), ('id1', v_id::text);
end;
$do$;

-- TTL parameter bounds.
do $do$
declare
  v jsonb;
begin
  perform test.login('00000000-0000-4000-8000-0000000006a1');
  begin
    perform public.cira_create_invitation(30);
    raise exception 'TEST_FAILED: TTL below 60 s accepted';
  exception when others then
    if sqlerrm <> 'INVALID_TRANSITION' then raise; end if;
  end;
  begin
    perform public.cira_create_invitation(3000);
    raise exception 'TEST_FAILED: TTL above 30 min accepted';
  exception when others then
    if sqlerrm <> 'INVALID_TRANSITION' then raise; end if;
  end;
  v := public.cira_create_invitation(60);
  if abs(extract(epoch from ((v ->> 'expires_at')::timestamptz - now())) - 60) > 5 then
    raise exception 'TEST_FAILED: explicit 60 s TTL not honoured';
  end if;
end;
$do$;

-- Preview: creator info, works with the normalised (lowercase, dash-free)
-- form; unknown codes collapse into INVITATION_UNAVAILABLE.
do $do$
declare
  v_code text := (select t.v from tvars t where t.k = 'code1');
  v jsonb;
begin
  perform test.login('00000000-0000-4000-8000-0000000006b2');
  v := public.cira_preview_invitation(v_code);
  if v ->> 'creator_handle' <> 'f06_alice' then
    raise exception 'TEST_FAILED: preview creator mismatch: %', v;
  end if;
  v := public.cira_preview_invitation(lower(replace(v_code, '-', '')));
  if v ->> 'creator_handle' <> 'f06_alice' then
    raise exception 'TEST_FAILED: normalisation broken in preview: %', v;
  end if;

  begin
    perform public.cira_preview_invitation('CIRA-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ');
    raise exception 'TEST_FAILED: unknown code previewable';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
end;
$do$;

-- Acceptance: target derived from the token only, relation accepted, token
-- consumed atomically; the SECOND acceptance (other user, same code) fails.
do $do$
declare
  v_code text := (select t.v from tvars t where t.k = 'code1');
  v jsonb;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000006b2');
  v := public.cira_accept_invitation(lower(replace(v_code, '-', '')));
  if v ->> 'friend_handle' <> 'f06_alice' then
    raise exception 'TEST_FAILED: accept returned wrong friend: %', v;
  end if;

  perform test.logout();
  select count(*) into n from public.cira_friendships
  where user_low = '00000000-0000-4000-8000-0000000006a1'
    and user_high = '00000000-0000-4000-8000-0000000006b2'
    and status = 'accepted' and responded_at is not null;
  if n <> 1 then raise exception 'TEST_FAILED: relation not created by invitation'; end if;
  select count(*) into n from public.cira_invitations
  where id = (select t.v from tvars t where t.k = 'id1')::uuid
    and consumed_at is not null and outcome = 'accepted' and revoked_at is null;
  if n <> 1 then raise exception 'TEST_FAILED: invitation not consumed as accepted'; end if;

  -- double acceptance: C reuses the same code -> refused, no relation
  perform test.login('00000000-0000-4000-8000-0000000006c3');
  begin
    perform public.cira_accept_invitation(v_code);
    raise exception 'TEST_FAILED: consumed token accepted twice';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
  perform test.logout();
  select count(*) into n from public.cira_friendships
  where user_low = least('00000000-0000-4000-8000-0000000006a1'::uuid, '00000000-0000-4000-8000-0000000006c3'::uuid)
    and user_high = greatest('00000000-0000-4000-8000-0000000006a1'::uuid, '00000000-0000-4000-8000-0000000006c3'::uuid);
  if n <> 0 then raise exception 'TEST_FAILED: reuse still created a relation'; end if;
end;
$do$;

-- Creator-side views and revocation.
do $do$
declare
  v jsonb;
  v_status text;
begin
  perform test.login('00000000-0000-4000-8000-0000000006a1');
  select status into v_status from public.cira_list_invitations()
  where invitation_id = (select t.v from tvars t where t.k = 'id1')::uuid;
  if v_status <> 'consumed' then
    raise exception 'TEST_FAILED: consumed invitation listed as %', v_status;
  end if;

  -- new invitation, revoked by its creator; then unusable and not
  -- re-revocable
  v := public.cira_create_invitation();
  perform test.logout();
  insert into tvars values ('code2', v ->> 'code'), ('id2', v ->> 'invitation_id');

  perform test.login('00000000-0000-4000-8000-0000000006a1');
  perform public.cira_revoke_invitation((v ->> 'invitation_id')::uuid);
  select status into v_status from public.cira_list_invitations()
  where invitation_id = (v ->> 'invitation_id')::uuid;
  if v_status <> 'revoked' then
    raise exception 'TEST_FAILED: revoked invitation listed as %', v_status;
  end if;
  begin
    perform public.cira_revoke_invitation((v ->> 'invitation_id')::uuid);
    raise exception 'TEST_FAILED: double revoke succeeded';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
  -- revoking a CONSUMED invitation is refused
  begin
    perform public.cira_revoke_invitation((select t.v from tvars t where t.k = 'id1')::uuid);
    raise exception 'TEST_FAILED: revoke of consumed invitation succeeded';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
  -- unknown id
  begin
    perform public.cira_revoke_invitation(gen_random_uuid());
    raise exception 'TEST_FAILED: revoke of unknown invitation succeeded';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;

  -- a revoked token can no longer be redeemed
  perform test.login('00000000-0000-4000-8000-0000000006c3');
  begin
    perform public.cira_accept_invitation((select t.v from tvars t where t.k = 'code2'));
    raise exception 'TEST_FAILED: revoked token accepted';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
end;
$do$;

-- Only the creator can revoke.
do $do$
declare
  v jsonb;
begin
  perform test.login('00000000-0000-4000-8000-0000000006a1');
  v := public.cira_create_invitation();
  perform test.logout();
  insert into tvars values ('code3', v ->> 'code'), ('id3', v ->> 'invitation_id');

  perform test.login('00000000-0000-4000-8000-0000000006b2');
  begin
    perform public.cira_revoke_invitation((v ->> 'invitation_id')::uuid);
    raise exception 'TEST_FAILED: non-creator revoked the invitation';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
end;
$do$;

-- Expiry: a stolen-but-expired token is dead (backdated by the superuser).
do $do$
declare
  v_status text;
begin
  update public.cira_invitations
  set created_at = now() - interval '20 minutes',
      expires_at = now() - interval '5 minutes'
  where id = (select t.v from tvars t where t.k = 'id3')::uuid;

  perform test.login('00000000-0000-4000-8000-0000000006c3');
  begin
    perform public.cira_preview_invitation((select t.v from tvars t where t.k = 'code3'));
    raise exception 'TEST_FAILED: expired token previewable';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
  begin
    perform public.cira_accept_invitation((select t.v from tvars t where t.k = 'code3'));
    raise exception 'TEST_FAILED: expired token accepted';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;

  perform test.login('00000000-0000-4000-8000-0000000006a1');
  select status into v_status from public.cira_list_invitations()
  where invitation_id = (select t.v from tvars t where t.k = 'id3')::uuid;
  if v_status <> 'expired' then
    raise exception 'TEST_FAILED: expired invitation listed as %', v_status;
  end if;
end;
$do$;

-- Decline: consumes the token, records ONLY the outcome (no decliner
-- identity - the table has no column for it, see 00_audit), no relation.
do $do$
declare
  v jsonb;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000006a1');
  v := public.cira_create_invitation();
  perform test.login('00000000-0000-4000-8000-0000000006c3');
  perform public.cira_decline_invitation(v ->> 'code');

  perform test.logout();
  select count(*) into n from public.cira_invitations
  where id = (v ->> 'invitation_id')::uuid
    and consumed_at is not null and outcome = 'declined';
  if n <> 1 then raise exception 'TEST_FAILED: decline not recorded'; end if;
  select count(*) into n from public.cira_friendships
  where user_low = least('00000000-0000-4000-8000-0000000006a1'::uuid, '00000000-0000-4000-8000-0000000006c3'::uuid)
    and user_high = greatest('00000000-0000-4000-8000-0000000006a1'::uuid, '00000000-0000-4000-8000-0000000006c3'::uuid);
  if n <> 0 then raise exception 'TEST_FAILED: decline created a relation'; end if;

  -- declined = consumed: no further redemption
  perform test.login('00000000-0000-4000-8000-0000000006c3');
  begin
    perform public.cira_accept_invitation(v ->> 'code');
    raise exception 'TEST_FAILED: declined token accepted afterwards';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
end;
$do$;

-- Self-redemption and blocked redemption collapse into the same error.
do $do$
declare
  v jsonb;
begin
  perform test.login('00000000-0000-4000-8000-0000000006a1');
  v := public.cira_create_invitation();
  perform test.logout();
  insert into tvars values ('code5', v ->> 'code');

  perform test.login('00000000-0000-4000-8000-0000000006a1');
  begin
    perform public.cira_preview_invitation(v ->> 'code');
    raise exception 'TEST_FAILED: creator previewed own invitation';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
  begin
    perform public.cira_accept_invitation(v ->> 'code');
    raise exception 'TEST_FAILED: creator accepted own invitation';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
  begin
    perform public.cira_decline_invitation(v ->> 'code');
    raise exception 'TEST_FAILED: creator declined own invitation';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;

  -- C blocks A: the token becomes unusable for C, same generic error
  perform test.login('00000000-0000-4000-8000-0000000006c3');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000006a1');
  begin
    perform public.cira_preview_invitation(v ->> 'code');
    raise exception 'TEST_FAILED: blocked user previewed the invitation';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
  begin
    perform public.cira_accept_invitation(v ->> 'code');
    raise exception 'TEST_FAILED: blocked user accepted the invitation';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
  begin
    perform public.cira_decline_invitation(v ->> 'code');
    raise exception 'TEST_FAILED: blocked user declined the invitation';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
  perform public.cira_unblock_user('00000000-0000-4000-8000-0000000006a1');
end;
$do$;

-- A pending direct request is upgraded (not duplicated) when the addressee
-- side redeems a token from the same person.
do $do$
declare
  v_code text := (select t.v from tvars t where t.k = 'code5');
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000006a1');
  perform public.cira_send_request('f06_dave');

  perform test.login('00000000-0000-4000-8000-0000000006d4');
  perform public.cira_accept_invitation(v_code);

  perform test.logout();
  select count(*) into n from public.cira_friendships
  where user_low = least('00000000-0000-4000-8000-0000000006a1'::uuid, '00000000-0000-4000-8000-0000000006d4'::uuid)
    and user_high = greatest('00000000-0000-4000-8000-0000000006a1'::uuid, '00000000-0000-4000-8000-0000000006d4'::uuid);
  if n <> 1 then raise exception 'TEST_FAILED: % relation rows after upgrade (expected 1)', n; end if;
  select count(*) into n from public.cira_friendships
  where user_low = least('00000000-0000-4000-8000-0000000006a1'::uuid, '00000000-0000-4000-8000-0000000006d4'::uuid)
    and user_high = greatest('00000000-0000-4000-8000-0000000006a1'::uuid, '00000000-0000-4000-8000-0000000006d4'::uuid)
    and status = 'accepted' and responded_at is not null;
  if n <> 1 then raise exception 'TEST_FAILED: pending pair not upgraded to accepted'; end if;
end;
$do$;

drop table tvars;
\echo '06_invitations OK'
