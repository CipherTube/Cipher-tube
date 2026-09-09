// CypherTube Desktop — Phase 3 Electron main process.
// Security posture: contextIsolation on, nodeIntegration off, sandbox on.
// Token storage uses Electron safeStorage (OS keychain-backed) — the
// desktop equivalent of the Android Keystore store (docs/KEYSTORE_TOKEN_STORE.md).
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const GATEWAY_URL = process.env.CIPHERTUBE_GATEWAY_URL || 'https://localhost:3443';
const DEV_URL = process.env.CIPHERTUBE_DEV === '1' ? 'http://localhost:3000' : null;

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

function createWindow() {
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
    win.loadURL(DEV_URL || GATEWAY_URL);
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
