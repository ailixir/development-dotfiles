/**
 * Every refusal `POST /tests/{id}/execute` declares, worded once (story 10.11a, AC-4).
 *
 * **The branch is taken on `error`, never on `message`.** @po's ruling on story 10.9: *"the message
 * is human-readable prose and is not a branch key."* The server's message is shown because it names
 * what moved, which is genuinely useful; branching on it is a different thing, and a fixture whose
 * prose contradicts its code is what proves the branch does not.
 *
 * **The `409` set is the document's, read in both directions.** `studioContract.test.ts` compares
 * the keys of {@link EXECUTE_CONFLICT_NARRATIVES} against `executeTest`'s own `x-conflict-codes`
 * with the `assertSameSet` helper story 10.10 installed — no declared code without wording, no
 * wording without a declared code. A sixth code added to the document surfaces as a red test rather
 * than as silent misrouting.
 *
 * **`429` and `503` branch on the status, not on a code, and that is deliberate.** The `429`
 * response declares no `x-conflict-codes` and no example at all; the `503`'s `DISPATCH_DISABLED`
 * reaches the document only as an *example*, and ADR-002 §14.6 establishes that an example is not
 * assertable. Switching on an undeclared code would be hand-widening a vocabulary one paragraph
 * away from where §18.3 forbids exactly that, so the status is the key for these two and the code —
 * if one arrives — is shown as prose.
 *
 * **Who clears each condition comes from the `tests` tag's own table** where the table has an entry,
 * and `TEST_QUARANTINED` in particular says the authored test **still exists and returns** (BRD §9;
 * ADR-002 §14.3). Telling an author their work was deleted when the platform guarantees nothing is
 * lost is a false statement that would drive a UI to offer a restore it cannot perform.
 *
 * One narrative is derived rather than quoted and is marked as such below: `RUNTIME_INCOMPATIBLE`
 * has no row in the `tests` tag table. Its *condition* is the document's
 * (`docs/architecture/studio-execution.md`: *"current target/runtime policy permits it"*); its
 * *remedy* is architecture §4.2's ordinary recompile-and-confirm path, stated as the action
 * available rather than as a promise about the outcome.
 */

/** Which surface a refusal belongs on. `503` is platform-wide; the others are about this run. */
export type RefusalScope = 'draft' | 'quota' | 'platform';

export interface ExecuteRefusalNarrative {
  /** The accessible name of the refusal region. Distinct per refusal — AC-4 asserts it. */
  readonly title: string;
  /** What is true right now, in the reader's terms. */
  readonly explanation: string;
  /** Who clears the condition. From the `tests` tag table where the table has a row. */
  readonly whoClearsIt: string;
  /** Whether activating Run again could succeed without something else changing first. */
  readonly callerCanRetry: boolean;
  readonly scope: RefusalScope;
}

/** The five codes `executeTest`'s `409` declares in `x-conflict-codes`. */
export const EXECUTE_CONFLICT_NARRATIVES: Readonly<Record<string, ExecuteRefusalNarrative>> = {
  COMPILE_REQUIRED: {
    title: 'This draft is not confirmed as runnable',
    explanation:
      'The server will not run this draft because the steps have moved since the revision you last confirmed. Nothing was started and nothing was changed.',
    whoClearsIt:
      'You clear this: ask for a translation of the steps as they stand, read the candidate, and confirm it. Confirming is the only thing that makes a draft runnable.',
    callerCanRetry: true,
    scope: 'draft',
  },
  RUNTIME_INCOMPATIBLE: {
    title: 'The confirmed revision does not fit the runner in use',
    explanation:
      'The revision you confirmed is not compatible with the runner runtime the platform is running now. The server refused before anything started — no browser, no run.',
    whoClearsIt:
      'You can act on this: ask for a fresh translation of the same steps and confirm the candidate that results, which is made against the runtime in use now.',
    callerCanRetry: true,
    scope: 'draft',
  },
  IDEMPOTENCY_KEY_REUSED: {
    title: 'That run key was already used for a different request',
    explanation:
      'This request reused a key that the server has already seen with a different body, so it refused rather than guess which of the two you meant. Nothing was started.',
    whoClearsIt:
      'You clear this: start the run again. A fresh attempt carries a fresh key, and the earlier run is untouched.',
    callerCanRetry: true,
    scope: 'draft',
  },
  TEST_DELETED: {
    title: 'This draft has been deleted',
    explanation:
      'This draft was deleted, so it cannot be executed. Its run history is kept, but nothing new will start from it.',
    whoClearsIt:
      'Its owner clears this, out of band, by restoring the draft. No retry of this request can succeed while it is deleted.',
    callerCanRetry: false,
    scope: 'draft',
  },
  TEST_QUARANTINED: {
    title: 'This draft is held while its CSI is resolved',
    explanation:
      'The authored test still exists and nothing has been removed. It is being withheld because its CSI is missing or unregistered, and it returns when that is resolved.',
    whoClearsIt:
      'An administrator or an explicit migration clears this, out of band. Retrying will not, and nothing here was deleted.',
    callerCanRetry: false,
    scope: 'draft',
  },
};

