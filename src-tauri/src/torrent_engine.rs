mod cache_index;
mod cache_sweep;
mod dht_boot;
mod firewall;
mod nat_pmp;
mod netcheck;
mod peer_log;
mod persistence;
pub mod port_status;
mod selftest;
mod stream_route;
mod trackers;

use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, UNIX_EPOCH};

use librqbit::api::TorrentIdOrHash;
use librqbit::dht::{Dht, DhtPersistenceConfig};
use librqbit::{
    AddTorrent, AddTorrentOptions, ConnectionOptions, DhtSessionConfig, ListenerOptions, PeerConnectionOptions, Session,
    SessionOptions, SessionPersistenceConfig,
};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;
use tokio::time::timeout;

struct EngineState {
    session: Option<Arc<Session>>,
    dir: Option<PathBuf>,
    side_dht: Option<Dht>,
    port: Option<u16>,
    dht_tier: u8,
    ready: bool,
    last_error: Option<String>,
    server: Option<tokio::task::JoinHandle<()>>,
    sweeper: Option<tokio::task::JoinHandle<()>>,
    peer_log: Option<tokio::task::JoinHandle<()>>,
    nat_pmp: Option<tokio::task::JoinHandle<()>>,
    lan_server: Option<tokio::task::JoinHandle<()>>,
    lan_port: Option<u16>,
    lan_error: Option<String>,
}

fn engine() -> &'static Mutex<EngineState> {
    static S: OnceLock<Mutex<EngineState>> = OnceLock::new();
    S.get_or_init(|| {
        Mutex::new(EngineState {
            session: None,
            dir: None,
            side_dht: None,
            port: None,
            dht_tier: 0,
            ready: false,
            last_error: None,
            server: None,
            sweeper: None,
            peer_log: None,
            nat_pmp: None,
            lan_server: None,
            lan_port: None,
            lan_error: None,
        })
    })
}

pub const LAN_SERVER_PORT: u16 = 11470;

/// Files a save is holding open on a torrent, keyed by info hash. Streaming narrows a
/// torrent down to the one file being watched, so without this, playing an episode out
/// of a season pack would deselect every other episode still being saved from it, and
/// those downloads would stall with no error to show for it.
fn saved_files() -> &'static Mutex<HashMap<String, HashSet<usize>>> {
    static S: OnceLock<Mutex<HashMap<String, HashSet<usize>>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(HashMap::new()))
}

fn hash_key(info_hash: &str) -> String {
    info_hash.trim().to_ascii_lowercase()
}

fn remember_saved(info_hash: &str, idxs: &[usize]) {
    let mut map = saved_files().lock().unwrap();
    map.entry(hash_key(info_hash)).or_default().extend(idxs.iter().copied());
}

fn forget_saved(info_hash: &str, idxs: &[usize]) {
    let mut map = saved_files().lock().unwrap();
    let key = hash_key(info_hash);
    let Some(set) = map.get_mut(&key) else { return };
    for idx in idxs {
        set.remove(idx);
    }
    if set.is_empty() {
        map.remove(&key);
    }
}

/// What the torrent should be downloading: whatever a save is holding, plus the file
/// being streamed right now.
fn wanted_files(info_hash: &str, stream_idx: Option<usize>) -> HashSet<usize> {
    let mut wanted = saved_files()
        .lock()
        .unwrap()
        .get(&hash_key(info_hash))
        .cloned()
        .unwrap_or_default();
    if let Some(idx) = stream_idx {
        wanted.insert(idx);
    }
    wanted
}

const CACHE_SWEEP_INTERVAL_SECS: u64 = 30;

fn spawn_cache_sweeper(app: AppHandle) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(CACHE_SWEEP_INTERVAL_SECS)).await;
            let cfg = read_config(&app);
            let Ok(dir) = engine_dir(&app, &cfg) else { continue };
            let retention = cfg.retention_hours.unwrap_or(24);
            let max_gb = cfg.max_gb.unwrap_or(0);
            let _ = tokio::task::spawn_blocking(move || {
                // Record what finished before the sweep can take it, then forget what it took.
                let complete = current_session().map(|s| complete_files(&s)).unwrap_or_default();
                cache_index::update(&dir, complete);
                cache_sweep::run(&dir, retention, max_gb);
                cache_index::update(&dir, Vec::new());
            })
            .await;
        }
    })
}

