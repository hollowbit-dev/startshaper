const { app, BrowserWindow, ipcMain, shell, nativeTheme, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { setupUpdates } = require('./update-check');
const { lookup } = require('./known');

const IS_MAC = process.platform === 'darwin';
// Demo mode shows made-up results for screenshots. It never reads or changes anything real.
const DEMO = process.env.STARTSHAPER_DEMO === '1';
const sys = DEMO ? require('./demo') : IS_MAC ? require('./mac') : require('./win');
// Tests can point the app at a throwaway settings folder.
if (process.env.STARTSHAPER_USERDATA) app.setPath('userData', process.env.STARTSHAPER_USERDATA);
const settings = () => require('./settings');

let win;
// Only items from the last scan can be switched on or off. The window can't name anything else.
let items = new Map();
// Icons may only be read for programs the scan returned.
let iconPaths = new Set();

function create() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1120, height: 760, minWidth: 900, minHeight: 600,
    backgroundColor: '#111017',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'hidden',
    titleBarOverlay: IS_MAC ? undefined : { color: '#111017', symbolColor: '#a8a3b8', height: 36 },
    trafficLightPosition: { x: 18, y: 18 },
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  win.loadFile(path.join(__dirname, 'renderer/index.html'));
}

// The only network request: once a day, if not turned off, ask GitHub for the latest version number.
const updates = setupUpdates({
  app, repo: 'hollowbit-dev/startshaper',
  getSettings: () => settings().get(), setSettings: (p) => settings().set(p),
  send: (st) => { if (win && !win.isDestroyed()) win.webContents.send('update', st); },
});
ipcMain.handle('settings', () => ({ ...settings().get(), version: app.getVersion(), demo: DEMO }));
ipcMain.handle('set-settings', (e, patch) => settings().set({ autoUpdate: patch.autoUpdate !== false, ...(patch.skipVersion ? { skipVersion: String(patch.skipVersion) } : {}) }));
ipcMain.handle('check-updates', () => updates.check({ manual: true }));
ipcMain.handle('open-update', (e, url) => /^https:\/\/github\.com\/hollowbit-dev\/startshaper\//.test(url) && shell.openExternal(url));

ipcMain.handle('scan', async () => {
  const r = await sys.scan();
  items = new Map(r.items.map((i) => [i.id, i]));
  iconPaths = new Set([...r.items.flatMap((i) => [i.app, i.exe]), ...r.apps.flatMap((a) => [a.app, a.exe])].filter(Boolean));
  r.apps = r.apps.slice(0, 14).map((a) => ({ ...a, what: explain(a) }));
  r.history = settings().get().history || [];
  return r;
});

// One plain sentence for the "Right now" list.
function explain(a) {
  if (a.system) return 'The system and its built-in helpers. This much is normal.';
  if (/chrome|edge|firefox|brave|opera|arc|safari|vivaldi/i.test(a.name)) return `A web browser. Every tab and extension runs on its own, ${a.count} pieces right now. Closing tabs frees memory.`;
  const k = lookup(a.name, a.exe);
  if (k.what && !/log in|when windows starts/i.test(k.what)) return k.what;
  if (k.kind) return k.kind + '.';
  return a.count > 1 ? `${a.count} processes working together.` : null;
}

async function apply(item, on) {
  if (DEMO) { await new Promise((r) => setTimeout(r, 260)); return { ok: true }; }
  if (IS_MAC) {
    for (const p of item.parts.filter((x) => x.canToggle)) {
      const r = await sys.setEnabled({ id: p.label, kind: p.kind, plist: p.plist }, on);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  return sys.setEnabled(item, on);
}

// Turn one startup item on or off, and remember it so it can be undone later.
ipcMain.handle('toggle', async (e, id, on) => {
  const item = items.get(id);
  if (!item) return { ok: false, error: 'Not part of the last check' };
  if (!item.canToggle) return { ok: false, error: 'This one needs an admin password' };
  const r = await apply(item, !!on);
  if (!r.ok) return r;
  for (const p of item.parts) if (p.canToggle) p.on = !!on;
  item.on = item.parts.some((p) => p.on);
  const history = [{ id, name: item.name, on: !!on, at: Date.now(), slowMs: item.slowMs || null, mem: item.mem || 0 }, ...(settings().get().history || [])].slice(0, 200);
  settings().set({ history });
  return { ok: true, item, history };
});

// Open the system's own screen for items that need an admin password.
ipcMain.handle('open-system', () => {
  if (DEMO) return true;
  if (IS_MAC) return shell.openExternal('x-apple.systempreferences:com.apple.LoginItems-Settings.extension');
  execFile('taskmgr.exe', ['/0', '/startup'], { windowsHide: false }, () => {});
  return true;
});

ipcMain.handle('reveal', (e, id) => {
  const it = items.get(id);
  const p = it && (it.app || it.exe || (it.parts[0] && it.parts[0].plist));
  if (p && !DEMO) shell.showItemInFolder(p);
  return !!p;
});

const iconCache = new Map();
ipcMain.handle('icon', async (e, p) => {
  if (!p || !iconPaths.has(p)) return null;
  if (iconCache.has(p)) return iconCache.get(p);
  let url = null;
  if (DEMO || !fs.existsSync(p)) { iconCache.set(p, null); return null; }
  try {
    // Real app icons on macOS come from QuickLook (getFileIcon only gives a small generic one).
    if (IS_MAC && p.endsWith('.app')) {
      const t = await nativeImage.createThumbnailFromPath(p, { width: 128, height: 128 });
      if (!t.isEmpty()) { url = t.toDataURL(); iconCache.set(p, url); return url; }
    }
    // 'large' isn't supported on macOS and crashes Electron there.
    const img = await app.getFileIcon(p, { size: IS_MAC ? 'normal' : 'large' });
    if (!img.isEmpty()) url = img.toDataURL();
  } catch { /* no icon */ }
  iconCache.set(p, url);
  return url;
});

app.whenReady().then(() => { require('./discord-menu').addDiscordMenu(); create(); updates.schedule(); });
app.on('window-all-closed', () => app.quit());
