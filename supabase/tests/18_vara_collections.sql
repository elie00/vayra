-- VARA Collections: group-scoped catalogue lists, roles, blocks, ordering.
\echo '=== 18_vara_collections ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000018a1'),  -- alice: group owner
  ('00000000-0000-4000-8000-0000000018b2'),  -- bob: member
  ('00000000-0000-4000-8000-0000000018c3'),  -- carol: admin
  ('00000000-0000-4000-8000-0000000018d4'),  -- dave: outsider
  ('00000000-0000-4000-8000-0000000018e5');  -- eve: member, later blocked

do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000018a1');
  perform public.cira_upsert_profile('c18_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000018b2');
  perform public.cira_upsert_profile('c18_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000018c3');
  perform public.cira_upsert_profile('c18_carol', 'Carol');
  perform test.login('00000000-0000-4000-8000-0000000018d4');
  perform public.cira_upsert_profile('c18_dave', 'Dave');
  perform test.login('00000000-0000-4000-8000-0000000018e5');
  perform public.cira_upsert_profile('c18_eve', 'Eve');
end;
$do$;

-- Group setup: alice owner, carol admin, bob & eve members, dave outside.
do $do$
declare
  g uuid;
begin
  perform test.login('00000000-0000-4000-8000-0000000018a1');
  g := (public.cira_create_group('Cine club 18')->>'group_id')::uuid;
  perform test.logout();
  insert into public.cira_group_members (group_id, user_id, role) values
    (g, '00000000-0000-4000-8000-0000000018c3', 'admin'),
    (g, '00000000-0000-4000-8000-0000000018b2', 'member'),
    (g, '00000000-0000-4000-8000-0000000018e5', 'member');
end;
$do$;

-- Direct table access is denied to API roles: everything goes through RPCs.
do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000018a1');
  begin
    perform 1 from public.vara_collections;
    raise exception 'TEST_FAILED: direct select on vara_collections allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.vara_collection_items;
    raise exception 'TEST_FAILED: direct select on vara_collection_items allowed';
  exception when insufficient_privilege then null;
  end;
end;
$do$;

-- Creation rights: owner/admin yes, member/outsider no. Validation applies.
do $do$
declare
  g uuid;
  col jsonb;
begin
  perform test.logout();
  select id into g from public.cira_groups where name = 'Cine club 18';

  perform test.login('00000000-0000-4000-8000-0000000018b2');
  begin
    perform public.vara_create_collection(g, 'Bob list');
    raise exception 'TEST_FAILED: member created a collection';
  exception when others then
    if sqlerrm <> 'GROUP_NOT_FOUND' then raise; end if;
  end;

  perform test.login('00000000-0000-4000-8000-0000000018d4');
  begin
    perform public.vara_create_collection(g, 'Dave list');
    raise exception 'TEST_FAILED: outsider created a collection';
  exception when others then
    if sqlerrm <> 'GROUP_NOT_FOUND' then raise; end if;
  end;

  perform test.login('00000000-0000-4000-8000-0000000018a1');
  begin
    perform public.vara_create_collection(g, 'Bad <name>');
    raise exception 'TEST_FAILED: HTML brackets accepted in name';
  exception when others then
    if sqlerrm <> 'INVALID_COLLECTION' then raise; end if;
  end;

  col := public.vara_create_collection(g, 'Watch order', 'Soirees du club');
  if col->>'name' <> 'Watch order' or (col->>'item_count')::int <> 0
     or col->'created_by'->>'handle' <> 'c18_alice'
     or (col->>'can_manage')::boolean is distinct from true then
    raise exception 'TEST_FAILED: unexpected create payload %', col;
  end if;

  perform test.login('00000000-0000-4000-8000-0000000018c3');
  perform public.vara_create_collection(g, 'By Carol');
end;
$do$;

-- Item validation: catalogue whitelist, https-only dotted-host images.
do $do$
declare
  c uuid;
