/**
 * AC-5, AC-7, AC-8, AC-9, AC-10, AC-15 — the child, in process.
 *
 * The child runtime is written against a `BrowserFactory` seam rather than against Playwright, so
 * every one of its branches runs here without launching anything: the four exit paths, the paired
 * origin read, the evidence vocabulary in all three of its states, the popup refusal, and the
 * property AC-8 is really about — **evidence and outcome are independent, in both directions**.
 *
 * `test/fixtures-tier/` drives the same code against real Chromium (AC-18a); this keeps the unit
 * tier browser-free (AC-25).
 */
import { describe, expect, it } from 'vitest';

import {
  TAIL_SETTLE_BOUND_MS,
  TAIL_SETTLE_HOLD_MS,
  TAIL_SETTLE_LOAD_TIMEOUT_MS,
  attachChildRuntime,
  failureKindOf,
} from '../../src/run/childRuntime.js';
import type { ChildChannel } from '../../src/run/childRuntime.js';
import { PROTOCOL_VERSION } from '../../src/run/protocol.js';
import type { ChildMessage, ResultMessage } from '../../src/run/protocol.js';
import { createFakeBrowserFactory } from '../helpers/child.js';
import type { FakeBrowserFactory } from '../helpers/child.js';

interface Driver {
  readonly sent: ChildMessage[];
  readonly exits: number[];
  readonly browsers: FakeBrowserFactory;
  /** Every wall-clock hold the child asked for, in order. The driver spends none of them. */
  readonly sleeps: number[];
  send(value: unknown): void;
  /** Resolves once the child has answered `ready` **or** given up, whichever comes first. */
  launched(): Promise<void>;
  /** Resolves once the child has reported a result. */
  settled(): Promise<ResultMessage>;
  result(): ResultMessage | undefined;
  ready(): Extract<ChildMessage, { kind: 'ready' }> | undefined;
}

function createDriver(overrides: { originSource?: Parameters<typeof attachChildRuntime>[0]['originSource'] } = {}): Driver {
  const sent: ChildMessage[] = [];
  const exits: number[] = [];
  const sleeps: number[] = [];
  const browsers = createFakeBrowserFactory();
  let listener: ((value: unknown) => void) | null = null;
  let resolveResult: ((message: ResultMessage) => void) | null = null;
  const settledPromise = new Promise<ResultMessage>((resolve) => {
    resolveResult = resolve;
  });
  let resolveLaunched: (() => void) | null = null;
  const launchedPromise = new Promise<void>((resolve) => {
    resolveLaunched = resolve;
  });

  const channel: ChildChannel = {
    onMessage(next: (value: unknown) => void): void {
      listener = next;
    },
    send(message: ChildMessage): void {
      sent.push(message);
      if (message.kind === 'ready') resolveLaunched?.();
      if (message.kind === 'result') {
        resolveLaunched?.();
        resolveResult?.(message);
      }
    },
    exit(code: number): void {
      exits.push(code);
    },
  };

  attachChildRuntime({
    channel,
    browsers,
    originSource: overrides.originSource,
    // The file itself is 10.14's business; what this tier exercises is the *vocabulary* the
    // observation maps onto. The fixtures tier reads a real webm off disk (AC-7).
    inspectRecording: (path, orderlyClose) =>
      Promise.resolve({
        attempted: true,
        path,
        bytes: path === null ? null : 24_576,
        header: path !== null,
        error: null,
        orderlyClose,
      }),
    // The tail settle's hold is observed, not spent: the unit tier stays sleep-free (AC-25).
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });

  return {
    sent,
    exits,
    sleeps,
    browsers,
    send(value: unknown): void {
      listener?.(value);
    },
    launched: () => launchedPromise,
    settled: () => settledPromise,
    result: () => sent.find((message): message is ResultMessage => message.kind === 'result'),
    ready: () =>
      sent.find((message): message is Extract<ChildMessage, { kind: 'ready' }> =>
        message.kind === 'ready',
      ),
  };
}

function launchMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'launch',
    protocolVersion: PROTOCOL_VERSION,
    runId: 'run-1',
    browser: 'chromium',
    viewport: { width: 1280, height: 720 },
    recording: { width: 1280, height: 720 },
    seekOriginCalibrationMs: 0,
    scratchPath: '/scratch/run-1',
    totalRuntimeMs: 120_000,
    ...overrides,
  };
}

function executeMessage(
  steps: unknown[] = defaultSteps(),
  secretOrigins: Record<string, string[]> = { PW: ['http://127.0.0.1'] },
): Record<string, unknown> {
  return {
    kind: 'execute',
    protocolVersion: PROTOCOL_VERSION,
    stepTimeoutMs: 5_000,
    steps,
    variables: {},
    secrets: { PW: 'canary-secret-value' },
    secretOrigins,
    maxFailureMessageLength: 400,
  };
}

/** Lets the child's queued phases settle without depending on how many microtasks they take. */
async function tick(times = 8): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

function defaultSteps(): unknown[] {
  return [
    {
      stepIndex: 0,
      operations: [{ op: 'goto', url: { kind: 'literal', value: 'http://127.0.0.1:8123/' } }],
    },
    {
      stepIndex: 1,
      operations: [
        {
          op: 'fill',
          locator: { segments: [{ kind: 'getByTestId', testId: { kind: 'literal', value: 'password' } }] },
          value: { kind: 'secret', id: 'PW' },
        },
      ],
    },
  ];
}

async function runOnce(
  driver: Driver,
  steps?: unknown[],
  secretOrigins?: Record<string, string[]>,
): Promise<ResultMessage> {
  driver.send(launchMessage());
  await driver.launched();
  driver.send(executeMessage(steps, secretOrigins));
  return await driver.settled();
}

describe('AC-10 — the origin is taken at recording readiness, and reported once', () => {
  it('answers ready with the paired reads before any step runs', async () => {
    const driver = createDriver();
    driver.send(launchMessage());
    await driver.launched();

    const ready = driver.ready();
    expect(ready).toBeDefined();
    expect(ready?.startedAtMs).toBe(0);
    expect(Number.isNaN(Date.parse(ready?.browserStartedAt ?? ''))).toBe(false);
    // Ready comes first, so `BrowserLauncher.launch` resolving means Chromium started (AC-20).
    expect(driver.sent[0]?.kind).toBe('ready');
  });

  it('applies the launch message’s calibration to the origin, and echoes it (story 10.32 AC-3)', async () => {
    // Zero read at 1_000, every later read at 1_300: uncalibrated readings are 300, so at N = 50
    // they are 250. Dropping the calibration at the call site makes them 300 again.
    const readings = [1_000];
    const originSource = {
      monotonicNow: (): number => readings.shift() ?? 1_300,
      wallNow: (): Date => new Date(1_700_000_000_000),
    };
    const driver = createDriver({ originSource });
    driver.send(launchMessage({ seekOriginCalibrationMs: 50 }));
    await driver.launched();
    expect(driver.ready()?.calibrationOffsetMs).toBe(50);
    expect(driver.ready()?.startedAtMs).toBe(0);

    driver.send(executeMessage());
    await driver.settled();
    const starts = driver.sent.filter((message) => message.kind === 'step-started');
    expect(starts.length).toBeGreaterThan(0);
    for (const message of starts) expect(message.startedAtMs).toBe(250);
  });

  it('takes the origin after the browser exists, not before', async () => {
    const driver = createDriver();
    driver.browsers.failNextLaunch(new Error('LaunchFailed: no browser here'));
    driver.send(launchMessage());
    await driver.settled();

    // No origin at all: a failed launch has no browser start to observe, and a report with
    // `browserStartedAt: null` carries no reading (AC-11.4).
    expect(driver.ready()).toBeUndefined();
    expect(driver.result()?.failureKind).toBe('browser-launch');
  });

  it('reports every step reading on the run clock', async () => {
    const driver = createDriver();
    const result = await runOnce(driver);
    expect(result.ok).toBe(true);

    const starts = driver.sent.filter((message) => message.kind === 'step-started');
    expect(starts).toHaveLength(2);
    for (const message of starts) {
      expect(message.startedAtMs).toBeGreaterThanOrEqual(0);
      expect(message.startedAtMs).toBeLessThan(250);
    }
  });
});

