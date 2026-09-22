use std::time::Instant;

/// Times each load from mpv's `start-file` to its first `playback-restart`, the moment
/// a frame is ready, so the log shows where playback is slow instead of guessing.
#[derive(Default)]
pub struct LoadTimer {
    started: Option<Instant>,
    loaded_ms: Option<u128>,
}

impl LoadTimer {
    pub fn on_start(&mut self, now: Instant) {
        self.started = Some(now);
        self.loaded_ms = None;
    }

    pub fn on_loaded(&mut self, now: Instant) {
        if let Some(start) = self.started {
            self.loaded_ms = Some(now.duration_since(start).as_millis());
        }
    }

    /// The line to log for the first restart after a load; later restarts are seeks.
    pub fn on_restart(&mut self, now: Instant) -> Option<String> {
        let start = self.started.take()?;
        let loaded = self.loaded_ms.take().map_or("?".to_string(), |ms| ms.to_string());
        let peak = peak_memory_mb().map_or("?".to_string(), |mb| mb.to_string());
        Some(format!(
            "[harbor::mpv] first frame after {} ms (file open after {} ms), peak memory {} MB",
            now.duration_since(start).as_millis(),
            loaded,
            peak
        ))
    }
}

/// The process's peak resident memory since launch.
#[cfg(unix)]
pub fn peak_memory_mb() -> Option<u64> {
    let mut usage = std::mem::MaybeUninit::<libc::rusage>::uninit();
    if unsafe { libc::getrusage(libc::RUSAGE_SELF, usage.as_mut_ptr()) } != 0 {
        return None;
    }
    let max_rss = unsafe { usage.assume_init() }.ru_maxrss.max(0) as u64;
    // macOS reports bytes, Linux kilobytes.
    let bytes = if cfg!(target_os = "macos") { max_rss } else { max_rss * 1024 };
    Some(bytes / (1024 * 1024))
}

#[cfg(not(unix))]
pub fn peak_memory_mb() -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn reports_the_first_frame_of_a_load() {
        let t0 = Instant::now();
        let mut timer = LoadTimer::default();
        timer.on_start(t0);
        timer.on_loaded(t0 + Duration::from_millis(300));
        let line = timer.on_restart(t0 + Duration::from_millis(1200)).unwrap();
        assert!(line.contains("first frame after 1200 ms (file open after 300 ms)"), "{line}");
    }

    #[test]
    fn ignores_restarts_caused_by_seeks() {
        let t0 = Instant::now();
        let mut timer = LoadTimer::default();
        timer.on_start(t0);
        assert!(timer.on_restart(t0 + Duration::from_millis(500)).is_some());
        assert!(timer.on_restart(t0 + Duration::from_millis(9000)).is_none());
    }

    #[test]
    fn ignores_a_restart_without_a_load() {
        assert!(LoadTimer::default().on_restart(Instant::now()).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn measures_some_peak_memory() {
        assert!(peak_memory_mb().unwrap() > 0);
    }
}
