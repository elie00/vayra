-- VARA Collections v2: per-collection edit policy and collection delegation.
\echo '=== 22_collection_policy_delegate ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000022a1'),  -- alice: owner
  ('00000000-0000-4000-8000-0000000022b2'),  -- bob: admin
  ('00000000-0000-4000-8000-0000000022c3'),  -- carol: member (editor under policy)
  ('00000000-0000-4000-8000-0000000022d4'),  -- dave: member, becomes delegate
  ('00000000-0000-4000-8000-0000000022e5');  -- eve: outsider

do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000022a1'); perform public.cira_upsert_profile('p22_alice','Alice');
  perform test.login('00000000-0000-4000-8000-0000000022b2'); perform public.cira_upsert_profile('p22_bob','Bob');
  perform test.login('00000000-0000-4000-8000-0000000022c3'); perform public.cira_upsert_profile('p22_carol','Carol');
  perform test.login('00000000-0000-4000-8000-0000000022d4'); perform public.cira_upsert_profile('p22_dave','Dave');
  perform test.login('00000000-0000-4000-8000-0000000022e5'); perform public.cira_upsert_profile('p22_eve','Eve');
end;
$do$;

-- Policy levels: reader / contributor / collaborator
do $do$
declare
  g uuid; col uuid;
  a uuid:='00000000-0000-4000-8000-0000000022a1';
  c uuid:='00000000-0000-4000-8000-0000000022c3';
  alice_item uuid; carol_item uuid;
begin
  perform test.login(a);
  g := (public.cira_create_group('Policy club', null, null, 10))->>'group_id';
  col := (public.vara_create_collection(g, 'Liste'))->>'collection_id';
  alice_item := (public.vara_add_collection_item(col,'tt0000001','movie','Alice pick'))->>'item_id';
  perform test.logout();
  insert into public.cira_group_members(group_id,user_id,role) values (g,c,'member');

  -- default reader: member cannot add
  perform test.login(c);
  begin perform public.vara_add_collection_item(col,'tt0000002','movie','Nope');
    raise exception 'TEST_FAILED: reader added item';
  exception when others then if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if; end;

  -- invalid policy rejected; only manager sets policy
  perform test.login(c);
  begin perform public.vara_set_collection_policy(col,'collaborator');
    raise exception 'TEST_FAILED: member set policy';
  exception when others then if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if; end;
  perform test.login(a);
  begin perform public.vara_set_collection_policy(col,'wrong');
    raise exception 'TEST_FAILED: invalid policy accepted';
  exception when others then if sqlerrm <> 'INVALID_COLLECTION_POLICY' then raise; end if; end;

  -- contributor: carol adds + manages her own, not others'
  perform public.vara_set_collection_policy(col,'contributor');
  perform test.login(c);
  carol_item := (public.vara_add_collection_item(col,'tt0000003','movie','Carol pick'))->>'item_id';
  perform public.vara_move_collection_item(carol_item, 1);           -- own: ok
  begin perform public.vara_move_collection_item(alice_item, 1);
    raise exception 'TEST_FAILED: contributor moved others item';
  exception when others then if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if; end;
  begin perform public.vara_remove_collection_item(alice_item);
    raise exception 'TEST_FAILED: contributor removed others item';
  exception when others then if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if; end;
  perform public.vara_remove_collection_item(carol_item);            -- own: ok

  -- collaborator: carol edits ANY item
  perform test.login(a);
  perform public.vara_set_collection_policy(col,'collaborator');
  perform test.login(c);
  perform public.vara_move_collection_item(alice_item, 1);           -- any: ok now
  perform public.vara_remove_collection_item(alice_item);            -- any: ok now
  -- but still cannot manage the collection itself
  begin perform public.vara_delete_collection(col);
    raise exception 'TEST_FAILED: collaborator deleted collection';
  exception when others then if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if; end;

  -- JSON exposes member_policy and derived flags
  perform test.login(a);
  if (public.vara_get_collection(col)->>'member_policy') <> 'collaborator' then
    raise exception 'TEST_FAILED: member_policy not exposed';
  end if;
  if (public.vara_get_collection(col)->>'members_can_edit')::boolean is distinct from true then
    raise exception 'TEST_FAILED: generated members_can_edit wrong';
  end if;
