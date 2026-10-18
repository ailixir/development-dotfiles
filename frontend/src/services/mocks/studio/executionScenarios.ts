import type {
  ExecutionLogEntry,
  ExecutionSnapshot,
  StepResult,
} from '@/types/studio/studioTypes';
import {
  type TransportHost,
  type TransportImplementation,
} from '@/services/api/studioExecutionTransport';
import { mockExecutions } from './fixtures';
import { replayFailureExecutions } from './executionFixtures';

/**
 * Story 10.11b — the scripted transport scenarios.
 *
 * Test-only scripted transport scenarios. They are injected explicitly by Vitest and are never
 * installed by the browser application. Every scenario below is an entry in
 *    {@link EXECUTION_SCENARIO_MATRIX}, and `executionScenarioMatrix.test.ts` fails if an entry is
 *    not referenced by a named test. @po's finding on story 10.10's AC-20 is the reason: *"If the
 *    level-2 truncation fixture is never written, AC-7 does not go red; the test simply does not
 *    exist, and a green suite is indistinguishable from a covered one."*
 *
 * Every frame validates against the document's `ExecutionSnapshot` and carries no field the
 * contract does not declare — asserted through the **existing** Ajv harness in
 * `studioContract.test.ts`, not a second parser of the document.
 */

const EXECUTION_ID = '44444444-4444-4444-4444-4444444444aa';
const TEST_ID = mockExecutions[0].testId;
const CSI_ID = mockExecutions[0].csiId;
const REVISION_ID = mockExecutions[0].revisionId;
const ACCEPTED_AT = '2026-09-15T10:00:00Z';

const STEP_TEXT = mockExecutions[0].stepResults.map((step) => step.originalText);

function steps(
  spec: ReadonlyArray<Pick<StepResult, 'status' | 'offsetMs' | 'durationMs'>>,
): StepResult[] {
  return spec.map((entry, stepIndex) => ({
    stepIndex,
    originalText: STEP_TEXT[stepIndex] ?? `Step ${stepIndex + 1}`,
    status: entry.status,
    offsetMs: entry.offsetMs,
    durationMs: entry.durationMs,
    message: null,
  }));
}

function log(at: string, message: string): ExecutionLogEntry {
  return { at, level: 'INFO', message, stepIndex: null };
}

const PENDING_STEPS = steps([
  { status: 'PENDING', offsetMs: null, durationMs: null },
  { status: 'PENDING', offsetMs: null, durationMs: null },
  { status: 'PENDING', offsetMs: null, durationMs: null },
]);

const FIRST_STEP_RUNNING = steps([
  { status: 'RUNNING', offsetMs: 90, durationMs: null },
  { status: 'PENDING', offsetMs: null, durationMs: null },
  { status: 'PENDING', offsetMs: null, durationMs: null },
]);

const SECOND_STEP_RUNNING = steps([
  { status: 'PASS', offsetMs: 90, durationMs: 1420 },
  { status: 'RUNNING', offsetMs: 1510, durationMs: null },
  { status: 'PENDING', offsetMs: null, durationMs: null },
]);

const THIRD_STEP_RUNNING = steps([
  { status: 'PASS', offsetMs: 90, durationMs: 1420 },
  { status: 'PASS', offsetMs: 1510, durationMs: 900 },
  { status: 'RUNNING', offsetMs: 2410, durationMs: null },
]);

const ALL_PASSED = steps([
  { status: 'PASS', offsetMs: 90, durationMs: 1420 },
  { status: 'PASS', offsetMs: 1510, durationMs: 900 },
  { status: 'PASS', offsetMs: 2410, durationMs: 610 },
]);