fn current_session() -> Option<Arc<Session>> {
    engine().lock().unwrap().session.clone()
}

fn current_dir() -> Option<PathBuf> {
    engine().lock().unwrap().dir.clone()
}

/// The files of a torrent that are complete on disk, as the cache index records them.
fn complete_files_of(handle: &librqbit::ManagedTorrent) -> Vec<cache_index::CachedFile> {
    let progress = handle.stats().file_progress;
    let info_hash = handle.info_hash().as_string();
    handle
        .with_metadata(|m| {
            // librqbit saves a multi-file torrent in a folder named after it.
            let folder = match (m.file_infos.len() > 1, m.info.name()) {
                (false, _) => PathBuf::new(),
                (true, Some(name)) if !name.is_empty() => PathBuf::from(name.as_ref()),
                (true, _) => return Vec::new(),
            };
            m.file_infos
                .iter()
                .enumerate()
                .filter(|(i, fi)| !fi.attrs.padding && fi.len > 0 && progress.get(*i) == Some(&fi.len))
                .map(|(i, fi)| cache_index::CachedFile {
                    info_hash: info_hash.clone(),
                    file_idx: i,
                    path: folder.join(&fi.relative_filename),
                    len: fi.len,
                    inode: 0,
                })
                .collect()
        })
        .unwrap_or_default()
}

fn complete_files(session: &Session) -> Vec<cache_index::CachedFile> {
    session.with_torrents(|torrents| torrents.flat_map(|(_, h)| complete_files_of(h)).collect())
}

/// Bring the index up to date with the running torrents and return the cache's files.
fn refresh_cache_index() -> Option<(PathBuf, Vec<cache_index::CachedFile>)> {
    let dir = current_dir()?;
    let complete = current_session().map(|s| complete_files(&s)).unwrap_or_default();
    let files = cache_index::update(&dir, complete);
    Some((dir, files))
}

fn cached_file(info_hash: &str, file_idx: usize) -> Option<PathBuf> {
    let (dir, files) = refresh_cache_index()?;
    cache_index::lookup(&dir, &files, info_hash, file_idx)
}

/// The torrent file a local engine stream URL serves.
fn parse_stream_url(url: &str) -> Option<(String, usize)> {
    let rest = url
        .strip_prefix("http://127.0.0.1:")
        .or_else(|| url.strip_prefix("http://localhost:"))?;
    let (port, path) = rest.split_once("/stream/")?;
    if port.is_empty() || !port.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let path = path.split(['?', '#']).next()?;
    let (hash, idx) = path.split_once('/')?;
    if hash.len() != 40 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    Some((hash.to_ascii_lowercase(), idx.parse().ok()?))
}

