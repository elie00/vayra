-- CIRA complete: derived, cross-device inbox with no event history.
\echo '=== 14_inbox ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000014a1'),
  ('00000000-0000-4000-8000-0000000014b2');

do $do$
declare summary jsonb;
begin
  perform test.login('00000000-0000-4000-8000-0000000014a1');
  perform public.cira_upsert_profile('g14_alice', 'Alice');
  perform test.login('00000000-0000-4000-8000-0000000014b2');
  perform public.cira_upsert_profile('g14_bob', 'Bob');

  summary := public.cira_get_inbox();
  if (summary->>'unread_count')::integer <> 0 then
    raise exception 'TEST_FAILED: empty inbox has unread entries';
  end if;

  perform test.login('00000000-0000-4000-8000-0000000014a1');
  perform public.cira_send_request('g14_bob');
  perform test.login('00000000-0000-4000-8000-0000000014b2');
  summary := public.cira_get_inbox();
  if (summary->>'friend_request_count')::integer <> 1
     or (summary->>'unread_count')::integer <> 1 then
    raise exception 'TEST_FAILED: incoming request not derived: %', summary;
  end if;
  perform public.cira_mark_inbox_seen();
  summary := public.cira_get_inbox();
  if (summary->>'friend_request_count')::integer <> 1
     or (summary->>'unread_count')::integer <> 0 then
    raise exception 'TEST_FAILED: seen marker lost pending item or unread state: %', summary;
  end if;

  perform test.logout();
  if (select count(*) from public.cira_inbox_state
      where user_id = '00000000-0000-4000-8000-0000000014b2') <> 1 then
    raise exception 'TEST_FAILED: inbox stores more than one receipt row';
  end if;
end;
$do$;

\echo '14_inbox OK'
