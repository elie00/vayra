use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime};

const KEEP: &[&str] = &["dht.json", "engine.json"];

pub fn run(dir: &Path, retention_hours: u64) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let now = SystemTime::now();
    let max_age = Duration::from_secs(retention_hours.saturating_mul(3600));
    for entry in entries.flatten() {
        let path = entry.path();
        let keep_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| KEEP.contains(&n))
            .unwrap_or(false);
        if keep_name {
            continue;
        }
        if retention_hours > 0 {
            let fresh = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|m| now.duration_since(m).ok())
                .map(|age| age < max_age)
                .unwrap_or(false);
            if fresh {
                continue;
            }
        }
        let _ = if path.is_dir() {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_file(&path)
        };
    }
}