describe('AC-6a — a sandbox failure is named as one', () => {
  it('classifies a sandbox launch failure separately from a generic one', async () => {
    const driver = createDriver();
    driver.browsers.failNextLaunch(new Error('No usable sandbox! Update your kernel'));
    driver.send(launchMessage());
    const result = await driver.settled();
    expect(result.failureKind).toBe('sandbox-unavailable');
  });

  it('never launches a second time after a launch failure', async () => {
    const driver = createDriver();
    driver.browsers.failNextLaunch(new Error('No usable sandbox!'));
    driver.send(launchMessage());
    await driver.settled();
    // One attempt, and the requests list is empty because the one attempt never got far enough to
    // record a request. Nothing retried with different arguments (§9.3).
    expect(driver.browsers.requests).toEqual([]);
  });
});

describe('AC-7, AC-9 — the recording, and the words this story may use', () => {
  it('configures the recording geometry explicitly at context creation', async () => {
    const driver = createDriver();
    await runOnce(driver);
    expect(driver.browsers.requests[0]?.recording).toEqual({ width: 1280, height: 720 });
    expect(driver.browsers.requests[0]?.scratchPath).toBe('/scratch/run-1');
  });

  it('reports PENDING for a playable recording, never STORED', async () => {
    const driver = createDriver();
    const result = await runOnce(driver);
    // Storage is 10.14. `PENDING` is the honest interim, and the type cannot express `STORED`.
    expect(result.recording.state).toBe('PENDING');
    expect(result.recording.path).toBe('/scratch/run-1/video/page.webm');
    expect(result.recording.bytes).toBeGreaterThan(0);
    expect(result.recording.error).toBeNull();
  });

  it('reports FAILED when the flush produced no playable file', async () => {
    const driver = createDriver();
    driver.browsers.producedPath = null;
    const result = await runOnce(driver);
    expect(result.recording.state).toBe('FAILED');
    expect(result.recording.error).not.toBeNull();
  });

  it('reports FAILED when closing the context threw', async () => {
    const driver = createDriver();
    driver.browsers.failClose = new Error('TargetClosedError: the context was already gone');
    const result = await runOnce(driver);
    expect(result.recording.state).toBe('FAILED');
    expect(driver.browsers.disposed).toBe(1);
  });
});

describe('AC-8 — evidence and outcome are independent, in both directions', () => {
  it('(i) steps pass, recording fails → the run still passed', async () => {
    const driver = createDriver();
    driver.browsers.producedPath = null;
    const result = await runOnce(driver);

    expect(result.ok).toBe(true);
    // No failure kind: a recording failure is a diagnostic on the report, never a result. The
    // easiest wrong implementation is a `try` around the whole run that turns this into ERROR.
    expect(result.failureKind).toBeNull();
    expect(result.recording.state).toBe('FAILED');
  });

  it('(ii) a step fails, the recording is perfect → the run failed and the evidence did not', async () => {
    const driver = createDriver();
    driver.browsers.page.failOn('goto', new Error('NavigationError: refused'));
    const result = await runOnce(driver);

    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('step');
    expect(result.recording.state).toBe('PENDING');
    expect(result.recording.error).toBeNull();
  });

  it('stops at the first failure and reports the rest as SKIPPED with null timings', async () => {
    const driver = createDriver();
    driver.browsers.page.failOn('goto', new Error('NavigationError: refused'));
    await runOnce(driver);

    const finished = driver.sent.filter((message) => message.kind === 'step-finished');
    expect(finished).toHaveLength(2);
    expect(finished[0]).toMatchObject({ stepIndex: 0, status: 'FAIL' });
    expect(finished[1]).toMatchObject({
      stepIndex: 1,
      status: 'SKIPPED',
      startedAtMs: null,
      finishedAtMs: null,
      durationMs: null,
    });
  });

  it('redacts the canary out of a step failure message', async () => {
    const driver = createDriver();
    driver.browsers.page.failOn(
      'goto',
      new Error('NavigationError: canary-secret-value was rejected'),
    );
    await runOnce(driver);

    const finished = driver.sent.find(
      (message) => message.kind === 'step-finished' && message.status === 'FAIL',
    );
    expect(JSON.stringify(finished)).not.toContain('canary-secret-value');
  });
});

