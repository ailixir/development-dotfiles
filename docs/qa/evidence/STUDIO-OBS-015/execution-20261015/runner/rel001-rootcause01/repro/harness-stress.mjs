#!/usr/bin/env node
// REL-001 repro harness: the guided start path with a REAL Chromium, N times.
//
// Each iteration does what production does for a context push, minus HTTP: GuidedOwnership.assign, then
// GuidedOwnership.context -> GuidedRuntime.start -> launchGuidedBrowser (recorded context: version probe,
// startup page close, video delete, fresh app page, route, CDP blank document) -> withhold -> blank match
// -> bootstrap-evidence callback. A failure is rendered with the same describeStartFailure the transport
// uses, so the line is exactly what the patched worker would write to stderr.
//
// Only needs: --runner <scratch studio-runner dir with dist-repro built>, --out <jsonl>.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, rm, appendFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir, loadavg, freemem, release } from 'node:os';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: {
  runner: { type: 'string' }, out: { type: 'string' },
  n: { type: 'string', default: '100' }, concurrency: { type: 'string', default: '1' },
  'hold-ms': { type: 'string', default: '1500' }, 'gap-ms': { type: 'string', default: '0' },
  'iteration-timeout-ms': { type: 'string', default: '90000' },
  mode: { type: 'string', default: 'baseline' }, variant: { type: 'string', default: 'a' },
  'inject-lag-ms': { type: 'string', default: '0' },
} });
if (!a.runner || !a.out) { console.error('usage: harness-stress.mjs --runner <dir> --out <file.jsonl> [--n 100] [--concurrency 1] [--hold-ms 1500] [--mode name] [--variant a|ab] [--inject-lag-ms 0]'); process.exit(2); }
for (const k of ['DEBUG', 'PWDEBUG', 'NODE_DEBUG', 'NODE_OPTIONS']) if (process.env[k]) { console.error(`${k} is set; launchGuidedBrowser refuses it`); process.exit(2); }
const N = Number(a.n), C = Number(a.concurrency), HOLD = Number(a['hold-ms']), GAP = Number(a['gap-ms']), TIMEOUT = Number(a['iteration-timeout-ms']), LAG = Number(a['inject-lag-ms']);
const runner = resolve(a.runner), out = resolve(a.out), rawOut = out.replace(/\.jsonl$/u, '') + '.raw.jsonl';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const imp = rel => import(pathToFileURL(join(runner, rel)).href);

const [{ GuidedOwnership }, { launchGuidedBrowser }, diag, helpers, pw] = await Promise.all([
  imp('dist-repro/src/guided/ownership.js'), imp('dist-repro/src/run/browser.js'), imp('dist-repro/src/guided/diagnostics.js'),
  imp('dist-repro/test/helpers/guided.js'), imp('node_modules/playwright/index.mjs'),
]);
if (typeof diag.describeStartFailure !== 'function') { console.error('patch A is not in this build (describeStartFailure missing)'); process.exit(2); }
const { describeStartFailure } = diag;

// Positive control: make the version page fill its fields LAG ms after load, as a slow browser would.
// Variant a must then fail PROFILE_PREFERENCES_REQUIRED at PROBE every time; variant ab must pass.
if (LAG > 0) {
  const original = pw.chromium.launchPersistentContext.bind(pw.chromium); let patched = false;
  pw.chromium.launchPersistentContext = async (...args) => {
    const context = await original(...args);
    if (!patched) {
      patched = true;
      const proto = Object.getPrototypeOf(context.pages()[0]); const goto = proto.goto;
      proto.goto = async function (url, ...rest) {
        const response = await goto.call(this, url, ...rest);
        if (typeof url === 'string' && url.startsWith('chrome://version')) {
          for (const id of ['profile_path', 'executable_path']) {
            await this.locator('#' + id).evaluate((el, ms) => new Promise(resolve => {
              const poll = () => { const v = el.textContent ?? ''; if (v.trim()) { el.textContent = ''; setTimeout(() => { el.textContent = v; }, ms); resolve(true); } else setTimeout(poll, 5); };
              poll();
            }), LAG);
          }
        }
        return response;
      };
    }
    return context;
  };
}

const tmpRoot = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), 'rel001-harness.'));
await writeFile(join(tmpRoot, '.rel001-owned'), '');
const write = (file, obj) => appendFile(file, JSON.stringify(obj) + '\n');
await mkdir(resolve(out, '..'), { recursive: true });
const startEpochMs = Date.now();
await write(out, { meta: true, event: 'start', startEpochMs, node: process.version, os: release(), mode: a.mode, variant: a.variant, n: N, concurrency: C, holdMs: HOLD, injectLagMs: LAG, loadavg: loadavg(), tmpRoot, playwright: (await import(pathToFileURL(join(runner, 'node_modules/playwright-core/package.json')).href, { with: { type: 'json' } })).default.version });

