//! Stub Android : le serveur VAYRA Connect ne tourne que sur le Mac et le PC.

#[tauri::command]
pub fn connect_start() -> Result<(), String> {
    Err("VAYRA Connect is hosted on desktop only".into())
}
#[tauri::command]
pub fn connect_stop() {}
#[tauri::command]
pub fn connect_rotate() -> Result<(), String> {
    Err("VAYRA Connect is hosted on desktop only".into())
}
#[tauri::command]
pub fn connect_status() {}
#[tauri::command]
pub fn connect_publish() {}
#[tauri::command]
pub fn connect_publish_addons() {}
