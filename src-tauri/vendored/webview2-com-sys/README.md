# webview2-com-sys (vendored, dynamic loader for Win7)

Vendored from [crates.io `webview2-com-sys` 0.19.0](https://crates.io/crates/webview2-com-sys)
(MIT, https://github.com/wravery/webview2-rs), wired in via `[patch.crates-io]`
in `src-tauri/Cargo.toml`. WebView2 SDK version of the vendored libs:
**1.0.1293.44** (the version pinned by the upstream 0.19.0 build script).

## The one functional change

Upstream bindings link the **static** loader on MSVC:

```rust
#[cfg_attr(target_env = "msvc", link(name = "WebView2LoaderStatic", kind = "static"))]
```

`WebView2LoaderStatic.lib` contains Microsoft TraceLogging telemetry that
imports `EventSetInformation` from `advapi32.dll` — an API that does not exist
on stock Windows 7 SP1 (it arrived in Windows 8; Win7 only gets it via the
optional telemetry update KB3080149). Statically linking it put that import
into `Stock Manager.exe`'s import table, so on Win7 the process failed at load
time with *"The procedure entry point EventSetInformation could not be located
in the dynamic link library advapi32.dll"*.

The vendored copy links the **dynamic** loader instead
(`link(name = "WebView2Loader.dll")` → `x64/WebView2Loader.dll.lib`), in the
four extern blocks of `src/Microsoft/Web/WebView2/Win32/mod.rs`. The dynamic
`WebView2Loader.dll` imports **only kernel32.dll** (verified: 85 imports, none
newer than Win7), so it is Win7-clean.

Consequence: `WebView2Loader.dll` must sit next to the exe at runtime. The
DLL lives at `src-tauri/WebView2Loader.dll` (copied verbatim from this same
0.19.0 package, `x64/WebView2Loader.dll`) and is bundled through
`tauri.bundle.resources` in `tauri.conf.json`, which installs it into the app
directory — the first place Windows looks when resolving the import.

## Stripped relative to the upstream package

- `build.rs` bindgen/NuGet machinery (winmd files, `nuget.exe`, build-deps):
  the pre-generated bindings in `src/` are used as-is; the replacement
  `build.rs` only emits the link-search path.
- `WebView2LoaderStatic.lib` and the non-x64 lib directories (this app only
  builds Windows x64).

Everything under `src/` is byte-identical to the 0.19.0 package except the
four `link` attributes described above.
