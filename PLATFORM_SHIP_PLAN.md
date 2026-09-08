# CypherTube Multi-Platform Distribution Plan (APK · Web · Desktop)

**Project:** Sovereign Cypher-Tube v1.5.0 → v1.6.0 (target)
**Roadmap ref:** Extends ASSESSMENT.md — net-new platform work
**Status:** Draft
**Date:** 2026-09-08

---

## 1. Goal

Ship CypherTube to phones/devices and the web as installable, signed artifacts:

- **Android APK** — native installable client via Capacitor
- **Web** — PWA-served from the existing Express gateway
- **Desktop** — consolidate the existing Electron path (`desktop/build` already holds `entitlements.mac.plist`)

Core constraint (from ASSESSMENT.md guardrails): **Redis stays server-side.** The cryptographic pipeline, blinded session store, and ZK gateway validation do not move onto devices. Devices run a hardened client that talks to the Express/Redis pipeline over TLS. No monolithic state coupling outside the Express/Redis pipeline.

---

## 2. Current State

| Capability | Status |
|---|---|
| Express REST gateway (`/v1/channel/verify`, `/system/analytics`) | ✅ live |
| UI | ⚠️ server-rendered from `src/server.ts` (pre-rendered templates — Bolt optimization) — no standalone client bundle |
| Desktop build | ⚠️ partial — `entitlements.mac.plist` only, no full Electron config |
| Android/APK | ❌ none |
| PWA manifest / service worker | ❌ none |
| `/health` endpoint (LB/K8s) | ❌ none — already in risk register |

**Phase 0 prerequisite:** the UI must be extracted from `src/server.ts` into a static client bundle (SPA or MPA) that talks to the gateway via the REST API. Everything below depends on it.

---

## 3. Target Architecture

```
┌─────────────────────────────┐
│  Device clients             │
│  Android APK (Capacitor)    │
│  PWA (browser)              │
│  Desktop (Electron)         │
│  - static UI bundle         │
│  - API client w/ op queue   │
│  - encrypted local store    │
│  - Keystore-backed keys     │
└──────────────┬──────────────┘
               │ TLS 1.3 + cert pinning
┌──────────────▼──────────────┐
│  Express Gateway (server)   │
│  helmet · rate-limit · ZK   │
│  cipherTubeGateway middleware│
│  /v1/channel/verify         │
│  /system/analytics · /health│
└──────────────┬──────────────┘
┌──────────────▼──────────────┐
│  Redis (blinded sessions,   │
│  metrics counters, LRU)     │
└─────────────────────────────┘
```

---

## 4. Components to Build

### 4.1 Client UI bundle (`ui/` workspace)
- Extract HTML/CSS/JS from `src/server.ts` pre-rendered templates into `ui/` as a static bundle
- Keep the Palette design tokens; keep accessibility features already present (skip links, focus-visible, `prefers-reduced-motion`)
- Talks to gateway exclusively via `/v1/*` REST endpoints

### 4.2 API client module (`tube/apiClient.ts`)
- Typed TS client wrapping the gateway endpoints
- Token storage: never plaintext — Android Keystore (via Capacitor SecurePreferences) / WebCrypto-wrapped IndexedDB on PWA / Keychain (safeStorage) on Electron
- Offline operation queue: writes are queued locally and replayed on reconnect; reads fall back to encrypted local cache
- TLS certificate pinning in the native WebView/OkHttp layer

### 4.3 Encrypted local store
- **Android:** SQLCipher (AES-256) or EncryptedSharedPreferences; master key in Android Keystore, hardware-backed where available
- **PWA:** WebCrypto (AES-GCM) encrypting IndexedDB entries with a key derived at session start
- **Desktop:** Electron safeStorage (OS keychain-backed)
- Satisfies the "no unencrypted transient storage" guardrail on every platform

