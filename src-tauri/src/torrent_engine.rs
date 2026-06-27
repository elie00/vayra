mod cache_sweep;
mod dht_boot;
mod netcheck;
mod selftest;
mod stream_route;
mod trackers;

use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use librqbit::api::TorrentIdOrHash;
use librqbit::dht::{Dht, PersistentDhtConfig};
use librqbit::{AddTorrent, AddTorrentOptions, PeerConnectionOptions, Session, SessionOptions};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;
use tokio::time::timeout;

struct EngineState {
    session: Option<Arc<Session>>,
    side_dht: Option<Dht>,
    port: Option<u16>,
    dht_tier: u8,
    ready: bool,
    last_error: Option<String>,
    server: Option<tokio::task::JoinHandle<()>>,
}

fn engine() -> &'static Mutex<EngineState> {
    static S: OnceLock<Mutex<EngineState>> = OnceLock::new();
    S.get_or_init(|| {
        Mutex::new(EngineState {
            session: None,
            side_dht: None,
            port: None,
            dht_tier: 0,
            ready: false,
            last_error: None,
            server: None,
        })
    })
}

fn current_session() -> Option<Arc<Session>> {
    engine().lock().unwrap().session.clone()
}

fn current_side_dht() -> Option<Dht> {
    engine().lock().unwrap().side_dht.clone()
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
    dht_tier: u8,
    dht_nodes: usize,
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

async fn new_session(
    dir: &std::path::Path,
    full: bool,
    dht: bool,
    persist_dht: bool,
) -> Result<Arc<Session>, String> {
    Session::new_with_opts(
        dir.to_path_buf(),
        SessionOptions {
            fastresume: true,
            persistence: None,
            disable_dht: !dht,
            disable_dht_persistence: !persist_dht,
            dht_config: persist_dht.then(|| PersistentDhtConfig {
                config_filename: Some(dir.join("dht.json")),
                dump_interval: None,
            }),
            trackers: trackers::as_url_set(),
            listen_port_range: if full { Some(16881..16931) } else { None },
            enable_upnp_port_forwarding: full,
            ..Default::default()
        },
    )
    .await
    .map_err(|e| format!("{e:#}"))
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct EngineConfig {
    dir: Option<String>,
    retention_hours: Option<u64>,
}

fn config_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_cache_dir().ok().map(|d| d.join("engine.json"))
}

fn read_config(app: &AppHandle) -> EngineConfig {
    config_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<EngineConfig>(&s).ok())
        .unwrap_or_default()
}

fn engine_dir(app: &AppHandle, cfg: &EngineConfig) -> Result<std::path::PathBuf, String> {
    if let Some(custom) = cfg.dir.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        return Ok(std::path::PathBuf::from(custom).join("harbor-stream-cache"));
    }
    app.path()
        .app_cache_dir()
        .map_err(|e| e.to_string())
        .map(|d| d.join("engine"))
}

async fn init(app: AppHandle) -> Result<(), String> {
    std::env::set_var("DHT_QUERIES_PER_SECOND", "100");
    let cfg = read_config(&app);
    let dir = engine_dir(&app, &cfg)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    cache_sweep::run(&dir, cfg.retention_hours.unwrap_or(24));
    let (session, dht_tier) = match new_session(&dir, true, true, true).await {
        Ok(s) => (s, 1u8),
        Err(e1) => {
            eprintln!("[torrent-engine] tier1 (inbound + warm dht) unavailable ({e1}); trying no-inbound + warm dht");
            match new_session(&dir, false, true, true).await {
                Ok(s) => (s, 2u8),
                Err(e2) => {
                    eprintln!("[torrent-engine] tier2 unavailable ({e2}); trying cold ephemeral dht");
                    match new_session(&dir, false, true, false).await {
                        Ok(s) => (s, 3u8),
                        Err(e3) => {
                            eprintln!("[torrent-engine] tier3 (cold dht) unavailable ({e3}); starting without dht");
                            (new_session(&dir, false, false, false).await?, 4u8)
                        }
                    }
                }
            }
        }
    };
    let side_dht = dht_boot::build().await;
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
    st.side_dht = side_dht;
    st.port = Some(port);
    st.dht_tier = dht_tier;
    st.ready = true;
    st.last_error = None;
    st.server = Some(server);
    eprintln!("[torrent-engine] ready on 127.0.0.1:{port} (dht tier {dht_tier})");
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
    st.side_dht = None;
    st.port = None;
    st.dht_tier = 0;
    st.ready = false;
}

