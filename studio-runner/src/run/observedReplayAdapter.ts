import type { InvocationControl } from '../executor/observedReplay.js';
import type { Guard, ReplayAction, Scope, StepReceipt } from '../executor/observedOperations.js';
import { demand, hashObserved, ObservedRefusal } from '../validator/observedReferencePolicy.js';
import { domainAllowed, OriginNotAllowed } from '../allowedDomains.js';
import type { SecretUseEvidence } from './secretUse.js';
import type { BrowserHandle, StepApi } from './browserFactory.js';
import { loginRequiredSignature } from './loginRequired.js';
import type { ObservationSession, PasswordTarget } from './observationTypes.js';
import { REPLAY_PROFILE } from './actionBudget.js';
import { admitStep, runStep } from './stepCode.js';
import type { Admission, FrozenStep, StepResult, StepRun } from './stepCode.js';
import { createSecretHook, createSecrets, secretHandleIds } from './secretStep.js';

/** The hook and the holder of a run, as stepCode.ts types them: this file imports nothing from stepCodeBinding.ts. */
export type BeforeCall = NonNullable<StepRun['beforeCall']>;
export type StepTally = NonNullable<StepRun['tally']>;
export type { StepReceipt, Admission };
type Operation = ReplayAction['operation'];

/**
 * The one place that runs step code (ADR-SC-008 D3.4). Learning (prepare and dispatch, retained prefix) and every replay come through
 * `performStep`, which is the only caller of `runStep`; this file is also the only importer of the two E1 modules.
 */

/** What a step is given besides its code. `inputs` and `vars` hold only what the step's `uses` named. */
export interface StepRequest {
  readonly coordinate: ReplayAction['coordinate'];
  readonly operation: Operation;
  readonly inputs: Readonly<Record<string, string>>;
  readonly vars: Readonly<Record<string, string>>;
  readonly secretIds: readonly string[];
  readonly control: InvocationControl;
  readonly tally: StepTally;
  readonly allowedDomains: readonly string[];
  readonly secrets?: SecretRun;
  /** Learning prepare: run up to the first effectful call and stop there (nothing is committed, nothing is invalidated). */
  readonly untilFence?: boolean;
}

export interface StepOutcome {
  readonly receipt: StepReceipt;
  /** The declared captures, validated; empty unless the step ended ok and ran to the end. */
  readonly captured: Readonly<Record<string, string>>;
  /** Until-fence mode: the step reached its first effectful call. */
  readonly fenceReached: boolean;
  readonly matchCount?: number;
  readonly syntax?: { readonly line: number; readonly column: number };
}

export const newTally = (): StepTally => ({ fenceCrossed: false, effects: [], effectsTruncated: false, offscreen: false });

/** The receipt of a step from what its binding recorded; used when a deadline or a cancel abandoned the run before it returned. */
export function receiptFromTally(operation: Operation, tally: StepTally, closedCode: StepReceipt['closedCode']): StepReceipt {
  return { closedCode, stepHash: hashObserved(operation), fenceCrossed: tally.fenceCrossed, effects: tally.effects.map(effect => ({ method: effect.method, completed: effect.completed })), effectsTruncated: tally.effectsTruncated, offscreen: tally.offscreen };
}

const frozenOf = (coordinate: ReplayAction['coordinate'], operation: Operation): FrozenStep => ({ stepId: coordinate.stepId, code: operation.code, sourceHash: operation.sourceHash });

/** Hash and syntax admission, with no browser: what learning prepare does first and what every replay repeats inside runStep. */
export function admit(coordinate: ReplayAction['coordinate'], operation: Operation): Admission { return admitStep(frozenOf(coordinate, operation)); }

/** The secrets of a run: one hook for the whole run (the secret-bearing window outlives a step), handles built per step. */
export interface SecretRun {
  handles(ids: readonly string[]): object;
  readonly beforeCall: BeforeCall;
}
export interface SecretRunOptions {
  readonly session: ObservationSession;
  readonly evidence: SecretUseEvidence;
  /** The control of the step (or prepare) that is running now. */
  readonly control: () => InvocationControl;
  /** The value of a secret for the dispatch that is running now; the caller owns its lifetime and clears it. */
  readonly resolve: (id: string) => { readonly value: string; readonly allowedOrigins: readonly string[] } | undefined;
}
export function createSecretRun(options: SecretRunOptions): SecretRun {
  const { session } = options;
  const hook = createSecretHook({
    resolve: options.resolve,
    password: {
      preparePassword: async (target, origin) => { if (session.preparePassword === undefined) throw new ObservedRefusal('POLICY_REFUSED', undefined, true); await session.preparePassword(target, origin); },
      fillPassword: async (target, origin, allowedOrigins, value, control) => { if (session.fillPassword === undefined) throw new ObservedRefusal('POLICY_REFUSED', undefined, true); await session.fillPassword(target, origin, allowedOrigins, value, control); },
    },
    // The page-state program refuses a fill after an earlier fill changed the DOM: a fresh observation re-stamps it.
    async passwordTarget() {
      const exported = await session.observe(undefined, false, undefined, options.control().remainingMs?.());
      const target: PasswordTarget = { kind: 'passwordControl', documentId: exported.observation.documentId, generation: exported.observation.generation };
      return { target, origin: exported.observation.origin };
    },
    documentEpoch: () => session.documentEpoch(),
    control: options.control,
    evidence: options.evidence,
  });
  return { handles: ids => createSecrets(ids), beforeCall: hook.beforeCall };
}

