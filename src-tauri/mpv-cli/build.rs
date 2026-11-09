use std::path::PathBuf;

fn main() {
    // Links against the app's own import library (src-tauri/libmpv/mpv.lib), so
    // the launcher drives the very libmpv-2.dll the player ships with.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let libmpv = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("libmpv");
        println!("cargo:rustc-link-search=native={}", libmpv.display());
        println!("cargo:rerun-if-changed={}", libmpv.join("mpv.lib").display());
    }
}
