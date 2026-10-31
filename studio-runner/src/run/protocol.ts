import type { Launch3, Execute3, Ready3, StepStarted3, StepFinished3, Result3 } from '../executor/observedOperations.js';
/**
 * The parent↔child protocol of the observed replay family (`/v2/runs`).
 *
 * **Everything that crosses this boundary is data**, and every frame is a closed `replay-ipc`
 * schema definition validated on both sides (`validateObserved`, `validateObservedExecute`):
 * `Launch3` and `Execute3` from the parent, `Ready3`, `StepStarted3`, `StepFinished3` and
 * `Result3` from the child. Execute3 carries the frozen step code as data (ADR-SC-008); the only
 * thing that turns it into a function is `run/stepCode.ts`, in the child.
 *
 * ARCH015-05: only a zero-transfer binding adds optional retainedArtifact, the closed immutable
 * artifact already committed by this process's accepted Launch3. It is an inert metadata witness;
 * exact executable projections must agree. It contains no current resolved values, creates no
 * second execution authority, and never substitutes for admission or live safety checks.
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

/**
 * Whether a step-finished frame agrees with itself and with the step the parent sent: a PASS carries no closed code, a FAIL carries one,
 * a SKIPPED step ran nothing, and the receipt names the code of the step it was told to run (`expectedStepHash`).
 */
export function stepReceiptAgrees(message: Pick<StepFinished3, 'status' | 'receipt'>, expectedStepHash: string): boolean {
  const { receipt } = message;
  if (receipt.stepHash !== expectedStepHash) return false;
  if (message.status === 'PASS') return receipt.closedCode === null;
  if (message.status === 'FAIL') return receipt.closedCode !== null;
  return receipt.closedCode === null && !receipt.fenceCrossed && receipt.effects.length === 0 && !receipt.offscreen;
}
