/**
 * AC-8, AC-9 — evidence on the serialized terminal body.
 *
 * §6.1: *"Upload failure never overwrites a known assertion outcome."* A run whose assertions
 * passed and whose video did not flush is a `PASSED` run with failed evidence, and that has to be
 * true **on the wire**, not merely in prose — which is why every assertion here parses the bytes
 * the runner handed to its HTTP client rather than reading an intermediate object.
 *
 * The second direction — a step fails while the video records perfectly — is proven against real
 * Chromium in `test/fixtures-tier/real-chromium.test.ts`. The first needs a recording that fails,
 * which a healthy browser will not do on demand, so it is driven here through a session that
 * reports one. Both directions are asserted; only one of them can be staged with a real browser.
 */
import { afterEach, describe, expect, it } from 'vitest';

import type {
  BrowserLauncher,
  BrowserSession,
  SessionRecording,
  SessionRunRequest,
  SessionRunResult,
} from '../../src/server/adapters.js';
import { createChildOwnedAdapter } from '../../src/run/launcher.js';
import { takeRunOrigin } from '../../src/run/timeline.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import { createHarness, SERVICE_TOKEN, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';

let harness: Harness | null = null;

afterEach(async () => {
  await harness?.stop();
  harness = null;
});

/**
 * A session that runs the steps in-process and reports whatever recording it was told to.
 *
 * It is the real `SessionRun` shape — the same one the child-owned session satisfies — so what is
 * exercised below is the coordinator's actual mapping from a run result to an outcome and an
 * evidence state, not a simulation of it.
 */
function launcherReporting(
  // `partial` defaults to `false` here so the cases below stay about the *state* vocabulary,
  // which is what they were written to exercise. Story 10.13's own partiality cases live in
  // `test/server/deadline-outcome.test.ts`, where the kill path that produces them exists.
  reported: Omit<SessionRecording, 'partial'> & { readonly partial?: boolean },
  ok = true,
): BrowserLauncher {
  const recording: SessionRecording = { partial: false, ...reported };
  return {
    launch(): Promise<BrowserSession> {
      const origin = takeRunOrigin();
      const session: BrowserSession = {
        adapter: createChildOwnedAdapter(),
        close: () => Promise.resolve(),
        run: {
          origin: {
            browserStartedAt: origin.browserStartedAt,
            startedAtMs: origin.startedAtMs,
            clock: null,
          },
          // This session finishes; nothing here is ever killed. The kill path has its own file.
          kill: () => Promise.resolve({ orderedStopCompleted: true }),
          execute(request: SessionRunRequest): Promise<SessionRunResult> {
            // Two steps, reported through 10.6's reporter exactly as the child would.
            for (const [index, step] of request.steps.entries()) {
              const startedAtMs = origin.clock.now();
              request.reporter.stepStarted({ stepIndex: step.stepIndex, startedAtMs });
              request.reporter.stepFinished({
                stepIndex: step.stepIndex,
                status: ok ? 'PASS' : index === 0 ? 'FAIL' : 'SKIPPED',
                startedAtMs: ok || index === 0 ? startedAtMs : null,
                finishedAtMs: ok || index === 0 ? origin.clock.now() : null,
                durationMs: ok || index === 0 ? 1 : null,
                failure: !ok && index === 0 ? 'AssertionFailed: nope' : null,
              });
            }
            return Promise.resolve({
              ok,
              failureKind: ok ? null : 'step',
              failureMessage: null,
              recording,
              observedHosts: [],
            });
          },
        },
      };
      return Promise.resolve(session);
    },
  };
}

async function runWith(launcher: BrowserLauncher, job = validJob()): Promise<ReportBody> {
  harness = createHarness({ launcher });
  await harness.start();
  const response = await post(harness.port, '/v1/runs', JSON.stringify(job), SERVICE_TOKEN);
  expect(response.status).toBe(202);
  await until(() => harness?.app.coordinator.inFlight === 0);
  const raw = harness.http.reportRequests.at(-1)?.body ?? '';
  return JSON.parse(raw) as ReportBody;
}

