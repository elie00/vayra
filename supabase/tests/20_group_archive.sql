-- CIRA Groups v2: archive freezes admissions and content without destroying data.
\echo '=== 20_group_archive ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000020a1'),  -- alice: owner
  ('00000000-0000-4000-8000-0000000020b2'),  -- bob: admin
  ('00000000-0000-4000-8000-0000000020c3'),  -- carol: member
  ('00000000-0000-4000-8000-0000000020d4');  -- dave: alice's friend, not a member

do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000020a1');
  perform public.cira_upsert_profile('a20_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000020b2');
  perform public.cira_upsert_profile('a20_bob', 'Bob');
  perform test.login('00000000-0000-4000-8000-0000000020c3');
  perform public.cira_upsert_profile('a20_carol', 'Carol');
  perform test.login('00000000-0000-4000-8000-0000000020d4');
  perform public.cira_upsert_profile('a20_dave', 'Dave');
end;
$do$;

do $do$
declare
  g uuid;
  a uuid := '00000000-0000-4000-8000-0000000020a1';
  b uuid := '00000000-0000-4000-8000-0000000020b2';
  c uuid := '00000000-0000-4000-8000-0000000020c3';
  d uuid := '00000000-0000-4000-8000-0000000020d4';
  col uuid;
  dave_inv uuid;
  room_grouped uuid;
  room_solo uuid;
begin
  perform test.login(a);
  g := (public.cira_create_group('Archive club'))->>'group_id';
  col := (public.vara_create_collection(g, 'Liste')) ->> 'collection_id';
  perform public.vara_add_collection_item(col, 'tt0111161', 'movie', 'Film');
  perform test.logout();
  insert into public.cira_group_members(group_id,user_id,role) values (g,b,'admin'),(g,c,'member');
  insert into public.cira_friendships(requester_id,addressee_id,status,responded_at)
  values (a,d,'accepted',now());
  -- pending invite + link exist before archiving, to prove they are purged
  perform test.login(a);
  perform public.cira_invite_group_member(g, d);
  perform public.cira_create_group_link(g);
  -- a group-scoped room and an unrelated room, both live before archiving
  room_grouped := (public.vara_create_room(14400, 8, g)) ->> 'room_id';
  room_solo := (public.vara_create_room(14400, 8)) ->> 'room_id';

  -- member cannot archive
  perform test.login(c);
  begin perform public.cira_archive_group(g); raise exception 'TEST_FAILED: member archived';
  exception when others then if sqlerrm <> 'GROUP_FORBIDDEN' then raise; end if; end;

  -- admin archives; idempotent
  perform test.login(b);
  perform public.cira_archive_group(g);
  perform public.cira_archive_group(g);  -- no-op, no error

  perform test.logout();
  if (select archived_at from public.cira_groups where id=g) is null then
    raise exception 'TEST_FAILED: not archived';
  end if;
  -- archiving closes the group's live VARA room but leaves unrelated rooms alone
  if exists (select 1 from public.vara_rooms where id = room_grouped) then
    raise exception 'TEST_FAILED: group room not closed on archive';
  end if;
  if not exists (select 1 from public.vara_rooms where id = room_solo) then
    raise exception 'TEST_FAILED: unrelated room closed on archive';
  end if;
  -- invitations/links are kept (data preserved) but inert: dave's pending
  -- invitation survives, yet accepting it is refused while archived.
  if not exists (select 1 from public.cira_group_invites where group_id=g and invitee_id=d) then
    raise exception 'TEST_FAILED: invitation destroyed on archive';
  end if;
  select id into dave_inv from public.cira_group_invites where group_id=g and invitee_id=d;
  perform test.login(d);
  begin
    perform public.cira_accept_group_invite(dave_inv);
    raise exception 'TEST_FAILED: joined an archived group via pending invite';
  exception when others then if sqlerrm <> 'GROUP_ARCHIVED' then raise; end if; end;

  -- archived: no invite, no link, no collection, no group VARA
  perform test.login(a);
  begin perform public.cira_invite_group_member(g, d); raise exception 'TEST_FAILED: invited on archived';
  exception when others then if sqlerrm <> 'GROUP_ARCHIVED' then raise; end if; end;
  begin perform public.cira_create_group_link(g); raise exception 'TEST_FAILED: link on archived';
  exception when others then if sqlerrm <> 'GROUP_ARCHIVED' then raise; end if; end;
  begin perform public.vara_create_collection(g, 'Nope'); raise exception 'TEST_FAILED: collection on archived';
  exception when others then if sqlerrm <> 'GROUP_ARCHIVED' then raise; end if; end;
  begin perform public.vara_create_room(14400, 8, g); raise exception 'TEST_FAILED: group VARA on archived';
  exception when others then if sqlerrm <> 'GROUP_ARCHIVED' then raise; end if; end;

  -- archived: admission blocked by the trigger, whatever the path
  perform test.logout();
  begin
    insert into public.cira_group_members(group_id,user_id,role) values (g,d,'member');
    raise exception 'TEST_FAILED: admitted member on archived';
  exception when others then if sqlerrm <> 'GROUP_ARCHIVED' then raise; end if; end;

  -- archived: reads still work, rename still allowed
  perform test.login(a);
  if (public.vara_get_collection(col)->>'name') <> 'Liste' then
    raise exception 'TEST_FAILED: collection unreadable when archived';
  end if;
  if (public.vara_get_collection(col)->>'item_count')::int <> 1 then
    raise exception 'TEST_FAILED: archived collection item lost';
  end if;
  -- archived: collection content is frozen (add item refused via lock helper)
  begin perform public.vara_add_collection_item(col, 'tt0000009', 'movie', 'X');
    raise exception 'TEST_FAILED: item added on archived group';
  exception when others then if sqlerrm <> 'GROUP_ARCHIVED' then raise; end if; end;
  perform public.cira_update_group(g, 'Archive club v2');
  perform test.logout();
  if (select name from public.cira_groups where id=g) <> 'Archive club v2' then
    raise exception 'TEST_FAILED: rename blocked on archived';
  end if;
  -- list_groups exposes archived_at
  perform test.login(a);
  if (select (elem->>'archived_at') is null
      from public.cira_list_groups() as t(elem)
      where (elem->>'group_id')::uuid = g) then
    raise exception 'TEST_FAILED: archived_at not exposed';
  end if;

  -- block still wins over archiving: blocking carol removes her membership
  perform public.cira_block_user(c);
  perform test.logout();
  if exists (select 1 from public.cira_group_members where group_id=g and user_id=c) then
    raise exception 'TEST_FAILED: block did not remove member on archived group';
  end if;

  -- restore re-enables everything
  perform test.login(a);
  perform public.cira_restore_group(g);
  perform public.cira_restore_group(g);  -- idempotent
  perform test.logout();
  if (select archived_at from public.cira_groups where id=g) is not null then
    raise exception 'TEST_FAILED: not restored';
  end if;
  perform test.login(a);
  perform public.vara_create_collection(g, 'Après restauration');  -- works again
  perform public.vara_create_room(14400, 8, g);  -- group VARA works again
end;
$do$;

\echo '20_group_archive OK'