/// The complete copy in the cache of the file a local engine stream URL serves, so a
/// save can copy it instead of streaming it all over again.
pub fn cached_file_for_stream_url(url: &str) -> Option<PathBuf> {
    let (info_hash, file_idx) = parse_stream_url(url)?;
    cached_file(&info_hash, file_idx)
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
            persistence: Some(SessionPersistenceConfig::Json {
                folder: Some(dir.to_path_buf()),
            }),
            dht: dht.then(|| DhtSessionConfig {
                persistence: persist_dht.then(|| DhtPersistenceConfig {
                    config_filename: Some(dir.join("dht.json")),
                    dump_interval: None,
                }),
                ..Default::default()
            }),
            trackers: trackers::as_url_set(),
            connect: Some(ConnectionOptions { peer_opts: Some(peer_opts()), ..Default::default() }),
            // `[::]` takes IPv6 peers as well as IPv4 ones on a dual-stack socket.
            listen: full.then(|| ListenerOptions {
                listen_addr: (std::net::Ipv6Addr::UNSPECIFIED, free_listen_port()).into(),
                enable_upnp_port_forwarding: true,
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .await
    .map_err(|e| format!("{e:#}"))
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
pub struct EngineConfig {
    dir: Option<String>,
    retention_hours: Option<u64>,
    max_gb: Option<u64>,
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

/// One engine start at a time. Restoring the previous torrents can take minutes;
/// commands asking for the engine meanwhile used to start a second session, which
/// could not bind the DHT port the first one held and fell back to a cold DHT.
static INIT: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Run `start` unless `started` says it has already run, waiting for a start in
/// progress instead of beginning another.
async fn start_once<Fut: std::future::Future<Output = Result<(), String>>>(
    lock: &tokio::sync::Mutex<()>,
    started: impl Fn() -> bool,
    start: impl FnOnce() -> Fut,
) -> Result<(), String> {
    let _one_at_a_time = lock.lock().await;
    if started() {
        return Ok(());
    }
    start().await
}

/// Start the engine if it is not running yet.
async fn start(app: AppHandle) -> Result<(), String> {
    start_once(&INIT, || current_session().is_some(), || init_unlocked(app)).await
}


async fn init_unlocked(app: AppHandle) -> Result<(), String> {
    std::env::set_var("DHT_QUERIES_PER_SECOND", "100");
    let cfg = read_config(&app);
    let dir = engine_dir(&app, &cfg)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    cache_sweep::run(&dir, cfg.retention_hours.unwrap_or(24), cfg.max_gb.unwrap_or(0));
    for hash in persistence::drop_torrents_without_metadata(&dir) {
        eprintln!("[torrent-engine] not restoring {}: its .torrent file is gone", hash.get(..8).unwrap_or(&hash));
    }
    cache_index::update(&dir, Vec::new());
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
    let sweeper = spawn_cache_sweeper(app.clone());
    let peer_log = peer_log::spawn(session.clone());
    let nat_pmp = session.announce_port().map(nat_pmp::spawn);
    let mut st = engine().lock().unwrap();
    if let Some(old) = st.server.take() {
        old.abort();
    }
    if let Some(old) = st.sweeper.take() {
        old.abort();
    }
    if let Some(old) = st.peer_log.take() {
        old.abort();
    }
    if let Some(old) = st.nat_pmp.take() {
        old.abort();
    }
    st.session = Some(session);
    st.dir = Some(dir);
    st.side_dht = side_dht;
    st.port = Some(port);
    st.dht_tier = dht_tier;
    st.ready = true;
    st.last_error = None;
    st.server = Some(server);
    st.sweeper = Some(sweeper);
    st.peer_log = Some(peer_log);
    st.nat_pmp = nat_pmp;
    eprintln!("[torrent-engine] ready on 127.0.0.1:{port} (dht tier {dht_tier})");
    Ok(())
}

async fn ensure_session(app: &AppHandle) -> Result<Arc<Session>, String> {
    if let Some(s) = current_session() {
        return Ok(s);
    }
    start(app.clone()).await?;
    current_session().ok_or_else(|| "engine failed to initialize".to_string())
}

pub fn ensure_started_on_setup(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = start(app).await {
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
    if let Some(sweeper) = st.sweeper.take() {
        sweeper.abort();
    }
    if let Some(peer_log) = st.peer_log.take() {
        peer_log.abort();
    }
    if let Some(nat_pmp) = st.nat_pmp.take() {
        nat_pmp.abort();
    }
    st.session = None;
    st.dir = None;
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

/// Metadata fetch timeouts (B7). Lowered from a single 60s/45s ceiling to a
/// reasonable per-attempt budget with ONE retry using fresh DHT peers, so a
/// slow-but-working torrent still gets ample time while a stalled one recovers
/// instead of dying after a single dead-ended wait.
const META_TIMEOUT_FIRST: Duration = Duration::from_secs(30);
const META_TIMEOUT_RETRY: Duration = Duration::from_secs(20);
const INIT_TIMEOUT: Duration = Duration::from_secs(25);
/// Short budget for the concurrent side-DHT peer lookup (B7). Was a serial 3s
/// tax before add; now the lookup races the metadata fetch instead of blocking
/// it, and librqbit's own tracker+DHT discovery proceeds in parallel.
const DHT_SEED_BUDGET: Duration = Duration::from_millis(1500);

/// Incoming peer connections use the first free port of the range the router
/// forwards; librqbit 9 binds one exact port where 8 took a range.
const LISTEN_PORTS: std::ops::Range<u16> = 16881..16931;

fn free_listen_port() -> u16 {
    LISTEN_PORTS
        .clone()
        .find(|p| std::net::TcpListener::bind((std::net::Ipv6Addr::UNSPECIFIED, *p)).is_ok())
        .unwrap_or(0)
}

fn peer_opts() -> PeerConnectionOptions {
    PeerConnectionOptions {
        connect_timeout: Some(Duration::from_secs(7)),
        // A connected peer may be temporarily choked or serving other clients.
        // Keep the short TCP connect budget, but allow idle established peers
        // time to contribute instead of repeatedly reconnecting after 10s.
        read_write_timeout: Some(Duration::from_secs(60)),
        keep_alive_interval: Some(Duration::from_secs(20)),
    }
}

fn add_opts(
    paused: bool,
    only_files: Option<Vec<usize>>,
    trackers: Vec<String>,
    seed: Vec<SocketAddr>,
) -> AddTorrentOptions {
    AddTorrentOptions {
        overwrite: true,
        paused,
        only_files,
        trackers: Some(merge_trackers(trackers)),
        initial_peers: (!seed.is_empty()).then_some(seed),
        peer_opts: Some(peer_opts()),
        force_tracker_interval: Some(Duration::from_secs(300)),
        ..Default::default()
    }
}

/// Acquire an initialized torrent handle: fetch metadata under a bounded
/// timeout and retry ONCE with fresh side-DHT peers before hard-failing (B7).
///
/// Concurrency (B7): the side-DHT `seed_peers` lookup runs with a short budget
/// and its peers are handed to librqbit as `initial_peers`, while librqbit's
/// own tracker + DHT discovery proceeds concurrently — the lookup no longer
/// adds a serial multi-second tax ahead of the metadata fetch. On a metadata
/// timeout we pull fresh DHT peers and re-add once instead of dead-ending.
async fn acquire_handle(
    session: &Arc<Session>,
    magnet: &str,
    paused: bool,
    only_files: Option<Vec<usize>>,
    trackers: Vec<String>,
) -> Result<Arc<librqbit::ManagedTorrent>, String> {
    let dht = current_side_dht();
    let seed = match &dht {
        Some(d) => dht_boot::seed_peers(d, magnet, 40, DHT_SEED_BUDGET).await,
        None => Vec::new(),
    };

    let attempt = |seed: Vec<SocketAddr>, meta_timeout: Duration| {
        let opts = add_opts(paused, only_files.clone(), trackers.clone(), seed);
        async move {
            let added = timeout(
                meta_timeout,
                session.add_torrent(AddTorrent::from_url(magnet), Some(opts)),
            )
            .await
            .map_err(|_| "metadata timed out".to_string())?
            .map_err(|e| format!("{e:#}"))?;
            let handle = added
                .into_handle()
                .ok_or_else(|| "torrent added as list-only".to_string())?;
            Ok::<_, String>(handle)
        }
    };

    let handle = match attempt(seed, META_TIMEOUT_FIRST).await {
        Ok(h) => h,
        Err(e) if e == "metadata timed out" => {
            eprintln!("[torrent-engine] metadata timed out, retrying with fresh peers");
            let fresh = match &dht {
                Some(d) => dht_boot::seed_peers(d, magnet, 40, DHT_SEED_BUDGET).await,
                None => Vec::new(),
            };
            attempt(fresh, META_TIMEOUT_RETRY)
                .await
                .map_err(|e| format!("metadata timed out after retry: {e}"))?
        }
        Err(e) => return Err(e),
    };

    timeout(INIT_TIMEOUT, handle.wait_until_initialized())
        .await
        .map_err(|_| "torrent init timed out".to_string())?
        .map_err(|e| format!("{e:#}"))?;
    Ok(handle)
}

#[tauri::command]
pub async fn torrent_engine_add(
    app: AppHandle,
    magnet: String,
    trackers: Vec<String>,
    file_idx: Option<usize>,
) -> Result<AddResult, String> {
    let session = ensure_session(&app).await?;
    let handle = acquire_handle(
        &session,
        magnet.as_str(),
        true,
        file_idx.map(|i| vec![i]),
        trackers,
    )
    .await?;
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
    let narrow_idx = file_idx
        .filter(|&i| i < files.len())
        .or_else(|| files.iter().max_by_key(|f| f.length).map(|f| f.idx));
    let only = wanted_files(&info_hash, narrow_idx);
    if !only.is_empty() {
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

fn build_magnet(hash: &str) -> String {
    format!("magnet:?xt=urn:btih:{hash}")
}

pub(crate) async fn ensure_added(
    hash: &str,
    trackers: Vec<String>,
    file_idx: Option<usize>,
) -> Result<(String, Vec<EngineFile>), String> {
    let session = current_session().ok_or_else(|| "engine not ready".to_string())?;
    let id = TorrentIdOrHash::parse(hash).map_err(|e| e.to_string())?;
    let handle = match session.get(id) {
        Some(h) => h,
        None => {
            let magnet = build_magnet(hash);
            acquire_handle(
                &session,
                magnet.as_str(),
                file_idx.is_none(),
                file_idx.map(|i| vec![i]),
                trackers,
            )
            .await?
        }
    };
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
    if let Some(idx) = file_idx.filter(|&i| i < files.len()) {
        let only: HashSet<usize> = HashSet::from([idx]);
        let _ = session.update_only_files(&handle, &only).await;
        let _ = session.unpause(&handle).await;
    }
    Ok((info_hash, files))
}

#[tauri::command]
pub fn torrent_engine_lan_status() -> (bool, Option<u16>, Option<String>) {
    let st = engine().lock().unwrap();
    (st.lan_server.is_some(), st.lan_port, st.lan_error.clone())
}

#[tauri::command]
pub async fn torrent_engine_lan_start(app: AppHandle) -> Result<u16, String> {
    let session = ensure_session(&app).await?;
    torrent_engine_lan_stop();
    let listener = match TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], LAN_SERVER_PORT))).await {
        Ok(l) => l,
        Err(e) => {
            let msg = format!("port {LAN_SERVER_PORT} unavailable: {e}");
            engine().lock().unwrap().lan_error = Some(msg.clone());
            return Err(msg);
        }
    };
    let router = stream_route::router(session);
    let server = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("[torrent-engine] lan server error: {e}");
        }
    });
    let mut st = engine().lock().unwrap();
    st.lan_server = Some(server);
    st.lan_port = Some(LAN_SERVER_PORT);
    st.lan_error = None;
    Ok(LAN_SERVER_PORT)
}

#[tauri::command]
pub fn torrent_engine_lan_stop() {
    let mut st = engine().lock().unwrap();
    if let Some(h) = st.lan_server.take() {
        h.abort();
    }
    st.lan_port = None;
}

/// Narrow a torrent to the file being streamed, without dropping the files a save is
/// still pulling from it.
#[tauri::command]
pub async fn torrent_engine_select(info_hash: String, file_idx: usize) -> Result<(), String> {
    apply_selection(&info_hash, wanted_files(&info_hash, Some(file_idx))).await
}

/// Select several files at once. Streaming narrows a torrent down to the single file
/// being watched, but saving a whole season needs every wanted file downloading at the
/// same time, which one-file-at-a-time selection cannot express.
#[tauri::command]
pub async fn torrent_engine_select_many(
    info_hash: String,
    file_idxs: Vec<usize>,
) -> Result<(), String> {
    if file_idxs.is_empty() {
        return Err("no file selected".to_string());
    }
    remember_saved(&info_hash, &file_idxs);
    // A file already complete in the cache is copied from there: its torrent, which
    // the player may have closed since, does not need to download anything.
    if file_idxs.iter().all(|&i| cached_file(&info_hash, i).is_some()) {
        return Ok(());
    }
    let result = apply_selection(&info_hash, wanted_files(&info_hash, None)).await;
    if let Err(e) = &result {
        eprintln!("[torrent-engine] download selection {} refused: {e}", info_hash.get(..8).unwrap_or(&info_hash));
    }
    result
}

/// Release files a save no longer needs, so a later stream can narrow the torrent back
/// down instead of seeding a whole pack forever.
#[tauri::command]
pub async fn torrent_engine_release(info_hash: String, file_idxs: Vec<usize>) -> Result<(), String> {
    forget_saved(&info_hash, &file_idxs);
    Ok(())
}

async fn apply_selection(info_hash: &str, only: HashSet<usize>) -> Result<(), String> {
    if only.is_empty() {
        return Err("no file selected".to_string());
    }
    let session = current_session().ok_or_else(|| "engine not ready".to_string())?;
    let id = TorrentIdOrHash::parse(info_hash).map_err(|e| e.to_string())?;
    let handle = session.get(id).ok_or_else(|| "no torrent".to_string())?;
    select_files(&session, &handle, &only).await
}

async fn select_files(
    session: &Arc<Session>,
    handle: &Arc<librqbit::ManagedTorrent>,
    only: &HashSet<usize>,
) -> Result<(), String> {
    session.update_only_files(handle, only).await.map_err(|e| format!("{e:#}"))?;
    // A running stream already started the torrent; librqbit refuses to start it twice.
    if handle.live().is_none() {
        session.unpause(handle).await.map_err(|e| format!("{e:#}"))?;
    }
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
            live.snapshot.peer_stats.live as usize,
            (live.download_speed.mbps * 1024.0 * 1024.0) as u64,
            true,
        ),
        None => (0, 0, false),
    };
    let stream_progress = match file_idx {
        Some(i) => s.file_progress.get(i).copied().unwrap_or(s.progress_bytes),
        None => s.progress_bytes,
    };
    let stream_len = match file_idx {
        Some(i) => handle
            .with_metadata(|m| m.file_infos.get(i).map(|fi| fi.len))
            .ok()
            .flatten()
            .unwrap_or(s.total_bytes),
        None => s.total_bytes,
    };
    Ok(TorrentEngineStats {
        peers,
        unchoked: peers,
        downloaded: s.progress_bytes,
        download_speed,
        stream_progress,
        stream_len,
        peer_search_running,
        finished: s.finished,
        state: format!("{:?}", s.state),
    })
}

