import type { AdmissionReceipt, ObservedJob } from '../executor/observedOperations.js';
/**
 * The two seams `POST /v2/runs` needs beyond the run package (AC-6, AC-12, AC-21).
 *
 * Both are deliberately tiny and both are faked in this story. The real `BrowserLauncher` is
 * story 10.12's (child process, native video, deadline killing); the real object-store client is
 * story 10.14's. Keeping them behind interfaces is what lets AC-6 be asserted at all: "no browser
 * and no scratch directory exists before the CAS returns success" is only checkable if launching
 * and scratch creation are observable calls rather than inline statements.
 *
 * `ScratchStore` is the only durable thing the runner touches, and it is per-run, ephemeral and
 * cleared on every exit path. It is **not** a store for job values: resolved variables and
 * secrets are never written here (AC-21, architecture §9.2).
 */
import type { StepReporter } from '../executor/stepReporter.js';
import type { ConsoleLogEntry } from '../run/protocol.js';

/**
 * The two adjacent reads of one instant: the run clock's zero and `browserStartedAt` (AC-11.2).
 *
 * Observed **once**, at recording-context readiness, by the child process that holds the browser.
 * Never re-derived, never taken at launch-call time, never taken at admission (ADR-002 §11.6). The
 * child sends the readings already on its own scale and the parent passes them through without
 * re-basing (ADR-002 §11.5).
 */
export interface SessionOrigin {
  /** The single wall-clock instant the runner holds for a run. Goes on the wire verbatim. */
  readonly browserStartedAt: Date;
  /** The first reading of the run clock: `0`, and a reading rather than a literal (AC-10). */
  readonly startedAtMs: number;
  /**
   * The seek-origin calibration the child reported applying (story 10.32 AC-4).
   *
   * Only a child-owned session carries it. Nothing on the reporting path reads it and it never
   * reaches the API (ADR-002 §26.3 item 2). It exists so the fixtures tier can assert the value a
   * real run used.
   */
  readonly calibrationOffsetMs?: number | undefined;
}

/**
 * What the coordinator hands a started session.
 *
 * Only the reporter: the observed job — steps, guards, inputs and the resolved secrets — was bound
 * into the session at launch (`LaunchOptions.observed`) and crosses to the child as the closed
 * `Execute3` frame, never as source text (AC-3).
 */
export interface SessionRunRequest {
  /** 10.6's `RunReporter`, reached unchanged from the other side of the process boundary (AC-16). */
  readonly reporter: StepReporter;
  /** Page console entries from the child, unredacted. Optional: a session without a browser console has none to give. */
  readonly onConsole?: (entry: ConsoleLogEntry) => void;
}

/** What the session observed about the recording. Evidence, never outcome (AC-8). */
import type {VerifiedVideoFile} from '../run/appVideoOwnership.js';
export interface SessionRecording {
  /** Private pinned file opener, never serialized into reports/manifests or public contracts. */
  readonly verifiedFile?:VerifiedVideoFile;
  readonly path: string | null;
  readonly bytes: number | null;
  readonly error: string | null;
  /**
   * The runner's evidence vocabulary: `PENDING | FAILED | UNAVAILABLE`.
   *
   * `STORED` is absent because storage is story 10.14; `PENDING` is the honest state for a
   * playable recording nobody has uploaded yet (AC-9).
   */
  readonly state: 'PENDING' | 'FAILED' | 'UNAVAILABLE';
  /**
   * Whether the recording covers only part of the browser session (ADR-002 §17).
   *
   * A fact about the **recording**, never about the run, and never derived from `outcome` in
   * either direction: a deadline kill whose ordered stop flushed cleanly is `false`, and a
   * recorder that died on a passing run is `true`. Emitted on every `FINAL`, `false` included.
   */
  readonly partial: boolean;
}

/**
 * Why the parent decided to end a run it had already started.
 *
 * Two conditions, two answers, and they must not be collapsed. `total-runtime` is the
 * parent-enforced deadline, which §8.2 fixes by hand as `ERROR`/`TIMEOUT`. `drain` is the pod
 * leaving while a run is still hung: §9.3 requires admitted work to be drained on `SIGTERM`, and
 * §5.4 requires that a runner never exit holding a browser — but the run did not exceed its
 * budget, so calling it a timeout would be a false statement about the test. It takes the
 * documented residual, `RUN_ERROR`. `cancel` is a principal's `DELETE /v2/runs/{id}` (Studio v1
 * WP4): the same stop, and a third answer, `CANCELLED` — neither a timeout nor a runner fault.
 */
export type SessionKillReason = 'total-runtime' | 'drain' | 'cancel';

