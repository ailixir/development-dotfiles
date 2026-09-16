import type { CompileStatus } from '@/types/studio/studioTypes';

/**
 * When Run is available, and nothing else decides it (story 10.11a, AC-1, AC-2).
 *
 * Epic §10.11: *"Disable Run until READY"*. Architecture §4.6 puts readiness on the server and
 * story 10.8's AC-26 makes the server-side gate unconditional, so the client's job is to agree
 * with the server rather than to form a second opinion. Before this story the page refused to run
 * unless its own English-grammar validator was happy (`validation.isValid`), which is the path
 * architecture §8.3 retires by name — *"Remove client grammar validation and Python generation as
 * authoritative paths"* — and which nothing anywhere read `compileStatus` to replace. A draft the
 * server would refuse with `409 COMPILE_REQUIRED` had an enabled Run button; a confirmed `READY`
 * draft whose English the client disliked had a disabled one.
 *
 * **The mapping is total and has no fallback.** Every `compileStatus` the document declares gets
 * an explicit entry; {@link runEnablementFor} throws on anything else. A `??` or a `default:` here
 * would make a value the server starts sending render as one of the five — permissively, if the
 * default were `true`, which is how an ungated Run ships. A sixth value must be loud.
 *
 * `studioContract.test.ts` reads the five states from
 * `components.schemas.TestDto.properties.compileStatus.enum` and asserts this record covers them
 * exactly, in both directions, through the binding story 10.10 installed.
 */
export interface RunEnablement {
  /** Whether the Run control is available. True in exactly one state. */
  readonly canRun: boolean;
  /**
   * Why Run is unavailable, for the reader. Null when it is available.
   *
   * Deliberately **not** re-worded here: story 10.10 already words all five states, and a second
   * copy of the same five sentences is the arrangement ADR-002 §18.3 exists to prevent. The Run
   * surface reads 10.10's `whatIsBlocked` instead, so the two surfaces cannot drift.
   */
  readonly blockedBecause: 'notReady' | null;
}

const RUNNABLE: RunEnablement = { canRun: true, blockedBecause: null };
const NOT_RUNNABLE: RunEnablement = { canRun: false, blockedBecause: 'notReady' };

export const RUN_ENABLEMENT: Readonly<Record<CompileStatus, RunEnablement>> = {
  STALE: NOT_RUNNABLE,
  COMPILING: NOT_RUNNABLE,
  AWAITING_CONFIRMATION: NOT_RUNNABLE,
  READY: RUNNABLE,
  NEEDS_REVISION: NOT_RUNNABLE,
};

/**
 * Total lookup. Throws rather than defaulting — see the module comment.
 *
 * AC-1's first falsification adds a sixth member to an in-test copy of the document and asserts
 * the enumeration goes red; this throw is what makes that happen instead of a sixth state
 * rendering as a quietly disabled — or quietly enabled — control.
 */
export function runEnablementFor(status: string): RunEnablement {
  const enablement = (RUN_ENABLEMENT as Record<string, RunEnablement>)[status];
  if (!enablement) {
    throw new Error(
      `Unknown compileStatus "${status}": the five states of architecture §4.2 are the whole set, ` +
        'and deciding whether Run is available for an unknown sixth would be the client forming ' +
        'an opinion the server did not give it.',
    );
  }
  return enablement;
}

/** The one state in which Run is available, named so a reader need not scan the record. */
export const RUNNABLE_COMPILE_STATUS: CompileStatus = 'READY';
