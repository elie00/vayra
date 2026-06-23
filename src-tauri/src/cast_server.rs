use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandChild;



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
    user_stopped: bool,
}

impl Default for State {
    fn default() -> Self {
        Self {
            child: None,
            ready: false,
            last_error: None,
            restart_count: 0,
            bundled: false,
            user_stopped: false,
        }
    }
}

fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(State::default()))
}

pub fn start(app: &AppHandle) {
    {
        let mut st = state().lock().unwrap();
        st.user_stopped = false;
    }
    spawn_once(app);
}

fn spawn_once(_app: &AppHandle) {
    // No-op under Plan B (stremio-server sidecar dependency dropped).
}

pub fn stop() {
    {
        let mut st = state().lock().unwrap();
        st.ready = false;
        st.child.take();
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

pub fn ensure_started_on_setup(_app: &AppHandle) {
    kill_orphan_sidecars();
}

#[tauri::command]
pub fn stop_stremio_sidecar() {
    kill_orphan_sidecars();
}

#[tauri::command]
pub fn cast_server_stop() {
    {
        let mut st = state().lock().unwrap();
        st.user_stopped = true;
        st.last_error = None;
    }
    stop();
    kill_orphan_sidecars();
}


