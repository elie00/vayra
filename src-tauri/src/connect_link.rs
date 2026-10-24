//! VAYRA Connect, phone side: the Mac this phone was paired with, reached over
//! the local network. Rust holds the socket because the WebView, served over
//! https, may not open a ws:// connection to the LAN. See docs/connect-plan.md.

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::Notify;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::Message;

pub const STATUS_EVENT: &str = "vayra:connect-link";
const PROTOCOL: u64 = 1;
const MAX_MESSAGE_BYTES: usize = 64 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const PING_EVERY: Duration = Duration::from_secs(10);
// Without a frame for this long the Mac is gone (asleep, off the Wi-Fi).
const SILENCE_LIMIT: Duration = Duration::from_secs(25);
const MAX_RETRY_DELAY: Duration = Duration::from_secs(10);

/// What the Mac's pairing code carries.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pairing {
    pub address: SocketAddr,
    pub secret: String,
    pub name: String,
}

/// `vayra://connect/pair#h=<ip:port>&k=<secret>&n=<name>`, as the Mac's QR shows it.
pub fn parse_pairing(raw: &str) -> Option<Pairing> {
    let url = url::Url::parse(raw).ok()?;
    if url.scheme() != "vayra" || url.host_str() != Some("connect") || url.path() != "/pair" {
        return None;
    }
    let fields: HashMap<String, String> = url::form_urlencoded::parse(url.fragment()?.as_bytes())
        .into_owned()
        .collect();
    let address: SocketAddr = fields.get("h")?.parse().ok()?;
    if !on_local_network(address.ip()) {
        return None;
    }
    let secret = fields.get("k")?;
    if secret.len() != 64 || !secret.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let name: String = fields.get("n").map(|n| n.trim().chars().take(64).collect()).unwrap_or_default();
    Some(Pairing {
        address,
        secret: secret.clone(),
        name: if name.is_empty() { "Mac".into() } else { name },
    })
}