begin
  perform test.logout();
  select id into c from public.vara_collections where name = 'Watch order';
  perform test.login('00000000-0000-4000-8000-0000000018a1');

  begin
    perform public.vara_add_collection_item(c, 'tt1/..evil', 'movie', 'Bad id');
    raise exception 'TEST_FAILED: meta id with slash accepted';
  exception when others then
    if sqlerrm <> 'INVALID_COLLECTION_ITEM' then raise; end if;
  end;
  begin
    perform public.vara_add_collection_item(c, 'tt0111161', 'stream', 'Bad type');
    raise exception 'TEST_FAILED: unknown media type accepted';
  exception when others then
    if sqlerrm <> 'INVALID_COLLECTION_ITEM' then raise; end if;
  end;
  begin
    perform public.vara_add_collection_item(c, 'tt0111161', 'movie', 'Movie S1', 1, 2);
    raise exception 'TEST_FAILED: season/episode accepted on a movie';
  exception when others then
    if sqlerrm <> 'INVALID_COLLECTION_ITEM' then raise; end if;
  end;
  begin
    perform public.vara_add_collection_item(c, 'tt0111161', 'movie', 'XSS <img>');
    raise exception 'TEST_FAILED: HTML brackets accepted in title';
  exception when others then
    if sqlerrm <> 'INVALID_COLLECTION_ITEM' then raise; end if;
  end;
  begin
    perform public.vara_add_collection_item(
      c, 'tt0111161', 'movie', 'Http', null, null, 'http://img.example.com/p.jpg');
    raise exception 'TEST_FAILED: http image accepted';
  exception when others then
    if sqlerrm <> 'INVALID_COLLECTION_ITEM' then raise; end if;
  end;
  begin
    perform public.vara_add_collection_item(
      c, 'tt0111161', 'movie', 'Ip', null, null, 'https://192.168.1.10/p.jpg');
    raise exception 'TEST_FAILED: IP-literal image host accepted';
  exception when others then
    if sqlerrm <> 'INVALID_COLLECTION_ITEM' then raise; end if;
  end;
  begin
    perform public.vara_add_collection_item(
      c, 'tt0111161', 'movie', 'Local', null, null, 'https://localhost/p.jpg');
    raise exception 'TEST_FAILED: single-label host accepted';
  exception when others then
    if sqlerrm <> 'INVALID_COLLECTION_ITEM' then raise; end if;
  end;
  begin
    perform public.vara_add_collection_item(
      c, 'tt0111161', 'movie', 'Userinfo', null, null,
      'https://evil@img.example.com/p.jpg');
    raise exception 'TEST_FAILED: userinfo image URL accepted';
  exception when others then
    if sqlerrm <> 'INVALID_COLLECTION_ITEM' then raise; end if;
  end;
  begin
    perform public.vara_add_collection_item(
      c, 'tt0111161', 'movie', 'Scheme', null, null,
      'javascript:alert(1)//https://x.example.com/');
    raise exception 'TEST_FAILED: non-https scheme accepted';
  exception when others then
    if sqlerrm <> 'INVALID_COLLECTION_ITEM' then raise; end if;
  end;
end;
$do$;

-- Ordering: appends are dense, moves are transactional dense renumbers,
-- removals close the gap. Duplicates are rejected per (meta, season, episode).
do $do$
declare
  c uuid;
  i1 uuid; i4 uuid;
  film2 uuid;
  page jsonb;