function frame(
  revision: number,
  overrides: Partial<ExecutionSnapshot> & Pick<ExecutionSnapshot, 'status'>,
): ExecutionSnapshot {
  return {
    executionId: EXECUTION_ID,
    testId: TEST_ID,
    csiId: CSI_ID,
    revisionId: REVISION_ID,
    status: overrides.status,
    errorCode: overrides.errorCode ?? null,
    acceptedAt: ACCEPTED_AT,
    startedAt: overrides.startedAt ?? null,
    endedAt: overrides.endedAt ?? null,
    durationMs: overrides.durationMs ?? null,
    stepResults: overrides.stepResults ?? PENDING_STEPS,
    logs: overrides.logs ?? [],
    logsTruncated: overrides.logsTruncated ?? false,
    video: overrides.video ?? { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
    videoPath: overrides.videoPath ?? null,
    runtime: overrides.runtime ?? {
      playwright: '1.47.2',
      chromium: '129.0.6668.29',
      validator: '1.0.0',
      executor: '1.0.0',
      image: 'studio-runner:1.0.0',
    },
    revision,
    streamComplete: overrides.streamComplete ?? false,
  };
}

const LOG_LINE_1 = log('2026-09-15T10:00:01Z', 'Browser started');
const LOG_LINE_2 = log('2026-09-15T10:00:03Z', 'Navigated to the pilot application');
const LOG_LINE_3 = log('2026-09-15T10:00:05Z', 'Clicked "Sign On"');
const LOG_LINE_4 = log('2026-09-15T10:00:07Z', 'Waiting for "Welcome"');

/**
 * **AC-17.** The development scenario, in order, as five separate frames after the opening one:
 * a step transition, a log append, a truncation frame, a terminal outcome whose evidence is still
 * `PROCESSING` with `streamComplete: false`, and the settled frame that finally closes the stream.
 *
 * The fourth and fifth exist as two frames on purpose: a developer looking at this path has to see
 * that a terminal outcome does **not** end the subscription (§5.4 row 5, §6.1).
 */
export const DEV_TRANSPORT_SCENARIO: readonly ExecutionSnapshot[] = Object.freeze([
  frame(1, { status: 'PENDING' }),
  // A step transition.
  frame(2, {
    status: 'RUNNING',
    startedAt: '2026-09-15T10:00:01Z',
    stepResults: FIRST_STEP_RUNNING,
    logs: [LOG_LINE_1],
  }),
  // A log append, with the step frontier moving too.
  frame(3, {
    status: 'RUNNING',
    startedAt: '2026-09-15T10:00:01Z',
    stepResults: SECOND_STEP_RUNNING,
    logs: [LOG_LINE_1, LOG_LINE_2],
  }),
  // Retained logs hit the configured cap: `logsTruncated` is the server saying earlier lines were
  // dropped. ADR-002 §16.5 — a client that renders this document without rendering that flag turns
  // a bounded report into a false one.
  frame(4, {
    status: 'RUNNING',
    startedAt: '2026-09-15T10:00:01Z',
    stepResults: THIRD_STEP_RUNNING,
    logs: [LOG_LINE_2, LOG_LINE_3, LOG_LINE_4],
    logsTruncated: true,
  }),
  // A terminal outcome whose evidence has not settled. The stream stays open.
  frame(5, {
    status: 'PASSED',
    startedAt: '2026-09-15T10:00:01Z',
    endedAt: '2026-09-15T10:00:08Z',
    durationMs: 3020,
    stepResults: ALL_PASSED,
    logs: [LOG_LINE_2, LOG_LINE_3, LOG_LINE_4],
    logsTruncated: true,
    video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
    streamComplete: false,
  }),
  // Evidence settled. Only now is the stream complete.
  frame(6, {
    status: 'PASSED',
    startedAt: '2026-09-15T10:00:01Z',
    endedAt: '2026-09-15T10:00:08Z',
    durationMs: 3020,
    stepResults: ALL_PASSED,
    logs: [LOG_LINE_2, LOG_LINE_3, LOG_LINE_4],
    logsTruncated: true,
    video: {
      status: 'AVAILABLE',
      error: null,
      expiresAt: '2026-10-15T10:00:08Z',
      partial: false,
    },
    videoPath: `/api/v1/studio/executions/${EXECUTION_ID}/video`,
    streamComplete: true,
  }),
]);

/**
 * **AC-10.** rev 5 → rev 7 → rev 6 → rev 7 again.
 *
 * Rev 6 is **visibly different** from rev 7 — a different running step and a different log tail —
 * so that applying it would change the screen. A stale frame whose content already matches the
 * current one keeps an ordering test green with no ordering rule present at all, which is this
 * epic's *canary sized so it never reaches the hazard*. The flattened variant below is kept as the
 * negative control that proves this fixture is the thing doing the work.
 */
export const REVISION_ORDERING_SEQUENCE: readonly ExecutionSnapshot[] = Object.freeze([
  frame(5, { status: 'RUNNING', stepResults: FIRST_STEP_RUNNING, logs: [LOG_LINE_1] }),
  frame(7, {
    status: 'RUNNING',
    stepResults: THIRD_STEP_RUNNING,
    logs: [LOG_LINE_1, LOG_LINE_2, LOG_LINE_3],
  }),
  frame(6, {
    status: 'RUNNING',
    stepResults: SECOND_STEP_RUNNING,
    logs: [LOG_LINE_1, LOG_LINE_2],
  }),
  frame(7, {
    status: 'RUNNING',
    stepResults: THIRD_STEP_RUNNING,
    logs: [LOG_LINE_1, LOG_LINE_2, LOG_LINE_3],
  }),
]);

/**
 * The negative control for AC-10: the same sequence with rev 6 flattened to rev 7's content. With
 * the ordering rule removed this sequence still ends on the right screen, which is exactly why the
 * fixture above must not look like this.
 */
export const REVISION_ORDERING_SEQUENCE_FLATTENED: readonly ExecutionSnapshot[] = Object.freeze([
  REVISION_ORDERING_SEQUENCE[0],
  REVISION_ORDERING_SEQUENCE[1],
  frame(6, {
    status: 'RUNNING',
    stepResults: THIRD_STEP_RUNNING,
    logs: [LOG_LINE_1, LOG_LINE_2, LOG_LINE_3],
  }),
  REVISION_ORDERING_SEQUENCE[3],
]);

/** **AC-13.** A terminal outcome whose evidence is still being produced. Does not close anything. */
export const TERMINAL_EVIDENCE_PROCESSING: ExecutionSnapshot = frame(11, {
  status: 'FAILED',
  startedAt: '2026-09-15T10:00:01Z',
  endedAt: '2026-09-15T10:00:09Z',
  durationMs: 3400,
  stepResults: steps([
    { status: 'PASS', offsetMs: 90, durationMs: 1420 },
    { status: 'FAIL', offsetMs: 1510, durationMs: 1890 },
    { status: 'SKIPPED', offsetMs: null, durationMs: null },
  ]),
  logs: [LOG_LINE_1, LOG_LINE_2],
  video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
  streamComplete: false,
});

/**
 * **AC-13.** Evidence *failure* settles the stream too, and says so without touching the outcome.
 *
 * `partial` is `false` here (corrected by story 10.16a, AC-14(c)). ADR-002 §17.3: *"It is `false`
 * with `FAILED` and `UNAVAILABLE`, because a recording that does not exist is not a partial one."*
 */
export const TERMINAL_EVIDENCE_FAILED: ExecutionSnapshot = frame(12, {
  status: 'FAILED',
  startedAt: '2026-09-15T10:00:01Z',
  endedAt: '2026-09-15T10:00:09Z',
  durationMs: 3400,
  stepResults: TERMINAL_EVIDENCE_PROCESSING.stepResults,
  logs: [LOG_LINE_1, LOG_LINE_2],
  video: {
    status: 'FAILED',
    error: 'The recording could not be uploaded',
    expiresAt: null,
    partial: false,
  },
  streamComplete: true,
});

/** **AC-13.** Evidence settled successfully. */
export const TERMINAL_EVIDENCE_SETTLED: ExecutionSnapshot = frame(12, {
  status: 'FAILED',
  startedAt: '2026-09-15T10:00:01Z',
  endedAt: '2026-09-15T10:00:09Z',
  durationMs: 3400,
  stepResults: TERMINAL_EVIDENCE_PROCESSING.stepResults,
  logs: [LOG_LINE_1, LOG_LINE_2],
  video: {
    status: 'AVAILABLE',
    error: null,
    expiresAt: '2026-10-15T10:00:09Z',
    partial: false,
  },
  videoPath: `/api/v1/studio/executions/${EXECUTION_ID}/video`,
  streamComplete: true,
});

/**
 * **STUDIO-OBS-008 T0 ruling A1.** One scripted run per `replayFailure` case, so a replay Run can
 * end in each of them over the class-B stream: a pending frame, a frame with the failing step
 * running, and the terminal frame, which is the document example's own snapshot
 * ({@link replayFailureExecutions}). The two earlier frames carry no `replayFailure`: the API
 * derives it from the FINAL report only, and a non-terminal snapshot never names a cause.
 */
function replayFailureScenario(terminal: ExecutionSnapshot): readonly ExecutionSnapshot[] {
  const failing = terminal.stepResults.findIndex((step) => step.status === 'FAIL');
  const unstarted = (step: StepResult): StepResult => ({
    ...step, status: 'PENDING', offsetMs: null, durationMs: null, message: null,
  });
  const common = {
    ...terminal,
    errorCode: null,
    endedAt: null,
    durationMs: null,
    logs: [],
    video: { status: 'PROCESSING' as const, error: null, expiresAt: null, partial: false },
    videoPath: null,
    streamComplete: false,
  };
  const pending: ExecutionSnapshot = {
    ...common,
    status: 'PENDING',
    startedAt: null,
    stepResults: terminal.stepResults.map(unstarted),
    revision: terminal.revision - 2,
  };
  const running: ExecutionSnapshot = {
    ...common,
    status: 'RUNNING',
    stepResults: terminal.stepResults.map((step, index) =>
      index < failing ? step : index === failing ? { ...unstarted(step), status: 'RUNNING', offsetMs: step.offsetMs } : unstarted(step)),
    revision: terminal.revision - 1,
  };
  delete pending.replayFailure;
  delete running.replayFailure;
  return Object.freeze([pending, running, terminal]);
}

/** The three scripted replay-failure runs, keyed by the document example each one ends in. */
export const REPLAY_FAILURE_SCENARIOS = Object.freeze({
  loginRequiredNoLoginSteps: replayFailureScenario(replayFailureExecutions.loginRequiredNoLoginSteps),
  loginRequiredLoginStepsFailed: replayFailureScenario(replayFailureExecutions.loginRequiredLoginStepsFailed),
  targetDrift: replayFailureScenario(replayFailureExecutions.targetDrift),
});

/** Every frame this module publishes, for the contract harness to validate in one pass. */
export const ALL_SCENARIO_FRAMES: readonly ExecutionSnapshot[] = Object.freeze([
  ...DEV_TRANSPORT_SCENARIO,
  ...REVISION_ORDERING_SEQUENCE,
  ...REVISION_ORDERING_SEQUENCE_FLATTENED,
  TERMINAL_EVIDENCE_PROCESSING,
  TERMINAL_EVIDENCE_FAILED,
  TERMINAL_EVIDENCE_SETTLED,
  ...Object.values(REPLAY_FAILURE_SCENARIOS).flat(),
]);

/**
 * A transport implementation that replays a scripted sequence. Used by the development path and by
 * the surface-level tests; **never** by the streaming tests, which use a real socket, because a
 * scripted emitter proves nothing about delivery (the SSE assessment says so in as many words).
 */
export function createScriptedTransport(
  frames: readonly ExecutionSnapshot[],
  intervalMs = 900,
  onDeliver?: (snapshot: ExecutionSnapshot) => void,
): (host: TransportHost) => TransportImplementation {
  return (host) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let index = 0;
    let stopped = false;

    const emit = () => {
      if (stopped || host.isClosed() || index >= frames.length) {
        return;
      }
      const snapshot = frames[index];
      onDeliver?.(snapshot);
      host.deliver(snapshot);
      index += 1;
      if (!stopped && !host.isClosed() && index < frames.length) {
        timer = setTimeout(emit, intervalMs);
      }
    };

    return {
      kind: 'sse',
      start() {
        host.phase('connecting');
        host.phase('live');
        timer = setTimeout(emit, intervalMs);
      },
      close() {
        stopped = true;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      },
    };
  };
}

