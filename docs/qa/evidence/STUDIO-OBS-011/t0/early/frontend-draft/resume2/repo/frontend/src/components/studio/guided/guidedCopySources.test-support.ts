import type { GuidedCopyKey } from './guidedNarratives';

/**
 * Test-only citation registry for the guided copy table (C-OBS008-3).
 * Runtime templates and fill-ins remain in guidedNarratives.ts. Each source quote, adaptation,
 * delegation and fact is preserved here for the existing copy-table tests to verify from disk.
 * Keep authoredLiteralTargetNotFound here and at runtime until the separate AE-01 owner removes
 * the pair together (R-08-3). Production modules must never import this test support module.
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
  executeRefusals: 'frontend/src/components/studio/run/executeRefusals.ts',
  executionProgressView: 'frontend/src/components/studio/run/ExecutionProgressView.tsx',
  adrSc006: 'docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md',
  readinessService: 'backend/src/main/java/com/citi/put/checks/studio/readiness/ExecutionReadinessService.java',
  guidedHook: 'frontend/src/components/studio/guided/useGuidedSession.ts',
  w5Ruling: 'docs/qa/evidence/STUDIO-OBS-008/execution-20261017/rulings/w5-unreadable-and-alias.md',
} as const;

export type CopySourceFile = (typeof COPY_SOURCE_FILES)[keyof typeof COPY_SOURCE_FILES];

export type CopyBasis = 'verbatim' | 'adapted' | 'delegated';

export interface CopySource {
  readonly file: CopySourceFile;
  /** An exact substring of `file` (for a `.json` file, of one of its string values). */
  readonly quote: string;
}

