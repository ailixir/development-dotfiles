import type { CompileStatus } from '@/types/studio/studioTypes';

/**
 * What pressing Run does next, and nothing else decides it (story 10.11a, AC-1, AC-2).
 *
 * Architecture §4.6 puts readiness on the server and story 10.8's AC-26 makes the server-side gate
 * unconditional, so the client's job is to agree with the server rather than to form a second
 * opinion. Before story 10.11a the page refused to run unless its own English-grammar validator
 * was happy, which is the path architecture §8.3 retires by name — *"Remove client grammar
 * validation and Python generation as authoritative paths"*.
 *
 * Run used to be available in exactly one state, because saving a draft compiled it in the
 * background and the author waited. Saving no longer compiles: the author presses Run, and Run
 * prepares the saved revision and then executes it. So a draft that has no fresh artifact is not a
 * blocked draft any more — it is a draft whose first Run step is a compile. That is the whole
 * change here, and it is why this module answers *what to do* rather than *whether to allow*.
 *
 * **The mapping is total and has no fallback.** Every `compileStatus` the document declares gets an
 * explicit entry; {@link runActionFor} throws on anything else. A `??` or a `default:` here would
 * make a value the server starts sending render as one of the five — permissively, if the default
 * were `execute`, which is how an ungated Run ships. A sixth value must be loud.
 *
 * `studioContract.test.ts` reads the five states from
 * `components.schemas.TestDto.properties.compileStatus.enum` and asserts this record covers them
 * exactly, in both directions, through the binding story 10.10 installed.
 */
export type RunAction =
  /** The confirmed revision matches the saved draft: dispatch it. */
  | 'execute'
  /** No fresh artifact for the saved draft: compile it, then execute. */
  | 'compile'
  /** A compile is already running, here or in another tab: wait for it to settle. */
  | 'wait';

export const RUN_ACTION: Readonly<Record<CompileStatus, RunAction>> = {
  STALE: 'compile',
  COMPILING: 'wait',
  AWAITING_CONFIRMATION: 'compile',
  READY: 'execute',
  NEEDS_REVISION: 'compile',
};

/**
 * Total lookup. Throws rather than defaulting — see the module comment.
 *
 * AC-1's first falsification adds a sixth member to an in-test copy of the document and asserts
 * the enumeration goes red; this throw is what makes that happen instead of a sixth state
 * rendering as a quietly disabled — or quietly enabled — control.
 *
 * @param status the draft's declared compile status
 * @returns what Run does next
 */
export function runActionFor(status: string): RunAction {
  const action = (RUN_ACTION as Record<string, RunAction>)[status];
  if (!action) {
    throw new Error(
      `Unknown compileStatus "${status}": the five states of architecture §4.2 are the whole set, ` +
        'and deciding what Run should do for an unknown sixth would be the client forming ' +
        'an opinion the server did not give it.',
    );
  }
  return action;
}

/**
 * Whether the control is available at all.
 *
 * Only `wait` disables it: a compile is in flight and a second one would be refused anyway.
 *
 * @param status the draft's declared compile status
 * @returns whether Run can be pressed
 */
export function runAvailableFor(status: string): boolean {
  return runActionFor(status) !== 'wait';
}

/** The one state the server will dispatch without preparation, named so a reader need not scan. */
export const EXECUTABLE_COMPILE_STATUS: CompileStatus = 'READY';

/** The one state in which Run must wait rather than act. */
export const WAITING_COMPILE_STATUS: CompileStatus = 'COMPILING';
