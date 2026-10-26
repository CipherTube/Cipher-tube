## 2026-04-17 - Sanitized Redis Error Logging
**Vulnerability:** Potential credential leakage in logs via raw Redis error objects.
**Learning:** Default error objects in some libraries (like Redis) can contain connection strings including passwords if the connection fails.
**Prevention:** Always log only the `err.message` or specific sanitized fields when handling database connection errors, rather than the entire error object.

## 2026-04-18 - Header Length Validation
**Vulnerability:** Denial of Service (DoS) and cache displacement via oversized request headers.
**Learning:** Untrusted headers like `x-user-id` can be used to bloat in-memory caches or cause resource exhaustion if not size-limited at the application level, even if the reverse proxy has its own limits.
**Prevention:** Implement centralized middleware to validate the presence, type, and maximum length of critical custom headers before they reach business logic or caching layers.

## 2025-05-15 - Cryptographic Fail-Secure Handling
**Vulnerability:** Information leakage or service degradation via unhandled cryptographic exceptions.
**Learning:** Node.js `crypto` can throw specific errors (e.g., "Unsupported state") during decryption of tampered data that might escape generic `bad decrypt` checks, potentially leading to 500 errors and leaking internal stack traces if not caught.
**Prevention:** Explicitly catch and map cryptographic errors to 400 Bad Request with generic "Decryption failed" messages to ensure the system fails securely without exposing implementation details.

## 2025-05-20 - Defense-in-Depth for Multi-Layer Decryption
**Vulnerability:** Service instability (500 errors) via malformed "onion" encryption payloads.
**Learning:** Even with generic crypto error catching, missing structural validation (e.g., minimum length for N-layers, hex format) can trigger unhandled edge cases in buffer slicing or internal library calls before cryptographic verification occurs.
**Prevention:** Implement structural sanity checks (format, minimum length, metadata presence) at the start of the decryption pipeline to reject invalid payloads early and prevent 400-level client errors from escalating to 500-level server errors.

## 2026-04-20 - Structural Validation of Metadata Arrays
**Vulnerability:** 500 Internal Server Error (DoS) via malformed metadata elements in arrays.
**Learning:** Functions iterating over complex metadata arrays (like `tubes`) are vulnerable to `TypeError` if array elements are `null` or have unexpected types, even if the array itself is present.
**Prevention:** Explicitly validate each element's existence and type within `find` or loop callbacks before accessing properties to ensure total robustness against malformed JSON payloads.

## 2026-04-21 - Atomic Security-Performance Balance
**Vulnerability:** Logical regressions during performance optimization of cryptographic loops.
**Learning:** Moving expensive operations (like hashing) outside of loops for O(1) performance can create security "theater" if the optimization assumes a static state that might be tampered with. It also complicates security reviews if the intent is not explicitly documented.
**Prevention:** Always maintain per-layer verification logic in multi-layer crypto architectures even if it appears redundant. Use `timingSafeEqual` for ALL sensitive comparisons and ensure the implementation is actually called and not just commented.

## 2025-05-25 - Runtime Compatibility as Availability Risk
**Vulnerability:** Service-wide Denial of Service (DoS) due to Node.js version/API mismatch.
**Learning:** Using cryptographic APIs introduced in newer Node.js versions (e.g., `crypto.hash` in v21.7.0+) when the project declares support for older LTS versions (v20.x) creates a silent failure point that crashes the entire crypto pipeline at runtime.
**Prevention:** Strictly adhere to standard `crypto.createHash` patterns for maximum compatibility across supported LTS versions, and verify API availability against the lowest supported version defined in `package.json`.

## 2026-05-30 - Middleware Order for Rate-Limited Security Headers
**Vulnerability:** Security headers (XFO, HSTS) missing on 429 "Too Many Requests" responses.
**Learning:** Applying rate limiters before security middleware (like `helmet`) causes blocked requests to return without protection. However, applying CSP/nonce generation before the limiter exposes the server to entropy exhaustion DoS.
**Prevention:** Split security middleware: apply core headers (HSTS, X-Frame-Options) before the rate limiter to protect all responses, but apply resource-intensive headers (CSP with nonces) after the limiter to prevent resource waste on malicious traffic.

## 2026-06-05 - Structural Validation of Governance Manifests
**Vulnerability:** Potential Denial of Service (DoS) and logic bypass via malformed manifest objects.
**Learning:** In JavaScript/TypeScript, `typeof [] === 'object'`, which can lead to unexpected behavior or crashes in logic that expects plain objects but receives arrays. This is particularly critical in governance engines where manifests control security gates.
**Prevention:** Always use `!Array.isArray(obj) && typeof obj === 'object'` to verify non-array objects and explicitly check `Array.isArray()` for nested collections before iteration.

