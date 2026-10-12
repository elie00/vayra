# VAYRA compatibility patch

Source: crates.io `librqbit-upnp` 1.0.0, upstream commit
`8552916399e290613b27eb4c7914638516a89de1`, `crates/upnp` in
https://github.com/ikatson/rqbit. Apache-2.0; upstream LICENSE retained.

Only the normalized manifest dependency on quick-xml changes from 0.37.1 to
0.42.0 to address RUSTSEC-2026-0194 and RUSTSEC-2026-0195. Library source,
examples and XML fixtures are unchanged. The original manifest is retained
as `Cargo.toml.orig`. Test from the repository root with
`cargo test --manifest-path src-tauri/vendor/librqbit-upnp/Cargo.toml --target-dir src-tauri/target --lib`. Remove this patch when upstream ships a compatible corrected
dependency requirement.
