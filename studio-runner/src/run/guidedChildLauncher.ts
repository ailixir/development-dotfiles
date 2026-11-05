/**
 * The parent half of the per-session guided child (SC008-E15): `launchGuidedChild` has the signature of the runtime's `launch` option and
 * returns the runtime-facing {@link GuidedBrowser}, a proxy whose every call is one framed request to the child (`guidedChildProtocol.ts`).
 *
 * It reuses the replay child's machinery: `createForkSpawner` (own process group, piped output, descendant tracking), the confined
 * environment (`confinedEnvironment`, which also refuses code-loading variables), and the process-tree kill and quiescence. The child's
 * `TMPDIR` is a private 0700 directory made for this session and removed with it.
 *
 * ## What the proxy guarantees
 *
 * - **A child that stops answering ends one session, never the server.** Every request arms a kill timer sized to the work it asks for
 *   (a step: its window plus a grace; an observation: the return window, the collection deadline and a grace; the rest: a few seconds). On
 *   expiry the child's whole tree is killed and the caller gets a closed error. A busy-looping step is killed by its deadline.
 * - **Everything the child says is untrusted.** One validator (`parseChildFrame`/`parseReplyValue`); any violation kills the child.
 * - **The journal fence stays in the server.** A `fence` notice is answered with `fence-ack` or `fence-nack` after the caller's `onFence`
 *   settles; the child does nothing native before the ack.
 *
 * ## Close, in the order the plan fixes (B1)
 *
 * (a) not recorded, or recorded and orderly: the child is killed and confirmed gone before `close()` resolves. (b) recorded and not orderly:
 * `close()` resolves at the child's reply; the child lives on to finish the webm and the tree is killed when it says `finalized`, when it
 * exits, or at `finalizeMs` plus the grace. (c) `terminate()`: kill, no graceful stage. (e) The child exits by itself when the server
 * disconnects. (f) One close bound, measured from sending `close`, covers a hung step and a frozen Chrome. (g) Every term is a hard cap:
 * close bound 4.5 s + kill step 0.3 s (+ the lifecycle callback's 10 s) stays inside the backend's 15 s per call.
 */
import { lstat, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClosedActionError } from './closedError.js';
import { GUIDED_CLOSE_GRACE_MS, GUIDED_RECORDING_FINALIZE_MS, GuidedLaunchFailure, launchFailureCause } from './guidedBrowser.js';
import type { GuidedBrowser, GuidedLaunch, GuidedLaunchPhase, GuidedStepHooks, GuidedStepResult } from './guidedBrowser.js';
import { decodeError, guidedFrameCap, parseChildFrame, parseReplyValue } from './guidedChildProtocol.js';
import type { CloseReply, GuidedChildFrame, GuidedChildRequest, LaunchReply, ReplyContext } from './guidedChildProtocol.js';
import { host } from './host/index.js';
import { confinedEnvironment, createForkSpawner } from './launcher.js';
import type { ChildProcessHandle, ChildSpawner } from './launcher.js';
import { OBSERVATION_DEADLINE_MS, RETURN_WINDOW_MS } from './observationDeadline.js';
import { MAX_OBSERVATION_BYTES } from './observationSanitizer.js';
import type { ObservationConfig, ObservationExport } from './observationTypes.js';

/** Where the compiled child entry sits, relative to this module, once built. */
export const GUIDED_CHILD_MODULE_PATH = fileURLToPath(new URL('./guidedChild.js', import.meta.url));

