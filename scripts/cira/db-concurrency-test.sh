#!/usr/bin/env bash
# Deterministic two-session regressions for the CIRA group lock protocol.

set -euo pipefail

: "${PGBIN:?}"
: "${PORT:?}"
: "${DB:?}"
: "${PGUSER:?}"
: "${SOCKDIR:?}"
: "${LOGDIR:?}"

PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCKDIR" -p "$PORT" -U "$PGUSER" -d "$DB")

show_failure_logs() {
  echo "Concurrency test failed; recent session logs:" >&2
  for log in "$LOGDIR"/concurrency-*.log; do
    [ -f "$log" ] || continue
    echo "--- $(basename "$log")" >&2
    tail -n 30 "$log" >&2
  done
}
trap show_failure_logs ERR

owner="00000000-0000-4000-8000-00000000c101"
admin="00000000-0000-4000-8000-00000000c102"
joiner="00000000-0000-4000-8000-00000000c103"
group_block="10000000-0000-4000-8000-00000000c101"
group_role="10000000-0000-4000-8000-00000000c102"
group_code="CIRAG0123456789ABCDEFGHJK"

"${PSQL[@]}" >"$LOGDIR/concurrency-seed.log" 2>&1 <<SQL
insert into auth.users (id, email) values
  ('$owner', 'owner-concurrency@example.invalid'),
  ('$admin', 'admin-concurrency@example.invalid'),
  ('$joiner', 'joiner-concurrency@example.invalid');
insert into public.cira_profiles (user_id, handle, display_name) values
  ('$owner', 'owner_concurrency', 'Owner concurrency'),
  ('$admin', 'admin_concurrency', 'Admin concurrency'),
  ('$joiner', 'joiner_concurrency', 'Joiner concurrency');
insert into public.cira_groups (id, owner_id, name) values
  ('$group_block', '$owner', 'Block race'),
  ('$group_role', '$owner', 'Role race');
insert into public.cira_group_members (group_id, user_id, role) values
  ('$group_block', '$owner', 'owner'),
  ('$group_role', '$owner', 'owner'),
  ('$group_role', '$admin', 'admin');
insert into public.cira_group_links (group_id, creator_id, token_hash, expires_at)
values ('$group_block', '$owner', private.cira_hash_invite_code('$group_code'), now() + interval '1 hour');
SQL

# The join is uncommitted while the block starts. A safe implementation waits
# on the canonical profile pair, then removes the newly committed membership.
"${PSQL[@]}" >"$LOGDIR/concurrency-join.log" 2>&1 <<SQL &
begin;
select test.login('$joiner');
select public.cira_accept_group_link('$group_code');
select pg_sleep(2);
commit;
SQL
join_pid=$!
sleep 0.4
"${PSQL[@]}" >"$LOGDIR/concurrency-block.log" 2>&1 <<SQL
begin;
select test.login('$owner');
select public.cira_block_user('$joiner');
commit;
SQL
wait "$join_pid"

"${PSQL[@]}" >"$LOGDIR/concurrency-block-assert.log" 2>&1 <<SQL
do \$\$
begin
  if exists (
    select 1 from public.cira_group_members
    where group_id = '$group_block' and user_id = '$joiner'
  ) then
    raise exception 'TEST_FAILED: concurrent join survived a block';
  end if;
end;
\$\$;
SQL

# The owner demotion is uncommitted while the former admin starts an update.
# The admin call must wait for the group row, then re-read the committed role.
"${PSQL[@]}" >"$LOGDIR/concurrency-demote.log" 2>&1 <<SQL &
begin;
select test.login('$owner');
select public.cira_set_group_role('$group_role', '$admin', 'member');
select pg_sleep(2);
commit;
SQL
demote_pid=$!
sleep 0.4
trap - ERR
set +e
"${PSQL[@]}" >"$LOGDIR/concurrency-stale-admin.log" 2>&1 <<SQL
begin;
select test.login('$admin');
select public.cira_update_group('$group_role', 'Unauthorized update', null, null, 100);
commit;
SQL
admin_status=$?
set -e
trap show_failure_logs ERR
wait "$demote_pid"

if [ "$admin_status" -eq 0 ]; then
  echo "TEST_FAILED: demoted admin retained stale mutation authority" >&2
  exit 1
fi

"${PSQL[@]}" >"$LOGDIR/concurrency-role-assert.log" 2>&1 <<SQL
do \$\$
begin
  if (select name from public.cira_groups where id = '$group_role') <> 'Role race' then
    raise exception 'TEST_FAILED: stale admin changed the group';
  end if;
  if private.cira_group_role('$group_role', '$admin') <> 'member' then
    raise exception 'TEST_FAILED: admin demotion did not commit';
  end if;
end;
\$\$;
SQL

echo "PASS  group concurrency (block/join, demote/update)"
