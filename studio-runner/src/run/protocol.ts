/**
 * The parent↔child protocol (AC-3, AC-5).
 *
 * **Everything that crosses this boundary is data.** No artifact source text, no `code` string,
 * no serialized function, nothing a module loader or a `Function` constructor could be pointed
 * at. The child receives the validator's typed operation list — the same objects
 * `src/executor/operations.ts` describes — and the resolved values the operations reference, and
 * nothing else.
 *
 * That is enforced twice over, because a comment is not an enforcement:
 *
 * 1. {@link parseExecuteMessage} and {@link parseLaunchMessage} are **default-deny on keys**, the posture the artifact validator
 *    and the job envelope already take. An unknown key is a rejection, not an ignored extra, so a
 *    message carrying `source`, `code`, `originalText` or `artifact` is refused for the same
 *    reason a message carrying anything else nobody enumerated is.
 * 2. The named source-shaped keys get their own rejection code, so an attempt to smuggle source
 *    text across is a distinguishable event in the log rather than a generic unknown key.
 *
 * The channel itself is `child_process` IPC — structured-clone/JSON, never a shell string — so
 * the operation list never becomes text that something could be tempted to evaluate. Resolved
 * secrets travel here and **only** here: never in `argv`, never in the child's environment, never
 * in a spawn command line (AC-21).
 */

import type { Operation } from '../executor/operations.js';
import type { StepStatus } from '../executor/adapters/StepReporter.js';
import type { RunnerEvidenceState } from './recording.js';

/** Bumped when the message shapes change. A mismatch is a refusal, never a best-effort read. */
export const PROTOCOL_VERSION = 1;

/**
 * Keys that would carry generated source across the boundary.
 *
 * Listed by name so the refusal says *why*. The default-deny check would catch them anyway; this
 * exists so `test/run/prelaunch.test.ts` can assert the specific refusal AC-3 names.
 */
export const SOURCE_SHAPED_KEYS: readonly string[] = [
  'source',
  'code',
  'originalText',
  'artifact',
  'script',
  'fn',
  'body',
  'expression',
];

export const PROTOCOL_CODES = {
  notObject: 'CHILD_MESSAGE_NOT_OBJECT',
  unknownKey: 'CHILD_MESSAGE_UNKNOWN_KEY',
  sourceNotPermitted: 'CHILD_MESSAGE_SOURCE_NOT_PERMITTED',
  missingField: 'CHILD_MESSAGE_FIELD_MISSING',
  invalidField: 'CHILD_MESSAGE_FIELD_INVALID',
  versionMismatch: 'CHILD_MESSAGE_VERSION_MISMATCH',
} as const;

/** One step, as data: an index and the typed operations the validator produced for it. */
export interface ProtocolStep {
  readonly stepIndex: number;
  readonly operations: readonly Operation[];
}

/** Explicit recording geometry. §6.1 requires the evidence text to stay readable. */
export interface RecordingSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Parent → child, first: start the browser.
 *
 * It carries exactly what `LaunchOptions` carries plus the explicit recording geometry — and no
 * steps and no values, because the browser has to be up and the origin taken **before** the run
 * request is even formed. That split is what lets `BrowserLauncher.launch` keep its 10.6 shape
 * and still mean "Chromium has actually started" when it resolves (AC-1, AC-20).
 */
export interface LaunchMessage {
  readonly kind: 'launch';
  readonly protocolVersion: number;
  readonly runId: string;
  readonly browser: string;
  readonly viewport: RecordingSize;
  /** Explicitly configured, never an implicit Playwright default (AC-7). */
  readonly recording: RecordingSize;
  /** The per-run scratch directory. The only thing the browser may write to (AC-22). */
  readonly scratchPath: string;
  /** Passed through; 10.13 enforces it. This story structures the child so it can. */
  readonly totalRuntimeMs: number;
}

/** Parent → child, second: the validated operation list and the values it references. */
export interface ExecuteMessage {
  readonly kind: 'execute';
  readonly protocolVersion: number;
  /** Per-operation wall-clock bound handed to the adapter. */
  readonly stepTimeoutMs: number;
  readonly steps: readonly ProtocolStep[];
  /** Resolved values, by reference name. Never written to scratch, never in argv or env. */
  readonly variables: Readonly<Record<string, string>>;
  readonly secrets: Readonly<Record<string, string>>;
  readonly maxFailureMessageLength: number;
}

/** Parent → child: shut down. Sent on the close path; 10.13 owns killing a child that ignores it. */
export interface StopMessage {
  readonly kind: 'stop';
}

