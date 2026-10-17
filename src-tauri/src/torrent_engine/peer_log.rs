use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use librqbit::Session;

const INTERVAL: Duration = Duration::from_secs(10);
/// Failure causes are summed over a minute, and a torrent's counters printed at most
/// once a minute: printed on every tick, or on every change of counters that move
/// on every tick, either made up most of the log.
const ERRORS_EVERY_TICKS: u64 = 6;

/// Peer counters of one active torrent. Speed and progress move on every tick, so
/// they are printed but left out of the comparison that decides whether to log.
#[derive(PartialEq)]
struct PeerSnapshot {
    state: String,
    error: Option<String>,
    seen: u32,
    queued: u32,
    connecting: u32,
    live: u32,
    dead: u32,
    not_needed: u32,
}

/// Whether to print a torrent's counters: on a change of state or error at once,
/// otherwise once a minute if they moved since last printed.
fn should_log(printed: Option<&PeerSnapshot>, now: &PeerSnapshot, minute: bool) -> bool {
    match printed {
        None => true,
        Some(p) if p.state != now.state || p.error != now.error => true,
        Some(p) => minute && p != now,
    }
}

/// Logs peer counters as they change, to tell a swarm that never yields peers
/// (`seen` stays low) from one whose peers are found and then lost (`dead` climbs),
/// and why peer connections failed in the last minute, for all torrents.
pub fn spawn(session: Arc<Session>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut last: HashMap<String, PeerSnapshot> = HashMap::new();
        let mut tick = 0u64;
        loop {
            tokio::time::sleep(INTERVAL).await;
            tick += 1;
            let minute = tick.is_multiple_of(ERRORS_EVERY_TICKS);
            let handles = session.with_torrents(|it| it.map(|(_, h)| h.clone()).collect::<Vec<_>>());
            let mut current = HashMap::new();
            for handle in handles {
                let s = handle.stats();
                let Some(live) = &s.live else { continue };
                if s.finished {
                    continue;
                }
                let ps = &live.snapshot.peer_stats;
                let hash = format!("{:?}", handle.info_hash());
                let snap = PeerSnapshot {
                    state: format!("{:?}", s.state),
                    error: s.error.clone(),
                    seen: ps.seen,
                    queued: ps.queued,
                    connecting: ps.connecting,
                    live: ps.live,
                    dead: ps.dead,
                    not_needed: ps.not_needed,
                };
                if !should_log(last.get(&hash), &snap, minute) {
                    if let Some(printed) = last.remove(&hash) {
                        current.insert(hash, printed);
                    }
                    continue;
                }
                let pct = if s.total_bytes > 0 {
                    s.progress_bytes as f64 * 100.0 / s.total_bytes as f64
                } else {
                    0.0
                };
                eprintln!(
                    "[torrent-engine] peers {} {} seen={} queued={} connecting={} live={} dead={} not_needed={} down={:.0}KiB/s progress={:.1}%{}",
                    &hash[..8.min(hash.len())],
                    snap.state,
                    snap.seen,
                    snap.queued,
                    snap.connecting,
                    snap.live,
                    snap.dead,
                    snap.not_needed,
                    live.download_speed.mbps * 1024.0,
                    pct,
                    snap.error.as_deref().map(|e| format!(" error={e}")).unwrap_or_default(),
                );
                current.insert(hash, snap);
            }
            last = current;
            if !minute {
                continue;
            }
            let errors = crate::app_log::take_peer_errors();
            if !errors.is_empty() {
                let causes: Vec<String> = errors.iter().map(|(cause, n)| format!("{cause}={n}")).collect();
                eprintln!("[torrent-engine] peer errors {}s {}", INTERVAL.as_secs() * ERRORS_EVERY_TICKS, causes.join(" "));
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{should_log, PeerSnapshot};

    fn snap(state: &str, live: u32) -> PeerSnapshot {
        PeerSnapshot { state: state.into(), error: None, seen: 10, queued: 0, connecting: 1, live, dead: 0, not_needed: 0 }
    }

    #[test]
    fn logs_a_torrent_at_most_once_a_minute_unless_its_state_changes() {
        // Peer counters move on every tick: logged on each change they buried the log.
        assert!(!should_log(Some(&snap("Live", 3)), &snap("Live", 4), false));
        assert!(should_log(Some(&snap("Live", 3)), &snap("Live", 4), true));
        assert!(!should_log(Some(&snap("Live", 3)), &snap("Live", 3), true));
        assert!(should_log(Some(&snap("Live", 3)), &snap("Paused", 3), false));
        assert!(should_log(None, &snap("Live", 0), false));
    }
}
