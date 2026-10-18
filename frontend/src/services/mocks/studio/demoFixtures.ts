/**
 * Demo-scale Studio list data (story 10.46).
 *
 * `fixtures.ts` holds the small, hand-written contract corpus that many tests bind to by id and
 * count. This module adds volume on top of it so the Tests and Runs lists can be exercised with
 * server paging, search, filters and sort: 25 tests over four readable CSIs, four environments and
 * every readiness state, and 44 runs that include PENDING/RUNNING, cancelled, failed, every
 * ERROR flavour the list needs, sub-second and over-an-hour durations, and a run whose test has
 * been deleted (it resolves `testName: null`).
 *
 * Instants are relative to module load so the lists show "12m ago" rather than a fixed past
 * date. Every value is otherwise deterministic, and every item validates against the contract
 * (`studioContract.test.ts`).
 */

import {
  CANCELLED_ERROR_CODE,
  defaultConfiguration,
  type ExecutionErrorCode,
  type ExecutionSnapshot,
  type ExecutionStatus,
  type StepResult,
  type TestDto,
  type TestReadiness,
} from '@/types/studio/studioTypes';

/** The extra readable CSIs this module populates; `fixtures.ts` adds them to the readable set. */
export const DEMO_CSIS = ['60406', '178672', '171234', '169001'] as const;

export const DEMO_ENVIRONMENTS = ['Development', 'Staging', 'UAT', 'Production'] as const;

/** A test id that no list holds: its runs answer `testName: null`, as for a soft-deleted test. */
export const DEMO_DELETED_TEST_ID = 'd0000000-0000-4000-8000-0000000000ff';

const DEMO_NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (msAgo: number) => new Date(DEMO_NOW - msAgo).toISOString();

const hex = (value: number, width: number) => value.toString(16).padStart(width, '0');
const testId = (index: number) => `d0000000-0000-4000-8000-${hex(index + 1, 12)}`;
const executionId = (index: number) => `e0000000-0000-4000-8000-${hex(index + 1, 12)}`;
const revisionId = (index: number) => `f0000000-0000-4000-8000-${hex(index + 1, 12)}`;
const changedStepId = (index: number) => `c0000000-0000-4000-8000-${hex(index + 1, 12)}`;

const runtime = {
  playwright: '1.47.2',
  chromium: '129.0.6668.29',
  validator: '1.0.0',
  executor: '1.0.0',
  image: 'studio-runner@sha256:0f1e2d3c4b5a6978',
};

const unknownRuntime = { playwright: null, chromium: null, validator: null, executor: null, image: null };

interface DemoTestSpec {
  name: string;
  description: string | null;
  csi: number;
  env: number;
  readiness: TestReadiness;
  updatedAgo: number;
  steps: string[];
}

const LOGIN = ['Go to "https://www.citi.com"', 'Click "Sign On"', 'Check that the URL contains "dashboard"'];
const PAY = ['Go to "https://pay.citi.com"', 'Fill "Amount" with "10.00"', 'Click "Review"', 'Check that "Confirm" is visible'];
const SEARCH = ['Go to "https://www.citi.com/search"', 'Fill "Search" with "mortgage"', 'Press Enter', 'Check that "Results" is visible'];