#[tauri::command]
pub async fn torrent_engine_remove(info_hash: String, delete_files: bool) -> Result<(), String> {
    let session = current_session().ok_or_else(|| "engine not ready".to_string())?;
    let id = TorrentIdOrHash::parse(&info_hash).map_err(|e| e.to_string())?;
    // librqbit forgets the torrent's metadata with it: note its finished files first.
    if let (false, Some(handle), Some(dir)) = (delete_files, session.get(id), current_dir()) {
        cache_index::update(&dir, complete_files_of(&handle));
    }
    session
        .delete(id, delete_files)
        .await
        .map_err(|e| format!("{e:#}"))?;
    Ok(())
}

#[derive(Serialize)]
pub struct CachedFileDto {
    info_hash: String,
    file_idx: usize,
    name: String,
    size: u64,
    /// When the cache sweep will remove it, in Unix milliseconds.
    expires_at_ms: Option<u64>,
}

#[derive(Serialize)]
pub struct PortStatusDto {
    /// The port peers are told to connect to, or None while the engine does not listen.
    port: Option<u16>,
    forwarding: port_status::Forwarding,
    incoming: u64,
    incoming_ipv6: u64,
    last_incoming_ms: Option<u64>,
    /// What Windows Firewall does to incoming peers; None elsewhere.
    firewall: Option<firewall::Firewall>,
}

