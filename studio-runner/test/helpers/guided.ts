import { randomUUID } from 'node:crypto';
import { hash, identity } from '../../src/guided/contracts.js';
import { operationPreimage } from '../../src/validator/operationPreimage.js';
import type { ObservationSession } from '../../src/run/observationTypes.js';
import type { Action as WireAction, BridgeDispatch as WireBridgeDispatch, BridgePreparation, ExecutionEvidence, Limits, RunnerContext as WireRunnerContext, Session as WireSession, Assignment } from '../../src/guided/types.js';
export type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly unknown[] ? Mutable<T[K][number]>[] : T[K] extends object ? Mutable<T[K]> : T[K] };
type RunnerContext = Mutable<WireRunnerContext>;
type Session = Mutable<WireSession>;
type BridgeDispatch = Mutable<WireBridgeDispatch>;
type Action = Mutable<WireAction>;
export const LIMITS: Limits = { maxSessionSeconds: 600, maxActions: 200, maxObservations: 400, maxModelProposals: 100, maxModelInputTokensTotal: 128000, maxModelOutputTokensTotal: 32000, maxObservationBytes: 32768, maxSanitizedEvidenceBytesTotal: 1048576, maxRuntimeValues: 32, maxRuntimeValueBytes: 4096, maxRuntimeValuesBytesTotal: 65536, maxSourceSteps: 100, maxStatementsPerStep: 8, maxOutlineBytes: 40000 };
export function guidedContext(origin: string): RunnerContext {
  const sessionId = randomUUID(); const scopeHash = 'a'.repeat(64);
  const authoredInputs: RunnerContext['authoredInputs'] = { schemaVersion: 3, sessionId, scopeHash, sourceRevision: 'source-1', configurationRevision: 'config-1', inputs: ['nav','next'].map((step, i) => ({ inputId: `input-${step}`, sourceStepId: step, kind: 'destination', value: `${origin}/${i === 0 ? 'source' : 'destination'}`, intendedSlot: 'navigate.destination', provenance: { referenceKind: 'sourceSpan', sourceRevision: 'source-1', stepId: step, startUtf16: 0, endUtf16: 12, kind: 'destination', intendedSlot: 'navigate.destination' } })) };
  return { schemaVersion: 3, sessionId, workerId: 'worker-one', ownerFence: 1, scopeHash, contextId: randomUUID(), contextRevision: 1, sourceRevision: 'source-1', configurationRevision: 'config-1', versions: { contract:3 }, expiresAt: new Date(Date.now()+120_000).toISOString(), leaseExpiresAt:new Date(Date.now()+60_000).toISOString(), sourceStepIds:['nav','read','next','fill','submit'], authoredInputs, authoredInputsHash:hash(authoredInputs), materializationRevision:1, allocations:[{bindingId:'binding-one',needId:'need-one',producerStepId:'read',consumers:[{stepId:'fill',argumentSlot:'fill.value'}]}], producers:[],consumerEdges:[],limits:{...LIMITS} };
}
export function proposal(context: RunnerContext, evidence: ExecutionEvidence, stepId: string, operation: Action['operation'], target?: Action['target']): Action {
  return { schemaVersion:3,sessionId:context.sessionId,scopeHash:context.scopeHash,coordinate:{stepId,ordinal:0},contextRevision:context.contextRevision,authoredInputsHash:context.authoredInputsHash,executionEvidence:evidence,evidenceHash:hash(evidence),generation:evidence.generation,target:target ?? {kind:'page',documentId:evidence.documentId,generation:evidence.generation},operation };
}
export function dispatch(context: RunnerContext, p: Action, proof: BridgePreparation): BridgeDispatch {
  const admissionId=randomUUID();
  return {...identity(context),proposal:p,preparationId:proof.preparationId,consumerEdges:[],ledger:{ attemptOrdinal:0,schemaVersion:3,sessionId:context.sessionId,coordinate:p.coordinate,idempotencyKey:randomUUID(),requestDigest:hash(p),scopeHash:context.scopeHash,operationHash:hash(operationPreimage(p.coordinate,p.executionEvidence.origin,proof.target,p.operation)),generation:p.generation,documentId:p.target.documentId,ownerFence:context.ownerFence,admission:{admissionId,authorizationId:'authorization',admittedAt:new Date().toISOString(),policyDecisionHash:'b'.repeat(64)},state:'DISPATCHING',dispatchCount:1,outcomeCode:'PENDING',assertionPassed:null,executionEvidence:p.executionEvidence,evidenceHash:p.evidenceHash,authoredInputsHash:p.authoredInputsHash,contextRevision:p.contextRevision,preparationId:proof.preparationId }};
}

/** Controlled backend grant fixture. Positive wire tests still obtain it through worker claim HTTP. */
export function ownershipSession(context: RunnerContext): Session {
  const scope: Session['scope']={principalId:'fixture-author',csiId:'fixture-csi',environmentId:'fixture-environment',sourceRevision:context.sourceRevision,configurationRevision:context.configurationRevision,modelDataPolicyId:'metadata-only',valueTransferPolicyId:'same-origin',capabilities:['observe','navigate','click','fill','press','check','uncheck','selectOption','hover','read','assert']};
  context.scopeHash=hash(scope);context.authoredInputs.scopeHash=context.scopeHash;context.authoredInputsHash=hash(context.authoredInputs);
  return {schemaVersion:3,sessionId:context.sessionId,testId:'controlled-test',state:'PREPARING',scope,scopeHash:context.scopeHash,runAuthorization:{authorizationId:'run-authority',kind:'scopedRun',authorizedAt:new Date().toISOString(),principalId:scope.principalId,scopeHash:context.scopeHash},versions:context.versions,owner:{workerId:context.workerId,fence:context.ownerFence,leaseExpiresAt:new Date(Math.min(Date.now()+30_000,Date.parse(context.expiresAt))).toISOString()},createdAt:new Date().toISOString(),expiresAt:context.expiresAt,limits:context.limits,counters:{actions:0,observations:0,modelProposals:0,modelInputTokens:0,modelOutputTokens:0,sanitizedEvidenceBytes:0},sourceSteps:context.sourceStepIds.map(stepId=>({stepId,requiresAssertion:false}))};
}
export function assignmentFor(context: RunnerContext): Assignment {
  return {schemaVersion:3,assignmentId:randomUUID(),sessionId:context.sessionId,workerId:context.workerId,scopeHash:context.scopeHash,sourceRevision:context.sourceRevision,configurationRevision:context.configurationRevision,versions:context.versions,expectedFence:context.ownerFence-1,expiresAt:context.expiresAt};
}

/** An ObservationSession whose element methods refuse: the runtime tests that never reach a node target override only what they use. */
export function sessionStub(overrides: Partial<ObservationSession> & Pick<ObservationSession, 'observe'>): ObservationSession {
  const unused = (): Promise<never> => Promise.reject(new Error('unused'));
  return { prepareTarget: unused, resolveTarget: unused, refForTarget: unused, invoke: unused, dispose: () => Promise.resolve(), ...overrides };
}
