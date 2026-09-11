/**
 * Story 10.14 AC-3, AC-4 — the terminal order, and what happens when the store is down.
 *
 * ## Why the boundary is `runScratch.clear()` and not `sendFinal`
 *
 * This criterion was drafted as *"upload, settle, manifest, **then** deliver"*, against a runner
 * whose terminal `finally` was `settled → sendFinal → wipe → clear`. Story 10.13 changed it, on
 * purpose, to `settled → clear → wipe → sendFinal` — it releases the browser profile, the video
 * and the resolved secrets *before* the retry window opens rather than holding them for the whole
 * of it. **The video lives in scratch.** So "before `sendFinal`" became a sentence that an
 * implementation uploading *after the file has been deleted* satisfies completely: green on every
 * run, evidence `FAILED` on every run, and unable to ever work.
 *
 * @po amended the criterion at validation and the boundary is now normative. The asserted sequence
 * is:
 *
 * ```
 * put(videoKey) → evidence settled → put(manifestKey) → runScratch.clear() → wipe → sendFinal
 * ```
 *
 * Every element of it is a **captured runtime event**, not a statement position: two of them come
 * from an instrumented store, two from the pod log, one from an instrumented scratch store and one
 * from the HTTP client. Asserting on the order of statements in the source does not satisfy the
 * criterion and would not catch the failure it exists for.
 *
 * ## The second falsification, and why it needs a scratch store that does not delete
 *
 * Moving the upload after the clear has to turn this red **on the ordering assertion**, not on a
 * missing file — otherwise the guard discriminates the symptom rather than the property, and an
 * implementation that happened to keep a copy somewhere would sail through. The scratch store here
 * records its `clear()` and then does nothing, so the mutated order still uploads successfully and
 * the only thing that fails is the sequence. The real deletion is proven against a real filesystem
 * and a real Chromium in `test/fixtures-tier/deadline-cleanup.test.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createChildOwnedAdapter } from '../../src/run/launcher.js';
import { takeRunOrigin } from '../../src/run/timeline.js';
import { createFakeObjectStore } from '../../src/run/objectStore.js';
import type { FakeObjectStoreOptions, ObjectStoreClient } from '../../src/run/objectStore.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import type {
  BrowserLauncher,
  BrowserSession,
  RunScratch,
  ScratchStore,
  SessionRecording,
  SessionRunRequest,
  SessionRunResult,
} from '../../src/server/adapters.js';
import { createHarness, SERVICE_TOKEN, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';

let harness: Harness | null = null;

afterEach(async () => {
  await harness?.stop();
  harness = null;
});

/** The job's server-derived keys, echoed by the runner and never invented (AC-1). */
const VIDEO_KEY = String(validJob().videoKey);
const MANIFEST_KEY = String(validJob().manifestKey);

const RECORDING: SessionRecording = {
  path: '/scratch/run-1/video/page.webm',
  bytes: 24_576,
  error: null,
  state: 'PENDING',
  partial: true,
};

/** A session that records two passing steps and reports the recording it was given. */
function launcherReporting(recording: SessionRecording = RECORDING): BrowserLauncher {
  return {
    launch(): Promise<BrowserSession> {
      const origin = takeRunOrigin();
      return Promise.resolve({
        adapter: createChildOwnedAdapter(),
        close: () => Promise.resolve(),
        run: {
          origin: {
            browserStartedAt: origin.browserStartedAt,
            startedAtMs: origin.startedAtMs,
            clock: null,
          },
          kill: () => Promise.resolve({ orderedStopCompleted: true }),
          execute(request: SessionRunRequest): Promise<SessionRunResult> {
            for (const step of request.steps) {
              const startedAtMs = origin.clock.now();
              request.reporter.stepStarted({ stepIndex: step.stepIndex, startedAtMs });
              request.reporter.stepFinished({
                stepIndex: step.stepIndex,
                status: 'PASS',
                startedAtMs,
                finishedAtMs: origin.clock.now(),
                durationMs: 1,
                failure: null,
              });
            }
            return Promise.resolve({
              ok: true,
              failureKind: null,
              failureMessage: null,
              recording,
              observedHosts: [],
            });
          },
        },
      });
    },
  };
}

/**
 * A scratch store that records its `clear()` into the shared journal and deletes nothing.
 *
 * Deleting would make the upload-after-clear mutation fail on a missing file, which is exactly the
 * symptom-not-property failure the criterion forbids.
 */