const testSpecs: DemoTestSpec[] = [
  { name: 'Login – happy path', description: 'Pilot account signs in and lands on the dashboard', csi: 0, env: 3, readiness: 'READY', updatedAgo: 2 * HOUR, steps: LOGIN },
  { name: 'Login – locked account message', description: 'Locked users see the support banner', csi: 0, env: 1, readiness: 'READY', updatedAgo: 5 * HOUR, steps: LOGIN },
  { name: 'Password reset email', description: null, csi: 0, env: 0, readiness: 'UNLEARNED', updatedAgo: 20 * MIN, steps: ['Go to "https://www.citi.com/reset"', 'Fill "Email" with "pilot@example.com"', 'Click "Send"'] },
  { name: 'Account summary balances', description: 'Balances widget renders for all account types', csi: 0, env: 3, readiness: 'READY', updatedAgo: 1 * DAY, steps: LOGIN },
  { name: 'Statements – PDF download', description: 'Latest statement downloads as PDF', csi: 0, env: 2, readiness: 'UNLEARNED', updatedAgo: 3 * HOUR, steps: ['Go to "https://www.citi.com/statements"', 'Click "Download"'] },
  { name: 'Card activation flow', description: 'New card activation wizard completes', csi: 1, env: 3, readiness: 'READY', updatedAgo: 4 * DAY, steps: PAY },
  { name: 'Bill pay – schedule payment', description: 'A one-off payment is scheduled for tomorrow', csi: 1, env: 1, readiness: 'READY', updatedAgo: 6 * HOUR, steps: PAY },
  { name: 'Bill pay – cancel scheduled', description: null, csi: 1, env: 1, readiness: 'NEEDS_RELEARN', updatedAgo: 45 * MIN, steps: PAY },
  { name: 'Payee management', description: 'Add, edit and remove a payee', csi: 1, env: 0, readiness: 'LEARNING', updatedAgo: 2 * MIN, steps: PAY },
  { name: 'Wire transfer limits', description: 'Daily limit warning is shown above threshold', csi: 1, env: 2, readiness: 'READY', updatedAgo: 9 * DAY, steps: PAY },
  { name: 'Zelle send money', description: 'Send money to a saved recipient', csi: 1, env: 3, readiness: 'READY', updatedAgo: 12 * DAY, steps: PAY },
  { name: 'Site search – mortgage', description: 'Search returns mortgage product pages', csi: 2, env: 3, readiness: 'READY', updatedAgo: 30 * MIN, steps: SEARCH },
  { name: 'Site search – empty query', description: 'Empty search shows suggestions', csi: 2, env: 1, readiness: 'READY', updatedAgo: 2 * DAY, steps: SEARCH },
  { name: 'Branch locator', description: 'ZIP search lists nearby branches', csi: 2, env: 2, readiness: 'READY', updatedAgo: 3 * DAY, steps: SEARCH },
  { name: 'ATM locator map', description: null, csi: 2, env: 0, readiness: 'UNLEARNED', updatedAgo: 8 * HOUR, steps: SEARCH },
  { name: 'Mortgage rate calculator', description: 'Calculator returns a monthly payment', csi: 2, env: 3, readiness: 'READY', updatedAgo: 20 * DAY, steps: SEARCH },
  { name: 'Credit card comparison', description: 'Compare three cards side by side', csi: 2, env: 1, readiness: 'UNLEARNED', updatedAgo: 90 * MIN, steps: SEARCH },
  { name: 'Contact us form', description: 'Form submits and shows a reference number', csi: 2, env: 2, readiness: 'READY', updatedAgo: 5 * DAY, steps: SEARCH },
  { name: 'Trading – place market order', description: 'Market order preview shows estimated cost', csi: 3, env: 3, readiness: 'READY', updatedAgo: 1 * HOUR, steps: PAY },
  { name: 'Trading – watchlist add', description: null, csi: 3, env: 1, readiness: 'READY', updatedAgo: 7 * HOUR, steps: PAY },
  { name: 'Portfolio performance chart', description: 'Chart renders for 1M, 6M and 1Y ranges', csi: 3, env: 2, readiness: 'READY', updatedAgo: 2 * DAY, steps: PAY },
  { name: 'Research reports access', description: 'Entitled users can open research PDFs', csi: 3, env: 3, readiness: 'NEEDS_RELEARN', updatedAgo: 15 * MIN, steps: PAY },
  { name: 'Alerts – price threshold', description: 'Price alert is created and listed', csi: 3, env: 0, readiness: 'UNLEARNED', updatedAgo: 6 * DAY, steps: PAY },
  { name: 'Logout clears session', description: 'Back button after logout shows the login page', csi: 0, env: 3, readiness: 'READY', updatedAgo: 40 * DAY, steps: LOGIN },
  { name: 'Two-factor challenge', description: 'OTP prompt appears for a new device', csi: 0, env: 2, readiness: 'READY', updatedAgo: 10 * HOUR, steps: LOGIN },
];

