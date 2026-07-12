// Integration tests: drive mock in-process socket clients against a real
// broker over a Unix socket, WITHOUT any frontend. Verifies host election,
// snapshot/rev on join, author-excluded fan-out, monotone rev, host
// re-election on disconnect, idle-exit socket unlink, and stale-socket cleanup.
//
// Unix-only harness (uses UnixStream directly); the broker logic it exercises
// is cross-platform.
#![cfg(unix)]

use std::path::PathBuf;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;

use vara_broker::server::{self, BindOutcome};

/// A mock client speaking JSONL over a Unix socket.
struct MockClient {
    writer: tokio::net::unix::OwnedWriteHalf,
    reader: BufReader<tokio::net::unix::OwnedReadHalf>,
}

impl MockClient {
    async fn connect(path: &PathBuf) -> Self {
        let stream = UnixStream::connect(path).await.expect("connect");
        let (r, w) = stream.into_split();
        Self {
            writer: w,
            reader: BufReader::new(r),
        }
    }

    async fn send(&mut self, line: &str) {
        self.writer.write_all(line.as_bytes()).await.unwrap();
        self.writer.write_all(b"\n").await.unwrap();
        self.writer.flush().await.unwrap();
    }

    async fn join(&mut self, room: &str, client_id: &str, name: &str) {
        self.send(&format!(
            r#"{{"t":"join","room":"{room}","clientId":"{client_id}","name":"{name}"}}"#
        ))
        .await;
    }

    /// Read one JSONL frame, or None on timeout/EOF.
    async fn recv(&mut self) -> Option<serde_json::Value> {
        let mut line = String::new();
        let read =
            tokio::time::timeout(Duration::from_secs(2), self.reader.read_line(&mut line)).await;
        match read {
            Ok(Ok(0)) => None,
            Ok(Ok(_)) => serde_json::from_str(line.trim()).ok(),
            _ => None,
        }
    }

    /// Read until a frame with the given `t` value arrives (skips others).
    async fn recv_t(&mut self, t: &str) -> Option<serde_json::Value> {
        for _ in 0..10 {
            let v = self.recv().await?;
            if v.get("t").and_then(|x| x.as_str()) == Some(t) {
                return Some(v);
            }
        }
        None
    }
}

/// Bind a broker at a unique temp path and spawn its accept loop. Returns the
/// path and a handle to the run task.
async fn spawn_broker(idle: Duration) -> (PathBuf, tokio::task::JoinHandle<()>) {
    let dir = std::env::temp_dir();
    let path = dir.join(format!(
        "vayra-vara-test-{}-{}.sock",
        std::process::id(),
        unique()
    ));
    let _ = std::fs::remove_file(&path);
    let listener = match server::try_bind(&path).await {
        BindOutcome::Bound(l) => l,
        _ => panic!("bind failed"),
    };
    let shared = vara_broker::broker::Shared::new();
    let p = path.clone();
    let handle = tokio::spawn(async move { server::run(listener, p, shared, idle).await });
    // Give the accept loop a moment to start.
    tokio::time::sleep(Duration::from_millis(50)).await;
    (path, handle)
}

fn unique() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(1);
    N.fetch_add(1, Ordering::SeqCst)
}

#[tokio::test]
async fn first_joiner_becomes_host_atomically() {
    let (path, _h) = spawn_broker(Duration::from_secs(30)).await;

    let mut host = MockClient::connect(&path).await;
    host.join("r", "c1", "Alice").await;
    let w = host.recv_t("welcome").await.expect("welcome");
    assert_eq!(w["role"], "host");
    assert_eq!(w["clientId"], "c1");

    let mut guest = MockClient::connect(&path).await;
    guest.join("r", "c2", "Bob").await;
    let w2 = guest.recv_t("welcome").await.expect("welcome2");
    assert_eq!(w2["role"], "guest");

    // Host is told about the new member.
    let mj = host.recv_t("memberJoined").await.expect("memberJoined");
    assert_eq!(mj["member"]["clientId"], "c2");
}

