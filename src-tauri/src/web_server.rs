use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use axum::body::Body;
use axum::extract::{ConnectInfo, Request};
use axum::http::{header, HeaderValue, Response, StatusCode};
use tauri::AppHandle;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

pub const WEB_PORT: u16 = 11471;
const COOKIE_NAME: &str = "harbor_web_token";

static RUNNING: AtomicBool = AtomicBool::new(false);

fn shutdown_slot() -> &'static Mutex<Option<oneshot::Sender<()>>> {
    static S: OnceLock<Mutex<Option<oneshot::Sender<()>>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

/// Jeton d'acces partage du serveur web, stable pour la duree du process.
/// Les requetes loopback (meme machine) en sont exemptees ; les requetes LAN
/// doivent le presenter (via ?token=... puis cookie) sous peine de 401.
fn web_token() -> &'static str {
    static TOKEN: OnceLock<String> = OnceLock::new();
    TOKEN.get_or_init(|| uuid::Uuid::new_v4().simple().to_string())
}

/// Valeur d'un parametre `key` dans une query string (`a=1&b=2`).
fn query_value(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let mut it = pair.splitn(2, '=');
        if it.next() == Some(key) {
            it.next().map(|v| v.to_string())
        } else {
            None
        }
    })
}

/// Valeur d'un cookie `key` dans l'en-tete Cookie (`a=1; b=2`).
fn cookie_value(cookies: &str, key: &str) -> Option<String> {
    cookies.split(';').find_map(|c| {
        let mut it = c.trim().splitn(2, '=');
        if it.next() == Some(key) {
            it.next().map(|v| v.to_string())
        } else {
            None
        }
    })
}

fn unauthorized() -> Response<Body> {
    Response::builder()
        .status(StatusCode::UNAUTHORIZED)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Body::from(
            "Harbor: access token required. Open the link shown in Harbor \u{2192} \
             Settings \u{2192} \"Your streaming server address\".",
        ))
        .unwrap()
}

fn serve_asset(app: &AppHandle, raw_path: &str) -> Response<Body> {
    let resolver = app.asset_resolver();
    let path = if raw_path == "/" || raw_path.is_empty() {
        "/index.html".to_string()
    } else {
        raw_path.to_string()
    };
    let asset = resolver
        .get(path.clone())
        .or_else(|| resolver.get("/index.html".to_string()));
    match asset {
        Some(a) => {
            let cache = if path.ends_with(".html") || path == "/index.html" {
                "no-cache"
            } else {
                "public, max-age=31536000, immutable"
            };
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, a.mime_type)
                .header(header::CACHE_CONTROL, cache)
                .body(Body::from(a.bytes))
                .unwrap()
        }
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(
                "Harbor web assets are not available in this build.",
            ))
            .unwrap(),
    }
}

#[tauri::command]
pub async fn web_serve_start(app: AppHandle) -> Result<u16, String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(WEB_PORT);
    }
    let listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], WEB_PORT)))
        .await
        .map_err(|e| format!("port {} unavailable: {}", WEB_PORT, e))?;
    let (tx, rx) = oneshot::channel::<()>();
    *shutdown_slot().lock().unwrap() = Some(tx);
    RUNNING.store(true, Ordering::SeqCst);
    let app_for_routes = app.clone();
    let router = axum::Router::new().fallback(move |req: Request| {
        let app = app_for_routes.clone();
        async move {
            let token = web_token();
            // Exempte les requetes de la meme machine (loopback) : ouvrir l'UI sur ce
            // PC ne demande pas de jeton. Le reste du LAN doit l'avoir.
            let is_loopback = req
                .extensions()
                .get::<ConnectInfo<SocketAddr>>()
                .map(|c| c.0.ip().is_loopback())
                .unwrap_or(false);
            let from_query = req
                .uri()
                .query()
                .and_then(|q| query_value(q, "token"));
            let from_cookie = req
                .headers()
                .get(header::COOKIE)
                .and_then(|c| c.to_str().ok())
                .and_then(|c| cookie_value(c, COOKIE_NAME));
            let authed = is_loopback
                || from_query.as_deref() == Some(token)
                || from_cookie.as_deref() == Some(token);
            if !authed {
                return unauthorized();
            }
            let mut resp = serve_asset(&app, req.uri().path());
            // Premiere navigation LAN via ?token=... : pose le cookie pour que les
            // requetes d'assets suivantes (sans la query) restent autorisees.
            if !is_loopback && from_query.as_deref() == Some(token) {
                if let Ok(v) = HeaderValue::from_str(&format!(
                    "{}={}; Path=/; HttpOnly; SameSite=Lax",
                    COOKIE_NAME, token
                )) {
                    resp.headers_mut().insert(header::SET_COOKIE, v);
                }
            }
            resp
        }
    });
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async {
            let _ = rx.await;
        })
        .await;
        RUNNING.store(false, Ordering::SeqCst);
    });
    eprintln!("[web-serve] Harbor web UI listening on 0.0.0.0:{}", WEB_PORT);
    Ok(WEB_PORT)
}

#[tauri::command]
pub fn web_serve_stop() {
    if let Some(tx) = shutdown_slot().lock().unwrap().take() {
        let _ = tx.send(());
    }
}

#[tauri::command]
pub fn web_serve_status() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

/// Jeton a ajouter (`?token=...`) aux URL LAN du serveur web pour s'y connecter
/// depuis un autre appareil. Les URL loopback (127.0.0.1) n'en ont pas besoin.
#[tauri::command]
pub fn web_serve_token() -> String {
    web_token().to_string()
}