interface DemoRunSpec {
  test: number;
  status: ExecutionStatus;
  errorCode?: ExecutionErrorCode;
  acceptedAgo: number;
  durationMs?: number;
}

/** 44 runs. `test: -1` is the deleted test. */
const runSpecs: DemoRunSpec[] = [
  { test: 0, status: 'RUNNING', acceptedAgo: 1 * MIN },
  { test: 18, status: 'PENDING', acceptedAgo: 30 * 1000 },
  { test: 11, status: 'RUNNING', acceptedAgo: 3 * MIN },
  { test: 6, status: 'PENDING', acceptedAgo: 2 * MIN },
  { test: 0, status: 'PASSED', acceptedAgo: 12 * MIN, durationMs: 850 },
  { test: 1, status: 'FAILED', acceptedAgo: 25 * MIN, durationMs: 42_300 },
  { test: 3, status: 'PASSED', acceptedAgo: 40 * MIN, durationMs: 18_900 },
  { test: 5, status: 'ERROR', errorCode: 'TIMEOUT', acceptedAgo: 55 * MIN, durationMs: 120_000 },
  { test: 6, status: 'ERROR', errorCode: CANCELLED_ERROR_CODE, acceptedAgo: 70 * MIN, durationMs: 9_100 },
  { test: 9, status: 'PASSED', acceptedAgo: 2 * HOUR, durationMs: 125_000 },
  { test: 10, status: 'FAILED', acceptedAgo: 2 * HOUR + 10 * MIN, durationMs: 61_000 },
  { test: 11, status: 'PASSED', acceptedAgo: 3 * HOUR, durationMs: 450 },
  { test: 12, status: 'ERROR', errorCode: 'DISPATCH_FAILED', acceptedAgo: 3 * HOUR + 20 * MIN },
  { test: 13, status: 'PASSED', acceptedAgo: 4 * HOUR, durationMs: 33_000 },
  { test: 15, status: 'ERROR', errorCode: 'START_TIMEOUT', acceptedAgo: 5 * HOUR },
  { test: 17, status: 'PASSED', acceptedAgo: 6 * HOUR, durationMs: 27_400 },
  { test: 18, status: 'PASSED', acceptedAgo: 7 * HOUR, durationMs: 3_720_000 },
  { test: 19, status: 'FAILED', acceptedAgo: 8 * HOUR, durationMs: 14_200 },
  { test: 20, status: 'ERROR', errorCode: CANCELLED_ERROR_CODE, acceptedAgo: 9 * HOUR },
  { test: -1, status: 'PASSED', acceptedAgo: 10 * HOUR, durationMs: 21_000 },
  { test: 23, status: 'PASSED', acceptedAgo: 11 * HOUR, durationMs: 7_800 },
  { test: 24, status: 'FAILED', acceptedAgo: 12 * HOUR, durationMs: 39_000 },
  { test: 1, status: 'PASSED', acceptedAgo: 1 * DAY, durationMs: 36_000 },
  { test: 3, status: 'ERROR', errorCode: 'REFERENCE_UNAVAILABLE', acceptedAgo: 1 * DAY + 2 * HOUR },
  { test: 5, status: 'PASSED', acceptedAgo: 1 * DAY + 5 * HOUR, durationMs: 98_000 },
  { test: 9, status: 'FAILED', acceptedAgo: 1 * DAY + 8 * HOUR, durationMs: 5_400_000 },
  { test: 10, status: 'PASSED', acceptedAgo: 2 * DAY, durationMs: 22_000 },
  { test: 13, status: 'ERROR', errorCode: 'STALE', acceptedAgo: 2 * DAY + 3 * HOUR },
  { test: 15, status: 'PASSED', acceptedAgo: 2 * DAY + 6 * HOUR, durationMs: 16_000 },
  { test: -1, status: 'FAILED', acceptedAgo: 3 * DAY, durationMs: 19_500 },
  { test: 0, status: 'PASSED', acceptedAgo: 3 * DAY + 1 * HOUR, durationMs: 31_000 },
  { test: 17, status: 'ERROR', errorCode: 'AUTHORIZATION_REVOKED', acceptedAgo: 3 * DAY + 4 * HOUR },
  { test: 19, status: 'PASSED', acceptedAgo: 4 * DAY, durationMs: 12_000 },
  { test: 20, status: 'PASSED', acceptedAgo: 4 * DAY + 2 * HOUR, durationMs: 47_000 },
  { test: 23, status: 'ERROR', errorCode: 'DISPATCH_UNKNOWN', acceptedAgo: 5 * DAY },
  { test: 24, status: 'PASSED', acceptedAgo: 5 * DAY + 3 * HOUR, durationMs: 29_000 },
  { test: 11, status: 'FAILED', acceptedAgo: 6 * DAY, durationMs: 8_800 },
  { test: 12, status: 'PASSED', acceptedAgo: 8 * DAY, durationMs: 15_500 },
  { test: 18, status: 'ERROR', errorCode: CANCELLED_ERROR_CODE, acceptedAgo: 10 * DAY, durationMs: 600 },
  { test: 1, status: 'PASSED', acceptedAgo: 14 * DAY, durationMs: 34_000 },
  { test: 6, status: 'ERROR', errorCode: 'DISPATCH_DISABLED', acceptedAgo: 18 * DAY },
  { test: 9, status: 'PASSED', acceptedAgo: 21 * DAY, durationMs: 120_500 },
  // Same instant as the next row on purpose: the list must order them by id, not arbitrarily.
  { test: 3, status: 'PASSED', acceptedAgo: 30 * DAY, durationMs: 20_000 },
  { test: 5, status: 'FAILED', acceptedAgo: 30 * DAY, durationMs: 41_000 },
];

