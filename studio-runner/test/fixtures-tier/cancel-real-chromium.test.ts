/**
 * Studio v1 WP11 — cancel, **observed** against real pinned Chromium.
 *
 * `test/server/cancel.test.ts` proves the cancel's routing, idempotence and classification against
 * a scripted child at the spawn seam. None of that can tell you whether a live browser, hung
 * inside a real Playwright call, actually stops inside the production grace, what the recorder
 * leaves behind, or whether any Chromium survives. This file can, because every pod below is the
 * real application (`createApplication` through the harness) with the **real** child launcher and
 * the **real** fork spawner, a real scratch root and a real object-store directory. Only the API
 * callbacks are faked, and only as far as saying `cancelRequested` is.
 *
 * ## What each block drives, and through which signal
 *
 * | Block | Signal | `run.cancel_requested.source` |
 * |---|---|---|
 * | DELETE mid-step, both stall fixtures | `DELETE /v1/runs/{id}` on the owning pod | `delete` |
 * | poll only | the owner's real 2 s control read; no DELETE is sent | `control` |
 * | ack only | the acknowledgement of the PROGRESS that says step 1 is running | `progress-ack` |
 * | before launch / during launch | `coordinator.cancel`, the DELETE handler's own call | `delete` |
 * | grace exceeded | DELETE, with the browser suspended so the ordered stop cannot finish | `delete` |
 * | two pods | DELETE to the pod that does **not** hold the run, then the owner's poll | `control` |
 *
 * Every block ends with the same pod running a passing job to `PASSED`, which is the assertion
 * that catches a leaked slot, profile, `/dev/shm` handle or port in one place.
 *
 * ## How the tree is observed
 *
 * Snapshot-then-recheck, as `deadline-cleanup.test.ts` explains: every pid seen below the fork
 * while the run was alive is rechecked individually afterwards. A re-walk from the dead fork would
 * return `[]` over an orphaned browser that is still running.
 *
 * ## Timing
 *
 * Wall-clock bounds from the plan's §2.7, with margins, and the measured values are printed at the
 * end of the file. The step timeout is raised to 120 s so nothing but the cancel can end a run.
 *
 * The committed samples stall for {@link STALL_BEFORE_CANCEL_MS} (2 s), which keeps the tier fast.
 * The numbers that moved the chart's grace from 5 s to 15 s (decision D3, ADR-002 §29.3) were taken
 * with that constant temporarily raised to 30, 60, 100 and 115 s: closing a context under a hung
 * navigation grows with the hang, and a locator wait does not.
 */
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { SYSTEM_DEADLINE_TIMERS } from '../../src/run/deadline.js';
import type { DeadlineTimers } from '../../src/run/deadline.js';
import { CANCELLED_MESSAGE, createChildBrowserLauncher, createForkSpawner } from '../../src/run/launcher.js';
import type { ChildProcessHandle, ChildSpawner } from '../../src/run/launcher.js';
import { createLocalObjectStore } from '../../src/run/objectStore.js';
import { WEBM_MAGIC } from '../../src/run/recording.js';
import { descendantsOf, isAlive } from '../../src/run/tree.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import type { BrowserLauncher } from '../../src/server/adapters.js';
import { CONTROL_POLL_INTERVAL_MS, STOPPED_STEP_MESSAGE } from '../../src/server/runCoordinator.js';
import { createFsScratchStore } from '../../src/server/scratch.js';
import { startBlackHole } from '../helpers/blackHole.js';
import { packageRoot } from '../helpers/corpus.js';
import type { BlackHole } from '../helpers/blackHole.js';
import { createHarness, SERVICE_TOKEN } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { startPageServer } from '../helpers/pageServer.js';
import type { PageServer } from '../helpers/pageServer.js';
import { post, validJob } from '../helpers/runner.js';
import type { RawResponse } from '../helpers/runner.js';
import { CHILD_MODULE_PATH } from './globalSetup.js';
import { createScratch, untilMs } from './realRunner.js';

/**
 * The grace the chart deploys (`STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS` in `values.yaml`), read from
 * the chart rather than restated, so the pods below stop with exactly what production stops with.
 * WP11 raised it from the runner's 5 s fallback on the measurement this file makes (decision D3).
 */
const DEPLOYED_GRACE_MS = Number(
  (
    parse(readFileSync(join(packageRoot, '..', 'helm-chart', 'put-checks', 'values.yaml'), 'utf8')) as {
      studioRunner: { runnerEnv: Record<string, string> };
    }
  ).studioRunner.runnerEnv.STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS,
);
/** Far above every bound below, so the step timeout can never be what ends a run. */
const STEP_TIMEOUT_MS = 120_000;

let pages: PageServer;
let blackHole: BlackHole;
const directories: string[] = [];
const pods: Pod[] = [];
/** Pids this file suspended, so a failed assertion cannot leave stopped browsers on the machine. */
const suspended: number[] = [];

