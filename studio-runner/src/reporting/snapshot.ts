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
  const { identity, bounds, runtimeVersions, wallClock } = options;
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
      logs.append(entry);
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
