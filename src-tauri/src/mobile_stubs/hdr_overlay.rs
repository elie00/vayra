//! Stub Android : overlay HDR (fenêtre auxiliaire, desktop-only).

#[tauri::command]
pub fn hdr_overlay_open() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn hdr_overlay_close() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn hdr_overlay_sync() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn hdr_overlay_emit_props() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn hdr_overlay_emit_action() -> Result<(), String> {
    Err("not supported on Android".into())
}
