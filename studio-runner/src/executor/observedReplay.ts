import { SecretUseEvidence } from '../run/secretUse.js';
import { domainAllowed } from '../allowedDomains.js';
import { assertResolvedSecretLiterals, validateReplayArtifact } from '../validator/observedReplay.js';
import type { Artifact3, Execute3, Guard, Launch3, ReplayAction, Scope, StepFinished3 } from './observedOperations.js';
import { newTally, receiptFromTally, type ObservedAdapter, type StepReceipt } from '../run/observedReplayAdapter.js';
import type { Clock, StepReporter } from './stepReporter.js';
import { boundedObserved, demand, equalObserved, hashObserved, isRecord, OBSERVED_SCHEMA_BUNDLE_HASH, OBSERVED_LIMITS, OBSERVED_PROFILE, ObservedRefusal, validateObserved } from '../validator/observedReferencePolicy.js';
export type ReplayError = NonNullable<NonNullable<StepFinished3['receipt']['closedCode']>>;
export function replayError(error: unknown): ReplayError {
    if (error instanceof ObservedRefusal && ['INVALID_CONTRACT', 'PROFILE_MISMATCH', 'AUTHORIZATION_EXPIRED', 'REFERENCE_MISMATCH', 'POLICY_REFUSED', 'TARGET_DRIFT', 'READ_REFUSED', 'REFERENCE_REFUSED', 'ASSERTION_FAILED', 'CANCELLED', 'TIMEOUT', 'OUTCOME_UNKNOWN', 'INTERNAL_ERROR', 'LOGIN_REQUIRED', 'PASSWORD_CONTROL_READ_REFUSED', 'NAVIGATION_HTTP_ERROR'].includes(error.code))
        return error.code as ReplayError;
    return 'INTERNAL_ERROR';
}
const key = (c: ReplayAction['coordinate']): string => `${c.stepId}:${String(c.ordinal)}`;
/** A proof-frame cap never changes the ordinary Execute or artifact component limits. */
export const RETAINED_EXECUTE_MAX_BYTES = OBSERVED_LIMITS.execute + OBSERVED_LIMITS.artifact + 64;
export function boundObservedExecute(raw: unknown): void {
    const proof = isRecord(raw) && Object.hasOwn(raw,'retainedArtifact');
    boundedObserved(raw, proof ? RETAINED_EXECUTE_MAX_BYTES : OBSERVED_LIMITS.execute);
    if (proof && isRecord(raw)) {
        boundedObserved(Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'retainedArtifact')), OBSERVED_LIMITS.execute);
        boundedObserved(raw.retainedArtifact, OBSERVED_LIMITS.artifact);
    }
}
/** Local published joins only; the admitted whole artifact supplies the current-run commitment. */
function retainedReadBindings(a: Artifact3): ReadonlySet<string> {
    const zero = a.learnedPlan.bindings.filter(binding => binding.consumers.length === 0);
    if (zero.length === 0) return new Set();
    const plan=a.learnedPlan, inc=plan.incremental;
    demand(inc && inc.retainedPrefixAdmissionIds.length > 0,'REFERENCE_MISMATCH');
    const initial=plan.sourceSteps.indexOf(inc.initialFirstLearnStepId), effective=plan.sourceSteps.indexOf(inc.effectiveFirstLearnStepId);
    demand(initial >= 0 && effective >= 0 && effective <= initial,'REFERENCE_MISMATCH');
    const admissions=plan.actions.map(action=>action.admissionId), retained=inc.retainedPrefixAdmissionIds;
    demand(new Set(admissions).size === admissions.length && new Set(retained).size === retained.length && retained.length <= admissions.length && equalObserved(retained,admissions.slice(0,retained.length)),'REFERENCE_MISMATCH');
    for (const action of plan.actions.slice(0,retained.length)) demand(plan.sourceSteps.indexOf(action.coordinate.stepId) <= effective,'REFERENCE_MISMATCH');
    for (const binding of zero) {
        const action=plan.actions.find(item=>equalObserved(item.coordinate,binding.producer));
        demand(action !== undefined && action.operation.captures.includes(binding.bindingId) && action.origin===binding.sourceOrigin && action.admissionId===binding.provenance.producerAdmissionId && binding.provenance.sourceIntentStepId===action.coordinate.stepId && retained.includes(action.admissionId),'REFERENCE_MISMATCH');
        const operation=a.steps.flatMap(step=>step.operations).find(item=>equalObserved(item.coordinate,binding.producer));
        const guard=a.guards.find(item=>item.guardId===operation?.guardId);
        demand(operation && equalObserved(operation.operation,action.operation) && guard?.origin===binding.sourceOrigin,'REFERENCE_MISMATCH');
    }
    return new Set(zero.map(binding=>binding.bindingId));
}
/** What replay needs of a published input: the value-free metadata Execute3 carries. */
const executeInputs = (a: Artifact3, value: (inputId: string) => string): Execute3['inputs'] => a.inputRecipes.map(input => input.kind === 'secretRef'
    ? { inputId: input.inputId, stepId: input.stepId, kind: 'secretRef' as const, referenceName: input.provenance.kind === 'configuration' ? input.provenance.referenceName : '' }
    : { inputId: input.inputId, stepId: input.stepId, kind: input.kind, value: value(input.inputId) });
