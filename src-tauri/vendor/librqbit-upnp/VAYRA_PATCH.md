# VAYRA compatibility patch

Source: crates.io `librqbit-upnp` 9.0.1 (used by `librqbit` 9.0.1), upstream
commit `a499d2f243d124e144aef137afe7cb304a6e3f36`, `crates/upnp` in
https://github.com/ikatson/rqbit. Apache-2.0; the published crate ships no
LICENSE file, so the upstream one from the 1.0.0 vendoring is retained.

The normalized manifest dependency on quick-xml changes from 0.41 to
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
The patch was first written on 1.0.0 and carried over to 9.0.1 unchanged.

Test from the repository root with
`cargo test --manifest-path src-tauri/vendor/librqbit-upnp/Cargo.toml --target-dir src-tauri/target --lib`. Remove this patch when upstream ships a
compatible corrected dependency requirement and IGDv2 support.
