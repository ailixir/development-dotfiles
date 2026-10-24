import type { ExecutionEvidence } from '../guided/types.js';
import type { BrowserHandle } from './browserFactory.js';
import type { ObservationSession } from './observationTypes.js';
import type {BrowserPreferenceEvidence} from './scratchLayout.js';

/**
 * The recorded-context request for one guided session (STUDIO-OBS-013 AC-1, AR-1 R3/R4).
 *
 * `dir` is the session evidence directory: never inside the Chromium profile and never removed by
 * the browser's own scratch disposal, so the finalized webm survives `close()` until the upload
 * attempt has finished. `size` comes from the runner's `RECORDING_WIDTH/HEIGHT`, the source replay
 * uses. `ready` is called exactly once, at recording-context readiness (after the startup probe
 * recording is deleted and the fresh app page exists, replay semantics, AR-QA SEC-001): that
 * instant is the ADR-002 §11.6 run origin. `recording` tells the caller whether the page actually
 * carries a recorder; `false` is a recorder fault, never a silent success.
 */
export interface GuidedRecordingRequest {
  readonly dir: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly ready: (recording: boolean) => void;
}

/**
 * The whole guided start is bounded by one budget (STUDIO-OBS-015 REL-001/D4, architect ruling
 * `aria-d4-launch-deadline-ruling01`). The backend gives up on a runner call after 15 s
 * (`HttpRunnerDispatchClient.transportDeadline`, hard-coded; `delayed-state-design.md:108`: "a 15-second
 * HTTP ceiling"). The runner keeps a 3 s reserve inside it for teardown, the lifecycle callback and
 * the reply, so a start that cannot finish is refused with a closed `CONTEXT_LOST` while the backend
 * is still listening, instead of holding the single worker slot for Playwright's 180 s launch
 * timeout or forever. A constant, not a knob: a configurable value could drift above the backend's.
 */
export const GUIDED_START_TRANSPORT_CEILING_MS = 15_000;
export const GUIDED_START_RESERVE_MS = 3_000;
export const GUIDED_START_BUDGET_MS = GUIDED_START_TRANSPORT_CEILING_MS - GUIDED_START_RESERVE_MS;

/**
 * The graceful stage of the two-stage close of a guided browser whose start completed (KL-015-D5, W1.5 ruling part 1
 * section 2.2, rule D5-1). `context.close()` is raced against this, then the hard teardown always runs.
 *
 * 3 s is the largest round value that keeps the worst-case stop reply inside the backend's 15 s per send: the grace, plus the
 * hard teardown (at most about 1.5 s on a readable process table), plus the lifecycle callback (at most 10 s, `transport.ts`)
 * is 14.5 s; 5 s would be 16.5 s. It stays far below Playwright's own 30 s close bound and the runner's 30 s socket timeout,
 * neither of which is relied on. A constant, not a knob, for the same reason as the start budget above: a configured value
 * could drift above the backend's ceiling. A healthy recorded close must finish well inside it (fixtures case H measures it).
 */
export const GUIDED_CLOSE_GRACE_MS = 3_000;

/**
 * How long the recording's own finalization may take AFTER the stop has been answered (STUDIO-OBS-009 round 065).
 * The 3 s grace above bounds the stop reply, not the webm: Playwright's ffmpeg writes the Duration and the Cues only when it
 * exits on its own, and a SIGKILL before that leaves a file Chrome reports as `duration === Infinity`. The wait happens in the
 * recording settlement, which the stop never waits for, and it ends well inside the backend's `settle-grace` (default 2 min).
 */
export const GUIDED_RECORDING_FINALIZE_MS = 15_000;

/**
 * The start budget as the launcher sees it (the replay `request.startup` shape). `deadlineEpochMs` is
 * armed once at `GuidedRuntime.start()` entry and clamped to the lease and the session expiry;
 * `signal` aborts when the runtime stops during the start. Internal type, never on the wire.
 */
