//! Stub Android : shaders Anime4K (desktop-only, dépend de mpv).

#[tauri::command]
pub fn anime4k_dir() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn anime4k_download() -> Result<(), String> {
    Err("not supported on Android".into())
}