/// Whether peers reach the engine: its port, the router forwarding, the firewall,
/// incoming peers.
#[tauri::command]
pub async fn torrent_engine_port_status() -> PortStatusDto {
    let a = port_status::activity();
    // The firewall is read through COM, kept off the main thread.
    let firewall = tokio::task::spawn_blocking(firewall::read).await.ok().flatten();
    PortStatusDto {
        port: current_session().and_then(|s| s.announce_port()),
        forwarding: a.forwarding,
        incoming: a.incoming,
        incoming_ipv6: a.incoming_ipv6,
        last_incoming_ms: a.last_incoming_ms,
        firewall,
    }
}

/// The complete files the engine's cache holds, whether or not their torrent is open.
#[tauri::command]
pub async fn torrent_engine_cached_files(app: AppHandle) -> Vec<CachedFileDto> {
    let Some((dir, files)) = refresh_cache_index() else { return Vec::new() };
    let retention = read_config(&app).retention_hours.unwrap_or(24);
    files
        .into_iter()
        .map(|f| {
            // The sweep removes whole top-level entries: a pack goes with its folder.
            let entry = f.path.components().next().map(|c| dir.join(c));
            let expires_at_ms = entry
                .and_then(|e| cache_sweep::expires_at(&e, retention))
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64);
            CachedFileDto {
                name: f.path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                info_hash: f.info_hash,
                file_idx: f.file_idx,
                size: f.len,
                expires_at_ms,
            }
        })
        .collect()
}