export interface ExecutionScenarioMatrixEntry {
  /** Referenced verbatim in the title of a named test; that is how AC-22 is checked. */
  readonly id: string;
  readonly what: string;
  readonly criteria: readonly string[];
}

/**
 * **AC-22 (this story's share).** The transport half of the matrix. 10.11a owns the entries for the
 * run gate, the refusal codes, the error vocabulary, log truncation and step timings.
 */
export const EXECUTION_SCENARIO_MATRIX: readonly ExecutionScenarioMatrixEntry[] = Object.freeze([
  {
    id: 'SCN-STREAM-TWO-FRAMES',
    what: 'two frames delivered separately over a chunked event-stream before the response closes',
    criteria: ['AC-9'],
  },
  {
    id: 'SCN-REVISION-OUT-OF-ORDER',
    what: 'rev 5 → 7 → 6 → 7, with rev 6 visibly different from rev 7',
    criteria: ['AC-10'],
  },
  {
    id: 'SCN-REVISION-FLATTENED',
    what: 'the negative control: rev 6 flattened to rev 7’s content',
    criteria: ['AC-10'],
  },
  {
    id: 'SCN-RECONNECT-RESTORES',
    what: 'a dropped stream reconnects and the current snapshot replaces state',
    criteria: ['AC-11'],
  },
  {
    id: 'SCN-DENY-401-STREAM',
    what: 'the events route answers 401; everything stops',
    criteria: ['AC-12'],
  },
  {
    id: 'SCN-DENY-403-STREAM',
    what: 'the events route answers 403; everything stops',
    criteria: ['AC-12'],
  },
  {
    id: 'SCN-DENY-401-MID-FALLBACK',
    what: 'the fallback engages on a transient failure and its own GET then answers 401',
    criteria: ['AC-12'],
  },
  {
    id: 'SCN-DENY-403-PROBE',
    what: 'the GET probe that diagnoses a stream error answers 403',
    criteria: ['AC-12'],
  },
  {
    id: 'SCN-TERMINAL-EVIDENCE-PROCESSING',
    what: 'a terminal outcome with evidence still PROCESSING and streamComplete false',
    criteria: ['AC-13'],
  },
  {
    id: 'SCN-TERMINAL-EVIDENCE-FAILED',
    what: 'evidence failure settles the stream',
    criteria: ['AC-13'],
  },
  {
    id: 'SCN-TERMINAL-EVIDENCE-SETTLED',
    what: 'evidence settled successfully and streamComplete true',
    criteria: ['AC-13'],
  },
  {
    id: 'SCN-IDLE-SURVIVES-CLIENT-TIMEOUT',
    what: 'an idle gap longer than the shared Axios per-request timeout, at test scale',
    criteria: ['AC-14'],
  },
  {
    id: 'SCN-TWO-CONFIGURED-BASES',
    what: 'the same subscription against two different configured API bases',
    criteria: ['AC-14', 'AC-20'],
  },
  {
    id: 'SCN-FALLBACK-AS-PRIMARY',
    what: 'the bounded GET fallback selected as the primary transport through the seam',
    criteria: ['AC-16'],
  },
  {
    id: 'SCN-DEV-TRANSPORT',
    what: 'the mocked development scenario: transition, log append, truncation, terminal, settled',
    criteria: ['AC-17'],
  },
]);
