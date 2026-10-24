//! Magnet links and .torrent files opened from the system (macOS).

const MAX_TORRENT_FILE_BYTES: u64 = 10 * 1024 * 1024;

/// Magnet link for a .torrent file opened from the Finder, so it plays through the
/// same path as a magnet link.
#[tauri::command]
pub fn torrent_file_magnet(path: String) -> Result<String, String> {
    let path = std::path::Path::new(&path);
    if !path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("torrent")) {
        return Err("not a .torrent file".into());
    }
    let size = std::fs::metadata(path)
        .map_err(|e| format!("read {}: {e}", path.display()))?
        .len();
    if size > MAX_TORRENT_FILE_BYTES {
        return Err("torrent file too large".into());
    }
    let bytes = std::fs::read(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    magnet_from_torrent(&bytes)
}

fn magnet_from_torrent(bytes: &[u8]) -> Result<String, String> {
    let torrent = librqbit::torrent_from_bytes(bytes).map_err(|e| format!("invalid .torrent: {e}"))?;
    let mut magnet = format!("magnet:?xt=urn:btih:{}", torrent.info_hash.as_string());
    if let Some(name) = &torrent.info.data.name {
        magnet.push_str("&dn=");
        magnet.extend(url::form_urlencoded::byte_serialize(name.as_ref()));
    }
    for tracker in torrent.iter_announce() {
        magnet.push_str("&tr=");
        magnet.extend(url::form_urlencoded::byte_serialize(tracker.as_ref()));
    }
    Ok(magnet)
}

/// Whether VAYRA opens magnet links and .torrent files. Another torrent client
/// installed first keeps them until the user hands them over.
#[tauri::command]
pub fn torrent_links_default(app: tauri::AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        launch_services::is_default(&app.config().identifier)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        false
    }
}

#[tauri::command]
pub fn torrent_links_make_default(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        launch_services::make_default(&app.config().identifier)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("unsupported platform".into())
    }
}

#[cfg(target_os = "macos")]
mod launch_services {
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    const MAGNET_SCHEME: &str = "magnet";
    const TORRENT_UTI: &str = "org.bittorrent.torrent";
    const LS_ROLES_ALL: u32 = 0xFFFF_FFFF;

    // Deprecated since macOS 12 in favour of NSWorkspace, but still honoured and
    // silent for non-web schemes.
    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSCopyDefaultHandlerForURLScheme(scheme: CFStringRef) -> CFStringRef;
        fn LSSetDefaultHandlerForURLScheme(scheme: CFStringRef, handler: CFStringRef) -> i32;
        fn LSCopyDefaultRoleHandlerForContentType(uti: CFStringRef, role: u32) -> CFStringRef;
        fn LSSetDefaultRoleHandlerForContentType(uti: CFStringRef, role: u32, handler: CFStringRef) -> i32;
    }

    fn take(handler: CFStringRef) -> Option<String> {
        (!handler.is_null()).then(|| unsafe { CFString::wrap_under_create_rule(handler) }.to_string())
    }

    pub fn is_default(bundle_id: &str) -> bool {
        let scheme = CFString::new(MAGNET_SCHEME);
        let uti = CFString::new(TORRENT_UTI);
        let magnet = take(unsafe { LSCopyDefaultHandlerForURLScheme(scheme.as_concrete_TypeRef()) });
        let torrent = take(unsafe {
            LSCopyDefaultRoleHandlerForContentType(uti.as_concrete_TypeRef(), LS_ROLES_ALL)
        });
        [magnet, torrent]
            .iter()
            .all(|handler| handler.as_deref().is_some_and(|h| h.eq_ignore_ascii_case(bundle_id)))
    }

    pub fn make_default(bundle_id: &str) -> Result<(), String> {
        let handler = CFString::new(bundle_id);
        let scheme = CFString::new(MAGNET_SCHEME);
        let uti = CFString::new(TORRENT_UTI);
        let status = unsafe {
            LSSetDefaultHandlerForURLScheme(scheme.as_concrete_TypeRef(), handler.as_concrete_TypeRef())
        };
        if status != 0 {
            return Err(format!("magnet links: OSStatus {status}"));
        }
        let status = unsafe {
            LSSetDefaultRoleHandlerForContentType(
                uti.as_concrete_TypeRef(),
                LS_ROLES_ALL,
                handler.as_concrete_TypeRef(),
            )
        };
        if status != 0 {
            return Err(format!(".torrent files: OSStatus {status}"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::magnet_from_torrent;

    #[test]
    fn torrent_file_becomes_a_magnet_with_its_name_and_trackers() {
        let info = b"d6:lengthi1024e4:name9:Film .mkv12:piece lengthi16384e6:pieces20:aaaaaaaaaaaaaaaaaaaae";
        let mut torrent = b"d8:announce30:udp://tracker.example:1337/ann4:info".to_vec();
        torrent.extend_from_slice(info);
        torrent.push(b'e');

        // The hash is the SHA-1 of the bencoded info dict above.
        assert_eq!(
            magnet_from_torrent(&torrent).unwrap(),
            "magnet:?xt=urn:btih:de89f34ab990f4431cfb91329b7ab4190807bb08&dn=Film+.mkv&tr=udp%3A%2F%2Ftracker.example%3A1337%2Fann",
        );
    }

    #[test]
    fn macos_info_plist_keeps_every_deep_link_scheme() {
        // Info.plist replaces the URL types Tauri builds from tauri.conf.json.
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let conf: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(dir.join("tauri.conf.json")).unwrap()).unwrap();
        let plist = std::fs::read_to_string(dir.join("Info.plist")).unwrap();
        let schemes = conf["plugins"]["deep-link"]["desktop"]["schemes"].as_array().unwrap();
        assert!(!schemes.is_empty());
        for scheme in schemes.iter().chain([&serde_json::json!("magnet")]) {
            let scheme = scheme.as_str().unwrap();
            assert!(plist.contains(&format!("<string>{scheme}</string>")), "{scheme} missing from Info.plist");
        }
    }

    #[test]
    fn rejects_bytes_that_are_not_a_torrent() {
        assert!(magnet_from_torrent(b"<html>not a torrent</html>").is_err());
    }
}
