import { LEARNED_READY_LABEL } from '@/components/studio/run/runEnablement';
import { EXECUTION_ERROR_NARRATIVES } from '@/components/studio/run/executionErrorNarratives';
import {
  EXECUTE_FORBIDDEN_NARRATIVE,
  UNDECLARED_EXECUTE_REFUSAL,
} from '@/components/studio/run/executeRefusals';

/** Runtime guided copy templates; citation metadata is held in test support (C-OBS008-3). */
export interface GuidedCopy {
  /** The text, with `{token}` where a value is filled in. Backticks mark inline code. */
  readonly template: string;
}

export const GUIDED_COPY = {
  preparing: {
    template: 'Preparing your steps.',
  },
  understanding: {
    template: 'Understanding this page — step {N} of {M}.',
  },
  understandingNoStep: {
    template: 'Understanding this page.',
  },
  running: {
    template: 'Running step {N} of {M}.',
  },
  repeatingPrefix: {
    template: 'Repeating saved steps 1–{(k-1)}…',
  },
  repeatingPrefixNoBoundary: {
    template: 'Repeating saved steps…',
  },
  learningFrom: {
    template: 'Learning from step {k}',
  },
  finalizing: {
    template: 'Saving what this run learned…',
  },
  clarificationQuestion: {
    template: "Step {N} says: '{<step text>}'. Which one did you mean?",
  },
  noneOfThese: {
    template: "None of these — I'll edit step {N}",
  },
  continue: {
    template: 'Continue',
  },
  pageDerived: {
    template: 'Page-derived',
  },
  pageRole: {
    template: 'role: {role}',
  },
  pageRegion: {
    template: 'region: {region}',
  },
  expiresIn60: {
    template: 'This question expires within a minute. If it expires, this run will stop and you will need to Run again.',
  },
  expiresIn20: {
    template: 'This question expires within 20 seconds. If it expires, this run will stop and you will need to Run again.',
  },
  confirmTitle: {
    template: 'Confirm this action before it runs.',
  },
  confirmBody: {
    template: "Step {N} says: '{<authored step text>}'. Continue with this action?",
  },
  completedLearned: {
    template: 'Completed — learned from this run.',
  },
  completedReplay: {
    template: 'Completed — saved steps replayed.',
  },
  completedPartial: {
    template: 'Completed — steps {k}–{n} learned again.',
  },
  completedPartialOne: {
    template: 'Completed — step {k} learned again.',
  },
  relearnedAfterPrefixDrift: {
    template: 'Steps {j…} were re-learned because the page changed.',
  },
  relearnedAfterPrefixDriftOne: {
    template: 'Step {j} was re-learned because the page changed.',
  },
  publicationConflict: {
    template: 'Run completed; steps not ready to repeat.',
  },
  unknownOutcome: {
    template: 'Stopped — submission outcome unknown.',
  },
  unknownOutcomeConsequence: {
    template:
      'Studio could not confirm whether its last action on the page took effect, and it will not repeat that action on its own. Check the application before you Run again.',
  },
  expired: {
    template: 'This run expired before it finished, so it stopped. You will need to Run again.',
  },
  assertionFailed: {
    template: 'A step that checks the page did not pass, so this run stopped.',
  },
  unsupportedSurface: {
    template: 'This step needs a part of the page that Studio cannot work with, so this run stopped.',
  },
  budgetExceeded: {
    template: 'This run reached its learning budget, so Studio stopped it.',
  },
  nothingStartsOnItsOwn: {
    template: 'Nothing starts again on its own.',
  },
  failedUnnamed: {
    template:
      'This run stopped. The reason the server gave is shown below exactly as it arrived, so it can be quoted in a ticket.',
  },
  failedNoReason: {
    template: 'This run stopped, and the server gave no reason for it, so there is nothing here to explain it.',
  },
  governedPolicyDeniedTitle: {
    template: 'This action could not be run.',
  },
  governedPolicyDeniedBody: {
    template:
      'Studio stopped this run under the action safety settings. Check the step wording and ask the CSI owner to review the side-effect setting.',
  },
  governedPolicyDeniedRemedy: {
    template: 'For a checkbox or switch, say “check” or “uncheck” explicitly.',
  },
  authoredLiteralTargetNotFound: {
    template:
      'This may be because of step {N}: Studio cannot see page text that matches a value written in a step. If so, try rewording step {N}, for example by checking for a longer or different piece of visible text.',
  },
  replayDrift: {
    template: 'Step {N} no longer matches the page…',
  },
  learnAgainFromStep: {
    template: 'Learn again from step {N}',
  },
  needsRelearn: {
    template: 'Steps changed — next Run learns from step {k}',
  },
  needsRelearnNoBoundary: {
    template: 'Steps changed',
  },
  baseIdentityIncomplete: {
    template: 'Saved learning cannot be reused — next Run learns from step 1',
  },
  loginNoLoginSteps: {
    template:
      'This page asks you to sign in. Add login steps before step {N} using your secrets (`<secret NAME>`), then Run again',
  },
  loginStepsFailed: {
    template: 'Your login steps did not sign you in; check the secret and the steps before step {N}',
  },
  loginNoLoginStepsStepless: {
    template: 'This page asks you to sign in. Add login steps using your secrets (`<secret NAME>`), then Run again',
  },
  loginStepsFailedStepless: {
    template: 'Your login steps did not sign you in; check the secret and your login steps',
  },
  loginStepGone: {
    template: 'The step where this happened is no longer in your steps.',
  },
  goToStep: {
    template: 'Go to step {N}',
  },
  openVariables: {
    template: 'Open Variables',
  },
  planTitle: {
    template: 'Steps as learned',
  },
  stepHeading: {
    template: 'Step {N}',
  },
  learnedInThisRun: {
    template: 'Learned in this run',
  },
  reusedFromPreviousRevision: {
    template: 'Reused from a previous revision',
  },
  relearnedAfterDrift: {
    template: 'Re-learned after drift',
  },
  referenceFlow: {
    template: '{binding} from step {producer} → {slot} in step {consumer}',
  },
  slotFill: {
    template: 'Fill field',
  },
  slotSelectOption: {
    template: 'Select option',
  },
  slotAssertExpected: {
    template: 'Check expected result',
  },
  notReadyNow: {
    template: 'Steps not ready to repeat.',
  },
  seekToStep: {
    template: 'Seek to step {N}',
  },
  seekToAction: {
    template: 'Seek to action: {<safe label>}',
  },
  policyNotApproved: {
    template:
      'Learning cannot start until the policy for this application and environment is approved. Ask the CSI owner to approve it.',
  },
  policyAbsent: {
    template: 'There is no policy for this application and environment yet.',
  },
  policyUnapproved: {
    template: 'The policy for this application and environment has not been approved.',
  },
  policyPendingVersion: {
    template: 'A newer version of the policy is waiting for approval, and it blocks new learning until it is approved.',
  },
  baseIdentityIncompleteStart: {
    template: 'Saved learning cannot be reused, so this Run has to learn from step 1. Nothing was started.',
  },
  revisionNotReady: {
    template: 'This test is not ready to start learning from that step, so nothing was started. Press Run again to start from the latest saved steps.',
  },
  referenceMissing: {
    template: 'A step uses a saved input or secret that this test does not declare, so nothing was started.',
  },
  originNotAllowed: {
    template: 'Studio does not have approved access to this application, so nothing was started.',
  },
  budgetCsi: {
    template: 'The learning budget for this CSI is used up for now, so nothing was started.',
  },
  budgetRetryAfter: {
    template: 'You can Run again in {duration}.',
  },
  budgetSession: {
    template: 'This test is over a limit for a single Run, so nothing was started. Waiting will not change this.',
  },
  learningElsewhere: {
    template:
      'Another Run is learning this test, so Run is off. It stays off until that Run ends and this page reads the test again: press Refresh test information, or reload the page.',
  },
  sessionUnreadable: {
    template:
      'Studio could not read the learning Run already started for this test, so it starts no new learning Run here. Press Refresh test information to check again.',
  },
  secretNameTaken: {
    template:
      'The secret {ID} was not inserted, because this test already has a variable named {ID}. Rename that variable in Variables, then insert the secret again.',
  },
  guidedStartUnavailable: {
    template: 'Studio could not start learning for this test, so nothing was started.',
  },
  reasonShownBelow: {
    template: 'The reason the server gave is shown below exactly as it arrived, so it can be quoted in a ticket.',
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
