//! VAYRA Connect, Mac side: phones paired on the local network watch and drive
//! the player over one WebSocket route. See docs/connect-plan.md.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{broadcast, oneshot, watch};

use crate::connect_seal;

pub const PORT: u16 = 11472;
pub const PROTOCOL: u64 = 1;
pub const COMMAND_EVENT: &str = "vayra:connect-command";
const MAX_MESSAGE_BYTES: usize = 16 * 1024;
const HELLO_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_PHONES: usize = 8;

#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Phone {
    pub device_id: String,
    pub name: String,
    pub platform: String,
}

/// Called with every validated `command` or `load` a phone sends.
pub type OnCommand = Arc<dyn Fn(Value) + Send + Sync>;

struct Shared {
    secret: Mutex<String>,
    device_id: String,
    name: String,
    last_state: Mutex<String>,
    states: broadcast::Sender<String>,
    // Bumped to drop every phone, e.g. when the secret changes.
    epoch: watch::Sender<u64>,
    phones: Mutex<HashMap<u64, Phone>>,
    next_conn: AtomicU64,
    on_command: OnCommand,
    // The addons phones may import, once the front has published them.
    addons: Mutex<Option<Vec<Value>>>,
}

pub struct Server {
    shared: Arc<Shared>,
    shutdown: Option<oneshot::Sender<()>>,
    pub addr: SocketAddr,
}

impl Server {
    pub async fn start(
        addr: SocketAddr,
        secret: String,
        device_id: String,
        name: String,
        on_command: OnCommand,
    ) -> std::io::Result<Self> {
        let listener = tokio::net::TcpListener::bind(addr).await?;
        let addr = listener.local_addr()?;
        let shared = Arc::new(Shared {
            secret: Mutex::new(secret),
            device_id,
            name,
            last_state: Mutex::new(idle()),
            states: broadcast::channel(32).0,
            epoch: watch::channel(0).0,
            phones: Mutex::new(HashMap::new()),
            next_conn: AtomicU64::new(0),
            on_command,
            addons: Mutex::new(None),
        });
        let router = axum::Router::new()
            .route("/connect/v1", get(upgrade))
            .with_state(shared.clone());
        let (tx, rx) = oneshot::channel::<()>();
        tokio::spawn(async move {
            let _ = axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = rx.await;
                })
                .await;
        });
        Ok(Self { shared, shutdown: Some(tx), addr })
    }

    /// The player's state, or `None` once nothing plays.
    pub fn publish(&self, state: Option<Value>) {
        let message = match state {
            Some(state) => json!({ "type": "state", "state": state }).to_string(),
            None => idle(),
        };
        *lock(&self.shared.last_state) = message.clone();
        let _ = self.shared.states.send(message);
    }

    /// This Mac's addons, for phones to import; sent sealed, as their addresses
    /// often carry a debrid key.
    pub fn publish_addons(&self, addons: &Value) {
        *lock(&self.shared.addons) = Some(connect_seal::clean_addons(addons));
        if let Some(message) = addons_message(&self.shared) {
            let _ = self.shared.states.send(message);
        }
    }

    /// New secret: every paired phone is dropped and has to pair again.
    pub fn rotate(&self, secret: String) {
        *lock(&self.shared.secret) = secret;
        self.shared.epoch.send_modify(|e| *e += 1);
    }

    pub fn phones(&self) -> Vec<Phone> {
        lock(&self.shared.phones).values().cloned().collect()
    }

    pub fn stop(mut self) {
        self.shared.epoch.send_modify(|e| *e += 1);
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
    }
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn idle() -> String {
    json!({ "type": "idle" }).to_string()
}

