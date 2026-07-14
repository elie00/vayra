-- Authorization hardening: a non-member must never pass a group role guard.
-- Regression tests for the NULL-role bypass (NULL <> 'owner' is NULL, and
-- `if NULL then raise` does not raise).
\echo '=== 19_groups_authz ==='

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000019a1'),  -- grace: group owner
  ('00000000-0000-4000-8000-0000000019b2'),  -- henry: member
  ('00000000-0000-4000-8000-0000000019c3'),  -- ivy: grace's friend, not member
  ('00000000-0000-4000-8000-0000000019d4');  -- mallory: unrelated attacker

do $do$
begin
  perform test.login('00000000-0000-4000-8000-0000000019a1');
  perform public.cira_upsert_profile('g19_grace', 'Grace');
  perform test.login('00000000-0000-4000-8000-0000000019b2');
  perform public.cira_upsert_profile('g19_henry', 'Henry');
  perform test.login('00000000-0000-4000-8000-0000000019c3');
  perform public.cira_upsert_profile('g19_ivy', 'Ivy');
  perform test.login('00000000-0000-4000-8000-0000000019d4');
  perform public.cira_upsert_profile('g19_mallory', 'Mallory');
end;
$do$;

do $do$
declare
  g uuid;
  invite uuid;
  link uuid;
begin
  perform test.login('00000000-0000-4000-8000-0000000019a1');
  g := (public.cira_create_group('Fort Knox 19')->>'group_id')::uuid;

  perform test.logout();
  insert into public.cira_group_members (group_id, user_id, role)
  values (g, '00000000-0000-4000-8000-0000000019b2', 'member');
  insert into public.cira_friendships (requester_id, addressee_id, status, responded_at)
  values ('00000000-0000-4000-8000-0000000019a1',
          '00000000-0000-4000-8000-0000000019c3', 'accepted', now());

  perform test.login('00000000-0000-4000-8000-0000000019a1');
  invite := (public.cira_invite_group_member(
    g, '00000000-0000-4000-8000-0000000019c3')->>'invitation_id')::uuid;
  link := (public.cira_create_group_link(g)->>'link_id')::uuid;

  -- Mallory holds a valid profile and knows the group id, nothing more.
  perform test.login('00000000-0000-4000-8000-0000000019d4');

  begin
    perform public.cira_update_group(g, 'Pwned');
    raise exception 'TEST_FAILED: non-member updated the group';
  exception when others then
    if sqlerrm <> 'GROUP_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.cira_delete_group(g);
    raise exception 'TEST_FAILED: non-member deleted the group';
  exception when others then
    if sqlerrm <> 'GROUP_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.cira_set_group_role(
      g, '00000000-0000-4000-8000-0000000019b2', 'admin');
    raise exception 'TEST_FAILED: non-member changed a role';
  exception when others then
    if sqlerrm <> 'GROUP_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.cira_transfer_group_ownership(
      g, '00000000-0000-4000-8000-0000000019b2');
    raise exception 'TEST_FAILED: non-member transferred ownership';
  exception when others then
    if sqlerrm <> 'GROUP_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.cira_invite_group_member(
      g, '00000000-0000-4000-8000-0000000019c3');
    raise exception 'TEST_FAILED: non-member invited into the group';
  exception when others then
    if sqlerrm <> 'GROUP_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.cira_cancel_group_invite(invite);
    raise exception 'TEST_FAILED: non-member cancelled an invite';
  exception when others then
    if sqlerrm <> 'GROUP_INVITE_UNAVAILABLE' then raise; end if;
  end;
  begin
    perform public.cira_create_group_link(g);
    raise exception 'TEST_FAILED: non-member minted an admission link';
  exception when others then
    if sqlerrm <> 'GROUP_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.cira_list_group_links(g);
    raise exception 'TEST_FAILED: non-member listed admission links';
  exception when others then
    if sqlerrm <> 'GROUP_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.cira_revoke_group_link(link);
    raise exception 'TEST_FAILED: non-member revoked an admission link';
  exception when others then
    if sqlerrm <> 'GROUP_INVITE_UNAVAILABLE' then raise; end if;
  end;

  -- Nothing changed: group intact, roles intact, invite and link intact.
  perform test.logout();
  if not exists (select 1 from public.cira_groups
                 where id = g and name = 'Fort Knox 19'
                   and owner_id = '00000000-0000-4000-8000-0000000019a1') then
    raise exception 'TEST_FAILED: group state mutated';
  end if;
  if (select role from public.cira_group_members
      where group_id = g
        and user_id = '00000000-0000-4000-8000-0000000019b2') <> 'member' then
    raise exception 'TEST_FAILED: member role mutated';
  end if;
  if not exists (select 1 from public.cira_group_invites where id = invite) then
    raise exception 'TEST_FAILED: invite vanished';
  end if;
  if not exists (select 1 from public.cira_group_links where id = link) then
    raise exception 'TEST_FAILED: link vanished';
  end if;
end;
$do$;

\echo '19_groups_authz OK'
