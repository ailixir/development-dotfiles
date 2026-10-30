import { SecretUseEvidence } from '../run/secretUse.js';
import { domainAllowed } from '../allowedDomains.js';
import { assertResolvedSecretLiterals, validateReplayArtifact } from '../validator/observedReplay.js';
import type { Artifact3, Execute3, Guard, Launch3, ReplayAction, Scope, StepFinished3 } from './observedOperations.js';
import type { ObservedAdapter } from '../run/observedReplayAdapter.js';
import type { Clock, StepReporter } from './stepReporter.js';
import { boundedObserved, demand, equalObserved, hashObserved, isRecord, OBSERVED_SCHEMA_BUNDLE_HASH, OBSERVED_LIMITS, OBSERVED_PROFILE, ObservedRefusal, validateObserved } from '../validator/observedReferencePolicy.js';
export type ReplayError = NonNullable<StepFinished3['errorCode']>;
export function replayError(error: unknown): ReplayError {
    if (error instanceof ObservedRefusal && ['INVALID_CONTRACT', 'PROFILE_MISMATCH', 'AUTHORIZATION_EXPIRED', 'REFERENCE_MISMATCH', 'POLICY_REFUSED', 'TARGET_DRIFT', 'READ_REFUSED', 'REFERENCE_REFUSED', 'ASSERTION_FAILED', 'CANCELLED', 'TIMEOUT', 'OUTCOME_UNKNOWN', 'INTERNAL_ERROR', 'LOGIN_REQUIRED', 'PASSWORD_CONTROL_READ_REFUSED'].includes(error.code))
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
} | {
    kind: 'secretRef';
    sourceInputId: string;
} | null { return op.kind === 'navigate' ? { kind: 'authoredLiteral', sourceInputId: op.destinationInputId } : op.kind === 'fill' || op.kind === 'selectOption' ? op.value : op.kind === 'assert' ? op.expected : null; }
/**
 * Structural sanity of a recorded element target (ADR-SC-007 D-8). The recorded identity carries the role; the operation-vs-role table
 * below is a coarse check, the precise editable / checkable rule is the backend gate and Playwright's own actionability at run time.
 * A password read or hasValue is refused live (targetAction.ts), where the element is known; visible / elementType / controlType
 * are no longer recorded.
 */
