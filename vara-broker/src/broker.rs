// Broker core: the SOLE authority for rooms, members, roles, monotone rev,
// snapshot retention and fan-out. No tauri, no media bytes.
//
// Concurrency model: a single shared `Shared` guarded by an async Mutex holds
// all room state and per-client outbound senders. Each accepted connection runs
// a read task that mutates `Shared` and pushes BrokerMsg into peers' mpsc
// channels; a matching write task drains that channel to the socket (JSONL).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use tokio::sync::{mpsc, Mutex};

use crate::protocol::{BrokerMsg, PlaybackCommand, PlaybackState, Role, RoomId, RoomMember};

/// Monotonic wall-clock-ish counter for deterministic join ordering in tests
/// and stable oldest-member re-election independent of system clock skew.
static JOIN_SEQ: AtomicU64 = AtomicU64::new(1);

fn next_join_seq() -> u64 {
    JOIN_SEQ.fetch_add(1, Ordering::SeqCst)
}

/// A connected client: its outbound channel + which room/identity it holds.
pub struct Client {
    pub client_id: String,
    pub name: String,
    pub room: Option<RoomId>,
    /// Broker-assigned join order; lowest = oldest (host re-election key).
    pub join_seq: u64,
    pub joined_at_ms: f64,
    pub tx: mpsc::UnboundedSender<BrokerMsg>,
}

pub struct Room {
    pub host: Option<String>, // clientId of host
    pub rev: u64,             // monotone; ++ on each accepted cmd/state
    pub snapshot: Option<PlaybackState>,
    pub members: Vec<String>, // clientIds, in join order
}

impl Room {
    fn new(_id: RoomId) -> Self {
        Self {
            host: None,
            rev: 0,
            snapshot: None,
            members: Vec::new(),
        }
    }

    fn bump_rev(&mut self) -> u64 {
        self.rev += 1;
        self.rev
    }
}

#[derive(Default)]
pub struct State {
    pub clients: HashMap<String, Client>, // keyed by clientId
    pub rooms: HashMap<RoomId, Room>,
}

/// Shared broker state, cheaply cloneable via Arc for each connection task.
#[derive(Clone)]
pub struct Shared {
    pub state: Arc<Mutex<State>>,
    /// Notified whenever the number of connected clients changes, so the
    /// idle-exit watchdog can re-evaluate promptly.
    pub activity: Arc<tokio::sync::Notify>,
}

