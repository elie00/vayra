-- Index the foreign keys that point at cira_profiles.
--
-- All eleven cascade or null out when a profile is removed, so deleting an
-- account (cira_delete_account) makes Postgres look for referencing rows in
-- every one of these tables. Without an index on the referencing column that
-- is a sequential scan per table, holding locks for the length of it — on an
-- operation the viewer triggers from the app and waits on.
--
-- Written while the tables are still empty, so each index is created instantly.

create index if not exists cira_group_invites_inviter_id_idx
  on public.cira_group_invites (inviter_id);

create index if not exists cira_group_links_creator_id_idx
  on public.cira_group_links (creator_id);

create index if not exists cira_group_members_invited_by_idx
  on public.cira_group_members (invited_by);

create index if not exists vara_collection_delegates_granted_by_idx
  on public.vara_collection_delegates (granted_by);

create index if not exists vara_collection_items_added_by_idx
  on public.vara_collection_items (added_by);

create index if not exists vara_collections_created_by_idx
  on public.vara_collections (created_by);

create index if not exists vara_collections_updated_by_idx
  on public.vara_collections (updated_by);

create index if not exists vara_room_invites_inviter_id_idx
  on public.vara_room_invites (inviter_id);

create index if not exists vara_room_links_creator_id_idx
  on public.vara_room_links (creator_id);

create index if not exists vara_room_members_invited_by_idx
  on public.vara_room_members (invited_by);

create index if not exists vara_rooms_host_id_idx
  on public.vara_rooms (host_id);
