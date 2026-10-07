/**
 * AC-2's expected text, pinned **independently of the module that produces it**.
 *
 * Story 10.10 QA (2026-09-11) found the eleventh vacuous-guard shape this epic has turned up, and
 * it was here: *an assertion whose expected value is imported from the module under test.* The
 * original AC-2 test did `const narrative = narrativeFor(state)` — from `compileStateNarratives`,
 * the same module the component renders from — and then `expect(text).toContain(narrative.whatIsTrue)`.
 * That holds for any content whatsoever, and `toContain('')` holds for none: QA blanked eight of
 * the fifteen required facts to `'x'` and the whole suite stayed green.
 *
 * **So this file is deliberately a second copy, and must stay one.** If a future edit "removes the
 * duplication" by importing `COMPILE_STATE_NARRATIVES` here, the pin evaporates and AC-2 goes back
 * to asserting that a string contains itself. Copy drift reddening a test is the feature, not the
 * cost: this is the surface on which a user decides whether to approve machine-written code, and a
 * silent rewording of what is true, what they may do, or what is blocked is exactly the change that
 * should need someone to look at it.
 *
 * The phrases are fragments rather than whole sentences so that the pin is on the **fact** the
 * AC-2 table requires — "the draft is saved", "confirmation is the only route to READY" — and not
 * merely on today's punctuation. Every phrase is checked for a minimum length by
 * `assertFactRendered`, which is what closes the `toContain('')` degenerate case.
 */

export type FactSlot = 'whatIsTrue' | 'whatYouCanDo' | 'whatIsBlocked';

/** The accessible name of each state region. Pinned literally; AC-1 also asserts distinctness. */
export const PINNED_STATE_TITLES: Readonly<Record<string, string>> = {
  COMPILING: 'Translating your steps',
  AWAITING_CONFIRMATION: 'Waiting for your confirmation',
  READY: 'Confirmed and runnable',
  NEEDS_REVISION: 'Some steps could not be made runnable',
  STALE: 'Translation was interrupted: not something you did',
};

/**
 * Fifteen required facts: five states by three slots. Each carries the phrases the AC-2 table
 * requires that slot to state, written here from the criterion and its sources (§4.2, §4.6, §4.7,
 * the `CompileError` schema description, BRD §6) rather than pasted from the component.
 */
export const AC2_REQUIRED_FACTS: Readonly<
  Record<string, Readonly<Record<FactSlot, readonly RegExp[]>>>
> = {
  COMPILING: {
    // §4.2, §8.3: a compile is in flight for the source shown, and the draft is saved.
    whatIsTrue: [/draft is saved/i, /running right now/i, /translation of your steps/i],
    whatYouCanDo: [/checks for the result/i, /stops on its own/i],
    // Nothing is confirmable yet.
    whatIsBlocked: [/nothing to confirm yet/i, /cannot be made runnable/i],
  },
  AWAITING_CONFIRMATION: {
    // §4.2 "It becomes AWAITING_CONFIRMATION"; epic §10.8 "never READY automatically".
    whatIsTrue: [/candidate translation exists/i, /is not runnable/i, /not become runnable on its own/i],
    whatYouCanDo: [/review translation details/i, /confirm this exact revision/i, /only way this draft becomes runnable/i],
    whatIsBlocked: [/running is blocked until you confirm/i, /no candidate becomes runnable automatically/i],
  },
  READY: {
    // §4.6: the confirmed revision is runnable and its identity is shown.
    whatIsTrue: [/you confirmed a revision/i, /that revision is the one that runs/i],
    whatYouCanDo: [/run it, or edit the steps/i, /starts a new translation/i],
    whatIsBlocked: [/nothing is blocked/i, /card identifies the revision that runs/i],
  },
  NEEDS_REVISION: {
    // §4.7, BRD §6: the candidate is not runnable and the reasons are the author's to act on.
    whatIsTrue: [/produced nothing runnable/i, /review translation details/i, /attached to your steps/i],
    // Retrying without editing will not help.
    whatYouCanDo: [/edit the steps/i, /without editing will reach the same place/i],
    whatIsBlocked: [/no candidate to confirm/i, /until the steps change/i],
  },
  STALE: {
    // The `CompileError` description's four clauses: saved and unchanged, the confirmed revision
    // still runs, it is not the author's fault, and an explicit recompile is the whole remedy.
    // Studio v1 WP9 adds the fact D11 makes load-bearing: the translation was interrupted, and
    // the remedy is named as a recompile.
    whatIsTrue: [/saved and unchanged/i, /still runs/i, /not in your steps/i, /translation was interrupted/i],
    whatYouCanDo: [/ask for the translation again/i, /whole remedy/i, /recompile/i],
    whatIsBlocked: [/no candidate to confirm until a translation finishes/i, /nothing you wrote has been lost/i],
  },
};

export const FACT_SLOTS: readonly FactSlot[] = ['whatIsTrue', 'whatYouCanDo', 'whatIsBlocked'];

/** The fifteen (state, slot) pairs, flattened so each becomes its own named test case. */
export const AC2_FACT_ROWS: ReadonlyArray<readonly [string, FactSlot, readonly RegExp[]]> =
  Object.keys(AC2_REQUIRED_FACTS).flatMap((state) =>
    FACT_SLOTS.map(
      (slot) => [state, slot, AC2_REQUIRED_FACTS[state][slot]] as const,
    ),
  );

/** The shortest a pinned phrase may be. Anything shorter is not discriminating. */
export const MIN_PHRASE_LENGTH = 8;
/** The shortest a rendered fact may be. A slot holding `'x'` is not a rendered fact. */
export const MIN_RENDERED_FACT_LENGTH = 25;

/**
 * Asserts a rendered slot states its required fact, and refuses to be satisfied by nothing.
 *
 * Throws rather than using `expect` so the harness itself can be driven by a negative control:
 * the empty expectation, the empty rendering and a wrong rendering must each make it throw, and a
 * test asserts they do. That is what stops this from becoming another `toContain('')`.
 */
export function assertFactRendered(rendered: string, phrases: readonly RegExp[]): void {
  if (phrases.length === 0) {
    throw new Error('a required fact was pinned with no phrases, so it asserts nothing');
  }
  for (const phrase of phrases) {
    if (phrase.source.length < MIN_PHRASE_LENGTH) {
      throw new Error(`the pinned phrase ${phrase} is too short to discriminate anything`);
    }
  }
  if (rendered.trim().length < MIN_RENDERED_FACT_LENGTH) {
    throw new Error(
      `the slot rendered ${JSON.stringify(rendered)}, which is too short to be a stated fact`,
    );
  }
  for (const phrase of phrases) {
    if (!phrase.test(rendered)) {
      throw new Error(`the slot does not state ${phrase}; it rendered ${JSON.stringify(rendered)}`);
    }
  }
}
