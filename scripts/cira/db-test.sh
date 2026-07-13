#!/usr/bin/env bash
# CIRA PR1 - local test harness.
#
# Spins up a DISPOSABLE PostgreSQL 15+ instance (initdb in a mktemp dir, port
# 54329, unix socket only), creates the minimal Supabase shims (schema auth,
# auth.users, auth.uid(), roles anon/authenticated/service_role - shims live
# in the HARNESS ONLY, never in the migrations), applies the CIRA migrations
# in order, then runs every supabase/tests/*.sql through
# `psql -v ON_ERROR_STOP=1`, printing PASS/FAIL per file.
#
# Exit code: non-zero if setup fails or if any test file fails.
# Teardown (pg_ctl stop + rm -rf) always runs, even on failure (trap).
#
# Requirements: PostgreSQL 15+ binaries (no Supabase CLI, no pgTAP):
#   brew install postgresql@15   ->  /opt/homebrew/opt/postgresql@15/bin
#
# Usage: bash scripts/cira/db-test.sh

set -euo pipefail

# macOS: an invalid LC_ALL makes the postmaster abort at startup
# ("postmaster became multithreaded during startup"). Force a safe locale.
export LC_ALL=C

if [ -z "${PGBIN:-}" ]; then
  pg_config_bindir="$(pg_config --bindir 2>/dev/null || true)"
  if [ -n "$pg_config_bindir" ] && [ -x "$pg_config_bindir/initdb" ]; then
    PGBIN="$pg_config_bindir"
  else
    PGBIN="/opt/homebrew/opt/postgresql@15/bin"
  fi
fi
PORT="${CIRA_TEST_PORT:-54329}"
DB=cira_test
PGUSER=postgres

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
TESTS_DIR="$REPO_ROOT/supabase/tests"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "ERROR: PostgreSQL 15+ binaries not found in $PGBIN (set PGBIN to override)" >&2
  exit 2
fi

PG_MAJOR="$("$PGBIN/postgres" --version | sed -E 's/.* ([0-9]+)(\..*)?$/\1/')"
if ! [[ "$PG_MAJOR" =~ ^[0-9]+$ ]] || [ "$PG_MAJOR" -lt 15 ]; then
  echo "ERROR: PostgreSQL 15+ is required (found: $("$PGBIN/postgres" --version))" >&2
  exit 2
fi

# /tmp on purpose: unix socket paths are limited to ~104 chars.
WORKDIR="$(mktemp -d /tmp/cira-db-test.XXXXXX)"
DATADIR="$WORKDIR/data"
SOCKDIR="$WORKDIR/sock"
LOGDIR="$WORKDIR/logs"
mkdir -p "$SOCKDIR" "$LOGDIR"

STARTED=0
cleanup() {
  if [ "$STARTED" = 1 ]; then
    "$PGBIN/pg_ctl" -D "$DATADIR" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT INT TERM

echo "==> initdb (disposable cluster in $WORKDIR)"
"$PGBIN/initdb" -D "$DATADIR" -U "$PGUSER" -A trust >"$LOGDIR/initdb.log" 2>&1

echo "==> starting postgres $PG_MAJOR on port $PORT (unix socket only)"
"$PGBIN/pg_ctl" -D "$DATADIR" -w -t 30 -l "$LOGDIR/postgres.log" \
  -o "-p $PORT -k $SOCKDIR -c listen_addresses=''" start >"$LOGDIR/pg_ctl.log" 2>&1
STARTED=1

PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCKDIR" -p "$PORT" -U "$PGUSER")

"${PSQL[@]}" -d postgres -c "create database $DB" >/dev/null

echo "==> creating Supabase shims (harness only - NEVER part of the migrations)"
"${PSQL[@]}" -d "$DB" >"$LOGDIR/shims.log" 2>&1 <<'SQL'
-- API roles as provisioned by Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

-- Minimal auth schema.
create schema auth;
create table auth.users (
  id                uuid primary key,
  email             text,
  raw_app_meta_data jsonb not null default '{"cira_beta": true}'::jsonb
);

-- auth.uid() reads request.jwt.claims, like the real Supabase helper.
-- nullif(..., '') tolerates an empty GUC (set_config leaves '' behind).
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Test-only helpers to impersonate users. The session user stays the
-- superuser, so switching roles freely is always permitted.
create schema test;
grant usage on schema test to anon, authenticated, service_role;

-- Become an authenticated user (local to the current transaction).
create function test.login(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Become the anon role (no claims).
create function test.login_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Back to the superuser ('none' = session user).
create function test.logout()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Minimal Realtime shim: realtime.send appends to realtime.messages, like
-- the real broadcast-from-database helper. RLS is enabled so the migration's
-- SELECT policy is actually exercised by the tests.
create schema realtime;
create table realtime.messages (
  topic       text        not null,
  extension   text        not null,
  payload     jsonb,
  event       text,
  private     boolean,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to anon, authenticated, service_role;

create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void
language sql
security definer
as $$
  insert into realtime.messages (payload, event, topic, private, extension)
  values (payload, event, topic, private, 'broadcast');
$$;
grant execute on function realtime.send(jsonb, text, text, boolean)
  to anon, authenticated, service_role;

-- The real realtime.topic() returns the topic of the websocket subscription
-- being authorized; the harness reads a GUC the test sets explicitly.
create function realtime.topic()
returns text
language sql
stable
as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
grant execute on function realtime.topic() to anon, authenticated, service_role;
SQL

echo "==> applying migrations"
shopt -s nullglob
migrations=("$MIGRATIONS_DIR"/*.sql)
if [ ${#migrations[@]} -eq 0 ]; then
  echo "ERROR: no migration found in $MIGRATIONS_DIR" >&2
  exit 2
fi
for f in "${migrations[@]}"; do
  name="$(basename "$f")"
  echo "    - $name"
  if ! "${PSQL[@]}" -d "$DB" -1 -f "$f" >"$LOGDIR/migration-$name.log" 2>&1; then
    echo "ERROR: migration $name failed:" >&2
    sed 's/^/      /' "$LOGDIR/migration-$name.log" >&2
    exit 2
  fi
done

echo "==> running concurrency tests"
PGBIN="$PGBIN" PORT="$PORT" DB="$DB" PGUSER="$PGUSER" \
  SOCKDIR="$SOCKDIR" LOGDIR="$LOGDIR" \
  bash "$REPO_ROOT/scripts/cira/db-concurrency-test.sh"

echo "==> running tests"
tests=("$TESTS_DIR"/*.sql)
if [ ${#tests[@]} -eq 0 ]; then
  echo "ERROR: no test file found in $TESTS_DIR" >&2
  exit 2
fi

pass=0
fail=0
failed_files=()
for f in "${tests[@]}"; do
  name="$(basename "$f")"
  if "${PSQL[@]}" -d "$DB" -f "$f" >"$LOGDIR/test-$name.log" 2>&1; then
    echo "PASS  $name"
    pass=$((pass + 1))
  else
    echo "FAIL  $name"
    fail=$((fail + 1))
    failed_files+=("$name")
    tail -n 40 "$LOGDIR/test-$name.log" | sed 's/^/      /'
  fi
done

echo
echo "==> summary: $pass passed, $fail failed (of ${#tests[@]} files)"
if [ "$fail" -gt 0 ]; then
  echo "==> failed: ${failed_files[*]}"
  exit 1
fi
