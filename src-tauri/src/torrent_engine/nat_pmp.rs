//! Port forwarding through PCP (RFC 6887) or NAT-PMP (RFC 6886), for routers whose
//! UPnP is missing or refuses: started with a listening session, it steps in only if
//! UPnP has not forwarded the port after a while, then renews the mapping.

use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Method {
    Pcp,
    NatPmp,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Mapping {
    pub method: Method,
    pub external_port: u16,
    pub lifetime: Duration,
}

/// Where routers listen for PCP and NAT-PMP requests.
const SERVER_PORT: u16 = 5351;
/// Requested lifetime of a mapping; it is renewed at half its granted lifetime.
const LIFETIME_SECS: u32 = 7200;
/// UPnP usually forwards within seconds; only after this does PCP/NAT-PMP step in.
const UPNP_GRACE: Duration = Duration::from_secs(45);
/// Bound on one PCP/NAT-PMP attempt, whatever the network does with the packets.
const ATTEMPT_TIMEOUT: Duration = Duration::from_secs(10);
/// After a failed attempt, try again later: the router may come back, or macOS may
/// only now let the app reach the local network.
const RETRY_AFTER: Duration = Duration::from_secs(5 * 60);

/// The default IPv4 gateway in `route -n get default` output (macOS, BSD).
#[cfg(any(target_os = "macos", target_os = "ios", test))]
fn parse_bsd_route(out: &str) -> Option<Ipv4Addr> {
    out.lines().find_map(|l| l.trim().strip_prefix("gateway:")).and_then(|g| g.trim().parse().ok())
}

/// The default gateway in /proc/net/route (Linux): little-endian hex, destination 0.
#[cfg(any(target_os = "linux", target_os = "android", test))]
fn parse_proc_route(out: &str) -> Option<Ipv4Addr> {
    out.lines().skip(1).find_map(|line| {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.get(1) != Some(&"00000000") {
            return None;
        }
        let gateway = u32::from_str_radix(fields.get(2)?, 16).ok().filter(|g| *g != 0)?;
        Some(Ipv4Addr::from(gateway.to_le_bytes()))
    })
}

/// The default gateway in `route print -4 0.0.0.0` output (Windows).
#[cfg(any(windows, test))]
fn parse_windows_route(out: &str) -> Option<Ipv4Addr> {
    out.lines().find_map(|line| {
        let fields: Vec<&str> = line.split_whitespace().collect();
        match fields.as_slice() {
            ["0.0.0.0", "0.0.0.0", gateway, ..] => gateway.parse().ok(),
            _ => None,
        }
    })
}

fn default_gateway() -> Option<Ipv4Addr> {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        let out = std::process::Command::new("route").args(["-n", "get", "default"]).output().ok()?;
        parse_bsd_route(&String::from_utf8_lossy(&out.stdout))
    }
    #[cfg(any(target_os = "linux", target_os = "android"))]
    {
        parse_proc_route(&std::fs::read_to_string("/proc/net/route").ok()?)
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let out = std::process::Command::new("route")
            .args(["print", "-4", "0.0.0.0"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        parse_windows_route(&String::from_utf8_lossy(&out.stdout))
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "linux", target_os = "android", windows)))]
    {
        None
    }
}

fn natpmp_request(port: u16, lifetime: u32) -> [u8; 12] {
    let mut r = [0u8; 12];
    r[1] = 2; // map TCP
    r[4..6].copy_from_slice(&port.to_be_bytes());
    r[6..8].copy_from_slice(&port.to_be_bytes());
    r[8..12].copy_from_slice(&lifetime.to_be_bytes());
    r
}

fn pcp_request(client: Ipv4Addr, port: u16, lifetime: u32, nonce: [u8; 12]) -> [u8; 60] {
    let mut r = [0u8; 60];
    r[0] = 2; // version
    r[1] = 1; // MAP request
    r[4..8].copy_from_slice(&lifetime.to_be_bytes());
    r[8..24].copy_from_slice(&client.to_ipv6_mapped().octets());
    r[24..36].copy_from_slice(&nonce);
    r[36] = 6; // TCP
    r[40..42].copy_from_slice(&port.to_be_bytes());
    r[42..44].copy_from_slice(&port.to_be_bytes());
    // Any external address: the IPv4-mapped all-zero address.
    r[44..60].copy_from_slice(&Ipv4Addr::UNSPECIFIED.to_ipv6_mapped().octets());
    r
}

fn parse_pcp(reply: &[u8]) -> Result<Mapping, String> {
    if reply.len() < 60 || reply[1] != 0x81 {
        return Err("malformed PCP answer".into());
    }
    if reply[3] != 0 {
        return Err(format!("PCP result code {}", reply[3]));
    }
    Ok(Mapping {
        method: Method::Pcp,
        external_port: u16::from_be_bytes([reply[42], reply[43]]),
        lifetime: Duration::from_secs(u32::from_be_bytes([reply[4], reply[5], reply[6], reply[7]]).into()),
    })
}