/**
 * `429`, keyed on the status. The response declares no code set and no example, so there is
 * nothing here to branch on and nothing to assert against — see the module comment.
 */
export const QUOTA_EXHAUSTED_NARRATIVE: ExecuteRefusalNarrative = {
  title: 'Too many runs are already waiting',
  explanation:
    'The pending-run quota is used up, so the server did not accept another one. Nothing was started and nothing was lost.',
  whoClearsIt:
    'This clears itself as queued runs finish. Try again in a little while; no change to the draft is needed.',
  callerCanRetry: true,
  scope: 'quota',
};

/**
 * `503`, keyed on the status and rendered as a platform-wide condition rather than as something
 * about this draft — ADR-002 §15.3's *"blast radius"* reading. The `DISPATCH_DISABLED` code the
 * document shows here is an example, and §14.6 makes an example unassertable, so it is not a key.
 */
export const EXECUTION_DISABLED_NARRATIVE: ExecuteRefusalNarrative = {
  title: 'Running tests is switched off right now',
  explanation:
    'Execution is disabled across the platform, so no run can start from any draft — this is not about your test. Nothing was started.',
  whoClearsIt:
    'An operator clears this by re-enabling execution. Everyone is affected until they do, and there is nothing about this draft to fix.',
  callerCanRetry: false,
  scope: 'platform',
};

/**
 * A `409` carrying a code the document does not declare. Shown rather than swallowed, and never
 * folded into one of the five: a sixth code the deployed API starts sending must be visibly
 * unhandled, because the alternative is a UI quietly telling an author the wrong remedy.
 */
export const UNDECLARED_EXECUTE_REFUSAL: ExecuteRefusalNarrative = {
  title: 'The server refused this run for a reason this page has no wording for',
  explanation:
    'Nothing was started. The reason the server gave is shown below exactly as it arrived, so it can be quoted in a ticket.',
  whoClearsIt:
    'Unknown to this page. Quote the reason below; it names a condition this version of the Studio was not built to explain.',
  callerCanRetry: false,
  scope: 'draft',
};

/**
 * The whole refusal branch, in one place.
 *
 * `status` is the first key because two of the three refusals have no code to branch on. Only the
 * `409` reads `error`, and it reads it as an exact key — never as a substring of the message.
 */
export function executeRefusalFor(
  status: number | null,
  code: string | null,
): ExecuteRefusalNarrative | null {
  if (status === 429) {
    return QUOTA_EXHAUSTED_NARRATIVE;
  }
  if (status === 503) {
    return EXECUTION_DISABLED_NARRATIVE;
  }
  if (status === 409) {
    return EXECUTE_CONFLICT_NARRATIVES[code ?? ''] ?? UNDECLARED_EXECUTE_REFUSAL;
  }
  return null;
}

/** The declared `409` codes this surface words, in the document's own order. */
export const EXECUTE_CONFLICT_KEYS: readonly string[] = Object.keys(EXECUTE_CONFLICT_NARRATIVES);
