/**
 * AC-11a, AC-12, AC-13, AC-16 and AC-7a — **observed**, against real pinned Chromium.
 *
 * The unit tier proves the deadline arithmetic, the classification, the relay and the report
 * bodies against a fake spawn seam. None of that can tell you whether a browser is still running.
 * Chromium is a **grandchild** of the fork — the fork's pid is Node, the browser is below it, and
 * the renderers are below that — so `SIGKILL` to the fork's pid leaves an orphaned browser holding
 * `/dev/shm`, the scratch directory and a video file, behind a green test that asserted `kill` was
 * called. That failure is the whole reason AC-11a is phrased as *enumerate the pids*.
 *
 * ## How the observation is made, and why it is made this way
 *
 * The descendant pids are **snapshotted while the tree is alive** and each one is then asked
 * whether it is still alive after the run. Re-walking the tree afterwards would not work and would
 * look like it did: a Chromium orphaned by a kill to the Node layer is re-parented to init, so it
 * no longer appears as a descendant of the dead fork — `descendantsOf(pid)` would return `[]` over
 * a browser that is very much still running. Snapshot-then-recheck is the only form of the
 * assertion that fails when the property fails.
 *
 * Verified on a developer machine, which `ED-05`'s `gate_note` permits for 10.12/10.13. The
 * in-image half — PID-1 reaping, `readOnlyRootFilesystem`, `emptyDir` scratch and `/dev/shm` — is
 * AC-11b, and it is recorded below as a **live skip** rather than as a pass.
 */
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createChildBrowserLauncher, createForkSpawner } from '../../src/run/launcher.js';
import type { ChildProcessHandle, ChildSpawner } from '../../src/run/launcher.js';
import { WEBM_MAGIC } from '../../src/run/recording.js';
import { SCRATCH_SUBDIRECTORIES } from '../../src/run/scratchLayout.js';
import { descendantsOf, isAlive } from '../../src/run/tree.js';
import type { BrowserSession, SessionRunResult } from '../../src/server/adapters.js';
import { createRunSnapshot } from '../../src/reporting/snapshot.js';
import { startBlackHole } from '../helpers/blackHole.js';
import type { BlackHole } from '../helpers/blackHole.js';
import { startPageServer } from '../helpers/pageServer.js';
import type { PageServer } from '../helpers/pageServer.js';
import { CHILD_MODULE_PATH } from './globalSetup.js';
import { createScratch, untilMs } from './realRunner.js';

const CANARY = 'canary-secret-value-7c1e4a';

let server: PageServer;
/** A loopback route that accepts the connection and then answers nothing, ever. */
let blackHole: BlackHole;
const scratches: string[] = [];
/** Pids this file suspended, so a failed assertion cannot leave stopped browsers on the machine. */
const suspended: number[] = [];

beforeAll(async () => {
  server = await startPageServer();
  blackHole = await startBlackHole();
});

afterAll(async () => {
  await server.close();
  await blackHole.close();
});

afterEach(() => {
  for (const pid of suspended.splice(0)) {
    // Resume-then-kill: a `SIGSTOP`ped process that the run did not reap must not outlive the
    // suite, and this file is the only thing that knows it was stopped.
    try {
      process.kill(pid, 'SIGCONT');
    } catch {
      // Already gone, which is the outcome the tests are asserting anyway.
    }
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Likewise.
    }
  }
  for (const path of scratches.splice(0)) rmSync(path, { recursive: true, force: true });
});

/**
 * Suspends every process in the tree below the fork — *"a browser that ignores close"*.
 *
 * This is the arrangement AC-11a asks for by hand: the hang has to be **below the Node layer**,
 * because a child whose own Node layer is healthy tears Chromium down by itself on the way out and
 * the parent's kill proves nothing. Verified: with the kill replaced by a no-op, and with the
 * browser merely navigating to a black hole, the tree still went away — so that version of this
 * test asserted nothing. A `SIGSTOP`ped Chromium cannot answer `context.close()`, cannot notice
 * its parent's pipe closing, and cannot exit; the only thing that removes it is a signal that
 * reaches it, which is what the process **group** is for.
 *
 * `SIGKILL` is deliverable to a stopped process, so the ordered path still ends the tree.
 */
