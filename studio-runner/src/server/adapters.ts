/**
 * The two seams `POST /v1/runs` needs beyond the ones 10.2 already provides (AC-6, AC-12, AC-21).
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
import type { BrowserAdapter } from '../executor/adapters/BrowserAdapter.js';
import type { Clock, StepReporter } from '../executor/adapters/StepReporter.js';
import type { ExecutableStep } from '../executor/executor.js';

/**
 * The two adjacent reads of one instant: the run clock's zero and `browserStartedAt` (AC-11.2).
 *
 * Observed **once**, at recording-context readiness, by whichever process holds the browser — the
 * child for a real session, the coordinator itself for an in-process one. Never re-derived, never
 * taken at launch-call time, never taken at admission (ADR-002 §11.6).
 */
export interface SessionOrigin {
  /** The single wall-clock instant the runner holds for a run. Goes on the wire verbatim. */
  readonly browserStartedAt: Date;
  /** The first reading of the run clock: `0`, and a reading rather than a literal (AC-10). */
  readonly startedAtMs: number;
  /**
   * The run-scoped monotonic clock, zeroed at the origin.
   *
   * `null` when the readings are produced in another process — the child sends them already on
   * its own scale and the parent passes them through without re-basing (ADR-002 §11.5).
   */
  readonly clock: Clock | null;
  /**
   * The seek-origin calibration the child reported applying (story 10.32 AC-4).
   *
   * Only a child-owned session carries it. Nothing on the reporting path reads it and it never
   * reaches the API (ADR-002 §26.3 item 2). It exists so the fixtures tier can assert the value a
   * real run used.
   */
  readonly calibrationOffsetMs?: number | undefined;
}

/** Everything the session needs to run the job, as data. No source text, ever (AC-3). */
export interface SessionRunRequest {
  readonly steps: readonly ExecutableStep[];
  readonly variables: Readonly<Record<string, string>>;
  readonly secrets: Readonly<Record<string, string>>;
  /**
   * The origins each secret may be filled on, by secret id. Non-secret. Absent or missing an id
   * means that secret is bound to no origin and the adapter refuses to fill it.
   */
  readonly secretOrigins?: Readonly<Record<string, readonly string[]>> | undefined;
  /** 10.6's `RunReporter`, reached unchanged from inside or outside the process (AC-16). */
  readonly reporter: StepReporter;
  readonly maxFailureMessageLength?: number | undefined;
}

/** What the session observed about the recording. Evidence, never outcome (AC-8). */
export interface SessionRecording {
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
 * documented residual, `RUN_ERROR`. `cancel` is a principal's `DELETE /v1/runs/{id}` (Studio v1
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
 * Optional on {@link BrowserSession} so 10.6's in-process fakes keep the shape they have: they
 * expose `adapter`, and the coordinator drives `executeSteps` against it with a run clock it takes
 * itself at the moment the fake launch resolves. A real session executes in its own process, where
 * the origin is observable, and hands back the readings.
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
  readonly adapter: BrowserAdapter;
  close(): Promise<void>;
  /**
   * Present when the session runs the job inside its own process (the real child, 10.12).
   *
   * Additive and optional: every existing implementor and consumer of `BrowserSession` — the fake
   * launcher, `runCoordinator`, the 10.6 suite — compiles and behaves exactly as before, which is
   * what AC-1's "keep their current shapes" protects.
   */
  readonly run?: SessionRun | undefined;
}

/**
 * Where the child's captured stdout and stderr go, and what scrubs them (AC-8).
 *
 * Per **run**, not per launcher: the redactor is built from this job's resolved values, and the
 * launcher outlives any one of them. Optional, because 10.6's in-process fake sessions have no
 * child and no output; when it is absent the child's streams are drained and discarded rather than
 * inherited, so an unread pipe can never block the browser.
 */
export interface ChildDiagnosticsSink {
  /** The run's redactor. Applied before the line is bounded, never after. */
  redact(text: string): string;
  write(stream: 'stdout' | 'stderr', line: string): void;
}

export interface LaunchOptions {
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
   * `job.configuration.timeoutSeconds` was validated by the envelope and then ignored by the run;
   * this is where §5.2's "configurable within server limits" starts being both.
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