/** True when `receiver` is a Locator of the page the run records. A popup's locator is not: its password control is not the one the run observes. */
function onRunPage(receiver: object, page: object): boolean {
  const owner = (receiver as { page?: unknown }).page;
  try { return typeof owner === 'function' && (owner as () => unknown).call(receiver) === page; } catch { return false; }
}

const noSecrets: object = Object.freeze(Object.create(null) as object);
const validUnicode = (text: string): boolean => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);

/** The post-step navigation wait: the replay settle allowance, never more than the control has left minus the headroom its own timers need. */
const NAVIGATION_HEADROOM_MS = 250;
function navigationWaitMs(control: InvocationControl): number {
  const left = control.remainingMs?.();
  const settle = REPLAY_PROFILE.navSettleMs ?? 0;
  return Math.max(0, left === undefined ? settle : Math.min(settle, left - NAVIGATION_HEADROOM_MS));
}

/** The one runStep call. It never throws for a step failure: the result is a receipt. */
export async function performStep(host: StepApi, session: ObservationSession, request: StepRequest): Promise<StepOutcome> {
  const { operation, secrets, untilFence } = request;
  const frozen = frozenOf(request.coordinate, operation);
  const vars: Record<string, unknown> = { ...request.vars };
  const guarded: BeforeCall | undefined = secrets === undefined ? undefined : call => {
    if (secretHandleIds(call.args).length > 0) {
      // A secret goes only to the password control of the page the run records.
      if (call.kind === 'Locator' && !onRunPage(call.receiver, host.page)) throw new ObservedRefusal('POLICY_REFUSED', undefined, true);
      // Prepare stops at the fence. The value arrives with the dispatch, so nothing is read or observed here.
      if (untilFence === true) return { run: (_proceed, fence) => { fence(); return undefined; } };
    }
    return secrets.beforeCall(call);
  };
  let result: StepResult;
  host.beginStep();
  try {
    result = await runStep(frozen, {
      page: host.page, context: host.context, expect: host.expect, inputs: request.inputs, secrets: secrets === undefined ? noSecrets : secrets.handles(request.secretIds),
      vars, control: request.control, allowedDomains: request.allowedDomains,
      afterBlock: async () => {
        // FIX-25: one wait for every mode. Only a step that acted (not a pure check, not learning's prepare) can have started a navigation.
        if (untilFence !== true && (request.tally.fenceCrossed || request.tally.effects.length > 0)) await host.settleNavigation?.(navigationWaitMs(request.control));
        await host.awaitWhitelistedMainFrame(request.allowedDomains);
      },
      adoptPage: page => { host.adopt(page); }, pages: host.adoptedPages(),
      ...(guarded === undefined ? {} : { beforeCall: guarded }), tally: request.tally, ...(untilFence === true ? { untilFence: true } : {}),
    });
  } finally {
    await host.endStep();
    // Reads leave the page as it was; anything else may have changed it, so what was stamped against it is dead.
    if (request.tally.fenceCrossed || request.tally.effects.length > 0) session.invalidate();
  }
  let closedCode = result.ok ? null : (result.closedCode ?? 'INTERNAL_ERROR');
  const captured: Record<string, string> = {};
  if (result.ok && !result.fenceReached) {
    for (const id of operation.captures) {
      const value = vars[id];
      if (typeof value !== 'string' || value.trim() === '' || Buffer.byteLength(value) > 4096 || !validUnicode(value)) { closedCode = 'READ_REFUSED'; break; }
      captured[id] = value;
    }
  }
  const receipt: StepReceipt = { closedCode: closedCode as StepReceipt['closedCode'], stepHash: hashObserved(operation), fenceCrossed: result.fenceCrossed, effects: result.effects.map(effect => ({ method: effect.method, completed: effect.completed })), effectsTruncated: result.effectsTruncated, offscreen: result.offscreen };
  return { receipt, captured: closedCode === null ? captured : {}, fenceReached: result.fenceReached,
    ...(result.matchCount === undefined ? {} : { matchCount: result.matchCount }), ...(result.syntax === undefined ? {} : { syntax: { line: result.syntax.line, column: result.syntax.column } }) };
}

