-- CIRA complete: constraints and delete semantics for private groups.
\echo '=== 10_groups_schema ==='

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000010a1', 'g10a@test'),
  ('00000000-0000-4000-8000-0000000010b2', 'g10b@test'),
  ('00000000-0000-4000-8000-0000000010c3', 'g10c@test');

insert into public.cira_profiles (user_id, handle, display_name) values
  ('00000000-0000-4000-8000-0000000010a1', 'g10_alice', 'Alice'),
  ('00000000-0000-4000-8000-0000000010b2', 'g10_bob', 'Bob'),
  ('00000000-0000-4000-8000-0000000010c3', 'g10_carol', 'Carol');

insert into public.cira_groups (id, owner_id, name, description)
values ('10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-0000000010a1', 'Close circle', 'Private group');

insert into public.cira_group_members (group_id, user_id, role)
values ('10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-0000000010a1', 'owner');

do $do$
declare
  rec record;
begin
  for rec in
    select * from (values
      ($q$insert into public.cira_groups (owner_id, name) values ('00000000-0000-4000-8000-0000000010a1', '')$q$, '23514'),
      ($q$insert into public.cira_groups (owner_id, name) values ('00000000-0000-4000-8000-0000000010a1', repeat('x', 49))$q$, '23514'),
      ($q$insert into public.cira_groups (owner_id, name) values ('00000000-0000-4000-8000-0000000010a1', 'bad<script>')$q$, '23514'),
      ($q$insert into public.cira_groups (owner_id, name, description) values ('00000000-0000-4000-8000-0000000010a1', 'X', repeat('x', 241))$q$, '23514'),
      ($q$insert into public.cira_groups (owner_id, name, avatar_key) values ('00000000-0000-4000-8000-0000000010a1', 'X', 'https://evil.test/a.png')$q$, '23514'),
      ($q$insert into public.cira_groups (owner_id, name, max_members) values ('00000000-0000-4000-8000-0000000010a1', 'X', 1)$q$, '23514'),
      ($q$insert into public.cira_group_members (group_id, user_id, role) values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000010b2', 'moderator')$q$, '23514'),
      ($q$insert into public.cira_group_members (group_id, user_id, role, invited_by) values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000010b2', 'member', '00000000-0000-4000-8000-0000000010b2')$q$, '23514'),
      ($q$insert into public.cira_group_members (group_id, user_id, role) values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000010b2', 'owner')$q$, '23505')
    ) as t(stmt, state)
  loop
    begin
      execute rec.stmt;
      raise exception 'TEST_FAILED: statement did not fail: %', rec.stmt;
    exception when others then
      if sqlstate <> rec.state then
        raise exception 'TEST_FAILED: expected % got % (%) for: %',
          rec.state, sqlstate, sqlerrm, rec.stmt;
      end if;
    end;
  end loop;
end;
$do$;

-- Owner deletion deletes the private group and every membership. This avoids
-- orphaned ownership and preserves account-deletion data minimisation.
insert into public.cira_group_members (group_id, user_id, role, invited_by)
values ('10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-0000000010b2', 'member',
        '00000000-0000-4000-8000-0000000010a1');
delete from auth.users where id = '00000000-0000-4000-8000-0000000010a1';

do $do$
begin
  if exists (select 1 from public.cira_groups where id = '10000000-0000-4000-8000-000000000001') then
    raise exception 'TEST_FAILED: owner account deletion did not delete group';
  end if;
  if exists (select 1 from public.cira_group_members where group_id = '10000000-0000-4000-8000-000000000001') then
    raise exception 'TEST_FAILED: owner account deletion left memberships behind';
  end if;
end;
$do$;

\echo '10_groups_schema OK'
