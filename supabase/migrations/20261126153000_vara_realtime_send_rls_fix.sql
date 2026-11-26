-- Fix VARA Realtime private channel broadcast write authorization.
--
-- Supabase Realtime checks INSERT RLS on realtime.messages once at channel-join
-- time using a rolled-back probe row where `extension = 'broadcast'` and
-- `event IS NULL`. The original `vara_send_room_channel` policy required
-- `event IN (...)`, which evaluated to NULL (falsy) for the probe row and
-- denied broadcast writes to every room member (including the host).
--
-- Allowing `event IS NULL` for active room members (`private.vara_topic_access(..., false)`)
-- unblocks channel-join write authorization while preserving strict event-level
-- and host-only checks whenever `event IS NOT NULL`, and keeping non-members,
-- non-beta users, blocked users, expired rooms, and unknown events strictly denied.

drop policy if exists vara_send_room_channel on realtime.messages;

create policy vara_send_room_channel
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.topic = (select realtime.topic())
    and (
      (
        realtime.messages.extension = 'presence'
        and private.vara_topic_access((select realtime.topic()), false)
      )
      or
      (
        realtime.messages.extension = 'broadcast'
        and (
          realtime.messages.event is null
          or realtime.messages.event in ('cmd', 'snapshot-request')
        )
        and private.vara_topic_access((select realtime.topic()), false)
      )
      or
      (
        realtime.messages.extension = 'broadcast'
        and realtime.messages.event in ('state', 'snapshot')
        and private.vara_topic_access((select realtime.topic()), true)
      )
    )
  );
