// macOS: what starts by itself when you log in, and what is using the computer right now.
// Reads only. Turning items off goes through `launchctl disable` in your own login session,
// which is the same switch System Settings > Login Items uses, and `launchctl enable` undoes it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { lookup, niceName, alias } = require('./known');

// Some tools (sfltool) print to stderr when not run in a terminal, so both are kept.
const run = (cmd, args, timeout = 15000, both = false) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (err, out, er) => resolve(String(out || '') + (both ? String(er || '') : '')));
});
const UID = () => (process.getuid ? process.getuid() : 501);
const HOME = os.homedir();
// ps reports CPU per core; divide so 100% means the whole processor, like Task Manager.
const CORES = Math.max(1, os.cpus().length);

// ---------- sfltool dumpbtm: the list System Settings > Login Items shows ----------
function parseBtm(text) {
  const recs = [];
  let uid = null, cur = null;
  for (const line of text.split('\n')) {
    const u = line.match(/Records for UID (-?\d+)/);
    if (u) { uid = Number(u[1]); cur = null; continue; }
    if (/^\s*#\d+:\s*$/.test(line)) { cur = { uid }; recs.push(cur); continue; }
    const m = line.match(/^\s+([A-Za-z. ]+):\s(.*)$/);
    if (cur && m) {
      const k = m[1].trim(), v = m[2].trim();
      if (!(k in cur)) cur[k] = v === '(null)' ? null : v;
    }
  }
  return recs;
}

function plist(file) {
  return run('plutil', ['-convert', 'json', '-o', '-', file], 5000).then((t) => { try { return JSON.parse(t); } catch { return null; } });
}

// "disabled services" overrides in this user's login session.
async function disabledMap() {
  const out = await run('launchctl', ['print-disabled', `gui/${UID()}`]);
  const m = new Map();
  for (const l of out.split('\n')) {
    const x = l.match(/"([^"]+)"\s*=>\s*(true|false|disabled|enabled)/);
    if (x) m.set(x[1], x[2] === 'true' || x[2] === 'disabled');
  }
  return m;
}

const appOf = (p) => { if (!p) return null; const i = p.indexOf('.app/'); return i > 0 ? p.slice(0, i + 4) : (p.endsWith('.app') ? p : null); };
const realHome = (p) => p && p.replace(/^\/Users\/\d+\//, HOME + '/');
const isApple = (label, exe) => /^com\.apple\./.test(label || '') || /^\/(System|usr\/(lib|libexec|sbin)|sbin)\//.test(exe || '');

// ---------- processes, grouped by the app they belong to ----------
async function processes() {
  const out = await run('ps', ['-axo', 'pid=,ppid=,rss=,%cpu=,etime=,comm=']);
  const list = [];
  for (const l of out.split('\n')) {
    const m = l.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(.+)$/);
    if (m) list.push({ pid: +m[1], ppid: +m[2], mem: +m[3] * 1024, cpu: +m[4] / CORES, exe: m[6] });
  }
  return list;
}

function groupApps(procs) {
  const g = new Map();
  for (const p of procs) {
    const app = appOf(p.exe);
    const sys = !app && isApple(null, p.exe) || /^\/System\//.test(app || '');
    const key = sys ? 'macOS' : (app || p.exe);
    let e = g.get(key);
    if (!e) g.set(key, e = { key, name: sys ? 'macOS itself' : niceName(path.basename(app || p.exe)), app: sys ? null : app, exe: p.exe, mem: 0, cpu: 0, count: 0, system: !!sys });
    e.mem += p.mem; e.cpu += p.cpu; e.count++;
  }
  return [...g.values()];
}

