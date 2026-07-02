//! Stub Android : picture-in-picture fenêtré (desktop-only).

pub struct PipState;

impl PipState {
    pub fn new() -> Self {
        Self
    }
}

#[tauri::command]
pub fn pip_open() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn pip_get_session() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn pip_close() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn pip_publish_state() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn window_pip_enter() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn window_pip_exit() -> Result<(), String> {
    Err("not supported on Android".into())
}