begin
  perform test.logout();
  select id into c from public.vara_collections where name = 'Watch order';
  perform test.login('00000000-0000-4000-8000-0000000018a1');

  i1 := (public.vara_add_collection_item(
    c, 'tt0000001', 'movie', 'Film 1', null, null,
    'https://images.metahub.space/poster/small/tt0000001/img')->>'item_id')::uuid;
  perform public.vara_add_collection_item(c, 'tt0000002', 'movie', 'Film 2');
  perform public.vara_add_collection_item(c, 'tt0000003', 'movie', 'Film 3');
  i4 := (public.vara_add_collection_item(
    c, 'kitsu:44042', 'anime', 'Anime ep', 1, 5)->>'item_id')::uuid;

  begin
    perform public.vara_add_collection_item(c, 'tt0000002', 'movie', 'Film 2 bis');
    raise exception 'TEST_FAILED: duplicate item accepted';
  exception when others then
    if sqlerrm <> 'COLLECTION_ITEM_DUPLICATE' then raise; end if;
  end;
  -- Same meta, different episode: a distinct reference, accepted then removed.
  perform public.vara_remove_collection_item(
    (public.vara_add_collection_item(
      c, 'kitsu:44042', 'anime', 'Anime ep 6', 1, 6)->>'item_id')::uuid);

  perform public.vara_move_collection_item(i4, 1);
  perform public.vara_move_collection_item(i1, 999);  -- clamps to last

  perform test.logout();
  if (select string_agg(meta_id, ',' order by position)
      from public.vara_collection_items where collection_id = c)
     <> 'kitsu:44042,tt0000002,tt0000003,tt0000001' then
    raise exception 'TEST_FAILED: unexpected order after moves';
  end if;
  if (select string_agg(position::text, ',' order by position)
      from public.vara_collection_items where collection_id = c)
     <> '1,2,3,4' then
    raise exception 'TEST_FAILED: rank not dense after moves';
  end if;

  perform test.logout();
  select id into film2 from public.vara_collection_items
  where collection_id = c and meta_id = 'tt0000002';
  perform test.login('00000000-0000-4000-8000-0000000018a1');
  perform public.vara_remove_collection_item(film2);
  perform test.logout();
  if (select string_agg(position::text, ',' order by position)
      from public.vara_collection_items where collection_id = c)
     <> '1,2,3' then
    raise exception 'TEST_FAILED: gap not closed after removal';
  end if;

  -- Bounded pagination with the CIRA envelope.
  perform test.login('00000000-0000-4000-8000-0000000018b2');
  page := public.vara_list_collection_items_page(c, 2, 0);
  if jsonb_array_length(page->'items') <> 2
     or (page->>'has_more')::boolean is distinct from true then
    raise exception 'TEST_FAILED: page 1 wrong %', page;
  end if;
  page := public.vara_list_collection_items_page(c, 2, 2);
  if jsonb_array_length(page->'items') <> 1
     or (page->>'has_more')::boolean is distinct from false then
    raise exception 'TEST_FAILED: page 2 wrong %', page;
  end if;
  begin
    perform public.vara_list_collection_items_page(c, 0, 0);
    raise exception 'TEST_FAILED: zero limit accepted';
  exception when others then
    if sqlerrm <> 'INVALID_PAGE' then raise; end if;
  end;
end;
$do$;

-- Role matrix on an existing collection: member read-only by default, the
-- per-collection option grants add/move and removing one's OWN items only.
do $do$
declare
  g uuid;
  c uuid;
  bob_item uuid;
  alice_item uuid;
