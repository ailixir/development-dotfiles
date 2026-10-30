import { LEARNED_READY_LABEL } from '@/components/studio/run/runEnablement';
import { EXECUTION_ERROR_NARRATIVES } from '@/components/studio/run/executionErrorNarratives';
import {
  EXECUTE_FORBIDDEN_NARRATIVE,
  UNDECLARED_EXECUTE_REFUSAL,
} from '@/components/studio/run/executeRefusals';

/**
 * Every sentence the guided Studio surfaces show (STUDIO-OBS-008 AC-3, AC-4, AC-6, AC-7 and the
 * inherited copy obligations), in one record, each with the exact place it comes from.
 *
 * **Nothing here is invented.** Each entry names a repository file and an exact quote from it, and
 * `guided.test.tsx` reads that file and fails if the quote is not there. There are three bases:
 *
 *  - `verbatim`: the template is the source text. Removing the `{…}` braces from the template gives
 *    back the quote exactly; the braces only mark where a number or a label is filled in.
 *  - `adapted`: the source text with a stated, mechanical change (a fragment of a sentence used as a
 *    label, a capital letter, a placeholder that cannot be stated dropped, straight quote marks).
 *    `note` says what changed.
 *  - `delegated`: the story or a ruling names @ux-design-expert as the writer of this wording, and
 *    `source` quotes that delegation. `facts` quotes what the sentence states, so the wording is a
 *    rendering of a recorded fact and not a new claim.
 *
 * The canonical copy list is AC-3/AC-4 plus the inherited copy blocks (obligations T0-2: the UX panel
 * of 2026-10-09 is not a repository artifact).
 *
 * Three narratives are **reused, not copied**, because the state already has one: the replay
 * `CANCELLED` narrative (`executionErrorNarratives.ts`; ruling A3 as amended 2026-10-17: the existing
 * `CANCELLED` narrative is shown unchanged, with no user-initiated variant), the `403` refusal and the
 * undeclared-refusal wording (`executeRefusals.ts`; architect P4: "Existing refusal"), and the `READY`
 * chip (`runEnablement.ts`). The guided `RUNTIME_INCOMPATIBLE` start refusal has its own rows
 * (`guidedStartUnavailable`, `startUnavailableCaption`, `referenceLabel`): the replay narrative's "Save the test again" is no
 * remedy for guided learning, and D-11 says it names no cause (W5 UX-01).
 *
 * **Not here, on purpose.**
 *  - The AC-3 secret-fill `POLICY_DENIED` sentence. Struck by T0 ruling A2: no public field can
 *    trigger it, and the story requires it to be absent from this file. `guided.test.tsx` asserts
 *    that this file, every entry and every rendered state lack it.
 *  - A user-initiated `CANCELLED` wording variant. Descoped by the user, 2026-10-17 (ruling A3, story
 *    "PO scope decision", row R5).
 *  - Neutral guided recording wording (PLAYBACK-COPY). Descoped by the user, 2026-10-17; the
 *    existing `videoEvidenceNarratives.ts` wording is used unchanged.
 */

/** Repository-relative paths of the documents the copy is quoted from. */
export const COPY_SOURCE_FILES = {
  story: 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md',
  story014: 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-014.story.md',
  story015: 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-015.story.md',
  t0Ruling: 'docs/qa/evidence/STUDIO-OBS-008/prep-20261016/t0-rulings/ruling.md',
  plan: 'docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md',
  uxPlan: 'docs/qa/evidence/STUDIO-OBS-008/execution-20261015/ux-implementation-plan.json',
  architectRulings: 'docs/qa/evidence/STUDIO-OBS-008/execution-20261015/architect-rulings.json',
  consensusPlan: 'docs/specs/studio-observed-authoring/consensus-plan.md',
  openapi: 'docs/specs/studio/openapi.yaml',
  studioExecution: 'docs/architecture/studio-execution.md',
  prd: 'PRD.md',
  executeRefusals: 'frontend/src/components/studio/run/executeRefusals.ts',
  executionProgressView: 'frontend/src/components/studio/run/ExecutionProgressView.tsx',
  adrSc006: 'docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md',
  readinessService: 'backend/src/main/java/com/citi/put/checks/studio/readiness/ExecutionReadinessService.java',
  guidedHook: 'frontend/src/components/studio/guided/useGuidedSession.ts',
  w5Ruling: 'docs/qa/evidence/STUDIO-OBS-008/execution-20261017/rulings/w5-unreadable-and-alias.md',
  uxFix067: 'docs/qa/evidence/STUDIO-OBS-009/ux-fix-067/copy.md',
  storyUnify0015: 'docs/stories/STUDIO-UNIFY-001-ui-tests-as-checks/STUDIO-UNIFY-001.5.story.md',
  storyUnify0016: 'docs/stories/STUDIO-UNIFY-001-ui-tests-as-checks/STUDIO-UNIFY-001.6.story.md',
  errorSchema: 'docs/specs/studio-observed-authoring/contracts/v3/error.schema.json',
  adr002: 'docs/architecture/ADR-002-internal-contract-surface.md',
  adr007: 'docs/architecture/ADR-SC-007-snapshot-ref-grounding.md',
} as const;

export type CopySourceFile = (typeof COPY_SOURCE_FILES)[keyof typeof COPY_SOURCE_FILES];

export type CopyBasis = 'verbatim' | 'adapted' | 'delegated';

export interface CopySource {
  readonly file: CopySourceFile;
  /** An exact substring of `file` (for a `.json` file, of one of its string values). */
  readonly quote: string;
}

export interface GuidedCopy {
  /** The text, with `{token}` where a value is filled in. Backticks mark inline code. */
  readonly template: string;
  readonly basis: CopyBasis;
  readonly source: CopySource;
  /** `adapted`: the change made. `delegated`: what the wording is for. */
  readonly note?: string;
  /** `delegated` only: the recorded fact the sentence states. */
  readonly facts?: CopySource;
}