/** Every measurement this file took, printed once at the end. */
const measurements: { readonly name: string; readonly values: Record<string, number | string> }[] = [];

beforeAll(async () => {
  pages = await startPageServer();
  blackHole = await startBlackHole();
});

afterAll(async () => {
  await pages.close();
  await blackHole.close();
  printMeasurements();
});

afterEach(async () => {
  for (const pid of suspended.splice(0)) {
    try {
      process.kill(pid, 'SIGCONT');
    } catch {
      // Already gone, which is the outcome the tests assert anyway.
    }
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Likewise.
    }
  }
  for (const pod of pods.splice(0)) await pod.harness.stop();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

// ── Instruments ──────────────────────────────────────────────────────────────────────────────

/** One spawned child, with the instants the parent handed it `stop`, got its result and saw it exit. */
interface ObservedChild {
  readonly handle: ChildProcessHandle;
  stopSentAt: number | null;
  resultAt: number | null;
  exitAt: number | null;
  killedAt: number | null;
}

/**
 * The production fork spawner, unmodified, with each handle kept and timed.
 *
 * The pid is the subject of the tree assertions and the shipped session does not expose it. The
 * timings are the subject of decision D3: `stop` → `result` is the child's ordered close (context
 * close, webm finalization, file inspection), and `stop` → exit is what the grace has to cover.
 */
function observingSpawner(): ChildSpawner & { readonly children: readonly ObservedChild[] } {
  const real = createForkSpawner();
  const children: ObservedChild[] = [];
  return {
    children,
    spawn(request) {
      const handle = real.spawn(request);
      const observed: ObservedChild = {
        handle,
        stopSentAt: null,
        resultAt: null,
        exitAt: null,
        killedAt: null,
      };
      handle.onMessage((value) => {
        if ((value as { kind?: unknown }).kind === 'result') observed.resultAt ??= performance.now();
      });
      handle.onExit(() => {
        observed.exitAt ??= performance.now();
      });
      children.push(observed);
      return {
        send(message) {
          if (message.kind === 'stop') observed.stopSentAt ??= performance.now();
          handle.send(message);
        },
        onMessage: (listener) => {
          handle.onMessage(listener);
        },
        onExit: (listener) => {
          handle.onExit(listener);
        },
        onOutput: (listener) => {
          handle.onOutput(listener);
        },
        kill() {
          observed.killedAt ??= performance.now();
          handle.kill();
        },
        get pid() {
          return handle.pid;
        },
      };
    },
  };
}

interface LogLine {
  readonly at: number;
  readonly fields: Record<string, unknown>;
}

interface Pod {
  readonly harness: Harness;
  readonly spawner: ReturnType<typeof observingSpawner>;
  readonly scratchRoot: string;
  readonly objectRoot: string;
  readonly lines: readonly LogLine[];
  /** Report bodies with the instant each was handed to the transport. */
  readonly reports: readonly { readonly at: number; readonly body: ReportBody }[];
}

/**
 * One real runner: real launcher, real fork, real scratch, a real object-store directory.
 *
 * The runtime deadline stays on the harness's fake scheduler, which nothing here advances: the
 * total-runtime kill is `deadline-cleanup.test.ts`'s subject, and here it must not be the thing
 * that ends a run. The control read is on the fake `controlScheduler` too unless `controlTimers`
 * is passed — the poll-driven blocks pass the real ones.
 */
async function startPod(
  options: { readonly instanceId?: string; readonly controlTimers?: DeadlineTimers } = {},
): Promise<Pod> {
  const scratchRoot = createScratch();
  const objectRoot = createScratch();
  directories.push(scratchRoot, objectRoot);
  const spawner = observingSpawner();
  const lines: LogLine[] = [];
  const reports: { at: number; body: ReportBody }[] = [];

  let real: BrowserLauncher | null = null;
  const launcher: BrowserLauncher = {
    launch: (launchOptions) => {
      if (real === null) throw new Error('the pod was not configured');
      return real.launch(launchOptions);
    },
  };

  const harness = createHarness({
    env: {
      STUDIO_RUNNER_INSTANCE_ID: options.instanceId ?? 'runner-a',
      STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS: String(STEP_TIMEOUT_MS),
      STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS: String(DEPLOYED_GRACE_MS),
    },
    launcher,
    scratch: createFsScratchStore(scratchRoot),
    objectStore: createLocalObjectStore({ root: objectRoot }),
    // The production filesystem port: `stat` and nothing else (story 10.14 AC-5).
    evidenceFileSystem: {
      stat: (path: string) => Promise.resolve({ size: statSync(path).size }),
      readFile: () => Promise.reject(new Error('the uploader must not read a recording whole')),
    },
    ...(options.controlTimers === undefined ? {} : { controlTimers: options.controlTimers }),
    onLogLine: (line) => {
      lines.push({ at: performance.now(), fields: JSON.parse(line) as Record<string, unknown> });
    },
    onReportRequest: (request) => {
      reports.push({ at: performance.now(), body: JSON.parse(request.body) as ReportBody });
    },
  });
  // The grace the pod actually runs with is the deployment's value, read from its configuration.
  expect(DEPLOYED_GRACE_MS).toBeGreaterThan(0);
  expect(harness.config.browserStopTimeoutMs).toBe(DEPLOYED_GRACE_MS);
  real = createChildBrowserLauncher({
    // The deployment's geometry (`STUDIO_RUNNER_RECORDING_WIDTH`/`HEIGHT`), since how long the
    // recorder takes to finalize is part of what this file measures.
    recording: { width: 1280, height: 720 },
    // ADR-002 §26.3 item 5: the fixtures tier always runs with the calibration at 0 (story 10.32).
    seekOriginCalibrationMs: 0,
    stepTimeoutMs: STEP_TIMEOUT_MS,
    launchTimeoutMs: 60_000,
    maxFailureMessageLength: 400,
    stopTimeoutMs: harness.config.browserStopTimeoutMs,
    childModulePath: CHILD_MODULE_PATH,
    spawner,
  });
  await harness.start();
  const pod: Pod = { harness, spawner, scratchRoot, objectRoot, lines, reports };
  pods.push(pod);
  return pod;
}

interface StepSpec {
  readonly text: string;
  readonly code: string;
}

let jobCounter = 0;

/** A job over `steps`, with its own execution id and evidence keys. */
function jobOf(steps: readonly StepSpec[]): { readonly id: string; readonly body: Record<string, unknown> } {
  jobCounter += 1;
  const id = `exec-cancel-${String(jobCounter)}`;
  return {
    id,
    body: validJob({
      executionId: id,
      attemptId: `${id}-attempt`,
      videoKey: `studio/${id}/video.webm`,
      manifestKey: `studio/${id}/manifest.json`,
      source: steps.map((step) => step.text),
      artifact: {
        version: 1,
        steps: steps.map((step, stepIndex) => ({ stepIndex, originalText: step.text, code: step.code })),
      },
      references: { variables: [], secrets: [] },
      resolvedVars: {},
      resolvedSecrets: {},
      configuration: {
        browser: 'chromium',
        viewport: { width: 1280, height: 720 },
        timeoutSeconds: STEP_TIMEOUT_MS / 1000,
        waitStrategy: 'load',
      },
    }),
  };
}

const gotoHome = (): StepSpec => ({
  text: 'Go to the home page',
  code: `await page.goto('${pages.baseUrl}/home.html');`,
});
const gotoStall = (): StepSpec => ({
  text: 'Go to the stall page',
  code: `await page.goto('${pages.baseUrl}/stall.html');`,
});
const gotoBlackHole = (): StepSpec => ({
  text: 'Go to a page that never answers',
  code: `await page.goto('${blackHole.url}');`,
});
const waitForNever: StepSpec = {
  text: 'Check that an element that never appears is visible',
  code: "await expect(page.getByTestId('never-appears')).toBeVisible();",
};

/** The two ways a run is held mid-step: a navigation inside Chromium, or a locator wait. */
const STALLS = {
  navigation: (): StepSpec[] => [gotoHome(), gotoBlackHole()],
  assertion: (): StepSpec[] => [gotoStall(), waitForNever],
} as const;
type StallKind = keyof typeof STALLS;

/** `DELETE`, with no body and the service identity, exactly as the worker's client sends it. */
function del(port: number, path: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'DELETE',
        headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => {
          resolve({
            status: incoming.statusCode ?? 0,
            headers: {},
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

/** Every pid seen below `pid`, accumulated until stopped. Snapshot, never re-walk. */
function watchTree(pid: number): { readonly seen: ReadonlySet<number>; stop(): void } {
  const seen = new Set<number>();
  const take = (): void => {
    for (const descendant of descendantsOf(pid)) seen.add(descendant);
  };
  take();
  const timer = setInterval(take, 100);
  return {
    seen,
    stop(): void {
      clearInterval(timer);
      take();
    },
  };
}

/** The fork and every pid ever seen below it are gone, each one asked individually. */
async function expectTreeGone(forkPid: number, seen: ReadonlySet<number>): Promise<void> {
  await untilMs(() => !isAlive(forkPid) && [...seen].every((pid) => !isAlive(pid)), 30_000);
  expect(isAlive(forkPid), `the fork ${String(forkPid)} survived`).toBe(false);
  for (const pid of seen) {
    expect(isAlive(pid), `a process (${String(pid)}) that was below the fork survived`).toBe(false);
  }
}

function finalOf(pod: Pod): ReportBody {
  const final = pod.reports.find((report) => report.body.kind === 'FINAL');
  if (final === undefined) throw new Error('no FINAL report was delivered');
  return final.body;
}

function finalAt(pod: Pod): number {
  return pod.reports.find((report) => report.body.kind === 'FINAL')?.at ?? Number.NaN;
}

/** `run.cancel_requested` lines for one execution, in order. */
function cancelLines(pod: Pod, executionId: string): LogLine[] {
  return pod.lines.filter(
    (line) => line.fields.event === 'run.cancel_requested' && line.fields.executionId === executionId,
  );
}

async function admit(pod: Pod, body: Record<string, unknown>): Promise<void> {
  const response = await post(pod.harness.port, '/v1/runs', JSON.stringify(body), SERVICE_TOKEN);
  expect(response.status).toBe(202);
}

/** Resolves once a report says `stepIndex` is running, and returns the fork's pid. */
async function untilStepRunning(pod: Pod, stepIndex: number): Promise<number> {
  await untilMs(
    () =>
      pod.reports.some((report) =>
        report.body.steps.some((step) => step.stepIndex === stepIndex && step.status === 'RUNNING'),
      ),
    60_000,
  );
  const pid = pod.spawner.children.at(-1)?.handle.pid ?? 0;
  expect(pid, 'the fork must have a pid').toBeGreaterThan(0);
  // Chromium, its renderer and the encoder are all below the fork by now; wait for the browser at
  // least, so the snapshot has something to prove.
  await untilMs(() => descendantsOf(pid).length > 0, 30_000);
  return pid;
}

async function untilIdle(pod: Pod): Promise<void> {
  await untilMs(() => pod.harness.app.coordinator.inFlight === 0, 60_000);
}

/**
 * The honest evidence: `STORED` names a real webm object in the store; a recording that was not
 * stored — never produced (`UNAVAILABLE`) or not playable (`FAILED`) — is never partial and puts
 * nothing in the store (ADR-002 §17.3).
 */
function expectHonestEvidence(pod: Pod, final: ReportBody, videoKey: string): void {
  const evidence = final.evidence;
  expect(evidence).not.toBeNull();
  expect(evidence?.videoKey).toBe(videoKey);
  expect(['STORED', 'FAILED', 'UNAVAILABLE']).toContain(evidence?.state);
  const object = join(pod.objectRoot, videoKey);
  if (evidence?.state === 'STORED') {
    expect(existsSync(object), 'STORED names an object that is not in the store').toBe(true);
    expect([...readFileSync(object).subarray(0, 4)]).toEqual([...WEBM_MAGIC]);
  } else {
    expect(evidence?.partial).toBe(false);
    expect(existsSync(object)).toBe(false);
  }
}

/** Per-run scratch is gone from the pod's real scratch root. */
function expectScratchCleared(pod: Pod): void {
  expect(readdirSync(pod.scratchRoot), 'a run directory survived in scratch').toEqual([]);
}

/** D1: the step the cancel interrupted is SKIPPED with the neutral text, never FAIL. */
function expectInterruptedStepSkipped(final: ReportBody, stepIndex: number): void {
  const step = final.steps.find((candidate) => candidate.stepIndex === stepIndex);
  expect(step, `step ${String(stepIndex)} is missing from FINAL`).toBeDefined();
  expect(step?.status).toBe('SKIPPED');
  expect(step?.failure).toBe(STOPPED_STEP_MESSAGE);
  // It did start: the reading stays, so the recording can still be sought to it.
  expect(step?.startedAtMs).not.toBeNull();
  const text = JSON.stringify(final);
  expect(text).not.toContain('Target page, context or browser has been closed');
  expect(text).not.toContain('RunStopped');
  for (const candidate of final.steps) expect(candidate.status).not.toBe('FAIL');
}

/** The cancel's outcome, as §29.2 item 5 fixes it. */
function expectCancelled(final: ReportBody): void {
  expect(final.kind).toBe('FINAL');
  expect(final.outcome?.result).toBe('ERROR');
  expect(final.outcome?.errorCode).toBe('CANCELLED');
}

/** The same pod runs a passing job to `PASSED` straight afterwards. */
async function expectNextRunPasses(pod: Pod): Promise<void> {
  const before = pod.reports.length;
  const next = jobOf([gotoHome()]);
  await admit(pod, next.body);
  await untilIdle(pod);
  const final = pod.reports.slice(before).find((report) => report.body.kind === 'FINAL')?.body;
  expect(final?.executionId).toBe(next.id);
  expect(final?.outcome).toMatchObject({ result: 'PASSED', errorCode: null });
  expect(final?.evidence?.state).toBe('STORED');
  expect(final?.evidence?.partial).toBe(false);
  expectScratchCleared(pod);
}

function record(name: string, values: Record<string, number | string>): void {
  measurements.push({ name, values });
}

const round = (value: number): number => Math.round(value);

function printMeasurements(): void {
  if (measurements.length === 0) return;
  const rows = measurements.map(
    (entry) =>
      `  ${entry.name.padEnd(46)} ${Object.entries(entry.values)
        .map(([key, value]) => `${key}=${typeof value === 'number' ? String(round(value)) : value}`)
        .join('  ')}`,
  );
  const stopToExit = measurements
    .map((entry) => entry.values.stopToExitMs)
    .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));
  const summary: string[] = [];
  for (const kind of Object.keys(STALLS)) {
    const values = measurements
      .filter((entry) => entry.values.fixture === kind && entry.values.grace === 'honoured')
      .map((entry) => entry.values.stopToExitMs)
      .filter((value): value is number => typeof value === 'number')
      .sort((a, b) => a - b);
    if (values.length === 0) continue;
    const median = values[Math.floor(values.length / 2)] ?? Number.NaN;
    summary.push(
      `  ordered stop → child exit, ${kind} stall, n=${String(values.length)}: ` +
        `min ${String(round(values[0] ?? Number.NaN))} ms, median ${String(round(median))} ms, ` +
        `max ${String(round(values.at(-1) ?? Number.NaN))} ms (grace ${String(DEPLOYED_GRACE_MS)} ms)`,
    );
  }
  console.log(
    ['WP11 cancel measurements (ms, wall clock):', ...rows, ...summary].join('\n') +
      (stopToExit.length > 0 ? '' : '\n  (no stop → exit readings)'),
  );
}

// ── (a) DELETE mid-step, production grace — and the D3 measurement ───────────────────────────

/** Samples per stall fixture for decision D3's min/median/max. */
const SAMPLES = 5;
/** How long each sample's step has been stalled when the DELETE arrives. */
const STALL_BEFORE_CANCEL_MS = 2_000;

describe('a DELETE ends a live mid-step run inside the deployed grace (source: delete)', () => {
  for (const kind of Object.keys(STALLS) as StallKind[]) {
    for (let sample = 1; sample <= SAMPLES; sample += 1) {
      it(`${kind} stall, sample ${String(sample)}/${String(SAMPLES)}`, async () => {
        const pod = await startPod();
        const job = jobOf(STALLS[kind]());
        await admit(pod, job.body);

        const forkPid = await untilStepRunning(pod, 1);
        const tree = watchTree(forkPid);
        // Let the step stall for a while, so the recorder has seconds of frames to finalize rather
        // than the few milliseconds after the step began.
        await new Promise<void>((resolve) => setTimeout(resolve, STALL_BEFORE_CANCEL_MS));
        // The tree is fully up; stop polling `ps` so it cannot perturb the timings below.
        tree.stop();
        const child = pod.spawner.children.at(-1);
        if (child === undefined) throw new Error('no child was spawned');

        const orderedAt = performance.now();
        const answered = await del(pod.harness.port, `/v1/runs/${job.id}`);
        expect(answered.status).toBe(202);
        expect(JSON.parse(answered.body)).toMatchObject({ code: 'CANCELLING' });

        await untilIdle(pod);
        await expectTreeGone(forkPid, tree.seen);

        const stopSentAt = child.stopSentAt ?? Number.NaN;
        const exitAt = child.exitAt ?? Number.NaN;
        const stopToExitMs = exitAt - stopSentAt;
        const graceHonoured = child.killedAt === null;
        record(`DELETE mid-step, ${kind} #${String(sample)}`, {
          fixture: kind,
          grace: graceHonoured ? 'honoured' : 'exceeded',
          deleteToStopMs: stopSentAt - orderedAt,
          stopToResultMs: (child.resultAt ?? Number.NaN) - stopSentAt,
          stopToExitMs,
          deleteToFinalMs: finalAt(pod) - orderedAt,
        });

        // Only the DELETE: no control read was ever answered, and no ack said anything.
        expect(cancelLines(pod, job.id).map((line) => line.fields.source)).toEqual(['delete']);
        expect(pod.harness.http.controlRequests).toHaveLength(0);

        const final = finalOf(pod);
        expectCancelled(final);
        expect(final.outcome?.errorMessage).toBe(CANCELLED_MESSAGE);
        expect(final.steps.find((step) => step.stepIndex === 0)?.status).toBe('PASS');
        expectInterruptedStepSkipped(final, 1);

        // D3: the ordered stop fits the production grace, so nothing was signalled…
        expect(graceHonoured, `the ordered stop took ${String(round(stopToExitMs))} ms`).toBe(true);
        expect(stopToExitMs).toBeLessThan(DEPLOYED_GRACE_MS);
        // …and the recorder closed in order, so the recording is whole and stored (§17.4).
        expect(final.evidence?.state).toBe('STORED');
        expect(final.evidence?.partial).toBe(false);
        expectHonestEvidence(pod, final, `studio/${job.id}/video.webm`);

        // §2.7: DELETE → child exit ≤ 6 s; cancel → FINAL ≤ 15 s in-process.
        expect(exitAt - orderedAt).toBeLessThan(6_000);
        expect(finalAt(pod) - orderedAt).toBeLessThan(15_000);

        expectScratchCleared(pod);
        if (sample === 1) await expectNextRunPasses(pod);
      }, 180_000);
    }
  }
});

// ── (b) the owner's real control poll, and nothing else ──────────────────────────────────────

describe('the real 2 s control poll stops a run nobody sent a DELETE to (source: control)', () => {
  it('observes the recorded cancel within one interval plus a read', async () => {
    let recorded = false;
    let recordedAt = Number.NaN;
    const pod = await startPod({ controlTimers: SYSTEM_DEADLINE_TIMERS });
    pod.harness.http.controlOutcome = () => ({
      kind: 'response',
      status: 200,
      body: JSON.stringify({ cancelRequested: recorded }),
    });
    const job = jobOf(STALLS.navigation());
    await admit(pod, job.body);
    const forkPid = await untilStepRunning(pod, 1);
    const tree = watchTree(forkPid);

    // The API records the cancel. Nothing is relayed.
    recorded = true;
    recordedAt = performance.now();

    await untilIdle(pod);
    tree.stop();
    await expectTreeGone(forkPid, tree.seen);

    const lines = cancelLines(pod, job.id);
    expect(lines.map((line) => line.fields.source)).toEqual(['control']);
    const observedAfterMs = (lines[0]?.at ?? Number.NaN) - recordedAt;
    record('poll only', {
      observedAfterMs,
      reads: pod.harness.http.controlRequests.length,
      recordedToFinalMs: finalAt(pod) - recordedAt,
    });
    expect(observedAfterMs).toBeLessThanOrEqual(CONTROL_POLL_INTERVAL_MS + 1_000);
    expect(pod.harness.http.controlRequests.length).toBeGreaterThan(0);
    expect(pod.harness.http.controlRequests[0]?.url).toBe(
      `https://api.internal.example/internal/studio/executions/${job.id}/control`,
    );

    const final = finalOf(pod);
    expectCancelled(final);
    expectInterruptedStepSkipped(final, 1);
    expectHonestEvidence(pod, final, `studio/${job.id}/video.webm`);
    expectScratchCleared(pod);
    // Once the outcome is known the poll stops: no read after the FINAL.
    const readsAtFinal = pod.harness.http.controlRequests.length;
    await new Promise<void>((resolve) => setTimeout(resolve, CONTROL_POLL_INTERVAL_MS + 500));
    expect(pod.harness.http.controlRequests).toHaveLength(readsAtFinal);

    await expectNextRunPasses(pod);
  }, 180_000);
});

// ── (c) the progress acknowledgement, and nothing else ───────────────────────────────────────

describe('a PROGRESS acknowledgement carrying cancelRequested stops the run (source: progress-ack)', () => {
  it('stops mid-step on the ack of "step 1 is running", and step 2 never starts', async () => {
    const pod = await startPod();
    // The API's answer: a cancel is recorded from the moment step 1 was reported running. The
    // acknowledgements before that one say nothing.
    pod.harness.http.reportOutcome = (request) => {
      const body = JSON.parse(request.body) as ReportBody;
      const stepOneRunning = body.steps.some(
        (step) => step.stepIndex === 1 && step.status === 'RUNNING',
      );
      return {
        kind: 'response',
        status: 200,
        body: JSON.stringify({ cancelRequested: stepOneRunning }),
      };
    };
    const job = jobOf([gotoStall(), waitForNever, gotoHome()]);
    await admit(pod, job.body);
    await untilMs(() => (pod.spawner.children[0]?.handle.pid ?? 0) > 0, 30_000);
    const forkPid = pod.spawner.children[0]?.handle.pid ?? 0;
    const tree = watchTree(forkPid);

    await untilIdle(pod);
    tree.stop();
    await expectTreeGone(forkPid, tree.seen);

    expect(cancelLines(pod, job.id).map((line) => line.fields.source)).toEqual(['progress-ack']);
    expect(pod.harness.http.controlRequests).toHaveLength(0);

    const final = finalOf(pod);
    expectCancelled(final);
    expect(final.steps.find((step) => step.stepIndex === 0)?.status).toBe('PASS');
    expectInterruptedStepSkipped(final, 1);
    // Step 2 never started: no report ever had it running, and nothing carries a reading for it.
    for (const report of pod.reports) {
      const two = report.body.steps.find((step) => step.stepIndex === 2);
      expect(two?.status ?? 'absent').not.toBe('RUNNING');
      expect(two?.startedAtMs ?? null).toBeNull();
    }
    expect(JSON.stringify(final.logs)).not.toContain('step 2 started');
    record('ack only', {
      stepTwo: final.steps.find((step) => step.stepIndex === 2)?.status ?? 'absent',
    });
    expectHonestEvidence(pod, final, `studio/${job.id}/video.webm`);
    expectScratchCleared(pod);

    pod.harness.http.reportOutcome = { kind: 'response', status: 200, body: '{"cancelRequested":false}' };
    await expectNextRunPasses(pod);
  }, 180_000);
});

// ── (d) and (e) the admission window ─────────────────────────────────────────────────────────

/** Every pid below this process that is still there a moment later — `ps` is briefly one. */
async function stableProcessesBelowUs(): Promise<readonly number[]> {
  const first = new Set(descendantsOf(process.pid));
  await new Promise((resolve) => setTimeout(resolve, 120));
  return [...descendantsOf(process.pid)].filter((pid) => first.has(pid)).sort((a, b) => a - b);
}

describe('a cancel before the browser exists starts none (source: delete)', () => {
  it('cancelled synchronously after admission: no fork, no STARTED, ERROR/CANCELLED', async () => {
    const pod = await startPod();
    const before = await stableProcessesBelowUs();
    const job = jobOf(STALLS.navigation());

    // `submit` resolves at the `202`, with the run parked on `scratch.create`'s real I/O — so a
    // cancel issued in the same continuation is always seen by `refuseIfCancelled`.
    const decision = await pod.harness.app.coordinator.submit(job.body);
    expect(decision.status).toBe(202);
    expect(pod.harness.app.coordinator.cancel(job.id)).toEqual({ status: 202, code: 'CANCELLING' });

    await untilIdle(pod);

    expect(pod.spawner.children, 'a child process was forked for a cancelled run').toHaveLength(0);
    expect(await stableProcessesBelowUs()).toEqual(before);
    expect(pod.reports.some((report) => report.body.kind === 'STARTED')).toBe(false);
    expect(cancelLines(pod, job.id).map((line) => line.fields.source)).toEqual(['delete']);

    const final = finalOf(pod);
    expectCancelled(final);
    expect(final.outcome?.errorMessage).toContain('before its browser was launched');
    expect(final.browserStartedAt).toBeNull();
    expect(final.steps).toEqual([]);
    expect(final.evidence).toMatchObject({ state: 'UNAVAILABLE', partial: false });
    expectScratchCleared(pod);

    await expectNextRunPasses(pod);
  }, 180_000);

  it('cancelled while the browser is launching: stopped before any step, whichever branch ran', async () => {
    const pod = await startPod();
    const job = jobOf(STALLS.navigation());
    await pod.harness.app.coordinator.submit(job.body);

    // The fork exists as soon as `launch` begins; Chromium takes a second or so more.
    await untilMs(() => (pod.spawner.children[0]?.handle.pid ?? 0) > 0, 30_000);
    const forkPid = pod.spawner.children[0]?.handle.pid ?? 0;
    const tree = watchTree(forkPid);
    const cancelledAt = performance.now();
    expect(pod.harness.app.coordinator.cancel(job.id).status).toBe(202);

    await untilIdle(pod);
    tree.stop();
    await expectTreeGone(forkPid, tree.seen);

    const final = finalOf(pod);
    expectCancelled(final);
    // Both branches are correct; which one ran is recorded, the invariants are asserted.
    const branch = String(final.outcome?.errorMessage);
    expect([
      'The run was cancelled while its browser was starting; no browser step ran.',
      CANCELLED_MESSAGE,
    ]).toContain(branch);
    record('cancel during launch', {
      branch: branch === CANCELLED_MESSAGE ? 'after-ready (kill path)' : 'while-starting',
      cancelToFinalMs: finalAt(pod) - cancelledAt,
      pidsSeen: tree.seen.size,
    });
    expect(cancelLines(pod, job.id).map((line) => line.fields.source)).toEqual(['delete']);
    // No step was ever sent a start.
    for (const report of pod.reports) {
      for (const step of report.body.steps) expect(step.startedAtMs).toBeNull();
    }
    expect(JSON.stringify(final.logs)).not.toMatch(/step \d+ started/u);
    expectHonestEvidence(pod, final, `studio/${job.id}/video.webm`);
    expectScratchCleared(pod);

    await expectNextRunPasses(pod);
  }, 180_000);
});

// ── (f) the grace runs out ───────────────────────────────────────────────────────────────────

describe('a browser that cannot close in time is killed by tree at the grace', () => {
  it('signals the tree at the grace, records the recording honestly, and still delivers CANCELLED', async () => {
    const pod = await startPod();
    const job = jobOf(STALLS.navigation());
    await admit(pod, job.body);
    const forkPid = await untilStepRunning(pod, 1);
    const tree = watchTree(forkPid);
    tree.stop();
    const child = pod.spawner.children.at(-1);
    if (child === undefined) throw new Error('no child was spawned');

    // The browser stops answering: the child's ordered close can now never return.
    for (const pid of tree.seen) {
      try {
        process.kill(pid, 'SIGSTOP');
        suspended.push(pid);
      } catch {
        // Gone already.
      }
    }

    const orderedAt = performance.now();
    expect((await del(pod.harness.port, `/v1/runs/${job.id}`)).status).toBe(202);
    await untilIdle(pod);
    await expectTreeGone(forkPid, tree.seen);

    const killAfterMs = (child.killedAt ?? Number.NaN) - (child.stopSentAt ?? Number.NaN);
    record('grace exceeded', {
      fixture: 'navigation',
      grace: 'exceeded',
      stopToKillMs: killAfterMs,
      deleteToExitMs: (child.exitAt ?? Number.NaN) - orderedAt,
      deleteToFinalMs: finalAt(pod) - orderedAt,
    });
    // §2.7: the group signal lands at the grace, ± 750 ms.
    expect(child.killedAt).not.toBeNull();
    expect(killAfterMs).toBeGreaterThanOrEqual(DEPLOYED_GRACE_MS - 50);
    expect(killAfterMs).toBeLessThanOrEqual(DEPLOYED_GRACE_MS + 750);

    const final = finalOf(pod);
    expectCancelled(final);
    expect(final.outcome?.errorMessage).toBe(CANCELLED_MESSAGE);
    expectInterruptedStepSkipped(final, 1);
    expect(cancelLines(pod, job.id).map((line) => line.fields.source)).toEqual(['delete']);
    record('grace exceeded evidence', {
      state: String(final.evidence?.state),
      partial: String(final.evidence?.partial),
      logs: JSON.stringify(final.logs.filter((entry) => entry.level === 'error')),
    });
    // The ordered stop did not complete. Which file the suspended recorder left is the machine's
    // business — measured here, a 0-byte file with no header, so `FAILED` — but the rule is not: a
    // stored prefix is partial, and a recording that was not stored is not (§17.3, §17.7 item 1).
    if (final.evidence?.state === 'STORED') expect(final.evidence.partial).toBe(true);
    else expect(final.evidence?.partial).toBe(false);
    expectHonestEvidence(pod, final, `studio/${job.id}/video.webm`);
    expectScratchCleared(pod);

    await expectNextRunPasses(pod);
  }, 180_000);
});

// ── (h) two pods: the DELETE reaches the wrong one ───────────────────────────────────────────

describe('two runner instances: the DELETE lands on the pod that does not hold the run', () => {
  it('answers 404 there, and the owner still stops through its real poll', async () => {
    // The API's view, shared by both pods: a cancel is recorded or it is not.
    let recorded = false;
    const answer = (): { kind: 'response'; status: 200; body: string } => ({
      kind: 'response',
      status: 200,
      body: JSON.stringify({ cancelRequested: recorded }),
    });
    const owner = await startPod({ instanceId: 'runner-a', controlTimers: SYSTEM_DEADLINE_TIMERS });
    const other = await startPod({ instanceId: 'runner-b', controlTimers: SYSTEM_DEADLINE_TIMERS });
    owner.harness.http.controlOutcome = answer;
    other.harness.http.controlOutcome = answer;

    const job = jobOf(STALLS.navigation());
    await admit(owner, job.body);
    const forkPid = await untilStepRunning(owner, 1);
    const tree = watchTree(forkPid);

    // The API records the cancel and relays it through the Service, which picks the other pod.
    recorded = true;
    const recordedAt = performance.now();
    const relayed = await del(other.harness.port, `/v1/runs/${job.id}`);
    expect(relayed.status).toBe(404);
    expect(JSON.parse(relayed.body)).toMatchObject({ code: 'RUN_NOT_FOUND' });

    await untilIdle(owner);
    tree.stop();
    await expectTreeGone(forkPid, tree.seen);

    const lines = cancelLines(owner, job.id);
    expect(lines.map((line) => line.fields.source)).toEqual(['control']);
    record('two pods, wrong-pod DELETE', {
      ownerObservedAfterMs: (lines[0]?.at ?? Number.NaN) - recordedAt,
      recordedToFinalMs: finalAt(owner) - recordedAt,
    });
    expect((lines[0]?.at ?? Number.NaN) - recordedAt).toBeLessThanOrEqual(
      CONTROL_POLL_INTERVAL_MS + 1_000,
    );
    // The other pod never held it: no report, no child, no cancel line, no browser.
    expect(other.reports).toHaveLength(0);
    expect(other.spawner.children).toHaveLength(0);
    expect(cancelLines(other, job.id)).toHaveLength(0);

    const final = finalOf(owner);
    expectCancelled(final);
    expect(final.runnerInstanceId).toBe('runner-a');
    expectInterruptedStepSkipped(final, 1);
    expectHonestEvidence(owner, final, `studio/${job.id}/video.webm`);
    expectScratchCleared(owner);

    // The freed capacity is real on the owner, and the other pod runs work too.
    await expectNextRunPasses(owner);
    await expectNextRunPasses(other);
  }, 240_000);
});