## 2026-06-15 - Generic Decryption Error Messages
**Vulnerability:** Information leakage via specific cryptographic error messages (e.g., "Invalid tube metadata", "Missing encryption tube").
**Learning:** Returning detailed validation errors for complex cryptographic payloads can act as an oracle for attackers or reveal internal structural requirements that should remain opaque.
**Prevention:** Map all client-side cryptographic and structural validation errors to a single, generic "Decryption failed" message for public responses, while maintaining detailed logs for internal observability.

## 2026-06-20 - Prototype Bypass in Governance Manifest Validation
**Vulnerability:** Governance manifest validation could be bypassed using built-in object properties (e.g., "toString") when using the "in" operator or direct property access.
**Learning:** In JavaScript, the "in" operator and direct property access check the entire prototype chain. If a manifest specifies a role named "toString", and the validator checks if "toString" exists in the roles object using "roleId in manifest.roles", it will return true even if the role is not explicitly defined in the manifest.
**Prevention:** Always use "Object.prototype.hasOwnProperty.call(obj, prop)" to verify that a property exists directly on an object, especially when dealing with user-supplied keys in security-critical validation logic.

## 2026-05-31 - Template Injection in Orchestrator
**Vulnerability:** Template injection (double expansion) and prototype pollution in Predator orchestrator parameter resolution.
**Learning:** Iterative or recursive string replacement on user-controlled inputs can lead to nested template expansion, exposing internal state or secrets. Direct property access on objects via user-supplied keys also risks prototype chain traversal.
**Prevention:** Use single-pass regex replacement for template interpolation to ensure each token is expanded exactly once. Explicitly block access to `__proto__`, `constructor`, and `prototype` during dynamic path resolution.

## 2026-06-25 - Prototype Pollution in Object Iteration
**Vulnerability:** Prototype pollution during recursive object resolution in orchestrator.
**Learning:** Even if individual path resolution is protected, a recursive function that iterates over object entries and assigns them to a new object can still be vulnerable to prototype pollution if it encounters a `__proto__` key in the input object.
**Prevention:** Always filter out sensitive keys like `__proto__`, `constructor`, and `prototype` when iterating over untrusted object entries and creating new objects based on them.

## 2026-06-26 - Cache Penetration via Non-Existent Sessions
**Vulnerability:** Denial of Service (DoS) via Cache Penetration.
**Learning:** The application was vulnerable to resource exhaustion because it only cached successful session lookups. Attackers could flood the system with requests for non-existent session IDs, forcing a Redis lookup for every request and bypassing the in-memory cache entirely.
**Prevention:** Implement negative caching by storing a sentinel value (e.g., "__NOT_FOUND__") in the local cache for keys that do not exist in the primary database. This ensures that repeated lookups for missing resources are handled at the cache layer, protecting the database from exhaustion.

## 2026-06-27 - Prototype Pollution in Map-like Governance Objects
**Vulnerability:** Prototype pollution and bypass via malicious keys in governance manifests.
**Learning:** In TypeScript/JavaScript, iterating over `Object.entries()` of a user-supplied object used as a map (e.g., roles, lifecycle gates) can lead to prototype pollution if keys like `__proto__` or `constructor` are present. These can overwrite global object properties or bypass logic that uses `in` or direct property access.
**Prevention:** Explicitly block forbidden keys (`__proto__`, `constructor`, `prototype`) when iterating over keys of map-like objects in security-critical validation logic. Use `Object.prototype.hasOwnProperty.call` for existence checks instead of the `in` operator.

## 2026-06-28 - Time-Window Bypass via NaN Comparison
**Vulnerability:** Non-numeric salt values in ZK proof payloads could bypass time-window checks due to NaN comparison results.
**Learning:** In JavaScript, `Math.abs(currentEpoch - salt) > performanceWindow` evaluates to `false` if `salt` is a non-numeric type that results in `NaN`, effectively bypassing replay protection.
**Prevention:** Always explicitly validate the type and value (e.g., `Number.isNaN`) of numeric inputs used in security-critical comparisons, especially when they originate from untrusted JSON payloads.

