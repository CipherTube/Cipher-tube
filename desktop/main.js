// CypherTube Desktop — Phase 3 Electron main process.
// Security posture: contextIsolation on, nodeIntegration off, sandbox on.
// Token storage uses Electron safeStorage (OS keychain-backed) — the
// desktop equivalent of the Android Keystore store (docs/KEYSTORE_TOKEN_STORE.md).
// Gateway certificate pinning: fails closed when CIPHERTUBE_CERT_PIN is set.
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const tls = require('tls');
const crypto = require('crypto');

const GATEWAY_URL = process.env.CIPHERTUBE_GATEWAY_URL || 'https://localhost:3443';
const DEV_URL = process.env.CIPHERTUBE_DEV === '1' ? 'http://localhost:3000' : null;
const CERT_PIN = process.env.CIPHERTUBE_CERT_PIN || ''; // hex sha-256 of the leaf cert

/**
 * Phase 3: verify the gateway's leaf certificate against a SHA-256 pin
 * before any window loads the gateway. Fails closed: if a pin is
 * configured and does not match (or TLS verification fails), the
 * gateway is never loaded. Opt-in via env, so dev/self-signed setups
 * simply leave it unset.
 */
function verifyGatewayPin(targetUrl) {
    if (!CERT_PIN) return Promise.resolve(true); // pinning not configured
    const u = new URL(targetUrl);
    if (u.protocol !== 'https:') return Promise.reject(new Error('cert pinning requires an https gateway'));
    const port = Number(u.port) || 443;
    return new Promise((resolve, reject) => {
        const socket = tls.connect(
            { host: u.hostname, port, servername: u.hostname, rejectUnauthorized: true, timeout: 5000 },
            () => {
                const cert = socket.getPeerCertificate();
                socket.end();
                if (!cert || !cert.raw) return reject(new Error('gateway did not present a certificate'));
                const digest = crypto.createHash('sha256').update(cert.raw).digest('hex');
                const expected = CERT_PIN.toLowerCase().replace(/:/g, '');
                if (digest === expected) return resolve(true);
                return reject(new Error('gateway certificate pin mismatch'));
            }
        );
        socket.on('error', reject);
        socket.on('timeout', () => { socket.destroy(); reject(new Error('gateway pin check timed out')); });
    });
}

const tokenDir = () => {
    const dir = path.join(app.getPath('userData'), 'tokens');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
};
const tokenPath = (id) => path.join(tokenDir(), encodeURIComponent(id) + '.bin');

ipcMain.handle('token-store:put', (_e, id, token) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage unavailable');
    fs.writeFileSync(tokenPath(id), safeStorage.encryptString(String(token)));
    return true;
});

ipcMain.handle('token-store:get', (_e, id) => {
    const file = tokenPath(id);
    if (!fs.existsSync(file)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(fs.readFileSync(file));
});

ipcMain.handle('token-store:delete', (_e, id) => {
    const file = tokenPath(id);
    if (fs.existsSync(file)) fs.rmSync(file);
    return true;
});

const PIN_FAILURE_PAGE =
    'data:text/html,<h1>CypherTube</h1><p>Gateway certificate verification failed. ' +
    'Refusing to connect (cert pin mismatch).</p>';

async function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'CypherTube',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    const target = DEV_URL || GATEWAY_URL;
    if (!DEV_URL) {
        try {
            await verifyGatewayPin(GATEWAY_URL);
        } catch (err) {
            console.error('[security] gateway pin check failed:', err.message);
            win.loadURL(PIN_FAILURE_PAGE);
            return;
        }
    }
    win.loadURL(target);
    if (DEV_URL) win.webContents.openDevTools({ mode: 'detach' });
}

// Dev-only: accept self-signed gateway certs when CIPHERTUBE_DEV=1.
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (DEV_URL || process.env.CIPHERTUBE_ALLOW_SELF_SIGNED === '1') {
        event.preventDefault();
        callback(true);
    } else {
        callback(false);
    }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
