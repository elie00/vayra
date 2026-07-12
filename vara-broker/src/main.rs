// vayra-vara-broker — standalone local broker for VARA/VEYA playback-intent
// sync. Separate binary; does NOT depend on tauri. Only play/pause/seek/
// position intent crosses the wire — never any URL / file / media bytes.

use vara_broker::{broker, server, transport};

#[tokio::main]
async fn main() {
    let path = transport::socket_path();

    // Idempotent bind: if another broker already owns the socket, exit 0.
    match server::try_bind(&path).await {
        server::BindOutcome::Bound(listener) => {
            server::run(listener, path, broker::Shared::new(), server::IDLE_TIMEOUT).await;
        }
        server::BindOutcome::AlreadyRunning => {
            // A live broker is already serving; nothing to do.
            std::process::exit(0);
        }
        server::BindOutcome::Failed(e) => {
            eprintln!("vayra-vara-broker: failed to bind {}: {e}", path.display());
            std::process::exit(1);
        }
    }
}
