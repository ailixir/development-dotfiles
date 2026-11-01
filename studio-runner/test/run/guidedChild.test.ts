/**
 * SC008-E15 — the per-session guided child, against REAL forked processes: the production proxy (`createGuidedChildLauncher`), the real
 * IPC protocol, the real validator and the real process-tree kill. Only the browser is fake: `test/helpers/guidedChildStub.mjs` serves the BUILT
 * `serveGuidedChild` (dist) over a fake page, so no Chromium is needed. Needs `dist/` (pnpm run build); it is not rebuilt here.
 *
 * What this file shows (AC1, AC2, AC3, AC5, AC8 ordering):
 *   - a step that busy-loops in one session is killed by the proxy deadline and ends only that session, grandchild and temp dir included;
 *   - the child's spawn request, `process.env` and `process.argv` carry none of the server's identity, TLS or object-store names or values;
 *   - a secret value reaches only its own session's child, only inside the dispatching step message, and is read only after the fence ack;
 *   - the lifecycle ends (stop, loss, launch failure, hostile frame, IPC disconnect) kill exactly the right tree;
 *   - close ordering and the 4.8 s stop bound.
 *
 * NAMED RESIDUAL R-1b, NOT closed by this work item and NOT proved by anything here. The child runs as the same uid as the server in one PID
 * namespace. Escaped step code (the Function-constructor route is an accepted named risk) can therefore still read: the mounted credential
 * files (TLS key, object-store credentials); `/proc/<server pid>/environ` (the server's initial environment, including
 * STUDIO_RUNNER_SERVICE_IDENTITY and STUDIO_RUNNER_CALLBACK_IDENTITY, which `process.env` changes do not alter); other sessions'
 * `/proc/<pid>/mem` and `process_vm_readv` where the node does not enforce ptrace_scope or non-dumpable (the chart sets none); and other
 * sessions' Chromium profile, recording and scratch files (a 0700 per-session TMPDIR does not separate processes of one uid). This is inferred
 * from Linux semantics, not probed. The AC2 claim is limited to the child's process.env, process.argv and spawn request; the child is NOT a
 * confidentiality boundary against a deliberate escape. Closing R-1b needs a uid or container split (out of scope, user decision).
 */
// eslint-disable-next-line no-restricted-imports -- the one test that closes a child's IPC channel itself (the production spawner exposes no disconnect); nothing derived from an artifact reaches it, and the fixed stub is the only module forked
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ALLOW_ALL_DOMAINS_ENV_KEY, ALLOWED_DOMAINS_ENV_KEY } from '../../src/allowedDomains.js';
import { GuidedLaunchFailure } from '../../src/run/guidedBrowser.js';
import type { GuidedBrowser, GuidedLossReason, GuidedStepHooks, GuidedStepRequest } from '../../src/run/guidedBrowser.js';
import { createGuidedChildLauncher } from '../../src/run/guidedChildLauncher.js';
import type { GuidedChildLauncherOptions } from '../../src/run/guidedChildLauncher.js';
import { createForkSpawner } from '../../src/run/launcher.js';
import type { ChildProcessHandle, ChildSpawnRequest, ChildSpawner } from '../../src/run/launcher.js';
import type { ObservationConfig } from '../../src/run/observationTypes.js';
import { isAlive } from '../../src/run/tree.js';
import { coordinate, operation } from '../helpers/stepFakes.js';

const STUB = fileURLToPath(new URL('../helpers/guidedChildStub.mjs', import.meta.url));
const ORIGIN = 'https://orders.example.test';
/** The session of the contract fixture the stub observes: the server checks every observation against it. */
const CONFIG: ObservationConfig = { sessionId: 'session-1', scopeHash: 'c492d7554d0bf7482f4e9afee2054800284d407483891e8b91c7fc985803b01c', allowedDomains: ['a.example.test', 'b.example.test'], knownSecrets: [] };

