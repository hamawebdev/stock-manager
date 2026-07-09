fn main() {
    // On the Tier-3 Win7 target, the old windows crates in the tree (windows
    // 0.37/0.39 via rfd/tao/wry, windows-sys 0.42) link the umbrella
    // `windows.lib` but never provide it: their arch-specific companion crates
    // are gated on the literal `x86_64-pc-windows-msvc` triple, in both the
    // Cargo target tables and the companion's build.rs. Supply the vendored
    // copy instead (see vendored/windows-import-lib/README.md).
    if std::env::var("TARGET").as_deref() == Ok("x86_64-win7-windows-msvc") {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        println!("cargo:rustc-link-search=native={manifest_dir}/vendored/windows-import-lib");
    }

    tauri_build::build()
}
