# CypherTube Build & Publish Pipeline

Covers the APK (Android), Web (PWA), and Desktop (Electron) targets per [PLATFORM_SHIP_PLAN.md](./PLATFORM_SHIP_PLAN.md).

## Prerequisites
- Node 20+, pnpm
- Android SDK 34, Gradle 8, Java 17 (Android target)
- Electron (desktop target)

## Web / PWA
1. Build the UI bundle: `pnpm --filter ui build` -> outputs `ui/dist`
2. Gateway serves the bundle: `express.static('ui/dist')` + `ui/manifest.webmanifest` + `ui/sw.js`
3. Lighthouse installability check before release

## Android APK
1. Full project: `npx cap add android` (Capacitor 6, config in `mobile/capacitor.config.ts`)
2. Sync the bundle: `pnpm --filter ui build && npx cap sync android`
3. Debug build: `cd mobile/android && ./gradlew assembleDebug`
4. Release build: `./gradlew assembleRelease`
   - Signing reads from env via `mobile/signing.gradle`: `CIPHERTUBE_KEYSTORE_FILE`, `CIPHERTUBE_KEYSTORE_PASSWORD`, `CIPHERTUBE_KEY_ALIAS`, `CIPHERTUBE_KEY_PASSWORD`. CI decodes the `ANDROID_KEYSTORE_BASE64` secret to the file (CI secrets only - never commit)
5. Output: `android/app/build/outputs/apk/release/app-release.apk` (v2+v3 signed)

## Desktop (Electron) — Phase 3 implementation record (complete pending signing certs)

- **Main process** (`desktop/main.js`): contextIsolation on, `nodeIntegration` off, `sandbox` on; dev-only self-signed acceptance gated behind `CIPHERTUBE_DEV=1`/`CIPHERTUBE_ALLOW_SELF_SIGNED=1`
- **Certificate pinning**: before any window loads the gateway, the main process TLS-connects and compares the leaf cert's SHA-256 against `CIPHERTUBE_CERT_PIN` — **fail-closed** (mismatch loads an error page, never the gateway). Opt-in; extract the pin with the one-liner in docs/SIGNING_GUIDE.md §4
- **Token store**: `safeStorage` (OS keychain) under `userData/tokens/`; renderer sees only `window.cypherTokenStore.{put,get,delete}` via the preload bridge — desktop equivalent of docs/KEYSTORE_TOKEN_STORE.md
- **Packaging**: `electron-builder` (mac/win/linux) reusing `desktop/build/entitlements.mac.plist`; hardened runtime on; config in `desktop/package.json`
- **Builds**: `ci-workflows/ci-build.yml` (verification, unsigned) and `ci-workflows/release.yml` (tag-triggered, signed+notarized when secrets present). Secrets & activation steps: docs/SIGNING_GUIDE.md and ci-workflows/README.md

## Versioning & tags
- semver x.y.z + integer `versionCode` (1.6.0 -> 10600)
- Tags: `v1.6.0-alpha.1` (scaffold), `v1.6.0-beta.1` (first installable), `v1.6.0` (production)
- GitHub Release per tag with release notes from conventional commits

## Release gates (PLATFORM_SHIP_PLAN.md 9.5)
- `/health` + `/ready` live on the production gateway
- TLS 1.3 + cert pins shipped in `network_security_config.xml`
- Update-manifest endpoint live before public APK distribution
