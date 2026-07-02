//! Stub Android : lecteur mpv natif (desktop-only).
//! Les commandes existent pour garder generate_handler! identique mais échouent.

pub struct MpvState;

impl MpvState {
    pub fn new() -> Self {
        Self
    }
}

#[tauri::command]
pub fn mpv_probe() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_start() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_command() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_set_property() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_get_property() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_set_geometry() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_force_below() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_export_log() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_set_hdr_stage() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn display_hdr_active() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_on_pip_changed() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_screenshot_data_url() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_save_screenshot() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_gif_start() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_gif_stop() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_gif_abort() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_clip_save() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_sub_add() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn sub_download() -> Result<(), String> {
    Err("not supported on Android".into())
}
#[tauri::command]
pub fn mpv_stop() -> Result<(), String> {
    Err("not supported on Android".into())
}
