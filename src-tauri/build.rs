fn main() {
    let win7 = std::env::var("TARGET").as_deref() == Ok("x86_64-win7-windows-msvc");

    if win7 {
        // Old windows crates in the tree (windows 0.37/0.39 via rfd/tao/wry,
        // windows-sys 0.42) link the umbrella `windows.lib` but never provide
        // it: their arch-specific companion crates are gated on the literal
        // `x86_64-pc-windows-msvc` triple, in both the Cargo target tables and
        // the companion's build.rs. Supply the vendored copy instead (see
        // vendored/windows-import-lib/README.md).
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        println!("cargo:rustc-link-search=native={manifest_dir}/vendored/windows-import-lib");

        // The tauri v1 CLI exports STATIC_VCRUNTIME=true for `tauri build`
        // (tauri-cli src/interface/rust/desktop.rs), which makes
        // tauri_build::build() emit Microsoft's "hybrid CRT" linker args:
        // static vcruntime but /DEFAULTLIB:ucrt.lib + /NODEFAULTLIB:libucrt.lib
        // — i.e. it FORCES the dynamic UCRT and bans the static one, overriding
        // the `-C target-feature=+crt-static` set in .cargo/config.toml. Stock
        // Win7 SP1 has no UCRT (api-ms-win-crt-*.dll arrived via KB2999226 /
        // VC++ 2015+ redist), so the exe failed to load there. The CLI honors a
        // pre-set "false" as an opt-out; setting it here (before
        // tauri_build::build() reads it) lets crt-static link the whole CRT —
        // libcmt + libvcruntime + libucrt — into the binary.
        std::env::set_var("STATIC_VCRUNTIME", "false");
    }

    tauri_build::build()
}