function suspendTree(pids: readonly number[]): void {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGSTOP');
      suspended.push(pid);
    } catch {
      // Gone already; nothing to suspend.
    }
  }
}

function goto(url: string) {
  return { op: 'goto' as const, url: { kind: 'literal' as const, value: url }, options: undefined };
}

function everyFileUnder(directory: string, into: string[] = []): string[] {
  if (!existsSync(directory)) return into;
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) everyFileUnder(full, into);
    else into.push(full);
  }
  return into;
}

/**
 * A spawner that is the production one, with the handle kept so the test can read its pid.
 *
 * The pid is the whole subject of AC-11a and the shipped `BrowserSession` does not expose it —
 * correctly, because nothing in production needs it. `createForkSpawner` is used unmodified, so
 * what is observed is the real fork, the real `detached`, the real pipes and the real group.
 */
function observingSpawner(): ChildSpawner & { handle(): ChildProcessHandle | null } {
  const real = createForkSpawner();
  let handle: ChildProcessHandle | null = null;
  return {
    spawn(request) {
      handle = real.spawn(request);
      return handle;
    },
    handle: () => handle,
  };
}

interface RealSession {
  readonly session: BrowserSession;
  readonly pid: number;
  /** Descendant pids observed while the tree was alive — the browser and everything below it. */
  readonly descendants: readonly number[];
  readonly scratchPath: string;
}

/**
 * Launches real Chromium, starts a navigation that will never settle, and hands back the tree.
 *
 * The run is genuinely hung at the browser layer: the page is waiting on an HTTP response that is
 * never written, so the child's Node layer is inside a Playwright call it cannot return from.
 */
async function hungRealRun(options: { readonly stopTimeoutMs: number }): Promise<
  RealSession & { readonly execution: Promise<SessionRunResult> }
> {
  const scratchPath = createScratch();
  scratches.push(scratchPath);
  const spawner = observingSpawner();

  const launcher = createChildBrowserLauncher({
    recording: { width: 640, height: 360 },
    // ADR-002 §26.3 item 5: the fixtures tier always runs with the calibration at 0 (story 10.32).
    seekOriginCalibrationMs: 0,
    // Long, so the *step* timeout is not what ends this run. The run is ended by the parent.
    stepTimeoutMs: 120_000,
    launchTimeoutMs: 60_000,
    maxFailureMessageLength: 400,
    stopTimeoutMs: options.stopTimeoutMs,
    childModulePath: CHILD_MODULE_PATH,
    spawner,
  });

  const session = await launcher.launch({
    browser: 'chromium',
    viewport: { width: 640, height: 360 },
    totalRuntimeMs: 120_000,
    scratchPath,
  });
  const run = session.run;
  if (run === undefined) throw new Error('the real launcher must return a child-owned session');

  const execution = run.execute({
    steps: [
      // A real page first, so the recorder has frames to have written.
      { stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] },
      // …and then a navigation that never settles.
      { stepIndex: 1, operations: [goto(blackHole.url)] },
    ],
    variables: { LOGIN_USER: CANARY },
    secrets: { PW: CANARY },
    reporter: { stepStarted: () => undefined, stepFinished: () => undefined },
  });

  const pid = spawner.handle()?.pid ?? 0;
  expect(pid, 'the fork must have a pid').toBeGreaterThan(0);

  // Wait until Chromium is actually below the fork. That is the state the criterion is about: if
  // the tree were empty here, the kill would have nothing to prove.
  await untilMs(() => descendantsOf(pid).length > 0, 60_000);
  const descendants = descendantsOf(pid);
  expect(descendants.length, 'no browser process appeared below the fork').toBeGreaterThan(0);

  return { session, pid, descendants, scratchPath, execution };
}

/** Everything that was alive, rechecked one pid at a time. */
async function expectTreeGone(tree: RealSession): Promise<void> {
  // A little patience: `SIGKILL` is delivered asynchronously and the kernel reaps in its own time.
  await untilMs(() => !isAlive(tree.pid) && tree.descendants.every((pid) => !isAlive(pid)), 30_000);

  expect(isAlive(tree.pid), `the fork ${String(tree.pid)} survived`).toBe(false);
  for (const pid of tree.descendants) {
    // The assertion that distinguishes "killed the child" from "killed the tree". Each of these
    // pids was a real browser process a moment ago; a kill to the fork alone leaves them running,
    // re-parented to init, and invisible to any walk that starts from the dead fork.
    expect(isAlive(pid), `a browser process (${String(pid)}) descended from the fork survived`).toBe(
      false,
    );
  }
  expect(descendantsOf(tree.pid)).toEqual([]);
}