describe('AC-15 — a second page is explicit, never silent', () => {
  it('refuses the run with an unsupported-workflow code and message', async () => {
    const driver = createDriver();
    driver.send(launchMessage());
    await driver.launched();
    driver.browsers.openExtraPage();
    driver.send(executeMessage());
    const result = await driver.settled();

    expect(result.failureKind).toBe('unsupported-multi-page');
    expect(result.failureMessage).toMatch(/second page or popup/u);
    expect(result.failureMessage).toMatch(/no second\s+recording was created or merged/u);
  });

  it('does not continue execution on the other page', async () => {
    const driver = createDriver();
    driver.send(launchMessage());
    await driver.launched();
    driver.browsers.openExtraPage();
    driver.send(executeMessage());
    await driver.settled();

    // The guard refuses at the first operation, so nothing was driven after the popup appeared.
    expect(driver.browsers.page.calls.filter((call) => call.method === 'goto')).toHaveLength(0);
  });
});

describe('AC-5 — the child exits on every path, with the browser closed first', () => {
  it.each([
    ['success', (driver: Driver) => driver],
    [
      'step failure',
      (driver: Driver) => {
        driver.browsers.page.failOn('goto', new Error('NavigationError: refused'));
        return driver;
      },
    ],
    [
      'recording failure',
      (driver: Driver) => {
        driver.browsers.producedPath = null;
        return driver;
      },
    ],
  ] as const)('closes the context and exits after %s', async (_label, arrange) => {
    const driver = arrange(createDriver());
    await runOnce(driver);
    await tick();
    expect(driver.browsers.closed).toBe(1);
    expect(driver.exits).toEqual([0]);
  });

  it('exits after a launch failure, with nothing to close', async () => {
    const driver = createDriver();
    driver.browsers.failNextLaunch(new Error('LaunchFailed'));
    driver.send(launchMessage());
    await driver.settled();
    await tick();
    expect(driver.browsers.closed).toBe(0);
    expect(driver.exits).toEqual([0]);
  });

  /**
   * Changed by story 10.13, deliberately: `stop` **flushes** rather than disposes.
   *
   * 10.12's child disposed on `stop`, which tears the browser down without waiting for the
   * recording context — the same outcome as being killed. §5.2 asks the parent to "close context
   * to flush video when possible", and the bounded grace 10.13's deadline path gives before the
   * group signal exists precisely to buy that close. A `stop` that disposed would make the grace
   * buy nothing, and every deadline kill would report a truncated video.
   */
  it('closes and flushes the recording context on a stop message, rather than disposing', async () => {
    const driver = createDriver();
    driver.send(launchMessage());
    await driver.launched();
    driver.send({ kind: 'stop' });
    const result = await driver.settled();
    expect(driver.browsers.closed).toBe(1);
    expect(driver.browsers.disposed).toBe(0);
    // Flushed, so the file it left is playable and the child says so.
    expect(result.recording.state).toBe('PENDING');
    // The child closed in an orderly way, so nothing here is partial (ADR-002 §17.3). The
    // *parent* decides differently when its ordered stop never completed — that is the kill
    // path, and it is asserted in `test/server/deadline-outcome.test.ts`.
    expect(result.recording.partial).toBe(false);
    await tick();
    expect(driver.exits).toEqual([0]);
  });
});

/**
 * The tail settle — the recorder runs on, briefly, past the last operation (see
 * `TAIL_SETTLE_*` in `src/run/childRuntime.ts`).
 *
 * The ordinary close used to follow the last operation's resolution instantly. A click that only
 * *committed* a navigation had not painted, the recorder padded the file with the last frame it
 * had, and the final step's result was absent from the video. These pin the settle's placement:
 * after the last step, before the close, never once a stop has been ordered — before it starts and
 * again after it — so the stop path keeps sole ownership of the close (AC-5a).
 */