/** What the parent observed while stopping a run it had decided to end (AC-5a, AC-16). */
export interface SessionKillOutcome {
  /**
   * Whether the ordered stop completed within `browserStopTimeoutMs`.
   *
   * Recorded **before** the signal. ADR-002 §17.7 makes this the distinguishing fact for
   * `partial`, and it stops being observable the instant the process tree does.
   */
  readonly orderedStopCompleted: boolean;
}

export interface SessionRunResult {
  readonly secretUse?: Readonly<Record<string, 'USED' | 'NOT_USED' | 'REFUSED'>>;
  readonly detail?: { readonly stepId: string; readonly loginStepsPresent: boolean };
  readonly ok: boolean;
  /**
   * A `RunFailureKind` from `src/run/errors.ts`, or `null` for a clean pass or step failure that
   * `ok` already describes. Carried as a string so this seam stays free of the run package.
   */
  readonly failureKind: string | null;
  readonly failureMessage: string | null;
  readonly recording: SessionRecording;
  /** Hosts the browser actually reached, deduplicated and bounded (AC-19). */
  readonly observedHosts: readonly string[];
}

/**
 * The half of a session that executes the job (AC-5, AC-10).
 *
 * The session executes in its own process, where the origin is observable, and hands back the
 * readings. (The artifact-1 in-process path, which drove `executeSteps` against a parent-side
 * adapter, was deleted by STUDIO-OBS-012A AC-3.)
 */
export interface SessionRun {
  readonly origin: SessionOrigin;
  execute(request: SessionRunRequest): Promise<SessionRunResult>;
  /**
   * Ends the run now: the ordered stop within the bounded grace, then the process **group**.
   *
   * Called by the runtime deadline and by the drain. `execute`'s promise settles shortly
   * afterwards, because the child exits — with a result if it honoured the stop, without one if it
   * was signalled. The returned observation is the parent's, and it is taken before the signal.
   */
  kill(reason: SessionKillReason): Promise<SessionKillOutcome>;
}

export interface BrowserSession {
  close(): Promise<void>;
  /** The run inside the child process (10.12); every observed session has one. */
  readonly run: SessionRun;
}

/**
 * Where the child's captured stdout and stderr go, and what scrubs them (AC-8).
 *
 * Per **run**, not per launcher: the redactor is built from this job's resolved values, and the
 * launcher outlives any one of them. The observed launcher drains and discards the child's raw
 * streams without ever writing them here, so an unread pipe can never block the browser and no
 * child-formatted text reaches the pod log.
 */
export interface ChildDiagnosticsSink {
  /** The run's redactor. Applied before the line is bounded, never after. */
  redact(text: string): string;
  write(stream: 'stdout' | 'stderr', line: string): void;
}

export interface LaunchOptions {
  readonly signal?: AbortSignal;
  /** The admitted observed job this launch is for; the only family a session may start. */
  readonly observed: { readonly job: ObservedJob; readonly admission: AdmissionReceipt };
  readonly browser: string;
  readonly viewport: { readonly width: number; readonly height: number };
  /**
   * Total browser runtime cap, **already clamped** to the server maximum (AC-6).
   *
   * The parent enforces it: `src/server/runCoordinator.ts` arms the timer on its own monotonic
   * clock at the `ready` handshake, and `SessionRun.kill` is what fires.
   */
  readonly totalRuntimeMs: number;
  /**
   * Per-step timeout for this job, already clamped to the server maximum (AC-6).
   *
   * The observed job's `runtime.stepTimeoutMs` is refused at admission when it exceeds the server
   * maximum; this is where §5.2's "configurable within server limits" reaches the child.
   */
  readonly stepTimeoutMs?: number | undefined;
  /** Directory the session may write to. Cleared when the run ends. */
  readonly scratchPath: string;
  readonly diagnostics?: ChildDiagnosticsSink | undefined;
}

export interface BrowserLauncher {
  /**
   * Starts a browser. `STARTED` is reported only once this resolves — not when admission
   * succeeds and not when this call begins (AC-14a).
   */
  launch(options: LaunchOptions): Promise<BrowserSession>;
}

export interface RunScratch {
  readonly path: string;
  /** Idempotent: safe to call on an error path where nothing was created. */
  clear(): Promise<void>;
}

export interface ScratchStore {
  /** Creates the per-run directory. Never called before admission succeeds (AC-6). */
  create(runId: string): Promise<RunScratch>;
  /** Clears every run directory. Called at startup and on the drain path (AC-12). */
  clearAll(): Promise<void>;
  /** Names currently present, so a test can assert the directory is empty (AC-21). */
  list(): Promise<readonly string[]>;
}
