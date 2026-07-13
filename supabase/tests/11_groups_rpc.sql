-- CIRA complete: group lifecycle, roles and caller-scoped reads.
\echo '=== 11_groups_rpc ==='

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000011a1', 'g11a@test'),
  ('00000000-0000-4000-8000-0000000011b2', 'g11b@test'),
  ('00000000-0000-4000-8000-0000000011c3', 'g11c@test'),
  ('00000000-0000-4000-8000-0000000011d4', 'g11d@test');

do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000011a1');
  perform public.cira_upsert_profile('g11_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000011b2');
  perform public.cira_upsert_profile('g11_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000011c3');
  perform public.cira_upsert_profile('g11_carol', 'Carol');
  perform test.login('00000000-0000-4000-8000-0000000011d4');
  perform public.cira_upsert_profile('g11_dave', 'Dave');
end;
$do$;

do $do$
declare
  g jsonb;
  gid uuid;
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000011a1');
  g := public.cira_create_group('Night crew', 'Private circle', null, 4);
  gid := (g->>'group_id')::uuid;
  if g->>'role' <> 'owner' or (g->>'member_count')::integer <> 1 then
    raise exception 'TEST_FAILED: create result is incomplete: %', g;
  end if;

  select count(*) into n from public.cira_list_groups();
  if n <> 1 then raise exception 'TEST_FAILED: owner cannot list group'; end if;

  -- Fixtures represent members already admitted by the invitation flow.
  perform test.logout();
  insert into public.cira_group_members (group_id, user_id, role, invited_by) values
    (gid, '00000000-0000-4000-8000-0000000011b2', 'admin', '00000000-0000-4000-8000-0000000011a1'),
    (gid, '00000000-0000-4000-8000-0000000011c3', 'member', '00000000-0000-4000-8000-0000000011a1');

  perform test.login('00000000-0000-4000-8000-0000000011b2');
  perform public.cira_update_group(gid, 'Night circle', 'Updated', null, 5);
  select count(*) into n from public.cira_list_group_members(gid);
  if n <> 3 then raise exception 'TEST_FAILED: member list count is %', n; end if;

  -- Admin cannot promote or remove another admin/owner.
  begin
    perform public.cira_set_group_role(gid, '00000000-0000-4000-8000-0000000011c3', 'admin');
    raise exception 'TEST_FAILED: admin changed roles';
  exception when others then
    if sqlerrm <> 'GROUP_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.cira_remove_group_member(gid, '00000000-0000-4000-8000-0000000011a1');
    raise exception 'TEST_FAILED: admin removed owner';
  exception when others then
    if sqlerrm <> 'GROUP_FORBIDDEN' then raise; end if;
  end;

  perform test.login('00000000-0000-4000-8000-0000000011a1');
  perform public.cira_set_group_role(gid, '00000000-0000-4000-8000-0000000011c3', 'admin');
  perform public.cira_transfer_group_ownership(gid, '00000000-0000-4000-8000-0000000011b2');
  perform test.logout();
  if private.cira_group_role(gid, '00000000-0000-4000-8000-0000000011b2') <> 'owner'
     or private.cira_group_role(gid, '00000000-0000-4000-8000-0000000011a1') <> 'admin' then
    raise exception 'TEST_FAILED: ownership transfer roles incorrect';
  end if;

  -- Former owner can now leave; current owner must transfer before leaving.
  perform test.login('00000000-0000-4000-8000-0000000011a1');
  perform public.cira_leave_group(gid);
  perform test.login('00000000-0000-4000-8000-0000000011b2');
  begin
    perform public.cira_leave_group(gid);
    raise exception 'TEST_FAILED: owner left without transfer';
  exception when others then
    if sqlerrm <> 'GROUP_OWNER_MUST_TRANSFER' then raise; end if;
  end;
  perform public.cira_remove_group_member(gid, '00000000-0000-4000-8000-0000000011c3');

  perform test.login('00000000-0000-4000-8000-0000000011d4');
  select count(*) into n from public.cira_list_groups();
  if n <> 0 then raise exception 'TEST_FAILED: stranger can list a private group'; end if;
  begin
    perform public.cira_list_group_members(gid);
    raise exception 'TEST_FAILED: stranger can list private members';
  exception when others then
    if sqlerrm <> 'GROUP_NOT_FOUND' then raise; end if;
  end;

  perform test.login('00000000-0000-4000-8000-0000000011b2');
  perform public.cira_delete_group(gid);
  perform test.logout();
  if exists (select 1 from public.cira_groups where id = gid) then
    raise exception 'TEST_FAILED: owner could not delete group';
  end if;
end;
$do$;

\echo '11_groups_rpc OK'
