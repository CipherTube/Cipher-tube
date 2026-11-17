## 2026-07-04 - High-Performance Binary Header Parsing and Zero-Copy Subarrays
**Learning:** Using direct binary comparison on buffers (`readUInt32BE` and `readUInt16BE`) to validate static magic bytes (such as `.ctube`) completely eliminates UTF-8 string decoding and temporary string allocations. Coupling this with zero-copy `subarray()` views allows direct pass-throughs to cryptographic helpers like `hmac.update` without intermediate memory allocations or copying overhead, yielding a statistically measurable speedup (~5-8%).
**Action:** Always prefer direct binary integer matching over string-based header parsing for hot validation paths, and use `subarray()` over `slice()` for zero-copy views.

## 2025-05-25 - Manual String Parsing for Template and Path Resolution
**Learning:** Manual string traversal with `indexOf` and `substring` is significantly faster than regex matches and `split('.')` for deep object path resolution in Node.js. In hot recursive paths like `resolveParams`, avoiding intermediate array allocations from `split()` and regex capture groups can yield ~25-30% performance gains.
**Action:** Prefer manual string parsing over regex/split for high-frequency path resolution; avoid redundant property validators by centralizing them in a single exported helper.

## 2026-06-25 - Manual Interpolation Traversal
**Learning:** Replacing global regex-based `String.prototype.replace` with a manual `indexOf` and `substring` loop for template interpolation (e.g., `${state.key}`) in hot code paths like `resolveParams` reduces execution time by ~30%. This avoids the overhead of the regex engine and intermediate capture group allocations.
**Action:** Use manual string scanning for known, simple template patterns in high-frequency execution loops.

## 2025-05-25 - LRU-Cache for Sliding Session Throttling
**Learning:** Throttling database write operations (like Redis `EXPIRE`) using a short-lived in-memory LRU cache (e.g., 60s TTL) significantly reduces external system load. Failing to define such a cache before use leads to a `ReferenceError`, causing server crashes on every authorized request.
**Action:** Always verify that performance-related caches are correctly initialized; use LRU caches to throttle frequent but non-critical state updates.

## 2025-05-25 - One-Shot Hashing with `crypto.hash`
**Learning:** Node.js v21.7+ introduced `crypto.hash` which is ~2.2x faster than the streaming `createHash` API for small inputs (like session tokens or integrity hashes). Using the `encoding` parameter directly in `crypto.hash` further reduces overhead by avoiding intermediate `Buffer` allocations.
**Action:** Use the `fastHash` utility for all one-shot hashing needs to leverage native performance gains while maintaining backward compatibility.

## 2025-05-26 - Direct Buffer Digest for Timing-Safe HMAC
**Learning:** Obtaining a Buffer directly from `hmac.digest()` is ~1.2x faster than encoding to hex and decoding back. Furthermore, despite Node.js v22 documentation, `crypto.hmac` is not globally available in this environment, making `createHmac` the mandatory one-shot path.
**Action:** Prefer `digest()` over `digest('hex')` when the result is consumed as a Buffer; continue using `createHmac` for maximum compatibility.

## 2025-05-26 - Module-Scope UI Pre-rendering
**Learning:** Pre-rendering HTML fragments from static metadata at the module scope in `server.ts` eliminates redundant `split()`, `map()`, and `join()` overhead on every request to the root endpoint.
**Action:** Move static template-literal logic to module-level constants to optimize hot request paths for landing pages.

## 2026-05-25 - Consolidating Redundant Hashing via Request Context
**Learning:** Performing multiple independent SHA-256 hashes on the same token (e.g., once for local cache and once for Redis key) in the same request lifecycle is wasteful. Consolidating these into a single `getSessionKeys` call and storing the results in `res.locals` achieves a near 2x speedup for the hashing logic and reduces CPU pressure.
**Action:** Always check for redundant cryptographic operations on the same inputs within a single request; use middleware to pre-compute and share these values via `res.locals`.

## 2026-07-01 - Fast CSP Nonce Generation via `randomUUID`
**Learning:** `crypto.randomUUID()` is significantly faster (~14x) than `crypto.randomBytes(16).toString('base64')` in Node.js because it avoids intermediate `Buffer` allocations and encoding overhead. Furthermore, pre-calculating the full CSP string (`'nonce-...'`) in `res.locals` eliminates redundant concatenations in the `helmet` CSP middleware.
**Action:** Use `randomUUID()` for non-cryptographic unique tokens (like CSP nonces) where UUID v4 entropy (122 bits) is sufficient. Ensure that test regexes for nonces allow for hyphens when switching from Base64 to UUID.

## 2026-07-02 - Timing Side-Channels in Security Caching
**Learning:** Caching results of cryptographic verification (like HMAC checks) introduces a timing side-channel. Attackers can distinguish between cache hits (fast) and misses (slow), potentially leaking information about which inputs are "known" or "valid" to the system. This undermines the purpose of `timingSafeEqual`.
**Action:** Avoid caching in cryptographic verification paths where constant-time execution is required; prioritize safety over micro-optimizations in these sensitive areas.

## 2026-07-03 - Unsafe Buffer Casting for Implicit Coercion in JSON.parse
**Learning:** Lying to the TypeScript compiler with unsafe type casts (e.g., `as unknown as string` on a Buffer) to pass it directly to standard functions like `JSON.parse` is a major hazard. While Node.js v22's native `JSON.parse` supports Buffers directly without intermediate allocations, standard JS/TS typings do not. If the underlying data type changes to a standard `Uint8Array` (e.g., in edge or cloud environment migrations), standard implicit coercion will produce comma-separated byte strings (e.g., `"123,98,111"`), resulting in catastrophic runtime `SyntaxError` crashes.
**Action:** Always prefer explicit standard string conversion or safe platform APIs over type-cast-based implicit coercion.

## 2026-07-04 - Fast Base64 Decoding via Global `atob` with Fallback
**Learning:** Global `atob()` is significantly faster than `Buffer.from(..., 'base64').toString('utf8')` under V8 because it decodes base64 strings directly to binary characters without intermediate Buffer object creation or encoding allocations. However, `atob()` is only safe for pure ASCII payloads. Checking for non-ASCII characters via a fast regex `/^[^\x00-\x7F]/` (with ESLint bypass) allows using `atob` in the hot-path (~10-15% throughput improvement) while safely falling back to Buffer for multi-byte UTF-8 correctness.
**Action:** Use global `atob` with a fast-path ASCII regex filter and standard Buffer fallback for high-frequency base64-to-JSON decoding pipelines.
