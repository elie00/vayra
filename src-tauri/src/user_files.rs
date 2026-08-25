//! Reads and writes files that live wherever the user keeps their media.
//!
//! The fs plugin is deliberately scoped to the app's own picture folder — see
//! `capabilities/default.json` — so the frontend cannot touch a media library or
//! an export target through it. Those paths come here instead, the same way
//! folder scanning already does in `local_lib`.

use std::path::Path;

/// File names directly inside a folder. Used to find a video's sidecars without
/// walking the whole library again.
#[tauri::command]
pub async fn vayra_list_dir_files(dir: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let entries = std::fs::read_dir(&dir).map_err(|e| format!("{}: {}", dir, e))?;
        let mut out = Vec::new();
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                if let Some(name) = entry.file_name().to_str() {
                    out.push(name.to_string());
                }
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vayra_read_text_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("{}: {}", path, e))
}

#[tauri::command]
pub async fn vayra_write_text_file(path: String, contents: String) -> Result<(), String> {
    create_parent(&path).await?;
    tokio::fs::write(&path, contents)
        .await
        .map_err(|e| format!("{}: {}", path, e))
}

/// Fetch a URL straight to a file. Artwork alongside an exported .nfo runs to
/// hundreds of kilobytes a piece, which has no business crossing the IPC bridge.
#[tauri::command]
pub async fn vayra_download_to_file(url: String, dest: String) -> Result<(), String> {
    let res = reqwest::get(&url).await.map_err(|e| format!("request: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }
    let bytes = res.bytes().await.map_err(|e| format!("body: {}", e))?;
    create_parent(&dest).await?;
    tokio::fs::write(&dest, &bytes)
        .await
        .map_err(|e| format!("{}: {}", dest, e))
}

async fn create_parent(path: &str) -> Result<(), String> {
    let Some(parent) = Path::new(path).parent() else { return Ok(()) };
    if parent.as_os_str().is_empty() {
        return Ok(());
    }
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|e| format!("{}: {}", parent.display(), e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("vayra-user-files-{}", name));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn listing_a_folder_names_its_files_and_skips_folders() {
        let dir = scratch("list");
        std::fs::write(dir.join("Movie.mkv"), b"x").unwrap();
        std::fs::write(dir.join("Movie.nfo"), b"x").unwrap();
        std::fs::create_dir(dir.join("Extras")).unwrap();

        let mut names = vayra_list_dir_files(dir.to_string_lossy().to_string())
            .await
            .unwrap();
        names.sort();
        assert_eq!(names, vec!["Movie.mkv".to_string(), "Movie.nfo".to_string()]);
    }

    #[tokio::test]
    async fn listing_a_missing_folder_is_an_error_not_an_empty_list() {
        let missing = std::env::temp_dir().join("vayra-user-files-nope");
        let _ = std::fs::remove_dir_all(&missing);
        assert!(vayra_list_dir_files(missing.to_string_lossy().to_string())
            .await
            .is_err());
    }

    #[tokio::test]
    async fn text_written_reads_back_unchanged() {
        let dir = scratch("text");
        let path = dir.join("Movie.nfo").to_string_lossy().to_string();
        let body = "<movie><title>Amélie</title></movie>";

        vayra_write_text_file(path.clone(), body.to_string()).await.unwrap();
        assert_eq!(vayra_read_text_file(path).await.unwrap(), body);
    }

    #[tokio::test]
    async fn writing_creates_the_folder_the_file_needs() {
        let dir = scratch("parent");
        let path = dir.join("Season 01").join("ep.nfo").to_string_lossy().to_string();

        vayra_write_text_file(path.clone(), "x".to_string()).await.unwrap();
        assert_eq!(vayra_read_text_file(path).await.unwrap(), "x");
    }

    #[tokio::test]
    async fn reading_a_file_that_is_not_there_says_so() {
        let dir = scratch("missing");
        let path = dir.join("absent.nfo").to_string_lossy().to_string();
        assert!(vayra_read_text_file(path).await.is_err());
    }
}
