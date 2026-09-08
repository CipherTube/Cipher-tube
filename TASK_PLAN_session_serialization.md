# Task Plan: Session Token Serialization (Priority 1)

**Project:** Sovereign Cypher-Tube v1.5.0
**Roadmap ref:** ASSESSMENT.md §3, Priority 1
**Status:** Draft
**Date:** 2026-09-08
**Depends on:** Nothing (foundation for Priorities 3 and 4)

---

## Goal

Migrate session storage in Redis from a raw `userId` string to a versioned, typed `SessionPayload`, enabling multi-scope tokens, rotation lineage tracking, audit capability, and forward-compatible schema evolution.

## Target Design

```typescript
// src/session/payload.ts
export interface SessionPayload {
  v: number;                    // schema version (starts at 1)
  userId: string;
  scopes: string[];
  issuedAt: number;             // epoch ms
  rotatedFrom?: string;         // blinded hash of previous token (rotation lineage)
  rotationCount: number;
}
```

Redis storage remains blinded-key based (`session:<sha256(token)>`), but the value becomes the JSON-serialized payload instead of a raw user ID.

---

## Tasks

### Task 1 — Create payload module
- **File:** `src/session/payload.ts`
- Define `SessionPayload` interface with `SESSION_PAYLOAD_VERSION = 1`
- Implement `serializePayload(payload): string` — JSON stringify with field ordering for deterministic output
- Implement `deserializePayload(raw: string): SessionPayload` — parse with validation:
  - Reject if `v` is missing or unsupported (forward version guard)
  - Reject if `userId` missing, `issuedAt`/`rotationCount` not numbers, `scopes` not an array
  - Throw a typed `LegacySessionError` when the value is a non-JSON string (v0 legacy session — plain userId)
- Implement `migrateLegacySession(raw: string): SessionPayload` — wraps a raw v0 userId into a v1 payload with `scopes: []`, `rotationCount: 0`, fresh `issuedAt`
- **Done when:** module compiles, pure functions, no Redis dependency

### Task 2 — Update createSession
- **File:** `src/session_rotator.ts`
- Change signature to accept scopes: `createSession(userId, redis, ttl, scopes?: string[])`
- Build payload via `serializePayload`, store with `redis.set(key, serialized, { EX: ttl })`
- Keep returning the raw token (no API break for callers)
- **Done when:** new sessions written to Redis contain valid v1 JSON

### Task 3 — Add payload-aware session read helper
- **File:** `src/session_rotator.ts`
- Add `readSession(token, redis): Promise<SessionPayload>`:
  1. GET blinded key
  2. Try `deserializePayload`; on `LegacySessionError`, run `migrateLegacySession` and write the migrated payload back to Redis (lazy migration on access, per ASSESSMENT.md acceptance criteria)
  3. Return payload (or null if key absent/expired)
- **Done when:** legacy sessions transparently upgrade on first access

### Task 4 — Update rotateSession
- **File:** `src/session_rotator.ts`
- Read current payload via `readSession` (not raw `redis.get`)
- On rotation: increment `rotationCount`, set `rotatedFrom` to the old blinded hash, carry over scopes, fresh `issuedAt`, new `v1` payload for the new token
- Preserve existing 5-second grace-period expiry on the old key (unchanged behavior)
- **Done when:** rotation produces a new token whose payload links lineage to the old one

### Task 5 — Unit tests
- **File:** `tests/unit/session-serialization.test.ts`
- Cover:
  - Round-trip serialize/deserialize of a v1 payload
  - Deserialization rejects unsupported future versions
  - `createSession` writes parseable v1 JSON (mock redis client)
  - `readSession` migrates a legacy v0 value and writes back the upgraded payload
  - `rotateSession` increments rotationCount, sets rotatedFrom, preserves scopes
  - `rotateSession` throws on expired/absent token (existing behavior retained)
- **Run with:** `npx vitest tests/unit/session-serialization.test.ts`
- **Done when:** all tests green, existing sovereign-os tests still pass (`npx vitest tests/unit/sovereign-os.test.ts`)

### Task 6 — Integration & docs
- Update `docs/API.md` session section to document the payload schema and v0→v1 migration behavior
- Update README "Current Capabilities" to mark structured session payloads ✅
- Open a PR against `main` referencing this plan; conventional commit: `feat(session): versioned SessionPayload serialization with legacy migration`

---

## Out of Scope (deferred to later priorities)

- Transactional rotation / handshake validation → Priority 3 (this plan keeps the existing 5s grace period)
- Rotation/failure counters in Redis → Priority 4
- Encryption of LRU cache contents → guardrail work, separate task

## Risks & Notes

- **Redis value size:** payload JSON (~150-200 bytes) vs raw userId — negligible, but confirm `maxmemory` headroom (ties into Priority 2)
- **Mixed-version fleet:** during rolling deploy, old code reading new v1 JSON will fail to parse the value as a userId. Mitigation: deploy read-compat first (Task 3 handles both formats) or accept a brief rotation of sessions at deploy time. Flag for review before merging.
- **Backward compat contract:** per ASSESSMENT.md, absent `v` field = legacy v0, migrate on next access

## Suggested Order

Task 1 → 5 (payload tests in parallel) → 2 → 3 → 4 → 6
Estimated: 1 sprint including review.
