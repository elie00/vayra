// VARA/VEYA sync-CLIENT living INSIDE the VAYRA app.
//
// This is a STATELESS bridge between the standalone broker process
// (`vayra-vara-broker`, see ../../vara-broker) and THIS app's frontend. It
// holds NO room authority: rooms, members, roles and the monotone rev all live
// in the broker. Here we only:
//
//   socket  ->  local Tauri events  'vayra://sync-*'  (this instance only)
//   Tauri commands  ->  JSONL frames written to the socket
//
// The wire NEVER carries a URL / file / media bytes — only playback INTENT
// (play / pause / seek / position) and membership metadata.
//
// Socket/retry patterns mirror src-tauri/src/multiview.rs. Transport is a Unix
// socket (macOS/Linux) or named pipe (Windows), JSONL framed (one JSON object
// per '\n' line, buffered line reader tolerant of partial reads).
//
// SOLO PLAYBACK IS UNAFFECTED: none of this runs unless the frontend calls
// `vayra_sync_join`. With no room, zero `vayra_sync_*` is invoked.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, Mutex};

// ---------------------------------------------------------------------------
// Wire protocol — mirrors ../../vara-broker/src/protocol.rs, which itself
// mirrors the TS sync contract (src/lib/together/sync/types.ts) so JS structs
// deserialize 1:1. Duplicated (not a cross-crate dep) so the client stays a
// self-contained bridge.
// ---------------------------------------------------------------------------

pub type RoomId = String;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CorrId {
    pub member: String,
    pub seq: u64,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoomMember {
    pub client_id: String,
    pub name: String,
    pub is_host: bool,
    pub joined_at_ms: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Host,
    Guest,
}

/// client -> broker frames.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    Cmd { room: RoomId, cmd: PlaybackCommand },
    #[serde(rename_all = "camelCase")]
    State { room: RoomId, state: PlaybackState },
    Ping {},
}

/// broker -> client frames.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    Cmd { room: RoomId, cmd: PlaybackCommand },
    #[serde(rename_all = "camelCase")]
    State {
        room: RoomId,
        state: PlaybackState,
        rev: u64,
    },
    #[serde(rename_all = "camelCase")]
    Error { code: String, message: String },
}

// ---------------------------------------------------------------------------
// Local Tauri event names — Rust of THIS instance -> frontend of the SAME
// instance only. NEW events use the vayra:// namespace.
// ---------------------------------------------------------------------------

const EV_CMD: &str = "vayra://sync-cmd";
const EV_STATE: &str = "vayra://sync-state";
const EV_WELCOME: &str = "vayra://sync-welcome";
const EV_MEMBERS: &str = "vayra://sync-members";
const EV_HOST: &str = "vayra://sync-host";
const EV_ERROR: &str = "vayra://sync-error";

// ---------------------------------------------------------------------------
// Transport path — mirrors ../../vara-broker/src/transport.rs.
// unix:    ${XDG_RUNTIME_DIR or TMPDIR or /tmp}/vayra-vara.sock
// windows: \\.\pipe\vayra-vara
// ---------------------------------------------------------------------------

#[cfg(not(windows))]
fn socket_path() -> PathBuf {
    let dir = std::env::var_os("XDG_RUNTIME_DIR")
        .or_else(|| std::env::var_os("TMPDIR"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    dir.join("vayra-vara.sock")
}

#[cfg(windows)]
fn socket_path() -> PathBuf {
    PathBuf::from(r"\\.\pipe\vayra-vara")
}

// ---------------------------------------------------------------------------
// Managed state — ONLY the outbound writer channel + a connect guard. This is
// NOT room authority: it is the socket write end and a flag so we open at most
// one connection at a time.
// ---------------------------------------------------------------------------

pub struct VaraClientState {
    /// Sender into the write loop; `Some` once connected, `None` when down.
    writer: Arc<Mutex<Option<mpsc::UnboundedSender<ClientMsg>>>>,
    /// Serializes connect attempts so join spam opens one socket, not many.
    connect_lock: Arc<Mutex<()>>,
}

impl VaraClientState {
    pub fn new() -> Self {
        Self {
            writer: Arc::new(Mutex::new(None)),
            connect_lock: Arc::new(Mutex::new(())),
        }
    }
}

impl Default for VaraClientState {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Broker binary discovery + detached spawn.
// ---------------------------------------------------------------------------

/// Resolve the `vayra-vara-broker` binary: alongside the current exe first
/// (release/bundle layout), else bare name so the OS resolves it via PATH
/// (dev / `cargo run` with the broker on PATH).
fn broker_binary() -> PathBuf {
    let name = if cfg!(windows) {
        "vayra-vara-broker.exe"
    } else {
        "vayra-vara-broker"
    };
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let cand = dir.join(name);
            if cand.exists() {
                return cand;
            }
        }
    }
    PathBuf::from(name)
}

/// Spawn the broker detached (fire-and-forget). The broker itself binds the
/// socket idempotently and exits 0 if one is already running, so a race here is
/// harmless. We do not track the child — it outlives us and idle-exits.
fn spawn_broker_detached() {
    let bin = broker_binary();
    let mut cmd = std::process::Command::new(bin);
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        cmd.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    }
    let _ = cmd.spawn();
}