export type ParentMessage = LaunchMessage | ExecuteMessage | StopMessage;

/**
 * Child → parent: the recording context and page are ready.
 *
 * `browserStartedAt` and `startedAtMs` are the two adjacent reads of one instant (AC-11.2). The
 * parent stamps `browserStartedAt` from this message and never re-derives it.
 */
export interface ReadyMessage {
  readonly kind: 'ready';
  /** ISO-8601. The single wall-clock instant the runner holds for a run. */
  readonly browserStartedAt: string;
  /** The first reading of the run clock. `0` by construction, and a reading, not a literal. */
  readonly startedAtMs: number;
}

export interface StepStartedMessage {
  readonly kind: 'step-started';
  readonly stepIndex: number;
  readonly startedAtMs: number;
}

export interface StepFinishedMessage {
  readonly kind: 'step-finished';
  readonly stepIndex: number;
  readonly status: StepStatus;
  readonly startedAtMs: number | null;
  readonly finishedAtMs: number | null;
  readonly durationMs: number | null;
  readonly failure: string | null;
}

/** What the child observed about the recording. Evidence, never outcome (AC-8). */
export interface RecordingReport {
  /** Path inside the per-run scratch directory, or `null` when no file was produced. */
  readonly path: string | null;
  /** Size in bytes of the produced file. The epic's "explicit readable recording size". */
  readonly bytes: number | null;
  /** Redacted diagnostic when the recording could not be produced or flushed. */
  readonly error: string | null;
  /** `PENDING | FAILED | UNAVAILABLE`. Never `STORED`: storage is 10.14 (AC-9). */
  readonly state: RunnerEvidenceState;
}

/** Child → parent: the run finished, however it finished. */
export interface ResultMessage {
  readonly kind: 'result';
  readonly ok: boolean;
  readonly executorVersion: string;
  /** Set when the run failed for a reason other than a step; `null` on a clean pass or fail. */
  readonly failureKind: string | null;
  readonly failureMessage: string | null;
  readonly recording: RecordingReport;
  /**
   * Hosts the browser actually issued a request to, deduplicated and bounded (AC-19).
   *
   * The runner observing its own egress is the runner-side complement to §9.3's network
   * controls. It never reaches a contract body — it is not evidence and not an outcome — and the
   * parent uses it only to fail a test that sees a destination outside the fixture host.
   */
  readonly observedHosts: readonly string[];
}

export type ChildMessage = ReadyMessage | StepStartedMessage | StepFinishedMessage | ResultMessage;

export interface ProtocolProblem {
  readonly code: string;
  /** Key name only. A value never appears in a problem, so problems are safe to log. */
  readonly field: string;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly message: T }
  | { readonly ok: false; readonly problems: readonly ProtocolProblem[] };

const ACCEPTED_LAUNCH_KEYS: readonly string[] = [
  'kind',
  'protocolVersion',
  'runId',
  'browser',
  'viewport',
  'recording',
  'scratchPath',
  'totalRuntimeMs',
];

