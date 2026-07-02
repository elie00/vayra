//! Stub Android : fenêtre navigateur intégrée (desktop-only).

#[tauri::command]
pub fn browser_open() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn browser_close() -> Result<(), String> {
    Err("not supported on Android".into())
}