#[tauri::command]
pub fn torrent_engine_status() -> EngineStatusDto {
    let (port, ready, last_error, dht_tier) = {
        let st = engine().lock().unwrap();
        (st.port, st.ready, st.last_error.clone(), st.dht_tier)
    };
    let active_torrents = current_session()
        .map(|s| s.with_torrents(|t| t.count()))
        .unwrap_or(0);
    let dht_nodes = current_side_dht()
        .map(|d| dht_boot::node_count(&d))
        .unwrap_or(0);
    EngineStatusDto {
        ready,
        port,
        active_torrents,
        last_error,
        dht_tier,
        dht_nodes,
    }
}

fn merge_trackers(trackers: Vec<String>) -> Vec<String> {
    trackers::merge_into(trackers)
}

#[tauri::command]
pub async fn torrent_engine_add(
    app: AppHandle,
    magnet: String,
    trackers: Vec<String>,
) -> Result<AddResult, String> {
    let session = ensure_session(&app).await?;
    let seed = match current_side_dht() {
        Some(d) => dht_boot::seed_peers(&d, magnet.as_str(), 40, Duration::from_secs(3)).await,
        None => Vec::new(),
    };
    let opts = AddTorrentOptions {
        overwrite: true,
        paused: true,
        trackers: Some(merge_trackers(trackers)),
        initial_peers: (!seed.is_empty()).then_some(seed),
        peer_opts: Some(PeerConnectionOptions {
            connect_timeout: Some(Duration::from_secs(7)),
            read_write_timeout: Some(Duration::from_secs(10)),
            keep_alive_interval: None,
        }),
        force_tracker_interval: Some(Duration::from_secs(300)),
        ..Default::default()
    };
    let added = timeout(
        Duration::from_secs(60),
        session.add_torrent(AddTorrent::from_url(magnet.as_str()), Some(opts)),
    )
    .await
    .map_err(|_| "metadata timed out: no peers reached in 60s".to_string())?
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
    session.update_only_files(&handle, &only).await.map_err(|e| format!("{e:#}"))?;
    session.unpause(&handle).await.map_err(|e| format!("{e:#}"))?;
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
    tokio::time::sleep(Duration::from_millis(600)).await;
    init(app).await?;
    Ok(torrent_engine_status())
}

#[tauri::command]
pub async fn torrent_engine_hard_reset(app: AppHandle) -> Result<EngineStatusDto, String> {
    stop();
    tokio::time::sleep(Duration::from_millis(800)).await;
    let cfg = read_config(&app);
    if let Ok(dir) = engine_dir(&app, &cfg) {
        let _ = std::fs::remove_dir_all(&dir);
    }
    engine().lock().unwrap().last_error = None;
    init(app).await?;
    Ok(torrent_engine_status())
}

#[tauri::command]
pub async fn torrent_engine_set_options(
    app: AppHandle,
    dir: Option<String>,
    retention_hours: u64,
    restart: bool,
) -> Result<EngineStatusDto, String> {
    let cfg = EngineConfig {
        dir: dir.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        retention_hours: Some(retention_hours),
    };
    if let Some(p) = config_path(&app) {
        if let Some(parent) = p.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&p, serde_json::to_string(&cfg).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    }
    if restart {
        stop();
        tokio::time::sleep(Duration::from_millis(600)).await;
        init(app).await?;
    }
    Ok(torrent_engine_status())
}

#[tauri::command]
pub async fn torrent_engine_selftest(app: AppHandle) -> selftest::SelfTestResult {
    selftest::run(app).await
}
