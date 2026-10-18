import type { Launch3, Execute3, Ready3, StepStarted3, StepFinished3, Result3 } from '../executor/observedOperations.js';
/**
 * The parent↔child protocol of the observed replay family (`/v2/runs`).
 *
 * **Everything that crosses this boundary is data**, and every frame is a closed `replay-ipc`
 * schema definition validated on both sides (`validateObserved`, `validateObservedExecute`):
 * `Launch3` and `Execute3` from the parent, `Ready3`, `StepStarted3`, `StepFinished3` and
 * `Result3` from the child. No artifact source text, no `code` string, nothing a module loader
 * or a `Function` constructor could be pointed at.
 *
 * ARCH015-05: only a zero-transfer binding adds optional retainedArtifact, the closed immutable
 * artifact already committed by this process's accepted Launch3. It is an inert metadata witness;
 * exact executable projections must agree. It contains no source/code/current resolved values,
 * creates no second execution authority, and never substitutes for admission or live safety checks.
 *
 * The channel itself is `child_process` IPC — structured-clone/JSON, never a shell string. Resolved
 * secrets travel here and **only** here: never in `argv`, never in the child's environment, never
 * in a spawn command line.
 *
 * STUDIO-OBS-012A AC-3 deleted the artifact-1 protocol family (`LaunchMessage`, `ExecuteMessage`,
 * their parsers and `PROTOCOL_VERSION` 1) with the artifact-1 run route; the child selects no family
 * any more, because there is one.
 */

/** Parent → child: shut down. Sent on every close path; the launcher kills a child that ignores it. */
export interface StopMessage {
  readonly kind: 'stop';
}

/** Parent → child: the observed launch and execute frames. */
export type ObservedParentMessage = Launch3 | Execute3;

/** Everything the parent may send the child. */
export type ParentMessage = ObservedParentMessage | StopMessage;

/** Child → parent: the observed ready, step and result frames. */
export type ObservedChildMessage = Ready3 | StepStarted3 | StepFinished3 | Result3;