/** Added to every window a request is given before its child is declared stalled. */
export const GUIDED_KILL_GRACE_MS = 2_000;
/** The one close bound: the 3 s graceful stage plus the 1.5 s hard teardown, measured from sending `close` (so it includes the IPC hop). */
export const GUIDED_CHILD_CLOSE_BOUND_MS = GUIDED_CLOSE_GRACE_MS + 1_500;
/** Kill, quiescence and removal of the session directory, together, are never allowed longer than this. */
export const GUIDED_END_CHILD_BOUND_MS = 300;
/** After a kill whose quiescence the end step could not confirm in time: how often, how far apart and how long each time it is checked again. */
export const GUIDED_LATE_QUIESCE_ATTEMPTS = 5;
export const GUIDED_LATE_QUIESCE_INTERVAL_MS = 1_000;
export const GUIDED_LATE_QUIESCE_BOUND_MS = 1_000;
/** The bound of a request that does little: `current`, `withhold`, `commitCapture`. */
export const GUIDED_CHILD_RPC_BOUND_MS = 5_000;

/** Test arguments, not product configuration: the same values the product uses are the defaults. */
export interface GuidedChildLauncherOptions {
  readonly spawner?: ChildSpawner;
  readonly childModulePath?: string;
  readonly parentEnv?: Readonly<Record<string, string | undefined>>;
  /** Where the per-session directories are made. Defaults to the server's `TMPDIR`. */
  readonly tmpRoot?: string;
  readonly killGraceMs?: number;
  readonly closeBoundMs?: number;
  readonly rpcBoundMs?: number;
  readonly endChildBoundMs?: number;
  /** How long the child may take to finish a recording after a non-orderly close. */
  readonly finalizeMs?: number;
  /** Receives the one closed `GUIDED_CHILD_LOST` line. Defaults to stderr. */
  readonly diagnostic?: (line: string) => void;
}

/** The request a kill timer guards. Closed vocabulary: it is written to the diagnostic line. */
type ChildPhase = 'LAUNCH' | 'CURRENT' | 'OBSERVE' | 'WITHHOLD' | 'COMMIT_CAPTURE' | 'PREPARE' | 'DISPATCH' | 'CLOSE' | 'IDLE';
type LossReason = 'STALL' | 'EXIT' | 'PROTOCOL' | 'LAUNCH';

interface Pending {
  readonly id: number;
  readonly context: ReplyContext;
  readonly phase: ChildPhase;
  readonly hooks: GuidedStepHooks | undefined;
  /** What the caller sees when the kill timer ends this request. */
  readonly stalled: Error;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
  fenced: boolean;
  /** The proxy sent `fence-ack` for this dispatch: the only way a child may report a crossed fence. */
  acked: boolean;
}

/** How a recorded, non-orderly close ended: the recorder finished the webm (or was killed), and where the file is. */
interface Finalization {
  readonly promise: Promise<{ finalized: boolean; videoPath: string | null }>;
  settle(value: { finalized: boolean; videoPath: string | null }): void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** Resolves with `fallback` if `work` has not settled in `ms`. Never leaves a timer behind. */
async function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<T>(resolve => { timer = setTimeout(() => { resolve(fallback); }, Math.max(1, ms)); })]); }
  finally { if (timer) clearTimeout(timer); }
}

const lost = (): ClosedActionError => new ClosedActionError('CONTEXT_LOST');

interface Settings {
  readonly killGraceMs: number;
  readonly closeBoundMs: number;
  readonly rpcBoundMs: number;
  readonly endChildBoundMs: number;
  readonly finalizeMs: number;
  readonly diagnostic: (line: string) => void;
}

/** One child: its channel, its pending requests, and the rules for ending it. */
class ChildSession {
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private exited = false;
  private lossRecorded = false;
  /** From the first close or terminate on, the child's death is expected and is not reported as a loss. */
  private closing = false;
  private ending: Promise<void> | null = null;
  private closed: Promise<void> | null = null;
  private terminating: Promise<void> | null = null;
  /** Launch finished: from here a loss is reported to the runtime. */
  ready = false;
  launchPhase: GuidedLaunchPhase | null = null;
  orderly = false;
  private recorded = false;
  private videoPath: string | null = null;
  private finalizing: Finalization | null = null;
  private recordingReady: ((recording: boolean) => void) | undefined;
  private cap = 0;
  /** The session's recording directory (null: none was asked for); a reported video must be a .webm inside it. */
  private recordingDir: string | null = null;
  /** Set by an end whose quiescence was not confirmed in time: keeps confirming in the background. */
  private lateGone: Promise<void> | null = null;

