/**
 * What the per-session guided child does (SC008-E15).
 *
 * Two layers, so the unit tier can host the same code without a browser or a process:
 *
 * - {@link createGuidedStepService}: the step side. `performStep` is run here (the second host besides the replay adapter), with the secret
 *   hook, the evidence of which secrets were used, and the invocation control whose fence is acknowledged by the server before any native call
 *   (`guidedAckControl.ts`). It needs a page host and an observation session, not a browser, and it imports no Playwright.
 * - {@link serveGuidedChild}: the process side. It binds a channel to a browser launched by the UNCHANGED `launchGuidedBrowser` (injected, so
 *   this file imports no Playwright either), serves the closed request set of `guidedChildProtocol.ts`, and exits when the server goes away.
 *
 * Secret values exist in this process only between the arrival of a dispatch `step` request and the end of that step: they are copied to the
 * holder the secret hook reads, and both the holder and the request's own copies are emptied in the step's `finally`.
 *
 * Close runs the existing `guidedCloseStages` (inside `launchGuidedBrowser`) unchanged. A recorded close whose graceful stage did not finish
 * in time answers the close request at once and keeps going: the child finalizes the recording on its own timeline and then says `finalized`.
 */
import type { InvocationControl } from '../executor/observedReplay.js';
import type { StepApi } from './browserFactory.js';
import { createAckedInvocationControl } from './guidedAckControl.js';
import { GuidedLaunchFailure } from './guidedBrowser.js';
import type { GuidedLossReason, GuidedRecordingRequest, GuidedStartup, GuidedStepRequest, GuidedStepResult, LaunchedBrowser } from './guidedBrowser.js';
import { encodeError, parseParentFrame } from './guidedChildProtocol.js';
import type { CloseReply, GuidedChildFrame, GuidedChildRequest, LaunchReply } from './guidedChildProtocol.js';
import { createSecretRun, newTally, performStep } from './observedReplayAdapter.js';
import type { SecretRun } from './observedReplayAdapter.js';
import type { ObservationConfig, ObservationSession } from './observationTypes.js';
import { SecretUseEvidence } from './secretUse.js';
import type { SecretUseStatus } from './secretUse.js';

/** The secret evidence of the dispatch that is running: the hook lives for the session, the evidence is reported per dispatch. */
class DispatchEvidence extends SecretUseEvidence {
  private current = new SecretUseEvidence([]);
  constructor() { super([]); }
  begin(names: readonly string[]): void { this.current = new SecretUseEvidence(names); }
  override attempting(name: string): void { this.current.attempting(name); }
  override used(name: string): void { this.current.used(name); }
  override refusedBeforeEffect(name: string): void { this.current.refusedBeforeEffect(name); }
  override snapshot(): Record<string, SecretUseStatus> { return this.current.snapshot(); }
}

// ---------------------------------------------------------------------------------------------------------------------
// The step side

/** What step code runs against: the page host and the observation session of one browser. */
export interface GuidedStepHost {
  readonly stepApi: StepApi;
  readonly session: ObservationSession;
}

export interface GuidedStepServiceOptions {
  /** The runner's navigation whitelist. */
  readonly allowedDomains: readonly string[];
  /** Test seam (replaces the old runtime option): called with the value at the one place the secret hook reads it, after the fence and before the trusted write. */
  readonly beforeSecretFill?: (value: string) => void;
  readonly now?: () => number;
}

export interface GuidedStepService {
  /**
   * Runs one step. `requestFence` is the dispatch's only way across the journal fence: it resolves when the server has written the fence, and
   * rejects if it could not. It is never called on a prepare.
   */
  step(request: GuidedStepRequest, requestFence: () => Promise<void>): Promise<GuidedStepResult>;
  /** The session is stopping: the step in flight (and any pending fence) ends cancelled, and later steps start cancelled. */
  abort(): void;
}