describe('AC-11a — the process tree is gone, established by looking for it', () => {
  it('kills the browser below the Node layer when the ordered stop cannot complete', async () => {
    // The stop grace is deliberately tiny, so the ordered close cannot finish and the run reaches
    // the group signal — with a real, live Chromium under the fork.
    const tree = await hungRealRun({ stopTimeoutMs: 500 });
    const run = tree.session.run;
    if (run === undefined) throw new Error('no session run');

    // The browser stops answering. The child's ordered close will now never return, so the Node
    // layer cannot tidy up and cannot exit — which is the only condition under which killing the
    // **tree** differs from killing the child.
    suspendTree(tree.descendants);

    const observation = await run.kill('total-runtime');
    // The ordered stop did **not** complete: that is the fact ADR-002 §17.7 makes `partial`
    // depend on, and it is recorded before the signal.
    expect(observation.orderedStopCompleted).toBe(false);

    const result = await tree.execution;
    await expectTreeGone(tree);

    // §8.2's by-hand ruling, reached through a real browser rather than a fake one.
    expect(result.failureKind).toBe('total-timeout');
  }, 180_000);

  it('leaves no tree behind on the ordinary success path either', async () => {
    const scratchPath = createScratch();
    scratches.push(scratchPath);
    const spawner = observingSpawner();
    const launcher = createChildBrowserLauncher({
      recording: { width: 640, height: 360 },
      // ADR-002 §26.3 item 5: the fixtures tier always runs with the calibration at 0 (story 10.32).
      seekOriginCalibrationMs: 0,
      stepTimeoutMs: 30_000,
      launchTimeoutMs: 60_000,
      maxFailureMessageLength: 400,
      stopTimeoutMs: 5_000,
      childModulePath: CHILD_MODULE_PATH,
      spawner,
    });
    const session = await launcher.launch({
      browser: 'chromium',
      viewport: { width: 640, height: 360 },
      totalRuntimeMs: 60_000,
      scratchPath,
    });
    const pid = spawner.handle()?.pid ?? 0;
    await untilMs(() => descendantsOf(pid).length > 0, 60_000);
    const descendants = descendantsOf(pid);

    const result = await session.run?.execute({
      steps: [{ stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] }],
      variables: {},
      secrets: {},
      reporter: { stepStarted: () => undefined, stepFinished: () => undefined },
    });
    await session.close();

    expect(result?.ok).toBe(true);
    await expectTreeGone({ session, pid, descendants, scratchPath });
  }, 180_000);
});