async function once(i) {
  const rec = { i, at: new Date().toISOString(), loadavg1: Number(loadavg()[0].toFixed(2)), freememMB: Math.round(freemem() / 1048576) };
  const workDir = await mkdtemp(join(tmpRoot, 'it-'));
  const context = helpers.guidedContext('https://example.test');
  const grant = helpers.ownershipSession(context), assignment = helpers.assignmentFor(context);
  const t0 = Date.now(), tl = {}, events = []; let readyAt = null;
  const recorder = { async open() {
    const dir = join(workDir, 'video'); await mkdir(dir, { mode: 0o700 }); let requested = false;
    return { launchRequest() { if (requested) return null; requested = true; return { dir, size: { width: 1280, height: 720 }, ready: () => { readyAt = Date.now() - t0; } }; },
      settle: () => Promise.resolve('UNAVAILABLE'), begin: () => null, get clock() { return null; } };
  } };
  const ownership = new GuidedOwnership({
    workerId: context.workerId, journalDirectory: join(workDir, 'journal'), capacity: 1, recorder, csiId: 'CSI-REPRO', diagnosticStderr: () => undefined,
    launch: async (config, contextId, onLost, recording) => { tl.launchStart = Date.now(); try { return await launchGuidedBrowser(config, contextId, onLost, recording); } finally { tl.launchEnd = Date.now(); } },
    callback: route => { events.push([route, Date.now() - t0]); return Promise.resolve(); },
    claim: () => Promise.resolve({ ...structuredClone(grant), owner: { ...grant.owner, leaseExpiresAt: new Date(Math.min(Date.now() + 30_000, Date.parse(grant.expiresAt))).toISOString() } }),
  });
  const body = async () => {
    try {
      await ownership.assign(assignment);
      tl.contextStart = Date.now();
      await ownership.context(context);
      rec.ok = true; rec.contextMs = Date.now() - tl.contextStart;
      await sleep(HOLD);
    } catch (error) {
      rec.ok = false;
      const operation = tl.contextStart ? 'context' : 'assign';
      const line = describeStartFailure(error, { operation, sessionId: context.sessionId, elapsedMs: Date.now() - (tl.contextStart ?? t0) });
      rec.line = line.trim();
      try { rec.facts = JSON.parse(rec.line.slice('GUIDED_START_FAILED '.length)); } catch { /* keep the line */ }
      await write(rawOut, { i: rec.i, name: error?.name, message: String(error?.message).slice(0, 400), causeChain: (() => { const c = []; for (let e = error; e && c.length < 6; e = e.cause) c.push({ name: e.name, message: String(e.message).slice(0, 400), phase: e.phase ?? null, loss: e.loss ?? null }); return c; })() });
    }
  };
  let timer; const timedOut = new Promise(r => { timer = setTimeout(() => r('timeout'), TIMEOUT); });
  const result = await Promise.race([body().then(() => 'done'), timedOut]); clearTimeout(timer);
  if (result === 'timeout') {
    rec.ok = false; rec.hang = true;
    const runtime = ownership.entries?.get(context.sessionId)?.runtime;   // private in TS, plain property at runtime
    rec.hangFacts = runtime ? runtime.startFailure : null;
  }
  const closed = await Promise.race([ownership.close().then(() => 'ok', () => 'error'), sleep(20_000).then(() => 'hung')]);
  rec.close = closed;
  rec.launchMs = tl.launchStart && tl.launchEnd ? tl.launchEnd - tl.launchStart : null;
  rec.recordingReadyMs = readyAt; rec.bootstrapMs = events.find(e => e[0] === 'bootstrap-evidence')?.[1] ?? null; rec.wallMs = Date.now() - t0;
  await rm(workDir, { recursive: true, force: true });
  await write(out, rec);
  return rec;
}

let next = 0, failed = 0, done = 0;
async function worker() {
  for (;;) {
    const i = next++; if (i >= N) return;
    const r = await once(i); done++; if (!r.ok) failed++;
    if (done % 10 === 0 || !r.ok) process.stderr.write(`[${a.mode}/${a.variant}] ${done}/${N} done, ${failed} failed\n`);
    if (GAP) await sleep(GAP);
  }
}
await Promise.all(Array.from({ length: C }, worker));
await write(out, { meta: true, event: 'end', endEpochMs: Date.now(), done, failed });
await rm(tmpRoot, { recursive: true, force: true });
process.exit(0);
