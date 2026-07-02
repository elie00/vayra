//! Stub Android : multiview (multi-fenêtres mpv, desktop-only).

pub struct MultiviewState;

impl MultiviewState {
    pub fn new() -> Self {
        Self
    }
}

#[tauri::command]
pub fn multiview_open() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn multiview_prespawn() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn multiview_geometry() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn multiview_audio_focus() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn multiview_close() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn multiview_visibility() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn multiview_stop_all() -> Result<(), String> {
    Err("not supported on Android".into())
}
