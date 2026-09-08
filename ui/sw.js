// CypherTube service worker skeleton - PLATFORM_SHIP_PLAN.md Phase 1 (PWA)
// TODO Phase 1:
//  - cache-first strategy for static assets from ui/dist
//  - encrypted IndexedDB (WebCrypto AES-GCM) for offline reads
//  - offline operation queue replayed on reconnect
//  - version bump with each release to trigger PWA update
const VERSION = 'ciphertube-v1.6.0-alpha.1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Intentionally pass-through until Phase 1 caching strategy lands.
  // No unencrypted transient storage of sensitive payloads (guardrail).
});
