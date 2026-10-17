/// `vayra.log` in a folder, with one previous generation, so the log cannot grow
/// without bound. The size is checked on every line: a session left running for
/// days used to grow it far past the limit, which was only checked at launch.
#[cfg(any(target_os = "macos", windows))]
struct Log {
    path: std::path::PathBuf,
    file: std::fs::File,
    len: u64,
    max: u64,
}

#[cfg(any(target_os = "macos", windows))]
impl Log {
    fn open(dir: &std::path::Path, max: u64) -> Option<Self> {
        std::fs::create_dir_all(dir).ok()?;
        let path = dir.join("vayra.log");
        let file = Self::append(&path)?;
        let len = file.metadata().map(|m| m.len()).unwrap_or(0);
        Some(Self { path, file, len, max })
    }

    fn append(path: &std::path::Path) -> Option<std::fs::File> {
        std::fs::OpenOptions::new().create(true).append(true).open(path).ok()
    }

    /// Write errors are ignored: the caller must keep draining whatever happens.
    fn write_line(&mut self, line: &str) {
        use std::io::Write;
        let size = line.len() as u64 + 1;
        if self.len > 0 && self.len + size > self.max {
            let _ = std::fs::rename(&self.path, self.path.with_extension("log.1"));
            if let Some(file) = Self::append(&self.path) {
                self.file = file;
                self.len = 0;
            }
        }
        if writeln!(self.file, "{line}").is_ok() {
            self.len += size;
        }
    }
}

/// Copies what reaches the pipe into the log, redacting URLs on the way.
#[cfg(any(target_os = "macos", windows))]
fn drain_into_log(reader: impl std::io::Read + Send + 'static, mut log: Log) {
    use std::io::BufRead;
    // The thread must keep draining the pipe whatever happens, or a full pipe would
    // block every later write to stderr.
    let _ = std::thread::Builder::new().name("app-log".into()).spawn(move || {
        for line in std::io::BufReader::new(reader).split(b'\n').map_while(Result::ok) {
            log.write_line(&redact_urls(&String::from_utf8_lossy(&line)));
        }
    });
}

#[cfg(any(target_os = "macos", windows))]
const MAX_LOG_BYTES: u64 = 10 * 1024 * 1024;

/// A Finder launch sends stderr nowhere, taking every `eprintln!` diagnostic with it.
/// Keep them in ~/Library/Logs/VAYRA/vayra.log, unless stderr is already a terminal.
/// Lines reach the file through a pipe so that URLs are redacted on the way.
#[cfg(target_os = "macos")]
pub fn redirect_stderr_to_log() {
    use std::os::fd::FromRawFd;
    if unsafe { libc::isatty(libc::STDERR_FILENO) } == 1 {
        return;
    }
    let Some(home) = std::env::var_os("HOME") else { return };
    let Some(log) = Log::open(&std::path::Path::new(&home).join("Library/Logs/VAYRA"), MAX_LOG_BYTES) else { return };
    let mut fds = [0; 2];
    if unsafe { libc::pipe(fds.as_mut_ptr()) } != 0 {
        return;
    }
    if unsafe { libc::dup2(fds[1], libc::STDERR_FILENO) } < 0 {
        unsafe {
            libc::close(fds[0]);
            libc::close(fds[1]);
        }
        return;
    }
    unsafe { libc::close(fds[1]) };
    drain_into_log(unsafe { std::fs::File::from_raw_fd(fds[0]) }, log);
}

/// A GUI-subsystem launch from Explorer or the Start menu has no stderr at all.
/// Keep diagnostics in %LOCALAPPDATA%\app.vayra\logs\vayra.log (Tauri's log
/// folder for this identifier), unless stderr already goes to a console or a
/// pipe such as `tauri dev`.
#[cfg(windows)]
pub fn redirect_stderr_to_log() {
    use std::os::windows::io::IntoRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::Console::{GetStdHandle, SetStdHandle, STD_ERROR_HANDLE};
    if unsafe { GetStdHandle(STD_ERROR_HANDLE) }.is_ok_and(|h| !h.is_invalid() && !h.0.is_null()) {
        return;
    }
    let Some(base) = std::env::var_os("LOCALAPPDATA") else { return };
    let Some(log) = Log::open(&std::path::Path::new(&base).join("app.vayra").join("logs"), MAX_LOG_BYTES) else { return };
    let Ok((reader, writer)) = std::io::pipe() else { return };
    // Rust's stderr looks the handle up on every write, so this reroutes eprintln!.
    // The write end now belongs to the process standard error and is never closed.
    let handle = HANDLE(writer.into_raw_handle());
    if unsafe { SetStdHandle(STD_ERROR_HANDLE, handle) }.is_err() {
        return;
    }
    drain_into_log(reader, log);
}

