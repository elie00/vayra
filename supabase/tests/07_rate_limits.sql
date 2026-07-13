-- CIRA tests 07 - rate limits (private.cira_rate_limits, fixed windows).
-- handle_check 10/5 min, invitation_create 10/10 min, invitation_redeem
-- 10/5 min, direct_request 20/10 min; 1 h retention purge; failed calls do
-- not consume budget (documented v1 caveat: erroring transactions roll the
-- counter back).
--
-- NOTE: windows are fixed and epoch-aligned; each burst below runs in
-- milliseconds, so crossing a window boundary mid-test is vanishingly
-- unlikely (and would only cause a spurious pass of the "allowed" phase).
-- Users: R1 (07a1), R2 (07b2), R3 (07c3), R4 (07d4).
\echo '=== 07_rate_limits ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000007a1'),
  ('00000000-0000-4000-8000-0000000007b2'),
  ('00000000-0000-4000-8000-0000000007c3'),
  ('00000000-0000-4000-8000-0000000007d4');

create temporary table tvars (k text primary key, v text);
grant select on tvars to authenticated;  -- read while impersonating users

-- handle_check: 10 upserts pass, the 11th is refused.
do $do$
declare
  i integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000007a1');
  for i in 1..10 loop
    perform public.cira_upsert_profile('f07_r1', 'R1');
  end loop;
  begin
    perform public.cira_upsert_profile('f07_r1', 'R1');
    raise exception 'TEST_FAILED: 11th handle_check allowed';
  exception when others then
    if sqlerrm <> 'RATE_LIMITED' then raise; end if;
  end;
end;
$do$;

-- invitation_create: 10 pass, the 11th is refused.
do $do$
declare
  i integer;
  v jsonb;
begin
  perform test.login('00000000-0000-4000-8000-0000000007b2');
  perform public.cira_upsert_profile('f07_r2', 'R2');
  for i in 1..10 loop
    v := public.cira_create_invitation();
  end loop;
  begin
    perform public.cira_create_invitation();
    raise exception 'TEST_FAILED: 11th invitation_create allowed';
  exception when others then
    if sqlerrm <> 'RATE_LIMITED' then raise; end if;
  end;
  perform test.logout();
  insert into tvars values ('code', v ->> 'code');
end;
$do$;

-- invitation_redeem: 10 successful previews pass, the 11th is refused.
do $do$
declare
  i integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000007c3');
  perform public.cira_upsert_profile('f07_r3', 'R3');
  for i in 1..10 loop
    perform public.cira_preview_invitation((select t.v from tvars t where t.k = 'code'));
  end loop;
  begin
    perform public.cira_preview_invitation((select t.v from tvars t where t.k = 'code'));
    raise exception 'TEST_FAILED: 11th invitation_redeem allowed';
  exception when others then
    if sqlerrm <> 'RATE_LIMITED' then raise; end if;
  end;
end;
$do$;

-- direct_request: 20 (generic, thus counted) sends pass, the 21st is
-- refused - the anti-enumeration backstop.
do $do$
declare
  i integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000007d4');
  perform public.cira_upsert_profile('f07_r4', 'R4');
  for i in 1..20 loop
    perform public.cira_send_request('f07_no_such_handle');
  end loop;
  begin
    perform public.cira_send_request('f07_no_such_handle');
    raise exception 'TEST_FAILED: 21st direct_request allowed';
  exception when others then
    if sqlerrm <> 'RATE_LIMITED' then raise; end if;
  end;
end;
$do$;

-- Documented v1 caveat, asserted: an ERRORING call rolls its counter back.
-- R2 has never redeemed anything; a failed preview leaves no counter row.
do $do$
declare
  n integer;
begin
  perform test.login('00000000-0000-4000-8000-0000000007b2');
  begin
    perform public.cira_preview_invitation('CIRA-0000-0000-0000-0000-0000');
    raise exception 'TEST_FAILED: junk code previewable';
  exception when others then
    if sqlerrm <> 'INVITATION_UNAVAILABLE' then raise; end if;
  end;
  perform test.logout();
  select coalesce(sum(count), 0) into n from private.cira_rate_limits
  where user_id = '00000000-0000-4000-8000-0000000007b2'
    and action = 'invitation_redeem';
  if n <> 0 then
    raise exception 'TEST_FAILED: erroring call left a counter (%): rollback semantics changed', n;
  end if;
end;
$do$;

-- Retention: rows older than 1 h are purged by the next successful
-- rate-limited call.
do $do$
declare
  n integer;
begin
  insert into private.cira_rate_limits (user_id, action, window_start, count)
  values ('00000000-0000-4000-8000-0000000007a1', 'handle_check', now() - interval '2 hours', 5);

  perform test.login('00000000-0000-4000-8000-0000000007c3');
  perform public.cira_upsert_profile('f07_r3', 'R3 again');  -- successful call triggers the purge

  perform test.logout();
  select count(*) into n from private.cira_rate_limits
  where window_start < now() - interval '1 hour';
  if n <> 0 then raise exception 'TEST_FAILED: stale rate-limit rows not purged'; end if;
end;
$do$;

drop table tvars;
\echo '07_rate_limits OK'
