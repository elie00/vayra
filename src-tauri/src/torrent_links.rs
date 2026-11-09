//! Magnet links and .torrent files opened from the system (macOS and Windows).

const MAX_TORRENT_FILE_BYTES: u64 = 10 * 1024 * 1024;

/// Sent to the frontend when a running VAYRA is handed a link by a second launch.
#[cfg(windows)]
pub const LINK_EVENT: &str = "vayra:system-link";

/// The magnet link or .torrent file Windows passes as the only argument, in the
/// form the frontend's deep-link handler reads.
#[cfg(windows)]
pub fn link_from_args<S: AsRef<str>>(args: &[S]) -> Option<String> {
    let [_, arg] = args else { return None };
    let arg = arg.as_ref();
    if arg.get(..7).is_some_and(|scheme| scheme.eq_ignore_ascii_case("magnet:")) {
        return Some(arg.to_string());
    }
    let path = std::path::Path::new(arg);
    if !path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("torrent")) {
        return None;
    }
    url::Url::from_file_path(path).ok().map(String::from)
}

/// The link VAYRA was launched with. Answers once, so reloading the interface
/// does not open it again.
#[tauri::command]
pub fn torrent_links_launch_link() -> Option<String> {
    #[cfg(windows)]
    {
        use std::sync::atomic::{AtomicBool, Ordering};
        static TAKEN: AtomicBool = AtomicBool::new(false);
        if !TAKEN.swap(true, Ordering::Relaxed) {
            let args: Vec<String> = std::env::args_os().map(|a| a.to_string_lossy().into_owned()).collect();
            return link_from_args(&args);
        }
    }
    None
}

/// Magnet link for a .torrent file opened from the system, so it plays through the
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
    #[cfg(windows)]
    {
        let _ = app;
        windows_default::is_default()
    }
    #[cfg(not(any(target_os = "macos", windows)))]
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
    #[cfg(windows)]
    {
        windows_default::make_default(&app)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
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

#[cfg(windows)]
mod windows_default {
    use tauri_plugin_deep_link::DeepLinkExt;
    use tauri_plugin_opener::OpenerExt;
    use windows::core::{HSTRING, PCWSTR, PWSTR};
    use windows::Win32::UI::Shell::{
        AssocQueryStringW, SHChangeNotify, ASSOCF, ASSOCF_IS_PROTOCOL, ASSOCF_NONE, ASSOCSTR_EXECUTABLE,
        SHCNE_ASSOCCHANGED, SHCNF_IDLIST,
    };
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const MAGNET_SCHEME: &str = "magnet";
    const TORRENT_EXTENSION: &str = ".torrent";
    const TORRENT_PROG_ID: &str = "VAYRA.torrent";
    const DEFAULT_APPS_PAGE: &str = "ms-settings:defaultapps";

    /// The program Windows would really start, a choice made in Settings included.
    fn handler(flags: ASSOCF, target: &str) -> Option<String> {
        let target = HSTRING::from(target);
        let verb = HSTRING::from("open");
        let mut len = 0u32;
        unsafe {
            let _ = AssocQueryStringW(flags, ASSOCSTR_EXECUTABLE, &target, &verb, None, &mut len);
            if len == 0 {
                return None;
            }
            let mut buf = vec![0u16; len as usize];
            AssocQueryStringW(flags, ASSOCSTR_EXECUTABLE, &target, &verb, Some(PWSTR(buf.as_mut_ptr())), &mut len)
                .ok()
                .ok()?;
            PCWSTR(buf.as_ptr()).to_string().ok()
        }
    }

    pub fn is_default() -> bool {
        let Ok(exe) = std::env::current_exe() else { return false };
        let exe = exe.to_string_lossy().to_string();
        [handler(ASSOCF_IS_PROTOCOL, MAGNET_SCHEME), handler(ASSOCF_NONE, TORRENT_EXTENSION)]
            .iter()
            .all(|found| found.as_deref().is_some_and(|f| f.eq_ignore_ascii_case(&exe)))
    }

    fn register_torrent_files() -> std::io::Result<()> {
        let exe = std::env::current_exe()?.to_string_lossy().to_string();
        let classes = RegKey::predef(HKEY_CURRENT_USER).create_subkey(r"Software\Classes")?.0;

        let (prog_id, _) = classes.create_subkey(TORRENT_PROG_ID)?;
        prog_id.set_value("", &"BitTorrent file")?;
        prog_id.create_subkey("DefaultIcon")?.0.set_value("", &format!("\"{exe}\",0"))?;
        prog_id.create_subkey(r"shell\open\command")?.0.set_value("", &format!("\"{exe}\" \"%1\""))?;

        let (extension, _) = classes.create_subkey(TORRENT_EXTENSION)?;
        extension.set_value("", &TORRENT_PROG_ID)?;
        extension.create_subkey("OpenWithProgids")?.0.set_value(TORRENT_PROG_ID, &"")?;
        Ok(())
    }

    /// Only ever called from the user's click. A default chosen in Windows Settings
    /// is protected from programs, so that case opens the page where it is changed.
    pub fn make_default(app: &tauri::AppHandle) -> Result<(), String> {
        app.deep_link().register(MAGNET_SCHEME).map_err(|e| format!("magnet links: {e}"))?;
        register_torrent_files().map_err(|e| format!(".torrent files: {e}"))?;
        unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
        if !is_default() {
            app.opener().open_url(DEFAULT_APPS_PAGE, None::<&str>).map_err(|e| e.to_string())?;
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

    #[cfg(windows)]
    #[test]
    fn windows_arguments_become_links_the_frontend_reads() {
        use super::link_from_args;
        let magnet = "magnet:?xt=urn:btih:de89f34ab990f4431cfb91329b7ab4190807bb08";
        assert_eq!(link_from_args(&["vayra.exe", magnet]).as_deref(), Some(magnet));
        assert_eq!(
            link_from_args(&["vayra.exe", r"C:\Users\me\Mon film.TORRENT"]).as_deref(),
            Some("file:///C:/Users/me/Mon%20film.TORRENT"),
        );
        assert_eq!(link_from_args(&["vayra.exe", r"C:\Users\me\film.mkv"]), None);
        assert_eq!(link_from_args(&["vayra.exe", "relative.torrent"]), None);
        assert_eq!(link_from_args(&["vayra.exe", magnet, "--flag"]), None);
        assert_eq!(link_from_args(&["vayra.exe"]), None);
    }

    #[test]
    fn rejects_bytes_that_are_not_a_torrent() {
        assert!(magnet_from_torrent(b"<html>not a torrent</html>").is_err());
    }
}
