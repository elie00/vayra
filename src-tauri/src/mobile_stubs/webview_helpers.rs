//! Stub Android : réglages de transparence webview (desktop-only).

#[tauri::command]
pub fn webview_reapply_transparency() -> Result<(), String> {
    Err("not supported on Android".into())
}
