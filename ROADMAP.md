# CypherTube Roadmap

Consolidated project roadmap. Last updated: 2026-09-09. Current tag: [v1.6.0-alpha.1](https://github.com/CipherTube/Cipher-tube/releases/tag/v1.6.0-alpha.1).

## Build Priorities (ASSESSMENT.md §3)

| # | Priority | Tracking | Status |
|---|----------|----------|--------|
| P1 | Session token serialization (versioned SessionPayload, legacy v0 migration) | [TASK_PLAN_session_serialization.md](./TASK_PLAN_session_serialization.md) | ✅ implemented on `main` (2026-09-09) — pending team review |
| P2 | Redis memory footprint & cache eviction policies | [#463](https://github.com/CipherTube/Cipher-tube/issues/463) | Open — may proceed in parallel with P1 |
| P3 | Zero-downtime key rotation & handshake validation | [#464](https://github.com/CipherTube/Cipher-tube/issues/464) | Open — depends on P1 |
| P4 | High-throughput metrics (Prometheus `/metrics`) | [#465](https://github.com/CipherTube/Cipher-tube/issues/465) | Open — depends on P1 |

## Platform Distribution (PLATFORM_SHIP_PLAN.md)

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | UI extraction from `src/server.ts`; `/health` + `/ready` | ✅ complete (2026-09-09) — styles/scripts externalized to `ui/public/`, server.ts 69KB→38KB, dynamic SSR blocks (aura/cosmology/seasonal) retained |
| 1 | Web/PWA: manifest, service worker, encrypted IndexedDB cache | ✅ complete (2026-09-09) — manifest + SW + icons + encrypted offline cache with operation queue |
| 2 | Android APK: Capacitor, Keystore token store, SQLCipher, signed build | 🟡 scaffolded (`mobile/`) — needs Phase 0 + release keystore CI secret |
| 3 | Desktop: Electron + safeStorage | 🟡 complete pending signing certs — hardened main, preload bridge, safeStorage store, cert pinning (fail-closed), CI builds configured |
| 4 | Hardening + staged rollout (10% → 50% → 100%) | ⬜ pending |

Rollout checklist: [#466](https://github.com/CipherTube/Cipher-tube/issues/466) · Build pipeline: [BUILD.md](./BUILD.md)

## Critical Path

1. **P1 session serialization** — one sprint, fully specced
2. **Phase 0 UI extraction** into static `ui/` bundle
3. First installable build → tag `v1.6.0-beta.1`
4. Production release gates (PLATFORM_SHIP_PLAN.md §9.5) → `v1.6.0`

## CI Build Pipeline (2026-09-09)

- ✅ `ci-workflows/ci-build.yml` — build verification: desktop (linux/mac/win) + android debug APK
- ✅ `ci-workflows/release.yml` — tag-triggered signed builds + GitHub Release publish (secrets documented, none committed)
- ⬜ One-time activation: copy both files into `.github/workflows/` via the GitHub UI (connector token lacks the `workflow` scope required for API writes there)
- ⬜ Add signing secrets (see ci-workflows/README.md)

## Release Tags

- `v1.6.0-alpha.1` — multi-platform distribution scaffold (2026-09-08)
- `v1.6.0-beta.1` — first installable build (planned)
- `v1.6.0` — production (planned)

## Governance & Compliance (2026-09-09)

- ✅ Policy-as-code engine — `src/governance/policyEngine.ts` (allow / challenge / block, first-match-wins)
- ✅ Hash-chained audit trail — `src/governance/auditTrail.ts` (tamper-evident, blinded actors)
- Framework: [docs/GOVERNANCE_COMPLIANCE.md](./docs/GOVERNANCE_COMPLIANCE.md) — all-original CipherTube design, no third-party governance dependencies
- ✅ Gateway wiring — `governanceGuard` live on `/system/analytics` + `/v1/channel/verify` (default-allow; set `CT_GOVERNANCE_RULES=baseline` to enforce)

- ✅ Asset registry — `src/governance/assetRegistry.ts` (machine-readable inventory, criticality tiers, crown-jewels summary)
