// CypherTube service worker — Phase 1 (PWA)
// Cache-first for static UI assets only. Guardrail: no sensitive payloads,
// tokens, or session data are ever cached (PLATFORM_SHIP_PLAN.md §1).
const VERSION = 'ciphertube-v1.6.0-phase1';
const STATIC_ASSETS = [
    '/ui/styles.css',
    '/ui/app.js',
    '/ui/theme-boot.js',
    '/ui/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(VERSION).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET') return;
    // Only static bundle assets are cacheable; everything else passes through.
    if (!url.pathname.startsWith('/ui/')) return;
    event.respondWith(
        caches.match(event.request).then(
            (hit) =>
                hit ||
                fetch(event.request).then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(VERSION).then((cache) => cache.put(event.request, copy));
                    }
                    return response;
                })
        )
    );
});
