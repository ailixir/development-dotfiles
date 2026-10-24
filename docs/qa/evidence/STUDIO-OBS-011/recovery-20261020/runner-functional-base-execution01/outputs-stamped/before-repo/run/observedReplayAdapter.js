import { PasswordNoEffect } from './passwordControl.js';
import { demand, observationPolicy, ObservedRefusal, equalObserved } from '../validator/observedReferencePolicy.js';
import { loginRequiredSignature } from './loginRequired.js';
/** Acquisition is deliberately separate from invocation. Guided callers supply their existing
 * acknowledged observation and ObservationSession; neither collection nor browser creation occurs. */
export async function prepareObservedAction(handle, observations, action, guard, observation, blank) {
    if (guard.target.kind === 'initialBlank') {
        demand(observation === null && action.operation.kind === 'navigate' && await handle.observedBlankMatches?.(), 'TARGET_DRIFT');
        return { kind: 'PREPARED', target: { kind: 'page', documentId: blank.documentId, generation: blank.generation } };
    }
    demand(observation && observation.origin === guard.origin, 'TARGET_DRIFT');
    const target = { documentId: observation.documentId, generation: observation.generation };
    if (guard.target.kind === 'page') {
        demand(await observations.pageMatches?.(target, observation.origin), 'TARGET_DRIFT');
        return { kind: 'PREPARED', target: { kind: 'page', ...target } };
    }
    if (guard.target.kind === 'passwordControl') {
        demand(action.operation.kind === 'fill' && action.operation.value.kind === 'secretRef', 'POLICY_REFUSED');
        await observations.preparePassword?.({ kind: 'passwordControl', ...target }, observation.origin);
        demand(typeof observations.preparePassword === 'function' && typeof observations.fillPassword === 'function', 'INVALID_CONTRACT');
        return { kind: 'PREPARED', target: { kind: 'passwordControl', ...target } };
    }
    const expected = guard.target;
    const acquired = await observations.acquire?.({ ...target, origin: observation.origin, locator: expected.locator, expected, operation: action.operation });
    demand(acquired, 'INVALID_CONTRACT');
    if (acquired.kind === 'REFUSED')
        throw new ObservedRefusal(acquired.code);
    if (acquired.kind !== 'READY')
        return { kind: 'WAIT' };
    const node = observation.nodes.find(n => n.nodeId === acquired.target.nodeId);
    demand(node && acquired.target.documentId === observation.documentId && acquired.target.generation === observation.generation, 'TARGET_DRIFT');
    demand(node.locatorHints.some(l => equalObserved(l, expected.locator)) && node.role === expected.role && node.elementType === expected.elementType && node.controlType === expected.controlType && node.classification === expected.classification && node.visible === expected.visible && node.actionable === expected.actionable, 'TARGET_DRIFT');
    if (action.operation.kind === 'read')
        demand(node.policyRuleId === expected.readRuleId && node.policyRuleId === action.operation.recipe.policyRuleId, 'READ_REFUSED');
    const preparedTarget = { ...acquired.target, locator: expected.locator };
    demand(await observations.matches(preparedTarget, expected.locator), 'TARGET_DRIFT');
    return { kind: 'PREPARED', target: preparedTarget };
}
/** The exact prepared target is rechecked once, never reacquired or replaced after admission. */
export async function performPreparedObservedAction(handle, observations, action, guard, target, value, control, secret, waitStrategy = 'domcontentloaded', timeoutMs = 30000) {
    control.check();
    const op = action.operation;
    try {
        if (guard.target.kind === 'initialBlank') {
            demand(op.kind === 'navigate' && value !== null && await handle.observedBlankMatches?.(), 'TARGET_DRIFT');
            control.check();
            await handle.observedNavigateBlank?.(value, control);
            control.check();
            await handle.observedWait?.(waitStrategy, timeoutMs);
            control.check();
            return {};
        }
        demand(guard.origin !== null, 'POLICY_REFUSED');
        if ('kind' in target && target.kind === 'passwordControl') {
            demand(op.kind === 'fill' && op.value.kind === 'secretRef' && value !== null && secret, 'POLICY_REFUSED');
            await observations.preparePassword?.(target, guard.origin);
            control.check();
            await observations.withhold?.([value]);
            control.check();
            await observations.fillPassword?.(target, guard.origin, secret.allowedOrigins, value, control);
            control.check();
            return {};
        }
        if ('kind' in target) {
            demand(await observations.pageMatches?.(target, guard.origin), 'TARGET_DRIFT');
            control.check();
            if (op.kind === 'navigate') {
                demand(value !== null, 'REFERENCE_REFUSED');
                control.beginInvocation();
                await observations.navigate?.(target, guard.origin, value);
                control.check();
                await handle.observedWait?.(waitStrategy, timeoutMs);
                control.check();
                return {};
            }
            demand(op.kind === 'assert' && (op.predicate === 'url' || op.predicate === 'title') && value !== null, 'INVALID_CONTRACT');
            control.beginInvocation();
            const passed = await observations.assertPage?.(target, guard.origin, op.predicate, value);
            control.check();
            return { assertionPassed: passed === true };
        }
        const invocation = { target, operation: op, resolvedValue: value, origin: guard.origin, maxValueBytes: 4096 };
        demand(await observations.validateInvocation?.(invocation), 'TARGET_DRIFT');
        control.check();
        const result = await observations.invoke?.(invocation, control);
        control.check();
        demand(result, 'TARGET_DRIFT');
        return result;
    }
    catch (error) {
        control.check();
        if (error instanceof ObservedRefusal)
            throw error;
        const reason = error instanceof Error ? error.message : '';
        const policy = ['POLICY_DENIED', 'PASSWORD_TARGET_ABSENT', 'PASSWORD_TARGET_AMBIGUOUS', 'PASSWORD_FORM_ACTION_NOT_ALLOWED'].includes(reason);
        throw new ObservedRefusal(policy ? 'POLICY_REFUSED' : reason === 'TARGET_CHANGED' ? 'TARGET_DRIFT' : reason === 'PASSWORD_CONTROL_READ_REFUSED' ? 'PASSWORD_CONTROL_READ_REFUSED' : reason === 'VALUE_TOO_LARGE' ? 'READ_REFUSED' : 'OUTCOME_UNKNOWN', reason, error instanceof PasswordNoEffect);
    }
}
/** Ordinary replay owns a fresh session; mixed mode uses the two helpers with its existing one. */
export function createObservedReplayAdapter(handle, scope, policy, runId, guardLive, waitStrategy = 'domcontentloaded', timeoutMs = 30000) {
    demand(typeof handle.createObservationSession === 'function' && typeof handle.observedBlankMatches === 'function' && typeof handle.observedNavigateBlank === 'function', 'INVALID_CONTRACT');
    const observations = handle.createObservationSession({ sessionId: runId, scopeHash: '0'.repeat(64), approvedOrigins: scope.allowedOrigins, knownSecrets: [], ...observationPolicy(policy) });
    let first = true, loginSignature = false;
    return {
        loginRequired: () => loginSignature,
        async perform(action, guard, value, control, secret) {
            control.check();
            guardLive();
            if (guard.target.kind === 'initialBlank')
                demand(first && scope.initialContext.kind === 'initialBlank', 'TARGET_DRIFT');
            else
                demand(guard.origin !== null && scope.allowedOrigins.includes(guard.origin), 'POLICY_REFUSED');
            first = false;
            let additional = false;
            for (;;) {
                control.check();
                guardLive();
                if (additional)
                    await control.waitForAdditionalObservation();
                let observation = null;
                if (guard.target.kind !== 'initialBlank') {
                    const settle = control.reserveObservation(additional);
                    const collected = await observations.observe();
                    control.check();
                    guardLive();
                    settle(collected.bytes);
                    observation = collected.observation;
                    loginSignature = loginRequiredSignature(observation);
                }
                let prepared;
                try {
                    prepared = await prepareObservedAction(handle, observations, action, guard, observation, { documentId: 'ordinary-blank', generation: 0 });
                }
                catch (error) {
                    // A rejected preparation cannot restore cancelled, expired or withdrawn authority.
                    control.check();
                    guardLive();
                    if (error instanceof PasswordNoEffect && control.phase === 'PREPARING' && guard.target.kind === 'passwordControl' && action.operation.kind === 'fill' && action.operation.value.kind === 'secretRef') {
                        if (error.message === 'PASSWORD_TARGET_ABSENT')
                            throw new ObservedRefusal('POLICY_REFUSED', 'PASSWORD_TARGET_ABSENT', true);
                        if (error.message === 'PASSWORD_TARGET_AMBIGUOUS')
                            throw new ObservedRefusal('POLICY_REFUSED', 'PASSWORD_TARGET_AMBIGUOUS', true);
                        if (error.message === 'TARGET_CHANGED')
                            throw new ObservedRefusal('TARGET_DRIFT', 'TARGET_CHANGED', true);
                    }
                    throw error;
                }
                control.check();
                guardLive();
                if (prepared.kind === 'WAIT') {
                    additional = true;
                    continue;
                }
                return performPreparedObservedAction(handle, observations, action, guard, prepared.target, value, control, secret, waitStrategy, timeoutMs);
            }
        },
        async withhold(value) { demand(typeof observations.withhold === 'function', 'READ_REFUSED'); await observations.withhold([value]); },
        async dispose() { await observations.dispose(); },
    };
}
//# sourceMappingURL=observedReplayAdapter.js.map