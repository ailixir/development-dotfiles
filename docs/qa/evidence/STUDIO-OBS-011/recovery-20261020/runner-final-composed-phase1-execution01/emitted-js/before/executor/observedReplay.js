import { SecretUseEvidence } from '../run/secretUse.js';
import { assertResolvedSecretLiterals, validateReplayArtifact } from '../validator/observedReplay.js';
import { boundedObserved, demand, equalObserved, hashObserved, isRecord, validateTrustedPolicy, OBSERVED_SCHEMA_BUNDLE_HASH, OBSERVED_LIMITS, OBSERVED_PROFILE, ObservedRefusal, validateObserved } from '../validator/observedReferencePolicy.js';
export function replayError(error) {
    if (error instanceof ObservedRefusal && ['INVALID_CONTRACT', 'PROFILE_MISMATCH', 'AUTHORIZATION_EXPIRED', 'REFERENCE_MISMATCH', 'POLICY_REFUSED', 'TARGET_DRIFT', 'READ_REFUSED', 'REFERENCE_REFUSED', 'ASSERTION_FAILED', 'CANCELLED', 'TIMEOUT', 'OUTCOME_UNKNOWN', 'INTERNAL_ERROR', 'LOGIN_REQUIRED', 'PASSWORD_CONTROL_READ_REFUSED'].includes(error.code))
        return error.code;
    return 'INTERNAL_ERROR';
}
const key = (c) => `${c.stepId}:${String(c.ordinal)}`;
function slot(op) { return op.kind === 'navigate' ? 'navigate.destination' : op.kind === 'assert' ? 'assert.expected' : op.kind === 'fill' || op.kind === 'selectOption' ? op.kind + '.value' : ''; }
function arg(op) { return op.kind === 'navigate' ? { kind: 'authoredLiteral', sourceInputId: op.destinationInputId } : op.kind === 'fill' || op.kind === 'selectOption' ? op.value : op.kind === 'assert' ? op.expected : null; }
/** Check only facts the collector actually recorded; live checks own subtype/focus/state details. */
export function validateRecordedTarget(operation, target) {
    if (target.controlType === 'password' && (operation.kind === 'read' || operation.kind === 'assert' && operation.predicate === 'hasValue'))
        throw new ObservedRefusal('PASSWORD_CONTROL_READ_REFUSED');
    demand(target.visible, 'TARGET_DRIFT');
    const readable = (target.elementType === 'input' || target.elementType === 'textarea') && ['text', 'search', 'email', 'tel', 'url', 'textarea'].includes(target.controlType);
    if (operation.kind === 'fill' || operation.kind === 'assert' && operation.predicate === 'hasValue')
        demand(readable, 'TARGET_DRIFT');
    if (operation.kind === 'selectOption')
        demand(target.elementType === 'select', 'TARGET_DRIFT');
    if (operation.kind === 'check' || operation.kind === 'uncheck')
        demand(target.elementType === 'input' && target.controlType === 'other', 'TARGET_DRIFT');
    if (operation.kind === 'read') {
        demand(target.readRuleId === operation.recipe.policyRuleId && target.classification === operation.recipe.classification, 'READ_REFUSED');
        if (operation.recipe.kind === 'controlValue')
            demand(readable && target.controlType === operation.recipe.controlType, 'READ_REFUSED');
        else
            demand(!['input', 'textarea', 'select'].includes(target.elementType) && target.controlType === 'none', 'READ_REFUSED');
    }
}
/** A proof-frame cap never changes the ordinary Execute or artifact component limits. */
export const RETAINED_EXECUTE_MAX_BYTES = OBSERVED_LIMITS.execute + OBSERVED_LIMITS.artifact + 64;
export function boundObservedExecute(raw) {
    const proof = isRecord(raw) && Object.hasOwn(raw, 'retainedArtifact');
    boundedObserved(raw, proof ? RETAINED_EXECUTE_MAX_BYTES : OBSERVED_LIMITS.execute);
    if (proof && isRecord(raw)) {
        boundedObserved(Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'retainedArtifact')), OBSERVED_LIMITS.execute);
        boundedObserved(raw.retainedArtifact, OBSERVED_LIMITS.artifact);
    }
}
/** Local published joins only; the admitted whole artifact supplies the current-run commitment. */
function retainedReadBindings(a) {
    const zero = a.learnedPlan.bindings.filter(binding => binding.consumers.length === 0);
    if (zero.length === 0)
        return new Set();
    const plan = a.learnedPlan, inc = plan.incremental;
    demand(inc && inc.retainedPrefixAdmissionIds.length > 0, 'REFERENCE_MISMATCH');
    const initial = plan.sourceSteps.indexOf(inc.initialFirstLearnStepId), effective = plan.sourceSteps.indexOf(inc.effectiveFirstLearnStepId);
    demand(initial >= 0 && effective >= 0 && effective <= initial, 'REFERENCE_MISMATCH');
    const admissions = plan.actions.map(action => action.admissionId), retained = inc.retainedPrefixAdmissionIds;
    demand(new Set(admissions).size === admissions.length && new Set(retained).size === retained.length && retained.length <= admissions.length && equalObserved(retained, admissions.slice(0, retained.length)), 'REFERENCE_MISMATCH');
    for (const action of plan.actions.slice(0, retained.length))
        demand(plan.sourceSteps.indexOf(action.coordinate.stepId) <= effective, 'REFERENCE_MISMATCH');
    for (const binding of zero) {
        const action = plan.actions.find(item => equalObserved(item.coordinate, binding.producer));
        demand(action?.operation.kind === 'read' && action.operation.bindingId === binding.bindingId && equalObserved(action.operation.recipe, binding.recipe) && action.origin === binding.sourceOrigin && action.admissionId === binding.provenance.producerAdmissionId && binding.provenance.sourceIntentStepId === action.coordinate.stepId && retained.includes(action.admissionId), 'REFERENCE_MISMATCH');
        const operation = a.steps.flatMap(step => step.operations).find(item => equalObserved(item.coordinate, binding.producer));
        const guard = a.guards.find(item => item.guardId === operation?.guardId);
        demand(operation && equalObserved(operation.operation, action.operation) && guard?.target.kind === 'element' && guard.origin === binding.sourceOrigin && equalObserved(guard.target.locator, action.locator) && guard.target.readRuleId === binding.recipe.policyRuleId, 'REFERENCE_MISMATCH');
    }
    return new Set(zero.map(binding => binding.bindingId));
}
/** Artifact-only structural validation. This cannot authorize an executable IPC frame. */
export function validatePublishedArtifactGraph(a) {
    const zero = retainedReadBindings(a);
    validateGraph({ profileHash: hashObserved(a.profile), steps: a.steps, guards: a.guards, bindings: a.replayPolicy.bindings.map(binding => ({ bindingId: binding.bindingId, producer: binding.producer, recipe: binding.recipe, origin: binding.sourceOrigin })), transfers: a.replayPolicy.transfers, inputs: a.inputRecipes.map(input => input.kind === 'secretRef' ? { inputId: input.inputId, stepId: input.stepId, kind: 'secretRef', intendedSlot: 'fill.value', referenceName: input.provenance.kind === 'configuration' ? input.provenance.referenceName : '' } : { inputId: input.inputId, stepId: input.stepId, kind: input.kind, intendedSlot: input.intendedSlot, value: input.kind === 'destination' ? (a.replayPolicy.scope.allowedOrigins[0] ?? '') + '/' : '' }) }, { principalId: 'structure-validation', ...a.replayPolicy.scope }, zero);
}
/** Strict released-value child boundary. An optional typed accepted Launch is not an Execute-supplied grant. */
export function validateObservedExecute(raw, scope, acceptedLaunch) {
    boundObservedExecute(raw);
    const proof = isRecord(raw) && Object.hasOwn(raw, 'retainedArtifact');
    const m = validateObserved('replay-ipc#/definitions/Execute3', raw, proof ? RETAINED_EXECUTE_MAX_BYTES : OBSERVED_LIMITS.execute);
    const zero = new Set(m.bindings.filter(binding => !m.transfers.some(transfer => transfer.bindingId === binding.bindingId)).map(binding => binding.bindingId));
    demand(proof === (zero.size > 0), 'REFERENCE_MISMATCH');
    if (zero.size > 0) {
        demand(acceptedLaunch, 'REFERENCE_MISMATCH');
        const launch = validateObserved('replay-ipc#/definitions/Launch3', acceptedLaunch, OBSERVED_LIMITS.launch), r = launch.admission.request;
        demand(launch.build.schemaBundleHash === OBSERVED_SCHEMA_BUNDLE_HASH, 'PROFILE_MISMATCH');
        demand(launch.admission.admissionId === r.admissionId && m.runId === launch.runId && m.runId === r.executionId && m.attemptId === launch.attemptId && m.attemptId === r.attemptId && m.configurationHash === launch.configurationHash && m.configurationHash === r.configurationHash && m.profileHash === hashObserved(launch.profile) && equalObserved(launch.profile, r.profile) && equalObserved(launch.build, r.build), 'EVIDENCE_MISMATCH');
        demand(equalObserved(scope, launch.scope) && hashObserved(scope) === launch.scopeHash && launch.scopeHash === r.scopeHash && equalObserved(validateTrustedPolicy(launch.policy, scope), launch.policy) && hashObserved(launch.policy) === r.currentPolicyHash && launch.build.profileHash === m.profileHash, 'POLICY_REFUSED');
        demand(hashObserved({ browser: launch.browser, viewport: launch.viewport, timeoutSeconds: m.stepTimeoutMs / 1000, waitStrategy: m.waitStrategy, environment: scope.environment }) === m.configurationHash, 'EVIDENCE_MISMATCH');
        const a = validateReplayArtifact(m.retainedArtifact);
        demand(hashObserved(a) === r.artifactHash && hashObserved(a.learnedPlan) === r.learnedPlanHash && a.learnedPlanHash === r.learnedPlanHash && hashObserved(a.replayPolicy) === r.referencePolicyHash && a.replayPolicy.publicationEvidenceHash === r.publicationEvidenceHash && a.configurationHash === r.configurationHash && equalObserved(a.profile, launch.profile), 'EVIDENCE_MISMATCH');
        const requirements = { csiId: scope.csiId, environment: scope.environment, applicationId: scope.applicationId, allowedOrigins: scope.allowedOrigins, capabilities: scope.capabilities, policyId: scope.policyId, policyVersion: scope.policyVersion, entryPolicyId: scope.entryPolicyId, initialContext: scope.initialContext };
        demand(equalObserved(requirements, a.replayPolicy.scope) && equalObserved(m.steps, a.steps) && equalObserved(m.guards, a.guards) && equalObserved(m.transfers, a.replayPolicy.transfers) && equalObserved(m.bindings, a.replayPolicy.bindings.map(binding => ({ bindingId: binding.bindingId, producer: binding.producer, recipe: binding.recipe, origin: binding.sourceOrigin }))), 'REFERENCE_MISMATCH');
        const metadata = m.inputs.map(input => input.kind === 'secretRef' ? input : { inputId: input.inputId, stepId: input.stepId, kind: input.kind, intendedSlot: input.intendedSlot });
        const recipes = a.inputRecipes.map(input => { if (input.kind === 'secretRef') {
            demand(input.provenance.kind === 'configuration', 'REFERENCE_MISMATCH');
            return { inputId: input.inputId, stepId: input.stepId, kind: 'secretRef', intendedSlot: 'fill.value', referenceName: input.provenance.referenceName };
        } return { inputId: input.inputId, stepId: input.stepId, kind: input.kind, intendedSlot: input.intendedSlot }; });
        demand(equalObserved(metadata, recipes), 'REFERENCE_MISMATCH');
        const qualified = retainedReadBindings(a);
        demand(zero.size === qualified.size && [...zero].every(id => qualified.has(id)), 'REFERENCE_MISMATCH');
    }
    demand(Object.values(m.secrets).every(value => value.length <= 4096), 'LIMIT_EXCEEDED');
    validateGraph(m, scope, zero);
    const inputs = new Map(m.inputs.map(input => [input.inputId, input]));
    for (const action of m.steps.flatMap(step => step.operations)) {
        const argument = arg(action.operation);
        if (argument?.kind === 'secretRef') {
            const input = inputs.get(argument.sourceInputId);
            demand(input?.kind === 'secretRef' && Object.hasOwn(m.secrets, input.referenceName), 'REFERENCE_MISMATCH');
        }
    }
    return m;
}
/** Already schema-parsed structural projection only: no secret maps, origins or authority. */
export function validateObservedReplayGraph(m, scope) { validateGraph(m, scope, new Set()); }
function validateGraph(m, scope, retainedZeroConsumerBindings) {
    demand(m.profileHash === hashObserved(OBSERVED_PROFILE), 'PROFILE_MISMATCH');
    const guards = new Map(m.guards.map(g => [g.guardId, g])), inputs = new Map(m.inputs.map(i => [i.inputId, i])), bindings = new Map(m.bindings.map(b => [b.bindingId, b]));
    demand(guards.size === m.guards.length && inputs.size === m.inputs.length && bindings.size === m.bindings.length);
    demand(m.inputs.reduce((n, i) => n + (i.kind === 'secretRef' ? 0 : Buffer.byteLength(i.value)), 0) <= OBSERVED_LIMITS.inputs, 'LIMIT_EXCEEDED');
    const actions = m.steps.flatMap(s => s.operations), coordinates = new Map(actions.map((a, i) => [key(a.coordinate), i]));
    demand(actions.length <= 200 && coordinates.size === actions.length && guards.size === actions.length);
    const stepIds = new Set();
    let i = 0;
    for (const [si, s] of m.steps.entries()) {
        demand(s.stepIndex === si && !stepIds.has(s.stepId));
        stepIds.add(s.stepId);
        for (const [oi, a] of s.operations.entries()) {
            const g = guards.get(a.guardId);
            demand(g && a.guardId === `g${String(i)}` && a.coordinate.stepId === s.stepId && a.coordinate.ordinal === oi);
            demand(scope.capabilities.includes(a.operation.kind), 'POLICY_REFUSED');
            if (g.origin === null)
                demand(i === 0 && scope.initialContext.kind === 'initialBlank' && g.target.kind === 'initialBlank' && a.operation.kind === 'navigate');
            else
                demand(scope.allowedOrigins.includes(g.origin) && g.target.kind !== 'initialBlank', 'POLICY_REFUSED');
            const page = a.operation.kind === 'navigate' || a.operation.kind === 'assert' && ['url', 'title'].includes(a.operation.predicate);
            demand(page === (g.target.kind === 'page' || g.target.kind === 'initialBlank'));
            demand((a.operation.kind === 'fill' && a.operation.value.kind === 'secretRef') === (g.target.kind === 'passwordControl'), 'REFERENCE_MISMATCH');
            if (i === 0 && scope.initialContext.kind === 'initialBlank')
                demand(g.target.kind === 'initialBlank');
            if (i === 0 && scope.initialContext.kind === 'observedDocument')
                demand(g.origin === scope.initialContext.origin);
            if (g.target.kind === 'element')
                validateRecordedTarget(a.operation, g.target);
            const argument = arg(a.operation);
            if (argument?.kind === 'authoredLiteral') {
                const input = inputs.get(argument.sourceInputId);
                demand(input && input.kind !== 'secretRef' && input.stepId === s.stepId && input.intendedSlot === slot(a.operation), 'REFERENCE_REFUSED');
                demand(Buffer.byteLength(input.value) <= 16384, 'LIMIT_EXCEEDED');
                if (a.operation.kind === 'navigate') {
                    let u;
                    try {
                        u = new URL(input.value);
                    }
                    catch {
                        throw new ObservedRefusal('REFERENCE_REFUSED');
                    }
                    demand(input.kind === 'destination' && scope.allowedOrigins.includes(u.origin) && !u.username && !u.password && Buffer.byteLength(input.value) <= 4096, 'POLICY_REFUSED');
                }
            }
            if (argument?.kind === 'secretRef') {
                const input = inputs.get(argument.sourceInputId);
                demand(input?.kind === 'secretRef' && input.stepId === s.stepId && input.intendedSlot === slot(a.operation), 'REFERENCE_MISMATCH');
            }
            if (argument?.kind === 'binding') {
                const binding = bindings.get(argument.bindingId), edges = m.transfers.filter(t => t.bindingId === argument.bindingId && key(t.consumer) === key(a.coordinate) && t.slot === slot(a.operation));
                demand(binding && edges.length === 1 && g.origin === binding.origin, 'REFERENCE_REFUSED');
            }
            if (a.operation.kind === 'read') {
                const binding = bindings.get(a.operation.bindingId);
                demand(binding && equalObserved(binding.producer, a.coordinate) && equalObserved(binding.recipe, a.operation.recipe) && binding.origin === g.origin && g.target.kind === 'element' && g.target.readRuleId === binding.recipe.policyRuleId, 'REFERENCE_REFUSED');
            }
            i++;
        }
    }
    for (const input of m.inputs) {
        demand(stepIds.has(input.stepId) && input.kind === 'destination' === (input.intendedSlot === 'navigate.destination'), 'REFERENCE_REFUSED');
        if (input.kind === 'secretRef')
            demand(/^[A-Za-z0-9_.-]{1,64}$/u.test(input.referenceName), 'REFERENCE_MISMATCH');
    }
    const seen = new Set();
    for (const transfer of m.transfers) {
        const producer = coordinates.get(key(transfer.producer)), consumer = coordinates.get(key(transfer.consumer)), b = bindings.get(transfer.bindingId);
        const edge = key(transfer.consumer) + ':' + transfer.slot;
        demand(!seen.has(edge) && producer !== undefined && consumer !== undefined && producer < consumer && b && equalObserved(b.producer, transfer.producer) && b.origin === transfer.origin, 'REFERENCE_REFUSED');
        seen.add(edge);
        const op = actions[consumer]?.operation;
        demand(op && slot(op) === transfer.slot && equalObserved(arg(op), { kind: 'binding', bindingId: transfer.bindingId }), 'REFERENCE_REFUSED');
    }
    for (const b of m.bindings) {
        const producer = coordinates.get(key(b.producer)), op = producer === undefined ? undefined : actions[producer]?.operation;
        demand(op?.kind === 'read' && op.bindingId === b.bindingId && (m.transfers.some(t => t.bindingId === b.bindingId) || retainedZeroConsumerBindings.has(b.bindingId)), 'REFERENCE_REFUSED');
    }
}
export const ACQUISITION_LIMITS = Object.freeze({ firstDelayMs: 100, nextDelayMs: 250, extraPerStep: 32, extraPerRun: 200, totalPerRun: 400, totalBytes: 13107200, observationBytes: 32768 });
export class ReplayAcquisitionBudget {
    extra = 0;
    total = 0;
    bytes = 0;
    reserve(step, additional) {
        demand(this.total < ACQUISITION_LIMITS.totalPerRun && this.bytes + ACQUISITION_LIMITS.observationBytes <= ACQUISITION_LIMITS.totalBytes, 'TIMEOUT');
        if (additional)
            demand(step.extra < ACQUISITION_LIMITS.extraPerStep && this.extra < ACQUISITION_LIMITS.extraPerRun, 'TIMEOUT');
        this.total++;
        this.bytes += ACQUISITION_LIMITS.observationBytes;
        if (additional) {
            step.extra++;
            this.extra++;
        }
        let settled = false;
        return bytes => { demand(!settled && Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= ACQUISITION_LIMITS.observationBytes, 'INVALID_CONTRACT'); settled = true; this.bytes -= ACQUISITION_LIMITS.observationBytes - bytes; };
    }
    snapshot() { return { extra: this.extra, total: this.total, bytes: this.bytes }; }
}
/** The timer poisons authority before rejecting; late work can only clean up. */
export class ObservedInvocationControl {
    clock;
    deadlineMs;
    parent;
    budget;
    step;
    state = 'PREPARING';
    failure = null;
    abort = new AbortController();
    executing = false;
    constructor(clock, deadlineMs, parent, budget, step) {
        this.clock = clock;
        this.deadlineMs = deadlineMs;
        this.parent = parent;
        this.budget = budget;
        this.step = step;
    }
    get phase() { return this.state; }
    get signal() { return this.abort.signal; }
    poison(reason) {
        if (this.state === 'POISONED' || this.state === 'FINISHED')
            return;
        this.failure = reason === 'TIMEOUT' && this.state === 'INVOKING' ? 'OUTCOME_UNKNOWN' : reason;
        this.state = 'POISONED';
        this.abort.abort();
    }
    check() {
        if (this.parent.aborted)
            this.poison('CANCELLED');
        if (this.clock.now() >= this.deadlineMs)
            this.poison('TIMEOUT');
        demand(this.state !== 'FINISHED', 'CANCELLED');
        if (this.failure)
            throw new ObservedRefusal(this.failure);
    }
    beginInvocation() { this.check(); demand(this.state === 'PREPARING', 'INVALID_CONTRACT'); this.state = 'INVOKING'; }
    reserveObservation(additional) {
        this.check();
        demand(this.state === 'PREPARING', 'INVALID_CONTRACT');
        const settle = this.budget.reserve(this.step, additional);
        return bytes => { this.check(); settle(bytes); };
    }
    async waitForAdditionalObservation() {
        this.check();
        demand(this.state === 'PREPARING', 'INVALID_CONTRACT');
        const delay = this.step.extra === 0 ? ACQUISITION_LIMITS.firstDelayMs : ACQUISITION_LIMITS.nextDelayMs;
        await new Promise((resolve, reject) => {
            const stopped = () => { clearTimeout(timer); this.signal.removeEventListener('abort', stopped); reject(new ObservedRefusal(this.failure ?? 'CANCELLED')); };
            const timer = setTimeout(() => { this.signal.removeEventListener('abort', stopped); resolve(); }, delay);
            this.signal.addEventListener('abort', stopped, { once: true });
            if (this.signal.aborted)
                stopped();
        });
        this.check();
    }
    async run(work) {
        demand(!this.executing, 'INVALID_CONTRACT');
        this.executing = true;
        this.check();
        let timer;
        let cancel = () => undefined;
        const stopped = new Promise((_resolve, reject) => {
            cancel = () => { this.poison('CANCELLED'); reject(new ObservedRefusal(this.failure ?? 'CANCELLED')); };
            this.parent.addEventListener('abort', cancel, { once: true });
            timer = setTimeout(() => { this.poison('TIMEOUT'); reject(new ObservedRefusal(this.failure ?? 'TIMEOUT')); }, Math.max(1, this.deadlineMs - this.clock.now()));
        });
        try {
            this.check();
            const result = await Promise.race([work(), stopped]);
            this.check();
            this.state = 'FINISHED';
            return result;
        }
        catch (error) {
            if (this.failure)
                throw new ObservedRefusal(this.failure);
            throw error;
        }
        finally {
            if (timer)
                clearTimeout(timer);
            this.parent.removeEventListener('abort', cancel);
            if (this.state !== 'FINISHED')
                this.poison('CANCELLED');
        }
    }
}
export async function executeObservedReplay(message, adapter, scope, clock, reporter, signal, runDeadlineMs = clock.now() + message.stepTimeoutMs * message.steps.length, usageEvidence, acceptedLaunch) {
    validateObservedExecute(message, scope, acceptedLaunch);
    assertResolvedSecretLiterals(message);
    const values = new Map(), inputs = new Map(message.inputs.map(i => [i.inputId, i])), guards = new Map(message.guards.map(g => [g.guardId, g]));
    const budget = new ReplayAcquisitionBudget();
    let totalBytes = 0, errorCode = null, loginStepsPresent = false;
    let detail;
    const secretUse = usageEvidence ?? new SecretUseEvidence(Object.keys(message.secrets));
    try {
        const setup = new ObservedInvocationControl(clock, runDeadlineMs, signal, budget, { extra: 0 });
        const withholdInputs = async () => {
            for (const input of message.inputs) {
                setup.check();
                if (input.kind !== 'secretRef' && input.value.length > 0)
                    await adapter.withhold(input.value);
                setup.check();
            }
        };
        try {
            await setup.run(withholdInputs);
        }
        catch (error) {
            errorCode = replayError(error);
        }
        for (const step of message.steps) {
            if (errorCode !== null || signal.aborted) {
                errorCode ??= 'CANCELLED';
                reporter.stepFinished({ stepIndex: step.stepIndex, status: 'SKIPPED', startedAtMs: null, finishedAtMs: null, durationMs: null, failure: null });
                continue;
            }
            const startedAtMs = clock.now(), deadlineMs = Math.min(runDeadlineMs, startedAtMs + message.stepTimeoutMs), stepBudget = { extra: 0 };
            reporter.stepStarted({ stepIndex: step.stepIndex, startedAtMs });
            try {
                for (const action of step.operations) {
                    const control = new ObservedInvocationControl(clock, deadlineMs, signal, budget, stepBudget);
                    const perform = async () => {
                        const argument = arg(action.operation);
                        let value = null;
                        if (argument?.kind === 'authoredLiteral') {
                            const input = inputs.get(argument.sourceInputId);
                            value = input && input.kind !== 'secretRef' ? input.value : null;
                        }
                        else if (argument?.kind === 'secretRef') {
                            const input = inputs.get(argument.sourceInputId);
                            demand(input?.kind === 'secretRef' && input.stepId === action.coordinate.stepId && input.intendedSlot === slot(action.operation), 'REFERENCE_MISMATCH');
                            demand(Object.hasOwn(message.secrets, input.referenceName), 'REFERENCE_MISMATCH');
                            value = message.secrets[input.referenceName] ?? null;
                        }
                        else if (argument?.kind === 'binding')
                            value = values.get(argument.bindingId) ?? null;
                        if (argument !== null)
                            demand(value !== null, 'REFERENCE_REFUSED');
                        const guard = guards.get(action.guardId);
                        demand(guard);
                        control.check();
                        const secretInput = argument?.kind === 'secretRef' ? inputs.get(argument.sourceInputId) : null;
                        const secret = secretInput?.kind === 'secretRef' ? { secretId: secretInput.referenceName, allowedOrigins: Object.hasOwn(message.secretOrigins, secretInput.referenceName) ? message.secretOrigins[secretInput.referenceName] ?? [] : [] } : undefined;
                        if (secret)
                            secretUse.attempting(secret.secretId);
                        let result;
                        try {
                            result = await adapter.perform(action, guard, value, control, secret);
                        }
                        catch (error) {
                            if (secret && (control.phase === 'PREPARING' || error instanceof ObservedRefusal && error.noEffect))
                                secretUse.refusedBeforeEffect(secret.secretId);
                            const code = replayError(error);
                            if (!secret && (code === 'TARGET_DRIFT' || code === 'POLICY_REFUSED') && adapter.loginRequired?.()) {
                                detail = { stepId: action.coordinate.stepId, loginStepsPresent };
                                throw new ObservedRefusal('LOGIN_REQUIRED');
                            }
                            throw error;
                        }
                        if (secret) {
                            control.check();
                            secretUse.used(secret.secretId);
                            loginStepsPresent = true;
                        }
                        value = null;
                        control.check();
                        demand(control.phase === 'INVOKING', 'INVALID_CONTRACT');
                        if (action.operation.kind === 'read') {
                            demand(typeof result.value === 'string' && !values.has(action.operation.bindingId) && values.size < 32, 'READ_REFUSED');
                            const bytes = Buffer.byteLength(result.value);
                            demand(bytes <= 4096 && totalBytes + bytes <= 65536, 'READ_REFUSED');
                            await adapter.withhold(result.value);
                            control.check();
                            values.set(action.operation.bindingId, result.value);
                            totalBytes += bytes;
                        }
                        if (action.operation.kind === 'assert')
                            demand(result.assertionPassed === true, 'ASSERTION_FAILED');
                        control.check();
                    };
                    await control.run(perform);
                }
                demand(!signal.aborted, 'CANCELLED');
                demand(clock.now() < deadlineMs, 'TIMEOUT');
            }
            catch (error) {
                errorCode = replayError(error);
            }
            const finishedAtMs = clock.now();
            reporter.stepFinished({ stepIndex: step.stepIndex, status: errorCode === null ? 'PASS' : 'FAIL', startedAtMs, finishedAtMs, durationMs: finishedAtMs - startedAtMs, failure: errorCode, ...(errorCode === 'LOGIN_REQUIRED' && detail ? { detail } : {}) });
        }
        return { ok: errorCode === null, errorCode, secretUse: secretUse.snapshot(), ...(detail ? { detail } : {}) };
    }
    finally {
        values.clear();
        inputs.clear();
        await adapter.dispose().catch(() => undefined);
    }
}
//# sourceMappingURL=observedReplay.js.map