/** What the server process holds: the allow-listed variables, and everything the child must never see. */
const PARENT_ENV = {
  PATH: '/usr/bin', HOME: '/home/runner', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright', DISPLAY: ':99', XDG_RUNTIME_DIR: '/run/user/1000',
  STUDIO_RUNNER_SERVICE_IDENTITY: 'svc-identity-CANARY', STUDIO_RUNNER_CALLBACK_IDENTITY: 'cb-identity-CANARY',
  STUDIO_RUNNER_TLS_KEY_FILE: '/etc/tls/CANARY-tls.key', STUDIO_RUNNER_TLS_CERT_FILE: '/etc/tls/CANARY-tls.crt',
  AWS_SECRET_ACCESS_KEY: 'object-store-secret-CANARY', AWS_ACCESS_KEY_ID: 'object-store-key-CANARY',
  NODE_OPTIONS: '--max-old-space-size=64', LD_PRELOAD: '/tmp/CANARY.so', DYLD_INSERT_LIBRARIES: '/tmp/CANARY.dylib', OPENSSL_CONF: '/tmp/CANARY.cnf',
};
const CANARIES = ['svc-identity-CANARY', 'cb-identity-CANARY', 'CANARY-tls', 'object-store-secret-CANARY', 'object-store-key-CANARY', 'STUDIO_RUNNER_SERVICE_IDENTITY', 'STUDIO_RUNNER_CALLBACK_IDENTITY', 'STUDIO_RUNNER_TLS', 'AWS_', 'CANARY'];

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
/**
 * The fork spawner finds a browser it must kill from its own 25 ms process-table samples. Production kills long after Chromium started; a stub
 * that kills at once after launch would race the sampler, so tests that kill promptly let it see the browser stand-in first (as forkKillTree does).
 */
const tracked = (): Promise<void> => sleep(400);
const sha = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 16);

interface Record { requests: ChildSpawnRequest[]; pids: number[]; sent: string[][]; output: string[][] }
let root = '';
let record: Record;
let browsers: GuidedBrowser[] = [];
let diagnostics: string[] = [];
const spawned = new Set<number>();

/** The production fork spawner, observed: what it is asked to spawn, every frame sent to each child, and everything each child printed. */
function observedSpawner(extra?: (handle: ChildProcessHandle) => Partial<ChildProcessHandle>): ChildSpawner {
  const real = createForkSpawner();
  return {
    spawn(request) {
      const index = record.requests.push(request) - 1;
      record.sent[index] = [];
      record.output[index] = [];
      const handle = real.spawn(request);
      record.pids[index] = handle.pid ?? 0;
      spawned.add(handle.pid ?? 0);
      handle.onOutput((_stream, chunk) => { record.output[index]?.push(chunk); });
      return { ...handle, ...extra?.(handle), send: message => { record.sent[index]?.push(JSON.stringify(message)); handle.send(message); } };
    },
  };
}

// Every test here forks real children and waits on real process trees; the 5 s default is too tight under full-suite load.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'guided-child-test-'));
  record = { requests: [], pids: [], sent: [], output: [] };
  browsers = [];
  diagnostics = [];
});
afterEach(async () => {
  // Read the browser stand-ins' pids before the proxy removes their directories; a session ended before the sampler saw its browser leaves it behind.
  const grandchildren = [...record.requests.keys()].map(grandchildOf);
  for (const browser of browsers) await browser.terminate().catch(() => undefined);
  for (const pid of [...spawned, ...grandchildren]) if (pid !== null && isAlive(pid)) { try { process.kill(-pid, 'SIGKILL'); } catch { /* not a group leader or gone */ } }
  spawned.clear();
  await rm(root, { recursive: true, force: true });
});

const launcher = (options: GuidedChildLauncherOptions = {}): ReturnType<typeof createGuidedChildLauncher> =>
  createGuidedChildLauncher({ spawner: observedSpawner(), childModulePath: STUB, parentEnv: PARENT_ENV, tmpRoot: root, diagnostic: line => { diagnostics.push(line); }, ...options });

interface Session { readonly browser: GuidedBrowser; readonly lost: (GuidedLossReason | undefined)[]; readonly index: number }
async function start(launch: ReturnType<typeof launcher>, mode = '', recording?: Parameters<typeof launch>[3]): Promise<Session> {
  const lost: (GuidedLossReason | undefined)[] = [];
  const index = record.requests.length;
  const browser = await launch(CONFIG, mode === '' ? 'context-1' : `context-1?${mode}`, reason => { lost.push(reason); }, recording, { deadlineEpochMs: Date.now() + 10_000, signal: new AbortController().signal });
  browsers.push(browser);
  return { browser, lost, index };
}

