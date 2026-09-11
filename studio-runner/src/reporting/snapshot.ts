/**
 * The cumulative run snapshot (AC-13, AC-16, architecture §5.3).
 *
 * **Every report is a full current-state snapshot, never a delta.** That single decision is what
 * makes progress delivery safely best-effort: if two `PROGRESS` posts are lost, the third carries
 * everything that happened, and nothing has to be replayed to recover the gap. A delta protocol
 * would make a dropped delivery permanently unrecoverable without a runner-side outbox — which
 * would be durable state, which the runner does not have.
 *
 * `runnerSequence` is **assigned synchronously when a report is built**, not when it is sent. The
 * deliveries race each other by design (reporting is asynchronous to execution, AC-15), so the
 * sequence has to be fixed at build time or the API would see it out of order. It is strictly
 * increasing within an attempt, starts fresh for a new attempt — the runner holds no cross-run
 * state, so it is a per-run counter — and is never reused or decremented, including on a retry.
 */
import type { StepStatus } from '../executor/adapters/StepReporter.js';
import type { LogBuffer, LogEntry, ReportBounds } from './bounds.js';
import { boundSteps, createLogBuffer } from './bounds.js';

export type ReportKind = 'STARTED' | 'PROGRESS' | 'FINAL';

/** `RUNNING` exists only in a snapshot; the executor never produces it as a final status. */
export type SnapshotStepStatus = StepStatus | 'RUNNING';

export interface SnapshotStep {
  readonly stepIndex: number;
  readonly status: SnapshotStepStatus;
  readonly startedAtMs: number | null;
  readonly finishedAtMs: number | null;
  readonly durationMs: number | null;
  readonly failure: string | null;
}