const isTerminal = (status: ExecutionStatus) => status === 'PASSED' || status === 'FAILED' || status === 'ERROR';

function stepResultsFor(spec: DemoRunSpec, steps: readonly string[]): StepResult[] {
  const at = (stepIndex: number) => ({ stepIndex, originalText: steps[stepIndex] });
  const unstarted = (stepIndex: number, status: 'PENDING' | 'SKIPPED'): StepResult => ({
    ...at(stepIndex), status, offsetMs: null, durationMs: null, message: null,
  });
  const per = spec.durationMs ? Math.max(1, Math.floor(spec.durationMs / steps.length)) : 1_000;
  const passed = (stepIndex: number): StepResult => ({
    ...at(stepIndex), status: 'PASS', offsetMs: stepIndex * per, durationMs: per, message: null,
  });
  switch (spec.status) {
    case 'PENDING':
      return steps.map((_, index) => unstarted(index, 'PENDING'));
    case 'RUNNING':
      return steps.map((_, index) =>
        index === 0
          ? passed(0)
          : index === 1
            ? { ...at(1), status: 'RUNNING', offsetMs: per, durationMs: null, message: null }
            : unstarted(index, 'PENDING'),
      );
    case 'PASSED':
      return steps.map((_, index) => passed(index));
    case 'FAILED':
      return steps.map((_, index) =>
        index === 0
          ? passed(0)
          : index === 1
            ? { ...at(1), status: 'FAIL', offsetMs: per, durationMs: per, message: `Step ${index + 1} did not find the expected element` }
            : unstarted(index, 'SKIPPED'),
      );
    default:
      return [];
  }
}

