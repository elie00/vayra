#[tauri::command]
pub fn subtitle_extract() -> Result<(), String> {
    Err("not supported on Android".into())
}
