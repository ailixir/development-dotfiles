import { GuidedDiagnostics } from './diagnostics.js';
import {createRedactor} from '../executor/redaction.js';
import type {Redactor} from '../executor/redaction.js';
import { admit, newTally, receiptFromTally } from '../run/observedReplayAdapter.js';
import type { StepReceipt } from '../run/observedReplayAdapter.js';
import type { SecretUseStatus } from '../run/secretUse.js';
import { DISPATCH_WINDOW_MS, MIN_AUTOMATIC_OBSERVATION_MS, PREPARE_BUDGET_MS } from '../run/actionBudget.js';
import type { BridgePrefixPrepare, BridgePrefixPrepareResult, BridgePrefixRequestIdentity, BridgeAdmittedDrift, BridgeContextAcknowledgement, BridgeOrdinaryPrepare } from './types.js';
import { randomUUID } from 'node:crypto';
import { canonical, hash, identity, insist, sameIdentity, validate } from './contracts.js';
import { GuidedJournal } from './journal.js';
import type { Action, BridgeDispatch, BridgeIdentity, BridgeObservation, BridgeOrdinaryOutcome as BridgeOutcome, BridgePreparation, BridgeStop, ConsumerEdge, ExecutionEvidence, PrefixAction, Producer, RunnerContext, ObservationRefresh } from './types.js';
import { GuidedLaunchFailure, GUIDED_RECORDING_FINALIZE_MS, GUIDED_START_BUDGET_MS, GUIDED_START_RESERVE_MS } from '../run/guidedBrowser.js';
import type { GuidedBrowser, GuidedLaunch, GuidedStepResult, GuidedLossReason, GuidedStartup } from '../run/guidedBrowser.js';
import { boundedStartup } from '../run/observedBootstrap.js';
import type { ActionStamp, GuidedRecorder, GuidedSessionRecording } from './evidence.js';
import type { ObservationConfig, ObservationFocus } from '../run/observationTypes.js';
import { domainAllowed, OriginNotAllowed } from '../allowedDomains.js';
import { closedCause } from '../run/closedError.js';

export const CALLBACK_PROBLEM_CODES: ReadonlySet<string> = new Set([
  'AUTH_DENIED', 'INVALID_CONTRACT', 'IDEMPOTENCY_CONFLICT', 'IDENTITY_MISMATCH', 'STALE_FENCE',
  'UNKNOWN_OUTCOME', 'CONTEXT_LOST', 'CONTEXT_REVISION', 'INPUT_IDENTITY', 'BINDING_DENIED',
  'BINDING_UNAVAILABLE', 'PREPARATION_DENIED', 'ADMISSION_DENIED', 'POLICY_DENIED', 'SCHEMA',
  'BUDGET_EXCEEDED', 'RECORDING_NOT_RETAINED',
]);
export interface CallbackFailureFacts {
  readonly route: 'OUTCOME' | 'OBSERVATION' | 'BOOTSTRAP' | 'LIFECYCLE' | 'RECORDING';
  readonly phase: 'SCHEMA' | 'TRANSPORT' | 'DEADLINE' | 'HTTP';
  readonly status: number | null;
  readonly backendCode: string;
}
const callbackFailures = new WeakMap<object, CallbackFailureFacts>();
/** Only caller-built closed facts enter this sink; the exception itself is never serialized. */
export function recordCallbackFailure(error: unknown, facts: CallbackFailureFacts, write: (line: string) => void): void {
  const snapshot = Object.freeze({ route: facts.route, phase: facts.phase,
    status: facts.status !== null && Number.isInteger(facts.status) && facts.status >= 100 && facts.status <= 599 ? facts.status : null,
    backendCode: CALLBACK_PROBLEM_CODES.has(facts.backendCode) ? facts.backendCode : 'UNKNOWN' });
  if (typeof error === 'object' && error !== null) callbackFailures.set(error, snapshot);
  try { write('GUIDED_CALLBACK_FAILED ' + JSON.stringify(snapshot) + '\n'); } catch { /* Diagnostics never change callback behavior. */ }
}

export interface GuidedRuntimeOptions {
  /** Volatile trusted test observer; never available in a mounted config or wire frame. */
  onRawFailure?: (error: unknown) => void;
  diagnosticStderr?: (text: string) => void;
  workerId: string;
  /** The runner's navigation whitelist (`STUDIO_RUNNER_ALLOWED_DOMAINS`); every origin and destination is checked against it. */
  allowedDomains: readonly string[];
  onStopping?: () => void;
  capabilities?: readonly string[];
  journalDirectory: string;
  /**
   * `startup` is the whole-start budget (REL-001/D4): a launcher that honours it fails at the deadline or
   * on abort with a {@link GuidedLaunchFailure} whose `close` kills only its own processes. One that
   * ignores it is still cut off by the runtime, which then keeps the slot held until it settles.
   */
  launch: GuidedLaunch;
  callback: (route: 'bootstrap-evidence' | 'observations' | 'outcomes' | 'lifecycle' | 'recording-evidence', message: unknown, idempotencyKey?: string) => Promise<void>;
  /**
   * Session recording composition (STUDIO-OBS-013 AC-1). Absent: the session records nothing and
   * stamps nothing. Present: one recording per session, settled after the browser is gone.
   */
  recorder?: GuidedRecorder;
  /** CSI segment of the recording key, from the claimed grant scope, never from the wire context. */
  csiId?: string;
}
type Ended<T> = { readonly kind: 'value'; readonly value: T } | { readonly kind: 'error'; readonly error: unknown } | { readonly kind: 'pending' };
/** How `work` ended, or `pending` once `ms` has passed. Never rejects and never leaves a timer behind. */
async function endedWithin<T>(work: Promise<T>, ms: number): Promise<Ended<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    work.then((value): Ended<T> => ({ kind: 'value', value }), (error: unknown): Ended<T> => ({ kind: 'error', error })),
    new Promise<Ended<T>>(resolve => { timer = setTimeout(() => { resolve({ kind: 'pending' }); }, Math.max(1, ms)); }),
  ]);
  if (timer) clearTimeout(timer);
  return result;
}
/** Last `start()` step entered. Closed vocabulary: it is logged on a failed start, never derived from input. */
export type GuidedStartPhase = 'VALIDATE' | 'JOURNAL' | 'RECORDER' | 'LAUNCH' | 'WITHHOLD' | 'BLANK_MATCH' | 'BOOTSTRAP_CALLBACK' | 'STARTED';
/**
 * A prepare refusal that carries the facts the wire reason allows (bridge#/definitions/refusal): the message is the reason, which the transport
 * maps to its code (`PREPARATION_DENIED` for all three step reasons). Line and column are the model's own code; matchCount counts locator matches.
 */
