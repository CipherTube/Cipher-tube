# CipherTube Governance & Compliance Framework

**Status:** v1 — initial mechanisms landed 2026-09-09
**Scope:** Runtime governance for the Express/Redis pipeline — policy enforcement, auditability, and compliance readiness, built entirely from CipherTube's own capabilities.

This framework turns CipherTube's written guardrails into machine-enforced controls. It is original CipherTube design: no third-party governance code, proprietary SDKs, or vendor dependencies are involved, and none may be introduced without a data-rights compliance review (README guardrails).

## 1. Principles → Mechanisms

| Requirement | Mechanism | Module |
|---|---|---|
| Data minimization | Blinded session keys; payloads hold only operational fields (userId, scopes, lineage) | `src/session/payload.ts` |
| Need-to-know access | ZK gateway validation (`cipherTubeGateway`) | `src/gateway/sessionMiddleware` |
| Enforceable controls | Policy-as-code rules evaluated at runtime (allow / challenge / block) | `src/governance/policyEngine.ts` |
| Accountability | Hash-chained, append-only audit trail; actors recorded as blinded hashes | `src/governance/auditTrail.ts` |
| Erasure & revocation | Token burn with TTL expiry (5s rotation grace); purge = delete blinded key | `src/session_rotator.ts` |
| Interoperability | Versioned payloads with forward version guard and lazy migration | `src/session/payload.ts` |

## 2. Policy Engine (`src/governance/policyEngine.ts`)

- Rules are **data**: `{ id, description, match(ctx), action, reason }`. First matching rule wins; unmatched contexts default to `allow`.
- Context carries `route`, `scopes`, `sessionAgeSeconds`, `rotationCount` — sourced from the v1 session payload (Priority 1).
- Actions: `allow` (proceed), `challenge` (force re-validation / handshake — hooks into Priority 3 rotation), `block` (reject with reason).
- Rule factories: `requireScope()`, `maxSessionAge()`, `requireRotation()`. `BASELINE_RULES` ships **opt-in** — do not enforce scope rules until scope issuance is live on all clients.
- Integration (LIVE 2026-09-09): `governanceGuard` is mounted after `cipherTubeGateway` on `/system/analytics` and `/v1/channel/verify`. Default-allow — set `CT_GOVERNANCE_RULES=baseline` to enforce. Every non-allow decision emits an audit event; `/system/analytics` reports `governanceChainLength` / `governanceChainIntact`.

## 3. Audit Trail (`src/governance/auditTrail.ts`)

- Append-only records; each entry commits `SHA-256(prevHash | timestamp | sequence | canonicalEvent)`.
- A genesis hash anchors the chain; `verify()` recomputes it end-to-end and `firstTamperedSequence()` pinpoints the first altered record.
- Actors are blinded hashes — raw identifiers never enter the trail (minimization guardrail).
- Persistence: in-memory chain now; the sink to signed `.ctube` state files or a Redis stream lands with Priority 4 metrics plumbing.

## 4. Compliance Mapping (indicative)

| Control area | CipherTube mechanism |
|---|---|
| Records of processing / auditability (e.g. GDPR Art. 30) | Hash-chained audit trail (§3) |
| Security of processing (e.g. GDPR Art. 32) | Blinded keys, ZK validation, TLS pinning (PLATFORM_SHIP_PLAN §4.2) |
| Storage limitation & minimization (e.g. GDPR Art. 5) | TTL'd sessions, minimal payloads, blinded actors |
| Erasure / revocation requests (e.g. GDPR Art. 17) | Blinded-key deletion; rotation burns old-token access |
| Continuous monitoring (e.g. SOC 2 CC7) | `/system/analytics` + `/health` + `/ready`; Priority 4 `/metrics` |

*This mapping is indicative engineering guidance — not legal advice or a certification claim.*

## 5. Rules of Engagement

1. No new third-party governance/privacy SDKs without data-rights compliance review.
2. Policy rules live in version control and change via PR — governance changes are auditable like code.
3. Every block/challenge decision must be auditable: policy evaluation and audit append are inseparable.
4. Audit events carry no raw identifiers, ever.
5. Compliance mechanisms must not degrade the pipeline (Bolt guardrail): sub-ms policy evaluation target, async audit append.

## 6. Roadmap Hooks

- **Priority 3 rotation** → the `challenge` action triggers handshake validation.
- **Priority 4 metrics** → policy decision counters (`policy.allow` / `policy.challenge` / `policy.block`) plus the audit persistence sink.
- **Platform rollout (#466)** → mobile/web clients reuse the same rule schema for client-side guardrails.

## 7. Asset Registry (`src/governance/assetRegistry.ts`)

Machine-readable inventory of every gateway component: id, category, criticality tier, data classes processed, and source module. This is the record-keeping backbone for impact reviews and erasure tracing — each entry declares what data a component touches, so a request against one data class resolves to concrete code paths. `inventorySummary()` exposes counts by tier plus the high-criticality ("crown jewels") set for compliance reporting. Changes go through PR like code.

## 8. Standards Mapping (indicative)

References to public frameworks are orientation points only; all mechanisms below are original CipherTube implementations.

| Framework area | Function | CipherTube mechanism |
|---|---|---|
| Risk identification & component inventory (e.g. NIST AI RMF Map/Measure/Manage) | Know what exists, measure continuously | Asset Registry §7; telemetry on `/system/analytics`; audit chain metrics |
| Logging & record-keeping for high-risk operations (e.g. EU AI Act technical logging) | Tamper-evident records of system behavior | Hash-chained audit trail §3 |
| Human oversight & override capability | Enforceable, explainable intervention points | Policy engine §2 — every block/challenge carries rule id + reason |
| Data protection principles (GDPR) | Minimization, storage limitation, erasure | Blinded keys, TTL'd sessions, blinded-key deletion (§1) |
| Access control & monitoring (SOC 2 CC6/CC7) | Least privilege, continuous monitoring | Scope rules + `cipherTubeGateway`; probes and analytics endpoints |

*Indicative engineering guidance — not legal advice or a certification claim.*
