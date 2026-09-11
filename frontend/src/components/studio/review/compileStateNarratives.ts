import type { CompileStatus } from '@/types/studio/studioTypes';

/**
 * The five compile states, as five different sentences (story 10.10, AC-1 / AC-2).
 *
 * Architecture §4.2 fixes the five. They differ in what is true, in what the author may do, and
 * in **who can clear the condition**: `STALE` is not the author's fault and an explicit recompile
 * is its whole remedy, while `NEEDS_REVISION` is the author's to fix and no amount of retrying
 * will move it. Collapsing any pair into "something went wrong" is the failure ADR-002 §14.3
 * settled on the wire and which one `default:` branch here could undo.
 *
 * **There is no fallback.** The mapping is a total record over the union and {@link narrativeFor}
 * throws on anything else, so a sixth value the server starts sending is a loud failure rather
 * than a silent generic panel. `studioContract.test.ts` reads the enum from `openapi.yaml` and
 * asserts this record covers it exactly, in both directions.
 *
 * Nothing here says a step the validator accepted does what its author meant. Static validation
 * "cannot prove the locator matches the application or the assertion captures the user's intent"
 * (§4.1, §4.5); AC-9 asserts the absence of that claim over the rendered output.
 */
export interface CompileStateNarrative {
  /** The accessible name of the state region. Distinct per state — AC-1 asserts it. */
  readonly title: string;
  /** What is true right now. */
  readonly whatIsTrue: string;
  /** What the author may do next. */
  readonly whatYouCanDo: string;
  /** What is blocked, and by what. */
  readonly whatIsBlocked: string;
}

export const COMPILE_STATE_NARRATIVES: Readonly<Record<CompileStatus, CompileStateNarrative>> = {
  COMPILING: {
    title: 'Translating your steps',
    whatIsTrue:
      'Your draft is saved. A translation of the steps shown above is running right now on the server.',
    whatYouCanDo: 'Wait here — this page checks for the result and stops on its own.',
    whatIsBlocked: 'There is nothing to confirm yet, so this draft cannot be made runnable yet.',
  },
  AWAITING_CONFIRMATION: {
    title: 'Waiting for your confirmation',
    whatIsTrue:
      'A candidate translation exists for the steps shown above. It is not runnable, and it will not become runnable on its own.',
    whatYouCanDo:
      'Read each step below, then confirm this exact revision. Confirming is the only way this draft becomes runnable.',
    whatIsBlocked:
      'Running is blocked until you confirm. Nothing confirms a candidate for you, and no candidate becomes runnable automatically.',
  },
  READY: {
    title: 'Confirmed and runnable',
    whatIsTrue: 'You confirmed a revision of this draft, and that revision is the one that runs.',
    whatYouCanDo: 'Run it, or edit the steps — editing starts a new translation you would review again.',
    whatIsBlocked: 'Nothing is blocked. The identity of the revision that runs is shown below.',
  },
  NEEDS_REVISION: {
    title: 'Some steps could not be made runnable',
    whatIsTrue:
      'The translation finished and produced nothing runnable. The reasons are listed against your own steps below.',
    whatYouCanDo:
      'Edit the steps the reasons point at, then save. Asking for the same translation again without editing will reach the same place.',
    whatIsBlocked:
      'There is no candidate to confirm, so this draft cannot be made runnable until the steps change.',
  },
  STALE: {
    title: 'Translation did not finish — not something you did',
    whatIsTrue:
      'Your draft is saved and unchanged. Any revision you confirmed earlier still runs. The translation stopped for a reason on our side, not in your steps.',
    whatYouCanDo: 'Ask for the translation again. That is the whole remedy.',
    whatIsBlocked:
      'There is no candidate to confirm until a translation finishes. Nothing you wrote has been lost.',
  },
};

/**
 * Total lookup, deliberately partial-unfriendly.
 *
 * A `??` fallback or a `default:` branch here would render four different situations as one, so
 * an unknown status is an error instead. AC-1's second falsification is exactly this: replace the
 * record with a defaulted mapping and the enum test goes red.
 */
export function narrativeFor(status: string): CompileStateNarrative {
  const narrative = (COMPILE_STATE_NARRATIVES as Record<string, CompileStateNarrative>)[status];
  if (!narrative) {
    throw new Error(
      `Unknown compileStatus "${status}": the five states of architecture §4.2 are the whole set, ` +
        'and rendering an unknown one as a generic state would hide which of them is true.',
    );
  }
  return narrative;
}

export const COMPILE_STATE_KEYS: readonly CompileStatus[] = Object.keys(
  COMPILE_STATE_NARRATIVES,
) as CompileStatus[];
