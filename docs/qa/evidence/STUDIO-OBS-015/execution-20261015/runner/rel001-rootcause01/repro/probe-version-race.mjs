#!/usr/bin/env node
// REL-001 repro, mechanism probe for H1. No runner code is involved, only the same Chromium launch options
// and the same first steps as launchGuidedBrowser. For each of N fresh launches it measures:
//   - emptyAtRead:  was #profile_path (or #executable_path) still EMPTY when the pre-patch code read it,
//                   i.e. immediately after goto('chrome://version/') resolved?
//   - fillAfterLoadMs: when did the page fill #profile_path, relative to its own `load` event
//                   (positive = filled after load; a positive tail under load is the H1 race window).
//   - waitMs:       how long a reader that waits (patch B) would have waited after goto resolved.
// The in-page observer is an init script (no eval); results travel through DOM attributes that the
// isolated-world locator can read.
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { runner: { type: 'string' }, out: { type: 'string' }, n: { type: 'string', default: '100' }, mode: { type: 'string', default: 'baseline' }, record: { type: 'boolean', default: true } } });
if (!a.runner || !a.out) { console.error('usage: probe-version-race.mjs --runner <dir> --out <file.jsonl> [--n 100] [--mode name] [--no-record]'); process.exit(2); }
for (const k of ['DEBUG', 'PWDEBUG', 'NODE_DEBUG', 'NODE_OPTIONS']) if (process.env[k]) { console.error(`${k} is set; unset it`); process.exit(2); }
const { chromium } = createRequire(join(resolve(a.runner), 'package.json'))('playwright');
const N = Number(a.n), out = resolve(a.out);
const root = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), 'rel001-probe.'));
await mkdir(resolve(out, '..'), { recursive: true });
const write = o => appendFile(out, JSON.stringify(o) + '\n');
await write({ meta: true, event: 'start', startEpochMs: Date.now(), mode: a.mode, n: N, record: a.record });

const INIT = `(() => {
  const mark = (k) => { try { document.documentElement.setAttribute(k, String(performance.now())); } catch {} };
  addEventListener('load', () => mark('data-load-at'));
  let filled = false;
  const check = () => { if (filled) return; const el = document.getElementById('profile_path'); if (el && (el.textContent || '').trim()) { filled = true; mark('data-fill-at'); } };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

for (let i = 0; i < N; i++) {
  const rec = { i, at: new Date().toISOString() };
  const dir = await mkdtemp(join(root, 'p-')); const profile = join(dir, 'profile'), video = join(dir, 'video');
  await mkdir(profile, { mode: 0o700 }); await mkdir(video, { mode: 0o700 });
  let context;
  try {
    const t0 = Date.now();
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, handleSIGINT: false, handleSIGTERM: false, chromiumSandbox: true, args: [], acceptDownloads: false, serviceWorkers: 'block', ...(a.record ? { recordVideo: { dir: video, size: { width: 1280, height: 720 } } } : {}), env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: dir } });
    rec.launchMs = Date.now() - t0;
    const page = context.pages()[0] ?? await context.newPage();
    await page.addInitScript(INIT);
    await page.goto('chrome://version/');
    const tGoto = Date.now();
    const profileText = ((await page.locator('#profile_path').textContent()) ?? '').trim();
    const execText = ((await page.locator('#executable_path').textContent()) ?? '').trim();
    rec.readLatencyMs = Date.now() - tGoto;
    rec.emptyAtRead = profileText === '' || execText === '';
    rec.profileEmpty = profileText === ''; rec.executableEmpty = execText === '';
    const w0 = Date.now();
    try {
      for (const id of ['#profile_path', '#executable_path']) await page.locator(id).filter({ hasText: /\S/u }).waitFor({ state: 'attached', timeout: 10_000 });
      rec.waitMs = Date.now() - w0;
    } catch { rec.waitMs = null; rec.neverFilled = true; }
    const load = Number(await page.locator('html').getAttribute('data-load-at', { timeout: 2000 }).catch(() => null));
    const fill = Number(await page.locator('html').getAttribute('data-fill-at', { timeout: 2000 }).catch(() => null));
    rec.observer = Number.isFinite(load) && Number.isFinite(fill) && load > 0 && fill > 0;
    rec.fillAfterLoadMs = rec.observer ? Number((fill - load).toFixed(1)) : null;
    rec.ok = true;
  } catch (error) {
    rec.ok = false; rec.errorName = error?.name; rec.errorHead = String(error?.message).split('\n')[0].slice(0, 160);
  } finally {
    await Promise.race([context?.close().catch(() => undefined), new Promise(r => setTimeout(r, 20_000))]);
    await rm(dir, { recursive: true, force: true });
  }
  await write(rec);
  if ((i + 1) % 25 === 0) process.stderr.write(`[probe ${a.mode}] ${i + 1}/${N}\n`);
}
await write({ meta: true, event: 'end', endEpochMs: Date.now() });
await rm(root, { recursive: true, force: true });
