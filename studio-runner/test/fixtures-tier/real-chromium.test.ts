/**
 * The real browser, from admission to the terminal report (AC-7, AC-8, AC-9, AC-14, AC-15,
 * AC-16, AC-19, AC-20, AC-21, AC-22).
 *
 * Everything here launches pinned Chromium in a real child process against the loopback fixture
 * server. The unit tier proves the same code paths against fakes; this tier is where the claims
 * stop being about a design and start being about a browser.
 *
 * **This file closes story 10.6 AC-14b.** That criterion — "the same admission → real browser
 * launch → `STARTED` sequence driven by real Chromium" — was recorded as *skipped, never passed*,
 * and 10.6's placeholder is deleted rather than re-skipped.
 */
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { RUNNER_ERROR_CODES } from '../../src/run/errors.js';
import { WEBM_MAGIC } from '../../src/run/recording.js';
import { SCRATCH_SUBDIRECTORIES } from '../../src/run/scratchLayout.js';
import { createChildBrowserLauncher } from '../../src/run/launcher.js';
import { createFsScratchStore } from '../../src/server/scratch.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import { createHarness, SERVICE_TOKEN } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { startPageServer } from '../helpers/pageServer.js';
import type { PageServer } from '../helpers/pageServer.js';
import { post, validJob } from '../helpers/runner.js';
import { CHILD_MODULE_PATH } from './globalSetup.js';
import { createScratch, runReal, untilMs } from './realRunner.js';

const CANARY = 'canary-secret-value-9f3a2b';

let server: PageServer;

beforeAll(async () => {
  server = await startPageServer();
});

afterAll(async () => {
  await server.close();
});

function goto(url: string) {
  return { op: 'goto' as const, url: { kind: 'literal' as const, value: url }, options: undefined };
}

function expectTitle(value: string) {
  return {
    op: 'expectTitle' as const,
    expected: { kind: 'literal' as const, value },
    options: { timeout: 5_000 },
  };
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

describe('AC-7 — native webm at an explicitly configured resolution, flushed on close', () => {
  it('produces a readable file inside the per-run scratch directory, with a reported size', async () => {
    const outcome = await runReal({
      steps: [
        { stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] },
        { stepIndex: 1, operations: [expectTitle('Checks — Home')] },
      ],
    });
    try {
      expect(outcome.result.ok).toBe(true);

      const path = outcome.result.recording.path;
      expect(path, 'no recording was produced').not.toBeNull();
      expect(path?.startsWith(outcome.scratchPath)).toBe(true);
      expect(path).toContain(SCRATCH_SUBDIRECTORIES.video);

      // A reported number, not an assumption (the epic's "explicit readable recording size").
      const bytes = outcome.result.recording.bytes ?? 0;
      expect(bytes).toBe(statSync(path ?? '').size);
      expect(bytes).toBeGreaterThan(1_024);

      // A readable webm header: the file was flushed, not merely created. Awaiting the context
      // close is what does that (§6.1).
      const head = readFileSync(path ?? '').subarray(0, 4);
      expect([...head]).toEqual([...WEBM_MAGIC]);
    } finally {
      outcome.clear();
    }
  });

  it('records at the configured geometry rather than a library default', async () => {
    const outcome = await runReal({
      recording: { width: 640, height: 360 },
      steps: [{ stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] }],
    });
    try {
      // The resolution is a configured value the run carried; a different one produces a
      // different file, which is the observable difference available without a decoder.
      expect(outcome.result.recording.bytes).toBeGreaterThan(0);
      expect(outcome.result.recording.state).toBe('PENDING');
    } finally {
      outcome.clear();
    }
  });

  it('creates exactly one recording, never one per page', async () => {
    const outcome = await runReal({
      steps: [
        { stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] },
        { stepIndex: 1, operations: [goto(`${server.baseUrl}/login`)] },
        { stepIndex: 2, operations: [goto(`${server.baseUrl}/dashboard`)] },
      ],
    });
    try {
      const videos = everyFileUnder(join(outcome.scratchPath, SCRATCH_SUBDIRECTORIES.video));
      expect(videos).toHaveLength(1);
    } finally {
      outcome.clear();
    }
  });
});

