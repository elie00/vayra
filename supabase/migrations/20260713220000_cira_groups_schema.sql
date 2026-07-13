-- CIRA complete: private groups and role-bearing memberships.
--
-- Groups are deliberately social-only. Their schema cannot store media,
-- playback, library, addon, IP, device or Stremio data. Direct API access is
-- denied; every read and mutation is exposed later through caller-scoped RPCs.

------------------------------------------------------------------------------
-- public.cira_groups
------------------------------------------------------------------------------
create table public.cira_groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.cira_profiles (user_id) on delete cascade,
  name        text not null,
  description text,
  avatar_key  text,
  max_members integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint cira_groups_name_length check (char_length(name) between 1 and 48),
  constraint cira_groups_name_clean check (name !~ '[<>[:cntrl:]]'),
  constraint cira_groups_description_length
    check (description is null or char_length(description) between 1 and 240),
  constraint cira_groups_description_clean
    check (description is null or description !~ '[<>[:cntrl:]]'),
  constraint cira_groups_avatar_key_format
    check (avatar_key is null or avatar_key ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),
  constraint cira_groups_member_cap check (max_members between 2 and 250)
);

create index cira_groups_owner_idx
  on public.cira_groups (owner_id, updated_at desc);

------------------------------------------------------------------------------
-- public.cira_group_members
------------------------------------------------------------------------------
create table public.cira_group_members (
  group_id   uuid not null references public.cira_groups (id) on delete cascade,
  user_id    uuid not null references public.cira_profiles (user_id) on delete cascade,
  role       text not null,
  invited_by uuid references public.cira_profiles (user_id) on delete set null,
  joined_at  timestamptz not null default now(),

  constraint cira_group_members_pkey primary key (group_id, user_id),
  constraint cira_group_members_role_valid check (role in ('owner', 'admin', 'member')),
  constraint cira_group_members_inviter_not_self
    check (invited_by is null or invited_by <> user_id)
);

create index cira_group_members_user_idx
  on public.cira_group_members (user_id, joined_at desc);
create unique index cira_group_members_one_owner
  on public.cira_group_members (group_id) where role = 'owner';

------------------------------------------------------------------------------
-- API boundary
------------------------------------------------------------------------------
revoke all on table public.cira_groups from public, anon, authenticated;
revoke all on table public.cira_group_members from public, anon, authenticated;

alter table public.cira_groups enable row level security;
alter table public.cira_group_members enable row level security;

