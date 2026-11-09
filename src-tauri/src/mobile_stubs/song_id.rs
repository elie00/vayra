#[tauri::command]
pub fn recognize_now_playing() -> Result<(), String> {
    Err("not supported on Android".into())
}
