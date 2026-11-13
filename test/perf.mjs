// Frame rate under 4x CPU throttle: start screen, checking animation, scrolling, switching all off.
import { _electron as electron } from 'playwright';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const app = await electron.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '.'], env: { ...process.env, STARTSHAPER_DEMO: '1', STARTSHAPER_USERDATA: fs.mkdtempSync(path.join(os.tmpdir(), 'ss-perf-')) } });
let win; for (let i = 0; i < 100 && !win; i++) { win = app.windows()[0]; if (!win) await new Promise((r) => setTimeout(r, 100)); }
await win.waitForLoadState('domcontentloaded');
const cdp = await win.context().newCDPSession(win);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const fps = async (label, fn, ms = 2000) => {
  await win.evaluate(() => { window.__f = []; const t = (n) => { window.__f.push(n); if (window.__f.length < 2000) requestAnimationFrame(t); }; requestAnimationFrame(t); });
  await fn(); await win.waitForTimeout(ms);
  const f = await win.evaluate(() => window.__f);
  const gaps = f.slice(1).map((x, i) => x - f[i]);
  console.log(label.padEnd(16), 'avg', (1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)).toFixed(0), 'fps, worst frame', Math.max(...gaps).toFixed(0), 'ms');
};
await fps('home idle', async () => {});
await fps('checking', () => win.click('#checkBtn'), 2500);
await win.waitForSelector('#startup.on'); 
await fps('results in', async () => {}, 1500);
await fps('scroll', async () => { for (let i = 0; i < 10; i++) { await win.mouse.move(500, 500); await win.mouse.wheel(0, 140); await win.waitForTimeout(80); } });
await fps('turn off all', () => win.click('#allSafe'), 2500);
await fps('tab switch', () => win.click('#seg button[data-v="now"]'), 1500);
await app.close();
