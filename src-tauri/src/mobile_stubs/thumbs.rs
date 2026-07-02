//! Stub Android : vignettes de survol (dépend de mpv/ffmpeg, desktop-only).

pub struct ThumbsState;

impl ThumbsState {
    pub fn new() -> Self {
        Self
    }
}

#[tauri::command]
pub fn thumbs_set_url() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn thumbs_spawn_eager() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn thumbs_get() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn thumbs_stop() -> Result<(), String> {
    Err("not supported on Android".into())
}
