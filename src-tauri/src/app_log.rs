/// A Finder launch sends stderr nowhere, taking every `eprintln!` diagnostic with it.
/// Keep them in ~/Library/Logs/VAYRA/vayra.log, unless stderr is already a terminal.
/// Lines reach the file through a pipe so that URLs are redacted on the way.
#[cfg(target_os = "macos")]
pub fn redirect_stderr_to_log() {
    use std::io::{BufRead, Write};
    use std::os::fd::FromRawFd;
    if unsafe { libc::isatty(libc::STDERR_FILENO) } == 1 {
        return;
    }
    let Some(home) = std::env::var_os("HOME") else { return };
    let dir = std::path::Path::new(&home).join("Library/Logs/VAYRA");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("vayra.log");
    // One previous generation is kept, so the log cannot grow without bound.
    if std::fs::metadata(&path).map(|m| m.len() > 10 * 1024 * 1024).unwrap_or(false) {
        let _ = std::fs::rename(&path, dir.join("vayra.log.1"));
    }
    let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) else { return };
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
    let reader = unsafe { std::fs::File::from_raw_fd(fds[0]) };
    // The thread must keep draining the pipe whatever happens, or a full pipe would
    // block every later write to stderr; write errors are therefore ignored.
    let _ = std::thread::Builder::new().name("app-log".into()).spawn(move || {
        for line in std::io::BufReader::new(reader).split(b'\n').map_while(Result::ok) {
            let _ = writeln!(file, "{}", redact_urls(&String::from_utf8_lossy(&line)));
        }
    });
}

/// librqbit tells why a peer connection ends only through `tracing`, at debug level.
/// Keep warnings from every crate plus librqbit's peer life cycle (connection errors,
/// backoff, drops) on stderr, next to the engine's own `[torrent-engine] peers` lines.
pub fn init_tracing() {
    use tracing_subscriber::filter::{filter_fn, LevelFilter};
    use tracing_subscriber::prelude::*;
    let filter = filter_fn(|meta| {
        LevelFilter::WARN >= *meta.level()
            || (meta.target() == "librqbit::torrent_state::live" && LevelFilter::DEBUG >= *meta.level())
    });
    let layer = tracing_subscriber::fmt::layer()
        .with_ansi(false)
        .with_writer(std::io::stderr)
        .with_filter(filter);
    let _ = tracing_subscriber::registry().with(layer).try_init();
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
    use super::redact_urls;

    #[test]
    fn keeps_only_the_host_of_a_remote_url() {
        assert_eq!(
            redact_urls("[harbor::mpv] loadfile https://x1.download.real-debrid.com/d/TOKEN123/Movie.mkv?key=abc"),
            "[harbor::mpv] loadfile https://x1.download.real-debrid.com/…"
        );
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

    #[test]
    fn leaves_lines_without_urls_alone() {
        assert_eq!(redact_urls("[torrent-engine] ready on 127.0.0.1:53395 (dht tier 1)"), "[torrent-engine] ready on 127.0.0.1:53395 (dht tier 1)");
    }
}