describe('AC-8 — evidence never alters the outcome, in either direction', () => {
  it('(i) every step passed and the recording failed → PASSED with failed evidence', async () => {
    const final = await runWith(
      launcherReporting({
        path: '/scratch/run-1/video/page.webm',
        bytes: 0,
        error: 'The recording file is not playable (0 bytes, header absent).',
        state: 'FAILED',
      }),
    );

    // The outcome is untouched. The easiest wrong implementation of this story is a `try` around
    // the whole run that turns a recording failure into ERROR; this is the assertion that catches
    // it, on the serialized body.
    expect(final.kind).toBe('FINAL');
    expect(final.outcome).toEqual({ result: 'PASSED', errorCode: null, errorMessage: null });
    expect(final.evidence?.state).toBe('FAILED');
    // And a populated diagnostic, so the failure is visible rather than merely encoded in a state.
    const diagnostic = final.logs.find((entry) => entry.message.startsWith('recording failed:'));
    expect(diagnostic?.level).toBe('error');
    expect(diagnostic?.message).toContain('not playable');
    // Every step status is untouched too.
    expect(final.steps.map((step) => step.status)).toEqual(['PASS', 'PASS']);
  });

  it('(ii) a step failed and the recording is healthy → FAILED with healthy evidence', async () => {
    const final = await runWith(
      launcherReporting(
        { path: '/scratch/run-1/video/page.webm', bytes: 24_576, error: null, state: 'PENDING' },
        false,
      ),
    );

    expect(final.outcome).toMatchObject({ result: 'FAILED', errorCode: 'STEP_FAILED' });
    // `STORED` since story 10.14: the recorder reports `PENDING` and the terminal path then
    // uploads it. The property this case is about — a failed step does not damage healthy
    // evidence — is unchanged; only the word for "healthy" moved on.
    expect(final.evidence?.state).toBe('STORED');
    expect(final.logs.some((entry) => entry.message.startsWith('recording failed:'))).toBe(false);
    expect(final.steps.map((step) => step.status)).toEqual(['FAIL', 'SKIPPED']);
  });
});

describe('AC-9 — the evidence vocabulary, and key discipline', () => {
  it('reports STORED for a playable recording the store acknowledged (story 10.14 AC-8)', async () => {
    const final = await runWith(
      launcherReporting({ path: '/v/page.webm', bytes: 24_576, error: null, state: 'PENDING' }),
    );
    // The recorder still produces `PENDING`; the upload is what earns `STORED`. This was
    // `expect(...).toBe('PENDING')` until story 10.14, with the reason "because storage is 10.14"
    // written into the test name.
    expect(final.evidence?.state).toBe('STORED');
  });

  it('reports UNAVAILABLE when no usable recording exists at all', async () => {
    const final = await runWith(
      launcherReporting({ path: null, bytes: null, error: null, state: 'UNAVAILABLE' }),
    );
    expect(final.evidence?.state).toBe('UNAVAILABLE');
  });

  it('emits STORED only where an object was actually written (story 10.14 AC-8)', async () => {
    // The inverse of the test this replaces. Until story 10.14 the assertion was "never emits
    // STORED, on any path", because `RunnerEvidenceState` had three values and storage belonged to
    // a later story. The vocabulary widened here, so the guard has to widen with it — otherwise it
    // would be a test asserting that the feature was not built.
    const bodies: ReportBody[] = [];
    for (const recording of [
      { path: null, bytes: null, error: 'boom', state: 'FAILED' as const },
      { path: null, bytes: null, error: null, state: 'UNAVAILABLE' as const },
    ]) {
      bodies.push(await runWith(launcherReporting(recording)));
      await harness?.stop();
      harness = null;
    }
    for (const body of bodies) expect(body.evidence?.state).not.toBe('STORED');
    // A recorder that produced nothing is never uploaded at all, so there is nothing to store.
    expect(JSON.stringify(bodies)).not.toContain('STORED');

    const playable = await runWith(
      launcherReporting({ path: '/v/page.webm', bytes: 24_576, error: null, state: 'PENDING' }),
    );
    expect(playable.evidence?.state).toBe('STORED');
  });

  it('echoes the job’s server-derived keys exactly, inventing nothing', async () => {
    // Keys deliberately unlike anything the runner could compute from the identity it holds: a
    // different prefix, a different extension, a different shape.
    const job = validJob({
      videoKey: 'archive/2026/09/11/af3c-not-derivable-from-anything.mkv',
      manifestKey: 'archive/2026/09/11/af3c-manifest.txt',
    });
    const final = await runWith(
      launcherReporting({ path: '/v/page.webm', bytes: 24_576, error: null, state: 'PENDING' }),
      job,
    );

    expect(final.evidence?.videoKey).toBe('archive/2026/09/11/af3c-not-derivable-from-anything.mkv');
    expect(final.evidence?.manifestKey).toBe('archive/2026/09/11/af3c-manifest.txt');
    // Not derived from the identity, and not from the produced file's own name (§6.2).
    expect(final.evidence?.videoKey).not.toContain(final.executionId);
    expect(final.evidence?.videoKey).not.toContain('page.webm');
  });

  it('carries no evidence and no outcome on STARTED or PROGRESS', async () => {
    harness = createHarness({
      launcher: launcherReporting({
        path: '/v/page.webm',
        bytes: 1,
        error: null,
        state: 'PENDING',
      }),
    });
    await harness.start();
    const response = await post(harness.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
    expect(response.status).toBe(202);
    await until(() => harness?.app.coordinator.inFlight === 0);

    const bodies = harness.http.reportRequests.map(
      (request) => JSON.parse(request.body) as ReportBody,
    );
    for (const body of bodies.filter((entry) => entry.kind !== 'FINAL')) {
      expect(body.evidence).toBeNull();
      expect(body.outcome).toBeNull();
    }
  });
});