describe('the tail settle — the recorder outlives the last operation, unless a stop is ordered', () => {
  const settleCalls = (driver: Driver) =>
    driver.browsers.page.calls.filter((call) => call.method === 'waitForLoadState');

  it('waits for the load state and holds, after the last step and before the close', async () => {
    const driver = createDriver();
    let closedWhenSettling = -1;
    let stepsFinishedWhenSettling = -1;
    driver.browsers.page.onCall = (call) => {
      if (call.method !== 'waitForLoadState') return;
      closedWhenSettling = driver.browsers.closed;
      stepsFinishedWhenSettling = driver.sent.filter((m) => m.kind === 'step-finished').length;
    };

    const result = await runOnce(driver);
    expect(result.ok).toBe(true);

    const settles = settleCalls(driver);
    expect(settles).toHaveLength(1);
    expect(settles[0]?.args).toEqual(['load', { timeout: TAIL_SETTLE_LOAD_TIMEOUT_MS }]);
    // Placement: every step had finished, and the context was still open.
    expect(stepsFinishedWhenSettling).toBe(2);
    expect(closedWhenSettling).toBe(0);
    expect(driver.sleeps).toEqual([TAIL_SETTLE_HOLD_MS]);
    // And then the ordinary close, once, with the recording it flushed.
    expect(driver.browsers.closed).toBe(1);
    expect(result.recording.state).toBe('PENDING');
    expect(result.recording.partial).toBe(false);
  });

  it('settles after a failing step too: the failure state is what the video should end on', async () => {
    const driver = createDriver();
    driver.browsers.page.failOn('goto', new Error('NavigationError: refused'));
    const result = await runOnce(driver);
    expect(result.ok).toBe(false);
    expect(settleCalls(driver)).toHaveLength(1);
    expect(driver.sleeps).toEqual([TAIL_SETTLE_HOLD_MS]);
  });

  it('a page that never reaches load within the bound changes nothing about the run (AC-8)', async () => {
    const driver = createDriver();
    driver.browsers.page.failOn('waitForLoadState', new Error('TimeoutError: still loading'));
    const result = await runOnce(driver);
    expect(result.ok).toBe(true);
    expect(result.failureKind).toBeNull();
    expect(result.recording.state).toBe('PENDING');
    // The hold still happens: whatever has painted by then is worth the frames.
    expect(driver.sleeps).toEqual([TAIL_SETTLE_HOLD_MS]);
    expect(driver.browsers.closed).toBe(1);
  });

  it('is skipped entirely when the parent has already ordered a stop', async () => {
    const driver = createDriver();
    // The stop lands while the first navigation is in flight: the steps end under the guard, and
    // the run reaches the point where the settle would start with `stopping` already set.
    driver.browsers.page.onCall = (call) => {
      if (call.method === 'goto') driver.send({ kind: 'stop' });
    };
    driver.send(launchMessage());
    await driver.launched();
    driver.send(executeMessage());
    const result = await driver.settled();
    await tick();

    expect(settleCalls(driver)).toEqual([]);
    expect(driver.sleeps).toEqual([]);
    // The stop path owned the close and the single result.
    expect(result.failureMessage).toMatch(/ordered this run to stop/u);
    expect(driver.browsers.closed).toBe(1);
    expect(driver.browsers.disposed).toBe(0);
    expect(driver.sent.filter((m) => m.kind === 'result')).toHaveLength(1);
    expect(driver.exits).toEqual([0]);
  });

  it('is abandoned, without the hold, when the stop arrives during it', async () => {
    const driver = createDriver();
    driver.browsers.page.onCall = (call) => {
      if (call.method === 'waitForLoadState') driver.send({ kind: 'stop' });
    };
    driver.send(launchMessage());
    await driver.launched();
    driver.send(executeMessage());
    const result = await driver.settled();
    await tick();

    expect(settleCalls(driver)).toHaveLength(1);
    // The check after the load wait saw the stop: no hold was spent on a run that is stopping.
    expect(driver.sleeps).toEqual([]);
    // Exactly one close and one result, both the stop path's — the ordinary path did not race it.
    expect(driver.browsers.closed).toBe(1);
    expect(driver.browsers.disposed).toBe(0);
    expect(result.failureMessage).toMatch(/ordered this run to stop/u);
    expect(driver.sent.filter((m) => m.kind === 'result')).toHaveLength(1);
    expect(driver.exits).toEqual([0]);
  });

  it('is bounded well inside the parent’s stop grace', () => {
    // `createChildBrowserLauncher`'s default `stopTimeoutMs` (src/run/launcher.ts). The settle
    // never delays a stop — it is abandoned on one — but the bound is pinned anyway, so a later
    // widening cannot quietly approach the grace.
    const STOP_GRACE_MS = 5_000;
    expect(TAIL_SETTLE_BOUND_MS).toBe(TAIL_SETTLE_LOAD_TIMEOUT_MS + TAIL_SETTLE_HOLD_MS);
    expect(TAIL_SETTLE_BOUND_MS).toBeLessThanOrEqual(750);
    expect(TAIL_SETTLE_BOUND_MS * 4).toBeLessThan(STOP_GRACE_MS);
    // Several 40 ms frame quanta: fewer than two would not reliably reach the encoder.
    expect(TAIL_SETTLE_HOLD_MS).toBeGreaterThanOrEqual(3 * 40);
  });
});

