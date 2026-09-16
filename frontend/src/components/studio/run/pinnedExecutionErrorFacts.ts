import type { ExecutionErrorCode } from '@/types/studio/studioTypes';

/**
 * The facts AC-6 requires a terminal `ERROR` to carry, written **independently** of the module
 * that renders them (story 10.11a).
 *
 * This file exists because of two findings @qa measured on story 10.10 and the epic catalogued:
 *
 *  - **VAC-11** — *an assertion whose expected value is imported from the module under test.*
 *    10.10's AC-2 read the expected narrative out of `compileStateNarratives.ts`, the module the
 *    component renders from, and then asserted the rendering contained it. True for any content.
 *    Blanking seven required facts to `'x'` left the whole suite green; **eight of fifteen
 *    required facts were pinned by nothing.**
 *  - **PIN-1** — *a pinned copy whose provenance nothing checks.* The first fix added a second
 *    copy with a header comment warning against refactoring it away. @qa performed exactly that
 *    refactor and the suite stayed green. **A header comment is not a guard.**
 *
 * So the header below is not the guard either. The guard is an assertion in `refusals.test.tsx`
 * that **this module imports nothing it pins** — falsified against every specifier form. If a
 * later reader derives these phrases from `executionErrorNarratives.ts` to remove the duplication,
 * that assertion goes red, which is the only thing that stops the regression path back into
 * VAC-11.
 *
 * Each code gets **two separate slots**, matching the two the document's own table separates:
 * what a caller may conclude about the browser, and who can clear the condition. Two slots rather
 * than one concatenated string, so a rendering that loses one of them cannot hide behind the
 * other — 10.10's fix, transposed.
 *
 * The phrases are short and distinctive on purpose. A substring assertion still passes on text
 * that is present and unreadable — that residue is real and is named in the story's *Weakest
 * criteria* — so the render tests carry minimum-length and distinctness guards beside these,
 * behind a negative control that proves the degenerate case is closed.
 */
export interface PinnedExecutionErrorFacts {
  /** Must appear in the rendered browser-claim slot. */
  readonly browserPhrase: string;
  /** Must appear in the rendered remedy slot. */
  readonly remedyPhrase: string;
  /** Whether the surface offers a one-click re-run. The document's *"a new execution"* column. */
  readonly rerunOffered: boolean;
}

export const PINNED_EXECUTION_ERROR_FACTS: Readonly<
  Record<ExecutionErrorCode, PinnedExecutionErrorFacts>
> = {
  TIMEOUT: {
    browserPhrase: 'killed',
    remedyPhrase: 'shorten the test',
    rerunOffered: false,
  },
  DISPATCH_FAILED: {
    browserPhrase: 'No browser started',
    remedyPhrase: 'start a new execution',
    rerunOffered: true,
  },
  DISPATCH_UNKNOWN: {
    browserPhrase: 'you must assume neither',
    remedyPhrase: 'Someone has to look at what happened',
    rerunOffered: false,
  },
  START_TIMEOUT: {
    browserPhrase: 'never confirmed a start',
    remedyPhrase: 'start a new execution',
    rerunOffered: true,
  },
  STALE: {
    browserPhrase: 'stopped reporting',
    remedyPhrase: 'start a new execution',
    rerunOffered: true,
  },
  DISPATCH_DISABLED: {
    browserPhrase: 'switched off platform-wide',
    remedyPhrase: 'An operator',
    rerunOffered: false,
  },
  AUTHORIZATION_REVOKED: {
    browserPhrase: 'permission to execute for this CSI had been withdrawn',
    remedyPhrase: 'entitlements',
    rerunOffered: false,
  },
  REFERENCE_UNAVAILABLE: {
    browserPhrase: 'no longer resolved when it was sent',
    remedyPhrase: 'restoring it',
    rerunOffered: false,
  },
};

/**
 * The shortest a pinned phrase may be before it stops discriminating.
 *
 * Without a floor, blanking a phrase to `''` makes every `toContain` assertion trivially true —
 * the degenerate case at the bottom of VAC-11. The render tests assert this floor holds for every
 * slot before they use any of them.
 */
export const MIN_PINNED_PHRASE_LENGTH = 5;