export interface RunOutcome {
  readonly result: 'PASSED' | 'FAILED' | 'ERROR';
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

export interface EvidenceState {
  readonly videoKey: string | null;
  readonly manifestKey: string | null;
  readonly state: 'PENDING' | 'STORED' | 'FAILED' | 'UNAVAILABLE';
  /**
   * Whether the recording covers only part of the browser session it was recording.
   *
   * **Required here even though the contract makes it optional** (ADR-002 §17.5, §17.7 item 2).
   * The field is optional on the wire so the merged runner stayed conformant while it had no
   * producer; this runner *is* the producer, so "absent" must be unreachable from it. A
   * non-optional property is emitted by `JSON.stringify` on every `FINAL`, `false` included, which
   * is what the assertion on the serialized body checks.
   *
   * Never derived from `outcome`, in either direction, by either component (§17.4). It is computed
   * by `partialFor` from how the **recorder** ended — see `src/run/recording.ts`.
   */
  readonly partial: boolean;
}

export interface ReportIdentity {
  readonly executionId: string;
  readonly attemptId: string;
  readonly admissionId: string;
  readonly runnerInstanceId: string;
}

/** Exactly what goes on the wire (architecture §8.4 "Reports include ..."). */
export interface ReportBody extends ReportIdentity {
  readonly kind: ReportKind;
  readonly runnerSequence: number;
  /** Describes the **run**, not the delivery. Fixed when the report is built (AC-17). */
  readonly reportedAt: string;
  readonly browserStartedAt: string | null;
  readonly steps: readonly SnapshotStep[];
  readonly logs: readonly LogEntry[];
  readonly logsTruncated: boolean;
  readonly runtimeVersions: Readonly<Record<string, unknown>>;
  readonly outcome: RunOutcome | null;
  readonly evidence: EvidenceState | null;
  /** Set when bounding had to reduce the payload below `maxBodyBytes` (AC-19). */
  readonly payloadReduced?: true;
}

export interface SnapshotOptions {
  readonly identity: ReportIdentity;
  readonly bounds: ReportBounds;
  readonly runtimeVersions: Readonly<Record<string, unknown>>;
  /** Wall-clock source for the timestamps that describe the run. */
  readonly wallClock: () => Date;
  /**
   * The run's redactor, applied to every log message **before** the bounded buffer truncates it
   * (AC-22, MED-3).
   *
   * This is the call-site guard `createLogBuffer.append` lacks. That buffer truncates
   * `entry.message` with `slice(0, maxEntryLength - 1)` and the report client redacts the assembled
   * body afterwards, so the order is truncate-then-redact — which is the order that lets a known
   * value be cut in half and both halves through. It is **not** live today: both producers of that
   * field resolve to a single site that redacts first. But the risk was never today's callers, it
   * was the third one, and a property that holds only because nobody has written the wrong producer
   * yet is not a property.
   *
   * `bounds.ts` is deliberately **not** restructured. Reordering truncation and redaction inside
   * the buffer would put a redaction responsibility in a module whose job is bounding, and this
   * codebase has paid three times for two copies of one fact. The redaction stays at the boundary;
   * this is the boundary, and it is the only caller of `logs.append`.
   *
   * Required rather than optional: a default would be a fail-open, which is the shape of the
   * defect, not its fix.
   */
  readonly redactor: { redact(text: string): string };
}

export interface RunSnapshot {
  /**
   * Records the browser start (AC-10, AC-11.2).
   *
   * Takes the instant rather than reading a clock, because the instant is **observed where the
   * browser is** — at recording-context readiness, adjacently to the run clock's zero — and a
   * second read here would be a second origin. Until this is called the run has no
   * `browserStartedAt`, and a report without one carries no reading at all.
   */
  markBrowserStarted(at: Date): void;
  readonly browserStarted: boolean;
  stepStarted(stepIndex: number, startedAtMs: number): void;
  stepFinished(step: SnapshotStep): void;
  appendLog(entry: LogEntry): void;
  /** Builds a report and consumes the next sequence number. Synchronous by contract. */
  build(kind: ReportKind, outcome?: RunOutcome | null, evidence?: EvidenceState | null): ReportBody;
  readonly lastSequence: number;
  readonly logs: LogBuffer;
}

export function createRunSnapshot(options: SnapshotOptions): RunSnapshot {
  const { identity, bounds, runtimeVersions, wallClock, redactor } = options;
  const logs = createLogBuffer(bounds.maxLogEntries, bounds.maxLogEntryLength);
  const steps = new Map<number, SnapshotStep>();
  let sequence = 0;
  let browserStartedAt: string | null = null;

  const snapshot: RunSnapshot = {
    logs,
    get browserStarted(): boolean {
      return browserStartedAt !== null;
    },
    get lastSequence(): number {
      return sequence;
    },
    markBrowserStarted(at: Date): void {
      browserStartedAt ??= at.toISOString();
    },
    stepStarted(stepIndex: number, startedAtMs: number): void {
      steps.set(stepIndex, {
        stepIndex,
        status: 'RUNNING',
        startedAtMs,
        finishedAtMs: null,
        durationMs: null,
        failure: null,
      });
    },
    stepFinished(step: SnapshotStep): void {
      steps.set(step.stepIndex, step);
    },
    appendLog(entry: LogEntry): void {
      // Redact, then let the buffer bound. Every producer reachable from a run passes through
      // here, so a producer added later cannot skip it (AC-22).
      logs.append({ ...entry, message: redactor.redact(entry.message) });
    },
    build(
      kind: ReportKind,
      outcome: RunOutcome | null = null,
      evidence: EvidenceState | null = null,
    ): ReportBody {
      sequence += 1;
      const ordered = [...steps.values()].sort((a, b) => a.stepIndex - b.stepIndex);
      // ADR-002 §11.2, restated as AC-11.4: **a report with `browserStartedAt: null` carries no
      // reading.** The runner enforces it here, as the producer, rather than trusting every call
      // site to have nothing to report — a reading taken before the origin existed would be on a
      // scale the wire has no way to name, and `minimum: 0` cannot tell a process-origin reading
      // from a legitimate late one (ADR-002 §11.6 item 3).
      const started = browserStartedAt !== null;
      return {
        ...identity,
        kind,
        runnerSequence: sequence,
        reportedAt: wallClock().toISOString(),
        browserStartedAt,
        steps: started ? boundSteps(ordered, bounds.maxSteps) : [],
        logs: started ? logs.entries() : logs.entries().map(withoutReading),
        logsTruncated: logs.truncated,
        runtimeVersions,
        outcome,
        evidence,
      };
    },
  };

  return snapshot;
}

/**
 * Serializes a report and, if the result exceeds the body bound, re-serializes a reduced form.
 *
 * The reduced form drops the logs first and the steps second: a terminal outcome the API can act
 * on is worth more than the diagnostics attached to it, and a report the API rejects for size is
 * a lost result the runner cannot replay.
 *
 * There is an **irreducible floor**: the identity fields, the runtime versions, the outcome and
 * the evidence state are the report. If `maxBodyBytes` is configured below that floor the minimal
 * form is emitted anyway, because a truncated identity is worse than a slightly oversized body —
 * the API could not attribute it to an attempt at all. Configure the bound above the floor; the
 * default (512 KiB) is three orders of magnitude above it.
 */
/** Strips a reading from a log entry, for the `browserStartedAt: null` invariant (AC-11.4). */
function withoutReading(entry: LogEntry): LogEntry {
  return entry.atMs === null ? entry : { ...entry, atMs: null };
}

export function serializeBounded(body: ReportBody, bounds: ReportBounds): string {
  const full = JSON.stringify(body);
  if (Buffer.byteLength(full, 'utf8') <= bounds.maxBodyBytes) return full;

  const withoutLogs: ReportBody = { ...body, logs: [], logsTruncated: true, payloadReduced: true };
  const trimmed = JSON.stringify(withoutLogs);
  if (Buffer.byteLength(trimmed, 'utf8') <= bounds.maxBodyBytes) return trimmed;

  const minimal: ReportBody = { ...withoutLogs, steps: [] };
  return JSON.stringify(minimal);
}
