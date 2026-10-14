//! Whether peers can reach the engine's listening port, from what librqbit reports
//! through `tracing`: incoming connections it accepted, and how the UPnP forwarder
//! fared with the router (or PCP/NAT-PMP, see `nat_pmp`). No outside service is asked.

use std::sync::Mutex;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Forwarding {
    /// Nothing heard from UPnP (or PCP/NAT-PMP) yet.
    #[default]
    Pending,
    Forwarded,
    Failed,
    NoService,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PortActivity {
    pub incoming: u64,
    pub incoming_ipv6: u64,
    pub last_incoming_ms: Option<u64>,
    pub forwarding: Forwarding,
}

static ACTIVITY: Mutex<PortActivity> = Mutex::new(PortActivity {
    incoming: 0,
    incoming_ipv6: 0,
    last_incoming_ms: None,
    forwarding: Forwarding::Pending,
});

pub fn activity() -> PortActivity {
    *ACTIVITY.lock().unwrap_or_else(|e| e.into_inner())
}

/// PCP or NAT-PMP mapped the port where UPnP did not.
pub fn set_forwarded() {
    ACTIVITY.lock().unwrap_or_else(|e| e.into_inner()).forwarding = Forwarding::Forwarded;
}

/// librqbit's listener: one trace event per accepted incoming connection.
pub const SESSION_EVENTS: &str = "librqbit::session";
pub const UPNP_EVENTS: &str = "librqbit_upnp";

/// Fold one librqbit event into the activity.
fn note(activity: &mut PortActivity, target: &str, message: &str, now_ms: u64) {
    if target == SESSION_EVENTS {
        let Some(addr) = message.strip_prefix("accepted connection from ") else { return };
        activity.incoming += 1;
        activity.last_incoming_ms = Some(now_ms);
        // A dual-stack socket shows IPv4 peers as ::ffff:a.b.c.d.
        if addr.starts_with('[') && !addr.starts_with("[::ffff:") {
            activity.incoming_ipv6 += 1;
        }
    } else if target == UPNP_EVENTS {
        if message.starts_with("port forwarded") {
            activity.forwarding = Forwarding::Forwarded;
        } else if message.starts_with("failed to forward port") {
            activity.forwarding = Forwarding::Failed;
        } else if message.starts_with("no supported WANIPConnection service") {
            activity.forwarding = Forwarding::NoService;
        }
    }
}

/// Feeds `note` from the tracing events of librqbit's listener and UPnP forwarder.
pub struct Layer;

impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for Layer {
    fn on_event(&self, event: &tracing::Event<'_>, _: tracing_subscriber::layer::Context<'_, S>) {
        let message = crate::app_log::message_of(event);
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        note(&mut ACTIVITY.lock().unwrap_or_else(|e| e.into_inner()), event.metadata().target(), &message, now_ms);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fold(events: &[(&str, &str)]) -> PortActivity {
        let mut a = PortActivity::default();
        for (i, (target, message)) in events.iter().enumerate() {
            note(&mut a, target, message, i as u64);
        }
        a
    }

    #[test]
    fn counts_incoming_peers_and_those_over_ipv6() {
        let a = fold(&[
            ("librqbit::session", "accepted connection from 89.93.37.7:51413"),
            ("librqbit::session", "accepted connection from [2a01:cb00:1:2::5]:6881"),
            ("librqbit::session", "accepted connection from [::ffff:89.93.37.7]:51413"),
            ("librqbit::session", "starting UPnP port forwarder"),
        ]);
        assert_eq!((a.incoming, a.incoming_ipv6, a.last_incoming_ms), (3, 1, Some(2)));
    }

    #[test]
    fn follows_the_router_forwarding() {
        assert_eq!(fold(&[("librqbit_upnp", "port forwarded")]).forwarding, Forwarding::Forwarded);
        assert_eq!(
            fold(&[("librqbit_upnp", "port forwarded"), ("librqbit_upnp", "failed to forward port: 500")]).forwarding,
            Forwarding::Failed,
        );
        assert_eq!(
            fold(&[("librqbit_upnp", "no supported WANIPConnection service at http://192.168.1.254/")]).forwarding,
            Forwarding::NoService,
        );
        assert_eq!(fold(&[("librqbit::session", "port forwarded")]).forwarding, Forwarding::Pending);
    }
}
