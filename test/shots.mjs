// Opens the app in demo mode (clicks everything) and in real mode (reads only), saving screenshots.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = new URL('./out/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });

async function open(env) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-test-'));
  const app = await electron.launch({ args: ['.'], env: { ...process.env, STARTSHAPER_USERDATA: userData, ...env } });
  let win;
  for (let i = 0; i < 100 && !win; i++) { win = app.windows()[0]; if (!win) await new Promise((r) => setTimeout(r, 100)); }
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1120, height: 760 }).catch(() => {});
  const errors = [];
  win.on('pageerror', (e) => errors.push(String(e)));
  return { app, win, errors };
}

// ---- demo: the full flow ----
{
  const { app, win, errors } = await open({ STARTSHAPER_DEMO: '1' });
  await win.waitForTimeout(900);
  await win.screenshot({ path: out + '1-home.png' });
  await win.click('#checkBtn');
  await win.waitForTimeout(1200);
  await win.screenshot({ path: out + '2-checking.png' });
  await win.waitForSelector('#startup.on', { timeout: 10000 });
  await win.waitForTimeout(1300);
  await win.screenshot({ path: out + '3-startup.png' });
  assert.match(await win.textContent('#heroTitle'), /94 s/);
  assert.match(await win.textContent('#heroSub'), /6 apps.*41/);
  await win.click('#g-check .row .r-name');
  await win.waitForTimeout(500);
  await win.evaluate(() => document.querySelector('#g-check').scrollIntoView());
  await win.waitForTimeout(400);
  await win.screenshot({ path: out + '3b-open-row.png' });
  assert.equal(await win.locator('#g-check .row.open').count(), 1);
  await win.evaluate(() => { document.querySelector('#stage').scrollTop = 0; });
  await win.click('#allSafe');
  for (let i = 0; i < 80 && (await win.textContent('#changesCount')) !== '6'; i++) await win.waitForTimeout(100);
  await win.waitForTimeout(900);
  await win.screenshot({ path: out + '4-after.png' });
  assert.match(await win.textContent('#tlAfter'), /53 s/);
  assert.equal(await win.textContent('#changesCount'), '6');
  await win.click('#seg button[data-v="now"]');
  await win.waitForTimeout(1100);
  await win.screenshot({ path: out + '5-now.png' });
  await win.click('#seg button[data-v="changes"]');
  await win.waitForTimeout(900);
  await win.screenshot({ path: out + '6-changes.png' });
  await win.click('#undoAll');
  for (let i = 0; i < 80 && !(await win.isHidden('#changesCount')); i++) await win.waitForTimeout(100);
  assert.equal(await win.isHidden('#changesCount'), true);
  assert.deepEqual(errors, []);
  await app.close();
}

// ---- real: read only, never clicks a switch ----
{
  const { app, win, errors } = await open({});
  await win.click('#checkBtn');
  await win.waitForSelector('#startup.on', { timeout: 40000 });
  await win.waitForTimeout(1500);
  await win.screenshot({ path: out + '7-real-startup.png', fullPage: true });
  await win.click('#seg button[data-v="now"]');
  await win.waitForTimeout(1200);
  await win.screenshot({ path: out + '8-real-now.png' });
  assert.deepEqual(errors, []);
  await app.close();
}
console.log('shots: all good ->', out);
