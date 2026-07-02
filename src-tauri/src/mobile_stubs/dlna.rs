//! Stub Android : découverte réseau DLNA (desktop-only).

#[tauri::command]
pub fn lan_ip() -> Result<(), String> {
    Err("not supported on Android".into())
}