export function createGuidedStepService(host: GuidedStepHost, options: GuidedStepServiceOptions): GuidedStepService {
  const now = options.now ?? Date.now;
  const evidence = new DispatchEvidence();
  /** The values of the secrets of the dispatch that is running; emptied in its finally, so the session-long hook never holds one. */
  const holder = new Map<string, { value: string; allowedOrigins: readonly string[] }>();
  const stopped = new AbortController();
  let control: ReturnType<typeof createAckedInvocationControl> | null = null;
  let secretRun: SecretRun | null = null;
  /** The one secret run of the session (the secret-bearing window outlives a step); its control and values are the running step's. */
  const secrets = (): SecretRun => secretRun ??= createSecretRun({
    session: host.session,
    evidence,
    control: (): InvocationControl => { if (control === null) throw new Error('CONTEXT_LOST'); return control; },
    resolve: id => { const held = holder.get(id); if (held) options.beforeSecretFill?.(held.value); return held; },
  });
  return {
    async step(request, requestFence) {
      if (control !== null) throw new Error('CONTEXT_LOST');
      const dispatch = request.mode === 'dispatch';
      const given = request.secrets;
      if (given !== undefined) for (const [id, held] of Object.entries(given)) holder.set(id, { value: held.value, allowedOrigins: [...held.allowedOrigins] });
      evidence.begin(request.secretIds);
      const acked = createAckedInvocationControl({
        deadlineMs: request.deadlineEpochMs, now, signal: stopped.signal,
        // A prepare stops before the fence; reaching it would be a step that crossed it, which ends the session.
        requestFence: dispatch ? requestFence : () => Promise.reject(new Error('CONTEXT_LOST')),
      });
      control = acked;
      try {
        const outcome = await performStep(host.stepApi, host.session, {
          coordinate: request.coordinate, operation: request.operation, inputs: request.inputs, vars: request.vars, secretIds: request.secretIds,
          control: acked, tally: newTally(), allowedDomains: options.allowedDomains, secrets: secrets(), ...(dispatch ? {} : { untilFence: true }),
        });
        return {
          receipt: outcome.receipt, captured: outcome.captured, fenceReached: outcome.fenceReached,
          ...(outcome.matchCount === undefined ? {} : { matchCount: outcome.matchCount }), ...(outcome.syntax === undefined ? {} : { syntax: outcome.syntax }),
          secretUse: evidence.snapshot(),
        };
      } finally {
        control = null;
        holder.clear();
        // The request object keeps no secret value (a replayed request would find none).
        if (given !== undefined) for (const id of Object.keys(given)) Reflect.deleteProperty(given, id);
      }
    },
    abort() {
      stopped.abort();
      control?.abortPending('CANCELLED');
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The process side

/** The channel to the server, reduced to what the service needs. The fork entry binds it to process IPC; a test binds it to a pair of queues. */
export interface GuidedChildChannel {
  send(frame: GuidedChildFrame): void;
  onMessage(listener: (raw: unknown) => void): void;
  /** The server is gone. */
  onDisconnect(listener: () => void): void;
  /** Leaves the process. A test channel does nothing. */
  exit(): void;
}

export interface GuidedChildServiceOptions {
  /** `launchGuidedBrowser`, injected so this module imports no Playwright. */
  readonly launch: (config: ObservationConfig, contextId: string, onLost: (reason?: GuidedLossReason) => void, recording: GuidedRecordingRequest | undefined, startup: GuidedStartup) => Promise<LaunchedBrowser>;
  readonly beforeSecretFill?: (value: string) => void;
}

/** How long the child spends tearing its browser down after the server disconnected, before it leaves anyway. */
const SELF_EXIT_BOUND_MS = 2_000;

export function serveGuidedChild(channel: GuidedChildChannel, options: GuidedChildServiceOptions): void {
  let launched: LaunchedBrowser | null = null;
  let steps: GuidedStepService | null = null;
  let recorded = false;
  const launchAbort = new AbortController();
  const fences = new Map<number, { resolve: () => void; reject: (error: unknown) => void }>();
  let nextFence = 1;

  const failFences = (): void => {
    const waiting = [...fences.values()];
    fences.clear();
    for (const fence of waiting) fence.reject(new Error('CONTEXT_LOST'));
  };
  const requestFence = (): Promise<void> => new Promise<void>((resolve, reject) => {
    const req = nextFence++;
    fences.set(req, { resolve, reject });
    channel.send({ kind: 'fence', req });
  });
  /** Anything unexpected from the server: nothing pending may proceed, and the step in flight ends cancelled. */
  const failClosed = (): void => { failFences(); steps?.abort(); };

  const serve = (id: number, work: (later: (action: () => void) => void) => Promise<unknown>): void => {
    let after: (() => void) | undefined;
    void work(action => { after = action; }).then(
      value => { channel.send({ kind: 'reply', id, ok: true, value: value ?? null }); },
      (error: unknown) => {
        const { code, host } = encodeError(error);
        channel.send({ kind: 'reply', id, ok: false, code, ...(host === undefined ? {} : { host }), ...(error instanceof GuidedLaunchFailure && error.phase !== null ? { phase: error.phase } : {}) });
      },
    ).then(() => { after?.(); });
  };
  const browser = (): LaunchedBrowser => { if (launched === null) throw new Error('CONTEXT_LOST'); return launched; };

  const handle = (frame: GuidedChildRequest): void => {
    serve(frame.id, async later => {
      switch (frame.op) {
        case 'launch': {
          if (launched !== null) throw new Error('CONTEXT_LOST');
          const recording: GuidedRecordingRequest | undefined = frame.recording === null ? undefined : {
            dir: frame.recording.dir, size: frame.recording.size,
            ready: ready => { recorded = ready; channel.send({ kind: 'recording-ready', recording: ready }); },
          };
          const started = await options.launch(frame.config, frame.contextId, reason => { channel.send({ kind: 'lost', reason: reason ?? 'BROWSER_DISCONNECTED' }); },
            recording, { deadlineEpochMs: frame.deadlineEpochMs, signal: launchAbort.signal });
          const stepApi = started.handle?.stepApi;
          if (stepApi === undefined || started.scratchDirectory === undefined) { void started.terminate().catch(() => undefined); throw new Error('CONTEXT_LOST'); }
          launched = started;
          steps = createGuidedStepService({ stepApi, session: started.observations }, { allowedDomains: frame.config.allowedDomains, ...(options.beforeSecretFill === undefined ? {} : { beforeSecretFill: options.beforeSecretFill }) });
          const reply: LaunchReply = { evidence: started.evidence, scratchDirectory: started.scratchDirectory, ...(started.preferenceEvidence === undefined ? {} : { preferenceEvidence: started.preferenceEvidence }) };
          return reply;
        }
        case 'current': {
          const { target } = frame;
          return target.kind === 'blank' ? await browser().blankMatches() : browser().observations.documentCurrent({ documentId: target.documentId, generation: target.generation }, target.origin);
        }
        case 'observe': {
          const exported = await browser().observations.observe(frame.maxBytes, frame.settle, frame.focus, frame.deadlineMs);
          return { observation: exported.observation };
        }
        case 'withhold': {
          const session = browser().observations;
          if (session.withhold === undefined) throw new Error('CONTEXT_LOST');
          await session.withhold(frame.values);
          return null;
        }
        case 'commitCapture':
          browser().observations.commitCapture(frame.value);
          return null;
        case 'step': {
          if (steps === null) throw new Error('CONTEXT_LOST');
          return await steps.step(frame.step, requestFence);
        }
        case 'close': {
          const closing = browser();
          steps?.abort();
          // The masking bytes are dropped synchronously; the renderer command is never awaited before the shutdown starts.
          const disposal = closing.observations.dispose().catch(() => undefined);
          await closing.close();
          const orderly = closing.orderlyClosed();
          await disposal;
          if (recorded && !orderly) {
            // The stop is answered now; the webm is finished (or the recorder killed) on this timeline, and the server hears about it.
            const announceFinalized = async (): Promise<void> => {
              const finalized = await closing.finalizeRecording?.(frame.finalizeMs).catch(() => false) ?? false;
              const videoPath = await closing.recordedVideo?.().catch(() => null) ?? null;
              channel.send({ kind: 'finalized', finalized, videoPath });
            };
            later(() => {
              announceFinalized().catch(() => { channel.send({ kind: 'finalized', finalized: false, videoPath: null }); });
            });
            return { orderly: false, recorded: true, videoPath: null } satisfies CloseReply;
          }
          const videoPath = recorded ? await closing.recordedVideo?.().catch(() => null) ?? null : null;
          return { orderly, recorded, videoPath } satisfies CloseReply;
        }
      }
    });
  };

  channel.onMessage(raw => {
    let frame;
    try { frame = parseParentFrame(raw); } catch { failClosed(); return; }
    switch (frame.kind) {
      case 'request': handle(frame); break;
      case 'abort': launchAbort.abort(new Error('CANCELLED')); steps?.abort(); failFences(); break;
      case 'fence-ack':
      case 'fence-nack': {
        const waiting = fences.get(frame.req);
        // An answer to no request (late, repeated or invented) is never taken as an ack.
        if (waiting === undefined) { failClosed(); break; }
        fences.delete(frame.req);
        if (frame.kind === 'fence-ack') waiting.resolve(); else waiting.reject(new Error('CONTEXT_LOST'));
        break;
      }
    }
  });

  // The server is gone: nobody will ever close this browser, so kill it (and with it its recorder) and leave.
  channel.onDisconnect(() => {
    failClosed();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bound = new Promise<void>(resolve => { timer = setTimeout(resolve, SELF_EXIT_BOUND_MS); });
    void Promise.race([launched?.terminate().catch(() => undefined) ?? Promise.resolve(), bound]).finally(() => {
      if (timer) clearTimeout(timer);
      channel.exit();
    });
  });
}