const tmpOf = (index: number): string => record.requests[index]?.env.TMPDIR ?? '';
const childOf = (index: number): number => record.pids[index] ?? 0;
function grandchildOf(index: number): number | null {
  try { return Number(readFileSync(join(tmpOf(index), 'grandchild.pid'), 'utf8')); } catch { return null; }
}
/** The child, its browser stand-in and its temp directory are all gone. */
function gone(index: number, grandchild: number | null): void {
  expect(isAlive(childOf(index))).toBe(false);
  if (grandchild !== null) expect(isAlive(grandchild)).toBe(false);
  expect(existsSync(tmpOf(index))).toBe(false);
}

interface Hooks extends GuidedStepHooks { fences: number }
function hooks(ack: () => Promise<void> = () => Promise.resolve()): Hooks {
  const state = { fences: 0, onFence: (): Promise<void> => { state.fences += 1; return ack(); } };
  return state;
}
function step(code: string, parts: { mode?: 'prepare' | 'dispatch'; ms?: number; captures?: string[]; secretIds?: string[]; secrets?: GuidedStepRequest['secrets'] } = {}): GuidedStepRequest {
  const secretIds = parts.secretIds ?? [];
  return {
    mode: parts.mode ?? 'dispatch', coordinate: coordinate(), inputs: {}, vars: {}, secretIds, deadlineEpochMs: Date.now() + (parts.ms ?? 20_000),
    operation: operation(code, { captures: parts.captures ?? [], uses: secretIds.map(id => ({ kind: 'secret' as const, id })) }),
    ...(parts.secrets === undefined ? {} : { secrets: parts.secrets }),
  };
}
const OK_STEP = "vars['ok'] = 'yes';";
async function healthy(browser: GuidedBrowser): Promise<void> {
  expect((await browser.step(step(OK_STEP, { captures: ['ok'] }), hooks())).captured).toEqual({ ok: 'yes' });
  expect((await browser.observations.observe(undefined, false, undefined, 5_000)).observation.documentId).toBe('document-1');
}

/** The longest gap between two ticks of the test process's own event loop. */
function loopLag(): { stop(): number } {
  let last = Date.now(), worst = 0;
  const timer = setInterval(() => { const now = Date.now(); worst = Math.max(worst, now - last - 50); last = now; }, 50);
  return { stop: () => { clearInterval(timer); return worst; } };
}

describe('AC1: stall isolation', () => {
  it('a busy-looping step is killed by the proxy deadline: only its session ends, grandchild and temp dir included; the other session keeps working', async () => {
    const launch = launcher({ killGraceMs: 500 });
    const a = await start(launch), b = await start(launch);
    const grandA = grandchildOf(a.index), grandB = grandchildOf(b.index);
    expect(grandA).not.toBeNull();
    expect(isAlive(grandA ?? 0)).toBe(true);
    const lag = loopLag();

    const fencesA = hooks();
    const looping = a.browser.step(step('for (;;) {}', { ms: 1_000 }), fencesA);
    const ended = expect(looping).rejects.toThrow('TIMEOUT');
    await sleep(200);
    await healthy(b.browser); // during A's loop
    await ended;
    expect(fencesA.fences).toBe(0); // before the fence: the runtime maps this TIMEOUT to a TIMEOUT receipt
    expect(diagnostics).toContain('GUIDED_CHILD_LOST reason=STALL phase=DISPATCH\n');
    await vi.waitFor(() => { gone(a.index, grandA); }, { timeout: 3_000 });

    await healthy(b.browser); // after it
    expect(isAlive(childOf(b.index))).toBe(true);
    expect(isAlive(grandB ?? 0)).toBe(true);
    expect(lag.stop()).toBeLessThan(1_000); // the server's own event loop was never held
    expect(b.lost).toEqual([]);
  });

  it('a loop after the fence ends the session the same way (the runtime reports OUTCOME_UNKNOWN: the fence was crossed); a prepare that outlasts its budget plus grace ends the session', async () => {
    const launch = launcher({ killGraceMs: 500 });
    const a = await start(launch), p = await start(launch);
    const grandA = grandchildOf(a.index), grandP = grandchildOf(p.index);

    const fences = hooks();
    await expect(a.browser.step(step("await page.locator('#go').click(); for (;;) {}", { ms: 1_000 }), fences)).rejects.toThrow('TIMEOUT');
    expect(fences.fences).toBe(1);
    await vi.waitFor(() => { gone(a.index, grandA); }, { timeout: 3_000 });

    // Not a repairable pre-fence refusal any more: the page is gone with the child.
    await expect(p.browser.step(step('for (;;) {}', { mode: 'prepare', ms: 1_000 }), hooks())).rejects.toThrow('CONTEXT_LOST');
    await vi.waitFor(() => { gone(p.index, grandP); }, { timeout: 3_000 });
  });
});

