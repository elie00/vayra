//! Stub Android : mesure mémoire du process (desktop-only).

#[tauri::command]
pub fn harbor_process_memory() -> Result<(), String> {
    Err("not supported on Android".into())
}
