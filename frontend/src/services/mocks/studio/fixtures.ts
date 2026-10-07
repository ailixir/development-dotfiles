/**
 * Studio mock fixtures, generated against the frozen contract (story 10.1, AC-16).
 *
 * Two CSIs exist on purpose. A mock that only ever holds one tenant's data cannot demonstrate
 * that list endpoints are scoped, and CSI scoping is the security property this module is most
 * likely to get wrong.
 *
 * Between them the execution fixtures cover every terminal outcome (PASSED, FAILED,
 * ERROR/TIMEOUT) and every evidence state (PROCESSING, AVAILABLE, FAILED, UNAVAILABLE, EXPIRED),
 * plus the legacy row that has no confirmed revision.
 */

import {
  defaultConfiguration,
  type ExecutionSnapshot,
  type SourceArtifact,
  type TestDto,
} from '@/types/studio/studioTypes';
import { DEMO_CSIS } from './demoFixtures';

/**
 * The CSIs the mock principal may read. Anything else must stay invisible. `60406` holds the
 * contract corpus below; the others hold the demo-scale list data in `demoFixtures.ts`.
 */
export const MOCK_READABLE_CSIS: string[] = [...DEMO_CSIS];

export const OTHER_CSI = '60499';

const VIDEO_PATH = (executionId: string) => `/api/v1/studio/executions/${executionId}/video`;

export const mockArtifact: SourceArtifact = {
  version: 1,
  steps: [
    {
      stepIndex: 0,
      originalText: 'Go to "https://www.citi.com"',
      code: "await page.goto('https://www.citi.com');",
    },
    {
      stepIndex: 1,
      originalText: 'Click "Sign On"',
      code: "await page.getByRole('button', { name: 'Sign On' }).click();",
    },
    {
      stepIndex: 2,
      originalText: 'Check that the URL contains "dashboard"',
      code: 'await expect(page).toHaveURL(/dashboard/);',
    },
  ],
};

const mockTestsUnordered: TestDto[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Citi login smoke',
    description: 'Verifies the login page still accepts the pilot account',
    csiId: '60406',
    environment: 'Production',
    steps: [
      'Go to "https://www.citi.com"',
      'Click "Sign On"',
      'Check that the URL contains "dashboard"',
    ],
    variables: [
      { name: 'USER_ID', kind: 'plain', value: 'pilot-user' },
      { name: 'LOGIN_PW', kind: 'secretRef', secretId: 'vault://studio/pilot-pw' },
    ],
    configuration: defaultConfiguration(),
    status: 'PAUSED',
    schedule: null,
    createdBy: 'pilot.user@citi.com',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-01T09:30:00Z',
    lastRunAt: '2026-09-10T10:00:39Z',
    lastRunStatus: 'PASSED',
    sourceRevision: 3,
    configurationRevision: 1,
    compileStatus: 'READY',
    currentCandidateRevisionId: '22222222-2222-2222-2222-222222222222',
    currentCandidateArtifactHash: 'a'.repeat(64),
    currentCandidateArtifact: mockArtifact,
    confirmedRevisionId: '22222222-2222-2222-2222-222222222222',
    confirmedRevisionArtifactHash: 'a'.repeat(64),
    confirmedRevisionArtifact: mockArtifact,
  },
  {
    id: '11111111-1111-1111-1111-111111111112',
    name: 'Statements download',
    description: 'A draft that has been edited since its last confirmation',
    csiId: '60406',
    environment: 'Staging',
    steps: ['Go to "https://www.citi.com/statements"'],
    variables: [],
    configuration: defaultConfiguration(),
    status: 'PAUSED',
    schedule: null,
    createdBy: 'pilot.user@citi.com',
    createdAt: '2026-09-02T09:00:00Z',
    updatedAt: '2026-09-09T16:12:00Z',
    lastRunAt: null,
    lastRunStatus: null,
    sourceRevision: 5,
    configurationRevision: 2,
    compileStatus: 'STALE',
    currentCandidateRevisionId: null,
    confirmedRevisionId: '22222222-2222-2222-2222-222222222223',
    confirmedRevisionArtifactHash: 'b'.repeat(64),
    confirmedRevisionArtifact: { version: 1, steps: [
      {stepIndex:0,originalText:'Open the previously confirmed statement page',code:"await page.goto('https://www.citi.com/previous-statements');"},
    ]},
  },
  {
    // Belongs to a CSI the mock principal cannot read. No list handler may ever return it.
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Another CSI private draft',
    description: 'Must never appear in a scoped list',
    csiId: OTHER_CSI,
    environment: 'Production',
    steps: ['Go to "https://internal.example.com"'],
    variables: [],
    configuration: defaultConfiguration(),
    status: 'PAUSED',
    schedule: null,
    createdBy: 'someone.else@citi.com',
    createdAt: '2026-08-20T09:00:00Z',
    updatedAt: '2026-08-20T09:00:00Z',
    lastRunAt: null,
    lastRunStatus: null,
    sourceRevision: 1,
    configurationRevision: 1,
    compileStatus: 'STALE',
    currentCandidateRevisionId: null,
    confirmedRevisionId: null,
  },
];

