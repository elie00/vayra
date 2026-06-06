use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const PROBE_URL: &str = "http://127.0.0.1:11470/settings";
const READY_DEADLINE: Duration = Duration::from_secs(20);
const RESTART_BACKOFF: Duration = Duration::from_secs(3);
const MAX_AUTO_RESTARTS: u32 = 3;

#[derive(Clone, Debug, serde::Serialize)]
pub struct CastServerStatus {
    pub bundled: bool,
    pub running: bool,
    pub ready: bool,
    pub last_error: Option<String>,
    pub restart_count: u32,
}

struct State {
    child: Option<CommandChild>,
    ready: bool,
    last_error: Option<String>,
    restart_count: u32,
    bundled: bool,
    last_spawn: Option<Instant>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            child: None,
            ready: false,
            last_error: None,
            restart_count: 0,
            bundled: false,
            last_spawn: None,
        }
    }
}

fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(State::default()))
}

pub fn start(app: &AppHandle) {
    spawn_once(app);
}

fn spawn_once(app: &AppHandle) {
    let sidecar = match app.shell().sidecar("stremio-server") {
        Ok(s) => s,
        Err(e) => {
            let msg = format!("stremio-server binary not bundled: {}", e);
            eprintln!("[cast-server] {}", msg);
            let mut st = state().lock().unwrap();
            st.bundled = false;
            st.last_error = Some(msg);
            return;
        }
    };
    let sidecar = match locate_ffmpeg_for_sidecar() {
        Some(p) => {
            eprintln!("[cast-server] using FFMPEG_BIN={}", p.display());
            sidecar.env("FFMPEG_BIN", p.to_string_lossy().to_string())
        }
        None => {
            eprintln!("[cast-server] ffmpeg not located; HLS transcode endpoints will 500");
            sidecar
        }
    };
    let sidecar = match locate_ffprobe_for_sidecar() {
        Some(p) => {
            eprintln!("[cast-server] using FFPROBE_BIN={}", p.display());
            sidecar.env("FFPROBE_BIN", p.to_string_lossy().to_string())
        }
        None => {
            eprintln!("[cast-server] ffprobe not located; HLS probe will fail");
            sidecar
        }
    };
    {
        let mut st = state().lock().unwrap();
        st.bundled = true;
        st.last_spawn = Some(Instant::now());
    }
    let (mut rx, child) = match sidecar.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            let msg = format!("spawn failed: {}", e);
            eprintln!("[cast-server] {}", msg);
            let mut st = state().lock().unwrap();
            st.last_error = Some(msg);
            return;
        }
    };
    {
        let mut st = state().lock().unwrap();
        st.child = Some(child);
        st.ready = false;
        st.last_error = None;
    }
    let app_for_watch = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let s = String::from_utf8_lossy(&line);
                    if s.trim().is_empty() {
                        continue;
                    }
                    if s.len() < 400 {
                        eprintln!("[cast-server] stdout: {}", s.trim());
                    }
                }
                CommandEvent::Stderr(line) => {
                    let s = String::from_utf8_lossy(&line);
                    if s.trim().is_empty() {
                        continue;
                    }
                    if s.len() < 400 {
                        eprintln!("[cast-server] stderr: {}", s.trim());
                    }
                }
                CommandEvent::Terminated(payload) => {
                    let exit_code = payload.code.unwrap_or(-1);
                    eprintln!("[cast-server] terminated with code {}", exit_code);
                    let should_restart = {
                        let mut st = state().lock().unwrap();
                        st.child = None;
                        st.ready = false;
                        st.last_error = Some(format!("exited with code {}", exit_code));
                        if st.restart_count < MAX_AUTO_RESTARTS {
                            st.restart_count += 1;
                            true
                        } else {
                            eprintln!("[cast-server] hit max restarts, giving up");
                            false
                        }
                    };
                    if should_restart {
                        tokio::time::sleep(RESTART_BACKOFF).await;
                        spawn_once(&app_for_watch);
                    }
                    break;
                }
                CommandEvent::Error(err) => {
                    eprintln!("[cast-server] error: {}", err);
                }
                _ => {}
            }
        }
    });
    tauri::async_runtime::spawn(async move {
        let started = Instant::now();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .ok();
        let Some(client) = client else {
            return;
        };
        while started.elapsed() < READY_DEADLINE {
            tokio::time::sleep(Duration::from_millis(400)).await;
            if let Ok(resp) = client.get(PROBE_URL).send().await {
                if resp.status().is_success() {
                    let mut st = state().lock().unwrap();
                    st.ready = true;
                    eprintln!("[cast-server] ready in {:?}", started.elapsed());
                    return;
                }
            }
        }
        let mut st = state().lock().unwrap();
        st.last_error = Some("did not become ready within 20s".to_string());
        eprintln!("[cast-server] did not become ready within 20s");
    });
}

pub fn stop() {
    let child_opt = {
        let mut st = state().lock().unwrap();
        st.ready = false;
        st.child.take()
    };
    if let Some(child) = child_opt {
        let _ = child.kill();
        eprintln!("[cast-server] killed on shutdown");
    }
}

#[tauri::command]
pub fn cast_server_status() -> CastServerStatus {
    let st = state().lock().unwrap();
    CastServerStatus {
        bundled: st.bundled,
        running: st.child.is_some(),
        ready: st.ready,
        last_error: st.last_error.clone(),
        restart_count: st.restart_count,
    }
}

#[tauri::command]
pub fn cast_server_restart(app: AppHandle) -> Result<(), String> {
    stop();
    {
        let mut st = state().lock().unwrap();
        st.restart_count = 0;
        st.last_error = None;
    }
    start(&app);
    Ok(())
}

fn kill_orphan_sidecars() {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/FI", "IMAGENAME eq stremio-server*"])
            .creation_flags(0x0800_0000)
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("pkill").args(["-f", "stremio-server"]).output();
    }
}

pub fn ensure_started_on_setup(app: &AppHandle) {
    kill_orphan_sidecars();
    start(app);
}

#[tauri::command]
pub fn stop_stremio_sidecar() {
    kill_orphan_sidecars();
}

fn locate_ffmpeg_for_sidecar() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let stremio_ff = std::path::PathBuf::from(local)
                .join(r"Programs\LNV\Stremio-4\ffmpeg.exe");
            if stremio_ff.is_file() {
                return Some(stremio_ff);
            }
        }
    }
    crate::transcode::locate_ffmpeg()
}

fn locate_ffprobe_for_sidecar() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let stremio_fp = std::path::PathBuf::from(local)
                .join(r"Programs\LNV\Stremio-4\ffprobe.exe");
            if stremio_fp.is_file() {
                return Some(stremio_fp);
            }
        }
    }
    crate::transcode::locate_ffprobe()
}
