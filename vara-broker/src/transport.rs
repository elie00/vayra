// Cross-process transport for the broker: Unix socket (macOS/Linux) or named
// pipe (Windows). JSONL framing with a buffered line reader that tolerates
// partial reads. Socket/retry patterns mirror src-tauri/src/multiview.rs.

use std::path::PathBuf;

/// Fixed, well-known socket / pipe path.
///
/// unix:    ${XDG_RUNTIME_DIR or TMPDIR or /tmp}/vayra-vara.sock
/// windows: \\.\pipe\vayra-vara
#[cfg(not(windows))]
pub fn socket_path() -> PathBuf {
    let dir = std::env::var_os("XDG_RUNTIME_DIR")
        .or_else(|| std::env::var_os("TMPDIR"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    dir.join("vayra-vara.sock")
}

#[cfg(windows)]
pub fn socket_path() -> PathBuf {
    PathBuf::from(r"\\.\pipe\vayra-vara")
}

/// Windows pipes are not filesystem entries; only unix sockets need unlinking.
#[cfg(not(windows))]
pub fn unlink_socket(path: &std::path::Path) {
    let _ = std::fs::remove_file(path);
}

#[cfg(windows)]
pub fn unlink_socket(_path: &std::path::Path) {}
