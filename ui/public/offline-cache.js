// CypherTube Encrypted Offline Cache — Phase 1 (web track)
// ------------------------------------------------------------------
// AES-256-GCM encryption via WebCrypto. The key is generated
// non-extractable and stored as a CryptoKey object in IndexedDB, so
// ciphertext on disk never sits next to raw key material the page
// (or an attacker with disk access) could read out.
//
// Guardrails (PLATFORM_SHIP_PLAN.md §1):
//   - Sensitive payloads (session tokens, user ids) are never stored
//     in plaintext — localStorage/sessionStorage remain untouched.
//   - Only operation stubs for /mcp and /session/extend are queued.
//
// Exposes globalThis.CypherOffline: put / get / remove /
// queueOperation / drainQueue. Original CipherTube design.

(function () {
    var DB_NAME = 'ciphertube-offline';
    var DB_VERSION = 1;
    var KEY_STORE = 'keys';
    var RECORD_STORE = 'records';
    var QUEUE_STORE = 'queue';
    var KEY_ID = 'session-key';

    function openDb() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
                if (!db.objectStoreNames.contains(RECORD_STORE)) db.createObjectStore(RECORD_STORE);
                if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function tx(storeName, mode, fn) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var t = db.transaction(storeName, mode);
                var req = fn(t.objectStore(storeName));
                t.oncomplete = function () { resolve(req && req.result); };
                t.onerror = function () { reject(t.error); };
            });
        });
    }

    var keyPromise = null;
    function ensureKey() {
        if (!keyPromise) {
            keyPromise = tx(KEY_STORE, 'readonly', function (s) { return s.get(KEY_ID); }).then(function (key) {
                if (key) return key;
                return crypto.subtle
                    .generateKey({ name: 'AES-GCM', length: 256 }, false /* non-extractable */, ['encrypt', 'decrypt'])
                    .then(function (newKey) {
                        return tx(KEY_STORE, 'readwrite', function (s) { return s.put(newKey, KEY_ID); }).then(function () {
                            return newKey;
                        });
                    });
            });
        }
        return keyPromise;
    }

    async function encrypt(value) {
        var key = await ensureKey();
        var iv = crypto.getRandomValues(new Uint8Array(12));
        var data = new TextEncoder().encode(JSON.stringify(value));
        var buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data);
        return { iv: Array.from(iv), data: Array.from(new Uint8Array(buf)) };
    }

    async function decrypt(record) {
        var key = await ensureKey();
        var buf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(record.iv) }, key, new Uint8Array(record.data));
        return JSON.parse(new TextDecoder().decode(buf));
    }

    var CypherOffline = {
        /** Store an encrypted record under an id. */
        async put(id, value) {
            var payload = await encrypt(value);
            return tx(RECORD_STORE, 'readwrite', function (s) { return s.put(payload, id); });
        },

        /** Retrieve and decrypt a record; null if absent. */
        async get(id) {
            var record = await tx(RECORD_STORE, 'readonly', function (s) { return s.get(id); });
            return record ? decrypt(record) : null;
        },

        /** Remove a record (erasure path). */
        async remove(id) {
            return tx(RECORD_STORE, 'readwrite', function (s) { return s.delete(id); });
        },

        /** Queue an operation stub for later replay (stored encrypted). */
        async queueOperation(op) {
            var payload = await encrypt(op);
            return tx(QUEUE_STORE, 'readwrite', function (s) { return s.add(payload); });
        },

        /**
         * Replay queued operations in FIFO order. Each successful replay
         * is deleted; failures keep the entry for the next drain.
         * Returns 'replayed' / 'kept' per entry.
         */
        async drainQueue(handler) {
            var db = await openDb();
            var items = await new Promise(function (resolve, reject) {
                var t = db.transaction(QUEUE_STORE, 'readwrite');
                var req = t.objectStore(QUEUE_STORE).getAll();
                t.oncomplete = function () { resolve(req.result || []); };
                t.onerror = function () { reject(t.error); };
            });
            var results = [];
            for (var i = 0; i < items.length; i++) {
                var rec = items[i];
                var op = await decrypt(rec);
                var outcome = 'kept';
                try {
                    await handler(op);
                    await tx(QUEUE_STORE, 'readwrite', function (s) { return s.delete(rec.id); });
                    outcome = 'replayed';
                } catch (err) {
                    // keep for the next drain
                }
                results.push(outcome);
            }
            return results;
        },
    };

    globalThis.CypherOffline = CypherOffline;
})();
