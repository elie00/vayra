use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use librqbit::Session;

const INTERVAL: Duration = Duration::from_secs(10);

/// Peer counters of one active torrent. Speed and progress move on every tick, so
/// they are printed but left out of the comparison that decides whether to log.
#[derive(PartialEq)]
struct PeerSnapshot {
    state: String,
    error: Option<String>,
    seen: usize,
    queued: usize,
    connecting: usize,
    live: usize,
    dead: usize,
    not_needed: usize,
}

/// Logs peer counters whenever they change, to tell a swarm that never yields peers
/// (`seen` stays low) from one whose peers are found and then lost (`dead` climbs).
/// librqbit's own connection logs go through `tracing`, which the app does not collect.
pub fn spawn(session: Arc<Session>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut last: HashMap<String, PeerSnapshot> = HashMap::new();
        loop {
            tokio::time::sleep(INTERVAL).await;
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
        }
    })
}