/** Artifact-only structural validation. This cannot authorize an executable IPC frame. */
export function validatePublishedArtifactGraph(a: Artifact3): void {
    const zero=retainedReadBindings(a);
    validateGraph(STRUCTURE_ONLY,{profileHash:hashObserved(a.profile),steps:a.steps,guards:a.guards,bindings:a.replayPolicy.bindings.map(binding=>({bindingId:binding.bindingId,producer:binding.producer,origin:binding.sourceOrigin})),transfers:a.replayPolicy.transfers,inputs:executeInputs(a,() => 'https://structure-validation.invalid/')},{principalId:'structure-validation',...a.replayPolicy.scope},zero);
}
/** Strict released-value child boundary. An optional typed accepted Launch is not an Execute-supplied grant. */
export function validateObservedExecute(raw: unknown, scope: Scope, allowedDomains: readonly string[], acceptedLaunch?: Launch3): Execute3 {
    boundObservedExecute(raw);
    const proof = isRecord(raw) && Object.hasOwn(raw,'retainedArtifact');
    const m=validateObserved<Execute3>('replay-ipc#/definitions/Execute3',raw,proof?RETAINED_EXECUTE_MAX_BYTES:OBSERVED_LIMITS.execute);
    const zero = new Set(m.bindings.filter(binding=>!m.transfers.some(transfer=>transfer.bindingId===binding.bindingId)).map(binding=>binding.bindingId));
    demand(proof === (zero.size > 0),'REFERENCE_MISMATCH');
    if (zero.size > 0) {
        demand(acceptedLaunch,'REFERENCE_MISMATCH');
        const launch=validateObserved<Launch3>('replay-ipc#/definitions/Launch3',acceptedLaunch,OBSERVED_LIMITS.launch), r=launch.admission.request;
        demand(launch.build.schemaBundleHash===OBSERVED_SCHEMA_BUNDLE_HASH,'PROFILE_MISMATCH');
        demand(launch.admission.admissionId===r.admissionId && m.runId===launch.runId && m.runId===r.executionId && m.attemptId===launch.attemptId && m.attemptId===r.attemptId && m.configurationHash===launch.configurationHash && m.configurationHash===r.configurationHash && m.profileHash===hashObserved(launch.profile) && equalObserved(launch.profile,r.profile) && equalObserved(launch.build,r.build),'EVIDENCE_MISMATCH');
        demand(equalObserved(scope,launch.scope) && hashObserved(scope)===launch.scopeHash && launch.scopeHash===r.scopeHash && launch.build.profileHash===m.profileHash,'POLICY_REFUSED');
        demand(hashObserved({browser:launch.browser,viewport:launch.viewport,timeoutSeconds:m.stepTimeoutMs/1000,waitStrategy:m.waitStrategy,environment:scope.environment})===m.configurationHash,'EVIDENCE_MISMATCH');
        const a=validateReplayArtifact(m.retainedArtifact);
        demand(hashObserved(a)===r.artifactHash && hashObserved(a.learnedPlan)===r.learnedPlanHash && a.learnedPlanHash===r.learnedPlanHash && hashObserved(a.replayPolicy)===r.referencePolicyHash && a.replayPolicy.publicationEvidenceHash===r.publicationEvidenceHash && a.configurationHash===r.configurationHash && equalObserved(a.profile,launch.profile),'EVIDENCE_MISMATCH');
        const requirements={csiId:scope.csiId,environment:scope.environment,capabilities:scope.capabilities,initialContext:scope.initialContext};
        demand(equalObserved(requirements,a.replayPolicy.scope) && equalObserved(m.steps,a.steps) && equalObserved(m.guards,a.guards) && equalObserved(m.transfers,a.replayPolicy.transfers) && equalObserved(m.bindings,a.replayPolicy.bindings.map(binding=>({bindingId:binding.bindingId,producer:binding.producer,origin:binding.sourceOrigin}))),'REFERENCE_MISMATCH');
        const metadata=m.inputs.map(input=>input.kind==='secretRef'?input:{inputId:input.inputId,stepId:input.stepId,kind:input.kind});
        const recipes=a.inputRecipes.map(input=>{if(input.kind==='secretRef'){demand(input.provenance.kind==='configuration','REFERENCE_MISMATCH');return {inputId:input.inputId,stepId:input.stepId,kind:'secretRef',referenceName:input.provenance.referenceName};}return {inputId:input.inputId,stepId:input.stepId,kind:input.kind};});
        demand(equalObserved(metadata,recipes),'REFERENCE_MISMATCH');
        const qualified=retainedReadBindings(a);demand(zero.size===qualified.size&&[...zero].every(id=>qualified.has(id)),'REFERENCE_MISMATCH');
    }
    demand(Object.values(m.secrets).every(value=>value.length<=4096),'LIMIT_EXCEEDED');
    validateGraph(domainCheck(allowedDomains),m,scope,zero);
    const inputs=new Map(m.inputs.map(input=>[input.inputId,input]));
    for(const action of m.steps.flatMap(step=>step.operations)){
        for(const use of action.operation.uses) if(use.kind==='secret'){
            const input=[...inputs.values()].find(item=>item.kind==='secretRef'&&item.referenceName===use.id&&item.stepId===action.coordinate.stepId);
            demand(input&&Object.hasOwn(m.secrets,use.id),'REFERENCE_MISMATCH');
        }
    }
    return m;
}
/** Already schema-parsed projection checked against the runner's whitelist; no secret maps or authority. */
export function validateObservedReplayGraph(m: Pick<Execute3, 'profileHash' | 'steps' | 'guards' | 'bindings' | 'transfers' | 'inputs'>, scope: Scope, allowedDomains: readonly string[]): void { validateGraph(domainCheck(allowedDomains),m,scope,new Set()); }
/** How a guard origin or destination URL is checked against the whitelist. */
type OriginCheck = (url: string) => boolean;
const domainCheck = (allowedDomains: readonly string[]): OriginCheck => url => domainAllowed(allowedDomains, url);
/** Artifact-only structure (no runner, no whitelist): origins are not authority here and this cannot authorize an executable frame. */
const STRUCTURE_ONLY: OriginCheck = () => true;
function validateGraph(originAllowed: OriginCheck, m: Pick<Execute3, 'profileHash' | 'steps' | 'guards' | 'bindings' | 'transfers' | 'inputs'>, scope: Scope, retainedZeroConsumerBindings: ReadonlySet<string>): void {
    demand(m.profileHash === hashObserved(OBSERVED_PROFILE), 'PROFILE_MISMATCH');
    const guards = new Map(m.guards.map(g => [g.guardId, g])), inputs = new Map(m.inputs.map(i => [i.inputId, i])), bindings = new Map(m.bindings.map(b => [b.bindingId, b]));
    demand(guards.size === m.guards.length && inputs.size === m.inputs.length && bindings.size === m.bindings.length);
    demand(m.inputs.reduce((n, i) => n + (i.kind === 'secretRef' ? 0 : Buffer.byteLength(i.value)), 0) <= OBSERVED_LIMITS.inputs, 'LIMIT_EXCEEDED');
    const actions = m.steps.flatMap(s => s.operations), coordinates = new Map(actions.map((a, i) => [key(a.coordinate), i]));
    demand(actions.length <= 200 && coordinates.size === actions.length && guards.size === actions.length);
    const stepIds = new Set<string>();
    let i = 0;
    for (const [si, s] of m.steps.entries()) {
        demand(s.stepIndex === si && !stepIds.has(s.stepId));
        stepIds.add(s.stepId);
        for (const [oi, a] of s.operations.entries()) {
            const g: Guard | undefined = guards.get(a.guardId);
            demand(g && a.guardId === `g${String(i)}` && a.coordinate.stepId === s.stepId && a.coordinate.ordinal === oi);
            demand(scope.capabilities.includes(a.operation.kind), 'POLICY_REFUSED');
            if (g.origin === null)
                demand(i === 0 && scope.initialContext.kind === 'initialBlank');
            else
                demand(originAllowed(g.origin), 'POLICY_REFUSED');
            if (i === 0 && scope.initialContext.kind === 'initialBlank')
                demand(g.origin === null);
            if (i === 0 && scope.initialContext.kind === 'observedDocument')
                demand(g.origin === scope.initialContext.origin);
            // The frozen record: the code is exactly what its hash names. runStep checks it again before it builds the function.
            const operation = a.operation;
            demand(hashObserved(operation.code) === operation.sourceHash, 'REFERENCE_MISMATCH');
            for (const use of operation.uses) {
                if (use.kind === 'input') {
                    const input = inputs.get(use.id);
                    demand(input && input.kind !== 'secretRef' && input.stepId === s.stepId, 'REFERENCE_REFUSED');
                    demand(Buffer.byteLength(input.value) <= 16384, 'LIMIT_EXCEEDED');
                    if (input.kind === 'destination') {
                        let u: URL;
                        try {
                            u = new URL(input.value);
                        }
                        catch {
                            throw new ObservedRefusal('REFERENCE_REFUSED');
                        }
                        demand(originAllowed(input.value) && !u.username && !u.password && Buffer.byteLength(input.value) <= 4096, 'POLICY_REFUSED');
                    }
                }
                else if (use.kind === 'secret')
                    demand([...inputs.values()].some(input => input.kind === 'secretRef' && input.referenceName === use.id && input.stepId === s.stepId), 'REFERENCE_MISMATCH');
                else {
                    const binding = bindings.get(use.id), edges = m.transfers.filter(t => t.bindingId === use.id && key(t.consumer) === key(a.coordinate));
                    demand(binding && edges.length === 1 && g.origin === binding.origin, 'REFERENCE_REFUSED');
                }
            }
            for (const captured of operation.captures) {
                const binding = bindings.get(captured);
                demand(binding && equalObserved(binding.producer, a.coordinate) && g.origin === binding.origin, 'REFERENCE_REFUSED');
            }
            i++;
        }
    }
    for (const input of m.inputs) {
        demand(stepIds.has(input.stepId), 'REFERENCE_REFUSED');
        if (input.kind === 'secretRef') demand(/^[A-Za-z0-9_.-]{1,64}$/u.test(input.referenceName), 'REFERENCE_MISMATCH');
    }
    const seen = new Set<string>();
    for (const transfer of m.transfers) {
        const producer = coordinates.get(key(transfer.producer)), consumer = coordinates.get(key(transfer.consumer)), b = bindings.get(transfer.bindingId);
        const edge = key(transfer.consumer) + ':' + transfer.bindingId;
        demand(!seen.has(edge) && producer !== undefined && consumer !== undefined && producer < consumer && b && equalObserved(b.producer, transfer.producer) && b.origin === transfer.origin, 'REFERENCE_REFUSED');
        seen.add(edge);
        demand(actions[consumer]?.operation.uses.some(use => use.kind === 'binding' && use.id === transfer.bindingId) === true, 'REFERENCE_REFUSED');
    }
    for (const b of m.bindings) {
        const producer = coordinates.get(key(b.producer)), op = producer === undefined ? undefined : actions[producer]?.operation;
        demand(op?.captures.includes(b.bindingId) === true && (m.transfers.some(t => t.bindingId === b.bindingId) || retainedZeroConsumerBindings.has(b.bindingId)), 'REFERENCE_REFUSED');
    }
}
export interface InvocationControl {
    readonly deadlineMs: number;
    /** Milliseconds left on THIS control's own clock (the executor's run clock, or the wall clock for a guided dispatch); never negative. */
    remainingMs?(): number;
    readonly signal: AbortSignal;
    readonly phase: 'PREPARING' | 'INVOKING' | 'FINISHED' | 'POISONED';
    check(): void;
    /**
     * Crosses the fence. Replay's control is synchronous and returns undefined (no extra microtask). A guided control returns ONE memoised
     * promise that settles on the server's ack: nothing may take effect, and no secret value may be read, before it resolves; a rejection
     * is final and never retried.
     */
    beginInvocation(): void | Promise<void>;
    poison(reason: 'TIMEOUT' | 'CANCELLED'): void;
}
/** The timer poisons authority before rejecting; late work can only clean up. */
export class ObservedInvocationControl implements InvocationControl {
    private state: InvocationControl['phase'] = 'PREPARING';
    private failure: ReplayError | null = null;
    private readonly abort = new AbortController();
    private executing = false;
    constructor(private readonly clock: Clock, readonly deadlineMs: number, private readonly parent: AbortSignal) { }
    get phase(): InvocationControl['phase'] { return this.state; }
    remainingMs(): number { return Math.max(0, this.deadlineMs - this.clock.now()); }
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
/** Authored literals the replay scrubs from observations. Learning withholds only configuration-provenance literals (AUTHORED-ECHO-01); source-span literals are already visible in the authored source, so the replay withholds exactly the same set. */
export function replayWithheldLiterals(inputs: Execute3['inputs'], recipes: readonly { inputId: string; provenance: { kind: string } }[]): string[] {
    const configured = new Set(recipes.filter(recipe => recipe.provenance.kind === 'configuration').map(recipe => recipe.inputId));
    return inputs.flatMap(input => input.kind !== 'secretRef' && input.value.length > 0 && configured.has(input.inputId) ? [input.inputId] : []);
}
const CAPTURE_LIMITS = Object.freeze({ values: 32, valueBytes: 4096, totalBytes: 65536 });
const emptyReceipt = (stepHash: string, closedCode: StepReceipt['closedCode']): StepReceipt => ({ closedCode, stepHash, fenceCrossed: false, effects: [], effectsTruncated: false, offscreen: false });
/** The code a step is known by: its operation record, or the list of them when a published step carries several. */
export const stepHashOf = (operations: readonly ReplayAction[]): string => hashObserved(operations.length === 1 ? operations[0]?.operation : operations.map(action => action.operation));
/** The receipt of a step is its operations' receipts folded: the first closed code, any fence or offscreen, the first 64 effects. */
function foldReceipts(stepHash: string, parts: readonly StepReceipt[], closedCode: StepReceipt['closedCode']): StepReceipt {
    const effects = parts.flatMap(part => part.effects);
    return { closedCode, stepHash, fenceCrossed: parts.some(part => part.fenceCrossed), effects: effects.slice(0, 64), effectsTruncated: effects.length > 64 || parts.some(part => part.effectsTruncated), offscreen: parts.some(part => part.offscreen) };
}
export async function executeObservedReplay(message: Execute3, adapter: ObservedAdapter, scope: Scope, allowedDomains: readonly string[], clock: Clock, reporter: StepReporter, signal: AbortSignal, runDeadlineMs = clock.now() + message.stepTimeoutMs * message.steps.length, usageEvidence?: SecretUseEvidence, acceptedLaunch?: Launch3): Promise<{
    ok: boolean;
    errorCode: ReplayError | null;
    secretUse: Record<string, 'USED' | 'NOT_USED' | 'REFUSED'>;
    detail?: { stepId: string; loginStepsPresent: boolean };
}> {
    validateObservedExecute(message, scope, allowedDomains, acceptedLaunch);
    assertResolvedSecretLiterals(message);
    const values = new Map<string, string>(), inputs = new Map(message.inputs.map(i => [i.inputId, i])), guards = new Map<string, Guard>(message.guards.map(g => [g.guardId, g]));
    let totalBytes = 0, errorCode: ReplayError | null = null, loginStepsPresent = false;
    let detail: { stepId: string; loginStepsPresent: boolean } | undefined;
    const secretUse = usageEvidence ?? new SecretUseEvidence(Object.keys(message.secrets));
    try {
        const setup = new ObservedInvocationControl(clock, runDeadlineMs, signal);
        const withheldLiterals = new Set(replayWithheldLiterals(message.inputs, message.retainedArtifact?.inputRecipes ?? []));
        const withholdInputs = async (): Promise<void> => { for (const input of message.inputs) {
            setup.check();
            if (input.kind !== 'secretRef' && withheldLiterals.has(input.inputId))
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
            const stepHash = stepHashOf(step.operations);
            if (errorCode !== null || signal.aborted) {
                errorCode ??= 'CANCELLED';
                reporter.stepFinished({ stepIndex: step.stepIndex, status: 'SKIPPED', startedAtMs: null, finishedAtMs: null, durationMs: null, failure: null, receipt: emptyReceipt(stepHash, null) });
                continue;
            }
            const startedAtMs = clock.now(), deadlineMs = Math.min(runDeadlineMs, startedAtMs + message.stepTimeoutMs);
            reporter.stepStarted({ stepIndex: step.stepIndex, startedAtMs });
            const parts: StepReceipt[] = [];
            try {
                for (const action of step.operations) {
                    const control = new ObservedInvocationControl(clock, deadlineMs, signal);
                    // The adapter writes into this tally as the step runs, so a deadline that abandons the run still leaves the facts.
                    const tally = newTally();
                    const progress = { finished: false };
                    const perform = async (): Promise<void> => {
                        const guard = guards.get(action.guardId);
                        demand(guard);
                        const stepInputs: Record<string, string> = {}, vars: Record<string, string> = {}, secretIds: string[] = [];
                        for (const use of action.operation.uses) {
                            if (use.kind === 'input') {
                                const input = inputs.get(use.id);
                                demand(input && input.kind !== 'secretRef', 'REFERENCE_REFUSED');
                                stepInputs[use.id] = input.value;
                            }
                            else if (use.kind === 'secret') {
                                demand(Object.hasOwn(message.secrets, use.id), 'REFERENCE_MISMATCH');
                                secretIds.push(use.id);
                            }
                            else {
                                const value = values.get(use.id);
                                demand(value !== undefined, 'REFERENCE_REFUSED');
                                vars[use.id] = value;
                            }
                        }
                        control.check();
                        if (secretIds.length > 0) loginStepsPresent = true;
                        const outcome = await adapter.perform(action, guard, { inputs: stepInputs, vars, secretIds, secrets: message.secrets, secretOrigins: message.secretOrigins, secretUse }, control, tally);
                        progress.finished = true;
                        parts.push(outcome.receipt);
                        if (outcome.receipt.closedCode !== null) {
                            if (outcome.receipt.closedCode === 'TARGET_DRIFT' || outcome.receipt.closedCode === 'POLICY_REFUSED') {
                                if (adapter.loginRequired?.() === true) { detail = { stepId: action.coordinate.stepId, loginStepsPresent }; throw new ObservedRefusal('LOGIN_REQUIRED'); }
                            }
                            throw new ObservedRefusal(outcome.receipt.closedCode);
                        }
                        for (const [bindingId, value] of Object.entries(outcome.captured)) {
                            const bytes = Buffer.byteLength(value);
                            demand(!values.has(bindingId) && values.size < CAPTURE_LIMITS.values && bytes <= CAPTURE_LIMITS.valueBytes && totalBytes + bytes <= CAPTURE_LIMITS.totalBytes, 'READ_REFUSED');
                            adapter.commitCapture(value);
                            control.check();
                            values.set(bindingId, value);
                            totalBytes += bytes;
                        }
                        control.check();
                    };
                    try { await control.run(perform); }
                    catch (error) {
                        // A run abandoned at the deadline or by cancellation never returned its receipt: the tally has what happened.
                        if (!progress.finished) parts.push(receiptFromTally(action.operation, tally, error instanceof ObservedRefusal ? replayError(error) : null));
                        throw error;
                    }
                }
                demand(!signal.aborted, 'CANCELLED');
                demand(clock.now() < deadlineMs, 'TIMEOUT');
            }
            catch (error) {
                errorCode = replayError(error);
            }
            const finishedAtMs = clock.now();
            reporter.stepFinished({ stepIndex: step.stepIndex, status: errorCode === null ? 'PASS' : 'FAIL', startedAtMs, finishedAtMs, durationMs: finishedAtMs - startedAtMs, failure: errorCode, receipt: foldReceipts(stepHash, parts, errorCode), ...(errorCode === 'LOGIN_REQUIRED' && detail ? {detail} : {}) });
        }
        return { ok: errorCode === null, errorCode, secretUse: secretUse.snapshot(), ...(detail ? {detail} : {}) };
    }
    finally {
        values.clear();
        inputs.clear();
        await adapter.dispose().catch(() => undefined);
    }
}
