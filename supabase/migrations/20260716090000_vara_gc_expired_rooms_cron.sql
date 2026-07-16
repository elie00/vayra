------------------------------------------------------------------------------
-- Move the expired-room GC off the read path.
--
-- vara_list_rooms ran `delete from vara_rooms where status='active' and
-- expires_at <= now()` on every authenticated call — a shared garbage collector
-- bolted onto a hot read, coupling list latency to global expiry volume and
-- contending with per-room FOR UPDATE locks. The SELECT already filters
-- `expires_at > now()`, so the delete never affected the result — it was pure GC.
--
-- Extract it into private.vara_gc_expired_rooms() and schedule that via pg_cron.
-- Scheduling is guarded: on an environment without pg_cron (the local test
-- harness) the function is still created and callable, only the cron job is
-- skipped — run it from an external scheduler there if needed.
------------------------------------------------------------------------------

-- Read path: no more inline GC. Same signature, so grants carry over.
create or replace function public.vara_list_rooms()
returns setof jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_room_id uuid;
begin
  v_uid := private.vara_require_uid();

  for v_room_id in
    select m.room_id
    from public.vara_room_members m
    join public.vara_rooms r on r.id = m.room_id
    where m.user_id = v_uid and r.status = 'active' and r.expires_at > now()
    order by m.joined_at desc, m.room_id
  loop
    return next private.vara_room_json(v_room_id, v_uid);
  end loop;
  return;
end;
$$;

-- The GC itself. Not a client RPC (private schema); callable by the scheduler.
create or replace function private.vara_gc_expired_rooms()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.vara_rooms
  where status = 'active' and expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.vara_gc_expired_rooms() from public, anon, authenticated;

-- Schedule every 5 minutes where pg_cron exists. Guarded + non-fatal so the
-- migration applies cleanly on environments without the extension.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      -- cron.schedule upserts by job name, so re-applying is idempotent.
      perform cron.schedule(
        'vara-gc-expired-rooms',
        '*/5 * * * *',
        $cmd$ select private.vara_gc_expired_rooms(); $cmd$
      );
    exception when others then
      raise notice 'pg_cron scheduling skipped: %', sqlerrm;
    end;
  else
    raise notice 'pg_cron unavailable; vara_gc_expired_rooms created but not scheduled';
  end if;
end;
$$;