/// A warning or error from the web view, which has no stderr of its own. It goes
/// through stderr like every other line, so its URLs are redacted on the way.
#[tauri::command]
pub fn app_log_web(level: String, message: String) {
    let level = if level == "error" { "error" } else { "warn" };
    let message: String = message.chars().take(2000).collect();
    eprintln!("[web] {level} {}", message.replace('\n', " "));
}

const PEER_EVENTS: &str = "librqbit::torrent_state::live";

/// librqbit tells why a peer connection ends only through `tracing`, at debug level,
/// one line per peer: tens of thousands of lines a day that buried everything else.
/// Count those causes instead, for the engine's `[torrent-engine] peer errors` line,
/// and keep warnings from every crate plus the UPnP forwarder's info line saying the
/// router opened the torrent port.
pub fn init_tracing() {
    use tracing_subscriber::filter::{filter_fn, LevelFilter};
    use tracing_subscriber::prelude::*;
    let filter = filter_fn(|meta| {
        LevelFilter::WARN >= *meta.level()
            || (meta.target() == PEER_EVENTS && LevelFilter::INFO >= *meta.level())
            || (meta.target() == "librqbit_upnp" && LevelFilter::INFO >= *meta.level())
    });
    let layer = tracing_subscriber::fmt::layer()
        .with_ansi(false)
        .with_writer(std::io::stderr)
        .with_filter(filter);
    let counter = PeerErrorCounter
        .with_filter(filter_fn(|meta| meta.target() == PEER_EVENTS && *meta.level() == tracing::Level::DEBUG));
    // Accepted incoming connections are trace events; the router's answer is info or warn.
    let port = crate::torrent_engine::port_status::Layer.with_filter(filter_fn(|meta| {
        use crate::torrent_engine::port_status::{SESSION_EVENTS, UPNP_EVENTS};
        meta.target() == SESSION_EVENTS || (meta.target() == UPNP_EVENTS && LevelFilter::INFO >= *meta.level())
    }));
    let _ = tracing_subscriber::registry().with(layer).with(counter).with(port).try_init();
}

static PEER_ERRORS: std::sync::Mutex<std::collections::BTreeMap<&'static str, u64>> =
    std::sync::Mutex::new(std::collections::BTreeMap::new());

/// Peer connection failures by cause since the previous call.
pub fn take_peer_errors() -> Vec<(&'static str, u64)> {
    let mut errors = PEER_ERRORS.lock().unwrap_or_else(|e| e.into_inner());
    std::mem::take(&mut *errors).into_iter().collect()
}

/// Why a peer connection ended, from librqbit's "error managing peer" event.
fn peer_error_cause(message: &str) -> Option<&'static str> {
    let cause = message.strip_prefix("error managing peer: ")?;
    Some(if cause.contains("Too many open files") {
        "too-many-open-files"
    } else if cause.contains("Connection refused") {
        "refused"
    } else if cause.starts_with("error connecting: timeout") {
        "connect-timeout"
    } else if cause.contains("timeout") {
        "read-timeout"
    } else if cause.contains("Connection reset") {
        "reset"
    } else if cause.contains("disconnected") {
        "disconnected"
    } else if ["No route to host", "unreachable", "Can't assign requested address"].iter().any(|s| cause.contains(s)) {
        "unreachable"
    } else {
        "other"
    })
}

struct PeerErrorCounter;

impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for PeerErrorCounter {
    fn on_event(&self, event: &tracing::Event<'_>, _: tracing_subscriber::layer::Context<'_, S>) {
        if let Some(cause) = peer_error_cause(&message_of(event)) {
            *PEER_ERRORS.lock().unwrap_or_else(|e| e.into_inner()).entry(cause).or_default() += 1;
        }
    }
}

