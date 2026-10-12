# VAYRA compatibility patch

Source: crates.io `librqbit-upnp` 1.0.0, upstream commit
`8552916399e290613b27eb4c7914638516a89de1`, `crates/upnp` in
https://github.com/ikatson/rqbit. Apache-2.0; upstream LICENSE retained.

The normalized manifest dependency on quick-xml changes from 0.37.1 to
0.42.0 to address RUSTSEC-2026-0194 and RUSTSEC-2026-0195. The original
manifest is retained as `Cargo.toml.orig`.

`src/lib.rs` also accepts IGDv2 routers. Upstream only kept services whose
type is exactly `WANIPConnection:1`; MiniUPnPd-based IGDv2 routers (such as
the Bbox) answer the v1 SSDP search but declare only `WANIPConnection:2`, so
no port was ever forwarded and nothing was logged. The patch keeps v1 and v2
services, sends `AddPortMapping` with the service type the router declared,
logs at info level once a forward starts working, and warns once per router
that declares no supported service. The `devices-igd2.xml` fixture is a
trimmed copy of a real Bbox description; the tokio dev-dependency gains the
`io-util` and `net` features for the `AddPortMapping` request test.

Test from the repository root with
`cargo test --manifest-path src-tauri/vendor/librqbit-upnp/Cargo.toml --target-dir src-tauri/target --lib`. Remove this patch when upstream ships a
compatible corrected dependency requirement and IGDv2 support.
