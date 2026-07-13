-- CIRA complete: cross-device social inbox without an activity-history table.
-- Only a per-user seen timestamp is stored. Counts are derived from current
-- pending requests/invitations, preserving CIRA's data-minimisation model.

create table public.cira_inbox_state (
  user_id uuid primary key references public.cira_profiles (user_id) on delete cascade,
  seen_at timestamptz not null default now()
);

revoke all on table public.cira_inbox_state from public, anon, authenticated;
alter table public.cira_inbox_state enable row level security;

create function public.cira_get_inbox()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_seen timestamptz;
  v_friend_total integer;
  v_group_total integer;
  v_friend_unread integer;
  v_group_unread integer;
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  select s.seen_at into v_seen from public.cira_inbox_state s where s.user_id = v_uid;
  v_seen := coalesce(v_seen, '-infinity'::timestamptz);

  select count(*), count(*) filter (where f.created_at > v_seen)
  into v_friend_total, v_friend_unread
  from public.cira_friendships f
  where f.addressee_id = v_uid and f.status = 'pending';

  delete from public.cira_group_invites where invitee_id = v_uid and expires_at <= now();
  select count(*), count(*) filter (where i.created_at > v_seen)
  into v_group_total, v_group_unread
  from public.cira_group_invites i
  where i.invitee_id = v_uid
    and not private.cira_any_block(v_uid, i.inviter_id);

  return jsonb_build_object(
    'seen_at', case when v_seen = '-infinity'::timestamptz then null else v_seen end,
    'friend_request_count', v_friend_total,
    'group_invitation_count', v_group_total,
    'unread_count', v_friend_unread + v_group_unread
  );
end;
$$;

create function public.cira_mark_inbox_seen()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_seen timestamptz := now();
begin
  v_uid := private.cira_require_uid();
  perform private.cira_require_profile(v_uid);
  insert into public.cira_inbox_state as s (user_id, seen_at)
  values (v_uid, v_seen)
  on conflict (user_id) do update set seen_at = excluded.seen_at;
  perform private.cira_notify(array[v_uid]);
  return jsonb_build_object('seen_at', v_seen);
end;
$$;

revoke all on function public.cira_get_inbox() from public, anon;
revoke all on function public.cira_mark_inbox_seen() from public, anon;
grant execute on function public.cira_get_inbox() to authenticated;
grant execute on function public.cira_mark_inbox_seen() to authenticated;
