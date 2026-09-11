import {
  defaultConfiguration,
  type CompileDiagnostic,
  type CompileDiagnostics,
  type CompileStepDiagnostics,
  type TestDto,
} from '@/types/studio/studioTypes';
import { DIAGNOSTICS_CAPS, TRUNCATION_MARKER, clampLikeBounder, overCap } from './diagnosticsBounds';

/**
 * The compile-review fixture corpus (story 10.10, AC-20).
 *
 * AC-1's state enumeration is self-policing because it reads the union from `openapi.yaml`:
 * a missing `compileStatus` fixture goes red on its own. **Nothing else here is.** If the
 * per-step truncation fixture is never written, AC-7 does not go red — the test simply does not
 * exist, and a reviewer reading a green suite cannot tell "all three levels are covered" from
 * "one was never fixtured". So the required shapes are enumerated below as
 * {@link COMPILE_FIXTURE_MATRIX}, each with the discriminating property it exists to carry, and
 * `compileFixtureMatrix.test.ts` asserts (a) every entry still carries that property and (b)
 * every entry is named by at least one test title in this story's suite.
 *
 * Every fixture validates against the amended `TestDto` through the existing Ajv harness in
 * `studioContract.test.ts` and carries no field the contract does not declare.
 */

const CSI = '60406';
const BASE_STEPS = [
  'Go to "https://www.citi.com"',
  'Click "Sign On"',
  'Type the password into "Password"',
  'Check that the URL contains "dashboard"',
];

