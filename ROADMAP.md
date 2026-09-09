# CypherTube Roadmap

Consolidated project roadmap. Last updated: 2026-09-09. Current tag: [v1.6.0-alpha.1](https://github.com/CipherTube/Cipher-tube/releases/tag/v1.6.0-alpha.1).

## Build Priorities (ASSESSMENT.md §3)

| # | Priority | Tracking | Status |
|---|----------|----------|--------|
| P1 | Session token serialization (versioned SessionPayload, legacy v0 migration) | [TASK_PLAN_session_serialization.md](./TASK_PLAN_session_serialization.md) | Specced — implementation is the critical path |
| P2 | Redis memory footprint & cache eviction policies | [#463](https://github.com/CipherTube/Cipher-tube/issues/463) | Open — may proceed in parallel with P1 |
| P3 | Zero-downtime key rotation & handshake validation | [#464](https://github.com/CipherTube/Cipher-tube/issues/464) | Open — depends on P1 |
| P4 | High-throughput metrics (Prometheus `/metrics`) | [#465](https://github.com/CipherTube/Cipher-tube/issues/465) | Open — depends on P1 |

## Platform Distribution (PLATFORM_SHIP_PLAN.md)

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | UI extraction from `src/server.ts`; `/health` + `/ready` | ✅ health/readiness endpoints live (2026-09-09) · ⬜ UI extraction pending |
| 1 | Web/PWA: manifest, service worker, encrypted IndexedDB cache | ⬜ pending — assets scaffolded (`ui/manifest.webmanifest`, `ui/sw.js`) |
| 2 | Android APK: Capacitor, Keystore token store, SQLCipher, signed build | 🟡 scaffolded (`mobile/`) — needs Phase 0 + release keystore CI secret |
| 3 | Desktop: Electron + safeStorage | ⬜ pending |
| 4 | Hardening + staged rollout (10% → 50% → 100%) | ⬜ pending |

Rollout checklist: [#466](https://github.com/CipherTube/Cipher-tube/issues/466) · Build pipeline: [BUILD.md](./BUILD.md)

## Critical Path

1. **P1 session serialization** — one sprint, fully specced
2. **Phase 0 UI extraction** into static `ui/` bundle
3. First installable build → tag `v1.6.0-beta.1`
4. Production release gates (PLATFORM_SHIP_PLAN.md §9.5) → `v1.6.0`

## Release Tags

- `v1.6.0-alpha.1` — multi-platform distribution scaffold (2026-09-08)
- `v1.6.0-beta.1` — first installable build (planned)
- `v1.6.0` — production (planned)
