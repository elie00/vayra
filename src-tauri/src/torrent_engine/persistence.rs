//! librqbit restores the torrents listed in `session.json` before it hands back the
//! session. A listed torrent whose .torrent file is gone has to fetch its metadata
//! from the network first, which never ends for a swarm nobody seeds any more: the
//! engine then never becomes ready.

use std::fs;
use std::path::Path;

/// Remove from `session.json` the torrents whose .torrent file is gone, and return
/// their info hashes. Their data, if any is left, stays on disk for the sweep.
pub fn drop_torrents_without_metadata(dir: &Path) -> Vec<String> {
    let path = dir.join("session.json");
    let Some(mut session) = fs::read(&path).ok().and_then(|raw| serde_json::from_slice::<serde_json::Value>(&raw).ok())
    else {
        return Vec::new();
    };
    let Some(torrents) = session.get_mut("torrents").and_then(|t| t.as_object_mut()) else { return Vec::new() };
    let mut dropped = Vec::new();
    torrents.retain(|_, t| {
        let Some(hash) = t.get("info_hash").and_then(|h| h.as_str()) else { return true };
        let restorable = dir.join(format!("{hash}.torrent")).exists();
        if !restorable {
            dropped.push(hash.to_string());
        }
        restorable
    });
    if dropped.is_empty() {
        return dropped;
    }
    let tmp = dir.join("session.json.tmp");
    let written = serde_json::to_vec(&session).ok().is_some_and(|raw| fs::write(&tmp, raw).is_ok());
    if !written || fs::rename(&tmp, &path).is_err() {
        return Vec::new();
    }
    dropped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sets_aside_the_torrents_it_cannot_restore_from_disk() {
        let dir = std::env::temp_dir().join(format!("vayra-persist-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let kept = "0483e2eb7eff301f82752932ac7a48dc0203e4a1";
        let lost = "80f2b1db98b1e4dcff3cd2bb42a1715425ac6a83";
        fs::write(dir.join(format!("{kept}.torrent")), b"d4:infod4:name1:aee").unwrap();
        fs::write(
            dir.join("session.json"),
            format!(r#"{{"torrents":{{"9":{{"info_hash":"{lost}","only_files":[0]}},"12":{{"info_hash":"{kept}","only_files":[0]}}}}}}"#),
        )
        .unwrap();

        assert_eq!(drop_torrents_without_metadata(&dir), vec![lost.to_string()]);
        let session: serde_json::Value = serde_json::from_slice(&fs::read(dir.join("session.json")).unwrap()).unwrap();
        assert_eq!(session["torrents"].as_object().unwrap().keys().collect::<Vec<_>>(), vec!["12"]);
        assert_eq!(session["torrents"]["12"]["only_files"], serde_json::json!([0]));
        assert!(drop_torrents_without_metadata(&dir).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn leaves_a_missing_or_unreadable_session_alone() {
        let dir = std::env::temp_dir().join(format!("vayra-persist-none-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        assert!(drop_torrents_without_metadata(&dir).is_empty());
        fs::write(dir.join("session.json"), b"not json").unwrap();
        assert!(drop_torrents_without_metadata(&dir).is_empty());
        assert_eq!(fs::read(dir.join("session.json")).unwrap(), b"not json");
        let _ = fs::remove_dir_all(&dir);
    }
}