/** What the executor hands the adapter for one operation. */
export interface StepIo {
  readonly inputs: Readonly<Record<string, string>>;
  readonly vars: Readonly<Record<string, string>>;
  readonly secretIds: readonly string[];
  /** The run's resolved secrets and the origins their forms may post to; the adapter reads them only for the step that runs. */
  readonly secrets: Readonly<Record<string, string>>;
  readonly secretOrigins: Readonly<Record<string, readonly string[]>>;
  readonly secretUse: SecretUseEvidence;
}

export interface ObservedAdapter {
    perform(action: ReplayAction, guard: Guard, io: StepIo, control: InvocationControl, tally: StepTally): Promise<StepOutcome>;
    loginRequired?(): boolean;
    /** The operation that ran last and what its binding recorded; the child reads it for a step that a stop cut off. */
    lastRun?(): { readonly operation: Operation; readonly tally: StepTally } | null;
    withhold(value: string): Promise<void>;
    commitCapture(value: string): void;
    dispose(): Promise<void>;
}

/** Ordinary replay owns a fresh session; it observes only to annotate a failed step as LOGIN_REQUIRED. */
export function createObservedReplayAdapter(handle: BrowserHandle, scope: Scope, allowedDomains: readonly string[], runId: string, guardLive: () => void): ObservedAdapter {
    demand(typeof handle.createObservationSession === 'function' && typeof handle.observedBlankMatches === 'function' && handle.stepApi !== undefined, 'INVALID_CONTRACT');
    const host = handle.stepApi;
    const observations = handle.createObservationSession({ sessionId: runId, scopeHash: '0'.repeat(64), allowedDomains, knownSecrets: [] });
    let first = true, loginSignature = false;
    const probe = { done: false };
    let current: { control: InvocationControl; io: StepIo } | null = null;
    let last: { operation: Operation; tally: StepTally } | null = null;
    let run: SecretRun | undefined;
    /** LOGIN_REQUIRED is an annotation of a failed step, never a failure trigger: one observation, errors swallowed, nothing else is done with it. */
    const probeLogin = async (): Promise<void> => {
        try { loginSignature = loginRequiredSignature((await observations.observe()).observation); } catch { loginSignature = false; }
    };
    const annotate = async (): Promise<void> => { if (probe.done) return; probe.done = true; await probeLogin(); };
    const pageOrigin = (): string | null => { try { return new URL((handle.page as { url(): string }).url()).origin; } catch { return null; } };
    return {
        loginRequired: () => loginSignature,
        lastRun: () => last,
        async perform(action, guard, io, control, tally) {
            probe.done = false;
            try {
                control.check(); guardLive();
                if (guard.origin === null) demand(first && scope.initialContext.kind === 'initialBlank' && await handle.observedBlankMatches?.() === true, 'TARGET_DRIFT');
                else {
                    demand(domainAllowed(allowedDomains, guard.origin), 'POLICY_REFUSED');
                    try { await host.awaitWhitelistedMainFrame(allowedDomains); }
                    catch (error) { throw error instanceof OriginNotAllowed ? new ObservedRefusal('POLICY_REFUSED', 'ORIGIN_NOT_ALLOWED', true) : error; }
                    control.check(); guardLive();
                    demand(pageOrigin() === guard.origin, 'TARGET_DRIFT');
                }
            } catch (error) {
                // A page that is not where the step was learned is annotated like a step that failed there: one observation, nothing else.
                if (error instanceof ObservedRefusal && (error.code === 'TARGET_DRIFT' || error.code === 'POLICY_REFUSED') && io.secretIds.length === 0) await annotate();
                throw error;
            }
            first = false;
            const before = JSON.stringify(io.secretUse.snapshot());
            run ??= createSecretRun({ session: observations, evidence: io.secretUse, control: () => (current ?? { control }).control,
                resolve: id => { const value = current === null || !Object.hasOwn(current.io.secrets, id) ? undefined : current.io.secrets[id]; return value === undefined ? undefined : { value, allowedOrigins: current?.io.secretOrigins[id] ?? [] }; } });
            current = { control, io };
            last = { operation: action.operation, tally };
            try {
                const outcome = await performStep(host, observations, { coordinate: action.coordinate, operation: action.operation, inputs: io.inputs, vars: io.vars, secretIds: io.secretIds, control, tally, allowedDomains, secrets: run });
                const code = outcome.receipt.closedCode;
                if ((code === 'TARGET_DRIFT' || code === 'POLICY_REFUSED') && io.secretIds.length === 0 && JSON.stringify(io.secretUse.snapshot()) === before) { control.check(); guardLive(); await annotate(); }
                return outcome;
            }
            finally { current = null; }
        },
        async withhold(value) { demand(typeof observations.withhold === 'function', 'READ_REFUSED'); await observations.withhold([value]); },
        commitCapture(value) { observations.commitCapture(value); },
        async dispose() { await observations.dispose(); },
    };
}