/// The formatted message of a tracing event.
pub fn message_of(event: &tracing::Event<'_>) -> String {
    let mut message = MessageText(String::new());
    event.record(&mut message);
    message.0
}

struct MessageText(String);

impl tracing_subscriber::field::Visit for MessageText {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            self.0 = format!("{value:?}");
        }
    }
}

/// A whole log with every line redacted, for logs written outside `vayra.log`.
#[cfg(any(desktop, test))]
pub fn redact_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for line in text.split_inclusive('\n') {
        let (body, end) = line.strip_suffix('\n').map_or((line, ""), |b| (b, "\n"));
        out.push_str(&redact_urls(body));
        out.push_str(end);
    }
    out
}

/// Cut every remote URL down to its scheme and host, and every magnet down to its
/// info hash, so the log never keeps debrid tokens, tracker passkeys or file paths.
/// Loopback URLs stay whole: they only carry the engine's own stream ids.
#[cfg(any(desktop, test))]
pub fn redact_urls(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = line;
    loop {
        let url_at = rest.find("://").map(|i| i - scheme_len(&rest[..i]));
        let magnet_at = rest.find("magnet:?");
        let start = match (url_at, magnet_at) {
            (Some(u), Some(m)) => u.min(m),
            (Some(u), None) => u,
            (None, Some(m)) => m,
            (None, None) => break,
        };
        let len = rest[start..].find(is_url_end).unwrap_or(rest.len() - start);
        let token = &rest[start..start + len];
        out.push_str(&rest[..start]);
        if token.starts_with("magnet:?") {
            out.push_str(&redact_magnet(token));
        } else {
            out.push_str(&redact_url(token));
        }
        rest = &rest[start + len..];
    }
    out.push_str(rest);
    out
}

/// Length of the scheme just before "://", or 0 when there is none.
#[cfg(any(desktop, test))]
fn scheme_len(before: &str) -> usize {
    before
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
        .map(char::len_utf8)
        .sum()
}

#[cfg(any(desktop, test))]
fn is_url_end(c: char) -> bool {
    c.is_whitespace() || matches!(c, '"' | '\'' | ')' | '(' | '<' | '>' | '[' | ']' | ',')
}

#[cfg(any(desktop, test))]
fn redact_url(url: &str) -> String {
    let Some(sep) = url.find("://") else { return url.to_string() };
    let after = &url[sep + 3..];
    let authority_len = after.find(['/', '?', '#']).unwrap_or(after.len());
    // Credentials in `user:pass@host` never reach the log either.
    let authority = &after[..authority_len];
    let host = authority.rsplit('@').next().unwrap_or(authority);
    let bare_host = host.rsplit_once(':').map_or(host, |(h, _)| h);
    if matches!(bare_host, "127.0.0.1" | "localhost" | "[::1]") && !authority.contains('@') {
        return url.to_string();
    }
    let tail = if authority_len < after.len() { "/…" } else { "" };
    format!("{}{}{}", &url[..sep + 3], host, tail)
}