describe('AC2: environment confinement (narrowed; see R-1b in the header)', () => {
  it('the spawn request is exactly the allow-listed environment, and step code that escapes to Node finds none of the server\'s identity, TLS or credentials', async () => {
    const { browser, index } = await start(launcher());
    expect(record.requests[index]).toEqual({
      modulePath: STUB, args: [],
      env: {
        PATH: '/usr/bin', HOME: '/home/runner', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright', DISPLAY: ':99', XDG_RUNTIME_DIR: '/run/user/1000',
        TMPDIR: expect.stringContaining(join(root, 'checks-guided-child-')) as string, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
        [ALLOWED_DOMAINS_ENV_KEY]: 'a.example.test,b.example.test', [ALLOW_ALL_DOMAINS_ENV_KEY]: 'false',
      },
    });
    expect(JSON.stringify(record.requests)).not.toMatch(new RegExp(CANARIES.join('|'), 'u'));

    // The Function-constructor route out of the step sandbox (the accepted named risk): the real process object of the real child.
    const code = `const p = Function('return process')(); const seen = JSON.stringify([p.env, p.argv, p.execArgv]);
      // macOS itself adds __CF_USER_TEXT_ENCODING to every process; it is not ours and carries nothing.
      vars['keys'] = Object.keys(p.env).filter(key => key !== '__CF_USER_TEXT_ENCODING').sort().join(',');
      vars['shape'] = JSON.stringify([p.argv.length, p.execArgv]);
      vars['hits'] = ${JSON.stringify(CANARIES)}.filter(name => seen.includes(name)).join(',') || 'none';
      vars['forbidden'] = Object.keys(p.env).filter(key => /^(NODE_|LD_|DYLD_|OPENSSL_)/u.test(key)).join(',') || 'none';`;
    const { captured, receipt } = await browser.step(step(code, { captures: ['keys', 'shape', 'hits', 'forbidden'] }), hooks());
    expect(receipt.closedCode).toBeNull();
    expect(captured.keys).toBe(Object.keys(record.requests[index]?.env ?? {}).sort().join(','));
    expect(captured.shape).toBe('[2,[]]'); // [node, script] and no interpreter flags
    expect(captured.hits).toBe('none');
    expect(captured.forbidden).toBe('none');
  });
});

