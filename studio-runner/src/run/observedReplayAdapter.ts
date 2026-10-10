import type { InvocationControl } from '../executor/observedReplay.js';
import type { Guard, ReplayAction, Scope, TrustedPolicy } from '../executor/observedOperations.js';
import { demand, observationPolicy, ObservedRefusal, equalObserved } from '../validator/observedReferencePolicy.js';
import type { BrowserHandle } from './browserFactory.js';
import type { ObservationSession, GuidedInvocation } from './observationTypes.js';
export interface ObservedAdapter {
    perform(action: ReplayAction, guard: Guard, value: string | null, control: InvocationControl): Promise<{
        value?: string;
        assertionPassed?: boolean;
    }>;
    withhold(value: string): Promise<void>;
    dispose(): Promise<void>;
}
/** A fresh per-run observation session resolves the exact frozen locator and retains that node. */
export function createObservedReplayAdapter(handle: BrowserHandle, scope: Scope, policy: TrustedPolicy, runId: string, guardLive: () => void, waitStrategy: 'load' | 'domcontentloaded' | 'networkidle' = 'domcontentloaded', timeoutMs = 30000): ObservedAdapter {
    demand(typeof handle.createObservationSession === 'function' && typeof handle.observedBlankMatches === 'function' && typeof handle.observedNavigateBlank === 'function', 'INVALID_CONTRACT');
    const observations: ObservationSession = handle.createObservationSession({ sessionId: runId, scopeHash: '0'.repeat(64), approvedOrigins: scope.allowedOrigins, knownSecrets: [], ...observationPolicy(policy) });
    demand(typeof observations.acquire === 'function', 'INVALID_CONTRACT');
    let first = true;
    return {
        async perform(action, guard, value, control) {
            const live = (): void => { control.check(); guardLive(); };
            live();
            const op = action.operation;
            if (guard.target.kind === 'initialBlank') {
                demand(first && op.kind === 'navigate' && guard.origin === null && scope.initialContext.kind === 'initialBlank' && value !== null, 'TARGET_DRIFT');
                demand(await handle.observedBlankMatches?.(), 'TARGET_DRIFT');
                live();
                first = false;
                try {
                    await handle.observedNavigateBlank?.(value,control);
                    live();
                    await handle.observedWait?.(waitStrategy, timeoutMs);
                    live();
                }
                catch (error) {
                    live();
                    if (error instanceof ObservedRefusal)
                        throw error;
                    throw new ObservedRefusal('OUTCOME_UNKNOWN');
                }
                return {};
            }
            first = false;
            demand(guard.origin !== null && scope.allowedOrigins.includes(guard.origin), 'POLICY_REFUSED');
            let additional = false;
            for (;;) {
                live();
                if (additional) {
                    await control.waitForAdditionalObservation();
                    live();
                }
                const settle = control.reserveObservation(additional);
                const collected = await observations.observe();
                live();
                settle(collected.bytes);
                const o = collected.observation;
                demand(o.origin === guard.origin, 'TARGET_DRIFT');
                if (guard.target.kind === 'page') {
                    demand(await observations.pageMatches?.(o, guard.origin), 'TARGET_DRIFT');
                    live();
                    if (op.kind === 'navigate') {
                        demand(value !== null, 'REFERENCE_REFUSED');
                        control.beginInvocation();
                        try {
                            await observations.navigate?.(o, guard.origin, value);
                            live();
                            await handle.observedWait?.(waitStrategy, timeoutMs);
                            live();
                        }
                        catch (error) {
                            live();
                            if (error instanceof ObservedRefusal)
                                throw error;
                            throw new ObservedRefusal('OUTCOME_UNKNOWN');
                        }
                        return {};
                    }
                    demand(op.kind === 'assert' && (op.predicate === 'url' || op.predicate === 'title') && value !== null, 'INVALID_CONTRACT');
                    control.beginInvocation();
                    const passed = await observations.assertPage?.(o, guard.origin, op.predicate, value);
                    live();
                    return { assertionPassed: passed === true };
                }
                const expected = guard.target;
                const acquisition = await observations.acquire?.({ documentId: o.documentId, generation: o.generation, origin: guard.origin, locator: expected.locator, expected, operation: op });
                live();
                demand(acquisition, 'TARGET_DRIFT');
                if (acquisition.kind === 'REFUSED')
                    throw new ObservedRefusal(acquisition.code);
                if (acquisition.kind === 'ABSENT' || acquisition.kind === 'VISIBILITY_PENDING') {
                    additional = true;
                    continue;
                }
                const node = o.nodes.find(n => n.nodeId === acquisition.target.nodeId);
                demand(node && acquisition.target.documentId === o.documentId && acquisition.target.generation === o.generation, 'TARGET_DRIFT');
                demand(node.locatorHints.some(l => equalObserved(l, expected.locator)) && node.role === expected.role && node.elementType === expected.elementType && node.controlType === expected.controlType && node.classification === expected.classification && node.visible === expected.visible && node.actionable === expected.actionable, 'TARGET_DRIFT');
                if (op.kind === 'read')
                    demand(node.policyRuleId === expected.readRuleId && node.policyRuleId === op.recipe.policyRuleId, 'READ_REFUSED');
                const target = { ...acquisition.target, locator: expected.locator };
                demand(await observations.matches(target, expected.locator), 'TARGET_DRIFT');
                live();
                const invocation: GuidedInvocation = { target, operation: op, resolvedValue: value, origin: guard.origin, maxValueBytes: 4096 };
                demand(await observations.validateInvocation?.(invocation), 'TARGET_DRIFT');
                live();
                try {
                    const result = await observations.invoke?.(invocation, control);
                    live();
                    demand(result, 'TARGET_DRIFT');
                    return result;
                }
                catch (error) {
                    live();
                    if (error instanceof ObservedRefusal)
                        throw error;
                    const name = error instanceof Error ? error.message : '';
                    throw new ObservedRefusal(name === 'TARGET_CHANGED' ? 'TARGET_DRIFT' : name === 'VALUE_TOO_LARGE' ? 'READ_REFUSED' : 'OUTCOME_UNKNOWN');
                }
            }
        },
        async withhold(value) { demand(typeof observations.withhold === 'function', 'READ_REFUSED'); await observations.withhold([value]); },
        async dispose() { await observations.dispose(); },
    };
}
