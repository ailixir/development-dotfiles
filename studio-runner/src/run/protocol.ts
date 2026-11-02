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

/**
 * One recorded-page `console.error`, `console.warn` or uncaught page error, already prefixed (`console.warn: …`, `page error: …`) and not yet
 * redacted. No other console type is captured (user decision 2026-11-01, narrow exception to I-B5/C-6).
 */
export interface ConsoleLogEntry {
  readonly level: 'warn' | 'error';
  readonly message: string;
  /** The step running when it was emitted; `null` before the first step. */
  readonly stepIndex: number | null;
  /** Run-timeline milliseconds from the child's clock. */
  readonly atMs: number | null;
}

/**
 * Child → parent: console entries the page produced. Hand-checked by `validConsoleEntries`, not a `replay-ipc` definition: the log
 * is a report field, not an authority, so a bad frame is dropped and never fails the run.
 */
export interface ConsoleMessage {
  readonly kind: 'console';
  readonly protocolVersion: 3;
  readonly mode: 'observed';
  readonly runId: string;
  readonly attemptId: string;
  readonly entries: readonly ConsoleLogEntry[];
}

/** Child → parent: the observed ready, step, console and result frames. */
export type ObservedChildMessage = Ready3 | StepStarted3 | StepFinished3 | ConsoleMessage | Result3;

/** At most this many console entries are kept per run, on both sides of the process boundary. */
export const CONSOLE_ENTRY_CAP = 100;
/** Longest console message the parent accepts; the report's own cap (`maxLogEntryLength`) applies after redaction. */
export const CONSOLE_MESSAGE_MAX_LENGTH = 4096;

/**
 * Maps a Playwright console message type (or `pageerror` for an uncaught exception) to its log level and prefixed message, or `null` for
 * every type that is not captured: only `error`, `warning` and `pageerror` are.
 */
export function consoleLogFor(type: string, text: string): Pick<ConsoleLogEntry, 'level' | 'message'> | null {
  if (type === 'pageerror') return { level: 'error', message: `page error: ${text}` };
  if (type === 'error') return { level: 'error', message: `console.error: ${text}` };
  if (type === 'warning') return { level: 'warn', message: `console.warn: ${text}` };
  return null;
}

const CONSOLE_FRAME_KEYS = ['attemptId', 'entries', 'kind', 'mode', 'protocolVersion', 'runId'];
const CONSOLE_ENTRY_KEYS = ['atMs', 'level', 'message', 'stepIndex'];
const sameKeys = (value: object, expected: readonly string[]): boolean => {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};

/**
 * The entries of a well-formed console frame for this run, or `null` for anything else: exact keys, closed levels, bounded message, step
 * index in `0..stepCount-1` or `null`, finite `atMs` or `null`, at most {@link CONSOLE_ENTRY_CAP} entries.
 */
export function validConsoleEntries(raw: unknown, runId: string, attemptId: string, stepCount: number): readonly ConsoleLogEntry[] | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || !sameKeys(raw, CONSOLE_FRAME_KEYS)) return null;
  const frame = raw as Record<string, unknown>;
  if (frame.kind !== 'console' || frame.protocolVersion !== 3 || frame.mode !== 'observed' || frame.runId !== runId || frame.attemptId !== attemptId) return null;
  const entries = frame.entries;
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > CONSOLE_ENTRY_CAP) return null;
  for (const entry of entries as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry) || !sameKeys(entry, CONSOLE_ENTRY_KEYS)) return null;
    const { level, message, stepIndex, atMs } = entry as Record<string, unknown>;
    if (level !== 'warn' && level !== 'error') return null;
    if (typeof message !== 'string' || message.length > CONSOLE_MESSAGE_MAX_LENGTH) return null;
    if (stepIndex !== null && !(Number.isInteger(stepIndex) && (stepIndex as number) >= 0 && (stepIndex as number) < stepCount)) return null;
    if (atMs !== null && !(typeof atMs === 'number' && Number.isFinite(atMs))) return null;
  }
  return entries as readonly ConsoleLogEntry[];
}

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
