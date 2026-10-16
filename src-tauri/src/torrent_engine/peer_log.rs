use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use librqbit::Session;

const INTERVAL: Duration = Duration::from_secs(10);
/// Failure causes are summed over a minute: printed every tick while any torrent
/// ran, they made up 70% of the log.
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

/// Logs peer counters whenever they change, to tell a swarm that never yields peers
/// (`seen` stays low) from one whose peers are found and then lost (`dead` climbs),
/// and why peer connections failed in the last minute, for all torrents.
pub fn spawn(session: Arc<Session>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut last: HashMap<String, PeerSnapshot> = HashMap::new();
        let mut tick = 0u64;
        loop {
            tokio::time::sleep(INTERVAL).await;
            tick += 1;
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
                if last.get(&hash) != Some(&snap) {
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
                }
                current.insert(hash, snap);
            }
            last = current;
            if tick % ERRORS_EVERY_TICKS != 0 {
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