begin
  perform test.logout();
  select id into g from public.cira_groups where name = 'Cine club 18';
  select id into c from public.vara_collections where name = 'Watch order';
  select id into alice_item from public.vara_collection_items
  where collection_id = c and meta_id = 'tt0000003';

  -- Member reads.
  perform test.login('00000000-0000-4000-8000-0000000018b2');
  if (public.vara_get_collection(c)->>'can_edit_items')::boolean then
    raise exception 'TEST_FAILED: member can_edit_items before opt-in';
  end if;
  if (public.vara_list_group_collections_page(g)->'items') = '[]'::jsonb then
    raise exception 'TEST_FAILED: member sees no collections';
  end if;

  -- Member writes are refused by default.
  begin
    perform public.vara_add_collection_item(c, 'tt0000009', 'movie', 'Nope');
    raise exception 'TEST_FAILED: member added item without opt-in';
  exception when others then
    if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.vara_update_collection(c, 'Bob renames');
    raise exception 'TEST_FAILED: member updated collection';
  exception when others then
    if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.vara_delete_collection(c);
    raise exception 'TEST_FAILED: member deleted collection';
  exception when others then
    if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if;
  end;

  -- Owner enables member edits; the option changes item rights only.
  perform test.login('00000000-0000-4000-8000-0000000018a1');
  perform public.vara_update_collection(c, 'Watch order', 'Soirees du club', true);

  perform test.login('00000000-0000-4000-8000-0000000018b2');
  bob_item := (public.vara_add_collection_item(
    c, 'tt0000010', 'movie', 'Ajout de Bob')->>'item_id')::uuid;
  perform public.vara_move_collection_item(bob_item, 1);
  begin
    perform public.vara_remove_collection_item(alice_item);
    raise exception 'TEST_FAILED: member removed another author''s item';
  exception when others then
    if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.vara_delete_collection(c);
    raise exception 'TEST_FAILED: editing member deleted collection';
  exception when others then
    if sqlerrm <> 'COLLECTION_FORBIDDEN' then raise; end if;
  end;

  -- Last-modified surface is truthful.
  perform test.logout();
  if (select updated_by from public.vara_collections where id = c)
     <> '00000000-0000-4000-8000-0000000018b2' then
    raise exception 'TEST_FAILED: updated_by not bumped by member edit';
  end if;

  -- Member removes their own item; admin removes anyone's.
  perform test.login('00000000-0000-4000-8000-0000000018b2');
  perform public.vara_remove_collection_item(bob_item);
  perform test.login('00000000-0000-4000-8000-0000000018c3');
  perform public.vara_remove_collection_item(alice_item);

  -- Outsider sees nothing, indistinguishable from absence.
  perform test.login('00000000-0000-4000-8000-0000000018d4');
  begin
    perform public.vara_get_collection(c);
    raise exception 'TEST_FAILED: outsider read collection';
  exception when others then
    if sqlerrm <> 'COLLECTION_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.vara_list_group_collections_page(g);
    raise exception 'TEST_FAILED: outsider listed collections';
  exception when others then
    if sqlerrm <> 'GROUP_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.vara_add_collection_item(c, 'tt0000011', 'movie', 'Dave');
    raise exception 'TEST_FAILED: outsider added item';
  exception when others then
    if sqlerrm <> 'COLLECTION_NOT_FOUND' then raise; end if;
  end;
end;
$do$;

-- Realtime: one empty invalidation ping per mutation, group members only.
do $do$
declare
  c uuid;
  before_bob integer;
  before_dave integer;
begin
  perform test.logout();
  select id into c from public.vara_collections where name = 'Watch order';
  select count(*) into before_bob from realtime.messages
  where topic = 'cira:00000000-0000-4000-8000-0000000018b2';
  select count(*) into before_dave from realtime.messages
  where topic = 'cira:00000000-0000-4000-8000-0000000018d4';

  perform test.login('00000000-0000-4000-8000-0000000018a1');
  perform public.vara_add_collection_item(c, 'tt0000012', 'movie', 'Ping');

  perform test.logout();
  if (select count(*) from realtime.messages
      where topic = 'cira:00000000-0000-4000-8000-0000000018b2') <> before_bob + 1 then
    raise exception 'TEST_FAILED: member did not get exactly one ping';
  end if;
  if (select count(*) from realtime.messages
      where topic = 'cira:00000000-0000-4000-8000-0000000018d4') <> before_dave then
    raise exception 'TEST_FAILED: outsider received a ping';
  end if;
end;
$do$;

-- Block boundary: blocking removes the shared group membership, which
-- immediately revokes collection access. A departed author who is later
-- blocked is masked from attribution.
do $do$
declare
  g uuid;
  c uuid;
  carol_col uuid;
