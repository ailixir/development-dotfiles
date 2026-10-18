import { GuidedDiagnostics } from './diagnostics.js';
import { randomUUID } from 'node:crypto';
import { canonical, hash, identity, insist, sameIdentity, validate } from './contracts.js';
import { GuidedJournal } from './journal.js';
import type { Action, BridgeDispatch, BridgeIdentity, BridgeObservation, BridgeOutcome, BridgePreparation, BridgePrepare, BridgeStop, ConsumerEdge, ExecutionEvidence, Producer, RunnerContext, ObservationRefresh } from './types.js';
import { GuidedLaunchFailure } from '../run/guidedBrowser.js';
import type { GuidedBrowser } from '../run/guidedBrowser.js';
import type { ObservationConfig, ObservationRule } from '../run/observationTypes.js';

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
  /** Trusted mounted application policy, never page/model metadata. */
  rules: readonly ObservationRule[];
  applicationPolicy?: ObservationConfig['applicationPolicy'];
  launch: (config: ObservationConfig, contextId: string, onLost: () => void) => Promise<GuidedBrowser>;
  callback: (route: 'bootstrap-evidence' | 'observations' | 'outcomes' | 'lifecycle', message: unknown, idempotencyKey?: string) => Promise<void>;
}
type Availability = Producer['availability'];
function argumentSlot(operation: Action['operation']): string {
  return operation.kind === 'navigate' ? 'navigate.destination' : operation.kind === 'fill' ? 'fill.value' : operation.kind === 'selectOption' ? 'selectOption.value' : 'assert.expected';
}
interface LocalValue { value: string; producer: Producer; }
export class GuidedRuntime {
  private browser: GuidedBrowser | null = null;
  private launching: Promise<GuidedBrowser> | null = null;
  private browserClosed = false;
  private failedLaunchClose: (() => Promise<void>) | null = null;
  private journal: GuidedJournal | null = null;
  private diagnostics: GuidedDiagnostics | null = null;
  private evidence: ExecutionEvidence | null = null;
  private stopped = false;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly secretValues = new Set<string>();
  private readonly values = new Map<string, LocalValue>();
  private readonly prepared = new Map<string, { request: BridgePrepare; proof: BridgePreparation }>();
  private readonly dispatched = new Set<string>();
  private readonly exercisedEdges: ConsumerEdge[] = [];
  private readonly ordinals = new Map<string, number>();
  private priorStep = 0;
  private actions = 0;
  private observations = 0;
  private evidenceBytes = 0;
  private readonly started = Date.now();
  private closing: Promise<void> | null = null;
  constructor(private context: RunnerContext, private readonly options: GuidedRuntimeOptions) { this.context = structuredClone(context); }
  get hasSecretInputs(): boolean { return this.context.authoredInputs.inputs.some(input => input.kind === 'secretRef'); }
  get active(): boolean { return !this.stopped || !this.browserClosed; }
  get accepting(): boolean { return !this.stopped && Date.now() < this.deadline(); }
  get currentIdentity(): BridgeIdentity { return identity(this.context); }
  private live(): void { insist(!this.stopped && Date.now() < this.deadline(), 'CONTEXT_LOST'); }
  private deadline(): number { return Math.min(Date.parse(this.context.expiresAt), Date.parse(this.context.leaseExpiresAt), this.started + this.context.limits.maxSessionSeconds * 1000); }
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.stop(Date.now() >= Math.min(Date.parse(this.context.expiresAt), this.started + this.context.limits.maxSessionSeconds * 1000) ? 'EXPIRED' : 'LEASE_LOST').catch(() => undefined); }, Math.max(0, this.deadline() - Date.now()));
    this.timer.unref();
  }
  applyAcknowledgedLease(leaseExpiresAt: string): void {
    this.live();
    insist(Number.isFinite(Date.parse(leaseExpiresAt)) && Date.parse(leaseExpiresAt)>Date.now() && Date.parse(leaseExpiresAt)>=Date.parse(this.context.leaseExpiresAt) && Date.parse(leaseExpiresAt)<=Date.parse(this.context.expiresAt),'LEASE_LOST');
    this.context={...this.context,leaseExpiresAt};this.schedule();
  }
  private checkIdentity(message: BridgeIdentity): void { this.live(); insist(sameIdentity(message, this.context), 'IDENTITY_MISMATCH'); }
  async start(): Promise<void> {
    validate<RunnerContext>('runner-context', this.context);
    insist(this.context.workerId === this.options.workerId, 'IDENTITY_MISMATCH');
    insist(hash(this.context.authoredInputs) === this.context.authoredInputsHash, 'INPUT_IDENTITY');
    const input = this.context.authoredInputs;
    insist(['sessionId','scopeHash','sourceRevision','configurationRevision'].every(k => input[k as keyof typeof input] === this.context[k as keyof RunnerContext]), 'INPUT_IDENTITY');
    insist(new Set(input.inputs.map(i => i.inputId)).size === input.inputs.length, 'INPUT_IDENTITY');
    insist(this.context.sourceStepIds.length <= this.context.limits.maxSourceSteps, 'BUDGET_EXCEEDED');
    insist(this.context.producers.length === 0 && this.context.consumerEdges.length === 0, 'CONTEXT_LOST');
    insist(Date.parse(this.context.leaseExpiresAt) <= Date.parse(this.context.expiresAt), 'LEASE_DENIED');
    for (const origin of this.context.approvedOrigins) { const url = new URL(origin); insist(['http:','https:'].includes(url.protocol) && url.origin === origin && !url.username && !url.password, 'POLICY_DENIED'); }
    this.live(); this.schedule();
    this.journal = await GuidedJournal.open(this.options.journalDirectory, this.context.sessionId);
    this.diagnostics = new GuidedDiagnostics(this.options.journalDirectory,this.context.sessionId,this.context.limits.maxActions);
    insist(!this.journal.recovered, 'CONTEXT_LOST');
    await this.journal.consume({ contextId: this.context.contextId, sessionId: this.context.sessionId });
    this.live();
    const limits = this.context.limits;
    const config: ObservationConfig = { sessionId: this.context.sessionId, scopeHash: this.context.scopeHash, approvedOrigins: this.context.approvedOrigins, rules: this.options.rules,
      knownSecrets: [], limits: { nodes: limits.maxObservationNodes, bytes: limits.maxObservationBytes, depth: limits.maxObservationDepth },
      ...(this.options.applicationPolicy ? { applicationPolicy: this.options.applicationPolicy } : {}) };
    this.launching = this.options.launch(config, this.context.contextId, () => { void this.stop('CONTEXT_LOST').catch(() => undefined); });
    try { this.browser = await this.launching; } catch (error) {
      if (error instanceof GuidedLaunchFailure) this.failedLaunchClose = error.close;
      throw new Error('CONTEXT_LOST');
    }
    if (this.stopped) { await this.closing; throw new Error('CONTEXT_LOST'); }
    insist(typeof this.browser.observations.withhold === 'function', 'CONTEXT_LOST');
    await this.browser.observations.withhold(input.inputs.flatMap(i => i.kind === 'secretRef' ? [] : [i.value]));
    this.live(); this.evidence = this.browser.evidence;
    insist(this.evidence.kind === 'initialBlank' && await this.browser.blankMatches(), 'CONTEXT_LOST');
    await this.options.callback('bootstrap-evidence', { ...identity(this.context), executionEvidence: this.evidence, evidenceHash: hash(this.evidence) });
  }
  update(value: unknown): BridgeIdentity {
    const next = validate<RunnerContext>('runner-context', value); this.checkIdentity(next);
    insist(!this.busy, 'BUSY');
    for (const key of ['expiresAt','approvedOrigins','sourceStepIds','authoredInputs','authoredInputsHash','limits'] as const) insist(canonical(next[key]) === canonical(this.context[key]), 'INPUT_IDENTITY');
    insist(next.materializationRevision >= this.context.materializationRevision && Date.parse(next.leaseExpiresAt) <= Date.parse(next.expiresAt) && Date.parse(next.leaseExpiresAt) >= Date.parse(this.context.leaseExpiresAt), 'CONTEXT_REVISION');
    for (const key of ['producers','consumerEdges'] as const) for (const prior of this.context[key]) insist(next[key].some(item => canonical(item) === canonical(prior)), 'CONTEXT_REVISION');
    for (const allocation of this.context.allocations) {
      const replacement = next.allocations.find(a => a.bindingId === allocation.bindingId);
      insist(replacement && replacement.needId === allocation.needId && replacement.producerStepId === allocation.producerStepId && allocation.consumers.every(c => replacement.consumers.some(n => canonical(n) === canonical(c))), 'CONTEXT_REVISION');
    }
    if (next.materializationRevision === this.context.materializationRevision) for (const key of ['allocations','producers','consumerEdges'] as const) insist(canonical(next[key]) === canonical(this.context[key]), 'CONTEXT_REVISION');
    insist(new Set(next.allocations.map(a => a.bindingId)).size === next.allocations.length, 'CONTEXT_REVISION');
    for (const local of this.values.values()) insist(next.producers.some(p => canonical(p) === canonical(local.producer)), 'CONTEXT_REVISION');
    for (const edge of this.exercisedEdges) insist(next.consumerEdges.some(e => canonical(e) === canonical(edge)), 'CONTEXT_REVISION');
    insist(new Set(next.consumerEdges.map(e => `${e.consumerAdmissionId}:${e.argumentSlot}`)).size === next.consumerEdges.length, 'CONTEXT_REVISION');
    for (const producer of next.producers) insist(canonical(this.values.get(producer.bindingId)?.producer ?? null) === canonical(producer), 'CONTEXT_LOST');
    this.context = structuredClone(next); this.schedule(); return identity(next);
  }
  private checkProposal(p: Action): void {
    insist(!this.options.capabilities || this.options.capabilities.includes(p.operation.kind), 'POLICY_DENIED');
    insist(p.sessionId === this.context.sessionId && p.scopeHash === this.context.scopeHash && p.contextRevision === this.context.contextRevision && p.authoredInputsHash === this.context.authoredInputsHash, 'IDENTITY_MISMATCH');
    insist(this.evidence && canonical(this.evidence) === canonical(p.executionEvidence) && hash(p.executionEvidence) === p.evidenceHash, 'TARGET_CHANGED');
    insist(p.target.documentId === p.executionEvidence.documentId && p.target.generation === p.executionEvidence.generation && p.generation === p.target.generation, 'TARGET_CHANGED');
    const index = this.context.sourceStepIds.indexOf(p.coordinate.stepId);
    insist(index >= this.priorStep && p.coordinate.ordinal === (this.ordinals.get(p.coordinate.stepId) ?? 0) && p.coordinate.ordinal < this.context.limits.maxStatementsPerStep && this.actions < this.context.limits.maxActions, 'ACTION_ORDER');
    if (p.executionEvidence.kind === 'initialBlank') insist(this.actions === 0 && index === 0 && p.coordinate.ordinal === 0 && p.operation.kind === 'navigate' && 'kind' in p.target, 'INITIAL_BLANK');
    else insist(this.context.approvedOrigins.includes(p.executionEvidence.origin), 'POLICY_DENIED');
    if (p.operation.kind === 'read') {
      const op = p.operation; insist(this.context.allocations.some(a => a.bindingId === op.bindingId && a.producerStepId === p.coordinate.stepId) && !this.values.has(op.bindingId), 'BINDING_DENIED'); }
    if ('kind' in p.target && p.target.kind === 'passwordControl') {
      insist(p.operation.kind === 'fill' && p.operation.value.kind === 'secretRef', 'POLICY_DENIED');
      const sourceInputId = p.operation.value.sourceInputId;
      const input = this.context.authoredInputs.inputs.find(i => i.inputId === sourceInputId);
      insist(input?.kind === 'secretRef' && input.sourceStepId === p.coordinate.stepId && input.intendedSlot === argumentSlot(p.operation), 'INPUT_IDENTITY');
    } else if ('kind' in p.target) insist(p.operation.kind === 'navigate' || (p.operation.kind === 'assert' && ['url','title'].includes(p.operation.predicate)), 'POLICY_DENIED');
    else insist(p.operation.kind !== 'navigate' && !(p.operation.kind === 'assert' && ['url','title'].includes(p.operation.predicate)), 'POLICY_DENIED');
  }
  private async matches(p: Action): Promise<boolean> {
    if (!this.browser) return false;
    if (p.executionEvidence.kind === 'initialBlank') return this.browser.blankMatches();
    if ('kind' in p.target && p.target.kind === 'passwordControl') {
      insist(typeof this.browser.observations.preparePassword === 'function', 'POLICY_DENIED');
      await this.browser.observations.preparePassword(p.target, p.executionEvidence.origin); return true;
    }
    if ('kind' in p.target) return await this.browser.observations.pageMatches?.(p.target, p.executionEvidence.origin) === true;
    return await this.browser.observations.validateInvocation?.({ target: p.target, operation: p.operation, resolvedValue: null, origin: p.executionEvidence.origin, maxValueBytes: this.context.limits.maxRuntimeValueBytes }) === true;
  }
  async prepare(value: unknown): Promise<BridgePreparation> {
    const request = validate<BridgePrepare>('bridge', value, 'prepare'); this.checkIdentity(request); insist(!this.busy, 'BUSY');
    this.checkProposal(request.proposal); insist(hash(request.proposal) === request.requestDigest && Date.parse(request.expiresAt) > Date.now() && Date.parse(request.expiresAt) <= Date.parse(this.context.expiresAt), 'PREPARATION_DENIED');
    insist(await this.matches(request.proposal), 'TARGET_CHANGED'); this.live();
    insist(this.prepared.size < this.context.limits.maxActions, 'BUDGET_EXCEEDED');
    const proof: BridgePreparation = { ...identity(request), preparationId: randomUUID(), requestDigest: request.requestDigest, evidenceHash: request.proposal.evidenceHash, authoredInputsHash: this.context.authoredInputsHash, expiresAt: Date.parse(request.expiresAt)<=this.deadline()?request.expiresAt:new Date(this.deadline()).toISOString() };
    this.prepared.set(proof.preparationId, { request: structuredClone(request), proof }); return proof;
  }
  private resolve(p: Action, admissionId: string, edges: readonly ConsumerEdge[]): string | null {
    const op = p.operation;
    const slot = op.kind === 'navigate' ? 'navigate.destination' : op.kind === 'fill' ? 'fill.value' : op.kind === 'selectOption' ? 'selectOption.value' : 'assert.expected';
    const ref = op.kind === 'navigate' ? { kind: 'authoredLiteral' as const, sourceInputId: op.destinationInputId } : op.kind === 'fill' || op.kind === 'selectOption' ? op.value : op.kind === 'assert' ? op.expected : null;
    if (!ref) { insist(edges.length === 0, 'BINDING_DENIED'); return null; }
    if (ref.kind === 'authoredLiteral') {
      insist(edges.length === 0, 'BINDING_DENIED'); const input = this.context.authoredInputs.inputs.find(i => i.inputId === ref.sourceInputId);
      insist(input && input.sourceStepId === p.coordinate.stepId && input.intendedSlot === argumentSlot(p.operation) && input.kind === (op.kind === 'navigate' ? 'destination' : 'nonsecretText'), 'INPUT_IDENTITY');
      if (op.kind === 'navigate') { const url = new URL(input.value); insist(this.context.approvedOrigins.includes(url.origin) && !url.username && !url.password, 'POLICY_DENIED'); }
      return input.value;
    }
    if (ref.kind === 'secretRef') {
      insist(edges.length === 0 && op.kind === 'fill' && slot === 'fill.value', 'BINDING_DENIED');
      const input = this.context.authoredInputs.inputs.find(i => i.inputId === ref.sourceInputId);
      insist(input?.kind === 'secretRef' && input.sourceStepId === p.coordinate.stepId && input.intendedSlot === argumentSlot(p.operation), 'INPUT_IDENTITY');
      return null;
    }
    const local = this.values.get(ref.bindingId); const producer = this.context.producers.find(v => v.bindingId === ref.bindingId); const allocation = this.context.allocations.find(v => v.bindingId === ref.bindingId);
    insist(local && producer && canonical(producer) === canonical(local.producer) && allocation, 'BINDING_UNAVAILABLE');
    const producerIndex = this.context.sourceStepIds.indexOf(producer.coordinate.stepId), consumerIndex = this.context.sourceStepIds.indexOf(p.coordinate.stepId);
    insist(producerIndex < consumerIndex || (producerIndex === consumerIndex && producer.coordinate.ordinal < p.coordinate.ordinal), 'BINDING_ORDER');
    insist(allocation.consumers.some(c => c.stepId === p.coordinate.stepId && c.argumentSlot === slot), 'BINDING_DENIED');
    insist(edges.length === 1, 'BINDING_DENIED'); const edge = edges[0];
    insist(edge && edge.bindingId === ref.bindingId && edge.producerAdmissionId === producer.producerAdmissionId && edge.consumerAdmissionId === admissionId && canonical(edge.coordinate) === canonical(p.coordinate) && edge.argumentSlot === slot && edge.destinationOrigin === p.executionEvidence.origin && edge.destinationOrigin === producer.origin, 'BINDING_DENIED');
    return local.value;
  }
  async dispatch(value: unknown): Promise<BridgeOutcome> {
    const request = validate<BridgeDispatch>('bridge', value, 'dispatch'); this.checkIdentity(request); insist(!this.busy, 'BUSY');
    const { proposal: p, ledger } = request; const prepared = this.prepared.get(request.preparationId);
    insist(prepared && Date.parse(prepared.proof.expiresAt) > Date.now() && canonical(prepared.request.proposal) === canonical(p), 'PREPARATION_DENIED');
    this.checkProposal(p);
    const operationHash = hash({ coordinate: p.coordinate, origin: p.executionEvidence.origin, locator: 'locator' in p.target ? p.target.locator : null, operation: p.operation });
    insist(ledger.state === 'DISPATCHING' && ledger.dispatchCount === 1 && ledger.outcomeCode === 'PENDING' && ledger.assertionPassed === null && ledger.preparationId === request.preparationId && ledger.requestDigest === hash(p) && ledger.operationHash === operationHash && ledger.ownerFence === request.ownerFence && ledger.documentId === p.target.documentId, 'ADMISSION_DENIED');
    for (const k of ['sessionId','scopeHash','generation','coordinate','executionEvidence','evidenceHash','authoredInputsHash','contextRevision'] as const) insist(canonical(ledger[k]) === canonical(p[k]), 'ADMISSION_DENIED');
    const admissionId = ledger.admission.admissionId; insist(!this.dispatched.has(admissionId), 'ALREADY_CONSUMED');
    let resolvedValue = this.resolve(p, admissionId, request.consumerEdges);
    const secretFill = p.operation.kind === 'fill' && p.operation.value.kind === 'secretRef';
    if (secretFill) {
      const sourceInputId = p.operation.value.sourceInputId;
      const input = this.context.authoredInputs.inputs.find(i => i.inputId === sourceInputId);
      insist(input?.kind === 'secretRef' && request.secret?.secretId === input.secretId, 'INPUT_IDENTITY');
      insist(request.secret.value.length <= 4096, 'SECRET_TOO_LONG');
      resolvedValue = request.secret.value;
      this.secretValues.add(resolvedValue);
    } else insist(!request.secret, 'INPUT_IDENTITY');
    this.exercisedEdges.push(...structuredClone(request.consumerEdges));
    this.busy = true; this.dispatched.add(admissionId); this.prepared.clear();
    let consumed = false;
    let completed: BridgeOutcome | null = null;
    try {
      insist(this.browser && this.journal, 'CONTEXT_LOST');
      await this.journal.consume({ sessionId: request.sessionId, contextId: request.contextId, ownerFence: request.ownerFence, admissionId }); consumed = true;
      this.live(); if (!secretFill) insist(await this.matches(p), 'TARGET_CHANGED'); this.live();
      let captured: string | undefined; let assertionPassed: boolean | null = null;
      if (p.operation.kind === 'navigate') {
        insist(resolvedValue !== null, 'INPUT_IDENTITY');
        if (p.executionEvidence.kind === 'initialBlank') await this.browser.navigateBlank(resolvedValue);
        else { insist(typeof this.browser.observations.navigate === 'function', 'CONTEXT_LOST'); await this.browser.observations.navigate(p.target, p.executionEvidence.origin, resolvedValue); }
      } else if ('kind' in p.target && p.target.kind === 'passwordControl') {
        insist(secretFill && resolvedValue !== null && request.secret && p.executionEvidence.origin !== null && typeof this.browser.observations.fillPassword === 'function', 'POLICY_DENIED');
        const allowedOrigins = request.secret.allowedOrigins;
        await this.browser.observations.withhold?.([resolvedValue]);
        delete (request as { secret?: BridgeDispatch['secret'] }).secret;
        this.options.beforeSecretFill?.(resolvedValue);
        await this.browser.observations.fillPassword(p.target, p.executionEvidence.origin, allowedOrigins, resolvedValue);
        resolvedValue = null;
      } else if ('kind' in p.target) {
        insist(p.operation.kind === 'assert' && (p.operation.predicate === 'url' || p.operation.predicate === 'title') && resolvedValue !== null, 'POLICY_DENIED');
        insist(typeof this.browser.observations.assertPage === 'function' && p.executionEvidence.origin !== null, 'CONTEXT_LOST');
        assertionPassed = await this.browser.observations.assertPage(p.target, p.executionEvidence.origin, p.operation.predicate, resolvedValue);
      } else {
        insist(typeof this.browser.observations.invoke === 'function' && p.executionEvidence.origin !== null, 'CONTEXT_LOST');
        const result = await this.browser.observations.invoke({ target: p.target, operation: p.operation, resolvedValue, origin: p.executionEvidence.origin, maxValueBytes: this.context.limits.maxRuntimeValueBytes });
        captured = result.value; assertionPassed = result.assertionPassed ?? null;
      }
      this.live();
      let availability: Availability | null = null;
      if (p.operation.kind === 'read') {
        insist(typeof captured === 'string', 'READ_DENIED');
        insist(captured.trim() && p.executionEvidence.origin !== null, 'READ_DENIED'); canonical(captured);
        const bytes = Buffer.byteLength(captured); const total = [...this.values.values()].reduce((n,v) => n + Buffer.byteLength(v.value), 0);
        insist(!this.values.has(p.operation.bindingId) && bytes <= this.context.limits.maxRuntimeValueBytes && this.values.size < this.context.limits.maxRuntimeValues && total + bytes <= this.context.limits.maxRuntimeValuesBytesTotal, 'BUDGET_EXCEEDED');
        availability = { bindingId: p.operation.bindingId, producerAdmissionId: admissionId, contextId: this.context.contextId, workerId: this.context.workerId, ownerFence: this.context.ownerFence };
        const producer: Producer = { bindingId: p.operation.bindingId, producerAdmissionId: admissionId, coordinate: p.coordinate, origin: p.executionEvidence.origin, recipe: p.operation.recipe, availability };
        this.values.set(p.operation.bindingId, { value: captured, producer });
        await this.browser.observations.withhold?.([captured]); this.live();
      }
      this.actions++; this.ordinals.set(p.coordinate.stepId, p.coordinate.ordinal + 1); this.priorStep = this.context.sourceStepIds.indexOf(p.coordinate.stepId);
      const outcome: BridgeOutcome = { ...identity(request), ledger: { ...ledger, state: assertionPassed === false ? 'FAILED' : 'SUCCEEDED', outcomeCode: assertionPassed === false ? 'ASSERTION_FAILED' : 'OK', assertionPassed }, availability };
      // A committed success stays success if its response is lost. No action retry, ever.
      completed = outcome;
      await this.options.callback('outcomes', outcome);
      this.live(); await this.collectObservation(); return outcome;
    } catch (error) {
      if (completed) { await this.stop('CONTEXT_LOST'); return completed; }
      try { this.options.onRawFailure?.(error); } catch { /* Volatile test observation is non-authoritative. */ }
      const knownValues = [...this.secretValues,...this.values.values()].map(value=>typeof value==='string'?value:value.value);
      knownValues.push(...this.context.authoredInputs.inputs.flatMap(input=>'value' in input?[input.value]:[]));
      const errorMessage = consumed ? await this.diagnostics?.record({sessionId:request.sessionId,contextId:request.contextId,admissionId,stepId:p.coordinate.stepId,ordinal:p.coordinate.ordinal},error,knownValues,this.options.diagnosticStderr ?? (text=>{process.stderr.write(text);})):undefined;
      const code = error instanceof Error ? error.message : '';
      const policyRefusal = ['POLICY_DENIED','PASSWORD_FORM_ACTION_NOT_ALLOWED','PASSWORD_TARGET_ABSENT','PASSWORD_TARGET_AMBIGUOUS','PASSWORD_CONTROL_READ_REFUSED'].includes(code);
      const outcome: BridgeOutcome = { ...identity(request), ledger: { ...ledger, state: code === 'TARGET_CHANGED' || policyRefusal ? 'FAILED' : 'UNKNOWN_OUTCOME', outcomeCode: code === 'TARGET_CHANGED' ? 'TARGET_CHANGED' : policyRefusal ? 'POLICY_DENIED' : 'ACK_LOST', assertionPassed: null }, availability: null, ...(errorMessage ? {errorMessage} : {}) };
      if (consumed) await this.options.callback('outcomes', outcome).catch(() => undefined);
      await this.stop(outcome.ledger.state === 'FAILED' ? 'CONTEXT_LOST' : 'UNKNOWN_OUTCOME'); return outcome;
    } finally { resolvedValue = null; delete (request as { secret?: BridgeDispatch['secret'] }).secret; this.busy = false; }
  }
  async refreshObservation(value: unknown, idempotencyKey: string): Promise<BridgeObservation> {
    const request=validate<ObservationRefresh>('observation-refresh',value);this.checkIdentity(request);insist(!this.busy,'BUSY');
    insist(this.evidence?.kind==='observedDocument'&&request.expectedGeneration===this.evidence.generation,'TARGET_CHANGED');
    insist(idempotencyKey.length>0&&idempotencyKey.length<=256,'SCHEMA');
    const callbackKey=`oref-${hash({identity:identity(request),idempotencyKey,requestDigest:hash(request)})}`;
    this.busy=true;this.prepared.clear();
    try{return await this.collectObservation(callbackKey);}catch(error){await this.stop('CONTEXT_LOST');throw new Error(error instanceof Error&&error.message==='BUDGET_EXCEEDED'?'BUDGET_EXCEEDED':'CONTEXT_LOST');}finally{this.busy=false;}
  }
  /** A cached read is usable only while it is still the current acknowledged evidence. */
  currentObservation(value: unknown): BridgeObservation {
    const envelope=validate<BridgeObservation>('bridge',value,'observation');this.checkIdentity(envelope);insist(!this.busy,'BUSY');
    insist(this.evidence?.kind==='observedDocument'&&envelope.observation.documentId===this.evidence.documentId&&envelope.observation.generation===this.evidence.generation&&hash(envelope.observation)===this.evidence.observationHash,'TARGET_CHANGED');
    return envelope;
  }
  private async collectObservation(callbackKey?: string): Promise<BridgeObservation> {
    this.live();insist(!this.options.capabilities||this.options.capabilities.includes('observe'),'POLICY_DENIED');
    const remainingBytes=Math.min(this.context.limits.maxObservationBytes,this.context.limits.maxSanitizedEvidenceBytesTotal-this.evidenceBytes);
    insist(this.browser && this.observations < this.context.limits.maxObservations && remainingBytes>0, 'BUDGET_EXCEEDED');
    this.observations++; // Reserve before collection; failure cannot mint another budget.
    const collected = await this.browser.observations.observe(remainingBytes); this.live();
    const observation = { ...collected.observation, schemaVersion: 3 as const, coverage: { ...collected.observation.coverage } }; const bytes = Buffer.byteLength(canonical(observation));
    insist(bytes <= this.context.limits.maxObservationBytes && this.evidenceBytes + bytes <= this.context.limits.maxSanitizedEvidenceBytesTotal, 'BUDGET_EXCEEDED');
    const previousGeneration=this.evidence?.generation??-1;
    insist(observation.generation>previousGeneration,'TARGET_CHANGED');
    this.evidenceBytes += bytes;
    const evidence: ExecutionEvidence = { kind: 'observedDocument', sessionId: this.context.sessionId, contextId: this.context.contextId, documentId: observation.documentId, generation: observation.generation, origin: observation.origin, observationHash: hash(observation) };
    const envelope: BridgeObservation = { ...identity(this.context), observation };
    await this.options.callback('observations', envelope,callbackKey); this.live();
    this.evidence=evidence; // Only the durable acknowledgement makes this generation usable.
    return envelope;
  }
  private async closeResources(reason: BridgeStop['reason']): Promise<void> {
    const browser = this.browser ?? await this.launching?.catch(() => null);
    // dispose starts by dropping local masking bytes synchronously. Never await its renderer
    // command before close: a stuck renderer must not block the actual shutdown attempt.
    let disposal: Promise<void> | undefined;
    try { disposal = browser?.observations.dispose().catch(() => undefined); } catch { /* Continue the browser shutdown even if a disposal port fails synchronously. */ }
    try {
      if (browser) await browser.close().catch(() => { throw new Error('CONTEXT_LOST'); });
      else await this.failedLaunchClose?.().catch(() => { throw new Error('CONTEXT_LOST'); });
      this.browserClosed = true;
      await disposal;
      await this.options.callback('lifecycle', { ...identity(this.context), reason }).catch(() => undefined);
    } finally {
      this.browser = null; this.launching = null; this.failedLaunchClose = null; this.journal = null; this.diagnostics = null;
      this.exercisedEdges.length = 0; this.dispatched.clear(); this.ordinals.clear();
    }
  }
  async stop(reason: BridgeStop['reason']): Promise<void> {
    if (this.closing) return this.closing;
    this.stopped = true; this.options.onStopping?.(); if (this.timer) clearTimeout(this.timer); this.values.clear(); this.secretValues.clear(); this.prepared.clear(); this.evidence = null;
    this.context = { ...this.context, authoredInputs: { ...this.context.authoredInputs, inputs: [] }, allocations: [], producers: [], consumerEdges: [] };
    this.closing = Promise.resolve().then(() => this.closeResources(reason));
    return this.closing;
  }
}