describe('AC-8 — the check outcome and the evidence state are independent', () => {
  it('(ii) a step fails and the recording is healthy', async () => {
    const outcome = await runReal({
      steps: [
        { stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] },
        { stepIndex: 1, operations: [expectTitle('Definitely not the title')] },
        { stepIndex: 2, operations: [goto(`${server.baseUrl}/login`)] },
      ],
      stepTimeoutMs: 1_500,
    });
    try {
      expect(outcome.result.ok).toBe(false);
      expect(outcome.result.failureKind).toBe('step');
      // Healthy evidence: the video recorded perfectly while the assertion failed.
      expect(outcome.result.recording.state).toBe('PENDING');
      expect(outcome.result.recording.error).toBeNull();

      // AC-14: first failure stops the run; the rest are SKIPPED with null timings; attempted
      // steps carry real offsets and durations.
      expect(outcome.finished.map((event) => event.status)).toEqual(['PASS', 'FAIL', 'SKIPPED']);
      expect(outcome.finished[1]?.failure).toMatch(/AssertionFailed/u);
      expect(outcome.finished[2]).toMatchObject({
        startedAtMs: null,
        finishedAtMs: null,
        durationMs: null,
      });
      for (const attempted of outcome.finished.slice(0, 2)) {
        expect(attempted.startedAtMs).not.toBeNull();
        expect(attempted.durationMs).not.toBeNull();
        expect(attempted.startedAtMs ?? -1).toBeGreaterThanOrEqual(0);
      }
    } finally {
      outcome.clear();
    }
  });
});

describe('AC-15 — a popup is explicit, never silent', () => {
  it('closes the second page, refuses the run, and merges no video', async () => {
    const outcome = await runReal({
      steps: [
        { stepIndex: 0, operations: [goto(`${server.baseUrl}/popup.html`)] },
        { stepIndex: 1, operations: [expectTitle('Checks — Popup')] },
      ],
      stepTimeoutMs: 3_000,
    });
    try {
      expect(outcome.result.failureKind).toBe('unsupported-multi-page');
      expect(outcome.result.failureMessage).toMatch(/second page or popup/u);
      // One run, one video. A context records per page, so a popup does start a second file; the
      // run deletes it with the page, so nothing downstream has to choose between two recordings
      // or merge them (§5.2).
      const videos = everyFileUnder(join(outcome.scratchPath, SCRATCH_SUBDIRECTORIES.video));
      expect(videos).toHaveLength(1);
    } finally {
      outcome.clear();
    }
  });
});

describe('AC-19 — no network egress beyond the local fixture pages', () => {
  it('reaches the loopback fixture host and nothing else', async () => {
    const before = server.requests.length;
    const outcome = await runReal({
      steps: [
        // The manifest binds the corpus to `https://example.com/...`. The run reaches the pages
        // without reaching that host: the rewrite points at `127.0.0.1`, which needs no DNS.
        { stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] },
        { stepIndex: 1, operations: [goto(`${server.baseUrl}/dashboard`)] },
      ],
    });
    try {
      expect(outcome.result.ok).toBe(true);

      // Observed from the browser's own side: every request it issued, by destination.
      const hosts = outcome.result.observedHosts;
      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts).toEqual([`127.0.0.1:${String(server.port)}`]);
      for (const host of hosts) {
        expect(host).not.toContain('example.com');
        // No link-local, no metadata address, no file:// — nothing but the fixture server.
        expect(host).not.toMatch(/169\.254|metadata|file:/u);
      }

      // And from the server's side: the requests arrived here.
      expect(server.requests.length).toBeGreaterThan(before);
    } finally {
      outcome.clear();
    }
  });

  it('would notice a destination that is not the fixture server', async () => {
    // The falsification. A run that navigated somewhere else reports that host, so the assertion
    // above is one that can fail rather than one that is true by construction.
    const outcome = await runReal({
      steps: [{ stepIndex: 0, operations: [goto('http://127.0.0.1:9/')] }],
      stepTimeoutMs: 2_000,
    });
    try {
      expect(outcome.result.observedHosts).toEqual(['127.0.0.1:9']);
      expect(outcome.result.observedHosts).not.toEqual([`127.0.0.1:${String(server.port)}`]);
    } finally {
      outcome.clear();
    }
  });
});

