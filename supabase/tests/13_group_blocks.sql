-- CIRA complete: blocks are hard boundaries across every private group.
\echo '=== 13_group_blocks ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000013a1'),
  ('00000000-0000-4000-8000-0000000013b2'),
  ('00000000-0000-4000-8000-0000000013c3');

do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000013a1');
  perform public.cira_upsert_profile('g13_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000013b2');
  perform public.cira_upsert_profile('g13_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000013c3');
  perform public.cira_upsert_profile('g13_carol', 'Carol');
end;
$do$;

do $do$
declare
  ga uuid;
  gb uuid;
  gc uuid;
begin
  perform test.login('00000000-0000-4000-8000-0000000013a1');
  ga := (public.cira_create_group('Owned by A')->>'group_id')::uuid;
  perform test.login('00000000-0000-4000-8000-0000000013b2');
  gb := (public.cira_create_group('Owned by B')->>'group_id')::uuid;
  perform test.login('00000000-0000-4000-8000-0000000013c3');
  gc := (public.cira_create_group('Owned by C')->>'group_id')::uuid;

  perform test.logout();
  insert into public.cira_group_members (group_id, user_id, role) values
    (ga, '00000000-0000-4000-8000-0000000013b2', 'member'),
    (gb, '00000000-0000-4000-8000-0000000013a1', 'member'),
    (gc, '00000000-0000-4000-8000-0000000013a1', 'member'),
    (gc, '00000000-0000-4000-8000-0000000013b2', 'member');

  -- A blocks B. In A's group B is removed; in B's or C's group A leaves.
  perform test.login('00000000-0000-4000-8000-0000000013a1');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000013b2');
  perform test.logout();
  if exists (select 1 from public.cira_group_members where group_id = ga
      and user_id = '00000000-0000-4000-8000-0000000013b2') then
    raise exception 'TEST_FAILED: owner block retained blocked member';
  end if;
  if exists (select 1 from public.cira_group_members where group_id in (gb, gc)
      and user_id = '00000000-0000-4000-8000-0000000013a1') then
    raise exception 'TEST_FAILED: blocker retained non-owned shared group';
  end if;

  -- A third-party group or opaque link cannot re-create the shared group.
  begin
    insert into public.cira_group_members (group_id, user_id, role)
    values (gc, '00000000-0000-4000-8000-0000000013a1', 'member');
    raise exception 'TEST_FAILED: blocked pair rejoined a shared group';
  exception when others then
    if sqlerrm <> 'GROUP_BLOCK_CONFLICT' then raise; end if;
  end;
end;
$do$;

\echo '13_group_blocks OK'