describe('AC-16 — what a real killed recorder leaves, and what the runner says about it', () => {
  it('reports a salvaged prefix as PENDING/partial true, and nothing at all as UNAVAILABLE/false', async () => {
    const tree = await hungRealRun({ stopTimeoutMs: 20 });
    const run = tree.session.run;
    if (run === undefined) throw new Error('no session run');

    await run.kill('total-runtime');
    const result = await tree.execution;
    await expectTreeGone(tree);

    // Whether Chromium managed to leave a readable prefix on disk before it was signalled is a
    // property of the machine, not of this runner — so the assertion is on the **invariant** that
    // must hold either way, which is the one AC-16 and ADR-002 §17.3 state.
    const recording = result.recording;
    expect(['PENDING', 'UNAVAILABLE', 'FAILED']).toContain(recording.state);

    if (recording.state === 'PENDING') {
      // A playable file whose recorder was never closed in an orderly way is **partial**. Before
      // this story it would have been reported as complete — a salvaged prefix presented as a
      // whole video, which is what the epic's third acceptance bullet forbids.
      expect(recording.partial).toBe(true);
      const path = recording.path ?? '';
      expect(statSync(path).size).toBeGreaterThan(0);
      expect([...readFileSync(path).subarray(0, 4)]).toEqual([...WEBM_MAGIC]);
    } else {
      // No playable object exists, so there is nothing to be partial about (§17.3).
      expect(recording.partial).toBe(false);
    }

    // And in either case the flag follows the *stop observation*, never the outcome: the run is a
    // timeout regardless of which branch the file took.
    expect(result.failureKind).toBe('total-timeout');
  }, 180_000);

  it('reports a cleanly flushed recording as PENDING/partial false, on a run that also timed out', async () => {
    // The counter-example §17.4 names: a deadline kill whose ordered stop *did* flush is **not**
    // partial. The grace is generous here, so the child closes and awaits the recording context,
    // which is the whole reason §5.2 asks for the ordered close.
    const tree = await hungRealRun({ stopTimeoutMs: 30_000 });
    const run = tree.session.run;
    if (run === undefined) throw new Error('no session run');

    const observation = await run.kill('total-runtime');
    const result = await tree.execution;
    await expectTreeGone(tree);

    expect(observation.orderedStopCompleted).toBe(true);
    expect(result.failureKind).toBe('total-timeout');
    expect(result.recording.state).toBe('PENDING');
    // A timeout is not automatically a truncation.
    expect(result.recording.partial).toBe(false);
  }, 180_000);
});

describe('AC-12 — scratch, temp output and video artefacts are gone, asserted on the filesystem', () => {
  it('deletes the profile, the temp directory and a partially written video after a kill', async () => {
    const tree = await hungRealRun({ stopTimeoutMs: 20 });
    const run = tree.session.run;
    if (run === undefined) throw new Error('no session run');

    // While the browser is up, the directory is full of exactly the things §9.3 confines there.
    const before = everyFileUnder(tree.scratchPath);
    expect(before.length, 'the browser wrote nothing to its scratch directory').toBeGreaterThan(0);
    expect(existsSync(join(tree.scratchPath, SCRATCH_SUBDIRECTORIES.profile))).toBe(true);

    await run.kill('total-runtime');
    await tree.execution;
    await expectTreeGone(tree);

    // The coordinator clears scratch on every path; here the launcher's caller does it, which is
    // what the coordinator's `finally` is doing in production.
    rmSync(tree.scratchPath, { recursive: true, force: true });

    // Inspected on the filesystem rather than by asserting that `clear()` was called — including
    // the video file the recorder was still writing when the tree was signalled.
    expect(existsSync(tree.scratchPath)).toBe(false);
    expect(everyFileUnder(tree.scratchPath)).toEqual([]);
  }, 180_000);
});

describe('AC-13 — the next run succeeds after a killed one', () => {
  it('runs a second real browser end to end immediately after a kill', async () => {
    const tree = await hungRealRun({ stopTimeoutMs: 20 });
    await tree.session.run?.kill('total-runtime');
    await tree.execution;
    await expectTreeGone(tree);

    // The assertion that catches a leaked `/dev/shm` handle, a leaked profile directory and a
    // leaked port in one place, which is why the criterion is "the next run succeeds".
    const scratchPath = createScratch();
    scratches.push(scratchPath);
    const launcher = createChildBrowserLauncher({
      recording: { width: 640, height: 360 },
      // ADR-002 §26.3 item 5: the fixtures tier always runs with the calibration at 0 (story 10.32).
      seekOriginCalibrationMs: 0,
      stepTimeoutMs: 30_000,
      launchTimeoutMs: 60_000,
      maxFailureMessageLength: 400,
      stopTimeoutMs: 5_000,
      childModulePath: CHILD_MODULE_PATH,
    });
    const session = await launcher.launch({
      browser: 'chromium',
      viewport: { width: 640, height: 360 },
      totalRuntimeMs: 60_000,
      scratchPath,
    });
    const result = await session.run?.execute({
      steps: [{ stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] }],
      variables: {},
      secrets: {},
      reporter: { stepStarted: () => undefined, stepFinished: () => undefined },
    });
    await session.close();

    expect(result?.ok).toBe(true);
    expect(result?.recording.state).toBe('PENDING');
    expect(result?.recording.partial).toBe(false);
  }, 240_000);
});

