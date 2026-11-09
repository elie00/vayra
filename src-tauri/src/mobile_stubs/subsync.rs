#[tauri::command]
pub fn sync_subtitle() -> Result<(), String> {
    Err("not supported on Android".into())
}

pub mod moviehash {
    #[tauri::command]
    pub fn compute_moviehash() -> Result<(), String> {
        Err("not supported on Android".into())
    }
}
