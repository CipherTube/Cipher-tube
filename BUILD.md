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
   - Signing reads from env: `CT_RELEASE_KEYSTORE_B64`, `CT_KEYSTORE_PASSWORD`, `CT_KEY_ALIAS`, `CT_KEY_PASSWORD` (CI secrets only - never commit)
5. Output: `android/app/build/outputs/apk/release/app-release.apk` (v2+v3 signed)

## Desktop (Electron)
`electron-builder` with the existing `desktop/build/entitlements.mac.plist`; `safeStorage` for token/key storage.

## Versioning & tags
- semver x.y.z + integer `versionCode` (1.6.0 -> 10600)
- Tags: `v1.6.0-alpha.1` (scaffold), `v1.6.0-beta.1` (first installable), `v1.6.0` (production)
- GitHub Release per tag with release notes from conventional commits

## Release gates (PLATFORM_SHIP_PLAN.md 9.5)
- `/health` + `/ready` live on the production gateway
- TLS 1.3 + cert pins shipped in `network_security_config.xml`
- Update-manifest endpoint live before public APK distribution
