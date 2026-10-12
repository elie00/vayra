//! macOS starts apps with a soft limit of 256 open files. The torrent engine keeps
//! every file of each open torrent open (39 for one season pack) on top of its peer
//! sockets, so it ran out: peer connections, incoming peers and the DHT dump all
//! failed with "Too many open files". Raise the soft limit the way torrent clients do.

/// Enough for several packs and hundreds of peers; also macOS's per-process OPEN_MAX.
#[cfg(unix)]
const TARGET: u64 = 10_240;

/// The soft limit to set, or None when the current one is already high enough.
#[cfg(unix)]
fn raised_soft_limit(soft: u64, hard: u64) -> Option<u64> {
    let target = TARGET.min(hard);
    (target > soft).then_some(target)
}

// rlim_t is 64 bits here but 32 bits on 32-bit Android targets.
#[allow(clippy::unnecessary_cast)]
#[cfg(unix)]
pub fn raise() {
    let mut limit = libc::rlimit { rlim_cur: 0, rlim_max: 0 };
    // SAFETY: getrlimit and setrlimit only read and write the struct passed to them.
    if unsafe { libc::getrlimit(libc::RLIMIT_NOFILE, &mut limit) } != 0 {
        return;
    }
    let Some(soft) = raised_soft_limit(limit.rlim_cur as u64, limit.rlim_max as u64) else { return };
    let previous = limit.rlim_cur;
    limit.rlim_cur = soft as libc::rlim_t;
    if unsafe { libc::setrlimit(libc::RLIMIT_NOFILE, &limit) } == 0 {
        eprintln!("[fd-limit] open file limit raised from {previous} to {soft}");
    } else {
        eprintln!("[fd-limit] could not raise the open file limit from {previous}: {}", std::io::Error::last_os_error());
    }
}

#[cfg(not(unix))]
pub fn raise() {}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn raises_the_default_macos_limit() {
        assert_eq!(raised_soft_limit(256, u64::MAX), Some(TARGET));
    }

    #[test]
    fn stays_within_the_hard_limit() {
        assert_eq!(raised_soft_limit(256, 1024), Some(1024));
        assert_eq!(raised_soft_limit(256, 256), None);
    }

    #[test]
    fn never_lowers_a_higher_limit() {
        assert_eq!(raised_soft_limit(65_536, u64::MAX), None);
    }
}