fn parse_natpmp(reply: &[u8]) -> Result<Mapping, String> {
    if reply.len() < 16 || reply[1] != 130 {
        return Err("malformed NAT-PMP answer".into());
    }
    let result = u16::from_be_bytes([reply[2], reply[3]]);
    if result != 0 {
        return Err(format!("NAT-PMP result code {result}"));
    }
    Ok(Mapping {
        method: Method::NatPmp,
        external_port: u16::from_be_bytes([reply[10], reply[11]]),
        lifetime: Duration::from_secs(u32::from_be_bytes([reply[12], reply[13], reply[14], reply[15]]).into()),
    })
}

/// Send a request and wait for the answer, resending with growing delays (RFC 6886 §3.1).
async fn exchange(socket: &tokio::net::UdpSocket, request: &[u8]) -> Result<Vec<u8>, String> {
    let mut buf = [0u8; 1100];
    for wait_ms in [250, 500, 1000, 2000] {
        socket.send(request).await.map_err(|e| e.to_string())?;
        match tokio::time::timeout(Duration::from_millis(wait_ms), socket.recv(&mut buf)).await {
            Ok(Ok(n)) => return Ok(buf[..n].to_vec()),
            Ok(Err(e)) => return Err(e.to_string()),
            Err(_) => continue,
        }
    }
    Err("no answer from the router".into())
}

/// Ask the router for the port, through PCP first and NAT-PMP when it only speaks that.
async fn map(gateway: SocketAddr, port: u16, lifetime: u32) -> Result<Mapping, String> {
    let socket = tokio::net::UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).await.map_err(|e| e.to_string())?;
    socket.connect(gateway).await.map_err(|e| e.to_string())?;
    let client = match socket.local_addr().map_err(|e| e.to_string())?.ip() {
        std::net::IpAddr::V4(ip) => ip,
        std::net::IpAddr::V6(_) => return Err("no IPv4 route to the router".into()),
    };
    // The nonce only has to tell this client's mappings apart.
    let seed = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let mut nonce = [0u8; 12];
    nonce.copy_from_slice(&seed.to_be_bytes()[4..16]);
    let reply = exchange(&socket, &pcp_request(client, port, lifetime, nonce)).await?;
    // A NAT-PMP-only router answers PCP's version 2 with its own version 0.
    if reply.first() == Some(&2) {
        return parse_pcp(&reply);
    }
    parse_natpmp(&exchange(&socket, &natpmp_request(port, lifetime)).await?)
}

/// One mapping request to the router, bounded in time.
async fn attempt(gateway: SocketAddr, port: u16) -> Result<Mapping, String> {
    tokio::time::timeout(ATTEMPT_TIMEOUT, map(gateway, port, LIFETIME_SECS))
        .await
        .unwrap_or_else(|_| Err("no answer in time".into()))
}

