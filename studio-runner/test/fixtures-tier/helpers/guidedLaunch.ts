/**
 * Fixtures-tier harness for the guided-close cases (STUDIO-OBS-009 AC-11 D5, lane R2). Lifted from the PR-RT probe
 * (`guidedCloseProbe.test.ts`, replaced by `guidedCloseBound.test.ts`), minus the observation windows: after D5 every
 * close settles, so the cases measure the instant it does instead of waiting to see whether it will.
 *
 * Real Chromium, the real guided HTTPS server (`createGuidedServer`), real mutual TLS with the test CA, the real
 * `launchGuidedBrowser`, and a stub controller that only grants claims and acknowledges callbacks. Chrome is frozen
 * with SIGSTOP on its process group (a browser that tidied itself up would make any close look correct), so a result
 * is a statement about the runner, not about Chromium.
 *
 * Signals: only direct children of this test process whose command line names a `checks-guided-` scratch directory
 * (D4's selection), plus their descendants. Nothing else is ever signalled, and nothing is logged from argv.
 */
import { createServer as httpsServer, request as httpsRequest } from 'node:https';
import type { Server } from 'node:https';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GuidedRuntimeOptions } from '../../../src/guided/runtime.js';
import { validate } from '../../../src/guided/contracts.js';
import { createGuidedServer, guidedCallback, guidedClaimClient } from '../../../src/guided/transport.js';
import type { CommandsClaim } from '../../../src/guided/types.js';
import { launchGuidedBrowser } from '../../../src/run/browser.js';
import { GuidedLaunchFailure } from '../../../src/run/guidedBrowser.js';
import type { GuidedBrowser } from '../../../src/run/guidedBrowser.js';
import { descendantsOf, isAlive, readProcessTableWithArgs } from '../../../src/run/tree.js';
import { assignmentFor, guidedContext, ownershipSession } from '../../helpers/guided.js';
import { jwt, jwtPolicy, testFingerprint, testTls } from '../../helpers/guidedTls.js';

export type Launch = GuidedRuntimeOptions['launch'];
type Grant = ReturnType<typeof ownershipSession>;
type Context = ReturnType<typeof guidedContext>;

/** The origin the stub sessions approve; nothing is ever served from it. */
export const ORIGIN = 'http://127.0.0.1:9';

export const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
export const rounded = (value: number | null): number | null => (value === null ? null : Math.round(value));

// ── Timed requests ───────────────────────────────────────────────────────────────────────────────

/** One request in flight: when it left, and what came back (if anything), on this process's clock. */
export interface Exchange {
  readonly label: string;
  readonly sentAt: number;
  status: number | null;
  body: unknown;
  repliedAt: number | null;
  /** The connection ended without a reply (reset, or the runner's own socket timeout). */
  endedWithoutReplyAt: number | null;
}

export function send(port: number, path: string, body: unknown, label: string, ownerFence: number | null = 1): Exchange {
  const exchange: Exchange = { label, sentAt: performance.now(), status: null, body: null, repliedAt: null, endedWithoutReplyAt: null };
  const request = httpsRequest({
    hostname: '127.0.0.1', port, path, method: 'POST', agent: false, ...testTls,
    headers: { authorization: `Bearer ${jwt()}`, 'content-type': 'application/json', 'idempotency-key': label, ...(ownerFence === null ? {} : { 'x-owner-fence': String(ownerFence) }) },
  }, (response) => {
    let data = '';
    response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    response.on('end', () => {
      exchange.status = response.statusCode ?? 0;
      try { exchange.body = JSON.parse(data) as unknown; } catch { exchange.body = null; }
      exchange.repliedAt = performance.now();
    });
  });
  request.on('error', () => { exchange.endedWithoutReplyAt ??= performance.now(); });
  request.on('close', () => { if (exchange.repliedAt === null) exchange.endedWithoutReplyAt ??= performance.now(); });
  request.end(JSON.stringify(body));
  return exchange;
}

export const answered = (exchange: Exchange): boolean => exchange.repliedAt !== null || exchange.endedWithoutReplyAt !== null;

/** True when the exchange got an answer (or lost its connection) within `boundMs` of NOW. */
export async function answeredWithin(exchange: Exchange, boundMs: number): Promise<boolean> {
  const end = performance.now() + boundMs;
  while (performance.now() < end) {
    if (answered(exchange)) return true;
    await sleep(10);
  }
  return answered(exchange);
}

export interface ExchangeOutcome {
  readonly replySent: boolean;
  readonly status: number | null;
  readonly code: string | null;
  readonly connectionEndedWithoutReply: boolean;
  /** Milliseconds after the request left. */
  readonly afterSentMs: number | null;
}

