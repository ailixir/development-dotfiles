import type { TestReadiness } from '@/types/studio/studioTypes';

/**
 * What pressing Run does next, and nothing else decides it (story 10.11a, AC-1, AC-2; ADR-SC-005;
 * STUDIO-OBS-008 AC-2).
 *
 * Readiness is the server's: `GET /tests/{id}` derives `readiness` on every read and the execute
 * route refuses a draft without a matching published revision with `409 LEARN_REQUIRED`. The
 * client's job is to agree with the server rather than to form a second opinion, so this module
 * answers *what to do* from the declared state alone.
 *
 * **One Run, three modes (STUDIO-OBS-008 AC-2).** `READY` replays the published revision through the
 * ordinary `POST /tests/{id}/execute`. `UNLEARNED` starts a guided learning session. `NEEDS_RELEARN`
 * starts a mixed-mode guided session from the server's first changed step. `LEARNING` means a guided
 * session is already running, so Run is disabled and the live state is shown.
 *
 * **The mapping is total and has no fallback.** Every `readiness` the document declares gets an
 * explicit entry; {@link runModeFor} throws on anything else. A `??` or a
 * `default:` here would make a value the server starts sending render as one of the four —
 * permissively, if the default were `replay`, which is how an ungated Run ships. A fifth value must
 * be loud.
 *
 * `studioContract.test.ts` reads the four states from
 * `components.schemas.TestDto.properties.readiness.enum` and asserts {@link RUN_MODE} covers them
 * exactly, in both directions, with `READY` the one state that replays.
 */

/**
 * The three Run modes, plus the one state in which Run is disabled (STUDIO-OBS-008 AC-2):
 *  - `replay`: `READY`, the ordinary execute, and `RECORDED`, the same route run as a diagnostic of the
 *    recorded revision (it never promotes);
 *  - `learn`: `UNLEARNED`, a guided session with no base and no boundary hint;
 *  - `relearn`: `NEEDS_RELEARN`, a guided session with `baseRevisionId = confirmedRevisionId` and
 *    `firstLearnStepId` = the server's `firstChangedStepId` (D-3), or the first current step when the
 *    reason is `BASE_IDENTITY_INCOMPLETE` (D-4);
 *  - `busy`: `LEARNING`, Run disabled while the session runs.
 */
export type RunMode = 'replay' | 'learn' | 'relearn' | 'busy';

export const RUN_MODE: Readonly<Record<TestReadiness, RunMode>> = {
  UNLEARNED: 'learn',
  LEARNING: 'busy',
  // A recorded revision runs as a labelled diagnostic through the ordinary execute (ADR-SC-008 D5).
  RECORDED: 'replay',
  READY: 'replay',
  NEEDS_RELEARN: 'relearn',
};

function unknownReadiness(readiness: string): Error {
  return new Error(
    `Unknown readiness "${readiness}": the four states of ADR-SC-005 are the whole set, ` +
      'and deciding what Run should do for an unknown fifth would be the client forming ' +
      'an opinion the server did not give it.',
  );
}

/**
 * Total lookup of the Run mode. Throws rather than defaulting — see the module comment.
 *
 * @param readiness the draft's declared readiness
 * @returns the mode Run starts in, or `busy`
 */
export function runModeFor(readiness: string): RunMode {
  const mode = (RUN_MODE as Record<string, RunMode>)[readiness];
  if (!mode) {
    throw unknownReadiness(readiness);
  }
  return mode;
}

/**
 * Whether the control can be pressed for this readiness: every state but `LEARNING`, where a guided
 * session is already running and the live state is shown instead (AC-2).
 *
 * @param readiness the draft's declared readiness
 * @returns whether Run can be pressed
 */
export function runAvailableFor(readiness: string): boolean {
  return runModeFor(readiness) !== 'busy';
}

/** The one state the server replays without learning, named so a reader need not scan. */
export const EXECUTABLE_READINESS: TestReadiness = 'READY';

/** The learned chip for `READY` (UX panel 2026-10-09 single-path state model). */
export const LEARNED_READY_LABEL = 'Learned · ready to repeat';

/**
 * The limits of "learned" (ADR-SC-008 L-1 and L-16), stated beside the learned chip: the proof ran
 * the saved steps once, repeating their side effects, and a step with no check can pass without the
 * outcome being right.
 */
export const LEARNED_LIMITS_CAPTION =
  'Learned means the saved steps ran once without an error in a replay. The replay repeats their side effects, and a step that checks nothing can pass even if its outcome is wrong.';
