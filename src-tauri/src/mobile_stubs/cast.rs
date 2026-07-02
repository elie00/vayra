//! Stub Android : Chromecast/DLNA/Roku/AirPlay (dépend de rust_cast/mdns, desktop-only).

#[tauri::command]
pub fn cast_discover() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn cast_load() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn cast_play() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn cast_pause() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn cast_seek() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn cast_stop() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn cast_status() -> Result<(), String> {
    Err("not supported on Android".into())
}
