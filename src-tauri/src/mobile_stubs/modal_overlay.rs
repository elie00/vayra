//! Stub Android : overlay modal (fenêtre auxiliaire, desktop-only).

pub struct ModalOverlayState;

impl ModalOverlayState {
    pub fn new() -> Self {
        Self
    }
}

#[tauri::command]
pub fn modal_overlay_open() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn modal_overlay_close() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn modal_overlay_emit_state() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn modal_overlay_emit_action() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn modal_overlay_sync() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn modal_overlay_get_pending() -> Result<(), String> {
    Err("not supported on Android".into())
}
