// What common startup items and background apps are, in plain words, and whether it's fine to stop them
// starting by themselves.
//   safe:  fine to turn off. The app still works when you open it.
//   check: fine to turn off if you don't use the feature named in `tip`.
//   keep:  leave it on (security, drivers, keyboard/mouse tools, things that must run to work).
// Matched against the item's name, label and program path, first match wins.

const K = [
  // ---- keep: security, input devices, system helpers ----
  [/malwarebytes|bitdefender|norton|mcafee|avast|avg\b|kaspersky|eset|sophos|windows ?defender|securityhealth|crowdstrike|sentinel/i, 'Antivirus', 'Protects you from malware in the background.', 'keep', 'Security software has to run all the time to work.'],
  [/adguard|little ?snitch|lulu|nordvpn|expressvpn|protonvpn|mullvad|tailscale|wireguard|cloudflare ?warp/i, 'Privacy or VPN tool', 'Filters ads or routes your traffic through a VPN.', 'keep', 'It only protects you while it runs.'],
  [/karabiner|bettertouchtool|logi(tech)?|logioptions|razer|synapse|corsair|icue|steelseries|wacom|hammerspoon|rectangle|magnet|alt-?tab|bartender|keyboard maestro/i, 'Keyboard, mouse or window tool', 'Remaps keys, buttons or windows.', 'keep', 'Your shortcuts and buttons stop working while it is off.'],
  [/realtek|nahimic|waves maxx|dolby|igfx|intel.*graphics|amd.*(radeon|software|noise)|nvidia.*(container|display)|nvbackend|synaptics|elan|touchpad|bluetooth|rtkaud/i, 'Hardware driver helper', 'Part of a driver for sound, graphics or the touchpad.', 'keep', 'Turning it off can break sound, display or touchpad features.'],
  [/switchresx|displaylink|betterdisplay|lunar/i, 'Display tool', 'Controls screen resolution or brightness.', 'keep', 'Your display settings reset while it is off.'],
  [/1password|bitwarden|lastpass|dashlane|keepassxc/i, 'Password manager', 'Fills in your passwords.', 'check', 'Keep it if you like it unlocking with your computer.'],

  // ---- check: useful for some people ----
  [/onedrive|dropbox|google ?drive|googledrivefs|icloud|box ?drive|pcloud|mega ?sync|sync\.com/i, 'Cloud sync', 'Keeps a folder in sync with the cloud.', 'check', 'Turn off only if you don\'t need files synced right away. They sync when you open it.'],
  [/teams|slack|zoom|discord|whatsapp|telegram|signal|messenger|skype/i, 'Chat app', 'Opens your chat app so messages arrive.', 'check', 'Turn off if you don\'t need messages the moment you log in.'],
  [/ollama|lm ?studio/i, 'Local AI runner', 'Runs AI models on your computer.', 'safe', 'It uses lots of memory. It starts again when you open it.'],
  [/native ?access|native-instruments|ilok|izotope|waves ?central|splice|ableton|focusrite/i, 'Music software helper', 'Licences or updates music plugins.', 'check', 'Turn off if you only make music now and then. Some plugins check it on launch.'],
  [/creative ?cloud|adobe|ccxprocess|coresync|agsservice|acrotray|adobe ?gc/i, 'Adobe helper', 'Keeps Adobe apps signed in and updated.', 'check', 'Adobe apps still open without it. Fonts from Adobe Fonts may need it.'],
  [/nvidia ?(app|broadcast|share|geforce)|geforce ?experience|amd ?adrenalin|radeonsoftware/i, 'Graphics card app', 'Game recording, driver updates and overlays.', 'check', 'Your games and display still work without it. You lose the overlay and recording.'],
  [/f\.?lux|night ?shift|caffeine|amphetamine|clipboard|maccy|paste|raycast|alfred|spotlight/i, 'Everyday helper', 'A small tool you probably use all day.', 'check', 'Keep it if you use it every day.'],

  // ---- safe: launchers, updaters, nice-to-haves ----
  [/google ?updater|keystone|googleupdate|googlesoftwareupdate|chrome.*update/i, 'Google updater', 'Checks for Chrome updates.', 'safe', 'Chrome still updates itself whenever you open it.'],
  [/microsoft ?(autoupdate|edge ?update)|msedgeupdate|edgeupdate|mau|officeclicktorun/i, 'Microsoft updater', 'Checks for Office or Edge updates.', 'safe', 'The apps still update when you open them.'],
  [/epic ?games|epicgameslauncher|com\.epicgames/i, 'Epic Games Launcher', 'Opens the Epic launcher when you log in.', 'safe', 'Games still work. Open the launcher when you want to play.'],
  [/steam|valvesoftware/i, 'Steam', 'Opens Steam or its helpers when you log in.', 'safe', 'Open Steam when you want to play. Updates download then.'],
  [/battle\.?net|blizzard|riot ?(client|vanguard)|ea ?app|origin|ubisoft|uplay|gog ?galaxy|rockstar|xbox ?app|gamebar/i, 'Game launcher', 'Opens a game launcher when you log in.', 'safe', 'Open it when you want to play.'],
  [/spotify/i, 'Spotify', 'Opens Spotify when you log in.', 'safe', 'Spotify opens in a second when you click it.'],
  [/itunes ?helper|ipodservice|apple ?music/i, 'iTunes helper', 'Watches for an iPhone or iPod being plugged in.', 'safe', 'iTunes or Apple Devices still finds your phone when you open it.'],
  [/sideloadly|altserver|altstore/i, 'iPhone sideload helper', 'Re-signs apps you sideloaded onto an iPhone.', 'check', 'Keep it if you rely on it to refresh sideloaded apps every week.'],
  [/openai|chatgpt|claude|copilot|gemini/i, 'AI assistant', 'Opens an AI chat app or its shortcut when you log in.', 'safe', 'Open it when you need it.'],
  [/cortana|skype ?bridge|your ?phone|phone ?link|people ?app|widgets/i, 'Windows extra', 'An optional Windows feature that opens on its own.', 'safe', 'Turn it on again any time.'],
  [/crossover|whisky|wine|parallels|vmware|virtualbox/i, 'Windows app runner', 'Helps run Windows apps or virtual machines.', 'safe', 'It starts when you open it.'],
  [/java ?update|jusched|adobe ?arm|acrobat ?update|apple ?software ?update|cc ?updater|update ?scheduler|updater/i, 'Updater', 'Checks for updates to an app.', 'safe', 'Most apps check for updates when you open them.'],
  [/helper|launcher|startup ?helper|login ?helper|agent/i, null, null, 'check', null],
];

