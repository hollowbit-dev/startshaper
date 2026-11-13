// Windows: what starts with Windows, how much it slows startup, and what is using the PC right now.
// Reading is done by one PowerShell script that prints raw facts as JSON; everything else happens in
// parse() below, so it can be tested with made-up data on any computer.
//
// Turning an item off writes the same "StartupApproved" value Task Manager's Startup tab writes, so the
// entry itself is never deleted and Task Manager shows it as Disabled. Turning it on writes it back.
const path = require('path');
const { execFile } = require('child_process');
const { lookup, niceName, alias } = require('./known');

const READ_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$out = @{ run = @(); folders = @(); approved = @{}; procs = @(); boot = @(); slow = @(); mem = @{} }
function ExeOf($c) { if ($c -match '^\s*"([^"]+)"') { return $Matches[1] }; if ($c -match '^\s*(.+?\.exe)') { return $Matches[1] }; return ($c -split ' ')[0] }
function Desc($p) { try { $v = (Get-Item -LiteralPath $p).VersionInfo; if ($v.FileDescription) { return $v.FileDescription } else { return $v.ProductName } } catch { return $null } }
foreach ($k in @(@('HKCU','Software\Microsoft\Windows\CurrentVersion\Run','Run'), @('HKLM','Software\Microsoft\Windows\CurrentVersion\Run','Run'), @('HKLM','Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run','Run32'))) {
  $key = Get-Item -LiteralPath ($k[0] + ':\' + $k[1])
  if ($key) { foreach ($n in $key.GetValueNames()) { if ($n -eq '') { continue }; $c = [string]$key.GetValue($n); $e = [Environment]::ExpandEnvironmentVariables((ExeOf $c)); $out.run += @{ hive = $k[0]; set = $k[2]; name = $n; cmd = $c; exe = $e; desc = (Desc $e) } } }
}
$sh = New-Object -ComObject WScript.Shell
foreach ($f in @(@('HKCU', [Environment]::GetFolderPath('Startup')), @('HKLM', [Environment]::GetFolderPath('CommonStartup')))) {
  Get-ChildItem -LiteralPath $f[1] -File | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object {
    $t = $_.FullName; if ($_.Extension -eq '.lnk') { $t = $sh.CreateShortcut($_.FullName).TargetPath }
    $out.folders += @{ hive = $f[0]; name = $_.Name; path = $_.FullName; exe = $t; desc = (Desc $t) }
  }
}
foreach ($h in 'HKCU','HKLM') { foreach ($s in 'Run','Run32','StartupFolder') {
  $key = Get-Item -LiteralPath ($h + ':\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\' + $s)
  $m = @{}; if ($key) { foreach ($n in $key.GetValueNames()) { $b = $key.GetValue($n); if ($b -is [byte[]] -and $b.Length) { $m[$n] = [int]$b[0] } } }
  $out.approved[$h + '\' + $s] = $m
} }
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$out.lastBoot = if ($boot) { [long](($boot.ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds) } else { $null }
# CPU right now = CPU time used over one second, as a share of all cores (like Task Manager).
$first = @{}; Get-Process | ForEach-Object { $first[$_.Id] = $_.CPU }; Start-Sleep -Milliseconds 1000
$cores = [Environment]::ProcessorCount
Get-Process | ForEach-Object {
  $now = 0; if ($first.ContainsKey($_.Id) -and $_.CPU -ne $null -and $first[$_.Id] -ne $null) { $now = ($_.CPU - $first[$_.Id]) * 100 / $cores }
  $st = $null; try { $st = [long](($_.StartTime.ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds) } catch {}
  $out.procs += @{ id = $_.Id; name = $_.ProcessName; path = $_.Path; mem = $_.WorkingSet64; cpu = $_.CPU; now = $now; start = $st; desc = $_.Description }
}
$os = Get-CimInstance Win32_OperatingSystem
$out.mem = @{ total = [long]$os.TotalVisibleMemorySize * 1024; free = [long]$os.FreePhysicalMemory * 1024 }
$out.cpus = [Environment]::ProcessorCount
# Windows times every startup and names the apps that slowed it down. Reading this log may need admin.
Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; Id = 100, 101 } -MaxEvents 200 | ForEach-Object {
  $d = @{}; ([xml]$_.ToXml()).Event.EventData.Data | ForEach-Object { $d[$_.Name] = $_.'#text' }
  $t = [long](($_.TimeCreated.ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds)
  if ($_.Id -eq 100) { $out.boot += @{ at = $t; total = [long]$d.BootTime; main = [long]$d.MainPathBootTime; post = [long]$d.BootPostBootTime } }
  else { $out.slow += @{ at = $t; name = $d.Name; friendly = $d.FriendlyName; total = [long]$d.TotalTime; degradation = [long]$d.DegradationTime } }
}
$out | ConvertTo-Json -Depth 5 -Compress
`;

// Turning on/off. The item's details arrive as JSON in an environment variable, never pasted into code.
const SET_PS = String.raw`
$ErrorActionPreference = 'Stop'
$a = $env:STARTSHAPER_ARG | ConvertFrom-Json
$k = $a.hive + ':\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\' + $a.set
if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }
$v = [byte[]](0,0,0,0,0,0,0,0,0,0,0,0)
if ($a.on) { $v[0] = 2 } else { $v[0] = 3; [BitConverter]::GetBytes([DateTime]::Now.ToFileTime()).CopyTo($v, 4) }
Set-ItemProperty -LiteralPath $k -Name $a.name -Value $v -Type Binary
'ok'
`;

function ps(script, env = {}, timeout = 60000) {
  const enc = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc],
      { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: { ...process.env, ...env } },
      (err, out, er) => resolve({ ok: !err, out: String(out || ''), error: err ? String(er || err.message).trim() : null }));
  });
}

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const lower = (s) => String(s || '').toLowerCase();
const winDir = (p) => /^[a-z]:\\windows\\/i.test(p || '');

// C:\Program Files (x86)\Steam\bin\cef\x.exe -> c:\program files (x86)\steam (one app = one folder)
function appFolder(p) {
  const l = lower(p);
  const m = l.match(/^([a-z]:\\program files( \(x86\))?\\[^\\]+)\\/) || l.match(/^([a-z]:\\users\\[^\\]+\\appdata\\(local|roaming)\\(programs\\)?[^\\]+)\\/);
  return m ? m[1] : lower(path.win32.dirname(p));
}

// Raw facts from READ_PS -> the same shape the Mac side returns.
function parse(raw) {
  const approved = raw.approved || {};
  const procs = arr(raw.procs).filter((p) => p && p.path).map((p) => ({ ...p, mem: Number(p.mem) || 0, cpu: Number(p.cpu) || 0, now: Math.max(0, Number(p.now) || 0) }));
  const bootAt = raw.lastBoot || null;
  const boots = arr(raw.boot).sort((a, b) => b.at - a.at);
  // Only the latest few startups count, so an app that slowed things down once two years ago doesn't.
  const recent = boots.slice(0, 5);
  const since = recent.length ? recent[recent.length - 1].at - 60000 : 0;
  const slow = new Map();
  for (const s of arr(raw.slow)) {
    if (s.at < since) continue;
    const k = lower(path.win32.basename(s.name || ''));
    const prev = slow.get(k);
    if (!prev || s.at > prev.at) slow.set(k, s);
  }

  const entries = [
    ...arr(raw.run).map((r) => ({ src: 'run', hive: r.hive, set: r.set, name: r.name, exe: r.exe, desc: r.desc, cmd: r.cmd })),
    ...arr(raw.folders).map((f) => ({ src: 'folder', hive: f.hive, set: 'StartupFolder', name: f.name, exe: f.exe, desc: f.desc, file: f.path })),
  ];

  const groups = new Map();
  for (const e of entries) {
    const b = (approved[`${e.hive}\\${e.set}`] || {})[e.name];
    const on = b === undefined ? true : b % 2 === 0; // 2/6 = on, 3/7 = off (what Task Manager writes)
    const exe = e.exe || '';
    const key = lower(exe) || lower(e.name);
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, exe, desc: e.desc, parts: [] });
    g.parts.push({ label: e.name, kind: e.src, hive: e.hive, set: e.set, on, canToggle: e.hive === 'HKCU', needsAdmin: e.hive !== 'HKCU', cmd: e.cmd || e.file });
  }

  const items = [];
  for (const g of groups.values()) {
    const dir = appFolder(g.exe);
    const mine = procs.filter((p) => lower(p.path) === lower(g.exe) || (!winDir(g.exe) && dir.length > 3 && lower(p.path).startsWith(dir + '\\')));
    const label = g.parts[0].label;
    const name = alias(label + ' ' + g.exe) || (g.desc && g.desc.length < 40 ? g.desc : null) || niceName(label.replace(/\.lnk$/i, '')) || niceName(path.win32.basename(g.exe));
    const k = lookup(name, label, g.exe);
    const s = slow.get(lower(path.win32.basename(g.exe)));
    // Without the startup log, guess from how much CPU the app used in the minutes after startup.
    const early = mine.filter((p) => bootAt && p.start && p.start - bootAt < 180000);
    const earlyCpu = early.reduce((t, p) => t + p.cpu, 0);
    const impact = s ? (s.degradation > 3000 ? 'high' : s.degradation > 1000 ? 'medium' : 'low')
      : !mine.length ? null : earlyCpu > 10 || mine.reduce((t, p) => t + p.mem, 0) > 300e6 ? 'high' : earlyCpu > 2 ? 'medium' : 'low';
    items.push({
      id: g.key, name, what: k.what || `Starts ${name} when Windows starts.`, type: k.kind, verdict: k.verdict, tip: k.tip,
      exe: g.exe, app: null, parts: g.parts,
      on: g.parts.some((p) => p.on), canToggle: g.parts.some((p) => p.canToggle), needsAdmin: g.parts.every((p) => p.needsAdmin),
      running: mine.length > 0, mem: mine.reduce((t, p) => t + p.mem, 0), cpu: mine.reduce((t, p) => t + p.now, 0), cpuSeconds: mine.reduce((t, p) => t + p.cpu, 0), procs: mine.length,
      slowMs: s ? s.degradation : null, impact,
    });
  }

  // Processes grouped by program, for the "Right now" view.
  const apps = new Map();
  for (const p of procs) {
    const sys = winDir(p.path);
    const key = sys ? 'windows' : lower(p.path);
    let a = apps.get(key);
    if (!a) apps.set(key, a = { key, name: sys ? 'Windows itself' : (p.desc && p.desc.length < 40 ? p.desc : niceName(p.name)), exe: sys ? null : p.path, mem: 0, cpu: 0, count: 0, system: sys });
    a.mem += p.mem; a.cpu += p.now; a.count++;
  }
  // Same program, several helpers in one folder (Chrome, Steam, Teams): fold them together by folder.
  const byDir = new Map();
  for (const a of apps.values()) {
    const k = a.system ? 'windows' : appFolder(a.exe);
    const b = byDir.get(k);
    if (!b) byDir.set(k, a); else { b.mem += a.mem; b.cpu += a.cpu; b.count += a.count; }
  }

  const last = recent[0] || null;
  return {
    platform: 'win32', items, apps: [...byDir.values()].sort((a, b) => b.mem - a.mem),
    memory: { total: Number(raw.mem && raw.mem.total) || 0, used: Math.max(0, (Number(raw.mem && raw.mem.total) || 0) - (Number(raw.mem && raw.mem.free) || 0)) },
    cpus: raw.cpus || null, bootAt,
    bootSeconds: last ? Math.round(last.total / 1000) : null,
    bootHistory: recent.map((b) => ({ at: b.at, seconds: Math.round(b.total / 1000) })),
    at: Date.now(),
  };
}

async function scan() {
  const r = await ps(READ_PS);
  let raw = {};
  try { raw = JSON.parse(r.out.trim() || '{}'); } catch { raw = {}; }
  return parse(raw);
}

async function setEnabled(item, on) {
  const parts = item.parts.filter((p) => p.canToggle);
  for (const p of parts) {
    const r = await ps(SET_PS, { STARTSHAPER_ARG: JSON.stringify({ hive: p.hive, set: p.set, name: p.label, on }) }, 20000);
    if (!r.ok || !/ok/.test(r.out)) return { ok: false, error: r.error || 'Windows did not accept the change' };
  }
  return { ok: true };
}

module.exports = { scan, setEnabled, parse, READ_PS, SET_PS };
