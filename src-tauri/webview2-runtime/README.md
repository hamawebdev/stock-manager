# Bundled fixed-version WebView2 runtime (Windows 7 support)

`tauri.conf.json` sets:

```json
"bundle": { "windows": { "webviewInstallMode": { "type": "fixedRuntime", "path": "webview2-runtime/" } } }
```

This ships a **pinned** WebView2 runtime inside the installer instead of relying
on the "evergreen" runtime, because Microsoft dropped evergreen WebView2 support
for Windows 7/8/8.1 in **October 2023**. The last WebView2 build that runs on
Windows 7 SP1 is **v109** (Chromium 109).

## What goes here

Extract the **Fixed Version** WebView2 Runtime, **x64**, version **109.0.1518.x**
(the last Win7-compatible build) into this folder. After extraction the folder
should contain `msedgewebview2.exe`, `EBWebView/`, the DLLs, etc.

Download page: <https://developer.microsoft.com/microsoft-edge/webview2/>
→ "Fixed Version" → pick **x64** and version **109.0.1518.x**.

The payload is **not committed** (see `../.gitignore`); it is fetched at build
time. CI downloads and extracts it before `tauri build` — see
`.github/workflows/release.yml`.

## Local Windows build

If you build on Windows locally, download the same archive and extract it here
before running `npm run tauri build`. On Linux/macOS this folder is ignored
(those platforms don't use WebView2).
