# Gateway compliance and control mapping

What `packages/gateway` actually enforces, what it does not, and which control each piece serves. Written to be defensible in a review: every "implemented" line has a test that fails if the behaviour is removed.

## Controls implemented

| Control | Where | Test that proves it |
| --- | --- | --- |
| Authenticated access, fail closed | `server.ts` `loadTokens`, `authenticate` | refuses to start without a token table; 401s without a token |
| No caller-supplied identity | `server.ts` principal comes from the token table only | rejects a spoofed identity header |
| Authorisation per record | `sessionService.ts` owner check on read/extend/destroy | read ignores ownership (mutation caught) |
| Confidentiality at rest | AES-256-GCM, per-user HKDF key, session id bound as AAD | seal loses AAD / open ignores AAD (both caught) |
| Tamper-evident audit | hash-chained WAL, `wal.ts` | wal hash check removed / chain break check removed (both caught) |
| Deletion is real | destroy removes record and blob, tombstone retained | destroy removes the record and the blob |
| Data minimisation | payload cap on create | payload cap removed (caught) |
| Bounded retention | TTL clamp to policy ceiling, expiry enforced on recovery | ttl clamp removed, recovery skips expired (caught) |
| No secret or payload in logs | audit sink records ids and outcomes only | covered by payload/audit assertions |

## Honest gaps

1. **Not a custody system.** It stores session records, not customer funds. Do not describe it as holding value.
2. **No KYC, AML or sanctions screening.** Identity is a token mapped to a principal. Onboarding controls live outside this package.
3. **Audit log is local JSONL.** It is tamper-evident, not tamper-proof: an operator with disk access can delete the whole file. Shipping it to append-only remote storage is required before any regulated use.
4. **One redundant guard.** `recover()` checks expiry twice (once while folding entries, once before replay). Deliberate defence in depth; removing either alone changes no observable behaviour, and that is documented rather than hidden.
5. **Redis is optional.** The in-memory store is for tests only. A production deployment must set `GATEWAY_REDIS_URL` and verify `readyz`.
6. **Not independently audited.** No third-party review has been performed.

## Retention

- Session records: TTL ceiling from policy, default 24h.
- Tombstones: `tombstoneRetentionSeconds`, default 7 days, so a deletion stays provable.
- WAL: append-only. Compaction must preserve chain continuity, which is why it is not automated here.

## Regulatory notes

- The audit chain supports evidencing who did what and when, which is the technical half of most record-keeping duties.
- It does **not** establish compliance with any specific regime. GENIUS Act issuer rules, MiCA e-money token duties and state money transmission licensing all turn on facts outside this code: who holds customer funds, where the entity is licensed, and what the redemption route is.
- Treat this document as an engineering control inventory, not legal advice.

## Running the tests

```
npx jest -c packages/gateway/jest.config.cjs
```

36 tests. Mutation testing is run separately against the security invariants; 13 of 14 deliberate breaks are caught and the survivor is the redundant guard noted above.