export interface GuidedCopySource {
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

export const GUIDED_COPY_SOURCES = {
  // -------------------------------------------------------------------------------------------
  // Run status (GuidedRunStatus), AC-3
  // -------------------------------------------------------------------------------------------
  preparing: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Preparing your steps.' },
  },
  understanding: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Understanding this page — step N of M.' },
  },
  understandingNoStep: {
    basis: 'verbatim',
    source: { file: S.consensusPlan, quote: 'Understanding this page.' },
    note: 'Used only when progress.activeStep is null, so N cannot be stated (P2: never inferred).',
  },
  running: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Running step N of M.' },
  },
  repeatingPrefix: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Repeating saved steps 1–(k-1)…' },
  },
  repeatingPrefixNoBoundary: {
    basis: 'adapted',
    source: { file: S.story, quote: 'Repeating saved steps 1–(k-1)…' },
    note: 'The range is dropped when the first step to learn is not in the current draft, so k cannot be stated.',
  },
  learningFrom: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Learning from step k' },
  },
  finalizing: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Saving what this run learned…' },
  },

  // -------------------------------------------------------------------------------------------
  // Clarification (GuidedClarification), AC-3 and inherited OBS-014 item b
  // -------------------------------------------------------------------------------------------
  clarificationQuestion: {
    basis: 'verbatim',
    source: { file: S.story, quote: "Step N says: '<step text>'. Which one did you mean?" },
  },
  noneOfThese: {
    basis: 'verbatim',
    source: { file: S.story, quote: "None of these — I'll edit step N" },
    note: 'Ruling A3: cancels the session, then the page moves focus to step N. Also the decline of a side-effect confirmation (UX plan sideEffectConfirmation.decline).',
  },
  continue: {
    basis: 'verbatim',
    source: { file: S.uxPlan, quote: 'Continue' },
    note: 'UX plan sideEffectConfirmation.submit. Also the submit of a disambiguation question, which AC-3 gives no button wording for.',
  },
  pageDerived: {
    basis: 'adapted',
    source: { file: S.story, quote: 'labels are rendered as page-derived (untrusted styling + role/region shown)' },
    note: 'The AC-3 term, capitalised as a marker.',
  },
  pageRole: {
    basis: 'adapted',
    source: { file: S.story, quote: 'role/region shown' },
    note: 'The AC-3 word "role" as the label of the value the contract carries (choices[].role).',
  },
  pageRegion: {
    basis: 'adapted',
    source: { file: S.story, quote: 'role/region shown' },
    note: 'The AC-3 word "region" as the label of the value the contract carries (choices[].region).',
  },
  expiresIn60: {
    basis: 'adapted',
    source: {
      file: S.uxPlan,
      quote:
        'This question expires in 60 seconds. If it expires, this run will stop and you will need to Run again.',
    },
    note: "AC-3: expiry warnings at 60 s and 20 s stating the consequence. Timed from expiresAt. 'in 60 seconds' → 'within a minute': shown while 20 s < remaining ≤ 60 s (GuidedClarification.tsx:57-58), so a fixed figure overstated the time (W5 UX-06; F-L5a-5(a)). Consequence clause unchanged.",
  },
  expiresIn20: {
    basis: 'adapted',
    source: {
      file: S.uxPlan,
      quote:
        'This question expires in 20 seconds. If it expires, this run will stop and you will need to Run again.',
    },
    note: "'in' → 'within': shown while 0 < remaining ≤ 20 s (W5 UX-06).",
  },
  confirmTitle: {
    basis: 'verbatim',
    source: { file: S.uxPlan, quote: 'Confirm this action before it runs.' },
  },
  confirmBody: {
    basis: 'adapted',
    source: { file: S.uxPlan, quote: 'Step N says: ‘<authored step text>’. Continue with this action?' },
    note: "Curly quote marks replaced by the straight ones AC-3's question uses, so both prompts read alike.",
  },

  // -------------------------------------------------------------------------------------------
  // Completion and failure (GuidedCompletion), AC-3, AC-6 and inherited blocks
  // -------------------------------------------------------------------------------------------
  completedLearned: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Completed — learned from this run.' },
  },
  completedReplay: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Completed — saved steps replayed.' },
  },
  completedPartial: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Completed — steps k–n learned again.' },
  },
  completedPartialOne: {
    basis: 'adapted',
    source: { file: S.story, quote: 'Completed — steps k–n learned again.' },
    note: 'Singular form when the range is one step (W5 UX-09; F-L5a-5(b)).',
  },
  relearnedAfterPrefixDrift: {
    basis: 'adapted',
    source: { file: S.story, quote: 'steps j… were re-learned because the page changed' },
    note: 'Capitalised and closed as its own sentence. "j…" is filled as j–(k-1), the window OBS-015 AC-4 (2) marks re-learned ("steps j…k-1"), when the session\'s original k is known; otherwise as "j…".',
  },
  relearnedAfterPrefixDriftOne: {
    basis: 'adapted',
    source: { file: S.story, quote: 'steps j… were re-learned because the page changed' },
    note: 'Singular form of relearnedAfterPrefixDrift when the window is one step (W5 UX-09).',
  },
  publicationConflict: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Run completed; steps not ready to repeat.' },
  },
  unknownOutcome: {
    basis: 'verbatim',
    source: { file: S.consensusPlan, quote: 'Stopped — submission outcome unknown.' },
    note: 'AC-3 names UNKNOWN_OUTCOME without a sentence; this is the approved wave design row for it. No Run-again control.',
  },
  unknownOutcomeConsequence: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'W5 UX-05: UNKNOWN_OUTCOME consequence; AC-3 no Run-again control is kept.',
    facts: {
      file: S.consensusPlan,
      quote: 'Do not automatically repeat a click, submit, create, delete or fill after uncertain dispatch.',
    },
  },
  expired: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'AC-3 names EXPIRED without a sentence. The consequence clause is the one the expiry warnings use.',
    facts: {
      file: S.uxPlan,
      quote: 'If it expires, this run will stop and you will need to Run again.',
    },
  },
  assertionFailed: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'AC-3 names ASSERTION_FAILED without a sentence.',
    facts: { file: S.story, quote: '`LOGIN_REQUIRED` (AC-4) · `ASSERTION_FAILED` · `UNSUPPORTED_SURFACE` · `BUDGET_EXCEEDED`' },
  },
  unsupportedSurface: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'AC-3 names UNSUPPORTED_SURFACE without a sentence.',
    facts: { file: S.story, quote: '`LOGIN_REQUIRED` (AC-4) · `ASSERTION_FAILED` · `UNSUPPORTED_SURFACE` · `BUDGET_EXCEEDED`' },
  },
  budgetExceeded: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'AC-3 names BUDGET_EXCEEDED without a sentence.',
    facts: {
      file: S.story014,
      quote: 'daily budget exhausted ⇒ next model call refused and the session ends `BUDGET_EXCEEDED`',
    },
  },
  nothingStartsOnItsOwn: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Said with every budget refusal and stop.',
    facts: { file: S.architectRulings, quote: 'no automatic start when timerends' },
  },
  failedUnnamed: {
    basis: 'adapted',
    source: {
      file: S.executeRefusals,
      quote: 'The reason the server gave is shown below exactly as it arrived, so it can be quoted in a ticket.',
    },
    note: 'The undeclared-refusal sentence, led by "This run stopped." for a session that failed rather than one that was refused. Used for INVALID_CONTRACT (ruling A2: "the generic INVALID_CONTRACT narrative") and every failure code without its own narrative.',
  },
  failedNoReason: {
    basis: 'adapted',
    source: { file: S.executionProgressView, quote: 'so there is nothing here to explain it.' },
    note: "UNNAMED_ERROR_STATEMENT's clause for a guided FAILED result whose failure and errorCode are both null; its browser clause is dropped (a guided result makes no browser claim). W5 UX-12: failedUnnamed pointed 'below' at nothing.",
  },
  governedPolicyDeniedTitle: {
    basis: 'verbatim',
    source: { file: S.uxPlan, quote: 'This action could not be run.' },
    note: 'Inherited OBS-014 item a (copy by @ux-design-expert, item c). Names no cause and is not the secret-fill copy.',
  },
  governedPolicyDeniedBody: {
    basis: 'verbatim',
    source: {
      file: S.uxPlan,
      quote:
        'Studio stopped this run under the action safety settings. Check the step wording and ask the CSI owner to review the side-effect setting.',
    },
  },
  governedPolicyDeniedRemedy: {
    basis: 'verbatim',
    source: { file: S.uxPlan, quote: 'For a checkbox or switch, say “check” or “uncheck” explicitly.' },
  },
  authoredLiteralTargetNotFound: {
    basis: 'delegated',
    source: { file: S.story, quote: '@ux-design-expert writes the wording under the AC-3 conventions' },
    note: 'Conditional KL-015-Q4 copy key (named for STUDIO-OBS-009 AUTHORED-ECHO-01 f to remove). The trigger is the page\'s, not this module\'s. W5 UX-03: hedged so it stays true on Q9 §5 R2 (a model, CSI, cap or window BUDGET_EXCEEDED: \'true there but may be irrelevant\'); \'a step\' covers R1 (cross-step). N = draft position of failedStepIdOf (Q9 §3 condition 3).',
    facts: {
      file: S.story,
      quote:
        'the narrative explains that Studio cannot see page text that matches a value written in the step, and suggests rewording (for example, assert a longer or different visible text)',
    },
  },

  // -------------------------------------------------------------------------------------------
  // Replay drift (AC-3, ruling A1). Worded here; rendered by the replay narratives (L5b).
  // -------------------------------------------------------------------------------------------
  replayDrift: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Step N no longer matches the page…' },
  },
  learnAgainFromStep: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Learn again from step N' },
    note: 'Also the explicit first-step learn a BASE_IDENTITY_INCOMPLETE start refusal offers (architect P4).',
  },

  // -------------------------------------------------------------------------------------------
  // Readiness chip (ReadinessChip), AC-3 and D-4
  // -------------------------------------------------------------------------------------------
  needsRelearn: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Steps changed — next Run learns from step k' },
  },
  needsRelearnNoBoundary: {
    basis: 'adapted',
    source: { file: S.story, quote: 'Steps changed — next Run learns from step k' },
    note: 'The clause naming k is dropped when firstChangedStepId is not in the current draft.',
  },
  baseIdentityIncomplete: {
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
    basis: 'verbatim',
    source: {
      file: S.story,
      quote:
        'This page asks you to sign in. Add login steps before step N using your secrets (`<secret NAME>`), then Run again',
    },
  },
  loginStepsFailed: {
    basis: 'verbatim',
    source: {
      file: S.story,
      quote: 'Your login steps did not sign you in; check the secret and the steps before step N',
    },
  },
  loginNoLoginStepsStepless: {
    basis: 'delegated',
    source: { file: S.t0Ruling, quote: '@ux-design-expert words the step-less variant' },
    note: 'The AC-4 sentence without "before step N", for a step that is no longer in the draft.',
    facts: {
      file: S.story,
      quote: 'If the step no longer exists in the current draft, "Go to step N" is omitted and "Open Variables" stays',
    },
  },
  loginStepsFailedStepless: {
    basis: 'delegated',
    source: { file: S.t0Ruling, quote: '@ux-design-expert words the step-less variant' },
    note: 'The AC-4 sentence with "the steps before step N" replaced by "your login steps".',
    facts: {
      file: S.story,
      quote: 'If the step no longer exists in the current draft, "Go to step N" is omitted and "Open Variables" stays',
    },
  },
  loginStepGone: {
    basis: 'delegated',
    source: { file: S.t0Ruling, quote: '@ux-design-expert words the step-less variant' },
    note: 'Says why the step-less variant names no step. Also under a replay drift whose step is gone from the draft (W5 UX-07).',
    facts: {
      file: S.story,
      quote: 'If the step no longer exists in the current draft, "Go to step N" is omitted and "Open Variables" stays',
    },
  },
  goToStep: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Go to step N' },
  },
  openVariables: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Open Variables' },
  },

  // -------------------------------------------------------------------------------------------
  // Plan explanation (PlanExplanation), AC-6 and architect P3
  // -------------------------------------------------------------------------------------------
  planTitle: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Steps as learned' },
  },
  stepHeading: {
    basis: 'adapted',
    source: { file: S.story, quote: "Step N says: '<step text>'" },
    note: 'The AC-3 step reference, alone, as the heading of a step.',
  },
  learnedInThisRun: {
    basis: 'adapted',
    source: { file: S.story, quote: 'whether the step was learned in this run' },
    note: 'AC-6 fragment, capitalised.',
  },
  reusedFromPreviousRevision: {
    basis: 'adapted',
    source: { file: S.story, quote: 'reused from a previous revision (`reusedFrom`)' },
    note: 'AC-6 fragment, capitalised.',
  },
  relearnedAfterDrift: {
    basis: 'adapted',
    source: { file: S.story, quote: 're-learned after drift (`relearnedFrom`)' },
    note: 'AC-6 fragment, capitalised.',
  },
  referenceFlow: {
    basis: 'adapted',
    source: { file: S.story, quote: 'Order number from step 2 → Reference in step 4' },
    note: 'The AC-6 example as a pattern. binding is the declared ID; slot is the P3 label of the operation that consumes it.',
  },
  slotFill: {
    basis: 'adapted',
    source: { file: S.architectRulings, quote: 'Fill field' },
    note: 'P3 label of operationKind fill, used for argumentSlot fill.value.',
  },
  slotSelectOption: {
    basis: 'adapted',
    source: { file: S.architectRulings, quote: 'Select option' },
    note: 'P3 label of operationKind selectOption, used for argumentSlot selectOption.value.',
  },
  slotAssertExpected: {
    basis: 'adapted',
    source: { file: S.architectRulings, quote: 'Check expected result' },
    note: 'P3 label of operationKind assert, used for argumentSlot assert.expected.',
  },
  notReadyNow: {
    basis: 'adapted',
    source: { file: S.story, quote: 'Run completed; steps not ready to repeat.' },
    note: 'The AC-3 clause, alone, as the current-readiness fact when currentReadiness.ready is false (AC-6: shown apart from PUBLISHED history).',
  },

  // -------------------------------------------------------------------------------------------
  // Video seek (evidence/GuidedSeekControls), AC-7 and D-10
  // -------------------------------------------------------------------------------------------
  seekToStep: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Seek to step N' },
  },
  seekToAction: {
    basis: 'verbatim',
    source: { file: S.story, quote: 'Seek to action: <safe label>' },
  },

  // -------------------------------------------------------------------------------------------
  // Start feedback (GuidedStartFeedback): inline, no session, no poll (architect P4)
  // -------------------------------------------------------------------------------------------
  policyNotApproved: {
    basis: 'delegated',
    source: { file: S.story, quote: '@ux-design-expert owns the exact source-cited wording' },
    note: 'Inherited POLICY_NOT_APPROVED item a. Not action-level POLICY_DENIED, secret copy, entitlement or platform mismatch.',
    facts: { file: S.architectRulings, quote: 'ask CSIowner for application/environment policy approval' },
  },
  policyAbsent: {
    basis: 'delegated',
    source: { file: S.story, quote: '@ux-design-expert owns the exact source-cited wording' },
    note: 'messageCode GUIDED_POLICY_ABSENT.',
    facts: { file: S.openapi, quote: 'approved governed observation policy, or its latest version is not yet approved' },
  },
  policyUnapproved: {
    basis: 'delegated',
    source: { file: S.story, quote: '@ux-design-expert owns the exact source-cited wording' },
    note: 'messageCode GUIDED_POLICY_UNAPPROVED.',
    facts: { file: S.openapi, quote: 'approved governed observation policy, or its latest version is not yet approved' },
  },
  policyPendingVersion: {
    basis: 'delegated',
    source: { file: S.story, quote: '@ux-design-expert owns the exact source-cited wording' },
    note: 'messageCode GUIDED_POLICY_PENDING_VERSION.',
    facts: { file: S.openapi, quote: 'an edit awaiting approval blocks new learning even while an older version is active' },
  },
  baseIdentityIncompleteStart: {
    basis: 'delegated',
    source: { file: S.story, quote: '@ux-design-expert writes the chip copy for this case' },
    note: 'D-4 start refusal (REVISION_CONFLICT, messageCode BASE_IDENTITY_INCOMPLETE). Offers "Learn again from step 1"; never learns on its own.',
    facts: { file: S.architectRulings, quote: 'explain saved learning cannot be reused and offer explicit full learn from first currentstep' },
  },
  revisionNotReady: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'D-3: FIRST_LEARN_STEP_NARROWED, FIRST_LEARN_STEP_UNKNOWN and BASE_REVISION_MISMATCH. Also when an explicit learn\'s conditions fail on the fresh read (W5 UX-13).',
    facts: { file: S.story, quote: 'Each is shown as not-ready start feedback, with no automatic retry and no session.' },
  },
  referenceMissing: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Start refusal MISSING_SOURCE / AUTHORING_REFERENCE_MISSING. Offers "Open Variables".',
    facts: { file: S.architectRulings, quote: '409 AUTHORING_REFERENCE_MISSING: focus declared reference/step editor' },
  },
  originNotAllowed: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Start refusal ORIGIN_NOT_ALLOWED. No login guess and no automatic switch.',
    facts: { file: S.architectRulings, quote: 'explain approved application access is unavailable' },
  },
  budgetCsi: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Start refusal 429 BUDGET_EXCEEDED with retryable true (per-CSI budget).',
    facts: { file: S.openapi, quote: 'budget (STUDIO-OBS-014 AC-8) and always carries `Retry-After`' },
  },
  budgetRetryAfter: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Retry-After, whole seconds, formatted. Shown only when the header was sent.',
    facts: { file: S.architectRulings, quote: 'Use actual retryable/RetryAfter CSIor session distinction' },
  },
  budgetSession: {
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: 'Start refusal 429 BUDGET_EXCEEDED with retryable false (per-session bound).',
    facts: { file: S.openapi, quote: 'per-session bound (for example too many source steps) that no wait resolves' },
  },
  learningElsewhere: {
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
  // Reference picker (ChecksStudioPage), AC-5 and W5-2
  // -------------------------------------------------------------------------------------------
  secretNameTaken: {
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
    basis: 'delegated',
    source: AC3_COPY_BY_UMA,
    note: "W5 UX-01: guided start refused, or capability unavailable, with RUNTIME_INCOMPATIBLE. Names no cause and no remedy; the code follows. Architect P4 'unavailable/notready copy'. The replay execute narrative is unchanged.",
    facts: { file: S.story, quote: 'A `RUNTIME_INCOMPATIBLE` start refusal names no cause.' },
  },
  reasonShownBelow: {
    basis: 'verbatim',
    source: {
      file: S.executeRefusals,
      quote: 'The reason the server gave is shown below exactly as it arrived, so it can be quoted in a ticket.',
    },
  },
} as const satisfies Readonly<Record<GuidedCopyKey, GuidedCopySource>>;
