#!/usr/bin/env bash
# Load / performance test for the expired-room GC (private.vara_gc_expired_rooms).
#
# Opt-in — NOT run by db-test.sh (it seeds hundreds of thousands of rows). It
# spins up its own disposable PostgreSQL cluster (mirroring db-test.sh's
# bootstrap), applies the migrations, then measures three things:
#
#   Phase 1 (steady state): a big rooms table with a SMALL expired fraction (what
#     accumulates between two 5-min cron runs). Asserts the GC delete is driven by
#     the partial index vara_rooms_expiry_idx (NOT a seq scan) and is fast, so the
#     cron stays cheap as the rooms table grows. Then runs the real GC and checks
#     it removes exactly the expired rooms and leaves the live ones + cascades.
#
#   Phase 2 (backlog + non-contention): a LARGE expired backlog (cron was down),
#     deleted inside a transaction that holds its locks; concurrently, another
#     user's vara_list_rooms read must NOT be blocked (the whole reason the GC was
#     moved off the read path). Reports the reader latency.
#
# Usage:
#   bash scripts/cira/db-loadtest-gc.sh
#   LIVE=200000 EXPIRED=2000 BACKLOG=80000 bash scripts/cira/db-loadtest-gc.sh
#
# Requirements: PostgreSQL 15+ binaries (same as db-test.sh).

set -euo pipefail
export LC_ALL=C

# Millisecond epoch, portable (macOS `date` has no %N).
now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }

LIVE="${LIVE:-100000}"      # live rooms (never collected)
EXPIRED="${EXPIRED:-1000}"  # small expired fraction for the steady-state phase
BACKLOG="${BACKLOG:-40000}" # large expired backlog for the contention phase

if [ -z "${PGBIN:-}" ]; then
  pg_config_bindir="$(pg_config --bindir 2>/dev/null || true)"
  if [ -n "$pg_config_bindir" ] && [ -x "$pg_config_bindir/initdb" ]; then
    PGBIN="$pg_config_bindir"
  else
    PGBIN="/opt/homebrew/opt/postgresql@15/bin"
  fi
fi
PORT="${CIRA_TEST_PORT:-54331}"
DB=cira_loadtest
PGUSER=postgres

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "ERROR: PostgreSQL 15+ binaries not found in $PGBIN (set PGBIN to override)" >&2
  exit 2
fi