  constructor(
    private readonly child: ChildProcessHandle,
    private readonly directory: string,
    private readonly settings: Settings,
    private readonly onLost: (reason?: 'PAGE_CRASH' | 'BROWSER_DISCONNECTED') => void,
  ) {
    child.trackTree?.();
    // The child's own output is never read as data: a pipe nobody drains blocks the writer, so it is drained and dropped.
    child.onOutput(() => undefined);
    child.onMessage(raw => { this.receive(raw); });
    child.onExit(() => { this.exited = true; this.exit(); });
  }

  begin(config: ObservationConfig, recordingReady: ((recording: boolean) => void) | undefined, recordingDir: string | null): void {
    this.cap = guidedFrameCap(config.limits);
    this.recordingDir = recordingDir === null ? null : resolve(recordingDir);
    this.recordingReady = recordingReady;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Requests

  call<T>(build: (id: number) => GuidedChildRequest, context: ReplyContext, phase: ChildPhase, boundMs: number, extra: { hooks?: GuidedStepHooks; stalled?: Error } = {}): Promise<T> {
    // One outstanding request per class: a second one is the caller's fault, and the session cannot be trusted past it.
    if (this.lossRecorded || this.exited || [...this.pending.values()].some(entry => entry.context.op === context.op)) return Promise.reject(lost());
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      const entry: Pending = { id, context, phase, hooks: extra.hooks, stalled: extra.stalled ?? lost(), resolve: value => { resolve(value as T); }, reject, timer: undefined, fenced: false, acked: false };
      entry.timer = setTimeout(() => { this.lose('STALL', entry); }, Math.max(1, boundMs));
      this.pending.set(id, entry);
      this.child.send(build(id));
    });
  }

  abort(): void { if (!this.lossRecorded && !this.exited) this.child.send({ kind: 'abort' }); }

  // -------------------------------------------------------------------------------------------------------------------
  // What the child says

  private receive(raw: unknown): void {
    if (this.lossRecorded) return;
    let frame: GuidedChildFrame;
    try { frame = parseChildFrame(raw, this.cap); } catch { this.lose('PROTOCOL'); return; }
    switch (frame.kind) {
      case 'reply': this.reply(frame); break;
      case 'fence': this.fence(frame.req); break;
      case 'recording-ready': {
        const ready = this.recordingReady;
        this.recordingReady = undefined;
        // Once, and only if a recorded context was asked for.
        if (ready === undefined) this.lose('PROTOCOL'); else ready(frame.recording);
        break;
      }
      case 'lost': if (this.ready && !this.closing) this.onLost(frame.reason); break;
      case 'finalized':
        if (this.finalizing === null || !this.confined(frame.videoPath)) this.lose('PROTOCOL');
        else { this.finalizing.settle({ finalized: frame.finalized, videoPath: frame.videoPath }); }
        break;
    }
  }

  private reply(frame: Extract<GuidedChildFrame, { kind: 'reply' }>): void {
    const entry = this.pending.get(frame.id);
    if (entry === undefined) { this.lose('PROTOCOL'); return; }
    let value: unknown;
    if (frame.ok) {
      try { value = parseReplyValue(entry.context, frame.value); } catch { this.lose('PROTOCOL'); return; }
    }
    // A video outside the session's recording directory, or a crossed fence the proxy never acked, is the child lying: the session ends.
    if (frame.ok && entry.context.op === 'close' && !this.confined((value as CloseReply).videoPath)) { this.lose('PROTOCOL'); return; }
    if (frame.ok && entry.context.op === 'step' && (value as GuidedStepResult).receipt.fenceCrossed && !entry.acked) { this.lose('PROTOCOL'); return; }
    this.pending.delete(frame.id);
    if (entry.timer) clearTimeout(entry.timer);
    if (frame.ok && entry.context.op === 'close') this.closeAnswered(value as CloseReply);
    if (frame.ok) { entry.resolve(value); return; }
    if (entry.context.op === 'launch') this.launchPhase = frame.phase ?? null;
    entry.reject(decodeError(frame.code, frame.host));
  }

  /** True for no video, or a path that resolves inside the recording directory and names a .webm. */
  private confined(videoPath: string | null): boolean {
    if (videoPath === null) return true;
    if (this.recordingDir === null || !videoPath.endsWith('.webm')) return false;
    return host.files.isInside(this.recordingDir, resolve(videoPath));
  }

  private fence(req: number): void {
    // A fence request is valid once, from a dispatch that is running; a prepare never reaches one.
    const dispatch = [...this.pending.values()].find(entry => entry.phase === 'DISPATCH' && !entry.fenced);
    if (dispatch?.hooks === undefined) { this.lose('PROTOCOL'); return; }
    dispatch.fenced = true;
    const answer = (kind: 'fence-ack' | 'fence-nack'): void => { if (kind === 'fence-ack') dispatch.acked = true; if (!this.lossRecorded && !this.exited) this.child.send({ kind, req }); };
    let asked: Promise<void>;
    try { asked = dispatch.hooks.onFence(); } catch { answer('fence-nack'); return; }
    void asked.then(() => { answer('fence-ack'); }, () => { answer('fence-nack'); });
  }

  private exit(): void {
    if (this.finalizing !== null) this.finalizing.settle({ finalized: false, videoPath: null });
    // Anything the child left behind (the browser, the recorder) goes with it: `lose` ends the tree.
    this.lose('EXIT');
  }

  /**
   * The child is gone or untrustworthy: every pending request ends, the tree is killed, and the runtime is told unless it already knows
   * (a close in progress, or a dispatch whose own error path stops the session with the right reason). `stalled` is the request whose
   * timer fired; it gets its own error, the others a plain CONTEXT_LOST.
   */
  lose(reason: LossReason, stalled?: Pending): void {
    if (this.lossRecorded) return;
    this.lossRecorded = true;
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) if (entry.timer) clearTimeout(entry.timer);
    const dispatching = entries.some(entry => entry.phase === 'DISPATCH');
    if (!this.closing) {
      const phase = reason === 'LAUNCH' ? (this.launchPhase ?? 'UNKNOWN') : (stalled ?? entries[0])?.phase ?? 'IDLE';
      try { this.settings.diagnostic(`GUIDED_CHILD_LOST reason=${reason} phase=${phase}\n`); } catch { /* A diagnostic never changes the verdict. */ }
    }
    void this.end().catch(() => undefined);
    for (const entry of entries) entry.reject(entry === stalled ? entry.stalled : lost());
    if (this.finalizing !== null) this.finalizing.settle({ finalized: false, videoPath: null });
    if (this.ready && !this.closing && !dispatching) this.onLost('BROWSER_DISCONNECTED');
  }

  /** The launch ended before the child answered (stop, deadline): same end, but nothing is reported to a runtime that already knows. */
  abandonLaunch(cause: unknown): void {
    const entry = [...this.pending.values()].find(candidate => candidate.context.op === 'launch');
    if (entry === undefined) return;
    this.closing = true;
    this.pending.delete(entry.id);
    if (entry.timer) clearTimeout(entry.timer);
    entry.reject(cause);
    void this.end().catch(() => undefined);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Ending

  /**
   * Kill the child's whole tree, confirm it is gone, remove the session directory: together never longer than `endChildBoundMs`.
   * Rejects CONTEXT_LOST when the tree could not be confirmed gone (the slot stays held, as for any survivor); a removal still running is
   * left to the existing scratch sweep. Memoised: every path shares one settlement.
   */
  end(): Promise<void> {
    return this.ending ??= this.endOnce();
  }

  private async endOnce(): Promise<void> {
    const bound = this.settings.endChildBoundMs;
    const began = Date.now();
    this.child.kill();
    const quiet = this.child.quiesce === undefined ? true : await within(this.child.quiesce(bound), bound, false);
    await within(host.files.remove(this.directory).catch(() => undefined), bound - (Date.now() - began), undefined);
    if (!quiet) { this.lateGone = this.confirmGone(); this.lateGone.catch(() => undefined); throw lost(); }
  }

  /**
   * The kill was sent but the bounded quiescence could not confirm the tree gone (a slow or unreadable `ps`). The tree is usually dead, so the
   * slot must not stay held for ever on that: a few more attempts over a few seconds; resolves once confirmed, rejects if it never is.
   */
  private async confirmGone(): Promise<void> {
    for (let attempt = 0; attempt < GUIDED_LATE_QUIESCE_ATTEMPTS; attempt++) {
      await new Promise<void>(done => { setTimeout(done, GUIDED_LATE_QUIESCE_INTERVAL_MS); });
      this.child.kill();
      if (this.child.quiesce === undefined || await within(this.child.quiesce(GUIDED_LATE_QUIESCE_BOUND_MS), GUIDED_LATE_QUIESCE_BOUND_MS, false)) {
        await host.files.remove(this.directory).catch(() => undefined);
        return;
      }
    }
    throw lost();
  }

  /** After an `end()` that rejected: settles when the tree is confirmed gone, rejects if it never is. */
  gone(): Promise<void> { return this.lateGone ?? Promise.reject(lost()); }

  terminate(): Promise<void> {
    this.closing = true;
    return this.terminating ??= this.end();
  }

  close(): Promise<void> {
    this.closing = true;
    return this.closed ??= this.closeOnce();
  }

  private async closeOnce(): Promise<void> {
    if (this.lossRecorded || this.exited) { await this.end(); return; }
    // A step still running is told to stop; a busy-looping one cannot hear it, and the bound below kills it.
    this.abort();
    let reply: CloseReply;
    try {
      reply = await this.call<CloseReply>(id => ({ kind: 'request', id, op: 'close', finalizeMs: this.settings.finalizeMs }), { op: 'close' }, 'CLOSE', this.settings.closeBoundMs);
    } catch {
      // (f) The bound ended, or the child died or refused: whatever it was doing is a salvaged prefix at best.
      await this.end();
      return;
    }
    if (!reply.recorded || reply.orderly) await this.end();
    // (b) otherwise the recorder is still finishing the webm inside the child: the stop is answered now, the child is kept until it says so.
  }

  /**
   * Runs when the reply arrives, not when its waiter resumes: the child's `finalized` notice can follow in the same read, and must find
   * the finalization already open.
   */
  private closeAnswered(reply: CloseReply): void {
    this.orderly = reply.orderly;
    this.recorded = reply.recorded;
    this.videoPath = reply.videoPath;
    if (reply.recorded && !reply.orderly) this.startFinalization();
  }

  private startFinalization(): void {
    let resolve: (value: { finalized: boolean; videoPath: string | null }) => void = () => undefined;
    const promise = new Promise<{ finalized: boolean; videoPath: string | null }>(done => { resolve = done; });
    const finalizing: Finalization = {
      promise, timer: undefined,
      settle: value => {
        if (finalizing.timer) clearTimeout(finalizing.timer);
        resolve(value);
        void this.end().catch(() => undefined);
      },
    };
    this.finalizing = finalizing;
    if (this.exited || this.lossRecorded) { finalizing.settle({ finalized: false, videoPath: null }); return; }
    // The child bounds the wait itself; this is the bound for a child that cannot say it is done. The kill is a salvaged prefix, as today.
    finalizing.timer = setTimeout(() => { finalizing.settle({ finalized: false, videoPath: null }); }, this.settings.finalizeMs + this.settings.killGraceMs);
  }

  async finalizeRecording(boundMs: number): Promise<boolean> {
    if (!this.recorded) return false;
    if (this.orderly) return true;
    if (this.finalizing === null) return false;
    return (await within(this.finalizing.promise, boundMs, null))?.finalized ?? false;
  }

  async recordedVideo(): Promise<string | null> {
    if (!this.recorded) return null;
    return this.regular(this.orderly ? this.videoPath : (await this.finalizing?.promise)?.videoPath ?? null);
  }

  /** A video that exists must be a regular file (never a link out of the recording directory); one not there yet is left to the uploader. */
  private async regular(videoPath: string | null): Promise<string | null> {
    if (videoPath === null) return null;
    try { return (await lstat(videoPath)).isFile() ? videoPath : null; } catch { return videoPath; }
  }
}