#[tauri::command]
pub async fn torrent_engine_restart(app: AppHandle) -> Result<EngineStatusDto, String> {
    // Stopping inside the start lock: a start in progress would otherwise finish
    // after `stop` and leave its session holding the DHT port the new one needs.
    let _one_at_a_time = INIT.lock().await;
    stop();
    tokio::time::sleep(Duration::from_millis(600)).await;
    init_unlocked(app).await?;
    Ok(torrent_engine_status())
}

#[tauri::command]
pub async fn torrent_engine_hard_reset(app: AppHandle) -> Result<EngineStatusDto, String> {
    let _one_at_a_time = INIT.lock().await;
    stop();
    tokio::time::sleep(Duration::from_millis(800)).await;
    let cfg = read_config(&app);
    if let Ok(dir) = engine_dir(&app, &cfg) {
        let _ = std::fs::remove_dir_all(&dir);
    }
    engine().lock().unwrap().last_error = None;
    init_unlocked(app).await?;
    Ok(torrent_engine_status())
}

/// The engine's own copy of these settings, so the frontend can tell whether what
/// it shows is what the engine is actually running on.
#[tauri::command]
pub fn torrent_engine_get_options(app: AppHandle) -> EngineConfig {
    read_config(&app)
}

#[tauri::command]
pub async fn torrent_engine_set_options(
    app: AppHandle,
    dir: Option<String>,
    retention_hours: u64,
    max_gb: u64,
    restart: bool,
) -> Result<EngineStatusDto, String> {
    let cfg = EngineConfig {
        dir: dir.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        retention_hours: Some(retention_hours),
        max_gb: Some(max_gb),
    };
    if let Some(p) = config_path(&app) {
        if let Some(parent) = p.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&p, serde_json::to_string(&cfg).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    }
    if restart {
        let _one_at_a_time = INIT.lock().await;
        stop();
        tokio::time::sleep(Duration::from_millis(600)).await;
        init_unlocked(app).await?;
    }
    Ok(torrent_engine_status())
}

