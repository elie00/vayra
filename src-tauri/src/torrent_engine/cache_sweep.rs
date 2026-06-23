use std::fs;
use std::path::Path;

const KEEP: &[&str] = &["dht.json"];

pub fn run(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let keep = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| KEEP.contains(&n))
            .unwrap_or(false);
        if keep {
            continue;
        }
        let _ = if path.is_dir() {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_file(&path)
        };
    }
}
