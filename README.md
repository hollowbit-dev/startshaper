# Startshaper

Find out why your PC is slow, in plain words. Startshaper lists the apps that start by themselves,
says what each one is and whether it's safe to switch off, and lets you switch it off. Every change
can be undone with one click. Free, offline, no account, no ads. Windows and Mac.

- **Windows:** reads Windows' own startup timing log, so it can say "Your PC takes 94 s to start.
  These 6 apps add 41 s." Switching an item off writes the same setting Task Manager's Startup tab
  uses; nothing is deleted.
- **Mac:** reads Login Items and background helpers (the same list as System Settings > General >
  Login Items) and switches them off with `launchctl disable`, which `launchctl enable` undoes.
- **No registry tweaks, no "debloat" scripts, no services stopped.** Items that need an admin
  password open the system's own screen instead.

```
npm start          # run
npm run demo       # made-up data for screenshots
npm run scan       # print what this Mac starts (read only)
npm test           # Windows parser with fake data + screenshots
```

MIT licence. Made by Hollowbit Studio, https://hollowbit.dev