impl Shared {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(State::default())),
            activity: Arc::new(tokio::sync::Notify::new()),
        }
    }

    pub async fn client_count(&self) -> usize {
        self.state.lock().await.clients.len()
    }

    /// Register a freshly accepted connection. Returns its assigned join_seq.
    pub async fn register(
        &self,
        client_id: String,
        tx: mpsc::UnboundedSender<BrokerMsg>,
    ) -> u64 {
        let seq = next_join_seq();
        let mut st = self.state.lock().await;
        st.clients.insert(
            client_id.clone(),
            Client {
                client_id,
                name: String::new(),
                room: None,
                join_seq: seq,
                joined_at_ms: seq as f64,
                tx,
            },
        );
        drop(st);
        self.activity.notify_waiters();
        seq
    }

    /// Re-key a connection from its placeholder id to the real clientId sent in
    /// JOIN. Preserves the outbound channel and join order. Idempotent if the
    /// key already matches.
    pub async fn rekey_client(&self, from: &str, to: &str) {
        if from == to {
            return;
        }
        let mut st = self.state.lock().await;
        if let Some(mut client) = st.clients.remove(from) {
            client.client_id = to.to_string();
            st.clients.insert(to.to_string(), client);
        }
    }

    /// A JOIN: attach client to a room, elect host atomically if first, reply
    /// welcome, and broadcast member-joined to existing peers.
    pub async fn handle_join(&self, client_id: &str, room_id: &str, name: String) {
        let mut st = self.state.lock().await;

        // Update the client's identity/room.
        let (join_seq, joined_at_ms) = {
            let Some(c) = st.clients.get_mut(client_id) else {
                return;
            };
            c.name = name.clone();
            c.room = Some(room_id.to_string());
            (c.join_seq, c.joined_at_ms)
        };

        // Room created on first join; first joiner becomes host atomically
        // (whole op under the single state lock).
        let room = st
            .rooms
            .entry(room_id.to_string())
            .or_insert_with(|| Room::new(room_id.to_string()));
        if !room.members.iter().any(|m| m == client_id) {
            room.members.push(client_id.to_string());
        }
        let is_host = if room.host.is_none() {
            room.host = Some(client_id.to_string());
            true
        } else {
            room.host.as_deref() == Some(client_id)
        };
        let rev = room.rev;
        let snapshot = room.snapshot.clone();
        let member_ids = room.members.clone();
        let host_id = room.host.clone();

        // Build the members list (needs client metadata → borrow clients).
        let members = self.members_of(&st, &member_ids, host_id.as_deref());

        let welcome = BrokerMsg::Welcome {
            room: room_id.to_string(),
            client_id: client_id.to_string(),
            role: if is_host { Role::Host } else { Role::Guest },
            rev,
            snapshot,
            members: members.clone(),
        };

        // Send welcome to the joiner.
        if let Some(c) = st.clients.get(client_id) {
            let _ = c.tx.send(welcome);
        }

        // Broadcast member-joined to everyone else in the room.
        let joined_member = RoomMember {
            client_id: client_id.to_string(),
            name,
            is_host,
            joined_at_ms,
        };
        let _ = join_seq; // ordering already reflected in members list
        for mid in &member_ids {
            if mid == client_id {
                continue;
            }
            if let Some(c) = st.clients.get(mid) {
                let _ = c.tx.send(BrokerMsg::MemberJoined {
                    room: room_id.to_string(),
                    member: joined_member.clone(),
                });
            }
        }
        drop(st);
        self.activity.notify_waiters();
    }

    /// Host-only playback command: stamp rev, fan out to all EXCEPT the author.
    pub async fn handle_cmd(&self, client_id: &str, room_id: &str, mut cmd: PlaybackCommand) {
        let mut st = self.state.lock().await;
        let Some(room) = st.rooms.get_mut(room_id) else {
            self.send_error(&st, client_id, "no_room", "room does not exist");
            return;
        };
        if room.host.as_deref() != Some(client_id) {
            self.send_error(&st, client_id, "not_host", "host-only command");
            return;
        }
        let author = cmd.author().to_string();
        let rev = room.bump_rev();
        cmd.set_rev(rev);
        let members = room.members.clone();

        for mid in &members {
            if mid == &author {
                continue; // fan-out excludes the author
            }
            if let Some(c) = st.clients.get(mid) {
                let _ = c.tx.send(BrokerMsg::Cmd {
                    room: room_id.to_string(),
                    cmd: cmd.clone(),
                });
            }
        }
    }

    /// A state heartbeat/snapshot: stamp rev, retain as snapshot, fan out to
    /// all EXCEPT the author (state.updatedBy).
    pub async fn handle_state(&self, client_id: &str, room_id: &str, mut state: PlaybackState) {
        let mut st = self.state.lock().await;
        let Some(room) = st.rooms.get_mut(room_id) else {
            self.send_error(&st, client_id, "no_room", "room does not exist");
            return;
        };
        let rev = room.bump_rev();
        state.rev = rev;
        room.snapshot = Some(state.clone());
        let author = state.updated_by.clone();
        let members = room.members.clone();

        for mid in &members {
            if mid == &author {
                continue;
            }
            if let Some(c) = st.clients.get(mid) {
                let _ = c.tx.send(BrokerMsg::State {
                    room: room_id.to_string(),
                    state: state.clone(),
                    rev,
                });
            }
        }
    }

    /// A LEAVE or disconnect: remove from room, re-elect host if needed,
    /// broadcast member-left / host-changed, drop room when empty.
    pub async fn handle_leave(&self, client_id: &str) {
        let mut st = self.state.lock().await;

        let room_id = match st.clients.get(client_id).and_then(|c| c.room.clone()) {
            Some(r) => r,
            None => {
                // Not in a room; just drop the client record.
                st.clients.remove(client_id);
                drop(st);
                self.activity.notify_waiters();
                return;
            }
        };

        // Snapshot join_seqs before mutably borrowing the room, so host
        // re-election can't overlap an immutable + mutable borrow of `st`.
        let seq_of: HashMap<String, u64> = st
            .clients
            .values()
            .map(|c| (c.client_id.clone(), c.join_seq))
            .collect();

        let (left_member, new_host, remaining) = {
            let Some(room) = st.rooms.get_mut(&room_id) else {
                st.clients.remove(client_id);
                drop(st);
                self.activity.notify_waiters();
                return;
            };
            room.members.retain(|m| m != client_id);
            let was_host = room.host.as_deref() == Some(client_id);

            // Re-elect the OLDEST remaining member (lowest join_seq).
            let mut new_host = None;
            if was_host {
                room.host = None;
                let oldest = room
                    .members
                    .iter()
                    .filter_map(|mid| seq_of.get(mid).map(|seq| (*seq, mid.clone())))
                    .min_by_key(|(seq, _)| *seq)
                    .map(|(_, mid)| mid);
                if let Some(h) = oldest {
                    room.host = Some(h.clone());
                    new_host = Some(h);
                }
            }
            let remaining = room.members.clone();
            (client_id.to_string(), new_host, remaining)
        };

        // Build the leaving member payload from the (still present) client rec.
        let leaving_payload = st.clients.get(&left_member).map(|c| RoomMember {
            client_id: c.client_id.clone(),
            name: c.name.clone(),
            is_host: false,
            joined_at_ms: c.joined_at_ms,
        });

        // Now remove the client record.
        st.clients.remove(client_id);

        // Broadcast member-left to remaining members.
        if let Some(member) = leaving_payload {
            for mid in &remaining {
                if let Some(c) = st.clients.get(mid) {
                    let _ = c.tx.send(BrokerMsg::MemberLeft {
                        room: room_id.clone(),
                        member: member.clone(),
                    });
                }
            }
        }

        // Broadcast host-changed (rev continuity: rev is untouched by election).
        if let Some(ref host_id) = new_host {
            for mid in &remaining {
                if let Some(c) = st.clients.get(mid) {
                    let _ = c.tx.send(BrokerMsg::HostChanged {
                        room: room_id.clone(),
                        host_client_id: host_id.clone(),
                    });
                }
            }
        }

        // Drop room + snapshot when the last client leaves.
        if remaining.is_empty() {
            st.rooms.remove(&room_id);
        }

        drop(st);
        self.activity.notify_waiters();
    }

    // --- helpers ---------------------------------------------------------

    fn members_of(
        &self,
        st: &State,
        ids: &[String],
        host_id: Option<&str>,
    ) -> Vec<RoomMember> {
        ids.iter()
            .filter_map(|id| st.clients.get(id))
            .map(|c| RoomMember {
                client_id: c.client_id.clone(),
                name: c.name.clone(),
                is_host: host_id == Some(c.client_id.as_str()),
                joined_at_ms: c.joined_at_ms,
            })
            .collect()
    }

    fn send_error(&self, st: &State, client_id: &str, code: &str, message: &str) {
        if let Some(c) = st.clients.get(client_id) {
            let _ = c.tx.send(BrokerMsg::Error {
                code: code.to_string(),
                message: message.to_string(),
            });
        }
    }
}

impl Default for Shared {
    fn default() -> Self {
        Self::new()
    }
}