#[cfg(any(desktop, test))]
fn redact_magnet(magnet: &str) -> String {
    let params = &magnet["magnet:?".len()..];
    let xt = params.split('&').find(|p| p.starts_with("xt="));
    let more = params.split('&').any(|p| !p.starts_with("xt=") && !p.is_empty());
    match (xt, more) {
        (Some(xt), true) => format!("magnet:?{xt}&…"),
        (Some(xt), false) => format!("magnet:?{xt}"),
        (None, _) => "magnet:?…".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{peer_error_cause, redact_urls, take_peer_errors, PeerErrorCounter, PEER_EVENTS};

    #[test]
    fn keeps_only_the_host_of_a_remote_url() {
        assert_eq!(
            redact_urls("[harbor::mpv] loadfile https://x1.download.real-debrid.com/d/TOKEN123/Movie.mkv?key=abc"),
            "[harbor::mpv] loadfile https://x1.download.real-debrid.com/…"
        );
    }

    #[test]
    fn names_why_a_peer_connection_ended() {
        let cause = |m: &str| peer_error_cause(m);
        assert_eq!(cause("error managing peer: error connecting: timeout at 10s"), Some("connect-timeout"));
        assert_eq!(
            cause("error managing peer: error connecting: error connecting: Connection refused (os error 61)"),
            Some("refused"),
        );
        assert_eq!(
            cause("error managing peer: error connecting: error connecting: Too many open files (os error 24)"),
            Some("too-many-open-files"),
        );
        assert_eq!(
            cause("error managing peer: error reading message: error reading from peer: timeout at 60s"),
            Some("read-timeout"),
        );
        assert_eq!(
            cause("error managing peer: error reading message: disconnected while reading, read so far: 0"),
            Some("disconnected"),
        );
        assert_eq!(cause("error managing peer: something new"), Some("other"));
        assert_eq!(cause("in-flight piece 12 not found. it was probably completed by someone else"), None);
    }

    #[test]
    fn counts_librqbit_peer_errors_by_cause() {
        use tracing_subscriber::prelude::*;
        let subscriber = tracing_subscriber::registry().with(PeerErrorCounter);
        tracing::subscriber::with_default(subscriber, || {
            let e = "error connecting: timeout at 10s";
            tracing::debug!(target: PEER_EVENTS, "error managing peer: {:#}", e);
            tracing::debug!(target: PEER_EVENTS, "error managing peer: {:#}", e);
            tracing::debug!(target: PEER_EVENTS, "torrent finished, not re-queueing");
        });
        assert_eq!(take_peer_errors(), vec![("connect-timeout", 2)]);
        assert!(take_peer_errors().is_empty());
    }

    #[test]
    fn redacts_urls_inside_error_messages() {
        assert_eq!(
            redact_urls("error sending request for url (https://api.example.com/v1/unrestrict?token=SECRET): timeout"),
            "error sending request for url (https://api.example.com/…): timeout"
        );
    }

    #[test]
    fn keeps_a_bare_host_and_port_untouched() {
        assert_eq!(redact_urls("tracker udp://tracker.opentrackr.org:1337 ok"), "tracker udp://tracker.opentrackr.org:1337 ok");
    }

    #[test]
    fn strips_tracker_passkeys_from_announce_urls() {
        assert_eq!(
            redact_urls("announce http://tracker.private.invalid:2710/PASSKEY/announce failed"),
            "announce http://tracker.private.invalid:2710/… failed"
        );
    }

    #[test]
    fn keeps_loopback_stream_urls_whole() {
        let line = "[harbor::mpv] loadfile http://127.0.0.1:58027/stream/a1846faf/0";
        assert_eq!(redact_urls(line), line);
    }

    #[test]
    fn keeps_only_the_info_hash_of_a_magnet() {
        assert_eq!(
            redact_urls("adding magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=http%3A%2F%2Fpriv.invalid%2FKEY now"),
            "adding magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&… now"
        );
    }

    #[test]
    fn redacts_every_line_of_an_exported_mpv_log() {
        let log = "[27160.319][d][cplayer] Run command: loadfile, args=[url=\"https://cdn.debrid.invalid/dl/TOKEN/ep.mkv\"]\n[27160.320][v][cplayer] Opening https://cdn.debrid.invalid/dl/TOKEN/ep.mkv\n";
        let out = super::redact_text(log);
        assert!(!out.contains("TOKEN"), "{out}");
        assert_eq!(out.lines().count(), 2);
        assert!(out.ends_with('\n'));
    }

    #[cfg(any(target_os = "macos", windows))]
    #[test]
    fn rotates_the_log_while_the_app_runs() {
        let dir = std::env::temp_dir().join(format!("vayra-log-{}", uuid::Uuid::new_v4()));
        let mut log = super::Log::open(&dir, 100).unwrap();
        for i in 0..30 {
            log.write_line(&format!("line {i:02}"));
        }
        let current = std::fs::read_to_string(dir.join("vayra.log")).unwrap();
        let previous = std::fs::read_to_string(dir.join("vayra.log.1")).unwrap();
        assert!(current.len() <= 100, "{current}");
        assert!(previous.len() <= 100, "{previous}");
        assert!(current.ends_with("line 29\n"), "{current}");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn leaves_lines_without_urls_alone() {
        assert_eq!(redact_urls("[torrent-engine] ready on 127.0.0.1:53395 (dht tier 1)"), "[torrent-engine] ready on 127.0.0.1:53395 (dht tier 1)");
    }
}
