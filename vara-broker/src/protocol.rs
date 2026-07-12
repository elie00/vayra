// Wire protocol for the VARA/VEYA broker.
//
// JSONL framing: one JSON object per '\n'-terminated line. The envelope is
// discriminated by the field `t`. Field names mirror the TypeScript sync
// contract (src/lib/together/sync/types.ts) so JS structs deserialize 1:1.
//
// The wire NEVER carries a URL / file / media bytes — only playback INTENT
// (play / pause / seek / position) and membership metadata.

use serde::{Deserialize, Serialize};

pub type RoomId = String;

// --- Grounded in the TS PlaybackCommand (types.ts:36-46) -------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum PlaybackCommand {
    #[serde(rename_all = "camelCase")]
    Play {
        origin: String,
        corr: CorrId,
        rev: u64,
        at_ms: f64,
    },
    #[serde(rename_all = "camelCase")]
    Pause {
        origin: String,
        corr: CorrId,
        rev: u64,
        at_ms: f64,
    },
    #[serde(rename_all = "camelCase")]
    Seek {
        origin: String,
        corr: CorrId,
        rev: u64,
        at_ms: f64,
        position_seconds: f64,
    },
}

impl PlaybackCommand {
    /// The clientId of the author, used to exclude it from fan-out.
    pub fn author(&self) -> &str {
        match self {
            PlaybackCommand::Play { corr, .. }
            | PlaybackCommand::Pause { corr, .. }
            | PlaybackCommand::Seek { corr, .. } => &corr.member,
        }
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn rev(&self) -> u64 {
        match self {
            PlaybackCommand::Play { rev, .. }
            | PlaybackCommand::Pause { rev, .. }
            | PlaybackCommand::Seek { rev, .. } => *rev,
        }
    }

    /// Stamp the broker-authoritative revision onto the command.
    pub fn set_rev(&mut self, new_rev: u64) {
        match self {
            PlaybackCommand::Play { rev, .. }
            | PlaybackCommand::Pause { rev, .. }
            | PlaybackCommand::Seek { rev, .. } => *rev = new_rev,
        }
    }
}

// --- Grounded in the TS CorrId (types.ts:16-19) ----------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CorrId {
    pub member: String,
    pub seq: u64,
}

// --- Grounded in the TS PlaybackState (types.ts:23-33) ---------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub rev: u64,
    pub playing: bool,
    pub position_sec: f64,
    pub rate: f64,
    pub buffering: bool,
    pub ended: bool,
    pub anchor_at_ms: f64,
    pub updated_by: String,
    pub host_client_id: String,
}

// --- Grounded in the TS RoomMember (types.ts:49-54) ------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoomMember {
    pub client_id: String,
    pub name: String,
    pub is_host: bool,
    pub joined_at_ms: f64,
}

// --- Roles -----------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Host,
    Guest,
}

// --- client -> broker ------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum ClientMsg {
    #[serde(rename_all = "camelCase")]
    Join {
        room: RoomId,
        client_id: String,
        name: String,
    },
    #[serde(rename_all = "camelCase")]
    Leave { room: RoomId, client_id: String },
    #[serde(rename_all = "camelCase")]
    Cmd {
        room: RoomId,
        cmd: PlaybackCommand,
    },
    #[serde(rename_all = "camelCase")]
    State {
        room: RoomId,
        state: PlaybackState,
    },
    Ping {},
}

// --- broker -> client ------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum BrokerMsg {
    #[serde(rename_all = "camelCase")]
    Welcome {
        room: RoomId,
        client_id: String,
        role: Role,
        rev: u64,
        snapshot: Option<PlaybackState>,
        members: Vec<RoomMember>,
    },
    #[serde(rename_all = "camelCase")]
    MemberJoined { room: RoomId, member: RoomMember },
    #[serde(rename_all = "camelCase")]
    MemberLeft { room: RoomId, member: RoomMember },
    #[serde(rename_all = "camelCase")]
    HostChanged {
        room: RoomId,
        host_client_id: String,
    },
    #[serde(rename_all = "camelCase")]
    Cmd {
        room: RoomId,
        cmd: PlaybackCommand,
    },
    #[serde(rename_all = "camelCase")]
    State {
        room: RoomId,
        state: PlaybackState,
        rev: u64,
    },
    #[serde(rename_all = "camelCase")]
    Error { code: String, message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_join_roundtrips_camel_case() {
        let line = r#"{"t":"join","room":"vara-demo","clientId":"c1","name":"Alice"}"#;
        let msg: ClientMsg = serde_json::from_str(line).unwrap();
        match msg {
            ClientMsg::Join {
                room,
                client_id,
                name,
            } => {
                assert_eq!(room, "vara-demo");
                assert_eq!(client_id, "c1");
                assert_eq!(name, "Alice");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn cmd_seek_matches_ts_shape() {
        let line = r#"{"t":"cmd","room":"r","cmd":{"action":"seek","origin":"local","corr":{"member":"c1","seq":3},"rev":7,"atMs":123.0,"positionSeconds":42.5}}"#;
        let msg: ClientMsg = serde_json::from_str(line).unwrap();
        match msg {
            ClientMsg::Cmd { cmd, .. } => {
                assert_eq!(cmd.author(), "c1");
                assert_eq!(cmd.rev(), 7);
                match cmd {
                    PlaybackCommand::Seek {
                        position_seconds, ..
                    } => assert_eq!(position_seconds, 42.5),
                    _ => panic!("wrong action"),
                }
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn welcome_serializes_with_rev_and_role() {
        let msg = BrokerMsg::Welcome {
            room: "r".into(),
            client_id: "c1".into(),
            role: Role::Host,
            rev: 0,
            snapshot: None,
            members: vec![],
        };
        let s = serde_json::to_string(&msg).unwrap();
        assert!(s.contains(r#""t":"welcome""#));
        assert!(s.contains(r#""role":"host""#));
        assert!(s.contains(r#""clientId":"c1""#));
    }

    #[test]
    fn playback_state_field_names_mirror_ts() {
        let st = PlaybackState {
            rev: 1,
            playing: true,
            position_sec: 10.0,
            rate: 1.0,
            buffering: false,
            ended: false,
            anchor_at_ms: 999.0,
            updated_by: "c1".into(),
            host_client_id: "c1".into(),
        };
        let s = serde_json::to_string(&st).unwrap();
        for k in [
            "positionSec",
            "anchorAtMs",
            "updatedBy",
            "hostClientId",
        ] {
            assert!(s.contains(k), "missing {k} in {s}");
        }
    }
}
