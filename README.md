# Sovereign Cypher-Tube v1.5.0

A modular zero-trust cryptographic platform — Sentinel · Bolt · Palette.

> **Status:** Active / Autonomous Architecture Node
> **Core Engine:** Cryptographic Pipeline & Session State Manager
> **Primary Datastore:** Redis
> **Service Layer:** Express.js / Node.js (>=20)
> **Encryption Protocol:** Cipher Tube Assembly Protocol (CTAP)

---

## Architecture Overview

CypherTube is a zero-trust session and cryptographic pipeline built on Express 5 and Redis 5. It provides blinded session token management, cryptographically guarded gateway routing, real-time telemetry, and a modular workspace architecture spanning six core packages.

### Core Packages (Workspaces)

| Package | Role |
|---------|------|
| `sentinel` | Security boundary enforcement, middleware guards, rate limiting |
| `bolt` | Performance optimization layer — pre-rendering, cache pooling, hot-path tuning |
| `palette` | Design system and Storybook component library |
| `tube` | Core cryptographic pipeline — cipher assembly, encryption/decryption |
| `ui` | Cosmology map and client-facing interface rendering |
| `wizard` | CLI tooling (`ctube`) and world management |

### Key Source Modules (`src/`)

- **`session_rotator.ts`** — Blinded SHA-256 token hashing, session creation, rotation with 5-second grace period
- **`gatewayServer.ts`** — Express gateway with telemetry endpoint, ZK validation middleware, graceful SIGTERM shutdown
- **`server.ts`** — Primary application server with Helmet, rate limiting, LRU cache, myth/ritual engine integration
- **`cta.ts`** — Cipher Tube Assembly — `buildCipherTube` / `decryptCipherTube` / `fastHash`
- **`crypto/verifier.ts`** — Cryptographic proof verification
- **`gateway/sessionMiddleware.ts`** — `cipherTubeGateway` middleware for ZK validation boundaries
- **`cache/redisPool.ts`** — Redis connection pooling

### Supporting Directories

- **`core/`** — Python telemetry and indexing nodes (`indexer.py`, `nodes.py`, `telemetry.py`)
- **`cyphertube-core/`** — Packaged core library with its own `package.json`
- **`governance/`** — OPA policy definitions
- **`security/`** — Security audit artifacts and secret scanning baseline
- **`docs/`** — API reference, philosophy, architecture documentation

---

## Developer Quickstart

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Redis running locally or reachable via `REDIS_URL`

### Install and Run

```bash
npm install
npm start
```

### Environment

Copy `.env.example` to `.env` and configure:

- `REDIS_URL` — Redis connection string
- `GATEWAY_PORT` — Gateway server port (default: 8080)
- `NODE_ENV` — `production` / `development` / `test`

### Testing

```bash
# Run all workspace tests
npm test

# Run sovereign OS core tests
npx vitest tests/unit/sovereign-os.test.ts

# Integration tests
npm run test:integration

# Security scan
npm run security:scan
```

---

## Current Capabilities

- ✅ Autonomous repository synchronization
- ✅ State and session recovery with blinded token storage
- ✅ Real-time gateway telemetry and diagnostics
- ✅ Rate limiting and Helmet security headers
- ✅ Graceful shutdown with Redis connection cleanup
- ✅ Session rotation with 5-second grace period (race-condition tolerant)
- ✅ LRU in-process cache for hot-path optimization
- ✅ Pre-rendered static UI components (Bolt optimization)
- ✅ OPA governance policy testing

---

## Architecture Assessment (2026-08-13)

For the full detailed assessment, see [`ASSESSMENT.md`](./ASSESSMENT.md).

### Build Priorities (Roadmap)

1. **Session Payload Serialization** — Migrate from raw `userId` string to a versioned, typed `SessionPayload` with metadata, scopes, issued-at, and rotation lineage tracking.
2. **Redis Memory & Eviction Policy** — Explicit `maxmemory-policy` configuration, `INFO`-based memory monitoring, and cache warmup/teardown strategy.
3. **Zero-Downtime Key Rotation** — Transactional rotation (create new → verify → expire old) with challenge-response handshake validation.
4. **High-Throughput Metrics Pipeline** — Redis `INCR` / `HINCRBY` counters for request/rotation/failure metrics with periodic flush to an aggregator.

### Architecture Guardrails (What to Avoid)

- ❌ Unencrypted transient storage layers (LRU cache entries with sensitive data must be encrypted)
- ❌ Monolithic state coupling outside the Express/Redis pipeline (Python `core/` modules should be isolated as a sidecar or migrated to TypeScript)
- ❌ Vendor lock-in proprietary dependencies lacking data rights compliance

---

## License

MIT — © 2026 Sovereign Cypher-Tube.
