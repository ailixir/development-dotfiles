import { defaultConfiguration, type TestDto, type TestReadiness } from '@/types/studio/studioTypes';
import { CONFIRMED_REVISION_ARTIFACT } from './fixtures';

/**
 * One draft per single-path readiness state (ADR-SC-005; STUDIO-OBS-012B), for the run gate and
 * the surfaces that read `GET /tests/{id}`.
 *
 * These replace the retired story 10.10 corpus's run-gate role. They are reachable by id from
 * `GET /tests/{id}` and from the scheduling handlers, and deliberately **not** folded into the list,
 * so the list fixtures keep their counts.
 *
 * Every draft validates against `TestDto` (`studioContract.test.ts`), and the one carrying a
 * published artifact carries the v3 contract's own example rather than a hand-written shape.
 */

const CSI = '60406';
const BASE_STEPS = [
  'Go to "https://www.citi.com"',
  'Click "Sign On"',
  'Type the password into "Password"',
  'Check that the URL contains "dashboard"',
];

const CONFIRMED_HASH = 'c'.repeat(64);

/** The recorded (unconfirmed) revision of the RECORDED fixtures. */
export const RECORDED_FIXTURE_REVISION_ID = '22222222-2222-2222-2222-222222222225';

function draft(id: string, overrides: Partial<TestDto>): TestDto {
  return {
    id,
    name: 'Run gate fixture',
    description: null,
    csiId: CSI,
    environment: 'Staging',
    steps: BASE_STEPS,
    variables: [
      { name: 'USER_ID', kind: 'plain', value: 'pilot-user' },
      // A reference, never a resolved value: resolved secrets never travel on this contract.
      { name: 'LOGIN_PW', kind: 'secretRef', secretId: 'LOGIN_PW' },
    ],
    configuration: defaultConfiguration(),
    status: 'PAUSED',
    schedule: null,
    createdBy: 'pilot.user@citi.com',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-10T09:30:00Z',
    lastRunAt: null,
    lastRunStatus: null,
    sourceRevision: 4,
    configurationRevision: 1,
    readiness: 'UNLEARNED',
    firstChangedStepId: null,
    confirmedRevisionId: null,
    confirmedRevisionArtifactHash: null,
    confirmedRevisionArtifact: null,
    ...overrides,
  };
}

/** Never learned: no published revision matches the draft. */
export const unlearnedDraft = draft('a0000000-0000-0000-0000-000000000001', {
  readiness: 'UNLEARNED',
});

/** A guided session for this draft is in progress. */
export const learningDraft = draft('a0000000-0000-0000-0000-000000000002', {
  readiness: 'LEARNING',
});

/** The published revision matches the draft and replays model-free. */
export const readyDraft = draft('a0000000-0000-0000-0000-000000000003', {
  readiness: 'READY',
  confirmedRevisionId: '22222222-2222-2222-2222-222222222222',
  confirmedRevisionArtifactHash: CONFIRMED_HASH,
  confirmedRevisionArtifact: CONFIRMED_REVISION_ARTIFACT,
});

/**
 * A published revision exists and a step changed. The server emits this only from STUDIO-OBS-015;
 * the fixture exists so the run gate is enumerated over every state the document declares.
 */
export const needsRelearnDraft = draft('a0000000-0000-0000-0000-000000000004', {
  readiness: 'NEEDS_RELEARN',
  firstChangedStepId: '00000000-0000-4000-8000-000000000002',
  confirmedRevisionId: '22222222-2222-2222-2222-222222222224',
});

/**
 * A learned revision was recorded and matches the draft; its model-free proof has not passed
 * (ADR-SC-008 D5). `verification` names the state and the first step without a PASSED receipt (the
 * second step of the draft here). Nothing is confirmed: `confirmedRevisionId` is null.
 */
export const recordedDraft = draft('a0000000-0000-0000-0000-000000000005', {
  readiness: 'RECORDED',
  verification: { state: 'INCOMPLETE', firstUnverifiedStepId: '00000000-0000-4000-8000-000000000002' },
});

/** The recorded draft whose proof FAILED: Studio offers "Re-learn from step N", not Verify again. */
export const recordedFailedDraft = draft('a0000000-0000-0000-0000-000000000006', {
  readiness: 'RECORDED',
  verification: { state: 'FAILED', firstUnverifiedStepId: '00000000-0000-4000-8000-000000000002' },
});

/** The draft returned by `GET /tests/{id}` for each readiness state, keyed by state. */
export const draftsByReadiness: Readonly<Record<TestReadiness, TestDto>> = {
  UNLEARNED: unlearnedDraft,
  LEARNING: learningDraft,
  RECORDED: recordedDraft,
  READY: readyDraft,
  NEEDS_RELEARN: needsRelearnDraft,
};

/** Every readiness draft, for the handlers' by-id lookup. */
export const readinessDrafts: readonly TestDto[] = [...Object.values(draftsByReadiness), recordedFailedDraft];