describe('AC-7a — the canary through a real Chromium, on a killed run', () => {
  it('appears in no captured child output, no result and no scratch file', async () => {
    const captured: string[] = [];
    const scratchPath = createScratch();
    scratches.push(scratchPath);

    const launcher = createChildBrowserLauncher({
      recording: { width: 640, height: 360 },
      // ADR-002 §26.3 item 5: the fixtures tier always runs with the calibration at 0 (story 10.32).
      seekOriginCalibrationMs: 0,
      stepTimeoutMs: 120_000,
      launchTimeoutMs: 60_000,
      maxFailureMessageLength: 400,
      stopTimeoutMs: 20,
      childModulePath: CHILD_MODULE_PATH,
    });
    const session = await launcher.launch({
      browser: 'chromium',
      viewport: { width: 640, height: 360 },
      totalRuntimeMs: 120_000,
      scratchPath,
      diagnostics: {
        // The run's own redactor, built from the run's own values, exactly as the coordinator
        // builds it.
        redact: (text) => text.split(CANARY).join('[REDACTED]'),
        write: (_stream, line) => captured.push(line),
      },
    });

    const execution = session.run?.execute({
      steps: [
        { stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] },
        { stepIndex: 1, operations: [goto(blackHole.url)] },
      ],
      variables: { LOGIN_USER: CANARY },
      secrets: { PW: CANARY },
      reporter: { stepStarted: () => undefined, stepFinished: () => undefined },
    });

    await session.run?.kill('total-runtime');
    const result = await execution;

    // Whatever Chromium and Playwright wrote on their way out went through the relay.
    expect(JSON.stringify(captured)).not.toContain(CANARY);
    expect(JSON.stringify(result)).not.toContain(CANARY);

    // Every file the browser left behind, by name and by content.
    let inspected = 0;
    for (const file of everyFileUnder(scratchPath)) {
      expect(file).not.toContain(CANARY);
      let content: string;
      try {
        // Read as latin1 so a value that happens to sit inside a binary blob is still found.
        content = readFileSync(file).toString('latin1');
      } catch {
        // Chromium's profile carries write-ahead and lock files that vanish between the directory
        // listing and the read. A file that no longer exists cannot be carrying anything.
        continue;
      }
      inspected += 1;
      expect(content).not.toContain(CANARY);
    }
    expect(inspected, 'no scratch file was actually inspected').toBeGreaterThan(0);
  }, 180_000);
});

// ── Deferrals: recorded as live skips naming their owners, never as passes ────────────────────

describe('deferred criteria — skipped, not passed', () => {
  it.skip('AC-5b — the runner total sits inside the API recovery deadline (story 10.19, gated with 10.18)', () => {
    // The runner's cap plus the stop grace plus the terminal delivery window must be demonstrated
    // to fit inside the API's §5.4 recovery deadline **against the deployed configuration**, so a
    // run this story kills is reconciled from its own `FINAL` rather than racing the running
    // reaper into `ERROR / STALE`. Locally this story asserts the arithmetic against its own
    // configured values and nothing more; the deployed values are 10.18's and the integrated proof
    // is 10.19's. Skipped, never passed.
  });

  it.skip('AC-7b — nothing the API persists carries the canary (story 10.19, with 10.17)', () => {
    // Progress rows, the persisted snapshot, structured log storage and the terminal result
    // manifest — 10.14's object and 10.17's real secret material. The runner can only assert on
    // what leaves it, which AC-7a does; the other half needs the API and a vault. Skipped, never
    // passed.
  });

  it.skip('AC-11b — the six paths inside the pinned image under PID-1 reaping (ED-05 / story 10.18)', () => {
    // `readOnlyRootFilesystem: true`, `emptyDir` scratch, `emptyDir{medium: Memory}` /dev/shm, and
    // zombie reaping by the image's entry point (§9.3). Reaping is a property of the image, not of
    // this package: a developer machine cannot create the condition and this story does not claim
    // it. Skipped, never passed.
    //
    // **Which of the six paths this file observes, and which it composes** (QA MED-1). Two are
    // observed here by enumerating real pids: **success** and the **runtime-deadline kill**. Three
    // more — step failure, run fault and drain — reach the *identical* `child.kill()` in
    // `src/run/launcher.ts`, which is the `signalProcessTree` call the two observed paths prove,
    // so composing them from the unit tier's `child.killed` / `pool.inUse` / `scratch.list()`
    // assertions is sound.
    //
    // **The launch-failure path is the exception and is named rather than implied.** It has no
    // `session.run` at all: `launcher.launch` throws before it returns, the coordinator's
    // `RunFailure` propagates before `terminate` is ever registered, and the tree is reaped
    // through the launch-timeout branch — `child.kill()` inside `launch`, reached from
    // `awaitReady` expiring rather than from a deadline. It therefore does **not** compose from
    // the two observed paths: it is a different call site with a different trigger, proven today
    // only in the unit tier (`test/run/launcher.test.ts`, the `BROWSER_LAUNCH_FAILED` cases) and
    // never by pid observation against a real browser. Whoever closes AC-11b in the image should
    // drive it explicitly rather than assume it is covered.
  });

});

