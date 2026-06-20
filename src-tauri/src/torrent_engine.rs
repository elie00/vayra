mod cache_sweep;
mod selftest;
mod stream_route;

use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use librqbit::api::TorrentIdOrHash;
use librqbit::{AddTorrent, AddTorrentOptions, Session, SessionOptions};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;
use tokio::time::timeout;

struct EngineState {
    session: Option<Arc<Session>>,
    port: Option<u16>,
    ready: bool,
    last_error: Option<String>,
    server: Option<tokio::task::JoinHandle<()>>,
}

fn engine() -> &'static Mutex<EngineState> {
    static S: OnceLock<Mutex<EngineState>> = OnceLock::new();
    S.get_or_init(|| {
        Mutex::new(EngineState {
            session: None,
            port: None,
            ready: false,
            last_error: None,
            server: None,
        })
    })
}

fn current_session() -> Option<Arc<Session>> {
    engine().lock().unwrap().session.clone()
}

fn current_port() -> Option<u16> {
    engine().lock().unwrap().port
}

#[derive(Serialize)]
pub struct EngineStatusDto {
    ready: bool,
    port: Option<u16>,
    active_torrents: usize,
    last_error: Option<String>,
}

#[derive(Serialize)]
pub struct EngineFile {
    idx: usize,
    name: String,
    length: u64,
}

#[derive(Serialize)]
pub struct AddResult {
    info_hash: String,
    files: Vec<EngineFile>,
    stream_base: String,
}

#[derive(Serialize)]
pub struct TorrentEngineStats {
    peers: usize,
    unchoked: usize,
    downloaded: u64,
    #[serde(rename = "downloadSpeed")]
    download_speed: u64,
    #[serde(rename = "streamProgress")]
    stream_progress: u64,
    #[serde(rename = "streamLen")]
    stream_len: u64,
    #[serde(rename = "peerSearchRunning")]
    peer_search_running: bool,
    finished: bool,
    state: String,
}

async fn init(app: AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("engine");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    cache_sweep::run(&dir, cache_sweep::CAP_BYTES);
    let session = match Session::new_with_opts(
        dir.clone(),
        SessionOptions {
            fastresume: true,
            persistence: None,
            disable_dht: false,
            listen_port_range: Some(6881..6891),
            enable_upnp_port_forwarding: true,
            ..Default::default()
        },
    )
    .await
    {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[torrent-engine] inbound listener unavailable ({e:#}); using outbound-only");
            Session::new_with_opts(
                dir,
                SessionOptions {
                    fastresume: true,
                    persistence: None,
                    disable_dht: false,
                    ..Default::default()
                },
            )
            .await
            .map_err(|e| format!("{e:#}"))?
        }
    };
    let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let router = stream_route::router(session.clone());
    let server = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("[torrent-engine] server error: {e}");
        }
    });
    let mut st = engine().lock().unwrap();
    if let Some(old) = st.server.take() {
        old.abort();
    }
    st.session = Some(session);
    st.port = Some(port);
    st.ready = true;
    st.last_error = None;
    st.server = Some(server);
    eprintln!("[torrent-engine] ready on 127.0.0.1:{port}");
    Ok(())
}

async fn ensure_session(app: &AppHandle) -> Result<Arc<Session>, String> {
    if let Some(s) = current_session() {
        return Ok(s);
    }
    init(app.clone()).await?;
    current_session().ok_or_else(|| "engine failed to initialize".to_string())
}

pub fn ensure_started_on_setup(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = init(app).await {
            eprintln!("[torrent-engine] init failed: {e}");
            let mut st = engine().lock().unwrap();
            st.ready = false;
            st.last_error = Some(e);
        }
    });
}

pub fn stop() {
    let mut st = engine().lock().unwrap();
    if let Some(server) = st.server.take() {
        server.abort();
    }
    st.session = None;
    st.port = None;
    st.ready = false;
}

#[tauri::command]
pub fn torrent_engine_status() -> EngineStatusDto {
    let (port, ready, last_error) = {
        let st = engine().lock().unwrap();
        (st.port, st.ready, st.last_error.clone())
    };
    let active_torrents = current_session()
        .map(|s| s.with_torrents(|t| t.count()))
        .unwrap_or(0);
    EngineStatusDto {
        ready,
        port,
        active_torrents,
        last_error,
    }
}

fn merge_trackers(mut trackers: Vec<String>) -> Vec<String> {
    for t in [
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://open.tracker.cl:1337/announce",
        "udp://tracker.openbittorrent.com:6969/announce",
        "udp://exodus.desync.com:6969/announce",
        "udp://tracker.torrent.eu.org:451/announce",
        "udp://open.demonii.com:1337/announce",
    ] {
        let s = t.to_string();
        if !trackers.contains(&s) {
            trackers.push(s);
        }
    }
    trackers
}

