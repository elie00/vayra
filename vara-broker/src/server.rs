// Server: bind the well-known socket idempotently, accept connections, run a
// read task (JSONL line reader tolerant of partial reads) + write task per
// client, and an idle-exit watchdog. Socket/retry patterns mirror
// src-tauri/src/multiview.rs.

use std::path::Path;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;

use crate::broker::Shared;
use crate::protocol::{BrokerMsg, ClientMsg};
use crate::transport::unlink_socket;

/// Idle-exit after this long with zero connected clients.
pub const IDLE_TIMEOUT: Duration = Duration::from_secs(30);

pub enum BindOutcome {
    Bound(Listener),
    AlreadyRunning,
    Failed(std::io::Error),
}

// ---------------------------------------------------------------------------
// Unix
// ---------------------------------------------------------------------------
#[cfg(not(windows))]
mod platform {
    use super::*;
    use tokio::net::{UnixListener, UnixStream};

    pub type Listener = UnixListener;
    pub type Stream = UnixStream;

    /// Idempotent bind. If a stale socket file is present but not connectable,
    /// unlink it and retry. If it IS connectable, another broker is running.
    pub async fn try_bind(path: &Path) -> BindOutcome {
        match UnixListener::bind(path) {
            Ok(l) => BindOutcome::Bound(l),
            Err(_) if path.exists() => {
                // Present already. Is a live broker answering?
                if UnixStream::connect(path).await.is_ok() {
                    return BindOutcome::AlreadyRunning;
                }
                // Stale socket: unlink and retry once.
                unlink_socket(path);
                match UnixListener::bind(path) {
                    Ok(l) => BindOutcome::Bound(l),
                    Err(e) => BindOutcome::Failed(e),
                }
            }
            Err(e) => BindOutcome::Failed(e),
        }
    }

    pub async fn accept(listener: &Listener) -> std::io::Result<Stream> {
        let (stream, _addr) = listener.accept().await?;
        Ok(stream)
    }
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
#[cfg(windows)]
mod platform {
    use super::*;
    use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeServer, ServerOptions};

    pub type Listener = WindowsPipeListener;
    pub type Stream = NamedPipeServer;

    pub struct WindowsPipeListener {
        path: std::path::PathBuf,
        next: Option<NamedPipeServer>,
    }

    pub async fn try_bind(path: &Path) -> BindOutcome {
        // If a client can connect, a broker is already serving.
        if ClientOptions::new().open(path).is_ok() {
            return BindOutcome::AlreadyRunning;
        }
        match ServerOptions::new()
            .first_pipe_instance(true)
            .create(path)
        {
            Ok(server) => BindOutcome::Bound(WindowsPipeListener {
                path: path.to_path_buf(),
                next: Some(server),
            }),
            Err(_) => {
                // first_pipe_instance failing means another instance exists.
                if ClientOptions::new().open(path).is_ok() {
                    BindOutcome::AlreadyRunning
                } else {
                    match ServerOptions::new().create(path) {
                        Ok(server) => BindOutcome::Bound(WindowsPipeListener {
                            path: path.to_path_buf(),
                            next: Some(server),
                        }),
                        Err(e) => BindOutcome::Failed(e),
                    }
                }
            }
        }
    }

    pub async fn accept(listener: &Listener) -> std::io::Result<Stream> {
        // NamedPipeServer accepts a single client; we take the current one and
        // pre-create the next instance for the following connection.
        //
        // Interior mutability would be cleaner, but the accept loop calls this
        // sequentially, so we reconstruct per call.
        let this = listener as *const Listener as *mut Listener;
        // SAFETY: the accept loop is single-threaded and does not alias.
        let listener = unsafe { &mut *this };
        let server = match listener.next.take() {
            Some(s) => s,
            None => ServerOptions::new().create(&listener.path)?,
        };
        server.connect().await?;
        listener.next = Some(ServerOptions::new().create(&listener.path)?);
        Ok(server)
    }
}

pub use platform::{accept, try_bind, Listener};