#[tauri::command]
pub async fn torrent_engine_selftest(app: AppHandle) -> selftest::SelfTestResult {
    selftest::run(app).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Commands asking for the engine while it is still starting used to start a
    /// second one, which could not bind the DHT port the first one held.
    #[tokio::test]
    async fn starts_the_engine_once_however_many_callers_ask() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let lock = tokio::sync::Mutex::new(());
        let started = AtomicUsize::new(0);
        let start = || async {
            tokio::time::sleep(Duration::from_millis(50)).await;
            started.fetch_add(1, Ordering::SeqCst);
            Ok(())
        };
        let callers = (0..4).map(|_| super::start_once(&lock, || started.load(Ordering::SeqCst) > 0, start));
        for result in futures_util::future::join_all(callers).await {
            assert!(result.is_ok());
        }
        assert_eq!(started.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn reads_the_torrent_file_of_a_local_stream_url() {
        let hash = "9D2B067152F824489BE057651EDFC8E9654857CF";
        assert_eq!(
            parse_stream_url(&format!("http://127.0.0.1:59366/stream/{hash}/3?t=1")),
            Some((hash.to_ascii_lowercase(), 3))
        );
        assert_eq!(parse_stream_url(&format!("http://localhost:11470/stream/{hash}/0")).map(|f| f.1), Some(0));
        // A Stremio server route, a remote host or a malformed hash is not the engine's.
        assert_eq!(parse_stream_url(&format!("http://127.0.0.1:11470/{hash}/0")), None);
        assert_eq!(parse_stream_url(&format!("http://example.com:80/stream/{hash}/0")), None);
        assert_eq!(parse_stream_url("http://127.0.0.1:59366/stream/abc/0"), None);
        assert_eq!(parse_stream_url(&format!("http://127.0.0.1:59366/stream/{hash}/x")), None);
    }

    // The registry is process-wide, so each test works on its own info hash.
    #[test]
    fn a_stream_keeps_the_files_a_save_holds() {
        let hash = "aaaa000000000000000000000000000000000001";
        remember_saved(hash, &[3, 4, 5]);
        let wanted = wanted_files(hash, Some(9));
        assert_eq!(wanted, HashSet::from([3, 4, 5, 9]));
    }

    #[test]
    fn releasing_a_save_narrows_the_torrent_back_down() {
        let hash = "aaaa000000000000000000000000000000000002";
        remember_saved(hash, &[1, 2]);
        forget_saved(hash, &[1, 2]);
        assert_eq!(wanted_files(hash, Some(7)), HashSet::from([7]));
        assert!(wanted_files(hash, None).is_empty());
    }

    #[test]
    fn releasing_one_file_leaves_the_others_selected() {
        let hash = "aaaa000000000000000000000000000000000003";
        remember_saved(hash, &[1, 2, 3]);
        forget_saved(hash, &[2]);
        assert_eq!(wanted_files(hash, None), HashSet::from([1, 3]));
    }

    #[test]
    fn the_hash_case_does_not_split_the_registry() {
        let hash = "AAAA000000000000000000000000000000000004";
        remember_saved(hash, &[6]);
        assert_eq!(wanted_files(&hash.to_ascii_lowercase(), None), HashSet::from([6]));
    }

    #[test]
    fn saves_on_one_torrent_do_not_reach_another() {
        remember_saved("aaaa000000000000000000000000000000000005", &[1]);
        assert!(wanted_files("aaaa000000000000000000000000000000000006", None).is_empty());
    }

    /// A stream already started the torrent; widening it for a save must not fail.
    #[tokio::test]
    async fn selecting_files_on_a_live_torrent_succeeds() {
        let dir = std::env::temp_dir().join(format!("vayra-select-{}", std::process::id()));
        let content = dir.join("pack");
        std::fs::create_dir_all(&content).unwrap();
        std::fs::write(content.join("e01.mkv"), vec![1u8; 64 * 1024]).unwrap();
        std::fs::write(content.join("e02.mkv"), vec![2u8; 64 * 1024]).unwrap();
        let options = librqbit::CreateTorrentOptions { name: None, trackers: Vec::new(), piece_length: Some(16 * 1024) };
        let torrent = librqbit::create_torrent(&content, options, &librqbit::spawn_utils::BlockingSpawner::new(1))
            .await
            .unwrap()
            .as_bytes()
            .unwrap();
        let session = new_session(&dir, false, false, false).await.unwrap();
        let handle = session
            .add_torrent(AddTorrent::from_bytes(torrent), Some(add_opts(false, Some(vec![0]), Vec::new(), Vec::new())))
            .await
            .unwrap()
            .into_handle()
            .unwrap();
        timeout(Duration::from_secs(10), handle.wait_until_initialized()).await.unwrap().unwrap();
        assert!(handle.live().is_some(), "the torrent should be live before selecting");

        let result = select_files(&session, &handle, &HashSet::from([0, 1])).await;

        let _ = session.delete(TorrentIdOrHash::Hash(handle.info_hash()), false).await;
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(result, Ok(()));
    }

    /// Real swarm download with the production peer options, on a throwaway session.
    /// Needs the network: `cargo test --lib real_swarm_download -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn real_swarm_download_makes_progress() {
        const MAGNET: &str = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel";
        crate::app_log::init_tracing();
        let dir = std::env::temp_dir().join(format!("vayra-swarm-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let session = new_session(&dir, false, true, false).await.unwrap();
        let log = peer_log::spawn(session.clone());
        let handle = timeout(
            Duration::from_secs(90),
            session.add_torrent(AddTorrent::from_url(MAGNET), Some(add_opts(false, None, Vec::new(), Vec::new()))),
        )
        .await
        .expect("metadata timed out")
        .unwrap()
        .into_handle()
        .unwrap();
        let mut progressed = 0;
        for _ in 0..90 {
            tokio::time::sleep(Duration::from_secs(1)).await;
            progressed = handle.stats().progress_bytes;
            if progressed >= 4 * 1024 * 1024 {
                break;
            }
        }
        let st = handle.stats();
        eprintln!("[swarm-test] progress={progressed} total={} state={:?} files={:?}", st.total_bytes, st.state, st.file_progress);
        log.abort();
        let _ = session.delete(TorrentIdOrHash::Hash(handle.info_hash()), true).await;
        let _ = std::fs::remove_dir_all(&dir);
        assert!(progressed > 0, "no bytes downloaded in 90s");
    }
}