export interface GuidedStartup {
  readonly deadlineEpochMs: number;
  readonly signal: AbortSignal;
}

/**
 * The cause a failed launch reports when its own wait ended (REL-001/D4). A wait that the start signal
 * ended rejects `CANCELLED` whoever aborted it, so the abort reason says which it was: the runtime aborts
 * with its `TIMEOUT` error when the budget ran out and with `CANCELLED` on a stop. Only those two closed
 * reasons are taken; anything else (a bare `abort()`, a foreign reason) leaves the caught error as it is.
 */
export function launchFailureCause(error: unknown, signal: AbortSignal | undefined): unknown {
  if (!(error instanceof Error) || error.message !== 'CANCELLED' || signal?.aborted !== true) return error;
  const reason: unknown = signal.reason;
  return reason instanceof Error && (reason.message === 'TIMEOUT' || reason.message === 'CANCELLED') ? reason : error;
}

/** What {@link guidedCloseStages} needs from one launch. */
export interface GuidedCloseStagesPorts {
  /** `context.close()`. Its settled outcome is swallowed: the hard stage is the confirmation either way. */
  readonly graceful: () => Promise<unknown>;
  /** The launch's memo-less hard teardown; {@link guidedCloseStages} memoises it. */
  readonly hard: () => Promise<void>;
  /** Runs synchronously on the first close or terminate, so the caller can stop reporting the loss it is about to cause. */
  readonly onClosing?: () => void;
}

/**
 * The two-stage close of one guided launch as a pure helper (KL-015-D5 rule D5-1), so the clock arithmetic is proven in the
 * unit tier and `launchGuidedBrowser` (which the unit tier may not import) only supplies the two stages.
 *
 * `close()` races `graceful` against `graceMs`, records whether it resolved in time, then always awaits `terminate()`.
 * `terminate()` is the hard stage on its own, memoised, and shared with `close()`. Both memoise their promise, so a repeat call
 * returns the same settlement and a rejection (a survivor) is never retried.
 */
export function guidedCloseStages(
  ports: GuidedCloseStagesPorts, graceMs: number = GUIDED_CLOSE_GRACE_MS
): Pick<GuidedBrowser, 'close'> & {
  readonly terminate: () => Promise<void>; readonly orderlyClosed: () => boolean;
  /** True iff the graceful stage FULFILLED (at any time, however late) within `boundMs` of this call. Never starts or stops anything. */
  readonly gracefulFulfilledWithin: (boundMs: number) => Promise<boolean>;
} {
  let orderly = false;
  let gracefulSettlement: Promise<boolean> | null = null;
  let terminating: Promise<void> | null = null;
  let closing: Promise<void> | null = null;
  const terminate = (): Promise<void> => {
    ports.onClosing?.();
    return terminating ??= ports.hard();
  };
  const close = (): Promise<void> => {
    ports.onClosing?.();
    const closeOnce = async (): Promise<void> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const resolvedInTime = (gracefulSettlement = ports.graceful().then(() => true, () => false));
      const expired = new Promise<boolean>((resolve) => { timer = setTimeout(() => { resolve(false); }, Math.max(1, graceMs)); });
      try {
        // Only a close that resolved inside the grace is orderly. One that resolves later cannot change the verdict.
        const verdict = await Promise.race([resolvedInTime, expired]);
        if (terminating === null) orderly = verdict;
      } finally { if (timer) clearTimeout(timer); }
      await terminate();
    };
    closing ??= closeOnce();
    return closing;
  };
  const gracefulFulfilledWithin = async (boundMs: number): Promise<boolean> => {
    if (gracefulSettlement === null) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<boolean>((resolve) => { timer = setTimeout(() => { resolve(false); }, Math.max(1, boundMs)); });
    try { return await Promise.race([gracefulSettlement, expired]); } finally { if (timer) clearTimeout(timer); }
  };
  return { close, terminate, orderlyClosed: () => orderly, gracefulFulfilledWithin };
}