/** Keep the long-standing contract fixture first; several transport-contract tests bind to it. */
export const mockTests: TestDto[] = [
  ...mockTestsUnordered.filter((test) => test.id === '11111111-1111-1111-1111-111111111111'),
  ...mockTestsUnordered.filter((test) => test.id === '11111111-1111-1111-1111-111111111112'),
  ...mockTestsUnordered.filter((test) => test.csiId === OTHER_CSI),
];

const TEST_ID = mockTests[0].id;
const REVISION_ID = '22222222-2222-2222-2222-222222222222';

const runtime = {
  playwright: '1.47.2',
  chromium: '129.0.6668.29',
  validator: '1.0.0',
  executor: '1.0.0',
  image: 'studio-runner@sha256:0f1e2d3c4b5a6978',
};

const unknownRuntime = {
  playwright: null,
  chromium: null,
  validator: null,
  executor: null,
  image: null,
};

export const mockExecutions: ExecutionSnapshot[] = [
  {
    executionId: '44444444-4444-4444-4444-444444444440',
    testId: TEST_ID,
    csiId: '60406',
    revisionId: REVISION_ID,
    status: 'PENDING',
    errorCode: null,
    acceptedAt: '2026-09-10T14:00:00Z',
    startedAt: null,
    endedAt: null,
    durationMs: null,
    stepResults: mockArtifact.steps.map((step) => ({
      stepIndex: step.stepIndex,
      originalText: step.originalText,
      status: 'PENDING' as const,
      offsetMs: null,
      durationMs: null,
      message: null,
    })),
    logs: [],
    logsTruncated: false,
    video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
    videoPath: null,
    runtime: unknownRuntime,
    revision: 1,
    streamComplete: false,
  },
  {
    executionId: '44444444-4444-4444-4444-444444444441',
    testId: TEST_ID,
    csiId: '60406',
    revisionId: REVISION_ID,
    status: 'RUNNING',
    errorCode: null,
    acceptedAt: '2026-09-10T13:00:00Z',
    startedAt: '2026-09-10T13:00:02Z',
    endedAt: null,
    durationMs: null,
    stepResults: [
      {
        stepIndex: 0,
        originalText: mockArtifact.steps[0].originalText,
        status: 'PASS',
        offsetMs: 120,
        durationMs: 1840,
        message: null,
      },
      {
        stepIndex: 1,
        originalText: mockArtifact.steps[1].originalText,
        status: 'RUNNING',
        offsetMs: 1960,
        durationMs: null,
        message: null,
      },
      {
        stepIndex: 2,
        originalText: mockArtifact.steps[2].originalText,
        status: 'PENDING',
        offsetMs: null,
        durationMs: null,
        message: null,
      },
    ],
    logs: [
      { at: '2026-09-10T13:00:02Z', level: 'INFO', message: 'Browser started', stepIndex: null },
    ],
    logsTruncated: false,
    video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
    videoPath: null,
    runtime,
    revision: 6,
    streamComplete: false,
  },
  {
    executionId: '44444444-4444-4444-4444-444444444442',
    testId: TEST_ID,
    csiId: '60406',
    revisionId: REVISION_ID,
    status: 'PASSED',
    errorCode: null,
    acceptedAt: '2026-09-10T10:00:00Z',
    startedAt: '2026-09-10T10:00:02Z',
    endedAt: '2026-09-10T10:00:39Z',
    durationMs: 37000,
    stepResults: mockArtifact.steps.map((step, index) => ({
      stepIndex: step.stepIndex,
      originalText: step.originalText,
      status: 'PASS' as const,
      offsetMs: 120 + index * 12000,
      durationMs: 12000,
      message: null,
    })),
    logs: [
      {
        at: '2026-09-10T10:00:39Z',
        level: 'INFO',
        message: 'Run finished: PASSED',
        stepIndex: null,
      },
    ],
    logsTruncated: false,
    video: {
      status: 'AVAILABLE',
      error: null,
      expiresAt: '2026-10-10T10:00:39Z',
      partial: false,
    },
    videoPath: VIDEO_PATH('44444444-4444-4444-4444-444444444442'),
    runtime,
    revision: 12,
    streamComplete: true,
  },
  {
    executionId: '44444444-4444-4444-4444-444444444443',
    testId: TEST_ID,
    csiId: '60406',
    revisionId: REVISION_ID,
    status: 'FAILED',
    errorCode: null,
    acceptedAt: '2026-09-09T11:00:00Z',
    startedAt: '2026-09-09T11:00:03Z',
    endedAt: '2026-09-09T11:00:36Z',
    durationMs: 33000,
    stepResults: [
      {
        stepIndex: 0,
        originalText: mockArtifact.steps[0].originalText,
        status: 'PASS',
        offsetMs: 110,
        durationMs: 1700,
        message: null,
      },
      {
        stepIndex: 1,
        originalText: mockArtifact.steps[1].originalText,
        status: 'FAIL',
        offsetMs: 1810,
        durationMs: 30000,
        message: "Locator getByRole('button', { name: 'Sign On' }) did not resolve within 30000 ms",
      },
      // Everything after the first failure is skipped, with null timings and no seek.
      {
        stepIndex: 2,
        originalText: mockArtifact.steps[2].originalText,
        status: 'SKIPPED',
        offsetMs: null,
        durationMs: null,
        message: null,
      },
    ],
    logs: [
      {
        at: '2026-09-09T11:00:36Z',
        level: 'ERROR',
        message: 'Step 2 failed; remaining steps skipped',
        stepIndex: 1,
      },
    ],
    logsTruncated: true,
    video: {
      status: 'AVAILABLE',
      error: null,
      expiresAt: '2026-10-09T11:00:36Z',
      partial: false,
    },
    videoPath: VIDEO_PATH('44444444-4444-4444-4444-444444444443'),
    runtime,
    revision: 9,
    streamComplete: true,
  },
  {
    executionId: '44444444-4444-4444-4444-444444444444',
    testId: TEST_ID,
    csiId: '60406',
    revisionId: REVISION_ID,
    status: 'ERROR',
    errorCode: 'TIMEOUT',
    acceptedAt: '2026-09-08T12:00:00Z',
    startedAt: '2026-09-08T12:00:02Z',
    endedAt: '2026-09-08T12:02:02Z',
    durationMs: 120000,
    stepResults: [
      {
        stepIndex: 0,
        originalText: mockArtifact.steps[0].originalText,
        status: 'PASS',
        offsetMs: 100,
        durationMs: 1500,
        message: null,
      },
      {
        stepIndex: 1,
        originalText: mockArtifact.steps[1].originalText,
        status: 'RUNNING',
        offsetMs: 1600,
        durationMs: null,
        message: 'Total browser runtime deadline reached',
      },
      {
        stepIndex: 2,
        originalText: mockArtifact.steps[2].originalText,
        status: 'SKIPPED',
        offsetMs: null,
        durationMs: null,
        message: null,
      },
    ],
    logs: [],
    logsTruncated: false,
    video: {
      status: 'AVAILABLE',
      error: null,
      expiresAt: '2026-10-08T12:02:02Z',
      partial: true,
    },
    videoPath: VIDEO_PATH('44444444-4444-4444-4444-444444444444'),
    runtime,
    revision: 7,
    streamComplete: true,
  },
  {
    executionId: '44444444-4444-4444-4444-444444444445',
    testId: TEST_ID,
    csiId: '60406',
    revisionId: REVISION_ID,
    status: 'PASSED',
    errorCode: null,
    acceptedAt: '2026-09-07T13:00:00Z',
    startedAt: '2026-09-07T13:00:02Z',
    endedAt: '2026-09-07T13:00:21Z',
    durationMs: 19000,
    stepResults: [],
    logs: [],
    logsTruncated: false,
    video: {
      status: 'FAILED',
      error: 'Evidence upload failed after 3 attempts',
      expiresAt: null,
      partial: false,
    },
    videoPath: null,
    runtime,
    revision: 8,
    streamComplete: true,
  },
  {
    executionId: '44444444-4444-4444-4444-444444444446',
    testId: TEST_ID,
    csiId: '60406',
    revisionId: REVISION_ID,
    status: 'ERROR',
    errorCode: 'START_TIMEOUT',
    acceptedAt: '2026-09-06T14:00:00Z',
    startedAt: null,
    endedAt: '2026-09-06T14:00:30Z',
    durationMs: null,
    stepResults: [],
    logs: [],
    logsTruncated: false,
    video: {
      status: 'UNAVAILABLE',
      error: 'The browser never started; there is no recording',
      expiresAt: null,
      partial: false,
    },
    videoPath: null,
    runtime: unknownRuntime,
    revision: 3,
    streamComplete: true,
  },
  {
    executionId: '44444444-4444-4444-4444-444444444447',
    testId: TEST_ID,
    csiId: '60406',
    revisionId: REVISION_ID,
    status: 'PASSED',
    errorCode: null,
    acceptedAt: '2026-07-15T10:00:00Z',
    startedAt: '2026-07-15T10:00:02Z',
    endedAt: '2026-07-15T10:00:24Z',
    durationMs: 22000,
    stepResults: [],
    logs: [],
    logsTruncated: false,
    video: {
      status: 'EXPIRED',
      error: null,
      expiresAt: '2026-08-14T10:00:24Z',
      partial: false,
    },
    videoPath: null,
    runtime,
    revision: 11,
    streamComplete: true,
  },
  {
    // Pre-10.1 history: no confirmed revision and no runtime provenance are invented for it.
    executionId: '44444444-4444-4444-4444-444444444448',
    testId: TEST_ID,
    csiId: '60406',
    revisionId: null,
    status: 'PASSED',
    errorCode: null,
    acceptedAt: '2026-05-20T08:00:00Z',
    startedAt: null,
    endedAt: '2026-05-20T08:00:14Z',
    durationMs: 14000,
    stepResults: [],
    logs: [],
    logsTruncated: false,
    video: { status: 'UNAVAILABLE', error: null, expiresAt: null, partial: false },
    videoPath: null,
    runtime: unknownRuntime,
    revision: 0,
    streamComplete: true,
  },
  {
    // Another CSI's run. No list handler may ever return it.
    executionId: '55555555-5555-5555-5555-555555555555',
    testId: '33333333-3333-3333-3333-333333333333',
    csiId: OTHER_CSI,
    revisionId: null,
    status: 'PASSED',
    errorCode: null,
    acceptedAt: '2026-09-01T08:00:00Z',
    startedAt: '2026-09-01T08:00:02Z',
    endedAt: '2026-09-01T08:00:20Z',
    durationMs: 18000,
    stepResults: [],
    logs: [],
    logsTruncated: false,
    video: { status: 'UNAVAILABLE', error: null, expiresAt: null, partial: false },
    videoPath: null,
    runtime: unknownRuntime,
    revision: 4,
    streamComplete: true,
  },
];

/**
 * The bytes `GET /executions/{id}/video` serves in the mock (story 10.16a, AC-13).
 *
 * Small and in memory. It is a valid six-second VP8/WebM recording so the development Proof tab can
 * exercise metadata loading, playback, seeking, byte ranges, and download. The handler computes
 * every response length from this array at request time, so no length is transcribed anywhere.
 */
const MOCK_VIDEO_BASE64 =
  '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';

/** A valid six-second VP8/WebM proof fixture, decoded once for range-capable mock responses. */
export const MOCK_VIDEO_BYTES: Uint8Array = Uint8Array.from(
  globalThis.atob(MOCK_VIDEO_BASE64),
  (character) => character.charCodeAt(0),
);