// ---------- startup items ----------
async function startupItems(procs) {
  const disabled = await disabledMap();
  // sfltool sometimes comes back without this user's records (seen right after other tools ran); try again.
  let recs = [];
  for (let i = 0; i < 3; i++) {
    const text = await run('sfltool', ['dumpbtm'], 30000, true);
    recs = parseBtm(text).filter((r) => r.uid === UID() || r.uid === -2 || r.uid === 0);
    if (process.env.STARTSHAPER_DEBUG) console.error('sfltool try', i, 'chars', text.length, 'records', recs.length);
    if (recs.some((r) => r.uid === UID())) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  const byId = new Map(recs.map((r) => [r.Identifier, r]));
  const items = new Map();

  const add = async (it) => {
    if (!it.label || items.has(it.label)) return;
    if (isApple(it.label, it.exe)) return;
    items.set(it.label, it);
  };

  // Login items (SMAppService helpers inside apps) and agents/daemons BTM knows about.
  for (const r of recs) {
    const type = r.Type || '';
    if (!/login item|agent|daemon/.test(type)) continue;
    const parent = byId.get(r['Parent Identifier']);
    const parentApp = parent && parent.URL && parent.URL.startsWith('/') ? realHome(parent.URL) : null;
    const label = (r['Bundle Identifier']) || (r.Identifier || '').replace(/^\d+\./, '');
    let plistPath = /\.plist$/.test(r.URL || '') ? realHome(r.URL) : null;
    let exe = realHome(r['Executable Path']);
    const daemon = /daemon/.test(type);
    const kind = /login item/.test(type) ? 'login' : daemon ? 'daemon' : 'agent';
    const assoc = ((r['Assoc. Bundle IDs'] || '').match(/[\w.-]+\.[\w.-]+/) || [])[0];
    const app = parentApp || (assoc && await findApp(assoc)) || appOf(exe);
    await add({ label, kind, plist: plistPath, exe: exe && exe.startsWith('/') ? exe : null, app, team: r['Team Identifier'] || null, btmName: r.Name, dev: r['Developer Name'], btmOn: /\[enabled/.test(r.Disposition || ''), uid: r.uid });
  }

  // Launch agent/daemon files BTM may not list (older macOS, or items added before it migrated).
  const dirs = [[path.join(HOME, 'Library/LaunchAgents'), 'agent'], ['/Library/LaunchAgents', 'agent'], ['/Library/LaunchDaemons', 'daemon']];
  for (const [dir, kind] of dirs) {
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.plist')); } catch { continue; }
    for (const n of names) {
      const file = path.join(dir, n);
      const pl = await plist(file);
      if (!pl) continue;
      const label = pl.Label || n.replace(/\.plist$/, '');
      const args = pl.ProgramArguments || [];
      let exe = pl.Program || args[0] || null;
      // `open -a Foo` / `open /Applications/Foo.app` style agents: the thing they open is what matters.
      if (exe === 'open' || exe === '/usr/bin/open') exe = args.find((a) => /\.app\b/.test(a)) || exe;
      const known = items.get(label);
      if (known) { known.plist = known.plist || file; known.exe = known.exe || exe; known.app = known.app || appOf(exe); known.runAtLoad = !!pl.RunAtLoad || !!pl.KeepAlive; continue; }
      await add({ label, kind, plist: file, exe, app: appOf(exe), runAtLoad: !!pl.RunAtLoad || !!pl.KeepAlive, interval: pl.StartInterval || (pl.StartCalendarInterval ? 'calendar' : null) });
    }
  }

  // Find the app each item belongs to, so it shows a real name and icon.

  // One row per app: Google's three updater agents are one thing to a person.
  const groups = new Map();
  const prefix = (l) => l.split('.').slice(0, 2).join('.');
  const prefixApp = new Map();
  const teamApp = new Map();
  for (const it of items.values()) if (it.app) { if (!prefixApp.has(prefix(it.label))) prefixApp.set(prefix(it.label), it.app); if (it.team && !teamApp.has(it.team)) teamApp.set(it.team, it.app); }
  for (const it of items.values()) if (!it.app) it.app = teamApp.get(it.team) || prefixApp.get(prefix(it.label)) || await findApp(it.label);
  for (const it of items.values()) {
    const key = it.app || prefix(it.label);
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, app: it.app, parts: [] });
    g.parts.push(it);
  }

  const out = [];
  for (const g of groups.values()) {
    const ps = g.parts;
    const mine = procs.filter((p) => (g.app && p.exe.startsWith(g.app + '/')) || ps.some((it) => it.exe && p.exe === it.exe));
    const first = ps.find((it) => it.btmName && !/^(open|\(null\))$/i.test(it.btmName) && !/helper|daemon|agent/i.test(it.btmName));
    const name = alias(ps.map((it) => it.label).join(' ')) || (g.app ? niceName(path.basename(g.app)) : niceName(first ? first.btmName : ps[0].label));
    const k = lookup(name, ...ps.map((it) => it.label), ...ps.map((it) => it.exe), g.app);
    const parts = ps.map((it) => {
      const sysWide = !!(it.plist && it.plist.startsWith('/Library/LaunchDaemons')) || (it.kind === 'daemon' && !it.plist);
      const off = disabled.has(it.label) ? disabled.get(it.label) : it.btmOn === false;
      return { label: it.label, kind: it.kind, plist: it.plist, exe: it.exe, on: !off, canToggle: !sysWide, needsAdmin: sysWide, interval: it.interval || null };
    });
    const kinds = new Set(parts.map((p) => p.kind));
    const what = k.what || (kinds.has('login') ? `Opens ${name} when you log in.` : parts.some((p) => p.interval) ? `Runs a ${name} task in the background every so often.` : `Starts a ${name} helper when you log in.`);
    out.push({
      id: g.key, name, what, type: k.kind, verdict: k.verdict, tip: k.tip, app: g.app,
      parts, on: parts.some((p) => p.on), canToggle: parts.some((p) => p.canToggle), needsAdmin: parts.every((p) => p.needsAdmin),
      running: mine.length > 0, mem: mine.reduce((s, p) => s + p.mem, 0), cpu: mine.reduce((s, p) => s + p.cpu, 0), procs: mine.length,
    });
  }
  return out;
}

