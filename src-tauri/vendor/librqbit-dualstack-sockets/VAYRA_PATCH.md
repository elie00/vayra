# VAYRA compatibility patch

Source: crates.io `librqbit-dualstack-sockets` 0.7.0 (used by `librqbit` 9.0.1),
upstream commit `e2f221ca745c25c7790abb593ed260ce5a499fa1` of
https://github.com/ikatson/librqbit-dualstack-sockets. Apache-2.0; LICENSE retained;
the crate's own `.github` CI folder is left out.

`TcpListener::accept` skips connections that fail with `InvalidInput`. macOS hands
back a connection its peer reset before `accept()` with no address, which tokio
reports as `InvalidInput`. librqbit's listener then stops accepting for 10 seconds
after any accept error, so on a busy torrent port nearly every incoming peer was
lost ("error accepting TCP: invalid input parameter" every 10 s in vayra.log).

`test_accept_skips_a_connection_reset_before_accept` in `src/tests.rs` reproduces
it. Test from the repository root with
`cargo test --manifest-path src-tauri/vendor/librqbit-dualstack-sockets/Cargo.toml --target-dir src-tauri/target --lib -- --skip test_v4_received --skip test_v6_received --skip bind_multiple_same_port`
(those three multicast tests time out on this Mac with or without the patch).
Remove this patch when upstream skips reset connections in `accept`.
