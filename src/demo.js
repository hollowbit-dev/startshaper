// Made-up results for screenshots and videos (STARTSHAPER_DEMO=1). Nothing real is read or changed.
const MB = 1048576;
const boot = Date.now() - 3 * 3600e3;

const I = (name, verdict, type, what, tip, slow, mem, cpu, extra = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, '-'), name, what, type, verdict, tip,
  app: null, exe: `C:\\Program Files\\${name}\\${name.replace(/\W/g, '')}.exe`,
  parts: [{ label: name, kind: 'run', hive: 'HKCU', set: 'Run', on: true, canToggle: true, needsAdmin: false }],
  on: true, canToggle: true, needsAdmin: false, running: mem > 0, mem: mem * MB, cpu, procs: mem ? 3 : 0,
  slowMs: slow * 1000, impact: slow > 3 ? 'high' : slow > 1 ? 'medium' : 'low', ...extra,
});

function scan() {
  const items = [
    I('Steam', 'safe', 'Steam', 'Opens Steam or its helpers when you log in.', 'Open Steam when you want to play. Updates download then.', 11.2, 446, 0.6),
    I('Epic Games Launcher', 'safe', 'Epic Games Launcher', 'Opens the Epic launcher when you log in.', 'Games still work. Open the launcher when you want to play.', 9.1, 312, 1.4),
    I('Battle.net', 'safe', 'Game launcher', 'Opens a game launcher when you log in.', 'Open it when you want to play.', 7.6, 268, 0.3),
    I('Spotify', 'safe', 'Spotify', 'Opens Spotify when you log in.', 'Spotify opens in a second when you click it.', 6.4, 221, 0.9),
    I('Copilot', 'safe', 'AI assistant', 'Opens an AI chat app or its shortcut when you log in.', 'Open it when you need it.', 4.4, 164, 0.2),
    I('Google updater', 'safe', 'Google updater', 'Checks for Chrome updates.', 'Chrome still updates itself whenever you open it.', 2.3, 18, 0),
    I('Discord', 'check', 'Chat app', 'Opens your chat app so messages arrive.', 'Turn off if you don\'t need messages the moment you log in.', 8.4, 389, 1.1),
    I('OneDrive', 'check', 'Cloud sync', 'Keeps a folder in sync with the cloud.', 'Turn off only if you don\'t need files synced right away. They sync when you open it.', 4.0, 96, 0.4),
    I('Adobe Creative Cloud', 'check', 'Adobe helper', 'Keeps Adobe apps signed in and updated.', 'Adobe apps still open without it. Fonts from Adobe Fonts may need it.', 5.2, 410, 0.8),
    I('NVIDIA App', 'check', 'Graphics card app', 'Game recording, driver updates and overlays.', 'Your games and display still work without it. You lose the overlay and recording.', 3.1, 152, 0.3),
    I('Razer Synapse', 'keep', 'Keyboard, mouse or window tool', 'Remaps keys, buttons or windows.', 'Your shortcuts and buttons stop working while it is off.', 2.8, 140, 0.2),
    I('Windows Security', 'keep', 'Antivirus', 'Protects you from malware in the background.', 'Security software has to run all the time to work.', 0.4, 12, 0, { canToggle: false, needsAdmin: true }),
    I('Realtek Audio Console', 'keep', 'Hardware driver helper', 'Part of a driver for sound, graphics or the touchpad.', 'Turning it off can break sound, display or touchpad features.', 0.9, 24, 0, { canToggle: false, needsAdmin: true }),
  ];
  const apps = [
    { key: 'chrome', name: 'Google Chrome', mem: 3120 * MB, cpu: 6.2, count: 27 },
    { key: 'windows', name: 'Windows itself', mem: 2840 * MB, cpu: 3.1, count: 182, system: true },
    { key: 'steam', name: 'Steam', mem: 446 * MB, cpu: 0.6, count: 4 },
    { key: 'cc', name: 'Adobe Creative Cloud', mem: 410 * MB, cpu: 0.8, count: 6 },
    { key: 'discord', name: 'Discord', mem: 389 * MB, cpu: 1.1, count: 5 },
    { key: 'epic', name: 'Epic Games Launcher', mem: 312 * MB, cpu: 1.4, count: 3 },
    { key: 'bnet', name: 'Battle.net', mem: 268 * MB, cpu: 0.3, count: 3 },
    { key: 'spotify', name: 'Spotify', mem: 221 * MB, cpu: 0.9, count: 4 },
    { key: 'teams', name: 'Microsoft Teams', mem: 590 * MB, cpu: 2.4, count: 6 },
  ].map((a) => ({ exe: null, system: false, ...a })).sort((a, b) => b.mem - a.mem);
  return new Promise((r) => setTimeout(() => r({
    platform: 'win32', demo: true, items, apps,
    memory: { total: 16 * 1024 * MB, used: 11.6 * 1024 * MB }, cpus: 8, bootAt: boot,
    bootSeconds: 94, bootHistory: [94, 91, 97, 88, 93].map((s, i) => ({ at: boot - i * 86400e3, seconds: s })),
    at: Date.now(),
  }), 1400));
}

module.exports = { scan, setEnabled: async () => ({ ok: true }) };