function buildRun(spec: DemoRunSpec, index: number): ExecutionSnapshot {
  const testIndex = spec.test;
  const testSpec = testIndex >= 0 ? testSpecs[testIndex] : undefined;
  const id = executionId(index);
  const acceptedAt = iso(spec.acceptedAgo);
  const started = spec.status === 'RUNNING' || (spec.status !== 'PENDING' && spec.durationMs !== undefined);
  const startedAt = started ? iso(spec.acceptedAgo - 2_000) : null;
  const endedAt = isTerminal(spec.status)
    ? iso(Math.max(0, spec.acceptedAgo - 2_000 - (spec.durationMs ?? 0)))
    : null;
  const hasVideo = spec.status === 'PASSED' || spec.status === 'FAILED';
  return {
    executionId: id,
    testId: testIndex >= 0 ? testId(testIndex) : DEMO_DELETED_TEST_ID,
    csiId: DEMO_CSIS[testSpec?.csi ?? 0],
    revisionId: revisionId(testIndex >= 0 ? testIndex : 99),
    status: spec.status,
    errorCode: spec.errorCode ?? null,
    acceptedAt,
    startedAt,
    endedAt,
    durationMs: spec.status === 'RUNNING' || spec.status === 'PENDING' ? null : spec.durationMs ?? null,
    stepResults: stepResultsFor(spec, testSpec?.steps ?? LOGIN),
    logs: [],
    logsTruncated: false,
    video: hasVideo
      ? { status: 'AVAILABLE', error: null, expiresAt: iso(spec.acceptedAgo - 30 * DAY), partial: false }
      : isTerminal(spec.status)
        ? { status: 'UNAVAILABLE', error: null, expiresAt: null, partial: false }
        : { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
    videoPath: hasVideo ? `/api/v1/studio/executions/${id}/video` : null,
    runtime: started ? runtime : unknownRuntime,
    revision: isTerminal(spec.status) ? 10 : 2,
    streamComplete: isTerminal(spec.status),
  };
}

export const demoExecutions: ExecutionSnapshot[] = runSpecs.map(buildRun);

function lastTerminalRunOf(id: string): ExecutionSnapshot | undefined {
  return demoExecutions
    .filter((run) => run.testId === id && isTerminal(run.status))
    .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))[0];
}

export const demoTests: TestDto[] = testSpecs.map((spec, index) => {
  const id = testId(index);
  const last = lastTerminalRunOf(id);
  // `READY` and `NEEDS_RELEARN` both have a published revision; some unlearned drafts kept one.
  const confirmed =
    spec.readiness === 'READY' || spec.readiness === 'NEEDS_RELEARN' || index % 3 === 0
      ? revisionId(index)
      : null;
  return {
    id,
    name: spec.name,
    description: spec.description,
    csiId: DEMO_CSIS[spec.csi],
    environment: DEMO_ENVIRONMENTS[spec.env],
    steps: spec.steps,
    variables: [],
    configuration: defaultConfiguration(),
    status: 'PAUSED',
    schedule: null,
    createdBy: 'pilot.user@citi.com',
    createdAt: iso(spec.updatedAgo + 7 * DAY),
    updatedAt: iso(spec.updatedAgo),
    lastRunAt: last?.endedAt ?? last?.acceptedAt ?? null,
    lastRunStatus: (last?.status as 'PASSED' | 'FAILED' | 'ERROR' | undefined) ?? null,
    sourceRevision: 1 + (index % 4),
    configurationRevision: 1,
    readiness: spec.readiness,
    // Non-null only with `NEEDS_RELEARN` (the server sets it from STUDIO-OBS-015).
    firstChangedStepId: spec.readiness === 'NEEDS_RELEARN' ? changedStepId(index) : null,
    confirmedRevisionId: confirmed,
  };
});