function journallingScratch(journal: string[]): ScratchStore {
  return {
    create(runId: string): Promise<RunScratch> {
      return Promise.resolve({
        path: `/scratch/${runId}`,
        clear(): Promise<void> {
          journal.push('scratch.clear');
          return Promise.resolve();
        },
      });
    },
    clearAll: () => Promise.resolve(),
    list: () => Promise.resolve([]),
  };
}

interface Observed {
  readonly journal: string[];
  readonly final: ReportBody;
  readonly store: ReturnType<typeof createFakeObjectStore>;
}

async function runObserving(
  options: {
    storeOptions?: FakeObjectStoreOptions;
    client?: ObjectStoreClient;
    recording?: SessionRecording;
  } = {},
): Promise<Observed> {
  // One journal, written by four different seams at the instant each one happens. That is what
  // makes the assertion an *ordering* assertion rather than four independent facts.
  const journal: string[] = [];
  const store = createFakeObjectStore({
    resolveFile: () => Promise.resolve(new Uint8Array(24_576)),
    ...options.storeOptions,
    journal,
  });
  harness = createHarness({
    launcher: launcherReporting(options.recording ?? RECORDING),
    scratch: journallingScratch(journal),
    objectStore: options.client ?? store.client,
    onLogLine: (line) => {
      const event = (JSON.parse(line) as { event?: string }).event;
      if (event === 'run.evidence_settled' || event === 'run.values_wiped') journal.push(event);
    },
  });
  await harness.start();

  const response = await post(harness.port, '/v1/runs', JSON.stringify(validJob()), SERVICE_TOKEN);
  expect(response.status).toBe(202);
  await until(() => harness?.app.coordinator.inFlight === 0);
  journal.push('sendFinal');

  const raw = harness.http.reportRequests.at(-1)?.body ?? '';
  return { journal, final: JSON.parse(raw) as ReportBody, store };
}

// ── AC-3: the observed sequence ──────────────────────────────────────────────────────────────

describe('AC-3 — upload, settle, manifest, then clear scratch, wipe and deliver', () => {
  it('performs the six terminal steps in that order, observed at their own seams', async () => {
    const { journal } = await runObserving();

    expect(journal).toEqual([
      `put:${VIDEO_KEY}`,
      'run.evidence_settled',
      `put:${MANIFEST_KEY}`,
      'scratch.clear',
      'run.values_wiped',
      'sendFinal',
    ]);
  });

  it('uploads while the file still exists — the video put precedes the scratch clear', async () => {
    const { journal } = await runObserving();

    const videoPut = journal.indexOf(`put:${VIDEO_KEY}`);
    const clear = journal.indexOf('scratch.clear');

    expect(videoPut).toBeGreaterThanOrEqual(0);
    expect(clear).toBeGreaterThan(videoPut);
  });

  it('writes the manifest before the result is delivered', async () => {
    const { journal } = await runObserving();

    const manifestPut = journal.indexOf(`put:${MANIFEST_KEY}`);
    expect(manifestPut).toBeGreaterThanOrEqual(0);
    expect(journal.indexOf('sendFinal')).toBeGreaterThan(manifestPut);
  });

  it('still holds the resolved values when the manifest bytes are produced', async () => {
    const { journal } = await runObserving();

    // `resolver.wipe()` runs after the manifest write, which is what keeps AC-6's canary
    // experiment live at the moment the bytes are serialized. Moving the wipe earlier would make
    // that experiment test nothing, so the ordering is asserted rather than assumed.
    expect(journal.indexOf('run.values_wiped')).toBeGreaterThan(
      journal.indexOf(`put:${MANIFEST_KEY}`),
    );
  });

  it('reports STORED with the recorder’s partial carried through unchanged', async () => {
    const { final } = await runObserving();

    expect(final.evidence?.state).toBe('STORED');
    // AC-9: a successful upload does not make a truncated recording whole.
    expect(final.evidence?.partial).toBe(true);
  });
});

// ── AC-1: the keys are the job's, echoed, and nothing derives one ────────────────────────────

