import { draftsByReadiness } from './readinessFixtures';
import { EXECUTE_CONFLICT_NARRATIVES } from '@/components/studio/run/executeRefusals';
import {
  EXECUTION_ERROR_CODES,
  type ExecutionErrorCode,
  type ExecutionLogEntry,
  type ExecutionSnapshot,
  type StepResult,
} from '@/types/studio/studioTypes';

/**
 * The execution corpus story 10.11a renders, and the enumerable required set that keeps it honest
 * (AC-22).
 *
 * The pattern is story 10.10's fixture matrix, adopted for the same reason @po gave when naming
 * 10.10's AC-20 that story's weakest criterion: *"If the level-2 truncation fixture is never
 * written, AC-7 does not go red; the test simply does not exist, and a green suite is
 * indistinguishable from a covered one."* Two of this story's criteria read their own enumeration
 * out of `openapi.yaml` and police themselves — AC-1's readiness states and AC-5's error
 * codes. **Nothing else here does.** So the required shapes are listed below with the
 * discriminating property each exists to carry, and `executionFixtureMatrix.test.ts` asserts both
 * halves: that every entry still carries its property, and that every entry is named by the title
 * of at least one test in this story's suite.
 *
 * Every snapshot here validates against `ExecutionSnapshot` through the existing Ajv harness in
 * `studioContract.test.ts` and carries no field the contract does not declare — the pattern story
 * 10.1 established and 10.10 reused. A second parser of the document is not added.
 *
 * **Scope.** This corpus covers 10.11a's criteria. The frame sequences AC-9, AC-10, AC-13 and
 * AC-12 need — out-of-order revisions, a stream that closes on `streamComplete`, a `401` on the
 * probe — belong to story **10.11b** and are deliberately absent rather than stubbed: a fixture
 * with no consumer is exactly what the matrix below exists to make visible.
 */

const TEST_ID = '11111111-1111-1111-1111-111111111111';
const CSI = '60406';
const REVISION_ID = '33333333-3333-3333-3333-333333333333';

const runtime = {
  playwright: '1.63.0',
  chromium: '141.0.7390.37',
  validator: '1.0.0',
  executor: '1.0.0',
  image: 'studio-runner:1.4.2',
};

const STEP_TEXT = [
  'Go to "https://www.citi.com"',
  'Click "Sign On"',
  'Type the password into "Password"',
  'Check that the URL contains "dashboard"',
];

function executionId(suffix: string): string {
  return `55555555-5555-5555-5555-5555555555${suffix}`;
}

