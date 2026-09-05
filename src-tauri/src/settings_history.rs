use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

static LOCK: Mutex<()> = Mutex::new(());
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint { saved_at: u64, settings: Value }
#[derive(Default, Serialize, Deserialize)]
struct History { current: Option<Checkpoint>, previous: Vec<Checkpoint> }

fn safe_preferences(input: Value) -> Value {
    let keys = ["uiLanguage", "tmdbLanguage", "tmdbImageLangs", "preferredSubLangs", "preferredAudioLangs", "resumePrompt", "resumePlayback", "instantPlay", "rememberLastStream", "keepSourceNextEpisode", "autoPlayNextEpisode", "sidebarCollapsed", "macPinnedViews", "posterScale", "posterRadius", "uiScale", "subFontSize", "subBold", "subtitlesOffByDefault", "preferEmbeddedSubs", "downloadCreateFolders", "playerVolumeHud", "fullscreenRestorePosition", "keepFullscreenOnExit"];
    let mut safe = serde_json::Map::new();
    for key in keys { if let Some(value) = input.get(key) { safe.insert(key.into(), value.clone()); } }
    if let Some(theme) = input.get("theme") {
        let mut safe_theme = serde_json::Map::new();
        for key in ["preset", "fontPair", "fontPairOverride"] { if let Some(value) = theme.get(key) { safe_theme.insert(key.into(), value.clone()); } }
        safe.insert("theme".into(), Value::Object(safe_theme));
    }
    Value::Object(safe)
}

fn read(path: &Path) -> Result<History, String> {
    match std::fs::read(path) {
        Ok(raw) => serde_json::from_slice(&raw).map_err(|_| "Settings history is unreadable".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(History::default()),
        Err(_) => Err("Settings history is unavailable".into()),
    }
}
fn record(path: &Path, content: &str, now: u64) -> Result<(), String> {
    if content.len() > 128 * 1024 { return Err("Settings snapshot is too large".into()); }
    let safe = safe_preferences(serde_json::from_str(content).map_err(|_| "Invalid settings snapshot")?);
    let mut history = read(path)?;
    if history.current.as_ref().is_some_and(|c| c.settings == safe) { return Ok(()); }
    if let Some(previous) = history.current.take() { history.previous.insert(0, previous); }
    history.previous.truncate(5);
    history.current = Some(Checkpoint { saved_at: now, settings: safe });
    let raw = serde_json::to_vec(&history).map_err(|_| "Could not prepare settings history")?;
    let tmp = path.with_extension("json.tmp");
    let mut options = std::fs::OpenOptions::new();
    options.create(true).write(true).truncate(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut file = options.open(&tmp).map_err(|_| "Could not create settings history")?;
    use std::io::Write;
    file.write_all(&raw).and_then(|_| file.sync_all()).map_err(|_| "Could not save settings history")?;
    std::fs::rename(&tmp, path).map_err(|_| "Could not replace settings history".into())
}
fn history_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|_| "App data directory unavailable")?;
    std::fs::create_dir_all(&dir).map_err(|_| "App data directory unavailable")?;
    Ok(dir.join("settings-history.json"))
}
#[tauri::command]
pub fn settings_history_record(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|_| "Settings history is busy")?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_| "Clock unavailable")?.as_millis() as u64;
    record(&history_path(&app)?, &content, now)
}
#[tauri::command]
pub fn settings_history_list(app: tauri::AppHandle) -> Result<Vec<Checkpoint>, String> {
    let _guard = LOCK.lock().map_err(|_| "Settings history is busy")?;
    Ok(read(&history_path(&app)?)?.previous)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn excludes_credentials_and_limits_history() {
        let dir = std::env::temp_dir().join(format!("vayra-history-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap(); let path = dir.join("history.json");
        for n in 0..8 { record(&path, &format!(r#"{{"uiScale":{},"rdKey":"SECRET","theme":{{"preset":"sage","backgroundImage":"SECRET"}}}}"#, n), n).unwrap(); }
        let history = read(&path).unwrap(); assert_eq!(history.previous.len(), 5);
        assert_eq!(history.previous[0].settings["uiScale"], 6);
        assert!(!std::fs::read_to_string(&path).unwrap().contains("SECRET"));
        record(&path, r#"{"uiScale":7,"theme":{"preset":"sage"}}"#, 9).unwrap();
        assert_eq!(read(&path).unwrap().previous[0].settings["uiScale"], 6);
        std::fs::remove_file(path).unwrap(); std::fs::remove_dir(dir).unwrap();
    }
}
