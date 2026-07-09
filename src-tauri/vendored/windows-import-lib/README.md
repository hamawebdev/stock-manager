# windows.lib for the Win7 Tier-3 target

`windows.lib` is the umbrella import library from the
[`windows_x86_64_msvc` 0.42.2](https://crates.io/crates/windows_x86_64_msvc)
crate (`lib/windows.lib`, MIT-licensed — see `license-mit`), vendored verbatim.

## Why it's needed

Old `windows`-family crates in the Tauri v1 dependency tree — `windows 0.37`
(via `rfd`), `windows 0.39` (via `tao`/`wry`/`webview2-com`) and
`windows-sys 0.42` — emit `#[link(name = "windows")]` and rely on their
companion `windows_x86_64_msvc` crate to ship this file and emit the
`rustc-link-search` for it. Both that companion dependency (in the parents'
`Cargo.toml` target tables) and its `build.rs` are gated on the *literal*
triples `x86_64-pc-windows-msvc` / `x86_64-uwp-windows-msvc`, so on the Tier-3
`x86_64-win7-windows-msvc` target the library is never provided and the final
link dies with `LNK1181: cannot open input file 'windows.lib'`.
`src-tauri/build.rs` adds this directory to the link search path when (and
only when) building for that target.

## Why the 0.42.2 copy serves the 0.37/0.39 consumers

The 0.37.0 and 0.39.0 crates ship byte-identical `windows.lib` files, and the
0.42.2 file is a strict superset of their symbol tables except for 10
archive-internal bookkeeping symbols (`__IMPORT_DESCRIPTOR_*`,
`*_NULL_THUNK_DATA`) that no Rust binding references. Newer `windows-sys`
versions in the tree (0.48/0.52/0.59+) are unaffected either way: they use
`windows-targets`' `cfg()`-based selection, which matches the Win7 triple.