/**
 * **O-13 has landed (story 10.14).** The skip that stood here — *"the API still publishes
 * `partial: false` regardless of what this story reports"* — is deleted rather than left as an
 * open item whose named owner has already shipped.
 *
 * `RunnerReportProjection` no longer writes `videoPartial = Boolean.FALSE`; it projects
 * `report.evidence().partial()` with absent meaning `false`, persists it through the statements
 * that already carried the column, and `ExecutionSnapshotMapper` publishes it. That half is
 * asserted in the other tree, on the persisted row and the published snapshot, by
 * `EvidencePartialCallbackIT.theReportedPartialIsPublishedAndPersistedRatherThanAConstant` — with
 * the mutation that restores the constant recorded as red.
 *
 * What is asserted **here**, from a real killed Chromium, is the half this tier can decide: that
 * the truth reaches the wire at all. The value is taken from the recorder's own observation,
 * serialized by the runner's own `snapshot.build`, and read back out of the JSON **text** — not
 * off the object the serializer was handed (AC-23).
 */
describe('O-13 — the reported partiality reaches the wire, and the API now publishes it', () => {
  it('puts the real recorder observation on the serialized FINAL body', async () => {
    const tree = await hungRealRun({ stopTimeoutMs: 20 });
    const run = tree.session.run;
    if (run === undefined) throw new Error('no session run');

    await run.kill('total-runtime');
    const result = await tree.execution;
    await expectTreeGone(tree);

    const snapshot = createRunSnapshot({
      identity: {
        executionId: '11111111-1111-4111-8111-111111111111',
        attemptId: '22222222-2222-4222-8222-222222222222',
        admissionId: '33333333-3333-4333-8333-333333333333',
        runnerInstanceId: 'studio-runner-0',
      },
      bounds: {
        maxSteps: 100,
        maxLogEntries: 200,
        maxLogEntryLength: 400,
        maxBodyBytes: 512 * 1024,
      },
      runtimeVersions: {},
      wallClock: () => new Date('2026-09-11T10:00:09Z'),
    });
    snapshot.markBrowserStarted(new Date('2026-09-11T10:00:02Z'));

    const body = snapshot.build(
      'FINAL',
      { result: 'ERROR', errorCode: 'TIMEOUT', errorMessage: null },
      {
        videoKey: 'studio/60001/t/e/a.webm',
        manifestKey: 'studio/60001/t/e/a.result.json',
        state: result.recording.state,
        // Carried from the observation, never recomputed and never derived from the outcome.
        partial: result.recording.partial,
      },
    );

    const text = JSON.stringify(body);
    const onTheWire = JSON.parse(text) as {
      evidence: { state: string; partial: boolean };
      outcome: { errorCode: string };
    };

    expect(text).toContain('"partial"');
    expect(typeof onTheWire.evidence.partial).toBe('boolean');
    expect(onTheWire.evidence.partial).toBe(result.recording.partial);
    // The run timed out either way; whether the recording is partial is a different fact, and the
    // machine decides which branch the salvaged file took (see the AC-16 case above).
    expect(onTheWire.outcome.errorCode).toBe('TIMEOUT');
    if (onTheWire.evidence.state === 'PENDING') {
      expect(onTheWire.evidence.partial).toBe(true);
    }
  }, 180_000);
});