#[tokio::test]
async fn join_returns_snapshot_with_max_rev() {
    let (path, _h) = spawn_broker(Duration::from_secs(30)).await;

    let mut host = MockClient::connect(&path).await;
    host.join("r", "c1", "Alice").await;
    host.recv_t("welcome").await.unwrap();

    // Host publishes two states → rev must advance monotonically.
    host.send(r#"{"t":"state","room":"r","state":{"rev":0,"playing":true,"positionSec":5.0,"rate":1.0,"buffering":false,"ended":false,"anchorAtMs":100.0,"updatedBy":"c1","hostClientId":"c1"}}"#).await;
    host.send(r#"{"t":"state","room":"r","state":{"rev":0,"playing":true,"positionSec":12.0,"rate":1.0,"buffering":false,"ended":false,"anchorAtMs":200.0,"updatedBy":"c1","hostClientId":"c1"}}"#).await;

    // Late joiner gets the retained snapshot with the max rev seen.
    tokio::time::sleep(Duration::from_millis(80)).await;
    let mut late = MockClient::connect(&path).await;
    late.join("r", "c2", "Bob").await;
    let w = late.recv_t("welcome").await.expect("welcome");
    let snap = &w["snapshot"];
    assert!(!snap.is_null(), "snapshot should be present");
    assert_eq!(snap["positionSec"], 12.0);
    // Two state messages ⇒ rev == 2, and welcome.rev matches room rev.
    assert_eq!(w["rev"], 2);
    assert_eq!(snap["rev"], 2);
}

#[tokio::test]
async fn fanout_excludes_the_author() {
    let (path, _h) = spawn_broker(Duration::from_secs(30)).await;

    let mut host = MockClient::connect(&path).await;
    host.join("r", "c1", "Alice").await;
    host.recv_t("welcome").await.unwrap();

    let mut guest = MockClient::connect(&path).await;
    guest.join("r", "c2", "Bob").await;
    guest.recv_t("welcome").await.unwrap();
    host.recv_t("memberJoined").await.unwrap();

    // Host issues a seek command (host-only). corr.member = c1 (author).
    host.send(r#"{"t":"cmd","room":"r","cmd":{"action":"seek","origin":"local","corr":{"member":"c1","seq":1},"rev":0,"atMs":10.0,"positionSeconds":30.0}}"#).await;

    // Guest receives it; author (host) does NOT.
    let g = guest.recv_t("cmd").await.expect("guest gets cmd");
    assert_eq!(g["cmd"]["action"], "seek");
    assert_eq!(g["cmd"]["positionSeconds"], 30.0);
    // Broker stamped rev = 1.
    assert_eq!(g["cmd"]["rev"], 1);

    // The author must not receive its own command back.
    let echo = host.recv_t("cmd").await;
    assert!(echo.is_none(), "author must not receive its own cmd");
}

#[tokio::test]
async fn rev_is_monotone_across_cmd_and_state() {
    let (path, _h) = spawn_broker(Duration::from_secs(30)).await;

    let mut host = MockClient::connect(&path).await;
    host.join("r", "c1", "Alice").await;
    host.recv_t("welcome").await.unwrap();

    let mut guest = MockClient::connect(&path).await;
    guest.join("r", "c2", "Bob").await;
    guest.recv_t("welcome").await.unwrap();
    host.recv_t("memberJoined").await.unwrap();

    // Interleave cmd + state from the host; rev must strictly increase.
    host.send(r#"{"t":"cmd","room":"r","cmd":{"action":"play","origin":"local","corr":{"member":"c1","seq":1},"rev":0,"atMs":1.0}}"#).await;
    let a = guest.recv_t("cmd").await.unwrap();
    host.send(r#"{"t":"state","room":"r","state":{"rev":0,"playing":true,"positionSec":1.0,"rate":1.0,"buffering":false,"ended":false,"anchorAtMs":2.0,"updatedBy":"c1","hostClientId":"c1"}}"#).await;
    let b = guest.recv_t("state").await.unwrap();
    host.send(r#"{"t":"cmd","room":"r","cmd":{"action":"pause","origin":"local","corr":{"member":"c1","seq":2},"rev":0,"atMs":3.0}}"#).await;
    let c = guest.recv_t("cmd").await.unwrap();

    let ra = a["cmd"]["rev"].as_u64().unwrap();
    let rb = b["rev"].as_u64().unwrap();
    let rc = c["cmd"]["rev"].as_u64().unwrap();
    assert!(ra < rb && rb < rc, "rev must be monotone: {ra} {rb} {rc}");
}

#[tokio::test]
async fn host_disconnect_reelects_oldest_remaining_member() {
    let (path, _h) = spawn_broker(Duration::from_secs(30)).await;

    let mut host = MockClient::connect(&path).await;
    host.join("r", "c1", "Alice").await;
    host.recv_t("welcome").await.unwrap();

    // c2 joins before c3 → c2 is the oldest remaining after host leaves.
    let mut g2 = MockClient::connect(&path).await;
    g2.join("r", "c2", "Bob").await;
    g2.recv_t("welcome").await.unwrap();
    host.recv_t("memberJoined").await.unwrap();

    let mut g3 = MockClient::connect(&path).await;
    g3.join("r", "c3", "Carol").await;
    g3.recv_t("welcome").await.unwrap();
    host.recv_t("memberJoined").await.unwrap();
    g2.recv_t("memberJoined").await.unwrap();

    // Host disconnects (drop the socket).
    drop(host);

    // g2 (oldest remaining) is promoted; both remaining are told.
    let hc = g2.recv_t("hostChanged").await.expect("g2 host-changed");
    assert_eq!(hc["hostClientId"], "c2");
    let hc3 = g3.recv_t("hostChanged").await.expect("g3 host-changed");
    assert_eq!(hc3["hostClientId"], "c2");
}

#[tokio::test]
async fn idle_exit_unlinks_the_socket() {
    // Short idle timeout; no clients ever connect.
    let (path, handle) = spawn_broker(Duration::from_millis(300)).await;
    assert!(path.exists(), "socket should exist while running");

    // Wait for idle-exit to fire and the run task to finish.
    let _ = tokio::time::timeout(Duration::from_secs(5), handle).await;
    assert!(
        !path.exists(),
        "socket must be unlinked after idle-exit"
    );
}

#[tokio::test]
async fn stale_socket_cleanup_allows_rebind() {
    // Create a stale socket FILE that is not a live listener.
    let dir = std::env::temp_dir();
    let path = dir.join(format!(
        "vayra-vara-stale-{}-{}.sock",
        std::process::id(),
        unique()
    ));
    // A plain file at the path simulates a leftover socket that is
    // present-but-unconnectable.
    std::fs::write(&path, b"stale").unwrap();
    assert!(path.exists());

    // try_bind must detect it as unconnectable, unlink, and rebind.
    match server::try_bind(&path).await {
        BindOutcome::Bound(_l) => { /* rebind succeeded */ }
        BindOutcome::AlreadyRunning => panic!("stale file wrongly seen as running"),
        BindOutcome::Failed(e) => panic!("bind failed after stale cleanup: {e}"),
    }
    let _ = std::fs::remove_file(&path);
}

#[tokio::test]
async fn second_bind_detects_already_running() {
    let (path, _h) = spawn_broker(Duration::from_secs(30)).await;
    // A client keeps the broker alive.
    let mut _c = MockClient::connect(&path).await;
    _c.join("r", "c1", "Alice").await;
    _c.recv_t("welcome").await.unwrap();

    // A second bind attempt at the same live path must report AlreadyRunning.
    match server::try_bind(&path).await {
        BindOutcome::AlreadyRunning => {}
        BindOutcome::Bound(_) => panic!("should not rebind a live socket"),
        BindOutcome::Failed(e) => panic!("unexpected failure: {e}"),
    }
}

#[tokio::test]
async fn room_dropped_when_last_client_leaves() {
    let (path, _h) = spawn_broker(Duration::from_secs(30)).await;

    let mut host = MockClient::connect(&path).await;
    host.join("r", "c1", "Alice").await;
    host.recv_t("welcome").await.unwrap();
    host.send(r#"{"t":"state","room":"r","state":{"rev":0,"playing":true,"positionSec":9.0,"rate":1.0,"buffering":false,"ended":false,"anchorAtMs":1.0,"updatedBy":"c1","hostClientId":"c1"}}"#).await;
    tokio::time::sleep(Duration::from_millis(60)).await;

    // Last client leaves → room + snapshot dropped.
    drop(host);
    tokio::time::sleep(Duration::from_millis(80)).await;

    // A fresh joiner to the same room id becomes host again with NO snapshot.
    let mut fresh = MockClient::connect(&path).await;
    fresh.join("r", "c9", "Zed").await;
    let w = fresh.recv_t("welcome").await.expect("welcome");
    assert_eq!(w["role"], "host", "room was dropped, new client is host");
    assert!(w["snapshot"].is_null(), "snapshot dropped with the room");
    assert_eq!(w["rev"], 0, "rev reset with the room");
}
