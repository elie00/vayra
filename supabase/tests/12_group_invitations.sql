-- CIRA complete: direct and opaque-link group invitation lifecycle.
\echo '=== 12_group_invitations ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000012a1'),
  ('00000000-0000-4000-8000-0000000012b2'),
  ('00000000-0000-4000-8000-0000000012c3'),
  ('00000000-0000-4000-8000-0000000012d4');

do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000012a1');
  perform public.cira_upsert_profile('g12_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000012b2');
  perform public.cira_upsert_profile('g12_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000012c3');
  perform public.cira_upsert_profile('g12_carol', 'Carol');
  perform test.login('00000000-0000-4000-8000-0000000012d4');
  perform public.cira_upsert_profile('g12_dave', 'Dave');
  perform test.login('00000000-0000-4000-8000-0000000012a1');
  perform public.cira_send_request('g12_bob');
  perform test.login('00000000-0000-4000-8000-0000000012b2');
  perform public.cira_accept_request((select id from public.cira_friendships
    where requester_id = '00000000-0000-4000-8000-0000000012a1'
      and addressee_id = '00000000-0000-4000-8000-0000000012b2'));
end;
$do$;

do $do$
declare
  g jsonb;
  inv jsonb;
  link jsonb;
  gid uuid;
  iid uuid;
  code text;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000012a1');
  g := public.cira_create_group('Invite test', null, null, 4);
  gid := (g->>'group_id')::uuid;
  inv := public.cira_invite_group_member(gid, '00000000-0000-4000-8000-0000000012b2');
  iid := (inv->>'invitation_id')::uuid;

  perform test.login('00000000-0000-4000-8000-0000000012b2');
  select count(*) into n from public.cira_list_group_invites();
  if n <> 1 then raise exception 'TEST_FAILED: invitee inbox count %', n; end if;
  perform public.cira_accept_group_invite(iid);
  perform test.logout();
  if not exists (select 1 from public.cira_group_members where group_id = gid
      and user_id = '00000000-0000-4000-8000-0000000012b2') then
    raise exception 'TEST_FAILED: direct invite did not create membership';
  end if;
  if exists (select 1 from public.cira_group_invites where id = iid) then
    raise exception 'TEST_FAILED: accepted direct invite history retained';
  end if;

  -- A non-relation cannot be directly invited (no handle enumeration path).
  perform test.login('00000000-0000-4000-8000-0000000012a1');
  begin
    perform public.cira_invite_group_member(gid, '00000000-0000-4000-8000-0000000012c3');
    raise exception 'TEST_FAILED: stranger directly invited';
  exception when others then
    if sqlerrm <> 'GROUP_INVITE_UNAVAILABLE' then raise; end if;
  end;

  -- Opaque link admits one authenticated profile, then disappears.
  link := public.cira_create_group_link(gid, 900);
  code := link->>'code';
  if code !~ '^CIRAG[0-9A-HJKMNP-TV-Z]{20}$' then
    raise exception 'TEST_FAILED: malformed group code %', code;
  end if;
  perform test.login('00000000-0000-4000-8000-0000000012c3');
  if (public.cira_preview_group_link(code)->>'group_name') <> 'Invite test' then
    raise exception 'TEST_FAILED: group preview incomplete';
  end if;
  perform public.cira_accept_group_link(code);
  begin
    perform public.cira_accept_group_link(code);
    raise exception 'TEST_FAILED: group link reused';
  exception when others then
    if sqlerrm <> 'GROUP_INVITE_UNAVAILABLE' then raise; end if;
  end;

  -- Last seat can be reserved by an accepted direct invitation; a link
  -- cannot overfill because acceptance locks and rechecks the group.
  perform test.login('00000000-0000-4000-8000-0000000012a1');
  perform public.cira_send_request('g12_dave');
  perform test.login('00000000-0000-4000-8000-0000000012d4');
  perform public.cira_accept_request((select id from public.cira_friendships
    where user_low = least('00000000-0000-4000-8000-0000000012a1'::uuid,
                           '00000000-0000-4000-8000-0000000012d4'::uuid)
      and user_high = greatest('00000000-0000-4000-8000-0000000012a1'::uuid,
                               '00000000-0000-4000-8000-0000000012d4'::uuid)));
  perform test.login('00000000-0000-4000-8000-0000000012a1');
  inv := public.cira_invite_group_member(gid, '00000000-0000-4000-8000-0000000012d4');
  perform test.login('00000000-0000-4000-8000-0000000012d4');
  perform public.cira_decline_group_invite((inv->>'invitation_id')::uuid);
  perform test.logout();
  if exists (select 1 from public.cira_group_invites where id = (inv->>'invitation_id')::uuid) then
    raise exception 'TEST_FAILED: declined invite history retained';
  end if;
end;
$do$;

\echo '12_group_invitations OK'