const S = COPY_SOURCE_FILES;

/** The plan section that places the AC-3 state copy on the UX lane. */
const AC3_COPY_BY_UMA: CopySource = {
  file: S.plan,
  quote: '### AC-3: states and copy (L5a components, L5b wiring; copy by Uma)',
};

export const GUIDED_COPY = {
  // -------------------------------------------------------------------------------------------
  // Run status (GuidedRunStatus), AC-3
  // -------------------------------------------------------------------------------------------
  preparing: {
    template: 'Preparing your steps.',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Preparing your steps.' },
  },
  understanding: {
    template: 'Understanding this page — step {N} of {M}.',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Understanding this page — step N of M.' },
  },
  understandingNoStep: {
    template: 'Understanding this page.',
    basis: 'verbatim',
    source: { file: S.consensusPlan, quote: 'Understanding this page.' },
    note: 'Used only when progress.activeStep is null, so N cannot be stated (P2: never inferred).',
  },
  running: {
    template: 'Running step {N} of {M}.',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Running step N of M.' },
  },
  repeatingPrefix: {
    template: 'Repeating saved steps 1–{(k-1)}…',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Repeating saved steps 1–(k-1)…' },
  },
  repeatingPrefixNoBoundary: {
    template: 'Repeating saved steps…',
    basis: 'adapted',
    source: { file: S.story, quote: 'Repeating saved steps 1–(k-1)…' },
    note: 'The range is dropped when the first step to learn is not in the current draft, so k cannot be stated.',
  },
  learningFrom: {
    template: 'Learning from step {k}',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Learning from step k' },
  },
  finalizing: {
    template: 'Saving what this run learned…',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Saving what this run learned…' },
  },
  proofWillReplay: {
    template:
      'When learning ends, Studio replays the learned steps once to record proof, so your steps run twice.',
    basis: 'delegated',
    source: { file: S.prd, quote: 'The steps therefore run twice for a learn, once to learn and once as the proof, and Studio says so.' },
    note: 'Said while a learn is running: the proof is a replay of the published revision, after the learn (proof = replay, 2026-10-25). Names no video, because a learn shows none.',
    facts: { file: S.prd, quote: 'Studio replays the learned steps of the revision it just published' },
  },
  proofReplaying: {
    template: 'Replaying the saved steps to record proof…',
    basis: 'delegated',
    source: { file: S.prd, quote: 'The steps therefore run twice for a learn, once to learn and once as the proof, and Studio says so.' },
    note: 'Appended to the learned receipt while the result names the proof replay (result.proof).',
    facts: { file: S.prd, quote: 'Studio replays the learned steps of the revision it just published' },
  },
  proofNotStarted: {
    template: 'Studio could not start the proof replay. Run the test to record proof.',
    basis: 'delegated',
    source: { file: S.prd, quote: 'The steps therefore run twice for a learn, once to learn and once as the proof, and Studio says so.' },
    note: 'A published learn whose result has proof: null. The refusal code is never public (the contract carries none); Run, a replay, is the action. Nothing retries on its own.',
    facts: { file: S.openapi, quote: '`proof` is `null` while the replay was refused or has not been' },
  },
  learningAttemptTitle: {
    template: 'Learning attempt',
    basis: 'delegated',
    source: { file: S.prd, quote: 'labelled as an attempt and never as a proof' },
    note: 'Heading of the recording kept for a learn that did not publish.',
    facts: { file: S.prd, quote: 'the player shows the **learning attempt**' },
  },
  learningAttemptNote: {
    template: 'Recording of the learning attempt. It is not a proof: a proof is a replay of the saved steps.',
    basis: 'delegated',
    source: { file: S.prd, quote: 'labelled as an attempt and never as a proof' },
    note: 'Beside the kept recording of a learn that did not publish (FAILED, CANCELLED, EXPIRED, UNKNOWN_OUTCOME, PUBLICATION_CONFLICT, or SUCCEEDED with publication PENDING or REFUSED).',
    facts: { file: S.prd, quote: 'After a learn that did not publish, the player shows the **learning attempt**' },
  },

  // -------------------------------------------------------------------------------------------
  // Clarification (GuidedClarification), AC-3
  // -------------------------------------------------------------------------------------------
  clarificationQuestion: {
    template: "Step {N} says: '{<step text>}'. Which one did you mean?",
    basis: 'verbatim',
    source: { file: S.story, quote: "Step N says: '<step text>'. Which one did you mean?" },
  },
  noneOfThese: {
    template: "None of these — I'll edit step {N}",
    basis: 'verbatim',
    source: { file: S.story, quote: "None of these — I'll edit step N" },
    note: 'Ruling A3: cancels the session, then the page moves focus to step N.',
  },
  continue: {
    template: 'Continue',
    basis: 'verbatim',
    source: { file: S.uxPlan, quote: 'Continue' },
    note: 'The submit of a disambiguation question, which AC-3 gives no button wording for.',
  },
  pageDerived: {
    template: 'Page-derived',
    basis: 'adapted',
    source: { file: S.story, quote: 'labels are rendered as page-derived (untrusted styling + role/region shown)' },
    note: 'The AC-3 term, capitalised as a marker.',
  },
  pageRole: {
    template: 'role: {role}',
    basis: 'adapted',
    source: { file: S.story, quote: 'role/region shown' },
    note: 'The AC-3 word "role" as the label of the value the contract carries (choices[].role).',
  },
  pageRegion: {
    template: 'region: {region}',
    basis: 'adapted',
    source: { file: S.story, quote: 'role/region shown' },
    note: 'The AC-3 word "region" as the label of the value the contract carries (choices[].region).',
  },
  expiresIn60: {
    template: 'This question expires within a minute. If it expires, this run will stop and you will need to Run again.',
    basis: 'adapted',
    source: {
      file: S.uxPlan,
      quote:
        'This question expires in 60 seconds. If it expires, this run will stop and you will need to Run again.',
    },
    note: "AC-3: expiry warnings at 60 s and 20 s stating the consequence. Timed from expiresAt. 'in 60 seconds' → 'within a minute': shown while 20 s < remaining ≤ 60 s (GuidedClarification.tsx:57-58), so a fixed figure overstated the time (W5 UX-06; F-L5a-5(a)). Consequence clause unchanged.",
  },
  expiresIn20: {
    template: 'This question expires within 20 seconds. If it expires, this run will stop and you will need to Run again.',
    basis: 'adapted',
    source: {
      file: S.uxPlan,
      quote:
        'This question expires in 20 seconds. If it expires, this run will stop and you will need to Run again.',
    },
    note: "'in' → 'within': shown while 0 < remaining ≤ 20 s (W5 UX-06).",
  },

  // -------------------------------------------------------------------------------------------
  // Completion and failure (GuidedCompletion), AC-3, AC-6 and inherited blocks
  // -------------------------------------------------------------------------------------------
  completedLearned: {
    template: 'Completed — learned from this run.',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Completed — learned from this run.' },
  },
  completedReplay: {
    template: 'Completed — saved steps replayed.',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Completed — saved steps replayed.' },
  },
  completedPartial: {
    template: 'Completed — steps {k}–{n} learned again.',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Completed — steps k–n learned again.' },
  },
  completedPartialOne: {
    template: 'Completed — step {k} learned again.',
    basis: 'adapted',
    source: { file: S.story, quote: 'Completed — steps k–n learned again.' },
    note: 'Singular form when the range is one step (W5 UX-09; F-L5a-5(b)).',
  },
  relearnedAfterPrefixDrift: {
    template: 'Steps {j…} were re-learned because the page changed.',
    basis: 'adapted',
    source: { file: S.story, quote: 'steps j… were re-learned because the page changed' },
    note: 'Capitalised and closed as its own sentence. "j…" is filled as j–(k-1), the window OBS-015 AC-4 (2) marks re-learned ("steps j…k-1"), when the session\'s original k is known; otherwise as "j…".',
  },
  relearnedAfterPrefixDriftOne: {
    template: 'Step {j} was re-learned because the page changed.',
    basis: 'adapted',
    source: { file: S.story, quote: 'steps j… were re-learned because the page changed' },
    note: 'Singular form of relearnedAfterPrefixDrift when the window is one step (W5 UX-09).',
  },
  publicationConflict: {
    template: 'Run completed; steps not ready to repeat.',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Run completed; steps not ready to repeat.' },
  },
  unknownOutcome: {
    template: 'Stopped — submission outcome unknown.',
    basis: 'verbatim',
    source: { file: S.consensusPlan, quote: 'Stopped — submission outcome unknown.' },
    note: 'AC-3 names UNKNOWN_OUTCOME without a sentence; this is the approved wave design row for it. No Run-again control.',
  },
  unknownOutcomeConsequence: {
    template:
      'Studio could not confirm whether its last action on the page took effect, and it will not repeat that action on its own. Check the application before you Run again.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'W5 UX-05: UNKNOWN_OUTCOME consequence; AC-3 no Run-again control is kept.',
    facts: {
      file: S.consensusPlan,
      quote: 'Do not automatically repeat a click, submit, create, delete or fill after uncertain dispatch.',
    },
  },
  expired: {
    template: 'This run expired before it finished, so it stopped. You will need to Run again.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'AC-3 names EXPIRED without a sentence. The consequence clause is the one the expiry warnings use.',
    facts: {
      file: S.uxPlan,
      quote: 'If it expires, this run will stop and you will need to Run again.',
    },
  },
  assertionFailed: {
    template: 'A step that checks the page did not pass, so this run stopped.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'AC-3 names ASSERTION_FAILED without a sentence.',
    facts: { file: S.story, quote: '`LOGIN_REQUIRED` (AC-4) · `ASSERTION_FAILED` · `UNSUPPORTED_SURFACE` · `BUDGET_EXCEEDED`' },
  },
  unsupportedSurface: {
    template: 'This step needs a part of the page that Studio cannot work with, so this run stopped.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'AC-3 names UNSUPPORTED_SURFACE without a sentence.',
    facts: { file: S.story, quote: '`LOGIN_REQUIRED` (AC-4) · `ASSERTION_FAILED` · `UNSUPPORTED_SURFACE` · `BUDGET_EXCEEDED`' },
  },
  unsupportedSurfaceRemedy: {
    template: "If the step names a control, use the control's visible text (the label or button text shown on the page).",
    basis: 'delegated',
    source: { file: S.adr007, quote: "tell the author to use the control's visible name (copy)" },
    note: 'Said after `unsupportedSurface` and the step line: Studio refuses an element it cannot tell apart or match to the step, and the author can name the control by what the page shows. The first sentence is unchanged because UNSUPPORTED_SURFACE is also the code for an observation deadline and for regions Studio cannot represent. No public code is added.',
    facts: { file: S.adr007, quote: "tell the author to use the control's visible name (copy)" },
  },
  unsupportedStep: {
    template: "Studio can't do this step yet, so this run stopped.",
    basis: 'delegated',
    source: { file: S.adr002, quote: 'UNSUPPORTED_STEP' },
    note: 'A learn that ended FAILED with UNSUPPORTED_STEP (user decision 2026-10-26): the model answered UNSUPPORTED to the step (a capability Studio does not have, or not enough to plan it). It replaces the RUNTIME_INCOMPATIBLE that named no cause. The page adds "Studio stopped at step N" from the explanation. The model names no further reason, so none is invented here.',
    facts: { file: S.adr002, quote: 'UNSUPPORTED_STEP' },
  },
  unsupportedStepRemedy: {
    template: 'Try rewording the step, or split it into smaller steps.',
    basis: 'delegated',
    source: { file: S.adr002, quote: 'UNSUPPORTED_STEP' },
    note: 'Said after `unsupportedStep`: the author can change the step; Studio has nothing to retry.',
    facts: { file: S.adr002, quote: 'UNSUPPORTED_STEP' },
  },
  budgetExceeded: {
    template: 'This run reached its learning budget, so Studio stopped it.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'AC-3 names BUDGET_EXCEEDED without a sentence.',
    facts: {
      file: S.story014,
      quote: 'daily budget exhausted ⇒ next model call refused and the session ends `BUDGET_EXCEEDED`',
    },
  },
  originLeft: {
    template: "The page moved to a domain that is not in this environment's allowed domains, so Studio stopped this run.",
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'A learn that ended FAILED with ORIGIN_NOT_ALLOWED (STUDIO-FLEX-001): the learning page stayed on a host outside the allowed domains past the return window, or a secret fill was refused there. Plain text: it names no host and no list, and offers no action.',
    facts: { file: S.studioExecution, quote: "the page is not in this environment's allowed domains" },
  },
  modelUnavailable: {
    template: 'The model service did not answer in time or is busy, so Studio stopped learning.',
    basis: 'delegated',
    source: { file: S.errorSchema, quote: 'MODEL_UNAVAILABLE' },
    note: 'A learn that ended FAILED with MODEL_UNAVAILABLE (compliance-model latency hardening): the model did not answer usably for availability reasons (timeout or stall after retries, gateway busy, rate limit, provider 5xx). Transient. Plain text: it offers no action of its own; `modelUnavailableRetry` follows.',
    facts: { file: S.errorSchema, quote: 'MODEL_UNAVAILABLE' },
  },
  modelUnavailableRetry: {
    template: 'Trying again in a few minutes can help.',
    basis: 'delegated',
    source: { file: S.errorSchema, quote: 'MODEL_UNAVAILABLE' },
    note: 'Said after `modelUnavailable`: the cause is transient, so Run again later can work. No wait is stated because the page does not know it.',
    facts: { file: S.errorSchema, quote: 'MODEL_UNAVAILABLE' },
  },
  modelRefused: {
    template: 'The model service refused the request, so Studio stopped learning.',
    basis: 'delegated',
    source: { file: S.errorSchema, quote: 'MODEL_REFUSED' },
    note: 'A learn that ended FAILED with MODEL_REFUSED (compliance-model latency hardening): the model provider or a compliance layer refused the request with an HTTP 4xx (400, 401/403 or another 4xx, but not 408/429). Not transient: the same request is likely to be refused again.',
    facts: { file: S.errorSchema, quote: 'MODEL_REFUSED' },
  },
  modelRefusedRemedy: {
    template: 'Trying again unchanged is unlikely to help. Contact the Studio team.',
    basis: 'delegated',
    source: { file: S.errorSchema, quote: 'MODEL_REFUSED' },
    note: 'Said after `modelRefused`: the cause is most often our own request or deployment configuration, not the author\'s step text, so the sentence blames no one, says a retry will likely fail again, and names the Studio team as the escalation.',
    facts: { file: S.errorSchema, quote: 'MODEL_REFUSED' },
  },
  nothingStartsOnItsOwn: {
    template: 'Nothing starts again on its own.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Said with every budget refusal and stop.',
    facts: { file: S.architectRulings, quote: 'no automatic start when timerends' },
  },
  stoppedAtStep: {
    template: 'Studio stopped at step {N}.',
    basis: 'delegated',
    source: { file: S.storyUnify0016, quote: 'wording is `delegated` to @ux (D1)' },
    note: 'STUDIO-UNIFY-001.6 AC-01 / D1 (N1). Says where a failed learn stopped, read from the result explanation (the first step that is not completed, only when some step has an action; guidedStoppedStep.ts). "Stopped at", not "failed because": the contract proves no cause. Used when the authored sentence is not provably the one the run used.',
    facts: { file: S.storyUnify0016, quote: 'Studio stopped at step {N}' },
  },
  stoppedAtStepWithText: {
    template: 'Studio stopped at step {N}: "{text}"',
    basis: 'delegated',
    source: { file: S.storyUnify0016, quote: 'wording is `delegated` to @ux (D1)' },
    note: 'STUDIO-UNIFY-001.6 AC-01 / D1 (N1). The same statement followed by the authored sentence, only where planStepTexts proves it equals what the run used (never otherwise). The sentence is shown as text.',
    facts: {
      file: S.storyUnify0016,
      quote: 'followed by the authored sentence when `planStepTexts` provides it',
    },
  },
  budgetNextStep: {
    template:
      'Studio most likely could not find what step {N} describes. Check the page or reword the step, then press Run again.',
    basis: 'delegated',
    source: { file: S.storyUnify0016, quote: 'wording is `delegated` to @ux (D1)' },
    note: 'STUDIO-UNIFY-001.6 AC-01 / D1 (N1). The next-step sentence for BUDGET_EXCEEDED only. Hedged ("most likely") because the code also covers the daily budget, which the page cannot tell apart from the per-session bound; @ux and @po confirm or drop it (D1, risk R2).',
    facts: {
      file: S.storyUnify0016,
      quote: 'that Studio most likely could not find what step {N} describes and that the author can check the page or reword the step and press Run again',
    },
  },
  stoppedHere: {
    template: 'Stopped here',
    basis: 'delegated',
    source: { file: S.storyUnify0016, quote: 'wording is `delegated` to @ux (D1)' },
    note: 'STUDIO-UNIFY-001.6 AC-02 / D1 (N1). Error-coloured chip on the plan step where a failed learn stopped; it replaces "Learned in this run" on that step.',
    facts: { file: S.storyUnify0016, quote: 'carries a "Stopped here" chip (error colour)' },
  },
  failedUnnamed: {
    template:
      'This run stopped. The reason the server gave is shown below exactly as it arrived, so it can be quoted in a ticket.',
    basis: 'adapted',
    source: {
      file: S.executeRefusals,
      quote: 'The reason the server gave is shown below exactly as it arrived, so it can be quoted in a ticket.',
    },
    note: 'The undeclared-refusal sentence, led by "This run stopped." for a session that failed rather than one that was refused. Used for INVALID_CONTRACT (ruling A2: "the generic INVALID_CONTRACT narrative") and every failure code without its own narrative.',
  },
  failedNoReason: {
    template: 'This run stopped, and the server gave no reason for it, so there is nothing here to explain it.',
    basis: 'adapted',
    source: { file: S.executionProgressView, quote: 'so there is nothing here to explain it.' },
    note: "UNNAMED_ERROR_STATEMENT's clause for a guided FAILED result whose failure and errorCode are both null; its browser clause is dropped (a guided result makes no browser claim). W5 UX-12: failedUnnamed pointed 'below' at nothing.",
  },
  guardDeniedTitle: {
    template: 'This action could not be run.',
    basis: 'verbatim',
    source: { file: S.uxPlan, quote: 'This action could not be run.' },
    note: 'Inherited OBS-014 item a (copy by @ux-design-expert, item c). Names no cause and is not the secret-fill copy.',
  },
  guardDeniedBody: {
    template: 'Studio stopped this run because an action did not match the step wording. Check the step wording.',
    basis: 'adapted',
    source: { file: S.uxPlan, quote: 'Check the step wording' },
    note: 'STUDIO-GOV-001.3: the CSI-owner side-effect setting is gone, so the second sentence of the inherited text ("ask the CSI owner to review the side-effect setting") is dropped.',
  },
  guardDeniedRemedy: {
    template: 'For a checkbox or switch, say “check” or “uncheck” explicitly.',
    basis: 'verbatim',
    source: { file: S.uxPlan, quote: 'For a checkbox or switch, say “check” or “uncheck” explicitly.' },
  },

  // -------------------------------------------------------------------------------------------
  // Replay drift (AC-3, ruling A1). Worded here; rendered by the replay narratives (L5b).
  // -------------------------------------------------------------------------------------------
  replayDrift: {
    template: 'Step {N} no longer matches the page…',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Step N no longer matches the page…' },
  },
  learnAgainFromStep: {
    template: 'Learn again from step {N}',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Learn again from step N' },
    note: 'Also the explicit first-step learn a BASE_IDENTITY_INCOMPLETE start refusal offers (architect P4).',
  },

  // -------------------------------------------------------------------------------------------
  // Readiness chip (ReadinessChip), AC-3 and D-4
  // -------------------------------------------------------------------------------------------
  needsRelearn: {
    template: 'Steps changed — next Run learns from step {k}',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Steps changed — next Run learns from step k' },
  },
  changedSinceThisRun: {
    template: 'Changed since this run',
    basis: 'delegated',
    source: { file: S.uxFix067, quote: '@ux-design-expert writes the copy for the round-067 Studio UX fixes' },
    note: 'Round 067 D3: chip on the step the server names as first changed since the published revision.',
    facts: { file: S.uxFix067, quote: "The step is the server's firstChangedStepId for the revision this run published" },
  },
  needsRelearnNoBoundary: {
    template: 'Steps changed',
    basis: 'adapted',
    source: { file: S.story, quote: 'Steps changed — next Run learns from step k' },
    note: 'The clause naming k is dropped when firstChangedStepId is not in the current draft.',
  },
  baseIdentityIncomplete: {
    template: 'Saved learning cannot be reused — next Run learns from step 1',
    basis: 'delegated',
    source: { file: S.story, quote: '@ux-design-expert writes the chip copy for this case' },
    note: 'D-4: must not tell the author that they changed steps. Same shape as the AC-3 NEEDS_RELEARN chip.',
    facts: {
      file: S.story,
      quote:
        'means saved learning cannot be reused, and the next Run must learn from the first current step',
    },
  },

  // -------------------------------------------------------------------------------------------
  // Login required (LoginRequiredNotice), AC-4 and ruling A1.6
  // -------------------------------------------------------------------------------------------
  loginNoLoginSteps: {
    template:
      'This page asks you to sign in. Add login steps before step {N} using your secrets (`<secret NAME>`), then Run again',
    basis: 'verbatim',
    source: {
      file: S.story,
      quote:
        'This page asks you to sign in. Add login steps before step N using your secrets (`<secret NAME>`), then Run again',
    },
  },
  loginStepsFailed: {
    template: 'Your login steps did not sign you in; check the secret and the steps before step {N}',
    basis: 'verbatim',
    source: {
      file: S.story,
      quote: 'Your login steps did not sign you in; check the secret and the steps before step N',
    },
  },
  loginNoLoginStepsStepless: {
    template: 'This page asks you to sign in. Add login steps using your secrets (`<secret NAME>`), then Run again',
    basis: 'delegated',
    source: { file: S.t0Ruling, quote: '@ux-design-expert words the step-less variant' },
    note: 'The AC-4 sentence without "before step N", for a step that is no longer in the draft.',
    facts: {
      file: S.story,
      quote: 'If the step no longer exists in the current draft, "Go to step N" is omitted and "Open Variables" stays',
    },
  },
  loginStepsFailedStepless: {
    template: 'Your login steps did not sign you in; check the secret and your login steps',
    basis: 'delegated',
    source: { file: S.t0Ruling, quote: '@ux-design-expert words the step-less variant' },
    note: 'The AC-4 sentence with "the steps before step N" replaced by "your login steps".',
    facts: {
      file: S.story,
      quote: 'If the step no longer exists in the current draft, "Go to step N" is omitted and "Open Variables" stays',
    },
  },
  loginStepGone: {
    template: 'The step where this happened is no longer in your steps.',
    basis: 'delegated',
    source: { file: S.t0Ruling, quote: '@ux-design-expert words the step-less variant' },
    note: 'Says why the step-less variant names no step. Also under a replay drift whose step is gone from the draft (W5 UX-07).',
    facts: {
      file: S.story,
      quote: 'If the step no longer exists in the current draft, "Go to step N" is omitted and "Open Variables" stays',
    },
  },
  goToStep: {
    template: 'Go to step {N}',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Go to step N' },
  },
  openVariables: {
    template: 'Open Variables',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Open Variables' },
  },

  // -------------------------------------------------------------------------------------------
  // Plan explanation (PlanExplanation), AC-6 and architect P3
  // -------------------------------------------------------------------------------------------
  planTitle: {
    template: 'Steps as learned',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Steps as learned' },
  },
  stepHeading: {
    template: 'Step {N}',
    basis: 'adapted',
    source: { file: S.story, quote: "Step N says: '<step text>'" },
    note: 'The AC-3 step reference, alone, as the heading of a step.',
  },
  learnedInThisRun: {
    template: 'Learned in this run',
    basis: 'adapted',
    source: { file: S.story, quote: 'whether the step was learned in this run' },
    note: 'AC-6 fragment, capitalised.',
  },
  reusedFromPreviousRevision: {
    template: 'Reused from a previous revision',
    basis: 'adapted',
    source: { file: S.story, quote: 'reused from a previous revision (`reusedFrom`)' },
    note: 'AC-6 fragment, capitalised.',
  },
  relearnedAfterDrift: {
    template: 'Re-learned after drift',
    basis: 'adapted',
    source: { file: S.story, quote: 're-learned after drift (`relearnedFrom`)' },
    note: 'AC-6 fragment, capitalised.',
  },
  referenceFlow: {
    template: '{binding} from step {producer} → {slot} in step {consumer}',
    basis: 'adapted',
    source: { file: S.story, quote: 'Order number from step 2 → Reference in step 4' },
    note: 'The AC-6 example as a pattern. binding is the declared ID; slot is the P3 label of the operation that consumes it.',
  },
  slotFill: {
    template: 'Fill field',
    basis: 'adapted',
    source: { file: S.architectRulings, quote: 'Fill field' },
    note: 'P3 label of operationKind fill, used for argumentSlot fill.value.',
  },
  slotSelectOption: {
    template: 'Select option',
    basis: 'adapted',
    source: { file: S.architectRulings, quote: 'Select option' },
    note: 'P3 label of operationKind selectOption, used for argumentSlot selectOption.value.',
  },
  slotAssertExpected: {
    template: 'Check expected result',
    basis: 'adapted',
    source: { file: S.architectRulings, quote: 'Check expected result' },
    note: 'P3 label of operationKind assert, used for argumentSlot assert.expected.',
  },
  notReadyNow: {
    template: 'Steps not ready to repeat.',
    basis: 'adapted',
    source: { file: S.story, quote: 'Run completed; steps not ready to repeat.' },
    note: 'The AC-3 clause, alone, as the current-readiness fact when currentReadiness.ready is false (AC-6: shown apart from PUBLISHED history).',
  },

  // -------------------------------------------------------------------------------------------
  // Video seek (evidence/GuidedSeekControls), AC-7 and D-10
  // -------------------------------------------------------------------------------------------
  seekToStep: {
    template: 'Seek to step {N}',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Seek to step N' },
  },
  seekToAction: {
    template: 'Seek to action: {<safe label>}',
    basis: 'verbatim',
    source: { file: S.story, quote: 'Seek to action: <safe label>' },
  },

  seekMarkerStep: {
    template: 'Jumped to step {N}.',
    basis: 'delegated',
    source: { file: S.uxFix067, quote: '@ux-design-expert writes the copy for the round-067 Studio UX fixes' },
    note: 'Round 067 D2: caption under the used seek control.',
    facts: { file: S.uxFix067, quote: 'The last seek on this recording went to the start stamp of the step' },
  },
  seekMarkerAction: {
    template: 'Jumped to step {N}, action: {<safe label>}.',
    basis: 'delegated',
    source: { file: S.uxFix067, quote: '@ux-design-expert writes the copy for the round-067 Studio UX fixes' },
    note: 'Round 067 D2: caption under the used action seek control.',
    facts: { file: S.uxFix067, quote: 'The last seek went to the stamp of that action' },
  },
  runInProgressEvidence: {
    template: 'The recording will appear here when this run ends.',
    basis: 'delegated',
    source: { file: S.uxFix067, quote: '@ux-design-expert writes the copy for the round-067 Studio UX fixes' },
    note: 'Round 067 D7: evidence card text while a Run is live and has no result yet.',
    facts: { file: S.uxFix067, quote: 'A live Run has no result yet, so it has no recording on screen' },
  },

  // -------------------------------------------------------------------------------------------
  // Start feedback (GuidedStartFeedback): inline, no session, no poll (architect P4)
  // -------------------------------------------------------------------------------------------
  baseIdentityIncompleteStart: {
    template: 'Saved learning cannot be reused, so this Run has to learn from step 1. Nothing was started.',
    basis: 'delegated',
    source: { file: S.story, quote: '@ux-design-expert writes the chip copy for this case' },
    note: 'D-4 start refusal (REVISION_CONFLICT, messageCode BASE_IDENTITY_INCOMPLETE). Offers "Learn again from step 1"; never learns on its own.',
    facts: { file: S.architectRulings, quote: 'explain saved learning cannot be reused and offer explicit full learn from first currentstep' },
  },
  revisionNotReady: {
    template: 'This test is not ready to start learning from that step, so nothing was started. Press Run again to start from the latest saved steps.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'D-3: FIRST_LEARN_STEP_NARROWED, FIRST_LEARN_STEP_UNKNOWN and BASE_REVISION_MISMATCH. Also when an explicit learn\'s conditions fail on the fresh read (W5 UX-13).',
    facts: { file: S.story, quote: 'Each is shown as not-ready start feedback, with no automatic retry and no session.' },
  },
  referenceMissing: {
    template: 'A step uses a saved input or secret that this test does not declare, so nothing was started.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Start refusal MISSING_SOURCE / AUTHORING_REFERENCE_MISSING. Offers "Open Variables".',
    facts: { file: S.architectRulings, quote: '409 AUTHORING_REFERENCE_MISSING: focus declared reference/step editor' },
  },
  originNotAllowed: {
    template: "This test's page is not in this environment's allowed domains, so nothing was started.",
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Start refusal 403 ORIGIN_NOT_ALLOWED (STUDIO-FLEX-001: the first authored URL is not on the environment\'s domain whitelist). Plain text: it names no origin and no list, offers no action, and makes no login guess or automatic switch.',
    facts: { file: S.studioExecution, quote: "the page is not in this environment's allowed domains" },
  },
  secretInText: {
    template:
      "A secret can only be the whole value of a step. Studio can't mix a secret with other text, so nothing was started. Put the secret on its own, for example `Type \"<secret NAME>\" in the Password field`.",
    basis: 'delegated',
    source: { file: S.adr002, quote: 'SECRET_IN_TEXT' },
    note: 'Start refusal 422 INVALID_CONTRACT, messageCode SECRET_IN_TEXT (user decision 2026-10-26): a `<secret ID>` inside a quoted value that holds other text. Secrets stay whole-value only (secret-login design); variables (`<var NAME>`) may be mixed with text.',
    facts: { file: S.adr002, quote: 'SECRET_IN_TEXT' },
  },
  applicationUrlMissing: {
    template: "Add a step that opens the application's URL.",
    basis: 'verbatim',
    source: { file: S.openapi, quote: "Add a step that opens the application's URL." },
  },
  budgetCsi: {
    template: 'The learning budget for this CSI is used up for now, so nothing was started.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Start refusal 429 BUDGET_EXCEEDED with retryable true (per-CSI budget).',
    facts: { file: S.openapi, quote: 'budget (STUDIO-OBS-014 AC-8) and always carries `Retry-After`' },
  },
  learningCapacityBusy: {
    template: 'All learning slots are busy right now, so nothing was started.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Start refusal 429 BUDGET_EXCEEDED, message code LEARNING_CAPACITY_EXHAUSTED, retryable (STUDIO-FLEX-001 item 5: the deployment-wide cap on concurrent learning sessions). Same tone and shape as the per-CSI budget sentence.',
    facts: {
      file: S.studioExecution,
      quote: 'refused with 429 `BUDGET_EXCEEDED`, message code `LEARNING_CAPACITY_EXHAUSTED`',
    },
  },
  learningCapacityTryAgain: {
    template: 'Try again in a moment.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Shown instead of the Retry-After sentence when the header was not sent: a slot frees when any learning session ends, so the wait is short and cannot be stated.',
    facts: {
      file: S.studioExecution,
      quote: 'refused with 429 `BUDGET_EXCEEDED`, message code `LEARNING_CAPACITY_EXHAUSTED`',
    },
  },
  budgetRetryAfter: {
    template: 'You can Run again in {duration}.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Retry-After, whole seconds, formatted. Shown only when the header was sent.',
    facts: { file: S.architectRulings, quote: 'Use actual retryable/RetryAfter CSIor session distinction' },
  },
  budgetSession: {
    template: 'This test is over a limit for a single Run, so nothing was started. Waiting will not change this.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Start refusal 429 BUDGET_EXCEEDED with retryable false (per-session bound).',
    facts: { file: S.openapi, quote: 'per-session bound (for example too many source steps) that no wait resolves' },
  },
  learningElsewhere: {
    template:
      'Another Run is learning this test, so Run is off. It stays off until that Run ends and this page reads the test again: press Refresh test information, or reload the page.',
    basis: 'delegated',
    source: { file: S.adrSc006, quote: 'State and consequence stated in visible text' },
    note:
      'L5b-F1 (Uma). Shown beside the disabled Run when GET /tests/{id} says LEARNING and this page follows no session (another tab or user). AC-3 conventions: the state, then its consequence, in one sentence; AC-2: "LEARNING ⇒ Run disabled". It names no person, tab, step or time, because the page cannot see the other session. W5 UX-04: Run does not come back by itself. The gate re-reads only when refreshToken changes (ChecksStudioPage.tsx:1034); Refresh test information re-reads the list readiness (:512-523), and nothing polls another client\'s session (F-L5b-5).',
    facts: {
      file: S.readinessService,
      quote: 'SELECT EXISTS(SELECT 1 FROM studio_guided_sessions WHERE test_id = ? AND expires_at > now()',
    },
  },
  sessionUnreadable: {
    template:
      'Studio could not read the learning Run already started for this test, so it starts no new learning Run here. Press Refresh test information to check again.',
    basis: 'delegated',
    source: { file: S.adrSc006, quote: 'State and consequence stated in visible text' },
    note:
      "W5-1 ruling w5-unreadable-and-alias §2-3 (Aria's draft, 'Press' added). States the state and its consequence for learning only; never claims a reload clears it (a reload re-reads the same refusal). Shown when Run is off in learn/relearn/busy mode, or when a learn-again was requested on a READY replay.",
    facts: {
      file: S.guidedHook,
      quote: 'once a `sessionId` is known nothing ever re-POSTs start: reload and reconnect only GET',
    },
  },

  // -------------------------------------------------------------------------------------------
  // Finalize held (ChecksStudioPage guided-pending)
  // -------------------------------------------------------------------------------------------
  signInToFinish: {
    template:
      'Studio could not finish saving this learning Run because your sign-in has ended. Sign in again, then press Try again.',
    basis: 'delegated',
    source: { file: S.adrSc006, quote: 'State and consequence stated in visible text' },
    note:
      'E2E-012. Shown instead of notReadyNow when the finalize call answered 401 (pending REAUTHENTICATION_REQUIRED): the state, its cause and what to do next. The 401 stopped the poll, so without this the Run looked stuck until the session expired.',
    facts: {
      file: S.guidedHook,
      quote: '`401` (on a read or on finalize): `pending = REAUTHENTICATION_REQUIRED`',
    },
  },
  tryAgain: {
    template: 'Try again',
    basis: 'delegated',
    source: { file: S.adrSc006, quote: 'Visible text labels on controls' },
    note: 'E2E-012. Label of the control that sends the held finalize once more under the same key.',
    facts: {
      file: S.guidedHook,
      quote: 'finalize is not resent by the poll',
    },
  },

  // -------------------------------------------------------------------------------------------
  // Reference picker (ChecksStudioPage), AC-5 and W5-2
  // -------------------------------------------------------------------------------------------
  secretNameTaken: {
    template:
      'The secret {ID} was not inserted, because this test already has a variable named {ID}. Rename that variable in Variables, then insert the secret again.',
    basis: 'delegated',
    source: {
      file: S.w5Ruling,
      quote:
        '(@ux-design-expert, cited basis): name the ID, say that a variable with that name already exists, and say it must be renamed in Variables',
    },
    note: "W5-2: Aria's draft plus the state (not inserted). 'Variable' is the Variables dialog's word for every row.",
    facts: {
      file: S.w5Ruling,
      quote:
        'any `secretRef` whose `secretId` equals the **name** of another declaration that is not a `secretRef` with that same `secretId`',
    },
  },

  // -------------------------------------------------------------------------------------------
  // Start feedback, RUNTIME_INCOMPATIBLE (GuidedStartFeedback), W5 UX-01
  // -------------------------------------------------------------------------------------------
  guidedStartUnavailable: {
    template: 'Studio could not start learning for this test, so nothing was started.',
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: "W5 UX-01: guided start refused, or capability unavailable, with RUNTIME_INCOMPATIBLE. Names no cause and no remedy; the reference follows. Architect P4 'unavailable/notready copy'. The replay execute narrative is unchanged.",
    facts: { file: S.story, quote: 'A `RUNTIME_INCOMPATIBLE` start refusal names no cause.' },
  },
  startUnavailableCaption: {
    template: 'Nothing was started. Ask your Studio administrator for help and quote the reference shown below.',
    basis: 'delegated',
    source: { file: S.storyUnify0015, quote: 'Wording delegated to @ux.' },
    note: 'STUDIO-UNIFY-001.5 AC-01 / D1 (M1). Shown beside Run (data-testid run-start-unavailable) while a guided-start refusal or an unavailable capability is on screen: Run stays enabled because capabilities are read only after the press, so the caption says what to do next. Names no cause and offers no other remedy (W5 UX-01).',
    facts: {
      file: S.storyUnify0015,
      quote: 'ask your Studio administrator and quote the reference; no cause named',
    },
  },
  referenceLabel: {
    template: 'Reference:',
    basis: 'delegated',
    source: { file: S.storyUnify0015, quote: 'Raw code shown as a "Reference:" line.' },
    note: 'STUDIO-UNIFY-001.5 AC-01 / D1 (M1). Label of the secondary line that carries the code exactly as it arrived (monospace, selectable), so it can be quoted in a ticket. Replaces the verbatim "reason ... shown below" sentence.',
    facts: {
      file: S.storyUnify0015,
      quote: 'the alert carries the raw code only as a secondary line labelled "Reference"',
    },
  },
} as const satisfies Readonly<Record<string, GuidedCopy>>;

export type GuidedCopyKey = keyof typeof GUIDED_COPY;

/** A value put into a `{token}`. Rendered as text, never as markup. */
export type CopyValue = string | number;

const TOKEN = /\{([^{}]+)\}/gu;

/** The tokens a template expects, in order of appearance. */
export function copyTokens(template: string): string[] {
  return Array.from(template.matchAll(TOKEN), (match) => match[1]);
}

/**
 * Fills every `{token}`. A token without a value throws: a sentence with a hole in it would say
 * something the server did not.
 */
export function fillCopy(template: string, values: Readonly<Record<string, CopyValue>> = {}): string {
  return template.replace(TOKEN, (_whole, token: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, token)) {
      throw new Error(`Copy token {${token}} has no value in "${template}".`);
    }
    return String(values[token]);
  });
}