/// Private, link-local and CGNAT (Tailscale) IPv4: a code can't send the phone
/// to a server on the internet.
fn on_local_network(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, ..] = ip.octets();
            ip.is_private() || ip.is_loopback() || ip.is_link_local() || (a == 100 && b & 0xC0 == 64)
        }
        IpAddr::V6(_) => false,
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedMac {
    pub name: String,
    pub address: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkStatus {
    /// The paired Mac, `None` until a pairing code is scanned.
    pub mac: Option<PairedMac>,
    pub connected: bool,
    /// What the Mac plays (protocol `state`), `None` while it is idle.
    pub state: Option<Value>,
}

pub type OnStatus = Arc<dyn Fn(LinkStatus) + Send + Sync>;

/// This phone, as it introduces itself to the Mac.
#[derive(Clone)]
pub struct Me {
    pub device_id: String,
    pub name: String,
}

#[derive(Clone)]
struct Reporter {
    status: Arc<Mutex<LinkStatus>>,
    on_status: OnStatus,
}

impl Reporter {
    fn update(&self, change: impl FnOnce(&mut LinkStatus)) {
        let next = {
            let mut status = lock(&self.status);
            let before = status.clone();
            change(&mut status);
            if *status == before {
                return;
            }
            status.clone()
        };
        (self.on_status)(next);
    }
}

/// Keeps one paired Mac connected, reconnecting until dropped.
pub struct Link {
    status: Arc<Mutex<LinkStatus>>,
    retry: Arc<Notify>,
    task: tokio::task::JoinHandle<()>,
}

impl Link {
    pub fn start(pairing: Pairing, me: Me, on_status: OnStatus) -> Self {
        let status = Arc::new(Mutex::new(LinkStatus {
            mac: Some(PairedMac { name: pairing.name.clone(), address: pairing.address.to_string() }),
            connected: false,
            state: None,
        }));
        let retry = Arc::new(Notify::new());
        let reporter = Reporter { status: status.clone(), on_status };
        let task = tokio::spawn(run(pairing, me, reporter, retry.clone()));
        Self { status, retry, task }
    }

    pub fn status(&self) -> LinkStatus {
        lock(&self.status).clone()
    }

    /// Skips the wait before the next attempt, e.g. when the app comes back.
    pub fn retry_now(&self) {
        self.retry.notify_one();
    }
}

impl Drop for Link {
    fn drop(&mut self) {
        self.task.abort();
    }
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

async fn run(pairing: Pairing, me: Me, reporter: Reporter, retry: Arc<Notify>) {
    let mut delay = Duration::from_secs(1);
    loop {
        if session(&pairing, &me, &reporter).await {
            delay = Duration::from_secs(1);
        }
        reporter.update(|s| {
            s.connected = false;
            s.state = None;
        });
        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = retry.notified() => {}
        }
        delay = (delay * 2).min(MAX_RETRY_DELAY);
    }
}

/// One connection to the Mac; true once the Mac accepted this phone.
async fn session(pairing: &Pairing, me: &Me, reporter: &Reporter) -> bool {
    let url = format!("ws://{}/connect/v1?k={}", pairing.address, pairing.secret);
    let config = WebSocketConfig::default().max_message_size(Some(MAX_MESSAGE_BYTES));
    let connecting = tokio_tungstenite::connect_async_with_config(url, Some(config), true);
    let Ok(Ok((mut ws, _))) = tokio::time::timeout(CONNECT_TIMEOUT, connecting).await else {
        return false;
    };
    let hello = json!({
        "type": "hello",
        "deviceId": me.device_id,
        "name": me.name,
        "platform": std::env::consts::OS,
        "protocol": PROTOCOL,
    });
    if ws.send(Message::Text(hello.to_string().into())).await.is_err() {
        return false;
    }
    let mut accepted = false;
    let mut last_heard = Instant::now();
    let mut ping = tokio::time::interval(PING_EVERY);
    ping.tick().await;
    loop {
        tokio::select! {
            frame = ws.next() => match frame {
                Some(Ok(Message::Text(text))) => {
                    last_heard = Instant::now();
                    accepted |= receive(reporter, text.as_str());
                }
                Some(Ok(Message::Close(_)) | Err(_)) | None => break,
                Some(Ok(_)) => last_heard = Instant::now(),
            },
            _ = ping.tick() => {
                if last_heard.elapsed() > SILENCE_LIMIT || ws.send(Message::Ping(Default::default())).await.is_err() {
                    break;
                }
            }
        }
    }
    accepted
}

/// Applies a Mac message to the status; true for the Mac's hello.
fn receive(reporter: &Reporter, text: &str) -> bool {
    let Ok(message) = serde_json::from_str::<Value>(text) else {
        return false;
    };
    match message["type"].as_str() {
        Some("hello") => {
            let name = message["name"].as_str().map(|n| n.trim().chars().take(64).collect::<String>());
            reporter.update(|s| {
                s.connected = true;
                if let (Some(mac), Some(name)) = (s.mac.as_mut(), name.filter(|n| !n.is_empty())) {
                    mac.name = name;
                }
            });
            true
        }
        Some("state") => {
            reporter.update(|s| s.state = Some(message["state"].clone()));
            false
        }
        Some("idle") => {
            reporter.update(|s| s.state = None);
            false
        }
        _ => false,
    }
}

// ---- Tauri glue -------------------------------------------------------------

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    device_id: String,
    pairing: Option<Pairing>,
}

fn stored_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("connect-link.json"))
}

fn load(app: &tauri::AppHandle) -> Result<Stored, String> {
    let path = stored_path(app)?;
    let mut stored = std::fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str::<Stored>(&t).ok())
        .unwrap_or_default();
    if stored.device_id.is_empty() {
        stored.device_id = uuid::Uuid::new_v4().to_string();
        save(app, &stored)?;
    }
    Ok(stored)
}