export function outcomeOf(exchange: Exchange): ExchangeOutcome {
  const body = exchange.body;
  const code = typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string' ? body.code : null;
  const at = exchange.repliedAt ?? exchange.endedWithoutReplyAt;
  return { replySent: exchange.repliedAt !== null, status: exchange.status, code, connectionEndedWithoutReply: exchange.repliedAt === null && exchange.endedWithoutReplyAt !== null, afterSentMs: at === null ? null : rounded(at - exchange.sentAt) };
}

// ── Freezing and reaping our own Chromium ────────────────────────────────────────────────────────

export interface Control {
  frozen: boolean;
  frozenAt: number | null;
  launchEnteredAt: number | null;
  /** Every pid we froze: the browser leaders and their descendants. Only these are ever killed here. */
  readonly pids: Set<number>;
  readonly leaders: Set<number>;
  /** Names of the scratch directories (`checks-guided-XXXX`) of the browsers we froze. */
  readonly scratch: Set<string>;
  /** A controller that never answers the bootstrap callback is how the BOOTSTRAP_CALLBACK phase stalls. */
  bootstrapHangs: boolean;
  /** The runtime's own close of the browser (`close`, `terminate`, or the failed launch's `close`): when it began and how it ended. */
  closeCalledAt: number | null;
  closeSettledAt: number | null;
  closeOutcome: 'resolved' | 'rejected' | null;
  /** Which entry point the runtime used. */
  closeKind: 'close' | 'terminate' | 'failure.close' | null;
  /** How many of the frozen processes were still alive at the instant that close settled. */
  aliveWhenCloseSettled: number | null;
}

export const newControl = (): Control => ({ frozen: false, frozenAt: null, launchEnteredAt: null, pids: new Set(), leaders: new Set(), scratch: new Set(), bootstrapHangs: false, closeCalledAt: null, closeSettledAt: null, closeOutcome: null, closeKind: null, aliveWhenCloseSettled: null });

const PROFILE = /--user-data-dir=\S*\/(checks-guided-[A-Za-z0-9]+)\//u;

/** SIGSTOP the group of every browser this process launched. Returns how many leaders were frozen. */
export function freezeOwnBrowser(control: Control): number {
  const table = readProcessTableWithArgs();
  let frozen = 0;
  for (const row of table) {
    if (row.ppid !== process.pid) continue;
    const own = PROFILE.exec(row.args);
    if (own?.[1] === undefined) continue;
    control.scratch.add(own[1]);
    control.leaders.add(row.pid);
    for (const pid of [row.pid, ...descendantsOf(row.pid, table)]) control.pids.add(pid);
    // Playwright starts the browser detached, so it leads its own group: stop the group, then the leader.
    try { process.kill(-row.pid, 'SIGSTOP'); } catch { /* not a group leader */ }
    try { process.kill(row.pid, 'SIGSTOP'); frozen++; } catch { /* already gone */ }
  }
  if (frozen > 0) { control.frozen = true; control.frozenAt ??= performance.now(); }
  return frozen;
}

export function signalOwn(control: Control, signal: 'SIGCONT' | 'SIGKILL'): void {
  for (const leader of control.leaders) { try { process.kill(-leader, signal); } catch { /* gone */ } }
  for (const pid of control.pids) { try { process.kill(pid, signal); } catch { /* gone */ } }
}

export const survivorsOf = (control: Control): number[] => [...control.pids].filter((pid) => isAlive(pid));

/** Wraps a close so the cases see when the runtime started it and how it ended, without changing what it does. */
export function trackClose(control: Control, kind: NonNullable<Control['closeKind']>, close: () => Promise<void>): () => Promise<void> {
  return () => {
    control.closeCalledAt ??= performance.now();
    control.closeKind ??= kind;
    const note = (outcome: 'resolved' | 'rejected'): void => {
      if (control.closeSettledAt !== null) return;
      control.closeSettledAt = performance.now();
      control.closeOutcome = outcome;
      control.aliveWhenCloseSettled = survivorsOf(control).length;
    };
    return close().then(() => { note('resolved'); }, (error: unknown) => { note('rejected'); throw error; });
  };
}

/** `browser` with its `close` and `terminate` observed. `orderlyClosed` and everything else are the browser's own. */
export function trackBrowser(control: Control, browser: GuidedBrowser): GuidedBrowser {
  return {
    ...browser,
    close: trackClose(control, 'close', browser.close),
    terminate: trackClose(control, 'terminate', browser.terminate),
  };
}