// ---------------------------------------------------------------------------
// Connection: connect (spawning the broker + backoff retry if unreachable),
// then run read + write loops. Emits vayra://sync-error and clears the writer
// on close so solo playback is never impacted.
// ---------------------------------------------------------------------------

#[cfg(not(windows))]
async fn connect_stream(path: &std::path::Path) -> Option<tokio::net::UnixStream> {
    tokio::net::UnixStream::connect(path).await.ok()
}

#[cfg(windows)]
async fn connect_stream(path: &std::path::Path) -> Option<tokio::net::windows::named_pipe::NamedPipeClient> {
    use tokio::net::windows::named_pipe::ClientOptions;
    ClientOptions::new().open(path).ok()
}

/// Ensure a live connection to the broker exists, spawning it if needed. On
/// success installs the outbound writer into `state`. Idempotent: if a writer
/// is already present it returns early.
async fn ensure_connected(app: &AppHandle, state: &VaraClientState) -> Result<(), String> {
    let _guard = state.connect_lock.lock().await;
    {
        let w = state.writer.lock().await;
        if w.as_ref().map(|s| !s.is_closed()).unwrap_or(false) {
            return Ok(());
        }
    }

    let path = socket_path();

    // Try connect; if unreachable spawn the broker detached then retry with
    // backoff (mirrors multiview.rs' bounded retry loop).
    let mut stream = None;
    let mut spawned = false;
    for attempt in 0..20u32 {
        if let Some(s) = connect_stream(&path).await {
            stream = Some(s);
            break;
        }
        if !spawned {
            spawn_broker_detached();
            spawned = true;
        }
        // Linear-ish backoff, capped.
        let delay = Duration::from_millis(100 + (attempt as u64) * 50).min(Duration::from_millis(500));
        tokio::time::sleep(delay).await;
    }

    let stream = stream.ok_or_else(|| "vara: broker unreachable".to_string())?;

    let (read_half, write_half) = tokio::io::split(stream);
    let (tx, rx) = mpsc::unbounded_channel::<ClientMsg>();

    {
        let mut w = state.writer.lock().await;
        *w = Some(tx);
    }

    // Write loop: drain outbound ClientMsg into JSONL frames.
    tauri::async_runtime::spawn(write_loop(write_half, rx));

    // Read loop: parse BrokerMsg lines and fan them to local Tauri events. On
    // close it emits vayra://sync-error and clears the writer.
    let app = app.clone();
    let writer_slot = state.writer.clone();
    tauri::async_runtime::spawn(read_loop(read_half, app, writer_slot));

    Ok(())
}

async fn write_loop<W>(mut writer: W, mut rx: mpsc::UnboundedReceiver<ClientMsg>)
where
    W: AsyncWriteExt + Unpin,
{
    while let Some(msg) = rx.recv().await {
        let Ok(mut line) = serde_json::to_string(&msg) else {
            continue;
        };
        line.push('\n');
        if writer.write_all(line.as_bytes()).await.is_err() {
            break;
        }
        if writer.flush().await.is_err() {
            break;
        }
    }
}