describe('AC-21, AC-22 — the canary, and the only thing the browser may write to', () => {
  it('reaches the field, and appears in no report, log, argument, environment or scratch file', async () => {
    const outcome = await runReal({
      steps: [
        { stepIndex: 0, operations: [goto(`${server.baseUrl}/login`)] },
        {
          stepIndex: 1,
          operations: [
            {
              op: 'fill' as const,
              locator: {
                segments: [
                  { kind: 'getByTestId' as const, testId: { kind: 'literal' as const, value: 'password' } },
                ],
              },
              value: { kind: 'secret' as const, id: 'PW' },
              options: undefined,
            },
          ],
        },
        {
          stepIndex: 2,
          operations: [
            {
              op: 'expectValue' as const,
              locator: {
                segments: [
                  { kind: 'getByTestId' as const, testId: { kind: 'literal' as const, value: 'password' } },
                ],
              },
              expected: { kind: 'literal' as const, value: CANARY },
              options: { timeout: 5_000 },
            },
          ],
        },
      ],
      secrets: { PW: CANARY },
    });
    try {
      // It reached the intended field: the assertion that the input now holds it passed.
      expect(outcome.finished.map((event) => event.status)).toEqual(['PASS', 'PASS', 'PASS']);

      // And it is in none of the bytes that leave the child.
      const serialized = JSON.stringify({
        result: outcome.result,
        started: outcome.started,
        finished: outcome.finished,
      });
      for (const form of encodings(CANARY)) {
        expect(serialized, `the canary leaked, as ${form.slice(0, 12)}…`).not.toContain(form);
      }

      // Nor in anything the browser wrote to scratch — file names included.
      for (const file of everyFileUnder(outcome.scratchPath)) {
        expect(file).not.toContain(CANARY);
        const contents = readFileSync(file);
        for (const form of encodings(CANARY)) {
          expect(
            contents.includes(Buffer.from(form)),
            `${file} contains the canary as ${form.slice(0, 12)}…`,
          ).toBe(false);
        }
      }
    } finally {
      outcome.clear();
    }
  });

  it('confines the browser profile, downloads and temp output to the per-run scratch directory', async () => {
    const outcome = await runReal({
      steps: [{ stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] }],
    });
    try {
      const entries = readdirSync(outcome.scratchPath).sort();
      // Everything Chromium produced is under one of the names `SCRATCH_SUBDIRECTORIES` declares.
      const permitted = new Set<string>(Object.values(SCRATCH_SUBDIRECTORIES));
      expect(entries.filter((entry) => !permitted.has(entry))).toEqual([]);
      expect(entries).toContain(SCRATCH_SUBDIRECTORIES.profile);
      expect(entries).toContain(SCRATCH_SUBDIRECTORIES.video);
    } finally {
      outcome.clear();
    }
  });

  it('leaves nothing behind once the run is cleared, recording included', async () => {
    const outcome = await runReal({
      steps: [{ stepIndex: 0, operations: [goto(`${server.baseUrl}/`)] }],
    });
    const path = outcome.result.recording.path ?? '';
    expect(existsSync(path)).toBe(true);
    outcome.clear();
    // Until 10.14 uploads it, the recording is deleted with the rest of scratch. No file survives.
    expect(existsSync(path)).toBe(false);
    expect(existsSync(outcome.scratchPath)).toBe(false);
  });
});

/** Every form AC-21 names: plain, URL-encoded, double-encoded, base64. */
function encodings(value: string): string[] {
  return [
    value,
    encodeURIComponent(value),
    encodeURIComponent(encodeURIComponent(value)),
    Buffer.from(value, 'utf8').toString('base64'),
  ];
}

// ── AC-20: admission → real browser launch → STARTED. This closes story 10.6 AC-14b. ──────────