// com.native-instruments.NativeAccess.Helper2 -> /Applications/Native Access.app (by bundle id, longest match first)
const appCache = new Map();
async function findApp(label) {
  const parts = String(label).split('.');
  for (let n = parts.length; n >= 3; n--) {
    const id = parts.slice(0, n).join('.').replace(/'/g, '');
    if (!appCache.has(id)) {
      const out = await run('mdfind', [`kMDItemCFBundleIdentifier == '${id}' && kMDItemContentType == 'com.apple.application-bundle'`], 4000);
      const hits = out.split('\n').filter((l) => l.endsWith('.app') && !/\/\.Trash\/|\.app\/.+\.app$/.test(l));
      const best = hits.find((h) => /^\/Applications\//.test(h)) || hits.find((h) => h.startsWith(HOME + '/Applications/')) || hits.sort((a, b) => a.length - b.length)[0] || null;
      appCache.set(id, best);
    }
    if (appCache.get(id)) return appCache.get(id);
  }
  return null;
}

async function memory() {
  const total = os.totalmem();
  const t = await run('vm_stat', []);
  const page = Number((t.match(/page size of (\d+)/) || [])[1] || 16384);
  const get = (k) => Number(((t.match(new RegExp(k + ':\\s+(\\d+)')) || [])[1]) || 0) * page;
  // Same idea as Activity Monitor's "Memory Used": app memory + wired + compressed.
  const used = Math.max(0, get('Anonymous pages') - get('Pages purgeable') + get('Pages wired down') + get('Pages occupied by compressor'));
  return { total, used: used || total - os.freemem() };
}

async function scan() {
  const procs = await processes();
  const [items, mem] = await Promise.all([startupItems(procs), memory()]);
  const boot = await run('sysctl', ['-n', 'kern.boottime']);
  const bootAt = Number((boot.match(/sec = (\d+)/) || [])[1] || 0) * 1000;
  const apps = groupApps(procs).sort((a, b) => b.mem - a.mem);
  return { platform: 'darwin', items, apps, memory: mem, cpus: os.cpus().length, bootAt, bootSeconds: null, at: Date.now() };
}

// ---------- changes ----------
async function setEnabled(item, on) {
  const target = `gui/${UID()}/${item.id}`;
  const r = await new Promise((resolve) => execFile('launchctl', [on ? 'enable' : 'disable', target], { timeout: 8000 }, (err, so, se) => resolve({ ok: !err, error: err ? String(se || err.message).trim() : null })));
  if (!r.ok) return r;
  // Load it again now that it's allowed, so turning it back on works without logging out.
  if (on && item.plist && item.kind === 'agent') await run('launchctl', ['bootstrap', `gui/${UID()}`, item.plist], 8000);
  const now = await disabledMap();
  return { ok: now.get(item.id) === !on || (!now.has(item.id) && on), error: null };
}

module.exports = { scan, setEnabled, parseBtm, groupApps };

if (require.main === module) scan().then((r) => {
  const mb = (b) => (b / 1048576).toFixed(0) + ' MB';
  console.log(`Memory ${mb(r.memory.used)} / ${mb(r.memory.total)}`);
  for (const i of r.items) console.log(`${i.on ? 'ON ' : 'off'} ${i.verdict.padEnd(5)} ${i.name.padEnd(24)} ${mb(i.mem).padStart(8)} ${i.cpu.toFixed(1).padStart(5)}%  ${i.canToggle ? '' : '[admin] '}${i.parts.map((p) => p.kind + ':' + p.label).join(', ')}`);
  console.log('\nTop apps:'); for (const a of r.apps.slice(0, 10)) console.log(`${a.name.padEnd(28)} ${mb(a.mem).padStart(8)} ${a.cpu.toFixed(1).padStart(5)}%  x${a.count}`);
});
