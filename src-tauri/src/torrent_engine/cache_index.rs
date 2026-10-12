//! Finished files left in the engine's cache. Closing the player removes the torrent
//! from librqbit, which forgets its metadata: without this index its complete files
//! would stay on disk with nothing able to say which torrent file they are.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

const INDEX: &str = "cache-index.json";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CachedFile {
    pub info_hash: String,
    pub file_idx: usize,
    /// Relative to the engine folder.
    pub path: PathBuf,
    pub len: u64,
    /// The file's identity when it was complete: a torrent added again recreates a
    /// removed file at full length but empty, which the length alone cannot tell.
    #[serde(default)]
    pub inode: u64,
}

pub fn load(dir: &Path) -> Vec<CachedFile> {
    fs::read(dir.join(INDEX))
        .ok()
        .and_then(|raw| serde_json::from_slice(&raw).ok())
        .unwrap_or_default()
}

fn save(dir: &Path, files: &[CachedFile]) {
    let Ok(raw) = serde_json::to_vec(files) else { return };
    let tmp = dir.join(format!("{INDEX}.tmp"));
    if fs::write(&tmp, raw).is_ok() {
        let _ = fs::rename(&tmp, dir.join(INDEX));
    }
}

#[cfg(unix)]
fn inode(meta: &fs::Metadata) -> u64 {
    std::os::unix::fs::MetadataExt::ino(meta)
}

#[cfg(not(unix))]
fn inode(_meta: &fs::Metadata) -> u64 {
    0
}

fn on_disk(dir: &Path, file: &CachedFile) -> bool {
    fs::metadata(dir.join(&file.path))
        .map(|m| m.is_file() && m.len() == file.len && inode(&m) == file.inode)
        .unwrap_or(false)
}

/// Record newly complete files, drop the ones that are gone or were replaced, and
/// return what the cache holds now.
pub fn update(dir: &Path, complete: Vec<CachedFile>) -> Vec<CachedFile> {
    // The periodic sweep and the app's requests both update it: one at a time.
    static WRITING: Mutex<()> = Mutex::new(());
    let _writing = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    let before = load(dir);
    let mut files = before.clone();
    for mut file in complete {
        let Ok(meta) = fs::metadata(dir.join(&file.path)) else { continue };
        file.inode = inode(&meta);
        files.retain(|f| !(f.info_hash == file.info_hash && f.file_idx == file.file_idx));
        files.push(file);
    }
    files.retain(|f| on_disk(dir, f));
    if files != before {
        save(dir, &files);
    }
    files
}

/// The complete cached copy of one torrent file, if the cache still holds it.
pub fn lookup(dir: &Path, files: &[CachedFile], info_hash: &str, file_idx: usize) -> Option<PathBuf> {
    files
        .iter()
        .find(|f| f.info_hash.eq_ignore_ascii_case(info_hash) && f.file_idx == file_idx)
        .map(|f| dir.join(&f.path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vayra-index-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn cached(path: &str, len: u64) -> CachedFile {
        CachedFile { info_hash: "ab".repeat(20), file_idx: 3, path: path.into(), len, inode: 0 }
    }

    #[test]
    fn remembers_a_complete_file_after_its_torrent_is_gone() {
        let dir = scratch("remember");
        fs::create_dir_all(dir.join("Show.S01")).unwrap();
        fs::write(dir.join("Show.S01/E03.mkv"), b"video").unwrap();
        update(&dir, vec![cached("Show.S01/E03.mkv", 5)]);
        let files = update(&dir, vec![]);
        assert_eq!(lookup(&dir, &files, &"AB".repeat(20), 3), Some(dir.join("Show.S01/E03.mkv")));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn forgets_a_file_the_sweep_removed() {
        let dir = scratch("removed");
        fs::write(dir.join("Movie.mkv"), b"video").unwrap();
        update(&dir, vec![cached("Movie.mkv", 5)]);
        fs::remove_file(dir.join("Movie.mkv")).unwrap();
        assert!(update(&dir, vec![]).is_empty());
        assert!(load(&dir).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn forgets_a_file_recreated_empty_at_the_same_length() {
        let dir = scratch("recreated");
        fs::write(dir.join("Movie.mkv"), b"video").unwrap();
        update(&dir, vec![cached("Movie.mkv", 5)]);
        // Keep the old file alive so the new one cannot reuse its inode number.
        fs::rename(dir.join("Movie.mkv"), dir.join("old.mkv")).unwrap();
        fs::File::create(dir.join("Movie.mkv")).unwrap().set_len(5).unwrap();
        assert!(update(&dir, vec![]).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ignores_a_file_that_is_not_on_disk() {
        let dir = scratch("missing");
        assert!(update(&dir, vec![cached("Missing.mkv", 5)]).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
