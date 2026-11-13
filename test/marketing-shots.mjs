// Website screenshots, taken in demo mode (made-up apps), at 2x, saved as WebP for hollowbit.dev.
import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const DEST = process.env.HOME + '/Desktop/Hollowbit/assets/img';
const app = await electron.launch({ args: ['--force-device-scale-factor=2', '.'], env: { ...process.env, STARTSHAPER_DEMO: '1', STARTSHAPER_USERDATA: fs.mkdtempSync(path.join(os.tmpdir(), 'ss-mk-')) } });
let w; for (let i = 0; i < 100 && !w; i++) { w = app.windows()[0]; if (!w) await new Promise((r) => setTimeout(r, 200)); }
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 814));
await w.waitForTimeout(1800);
fs.mkdirSync('test/out', { recursive: true });
const shot = async (name) => {
  await w.mouse.move(5, 300);
  await w.waitForTimeout(250);
  await w.screenshot({ path: `test/out/${name}.png` });
  execFileSync('cwebp', ['-q', '86', '-quiet', `test/out/${name}.png`, '-o', `${DEST}/${name}.webp`]);
  console.log('saved', name);
};
await shot('startshaper-home');
await w.click('#checkBtn');
await w.waitForSelector('#startup.on');
await w.waitForTimeout(1800);
await shot('startshaper-app');
await w.click('#g-check .row .r-name');
await w.waitForTimeout(400);
await w.evaluate(() => { const s = document.querySelector('#stage'); s.scrollTop = document.querySelector('#g-safe').offsetTop - 30; });
await w.waitForTimeout(700);
await shot('startshaper-advice');
await w.evaluate(() => { document.querySelector('#stage').scrollTop = 0; });
await w.click('#allSafe');
for (let i = 0; i < 80 && (await w.textContent('#changesCount')) !== '6'; i++) await w.waitForTimeout(100);
await w.waitForTimeout(1200);
await shot('startshaper-after');
await w.click('#seg button[data-v="now"]'); await w.waitForTimeout(1400);
await shot('startshaper-now');
await app.close();