/** The close, relative to a request that left at `from`. */
export const closeFacts = (control: Control, from: number): Record<string, unknown> => ({
  closeKind: control.closeKind,
  closeCalledAfterMs: control.closeCalledAt === null ? null : rounded(control.closeCalledAt - from),
  closeSettledAfterMs: control.closeSettledAt === null ? null : rounded(control.closeSettledAt - from),
  closeTookMs: control.closeCalledAt === null || control.closeSettledAt === null ? null : rounded(control.closeSettledAt - control.closeCalledAt),
  closeOutcome: control.closeOutcome,
  frozenProcessesAliveWhenCloseSettled: control.aliveWhenCloseSettled,
});

export const describeBrowser = (control: Control): Record<string, unknown> => ({ browserFrozen: control.frozen, browserLeadersFrozen: control.leaders.size, processesFrozen: control.pids.size, scratchDirectories: control.scratch.size });

// ── The runner under test: the real guided server plus a stub controller ─────────────────────────

export interface Harness {
  readonly port: number;
  readonly grants: Map<string, Grant>;
  readonly control: Control;
  readonly claims: CommandsClaim[];
  /** A new assigned-and-granted session context (not yet started). */
  session(): { context: Context; path: string };
  close(): Promise<void>;
}

const harnesses: Harness[] = [];
const scratchRoots: string[] = [];
const extraCleanups: (() => Promise<void> | void)[] = [];

/** Registers a directory this case created, removed by {@link cleanupAll}. */
export function trackScratch(path: string): string { scratchRoots.push(path); return path; }
/** Registers a function {@link cleanupAll} runs (for example, releasing a held launch promise). */
export function onCleanup(fn: () => Promise<void> | void): void { extraCleanups.push(fn); }

/**
 * Safety net after every case, not an assertion: whatever a case left frozen is a browser this process created. It
 * is killed so a red case cannot leave Chromium behind.
 */
export async function cleanupAll(): Promise<void> {
  for (const harness of harnesses) { signalOwn(harness.control, 'SIGCONT'); signalOwn(harness.control, 'SIGKILL'); }
  for (const harness of harnesses.splice(0)) await harness.close().catch(() => undefined);
  for (const fn of extraCleanups.splice(0)) await Promise.resolve(fn()).catch(() => undefined);
  for (const root of scratchRoots.splice(0)) await rm(root, { recursive: true, force: true }).catch(() => undefined);
}

export async function startHarness(launch: Launch, control: Control): Promise<Harness> {
  const journalDirectory = trackScratch(await mkdtemp(join(tmpdir(), 'guided-d5-bound-')));
  const grants = new Map<string, Grant>();
  const claims: CommandsClaim[] = [];
  const held = new Set<{ end(): void }>();
  const controller: Server = httpsServer({ ...testTls, requestCert: true, rejectUnauthorized: true }, (req, res) => {
    let text = '';
    req.on('data', (chunk: Buffer) => { text += chunk.toString(); });
    req.on('end', () => {
      const route = req.url?.split('/').at(-1) ?? '';
      if (route === 'claim') {
        const command = validate<CommandsClaim>('commands', JSON.parse(text), 'claim');
        claims.push(command);
        const grant = grants.get(command.sessionId);
        if (!grant) { res.writeHead(409); res.end('{}'); return; }
        grant.owner.leaseExpiresAt = new Date(Math.min(Date.now() + 30_000, Date.parse(grant.expiresAt))).toISOString();
        res.writeHead(202); res.end(JSON.stringify(grant));
        return;
      }
      if (route === 'bootstrap-evidence' && control.bootstrapHangs) { held.add(res); return; }
      res.writeHead(202); res.end('{}');
    });
  });
  await new Promise<void>((resolve) => { controller.listen(0, '127.0.0.1', resolve); });
  const controllerAddress = controller.address();
  if (controllerAddress === null || typeof controllerAddress === 'string') throw new Error('PORT');
  const client = { baseUrl: `https://127.0.0.1:${String(controllerAddress.port)}`, tls: testTls, controllerCertificateFingerprint256: testFingerprint, token: () => Promise.resolve(jwt({ aud: 'studio-guided-controller', role: 'owning-worker', sub: 'worker-one' })) };
  const app = createGuidedServer({ workerId: 'worker-one', journalDirectory, tls: testTls, controllerJwt: jwtPolicy, controllerCertificateFingerprint256: testFingerprint, launch, claim: guidedClaimClient(client), callback: guidedCallback(client) });
  await new Promise<void>((resolve) => { app.server.listen(0, '127.0.0.1', resolve); });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('PORT');
  const harness: Harness = {
    port: address.port, grants, control, claims,
    session() {
      const context = guidedContext(ORIGIN);
      grants.set(context.sessionId, ownershipSession(context));
      return { context, path: `/internal/v2/studio/guided-sessions/${context.sessionId}` };
    },
    async close() {
      // `app.close()` waits for every session's stop; a stop that is still wedged must not hang the case.
      await Promise.race([app.close().catch(() => undefined), sleep(8_000)]);
      for (const res of held) { try { res.end(); } catch { /* socket gone */ } }
      app.server.closeAllConnections();
      controller.closeAllConnections();
      await Promise.all([new Promise<void>((resolve) => { app.server.close(() => { resolve(); }); }), new Promise<void>((resolve) => { controller.close(() => { resolve(); }); })]);
    },
  };
  harnesses.push(harness);
  return harness;
}