function baseSnapshot(overrides: Partial<ExecutionSnapshot> & { executionId: string }): ExecutionSnapshot {
  return {
    testId: TEST_ID,
    csiId: CSI,
    revisionId: REVISION_ID,
    status: 'PASSED',
    errorCode: null,
    acceptedAt: '2026-09-14T10:00:00Z',
    startedAt: '2026-09-14T10:00:02Z',
    endedAt: '2026-09-14T10:00:40Z',
    durationMs: 38000,
    stepResults: STEP_TEXT.map((originalText, stepIndex) => ({
      stepIndex,
      originalText,
      status: 'PASS' as const,
      offsetMs: 120 + stepIndex * 9000,
      durationMs: 9000,
      message: null,
    })),
    logs: [{ at: '2026-09-14T10:00:40Z', level: 'INFO', message: 'Run finished', stepIndex: null }],
    logsTruncated: false,
    video: { status: 'AVAILABLE', error: null, expiresAt: '2026-10-14T10:00:40Z', partial: false },
    videoPath: `/api/v1/studio/executions/${overrides.executionId}/video`,
    runtime,
    revision: 12,
    streamComplete: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------------
// AC-6 — one snapshot per terminal error code, plus the null case on a non-`ERROR` status.
// ---------------------------------------------------------------------------------------------

/**
 * A terminal `ERROR` carrying each of the document's eight codes.
 *
 * Built from {@link EXECUTION_ERROR_CODES} rather than from a second hand-written list, so a ninth
 * code added to the carrier produces a ninth fixture and a missing narrative goes red at once.
 * This is the one place a derived corpus is right: the *expected set* is still the document's, read
 * in `studioContract.test.ts`; what is derived here is only which fixtures exist.
 */
export const errorCodeExecutions: Readonly<Record<ExecutionErrorCode, ExecutionSnapshot>> =
  Object.fromEntries(
    EXECUTION_ERROR_CODES.map((code, index) => [
      code,
      baseSnapshot({
        executionId: executionId(`e${index}`),
        status: 'ERROR',
        errorCode: code,
        endedAt: '2026-09-14T10:00:05Z',
        durationMs: null,
        stepResults: STEP_TEXT.map((originalText, stepIndex) => ({
          stepIndex,
          originalText,
          status: 'PENDING' as const,
          offsetMs: null,
          durationMs: null,
          message: null,
        })),
        logs: [
          { at: '2026-09-14T10:00:05Z', level: 'ERROR', message: `Run ended: ${code}`, stepIndex: null },
        ],
        video: { status: 'UNAVAILABLE', error: null, expiresAt: null, partial: false },
        videoPath: null,
      }),
    ]),
  ) as Record<ExecutionErrorCode, ExecutionSnapshot>;

/** `errorCode: null` on a status that is not `ERROR`. No error region may be rendered for it. */
export const passedExecution: ExecutionSnapshot = baseSnapshot({ executionId: executionId('a0') });

/**
 * A step locator/assertion timeout, which architecture §8.2 says is **not** `TIMEOUT`.
 *
 * It is a step `FAIL`, an execution `FAILED`, and **no code at all** — and the steps after it are
 * `SKIPPED` with null timings, which is the same fixture AC-19 needs. A corpus that had `FAILED`
 * only with every step attempted could not show that a null timing renders as *not attempted*
 * rather than as `0`.
 */
export const failedWithSkippedTailExecution: ExecutionSnapshot = baseSnapshot({
  executionId: executionId('a1'),
  status: 'FAILED',
  errorCode: null,
  endedAt: '2026-09-14T10:00:33Z',
  durationMs: 31000,
  stepResults: [
    { stepIndex: 0, originalText: STEP_TEXT[0], status: 'PASS', offsetMs: 137, durationMs: 8921, message: null },
    { stepIndex: 1, originalText: STEP_TEXT[1], status: 'PASS', offsetMs: 9058, durationMs: 7413, message: null },
    {
      stepIndex: 2,
      originalText: STEP_TEXT[2],
      status: 'FAIL',
      offsetMs: 16471,
      durationMs: 14529,
      message: 'Timed out waiting for the field "Password"',
    },
    { stepIndex: 3, originalText: STEP_TEXT[3], status: 'SKIPPED', offsetMs: null, durationMs: null, message: null },
  ],
  logs: [
    { at: '2026-09-14T10:00:33Z', level: 'ERROR', message: 'Step 3 failed', stepIndex: 2 },
  ],
  video: { status: 'AVAILABLE', error: null, expiresAt: '2026-10-14T10:00:33Z', partial: false },
});

// ---------------------------------------------------------------------------------------------
// AC-18 — the retained-log bound, with a fixture that actually reaches it.
// ---------------------------------------------------------------------------------------------

/**
 * The fixture corpus's own retained-log cap.
 *
 * **It is not a contract fact and is not presented as one.** `openapi.yaml` declares `logs` as
 * *"Bounded retained log buffer"* and `logsTruncated` as a plain boolean; the actual cap is
 * deployment configuration and reaches no client. What the fixture needs is only that the array be
 * *long enough that a client-side "show the last N" would be observable* — AC-18's own words — so
 * the number below is the fixture's, chosen to be past any plausible render window.
 */
export const RETAINED_LOG_FIXTURE_CAP = 200;

function logLines(count: number): ExecutionLogEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    at: `2026-09-14T10:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
    level: 'INFO' as const,
    message: `log line ${index}`,
    stepIndex: null,
  }));
}

/** At the cap, and saying so. A client that silently shows the last N is visible against this. */
export const logsTruncatedExecution: ExecutionSnapshot = baseSnapshot({
  executionId: executionId('b0'),
  logs: logLines(RETAINED_LOG_FIXTURE_CAP),
  logsTruncated: true,
});

/** Well under the cap, and saying nothing. This is what stops a hard-coded truncation statement. */
export const logsCompleteExecution: ExecutionSnapshot = baseSnapshot({
  executionId: executionId('b1'),
  logs: logLines(3),
  logsTruncated: false,
});

// ---------------------------------------------------------------------------------------------
// Story 10.16a, AC-3 — the two cases in which `partial` disagrees with an outcome-based guess.
// ---------------------------------------------------------------------------------------------

/**
 * ADR-002 §17.3: *"A recorder that died on a **passing** run **is** partial."* A `PASSED` run whose
 * `AVAILABLE` recording says `partial: true`. Deriving `partial` from `status !== 'PASSED'` gets this
 * wrong. No row in `mockExecutions` carries this combination.
 */
export const partialRecordingOnPassedExecution: ExecutionSnapshot = baseSnapshot({
  executionId: executionId('c0'),
  video: { status: 'AVAILABLE', error: null, expiresAt: '2026-10-14T10:00:40Z', partial: true },
});

/**
 * ADR-002 §17.3: *"A deadline kill whose ordered stop flushed cleanly is **not** partial."* A
 * `ERROR`/`TIMEOUT` run whose `AVAILABLE` recording says `partial: false`. Deriving `partial` from
 * `errorCode === 'TIMEOUT'` gets this wrong. `mockExecutions`' only timeout row says `partial: true`.
 */
export const cleanlyFlushedTimeoutExecution: ExecutionSnapshot = baseSnapshot({
  executionId: executionId('c1'),
  status: 'ERROR',
  errorCode: 'TIMEOUT',
  endedAt: '2026-09-14T10:02:02Z',
  durationMs: 120000,
  stepResults: [
    { stepIndex: 0, originalText: STEP_TEXT[0], status: 'PASS', offsetMs: 140, durationMs: 2210, message: null },
    {
      stepIndex: 1,
      originalText: STEP_TEXT[1],
      status: 'RUNNING',
      offsetMs: 2350,
      durationMs: null,
      message: 'Total browser runtime deadline reached',
    },
    { stepIndex: 2, originalText: STEP_TEXT[2], status: 'SKIPPED', offsetMs: null, durationMs: null, message: null },
    { stepIndex: 3, originalText: STEP_TEXT[3], status: 'SKIPPED', offsetMs: null, durationMs: null, message: null },
  ],
  logs: [
    { at: '2026-09-14T10:02:02Z', level: 'ERROR', message: 'Run ended: TIMEOUT', stepIndex: null },
  ],
  video: { status: 'AVAILABLE', error: null, expiresAt: '2026-10-14T10:02:02Z', partial: false },
});

// ---------------------------------------------------------------------------------------------
// STUDIO-OBS-008 T0 ruling A1 — the three terminal snapshots that carry a `replayFailure`.
// ---------------------------------------------------------------------------------------------

/** The runtime block the document's three `replayFailure` examples share. */
const replayRuntime = {
  playwright: '1.47.2',
  chromium: '1187',
  validator: '3:3b1f0c52d9e84a6711c0a5f2e8d4b69037a1c2e5f4d8b6a09c7e3f15d2a48b60',
  executor: 'c8a2f6e1d0b94735a6c1e8f2d7b30954e1a6c8d2f0b74e395a1d6c8f2e0b7943',
  image: 'studio-runner@sha256:0f1e2d3c4b5a6978',
};

/**
 * Three snapshots, equal field for field to the document's three `getExecution` examples
 * (`loginRequiredNoLoginSteps`, `loginRequiredLoginStepsFailed`, `targetDrift`);
 * `studioContract.test.ts` compares them to the examples it reads from `openapi.yaml`, so a drift
 * in either direction goes red. They are the only fixtures whose `replayFailure` is non-null.
 *
 * The step IDs in `replayFailure.stepId` are the fixture draft's stable IDs
 * (`00000000-0000-4000-8000-00000000000N`), so a surface that joins `stepId` to a draft's current
 * steps finds the step at the position `stepIndex` names.
 */

/** Terminal `FAILED` at a login wall; no earlier step of the run filled a secret. */
export const loginRequiredNoLoginStepsExecution: ExecutionSnapshot = {
  executionId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  testId: TEST_ID,
  csiId: CSI,
  revisionId: '22222222-2222-2222-2222-222222222222',
  status: 'FAILED',
  errorCode: null,
  acceptedAt: '2026-10-10T09:00:00Z',
  startedAt: '2026-10-10T09:00:03Z',
  endedAt: '2026-10-10T09:00:12Z',
  durationMs: 9000,
  stepResults: [
    { stepIndex: 0, originalText: 'Go to "https://app.example.test/accounts"', status: 'PASS', offsetMs: 110, durationMs: 1500, message: null },
    { stepIndex: 1, originalText: 'Click "Account summary"', status: 'FAIL', offsetMs: 1610, durationMs: 6000, message: 'LOGIN_REQUIRED' },
    { stepIndex: 2, originalText: 'Check that the page shows "Balance"', status: 'SKIPPED', offsetMs: null, durationMs: null, message: null },
  ],
  logs: [],
  logsTruncated: false,
  video: { status: 'AVAILABLE', error: null, expiresAt: '2026-11-09T09:00:12Z', partial: false },
  videoPath: '/api/v1/studio/executions/dddddddd-dddd-dddd-dddd-dddddddddddd/video',
  runtime: replayRuntime,
  revision: 13,
  streamComplete: true,
  replayFailure: {
    code: 'LOGIN_REQUIRED',
    stepId: '00000000-0000-4000-8000-000000000002',
    stepIndex: 1,
    loginStepsPresent: false,
  },
};

/** Terminal `FAILED` at a login wall after an earlier step of the run filled a secret. */
export const loginRequiredLoginStepsFailedExecution: ExecutionSnapshot = {
  executionId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  testId: TEST_ID,
  csiId: CSI,
  revisionId: '22222222-2222-2222-2222-222222222222',
  status: 'FAILED',
  errorCode: null,
  acceptedAt: '2026-10-10T09:00:00Z',
  startedAt: '2026-10-10T09:00:03Z',
  endedAt: '2026-10-10T09:00:12Z',
  durationMs: 9000,
  stepResults: [
    { stepIndex: 0, originalText: 'Go to "https://app.example.test/login"', status: 'PASS', offsetMs: 110, durationMs: 1400, message: null },
    { stepIndex: 1, originalText: 'Fill "Password" with <secret LOGIN_PW>', status: 'PASS', offsetMs: 1510, durationMs: 900, message: null },
    { stepIndex: 2, originalText: 'Click "Account summary"', status: 'FAIL', offsetMs: 2410, durationMs: 5200, message: 'LOGIN_REQUIRED' },
    { stepIndex: 3, originalText: 'Check that the page shows "Balance"', status: 'SKIPPED', offsetMs: null, durationMs: null, message: null },
  ],
  logs: [],
  logsTruncated: false,
  video: { status: 'AVAILABLE', error: null, expiresAt: '2026-11-09T09:00:12Z', partial: false },
  videoPath: '/api/v1/studio/executions/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/video',
  runtime: replayRuntime,
  revision: 14,
  streamComplete: true,
  replayFailure: {
    code: 'LOGIN_REQUIRED',
    stepId: '00000000-0000-4000-8000-000000000003',
    stepIndex: 2,
    loginStepsPresent: true,
  },
};

/**
 * Terminal `ERROR` because a learned step's target no longer matches the page. `errorCode` stays
 * null: the cause is `replayFailure`, and the status alone would not name it.
 */
export const targetDriftExecution: ExecutionSnapshot = {
  executionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  testId: TEST_ID,
  csiId: CSI,
  revisionId: '22222222-2222-2222-2222-222222222222',
  status: 'ERROR',
  errorCode: null,
  acceptedAt: '2026-10-10T09:00:00Z',
  startedAt: '2026-10-10T09:00:03Z',
  endedAt: '2026-10-10T09:00:12Z',
  durationMs: 9000,
  stepResults: [
    { stepIndex: 0, originalText: 'Go to "https://app.example.test/accounts"', status: 'PASS', offsetMs: 110, durationMs: 1500, message: null },
    { stepIndex: 1, originalText: 'Click "Transfer"', status: 'FAIL', offsetMs: 1610, durationMs: 5000, message: 'TARGET_DRIFT' },
    { stepIndex: 2, originalText: 'Check that the page shows "Confirmation"', status: 'SKIPPED', offsetMs: null, durationMs: null, message: null },
  ],
  logs: [],
  logsTruncated: false,
  video: { status: 'AVAILABLE', error: null, expiresAt: '2026-11-09T09:00:12Z', partial: false },
  videoPath: '/api/v1/studio/executions/ffffffff-ffff-ffff-ffff-ffffffffffff/video',
  runtime: replayRuntime,
  revision: 15,
  streamComplete: true,
  replayFailure: {
    code: 'TARGET_DRIFT',
    stepId: '00000000-0000-4000-8000-000000000002',
    stepIndex: 1,
  },
};

/** The three, keyed by the name of the document example each one equals. */
export const replayFailureExecutions = {
  loginRequiredNoLoginSteps: loginRequiredNoLoginStepsExecution,
  loginRequiredLoginStepsFailed: loginRequiredLoginStepsFailedExecution,
  targetDrift: targetDriftExecution,
} as const;

export const executionCorpus: ExecutionSnapshot[] = [
  ...Object.values(errorCodeExecutions),
  passedExecution,
  failedWithSkippedTailExecution,
  logsTruncatedExecution,
  logsCompleteExecution,
  partialRecordingOnPassedExecution,
  cleanlyFlushedTimeoutExecution,
  ...Object.values(replayFailureExecutions),
];

// ---------------------------------------------------------------------------------------------
// AC-4 — the refusal bodies of `POST /tests/{id}/execute`.
// ---------------------------------------------------------------------------------------------

/**
 * The `409` bodies, shaped exactly as `ErrorResponse` declares.
 *
 * The messages are the document's own examples, reworded only where an example embeds a literal
 * id. Two of them deliberately do **not** read like their code, which is the point of AC-4's third
 * falsification: the rendering must follow `error`, and a message that contradicts it must not
 * change what the reader sees.
 */
export function executeConflictResponse(code: string): { error: string; message: string } {
  const messages: Record<string, string> = {
    LEARN_REQUIRED: 'No published revision matches the draft; run it to learn it',
    RUNTIME_INCOMPATIBLE:
      'The confirmed revision is not compatible with the current runner runtime',
    IDEMPOTENCY_KEY_REUSED:
      'This idempotency key was already used with a different request body',
    TEST_DELETED: 'UI Test is deleted and cannot be executed',
    TEST_QUARANTINED: 'UI Test is quarantined pending CSI resolution and cannot be executed',
  };
  return { error: code, message: messages[code] ?? 'Refused' };
}

/**
 * A `409` whose prose contradicts its code (AC-4, third falsification).
 *
 * The code says the draft is quarantined — which BRD §9 guarantees means nothing was lost — while
 * the prose says it was deleted. A surface that branches on the message tells the author their
 * work is gone. A surface that branches on `error` does not. There is no third possibility, which
 * is what makes this fixture discriminating rather than decorative.
 */
export const CONTRADICTORY_QUARANTINE_BODY = {
  error: 'TEST_QUARANTINED',
  message: 'This UI Test was deleted and removed permanently; nothing can be recovered',
};

/** A `409` carrying a code the document does not declare. */
export const UNDECLARED_CONFLICT_BODY = {
  error: 'MOON_PHASE_WRONG',
  message: 'Refused for a reason no version of this contract declares',
};

/** `429`. The response declares no code set and no example, so the body carries no branch key. */
export const QUOTA_EXHAUSTED_BODY = {
  error: 'PENDING_QUOTA_EXHAUSTED',
  message: 'Too many executions are already pending for this principal',
};

/** `503`. `DISPATCH_DISABLED` reaches the document only as an example — §14.6, not assertable. */
export const DISPATCH_DISABLED_BODY = {
  error: 'DISPATCH_DISABLED',
  message: 'Studio execution is currently disabled',
};

// ---------------------------------------------------------------------------------------------
// The enumerable, self-checking required set (AC-22).
// ---------------------------------------------------------------------------------------------

/**
 * **VAC-18, found by @qa on this half's own matrix: a coverage matrix whose required set is an
 * editable literal.** Deleting one run-gate state from the list below left the whole suite
 * green — the `it.each` rows simply vanished, nothing read the total, and the file's own
 * `>= 20` floor sat under an actual 26, so four entries could disappear in silence. Two of the
 * three families were transcribed literals rather than reads.
 *
 * The repair is in `studioContract.test.ts`, where the parsed document and `assertSameSet` already
 * live: the id set below is compared **both ways** against the ids the document's own vocabularies
 * imply. The three families here are now derived from the records those vocabularies are already
 * asserted against — `draftsByReadiness`, `EXECUTION_ERROR_CODES` and
 * `EXECUTE_CONFLICT_NARRATIVES` — so a deletion here contradicts the document rather than
 * shrinking the enumeration.
 *
 * The shapes the document cannot name are pinned in the test file, outside this module, for the
 * VAC-11 reason: an expected value read out of the thing it checks is not an expectation.
 */
export interface RequiredExecutionFixture {
  /** Quoted verbatim in the title of at least one test that consumes the fixture. */
  readonly id: string;
  readonly description: string;
  readonly resolve: () => unknown;
  /** The discriminating property. Returns null when satisfied, or why not. */
  readonly satisfies: () => string | null;
}

function bodyDefect(body: { error: string; message: string }, code: string): string | null {
  const keys = Object.keys(body).sort();
  if (keys.join(',') !== 'error,message') {
    return `${code}'s body is ${keys.join(',')}, not the two fields ErrorResponse declares`;
  }
  if (body.error !== code) {
    return `${code}'s body carries error ${body.error}`;
  }
  if (body.message.trim().length < 25) {
    return `${code} has no wording of its own — the fixture fell back to "${body.message}"`;
  }
  if (!/\s/.test(body.message.trim())) {
    return `${code}'s message is an identifier rather than prose`;
  }
  return null;
}

