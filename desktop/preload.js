// CypherTube Desktop — preload bridge.
// Exposes only the safeStorage-backed token store to the renderer;
// no Node/electron APIs leak into page context.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cypherTokenStore', {
    put: (id, token) => ipcRenderer.invoke('token-store:put', id, token),
    get: (id) => ipcRenderer.invoke('token-store:get', id),
    delete: (id) => ipcRenderer.invoke('token-store:delete', id),
});
