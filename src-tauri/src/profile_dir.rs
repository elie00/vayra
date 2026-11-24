//! Where this instance keeps what it writes. A desktop instance started with
//! `VAYRA_DATA_DIR` keeps its state under that folder and its secrets under
//! keyring names of its own, so a test instance never touches the real
//! profile. Unset, the usual app folders and keyring names are used, unchanged.

#[cfg(desktop)]
use std::path::Path;
use std::path::PathBuf;
use tauri::Manager;

/// The folder given by `VAYRA_DATA_DIR`, on desktop only.
pub fn dev_data_dir() -> Option<PathBuf> {
    #[cfg(desktop)]
    {
        std::env::var_os("VAYRA_DATA_DIR")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
    }
    #[cfg(not(desktop))]
    {
        None
    }
}

/// Where settings, restore points, the player log, pairings, Anime4K shaders
/// and the SVP script live.
pub fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    match dev_data_dir() {
        Some(dir) => Ok(dir),
        None => app.path().app_data_dir().map_err(|e| e.to_string()),
    }
}

/// The keyring service for this instance: `base`, or `base.dev-<tag>`.
#[cfg(desktop)]
pub fn keyring_service(base: &str) -> String {
    service_for(base, dev_data_dir().as_deref())
}

#[cfg(desktop)]
fn service_for(base: &str, dev_dir: Option<&Path>) -> String {
    match dev_dir {
        Some(dir) => format!("{base}.dev-{}", tag_for(dir)),
        None => base.to_string(),
    }
}

// FNV-1a over the path as given: stable across Rust versions, unlike
// `DefaultHasher`, so a dev folder finds its keyring entries again.
#[cfg(desktop)]
fn tag_for(dir: &Path) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in dir.to_string_lossy().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

#[cfg(all(test, desktop))]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_real_keyring_name_without_a_dev_folder() {
        assert_eq!(service_for("app.vayra.auth", None), "app.vayra.auth");
    }

    #[test]
    fn gives_each_dev_folder_its_own_stable_keyring_name() {
        let a = service_for("app.vayra", Some(Path::new(r"C:\tmp\vayra-a")));
        let b = service_for("app.vayra", Some(Path::new(r"C:\tmp\vayra-b")));
        assert_ne!(a, b);
        assert_eq!(a, service_for("app.vayra", Some(Path::new(r"C:\tmp\vayra-a"))));
        assert!(a.starts_with("app.vayra.dev-"));
        // FNV-1a of the empty string: pins the hash so it cannot drift silently.
        assert_eq!(tag_for(Path::new("")), "cbf29ce484222325");
    }
}