end;
$do$;

-- Delegation
do $do$
declare
  g uuid; col uuid;
  a uuid:='00000000-0000-4000-8000-0000000022a1';
  d uuid:='00000000-0000-4000-8000-0000000022d4';
  e uuid:='00000000-0000-4000-8000-0000000022e5';
begin
  perform test.login(a);
  g := (public.cira_create_group('Deleg club', null, null, 10))->>'group_id';
  col := (public.vara_create_collection(g, 'Editorial'))->>'collection_id';
  perform test.logout();
  insert into public.cira_group_members(group_id,user_id,role) values (g,d,'member');

  -- cannot delegate to a non-member (eve)
  perform test.login(a);
  begin perform public.vara_add_collection_delegate(col, e);
    raise exception 'TEST_FAILED: delegated to non-member';
  exception when others then if sqlerrm <> 'COLLECTION_DELEGATE_UNAVAILABLE' then raise; end if; end;

  -- before delegation, dave (reader member) cannot manage
  perform test.login(d);
  begin perform public.vara_update_collection(col,'Renamed');
    raise exception 'TEST_FAILED: non-delegate member renamed';
  exception when others then if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if; end;

  -- owner delegates to dave (idempotent)
  perform test.login(a);
  perform public.vara_add_collection_delegate(col, d);
  perform public.vara_add_collection_delegate(col, d);   -- no-op

  -- delegate can manage the collection: rename, set policy, delete — but not the group, not re-delegate
  perform test.login(d);
  perform public.vara_update_collection(col,'Dave renamed');
  perform public.vara_set_collection_policy(col,'collaborator');
  if (public.vara_get_collection(col)->>'is_delegate')::boolean is distinct from true then
    raise exception 'TEST_FAILED: is_delegate not exposed to delegate';
  end if;
  begin perform public.vara_add_collection_delegate(col, a);
    raise exception 'TEST_FAILED: delegate re-delegated';
  exception when others then if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if; end;
  begin perform public.cira_update_group(g,'Group pwned');
    raise exception 'TEST_FAILED: delegate got group admin';
  exception when others then if sqlerrm <> 'GROUP_FORBIDDEN' then raise; end if; end;

  -- rights cease immediately when dave leaves the group (and row is purged)
  perform public.cira_leave_group(g);
  perform test.logout();
  if exists (select 1 from public.vara_collection_delegates where collection_id=col and user_id=d) then
    raise exception 'TEST_FAILED: delegate row not purged on leave';
  end if;
  perform test.login(d);
  begin perform public.vara_update_collection(col,'Still?');
    raise exception 'TEST_FAILED: ex-member delegate still manages';
  exception when others then if sqlerrm <> 'COLLECTION_NOT_FOUND' then raise; end if; end;

  -- delegate management is frozen on an archived group
  perform test.logout();
  insert into public.cira_group_members(group_id,user_id,role) values (g,d,'member');
  perform test.login(a);
  perform public.vara_add_collection_delegate(col, d);
  perform public.cira_archive_group(g);
  perform test.login(d);
  begin perform public.vara_set_collection_policy(col,'reader');
    raise exception 'TEST_FAILED: delegate acted on archived group';
  exception when others then if sqlerrm <> 'GROUP_ARCHIVED' then raise; end if; end;

  -- deleting the collection cascades the delegation away
  perform test.login(a);
  perform public.cira_restore_group(g);
  perform public.vara_delete_collection(col);
  perform test.logout();
  if exists (select 1 from public.vara_collection_delegates where collection_id=col) then
    raise exception 'TEST_FAILED: delegates survived collection deletion';
  end if;
end;
$do$;

\echo '22_collection_policy_delegate OK'
