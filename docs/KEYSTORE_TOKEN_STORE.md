# Keystore-Backed Token Store — Phase 2 Spec (Android)

**Status:** spec — implementation next (PLATFORM_SHIP_PLAN.md Phase 2)
**Scope:** On-device session token storage for the CypherTube APK, backed by the Android Keystore system. Original CipherTube design; no third-party storage dependencies.

## 1. Threat Model

| Threat | Mitigation |
|---|---|
| Device theft / disk extraction | Tokens encrypted at rest with a Keystore hardware-backed AES-256-GCM key; plaintext never touches flash |
| Malware / other apps | Keystore keys are non-exportable and app-scoped (UID isolation) |
| Screen-scraping / memory dumps | Tokens decrypted only in transit to in-memory request paths; no UI echo; StrongBox when available |
| Replay across devices | Token binding uses the blinded-key protocol server-side (P1 payloads) — tokens remain useless without the gateway session state |

## 2. API (Capacitor plugin surface)

```ts
interface TokenStore {
  put(userIdBlinded: string, token: string): Promise<void>;
  get(userIdBlinded: string): Promise<string | null>;
  delete(userIdBlinded: string): Promise<void>;   // erasure requests (governance §1)
  rotate(userIdBlinded: string, newToken: string): Promise<void>; // atomic put+delete
}
```

- Encryption key alias: `ciphertube.session.v1`, generated on first use, `setUserAuthenticationRequired(false)` (background rotation must not prompt), `setInvalidatedOnBiometricEnrollment(false)` unless a future lock mode opts in.
- Cipher: AES-256-GCM, random 12-byte IV per record, IV stored alongside ciphertext in the app's private data dir.
- Storage location: `Context.filesDir` under `tokens/` — no external storage, no shared prefs.
- Rotation must be atomic: write-then-rename to prevent torn state on process death mid-rotation (mirrors the server's 5s grace concept).

## 3. Integration Points

- Client fetch layer (ui/public/app.js successor) reads the token via the plugin instead of `window.currentSessionToken`.
- Server-side: unchanged — tokens are opaque blinded-key references (P1 payloads).
- Governance: erasure (§1) maps to `delete()` + blinded-key TTL on the gateway.

## 4. Testing Matrix

1. put/get round-trip; 2. delete → get returns null; 3. rotate atomicity under injected crash; 4. key invalidation after `clearApplicationUserData` (expect clean first-run); 5. StrongBox present/absent paths; 6. 1k tokens performance budget < 10ms per op.

## 5. Out of Scope

SQLCipher cache (separate spec), biometric-gated vault mode, iOS Keychain (Phase 3 desktop covers Electron `safeStorage`; iOS later if targeted).