export function createGuidedChildLauncher(options: GuidedChildLauncherOptions = {}): GuidedLaunch {
  const spawner = options.spawner ?? createForkSpawner();
  const modulePath = options.childModulePath ?? GUIDED_CHILD_MODULE_PATH;
  const parentEnv = options.parentEnv ?? process.env;
  const settings: Settings = {
    killGraceMs: options.killGraceMs ?? GUIDED_KILL_GRACE_MS,
    closeBoundMs: options.closeBoundMs ?? GUIDED_CHILD_CLOSE_BOUND_MS,
    rpcBoundMs: options.rpcBoundMs ?? GUIDED_CHILD_RPC_BOUND_MS,
    endChildBoundMs: options.endChildBoundMs ?? GUIDED_END_CHILD_BOUND_MS,
    finalizeMs: options.finalizeMs ?? GUIDED_RECORDING_FINALIZE_MS,
    diagnostic: options.diagnostic ?? ((line: string): void => { process.stderr.write(line); }),
  };

  return async function launchGuidedChild(config, contextId, onLost, recording, startup) {
    const { signal } = startup;
    if (signal.aborted) throw new GuidedLaunchFailure(() => Promise.resolve(), launchFailureCause(new Error('CANCELLED'), signal));
    // The child's own TMPDIR: mkdtemp makes it 0700, and it is removed with the child.
    let directory: string;
    let child: ChildProcessHandle;
    try {
      directory = await mkdtemp(join(options.tmpRoot ?? process.env.TMPDIR ?? tmpdir(), 'checks-guided-child-'));
    } catch { throw new GuidedLaunchFailure(() => Promise.resolve(), new Error('CONTEXT_LOST')); }
    try {
      child = spawner.spawn({ modulePath, args: [], env: confinedEnvironment(parentEnv, directory, config.allowedDomains) });
    } catch {
      await host.files.remove(directory).catch(() => undefined);
      throw new GuidedLaunchFailure(() => Promise.resolve(), new Error('CONTEXT_LOST'));
    }
    const session = new ChildSession(child, directory, settings, onLost);
    session.begin(config, recording === undefined ? undefined : recording.ready, recording === undefined ? null : recording.dir);
    // Read through a function: the signal aborts while the launch awaits, which the early check above would otherwise rule out.
    const stopped = (): boolean => signal.aborted;
    const onAbort = (): void => { session.abandonLaunch(launchFailureCause(new Error('CANCELLED'), signal)); };
    signal.addEventListener('abort', onAbort, { once: true });
    let reply: LaunchReply;
    try {
      const context = { op: 'launch', sessionId: config.sessionId, contextId, directory } as const;
      reply = await session.call<LaunchReply>(
        id => ({ kind: 'request', id, op: 'launch', config: structuredClone(config), contextId, recording: recording === undefined ? null : { dir: recording.dir, size: { width: recording.size.width, height: recording.size.height } }, deadlineEpochMs: startup.deadlineEpochMs }),
        context, 'LAUNCH', startup.deadlineEpochMs + settings.killGraceMs - Date.now(), { stalled: new Error('TIMEOUT') });
    } catch (error) {
      // The child answered that it could not launch (an exit, a stall or a violation already recorded its own loss).
      if (!stopped()) {
        session.lose('LAUNCH');
        // The teardown is bounded (kill step 0.3 s); a launch that failed on its own rejects once the child is gone.
        await session.terminate().catch(() => undefined);
      }
      throw new GuidedLaunchFailure(() => session.terminate(), error, session.launchPhase);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    session.ready = true;
    // A host that does not sample its process table records the child's tree once, now that the browser exists.
    child.snapshotTree?.();
    return browserOf(session, config, reply, settings);
  };
}

/** The runtime-facing browser over a launched child. */
function browserOf(session: ChildSession, config: ObservationConfig, reply: LaunchReply, settings: Settings): GuidedBrowser {
  const collectionMs = config.limits?.milliseconds ?? OBSERVATION_DEADLINE_MS;
  const observationBytes = config.limits?.bytes ?? MAX_OBSERVATION_BYTES;
  return {
    ...(reply.preferenceEvidence === undefined ? {} : { preferenceEvidence: reply.preferenceEvidence }),
    scratchDirectory: reply.scratchDirectory,
    evidence: reply.evidence,
    observations: {
      current: target => session.call<boolean>(id => ({ kind: 'request', id, op: 'current', target }), { op: 'current' }, 'CURRENT', settings.rpcBoundMs),
      // The return window is awaited BEFORE the collection deadline starts, so the child may legitimately take both.
      observe: (maxBytes, settle, focus, deadlineMs) => session.call<ObservationExport>(
        id => ({ kind: 'request', id, op: 'observe', settle: settle ?? false, ...(maxBytes === undefined ? {} : { maxBytes }), ...(focus === undefined ? {} : { focus }), ...(deadlineMs === undefined ? {} : { deadlineMs }) }),
        { op: 'observe', sessionId: config.sessionId, scopeHash: config.scopeHash, maxBytes: maxBytes ?? observationBytes },
        'OBSERVE', RETURN_WINDOW_MS + Math.min(collectionMs, Math.max(1, deadlineMs ?? collectionMs)) + settings.killGraceMs),
      withhold: async values => { await session.call<null>(id => ({ kind: 'request', id, op: 'withhold', values: [...values] }), { op: 'withhold' }, 'WITHHOLD', settings.rpcBoundMs); },
      commitCapture: async value => { await session.call<null>(id => ({ kind: 'request', id, op: 'commitCapture', value }), { op: 'commitCapture' }, 'COMMIT_CAPTURE', settings.rpcBoundMs); },
    },
    step: (request, hooks) => {
      const dispatch = request.mode === 'dispatch';
      // A prepare that stalls ends the session (the page is gone with the child); a dispatch that stalls is a TIMEOUT for the dispatch path to judge.
      return session.call<GuidedStepResult>(
        id => ({ kind: 'request', id, op: 'step', step: request }), { op: 'step', request },
        dispatch ? 'DISPATCH' : 'PREPARE', Math.max(0, request.deadlineEpochMs - Date.now()) + settings.killGraceMs,
        dispatch ? { hooks, stalled: new Error('TIMEOUT') } : {});
    },
    abort: () => { session.abort(); },
    close: () => session.close(),
    terminate: () => session.terminate(),
    confirmGone: () => session.gone(),
    orderlyClosed: () => session.orderly,
    recordedVideo: () => session.recordedVideo(),
    finalizeRecording: boundMs => session.finalizeRecording(boundMs),
  };
}

/** The production launcher: `GuidedRuntimeOptions['launch']` for `main.ts`. */
export const launchGuidedChild: GuidedLaunch = createGuidedChildLauncher();
