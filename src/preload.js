const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ss', {
  platform: process.platform,
  scan: () => ipcRenderer.invoke('scan'),
  toggle: (id, on) => ipcRenderer.invoke('toggle', id, on),
  openSystem: () => ipcRenderer.invoke('open-system'),
  reveal: (id) => ipcRenderer.invoke('reveal', id),
  icon: (p) => ipcRenderer.invoke('icon', p),
  settings: () => ipcRenderer.invoke('settings'),
  setSettings: (p) => ipcRenderer.invoke('set-settings', p),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  openUpdate: (u) => ipcRenderer.invoke('open-update', u),
  onUpdate: (fn) => ipcRenderer.on('update', (_, s) => fn(s)),
});
