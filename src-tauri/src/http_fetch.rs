use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const MAX_PRE_CANCELLED: usize = 128;

#[derive(Default)]
struct InflightRegistry {
    active: HashMap<u64, oneshot::Sender<()>>,
    pre_cancelled: VecDeque<u64>,
}

impl InflightRegistry {
    fn register(&mut self, id: u64) -> Option<oneshot::Receiver<()>> {
        if let Some(pos) = self.pre_cancelled.iter().position(|&x| x == id) {
            self.pre_cancelled.remove(pos);
            return None;
        }
        let (tx, rx) = oneshot::channel();
        self.active.insert(id, tx);
        Some(rx)
    }

    fn cancel(&mut self, id: u64) -> bool {
        if let Some(tx) = self.active.remove(&id) {
            let _ = tx.send(());
            return true;
        }
        if !self.pre_cancelled.contains(&id) {
            if self.pre_cancelled.len() >= MAX_PRE_CANCELLED {
                self.pre_cancelled.pop_front();
            }
            self.pre_cancelled.push_back(id);
        }
        false
    }

    fn finish(&mut self, id: u64) {
        self.active.remove(&id);
    }
}

fn inflight_registry() -> &'static Mutex<InflightRegistry> {
    static REGISTRY: OnceLock<Mutex<InflightRegistry>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(InflightRegistry::default()))
}

struct InflightGuard(u64);

impl Drop for InflightGuard {
    fn drop(&mut self) {
        if let Ok(mut reg) = inflight_registry().lock() {
            reg.finish(self.0);
        }
    }
}

fn shared_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .no_proxy()
                .tcp_nodelay(true)
                .connect_timeout(Duration::from_secs(8))
                .pool_max_idle_per_host(16)
                .pool_idle_timeout(Duration::from_secs(90))
                .build()
                .map_err(|e| format!("client: {}", e))
        })
        .as_ref()
        .map_err(|e| e.clone())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VayraFetchArgs {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
    pub request_id: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VayraFetchResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
    pub content_type: Option<String>,
    pub content_length: Option<String>,
}

fn parse_http_url(raw: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(raw).map_err(|e| format!("url: {}", e))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("scheme not allowed: {}", parsed.scheme()));
    }
    Ok(parsed)
}

fn parse_method(raw: Option<&str>) -> Result<reqwest::Method, String> {
    let method = raw.unwrap_or("GET").to_uppercase();
    reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| format!("method: {}", e))
}

#[tauri::command]
pub fn vayra_fetch_cancel(request_id: u64) -> bool {
    inflight_registry()
        .lock()
        .map(|mut reg| reg.cancel(request_id))
        .unwrap_or(false)
}

async fn execute_request(
    req: reqwest::RequestBuilder,
    is_head: bool,
) -> Result<VayraFetchResponse, String> {
    let res = req.send().await.map_err(|e| format!("send: {}", e))?;
    let status = res.status().as_u16();
    let ok = res.status().is_success();
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let content_length = res
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let body = if is_head {
        String::new()
    } else {
        res.text().await.unwrap_or_default()
    };

    Ok(VayraFetchResponse {
        status,
        ok,
        body,
        content_type,
        content_length,
    })
}

#[tauri::command]
pub async fn vayra_fetch(args: VayraFetchArgs) -> Result<VayraFetchResponse, String> {
    // N'autoriser que http/https : empêche cette primitive de fetch natif (qui
    // contourne CORS) d'atteindre des schémas locaux/dangereux (file://, etc.).
    // On ne bloque PAS les IP privées/loopback : des addons Stremio légitimes
    // tournent en local (127.0.0.1 / LAN).
    let parsed_url = parse_http_url(&args.url)?;

    let (cancel_rx, _guard) = match args.request_id {
        Some(id) => {
            let rx = inflight_registry()
                .lock()
                .map_err(|_| "registry poisoned".to_string())?
                .register(id);
            match rx {
                Some(rx) => (Some(rx), Some(InflightGuard(id))),
                None => return Err("aborted".to_string()),
            }
        }
        None => (None, None),
    };

    let timeout = Duration::from_millis(args.timeout_ms.unwrap_or(15_000).clamp(500, 60_000));
    let client = shared_client()?;
    let parsed_method = parse_method(args.method.as_deref())?;
    let is_head = parsed_method == reqwest::Method::HEAD;

    let mut req = client.request(parsed_method, parsed_url).timeout(timeout);

    let mut has_user_agent = false;
    let mut has_accept = false;
    let mut has_accept_language = false;
    if let Some(headers) = args.headers {
        for (k, v) in headers {
            if k.eq_ignore_ascii_case("user-agent") {
                has_user_agent = true;
            } else if k.eq_ignore_ascii_case("accept") {
                has_accept = true;
            } else if k.eq_ignore_ascii_case("accept-language") {
                has_accept_language = true;
            }
            req = req.header(k, v);
        }
    }
    if !has_user_agent {
        req = req.header("User-Agent", BROWSER_UA);
    }
    if !has_accept {
        req = req.header("Accept", "application/json, text/plain, */*");
    }
    if !has_accept_language {
        req = req.header("Accept-Language", "en-US,en;q=0.9");
    }

    if let Some(body) = args.body {
        req = req.body(body);
    }

    if let Some(rx) = cancel_rx {
        tokio::select! {
            biased;
            _ = rx => Err("aborted".to_string()),
            res = execute_request(req, is_head) => res,
        }
    } else {
        execute_request(req, is_head).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_http_and_https_urls() {
        assert_eq!(
            parse_http_url("https://example.com/addon")
                .unwrap()
                .scheme(),
            "https"
        );
        assert_eq!(
            parse_http_url("http://127.0.0.1:11470/manifest.json")
                .unwrap()
                .scheme(),
            "http"
        );
        assert_eq!(
            parse_http_url("file:///etc/passwd").unwrap_err(),
            "scheme not allowed: file"
        );
        assert!(parse_http_url("not a url")
            .unwrap_err()
            .starts_with("url: "));
    }

    #[test]
    fn parses_methods_case_insensitively_and_defaults_to_get() {
        assert_eq!(parse_method(None).unwrap(), reqwest::Method::GET);
        assert_eq!(parse_method(Some("post")).unwrap(), reqwest::Method::POST);
        assert_eq!(parse_method(Some("pAtCh")).unwrap(), reqwest::Method::PATCH);
        assert!(parse_method(Some("bad method"))
            .unwrap_err()
            .starts_with("method: "));
    }

    #[test]
    fn reuses_a_single_pooled_http_client() {
        let a = shared_client().unwrap() as *const reqwest::Client;
        let b = shared_client().unwrap() as *const reqwest::Client;
        assert_eq!(a, b);
    }

    #[test]
    fn cancels_active_and_pre_cancelled_requests() {
        let mut reg = InflightRegistry::default();
        let mut rx = reg.register(7).expect("first registration succeeds");
        assert!(reg.cancel(7));
        assert!(rx.try_recv().is_ok());

        // Pre-cancel before registration: register must immediately report cancelled.
        assert!(!reg.cancel(9));
        assert!(reg.register(9).is_none());
        // Consumed once; a subsequent unrelated registration works.
        assert!(reg.register(9).is_some());
        reg.finish(9);
        assert!(!reg.cancel(9));
    }
}
