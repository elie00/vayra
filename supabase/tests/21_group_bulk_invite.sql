-- CIRA Groups v2: bulk invite with an aggregated, non-attributable result.
\echo '=== 21_group_bulk_invite ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000021a1'),  -- alice: owner
  ('00000000-0000-4000-8000-0000000021b2'),  -- bob: accepted relation
  ('00000000-0000-4000-8000-0000000021c3'),  -- carol: accepted relation, already member
  ('00000000-0000-4000-8000-0000000021d4'),  -- dave: accepted relation, blocked by a member
  ('00000000-0000-4000-8000-0000000021e5'),  -- eve: NOT a relation of alice
  ('00000000-0000-4000-8000-0000000021f6');  -- frank: member who blocks dave

do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000021a1'); perform public.cira_upsert_profile('b21_alice','Alice');
  perform test.login('00000000-0000-4000-8000-0000000021b2'); perform public.cira_upsert_profile('b21_bob','Bob');
  perform test.login('00000000-0000-4000-8000-0000000021c3'); perform public.cira_upsert_profile('b21_carol','Carol');
  perform test.login('00000000-0000-4000-8000-0000000021d4'); perform public.cira_upsert_profile('b21_dave','Dave');
  perform test.login('00000000-0000-4000-8000-0000000021e5'); perform public.cira_upsert_profile('b21_eve','Eve');
  perform test.login('00000000-0000-4000-8000-0000000021f6'); perform public.cira_upsert_profile('b21_frank','Frank');
end;
$do$;

do $do$
declare
  g uuid;
  a uuid := '00000000-0000-4000-8000-0000000021a1';
  b uuid := '00000000-0000-4000-8000-0000000021b2';
  c uuid := '00000000-0000-4000-8000-0000000021c3';
  d uuid := '00000000-0000-4000-8000-0000000021d4';
  e uuid := '00000000-0000-4000-8000-0000000021e5';
  f uuid := '00000000-0000-4000-8000-0000000021f6';
  res jsonb;
  dave_inv uuid;
begin
  perform test.login(a);
  g := (public.cira_create_group('Bulk club', null, null, 10))->>'group_id';
  perform test.logout();
  -- alice's accepted relations: bob, carol, dave, frank (not eve)
  insert into public.cira_friendships(requester_id,addressee_id,status,responded_at) values
    (a,b,'accepted',now()),(a,c,'accepted',now()),(a,d,'accepted',now()),(a,f,'accepted',now());
  -- carol and frank already members; frank blocks dave
  insert into public.cira_group_members(group_id,user_id,role) values (g,c,'member'),(g,f,'member');
  perform test.login(f);
  perform public.cira_block_user(d);

  -- Bulk invite bob (invitable), carol (member), dave (blocked by member frank),
  -- eve (no relation). Anti-oracle: dave is INVITED like the single path (the
  -- block is enforced only at accept time), so the target<->member block never
  -- leaks into `skipped`. Only eve (no accepted relation) is skipped.
  perform test.login(a);
  res := public.cira_invite_group_members(g, array[b,c,d,e]);
  if (res->>'invited')::int <> 2 then raise exception 'TEST_FAILED: invited<>2 (%)', res; end if;
  if (res->>'already_member')::int <> 1 then raise exception 'TEST_FAILED: already<>1 (%)', res; end if;
  if (res->>'skipped')::int <> 1 then raise exception 'TEST_FAILED: skipped<>1 (%)', res; end if;
  -- result carries only counters, never ids
  if res ? 'ids' or res ? 'skipped_ids' or res ? 'blocked' then
    raise exception 'TEST_FAILED: result leaks per-user detail (%)', res;
  end if;
  -- bob and dave got invitations; eve (no relation) did not
  perform test.logout();
  if not exists (select 1 from public.cira_group_invites where group_id=g and invitee_id=b)
     or not exists (select 1 from public.cira_group_invites where group_id=g and invitee_id=d) then
    raise exception 'TEST_FAILED: invitable target not invited';
  end if;
  if exists (select 1 from public.cira_group_invites where group_id=g and invitee_id=e) then
    raise exception 'TEST_FAILED: non-relation invited';
  end if;
  -- dave still cannot actually join: the admission trigger enforces the block
  select id into dave_inv from public.cira_group_invites where group_id=g and invitee_id=d;
  perform test.login(d);
  begin
    perform public.cira_accept_group_invite(dave_inv);
    raise exception 'TEST_FAILED: blocked target joined via bulk invite';
  exception when others then
    if sqlerrm not in ('GROUP_BLOCK_CONFLICT','GROUP_INVITE_UNAVAILABLE') then raise; end if;
  end;

  -- Idempotent: re-inviting bob refreshes, no duplicate, counts as invited
  perform test.login(a);
  res := public.cira_invite_group_members(g, array[b]);
  if (res->>'invited')::int <> 1 then raise exception 'TEST_FAILED: re-invite (%)', res; end if;
  perform test.logout();
  if (select count(*) from public.cira_group_invites where group_id=g and invitee_id=b) <> 1 then
    raise exception 'TEST_FAILED: duplicate invitation';
  end if;

  -- member cannot bulk invite
  perform test.login(c);
  begin perform public.cira_invite_group_members(g, array[b]); raise exception 'TEST_FAILED: member bulk invited';
  exception when others then if sqlerrm <> 'GROUP_FORBIDDEN' then raise; end if; end;

  -- oversized batch rejected
  perform test.login(a);
  begin
    perform public.cira_invite_group_members(g, (select array_agg(gen_random_uuid()) from generate_series(1,51)));
    raise exception 'TEST_FAILED: oversized batch accepted';
  exception when others then if sqlerrm <> 'INVALID_BULK_INVITE' then raise; end if; end;

  -- archived group rejects bulk invite
  perform public.cira_archive_group(g);
  begin perform public.cira_invite_group_members(g, array[b]); raise exception 'TEST_FAILED: bulk invite on archived';
  exception when others then if sqlerrm <> 'GROUP_ARCHIVED' then raise; end if; end;
  perform public.cira_restore_group(g);
end;
$do$;

-- Capacity: bulk invite past max_members fills up to the cap, the rest skipped.
do $do$
declare
  g uuid;
  a uuid := '00000000-0000-4000-8000-0000000021a1';
  ids uuid[];
  res jsonb;
  i integer;
  u uuid;
begin
  perform test.login(a);
  g := (public.cira_create_group('Tiny club', null, null, 3))->>'group_id';  -- owner + 2 slots
  perform test.logout();
  -- create 4 accepted relations, none member yet
  ids := '{}';
  for i in 1..4 loop
    u := ('00000000-0000-4000-8000-0000002100' || lpad(i::text,2,'0'))::uuid;
    insert into auth.users(id) values (u);
    perform test.login(u); perform public.cira_upsert_profile('cap21_'||i, 'Cap '||i);
    perform test.logout();
    insert into public.cira_friendships(requester_id,addressee_id,status,responded_at) values (a,u,'accepted',now());
    ids := ids || u;
  end loop;

  perform test.login(a);
  res := public.cira_invite_group_members(g, ids);
  -- 2 free slots -> 2 invited, 2 skipped (capacity), aggregated
  if (res->>'invited')::int <> 2 or (res->>'skipped')::int <> 2 then
    raise exception 'TEST_FAILED: capacity split wrong (%)', res;
  end if;
end;
$do$;

\echo '21_group_bulk_invite OK'
