//! Stub Android : serveur HTTP local pour le cast (desktop-only).

pub fn stop() {}

pub fn ensure_started_on_setup(_app: &tauri::AppHandle) {}

#[tauri::command]
pub fn cast_server_status() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn cast_server_restart() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn stop_stremio_sidecar() {}
#[tauri::command]
pub fn cast_server_stop() {}
