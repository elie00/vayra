//! Stub Android : DVR / enregistrement (dépend de ffmpeg, desktop-only).

pub struct DvrState;

impl DvrState {
    pub fn new() -> Self {
        Self
    }
}

#[tauri::command]
pub fn dvr_start() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn dvr_stop() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn dvr_list() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn dvr_default_dir() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn dvr_reveal() -> Result<(), String> {
    Err("not supported on Android".into())
}