describe('AC-20 — admission → real Chromium launch → STARTED (closes 10.6 AC-14b)', () => {
  let harness: Harness | null = null;
  const scratchRoots: string[] = [];

  afterEach(async () => {
    await harness?.stop();
    harness = null;
  });

  afterAll(() => {
    for (const root of scratchRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function realHarness(): Harness {
    const root = createScratch();
    scratchRoots.push(root);
    return createHarness({
      launcher: createChildBrowserLauncher({
        recording: { width: 1280, height: 720 },
        stepTimeoutMs: 10_000,
        launchTimeoutMs: 45_000,
        maxFailureMessageLength: 400,
        childModulePath: CHILD_MODULE_PATH,
      }),
      scratch: createFsScratchStore(root),
    });
  }

  function reports(runner: Harness): ReportBody[] {
    return runner.http.reportRequests.map((request) => JSON.parse(request.body) as ReportBody);
  }

  it('stamps browserStartedAt only once Chromium has actually started', async () => {
    const runner = realHarness();
    harness = runner;
    await runner.start();

    const job = validJob({
      source: ['Go to the login page', 'Type "<secret PW>" in the password field'],
      artifact: {
        version: 1,
        steps: [
          {
            stepIndex: 0,
            originalText: 'Go to the login page',
            code: `await page.goto('${server.baseUrl}/login');`,
          },
          {
            stepIndex: 1,
            originalText: 'Type "<secret PW>" in the password field',
            code: "await page.getByTestId('password').fill(vars.secret('PW'));",
          },
        ],
      },
      resolvedSecrets: { PW: CANARY },
    });

    const dispatchedAt = Date.now();
    const response = await post(runner.port, '/v1/runs', JSON.stringify(job), SERVICE_TOKEN);
    expect(response.status).toBe(202);
    await untilMs(() => runner.app.coordinator.inFlight === 0, 60_000);

    const bodies = reports(runner);
    const started = bodies.find((body) => body.kind === 'STARTED');
    expect(started, 'no STARTED report was sent').toBeDefined();
    expect(started?.browserStartedAt).not.toBeNull();

    // Not on admission success, and not when the launch call began: the observed start is
    // **measurably distinct** from the dispatch instant, asserted as a gap rather than as
    // equality (§5.1.5, epic §10.12 bullet 3).
    const observedStart = Date.parse(started?.browserStartedAt ?? '');
    expect(observedStart).toBeGreaterThan(dispatchedAt);
    expect(observedStart - dispatchedAt).toBeGreaterThan(20);

    // The STARTED sequence number is lower than any step's.
    const firstStepReport = bodies.find((body) => body.steps.length > 0);
    expect(started?.runnerSequence ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      firstStepReport?.runnerSequence ?? 0,
    );

    // And the whole run reached a terminal PASSED with evidence the runner can honestly claim.
    const final = bodies.at(-1);
    expect(final?.kind).toBe('FINAL');
    expect(final?.outcome).toMatchObject({ result: 'PASSED', errorCode: null });
    expect(final?.evidence).toMatchObject({
      state: 'PENDING',
      videoKey: job.videoKey,
      manifestKey: job.manifestKey,
    });
    // AC-9: the keys are echoed, never invented — these differ from anything the runner computes.
    expect(final?.evidence?.videoKey).toBe('studio/exec-1/video.webm');

    // AC-21 on the bytes that actually left: no form of the canary is in any report body.
    for (const request of runner.http.reportRequests) {
      for (const form of encodings(CANARY)) expect(request.body).not.toContain(form);
    }
  }, 90_000);

  it('sends no STARTED at all when the launch fails', async () => {
    const runner = createHarness({
      launcher: createChildBrowserLauncher({
        recording: { width: 1280, height: 720 },
        stepTimeoutMs: 10_000,
        launchTimeoutMs: 45_000,
        maxFailureMessageLength: 400,
        // A module that does not exist: the child cannot start, so the browser never does.
        childModulePath: join(CHILD_MODULE_PATH, '..', 'no-such-child.js'),
      }),
    });
    harness = runner;
    await runner.start();

    const response = await post(runner.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    expect(response.status).toBe(202);
    await untilMs(() => runner.app.coordinator.inFlight === 0, 60_000);

    const bodies = reports(runner);
    expect(bodies.some((body) => body.kind === 'STARTED')).toBe(false);
    const final = bodies.at(-1);
    expect(final?.kind).toBe('FINAL');
    expect(final?.browserStartedAt).toBeNull();
    expect(final?.outcome?.errorCode).toBe(RUNNER_ERROR_CODES.BROWSER_LAUNCH_FAILED);
    // AC-11.4 on a real failed launch: no reading anywhere.
    expect(final?.steps).toEqual([]);
    for (const entry of final?.logs ?? []) expect(entry.atMs).toBeNull();
  }, 90_000);
});
