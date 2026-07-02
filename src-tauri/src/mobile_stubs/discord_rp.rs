//! Stub Android : Discord Rich Presence (desktop-only).

pub struct DiscordState;

impl DiscordState {
    pub fn new() -> Self {
        Self
    }
}

pub fn shutdown(_app: &tauri::AppHandle) {}

#[tauri::command]
pub fn discord_set_presence() {}
#[tauri::command]
pub fn discord_clear() {}
#[tauri::command]
pub fn discord_set_enabled() {}
