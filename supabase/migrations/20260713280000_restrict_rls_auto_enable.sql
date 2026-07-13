-- The dashboard-managed event trigger enables RLS on newly created public
-- tables. PostgreSQL invokes it as an event trigger; API roles never need to
-- call the SECURITY DEFINER function directly through PostgREST.
--
-- Some local/test databases do not install this dashboard helper, so keep the
-- migration portable while closing the exposure wherever it exists.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