/** Private capability; instantiated only in the actual guided worker. */
export interface GuidedBrowser {
  readonly preferenceEvidence?:BrowserPreferenceEvidence;
  readonly scratchDirectory?: string;
  readonly evidence: ExecutionEvidence;
  readonly observations: ObservationSession;
  readonly blankMatches: () => Promise<boolean>;
  readonly navigateBlank: (destination: string) => Promise<void>;
  /**
   * Closes a browser whose start completed: a graceful `context.close()` bounded by {@link GUIDED_CLOSE_GRACE_MS}, then always
   * {@link terminate}. Settles only when the browser is confirmed gone; rejects `CONTEXT_LOST` on a survivor or an unreadable
   * process table, and a repeat call returns that same settlement (KL-015-D5 rule D5-1).
   */
  readonly close: () => Promise<void>;
  /**
   * The hard teardown of this launch alone: SIGKILL of its own direct children, a survivor check, scratch removal (D4). The
   * only close a start that did not complete takes, because such a start has run no step and has no recording to finish
   * (KL-015-D5 rule D5-1). Memoised and shared with {@link close}. Required: a browser without it would take the graceful stage on
   * a failed start, which D5-1 forbids, so the type is the guard (pre-F-merge ruling item 6).
   */
  readonly terminate: () => Promise<void>;
  /**
   * True only if the graceful stage of {@link close} resolved within the grace, so the recording was finalized by the browser
   * itself. Never true after {@link terminate} alone. Required for the same reason as {@link terminate}: a browser that does not say
   * must not be reported as an orderly recording.
   */
  readonly orderlyClosed: () => boolean;
  /**
   * The produced recording, readable only after {@link close} resolved (Playwright finalizes the
   * webm on context close). `null` when the context was not recorded or produced no file.
   */
  readonly recordedVideo?: () => Promise<string | null>;
  /**
   * Waits for the recorder to finish the webm after {@link close} has returned, for at most `boundMs`. `true` iff the browser's
   * own `context.close()` fulfilled in that time, i.e. the recorder exited on its own and wrote the Duration and the Cues; on
   * `false` it has SIGKILLed whatever is still writing the recording, so the file is a salvaged prefix. Optional: a browser
   * without a recorder has nothing to finish.
   */
  readonly finalizeRecording?: (boundMs: number) => Promise<boolean>;
  /**
   * The same recorded {@link BrowserHandle} type the observed replay adapter consumes
   * (`observedReplayAdapter.ts`), over this session's single page and recording (AC-1 parity;
   * OBS-015 prefix replay). Closing it closes this guided browser.
   */
  readonly handle?: BrowserHandle;
}

/** Why an already running guided browser reported itself lost. Closed vocabulary, no free text. */
export type GuidedLossReason = 'PAGE_CRASH' | 'EXTRA_PAGE' | 'BROWSER_DISCONNECTED' | 'ROUTE_FAILURE';

/** Last launch step entered before a launch failure. Closed vocabulary, no free text. */
export type GuidedLaunchPhase = 'PROFILE' | 'PROCESS' | 'PROBE' | 'STARTUP_PAGE' | 'APP_PAGE' | 'ROUTING' | 'BLANK_DOCUMENT';

/**
 * A launch that failed. The wire code stays `CONTEXT_LOST`, but the original error is kept as `cause`
 * and the step that failed as `phase`, so the worker can say why it refused (REL-001).
 * A partially created browser still needs confirmed cleanup before capacity can be released.
 */
export class GuidedLaunchFailure extends Error {
  constructor(readonly close: () => Promise<void>, cause?: unknown, readonly phase: GuidedLaunchPhase | null = null) {
    super('CONTEXT_LOST', cause === undefined ? undefined : { cause });
    this.name = 'GuidedLaunchFailure';
  }
}
