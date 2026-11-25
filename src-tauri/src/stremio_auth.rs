use axum::extract::Query;
use axum::http::header;
use axum::response::{Html, IntoResponse};
use axum::routing::get;
use axum::Router;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::TcpListener;
use tokio::sync::{oneshot, Mutex};

const AUTH_TIMEOUT: Duration = Duration::from_secs(600);
const GRACE_PERIOD: Duration = Duration::from_secs(15);

static ACTIVE_CANCEL: OnceLock<std::sync::Mutex<Option<oneshot::Sender<()>>>> = OnceLock::new();

fn replace_active_cancel(new_cancel: oneshot::Sender<()>) {
    let slot = ACTIVE_CANCEL.get_or_init(|| std::sync::Mutex::new(None));
    if let Ok(mut guard) = slot.lock() {
        if let Some(prev) = guard.replace(new_cancel) {
            let _ = prev.send(());
        }
    }
}

struct AuthServerHandle {
    port: u16,
    cancel: oneshot::Sender<()>,
}

// Filet de sécurité mobile : si la WebView est suspendue par l'OS pendant que
// l'utilisateur se connecte dans le navigateur externe, l'événement `stremio-auth`
// peut se perdre. La clé est donc aussi gardée ici et récupérable au retour au
// premier plan via `stremio_auth_take_key`.
#[derive(Default)]
pub struct PendingAuthKey(std::sync::Mutex<Option<String>>);

#[tauri::command]
pub fn stremio_auth_take_key(state: tauri::State<'_, PendingAuthKey>) -> Option<String> {
    state.0.lock().ok().and_then(|mut k| k.take())
}

const PAGE_OK: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>VAYRA</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;background:#0d0f14;color:#e9ebf2}.c{text-align:center;max-width:380px;padding:32px}h1{font-size:21px;margin:0 0 10px;font-weight:600}p{color:#9aa1ad;font-size:14px;line-height:1.55;margin:0}</style></head><body><div class="c"><h1>You're signed in</h1><p>You can close this tab and head back to VAYRA.</p></div></body></html>"#;

const PAGE_FAIL: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>VAYRA</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;background:#0d0f14;color:#e9ebf2}.c{text-align:center;max-width:380px;padding:32px}p{color:#9aa1ad;font-size:14px;line-height:1.55;margin:0}</style></head><body><div class="c"><p>No sign-in key came through. Return to VAYRA and try again.</p></div></body></html>"#;

async fn spawn_auth_server<F>(
    timeout: Duration,
    grace_period: Duration,
    on_key: F,
) -> Result<AuthServerHandle, String>
where
    F: Fn(String) + Send + Sync + 'static,
{
    let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
        .await
        .map_err(|e| format!("bind failed: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {}", e))?
        .port();

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    let (key_tx, key_rx) = oneshot::channel::<()>();
    let first_delivery = Arc::new(Mutex::new(Some(key_tx)));
    let on_key = Arc::new(on_key);

    let router = Router::new().route(
        "/cb",
        get(move |Query(params): Query<HashMap<String, String>>| {
            let first_delivery = first_delivery.clone();
            let on_key = on_key.clone();
            async move {
                let key = params
                    .get("key")
                    .or_else(|| params.get("authKey"))
                    .cloned()
                    .unwrap_or_default();
                if key.is_empty() {
                    return ([(header::CACHE_CONTROL, "no-store")], Html(PAGE_FAIL))
                        .into_response();
                }
                let first_tx = first_delivery.lock().await.take();
                if let Some(tx) = first_tx {
                    on_key(key);
                    let _ = tx.send(());
                }
                ([(header::CACHE_CONTROL, "no-store")], Html(PAGE_OK)).into_response()
            }
        }),
    );

    tokio::spawn(async move {
        let shutdown = async move {
            tokio::select! {
                _ = &mut cancel_rx => {}
                _ = tokio::time::sleep(timeout) => {}
                res = key_rx => {
                    if res.is_ok() {
                        tokio::select! {
                            _ = &mut cancel_rx => {}
                            _ = tokio::time::sleep(grace_period) => {}
                        }
                    }
                }
            }
        };
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(shutdown)
            .await;
    });

    Ok(AuthServerHandle {
        port,
        cancel: cancel_tx,
    })
}