## 2026-06-29 - IDOR in Session Rotation Endpoint
**Vulnerability:** Insecure Direct Object Reference (IDOR) in the `/mcp/rotate` endpoint allowed unauthorized users to rotate sessions they did not own.
**Learning:** Even if an endpoint requires a valid session token, it must also verify that the requester is the authorized owner of that specific session before performing state-changing operations like rotation.
**Prevention:** Always apply ownership-verification middleware (like `ensureSessionOwner`) to all endpoints that perform actions on a specific session, ensuring the `x-user-id` matches the stored session owner.

## 2026-06-30 - DoS via timingSafeEqual Length Mismatch
**Vulnerability:** Denial of Service (DoS) in cryptographic verification due to unhandled exceptions in `timingSafeEqual`.
**Learning:** Node.js `crypto.timingSafeEqual` throws a `RangeError` if the input buffers have different lengths. If this isn't caught, a malformed proof with a short or long challenge can crash the entire worker process.
**Prevention:** Always perform a strict length check or format validation (e.g., regex check for hex length) before calling `timingSafeEqual`. Ensure that both inputs are compared as same-length buffers to prevent runtime crashes.

## 2026-07-01 - Broken Cryptographic Proof Pipeline
**Vulnerability:** Service-wide failure of cryptographic proof verification due to implementation errors (ReferenceError and Duplicate Declarations).
**Learning:** A critical variable (`computedProof`) was missing from the `verifyCryptographicProof` function, while others (`challengeBuffer`, `computedBuffer`) were declared multiple times, causing runtime crashes that could be exploited for Denial of Service or to bypass security checks if errors were not handled securely.
**Prevention:** Always implement comprehensive unit tests for cryptographic pipelines, including failure cases and "golden path" verification. Use static analysis tools to catch duplicate declarations and reference errors before deployment.

## 2026-07-03 - Fatal Redundancy in Cryptographic Pipelines
**Vulnerability:** Denial of Service (DoS) via redundant digest calls and duplicate variable declarations in security-critical code.
**Learning:** In Node.js `crypto`, calling `.digest()` more than once on a single HMAC or Hash instance throws a `Error: digest already called`. When combined with a duplicate `const` declaration, this ensures the verification process crashes the entire request context, creating a high-availability risk.
**Prevention:** Strictly separate data preparation from verification logic. Use unit tests that specifically target the compilation and execution of cryptographic hot-paths to ensure that manual porting of security fixes doesn't introduce fatal logic regressions.

## 2026-07-04 - Cryptographic Proof Binding Enforcement
**Vulnerability:** Proof re-use/substitution vulnerability due to lack of binding between proof payload and request headers.
**Learning:** Verifying that a proof is cryptographically valid is insufficient if the proof itself contains structural parameters (like `structuralHash`) that are not matched against the actual resource being requested (`x-cipher-hash`). An attacker could potentially use a valid proof from one channel to authenticate requests for a different channel.
**Prevention:** Always pass the expected resource identifier to the verification function and strictly compare it against the value embedded within the decrypted/verified proof payload to ensure strong binding.

## 2026-07-05 - Type-Confusion and Unhandled Exceptions in Cryptographic Wrapper Decoders
**Vulnerability:** Service-wide Denial of Service (DoS) and crash risk via unhandled TypeError exceptions in secure_unwrap.
**Learning:** In Python, calling functions like `bytes.fromhex` on non-string inputs (or subscripting non-dictionary objects) raises a `TypeError`. If the cryptographic wrap/unwrap pipeline only catches standard decoding or parsing errors (like `KeyError` or `ValueError`), type-confusion payloads from untrusted sources will crash the execution context rather than failing gracefully.
**Prevention:** Always enforce strict type checks (using `isinstance`) on security-critical inputs and explicitly catch `TypeError` alongside other data parsing exceptions in cryptographic utility entrypoints, mapping them to standard fallback errors (like `ValueError`) to ensure fail-secure behavior.

## 2026-08-07 - Type-Confusion in Decrypted Vault Indexes
**Vulnerability:** Service-wide Denial of Service (DoS) and crash risk via unhandled TypeError exceptions in selectiveUnpack.
**Learning:** Even when decrypted data is structurally validated before decryption (using AEAD signatures), parsing the decrypted JSON payload can return arbitrary data types (e.g. an object instead of an array). Calling array methods like `.find()` on non-array objects causes a runtime TypeError that can crash request/worker contexts if not handled.
**Prevention:** Always check if parsed JSON structures match the expected collection type (e.g., using `Array.isArray()`) and validate all target object fields for expected types and safe ranges before use.