begin
  perform test.logout();
  select id into g from public.cira_groups where name = 'Cine club 18';
  select id into c from public.vara_collections where name = 'Watch order';
  select id into carol_col from public.vara_collections where name = 'By Carol';

  perform test.login('00000000-0000-4000-8000-0000000018e5');
  perform public.vara_get_collection(c);

  perform test.login('00000000-0000-4000-8000-0000000018a1');
  perform public.cira_block_user('00000000-0000-4000-8000-0000000018e5');

  perform test.login('00000000-0000-4000-8000-0000000018e5');
  begin
    perform public.vara_get_collection(c);
    raise exception 'TEST_FAILED: blocked ex-member still reads collection';
  exception when others then
    if sqlerrm <> 'COLLECTION_NOT_FOUND' then raise; end if;
  end;

  -- Carol leaves; her collection survives with visible attribution...
  perform test.login('00000000-0000-4000-8000-0000000018c3');
  perform public.cira_leave_group(g);
  perform test.login('00000000-0000-4000-8000-0000000018a1');
  if public.vara_get_collection(carol_col)->'created_by'->>'handle'
     is distinct from 'c18_carol' then
    raise exception 'TEST_FAILED: departed author not attributed';
  end if;
  -- ...until a block masks the pair in both directions.
  perform public.cira_block_user('00000000-0000-4000-8000-0000000018c3');
  if public.vara_get_collection(carol_col)->'created_by' <> 'null'::jsonb then
    raise exception 'TEST_FAILED: blocked author still attributed';
  end if;
end;
$do$;

-- Hard limits and lifecycle: per-group collection cap, per-collection item
-- cap, and cascade on collection/group deletion.
do $do$
declare
  g2 uuid;
  c uuid;
  full_col uuid;
begin
  perform test.login('00000000-0000-4000-8000-0000000018a1');
  g2 := (public.cira_create_group('Cap club 18')->>'group_id')::uuid;

  perform test.logout();
  insert into public.vara_collections (group_id, name)
  select g2, 'Filler ' || i from generate_series(1, 50) as s(i);

  perform test.login('00000000-0000-4000-8000-0000000018a1');
  begin
    perform public.vara_create_collection(g2, 'One too many');
    raise exception 'TEST_FAILED: 51st collection accepted';
  exception when others then
    if sqlerrm <> 'COLLECTION_LIMIT_REACHED' then raise; end if;
  end;

  perform test.logout();
  select id into full_col from public.vara_collections
  where group_id = g2 and name = 'Filler 1';
  insert into public.vara_collection_items
    (collection_id, meta_id, media_type, title, position)
  select full_col, 'tt9' || lpad(i::text, 6, '0'), 'movie', 'Filler ' || i, i
  from generate_series(1, 500) as s(i);

  perform test.login('00000000-0000-4000-8000-0000000018a1');
  begin
    perform public.vara_add_collection_item(full_col, 'tt9999999', 'movie', 'Over');
    raise exception 'TEST_FAILED: 501st item accepted';
  exception when others then
    if sqlerrm <> 'COLLECTION_ITEM_LIMIT_REACHED' then raise; end if;
  end;

  -- Collection deletion removes its items; group deletion removes the rest.
  perform public.vara_delete_collection(full_col);
  perform test.logout();
  if exists (select 1 from public.vara_collection_items
             where collection_id = full_col) then
    raise exception 'TEST_FAILED: items survived collection deletion';
  end if;

  perform test.login('00000000-0000-4000-8000-0000000018a1');
  perform public.cira_delete_group(g2);
  perform test.logout();
  if exists (select 1 from public.vara_collections where group_id = g2) then
    raise exception 'TEST_FAILED: collections survived group deletion';
  end if;
end;
$do$;

\echo '18_vara_collections OK'
