# CypherTube Sovereign Kernel — Phase 0

A runnable, dependency-free skeleton of the S0–S8 deterministic state machine:
telemetry gates, recovery circuit breakers, and an append-only audit ledger.

Phase 0 proves the control loop works. It is not yet wired to real subsystems.

## What is here

```
src/
  telemetry/
    types.ts        StateId, HealthSnapshot, AssertionGate, CircuitBreaker
    registry.ts     in-process metric store (OTLP reader in phase 1)
    verifier.ts     50 ms assertion loop with per-metric debounce
    gates/index.ts  S0–S8 gates with the documented thresholds
  kernel/
    recovery/
      types.ts      RecoveryHandler, Subsystem contracts
      handlers.ts   DegradedIngest, SandboxOnly, SafeMode, EmergencyS0Reset
      circuitBreaker.ts  metric → tier mapping, cooldowns, transition history
    healthPoller.ts snapshot builder
  ledger/
    ledger.ts       append-only SHA-256 hash chain + last-known-good snapshot
  api/
    server.ts       HTTP surface: /health, /metrics, /simulate/failure,
                    /agent/execute, /ledger
  test/
    kernel.test.ts  gates, tier mapping, ledger integrity
```

## Run it

```bash
npm install
npx tsc -p tsconfig.json
node --test dist/test/kernel.test.js     # 3 tests
PORT=8080 node dist/api/server.js        # normal
PORT=8080 node dist/api/server.js --demo # injects a drift spike after 3 s
```

## Prove the control loop

```bash
curl -s localhost:8080/health
curl -s -X POST "localhost:8080/simulate/failure?value=22"
curl -s localhost:8080/health   # transitions: DEGRADED_INGEST / E_INGEST_DESYNC
```

The breaker maps `s8.ingest.*` to the cheapest tier that contains it. It never
jumps straight to an S0 reset for a transient drift, and every transition is
recorded with metric, code and timestamp.

## Deliberate Phase 0 limits

- Metrics are in-process, not real OTLP. Phase 1 swaps `registry.ts` for an
  OpenTelemetry metric reader.
- Handlers log and flip mode flags instead of touching real subsystems.
- No signed governance bundle yet. Phase 2 adds cosign verification and the
  constitution hash gate behind real files.
- Ledger is in memory. Phase 2 persists it append-only on disk or Postgres.

## Why this shape

Banks do not buy architecture diagrams. They buy a control loop they can watch
catch a failure. This skeleton is the smallest thing that does that.