describe('AC3: secret scoping', () => {
  it('a secret value reaches only its own session\'s child, only in the dispatching step message, and is read only after the fence ack', async () => {
    const launch = launcher();
    const a = await start(launch), b = await start(launch);
    const [SA, SB] = ['secret-value-of-A-CANARY', 'secret-value-of-B-CANARY'];
    const fill = "await page.locator('#pw').fill(secrets['PW']);";
    const holders = (value: string): GuidedStepRequest['secrets'] => ({ PW: { value, allowedOrigins: [ORIGIN] } });
    const fillLog = (index: number): string[] => { try { return readFileSync(join(tmpOf(index), 'fill.log'), 'utf8').trim().split('\n'); } catch { return []; } };

    // A prepare carries no value and reads nothing.
    const prepared = await a.browser.step(step(fill, { mode: 'prepare', secretIds: ['PW'] }), hooks());
    expect(prepared.fenceReached).toBe(true);
    expect(fillLog(a.index)).toEqual([]);

    // The dispatch waits for the ack: until the server's journal answers, the child has not read the value.
    let release: () => void = () => undefined;
    const acked = new Promise<void>(resolve => { release = resolve; });
    const fencesA = hooks(() => acked);
    const dispatchA = a.browser.step(step(fill, { secretIds: ['PW'], secrets: holders(SA) }), fencesA);
    await vi.waitFor(() => { expect(fencesA.fences).toBe(1); });
    await sleep(300);
    expect(fillLog(a.index)).toEqual([]);
    release();
    const resultA = await dispatchA;
    expect(resultA.receipt.closedCode).toBeNull();
    expect(resultA.secretUse).toEqual({ PW: 'USED' });
    expect(fillLog(a.index)).toEqual([sha(SA)]);

    const resultB = await b.browser.step(step(fill, { secretIds: ['PW'], secrets: holders(SB) }), hooks());
    expect(resultB.secretUse).toEqual({ PW: 'USED' });
    expect(fillLog(b.index)).toEqual([sha(SB)]);

    // Cleared in the child's finally: the next dispatch of the same session, with no value sent, finds nothing to read.
    const later = await a.browser.step(step(fill, { secretIds: ['PW'] }), hooks());
    expect(later.receipt.closedCode).not.toBeNull();
    expect(later.secretUse).toEqual({ PW: 'REFUSED' });
    expect(fillLog(a.index)).toEqual([sha(SA)]);

    const holding = (index: number, value: string): string[] => record.sent[index]?.filter(frame => frame.includes(value)) ?? [];
    expect(holding(a.index, SA)).toHaveLength(1);
    expect(JSON.parse(holding(a.index, SA)[0] ?? '{}')).toMatchObject({ op: 'step', step: { mode: 'dispatch' } });
    expect(holding(b.index, SB)).toHaveLength(1);
    expect(holding(a.index, SB)).toEqual([]);
    expect(holding(b.index, SA)).toEqual([]);
    for (const index of [a.index, b.index]) expect(JSON.stringify(record.requests[index])).not.toMatch(/secret-value/u);
    // Neither reply nor anything the children printed carries a value (the output is not empty: the stub logs the length).
    expect(JSON.stringify([resultA, resultB, later])).not.toMatch(/secret-value/u);
    expect(record.output.flat().join('')).toContain('fill length=');
    expect(record.output.flat().join('')).not.toMatch(/secret-value/u);
  });
});

