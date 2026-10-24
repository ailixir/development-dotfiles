import { SecretUseEvidence } from '../run/secretUse.js';
import type { Artifact3, Execute3, Guard, Launch3, ReplayAction, Scope, StepFinished3 } from './observedOperations.js';
import type { ObservedAdapter } from '../run/observedReplayAdapter.js';
import type { Clock, StepReporter } from './stepReporter.js';
export type ReplayError = NonNullable<StepFinished3['errorCode']>;
export declare function replayError(error: unknown): ReplayError;
/** Check only facts the collector actually recorded; live checks own subtype/focus/state details. */
export declare function validateRecordedTarget(operation: ReplayAction['operation'], target: Extract<Guard['target'], {
    kind: 'element';
}>): void;
/** A proof-frame cap never changes the ordinary Execute or artifact component limits. */
export declare const RETAINED_EXECUTE_MAX_BYTES: number;
export declare function boundObservedExecute(raw: unknown): void;
/** Artifact-only structural validation. This cannot authorize an executable IPC frame. */
export declare function validatePublishedArtifactGraph(a: Artifact3): void;
/** Strict released-value child boundary. An optional typed accepted Launch is not an Execute-supplied grant. */
export declare function validateObservedExecute(raw: unknown, scope: Scope, acceptedLaunch?: Launch3): Execute3;
/** Already schema-parsed structural projection only: no secret maps, origins or authority. */
export declare function validateObservedReplayGraph(m: Pick<Execute3, 'profileHash' | 'steps' | 'guards' | 'bindings' | 'transfers' | 'inputs'>, scope: Scope): void;
export declare const ACQUISITION_LIMITS: Readonly<{
    firstDelayMs: 100;
    nextDelayMs: 250;
    extraPerStep: 32;
    extraPerRun: 200;
    totalPerRun: 400;
    totalBytes: 13107200;
    observationBytes: 32768;
}>;
export interface AcquisitionStepBudget {
    extra: number;
}
export declare class ReplayAcquisitionBudget {
    private extra;
    private total;
    private bytes;
    reserve(step: AcquisitionStepBudget, additional: boolean): (bytes: number) => void;
    snapshot(): {
        extra: number;
        total: number;
        bytes: number;
    };
}
export interface InvocationControl {
    readonly deadlineMs: number;
    readonly signal: AbortSignal;
    readonly phase: 'PREPARING' | 'INVOKING' | 'FINISHED' | 'POISONED';
    check(): void;
    beginInvocation(): void;
    poison(reason: 'TIMEOUT' | 'CANCELLED'): void;
    reserveObservation(additional: boolean): (bytes: number) => void;
    waitForAdditionalObservation(): Promise<void>;
}
/** The timer poisons authority before rejecting; late work can only clean up. */
export declare class ObservedInvocationControl implements InvocationControl {
    private readonly clock;
    readonly deadlineMs: number;
    private readonly parent;
    private readonly budget;
    private readonly step;
    private state;
    private failure;
    private readonly abort;
    private executing;
    constructor(clock: Clock, deadlineMs: number, parent: AbortSignal, budget: ReplayAcquisitionBudget, step: AcquisitionStepBudget);
    get phase(): InvocationControl['phase'];
    get signal(): AbortSignal;
    poison(reason: 'TIMEOUT' | 'CANCELLED'): void;
    check(): void;
    beginInvocation(): void;
    reserveObservation(additional: boolean): (bytes: number) => void;
    waitForAdditionalObservation(): Promise<void>;
    run<T>(work: () => Promise<T>): Promise<T>;
}
export declare function executeObservedReplay(message: Execute3, adapter: ObservedAdapter, scope: Scope, clock: Clock, reporter: StepReporter, signal: AbortSignal, runDeadlineMs?: number, usageEvidence?: SecretUseEvidence, acceptedLaunch?: Launch3): Promise<{
    ok: boolean;
    errorCode: ReplayError | null;
    secretUse: Record<string, 'USED' | 'NOT_USED' | 'REFUSED'>;
    detail?: {
        stepId: string;
        loginStepsPresent: boolean;
    };
}>;