/** assign over the wire and wait for its answer; throws unless the worker owns the assignment. */
export async function assignAndWait(harness: Harness, session: { context: Context; path: string }): Promise<void> {
  const exchange = send(harness.port, `${session.path}/assign`, assignmentFor(session.context), `assign-${session.context.sessionId}`, null);
  if (!(await answeredWithin(exchange, 10_000)) || exchange.status !== 200) throw new Error(`setup: assign answered ${String(exchange.status)}`);
}

export interface SlotProbe { readonly held: boolean; readonly status: number | null; readonly code: string | null }

/** A second `assign` for a different session: refused `CAPACITY` while the single slot is occupied, taken (then given back) otherwise. */
export async function slotProbe(harness: Harness): Promise<SlotProbe> {
  const second = harness.session();
  const assignment = assignmentFor(second.context);
  const exchange = send(harness.port, `${second.path}/assign`, assignment, `slot-${second.context.sessionId}`, null);
  await answeredWithin(exchange, 10_000);
  const outcome = outcomeOf(exchange);
  if (exchange.status === 200) {
    const release = send(harness.port, `${second.path}/stop`, { schemaVersion: 3, kind: 'assignment', assignment, reason: 'CANCELLED' }, `slot-release-${second.context.sessionId}`, null);
    await answeredWithin(release, 10_000);
  }
  return { held: exchange.status === 409 && outcome.code === 'CAPACITY', status: exchange.status, code: outcome.code };
}

// ── Launch variants ──────────────────────────────────────────────────────────────────────────────

export type FreezePoint = 'NEVER' | 'AFTER_LAUNCH' | 'AFTER_WITHHOLD' | 'AFTER_BLANK_MATCH' | 'LAUNCH_ERROR_AFTER_FREEZE';

/** The real launcher, with Chrome frozen at the named point. `NEVER` leaves freezing to the case. */
export function launcherFreezing(point: FreezePoint, control: Control): Launch {
  return async (config, contextId, onLost, _recording, startup) => {
    control.launchEnteredAt ??= performance.now();
    if (point === 'LAUNCH_ERROR_AFTER_FREEZE') {
      // A launch that fails for a reason that is neither the deadline nor a stop, with Chrome already stuck: `ready` runs
      // inside the launch's try block, so its throw is the non-deadline launch failure (path (iii)).
      const dir = trackScratch(await mkdtemp(join(tmpdir(), 'guided-d5-rec-')));
      try {
        return await launchGuidedBrowser(config, contextId, onLost, { dir, size: { width: 640, height: 360 }, ready: () => { freezeOwnBrowser(control); throw new Error('NON_DEADLINE_LAUNCH_FAILURE'); } }, startup);
      } catch (error) {
        // Same failure (cause and phase), with its `close` observed.
        if (error instanceof GuidedLaunchFailure) throw new GuidedLaunchFailure(trackClose(control, 'failure.close', error.close), error.cause, error.phase);
        throw error;
      }
    }
    const launched = trackBrowser(control, await launchGuidedBrowser(config, contextId, onLost, undefined, startup));
    if (point === 'AFTER_LAUNCH') freezeOwnBrowser(control);
    if (point === 'AFTER_WITHHOLD') {
      const real = launched.observations.withhold?.bind(launched.observations);
      return { ...launched, observations: { ...launched.observations, withhold: async (values) => { await real?.(values); freezeOwnBrowser(control); } } };
    }
    if (point === 'AFTER_BLANK_MATCH') return { ...launched, blankMatches: async () => { const matched = await launched.blankMatches(); freezeOwnBrowser(control); return matched; } };
    return launched;
  };
}
