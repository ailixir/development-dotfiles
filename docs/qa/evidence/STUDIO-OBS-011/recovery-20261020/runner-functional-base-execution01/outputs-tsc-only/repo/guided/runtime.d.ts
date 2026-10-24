import type { BridgePrefixPrepareResult, BridgeContextAcknowledgement } from './types.js';
import type { BridgeIdentity, BridgeObservation, BridgeOrdinaryOutcome as BridgeOutcome, BridgePreparation, BridgeStop, RunnerContext } from './types.js';
import type { GuidedBrowser, GuidedLossReason, GuidedRecordingRequest, GuidedStartup } from '../run/guidedBrowser.js';
import type { GuidedRecorder } from './evidence.js';
import type { ObservationConfig } from '../run/observationTypes.js';
export interface GuidedRuntimeOptions {
    /** Volatile trusted test observer; never available in a mounted config or wire frame. */
    onRawFailure?: (error: unknown) => void;
    /** Controlled injected-error seam for the released-canary oracle, absent in production. */
    beforeSecretFill?: (value: string) => void;
    diagnosticStderr?: (text: string) => void;
    workerId: string;
    onStopping?: () => void;
    capabilities?: readonly string[];
    journalDirectory: string;
    /** Governed observation policy (STUDIO-OBS-014 AC-1) from the hash-bound runner context. Set only by
     * GuidedOwnership after its policyHash is verified; never a mounted or server configuration. Guided
     * learning takes no field rules (ar-mounted-rules): the collector always gets `rules: []`. */
    applicationPolicy?: ObservationConfig['applicationPolicy'];
    /**
     * `startup` is the whole-start budget (REL-001/D4): a launcher that honours it fails at the deadline or
     * on abort with a {@link GuidedLaunchFailure} whose `close` kills only its own processes. One that
     * ignores it is still cut off by the runtime, which then keeps the slot held until it settles.
     */
    launch: (config: ObservationConfig, contextId: string, onLost: (reason?: GuidedLossReason) => void, recording: GuidedRecordingRequest | undefined, startup: GuidedStartup) => Promise<GuidedBrowser>;
    callback: (route: 'bootstrap-evidence' | 'observations' | 'outcomes' | 'lifecycle' | 'recording-evidence', message: unknown, idempotencyKey?: string) => Promise<void>;
    /**
     * Session recording composition (STUDIO-OBS-013 AC-1). Absent: the session records nothing and
     * stamps nothing. Present: one recording per session, settled after the browser is gone.
     */
    recorder?: GuidedRecorder;
    /** CSI segment of the recording key, from the claimed grant scope, never from the wire context. */
    csiId?: string;
}
/** Last `start()` step entered. Closed vocabulary: it is logged on a failed start, never derived from input. */
export type GuidedStartPhase = 'VALIDATE' | 'JOURNAL' | 'RECORDER' | 'LAUNCH' | 'WITHHOLD' | 'BLANK_MATCH' | 'BOOTSTRAP_CALLBACK' | 'STARTED';
export declare class GuidedRuntime {
    private context;
    private readonly options;
    private browser;
    private launching;
    private browserClosed;
    private failedLaunchClose;
    /** Aborts the start in flight: on a stop, and on any start failure (REL-001/D4). */
    private readonly startAbort;
    /** How the launcher settled, once it has; `null` while it is still running (or hung). */
    private launchEnd;
    private journal;
    private diagnostics;
    private evidence;
    private stopped;
    private startPhase;
    private lossReason;
    private busy;
    private preparing;
    private readonly prefixWaits;
    private prefixExtraObservations;
    private timer;
    private readonly secretValues;
    private readonly values;
    private readonly prepared;
    private observation;
    private readonly prefixRequests;
    private prefixExited;
    private driftReceipt;
    private liveLease;
    private readonly contextAcknowledgements;
    private readonly dispatched;
    private readonly exercisedEdges;
    private readonly ordinals;
    private priorStep;
    private actions;
    private observations;
    private evidenceBytes;
    private readonly started;
    private closing;
    private recording;
    private recordingSettlement;
    private confirmBrowserLoss;
    private readonly browserLossConfirmation;
    constructor(context: RunnerContext, options: GuidedRuntimeOptions);
    get hasSecretInputs(): boolean;
    get active(): boolean;
    get accepting(): boolean;
    get currentIdentity(): BridgeIdentity;
    /** Where a failed start stopped and, if the browser reported itself lost, why (REL-001). */
    get startFailure(): {
        readonly phase: GuidedStartPhase | null;
        readonly loss: GuidedLossReason | null;
    };
    /** Resolves when the session recording has settled (upload, manifest, callback, cleanup). Never rejects. */
    get recordingSettled(): Promise<void>;
    private live;
    private deadline;
    /**
     * Why the session ends at {@link deadline}, decided from the instants and never from the clock when the
     * timer fires. A lease is capped at the session expiry, so the two coincide at the end of every session,
     * and a Node timer can fire a fraction of a millisecond before `Date.now()` reaches that instant. A tie
     * is the expiry; only a lease that ends strictly first is a lost lease.
     */
    private endReason;
    private schedule;
    applyAcknowledgedLease(leaseExpiresAt: string): void;
    private checkIdentity;
    setLiveLease(leaseExpiresAt: string): void;
    /**
     * Starts the session inside one budget: {@link GUIDED_START_BUDGET_MS} from this call, never past the
     * lease or the session expiry (REL-001/D4). Every awaited step is bounded; a failure at any step aborts
     * the signal the launcher holds. The deadline is a start failure like any other: `startFailure` names
     * the step that was running, and the innermost cause is `TIMEOUT` (`CANCELLED` on a stop).
     */
    start(): Promise<void>;
    private startSteps;
    update(value: unknown, deliveryId?: string): Promise<BridgeIdentity | BridgeContextAcknowledgement>;
    private checkProposal;
    private matches;
    prepare(value: unknown): Promise<BridgePreparation>;
    private prepareOrdinary;
    preparePrefix(value: unknown): Promise<BridgePrefixPrepareResult>;
    private acquirePrefix;
    private makeDrift;
    private resolve;
    dispatch(value: unknown): Promise<BridgeOutcome>;
    refreshObservation(value: unknown, idempotencyKey: string): Promise<BridgeObservation>;
    /** A cached read is usable only while it is still the current acknowledged evidence. */
    currentObservation(value: unknown): BridgeObservation;
    private collectObservation;
    private closeResources;
    /** A launcher that outlived its deadline and the reserve: whatever it finally makes is closed, and only then is the slot released. */
    private releaseWhenLaunchSettles;
    private settleRecording;
    stop(reason: BridgeStop['reason']): Promise<void>;
}
