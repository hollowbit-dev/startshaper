// Checks the Windows parser with made-up PowerShell output (this test runs on any computer).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse } = require('../src/win.js');

const boot = Date.UTC(2026, 10, 13, 8, 0, 0);
const raw = {
  lastBoot: boot,
  mem: { total: 16e9, free: 5e9 }, cpus: 8,
  run: [
    { hive: 'HKCU', set: 'Run', name: 'Steam', cmd: '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', exe: 'C:\\Program Files (x86)\\Steam\\steam.exe', desc: 'Steam' },
    { hive: 'HKCU', set: 'Run', name: 'Discord', cmd: 'C:\\Users\\a\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe', exe: 'C:\\Users\\a\\AppData\\Local\\Discord\\Update.exe', desc: null },
    { hive: 'HKLM', set: 'Run', name: 'SecurityHealth', cmd: '%windir%\\system32\\SecurityHealthSystray.exe', exe: 'C:\\Windows\\system32\\SecurityHealthSystray.exe', desc: 'Windows Security notification icon' },
    { hive: 'HKLM', set: 'Run32', name: 'GoogleUpdate', cmd: '"C:\\Program Files (x86)\\Google\\Update\\GoogleUpdate.exe" /c', exe: 'C:\\Program Files (x86)\\Google\\Update\\GoogleUpdate.exe', desc: 'Google Installer' },
  ],
  folders: [
    { hive: 'HKCU', name: 'Spotify.lnk', path: 'C:\\Users\\a\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Spotify.lnk', exe: 'C:\\Users\\a\\AppData\\Roaming\\Spotify\\Spotify.exe', desc: 'Spotify' },
  ],
  approved: {
    'HKCU\\Run': { Steam: 2, Discord: 3 },
    'HKCU\\StartupFolder': {},
    'HKLM\\Run32': { GoogleUpdate: 7 },
  },
  procs: [
    { id: 1, name: 'steam', path: 'C:\\Program Files (x86)\\Steam\\steam.exe', mem: 180e6, cpu: 14, now: 0.4, start: boot + 30000, desc: 'Steam' },
    { id: 2, name: 'steamwebhelper', path: 'C:\\Program Files (x86)\\Steam\\bin\\cef\\cef.win7x64\\steamwebhelper.exe', mem: 260e6, cpu: 9, now: 0.2, start: boot + 35000, desc: 'Steam Client WebHelper' },
    { id: 3, name: 'SecurityHealthSystray', path: 'C:\\Windows\\system32\\SecurityHealthSystray.exe', mem: 9e6, cpu: 0.2, now: 0, start: boot + 20000 },
    { id: 4, name: 'svchost', path: 'C:\\Windows\\system32\\svchost.exe', mem: 40e6, cpu: 3, now: 0.1, start: boot },
    { id: 5, name: 'Spotify', path: 'C:\\Users\\a\\AppData\\Roaming\\Spotify\\Spotify.exe', mem: 120e6, cpu: 3, now: 1.5, start: boot + 40000, desc: 'Spotify' },
    { id: 6, name: 'idle', path: null, mem: 0, cpu: 0 },
  ],
  boot: [
    { at: boot + 120000, total: 94000, main: 41000, post: 53000 },
    { at: boot - 86400000, total: 88000, main: 40000, post: 48000 },
  ],
  slow: [
    { at: boot + 121000, name: 'steam.exe', friendly: 'Steam', total: 12000, degradation: 11200 },
    { at: boot - 3 * 365 * 86400000, name: 'Spotify.exe', friendly: 'Spotify', total: 9000, degradation: 8000 }, // too old to count
  ],
};

const r = parse(raw);
const by = (n) => r.items.find((i) => i.name === n);

assert.equal(r.platform, 'win32');
assert.equal(r.bootSeconds, 94);
assert.equal(r.items.length, 5);

const steam = by('Steam');
assert.ok(steam, 'Steam found');
assert.equal(steam.on, true);
assert.equal(steam.canToggle, true);
assert.equal(steam.verdict, 'safe');
assert.equal(steam.slowMs, 11200, 'uses the boot log');
assert.equal(steam.impact, 'high');
assert.equal(steam.procs, 2, 'helpers in the same folder count');
assert.equal(steam.mem, 440e6);

const discord = r.items.find((i) => /discord/i.test(i.name));
assert.equal(discord.on, false, 'StartupApproved 03 = off');
assert.equal(discord.verdict, 'check');

const sec = r.items.find((i) => /security/i.test(i.name));
assert.equal(sec.verdict, 'keep');
assert.equal(sec.needsAdmin, true, 'HKLM needs admin');
assert.equal(sec.procs, 1, 'Windows folder: exact program only, not every svchost');

const g = r.items.find((i) => /google/i.test(i.name));
assert.equal(g.on, false, 'StartupApproved 07 = off');
assert.equal(g.name, 'Google updater');

const sp = by('Spotify');
assert.equal(sp.parts[0].kind, 'folder');
assert.equal(sp.parts[0].canToggle, true);
assert.equal(sp.slowMs, null, 'old boot events are ignored');

assert.equal(r.memory.used, 11e9);
assert.equal(r.apps.find((a) => a.system).name, 'Windows itself');
assert.ok(r.apps.find((a) => a.name === 'Steam').count === 2, 'Steam helpers fold together');
assert.deepEqual(parse({}).items, [], 'empty output does not crash');

console.log('win-parse: all good');
