export type PrivateBetaHelpId =
  | "local-content"
  | "sync"
  | "reconnect"
  | "host-transfer"
  | "room-expired"
  | "access-removed"
  | "group-archived";

export type PrivateBetaHelpItem = {
  id: PrivateBetaHelpId;
  title: string;
  explanation: string;
  action: string;
};

export const PRIVATE_BETA_HELP: readonly PrivateBetaHelpItem[] = [
  {
    id: "local-content",
    title: "What each participant must open",
    explanation: "Each person chooses and opens the content locally. VARA never sends the stream, source or addon to another member.",
    action: "Open the same title on every device before the host starts playback.",
  },
  {
    id: "sync",
    title: "Playback is not synchronized",
    explanation: "VEYA synchronizes play, pause and seeking only after every participant has opened content locally.",
    action: "Keep VARA open, verify everyone is in the room, then let the current host pause and resume once.",
  },
  {
    id: "reconnect",
    title: "A participant lost connection",
    explanation: "A temporary network interruption can detach playback intent without exposing what anyone is watching.",
    action: "Restore the connection, leave the room if it remains stale, then enter the same active VARA again.",
  },
  {
    id: "host-transfer",
    title: "The host needs to leave",
    explanation: "The current host controls VEYA playback intent. Room ownership and playback hosting are separate roles.",
    action: "Use Transfer VEYA host in the active room before the current host leaves.",
  },
  {
    id: "room-expired",
    title: "The room expired or was closed",
    explanation: "Private rooms and links expire. A closed room cannot be restored from an old invitation.",
    action: "Ask an accepted CIRA relation to create a new VARA and a fresh short-lived link.",
  },
  {
    id: "access-removed",
    title: "You were removed or blocked",
    explanation: "VAYRA intentionally does not reveal whether a block, removal or membership change caused the loss of access.",
    action: "Return to CIRA. Only use a new invitation if the other person intentionally sends one.",
  },
  {
    id: "group-archived",
    title: "A group is archived",
    explanation: "Archived groups are frozen: membership and group-scoped room actions are unavailable until restoration.",
    action: "Ask a group owner or admin to restore it, or use a direct private VARA instead.",
  },
] as const;
