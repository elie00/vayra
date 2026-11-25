use std::net::SocketAddr;
use std::time::Duration;

use futures_util::StreamExt;
use librqbit::dht::{Dht, DhtBuilder, DhtConfig, Id20};
use tokio::time::{timeout_at, Instant};

/// librqbit's own bootstrap nodes. router.bittorrent.com, router.utorrent.com and
/// dht.aelitis.com no longer answer, and librqbit retried each of them every
/// minute or two for a whole day, logging a warning every time.
pub async fn build() -> Option<Dht> {
    match DhtBuilder::with_config(DhtConfig::default()).await {
        Ok(d) => Some(d),
        Err(e) => {
            eprintln!("[torrent-engine] side DHT unavailable: {e:#}");
            None
        }
    }
}

pub fn node_count(dht: &Dht) -> usize {
    dht.stats().routing_table_size
}

pub fn info_hash_from_magnet(magnet: &str) -> Option<Id20> {
    let lower = magnet.to_ascii_lowercase();
    let start = lower.find("btih:")? + 5;
    let hex: String = lower[start..]
        .chars()
        .take_while(|c| c.is_ascii_hexdigit())
        .collect();
    if hex.len() == 40 {
        hex.parse::<Id20>().ok()
    } else {
        None
    }
}

/// Early-burst peer harvest: hand initial peers to librqbit as soon as we have a
/// healthy seed batch (12 peers) or once the short burst window (450ms) elapses
/// with at least one peer, so tracker + librqbit DHT metadata fetch starts over
/// a second sooner instead of blocking for the full budget.
const EARLY_PEER_TARGET: usize = 12;
const EARLY_BURST_MS: u64 = 450;

pub async fn seed_peers(dht: &Dht, magnet: &str, max: usize, budget: Duration) -> Vec<SocketAddr> {
    let Some(id) = info_hash_from_magnet(magnet) else {
        return Vec::new();
    };
    let mut stream = dht.get_peers(id, None);
    let mut out: Vec<SocketAddr> = Vec::new();
    let started = Instant::now();
    let hard_deadline = started + budget;
    let early_deadline = started + Duration::from_millis(EARLY_BURST_MS).min(budget);
    while out.len() < max {
        let deadline = if out.is_empty() {
            hard_deadline
        } else {
            early_deadline
        };
        match timeout_at(deadline, stream.next()).await {
            Ok(Some(addr)) => {
                if !out.contains(&addr) {
                    out.push(addr);
                    if out.len() >= EARLY_PEER_TARGET && Instant::now() >= early_deadline {
                        break;
                    }
                }
            }
            _ => break,
        }
    }
    out
}