const FILL_ROLES: ReadonlySet<string> = new Set(['textbox', 'searchbox', 'spinbutton', 'combobox']);
const SELECT_ROLES: ReadonlySet<string> = new Set(['combobox', 'listbox', 'option', 'radio', 'menuitemradio']);
const CHECK_ROLES: ReadonlySet<string> = new Set(['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio']);
export function validateRecordedTarget(operation: ReplayAction['operation'], target: Extract<Guard['target'], {
    kind: 'element';
}>): void {
    const role = target.identity.role;
    if (target.assertTextMode) {
        demand(operation.kind === 'assert' && operation.predicate === 'containsText', 'REFERENCE_MISMATCH');
        demand(target.assertTextMode === 'DIRECT_PUBLIC' ? operation.expected?.kind === 'authoredLiteral' && role === 'paragraph' && target.identity.name === null
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Refuse malformed runtime enum values even across typed call boundaries.
            : target.assertTextMode === 'READ_BINDING_SOURCE' && operation.expected?.kind === 'binding', 'REFERENCE_MISMATCH');
    }
    if (operation.kind === 'fill')
        demand(FILL_ROLES.has(role), 'TARGET_DRIFT');
    if (operation.kind === 'selectOption')
        demand(SELECT_ROLES.has(role), 'TARGET_DRIFT');
    if (operation.kind === 'check' || operation.kind === 'uncheck')
        demand(CHECK_ROLES.has(role), 'TARGET_DRIFT');
    // A controlValue recipe is still a valid published shape; the kept read profile never grants it, so the live read (targetAction.ts) refuses it.
    if (operation.kind === 'read')
        demand(target.readRuleId === operation.recipe.policyRuleId, 'READ_REFUSED');
}
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
        demand(action?.operation.kind==='read' && action.operation.bindingId===binding.bindingId && equalObserved(action.operation.recipe,binding.recipe) && action.origin===binding.sourceOrigin && action.admissionId===binding.provenance.producerAdmissionId && binding.provenance.sourceIntentStepId===action.coordinate.stepId && retained.includes(action.admissionId),'REFERENCE_MISMATCH');
        const operation=a.steps.flatMap(step=>step.operations).find(item=>equalObserved(item.coordinate,binding.producer));
        const guard=a.guards.find(item=>item.guardId===operation?.guardId);
        demand(operation && equalObserved(operation.operation,action.operation) && guard?.target.kind==='element' && guard.origin===binding.sourceOrigin && equalObserved({locator:guard.target.locator,tier:guard.target.tier,identity:guard.target.identity},action.target) && guard.target.readRuleId===binding.recipe.policyRuleId,'REFERENCE_MISMATCH');
    }
    return new Set(zero.map(binding=>binding.bindingId));
}
/** Artifact-only structural validation. This cannot authorize an executable IPC frame. */
export function validatePublishedArtifactGraph(a: Artifact3): void {
    const zero=retainedReadBindings(a);
    validateGraph(STRUCTURE_ONLY,{profileHash:hashObserved(a.profile),steps:a.steps,guards:a.guards,bindings:a.replayPolicy.bindings.map(binding=>({bindingId:binding.bindingId,producer:binding.producer,recipe:binding.recipe,origin:binding.sourceOrigin})),transfers:a.replayPolicy.transfers,inputs:a.inputRecipes.map(input=>input.kind==='secretRef'?{inputId:input.inputId,stepId:input.stepId,kind:'secretRef',intendedSlot:'fill.value',referenceName:input.provenance.kind==='configuration'?input.provenance.referenceName:''}:{inputId:input.inputId,stepId:input.stepId,kind:input.kind,intendedSlot:input.intendedSlot,value:input.kind==='destination'?'https://structure-validation.invalid/':''})},{principalId:'structure-validation',...a.replayPolicy.scope},zero);
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
        demand(equalObserved(requirements,a.replayPolicy.scope) && equalObserved(m.steps,a.steps) && equalObserved(m.guards,a.guards) && equalObserved(m.transfers,a.replayPolicy.transfers) && equalObserved(m.bindings,a.replayPolicy.bindings.map(binding=>({bindingId:binding.bindingId,producer:binding.producer,recipe:binding.recipe,origin:binding.sourceOrigin}))),'REFERENCE_MISMATCH');
        const metadata=m.inputs.map(input=>input.kind==='secretRef'?input:{inputId:input.inputId,stepId:input.stepId,kind:input.kind,intendedSlot:input.intendedSlot});
        const recipes=a.inputRecipes.map(input=>{if(input.kind==='secretRef'){demand(input.provenance.kind==='configuration','REFERENCE_MISMATCH');return {inputId:input.inputId,stepId:input.stepId,kind:'secretRef',intendedSlot:'fill.value',referenceName:input.provenance.referenceName};}return {inputId:input.inputId,stepId:input.stepId,kind:input.kind,intendedSlot:input.intendedSlot};});
        demand(equalObserved(metadata,recipes),'REFERENCE_MISMATCH');
        const qualified=retainedReadBindings(a);demand(zero.size===qualified.size&&[...zero].every(id=>qualified.has(id)),'REFERENCE_MISMATCH');
    }
    demand(Object.values(m.secrets).every(value=>value.length<=4096),'LIMIT_EXCEEDED');
    validateGraph(domainCheck(allowedDomains),m,scope,zero);
    const inputs=new Map(m.inputs.map(input=>[input.inputId,input]));
    for(const action of m.steps.flatMap(step=>step.operations)){
        const argument=arg(action.operation);
        if(argument?.kind==='secretRef'){const input=inputs.get(argument.sourceInputId);demand(input?.kind==='secretRef'&&Object.hasOwn(m.secrets,input.referenceName),'REFERENCE_MISMATCH');}
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
            const g = guards.get(a.guardId);
            demand(g && a.guardId === `g${String(i)}` && a.coordinate.stepId === s.stepId && a.coordinate.ordinal === oi);
            demand(scope.capabilities.includes(a.operation.kind), 'POLICY_REFUSED');
            if (g.origin === null)
                demand(i === 0 && scope.initialContext.kind === 'initialBlank' && g.target.kind === 'initialBlank' && a.operation.kind === 'navigate');
            else
                demand(originAllowed(g.origin) && g.target.kind !== 'initialBlank', 'POLICY_REFUSED');
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
                    let u: URL;
                    try {
                        u = new URL(input.value);
                    }
                    catch {
                        throw new ObservedRefusal('REFERENCE_REFUSED');
                    }
                    demand(input.kind === 'destination' && originAllowed(input.value) && !u.username && !u.password && Buffer.byteLength(input.value) <= 4096, 'POLICY_REFUSED');
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
        if (input.kind === 'secretRef') demand(/^[A-Za-z0-9_.-]{1,64}$/u.test(input.referenceName), 'REFERENCE_MISMATCH');
    }
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
        demand(op?.kind === 'read' && op.bindingId === b.bindingId && (m.transfers.some(t => t.bindingId === b.bindingId) || retainedZeroConsumerBindings.has(b.bindingId)), 'REFERENCE_REFUSED');
    }
}
/** observationBytes is the limits-schema default and maximum of maxObservationBytes (ties to schemas.limits in executor tests); an element poll settles 0 bytes. */
const OBSERVATION_BYTES = 524288;
export const ACQUISITION_LIMITS = Object.freeze({ firstDelayMs: 100, nextDelayMs: 250, extraPerStep: 32, extraPerRun: 200, totalPerRun: 400, totalBytes: 400 * OBSERVATION_BYTES, observationBytes: OBSERVATION_BYTES });
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
    /** Milliseconds left on THIS control's own clock (the executor's run clock, or the wall clock for a guided dispatch); never negative. */
    remainingMs?(): number;
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
/** Authored literals the replay scrubs from observations. Learning withholds only configuration-provenance literals
 * (AUTHORED-ECHO-01); the text an assertion expects is authored source and, by definition, shown by the element it
 * asserts, so withholding it would scrub that very element. Other literals stay withheld. */
