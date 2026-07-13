-- CIRA complete: bounded pages and authorization.
\echo '=== 15_pagination ==='
insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000015a1'),
  ('00000000-0000-4000-8000-0000000015b2'),
  ('00000000-0000-4000-8000-0000000015c3');
do $do$
declare gid uuid; page jsonb;
begin
  perform test.login('00000000-0000-4000-8000-0000000015a1');
  perform public.cira_upsert_profile('g15_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000015b2');
  perform public.cira_upsert_profile('g15_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000015c3');
  perform public.cira_upsert_profile('g15_carol', 'Carol');
  perform test.login('00000000-0000-4000-8000-0000000015a1');
  perform public.cira_send_request('g15_bob');
  perform public.cira_send_request('g15_carol');
  page := public.cira_list_relationships_page(1, 0);
  if jsonb_array_length(page->'items') <> 1 or not (page->>'has_more')::boolean then
    raise exception 'TEST_FAILED: first relationship page malformed: %', page;
  end if;
  page := public.cira_list_relationships_page(1, 1);
  if jsonb_array_length(page->'items') <> 1 or (page->>'has_more')::boolean then
    raise exception 'TEST_FAILED: final relationship page malformed: %', page;
  end if;
  gid := (public.cira_create_group('Paged group')->>'group_id')::uuid;
  perform test.logout();
  insert into public.cira_group_members (group_id, user_id, role) values
    (gid, '00000000-0000-4000-8000-0000000015b2', 'member'),
    (gid, '00000000-0000-4000-8000-0000000015c3', 'member');
  perform test.login('00000000-0000-4000-8000-0000000015a1');
  page := public.cira_list_group_members_page(gid, 2, 0);
  if jsonb_array_length(page->'items') <> 2 or not (page->>'has_more')::boolean then
    raise exception 'TEST_FAILED: first member page malformed: %', page;
  end if;
  begin
    perform public.cira_list_relationships_page(101, 0);
    raise exception 'TEST_FAILED: unbounded page accepted';
  exception when others then if sqlerrm <> 'INVALID_PAGE' then raise; end if; end;
end;
$do$;
\echo '15_pagination OK'