#[tauri::command]
pub async fn torrent_engine_add(
    app: AppHandle,
    magnet: String,
    trackers: Vec<String>,
) -> Result<AddResult, String> {
    let session = ensure_session(&app).await?;
    let opts = AddTorrentOptions {
        overwrite: true,
        trackers: Some(merge_trackers(trackers)),
        ..Default::default()
    };
    let added = timeout(
        Duration::from_secs(45),
        session.add_torrent(AddTorrent::from_url(magnet.as_str()), Some(opts)),
    )
    .await
    .map_err(|_| "metadata timed out: no peers reached in 45s".to_string())?
    .map_err(|e| format!("{e:#}"))?;
    let handle = added
        .into_handle()
        .ok_or_else(|| "torrent added as list-only".to_string())?;
    let info_hash = format!("{:?}", handle.info_hash());
    let files = handle
        .with_metadata(|m| {
            m.file_infos
                .iter()
                .enumerate()
                .map(|(idx, fi)| EngineFile {
                    idx,
                    name: fi
                        .relative_filename
                        .file_name()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| fi.relative_filename.to_string_lossy().to_string()),
                    length: fi.len,
                })
                .collect::<Vec<_>>()
        })
        .map_err(|e| format!("{e:#}"))?;
    timeout(Duration::from_secs(45), handle.wait_until_initialized())
        .await
        .map_err(|_| "torrent init timed out".to_string())?
        .map_err(|e| format!("{e:#}"))?;
    if let Some(idx) = files.iter().max_by_key(|f| f.length).map(|f| f.idx) {
        let only: HashSet<usize> = HashSet::from([idx]);
        if let Err(e) = session.update_only_files(&handle, &only).await {
            eprintln!("[torrent-engine] initial file narrowing failed: {e:#}");
        }
    }
    let port = current_port().ok_or_else(|| "engine port unavailable".to_string())?;
    Ok(AddResult {
        info_hash,
        files,
        stream_base: format!("http://127.0.0.1:{port}/stream"),
    })
}

#[tauri::command]
pub async fn torrent_engine_select(info_hash: String, file_idx: usize) -> Result<(), String> {
    let session = current_session().ok_or_else(|| "engine not ready".to_string())?;
    let id = TorrentIdOrHash::parse(&info_hash).map_err(|e| e.to_string())?;
    let handle = session.get(id).ok_or_else(|| "no torrent".to_string())?;
    let only: HashSet<usize> = HashSet::from([file_idx]);
    session
        .update_only_files(&handle, &only)
        .await
        .map_err(|e| format!("{e:#}"))?;
    Ok(())
}

#[tauri::command]
pub async fn torrent_engine_stats(
    info_hash: String,
    file_idx: Option<usize>,
) -> Result<TorrentEngineStats, String> {
    let session = current_session().ok_or_else(|| "engine not ready".to_string())?;
    let id = TorrentIdOrHash::parse(&info_hash).map_err(|e| e.to_string())?;
    let handle = session.get(id).ok_or_else(|| "no torrent".to_string())?;
    let s = handle.stats();
    let (peers, download_speed, peer_search_running) = match &s.live {
        Some(live) => (
            live.snapshot.peer_stats.live,
            (live.download_speed.mbps * 1024.0 * 1024.0) as u64,
            true,
        ),
        None => (0, 0, false),
    };
    let stream_progress = match file_idx {
        Some(i) => s.file_progress.get(i).copied().unwrap_or(s.progress_bytes),
        None => s.progress_bytes,
    };
    Ok(TorrentEngineStats {
        peers,
        unchoked: peers,
        downloaded: s.progress_bytes,
        download_speed,
        stream_progress,
        stream_len: s.total_bytes,
        peer_search_running,
        finished: s.finished,
        state: format!("{:?}", s.state),
    })
}

#[tauri::command]
pub async fn torrent_engine_remove(info_hash: String, delete_files: bool) -> Result<(), String> {
    let session = current_session().ok_or_else(|| "engine not ready".to_string())?;
    let id = TorrentIdOrHash::parse(&info_hash).map_err(|e| e.to_string())?;
    session
        .delete(id, delete_files)
        .await
        .map_err(|e| format!("{e:#}"))?;
    Ok(())
}

#[tauri::command]
pub async fn torrent_engine_restart(app: AppHandle) -> Result<EngineStatusDto, String> {
    stop();
    init(app).await?;
    Ok(torrent_engine_status())
}

#[tauri::command]
pub async fn torrent_engine_selftest(app: AppHandle) -> selftest::SelfTestResult {
    selftest::run(app).await
}