/// Keep the listening port mapped through PCP/NAT-PMP while UPnP has not forwarded it.
pub fn spawn(port: u16) -> tokio::task::JoinHandle<()> {
    use super::port_status::{activity, set_forwarded, Forwarding};
    tokio::spawn(async move {
        tokio::time::sleep(UPNP_GRACE).await;
        if activity().forwarding == Forwarding::Forwarded {
            return;
        }
        let Some(gateway) = tokio::task::spawn_blocking(default_gateway).await.ok().flatten() else {
            eprintln!("[torrent-engine] no default gateway for PCP/NAT-PMP");
            return;
        };
        eprintln!("[torrent-engine] UPnP has not forwarded port {port}; asking {gateway} through PCP/NAT-PMP");
        let router = SocketAddr::from((gateway, SERVER_PORT));
        // Logged on changes only: a router without PCP/NAT-PMP is retried quietly.
        let mut mapped: Option<bool> = None;
        loop {
            match attempt(router, port).await {
                Ok(m) => {
                    if mapped != Some(true) {
                        eprintln!("[torrent-engine] port {port} forwarded through {:?} (external {})", m.method, m.external_port);
                    }
                    mapped = Some(true);
                    set_forwarded();
                    tokio::time::sleep((m.lifetime / 2).max(Duration::from_secs(60))).await;
                }
                Err(e) => {
                    if mapped != Some(false) {
                        eprintln!("[torrent-engine] PCP/NAT-PMP failed at {gateway}: {e}; retrying every 5 min");
                    }
                    mapped = Some(false);
                    tokio::time::sleep(RETRY_AFTER).await;
                    if activity().forwarding == Forwarding::Forwarded {
                        return;
                    }
                }
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_default_gateway_of_each_desktop() {
        let bsd = "   route to: default\ndestination: default\n       mask: default\n    gateway: 192.168.1.254\n  interface: en0\n";
        assert_eq!(parse_bsd_route(bsd), Some(Ipv4Addr::new(192, 168, 1, 254)));
        let proc = "Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT\n\
                    eth0\t00000000\tFE01A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0\n\
                    eth0\t0001A8C0\t00000000\t0001\t0\t0\t100\t00FFFFFF\t0\t0\t0\n";
        assert_eq!(parse_proc_route(proc), Some(Ipv4Addr::new(192, 168, 1, 254)));
        let windows = "IPv4 Route Table\n===\nActive Routes:\nNetwork Destination        Netmask          Gateway       Interface  Metric\n          0.0.0.0          0.0.0.0    192.168.1.254     192.168.1.85     25\n===\n";
        assert_eq!(parse_windows_route(windows), Some(Ipv4Addr::new(192, 168, 1, 254)));
        assert_eq!(parse_bsd_route("route: writing to routing socket: not in table\n"), None);
    }

    #[test]
    fn builds_the_mapping_requests() {
        assert_eq!(natpmp_request(16881, 7200), [0, 2, 0, 0, 0x41, 0xF1, 0x41, 0xF1, 0, 0, 0x1C, 0x20]);
        let pcp = pcp_request(Ipv4Addr::new(192, 168, 1, 85), 16881, 7200, [7; 12]);
        assert_eq!(&pcp[..8], &[2, 1, 0, 0, 0, 0, 0x1C, 0x20]);
        assert_eq!(&pcp[8..24], &[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xFF, 0xFF, 192, 168, 1, 85]);
        assert_eq!(&pcp[24..36], &[7; 12]);
        assert_eq!(pcp[36], 6, "TCP");
        assert_eq!(&pcp[40..44], &[0x41, 0xF1, 0x41, 0xF1]);
        assert_eq!(&pcp[44..60], &[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xFF, 0xFF, 0, 0, 0, 0]);
    }

    /// A NAT-PMP-only router: it rejects PCP's version, then maps the port.
    #[tokio::test]
    async fn falls_back_to_nat_pmp_when_the_router_rejects_pcp() {
        let router = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let gateway = router.local_addr().unwrap();
        tokio::spawn(async move {
            let mut buf = [0u8; 1100];
            loop {
                let (n, from) = router.recv_from(&mut buf).await.unwrap();
                let reply: Vec<u8> = if buf[0] == 2 {
                    vec![0, 0x81, 0, 1, 0, 0, 0, 0]
                } else {
                    assert_eq!(n, 12);
                    let mut r = vec![0, 130, 0, 0, 0, 0, 0, 9];
                    r.extend_from_slice(&buf[4..6]);
                    r.extend_from_slice(&[0x41, 0xF2, 0, 0, 0x1C, 0x20]);
                    r
                };
                router.send_to(&reply, from).await.unwrap();
            }
        });
        let mapping = map(gateway, 16881, 7200).await.unwrap();
        assert_eq!(
            mapping,
            Mapping { method: Method::NatPmp, external_port: 16882, lifetime: Duration::from_secs(7200) }
        );
    }

    /// A router that never answers fails the attempt within seconds instead of hanging.
    #[tokio::test]
    async fn gives_up_on_a_silent_router() {
        let router = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let started = std::time::Instant::now();
        let result = attempt(router.local_addr().unwrap(), 16881).await;
        assert!(result.is_err());
        assert!(started.elapsed() < ATTEMPT_TIMEOUT + Duration::from_secs(1));
    }

    /// A PCP router maps the port at once.
    #[tokio::test]
    async fn maps_the_port_through_pcp() {
        let router = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let gateway = router.local_addr().unwrap();
        tokio::spawn(async move {
            let mut buf = [0u8; 1100];
            let (n, from) = router.recv_from(&mut buf).await.unwrap();
            assert_eq!(n, 60);
            let mut r = vec![2, 0x81, 0, 0, 0, 0, 0x0E, 0x10, 0, 0, 0, 1];
            r.extend_from_slice(&[0; 12]);
            r.extend_from_slice(&buf[24..40]);
            r.extend_from_slice(&[0x41, 0xF1, 0x41, 0xF1]);
            r.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xFF, 0xFF, 203, 0, 113, 7]);
            router.send_to(&r, from).await.unwrap();
        });
        let mapping = map(gateway, 16881, 7200).await.unwrap();
        assert_eq!(
            mapping,
            Mapping { method: Method::Pcp, external_port: 16881, lifetime: Duration::from_secs(3600) }
        );
    }
}