export function replayWithheldLiterals(inputs: Execute3['inputs'], recipes: readonly { inputId: string; provenance: { kind: string } }[]): string[] {
    const configured = new Set(recipes.filter(recipe => recipe.provenance.kind === 'configuration').map(recipe => recipe.inputId));
    return inputs.flatMap(input => input.kind !== 'secretRef' && input.value.length > 0 && (input.intendedSlot !== 'assert.expected' || configured.has(input.inputId)) ? [input.inputId] : []);
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
    const budget = new ReplayAcquisitionBudget();
    let totalBytes = 0, errorCode: ReplayError | null = null, loginStepsPresent = false;
    let detail: { stepId: string; loginStepsPresent: boolean } | undefined;
    const secretUse = usageEvidence ?? new SecretUseEvidence(Object.keys(message.secrets));
    try {
        const setup = new ObservedInvocationControl(clock, runDeadlineMs, signal, budget, { extra: 0 });
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
                        if (argument?.kind === 'authoredLiteral') {
                            const input = inputs.get(argument.sourceInputId);
                            value = input && input.kind !== 'secretRef' ? input.value : null;
                        }
                        else if (argument?.kind === 'secretRef') {
                            const input = inputs.get(argument.sourceInputId);
                            demand(input?.kind === 'secretRef' && input.stepId === action.coordinate.stepId && input.intendedSlot === slot(action.operation), 'REFERENCE_MISMATCH');
                            demand(Object.hasOwn(message.secrets,input.referenceName),'REFERENCE_MISMATCH'); value = message.secrets[input.referenceName] ?? null;
                        }
                        else if (argument?.kind === 'binding')
                            value = values.get(argument.bindingId) ?? null;
                        if (argument !== null)
                            demand(value !== null, 'REFERENCE_REFUSED');
                        const guard = guards.get(action.guardId);
                        demand(guard);
                        control.check();
                        const secretInput = argument?.kind === 'secretRef' ? inputs.get(argument.sourceInputId) : null;
                        const secret = secretInput?.kind === 'secretRef' ? { secretId: secretInput.referenceName, allowedOrigins: Object.hasOwn(message.secretOrigins,secretInput.referenceName) ? message.secretOrigins[secretInput.referenceName] ?? [] : [] } : undefined;
                        if (secret) secretUse.attempting(secret.secretId);
                        let result: Awaited<ReturnType<ObservedAdapter['perform']>>;
                        try { result = await adapter.perform(action, guard, value, control, secret); }
                        catch (error) {
                            if(secret && (control.phase==='PREPARING' || error instanceof ObservedRefusal && error.noEffect)) secretUse.refusedBeforeEffect(secret.secretId);
                            const code = replayError(error);
                            if (!secret && (code === 'TARGET_DRIFT' || code === 'POLICY_REFUSED') && adapter.loginRequired?.()) {
                                detail = { stepId: action.coordinate.stepId, loginStepsPresent }; throw new ObservedRefusal('LOGIN_REQUIRED');
                            }
                            throw error;
                        }
                        if (secret) { control.check(); secretUse.used(secret.secretId); loginStepsPresent = true; }
                        value = null;
                        control.check();
                        demand(control.phase === 'INVOKING', 'INVALID_CONTRACT');
                        if (action.operation.kind === 'read') {
                            demand(typeof result.value === 'string' && !values.has(action.operation.bindingId) && values.size < 32, 'READ_REFUSED');
                            const bytes = Buffer.byteLength(result.value);
                            demand(bytes <= 4096 && totalBytes + bytes <= 65536, 'READ_REFUSED');
                            if (adapter.captureRead) adapter.captureRead(action.operation.bindingId);
                            else await adapter.withhold(result.value);
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
            reporter.stepFinished({ stepIndex: step.stepIndex, status: errorCode === null ? 'PASS' : 'FAIL', startedAtMs, finishedAtMs, durationMs: finishedAtMs - startedAtMs, failure: errorCode, ...(errorCode === 'LOGIN_REQUIRED' && detail ? {detail} : {}) });
        }
        return { ok: errorCode === null, errorCode, secretUse: secretUse.snapshot(), ...(detail ? { detail } : {}) };
    }
    finally {
        values.clear();
        inputs.clear();
        await adapter.dispose().catch(() => undefined);
    }
}
