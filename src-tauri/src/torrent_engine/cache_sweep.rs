use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const KEEP: &[&str] = &["dht.json", "engine.json"];
const IN_USE_GRACE: Duration = Duration::from_secs(10 * 60);

pub fn run(dir: &Path, retention_hours: u64, max_gb: u64) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let now = SystemTime::now();
    // "Off" still spares what was written in the last few minutes: the stream being
    // watched. librqbit reads through the files it keeps open, so a finished video
    // removed here keeps playing and its space is freed when the torrent closes.
    let max_age = if retention_hours == 0 {
        IN_USE_GRACE
    } else {
        Duration::from_secs(retention_hours.saturating_mul(3600))
    };
    let mut kept: Vec<(PathBuf, SystemTime, u64)> = Vec::new();
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
        let modified = entry.metadata().and_then(|m| m.modified()).ok();
        // An entry written after `now` (a torrent downloading, the DHT's dump) has a
        // negative age: it is fresh. One whose date cannot be read is left alone.
        let expired = match modified {
            Some(m) => now.duration_since(m).map(|age| age >= max_age).unwrap_or(false),
            None => false,
        };
        if expired {
            remove(&path);
            continue;
        }
        if max_gb > 0 {
            let size = entry_size(&path);
            kept.push((path, modified.unwrap_or(now), size));
        }
    }
    enforce_size_cap(kept, max_gb);
}

fn enforce_size_cap(mut kept: Vec<(PathBuf, SystemTime, u64)>, max_gb: u64) {
    if max_gb == 0 {
        return;
    }
    let cap = max_gb.saturating_mul(1024 * 1024 * 1024);
    let mut total: u64 = kept.iter().map(|(_, _, s)| *s).sum();
    if total <= cap {
        return;
    }
    kept.sort_by_key(|(_, m, _)| *m);
    for (path, _, size) in kept {
        if total <= cap {
            break;
        }
        remove(&path);
        total = total.saturating_sub(size);
    }
}

fn entry_size(path: &Path) -> u64 {
    if path.is_dir() {
        match fs::read_dir(path) {
            Ok(entries) => entries.flatten().map(|e| entry_size(&e.path())).sum(),
            Err(_) => 0,
        }
    } else {
        fs::metadata(path).map(|m| m.len()).unwrap_or(0)
    }
}

fn remove(path: &Path) {
    let _ = if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vayra-sweep-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn file_modified(dir: &Path, name: &str, modified: SystemTime) -> PathBuf {
        let path = dir.join(name);
        let file = fs::File::create(&path).unwrap();
        file.set_modified(modified).unwrap();
        path
    }

    #[test]
    fn keeps_an_entry_written_while_the_sweep_runs() {
        // A torrent being downloaded, or the DHT's temporary dump, is modified after
        // the sweep read the clock: its age is negative, not expired.
        let dir = scratch("future");
        let active = file_modified(&dir, "Streaming.Now.mkv", SystemTime::now() + Duration::from_secs(60));
        run(&dir, 24, 0);
        assert!(active.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn off_spares_what_is_in_use_and_clears_the_rest() {
        let dir = scratch("off");
        let playing = file_modified(&dir, "Playing.mkv", SystemTime::now() - Duration::from_secs(60));
        let done = file_modified(&dir, "Done.mkv", SystemTime::now() - Duration::from_secs(20 * 60));
        run(&dir, 0, 0);
        assert!(playing.exists());
        assert!(!done.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn removes_only_what_is_older_than_the_retention() {
        let dir = scratch("retention");
        let old = file_modified(&dir, "Old.mkv", SystemTime::now() - Duration::from_secs(48 * 3600));
        let fresh = file_modified(&dir, "Fresh.mkv", SystemTime::now() - Duration::from_secs(3600));
        let dht = file_modified(&dir, "dht.json", SystemTime::now() - Duration::from_secs(48 * 3600));
        run(&dir, 24, 0);
        assert!(!old.exists());
        assert!(fresh.exists());
        assert!(dht.exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