describe('AC-1 — the store is called with the job’s keys and with no key the runner computed', () => {
  it('writes to keys deliberately unlike anything derivable from the run’s identity', async () => {
    // A prefix, an extension and a shape the runner could not have computed from the execution,
    // the attempt or the produced file's own name. If either object lands at a derived key, the
    // API's recovery reads an object nobody wrote (§6.2, ADR-002 §15.6).
    const odd = validJob({
      videoKey: 'archive/2026/09/11/af3c-not-derivable-from-anything.mkv',
      manifestKey: 'archive/2026/09/11/af3c-manifest.txt',
    });
    const journal: string[] = [];
    const store = createFakeObjectStore({
      journal,
      resolveFile: () => Promise.resolve(new Uint8Array(24_576)),
    });
    harness = createHarness({
      launcher: launcherReporting(),
      scratch: journallingScratch(journal),
      objectStore: store.client,
    });
    await harness.start();
    expect((await post(harness.port, '/v1/runs', JSON.stringify(odd), SERVICE_TOKEN)).status).toBe(
      202,
    );
    await until(() => harness?.app.coordinator.inFlight === 0);

    expect(store.keys).toEqual([
      'archive/2026/09/11/af3c-not-derivable-from-anything.mkv',
      'archive/2026/09/11/af3c-manifest.txt',
    ]);
    // Not the shape `ManifestKeys` derives, and not the produced file's own name.
    for (const key of store.keys) {
      expect(key).not.toContain('studio/');
      expect(key).not.toContain('.webm');
      expect(key).not.toContain('.result.json');
      expect(key).not.toContain('page.webm');
    }
    // And the manifest body carries the same two strings it was written under.
    const bytes = store.objectAt('archive/2026/09/11/af3c-manifest.txt');
    const body = JSON.parse(new TextDecoder().decode(bytes ?? new Uint8Array())) as {
      videoKey: string;
      manifestKey: string;
    };
    expect(body.videoKey).toBe('archive/2026/09/11/af3c-not-derivable-from-anything.mkv');
    expect(body.manifestKey).toBe('archive/2026/09/11/af3c-manifest.txt');
  });
});

// ── AC-4: storage failure never costs the result, and never costs the outcome ────────────────

describe('AC-4 — a store that fails costs the evidence and nothing else', () => {
  it('(a) the video upload fails and the manifest write succeeds', async () => {
    const { final, journal: observed, store } = await runObserving({
      storeOptions: { failKeys: [VIDEO_KEY] },
    });

    expect(final.kind).toBe('FINAL');
    expect(final.outcome).toMatchObject({ result: 'PASSED', errorCode: null });
    expect(final.evidence?.state).toBe('FAILED');
    expect(final.evidence?.partial).toBe(true);
    expect(final.logs.some((entry) => entry.message.includes('The recording was not stored'))).toBe(
      true,
    );
    // The manifest is still written: a lost video is not a lost recovery path.
    expect(observed).toContain(`put:${MANIFEST_KEY}`);
    expect(store.keys).toContain(MANIFEST_KEY);
  });

  it('(b) the whole store is unreachable and the result is delivered directly', async () => {
    const { final, store } = await runObserving({ storeOptions: { unavailable: true } });

    expect(final.kind).toBe('FINAL');
    expect(final.outcome).toMatchObject({ result: 'PASSED', errorCode: null });
    expect(final.evidence?.state).toBe('FAILED');
    expect(store.keys).toEqual([]);
    // An unreachable store is named as such, not reported as a refused write.
    expect(final.logs.some((entry) => entry.message.includes('unreachable'))).toBe(true);
  });

  it('(c) the video uploads and the manifest write fails', async () => {
    const { final, store } = await runObserving({ storeOptions: { failKeys: [MANIFEST_KEY] } });

    // The evidence reflects the stored video, because that is what happened to the video.
    expect(final.evidence?.state).toBe('STORED');
    expect(store.keys).toEqual([VIDEO_KEY]);
    // The loss of the manifest is a diagnostic, not an outcome.
    expect(final.outcome).toMatchObject({ result: 'PASSED', errorCode: null });
    expect(
      final.logs.some((entry) =>
        entry.message.includes('The terminal result manifest was not stored'),
      ),
    ).toBe(true);
  });

  it('delivers an outcome byte-identical to the same run against a healthy store', async () => {
    const healthy = await runObserving();
    await harness?.stop();
    harness = null;

    const failed = await runObserving({ storeOptions: { unavailable: true } });

    expect(JSON.stringify(failed.final.outcome)).toBe(JSON.stringify(healthy.final.outcome));
    expect(failed.final.steps.map((step) => step.status)).toEqual(
      healthy.final.steps.map((step) => step.status),
    );
  });

  it('never lets a store error escape the terminal path, so a FINAL is always built', async () => {
    // The falsification AC-4 names: an implementation that lets the error propagate never builds
    // the report at all. The exploding client throws a plain Error rather than one of the module's
    // own types, which is the case a `catch` written around the known errors would miss.
    const exploding: ObjectStoreClient = {
      put: () => Promise.reject(new Error('the bucket exploded')),
    };
    const { final } = await runObserving({ client: exploding });

    expect(final.kind).toBe('FINAL');
    expect(final.outcome).toMatchObject({ result: 'PASSED' });
    expect(final.evidence?.state).toBe('FAILED');
  });
});