WORKDIR="$(mktemp -d /tmp/cira-loadtest.XXXXXX)"
DATADIR="$WORKDIR/data"; SOCKDIR="$WORKDIR/sock"; LOGDIR="$WORKDIR/logs"
mkdir -p "$SOCKDIR" "$LOGDIR"
STARTED=0
cleanup() {
  if [ -n "${KEEP_LOGS:-}" ]; then mkdir -p /tmp/lt-logs && cp "$LOGDIR"/*.log /tmp/lt-logs/ 2>/dev/null || true; fi
  if [ "$STARTED" = 1 ]; then
    "$PGBIN/pg_ctl" -D "$DATADIR" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT INT TERM

echo "==> initdb (disposable cluster in $WORKDIR)"
"$PGBIN/initdb" -D "$DATADIR" -U "$PGUSER" -A trust >"$LOGDIR/initdb.log" 2>&1
"$PGBIN/pg_ctl" -D "$DATADIR" -w -t 30 -l "$LOGDIR/postgres.log" \
  -o "-p $PORT -k $SOCKDIR -c listen_addresses=''" start >"$LOGDIR/pg_ctl.log" 2>&1
STARTED=1

PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCKDIR" -p "$PORT" -U "$PGUSER")
"${PSQL[@]}" -d postgres -c "create database $DB" >/dev/null

echo "==> Supabase shims (harness only)"
"${PSQL[@]}" -d "$DB" >"$LOGDIR/shims.log" 2>&1 <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb not null default '{"cira_beta": true}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create schema test; grant usage on schema test to anon, authenticated, service_role;
create function test.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end; $$;
create function test.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end; $$;
create schema realtime;
create table realtime.messages (topic text not null, extension text not null, payload jsonb, event text, private boolean, inserted_at timestamptz not null default now());
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to anon, authenticated, service_role;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql security definer as $$
  insert into realtime.messages (payload, event, topic, private, extension) values (payload, event, topic, private, 'broadcast'); $$;
grant execute on function realtime.send(jsonb, text, text, boolean) to anon, authenticated, service_role;
create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
grant execute on function realtime.topic() to anon, authenticated, service_role;
SQL

echo "==> applying migrations"
shopt -s nullglob
for f in "$MIGRATIONS_DIR"/*.sql; do
  if ! "${PSQL[@]}" -d "$DB" -1 -f "$f" >"$LOGDIR/migration-$(basename "$f").log" 2>&1; then
    echo "ERROR: migration $(basename "$f") failed:" >&2
    sed 's/^/      /' "$LOGDIR/migration-$(basename "$f").log" >&2
    exit 2
  fi
done

owner="00000000-0000-4000-8000-0000000f0001"
reader="00000000-0000-4000-8000-0000000f0002"

echo "==> seeding: $LIVE live + $EXPIRED expired rooms (+ members)"
"${PSQL[@]}" -d "$DB" >"$LOGDIR/seed.log" 2>&1 <<SQL
insert into auth.users (id, email) values
  ('$owner','lt-owner@example.invalid'), ('$reader','lt-reader@example.invalid');
insert into public.cira_profiles (user_id, handle, display_name) values
  ('$owner','lt_owner','LT owner'), ('$reader','lt_reader','LT reader');

-- Live rooms (never collected).
insert into public.vara_rooms (owner_id, host_id, topic, host_lease_until, created_at, expires_at)
select '$owner','$owner', 'vara:'||md5('live'||g), now()+interval '90 seconds', now(), now()+interval '3 hours'
from generate_series(1, $LIVE) g;

-- Small expired fraction (steady-state accumulation).
insert into public.vara_rooms (owner_id, host_id, topic, host_lease_until, created_at, expires_at)
select '$owner','$owner', 'vara:'||md5('exp'||g), now()-interval '2 hours'+interval '90 seconds', now()-interval '2 hours', now()-interval '1 hour'
from generate_series(1, $EXPIRED) g;

-- Owner is a member of every room (cascade target on delete).
insert into public.vara_room_members (room_id, user_id)
select id, '$owner' from public.vara_rooms;

-- Reader is a member of a FEW live rooms only, so its vara_list_rooms is cheap.
insert into public.vara_room_members (room_id, user_id)
select id, '$reader' from public.vara_rooms
where topic in ('vara:'||md5('live'||1), 'vara:'||md5('live'||2), 'vara:'||md5('live'||3));

analyze public.vara_rooms;
analyze public.vara_room_members;
SQL

echo
echo "==> Phase 1: steady-state plan + GC timing ($EXPIRED expired of $((LIVE+EXPIRED)) rooms)"
"${PSQL[@]}" -d "$DB" >"$LOGDIR/explain.log" 2>&1 <<SQL
begin;
explain (analyze, buffers)
delete from public.vara_rooms where status='active' and expires_at <= now();
rollback;
SQL
echo "--- delete plan (rolled back) ---"
grep -E "Scan|Execution Time|Planning Time" "$LOGDIR/explain.log" | sed 's/^/    /'

if grep -qE "Seq Scan on vara_rooms" "$LOGDIR/explain.log"; then
  echo "FAIL: GC delete used a Seq Scan on vara_rooms with only $EXPIRED/$((LIVE+EXPIRED)) expired — index not used" >&2
  exit 1
fi
if ! grep -qE "vara_rooms_expiry_idx" "$LOGDIR/explain.log"; then
  echo "FAIL: GC delete plan did not use vara_rooms_expiry_idx" >&2
  exit 1
fi
echo "    OK: index-driven (vara_rooms_expiry_idx), no seq scan on the live table"

"${PSQL[@]}" -d "$DB" >"$LOGDIR/gc1.log" 2>&1 <<SQL
do \$\$
declare t0 timestamptz; n int; ms numeric;
begin
  t0 := clock_timestamp();
  n := private.vara_gc_expired_rooms();
  ms := extract(epoch from clock_timestamp()-t0)*1000;
  raise notice 'gc_deleted=% gc_ms=%', n, round(ms,1);
  if n <> $EXPIRED then raise exception 'FAIL: expected $EXPIRED deleted, got %', n; end if;
end \$\$;
SQL
grep -oE "gc_deleted=[0-9]+ gc_ms=[0-9.]+" "$LOGDIR/gc1.log" | sed 's/^/    /'

"${PSQL[@]}" -d "$DB" -t >"$LOGDIR/survivors.log" 2>&1 <<SQL
do \$\$
declare rooms int; orphan int;
begin
  select count(*) into rooms from public.vara_rooms;
  if rooms <> $LIVE then raise exception 'FAIL: expected $LIVE live rooms after GC, got %', rooms; end if;
  -- cascade: no member rows left pointing at a deleted room
  select count(*) into orphan from public.vara_room_members m
    left join public.vara_rooms r on r.id = m.room_id where r.id is null;
  if orphan <> 0 then raise exception 'FAIL: % orphaned member rows after cascade', orphan; end if;
  raise notice 'survivors_ok live=% orphans=0', rooms;
end \$\$;
SQL
grep -oE "survivors_ok live=[0-9]+ orphans=0" "$LOGDIR/survivors.log" | sed 's/^/    /'
echo "    OK: exactly the expired rooms removed, live rooms + members intact"

echo
echo "==> Phase 2: non-contention under a $BACKLOG-room backlog delete"
"${PSQL[@]}" -d "$DB" >"$LOGDIR/backlog.log" 2>&1 <<SQL
insert into public.vara_rooms (owner_id, host_id, topic, host_lease_until, created_at, expires_at)
select '$owner','$owner', 'vara:'||md5('bk'||g), now()-interval '2 hours'+interval '90 seconds', now()-interval '2 hours', now()-interval '1 hour'
from generate_series(1, $BACKLOG) g;
-- Owner membership on the backlog rooms so the cascade has real work to do.
insert into public.vara_room_members (room_id, user_id)
select r.id, '$owner' from public.vara_rooms r
left join public.vara_room_members m on m.room_id=r.id and m.user_id='$owner'
where m.room_id is null;
analyze public.vara_rooms;
SQL

# Background: delete the backlog inside a txn that holds its locks ~1.5s.
"${PSQL[@]}" -d "$DB" >"$LOGDIR/bg-gc.log" 2>&1 <<SQL &
begin;
select private.vara_gc_expired_rooms();
select pg_sleep(1.5);
commit;
SQL
bg_pid=$!
sleep 0.3

# Foreground: the reader's vara_list_rooms must return promptly (not blocked).
start_ms=$(now_ms)
# Single transaction: test.login uses transaction-local set_config, so the
# authenticated identity must persist into the vara_list_rooms call.
"${PSQL[@]}" -d "$DB" -t >"$LOGDIR/reader.log" 2>&1 <<SQL
begin;
select test.login('$reader');
select count(*) from public.vara_list_rooms();
commit;
SQL
end_ms=$(now_ms)
wait "$bg_pid"
read_ms=$((end_ms - start_ms))
read_rows="$(grep -Eo '^\s*[0-9]+' "$LOGDIR/reader.log" | tail -1 | tr -d ' ')"

echo "    reader vara_list_rooms returned ${read_rows:-?} rooms in ${read_ms} ms while a $BACKLOG-room GC held its locks"
if [ "$read_ms" -ge 1200 ]; then
  echo "FAIL: reader latency ${read_ms} ms suggests it was blocked by the GC delete" >&2
  exit 1
fi
echo "    OK: read path not blocked by the concurrent GC (< 1200 ms)"

echo
echo "==> load test PASSED (LIVE=$LIVE EXPIRED=$EXPIRED BACKLOG=$BACKLOG)"