/// Run the accept loop with an idle-exit watchdog. Returns when idle-exit fires.
/// `path` is the bound socket, unlinked on shutdown.
pub async fn run(listener: Listener, path: std::path::PathBuf, shared: Shared, idle_timeout: Duration) {
    let watchdog = {
        let shared = shared.clone();
        tokio::spawn(async move { idle_watchdog(shared, idle_timeout).await })
    };

    loop {
        tokio::select! {
            accepted = accept(&listener) => {
                match accepted {
                    Ok(stream) => {
                        let shared = shared.clone();
                        tokio::spawn(handle_connection(stream, shared));
                    }
                    Err(_) => {
                        // Transient accept error; keep serving.
                        tokio::time::sleep(Duration::from_millis(50)).await;
                    }
                }
            }
            _ = wait_for_idle_exit(&watchdog) => {
                break;
            }
        }
    }

    // Best-effort unlink on shutdown.
    unlink_socket(&path);
}

async fn wait_for_idle_exit(handle: &tokio::task::JoinHandle<()>) {
    // The watchdog completes only on idle-exit. We can't await a &JoinHandle,
    // so poll its finished flag cheaply.
    loop {
        if handle.is_finished() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// Exit the accept loop once there have been zero clients for `idle_timeout`.
async fn idle_watchdog(shared: Shared, idle_timeout: Duration) {
    loop {
        if shared.client_count().await == 0 {
            // Wait for the timeout OR any activity that resets the clock.
            tokio::select! {
                _ = tokio::time::sleep(idle_timeout) => {
                    if shared.client_count().await == 0 {
                        return; // idle-exit
                    }
                }
                _ = shared.activity.notified() => {
                    // Activity: re-evaluate.
                }
            }
        } else {
            shared.activity.notified().await;
        }
    }
}

/// Per-connection: split the stream, run a write task draining an mpsc into the
/// socket (JSONL), and a read task parsing lines into ClientMsg.
pub async fn handle_connection<S>(stream: S, shared: Shared)
where
    S: AsyncRead + AsyncWrite + Send + 'static,
{
    let (read_half, write_half) = tokio::io::split(stream);

    let (tx, rx) = mpsc::unbounded_channel::<BrokerMsg>();
    // A client_id is assigned on first JOIN; until then use a placeholder so
    // the outbound channel is registered and disconnect cleanup can find it.
    let conn_id = format!("conn-{}", uuid_like());

    shared.register(conn_id.clone(), tx).await;

    let writer = tokio::spawn(write_loop(write_half, rx));
    // read_loop returns the effective clientId (real id after JOIN, else the
    // placeholder) so disconnect cleanup targets the right record.
    let effective_id = read_loop(read_half, shared.clone(), conn_id.clone()).await;

    // Read loop ended → client disconnected. Clean up (leave + host re-elect).
    shared.handle_leave(&effective_id).await;
    writer.abort();
}

async fn write_loop<W>(mut writer: W, mut rx: mpsc::UnboundedReceiver<BrokerMsg>)
where
    W: AsyncWrite + Unpin,
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

async fn read_loop<R>(reader: R, shared: Shared, conn_id: String) -> String
where
    R: AsyncRead + Unpin,
{
    // BufReader::read_line handles partial reads and reassembles across chunks.
    let mut buf = BufReader::new(reader);
    let mut line = String::new();
    // The JOIN maps this connection to a real clientId; we route by clientId so
    // the broker's identity is stable across the session.
    let mut client_id = conn_id.clone();
    let mut renamed = false;

    loop {
        line.clear();
        match buf.read_line(&mut line).await {
            Ok(0) => break, // EOF
            Ok(_) => {}
            Err(_) => break,
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(msg) = serde_json::from_str::<ClientMsg>(trimmed) else {
            continue; // ignore malformed frames
        };

        match msg {
            ClientMsg::Join {
                room,
                client_id: cid,
                name,
            } => {
                if !renamed {
                    // Re-key the connection from the placeholder to the real
                    // clientId so fan-out and disconnect cleanup use it.
                    shared.rekey_client(&conn_id, &cid).await;
                    client_id = cid.clone();
                    renamed = true;
                }
                shared.handle_join(&client_id, &room, name).await;
            }
            ClientMsg::Leave { room: _, client_id: _ } => {
                shared.handle_leave(&client_id).await;
                break;
            }
            ClientMsg::Cmd { room, cmd } => {
                shared.handle_cmd(&client_id, &room, cmd).await;
            }
            ClientMsg::State { room, state } => {
                shared.handle_state(&client_id, &room, state).await;
            }
            ClientMsg::Ping {} => { /* keep-alive; no reply required */ }
        }
    }
    client_id
}

/// Tiny unique-ish id without pulling in the uuid crate for the placeholder.
fn uuid_like() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(1);
    let n = N.fetch_add(1, Ordering::SeqCst);
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{t:x}-{n:x}")
}
