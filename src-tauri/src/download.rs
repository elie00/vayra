use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;
use tokio::io::AsyncWriteExt;

pub struct DownloadState {
    tasks: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl DownloadState {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DownloadEvent {
    Started { total: Option<u64>, resumed: u64 },
    Progress { received: u64, total: Option<u64> },
    Done { received: u64 },
    Error { message: String },
    Canceled { received: u64 },
}

enum DownloadEnd {
    Canceled(u64),
    Failed(String),
}

const EMIT_INTERVAL_MS: u128 = 250;
const EMIT_BYTES: u64 = 4 * 1024 * 1024;
const MIN_VIDEO_BYTES: u64 = 512 * 1024;
const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

fn total_from_content_range(value: &str) -> Option<u64> {
    value.rsplit('/').next().and_then(|s| s.trim().parse::<u64>().ok())
}

fn valid_partial_range(value: &str, offset: u64, declared: Option<u64>) -> Option<u64> {
    let (range, total) = value.strip_prefix("bytes ")?.split_once('/')?;
    let (start, end) = range.split_once('-')?;
    let start = start.parse::<u64>().ok()?;
    let end = end.parse::<u64>().ok()?;
    let total = total.parse::<u64>().ok()?;
    if start != offset || end < start || end >= total { return None; }
    if declared.is_some_and(|n| n != end - start + 1) { return None; }
    Some(total)
}

#[tauri::command]
pub async fn download_start(
    state: State<'_, DownloadState>,
    id: String,
    url: String,
    dest: String,
    headers: Option<HashMap<String, String>>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    state.tasks.lock().unwrap().insert(id.clone(), cancel.clone());

    let outcome = run_download(&url, &dest, &headers.unwrap_or_default(), &cancel, &on_event).await;
    state.tasks.lock().unwrap().remove(&id);

    match outcome {
        Ok(()) => Ok(()),
        Err(DownloadEnd::Canceled(received)) => {
            let _ = on_event.send(DownloadEvent::Canceled { received });
            Ok(())
        }
        Err(DownloadEnd::Failed(message)) => {
            let _ = on_event.send(DownloadEvent::Error {
                message: message.clone(),
            });
            Err(message)
        }
    }
}

/// Delete a finished or half-written download from disk.
///
/// The frontend cannot do this itself: the fs plugin is scoped to the app's own
/// picture folder, so a `remove` on the user's download directory is refused, and
/// the file outlived the entry that was supposed to own it.
#[tauri::command]
pub async fn download_remove_file(dest: String) -> Result<(), String> {
    let part = format!("{}.part", dest);
    let mut failure: Option<String> = None;
    for path in [dest.as_str(), part.as_str()] {
        match tokio::fs::remove_file(path).await {
            Ok(()) => {}
            // Only one of the two is expected to be there at any point.
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => failure = Some(format!("{}: {}", path, e)),
        }
    }
    match failure {
        Some(e) => Err(e),
        None => Ok(()),
    }
}

/// Whether a path is already taken, so a new download can pick another name.
#[tauri::command]
pub async fn download_file_exists(path: String) -> bool {
    tokio::fs::metadata(&path).await.is_ok()
}

/// Read-only validation before opening a completed download. Partial files are
/// never eligible; matching size detects missing or truncated local copies.
#[tauri::command]
pub async fn download_file_valid(path: String, expected_bytes: u64) -> bool {
    if path.ends_with(".part") || expected_bytes == 0 { return false; }
    tokio::fs::metadata(path).await
        .map(|m| m.is_file() && m.len() == expected_bytes)
        .unwrap_or(false)
}

#[tauri::command]
pub async fn download_available_space(path: String) -> Result<u64, String> {
    #[cfg(target_os = "macos")]
    {
        tokio::task::spawn_blocking(move || {
            let path = std::ffi::CString::new(path).map_err(|_| "Invalid path".to_string())?;
            let mut info = std::mem::MaybeUninit::<libc::statvfs>::uninit();
            // statvfs initializes the structure only on success.
            if unsafe { libc::statvfs(path.as_ptr(), info.as_mut_ptr()) } != 0 {
                return Err("Storage information unavailable".to_string());
            }
            let info = unsafe { info.assume_init() };
            Ok((info.f_bavail as u64).saturating_mul(info.f_frsize as u64))
        }).await.map_err(|_| "Storage information unavailable".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = path; Err("Storage information unavailable".to_string()) }
}

#[tauri::command]
pub fn download_cancel(state: State<'_, DownloadState>, id: String) {
    if let Some(flag) = state.tasks.lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
}

async fn run_download(
    url: &str,
    dest: &str,
    headers: &HashMap<String, String>,
    cancel: &Arc<AtomicBool>,
    on_event: &Channel<DownloadEvent>,
) -> Result<(), DownloadEnd> {
    let part = format!("{}.part", dest);

    if let Some(parent) = std::path::Path::new(dest).parent() {
        if !parent.as_os_str().is_empty() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| DownloadEnd::Failed(format!("create folder: {}", e)))?;
        }
    }

    let start_byte = match tokio::fs::metadata(&part).await {
        Ok(meta) => meta.len(),
        Err(_) => 0,
    };

    let client = reqwest::Client::builder()
        .user_agent(BROWSER_UA)
        .build()
        .map_err(|e| DownloadEnd::Failed(format!("client: {}", e)))?;
    let has = |name: &str| headers.keys().any(|k| k.eq_ignore_ascii_case(name));
    let mut req = client.get(url);
    if !has("accept") {
        req = req.header(reqwest::header::ACCEPT, "*/*");
    }
    for (k, v) in headers {
        req = req.header(k.as_str(), v.as_str());
    }
    req = req.header(reqwest::header::ACCEPT_ENCODING, "identity");
    if start_byte > 0 {
        req = req.header(reqwest::header::RANGE, format!("bytes={}-", start_byte));
    } else if !has("range") {
        req = req.header(reqwest::header::RANGE, "bytes=0-");
    }
    eprintln!("[harbor::download] GET {} resume-from={}", log_host(url), start_byte);
    let resp = tokio::select! {
        biased;
        _ = wait_cancelled(cancel) => return Err(DownloadEnd::Canceled(start_byte)),
        r = req.send() => r.map_err(|e| DownloadEnd::Failed(format!("request: {}", e)))?,
    };
    let status = resp.status();
    eprintln!(
        "[harbor::download] status={} content-length={:?}",
        status.as_u16(),
        resp.content_length()
    );

    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && start_byte > 0 {
        let total = resp.headers().get(reqwest::header::CONTENT_RANGE)
            .and_then(|h| h.to_str().ok()).and_then(total_from_content_range);
        if total != Some(start_byte) || start_byte < MIN_VIDEO_BYTES {
            return Err(DownloadEnd::Failed("The source could not confirm the completed file size".to_string()));
        }
        tokio::fs::rename(&part, dest).await.map_err(|e| DownloadEnd::Failed(format!("rename: {}", e)))?;
        let _ = on_event.send(DownloadEvent::Done { received: start_byte });
        return Ok(());
    }
    if !status.is_success() {
        eprintln!("[harbor::download] upstream rejected: HTTP {}", status.as_u16());
        return Err(DownloadEnd::Failed(format!("HTTP {}", status.as_u16())));
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    let declared = resp.content_length();
    eprintln!("[harbor::download] content-type={} content-length={:?}", content_type, declared);
    let non_video = content_type.starts_with("text/")
        || content_type.contains("html")
        || content_type.contains("json")
        || content_type.contains("xml");
    if non_video || (start_byte == 0 && declared.map(|n| n < 65_536).unwrap_or(false)) {
        let body = resp.text().await.unwrap_or_default();
        let snippet: String = body.chars().take(500).collect();
        eprintln!(
            "[harbor::download] NON-VIDEO response ({} bytes): {}",
            body.len(),
            snippet
        );
        return Err(DownloadEnd::Failed(format!(
            "source returned a {} page, not the video: {}",
            if content_type.is_empty() { "small" } else { content_type.as_str() },
            snippet.chars().take(160).collect::<String>()
        )));
    }

    let resuming = start_byte > 0 && status == reqwest::StatusCode::PARTIAL_CONTENT;
    let total = if status == reqwest::StatusCode::PARTIAL_CONTENT {
        let total = resp.headers().get(reqwest::header::CONTENT_RANGE)
            .and_then(|h| h.to_str().ok()).and_then(|h| valid_partial_range(h, start_byte, declared))
            .ok_or_else(|| DownloadEnd::Failed("The source returned an invalid resume range".to_string()))?;
        Some(total)
    } else {
        resp.content_length()
    };

    let mut received = if resuming { start_byte } else { 0 };
    let file = if resuming {
        tokio::fs::OpenOptions::new().append(true).open(&part).await
    } else {
        tokio::fs::File::create(&part).await
    }
    .map_err(|e| DownloadEnd::Failed(format!("open: {}", e)))?;
    let mut writer = tokio::io::BufWriter::with_capacity(1 << 20, file);

    let _ = on_event.send(DownloadEvent::Started {
        total,
        resumed: received,
    });

    let mut stream = resp.bytes_stream();
    let mut last = Instant::now();
    let mut since: u64 = 0;
    loop {
        let next = tokio::select! {
            biased;
            _ = wait_cancelled(cancel) => {
                let _ = writer.flush().await;
                return Err(DownloadEnd::Canceled(received));
            }
            n = stream.next() => n,
        };
        let Some(chunk) = next else { break };
        let bytes = chunk.map_err(|e| DownloadEnd::Failed(format!("stream: {}", e)))?;
        writer
            .write_all(&bytes)
            .await
            .map_err(|e| DownloadEnd::Failed(format!("write: {}", e)))?;
        received += bytes.len() as u64;
        since += bytes.len() as u64;
        if last.elapsed().as_millis() >= EMIT_INTERVAL_MS || since >= EMIT_BYTES {
            let _ = on_event.send(DownloadEvent::Progress { received, total });
            last = Instant::now();
            since = 0;
        }
    }

    writer.flush().await.map_err(|e| DownloadEnd::Failed(format!("write: {}", e)))?;
    drop(writer);

    if total.is_some_and(|expected| expected != received) {
        return Err(DownloadEnd::Failed("The video is incomplete. Resume the download to continue.".to_string()));
    }

    if received < MIN_VIDEO_BYTES {
        eprintln!("[harbor::download] refusing {} bytes (not a video file)", received);
        let _ = tokio::fs::remove_file(&part).await;
        return Err(DownloadEnd::Failed(format!(
            "source returned only {} bytes, not the video (try a different source)",
            received
        )));
    }

    tokio::fs::rename(&part, dest)
        .await
        .map_err(|e| DownloadEnd::Failed(format!("rename: {}", e)))?;

    eprintln!("[harbor::download] done {} bytes -> {}", received, dest);
    let _ = on_event.send(DownloadEvent::Progress { received, total });
    let _ = on_event.send(DownloadEvent::Done { received });
    Ok(())
}

async fn wait_cancelled(cancel: &Arc<AtomicBool>) {
    while !cancel.load(Ordering::Relaxed) {
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

fn log_host(url: &str) -> String {
    match url.split_once("://") {
        Some((scheme, rest)) => format!("{}://{}/…", scheme, rest.split('/').next().unwrap_or("")),
        None => url.chars().take(48).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_exact_resume_ranges() {
        assert_eq!(valid_partial_range("bytes 500-999/1000", 500, Some(500)), Some(1000));
        assert_eq!(valid_partial_range("bytes 0-499/1000", 500, Some(500)), None);
        assert_eq!(valid_partial_range("bytes 500-1000/1000", 500, None), None);
        assert_eq!(valid_partial_range("bytes 500-999/1000", 500, Some(499)), None);
        assert_eq!(valid_partial_range("bytes */1000", 500, None), None);
    }

    #[tokio::test]
    async fn completed_copy_must_exist_and_match_recorded_size() {
        let path = std::env::temp_dir().join(format!("vayra-file-check-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        tokio::fs::write(&path, b"test-video").await.unwrap();
        let name = path.to_string_lossy().to_string();
        assert!(download_file_valid(name.clone(), 10).await);
        assert!(!download_file_valid(name.clone(), 11).await);
        assert!(!download_file_valid(format!("{}.part", name), 10).await);
        tokio::fs::remove_file(&path).await.unwrap();
        assert!(!download_file_valid(name, 10).await);
    }
}
