//! `mpv.exe` for the Windows bundle: the mpv command line over the libmpv-2.dll
//! the app already ships. Multiview, DVR, scrub thumbnails and clip export run mpv
//! as a separate process; without this they needed an mpv installed on the PATH.
//! The official Windows mpv.exe is a static build of about the size of the DLL;
//! this one adds a few hundred kilobytes and plays with the player's own version.
//!
//! It covers the forms VAYRA passes: `--name=value`, `--name` (yes), `--no-name`,
//! `--` before files, and `--version`. libmpv defaults differ from the mpv binary
//! in a few places; only `idle=no` matters to those callers (a recording or an
//! export must end with its file), so it is the one restored.

use std::ffi::{c_char, CStr, CString};
use std::process::ExitCode;

use libmpv2_sys as sys;

#[derive(Debug, PartialEq)]
struct CommandLine {
    options: Vec<(String, String)>,
    files: Vec<String>,
}

fn parse(args: &[String]) -> CommandLine {
    let mut options = Vec::new();
    let mut files = Vec::new();
    let mut only_files = false;
    for arg in args {
        if only_files || !arg.starts_with("--") {
            files.push(arg.clone());
        } else if arg == "--" {
            only_files = true;
        } else {
            let body = &arg[2..];
            let option = match body.split_once('=') {
                Some((name, value)) => (name.to_string(), value.to_string()),
                None => match body.strip_prefix("no-") {
                    Some(name) => (name.to_string(), "no".to_string()),
                    None => (body.to_string(), "yes".to_string()),
                },
            };
            options.push(option);
        }
    }
    CommandLine { options, files }
}

/// mpv's exit codes: 0 played, 1 could not start, 2 every file failed, 3 some did.
fn exit_code(played: u32, failed: u32) -> u8 {
    match (played, failed) {
        (_, 0) => 0,
        (0, _) => 2,
        _ => 3,
    }
}

struct Mpv(*mut sys::mpv_handle);

impl Drop for Mpv {
    fn drop(&mut self) {
        unsafe { sys::mpv_terminate_destroy(self.0) }
    }
}

impl Mpv {
    fn set(&self, name: &str, value: &str) -> Result<(), String> {
        let (n, v) = (cstring(name)?, cstring(value)?);
        check(unsafe { sys::mpv_set_option_string(self.0, n.as_ptr(), v.as_ptr()) })
            .map_err(|e| format!("option --{name}={value}: {e}"))
    }

    fn command(&self, words: &[&str]) -> Result<(), String> {
        let owned = words.iter().map(|w| cstring(w)).collect::<Result<Vec<_>, _>>()?;
        let mut ptrs: Vec<*const c_char> = owned.iter().map(|c| c.as_ptr()).collect();
        ptrs.push(std::ptr::null());
        check(unsafe { sys::mpv_command(self.0, ptrs.as_mut_ptr()) })
            .map_err(|e| format!("{}: {e}", words.join(" ")))
    }

    fn version(&self) -> String {
        let name = c"mpv-version";
        let raw = unsafe { sys::mpv_get_property_string(self.0, name.as_ptr()) };
        if raw.is_null() {
            return "mpv".into();
        }
        let text = unsafe { CStr::from_ptr(raw) }.to_string_lossy().into_owned();
        unsafe { sys::mpv_free(raw.cast()) };
        text
    }
}

fn cstring(text: &str) -> Result<CString, String> {
    CString::new(text).map_err(|_| format!("NUL byte in {text:?}"))
}

fn check(code: i32) -> Result<(), String> {
    if code >= 0 {
        Ok(())
    } else {
        Err(sys::mpv_error_str(code).to_string())
    }
}

fn run(line: CommandLine) -> Result<u8, String> {
    let handle = unsafe { sys::mpv_create() };
    if handle.is_null() {
        return Err("mpv_create failed".into());
    }
    let mpv = Mpv(handle);
    let version_only = line.options.iter().any(|(name, _)| name == "version");

    mpv.set("idle", "no")?;
    for (name, value) in line.options.iter().filter(|(name, _)| name != "version") {
        mpv.set(name, value)?;
    }
    check(unsafe { sys::mpv_initialize(mpv.0) }).map_err(|e| format!("initialize: {e}"))?;
    if version_only {
        println!("{} (VAYRA launcher)", mpv.version());
        return Ok(0);
    }
    for file in &line.files {
        mpv.command(&["loadfile", file, "append-play"])?;
    }

    let (mut played, mut failed) = (0, 0);
    loop {
        let event = unsafe { &*sys::mpv_wait_event(mpv.0, -1.0) };
        match event.event_id {
            sys::mpv_event_id_MPV_EVENT_SHUTDOWN => break,
            sys::mpv_event_id_MPV_EVENT_END_FILE => {
                let end = unsafe { &*(event.data as *const sys::mpv_event_end_file) };
                if end.reason == sys::mpv_end_file_reason_MPV_END_FILE_REASON_ERROR {
                    failed += 1;
                } else {
                    played += 1;
                }
            }
            _ => {}
        }
    }
    Ok(exit_code(played, failed))
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(parse(&args)) {
        Ok(code) => ExitCode::from(code),
        Err(message) => {
            eprintln!("mpv: {message}");
            ExitCode::from(1)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    fn opt(name: &str, value: &str) -> (String, String) {
        (name.to_string(), value.to_string())
    }

    #[test]
    fn reads_the_three_option_forms() {
        let line = parse(&args(&["--wid=42", "--force-window=immediate", "--no-osc", "--quiet"]));
        assert_eq!(
            line.options,
            vec![opt("wid", "42"), opt("force-window", "immediate"), opt("osc", "no"), opt("quiet", "yes")]
        );
        assert!(line.files.is_empty());
    }

    #[test]
    fn keeps_equals_signs_inside_the_value() {
        let line = parse(&args(&[
            "--stream-lavf-o=reconnect=1,reconnect_streamed=1",
            "--vf=scale=320:-2",
        ]));
        assert_eq!(
            line.options,
            vec![opt("stream-lavf-o", "reconnect=1,reconnect_streamed=1"), opt("vf", "scale=320:-2")]
        );
    }

    #[test]
    fn everything_after_the_separator_is_a_file() {
        // DVR passes an addon URL after "--" so it can never act as an option.
        let line = parse(&args(&["--quiet", "--", "--script=evil.lua", "C:\\a b.mkv"]));
        assert_eq!(line.options, vec![opt("quiet", "yes")]);
        assert_eq!(line.files, args(&["--script=evil.lua", "C:\\a b.mkv"]));
    }

    #[test]
    fn bare_arguments_are_files() {
        let line = parse(&args(&["--no-config", "https://example.org/v.m3u8"]));
        assert_eq!(line.options, vec![opt("config", "no")]);
        assert_eq!(line.files, args(&["https://example.org/v.m3u8"]));
    }

    #[test]
    fn exit_codes_follow_mpv() {
        assert_eq!(exit_code(1, 0), 0);
        assert_eq!(exit_code(0, 0), 0);
        assert_eq!(exit_code(0, 1), 2);
        assert_eq!(exit_code(2, 1), 3);
    }
}