function draft(id: string, overrides: Partial<TestDto>): TestDto {
  return {
    id,
    name: 'Compile review fixture',
    description: null,
    csiId: CSI,
    environment: 'Staging',
    steps: BASE_STEPS,
    variables: [
      { name: 'USER_ID', kind: 'plain', value: 'pilot-user' },
      // A reference, never a resolved value: §9.2 keeps resolved secrets off this contract, and a
      // corpus with no reference cannot show that the opaque rendering holds.
      { name: 'LOGIN_PW', kind: 'secretRef', secretId: 'vault://studio/pilot-pw' },
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
    compileStatus: 'STALE',
    currentCandidateRevisionId: null,
    confirmedRevisionId: null,
    compileError: null,
    compileDiagnostics: null,
    ...overrides,
  };
}

function diagnostic(overrides: Partial<CompileDiagnostic> & { stepIndex: number | null }): CompileDiagnostic {
  return {
    code: 'UNSUPPORTED_ACTION',
    message: 'This line asks for something the runner cannot do on a single page.',
    node: 'Action',
    excerpt: 'open in a new tab',
    ...overrides,
  };
}

function stepEntry(
  stepIndex: number,
  diagnostics: CompileDiagnostic[],
  truncated = false,
): CompileStepDiagnostics {
  return { stepIndex, ok: diagnostics.length === 0 && !truncated, diagnostics, truncated };
}

function diagnosticsDoc(overrides: Partial<CompileDiagnostics>): CompileDiagnostics {
  return {
    validatorSchemaVersion: '1.0.0',
    artifact: [],
    steps: BASE_STEPS.map((_, index) => stepEntry(index, [])),
    truncated: false,
    truncationReason: null,
    attempts: 1,
    exhausted: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------------
// The five states (AC-1, AC-2).
// ---------------------------------------------------------------------------------------------

export const compilingDraft = draft('a0000000-0000-0000-0000-000000000001', {
  compileStatus: 'COMPILING',
});

export const awaitingDraft = draft('a0000000-0000-0000-0000-000000000002', {
  compileStatus: 'AWAITING_CONFIRMATION',
  currentCandidateRevisionId: '22222222-2222-2222-2222-222222222222',
});

export const readyDraft = draft('a0000000-0000-0000-0000-000000000003', {
  compileStatus: 'READY',
  currentCandidateRevisionId: '22222222-2222-2222-2222-222222222222',
  confirmedRevisionId: '22222222-2222-2222-2222-222222222222',
});

/**
 * The `NEEDS_REVISION` corpus fixture, deliberately not degenerate: four steps with an **accepted
 * step between two rejected ones**, so an off-by-one join produces a visibly wrong attribution
 * rather than a coincidentally-correct one (AC-6).
 */
export const needsRevisionDraft = draft('a0000000-0000-0000-0000-000000000004', {
  compileStatus: 'NEEDS_REVISION',
  compileDiagnostics: diagnosticsDoc({
    steps: [
      stepEntry(0, []),
      stepEntry(1, [
        diagnostic({
          stepIndex: 1,
          code: 'UNKNOWN_TARGET',
          message: 'Nothing on the page is described as "Sign On" in a way the runner can find.',
          excerpt: '"Sign On"',
        }),
      ]),
      // The accepted step between two rejected ones.
      stepEntry(2, []),
      stepEntry(3, [
        diagnostic({
          stepIndex: 3,
          code: 'UNSUPPORTED_ASSERTION',
          message: 'Checking the address bar this way is not something the runner can do yet.',
          excerpt: 'URL contains "dashboard"',
        }),
      ]),
    ],
    attempts: 3,
    exhausted: true,
  }),
});

export const staleDraft = draft('a0000000-0000-0000-0000-000000000005', {
  compileStatus: 'STALE',
  compileError: { code: 'GATEWAY_TIMEOUT' },
});

// ---------------------------------------------------------------------------------------------
// `compileError` codes (AC-5): two declared, one the document does not declare.
// ---------------------------------------------------------------------------------------------

export const poolSaturatedDraft = draft('a0000000-0000-0000-0000-000000000006', {
  compileStatus: 'STALE',
  compileError: { code: 'COMPILE_POOL_SATURATED' },
});

/** §14.7 permits the set to grow, so a code this build has never heard of is expected input. */
export const UNDECLARED_COMPILE_ERROR_CODE = 'GATEWAY_MOON_PHASE_WRONG';

export const undeclaredCodeDraft = draft('a0000000-0000-0000-0000-000000000007', {
  compileStatus: 'STALE',
  compileError: { code: UNDECLARED_COMPILE_ERROR_CODE },
});

// ---------------------------------------------------------------------------------------------
// The three truncation levels (AC-7).
// ---------------------------------------------------------------------------------------------

/** The pre-clamp strings. Both are over the cap by construction, not by a typed length. */
const LONG_MESSAGE_SOURCE = overCap(
  'The runner could not work out which element this line means, and the page offers several that match. ',
  DIAGNOSTICS_CAPS.maxMessageChars,
);
const LONG_EXCERPT_SOURCE = overCap(
  'button[data-testid="sign-on-primary-action-with-a-very-long-attribute"] ',
  DIAGNOSTICS_CAPS.maxExcerptChars,
);

export const CLAMPED_MESSAGE = clampLikeBounder(LONG_MESSAGE_SOURCE, DIAGNOSTICS_CAPS.maxMessageChars);
export const CLAMPED_EXCERPT = clampLikeBounder(LONG_EXCERPT_SOURCE, DIAGNOSTICS_CAPS.maxExcerptChars);

/** Level 1 — a `message` and an `excerpt` that were really cut, carrying the real marker. */
export const clampedStringsDraft = draft('a0000000-0000-0000-0000-000000000008', {
  compileStatus: 'NEEDS_REVISION',
  compileDiagnostics: diagnosticsDoc({
    steps: [
      stepEntry(0, []),
      stepEntry(1, [
        diagnostic({
          stepIndex: 1,
          code: 'AMBIGUOUS_TARGET',
          message: CLAMPED_MESSAGE,
          excerpt: CLAMPED_EXCERPT,
        }),
      ]),
      stepEntry(2, []),
      stepEntry(3, []),
    ],
  }),
});

/**
 * Level 2 — a step whose diagnostic list was **actually shed** to produce `truncated: true`:
 * more diagnostics were produced than the per-step cap allows, and the kept list is what the
 * bounder would have kept.
 */
const OVER_CAP_DIAGNOSTICS: CompileDiagnostic[] = Array.from(
  { length: DIAGNOSTICS_CAPS.maxPerStep + 3 },
  (_, index) =>
    diagnostic({
      stepIndex: 1,
      code: `UNSUPPORTED_ACTION_${index}`,
      message: `Problem ${index + 1} the translator raised against this line.`,
      excerpt: `fragment ${index + 1}`,
    }),
);

export const SHED_DIAGNOSTIC_COUNT = OVER_CAP_DIAGNOSTICS.length - DIAGNOSTICS_CAPS.maxPerStep;

export const stepTruncatedDraft = draft('a0000000-0000-0000-0000-000000000009', {
  compileStatus: 'NEEDS_REVISION',
  compileDiagnostics: diagnosticsDoc({
    steps: [
      stepEntry(0, []),
      stepEntry(
        1,
        OVER_CAP_DIAGNOSTICS.slice(0, DIAGNOSTICS_CAPS.maxPerStep),
        OVER_CAP_DIAGNOSTICS.length > DIAGNOSTICS_CAPS.maxPerStep,
      ),
      stepEntry(2, []),
      stepEntry(3, []),
    ],
  }),
});

/**
 * Level 3 — the document shed whole steps' reasons to fit the byte cap. This one is hand-set:
 * `truncationReason: TOTAL_BYTES` is a document-level fact with no clamped string behind it.
 */
export const documentTruncatedDraft = draft('a0000000-0000-0000-0000-00000000000a', {
  compileStatus: 'NEEDS_REVISION',
  compileDiagnostics: diagnosticsDoc({
    steps: [
      stepEntry(
        0,
        [diagnostic({ stepIndex: 0, code: 'UNSUPPORTED_ACTION', message: 'The first line is not runnable as written.' })],
      ),
      stepEntry(1, [], true),
      stepEntry(2, [], true),
      stepEntry(3, [], true),
    ],
    truncated: true,
    truncationReason: 'TOTAL_BYTES',
  }),
});

// ---------------------------------------------------------------------------------------------
// Repair facts (AC-8).
// ---------------------------------------------------------------------------------------------

export const notExhaustedDraft = draft('a0000000-0000-0000-0000-00000000000b', {
  compileStatus: 'NEEDS_REVISION',
  compileDiagnostics: diagnosticsDoc({
    steps: [
      stepEntry(0, []),
      stepEntry(1, [diagnostic({ stepIndex: 1, code: 'UNKNOWN_TARGET', message: 'Nothing matches this description.' })],),
      stepEntry(2, []),
      stepEntry(3, []),
    ],
    attempts: 1,
    exhausted: false,
  }),
});

/** Artifact-level rejections, belonging to no single step. */
export const artifactRejectionDraft = draft('a0000000-0000-0000-0000-00000000000c', {
  compileStatus: 'NEEDS_REVISION',
  compileDiagnostics: diagnosticsDoc({
    artifact: [
      diagnostic({
        stepIndex: null,
        code: 'ARTIFACT_TOO_MANY_ACTIONS',
        message: 'Taken together, these lines ask for more actions than one test may hold.',
        excerpt: null,
        node: null,
      }),
    ],
    attempts: 2,
    exhausted: false,
  }),
});

/** A document whose step count does not match the draft's — surfaced, never padded (AC-6). */
export const misalignedDraft = draft('a0000000-0000-0000-0000-00000000000d', {
  compileStatus: 'NEEDS_REVISION',
  compileDiagnostics: diagnosticsDoc({
    steps: [stepEntry(0, []), stepEntry(1, [])],
  }),
});

export const compileReviewDrafts: TestDto[] = [
  compilingDraft,
  awaitingDraft,
  readyDraft,
  needsRevisionDraft,
  staleDraft,
  poolSaturatedDraft,
  undeclaredCodeDraft,
  clampedStringsDraft,
  stepTruncatedDraft,
  documentTruncatedDraft,
  notExhaustedDraft,
  artifactRejectionDraft,
  misalignedDraft,
];

/** The draft returned by `GET /tests/{id}` for each of the five states, keyed by state. */
export const draftsByCompileStatus: Record<string, TestDto> = {
  COMPILING: compilingDraft,
  AWAITING_CONFIRMATION: awaitingDraft,
  READY: readyDraft,
  NEEDS_REVISION: needsRevisionDraft,
  STALE: staleDraft,
};

// ---------------------------------------------------------------------------------------------
// The enumerable, self-checking required set (AC-20, @po amendment).
// ---------------------------------------------------------------------------------------------

export interface RequiredFixture {
  /** Quoted verbatim in the title of at least one test that consumes the fixture. */
  readonly id: string;
  readonly description: string;
  readonly resolve: () => unknown;
  /** The discriminating property. Returns null when satisfied, or why not. */
  readonly satisfies: () => string | null;
}

const stepsOf = (test: TestDto) => test.compileDiagnostics?.steps ?? [];

export const COMPILE_FIXTURE_MATRIX: readonly RequiredFixture[] = [
  ...['COMPILING', 'AWAITING_CONFIRMATION', 'READY', 'NEEDS_REVISION', 'STALE'].map((state) => ({
    id: `FX-STATE-${state}`,
    description: `a draft in ${state}`,
    resolve: () => draftsByCompileStatus[state],
    satisfies: () =>
      draftsByCompileStatus[state]?.compileStatus === state
        ? null
        : `no fixture carries compileStatus ${state}`,
  })),
  {
    id: 'FX-ACCEPTED-BETWEEN-REJECTED',
    description: 'a NEEDS_REVISION document with an accepted step between two rejected ones',
    resolve: () => needsRevisionDraft,
    satisfies: () => {
      const entries = stepsOf(needsRevisionDraft);
      const rejected = entries
        .map((entry, index) => (entry.diagnostics.length > 0 ? index : -1))
        .filter((index) => index !== -1);
      if (rejected.length < 2) {
        return 'fewer than two rejected steps, so an off-by-one join could not be seen';
      }
      const between = entries
        .slice(rejected[0] + 1, rejected[rejected.length - 1])
        .some((entry) => entry.diagnostics.length === 0);
      return between ? null : 'no accepted step lies between two rejected ones';
    },
  },
  {
    id: 'FX-TRUNC-CLAMPED-STRING',
    description: 'a message and an excerpt that were really clamped, marker and all',
    resolve: () => clampedStringsDraft,
    satisfies: () => {
      const found = stepsOf(clampedStringsDraft).flatMap((entry) => entry.diagnostics);
      const message = found[0]?.message ?? '';
      const excerpt = found[0]?.excerpt ?? '';
      if (LONG_MESSAGE_SOURCE.length <= DIAGNOSTICS_CAPS.maxMessageChars) {
        return 'the pre-clamp message was never over the cap, so no clamp happened';
      }
      if (LONG_EXCERPT_SOURCE.length <= DIAGNOSTICS_CAPS.maxExcerptChars) {
        return 'the pre-clamp excerpt was never over the cap, so no clamp happened';
      }
      if (message.length !== DIAGNOSTICS_CAPS.maxMessageChars || !message.endsWith(TRUNCATION_MARKER)) {
        return 'the message is not exactly one cap long ending in the marker';
      }
      if (excerpt.length !== DIAGNOSTICS_CAPS.maxExcerptChars || !excerpt.endsWith(TRUNCATION_MARKER)) {
        return 'the excerpt is not exactly one cap long ending in the marker';
      }
      return null;
    },
  },
  {
    id: 'FX-TRUNC-STEP',
    description: 'a step whose diagnostics were actually shed to produce truncated: true',
    resolve: () => stepTruncatedDraft,
    satisfies: () => {
      const entry = stepsOf(stepTruncatedDraft).find((candidate) => candidate.truncated);
      if (!entry) {
        return 'no step carries truncated: true';
      }
      if (OVER_CAP_DIAGNOSTICS.length <= DIAGNOSTICS_CAPS.maxPerStep) {
        return 'the pre-shed list never exceeded the per-step cap, so nothing was shed';
      }
      return entry.diagnostics.length === DIAGNOSTICS_CAPS.maxPerStep
        ? null
        : 'the kept list is not the per-step cap, so the flag was set by hand';
    },
  },
  {
    id: 'FX-TRUNC-DOCUMENT',
    description: 'a document-level truncation with its reason',
    resolve: () => documentTruncatedDraft,
    satisfies: () =>
      documentTruncatedDraft.compileDiagnostics?.truncated === true &&
      documentTruncatedDraft.compileDiagnostics?.truncationReason === 'TOTAL_BYTES'
        ? null
        : 'no fixture carries a document-level truncation with TOTAL_BYTES',
  },
  {
    id: 'FX-EXHAUSTED-TRUE',
    description: 'a document where the repair bound was reached',
    resolve: () => needsRevisionDraft,
    satisfies: () =>
      needsRevisionDraft.compileDiagnostics?.exhausted === true
        ? null
        : 'no fixture carries exhausted: true',
  },
  {
    id: 'FX-EXHAUSTED-FALSE',
    description: 'a document where the repair bound was not reached, on the first attempt',
    resolve: () => notExhaustedDraft,
    satisfies: () =>
      notExhaustedDraft.compileDiagnostics?.exhausted === false &&
      notExhaustedDraft.compileDiagnostics?.attempts === 1
        ? null
        : 'no fixture carries exhausted: false with attempts: 1',
  },
  {
    id: 'FX-CODE-DECLARED',
    description: 'two distinct declared compileError codes',
    resolve: () => [staleDraft, poolSaturatedDraft],
    satisfies: () => {
      const codes = new Set(
        [staleDraft, poolSaturatedDraft].map((test) => test.compileError?.code).filter(Boolean),
      );
      return codes.size >= 2 ? null : 'fewer than two distinct declared codes in the corpus';
    },
  },
  {
    id: 'FX-CODE-UNDECLARED',
    description: 'a compileError code the document does not declare',
    resolve: () => undeclaredCodeDraft,
    satisfies: () =>
      undeclaredCodeDraft.compileError?.code === UNDECLARED_COMPILE_ERROR_CODE
        ? null
        : 'no fixture carries an undeclared code',
  },
  {
    id: 'FX-ARTIFACT-REJECTION',
    description: 'an artifact-level rejection belonging to no single step',
    resolve: () => artifactRejectionDraft,
    satisfies: () => {
      const artifact = artifactRejectionDraft.compileDiagnostics?.artifact ?? [];
      return artifact.length > 0 && artifact.every((entry) => entry.stepIndex === null)
        ? null
        : 'no fixture carries an artifact-level rejection with a null stepIndex';
    },
  },
  {
    id: 'FX-MISALIGNED-DOCUMENT',
    description: 'a document whose step count does not match the draft',
    resolve: () => misalignedDraft,
    satisfies: () =>
      (misalignedDraft.compileDiagnostics?.steps.length ?? 0) !== misalignedDraft.steps.length
        ? null
        : 'the misaligned fixture is aligned',
  },
  {
    id: 'FX-SECRET-REF',
    description: 'a draft carrying a secretRef variable',
    resolve: () => awaitingDraft,
    satisfies: () =>
      awaitingDraft.variables.some((variable) => variable.kind === 'secretRef')
        ? null
        : 'no fixture carries a secretRef variable',
  },
  ...['STALE_CANDIDATE', 'TEST_DELETED', 'TEST_QUARANTINED'].map((code) => ({
    id: `FX-CONFLICT-${code}`,
    description: `a 409 ${code} response from confirm-compile`,
    resolve: () => conflictResponse(code),
    satisfies: () => (conflictResponse(code).error === code ? null : `no 409 fixture for ${code}`),
  })),
  ...['SOURCE_TOO_MANY_STEPS', 'SOURCE_LINE_TOO_LONG', 'SOURCE_TOO_LARGE', 'INLINE_CREDENTIAL'].map(
    (code) => ({
      id: `FX-REJECTION-${code}`,
      description: `a 400 ${code} response from compile`,
      resolve: () => rejectionResponse(code),
      satisfies: () => (rejectionResponse(code).error === code ? null : `no 400 fixture for ${code}`),
    }),
  ),
];

/** The `409` bodies, shaped exactly as `ErrorResponse` declares. */
export function conflictResponse(code: string): { error: string; message: string } {
  const messages: Record<string, string> = {
    STALE_CANDIDATE: 'The draft moved on; recompile before confirming',
    TEST_DELETED: 'UI Test is deleted; compile and confirm are blocked',
    TEST_QUARANTINED: 'UI Test is quarantined pending CSI resolution; compile and confirm are blocked',
  };
  return { error: code, message: messages[code] ?? 'Refused' };
}

/** The `400` bodies of `POST /tests/{id}/compile`. The message names a step index, never text. */
export function rejectionResponse(code: string): { error: string; message: string } {
  const messages: Record<string, string> = {
    SOURCE_TOO_MANY_STEPS: 'This test has 61 steps; the maximum is 60. Split it into smaller tests before compiling.',
    SOURCE_LINE_TOO_LONG: 'Step 3 is longer than the maximum line length.',
    SOURCE_TOO_LARGE: 'The draft is larger than the maximum source size.',
    INLINE_CREDENTIAL: 'Step 3 looks like it contains a credential; use a vault reference instead.',
  };
  return { error: code, message: messages[code] ?? 'Refused' };
}
