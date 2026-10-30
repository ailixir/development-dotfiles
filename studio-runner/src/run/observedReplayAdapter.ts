import { PasswordNoEffect } from './passwordControl.js';
import type { InvocationControl } from '../executor/observedReplay.js';
import type { Guard, ReplayAction, Scope } from '../executor/observedOperations.js';
import { demand, ObservedRefusal } from '../validator/observedReferencePolicy.js';
import { domainAllowed, OriginNotAllowed } from '../allowedDomains.js';
import { observationReadProfile } from './observationReadProfile.js';
import type { BrowserHandle } from './browserFactory.js';
import { loginRequiredSignature } from './loginRequired.js';
import type { ObservationSession, TargetInvocation } from './observationTypes.js';
import type { ActionProfileName } from './actionBudget.js';
import { ClosedActionError, closedReason } from './closedError.js';
import type { Action, Observation, ResolvedTarget } from '../guided/types.js';

export interface ObservedAdapter {
    perform(action: ReplayAction, guard: Guard, value: string | null, control: InvocationControl, secret?: { secretId: string; allowedOrigins: readonly string[] }): Promise<{ value?: string; assertionPassed?: boolean }>;
    loginRequired?(): boolean;
    withhold(value: string): Promise<void>;
    captureRead?(bindingId: string): void;
    dispose(): Promise<void>;
}
export type ObservedPreparation = { kind: 'WAIT' } | { kind: 'PREPARED'; target: Action['target'] };

type ElementGuardTarget = Extract<Guard['target'], { kind: 'element' }>;
/** The frozen {locator, tier, identity} a guard names: what the public API resolves and the executor acts on. */
const frozenTarget = (target: ElementGuardTarget): ResolvedTarget => ({ locator: target.locator, tier: target.tier, identity: target.identity,
    ...(target.assertTextMode ? { assertTextMode: target.assertTextMode } : {}) });

/** Acquisition is deliberately separate from invocation. Guided callers supply their existing
 * acknowledged observation and ObservationSession; neither collection nor browser creation occurs.
 * An element step resolves the frozen locator through the public API and names the ref of the held observation that holds it:
 * absent, or present but not shown in the held outline, is WAIT (the backend refreshes the observation with the step's focus);
 * several matches, or a gated fact that disagrees with the frozen identity, is TARGET_DRIFT at once. */
export async function prepareObservedAction(handle: BrowserHandle, observations: ObservationSession, action: Pick<ReplayAction, 'operation'>, guard: Guard, observation: Observation | null, blank: { documentId: string; generation: number }): Promise<ObservedPreparation> {
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
    if (action.operation.kind === 'read') demand(expected.readRuleId === action.operation.recipe.policyRuleId, 'READ_REFUSED');
    const resolved = frozenTarget(expected);
    const outcome = await observations.resolveTarget({ resolved, origin: observation.origin, operation: action.operation as Action['operation'], readRuleId: action.operation.kind === 'read' ? expected.readRuleId : null });
    if (outcome.kind === 'REFUSED') throw new ObservedRefusal(outcome.code);
    if (outcome.kind === 'ABSENT') return { kind: 'WAIT' };
    let ref: string | null;
    try { ref = await observations.refForTarget(resolved); }
    catch (error) { throw error instanceof ClosedActionError && error.code === 'TARGET_CHANGED' ? new ObservedRefusal('TARGET_DRIFT') : error; }
    if (ref === null) return { kind: 'WAIT' };
    const fact = observation.facts[ref];
    demand(fact !== undefined && fact.role === expected.identity.role && (expected.identity.name === null || expected.identity.name === fact.name), 'TARGET_DRIFT');
    return { kind: 'PREPARED', target: { kind: 'node', ref, ...target } };
}
/**
 * The exact prepared target is rechecked once, never reacquired or replaced after admission. An element step goes through
 * ObservationSession.invoke with the frozen {locator, tier, identity} (the one executor, plan D-3), at the profile of its caller:
 * 'learn' for a guided prefix action (the runtime), 'replay' for ordinary replay (this module's adapter).
 */
