// Launches the built Mac app (dist/mac-arm64) and checks that a real check works. Reads only.
import { _electron as electron } from 'playwright';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
const exe = 'dist/mac-arm64/Startshaper.app/Contents/MacOS/Startshaper';
const app = await electron.launch({ executablePath: exe, env: { ...process.env, STARTSHAPER_USERDATA: fs.mkdtempSync(path.join(os.tmpdir(), 'ss-pk-')) } });
let w; for (let i = 0; i < 100 && !w; i++) { w = app.windows()[0]; if (!w) await new Promise((r) => setTimeout(r, 150)); }
const errs = []; w.on('pageerror', (e) => errs.push(String(e)));
await w.click('#checkBtn');
await w.waitForSelector('#startup.on', { timeout: 40000 });
await w.waitForTimeout(800);
assert.match(await w.textContent('#heroTitle'), /start by themselves|takes/);
assert.ok((await w.locator('.row').count()) > 0);
assert.deepEqual(errs, []);
await app.close();
console.log('packaged: all good');