function lookup(...texts) {
  const s = texts.filter(Boolean).join(' ');
  for (const [re, kind, what, verdict, tip] of K) if (re.test(s)) return { kind, what, verdict, tip };
  return { kind: null, what: null, verdict: 'check', tip: null };
}

// Turns "com.google.GoogleUpdater.wake" or "steamclean" into something a person would recognise.
function niceName(raw) {
  if (!raw) return 'Unknown item';
  let s = String(raw).replace(/\.(plist|app|exe|lnk)$/i, '');
  if (/^[a-z0-9-]+(\.[A-Za-z0-9_-]+){2,}$/.test(s)) {
    const parts = s.split('.').slice(1).filter((p) => !/^(mac|osx|client|agent\d*|daemon\d*|helper\d*|wake|plist|service|launcher|xpcservice|startuphelper|loginhelper)$/i.test(p));
    s = parts.slice(-1)[0] || s;
    if (/^(apps?|com|io|org)$/i.test(s) && parts.length > 1) s = parts[parts.length - 2];
  }
  s = s.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Names for items whose app can't be found or whose app name says nothing.
const ALIAS = [[/steamclean/i, 'Steam cleanup'], [/google\.keystone|googleupdate/i, 'Google updater'], [/microsoft\.update|autoupdate/i, 'Microsoft AutoUpdate'], [/switchresx/i, 'SwitchResX'], [/adobe\.(acc|ccx|agsservice)/i, 'Adobe Creative Cloud']];
const alias = (s) => { for (const [re, n] of ALIAS) if (re.test(s)) return n; return null; };

module.exports = { lookup, niceName, alias };