fn save(app: &tauri::AppHandle, stored: &Stored) -> Result<(), String> {
    let path = stored_path(app)?;
    let text = serde_json::to_string(stored).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn phone_name() -> String {
    #[cfg(target_os = "android")]
    if let Ok(out) = std::process::Command::new("getprop").arg("ro.product.model").output() {
        let name: String = String::from_utf8_lossy(&out.stdout).trim().chars().take(64).collect();
        if !name.is_empty() {
            return name;
        }
    }
    "VAYRA".into()
}

fn link_slot() -> &'static Mutex<Option<Link>> {
    static SLOT: std::sync::OnceLock<Mutex<Option<Link>>> = std::sync::OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn start_link(app: &tauri::AppHandle, stored: &Stored, pairing: Pairing) -> LinkStatus {
    use tauri::Emitter;
    let emitter = app.clone();
    let me = Me { device_id: stored.device_id.clone(), name: phone_name() };
    let link = Link::start(pairing, me, Arc::new(move |status| {
        let _ = emitter.emit(STATUS_EVENT, status);
    }));
    let status = link.status();
    *lock(link_slot()) = Some(link);
    status
}

/// The Mac a pairing link points to, to confirm before pairing.
#[tauri::command]
pub fn connect_link_read(url: String) -> Result<PairedMac, String> {
    let pairing = parse_pairing(&url).ok_or("Not a VAYRA Connect pairing code")?;
    Ok(PairedMac { name: pairing.name, address: pairing.address.to_string() })
}

/// Pairs with the Mac in the link, replacing any previous one.
#[tauri::command]
pub async fn connect_link_pair(app: tauri::AppHandle, url: String) -> Result<LinkStatus, String> {
    let pairing = parse_pairing(&url).ok_or("Not a VAYRA Connect pairing code")?;
    let mut stored = load(&app)?;
    stored.pairing = Some(pairing.clone());
    save(&app, &stored)?;
    Ok(start_link(&app, &stored, pairing))
}

/// Connects to the paired Mac if not already, or retries right away.
#[tauri::command]
pub async fn connect_link_start(app: tauri::AppHandle) -> Result<LinkStatus, String> {
    if let Some(link) = lock(link_slot()).as_ref() {
        link.retry_now();
        return Ok(link.status());
    }
    let stored = load(&app)?;
    Ok(match stored.pairing.clone() {
        Some(pairing) => start_link(&app, &stored, pairing),
        None => LinkStatus::default(),
    })
}

#[tauri::command]
pub async fn connect_link_forget(app: tauri::AppHandle) -> Result<(), String> {
    lock(link_slot()).take();
    let mut stored = load(&app)?;
    stored.pairing = None;
    save(&app, &stored)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn reads_the_code_the_mac_shows() {
        let pairing = parse_pairing(&format!("vayra://connect/pair#h=192.168.1.85:11472&k={SECRET}&n=MacBook+d%27%C3%89lie&id=x"));
        assert_eq!(
            pairing,
            Some(Pairing { address: "192.168.1.85:11472".parse().unwrap(), secret: SECRET.into(), name: "MacBook d'Élie".into() })
        );
    }

    #[test]
    fn refuses_codes_off_the_local_network_or_malformed() {
        let code = |h: &str, k: &str| format!("vayra://connect/pair#h={h}&k={k}&n=Mac");
        assert!(parse_pairing(&code("10.0.2.2:11472", SECRET)).is_some());
        assert!(parse_pairing(&code("100.101.102.103:11472", SECRET)).is_some());
        assert!(parse_pairing(&code("8.8.8.8:11472", SECRET)).is_none());
        assert!(parse_pairing(&code("mac.example.com:11472", SECRET)).is_none());
        assert!(parse_pairing(&code("192.168.1.85:11472", "short")).is_none());
        assert!(parse_pairing(&format!("vayra://connect/pair?h=192.168.1.85:11472&k={SECRET}")).is_none());
        assert!(parse_pairing(&format!("vayra://vara/invite#h=192.168.1.85:11472&k={SECRET}")).is_none());
    }

    #[cfg(desktop)]
    #[tokio::test]
    async fn follows_the_mac_and_comes_back_after_it_restarts() {
        use crate::connect::Server;
        let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let addr: SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
        let start_mac = || Server::start(addr, SECRET.into(), "mac-1".into(), "MacBook".into(), Arc::new(|_| {}));
        let mut mac = start_mac().await.unwrap();

        let (tx, mut statuses) = tokio::sync::mpsc::unbounded_channel::<LinkStatus>();
        let pairing = Pairing { address: addr, secret: SECRET.into(), name: "Mac".into() };
        let me = Me { device_id: "pixel".into(), name: "Pixel 6".into() };
        let link = Link::start(pairing, me, Arc::new(move |s| drop(tx.send(s))));
        let mut until = async |want: &dyn Fn(&LinkStatus) -> bool| loop {
            let status = tokio::time::timeout(Duration::from_secs(5), statuses.recv()).await.unwrap().unwrap();
            if want(&status) {
                return status;
            }
        };

        let hello = until(&|s| s.connected).await;
        assert_eq!(hello.mac.unwrap().name, "MacBook");
        assert_eq!(mac.phones()[0].name, "Pixel 6");

        mac.publish(Some(json!({ "status": "playing", "positionSec": 12.0 })));
        assert_eq!(until(&|s| s.state.is_some()).await.state.unwrap()["positionSec"], 12.0);

        mac.stop();
        assert!(until(&|s| !s.connected).await.state.is_none());
        mac = start_mac().await.unwrap();
        link.retry_now();
        until(&|s| s.connected).await;
        mac.stop();
    }
}
