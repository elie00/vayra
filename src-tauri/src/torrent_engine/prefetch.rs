//! Resuming a torrent stream mid-file: mpv reads the header, then the index at the
//! end of the file (MKV cues, MP4 moov), then the resume point, each request waiting
//! for the one before. Reading the end and the resume point at once lets librqbit
//! fetch their pieces alongside the header.

use std::io::SeekFrom;
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncSeekExt};

const MIB: u64 = 1024 * 1024;
/// Where MKV cues and an MP4 moov written last sit.
const TAIL: u64 = 8 * MIB;
/// The start of the next episode: enough for its header and its first minute.
const HEAD: u64 = 32 * MIB;
/// Around the resume point: its position in bytes is only estimated from the time.
const WINDOW: u64 = 16 * MIB;
/// A reader gives up after this, so a dead swarm does not keep it alive.
const READ_FOR: Duration = Duration::from_secs(180);

/// The byte ranges to read ahead: the end of the file, and a window around the
/// resume point estimated from its share of the running time.
pub fn ranges(file_len: u64, start_sec: f64, duration_sec: f64) -> Vec<(u64, u64)> {
    if file_len == 0 {
        return Vec::new();
    }
    let tail = file_len.saturating_sub(TAIL);
    let mut out = vec![(tail, file_len - tail)];
    if start_sec > 0.0 && duration_sec > 0.0 && start_sec < duration_sec {
        let at = (file_len as f64 * start_sec / duration_sec) as u64;
        let from = at.saturating_sub(WINDOW / 4);
        if from + WINDOW <= tail {
            out.push((from, WINDOW));
        }
    }
    out
}

/// The start of a file and its end, for an episode prepared before it plays.
pub fn head_ranges(file_len: u64) -> Vec<(u64, u64)> {
    let head = HEAD.min(file_len);
    let mut out = vec![(0, head)];
    let tail = file_len.saturating_sub(TAIL).max(head);
    if tail < file_len {
        out.push((tail, file_len - tail));
    }
    out.retain(|&(_, len)| len > 0);
    out
}

/// Read those ranges in the background, so librqbit fetches their pieces now.
pub fn start(handle: Arc<librqbit::ManagedTorrent>, file_idx: usize, ranges: Vec<(u64, u64)>) {
    tokio::spawn(read_all(handle, file_idx, ranges));
}

/// Read those ranges at once and return when all are read, or have given up.
pub async fn read_all(handle: Arc<librqbit::ManagedTorrent>, file_idx: usize, ranges: Vec<(u64, u64)>) {
    futures_util::future::join_all(ranges.into_iter().map(|(from, len)| read_range(handle.clone(), file_idx, from, len))).await;
}

async fn read_range(handle: Arc<librqbit::ManagedTorrent>, file_idx: usize, from: u64, len: u64) {
    let Ok(mut stream) = handle.stream(file_idx).await else { return };
    if stream.seek(SeekFrom::Start(from)).await.is_err() {
        return;
    }
    let mut buf = vec![0u8; 256 * 1024];
    let mut left = len;
    let _ = tokio::time::timeout(READ_FOR, async {
        while left > 0 {
            let want = left.min(buf.len() as u64) as usize;
            match stream.read(&mut buf[..want]).await {
                Ok(0) | Err(_) => break,
                Ok(n) => left -= n as u64,
            }
        }
    })
    .await;
}

#[cfg(test)]
mod tests {
    use super::{head_ranges, ranges};

    const MIB: u64 = 1024 * 1024;

    #[test]
    fn reads_the_end_of_the_file_and_around_the_resume_point() {
        // An 8.3 GB episode of 55 minutes resumed at 30 minutes.
        let len = 8_300 * MIB;
        let r = ranges(len, 1800.0, 3300.0);
        assert_eq!(r[0], (len - 8 * MIB, 8 * MIB));
        let at = (len as f64 * 1800.0 / 3300.0) as u64;
        assert_eq!(r[1], (at - 4 * MIB, 16 * MIB));
        assert_eq!(r.len(), 2);
    }

    #[test]
    fn reads_only_the_end_from_the_start_or_without_a_running_time() {
        assert_eq!(ranges(100 * MIB, 0.0, 3300.0), vec![(92 * MIB, 8 * MIB)]);
        assert_eq!(ranges(100 * MIB, 1800.0, 0.0), vec![(92 * MIB, 8 * MIB)]);
        assert_eq!(ranges(4 * MIB, 0.0, 0.0), vec![(0, 4 * MIB)]);
        assert!(ranges(0, 10.0, 100.0).is_empty());
    }

    #[test]
    fn does_not_read_the_end_twice_near_it() {
        let len = 100 * MIB;
        assert_eq!(ranges(len, 3290.0, 3300.0), vec![(92 * MIB, 8 * MIB)]);
    }

    #[test]
    fn reads_the_start_and_the_end_of_the_next_episode() {
        let len = 1_500 * MIB;
        assert_eq!(head_ranges(len), vec![(0, 32 * MIB), (len - 8 * MIB, 8 * MIB)]);
        assert_eq!(head_ranges(20 * MIB), vec![(0, 20 * MIB)]);
        assert_eq!(head_ranges(36 * MIB), vec![(0, 32 * MIB), (32 * MIB, 4 * MIB)]);
        assert!(head_ranges(0).is_empty());
    }
}