export class StepRefusal extends Error {
  constructor(reason: 'STEP_SYNTAX' | 'SOURCE_HASH_MISMATCH' | 'STEP_PRE_FENCE', readonly line: number | null = null, readonly column: number | null = null, readonly matchCount: number | null = null) {
    super(reason);
    this.name = 'StepRefusal';
  }
}
interface LedgerOutcome { state: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN_OUTCOME'; outcomeCode: 'OK' | 'ASSERTION_FAILED' | 'TARGET_CHANGED' | 'POLICY_DENIED' | 'TIMEOUT' | 'ACK_LOST' | 'CANCELLED' }
const FAILED_AS: Readonly<Record<string, LedgerOutcome['outcomeCode']>> = { ASSERTION_FAILED: 'ASSERTION_FAILED', TARGET_DRIFT: 'TARGET_CHANGED', TIMEOUT: 'TIMEOUT', CANCELLED: 'CANCELLED' };
/** The coarse ledger outcome a receipt's closed code derives (the table pinned by contract v3, E5 row 36): every refusal and contract fault is POLICY_DENIED. */
export function ledgerOutcomeOf(code: StepReceipt['closedCode']): LedgerOutcome {
  if (code === null) return { state: 'SUCCEEDED', outcomeCode: 'OK' };
  if (code === 'OUTCOME_UNKNOWN') return { state: 'UNKNOWN_OUTCOME', outcomeCode: 'ACK_LOST' };
  return { state: 'FAILED', outcomeCode: FAILED_AS[code] ?? 'POLICY_DENIED' };
}
/** AUTHORED-ECHO-01: source literals are already visible in the authored source. Independent
 * secret, captured-value and DOM-private provenance remains strict in the collector. */
function privateAuthoredValues(inputs: RunnerContext['authoredInputs']['inputs']): string[] {
  return inputs.flatMap(input => input.kind !== 'secretRef' && input.provenance.referenceKind === 'configuration' ? [input.value] : []);
}
interface LocalValue { value: string; producer: Producer; preparationId: string; }
export class GuidedRuntime {
  private browser: GuidedBrowser | null = null;
  private launching: Promise<GuidedBrowser> | null = null;
  private browserClosed = false;
  private failedLaunchClose: (() => Promise<void>) | null = null;
  /** Aborts the start in flight: on a stop, and on any start failure (REL-001/D4). */
  private readonly startAbort = new AbortController();
  /** How the launcher settled, once it has; `null` while it is still running (or hung). */
  private launchEnd: Ended<GuidedBrowser> | null = null;
  private journal: GuidedJournal | null = null;
  private diagnostics: GuidedDiagnostics | null = null;
  private evidence: ExecutionEvidence | null = null;
  private stopped = false;
  private startPhase: GuidedStartPhase | null = null;
  private lossReason: GuidedLossReason | null = null;
  private busy = false;
  private observationDeadlineHit = false;
  private preparing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly secretValues = new Set<string>();
  private readonly values = new Map<string, LocalValue>();
  private readonly prepared = new Map<string, { request: BridgeOrdinaryPrepare; proof: BridgePreparation; prefix?: BridgePrefixRequestIdentity }>();
  private readonly prefixRequests = new Map<string, Promise<BridgePrefixPrepareResult>>();
  private prefixExited = false;
  private driftReceipt: BridgeAdmittedDrift | null = null;
  private liveLease: string | null = null;
  private readonly contextAcknowledgements = new Map<string, BridgeContextAcknowledgement>();
  private readonly dispatched = new Set<string>();
  private readonly exercisedEdges: ConsumerEdge[] = [];
  private readonly ordinals = new Map<string, number>();
  private priorStep = 0;
  private actions = 0;
  private observations = 0;
  private evidenceBytes = 0;
  private readonly started = Date.now();
  private closing: Promise<void> | null = null;
  private recording: GuidedSessionRecording | null = null;
  private recordingSettlement: Promise<void> | null = null;
  /** A `PUBLISHED` stop was received: the recording is discarded instead of settled (its proof is the replay). Sticky, so a re-sent stop is harmless. */
  private published = false;
  constructor(private context: RunnerContext, private readonly options: GuidedRuntimeOptions) { this.context = structuredClone(context); this.prefixExited = !context.prefixProgram || context.prefixProgram.actions.length === 0; }
  get hasSecretInputs(): boolean { return this.context.authoredInputs.inputs.some(input => input.kind === 'secretRef'); }
  get active(): boolean { return !this.stopped || !this.browserClosed; }
  get accepting(): boolean { return !this.stopped && Date.now() < this.deadline(); }
  get currentIdentity(): BridgeIdentity { return identity(this.context); }
  /** Where a failed start stopped and, if the browser reported itself lost, why (REL-001). */
  get startFailure(): { readonly phase: GuidedStartPhase | null; readonly loss: GuidedLossReason | null } { return { phase: this.startPhase, loss: this.lossReason }; }
  /** A `PUBLISHED` stop that reaches a session already closing still turns its pending settlement into a discard. */
  markPublished(): void { this.published = true; }
  /** Resolves when the session recording has settled (upload, manifest, callback, cleanup) or been discarded. Never rejects. */
  get recordingSettled(): Promise<void> { return this.recordingSettlement ?? Promise.resolve(); }
  private live(): void { insist(!this.stopped && Date.now() < this.deadline(), 'CONTEXT_LOST'); }
  private deadline(): number { return Math.min(Date.parse(this.context.expiresAt), Date.parse(this.liveLease ?? this.context.leaseExpiresAt), this.started + this.context.limits.maxSessionSeconds * 1000); }
  /**
   * Why the session ends at {@link deadline}, decided from the instants and never from the clock when the
   * timer fires. A lease is capped at the session expiry, so the two coincide at the end of every session,
   * and a Node timer can fire a fraction of a millisecond before `Date.now()` reaches that instant. A tie
   * is the expiry; only a lease that ends strictly first is a lost lease.
   */
  private endReason(): 'EXPIRED' | 'LEASE_LOST' {
    return Math.min(Date.parse(this.context.expiresAt), this.started + this.context.limits.maxSessionSeconds * 1000) <= Date.parse(this.liveLease ?? this.context.leaseExpiresAt) ? 'EXPIRED' : 'LEASE_LOST';
  }
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    const reason = this.endReason();
    this.timer = setTimeout(() => { void this.stop(reason).catch(() => undefined); }, Math.max(0, this.deadline() - Date.now()));
    this.timer.unref();
  }
  applyAcknowledgedLease(leaseExpiresAt: string): void {
    this.live();
    insist(Number.isFinite(Date.parse(leaseExpiresAt)) && Date.parse(leaseExpiresAt)>Date.now() && Date.parse(leaseExpiresAt)>=Date.parse(this.liveLease ?? this.context.leaseExpiresAt) && Date.parse(leaseExpiresAt)<=Date.parse(this.context.expiresAt),'LEASE_LOST');
    this.liveLease=leaseExpiresAt;this.schedule();
  }
  private checkIdentity(message: BridgeIdentity): void { this.live(); insist(sameIdentity(message, this.context), 'IDENTITY_MISMATCH'); }
  setLiveLease(leaseExpiresAt: string): void { this.liveLease = leaseExpiresAt; }
  /**
   * Starts the session inside one budget: {@link GUIDED_START_BUDGET_MS} from this call, never past the
   * lease or the session expiry (REL-001/D4). Every awaited step is bounded; a failure at any step aborts
   * the signal the launcher holds. The deadline is a start failure like any other: `startFailure` names
   * the step that was running, and the innermost cause is `TIMEOUT` (`CANCELLED` on a stop).
   */
  async start(): Promise<void> {
    try { await this.startSteps(Date.now()); } catch (error) {
      // The first abort reason wins; a launcher still running reports it, so a deadline is never logged as a stop.
      this.startAbort.abort(error instanceof Error && error.message === 'TIMEOUT' ? error : new Error('CANCELLED'));
      // A deadline or a stop at any step is the same closed refusal as a failed launch; the wire message is never `TIMEOUT`.
      throw error instanceof Error && (error.message === 'TIMEOUT' || error.message === 'CANCELLED') ? new Error('CONTEXT_LOST', { cause: error }) : error;
    }
  }
  private async startSteps(began: number): Promise<void> {
    const bounded = <T,>(work: () => Promise<T>): Promise<T> => boundedStartup(work, Math.min(began + GUIDED_START_BUDGET_MS, this.deadline()), this.startAbort.signal);
    this.startPhase = 'VALIDATE';
    validate<RunnerContext>('runner-context', this.context);
    insist(this.context.workerId === this.options.workerId, 'IDENTITY_MISMATCH');
    const program = this.context.prefixProgram;
    insist((program === undefined) === (this.context.prefixProgramHash === undefined), 'INPUT_IDENTITY');
    if (program) {
      insist(hash(program) === this.context.prefixProgramHash && program.sourceStepIds.every((id, i) => id === this.context.sourceStepIds[i]), 'INPUT_IDENTITY');
      insist(program.sourceStepIds.length < this.context.sourceStepIds.length && program.actions.length <= this.context.limits.maxActions, 'INPUT_IDENTITY');
      let position = 0;
      for (const stepId of program.sourceStepIds) {
        const actions = program.actions.filter(action => action.coordinate.stepId === stepId);
        insist(actions.length > 0 && actions.length <= 8, 'INPUT_IDENTITY');
        for (const [ordinal, action] of actions.entries()) {
          insist(program.actions[position] === action && action.coordinate.ordinal === ordinal && action.operationHash === hash({ coordinate: action.coordinate, origin: action.origin, operation: action.operation }), 'INPUT_IDENTITY');
          // A frozen step is only ever run as the hash names it: the tamper is refused here, before any action.
          insist(action.guard.origin === action.origin && admit(action.coordinate, action.operation).ok, 'INPUT_IDENTITY');
          if (action.origin === null) insist(position === 0, 'INPUT_IDENTITY');
          else insist(domainAllowed(this.options.allowedDomains, action.origin), 'POLICY_DENIED');
          position++;
        }
      }
      insist(position === program.actions.length, 'INPUT_IDENTITY');
    }
    insist(hash(this.context.authoredInputs) === this.context.authoredInputsHash, 'INPUT_IDENTITY');
    const input = this.context.authoredInputs;
    insist(['sessionId','scopeHash','sourceRevision','configurationRevision'].every(k => input[k as keyof typeof input] === this.context[k as keyof RunnerContext]), 'INPUT_IDENTITY');
    insist(new Set(input.inputs.map(i => i.inputId)).size === input.inputs.length, 'INPUT_IDENTITY');
    insist(this.context.sourceStepIds.length <= this.context.limits.maxSourceSteps, 'BUDGET_EXCEEDED');
    insist(this.context.producers.length === 0 && this.context.consumerEdges.length === 0, 'CONTEXT_LOST');
    insist(Date.parse(this.context.leaseExpiresAt) <= Date.parse(this.context.expiresAt), 'LEASE_DENIED');
    this.live(); this.schedule();
    this.startPhase = 'JOURNAL';
    this.journal = await bounded(() => GuidedJournal.open(this.options.journalDirectory, this.context.sessionId));
    this.diagnostics = new GuidedDiagnostics(this.options.journalDirectory,this.context.sessionId,this.context.limits.maxActions);
    insist(!this.journal.recovered, 'CONTEXT_LOST');
    const journal = this.journal;
    await bounded(() => journal.consume({ contextId: this.context.contextId, sessionId: this.context.sessionId }));
    this.live();
    const limits = this.context.limits;
    const config: ObservationConfig = { sessionId: this.context.sessionId, scopeHash: this.context.scopeHash, allowedDomains: this.options.allowedDomains,
      knownSecrets: [], limits: { outlineBytes: limits.maxOutlineBytes, bytes: limits.maxObservationBytes } };
    this.startPhase = 'RECORDER';
    if (this.options.recorder) {
      const opening = this.options.recorder.open({ sessionId: this.context.sessionId, csiId: this.options.csiId ?? null, maxSessionSeconds: limits.maxSessionSeconds });
      let opened: GuidedSessionRecording;
      // A deadline or stop that abandons the open must not leak the recording it may still produce.
      try { opened = await bounded(() => opening); } catch (error) { this.recordingSettlement ??= opening.then(late => this.settleRecording(late, null, identity(this.context), false), () => undefined); throw error; }
      // A stop that raced the open already closed resources: settle (UNAVAILABLE) and clean up here.
      if (this.stopped) { this.recordingSettlement = this.settleRecording(opened, null, identity(this.context), false); throw new Error('CONTEXT_LOST'); }
      this.recording = opened;
    }
    const recordingRequest = this.recording?.launchRequest() ?? null;
    this.startPhase = 'LAUNCH';
    const startup: GuidedStartup = { deadlineEpochMs: Math.min(began + GUIDED_START_BUDGET_MS, this.deadline()), signal: this.startAbort.signal };
    const launching = this.options.launch(config, this.context.contextId, reason => {
      this.lossReason ??= reason ?? null;
      void this.stop('CONTEXT_LOST').catch(() => undefined);
    }, recordingRequest ?? undefined, startup);
    this.launching = launching;
    void launching.then((value): void => { this.launchEnd = { kind: 'value', value }; }, (error: unknown): void => { this.launchEnd = { kind: 'error', error }; });
    try { this.browser = await bounded(() => launching); } catch (error) {
      let verdict = error;
      if (!(error instanceof GuidedLaunchFailure) && error instanceof Error && (error.message === 'TIMEOUT' || error.message === 'CANCELLED')) {
        // The runtime's own deadline or a stop. Tell the launcher to give up. One that honours the signal rejects within
        // a few microtasks with the step it was in; wait for that, not for the clock: the reserve is for the teardown and the reply.
        this.startAbort.abort(error);
        for (let turn = 0; turn < 16 && this.launchEnd === null; turn++) await Promise.resolve();
        const ended = this.launchEnd;
        if (ended?.kind === 'error') verdict = ended.error;
        else if (ended?.kind === 'value') this.browser = ended.value;
      }
      if (verdict instanceof GuidedLaunchFailure) this.failedLaunchClose = verdict.close;
      throw new Error('CONTEXT_LOST', { cause: verdict });
    }
    if (this.stopped) { await this.closing; throw new Error('CONTEXT_LOST'); }
    this.startPhase = 'WITHHOLD';
        const started = this.browser;
    await bounded(() => started.observations.withhold(privateAuthoredValues(input.inputs)));
    this.live(); this.evidence = started.evidence;
    this.startPhase = 'BLANK_MATCH';
    const evidence = this.evidence;
    insist(evidence.kind === 'initialBlank' && await bounded(() => started.observations.current({ kind: 'blank' })), 'CONTEXT_LOST');
    this.startPhase = 'BOOTSTRAP_CALLBACK';
    await bounded(() => this.options.callback('bootstrap-evidence', { ...identity(this.context), executionEvidence: evidence, evidenceHash: hash(evidence) }));
    this.startPhase = 'STARTED';
  }
  async update(value: unknown, deliveryId?: string): Promise<BridgeIdentity | BridgeContextAcknowledgement> {
    const next = validate<RunnerContext>('runner-context', value); this.live();
    for (const key of ['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','sourceRevision','configurationRevision','versions'] as const) insist(canonical(next[key]) === canonical(this.context[key]), 'IDENTITY_MISMATCH');
    const appended = next.contextRevision !== this.context.contextRevision;
    const issuedHash = hash(next);
    if (deliveryId && this.contextAcknowledgements.has(deliveryId)) {
      const prior = this.contextAcknowledgements.get(deliveryId); insist(prior?.contextHash === issuedHash, 'CONTEXT_REVISION'); return prior;
    }
    insist(!this.busy && !this.preparing, 'BUSY');
    for (const key of ['expiresAt','sourceStepIds','limits','prefixProgram','prefixProgramHash'] as const) insist(canonical(next[key] ?? null) === canonical(this.context[key] ?? null), 'INPUT_IDENTITY');
    insist(next.materializationRevision >= this.context.materializationRevision && Date.parse(next.leaseExpiresAt) <= Date.parse(next.expiresAt) && Date.parse(next.leaseExpiresAt) >= Date.parse(this.context.leaseExpiresAt), 'CONTEXT_REVISION');
    if (appended) {
      insist(next.contextRevision === this.context.contextRevision + 1 && next.contextRevision <= 201 && next.materializationRevision === this.context.materializationRevision + 1 && this.prefixExited && typeof deliveryId === 'string', 'CONTEXT_REVISION');
      insist(![...this.prepared.values()].some(p => Date.parse(p.proof.expiresAt) > Date.now()), 'BUSY');
      const prior = this.context.authoredInputs.inputs, inputs = next.authoredInputs.inputs;
      insist(inputs.length > prior.length && inputs.length <= 200 && prior.every((input, i) => canonical(input) === canonical(inputs[i])), 'INPUT_IDENTITY');
      const oldEnvelope = {...this.context.authoredInputs,inputs:null}, newEnvelope = {...next.authoredInputs,inputs:null};
      insist(canonical(oldEnvelope) === canonical(newEnvelope) && hash(next.authoredInputs) === next.authoredInputsHash && new Set(inputs.map(i => i.inputId)).size === inputs.length, 'INPUT_IDENTITY');
      insist(Buffer.byteLength(canonical(next.authoredInputs)) <= 1048576 && inputs.reduce((n, i) => n + Buffer.byteLength(canonical(i)), 0) <= 1048576 && inputs.every(i => Buffer.byteLength(canonical(i)) <= 32768), 'BUDGET_EXCEEDED');
    } else insist(canonical(next.authoredInputs) === canonical(this.context.authoredInputs) && next.authoredInputsHash === this.context.authoredInputsHash, 'INPUT_IDENTITY');
    for (const key of ['producers','consumerEdges'] as const) for (const prior of this.context[key]) insist(next[key].some(item => canonical(item) === canonical(prior)), 'CONTEXT_REVISION');
    for (const allocation of this.context.allocations) {
      const replacement = next.allocations.find(a => a.bindingId === allocation.bindingId);
      insist(replacement && replacement.needId === allocation.needId && replacement.producerStepId === allocation.producerStepId && allocation.consumers.every(c => replacement.consumers.some(n => canonical(n) === canonical(c))), 'CONTEXT_REVISION');
    }
    if (next.materializationRevision === this.context.materializationRevision) for (const key of ['allocations','producers','consumerEdges'] as const) insist(canonical(next[key]) === canonical(this.context[key]), 'CONTEXT_REVISION');
    insist(new Set(next.allocations.map(a => a.bindingId)).size === next.allocations.length, 'CONTEXT_REVISION');
    for (const local of this.values.values()) insist(next.producers.some(p => canonical(p) === canonical(local.producer)), 'CONTEXT_REVISION');
    for (const edge of this.exercisedEdges) insist(next.consumerEdges.some(e => canonical(e) === canonical(edge)), 'CONTEXT_REVISION');
    insist(new Set(next.consumerEdges.map(e => `${e.consumerAdmissionId}:${e.bindingId}`)).size === next.consumerEdges.length, 'CONTEXT_REVISION');
    for (const producer of next.producers) insist(canonical(this.values.get(producer.bindingId)?.producer ?? null) === canonical(producer), 'CONTEXT_LOST');
    if (appended) {
      insist(this.browser, 'CONTEXT_LOST'); this.busy = true;
      try { await this.browser.observations.withhold(privateAuthoredValues(next.authoredInputs.inputs.slice(this.context.authoredInputs.inputs.length))); this.live(); }
      catch { await this.stop('CONTEXT_LOST'); throw new Error('CONTEXT_LOST'); }
      finally { this.busy = false; }
      this.prepared.clear();
    }
    this.context = structuredClone(next); this.schedule();
    if (deliveryId && next.contextRevision >= 2) {
      const ack: BridgeContextAcknowledgement = { schemaVersion: 3, sessionId: next.sessionId, workerId: next.workerId, ownerFence: next.ownerFence, scopeHash: next.scopeHash, contextId: next.contextId, contextRevision: next.contextRevision, authoredInputsHash: next.authoredInputsHash, sourceRevision: next.sourceRevision, configurationRevision: next.configurationRevision, materializationRevision: next.materializationRevision, contextHash: issuedHash, deliveryId };
      this.contextAcknowledgements.set(deliveryId, ack); return ack;
    }
    return identity(next);
  }
  private checkProposal(p: Action): void {
    insist(!this.options.capabilities || this.options.capabilities.includes(p.operation.kind), 'POLICY_DENIED');
    insist(p.sessionId === this.context.sessionId && p.scopeHash === this.context.scopeHash && p.contextRevision === this.context.contextRevision && p.authoredInputsHash === this.context.authoredInputsHash, 'IDENTITY_MISMATCH');
    insist(this.evidence && canonical(this.evidence) === canonical(p.executionEvidence) && hash(p.executionEvidence) === p.evidenceHash, 'TARGET_CHANGED');
    insist(p.generation === p.executionEvidence.generation, 'TARGET_CHANGED');
    const index = this.context.sourceStepIds.indexOf(p.coordinate.stepId);
    insist(index >= this.priorStep && p.coordinate.ordinal === (this.ordinals.get(p.coordinate.stepId) ?? 0) && p.coordinate.ordinal < 8 && this.actions < this.context.limits.maxActions, 'ACTION_ORDER');
    if (p.executionEvidence.kind === 'initialBlank') insist(this.actions === 0 || this.driftReceipt?.phase === 'ADMITTED_PRE_INVOCATION' && canonical(this.driftReceipt.coordinate) === canonical(p.coordinate), 'INITIAL_BLANK');
    else insist(domainAllowed(this.options.allowedDomains, p.executionEvidence.origin), 'POLICY_DENIED');
    const op = p.operation;
    // What the step reads: an authored input of this step, a secret reference of this step, or a binding the plan allocated to it.
    for (const use of op.uses) {
      if (use.kind === 'binding') insist(this.context.allocations.some(a => a.bindingId === use.id && a.consumers.some(c => c.stepId === p.coordinate.stepId)), 'BINDING_DENIED');
      else {
        const input = this.context.authoredInputs.inputs.find(i => (use.kind === 'input' ? i.inputId === use.id : i.kind === 'secretRef' && i.secretId === use.id));
        insist(input && input.sourceStepId === p.coordinate.stepId && (use.kind === 'secret') === (input.kind === 'secretRef'), 'INPUT_IDENTITY');
        if (use.kind === 'input' && input.kind === 'destination') insist(domainAllowed(this.options.allowedDomains, input.value), 'POLICY_DENIED');
      }
    }
    // What the step produces: a binding the plan allocated to this step, not yet captured.
    for (const bindingId of op.captures) insist(this.context.allocations.some(a => a.bindingId === bindingId && a.producerStepId === p.coordinate.stepId) && !this.values.has(bindingId), 'BINDING_DENIED');
  }
  /** Whether the page is still the document the model was shown (or still the blank document): no navigation since, and nothing about the DOM revision. */
  private async pageCurrent(p: Action): Promise<boolean> {
    if (!this.browser) return false;
    const e = p.executionEvidence;
    if (e.kind === 'initialBlank') return this.browser.observations.current({ kind: 'blank' });
    return this.browser.observations.current({ kind: 'document', documentId: e.documentId, generation: e.generation, origin: e.origin });
  }
  /** The values the step is given: authored inputs by id and captured values by binding id, exactly the ones its `uses` name. */
  private stepGivens(p: Action): { inputs: Record<string, string>; vars: Record<string, string>; secretIds: string[] } {
    const inputs: Record<string, string> = {}, vars: Record<string, string> = {}, secretIds: string[] = [];
    for (const use of p.operation.uses) {
      if (use.kind === 'secret') secretIds.push(use.id);
      else if (use.kind === 'input') { const input = this.context.authoredInputs.inputs.find(i => i.inputId === use.id); insist(input && input.kind !== 'secretRef', 'INPUT_IDENTITY'); inputs[use.id] = input.value; }
      else { const local = this.values.get(use.id); insist(local, 'BINDING_UNAVAILABLE'); vars[use.id] = local.value; }
    }
    return { inputs, vars, secretIds };
  }
  async prepare(value: unknown): Promise<BridgePreparation> {
    insist(!this.preparing, 'BUSY');
    if (this.context.prefixProgram && !this.prefixExited) throw new Error('PREPARATION_DENIED');
    return this.prepareOrdinary(value);
  }
  /** Admit the code (its hash and its syntax), then run it up to its first effectful call: a step that cannot find its target is refused here, with no effect, and the model repairs it. */
  private async prepareOrdinary(value: unknown, prefixAction?: PrefixAction): Promise<BridgePreparation> {
    const request = validate<BridgeOrdinaryPrepare>('bridge', value, 'ordinaryPrepare'); this.checkIdentity(request); insist(!this.busy, 'BUSY');
    this.checkProposal(request.proposal); insist(hash(request.proposal) === request.requestDigest && Date.parse(request.expiresAt) > Date.now() && Date.parse(request.expiresAt) <= Date.parse(this.context.expiresAt), 'PREPARATION_DENIED');
    const p = request.proposal;
    const admission = admit(p.coordinate, p.operation);
    if (!admission.ok) {
      if (admission.reason === 'STEP_SYNTAX') throw new StepRefusal('STEP_SYNTAX', admission.syntax?.line ?? 1, admission.syntax?.column ?? 1);
      if (admission.reason === 'SOURCE_HASH_MISMATCH') throw new StepRefusal('SOURCE_HASH_MISMATCH');
      throw new Error('INVALID_CONTRACT');
    }
    insist(await this.pageCurrent(p), 'TARGET_CHANGED'); this.live();
    // A retained prefix step is frozen code that already ran: its pre-fence drift is judged at dispatch (the admitted-drift receipt), not here.
    if (prefixAction === undefined) await this.runToFence(p);
    insist(this.prepared.size < this.context.limits.maxActions, 'BUDGET_EXCEEDED');
    const proof: BridgePreparation = { ...identity(request), preparationId: randomUUID(), requestDigest: request.requestDigest, evidenceHash: p.evidenceHash, authoredInputsHash: this.context.authoredInputsHash, expiresAt: Date.parse(request.expiresAt)<=this.deadline()?request.expiresAt:new Date(this.deadline()).toISOString() };
    this.prepared.set(proof.preparationId, { request: structuredClone(request), proof }); return proof;
  }
  private async runToFence(p: Action): Promise<void> {
    const browser = this.browser;
    insist(browser, 'CONTEXT_LOST');
    const givens = this.stepGivens(p);
    const limit = Math.min(this.deadline(), Date.now() + PREPARE_BUDGET_MS);
    this.preparing = true;
    let outcome: GuidedStepResult;
    try {
      // Until-fence mode stops before the fence; the child refuses a fence request on a prepare, and the proxy kills a child that sends one.
      outcome = await browser.step({ mode: 'prepare', coordinate: p.coordinate, operation: p.operation, ...givens, deadlineEpochMs: limit }, { onFence: () => Promise.reject(new Error('CONTEXT_LOST')) });
    } finally { this.preparing = false; }
    this.live();
    // Nothing may have happened: a step that reached an effect before its first effectful call is broken, and the session ends.
    if (outcome.receipt.fenceCrossed || outcome.receipt.effects.length > 0) { await this.stop('UNKNOWN_OUTCOME'); throw new Error('CONTEXT_LOST'); }
    const code = outcome.receipt.closedCode;
    // A failing expect here is a result, not a repair: dispatch runs the step again and records it.
    if (code === null || code === 'ASSERTION_FAILED') return;
    // The bridge schema requires an integer here; a read that failed is counted (FIX-36), so 0 now only stands for an uncountable target.
    if (code === 'TARGET_DRIFT' || code === 'TIMEOUT') throw new StepRefusal('STEP_PRE_FENCE', null, null, outcome.matchCount ?? 0);
    if (code === 'PASSWORD_CONTROL_READ_REFUSED') throw new Error('PASSWORD_CONTROL_READ_REFUSED');
    if (code === 'POLICY_REFUSED' || code === 'REFERENCE_MISMATCH' || code === 'REFERENCE_REFUSED' || code === 'READ_REFUSED') throw new Error('POLICY_DENIED');
    if (code === 'CANCELLED') throw new Error('CONTEXT_LOST');
    throw new Error('PREPARATION_DENIED');
  }
  async preparePrefix(value: unknown): Promise<BridgePrefixPrepareResult> {
    const envelope = validate<BridgePrefixPrepare>('bridge', value, 'PrefixPrepare');
    const r = envelope.request; this.live();
    for (const key of ['sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','authoredInputsHash','prefixProgramHash'] as const) insist(r[key] === this.context[key], 'IDENTITY_MISMATCH');
    insist(envelope.requestDigest === hash(r) && r.evidenceHash === hash(this.evidence), 'TARGET_CHANGED');
    const prior = this.prefixRequests.get(envelope.requestDigest); if (prior) return prior;
    insist(this.context.prefixProgram && !this.prefixExited && !this.busy && !this.preparing && !this.driftReceipt, 'PREPARATION_DENIED');
    insist(this.prefixRequests.size < Math.min(400, this.context.limits.maxObservations), 'BUDGET_EXCEEDED');
    this.preparing = true;
    const work = this.acquirePrefix(envelope).finally(() => { this.preparing = false; }); this.prefixRequests.set(envelope.requestDigest, work); return work;
  }
  private async acquirePrefix(envelope: BridgePrefixPrepare): Promise<BridgePrefixPrepareResult> {
    const r = envelope.request, program = this.context.prefixProgram, evidence = this.evidence;
    insist(program && this.browser && evidence, 'CONTEXT_LOST');
    const action = program.actions.find(a => canonical(a.coordinate) === canonical(r.coordinate));
    insist(action && r.coordinate.ordinal === (this.ordinals.get(r.coordinate.stepId) ?? 0), 'ACTION_ORDER');
    try {
      this.preparing = false; // prepareOrdinary runs under the prefix call's own flag; it does not take a second one.
      const proposal: Action = { schemaVersion: 3, sessionId: r.sessionId, coordinate: action.coordinate, scopeHash: r.scopeHash, generation: evidence.generation, operation: action.operation, executionEvidence: evidence, evidenceHash: r.evidenceHash, authoredInputsHash: r.authoredInputsHash, contextRevision: r.contextRevision };
      const preparation = await this.prepareOrdinary({ ...identity(this.context), proposal, requestDigest: hash(proposal), expiresAt: new Date(this.deadline()).toISOString() }, action);
      const local = this.prepared.get(preparation.preparationId); insist(local, 'PREPARATION_DENIED'); local.prefix = r;
      return { kind: 'PREPARED', requestDigest: envelope.requestDigest, proposal, preparation };
    } catch (error) { await this.stop('CONTEXT_LOST'); throw error; }
    finally { this.preparing = true; }
  }
  private makeDrift(request: BridgePrefixRequestIdentity, operationHash: string, spent: { admissionId: string; preparationId: string }): BridgeAdmittedDrift {
    const body = { ...request, requestDigest: hash(request), operationHash, attemptOrdinal: 0 as const, nativeInvocationStarted: false as const, reason: 'TARGET_DRIFT' as const, phase: 'ADMITTED_PRE_INVOCATION' as const, ...spent };
    return { ...body, receiptHash: hash(body) };
  }
  /** The producer, allocation, order and edge checks of one binding a step reads (one consumer edge per binding, at most 16 per step); returns the value. */
  private bindingValue(p: Action, bindingId: string, admissionId: string, edges: readonly ConsumerEdge[]): string {
    const local = this.values.get(bindingId); const producer = this.context.producers.find(v => v.bindingId === bindingId); const allocation = this.context.allocations.find(v => v.bindingId === bindingId);
    insist(local && producer && canonical(producer) === canonical(local.producer) && allocation, 'BINDING_UNAVAILABLE');
    const producerIndex = this.context.sourceStepIds.indexOf(producer.coordinate.stepId), consumerIndex = this.context.sourceStepIds.indexOf(p.coordinate.stepId);
    insist(producerIndex < consumerIndex || (producerIndex === consumerIndex && producer.coordinate.ordinal < p.coordinate.ordinal), 'BINDING_ORDER');
    insist(allocation.consumers.some(c => c.stepId === p.coordinate.stepId), 'BINDING_DENIED');
    const own = edges.filter(e => e.bindingId === bindingId); insist(own.length === 1, 'BINDING_DENIED'); const edge = own[0];
    insist(edge && edge.producerAdmissionId === producer.producerAdmissionId && edge.consumerAdmissionId === admissionId && canonical(edge.coordinate) === canonical(p.coordinate) && edge.destinationOrigin === p.executionEvidence.origin && edge.destinationOrigin === producer.origin, 'BINDING_DENIED');
    return local.value;
  }
  async dispatch(value: unknown): Promise<BridgeOutcome> {
    const request = validate<BridgeDispatch>('bridge', value, 'dispatch'); this.checkIdentity(request); insist(!this.busy && !this.preparing, 'BUSY');
    const { proposal: p, ledger } = request; const prepared = this.prepared.get(request.preparationId);
    insist(prepared && Date.parse(prepared.proof.expiresAt) > Date.now() && canonical(prepared.request.proposal) === canonical(p), 'PREPARATION_DENIED');
    this.checkProposal(p);
    const replacement = this.driftReceipt?.phase === 'ADMITTED_PRE_INVOCATION' && canonical(this.driftReceipt.coordinate) === canonical(p.coordinate);
    insist(ledger.attemptOrdinal === (replacement ? 1 : 0), 'ADMISSION_DENIED');
    const operationHash = hash({ coordinate: p.coordinate, origin: p.executionEvidence.origin, operation: p.operation });
    insist(ledger.state === 'DISPATCHING' && ledger.dispatchCount === 1 && ledger.outcomeCode === 'PENDING' && ledger.preparationId === request.preparationId && ledger.requestDigest === hash(p) && ledger.operationHash === operationHash && ledger.ownerFence === request.ownerFence && ledger.documentId === p.executionEvidence.documentId, 'ADMISSION_DENIED');
    for (const k of ['sessionId','scopeHash','generation','coordinate','executionEvidence','evidenceHash','authoredInputsHash','contextRevision'] as const) insist(canonical(ledger[k]) === canonical(p[k]), 'ADMISSION_DENIED');
    const admissionId = ledger.admission.admissionId; insist(!this.dispatched.has(admissionId), 'ALREADY_CONSUMED');
    // Every binding the step reads has exactly one edge; every secret it reads arrives with its value, and no other does.
    const bindingUses = p.operation.uses.flatMap(u => u.kind === 'binding' ? [u.id] : []), secretUses = p.operation.uses.flatMap(u => u.kind === 'secret' ? [u.id] : []);
    insist(request.consumerEdges.length === bindingUses.length, 'BINDING_DENIED');
    for (const bindingId of bindingUses) this.bindingValue(p, bindingId, admissionId, request.consumerEdges);
    insist(request.secrets.length === secretUses.length && request.secrets.every(secret => secretUses.includes(secret.secretId)) && new Set(request.secrets.map(secret => secret.secretId)).size === secretUses.length, 'INPUT_IDENTITY');
    for (const secret of request.secrets) {
      const input = this.context.authoredInputs.inputs.find(i => i.kind === 'secretRef' && i.secretId === secret.secretId);
      insist(input?.kind === 'secretRef' && input.sourceStepId === p.coordinate.stepId, 'INPUT_IDENTITY');
      insist(secret.value.length <= 4096, 'SECRET_TOO_LONG');
      this.secretValues.add(secret.value);
    }
    const givens = this.stepGivens(p);
    // Existing finite input/action/runtime budgets bound this volatile capability. stop() can
    // erase shared inventories at any await; this one action must still redact earlier values.
    const failureValues=[...this.secretValues,...[...this.values.values()].map(v=>v.value),...this.context.authoredInputs.inputs.flatMap(input=>'value' in input?[input.value]:[]),...request.secrets.map(secret=>secret.value)];
    let failureRedactor:Redactor|null=createRedactor(failureValues);
    let diagnostics:GuidedDiagnostics|null=this.diagnostics;
    this.exercisedEdges.push(...structuredClone(request.consumerEdges));
    this.busy = true; this.dispatched.add(admissionId); this.prepared.clear();
    // The secret values travel only in the dispatch step message; this object is emptied in the finally below.
    const stepSecrets: Record<string, { value: string; allowedOrigins: readonly string[] }> = {};
    for (const secret of request.secrets) stepSecrets[secret.secretId] = { value: secret.value, allowedOrigins: [...secret.allowedOrigins] };
    const dispatchStarted = Date.now();
    const windowEnd = Math.min(this.deadline(), dispatchStarted + DISPATCH_WINDOW_MS);
    let consumed = false;
    let completed: BridgeOutcome | null = null;
    const timing: { stamp: ActionStamp | null } = { stamp: null };
    const nativeFence = { started: false };
    const tally = newTally();
    /** The child's own evidence of how each secret was used; empty until its receipt is accepted. */
    let childSecretUse: Readonly<Record<string, SecretUseStatus>> = {};
    // The journal fence, asked for by the child before its first native effect. The child waits for the answer: it is acked only after
    // journal.fence returned, and any failure here is a nack (no native call, no retry); the dispatch catch path ends the session.
    const onFence = (): Promise<void> => {
      try {
        this.live(); if (nativeFence.started) return Promise.resolve();
        insist(this.journal, 'JOURNAL_UNAVAILABLE');
        this.journal.fence({ schemaVersion: 3, sessionId: request.sessionId, contextId: request.contextId, ownerFence: request.ownerFence, admissionId, operationHash, state: 'INVOKING', receiptHash: null });
        nativeFence.started = true; tally.fenceCrossed = true; timing.stamp = this.recording?.begin(admissionId, p.coordinate.stepId, p.coordinate.ordinal) ?? null;
        return Promise.resolve();
      } catch (error) { return Promise.reject(error instanceof Error ? error : new Error('JOURNAL_UNAVAILABLE')); }
    };
    const secretUseOf = (receipt: StepReceipt): Record<string, SecretUseStatus> => {
      // A status the child lost (an attempt that did not prove an outcome) is reported as used if the fence was crossed: the secret may have been written.
      return Object.fromEntries(secretUses.map(id => [id, childSecretUse[id] ?? (receipt.fenceCrossed ? 'USED' : 'NOT_USED')]));
    };
    const outcomeOf = (receipt: StepReceipt, availability: BridgeOutcome['availability'], errorMessage?: string): BridgeOutcome => {
      const derived = ledgerOutcomeOf(receipt.closedCode);
      return { ...identity(request), ledger: { ...ledger, state: derived.state, outcomeCode: derived.outcomeCode }, availability, receipt, secretUse: secretUseOf(receipt), ...(errorMessage ? { errorMessage } : {}) };
    };
    try {
      insist(this.browser && this.journal, 'CONTEXT_LOST');
      this.actions++; await this.journal.consume({ sessionId: request.sessionId, contextId: request.contextId, ownerFence: request.ownerFence, admissionId }); consumed = true;
      this.live(); insist(await this.pageCurrent(p), 'TARGET_CHANGED'); this.live();
      // AC-2: the run-clock reading immediately before the browser effect (AR-1 R2 "action"). Timing starts only when the native fence is committed.
      const stepped = await this.browser.step({ mode: 'dispatch', coordinate: p.coordinate, operation: p.operation, ...givens, secrets: stepSecrets, deadlineEpochMs: windowEnd }, { onFence });
      // The server's own fence state decides. If it journalled the fence but the child's receipt shows none (a stop between the ack and the native call),
      // nobody knows what the page did: the child's receipt is discarded and the outcome is unknown.
      const disagrees = nativeFence.started && !stepped.receipt.fenceCrossed;
      const outcome: GuidedStepResult = disagrees ? { receipt: receiptFromTally(p.operation, tally, 'OUTCOME_UNKNOWN'), captured: {}, fenceReached: true, secretUse: {} } : stepped;
      childSecretUse = outcome.secretUse;
      const receipt = outcome.receipt;
      timing.stamp?.end(receipt.closedCode === null); // The effect's result is known (or proven absent); before any outcome callback.
      this.live();
      let availability: BridgeOutcome['availability'] = [];
      if (receipt.closedCode === null) {
        const added: Producer[] = [];
        for (const [bindingId, captured] of Object.entries(outcome.captured)) {
          insist(p.executionEvidence.origin !== null && captured.trim(), 'READ_DENIED'); canonical(captured);
          const bytes = Buffer.byteLength(captured); const total = [...this.values.values()].reduce((n,v) => n + Buffer.byteLength(v.value), 0);
          insist(!this.values.has(bindingId) && bytes <= this.context.limits.maxRuntimeValueBytes && this.values.size < this.context.limits.maxRuntimeValues && total + bytes <= this.context.limits.maxRuntimeValuesBytesTotal, 'BUDGET_EXCEEDED');
          // This new bounded value was unknown before the capture. Mask it before withhold can await or stop can erase the shared map.
          failureValues.push(captured);failureRedactor=createRedactor(failureValues);
          const available = { bindingId, producerAdmissionId: admissionId, contextId: this.context.contextId, workerId: this.context.workerId, ownerFence: this.context.ownerFence };
          const producer: Producer = { bindingId, producerAdmissionId: admissionId, coordinate: p.coordinate, origin: p.executionEvidence.origin, availability: available };
          this.values.set(bindingId, { value: captured, producer, preparationId: request.preparationId });
          await this.browser.observations.commitCapture(captured);
          added.push(producer);
        }
        availability = added.map(producer => producer.availability);
        this.live();
      }
      // A pre-fence drift of a retained prefix step is the one failure that switches to learning: an admitted-drift receipt and no stop.
      // The step did not run, so its ordinal and the prior-step mark stay where they were: the replacement is attempt 1 of the same step.
      const prefixDrift = receipt.closedCode === 'TARGET_DRIFT' && !receipt.fenceCrossed && prepared.prefix && !this.driftReceipt && this.accepting && ledger.attemptOrdinal === 0;
      if (!prefixDrift) {
        this.ordinals.set(p.coordinate.stepId, p.coordinate.ordinal + 1); this.priorStep = this.context.sourceStepIds.indexOf(p.coordinate.stepId);
        if (prepared.prefix && this.context.prefixProgram?.actions.every(a => (this.ordinals.get(a.coordinate.stepId) ?? 0) > a.coordinate.ordinal)) this.prefixExited = true;
      }
      const result = outcomeOf(receipt, availability);
      if (receipt.closedCode !== null) {
        if (prefixDrift && prepared.prefix) {
          try {
            const drift = this.makeDrift(prepared.prefix, operationHash, { admissionId, preparationId: request.preparationId });
            insist(this.journal, 'JOURNAL_UNAVAILABLE');
            this.journal.fence({ schemaVersion: 3, sessionId: request.sessionId, contextId: request.contextId, ownerFence: request.ownerFence, admissionId, operationHash, state: 'REFUSED_BEFORE_INVOCATION', receiptHash: drift.receiptHash });
            await this.options.callback('outcomes', { kind: 'prefixDrift', receipt: drift, ledger: result.ledger }, `drift-${drift.receiptHash}`);
            this.live(); this.driftReceipt = drift; this.prefixExited = true; return result;
          } catch { await this.stop('UNKNOWN_OUTCOME'); return outcomeOf({ ...receipt, closedCode: 'OUTCOME_UNKNOWN' }, []); }
        }
        // Any other failure ends the session: the outcome is committed as it is, then the stop.
        completed = result;
        await this.options.callback('outcomes', result);
        await this.stop(result.ledger.state === 'FAILED' ? 'CONTEXT_LOST' : 'UNKNOWN_OUTCOME'); return result;
      }
      // A committed success stays success if its response is lost. No action retry, ever.
      completed = result;
      await this.options.callback('outcomes', result);
      this.live();
      // The automatic observation shares the dispatch call's transport window with the action: it gets what remains of it, and is skipped
      // below the minimum (the backend then pulls the observation in a separate call). A deadline here leaves the committed outcome committed.
      const remaining = DISPATCH_WINDOW_MS - (Date.now() - dispatchStarted);
      if (remaining >= MIN_AUTOMATIC_OBSERVATION_MS) {
        try { await this.collectObservation(undefined, undefined, remaining); } catch (error) { if (!(error instanceof Error && error.message === 'OBSERVATION_DEADLINE')) throw error; this.observationDeadlineHit = true; }
      }
      return result;
    } catch (error) {
      if (completed) {
        const facts = typeof error === 'object' && error !== null ? callbackFailures.get(error) : undefined;
        try { (this.options.diagnosticStderr ?? (line => { process.stderr.write(line); }))('GUIDED_COMPLETED_FAILED ' + JSON.stringify({ ...(facts ?? { route: 'OUTCOME', phase: 'UNKNOWN', status: null, backendCode: 'UNKNOWN' }), cause: closedCause(error) }) + '\n'); } catch { /* Diagnostics never change a known outcome. */ }
        await this.stop('CONTEXT_LOST'); return completed;
      }
      try { this.options.onRawFailure?.(error); } catch { /* Volatile test observation is non-authoritative. */ }
      const errorMessage = consumed ? await diagnostics?.record({sessionId:request.sessionId,contextId:request.contextId,admissionId,stepId:p.coordinate.stepId,ordinal:p.coordinate.ordinal},error,failureRedactor,this.options.diagnosticStderr ?? (text=>{process.stderr.write(text);})):undefined;
      // A failure outside the step (the session, the journal, a callback): before the fence nothing happened, after it nobody knows.
      const message = error instanceof Error ? error.message : ''; // a closed error's message is its code
      const closedCode: StepReceipt['closedCode'] = nativeFence.started ? 'OUTCOME_UNKNOWN' : message === 'TARGET_CHANGED' ? 'TARGET_DRIFT' : message === 'POLICY_DENIED' ? 'POLICY_REFUSED' : message === 'CONTEXT_LOST' ? 'CANCELLED' : message === 'TIMEOUT' ? 'TIMEOUT' : 'INTERNAL_ERROR';
      const receipt = receiptFromTally(p.operation, tally, closedCode);
      timing.stamp?.end(!nativeFence.started && closedCode !== 'INTERNAL_ERROR'); // OUTCOME_UNKNOWN observed no completion: endMs stays null.
      const outcome = outcomeOf(receipt, [], errorMessage);
      if (consumed) await this.options.callback('outcomes', outcome).catch(() => undefined);
      await this.stop(outcome.ledger.state === 'FAILED' ? 'CONTEXT_LOST' : 'UNKNOWN_OUTCOME'); return outcome;
    } finally { this.busy = false; for (const id of Object.keys(stepSecrets)) Reflect.deleteProperty(stepSecrets, id); (request.secrets as BridgeDispatch['secrets'][number][]).length = 0; /* the request object keeps no secret value; `secrets` is a required field, so it is emptied, not deleted (a replayed request must still reach ALREADY_CONSUMED) */ failureValues.length=0;failureRedactor=null;diagnostics=null; }
  }
  async refreshObservation(value: unknown, idempotencyKey: string): Promise<BridgeObservation> {
    const request=validate<ObservationRefresh>('observation-refresh',value);this.checkIdentity(request);insist(!this.busy&&!this.preparing,'BUSY');
    // A post-dispatch observation that ran out of time left the blank evidence in place; the backend's pull then asks for generation 0 again. That is the
    // deadline refusal (the page is too heavy to observe), not a stale generation. The session is NOT stopped here: the refusal is the backend's cue to end it as
    // UNSUPPORTED_SURFACE, and a runner that stopped first would be reported lost (a different, earlier terminal) instead.
    if(this.observationDeadlineHit&&this.evidence?.kind==='initialBlank'&&request.expectedGeneration===this.evidence.generation){throw new Error('OBSERVATION_DEADLINE');}
    // The blank document bootstrap leaves (generation 0) is observed like any other: it is the first turn's observation. Any other generation is stale.
    insist((this.evidence?.kind==='observedDocument'||this.evidence?.kind==='initialBlank')&&request.expectedGeneration===this.evidence.generation,'TARGET_CHANGED');
    insist(idempotencyKey.length>0&&idempotencyKey.length<=256,'SCHEMA');
    const callbackKey=`oref-${hash({identity:identity(request),idempotencyKey,requestDigest:hash(request)})}`;
    this.busy=true;this.prepared.clear();
    try{return await this.collectObservation(callbackKey,request.focus);}catch(error){if(!(error instanceof Error&&error.message==='OBSERVATION_DEADLINE'))await this.stop('CONTEXT_LOST');throw new Error(error instanceof OriginNotAllowed?'POLICY_DENIED':error instanceof Error&&(error.message==='BUDGET_EXCEEDED'||error.message==='OBSERVATION_DEADLINE')?error.message:'CONTEXT_LOST');}finally{this.busy=false;}
  }
  /** A cached read is usable only while it is still the current acknowledged evidence. */
  currentObservation(value: unknown): BridgeObservation {
    const envelope=validate<BridgeObservation>('bridge',value,'observation');this.checkIdentity(envelope);insist(!this.busy,'BUSY');
    insist(this.evidence?.kind==='observedDocument'&&envelope.observation.documentId===this.evidence.documentId&&envelope.observation.generation===this.evidence.generation&&hash(envelope.observation)===this.evidence.observationHash,'TARGET_CHANGED');
    return envelope;
  }
  private async collectObservation(callbackKey?: string, focus?: ObservationFocus, deadlineMs?: number): Promise<BridgeObservation> {
    this.live();insist(!this.options.capabilities||this.options.capabilities.includes('observe'),'POLICY_DENIED');
    const remainingBytes=Math.min(this.context.limits.maxObservationBytes,this.context.limits.maxSanitizedEvidenceBytesTotal-this.evidenceBytes);
    insist(this.browser && this.observations < this.context.limits.maxObservations && remainingBytes>0, 'BUDGET_EXCEEDED');
    this.observations++; // Reserve before collection; failure cannot mint another budget.
    let collected: Awaited<ReturnType<GuidedBrowser['observations']['observe']>>;
    try { collected = await this.browser.observations.observe(remainingBytes, true, focus, deadlineMs); } catch (error) {
      // The page stayed off the whitelist past the return window. Nothing was observed; only the host is reported.
      if (error instanceof OriginNotAllowed) { try { (this.options.diagnosticStderr ?? (text => { process.stderr.write(text); }))(`GUIDED_ORIGIN_NOT_ALLOWED host=${error.host}\n`); } catch { /* A diagnostic never changes the verdict. */ } }
      throw error;
    }
    this.live();
    const observation = collected.observation; const bytes = Buffer.byteLength(canonical(observation));
    insist(bytes <= this.context.limits.maxObservationBytes && this.evidenceBytes + bytes <= this.context.limits.maxSanitizedEvidenceBytesTotal, 'BUDGET_EXCEEDED');
    const previousGeneration=this.evidence?.generation??-1;
    insist(observation.generation>previousGeneration,'TARGET_CHANGED');
    this.evidenceBytes += bytes;
    const evidence: ExecutionEvidence = { kind: 'observedDocument', sessionId: this.context.sessionId, contextId: this.context.contextId, documentId: observation.documentId, generation: observation.generation, origin: observation.origin, observationHash: hash(observation) };
    const envelope: BridgeObservation = { ...identity(this.context), observation };
    await this.options.callback('observations', envelope,callbackKey); this.live();
    this.evidence=evidence; // Only the durable acknowledgement makes this generation usable.
    return envelope;
  }
  private async closeResources(reason: BridgeStop['reason']): Promise<void> {
    let browser = this.browser;
    let hung = false;
    if (!browser && this.launching) {
      // Never wait on a launch without a bound: a hung launcher must not hang the stop (REL-001/D4).
      const launching = this.launching;
      const ended = await endedWithin(launching, GUIDED_START_RESERVE_MS);
      if (ended.kind === 'value') browser = ended.value;
      else if (ended.kind === 'error') { if (ended.error instanceof GuidedLaunchFailure) this.failedLaunchClose ??= ended.error.close; }
      else { hung = true; this.releaseWhenLaunchSettles(launching); }
    }
    const recording = this.recording; this.recording = null;
    const sessionIdentity = identity(this.context);
    let orderlyClose = false;
    try {
      // Fail closed: browserClosed stays false, so the slot stays occupied until the late settlement has closed what it made.
      if (hung) throw new Error('CONTEXT_LOST');
      // KL-015-D5 rule D5-1: a session whose start completed is closed gracefully within GUIDED_CLOSE_GRACE_MS and then always
      // terminated; any other session (a start that failed after the browser launched, or a launch that came back late) has no
      // step to finish and no recording to finalize, so it takes the hard teardown alone. Both settle only when the browser is
      // confirmed gone; a survivor rejects here and `browserClosed` stays false, so the slot stays held.
      if (browser) await (this.startPhase === 'STARTED' ? browser.close() : browser.terminate()).catch(() => { this.releaseWhenGone(browser); throw new Error('CONTEXT_LOST'); });
      else await this.failedLaunchClose?.().catch(() => { throw new Error('CONTEXT_LOST'); });
      // The browser's own verdict: orderly only if its graceful stage resolved inside the grace.
      orderlyClose = browser?.orderlyClosed() ?? false;
      this.browserClosed = true;
      // PUBLISHED is a stop reason only: the session is already terminal and lifecycle never carries it.
      if (reason !== 'PUBLISHED') await this.options.callback('lifecycle', { ...identity(this.context), reason }).catch(() => undefined);
    } finally {
      // The context is closed (the webm is final) or its close failed; the stop does not wait.
      if (recording) this.recordingSettlement = this.settleRecording(recording, browser ?? null, sessionIdentity, orderlyClose);
      this.browser = null; this.launching = null; this.failedLaunchClose = null; this.journal = null; this.diagnostics = null;
      this.exercisedEdges.length = 0; this.dispatched.clear(); this.ordinals.clear();
    }
  }
  /** A kill whose quiescence could not be confirmed in time: the slot stays held, but is released as soon as the browser confirms the tree gone. */
  private releaseWhenGone(browser: GuidedBrowser): void {
    void browser.confirmGone?.().then(() => { this.browserClosed = true; }, () => undefined);
  }
  /** A launcher that outlived its deadline and the reserve: whatever it finally makes is closed, and only then is the slot released. */
  private releaseWhenLaunchSettles(launching: Promise<GuidedBrowser>): void {
    const released = (): void => { this.browserClosed = true; };
    void launching.then(
      late => late.terminate().then(released, () => undefined),
      (error: unknown): void => { if (error instanceof GuidedLaunchFailure) void error.close().then(released, () => undefined); else released(); },
    );
  }
  private async settleRecording(recording: GuidedSessionRecording, browser: GuidedBrowser | null, sessionIdentity: BridgeIdentity, orderlyClose: boolean): Promise<void> {
    // The stop was answered at the 3 s grace; the recorder may still be finishing the webm. Wait for it here, off the stop's path.
    const finalized = orderlyClose || await (browser?.finalizeRecording?.(GUIDED_RECORDING_FINALIZE_MS) ?? Promise.resolve(false)).catch(() => false);
    // A published learn keeps no recording; the file is final (or the recorder killed) by now, so it is safe to remove.
    if (this.published) { await recording.discard(); return; }
    const videoPath = await browser?.recordedVideo?.().catch(() => null) ?? null;
    await recording.settle({ identity: sessionIdentity, videoPath, orderlyClose: finalized, callback: (route, message, key) => this.options.callback(route, message, key) });
  }
  async stop(reason: BridgeStop['reason']): Promise<void> {
    if (reason === 'PUBLISHED') this.published = true;
    if (this.closing) return this.closing;
    this.startAbort.abort(new Error('CANCELLED'));
    this.stopped = true; this.options.onStopping?.();
    // Tell the child to end what it is doing (a step in flight ends cancelled, a pending fence is refused); close follows from closeResources.
    try { this.browser?.abort(); } catch { /* A child that cannot hear it is ended by the close bound. */ }
 if (this.timer) clearTimeout(this.timer); this.values.clear(); this.secretValues.clear(); this.prepared.clear(); this.evidence = null;
    this.context = { ...this.context, authoredInputs: { ...this.context.authoredInputs, inputs: [] }, allocations: [], producers: [], consumerEdges: [] };
    this.closing = Promise.resolve().then(() => this.closeResources(reason));
    return this.closing;
  }
}
