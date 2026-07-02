//! Stub Android : SmoothVideo Project (desktop-only).

#[tauri::command]
pub fn svp_status() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn svp_launch() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn svp_apply() -> Result<(), String> {
    Err("not supported on Android".into())
}
