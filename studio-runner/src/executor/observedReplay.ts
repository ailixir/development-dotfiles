import type { Execute2, Guard, ReplayAction, Scope, StepFinished2 } from './observedOperations.js';
import type { ObservedAdapter } from '../run/observedReplayAdapter.js';
import type { Clock, StepReporter } from './adapters/StepReporter.js';
import { demand, equalObserved, hashObserved, OBSERVED_LIMITS, OBSERVED_PROFILE, ObservedRefusal, validateObserved } from '../validator/observedReferencePolicy.js';
export type ReplayError = NonNullable<StepFinished2['errorCode']>;
export function replayError(error: unknown): ReplayError {
    if (error instanceof ObservedRefusal && ['INVALID_CONTRACT', 'PROFILE_MISMATCH', 'AUTHORIZATION_EXPIRED', 'ACCOUNT_UNAVAILABLE', 'ACCOUNT_UNKNOWN', 'POLICY_REFUSED', 'TARGET_DRIFT', 'READ_REFUSED', 'REFERENCE_REFUSED', 'ASSERTION_FAILED', 'CANCELLED', 'TIMEOUT', 'OUTCOME_UNKNOWN', 'INTERNAL_ERROR'].includes(error.code))
        return error.code as ReplayError;
    return 'INTERNAL_ERROR';
}
const key = (c: ReplayAction['coordinate']): string => `${c.stepId}:${String(c.ordinal)}`;
function slot(op: ReplayAction['operation']): string { return op.kind === 'navigate' ? 'navigate.destination' : op.kind === 'assert' ? 'assert.expected' : op.kind === 'fill' || op.kind === 'selectOption' ? op.kind + '.value' : ''; }
function arg(op: ReplayAction['operation']): {
    kind: 'authoredLiteral';
    sourceInputId: string;
} | {
    kind: 'binding';
    bindingId: string;
} | null { return op.kind === 'navigate' ? { kind: 'authoredLiteral', sourceInputId: op.destinationInputId } : op.kind === 'fill' || op.kind === 'selectOption' ? op.value : op.kind === 'assert' ? op.expected : null; }
/** Check only facts the collector actually recorded; live checks own subtype/focus/state details. */
export function validateRecordedTarget(operation: ReplayAction['operation'], target: Extract<Guard['target'], {
    kind: 'element';
}>): void {
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
/** Source-free independent child graph validation before an operation is invoked. */
export function validateObservedExecute(raw: unknown, scope: Scope): Execute2 {
    const m = validateObserved<Execute2>('replay-ipc#/definitions/Execute2', raw, OBSERVED_LIMITS.execute);
    demand(m.profileHash === hashObserved(OBSERVED_PROFILE), 'PROFILE_MISMATCH');
    const guards = new Map(m.guards.map(g => [g.guardId, g])), inputs = new Map(m.inputs.map(i => [i.inputId, i])), bindings = new Map(m.bindings.map(b => [b.bindingId, b]));
    demand(guards.size === m.guards.length && inputs.size === m.inputs.length && bindings.size === m.bindings.length);
    demand(m.inputs.reduce((n, i) => n + Buffer.byteLength(i.value), 0) <= OBSERVED_LIMITS.inputs, 'LIMIT_EXCEEDED');
    const actions = m.steps.flatMap(s => s.operations), coordinates = new Map(actions.map((a, i) => [key(a.coordinate), i]));
    demand(actions.length <= 200 && coordinates.size === actions.length && guards.size === actions.length);
    const stepIds = new Set<string>();
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
            demand(page === (g.target.kind !== 'element'));
            if (i === 0 && scope.initialContext.kind === 'initialBlank')
                demand(g.target.kind === 'initialBlank');
            if (i === 0 && scope.initialContext.kind === 'observedDocument')
                demand(g.origin === scope.initialContext.origin);
            if (g.target.kind === 'element')
                validateRecordedTarget(a.operation, g.target);
            const argument = arg(a.operation);
            if (argument?.kind === 'authoredLiteral') {
                const input = inputs.get(argument.sourceInputId);
                demand(input && input.stepId === s.stepId && input.intendedSlot === slot(a.operation), 'REFERENCE_REFUSED');
                demand(Buffer.byteLength(input.value) <= 16384, 'LIMIT_EXCEEDED');
                if (a.operation.kind === 'navigate') {
                    let u: URL;
                    try {
                        u = new URL(input.value);
                    }
                    catch {
                        throw new ObservedRefusal('REFERENCE_REFUSED');
                    }
                    demand(input.kind === 'destination' && scope.allowedOrigins.includes(u.origin) && !u.username && !u.password && Buffer.byteLength(input.value) <= 4096, 'POLICY_REFUSED');
                }
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
    for (const input of m.inputs)
        demand(stepIds.has(input.stepId) && input.kind === 'destination' === (input.intendedSlot === 'navigate.destination'), 'REFERENCE_REFUSED');
    const seen = new Set<string>();
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
        demand(op?.kind === 'read' && op.bindingId === b.bindingId && m.transfers.some(t => t.bindingId === b.bindingId), 'REFERENCE_REFUSED');
    }
    return m;
}
export const ACQUISITION_LIMITS = Object.freeze({ firstDelayMs: 100, nextDelayMs: 250, extraPerStep: 32, extraPerRun: 200, totalPerRun: 400, totalBytes: 13107200, observationBytes: 32768 });
export interface AcquisitionStepBudget {
    extra: number;
}
export class ReplayAcquisitionBudget {
    private extra = 0;
    private total = 0;
    private bytes = 0;
    reserve(step: AcquisitionStepBudget, additional: boolean): (bytes: number) => void {
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
    snapshot(): {
        extra: number;
        total: number;
        bytes: number;
    } { return { extra: this.extra, total: this.total, bytes: this.bytes }; }
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
export class ObservedInvocationControl implements InvocationControl {
    private state: InvocationControl['phase'] = 'PREPARING';
    private failure: ReplayError | null = null;
    private readonly abort = new AbortController();
    private executing = false;
    constructor(private readonly clock: Clock, readonly deadlineMs: number, private readonly parent: AbortSignal, private readonly budget: ReplayAcquisitionBudget, private readonly step: AcquisitionStepBudget) { }
    get phase(): InvocationControl['phase'] { return this.state; }
    get signal(): AbortSignal { return this.abort.signal; }
    poison(reason: 'TIMEOUT' | 'CANCELLED'): void {
        if (this.state === 'POISONED' || this.state === 'FINISHED')
            return;
        this.failure = reason === 'TIMEOUT' && this.state === 'INVOKING' ? 'OUTCOME_UNKNOWN' : reason;
        this.state = 'POISONED';
        this.abort.abort();
    }
    check(): void {
        if (this.parent.aborted)
            this.poison('CANCELLED');
        if (this.clock.now() >= this.deadlineMs)
            this.poison('TIMEOUT');
        demand(this.state !== 'FINISHED', 'CANCELLED');
        if (this.failure)
            throw new ObservedRefusal(this.failure);
    }
    beginInvocation(): void { this.check(); demand(this.state === 'PREPARING', 'INVALID_CONTRACT'); this.state = 'INVOKING'; }
    reserveObservation(additional: boolean): (bytes: number) => void {
        this.check();
        demand(this.state === 'PREPARING', 'INVALID_CONTRACT');
        const settle = this.budget.reserve(this.step, additional);
        return bytes => { this.check(); settle(bytes); };
    }
    async waitForAdditionalObservation(): Promise<void> {
        this.check();
        demand(this.state === 'PREPARING', 'INVALID_CONTRACT');
        const delay = this.step.extra === 0 ? ACQUISITION_LIMITS.firstDelayMs : ACQUISITION_LIMITS.nextDelayMs;
        await new Promise<void>((resolve, reject) => { const stopped = (): void => { clearTimeout(timer); this.signal.removeEventListener('abort', stopped); reject(new ObservedRefusal(this.failure ?? 'CANCELLED')); }; const timer = setTimeout(() => { this.signal.removeEventListener('abort', stopped); resolve(); }, delay); this.signal.addEventListener('abort', stopped, { once: true }); if (this.signal.aborted)
            stopped(); });
        this.check();
    }
    async run<T>(work: () => Promise<T>): Promise<T> {
        demand(!this.executing, 'INVALID_CONTRACT');
        this.executing = true;
        this.check();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let cancel = (): void => undefined;
        const stopped = new Promise<never>((_resolve, reject) => {
            cancel = (): void => { this.poison('CANCELLED'); reject(new ObservedRefusal(this.failure ?? 'CANCELLED')); };
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
export async function executeObservedReplay(message: Execute2, adapter: ObservedAdapter, scope: Scope, clock: Clock, reporter: StepReporter, signal: AbortSignal, runDeadlineMs = clock.now() + message.stepTimeoutMs * message.steps.length): Promise<{
    ok: boolean;
    errorCode: ReplayError | null;
}> {
    validateObservedExecute(message, scope);
    const values = new Map<string, string>(), inputs = new Map(message.inputs.map(i => [i.inputId, i])), guards = new Map<string, Guard>(message.guards.map(g => [g.guardId, g]));
    const budget = new ReplayAcquisitionBudget();
    let totalBytes = 0, errorCode: ReplayError | null = null;
    try {
        const setup = new ObservedInvocationControl(clock, runDeadlineMs, signal, budget, { extra: 0 });
        const withholdInputs = async (): Promise<void> => { for (const input of message.inputs) {
            setup.check();
            if (input.value.length > 0)
                await adapter.withhold(input.value);
            setup.check();
        } };
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
                    const perform = async (): Promise<void> => {
                        const argument = arg(action.operation);
                        let value: string | null = null;
                        if (argument?.kind === 'authoredLiteral')
                            value = inputs.get(argument.sourceInputId)?.value ?? null;
                        else if (argument?.kind === 'binding')
                            value = values.get(argument.bindingId) ?? null;
                        if (argument !== null)
                            demand(value !== null, 'REFERENCE_REFUSED');
                        const guard = guards.get(action.guardId);
                        demand(guard);
                        control.check();
                        const result = await adapter.perform(action, guard, value, control);
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
            reporter.stepFinished({ stepIndex: step.stepIndex, status: errorCode === null ? 'PASS' : 'FAIL', startedAtMs, finishedAtMs, durationMs: finishedAtMs - startedAtMs, failure: errorCode });
        }
        return { ok: errorCode === null, errorCode };
    }
    finally {
        values.clear();
        inputs.clear();
        await adapter.dispose().catch(() => undefined);
    }
}
