-- Self-service VAYRA account deletion.
--
-- The RPC has no target parameter: it can only delete auth.uid(). Deleting the
-- auth row cascades through cira_profiles and every CIRA/VARA table. Local LUMA,
-- playback history and the independent Stremio account are outside Supabase and
-- are therefore intentionally unaffected.

create function public.cira_delete_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  delete from auth.users where id = v_uid;
  if not found then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  return true;
end;
$$;

revoke all on function public.cira_delete_account() from public, anon;
grant execute on function public.cira_delete_account() to authenticated;

comment on function public.cira_delete_account() is
  'Permanently deletes auth.uid() and all cascading VAYRA cloud data; accepts no target id.';
