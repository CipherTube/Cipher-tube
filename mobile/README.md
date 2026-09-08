# CypherTube Mobile (Android / Capacitor)

Scaffold for the APK distribution target. Full build pipeline: see [BUILD.md](../BUILD.md). Plan: [PLATFORM_SHIP_PLAN.md](../PLATFORM_SHIP_PLAN.md).

## Layout
- `capacitor.config.ts` - Capacitor 6 config (appId org.ciphertube.app, webDir `www` populated from `../ui/dist`)
- `android/` - minimal Android project skeleton (manifest, gradle, network security config)

## Status (v1.6.0-alpha.1)
- [x] Project scaffold + signing config structure
- [x] Network security config (cleartext disabled; cert pins to be added before release)
- [ ] Keystore-backed token store (Phase 2)
- [ ] SQLCipher encrypted local cache (Phase 2)
- [ ] First installable build (v1.6.0-beta.1)

Depends on Phase 0: UI bundle extraction from `src/server.ts` (see issue #466).