async fn read_loop<R>(
    reader: R,
    app: AppHandle,
    writer_slot: Arc<Mutex<Option<mpsc::UnboundedSender<ClientMsg>>>>,
) where
    R: tokio::io::AsyncRead + Unpin,
{
    // BufReader::read_line reassembles partial reads across chunks.
    let mut buf = BufReader::new(reader);
    let mut line = String::new();
    loop {
        line.clear();
        match buf.read_line(&mut line).await {
            Ok(0) => break, // EOF — broker closed
            Ok(_) => {}
            Err(_) => break,
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(msg) = serde_json::from_str::<BrokerMsg>(trimmed) else {
            continue; // ignore malformed frames
        };
        emit_broker_msg(&app, msg);
    }

    // Socket closed. Clear the writer so a later join reconnects, and tell the
    // frontend. Solo playback is unaffected — this only signals the sync layer.
    {
        let mut w = writer_slot.lock().await;
        *w = None;
    }
    let _ = app.emit(
        EV_ERROR,
        serde_json::json!({ "code": "disconnected", "message": "broker connection closed" }),
    );
}

/// Fan a broker frame out to the matching local Tauri event.
fn emit_broker_msg(app: &AppHandle, msg: BrokerMsg) {
    match msg {
        BrokerMsg::Welcome { .. } => {
            let _ = app.emit(EV_WELCOME, msg);
        }
        BrokerMsg::MemberJoined { .. } | BrokerMsg::MemberLeft { .. } => {
            let _ = app.emit(EV_MEMBERS, msg);
        }
        BrokerMsg::HostChanged { .. } => {
            let _ = app.emit(EV_HOST, msg);
        }
        BrokerMsg::Cmd { .. } => {
            let _ = app.emit(EV_CMD, msg);
        }
        BrokerMsg::State { .. } => {
            let _ = app.emit(EV_STATE, msg);
        }
        BrokerMsg::Error { .. } => {
            let _ = app.emit(EV_ERROR, msg);
        }
    }
}

/// Send one frame, connecting first if needed. On write failure emits
/// vayra://sync-error and returns Err, leaving solo playback untouched.
async fn send_frame(app: &AppHandle, state: &VaraClientState, frame: ClientMsg) -> Result<(), String> {
    ensure_connected(app, state).await?;
    let sender = {
        let w = state.writer.lock().await;
        w.clone()
    };
    match sender {
        Some(tx) if tx.send(frame).is_ok() => Ok(()),
        _ => {
            let _ = app.emit(
                EV_ERROR,
                serde_json::json!({ "code": "send-failed", "message": "broker write channel closed" }),
            );
            Err("vara: broker write channel closed".into())
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri commands (desktop). clientId is passed in from the frontend, which
// derives/reuses it from the existing `together` clientId localStorage
// convention (single source of identity). We never invent authority here.
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn vayra_sync_join(
    app: AppHandle,
    state: State<'_, VaraClientState>,
    room: String,
    client_id: String,
    name: String,
) -> Result<(), String> {
    send_frame(
        &app,
        &state,
        ClientMsg::Join {
            room,
            client_id,
            name,
        },
    )
    .await
}

#[tauri::command]
pub async fn vayra_sync_leave(
    app: AppHandle,
    state: State<'_, VaraClientState>,
    room: String,
    client_id: String,
) -> Result<(), String> {
    // Best-effort: if we're not connected there's nothing to leave.
    let connected = {
        let w = state.writer.lock().await;
        w.as_ref().map(|s| !s.is_closed()).unwrap_or(false)
    };
    if !connected {
        return Ok(());
    }
    send_frame(&app, &state, ClientMsg::Leave { room, client_id }).await
}

#[tauri::command]
pub async fn vayra_sync_send(
    app: AppHandle,
    state: State<'_, VaraClientState>,
    room: String,
    cmd: PlaybackCommand,
) -> Result<(), String> {
    send_frame(&app, &state, ClientMsg::Cmd { room, cmd }).await
}

#[tauri::command]
pub async fn vayra_sync_publish(
    app: AppHandle,
    state: State<'_, VaraClientState>,
    room: String,
    state_payload: PlaybackState,
) -> Result<(), String> {
    send_frame(
        &app,
        &state,
        ClientMsg::State {
            room,
            state: state_payload,
        },
    )
    .await
}

// ---------------------------------------------------------------------------
// Tests: serialization round-trip of the socket frames <-> types, and
// disconnect handling (socket close -> error path, no panic).
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_cmd_frame_roundtrips_camel_case() {
        let frame = ClientMsg::Cmd {
            room: "vara-demo".into(),
            cmd: PlaybackCommand::Seek {
                origin: "local".into(),
                corr: CorrId {
                    member: "c1".into(),
                    seq: 3,
                },
                rev: 7,
                at_ms: 123.0,
                position_seconds: 42.5,
            },
        };
        let line = serde_json::to_string(&frame).unwrap();
        assert!(line.contains(r#""t":"cmd""#));
        assert!(line.contains(r#""action":"seek""#));
        assert!(line.contains(r#""positionSeconds":42.5"#));
        assert!(line.contains(r#""atMs":123.0"#));
        let back: ClientMsg = serde_json::from_str(&line).unwrap();
        assert_eq!(back, frame);
    }

    #[test]
    fn client_join_matches_broker_wire_shape() {
        // The exact line the broker's read_loop expects (protocol.rs test).
        let line = r#"{"t":"join","room":"r","clientId":"c1","name":"Alice"}"#;
        let msg: ClientMsg = serde_json::from_str(line).unwrap();
        assert_eq!(
            msg,
            ClientMsg::Join {
                room: "r".into(),
                client_id: "c1".into(),
                name: "Alice".into(),
            }
        );
    }

    #[test]
    fn client_state_frame_field_names_mirror_ts() {
        let frame = ClientMsg::State {
            room: "r".into(),
            state: PlaybackState {
                rev: 1,
                playing: true,
                position_sec: 10.0,
                rate: 1.0,
                buffering: false,
                ended: false,
                anchor_at_ms: 999.0,
                updated_by: "c1".into(),
                host_client_id: "c1".into(),
            },
        };
        let s = serde_json::to_string(&frame).unwrap();
        for k in ["positionSec", "anchorAtMs", "updatedBy", "hostClientId"] {
            assert!(s.contains(k), "missing {k} in {s}");
        }
    }

    #[test]
    fn broker_welcome_deserializes_from_wire() {
        // A welcome line as the broker serializes it.
        let line = r#"{"t":"welcome","room":"r","clientId":"c1","role":"host","rev":0,"snapshot":null,"members":[]}"#;
        let msg: BrokerMsg = serde_json::from_str(line).unwrap();
        match msg {
            BrokerMsg::Welcome {
                room,
                client_id,
                role,
                rev,
                snapshot,
                members,
            } => {
                assert_eq!(room, "r");
                assert_eq!(client_id, "c1");
                assert_eq!(role, Role::Host);
                assert_eq!(rev, 0);
                assert!(snapshot.is_none());
                assert!(members.is_empty());
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn broker_cmd_and_state_roundtrip() {
        let cmd = BrokerMsg::Cmd {
            room: "r".into(),
            cmd: PlaybackCommand::Play {
                origin: "remote".into(),
                corr: CorrId {
                    member: "c2".into(),
                    seq: 9,
                },
                rev: 4,
                at_ms: 1.0,
            },
        };
        let back: BrokerMsg = serde_json::from_str(&serde_json::to_string(&cmd).unwrap()).unwrap();
        assert_eq!(back, cmd);

        let st = BrokerMsg::State {
            room: "r".into(),
            rev: 5,
            state: PlaybackState {
                rev: 5,
                playing: false,
                position_sec: 3.0,
                rate: 1.0,
                buffering: false,
                ended: false,
                anchor_at_ms: 2.0,
                updated_by: "c2".into(),
                host_client_id: "c1".into(),
            },
        };
        let back: BrokerMsg = serde_json::from_str(&serde_json::to_string(&st).unwrap()).unwrap();
        assert_eq!(back, st);
    }

    #[test]
    fn malformed_broker_line_is_ignored_not_panicked() {
        // read_loop uses this exact parse; a bad line must be a silent skip.
        assert!(serde_json::from_str::<BrokerMsg>("not json").is_err());
        assert!(serde_json::from_str::<BrokerMsg>(r#"{"t":"nope"}"#).is_err());
    }

    // Disconnect handling: drive read_loop over an in-memory duplex whose write
    // end we drop (simulating the broker closing the socket). The loop must
    // exit cleanly, clear the writer slot, and NOT panic. We can't emit real
    // Tauri events without an AppHandle, so we exercise the pre-emit teardown
    // path directly via a small harness mirroring read_loop's cleanup.
    #[tokio::test]
    async fn disconnect_clears_writer_without_panic() {
        use tokio::io::AsyncWriteExt as _;

        let (mut client_end, broker_end) = tokio::io::duplex(1024);

        // A writer slot as if we were connected.
        let (tx, _rx) = mpsc::unbounded_channel::<ClientMsg>();
        let slot: Arc<Mutex<Option<mpsc::UnboundedSender<ClientMsg>>>> =
            Arc::new(Mutex::new(Some(tx)));

        // Read from the broker_end; write one valid frame then close.
        let slot2 = slot.clone();
        let reader = tokio::spawn(async move {
            let mut buf = BufReader::new(broker_end);
            let mut line = String::new();
            loop {
                line.clear();
                match buf.read_line(&mut line).await {
                    Ok(0) => break,
                    Ok(_) => {}
                    Err(_) => break,
                }
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                // Parse like read_loop; ignore malformed.
                let _ = serde_json::from_str::<BrokerMsg>(trimmed);
            }
            // Mirror read_loop teardown (minus the Tauri emit).
            let mut w = slot2.lock().await;
            *w = None;
        });

        // Send one welcome line, then drop the client end to close the socket.
        let line = br#"{"t":"welcome","room":"r","clientId":"c1","role":"guest","rev":0,"snapshot":null,"members":[]}"#;
        client_end.write_all(line).await.unwrap();
        client_end.write_all(b"\n").await.unwrap();
        client_end.flush().await.unwrap();
        drop(client_end);

        reader.await.unwrap();

        // Writer slot cleared on disconnect; no panic occurred.
        assert!(slot.lock().await.is_none());
    }
}