### 4.4 Gateway additions
- `/health` (liveness) and `/ready` (readiness incl. Redis ping) — already a risk-register item
- Static bundle serving (`express.static`) for PWA delivery
- PWA `manifest.webmanifest` + service worker with encrypted cache
- Mobile-friendly rate limits (recommend separate limiter buckets for mobile clients)

### 4.5 Android APK packaging
- **Capacitor 6** (MIT — no vendor lock-in) wrapping the static UI bundle
- Android SDK 34+, Gradle, Java 17
- Release signing: dedicated APK signing key stored as GitHub Actions secret; v2/v3 signature schemes
- `NETWORK_SECURITY_CONFIG` enforcing TLS pinning, cleartext traffic disabled
- Output: signed release APK + AAB for Play distribution if/when desired

### 4.6 Desktop consolidation
- Formalize Electron config around the existing `desktop/build/entitlements.mac.plist`
- Same static bundle + `safeStorage` — parity with the other targets

### 4.7 CI/CD
- GitHub Actions workflow:
  - `web`: build UI bundle, deploy static assets with the gateway
  - `android`: `./gradlew assembleRelease`, sign with repo secret, upload APK artifact
  - `desktop`: electron-builder for macOS (existing entitlements) / Linux / Windows
- Conventional commits: `feat(platform): ...`

---

## 5. Phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — UI extraction** | Pull UI out of `src/server.ts` into static bundle; add `/health`, `/ready`; static serving | Gateway serves the bundle; sovereign-os tests green |
| **1 — Web/PWA** | Manifest, service worker, encrypted IndexedDB cache, API client | Lighthouse installable; offline queue works in browser |
| **2 — Android APK** | Capacitor wrap, Keystore token store, SQLCipher cache, cert pinning, signing, CI artifact | Signed APK installs, passes device smoke tests (API 30–34) |
| **3 — Desktop** | Electron config, safeStorage, signed builds | macOS build signs with existing entitlements |
| **4 — Hardening** | Pen-test pass on the client, rate-limit tuning, PWA/desktop release channels | Security review sign-off |

Dependencies: Phase 0 is a hard blocker for everything. Phases 1 and 2 can overlap once Phase 0 lands. Priority 1 (Session Payload Serialization) should land first — the API client and offline queue both benefit from versioned session payloads.

---

## 6. Dependency & Licensing Check (guardrail compliance)

| Component | License | Notes |
|---|---|---|
| Capacitor | MIT | open, no data-rights encumbrance |
| SQLCipher | BSD-style | open |
| Android SDK / Gradle | Apache 2.0 | standard toolchain |
| Electron | MIT | open |
| WebCrypto API | platform API | no dependency added |

No vendor lock-in dependencies introduced. Device telemetry, if added later, should use the existing OpenTelemetry pipeline (already present in `cyphertube-external-plugin`) rather than a proprietary mobile-analytics SDK.

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| UI extraction breaks Bolt pre-render optimizations | Medium | Keep pre-rendered fragments as build-time artifacts, not request-time |
| Offline queue holds encrypted-but-queued writes on device | Medium | Queue only non-sensitive ops; cap queue size; wipe on logout |
| Cert pinning breaks on gateway cert rotation | Medium | Ship backup pin + remote-pin-update endpoint (ties into Priority 3 key rotation) |
| APK signing key leakage | High | GitHub Actions secrets only, never in repo; enable key rotation procedure from day one |
| Server-rendered page parity (SSR SEO loss) | Low | Not a public-facing SEO product; acceptable |

---

## 8. Suggested First Tasks

1. **T1:** Add `/health` + `/ready` endpoints to `gatewayServer.ts` (also closes the risk-register item) — small, immediate
2. **T2:** Extract UI bundle from `src/server.ts` → `ui/` workspace with static serving on the gateway
3. **T3:** Scaffold Capacitor project in `mobile/` consuming the Phase 0 bundle
4. **T4:** Android Keystore-backed token store spike (proof of concept on API 34 emulator)

---

*Draft generated 2026-09-08 · CypherTube Autonomous Architecture Node*
