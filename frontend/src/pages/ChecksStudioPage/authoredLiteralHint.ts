import type { AuthoringStep } from '@/types/studio/studioTypes';
import type { GuidedResult } from '@/types/studio/studioGuidedTypes';

/**
 * STUDIO-OBS-008 conditional obligation KL-015-Q4 (b-d), placed while STUDIO-OBS-009
 * AUTHORED-ECHO-01 has not landed: when a step's target cannot be found and that step carries an
 * authored literal, the page adds the `authoredLiteralTargetNotFound` hint to its failure narrative.
 * STUDIO-OBS-009 AUTHORED-ECHO-01 f removes this module and the copy key once the runner no longer
 * withholds same-named targets.
 *
 * **The rule is @architect's ruling Q9** (`docs/qa/evidence/STUDIO-OBS-008/execution-20261017/rulings/
 * q9-authored-literal-trigger.md`, option ii). The hint shows only when ALL of these hold:
 *  1. the outcome is `FAILED`;
 *  2. `failure?.code ?? errorCode` is `TARGET_MISMATCH` or `BUDGET_EXCEEDED`;
 *  3. {@link failedStepIdOf} names a step that is still in the draft;
 *  4. that step's draft text carries a literal ({@link stepCarriesAuthoredLiteral}).
 *
 * **Why those two codes.**
 *  - `BUDGET_EXCEEDED` is what the landed backend really ends with: the runner withholds every
 *    non-secret authored value, so a node whose name echoes it is never observed; the acquisition gate
 *    then refuses the action until the poll budget runs out. The public result carries
 *    `errorCode: BUDGET_EXCEEDED`, no `failure`, and a step with no admitted action. The hint adds to
 *    the server's budget sentence and replaces nothing.
 *  - `TARGET_MISMATCH` is the contract's declared code for "no element matched". The backend does not
 *    emit it today; it is kept because it is declared and costs nothing.
 *  - `RUNTIME_INCOMPATIBLE` is excluded: it is mostly infrastructure (context refusals, delivery
 *    exhaustion, unsupported capability) and names no cause (D-11), so the hint would mislead.
 *  Every other code (`UNSUPPORTED_SURFACE`, `ASSERTION_FAILED`, `POLICY_DENIED`, `LOGIN_REQUIRED`,
 *  `INVALID_CONTRACT`, `MISSING_SOURCE`, `AMBIGUOUS_TARGET`) is a different cause and never shows it.
 *
 * **Carried residuals** (ruling Q9 section 5; @po places them in STUDIO-OBS-009 AUTHORED-ECHO-01):
 *  - R1 a literal in another step hides this step's target (no hint unless that step also carries a
 *    literal; the copy names step N and is hedged);
 *  - R2 the hint can appear on a model, CSI, cap or window `BUDGET_EXCEEDED` at a step with a
 *    literal: true there, possibly irrelevant;
 *  - R3 the secondary paths (model `UNSUPPORTED`, `INVALID_CONTRACT`, `UNGROUNDED_TARGET`, runner
 *    `TARGET_CHANGED`) get no hint;
 *  - R4 `authoredEchoUnobservableTargets` cannot be counted from a target code; AE-01 b/c should pin
 *    `FAILED BUDGET_EXCEEDED` as the "before" state.
 */

/** The public codes under which a step's target was not found (ruling Q9). */
export const TARGET_NOT_FOUND_CODES: readonly string[] = ['TARGET_MISMATCH', 'BUDGET_EXCEEDED'];

/** Leading verbs of the step kinds whose text the runner withholds as an authored literal. */
const ASSERTION_VERBS = ['check', 'verify', 'assert', 'expect', 'confirm', 'ensure'];
const SELECTION_VERBS = ['select', 'choose', 'pick'];
const TYPED_VERBS = ['type', 'enter', 'fill', 'input'];
const LITERAL_STEP_VERBS = new Set([...ASSERTION_VERBS, ...SELECTION_VERBS, ...TYPED_VERBS]);

/** Clause boundaries: sentence punctuation, and the words "and" / "then". */
const CLAUSE_BOUNDARY = /[.,;:!?]|\b(?:and|then)\b/iu;

/**
 * Whether the author's step carries an authored literal: it is split into clauses, and some clause
 * starts with an assertion, selection or typing verb and has at least one word after it. Lexical
 * only; no intent is parsed.
 */
export function stepCarriesAuthoredLiteral(text: string): boolean {
  return text.split(CLAUSE_BOUNDARY).some((clause) => {
    const words = clause.trim().split(/\s+/u).filter(Boolean);
    if (words.length < 2) return false;
    return LITERAL_STEP_VERBS.has(words[0].toLowerCase().replace(/[^a-z]/gu, ''));
  });
}

/** The step the result says the run stopped at, by stable ID, or `null` when it names none. */
export function failedStepIdOf(result: Pick<GuidedResult, 'explanation'>): string | null {
  const steps = [...result.explanation.steps].sort((a, b) => a.number - b.number);
  const withFailedAction = steps.find((step) => step.actions.some((action) => action.outcome === 'FAILED'));
  if (withFailedAction) return withFailedAction.stepId;
  return steps.find((step) => !step.completed)?.stepId ?? null;
}

/**
 * The KL-015-Q4 hint's step: the 1-based position, in the current draft, of the step the result says
 * the run stopped at, when the hint applies to this result (all four checks above), else `null`. The
 * copy names it ("step N"), so it is read against the current draft's own steps (W5 UX-03).
 */
export function authoredLiteralHintStep(
  result: Pick<GuidedResult, 'outcome' | 'failure' | 'errorCode' | 'explanation'>,
  draftSteps: readonly AuthoringStep[],
): number | null {
  if (result.outcome !== 'FAILED') return null;
  const code = result.failure?.code ?? result.errorCode;
  if (code === null || code === undefined || !TARGET_NOT_FOUND_CODES.includes(code)) return null;
  const stepId = failedStepIdOf(result);
  if (stepId === null) return null;
  const index = draftSteps.findIndex((candidate) => candidate.id === stepId);
  if (index < 0) return null;
  const step = draftSteps[index];
  return typeof step.text === 'string' && stepCarriesAuthoredLiteral(step.text) ? index + 1 : null;
}
