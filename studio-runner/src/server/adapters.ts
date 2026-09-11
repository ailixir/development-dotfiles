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
}

/** Everything the session needs to run the job, as data. No source text, ever (AC-3). */
export interface SessionRunRequest {
  readonly steps: readonly ExecutableStep[];
  readonly variables: Readonly<Record<string, string>>;
  readonly secrets: Readonly<Record<string, string>>;
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

export interface LaunchOptions {
  readonly browser: string;
  readonly viewport: { readonly width: number; readonly height: number };
  /** Total browser runtime cap; 10.13 enforces it, this story only passes it on. */
  readonly totalRuntimeMs: number;
  /** Directory the session may write to. Cleared when the run ends. */
  readonly scratchPath: string;
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
