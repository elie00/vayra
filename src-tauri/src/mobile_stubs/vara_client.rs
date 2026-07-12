//! Stub Android : sync-CLIENT VARA/VEYA (broker socket <-> events, desktop-only).
//!
//! The VARA/VEYA broker is a desktop-only standalone process; on Android these
//! commands exist only to keep the `generate_handler!` list identical. They
//! never touch a socket, so solo playback is unaffected.

use serde::Deserialize;

pub struct VaraClientState;

impl VaraClientState {
    pub fn new() -> Self {
        Self
    }
}

impl Default for VaraClientState {
    fn default() -> Self {
        Self::new()
    }
}

// Accept a permissive payload so the invoke signature parses; the frontend must
// not call these on Android, but if it does we return a clean error.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct PlaybackCommand(serde_json::Value);

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct PlaybackState(serde_json::Value);

#[tauri::command]
pub fn vayra_sync_join(_room: String, _client_id: String, _name: String) -> Result<(), String> {
    Err("VARA/VEYA sync not supported on Android".into())
}

#[tauri::command]
pub fn vayra_sync_leave(_room: String, _client_id: String) -> Result<(), String> {
    Err("VARA/VEYA sync not supported on Android".into())
}

#[tauri::command]
pub fn vayra_sync_send(_room: String, _cmd: PlaybackCommand) -> Result<(), String> {
    Err("VARA/VEYA sync not supported on Android".into())
}

#[tauri::command]
pub fn vayra_sync_publish(_room: String, _state_payload: PlaybackState) -> Result<(), String> {
    Err("VARA/VEYA sync not supported on Android".into())
}