fn addons_message(shared: &Shared) -> Option<String> {
    let addons = lock(&shared.addons).clone()?;
    let plain = serde_json::to_vec(&addons).ok()?;
    let sealed = connect_seal::seal(&lock(&shared.secret), &plain)?;
    Some(json!({ "type": "addons", "sealed": sealed }).to_string())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[derive(Deserialize)]
struct Auth {
    k: Option<String>,
}

async fn upgrade(State(shared): State<Arc<Shared>>, Query(auth): Query<Auth>, ws: WebSocketUpgrade) -> Response {
    let allowed = auth
        .k
        .as_deref()
        .is_some_and(|k| constant_time_eq(k.as_bytes(), lock(&shared.secret).as_bytes()));
    if !allowed {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if lock(&shared.phones).len() >= MAX_PHONES {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    ws.max_message_size(MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| session(shared, socket))
}

async fn session(shared: Arc<Shared>, mut socket: WebSocket) {
    let phone = match tokio::time::timeout(HELLO_TIMEOUT, socket.recv()).await {
        Ok(Some(Ok(Message::Text(text)))) => match parse_hello(text.as_str()) {
            Some(phone) => phone,
            None => return,
        },
        _ => return,
    };
    let id = shared.next_conn.fetch_add(1, Ordering::Relaxed);
    lock(&shared.phones).insert(id, phone);
    let mut states = shared.states.subscribe();
    let mut epoch = shared.epoch.subscribe();
    let hello = json!({
        "type": "hello",
        "deviceId": shared.device_id,
        "name": shared.name,
        "platform": std::env::consts::OS,
        "protocol": PROTOCOL,
    })
    .to_string();
    let current = lock(&shared.last_state).clone();
    let addons = addons_message(&shared);
    let introduced = send(&mut socket, hello).await
        && send(&mut socket, current).await
        && match addons {
            Some(addons) => send(&mut socket, addons).await,
            None => true,
        };
    if introduced {
        loop {
            tokio::select! {
                incoming = socket.recv() => match incoming {
                    Some(Ok(Message::Text(text))) => match handle(&shared, text.as_str()) {
                        Reply::Nothing => {}
                        Reply::State => {
                            let current = lock(&shared.last_state).clone();
                            if !send(&mut socket, current).await {
                                break;
                            }
                        }
                        Reply::Close => break,
                    },
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    _ => break,
                },
                state = states.recv() => match state {
                    Ok(state) => {
                        if !send(&mut socket, state).await {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        let current = lock(&shared.last_state).clone();
                        if !send(&mut socket, current).await {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                },
                _ = epoch.changed() => break,
            }
        }
    }
    lock(&shared.phones).remove(&id);
    let _ = socket.send(Message::Close(None)).await;
}

async fn send(socket: &mut WebSocket, text: String) -> bool {
    socket.send(Message::Text(text.into())).await.is_ok()
}

enum Reply {
    Nothing,
    State,
    Close,
}

fn handle(shared: &Shared, text: &str) -> Reply {
    let Ok(message) = serde_json::from_str::<Value>(text) else {
        return Reply::Close;
    };
    match message["type"].as_str() {
        Some("requestState") => Reply::State,
        Some("command") => match clean_command(&message) {
            Some(command) => {
                (shared.on_command)(command);
                Reply::Nothing
            }
            None => Reply::Close,
        },
        Some("load") => match clean_load(&message) {
            Some(load) => {
                (shared.on_command)(load);
                Reply::Nothing
            }
            None => Reply::Close,
        },
        _ => Reply::Close,
    }
}

fn bounded_str(value: &Value, max: usize) -> Option<&str> {
    value.as_str().filter(|s| !s.is_empty() && s.chars().count() <= max)
}

fn parse_hello(text: &str) -> Option<Phone> {
    let hello = serde_json::from_str::<Value>(text).ok()?;
    if hello["type"] != "hello" || hello["protocol"].as_u64() != Some(PROTOCOL) {
        return None;
    }
    Some(Phone {
        device_id: bounded_str(&hello["deviceId"], 64)?.to_string(),
        name: bounded_str(&hello["name"], 64)?.to_string(),
        platform: bounded_str(&hello["platform"], 16)?.to_string(),
    })
}

/// Rebuilds a phone command from known fields only, or rejects it.
fn clean_command(message: &Value) -> Option<Value> {
    let finite = |v: &Value| v.as_f64().filter(|n| n.is_finite());
    match message["action"].as_str()? {
        action @ ("play" | "pause" | "toggle" | "stop") => Some(json!({ "type": "command", "action": action })),
        "seek" => {
            let position = finite(&message["position"]).filter(|p| *p >= 0.0)?;
            Some(json!({ "type": "command", "action": "seek", "position": position }))
        }
        "skip" => {
            let seconds = finite(&message["seconds"]).filter(|s| s.abs() <= 3600.0)?;
            Some(json!({ "type": "command", "action": "skip", "seconds": seconds }))
        }
        "volume" => {
            let level = finite(&message["level"]).filter(|l| (0.0..=1.0).contains(l))?;
            Some(json!({ "type": "command", "action": "volume", "level": level }))
        }
        _ => None,
    }
}

/// Rebuilds a request to play a title on the Mac, or rejects it.
fn clean_load(message: &Value) -> Option<Value> {
    let meta = &message["meta"];
    let kind = meta["type"].as_str().filter(|t| matches!(*t, "movie" | "series"))?;
    let mut clean = json!({
        "type": "load",
        "meta": {
            "id": bounded_str(&meta["id"], 200)?,
            "type": kind,
            "name": bounded_str(&meta["name"], 300).unwrap_or(""),
        },
    });
    if let Some(poster) = bounded_str(&meta["poster"], 1000).filter(|p| p.starts_with("https://")) {
        clean["meta"]["poster"] = json!(poster);
    }
    let episode = &message["episode"];
    if !episode.is_null() {
        let season = episode["season"].as_u64().filter(|s| *s <= 1000)?;
        let number = episode["episode"].as_u64().filter(|e| *e <= 10_000)?;
        clean["episode"] = json!({ "season": season, "episode": number });
    }
    if let Some(start) = message["startSec"].as_f64().filter(|s| s.is_finite() && *s >= 0.0) {
        clean["startSec"] = json!(start);
    }
    Some(clean)
}

// ---- Tauri glue -------------------------------------------------------------

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectInfo {
    pairing_url: String,
    address: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectStatus {
    running: bool,
    phones: Vec<Phone>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    secret: String,
    device_id: String,
}

fn new_secret() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

fn stored_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("connect.json"))
}

fn save(path: &std::path::Path, stored: &Stored) -> Result<(), String> {
    let text = serde_json::to_string(stored).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn load_or_create(app: &tauri::AppHandle) -> Result<Stored, String> {
    let path = stored_path(app)?;
    if let Some(stored) = std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str::<Stored>(&t).ok()) {
        return Ok(stored);
    }
    let stored = Stored { secret: new_secret(), device_id: uuid::Uuid::new_v4().to_string() };
    save(&path, &stored)?;
    Ok(stored)
}

fn computer_name() -> String {
    #[cfg(target_os = "macos")]
    if let Ok(out) = std::process::Command::new("scutil").args(["--get", "ComputerName"]).output() {
        let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !name.is_empty() {
            return name;
        }
    }
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "VAYRA".into())
}

fn info(stored: &Stored, name: &str, port: u16) -> ConnectInfo {
    let address = format!("{}:{}", crate::stream_proxy::lan_ip().unwrap_or_else(|| "127.0.0.1".into()), port);
    let encoded_name: String = url::form_urlencoded::byte_serialize(name.as_bytes()).collect();
    ConnectInfo {
        pairing_url: format!(
            "vayra://connect/pair#h={}&k={}&n={}&id={}",
            address, stored.secret, encoded_name, stored.device_id
        ),
        address,
        name: name.to_string(),
    }
}

// The addons the front last published, kept for a server started afterwards.
fn addons_slot() -> &'static Mutex<Option<Value>> {
    static SLOT: std::sync::OnceLock<Mutex<Option<Value>>> = std::sync::OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn server_slot() -> &'static tokio::sync::Mutex<Option<(Server, ConnectInfo)>> {
    static SLOT: std::sync::OnceLock<tokio::sync::Mutex<Option<(Server, ConnectInfo)>>> = std::sync::OnceLock::new();
    SLOT.get_or_init(|| tokio::sync::Mutex::new(None))
}

/// Starts accepting phones (idempotent) and returns what the pairing QR shows.
#[tauri::command]
pub async fn connect_start(app: tauri::AppHandle) -> Result<ConnectInfo, String> {
    use tauri::Emitter;
    let mut slot = server_slot().lock().await;
    if let Some((_, info)) = slot.as_ref() {
        return Ok(info.clone());
    }
    let stored = load_or_create(&app)?;
    let name = computer_name();
    let emitter = app.clone();
    let server = Server::start(
        SocketAddr::from(([0, 0, 0, 0], PORT)),
        stored.secret.clone(),
        stored.device_id.clone(),
        name.clone(),
        Arc::new(move |command| {
            let _ = emitter.emit(COMMAND_EVENT, command);
        }),
    )
    .await
    .map_err(|e| format!("connect: port {PORT}: {e}"))?;
    if let Some(addons) = lock(addons_slot()).as_ref() {
        server.publish_addons(addons);
    }
    let info = info(&stored, &name, server.addr.port());
    *slot = Some((server, info.clone()));
    Ok(info)
}

#[tauri::command]
pub async fn connect_stop() {
    if let Some((server, _)) = server_slot().lock().await.take() {
        server.stop();
    }
}

/// Unpairs every phone: they need the new QR code to connect again.
#[tauri::command]
pub async fn connect_rotate(app: tauri::AppHandle) -> Result<ConnectInfo, String> {
    let mut slot = server_slot().lock().await;
    let path = stored_path(&app)?;
    let mut stored = load_or_create(&app)?;
    stored.secret = new_secret();
    save(&path, &stored)?;
    let name = computer_name();
    let port = slot.as_ref().map_or(PORT, |(server, _)| server.addr.port());
    let fresh = info(&stored, &name, port);
    if let Some((server, current)) = slot.as_mut() {
        server.rotate(stored.secret.clone());
        *current = fresh.clone();
    }
    Ok(fresh)
}

#[tauri::command]
pub async fn connect_status() -> ConnectStatus {
    match server_slot().lock().await.as_ref() {
        Some((server, _)) => ConnectStatus { running: true, phones: server.phones() },
        None => ConnectStatus { running: false, phones: Vec::new() },
    }
}

/// The player's state for paired phones, or `null` once nothing plays.
#[tauri::command]
pub async fn connect_publish(state: Option<Value>) {
    if let Some((server, _)) = server_slot().lock().await.as_ref() {
        server.publish(state);
    }
}

/// This Mac's installed addons (`name`, `transportUrl`), for paired phones.
#[tauri::command]
pub async fn connect_publish_addons(addons: Value) {
    *lock(addons_slot()) = Some(addons.clone());
    if let Some((server, _)) = server_slot().lock().await.as_ref() {
        server.publish_addons(&addons);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message as WsMessage;

    #[test]
    fn commands_keep_known_fields_only() {
        let seek = clean_command(&json!({ "type": "command", "action": "seek", "position": 754.5, "x": 1 })).unwrap();
        assert_eq!(seek, json!({ "type": "command", "action": "seek", "position": 754.5 }));
        assert!(clean_command(&json!({ "action": "seek", "position": -1 })).is_none());
        assert!(clean_command(&json!({ "action": "volume", "level": 2 })).is_none());
        assert!(clean_command(&json!({ "action": "rm -rf" })).is_none());
    }

    #[test]
    fn loads_keep_a_catalogue_title_and_episode() {
        let load = clean_load(&json!({
            "type": "load",
            "meta": { "id": "tt0903747", "type": "series", "name": "Breaking Bad", "poster": "javascript:alert(1)" },
            "episode": { "season": 1, "episode": 2 },
            "startSec": 120,
        }))
        .unwrap();
        assert_eq!(
            load,
            json!({
                "type": "load",
                "meta": { "id": "tt0903747", "type": "series", "name": "Breaking Bad" },
                "episode": { "season": 1, "episode": 2 },
                "startSec": 120.0,
            })
        );
        assert!(clean_load(&json!({ "meta": { "id": "x", "type": "channel" } })).is_none());
    }

    #[test]
    fn secrets_compare_in_full() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }

    async fn next_text(
        ws: &mut tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    ) -> Option<Value> {
        loop {
            match tokio::time::timeout(Duration::from_secs(5), ws.next()).await.ok()?? {
                Ok(WsMessage::Text(text)) => return serde_json::from_str(&text).ok(),
                Ok(WsMessage::Close(_)) | Err(_) => return None,
                Ok(_) => {}
            }
        }
    }

    #[tokio::test]
    async fn a_paired_phone_gets_the_addons_sealed() {
        let server = Server::start(
            "127.0.0.1:0".parse().unwrap(),
            "s3cret".into(),
            "mac-1".into(),
            "MacBook".into(),
            Arc::new(|_| {}),
        )
        .await
        .unwrap();
        let torrentio = json!([{ "name": "Torrentio", "transportUrl": "https://torrentio.example/debrid=KEY/manifest.json" }]);
        server.publish_addons(&torrentio);
        let (mut phone, _) =
            tokio_tungstenite::connect_async(format!("ws://{}/connect/v1?k=s3cret", server.addr)).await.unwrap();
        let hello = json!({ "type": "hello", "deviceId": "pixel", "name": "Pixel 6", "platform": "android", "protocol": 1 });
        phone.send(WsMessage::Text(hello.to_string().into())).await.unwrap();
        assert_eq!(next_text(&mut phone).await.unwrap()["type"], "hello");
        assert_eq!(next_text(&mut phone).await.unwrap()["type"], "idle");
        let sealed = next_text(&mut phone).await.unwrap();
        assert_eq!(sealed["type"], "addons");
        assert!(!sealed.to_string().contains("KEY"));
        let plain = connect_seal::open("s3cret", sealed["sealed"].as_str().unwrap()).unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&plain).unwrap(), torrentio);

        server.publish_addons(&json!([]));
        let sealed = next_text(&mut phone).await.unwrap();
        let plain = connect_seal::open("s3cret", sealed["sealed"].as_str().unwrap()).unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&plain).unwrap(), json!([]));
        server.stop();
    }

    #[tokio::test]
    async fn a_paired_phone_follows_the_player_and_drives_it() {
        let received = Arc::new(Mutex::new(Vec::<Value>::new()));
        let sink = received.clone();
        let server = Server::start(
            "127.0.0.1:0".parse().unwrap(),
            "s3cret".into(),
            "mac-1".into(),
            "MacBook".into(),
            Arc::new(move |v| sink.lock().unwrap().push(v)),
        )
        .await
        .unwrap();
        let url = |k: &str| format!("ws://{}/connect/v1?k={}", server.addr, k);

        assert!(tokio_tungstenite::connect_async(url("wrong")).await.is_err());

        let (mut phone, _) = tokio_tungstenite::connect_async(url("s3cret")).await.unwrap();
        let hello = json!({ "type": "hello", "deviceId": "pixel", "name": "Pixel 6", "platform": "android", "protocol": 1 });
        phone.send(WsMessage::Text(hello.to_string().into())).await.unwrap();
        assert_eq!(next_text(&mut phone).await.unwrap()["name"], "MacBook");
        assert_eq!(next_text(&mut phone).await.unwrap(), json!({ "type": "idle" }));
        assert_eq!(server.phones()[0].name, "Pixel 6");

        server.publish(Some(json!({ "status": "playing", "positionSec": 12.0 })));
        assert_eq!(next_text(&mut phone).await.unwrap()["state"]["positionSec"], 12.0);

        let pause = json!({ "type": "command", "action": "pause" });
        phone.send(WsMessage::Text(pause.to_string().into())).await.unwrap();
        phone.send(WsMessage::Text(json!({ "type": "requestState" }).to_string().into())).await.unwrap();
        assert_eq!(next_text(&mut phone).await.unwrap()["type"], "state");
        assert_eq!(*received.lock().unwrap(), vec![pause]);

        // A new secret drops the phone, and the old one no longer opens a session.
        server.rotate("n3w".into());
        assert!(next_text(&mut phone).await.is_none());
        assert!(tokio_tungstenite::connect_async(url("s3cret")).await.is_err());
        server.stop();
    }

    #[tokio::test]
    async fn a_malformed_message_ends_the_session() {
        let server = Server::start(
            "127.0.0.1:0".parse().unwrap(),
            "k".into(),
            "mac".into(),
            "Mac".into(),
            Arc::new(|_| {}),
        )
        .await
        .unwrap();
        let (mut phone, _) = tokio_tungstenite::connect_async(format!("ws://{}/connect/v1?k=k", server.addr)).await.unwrap();
        let hello = json!({ "type": "hello", "deviceId": "p", "name": "P", "platform": "android", "protocol": 1 });
        phone.send(WsMessage::Text(hello.to_string().into())).await.unwrap();
        next_text(&mut phone).await.unwrap();
        next_text(&mut phone).await.unwrap();
        phone.send(WsMessage::Text("{\"type\":\"command\",\"action\":\"format\"}".into())).await.unwrap();
        assert!(next_text(&mut phone).await.is_none());
        server.stop();
    }
}