const timingsOf = (snapshot: ExecutionSnapshot): StepResult[] => snapshot.stepResults;

export const EXECUTION_FIXTURE_MATRIX: readonly RequiredExecutionFixture[] = [
  /*
   * AC-1's readiness states (ADR-SC-005). The fixtures are `readinessFixtures.ts`'s and are
   * **referenced, not copied** — ADR-002 §18.3's rule about one mechanism rather than two, applied
   * to a corpus. The enumeration that consumes them reads the names from `openapi.yaml` regardless.
   */
  ...(Object.keys(draftsByReadiness) as (keyof typeof draftsByReadiness)[]).map((state) => ({
    id: `FX-RUNGATE-STATE-${state}`,
    description: `the run gate enumerated over a draft in ${state}`,
    resolve: () => draftsByReadiness[state],
    satisfies: () =>
      draftsByReadiness[state]?.readiness === state
        ? null
        : `no fixture carries readiness ${state}`,
  })),
  ...EXECUTION_ERROR_CODES.map((code) => ({
    id: `FX-ERRCODE-${code}`,
    description: `a terminal ERROR carrying ${code}`,
    resolve: () => errorCodeExecutions[code],
    satisfies: () => {
      const snapshot = errorCodeExecutions[code];
      if (!snapshot) return `no fixture carries errorCode ${code}`;
      if (snapshot.errorCode !== code) return `the ${code} fixture carries ${snapshot.errorCode}`;
      return snapshot.status === 'ERROR'
        ? null
        : `the ${code} fixture is ${snapshot.status}, and a code only ever rides ERROR`;
    },
  })),
  {
    id: 'FX-ERRCODE-NULL',
    description: 'a non-ERROR snapshot whose errorCode is null',
    resolve: () => passedExecution,
    satisfies: () => {
      if (passedExecution.errorCode !== null) return 'the null-code fixture carries a code';
      return passedExecution.status === 'ERROR'
        ? 'the null-code fixture is ERROR, so it could not show that a non-ERROR renders nothing'
        : null;
    },
  },
  {
    id: 'FX-STEP-FAIL-SKIPPED-TAIL',
    description: 'a FAILED run with a step FAIL and later SKIPPED steps carrying null timings',
    resolve: () => failedWithSkippedTailExecution,
    satisfies: () => {
      const steps = timingsOf(failedWithSkippedTailExecution);
      if (failedWithSkippedTailExecution.status !== 'FAILED') {
        return 'the step-failure fixture is not FAILED';
      }
      if (failedWithSkippedTailExecution.errorCode !== null) {
        return 'the step-failure fixture carries a code; §8.2 says a step timeout carries none';
      }
      const failedIndex = steps.findIndex((step) => step.status === 'FAIL');
      if (failedIndex === -1) return 'no step FAILs';
      const tail = steps.slice(failedIndex + 1);
      if (tail.length === 0) return 'the failing step is last, so there is no skipped tail to render';
      const withTimings = tail.filter(
        (step) => step.status !== 'SKIPPED' || step.offsetMs !== null || step.durationMs !== null,
      );
      if (withTimings.length > 0) {
        return 'a step after the failure is not SKIPPED-with-null-timings';
      }
      // The hazard must actually occur: an attempted step needs a non-round timing, so a
      // rendering that rounded would be visible.
      const attempted = steps.slice(0, failedIndex + 1);
      const rounds = attempted.every((step) => (step.offsetMs ?? 0) % 1000 === 0);
      return rounds
        ? 'every attempted timing is a whole second, so a rounding renderer would look identical'
        : null;
    },
  },
  {
    id: 'FX-LOGS-TRUNCATED-AT-CAP',
    description: 'logsTruncated true with the log array at the corpus cap',
    resolve: () => logsTruncatedExecution,
    satisfies: () => {
      if (!logsTruncatedExecution.logsTruncated) return 'the truncated fixture says it is not';
      return logsTruncatedExecution.logs.length >= RETAINED_LOG_FIXTURE_CAP
        ? null
        : `the truncated fixture holds ${logsTruncatedExecution.logs.length} lines, short of the ` +
            `${RETAINED_LOG_FIXTURE_CAP} that makes a client-side "show the last N" observable`;
    },
  },
  {
    id: 'FX-LOGS-COMPLETE',
    description: 'logsTruncated false, so a hard-coded truncation statement is visible',
    resolve: () => logsCompleteExecution,
    satisfies: () => {
      if (logsCompleteExecution.logsTruncated) return 'the complete fixture says it is truncated';
      return logsCompleteExecution.logs.length > 0
        ? null
        : 'the complete fixture has no logs, so "renders every entry" would hold vacuously';
    },
  },
  ...Object.keys(EXECUTE_CONFLICT_NARRATIVES).map((code) => ({
    id: `FX-EXECUTE-409-${code}`,
    description: `a 409 ${code} response from execute`,
    resolve: () => executeConflictResponse(code),
    satisfies: () => bodyDefect(executeConflictResponse(code), code),
  })),
  {
    id: 'FX-EXECUTE-409-CONTRADICTORY',
    description: 'a 409 whose prose contradicts its code',
    resolve: () => CONTRADICTORY_QUARANTINE_BODY,
    satisfies: () => {
      if (CONTRADICTORY_QUARANTINE_BODY.error !== 'TEST_QUARANTINED') {
        return 'the contradictory fixture no longer carries the quarantine code';
      }
      return /delet|remov/i.test(CONTRADICTORY_QUARANTINE_BODY.message)
        ? null
        : 'the message no longer contradicts the code, so a message-reading branch would pass';
    },
  },
  {
    id: 'FX-EXECUTE-409-UNDECLARED',
    description: 'a 409 carrying a code the document does not declare',
    resolve: () => UNDECLARED_CONFLICT_BODY,
    satisfies: () =>
      [
        'LEARN_REQUIRED',
        'RUNTIME_INCOMPATIBLE',
        'IDEMPOTENCY_KEY_REUSED',
        'TEST_DELETED',
        'TEST_QUARANTINED',
      ].includes(UNDECLARED_CONFLICT_BODY.error)
        ? 'the undeclared fixture carries a declared code'
        : null,
  },
  {
    id: 'FX-EXECUTE-429',
    description: 'a 429 pending-quota refusal',
    resolve: () => QUOTA_EXHAUSTED_BODY,
    satisfies: () =>
      QUOTA_EXHAUSTED_BODY.message.trim().length > 25 ? null : 'the 429 fixture has no wording',
  },
  {
    id: 'FX-EXECUTE-503',
    description: 'a 503 kill-switch refusal',
    resolve: () => DISPATCH_DISABLED_BODY,
    satisfies: () =>
      DISPATCH_DISABLED_BODY.message.trim().length > 25 ? null : 'the 503 fixture has no wording',
  },
];
