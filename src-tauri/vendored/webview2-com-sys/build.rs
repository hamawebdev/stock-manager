// Vendored replacement for the upstream build script. Upstream regenerates
// the bindings from winmd metadata on every build and (with the default
// `nuget` feature) downloads the WebView2 SDK; the bindings here are the
// pre-generated ones from the 0.19.0 package, so this only has to point the
// linker at the vendored WebView2Loader.dll import library.
fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
        "x86_64" => "x64",
        other => panic!(
            "only x64 WebView2 libs are vendored (target arch `{other}`); \
             copy the SDK libs for that arch next to x64/ first"
        ),
    };
    println!("cargo:rustc-link-search=native={manifest_dir}/{arch}");
}