/** The sentence for one copy key. */
export function guidedCopy(key: GuidedCopyKey, values?: Readonly<Record<string, CopyValue>>): string {
  return fillCopy(GUIDED_COPY[key].template, values);
}

/**
 * The 1-based position of `stepId` among `stepIds`, or `null` when it is not there. Used for every
 * "step N" that names a step by stable ID in the **current** draft (ruling A1.6; plan AC-3).
 */
export function stepNumberIn(stepIds: readonly string[], stepId: string | null | undefined): number | null {
  if (stepId === null || stepId === undefined) return null;
  const index = stepIds.indexOf(stepId);
  return index < 0 ? null : index + 1;
}

/** `a–b` with the en dash the AC-3 ranges use (`1–(k-1)`, `k–n`). */
export function stepRange(first: number, last: number): string {
  return `${first}–${last}`;
}

// ---------------------------------------------------------------------------------------------
// Reused narratives (imported, never copied)
// ---------------------------------------------------------------------------------------------

/** The `READY` chip: `runEnablement.ts`, UX panel 2026-10-09 ("Learned · ready to repeat"). */
export const READY_CHIP_LABEL = LEARNED_READY_LABEL;

/**
 * The existing `CANCELLED` narrative, shown unchanged for a guided session that ended `CANCELLED`
 * (ruling A3: "show the existing `CANCELLED` narrative"; the user-initiated variant is descoped).
 */
export const CANCELLED_NARRATIVE = EXECUTION_ERROR_NARRATIVES.CANCELLED;

/** A `403` start refusal, or a capability that says `FORBIDDEN_SCOPE`: the existing wording. */
export const FORBIDDEN_REFUSAL = EXECUTE_FORBIDDEN_NARRATIVE;

/** A start refusal this page has no wording for: the existing undeclared-refusal wording. */
export const UNDECLARED_REFUSAL = UNDECLARED_EXECUTE_REFUSAL;