const ACCEPTED_EXECUTE_KEYS: readonly string[] = [
  'kind',
  'protocolVersion',
  'stepTimeoutMs',
  'steps',
  'variables',
  'secrets',
  'maxFailureMessageLength',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSize(value: unknown): value is RecordingSize {
  return (
    isRecord(value) &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    value.width > 0 &&
    value.height > 0
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

/**
 * Checks that nothing in a step carries source text.
 *
 * The operations themselves are re-checked shallowly rather than re-parsed: the validator already
 * produced them, and this boundary's job is to refuse a *shape* that could carry source, not to
 * revalidate the language. A step object with a `code` or `originalText` key is refused even
 * though the executor would have ignored it — "the executor ignores it" is exactly the reasoning
 * that lets a field survive long enough to be read by something else.
 */
function stepCarriesSource(step: Record<string, unknown>): string | null {
  for (const key of Object.keys(step)) {
    if (SOURCE_SHAPED_KEYS.includes(key)) return key;
  }
  return null;
}

/**
 * Default-deny key check shared by both parent→child messages.
 *
 * A source-shaped key gets its own code so an attempt to smuggle artifact text across is a
 * distinguishable event rather than a generic unknown key; the deny-by-default clause would have
 * caught it either way, which is the point of having both (AC-3).
 */
function checkKeys(
  value: Record<string, unknown>,
  accepted: readonly string[],
  problems: ProtocolProblem[],
): void {
  for (const key of Object.keys(value)) {
    if (SOURCE_SHAPED_KEYS.includes(key)) {
      problems.push({ code: PROTOCOL_CODES.sourceNotPermitted, field: key });
      continue;
    }
    if (!accepted.includes(key)) {
      problems.push({ code: PROTOCOL_CODES.unknownKey, field: key });
    }
  }
}

function checkEnvelope(
  value: unknown,
  kind: string,
  accepted: readonly string[],
): { problems: ProtocolProblem[]; record: Record<string, unknown> } | null {
  if (!isRecord(value)) return null;
  const problems: ProtocolProblem[] = [];
  checkKeys(value, accepted, problems);
  if (value.kind !== kind) problems.push({ code: PROTOCOL_CODES.invalidField, field: 'kind' });
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    problems.push({ code: PROTOCOL_CODES.versionMismatch, field: 'protocolVersion' });
  }
  return { problems, record: value };
}

/** Parses the parent→child launch message, default-deny on keys. */
export function parseLaunchMessage(value: unknown): ParseResult<LaunchMessage> {
  const envelope = checkEnvelope(value, 'launch', ACCEPTED_LAUNCH_KEYS);
  if (envelope === null) {
    return { ok: false, problems: [{ code: PROTOCOL_CODES.notObject, field: 'message' }] };
  }
  const { problems, record } = envelope;

  for (const field of ['runId', 'browser', 'scratchPath'] as const) {
    if (typeof record[field] !== 'string' || record[field] === '') {
      problems.push({ code: PROTOCOL_CODES.missingField, field });
    }
  }
  for (const field of ['viewport', 'recording'] as const) {
    if (!isSize(record[field])) problems.push({ code: PROTOCOL_CODES.invalidField, field });
  }
  if (!isPositiveNumber(record.totalRuntimeMs)) {
    problems.push({ code: PROTOCOL_CODES.invalidField, field: 'totalRuntimeMs' });
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, message: record as unknown as LaunchMessage };
}

/**
 * Parses the parent→child execute message, default-deny on keys.
 *
 * This is the message that carries the run, so it is the one AC-3 is about: a body carrying
 * `source`, `code`, `originalText` or `artifact` — at the top level or on any step — is refused,
 * and refused *by name*. Never a partially-read message: a boundary that accepts what it could
 * read and drops the rest is a boundary that can be talked past.
 */
export function parseExecuteMessage(value: unknown): ParseResult<ExecuteMessage> {
  const envelope = checkEnvelope(value, 'execute', ACCEPTED_EXECUTE_KEYS);
  if (envelope === null) {
    return { ok: false, problems: [{ code: PROTOCOL_CODES.notObject, field: 'message' }] };
  }
  const { problems, record } = envelope;

  for (const field of ['stepTimeoutMs', 'maxFailureMessageLength'] as const) {
    if (!isPositiveNumber(record[field])) {
      problems.push({ code: PROTOCOL_CODES.invalidField, field });
    }
  }
  for (const field of ['variables', 'secrets'] as const) {
    if (!isStringRecord(record[field])) {
      problems.push({ code: PROTOCOL_CODES.invalidField, field });
    }
  }

  const steps = record.steps;
  if (!Array.isArray(steps)) {
    problems.push({ code: PROTOCOL_CODES.invalidField, field: 'steps' });
  } else {
    for (const [index, step] of steps.entries()) {
      if (!isRecord(step)) {
        problems.push({ code: PROTOCOL_CODES.invalidField, field: `steps[${String(index)}]` });
        continue;
      }
      const offending = stepCarriesSource(step);
      if (offending !== null) {
        problems.push({
          code: PROTOCOL_CODES.sourceNotPermitted,
          field: `steps[${String(index)}].${offending}`,
        });
      }
      if (typeof step.stepIndex !== 'number' || !Array.isArray(step.operations)) {
        problems.push({ code: PROTOCOL_CODES.invalidField, field: `steps[${String(index)}]` });
      }
    }
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, message: record as unknown as ExecuteMessage };
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Reads a child→parent message. Returns `null` for anything this parent does not recognise. */
export function parseChildMessage(value: unknown): ChildMessage | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'ready':
      return typeof value.browserStartedAt === 'string' && typeof value.startedAtMs === 'number'
        ? (value as unknown as ReadyMessage)
        : null;
    case 'step-started':
      return typeof value.stepIndex === 'number' && typeof value.startedAtMs === 'number'
        ? (value as unknown as StepStartedMessage)
        : null;
    case 'step-finished':
      return typeof value.stepIndex === 'number' && typeof value.status === 'string'
        ? (value as unknown as StepFinishedMessage)
        : null;
    case 'result':
      return typeof value.ok === 'boolean' ? (value as unknown as ResultMessage) : null;
    default:
      return null;
  }
}