#[tauri::command]
pub async fn stremio_auth_start(app: AppHandle) -> Result<u16, String> {
    if let Some(state) = app.try_state::<PendingAuthKey>() {
        if let Ok(mut slot) = state.0.lock() {
            *slot = None;
        }
    }

    let app_handle = app.clone();
    let handle = spawn_auth_server(AUTH_TIMEOUT, GRACE_PERIOD, move |key| {
        if let Some(state) = app_handle.try_state::<PendingAuthKey>() {
            if let Ok(mut slot) = state.0.lock() {
                *slot = Some(key.clone());
            }
        }
        let _ = app_handle.emit("stremio-auth", key);
    })
    .await?;

    replace_active_cancel(handle.cancel);
    Ok(handle.port)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpStream;

    #[tokio::test]
    async fn valid_callback_emits_key_once_and_serves_grace_window_reloads() {
        let emitted = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        let emitted_cb = emitted.clone();

        let handle = spawn_auth_server(
            Duration::from_secs(10),
            Duration::from_secs(2),
            move |key| {
                emitted_cb.lock().unwrap().push(key);
            },
        )
        .await
        .expect("spawn auth server");

        let client = reqwest::Client::new();
        let url = format!("http://127.0.0.1:{}/cb?key=test-auth-key", handle.port);

        let first = client.get(&url).send().await.expect("first callback request");
        assert_eq!(first.status(), reqwest::StatusCode::OK);
        assert_eq!(
            first
                .headers()
                .get(reqwest::header::CACHE_CONTROL)
                .and_then(|v| v.to_str().ok()),
            Some("no-store")
        );
        assert_eq!(first.text().await.unwrap(), PAGE_OK);
        assert_eq!(*emitted.lock().unwrap(), vec!["test-auth-key".to_string()]);

        tokio::time::sleep(Duration::from_millis(100)).await;

        let second = client
            .get(&url)
            .send()
            .await
            .expect("second callback within grace window");
        assert_eq!(second.status(), reqwest::StatusCode::OK);
        assert_eq!(
            second
                .headers()
                .get(reqwest::header::CACHE_CONTROL)
                .and_then(|v| v.to_str().ok()),
            Some("no-store")
        );
        assert_eq!(second.text().await.unwrap(), PAGE_OK);
        assert_eq!(*emitted.lock().unwrap(), vec!["test-auth-key".to_string()]);

        let _ = handle.cancel.send(());
    }

    #[tokio::test]
    async fn missing_key_returns_page_fail_without_shutting_down_listener() {
        let emitted = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        let emitted_cb = emitted.clone();

        let handle = spawn_auth_server(
            Duration::from_secs(10),
            Duration::from_secs(2),
            move |key| {
                emitted_cb.lock().unwrap().push(key);
            },
        )
        .await
        .expect("spawn auth server");

        let client = reqwest::Client::new();

        let fail_resp = client
            .get(format!("http://127.0.0.1:{}/cb", handle.port))
            .send()
            .await
            .expect("missing key request");
        assert_eq!(fail_resp.status(), reqwest::StatusCode::OK);
        assert_eq!(
            fail_resp
                .headers()
                .get(reqwest::header::CACHE_CONTROL)
                .and_then(|v| v.to_str().ok()),
            Some("no-store")
        );
        assert_eq!(fail_resp.text().await.unwrap(), PAGE_FAIL);
        assert!(emitted.lock().unwrap().is_empty());

        let ok_resp = client
            .get(format!(
                "http://127.0.0.1:{}/cb?authKey=recovered-key",
                handle.port
            ))
            .send()
            .await
            .expect("subsequent valid key request");
        assert_eq!(ok_resp.status(), reqwest::StatusCode::OK);
        assert_eq!(ok_resp.text().await.unwrap(), PAGE_OK);
        assert_eq!(*emitted.lock().unwrap(), vec!["recovered-key".to_string()]);

        let _ = handle.cancel.send(());
    }

    #[tokio::test]
    async fn grace_period_shuts_down_listener_after_window() {
        let handle = spawn_auth_server(
            Duration::from_secs(10),
            Duration::from_millis(150),
            |_| {},
        )
        .await
        .expect("spawn auth server");

        let client = reqwest::Client::new();
        let resp = client
            .get(format!("http://127.0.0.1:{}/cb?key=grace-key", handle.port))
            .send()
            .await
            .expect("first callback");
        assert_eq!(resp.status(), reqwest::StatusCode::OK);
        drop(resp);
        drop(client);

        tokio::time::sleep(Duration::from_millis(350)).await;

        let connect_res = TcpStream::connect(SocketAddr::from(([127, 0, 0, 1], handle.port))).await;
        assert!(
            connect_res.is_err(),
            "listener should be closed after grace period expires"
        );
    }

    #[tokio::test]
    async fn replace_active_cancel_stops_previous_listener() {
        let first = spawn_auth_server(AUTH_TIMEOUT, GRACE_PERIOD, |_| {})
            .await
            .expect("spawn first auth server");
        let first_port = first.port;
        replace_active_cancel(first.cancel);

        let second = spawn_auth_server(AUTH_TIMEOUT, GRACE_PERIOD, |_| {})
            .await
            .expect("spawn second auth server");
        let second_port = second.port;
        replace_active_cancel(second.cancel);

        tokio::time::sleep(Duration::from_millis(100)).await;

        let first_conn = TcpStream::connect(SocketAddr::from(([127, 0, 0, 1], first_port))).await;
        assert!(
            first_conn.is_err(),
            "previous listener should be stopped when replaced"
        );

        let second_conn = TcpStream::connect(SocketAddr::from(([127, 0, 0, 1], second_port))).await;
        assert!(
            second_conn.is_ok(),
            "new listener should remain active"
        );

        // Clean up the second listener from the global slot.
        if let Some(slot) = ACTIVE_CANCEL.get() {
            if let Ok(mut guard) = slot.lock() {
                if let Some(tx) = guard.take() {
                    let _ = tx.send(());
                }
            }
        }
    }
}
