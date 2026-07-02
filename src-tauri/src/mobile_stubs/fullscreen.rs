//! Stub Android : plein écran natif de fenêtre (API desktop-only).
//! Le plein écran mobile est géré côté frontend (Fullscreen API du webview).

pub struct FullscreenState;

impl FullscreenState {
    pub fn new() -> Self {
        Self
    }
}

#[tauri::command]
pub fn window_fullscreen_enter() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn window_fullscreen_exit() -> Result<(), String> {
    Err("not supported on Android".into())
}