export async function performPreparedObservedAction(handle: BrowserHandle, observations: ObservationSession, action: Pick<ReplayAction, 'operation'>, guard: Guard, target: Action['target'] | null, value: string | null, control: InvocationControl, secret?: { secretId: string; allowedOrigins: readonly string[] }, waitStrategy: 'load' | 'domcontentloaded' | 'networkidle' = 'domcontentloaded', timeoutMs = 30000, profile: ActionProfileName = 'replay', continuity: Pick<TargetInvocation, 'invocationIdentity' | 'pressInheritance' | 'preparationId' | 'assertSourceBinding'> = {}): Promise<{ value?: string; assertionPassed?: boolean }> {
    control.check(); const op = action.operation;
    try {
        if (guard.target.kind === 'initialBlank') {
            demand(op.kind === 'navigate' && value !== null && await handle.observedBlankMatches?.(), 'TARGET_DRIFT');
            control.check(); await handle.observedNavigateBlank?.(value, control); control.check();
            await handle.observedWait?.(waitStrategy, timeoutMs); control.check(); return {};
        }
        demand(guard.origin !== null, 'POLICY_REFUSED');
        if (guard.target.kind === 'passwordControl') {
            demand(target?.kind === 'passwordControl' && op.kind === 'fill' && op.value.kind === 'secretRef' && value !== null && secret, 'POLICY_REFUSED');
            await observations.preparePassword?.(target, guard.origin); control.check();
            await observations.withhold?.([value]); control.check();
            await observations.fillPassword?.(target, guard.origin, secret.allowedOrigins, value, control); control.check(); return {};
        }
        if (guard.target.kind === 'page') {
            demand(target?.kind === 'page', 'INVALID_CONTRACT');
            demand(await observations.pageMatches?.(target, guard.origin), 'TARGET_DRIFT'); control.check();
            if (op.kind === 'navigate') {
                demand(value !== null, 'REFERENCE_REFUSED'); control.beginInvocation();
                await observations.navigate?.(target, guard.origin, value); control.check();
                await handle.observedWait?.(waitStrategy, timeoutMs); control.check(); return {};
            }
            demand(op.kind === 'assert' && (op.predicate === 'url' || op.predicate === 'title') && value !== null, 'INVALID_CONTRACT');
            control.beginInvocation(); const passed = await observations.assertPage?.(target, guard.origin, op.predicate, value); control.check(); return { assertionPassed: passed === true };
        }
        const result = await observations.invoke({
            ...continuity, resolved: frozenTarget(guard.target), operation: op as Action['operation'], resolvedValue: value, origin: guard.origin, maxValueBytes: 4096,
            readRuleId: op.kind === 'read' ? guard.target.readRuleId : null, profile,
            ...(profile === 'learn' && target?.kind === 'node' ? { expect: { documentId: target.documentId, generation: target.generation } } : {}),
        }, control);
        control.check(); return result;
    } catch (error) {
        control.check();
        if (error instanceof ObservedRefusal) throw error;
        // Only closed codes are read here (closedReason never copies a message): a Playwright text can never become a reason.
        const reason = closedReason(error);
        const policy = ['POLICY_DENIED', 'PASSWORD_TARGET_ABSENT', 'PASSWORD_TARGET_AMBIGUOUS', 'PASSWORD_FORM_ACTION_NOT_ALLOWED'].includes(reason);
        throw new ObservedRefusal(policy ? 'POLICY_REFUSED' : reason === 'TARGET_CHANGED' || reason === 'OBSERVATION_DEADLINE' ? 'TARGET_DRIFT' : reason === 'PASSWORD_CONTROL_READ_REFUSED' ? 'PASSWORD_CONTROL_READ_REFUSED' : reason === 'READ_REFUSED' ? 'READ_REFUSED' : 'OUTCOME_UNKNOWN', reason, error instanceof PasswordNoEffect);
    }
}
/** How many times a page step takes a stale observation again before the page is called drifted. */
const PAGE_STALE_RETRIES = 3;
/** Ordinary replay owns a fresh session; mixed mode uses the two helpers with its existing one. */
export function createObservedReplayAdapter(handle: BrowserHandle, scope: Scope, allowedDomains: readonly string[], runId: string, guardLive: () => void, waitStrategy: 'load' | 'domcontentloaded' | 'networkidle' = 'domcontentloaded', timeoutMs = 30000): ObservedAdapter {
    demand(typeof handle.createObservationSession === 'function' && typeof handle.observedBlankMatches === 'function' && typeof handle.observedNavigateBlank === 'function', 'INVALID_CONTRACT');
    const observations = handle.createObservationSession({ sessionId: runId, scopeHash: '0'.repeat(64), allowedDomains, knownSecrets: [], readProfile: observationReadProfile(allowedDomains) });
    let first = true, loginSignature = false, probed = false;
    /** LOGIN_REQUIRED is an annotation of a failed step, never a failure trigger: one observation, errors swallowed, nothing else is done with it. */
    const probeLogin = async (): Promise<void> => {
        try { loginSignature = loginRequiredSignature((await observations.observe()).observation); } catch { loginSignature = false; }
    };
    const perform: ObservedAdapter['perform'] = async (action, guard, value, control, secret) => {
        control.check(); guardLive();
        if (guard.target.kind === 'initialBlank') demand(first && scope.initialContext.kind === 'initialBlank', 'TARGET_DRIFT');
        else demand(guard.origin !== null && domainAllowed(allowedDomains, guard.origin), 'POLICY_REFUSED');
        first = false; let additional = false, polls = 0, staleRetries = 0; probed = false;
        const element = guard.target.kind === 'element';
        // Budget exhaustion with the target still absent is a drifted page, not a timeout; the step deadline itself stays a timeout (control.check() rethrows it).
        const reserve = (): ((bytes: number) => void) => {
            try { return control.reserveObservation(additional); }
            catch (error) { control.check(); throw (element || guard.target.kind === 'page') && additional && error instanceof ObservedRefusal && error.code === 'TIMEOUT' ? new ObservedRefusal('TARGET_DRIFT') : error; }
        };
        for (;;) {
            control.check(); guardLive();
            if (additional) await control.waitForAdditionalObservation();
            if (guard.target.kind === 'element') {
                // No observation: the frozen locator through the public API; an element poll accounts no bytes.
                const settle = reserve();
                const outcome = await observations.resolveTarget({ resolved: frozenTarget(guard.target), origin: guard.origin ?? '', operation: action.operation as Action['operation'], readRuleId: action.operation.kind === 'read' ? guard.target.readRuleId : null });
                control.check(); guardLive(); settle(0);
                if (outcome.kind === 'REFUSED') throw new ObservedRefusal(outcome.code);
                // A step that ends with the element still absent may end as a TIMEOUT, whose caller reads the flag at once: take the one login probe while
                // the target is still missing (third poll), not only after a failure.
                if (outcome.kind === 'ABSENT') { additional = true; if (++polls === 3 && !secret && !probed) { probed = true; await probeLogin(); control.check(); guardLive(); } continue; }
                return performPreparedObservedAction(handle, observations, action, guard, null, value, control, secret, waitStrategy, timeoutMs, 'replay');
            }
            let observation: Observation | null = null;
            if (guard.target.kind !== 'initialBlank') {
                const settle = reserve(); // The main frame stayed off the whitelist past the return window: nothing was observed, and the step is refused.
                const collected = await observations.observe().catch((error: unknown) => {
                    throw error instanceof OriginNotAllowed ? new ObservedRefusal('POLICY_REFUSED', 'ORIGIN_NOT_ALLOWED', true)
                        // Nothing happened yet: a page that cannot be observed within the deadline is a page that drifted since it was learned.
                        : error instanceof ClosedActionError && error.code === 'OBSERVATION_DEADLINE' ? new ObservedRefusal('TARGET_DRIFT', 'OBSERVATION_DEADLINE', true) : error;
                });
                control.check(); guardLive(); settle(collected.bytes); observation = collected.observation;
            }
            let prepared: ObservedPreparation;
            try { prepared = await prepareObservedAction(handle, observations, action, guard, observation, { documentId: 'ordinary-blank', generation: 0 }); }
            catch (error) {
                // A rejected preparation cannot restore cancelled, expired or withdrawn authority.
                control.check(); guardLive();
                // A page step's observation is refused as soon as the page mutated after it was taken (a site script still settling right after a
                // navigation): that is a stale observation, not a drifted page. It is taken again within the same bounded extra-observation budget.
                if (guard.target.kind === 'page' && error instanceof ObservedRefusal && error.code === 'TARGET_DRIFT' && staleRetries++ < PAGE_STALE_RETRIES) { additional = true; continue; }
                if (error instanceof PasswordNoEffect && control.phase === 'PREPARING' && guard.target.kind === 'passwordControl' && action.operation.kind === 'fill' && action.operation.value.kind === 'secretRef') {
                    const reason = closedReason(error);
                    if (reason === 'PASSWORD_TARGET_ABSENT') throw new ObservedRefusal('POLICY_REFUSED', 'PASSWORD_TARGET_ABSENT', true);
                    if (reason === 'PASSWORD_TARGET_AMBIGUOUS') throw new ObservedRefusal('POLICY_REFUSED', 'PASSWORD_TARGET_AMBIGUOUS', true);
                    if (reason === 'TARGET_CHANGED') throw new ObservedRefusal('TARGET_DRIFT', 'TARGET_CHANGED', true);
                }
                throw error;
            }
            control.check(); guardLive();
            if (prepared.kind === 'WAIT') { additional = true; continue; }
            return performPreparedObservedAction(handle, observations, action, guard, prepared.target, value, control, secret, waitStrategy, timeoutMs, 'replay');
        }
    };
    return {
        loginRequired: () => loginSignature,
        async perform(action, guard, value, control, secret) {
            try { return await perform(action, guard, value, control, secret); }
            catch (error) {
                if (!secret && !probed && error instanceof ObservedRefusal && (error.code === 'TARGET_DRIFT' || error.code === 'POLICY_REFUSED')) { control.check(); guardLive(); probed = true; await probeLogin(); }
                throw error;
            }
        },
        async withhold(value) { demand(typeof observations.withhold === 'function', 'READ_REFUSED'); await observations.withhold([value]); },
        captureRead(bindingId) { demand(typeof observations.commitRead === 'function', 'READ_REFUSED'); observations.commitRead(bindingId); },
        async dispose() { await observations.dispose(); },
    };
}
