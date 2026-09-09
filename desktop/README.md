# CypherTube Desktop (Phase 3)

Electron wrapper around the CypherTube gateway — the desktop track of the multi-platform plan (PLATFORM_SHIP_PLAN.md).

## Status (Phase 3 — config live, packaging pending)

- [x] Electron main process with hardened defaults (`contextIsolation`, `sandbox`, no `nodeIntegration`)
- [x] Preload bridge exposing only the token store API (`window.cypherTokenStore`)
- [x] safeStorage-backed token store (OS keychain) — desktop equivalent of `docs/KEYSTORE_TOKEN_STORE.md`
- [x] electron-builder config reusing the existing `build/entitlements.mac.plist`
- [ ] Notarization (macOS) + code signing certs (Windows/Linux need signing keys)
- [ ] First packaged builds per platform
- [x] Cert pinning for the production gateway URL (`CIPHERTUBE_CERT_PIN` — SHA-256, fail-closed)

## Run (dev against a local gateway)

    CIPHERTUBE_DEV=1 CIPHERTUBE_GATEWAY_URL=https://localhost:3443 npm start

## Package

    npm install
    npm run dist

Dev mode accepts self-signed gateway certificates only when `CIPHERTUBE_DEV=1` or `CIPHERTUBE_ALLOW_SELF_SIGNED=1` — never enable these for production builds.