describe('the child refuses what it cannot accept, and leaves', () => {
  it('refuses a launch message carrying artifact source', async () => {
    const driver = createDriver();
    driver.send(launchMessage({ source: ['Go to the login page'] }));
    const result = await driver.settled();
    expect(result.failureKind).toBe('run-fault');
    expect(result.failureMessage).toContain('CHILD_MESSAGE_SOURCE_NOT_PERMITTED');
    expect(driver.browsers.requests).toEqual([]);
  });

  it('refuses an execute message carrying a code string, after the browser started', async () => {
    const driver = createDriver();
    driver.send(launchMessage());
    await driver.launched();
    driver.send({ ...executeMessage(), code: "await page.evaluate('1')" });
    const result = await driver.settled();
    expect(result.failureMessage).toContain('CHILD_MESSAGE_SOURCE_NOT_PERMITTED');
    expect(driver.browsers.disposed).toBe(1);
  });

  it('refuses an out-of-order message', async () => {
    const driver = createDriver();
    driver.send(executeMessage());
    const result = await driver.settled();
    expect(result.failureMessage).toMatch(/out-of-order/u);
  });
});

describe('secret origin binding reaches the adapter and names the refusal', () => {
  it('fills the secret on a listed origin', async () => {
    const result = await runOnce(createDriver(), undefined, { PW: ['http://127.0.0.1'] });
    expect(result.ok).toBe(true);
    expect(result.failureKind).toBeNull();
  });

  it('reports secret-origin-not-allowed when the page origin is not listed', async () => {
    const result = await runOnce(createDriver(), undefined, { PW: ['https://login.app.example'] });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('secret-origin-not-allowed');
  });

  it('refuses a secret bound to no origin', async () => {
    const result = await runOnce(createDriver(), undefined, {});
    expect(result.failureKind).toBe('secret-origin-not-allowed');
  });
});

describe('failureKindOf', () => {
  it('names a refused step by its refusal, and an ordinary one as a step failure', () => {
    const base = { unsupportedPage: false, runFault: null, ok: false } as const;
    expect(failureKindOf({ ...base, refusal: 'URL_SCHEME_NOT_PERMITTED' })).toBe(
      'url-scheme-not-permitted',
    );
    expect(failureKindOf({ ...base, refusal: 'SECRET_ORIGIN_NOT_ALLOWED' })).toBe(
      'secret-origin-not-allowed',
    );
    expect(failureKindOf({ ...base, refusal: null })).toBe('step');
    expect(failureKindOf(base)).toBe('step');
  });
});
