import type { InvocationControl } from '../executor/observedReplay.js';
import type { Guard, ReplayAction, Scope, TrustedPolicy } from '../executor/observedOperations.js';
import type { BrowserHandle } from './browserFactory.js';
import type { ObservationSession } from './observationTypes.js';
import type { Action, Observation } from '../guided/types.js';
export interface ObservedAdapter {
    perform(action: ReplayAction, guard: Guard, value: string | null, control: InvocationControl, secret?: {
        secretId: string;
        allowedOrigins: readonly string[];
    }): Promise<{
        value?: string;
        assertionPassed?: boolean;
    }>;
    loginRequired?(): boolean;
    withhold(value: string): Promise<void>;
    dispose(): Promise<void>;
}
export type ObservedPreparation = {
    kind: 'WAIT';
} | {
    kind: 'PREPARED';
    target: Action['target'];
};
/** Acquisition is deliberately separate from invocation. Guided callers supply their existing
 * acknowledged observation and ObservationSession; neither collection nor browser creation occurs. */
export declare function prepareObservedAction(handle: BrowserHandle, observations: ObservationSession, action: Pick<ReplayAction, 'operation'>, guard: Guard, observation: Observation | null, blank: {
    documentId: string;
    generation: number;
}): Promise<ObservedPreparation>;
/** The exact prepared target is rechecked once, never reacquired or replaced after admission. */
export declare function performPreparedObservedAction(handle: BrowserHandle, observations: ObservationSession, action: Pick<ReplayAction, 'operation'>, guard: Guard, target: Action['target'], value: string | null, control: InvocationControl, secret?: {
    secretId: string;
    allowedOrigins: readonly string[];
}, waitStrategy?: 'load' | 'domcontentloaded' | 'networkidle', timeoutMs?: number): Promise<{
    value?: string;
    assertionPassed?: boolean;
}>;
/** Ordinary replay owns a fresh session; mixed mode uses the two helpers with its existing one. */
export declare function createObservedReplayAdapter(handle: BrowserHandle, scope: Scope, policy: TrustedPolicy, runId: string, guardLive: () => void, waitStrategy?: 'load' | 'domcontentloaded' | 'networkidle', timeoutMs?: number): ObservedAdapter;
