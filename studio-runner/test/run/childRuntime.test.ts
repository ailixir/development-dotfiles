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

import { attachChildRuntime } from '../../src/run/childRuntime.js';
import type { ChildChannel } from '../../src/run/childRuntime.js';
import { PROTOCOL_VERSION } from '../../src/run/protocol.js';
import type { ChildMessage, ResultMessage } from '../../src/run/protocol.js';
import { createFakeBrowserFactory } from '../helpers/child.js';
import type { FakeBrowserFactory } from '../helpers/child.js';

interface Driver {
  readonly sent: ChildMessage[];
  readonly exits: number[];
  readonly browsers: FakeBrowserFactory;
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
  });

  return {
    sent,
    exits,
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
    scratchPath: '/scratch/run-1',
    totalRuntimeMs: 120_000,
    ...overrides,
  };
}

function executeMessage(steps: unknown[] = defaultSteps()): Record<string, unknown> {
  return {
    kind: 'execute',
    protocolVersion: PROTOCOL_VERSION,
    stepTimeoutMs: 5_000,
    steps,
    variables: {},
    secrets: { PW: 'canary-secret-value' },
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

async function runOnce(driver: Driver, steps?: unknown[]): Promise<ResultMessage> {
  driver.send(launchMessage());
  await driver.launched();
  driver.send(executeMessage(steps));
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
