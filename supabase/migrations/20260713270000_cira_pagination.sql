-- CIRA complete: bounded pagination for the two potentially long lists.
-- Offset pagination is sufficient here: groups are capped at 250 members and
-- private lists are explicitly refreshed on every Realtime invalidation.

create function public.cira_list_relationships_page(p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid; v_rows jsonb; v_count integer;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  if p_limit not between 1 and 100 or p_offset < 0 then raise exception 'INVALID_PAGE'; end if;
  with page as (
    select f.id as friendship_id, cp.user_id as counterpart_id, cp.handle,
      cp.display_name, cp.avatar_key, f.status,
      case when f.requester_id = v_uid then 'outgoing' else 'incoming' end as direction,
      f.created_at, f.responded_at,
      case when f.status <> 'accepted' then null
        when not cp.presence_opt_in then 'offline'
        else case coalesce((select max(case p.state when 'in_vara' then 2 else 1 end)
          from public.cira_presence p where p.user_id = cp.user_id and p.expires_at > now()), 0)
          when 2 then 'in_vara' when 1 then 'online' else 'offline' end end as presence
    from public.cira_friendships f
    join public.cira_profiles cp on cp.user_id = case
      when f.requester_id = v_uid then f.addressee_id else f.requester_id end
    where f.requester_id = v_uid or f.addressee_id = v_uid
    order by f.created_at desc, f.id
    limit p_limit + 1 offset p_offset
  ), numbered as (select page.*, row_number() over () as rn from page)
  select coalesce(jsonb_agg(to_jsonb(numbered) - 'rn' order by rn)
           filter (where rn <= p_limit), '[]'::jsonb), count(*)
  into v_rows, v_count from numbered;
  return jsonb_build_object('items', v_rows, 'has_more', v_count > p_limit);
end;
$$;

create function public.cira_list_group_members_page(
  p_group_id uuid, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid; v_rows jsonb; v_count integer;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  if private.cira_group_role(p_group_id, v_uid) is null then raise exception 'GROUP_NOT_FOUND'; end if;
  if p_limit not between 1 and 100 or p_offset < 0 then raise exception 'INVALID_PAGE'; end if;
  with page as (
    select p.user_id, p.handle, p.display_name, p.avatar_key, m.role, m.joined_at
    from public.cira_group_members m
    join public.cira_profiles p on p.user_id = m.user_id
    where m.group_id = p_group_id
      and (m.user_id = v_uid or not private.cira_any_block(v_uid, m.user_id))
    order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
             lower(p.display_name), p.user_id
    limit p_limit + 1 offset p_offset
  ), numbered as (select page.*, row_number() over () as rn from page)
  select coalesce(jsonb_agg(to_jsonb(numbered) - 'rn' order by rn)
           filter (where rn <= p_limit), '[]'::jsonb), count(*)
  into v_rows, v_count from numbered;
  return jsonb_build_object('items', v_rows, 'has_more', v_count > p_limit);
end;
$$;

revoke all on function public.cira_list_relationships_page(integer, integer) from public, anon;
revoke all on function public.cira_list_group_members_page(uuid, integer, integer) from public, anon;
grant execute on function public.cira_list_relationships_page(integer, integer) to authenticated;
grant execute on function public.cira_list_group_members_page(uuid, integer, integer) to authenticated;