describe('AC5: lifecycle', () => {
  it('a graceful stop kills the child and confirms it gone before close() resolves; so does a recorded orderly close', async () => {
    const launch = launcher();
    const plain = await start(launch);
    const grandPlain = grandchildOf(plain.index);
    await tracked();
    await healthy(plain.browser);
    await plain.browser.close();
    expect(plain.browser.orderlyClosed()).toBe(true);
    gone(plain.index, grandPlain); // immediately, not eventually
    expect(plain.lost).toEqual([]);

    const recorded = await start(launch, '', { dir: join(root, 'rec'), size: { width: 1280, height: 720 }, ready: vi.fn() });
    const grandRecorded = grandchildOf(recorded.index);
    await tracked();
    await recorded.browser.close();
    expect(await recorded.browser.recordedVideo?.()).toBe(join(root, 'rec', 'stub.webm'));
    expect(await recorded.browser.finalizeRecording?.(1_000)).toBe(true);
    gone(recorded.index, grandRecorded);
  });

  it('an unexpected child exit reports BROWSER_DISCONNECTED and takes the whole tree with it', async () => {
    const { browser, lost, index } = await start(launcher());
    const grand = grandchildOf(index);
    await tracked();
    process.kill(childOf(index), 'SIGKILL');
    await vi.waitFor(() => { expect(lost).toEqual(['BROWSER_DISCONNECTED']); });
    expect(diagnostics).toContain('GUIDED_CHILD_LOST reason=EXIT phase=IDLE\n');
    await vi.waitFor(() => { gone(index, grand); }, { timeout: 3_000 });
    await expect(browser.observations.current({ kind: 'blank' })).rejects.toThrow('CONTEXT_LOST');
    await browser.close(); // settles; nothing left to wait for
  });

  it('the child exits on IPC disconnect and takes its browser with it (no orphan after a server kill)', async () => {
    const tmp = await mkdtemp(join(root, 'orphan-'));
    const child = fork(STUB, [], { execArgv: [], env: { PATH: process.env.PATH ?? '', TMPDIR: tmp }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    spawned.add(child.pid ?? 0);
    const exited = new Promise<void>(resolve => { child.once('exit', () => { resolve(); }); });
    const answered = new Promise<void>(resolve => { child.once('message', () => { resolve(); }); });
    child.send({ kind: 'request', id: 1, op: 'launch', config: CONFIG, contextId: 'context-1', recording: null, deadlineEpochMs: Date.now() + 10_000 });
    await answered;
    const grand = Number(readFileSync(join(tmp, 'grandchild.pid'), 'utf8'));
    expect(isAlive(grand)).toBe(true);
    child.disconnect();
    await Promise.race([exited, sleep(5_000).then(() => { throw new Error('CHILD_STAYED'); })]);
    await vi.waitFor(() => { expect(isAlive(grand)).toBe(false); }, { timeout: 2_000 });
  });

  it('a launch that exceeds its budget, and one that is aborted, fail as GuidedLaunchFailure and kill only their own tree', async () => {
    const launch = launcher({ killGraceMs: 200 });
    const keeper = await start(launch);
    const config = { ...CONFIG };

    const over = launch(config, 'context-1?launch=hang', () => undefined, undefined, { deadlineEpochMs: Date.now() + 600, signal: new AbortController().signal });
    const overFailure = await over.then(() => null, (error: unknown) => error);
    expect(overFailure).toBeInstanceOf(GuidedLaunchFailure);
    expect((overFailure as GuidedLaunchFailure).cause).toMatchObject({ message: 'TIMEOUT' });
    await (overFailure as GuidedLaunchFailure).close();
    const overIndex = keeper.index + 1;
    gone(overIndex, grandchildOf(overIndex));

    const abort = new AbortController();
    const aborted = launch(config, 'context-1?launch=hang', () => undefined, undefined, { deadlineEpochMs: Date.now() + 10_000, signal: abort.signal });
    await vi.waitFor(() => { expect(record.requests).toHaveLength(3); });
    await sleep(300); // the child has had time to start its browser stand-in
    abort.abort(new Error('CANCELLED'));
    const abortFailure = await aborted.then(() => null, (error: unknown) => error);
    expect(abortFailure).toBeInstanceOf(GuidedLaunchFailure);
    await (abortFailure as GuidedLaunchFailure).close();
    gone(keeper.index + 2, grandchildOf(keeper.index + 2));

    await healthy(keeper.browser); // the neighbour's tree was never touched
    expect(isAlive(grandchildOf(keeper.index) ?? 0)).toBe(true);
  });

  it('one hostile frame (oversized, malformed, out of order, or a fence outside a dispatch) kills that child and is a closed refusal', async () => {
    const launch = launcher();
    const sessions: Session[] = [];
    for (const hostile of ['oversize', 'malformed', 'order', 'fence']) sessions.push(await start(launch, `hostile=${hostile}`));
    const bystander = await start(launch);
    const grands = sessions.map(session => grandchildOf(session.index));
    await tracked();

    await Promise.all(sessions.map(async session => { await expect(session.browser.observations.current({ kind: 'blank' })).rejects.toThrow('CONTEXT_LOST'); }));
    for (const [position, session] of sessions.entries()) {
      await vi.waitFor(() => { gone(session.index, grands[position] ?? null); }, { timeout: 3_000 });
      expect(session.lost).toEqual(['BROWSER_DISCONNECTED']);
    }
    expect(diagnostics.filter(line => line === 'GUIDED_CHILD_LOST reason=PROTOCOL phase=CURRENT\n')).toHaveLength(4);
    await healthy(bystander.browser);
  });
});

describe('SC008-E15 QA fixes', () => {
  it('F1: an unconfirmed quiesce inside the end cap rejects close(), but the tree is confirmed gone in the background and the slot can be released', async () => {
    let quiesces = 0;
    const spawner = observedSpawner(handle => ({ quiesce: remaining => (quiesces++ === 0 ? Promise.resolve(false) : (handle.quiesce?.(remaining) ?? Promise.resolve(true))) }));
    const { browser, index } = await start(launcher({ spawner }));
    const grand = grandchildOf(index);
    await tracked();
    await expect(browser.close()).rejects.toThrow('CONTEXT_LOST');
    await expect(browser.confirmGone?.()).resolves.toBeUndefined();
    expect(quiesces).toBeGreaterThanOrEqual(2);
    gone(index, grand);
  }, 15_000);

  it('F4: a video the child reports outside the recording directory (close reply or finalized notice) is a protocol violation and no video', async () => {
    const recording = (): Parameters<ReturnType<typeof launcher>>[3] => ({ dir: join(root, 'rec'), size: { width: 1280, height: 720 }, ready: vi.fn() });
    const orderly = await start(launcher(), 'video=outside', recording());
    await tracked();
    await orderly.browser.close();
    expect(await orderly.browser.recordedVideo?.()).toBeNull();

    const late = await start(launcher(), 'orderly=0&finalize=100&video=outside', recording());
    await tracked();
    await late.browser.close();
    expect(await late.browser.finalizeRecording?.(5_000)).toBe(false);
    expect(await late.browser.recordedVideo?.()).toBeNull();
    await vi.waitFor(() => { expect(isAlive(childOf(late.index))).toBe(false); }, { timeout: 3_000 });
  });

  it('F5: a step reply that claims a crossed fence the proxy never acked kills that child and is a closed refusal', async () => {
    const { browser, index } = await start(launcher(), 'hostile=claim');
    const grand = grandchildOf(index);
    await tracked();
    const fences = hooks();
    await expect(browser.step(step(OK_STEP, { captures: ['ok'] }), fences)).rejects.toThrow('CONTEXT_LOST');
    expect(fences.fences).toBe(0);
    expect(diagnostics).toContain('GUIDED_CHILD_LOST reason=PROTOCOL phase=DISPATCH\n');
    await vi.waitFor(() => { gone(index, grand); }, { timeout: 3_000 });
  });
});

describe('AC8: close ordering', () => {
  it('a recorded non-orderly close resolves at the reply, keeps the child until `finalized`, then kills it', async () => {
    const recording = { dir: join(root, 'rec'), size: { width: 1280, height: 720 }, ready: vi.fn() };
    const { browser, index } = await start(launcher(), 'orderly=0&finalize=800', recording);
    const grand = grandchildOf(index);
    await tracked();
    await browser.close();
    expect(recording.ready).toHaveBeenCalledWith(true);
    expect(browser.orderlyClosed()).toBe(false);
    expect(isAlive(childOf(index))).toBe(true); // the recorder is still finishing the webm
    expect(existsSync(tmpOf(index))).toBe(true);
    expect(await browser.finalizeRecording?.(5_000)).toBe(true);
    expect(await browser.recordedVideo?.()).toBe(join(root, 'rec', 'stub.webm'));
    await vi.waitFor(() => { gone(index, grand); }, { timeout: 2_000 });
  });

  it('a recording that never finishes is killed when its bound (finalize bound plus grace) ends', async () => {
    const { browser, index } = await start(launcher({ finalizeMs: 300, killGraceMs: 200 }), 'orderly=0&finalize=hang', { dir: join(root, 'rec'), size: { width: 1280, height: 720 }, ready: vi.fn() });
    const grand = grandchildOf(index);
    await tracked();
    const closed = Date.now();
    await browser.close();
    expect(isAlive(childOf(index))).toBe(true);
    expect(await browser.finalizeRecording?.(5_000)).toBe(false);
    expect(Date.now() - closed).toBeGreaterThanOrEqual(450);
    await vi.waitFor(() => { gone(index, grand); }, { timeout: 2_000 });
  });

  it('stopping a busy-looping child settles close() and removes the whole group within the 4.8 s stop bound', async () => {
    const { browser, index } = await start(launcher());
    const grand = grandchildOf(index);
    const looping = browser.step(step('for (;;) {}', { ms: 60_000 }), hooks());
    const ended = expect(looping).rejects.toThrow('CONTEXT_LOST');
    await sleep(300);
    const began = Date.now();
    await browser.close();
    const took = Date.now() - began;
    expect(took).toBeGreaterThanOrEqual(4_000); // the child cannot hear `close`: the one 4.5 s bound is what ends it
    expect(took).toBeLessThan(5_300); // 4.5 s + 0.3 s kill step, plus scheduling tolerance
    gone(index, grand);
    await ended;
  }, 15_000);
});
