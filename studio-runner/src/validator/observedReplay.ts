import { validatePublicObservation, deriveSnapshotMaps } from './observedSnapshots.js';
import { effectiveGraph, historicalVersion, validateMaterializationHistory, validateIncrementalHistory } from './observedHistory.js';
import { validatePublishedArtifactGraph } from '../executor/observedReplay.js';
import { OBSERVED_CONTRACT_VERSION } from '../versions.js';
import { shownRefsOf } from './outlineRefs.js';
import type { Execute3, Artifact3, BuildIdentity, Guard, HistoricalBinding, InputRecipe, LearnedPlan, Policy4, ReplayAction, Transfer, ValidationBasis, ValidationRequest, ValidationVerdict, ObservedJob, Scope } from '../executor/observedOperations.js';
import { domainAllowed } from '../allowedDomains.js';
import { OBSERVED_LIMITS, OBSERVED_PROFILE, assertBuild, assertProfile, boundedObserved, canonicalObserved, canonicalOrigin, demand, ObservedRefusal, equalObserved, hashObserved, validateObserved } from './observedReferencePolicy.js';
export interface ObservedHashes {
    sourceHash: string;
    configurationHash: string;
    authoringHash: string;
    learnedPlanHash: string;
    artifactHash: string;
    referencePolicyHash: string;
    operationEquivalenceHash: string;
    admissionProvenanceHash: string;
    publicationEvidenceHash: string;
    runAuthorizationHash: string;
    profileHash: string;
}
export interface DerivedObserved {
    artifact: Artifact3;
    hashes: ObservedHashes;
}
type Coordinate = ReplayAction['coordinate'];
const coordinateKey = (c: Coordinate): string => `${c.stepId}:${String(c.ordinal)}`;
function indexUnique<T>(items: readonly T[], key: (item: T) => string, code: 'EVIDENCE_MISMATCH' | 'REFERENCE_MISMATCH' = 'EVIDENCE_MISMATCH'): Map<string, T> {
    const map = new Map<string, T>();
    for (const item of items) {
        const id = key(item);
        demand(!map.has(id), code);
        map.set(id, item);
    }
    return map;
}
function same(a: unknown, b: unknown, code: 'EVIDENCE_MISMATCH' | 'OPERATION_MISMATCH' | 'REFERENCE_MISMATCH' = 'EVIDENCE_MISMATCH'): void { demand(equalObserved(a, b), code); }
function scalarCompare(a: string, b: string): number { const aa = Array.from(a), bb = Array.from(b); for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    const x = aa[i]?.codePointAt(0) ?? 0, y = bb[i]?.codePointAt(0) ?? 0;
    if (x !== y)
        return x - y;
} return aa.length - bb.length; }
export function sortInputRecipes(inputs: readonly InputRecipe[], steps: readonly string[]): InputRecipe[] {
    const tuple = (i: InputRecipe): readonly (string | number)[] => [steps.indexOf(i.stepId), i.provenance.kind === 'sourceSpan' ? 0 : 1, i.provenance.kind === 'sourceSpan' ? i.provenance.start : 0, i.provenance.kind === 'sourceSpan' ? i.provenance.end : 0, i.provenance.kind === 'configuration' ? i.provenance.referenceId : '', i.kind, i.inputId];
    return [...inputs].sort((a, b) => { const x = tuple(a), y = tuple(b); for (let i = 0; i < x.length; i++) {
        const xx = x[i], yy = y[i];
        if (xx === yy)
            continue;
        return typeof xx === 'number' && typeof yy === 'number' ? xx - yy : scalarCompare(String(xx), String(yy));
    } return 0; });
}
function revision(value: string): void { demand(/^(0|[1-9][0-9]{0,18})$/u.test(value) && BigInt(value) <= 9223372036854775807n); }
/** A template span mixes authored text with whole `<var NAME>` tokens; an edge inside a token would type half of it. */
export function cutsTemplateToken(source: string, start: number, end: number): boolean {
    for (const token of source.matchAll(/<var\s+[A-Za-z0-9_.-]{1,64}>/gu)) {
        const from = token.index, to = from + token[0].length;
        if ((from < start && start < to) || (from < end && end < to)) return true;
    }
    return false;
}
export function deriveObservedArtifact(raw: unknown): DerivedObserved {
    const b = validateObserved<ValidationBasis>('replay-validation#/definitions/ValidationBasis', raw, OBSERVED_LIMITS.basis);
    revision(b.sourceRevision);
    revision(b.configurationRevision);
    revision(b.translationRevision);
    const steps = b.sourceSteps.map(s => s.stepId), stepOrder = indexUnique(b.sourceSteps, s => s.stepId);
    b.sourceSteps.forEach((step, i) => { demand(step.ordinal === i && step.source.length <= 4000, 'EVIDENCE_MISMATCH'); });
    demand(b.sourceSteps.reduce((n, s) => n + Buffer.byteLength(s.source), 0) <= 1048576, 'LIMIT_EXCEEDED');
    same(hashObserved(b.sourceSteps.map(s => s.source)), b.sourceHash);
    same(hashObserved(b.sourceSteps), b.authoringHash);
    same(hashObserved(b.configuration), b.configurationHash);
    same(hashObserved(b.translationPlan), b.translationHash);
    const scopeHash = hashObserved(b.scope);
    demand(b.scope.csiId === b.csiId && b.scope.sourceRevision === b.sourceRevision && b.scope.configurationRevision === b.configurationRevision && b.runAuthorization.scopeHash === scopeHash && b.runAuthorization.principalId === b.scope.principalId, 'EVIDENCE_MISMATCH');
    const req = b.replayRequirements;
    demand(req.csiId === b.csiId && req.environment === b.scope.environmentId && req.environment === b.configuration.environment, 'EVIDENCE_MISMATCH');
    same(req.capabilities, b.scope.capabilities.filter(v => v !== 'observe'));
    validateMaterializationHistory(b); validateIncrementalHistory(b);
    const graph = effectiveGraph(b);
    demand( b.bootstrap.contextRevision > 0 && b.bootstrap.ownerFence > 0 && b.bootstrap.materializationRevision > 0, 'EVIDENCE_MISMATCH');
    demand(b.bootstrap.initialEvidence.sessionId === b.sessionId && b.bootstrap.initialEvidence.contextId === b.bootstrap.contextId, 'EVIDENCE_MISMATCH');
    const compare = (a: Coordinate, c: Coordinate): number => { const x = steps.indexOf(a.stepId), y = steps.indexOf(c.stepId); demand(x >= 0 && y >= 0, 'EVIDENCE_MISMATCH'); return x - y || a.ordinal - c.ordinal; };
    const ordered = [...b.actions].sort((a, c) => compare(a.ledger.coordinate, c.ledger.coordinate));
    const actionByAdmission = indexUnique(ordered, a => a.ledger.admission.admissionId);
    indexUnique(ordered, a => coordinateKey(a.ledger.coordinate));
    const preparations = indexUnique(b.preparations, p => p.preparationId), observations = indexUnique(b.observations, o => o.observationHash);
    const usedObservations = new Set<string>();
    for (const request of b.incrementalEvidence?.prefixRequests ?? []) for (const row of b.observations) {
        const o = row.observation;
        if (hashObserved({kind:'observedDocument',sessionId:b.sessionId,contextId:b.bootstrap.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:row.observationHash}) === request.evidenceHash) usedObservations.add(row.observationHash);
    }
    for (const old of b.incrementalEvidence?.excludedAttempts ?? []) if (old.preparation.observationHash) usedObservations.add(old.preparation.observationHash);
    demand(preparations.size === ordered.length, 'EVIDENCE_MISMATCH');
    demand(b.observations.reduce((sum, o) => sum + Buffer.byteLength(canonicalObserved(o.observation)), 0) <= 4194304, 'LIMIT_EXCEEDED');
    for (const { observationHash, observation: o } of b.observations) {
        boundedObserved(o, 524288);
        same(observationHash, hashObserved(o));
        demand(o.sessionId === b.sessionId && o.scopeHash === scopeHash, 'EVIDENCE_MISMATCH'); canonicalOrigin(o.origin);
        // The facts are exactly the refs the outline shows (GuidedOutline.requireConsistent), and the outline keeps its own bound.
        const shown = shownRefsOf(o.outline), keys = Object.keys(o.facts);
        demand(Buffer.byteLength(o.outline) <= 40000 && shown.size === keys.length && keys.every(key => shown.has(key)), 'EVIDENCE_MISMATCH');
    }
    for (const row of b.observations) validatePublicObservation(row.observation);
    if (b.snapshotEvidence.baseProof) validateReplayArtifact(b.snapshotEvidence.baseProof.artifact);
    const obligations = indexUnique(b.translationPlan.obligations, o => o.obligationId);
    indexUnique(b.translationPlan.obligations, o => `${o.stepId}:${String(o.occurrence)}`);
    const associations = indexUnique(b.obligationAssociations, a => a.obligationId);
    demand(obligations.size === ordered.length && associations.size === ordered.length, 'EVIDENCE_MISMATCH');
    const inputs = indexUnique(b.inputs, i => i.inputId, 'REFERENCE_MISMATCH');
    const inputByReference = indexUnique(b.inputs, i => hashObserved(i.provenance), 'REFERENCE_MISMATCH');
    const configurationRefs = indexUnique(b.configurationReferences, c => c.referenceId, 'REFERENCE_MISMATCH');
    const effectiveReferences = new Set(b.translationPlan.obligations.flatMap(obligation => obligation.referenceIndex === null ? [] : [obligation.referenceIndex]));
    demand(inputs.size === effectiveReferences.size, 'REFERENCE_MISMATCH');
    for (const index of effectiveReferences) demand(inputByReference.has(hashObserved(b.translationPlan.sourceReferences[index])), 'REFERENCE_MISMATCH');
    // The accepted cumulative plan and immutable input history retain unexercised old intent.
    // Only effective references become replay recipes; raw references stay committed by basisHash.
    for (const ref of b.translationPlan.sourceReferences) demand(b.materializationEvidence.entries.some(entry => equalObserved(entry.metadata.provenance, ref)), 'REFERENCE_MISMATCH');
    const recipes: InputRecipe[] = [];
    const configUsed = new Set<string>();
    for (const input of b.inputs) {
        const p = input.provenance;
        demand(stepOrder.has(input.stepId) && p.stepId === input.stepId && p.kind === input.kind, 'REFERENCE_MISMATCH');
        if (p.referenceKind === 'sourceSpan') {
            const source = stepOrder.get(input.stepId)?.source;
            demand(source !== undefined && p.sourceRevision === b.sourceRevision && p.startUtf16 < p.endUtf16 && p.endUtf16 <= source.length, 'REFERENCE_MISMATCH');
            const boundary = (i: number) => i === 0 || i === source.length || !(source.charCodeAt(i - 1) >= 0xd800 && source.charCodeAt(i - 1) <= 0xdbff && source.charCodeAt(i) >= 0xdc00 && source.charCodeAt(i) <= 0xdfff);
            demand(boundary(p.startUtf16) && boundary(p.endUtf16), 'REFERENCE_MISMATCH');
            for (const token of source.matchAll(/<secret\s+[A-Za-z0-9_.-]{1,64}>/gu)) demand(!(p.startUtf16 < token.index + token[0].length && p.endUtf16 > token.index), 'REFERENCE_MISMATCH');
            demand(!cutsTemplateToken(source, p.startUtf16, p.endUtf16), 'REFERENCE_MISMATCH');
            recipes.push({ inputId: input.inputId, stepId: input.stepId, kind: input.kind, provenance: { kind: 'sourceSpan', start: p.startUtf16, end: p.endUtf16, sourceHash: b.sourceHash } });
        }
        else {
            const c = configurationRefs.get(p.referenceId);
            demand(c && p.configurationRevision === b.configurationRevision && c.inputId === input.inputId && c.stepId === input.stepId && c.kind === input.kind, 'REFERENCE_MISMATCH');
            configUsed.add(c.referenceId);
            recipes.push({ inputId: input.inputId, stepId: input.stepId, kind: input.kind, provenance: { kind: 'configuration', referenceId: c.referenceId, referenceName: c.referenceName } });
        }
    }
    demand(configUsed.size === configurationRefs.size, 'REFERENCE_MISMATCH');
    const counts = new Map<string, number>(), guards: Guard[] = [], actions: LearnedPlan['actions'][number][] = [], replay: ReplayAction[] = [];
    let worker: string | null = null;
    for (let index = 0; index < ordered.length; index++) {
        const evidence = ordered[index];
        demand(evidence, 'EVIDENCE_MISMATCH');
        const l = evidence.ledger, version = historicalVersion(b,l.contextRevision), p = preparations.get(evidence.preparationId);
        demand(p && p.preparationId === l.preparationId, 'EVIDENCE_MISMATCH');
        const proposal = p.proposal, proof = p.proof, e = proposal.executionEvidence;
        const ob = obligations.get(evidence.obligationId), association = associations.get(evidence.obligationId);
        demand(ob && association, 'EVIDENCE_MISMATCH');
        demand(l.sessionId === b.sessionId && proposal.sessionId === b.sessionId && l.scopeHash === scopeHash && proposal.scopeHash === scopeHash && l.ownerFence === b.bootstrap.ownerFence && l.contextRevision === version.contextRevision && l.authoredInputsHash === version.authoredInputsHash && proposal.authoredInputsHash === version.authoredInputsHash, 'EVIDENCE_MISMATCH');
        demand(l.state === 'SUCCEEDED' && l.dispatchCount === 1 && l.outcomeCode === 'OK', 'EVIDENCE_MISMATCH');
        demand(l.admission.authorizationId === b.runAuthorization.authorizationId, 'EVIDENCE_MISMATCH');
        same(l.admission.policyDecisionHash, hashObserved({scopeHash,preparation:proof,requestDigest:hashObserved(proposal)}));
        same(l.coordinate, proposal.coordinate);
        same(association.coordinate, l.coordinate);
        demand(association.admissionId === l.admission.admissionId && association.proposalHash === l.requestDigest && l.requestDigest === hashObserved(proposal), 'EVIDENCE_MISMATCH');
        demand(ob.stepId === l.coordinate.stepId && ob.occurrence === l.coordinate.ordinal, 'OPERATION_MISMATCH');
        const count = counts.get(ob.stepId) ?? 0;
        demand(count === ob.occurrence && count < 8, 'EVIDENCE_MISMATCH');
        counts.set(ob.stepId, count + 1);
        same(p.executionEvidence, e);
        same(l.executionEvidence, e);
        demand(e.sessionId === b.sessionId && e.contextId === b.bootstrap.contextId && l.documentId === e.documentId && l.generation === e.generation && proposal.generation === e.generation, 'EVIDENCE_MISMATCH');
        demand(proposal.evidenceHash === hashObserved(e) && l.evidenceHash === proposal.evidenceHash && proof.evidenceHash === proposal.evidenceHash && proof.requestDigest === l.requestDigest && proof.preparationId === p.preparationId && proof.authoredInputsHash === version.authoredInputsHash, 'EVIDENCE_MISMATCH');
        demand(proof.sessionId === b.sessionId && proof.scopeHash === scopeHash && proof.contextId === b.bootstrap.contextId && proof.contextRevision === version.contextRevision && proof.ownerFence === b.bootstrap.ownerFence && proof.sourceRevision === b.sourceRevision && proof.configurationRevision === b.configurationRevision, 'EVIDENCE_MISMATCH');
        worker ??= proof.workerId;
        demand(proof.workerId === worker, 'EVIDENCE_MISMATCH');
        same(proof.versions, { contract: OBSERVED_CONTRACT_VERSION });
        demand(proposal.contextRevision === version.contextRevision, 'EVIDENCE_MISMATCH');
        demand(b.scope.capabilities.includes(proposal.operation.kind), 'OPERATION_MISMATCH');
        if(index===0)same(e,b.bootstrap.initialEvidence);
        // The frozen step record: the code is exactly what its hash names, and the lists are bounded sets.
        const operation = proposal.operation;
        demand(hashObserved(operation.code) === operation.sourceHash, 'OPERATION_MISMATCH');
        demand(new Set(operation.captures).size === operation.captures.length && new Set(operation.uses.map(u => `${u.kind}:${u.id}`)).size === operation.uses.length, 'OPERATION_MISMATCH');
        const operationHash = hashObserved({ coordinate: l.coordinate, origin: e.origin, operation });
        same(l.operationHash, operationHash);
        let guard: Guard;
        if (e.kind === 'initialBlank') {
            demand(index === 0 && ob.stepId === steps[0] && ob.occurrence === 0 && p.observationHash === null && req.initialContext.kind === 'initialBlank', 'EVIDENCE_MISMATCH');
            same(e, b.bootstrap.initialEvidence);
            guard = { guardId: `g${String(index)}`, origin: null };
        }
        else {
            demand(p.observationHash === e.observationHash, 'EVIDENCE_MISMATCH');
            const observed = observations.get(e.observationHash);
            demand(observed && observed.observation.documentId === e.documentId && observed.observation.generation === e.generation && observed.observation.origin === e.origin, 'EVIDENCE_MISMATCH');
            usedObservations.add(e.observationHash);
            guard = { guardId: `g${String(index)}`, origin: e.origin };
        }
        // What the step reads: an input of this step, a secret reference of this step (by its configuration name), or a binding the plan gave it.
        for (const use of operation.uses) {
            if (use.kind === 'input') demand(inputs.get(use.id)?.stepId === ob.stepId && inputs.get(use.id)?.kind !== 'secretRef', 'REFERENCE_MISMATCH');
            else if (use.kind === 'secret') demand(b.configurationReferences.some(c => c.referenceName === use.id && c.kind === 'secretRef' && c.stepId === ob.stepId), 'REFERENCE_MISMATCH');
            else demand(b.translationPlan.needs.some(n => n.bindingId === use.id && n.consumers.some(c => c.stepId === ob.stepId)), 'REFERENCE_MISMATCH');
        }
        guards.push(guard);
        actions.push(validateObserved<LearnedPlan['actions'][number]>(e.origin === null ? 'learned-plan#/definitions/blankAction' : 'learned-plan#/definitions/observedAction', { coordinate: l.coordinate, origin: e.origin, operation, admissionId: l.admission.admissionId, operationHash }));
        replay.push({ coordinate: l.coordinate, guardId: guard.guardId, operation });
    }
    demand(counts.size === steps.length && usedObservations.size === observations.size, 'EVIDENCE_MISMATCH');
    for (const selected of b.sourceSelections) {
        const o = b.translationPlan.obligations.filter(o => o.stepId === selected.need.stepId && o.occurrence === selected.need.occurrence);
        const planned = o[0];
        demand(o.length === 1 && planned?.referenceIndex !== null && planned?.referenceIndex !== undefined, 'REFERENCE_MISMATCH');
        same(b.translationPlan.sourceReferences[planned.referenceIndex], selected.reference, 'REFERENCE_MISMATCH');
    }
    same(b.bootstrap.allocationHash, hashObserved(b.allocations), 'REFERENCE_MISMATCH');
    const allocations = indexUnique(graph.allocations, a => a.bindingId, 'REFERENCE_MISMATCH'), needs = indexUnique(b.translationPlan.needs, n => n.bindingId, 'REFERENCE_MISMATCH'), producers = indexUnique(b.producers, p => p.bindingId, 'REFERENCE_MISMATCH');
    demand(allocations.size === needs.size && producers.size === needs.size, 'REFERENCE_MISMATCH');
    const bindings: HistoricalBinding[] = [], transfers: Transfer[] = [];
    const exercised = new Set<string>();
    for (const prod of b.producers) {
        const allocation = allocations.get(prod.bindingId), need = needs.get(prod.bindingId), producer = actionByAdmission.get(prod.producerAdmissionId);
        demand(allocation && need && producer && allocation.needId === need.needId && allocation.producerStepId === need.producerStepId && prod.coordinate.stepId === need.producerStepId, 'REFERENCE_MISMATCH');
        same(allocation.consumers, need.consumers, 'REFERENCE_MISMATCH');
        const action = actions.find(a => a.admissionId === prod.producerAdmissionId);
        demand(action, 'REFERENCE_MISMATCH');
        demand(action.operation.captures.includes(prod.bindingId), 'REFERENCE_MISMATCH');
        same(action.coordinate, prod.coordinate);
        same(action.origin, prod.origin);
        same(prod.availability, { bindingId: prod.bindingId, producerAdmissionId: prod.producerAdmissionId, contextId: b.bootstrap.contextId, workerId: worker, ownerFence: b.bootstrap.ownerFence });
        const edges = graph.consumerEdges.filter(e => e.bindingId === prod.bindingId).sort((a, c) => compare(a.coordinate, c.coordinate) || scalarCompare(a.bindingId, c.bindingId));
        // Empty effective consumers are authorized only by effectiveGraph's exact retained-prefix proof.
        for (const edge of edges) {
            const consumer = actions.find(a => a.admissionId === edge.consumerAdmissionId);
            demand(consumer && edge.producerAdmissionId === prod.producerAdmissionId && compare(prod.coordinate, edge.coordinate) < 0 && edge.destinationOrigin === prod.origin, 'REFERENCE_MISMATCH');
            same(consumer.coordinate, edge.coordinate);
            same(consumer.origin, edge.destinationOrigin);
            demand(consumer.operation.uses.some(u => u.kind === 'binding' && u.id === prod.bindingId), 'REFERENCE_MISMATCH');
            demand(need.consumers.some(c => c.stepId === edge.coordinate.stepId), 'REFERENCE_MISMATCH');
            const key = `${edge.consumerAdmissionId}:${edge.bindingId}`;
            demand(!exercised.has(key), 'REFERENCE_MISMATCH');
            exercised.add(key);
            transfers.push({ bindingId: prod.bindingId, producer: prod.coordinate, consumer: edge.coordinate, origin: prod.origin });
        }
        demand(need.consumers.every(c => edges.some(e => e.coordinate.stepId === c.stepId)), 'REFERENCE_MISMATCH');
        bindings.push({ schemaVersion: 3, bindingId: prod.bindingId, valueType: 'string', producer: prod.coordinate, sourceOrigin: prod.origin, consumers: edges, provenance: { sessionId: b.sessionId, producerAdmissionId: prod.producerAdmissionId, sourceIntentStepId: prod.coordinate.stepId }, transferPolicy: 'sameOrigin', preserveBytes: true });
    }
    demand(exercised.size === graph.consumerEdges.length, 'REFERENCE_MISMATCH');
    for (const a of actions) {
        for (const use of a.operation.uses) if (use.kind === 'binding') demand(exercised.has(`${a.admissionId}:${use.id}`), 'REFERENCE_MISMATCH');
        for (const captured of a.operation.captures) demand(producers.has(captured), 'REFERENCE_MISMATCH');
    }
    bindings.sort((a, c) => compare(a.producer, c.producer) || scalarCompare(a.bindingId, c.bindingId));
    transfers.sort((a, c) => compare(a.producer, c.producer) || compare(a.consumer, c.consumer) || scalarCompare(a.bindingId, c.bindingId));
    same(b.bindings, bindings, 'REFERENCE_MISMATCH');
    same(b.transfers, transfers, 'REFERENCE_MISMATCH');
    const plan: LearnedPlan = { schemaVersion: 3, planId: 'plan-' + hashObserved({ sessionId: b.sessionId }), scopeHash, sourceRevision: b.sourceRevision, configurationRevision: b.configurationRevision, authoredInputsHash: b.authoredInputsHash, initialContext: req.initialContext, sourceSteps: steps, versions: { contract: OBSERVED_CONTRACT_VERSION }, actions, bindings, ...deriveSnapshotMaps(b,{actions,bindings}) };
    const learnedPlanHash = hashObserved(plan), runAuthorizationHash = hashObserved(b.runAuthorization), admissionProvenanceHash = hashObserved(ordered.map(({ ledger: l }) => ({ coordinate: l.coordinate, admission: l.admission, operationHash: l.operationHash, scopeHash: l.scopeHash })));
    const publicationEvidenceHash = hashObserved({ version: 1, basisHash: hashObserved(b), runAuthorizationHash, translationHash: b.translationHash, bootstrapHash: hashObserved(b.bootstrap), sourceManifestHash: b.sourceManifestHash });
    const inputRecipes = sortInputRecipes(recipes, steps), replayPolicy: Policy4 = { schemaVersion: 4, learnedPlanHash, admissionProvenanceHash, publicationEvidenceHash, runAuthorizationHash, scope: req, inputs: inputRecipes, bindings, transfers };
    const artifact: Artifact3 = { version: 3, kind: 'observed', profile: OBSERVED_PROFILE, sourceHash: b.sourceHash, configurationHash: b.configurationHash, authoringHash: b.authoringHash, learnedPlan: plan, learnedPlanHash, inputRecipes, guards, replayPolicy, steps: steps.map((stepId, stepIndex) => ({ stepIndex, stepId, operations: replay.filter(a => a.coordinate.stepId === stepId) })) };
    validateObserved('replay-artifact', artifact);
    boundedObserved(replayPolicy, OBSERVED_LIMITS.policy);
    const hashes: ObservedHashes = { sourceHash: b.sourceHash, configurationHash: b.configurationHash, authoringHash: b.authoringHash, learnedPlanHash, artifactHash: hashObserved(artifact), referencePolicyHash: hashObserved(replayPolicy), operationEquivalenceHash: hashObserved({ operations: replay, guards, inputRecipes, bindings, transfers }), admissionProvenanceHash, publicationEvidenceHash, runAuthorizationHash, profileHash: hashObserved(OBSERVED_PROFILE) };
    return { artifact, hashes };
}
/** Actual packaged pure endpoint validator; all expected semantics come from original basis. */
export function validateObservedRequest(raw: unknown, build: BuildIdentity): ValidationVerdict {
    const request = validateObserved<ValidationRequest>('replay-validation', raw, OBSERVED_LIMITS.validation);
    boundedObserved(request.validationBasis, OBSERVED_LIMITS.basis);
    assertProfile(request.requiredProfile);
    assertBuild(request.requiredBuild, build);
    same(hashObserved(request.validationBasis), request.basisHash);
    const derived = deriveObservedArtifact(request.validationBasis);
    const hashes = derived.hashes;
    const equal = equalObserved(request.artifact, derived.artifact);
    return { schemaVersion: 3, attemptId: request.attemptId, claimId: request.claimId, snapshotHash: request.snapshotHash, basisHash: request.basisHash, profile: OBSERVED_PROFILE, build, ok: equal, artifactHash: hashes.artifactHash, learnedPlanHash: hashes.learnedPlanHash, referencePolicyHash: hashes.referencePolicyHash, operationEquivalenceHash: hashes.operationEquivalenceHash, admissionProvenanceHash: hashes.admissionProvenanceHash, publicationEvidenceHash: hashes.publicationEvidenceHash, errorCode: equal ? null : 'OPERATION_MISMATCH' };
}
/** Replay checks immutable structure/joins without pretending the historical basis is on the job. */
export function validateReplayArtifact(raw: unknown): Artifact3 {
    const a = validateObserved<Artifact3>('replay-artifact', raw);
    assertProfile(a.profile);
    same(hashObserved(a.learnedPlan), a.learnedPlanHash);
    same(a.replayPolicy.learnedPlanHash, a.learnedPlanHash);
    same(a.inputRecipes, a.replayPolicy.inputs);
    same(a.learnedPlan.bindings, a.replayPolicy.bindings);
    const ids = indexUnique(a.inputRecipes, i => i.inputId, 'REFERENCE_MISMATCH');
    const guards = indexUnique(a.guards, g => g.guardId, 'EVIDENCE_MISMATCH');
    // Every recipe is read by some step: an input by its id, a secret by its configuration name.
    const usedBy = (recipe: InputRecipe): boolean => a.learnedPlan.actions.some(action => action.operation.uses.some(use => recipe.kind === 'secretRef'
        ? use.kind === 'secret' && recipe.provenance.kind === 'configuration' && recipe.provenance.referenceName === use.id : use.kind === 'input' && use.id === recipe.inputId));
    demand(a.inputRecipes.every(usedBy), 'REFERENCE_MISMATCH');
    const steps = a.learnedPlan.sourceSteps;
    demand(a.steps.length === steps.length, 'OPERATION_MISMATCH');
    let ordinal = 0;
    for (const [si, step] of a.steps.entries()) {
        demand(step.stepIndex === si && step.stepId === steps[si], 'OPERATION_MISMATCH');
        for (const [at, op] of step.operations.entries()) {
            const original = a.learnedPlan.actions[ordinal], g = guards.get(op.guardId);
            demand(original && g && op.guardId === `g${String(ordinal)}` && op.coordinate.stepId === step.stepId && op.coordinate.ordinal === at, 'OPERATION_MISMATCH');
            same(op.coordinate, original.coordinate);
            same(op.operation, original.operation);
            same(g.origin, original.origin);
            demand(hashObserved(op.operation.code) === op.operation.sourceHash, 'OPERATION_MISMATCH');
            same(original.operationHash, hashObserved({ coordinate: original.coordinate, origin: original.origin, operation: original.operation }));
            if (g.origin === null)
                demand(ordinal === 0 && a.learnedPlan.initialContext.kind === 'initialBlank', 'OPERATION_MISMATCH');
            else
                canonicalOrigin(g.origin);
            for (const use of op.operation.uses) if (use.kind === 'input') {
                const i = ids.get(use.id);
                demand(i && i.stepId === step.stepId && i.kind !== 'secretRef', 'REFERENCE_MISMATCH');
            }
            ordinal++;
        }
    }
    demand(ordinal === a.learnedPlan.actions.length && guards.size === ordinal && ordinal <= 200, 'OPERATION_MISMATCH');
    same(a.inputRecipes, sortInputRecipes(a.inputRecipes, steps));
    const graphTransfers = a.replayPolicy.bindings.flatMap(binding => binding.consumers.map(edge => ({ bindingId: binding.bindingId, producer: binding.producer, consumer: edge.coordinate, origin: binding.sourceOrigin })));
    same(graphTransfers, a.replayPolicy.transfers, 'REFERENCE_MISMATCH');
    for (const binding of a.replayPolicy.bindings) {
        const producer = a.learnedPlan.actions.find(x => equalObserved(x.coordinate, binding.producer));
        demand(producer !== undefined && producer.operation.captures.includes(binding.bindingId) && producer.admissionId === binding.provenance.producerAdmissionId && producer.origin === binding.sourceOrigin, 'REFERENCE_MISMATCH');
        for (const edge of binding.consumers) {
            const consumer = a.learnedPlan.actions.find(x => equalObserved(x.coordinate, edge.coordinate));
            demand(consumer && consumer.admissionId === edge.consumerAdmissionId && edge.producerAdmissionId === producer.admissionId && edge.bindingId === binding.bindingId && edge.destinationOrigin === binding.sourceOrigin, 'REFERENCE_MISMATCH');
        }
    }
    for (const recipe of a.inputRecipes) if (recipe.provenance.kind === 'sourceSpan') demand(recipe.provenance.sourceHash === a.sourceHash && recipe.provenance.start < recipe.provenance.end, 'REFERENCE_MISMATCH');
    for (const recipe of a.inputRecipes)
        if (recipe.kind === 'secretRef') demand(recipe.provenance.kind === 'configuration' && /^[A-Za-z0-9_.-]{1,64}$/u.test(recipe.provenance.referenceName), 'REFERENCE_MISMATCH');
    validatePublishedArtifactGraph(a);
    return a;
}
export function validateObservedJob(raw: unknown, build: BuildIdentity, allowedDomains: readonly string[], now = Date.now()): ObservedJob {
    const job = validateObserved<ObservedJob>('replay-job', raw, OBSERVED_LIMITS.job);
    const b = job.binding, a = validateReplayArtifact(job.artifact), g = b.replayGrant;
    assertBuild(b.requiredBuild, build);
    assertProfile(b.requiredProfile);
    demand(b.artifactHash === hashObserved(a) && b.configurationHash === a.configurationHash && hashObserved(job.configuration) === a.configurationHash && b.learnedPlanHash === a.learnedPlanHash && b.referencePolicyHash === hashObserved(a.replayPolicy) && b.publicationEvidenceHash === a.replayPolicy.publicationEvidenceHash, 'EVIDENCE_MISMATCH');
    const scope: Scope = b.scope;
    const { principalId, ...requirements } = scope;
    same(requirements, a.replayPolicy.scope);
    same(hashObserved(scope), b.scopeHash);
    demand(principalId === b.principalId && scope.csiId === b.csiId && scope.environment === b.environment && job.configuration.environment === b.environment, 'EVIDENCE_MISMATCH');
    for (const key of ['executionId', 'attemptId', 'revisionId', 'revisionDigest', 'principalId', 'csiId', 'scopeHash'] as const)
        demand(g[key] === b[key], 'EVIDENCE_MISMATCH');
    demand(g.profileHash === hashObserved(b.requiredProfile) && g.buildHash === hashObserved(build), 'EVIDENCE_MISMATCH');
    demand(Date.parse(g.issuedAt) <= now && Date.parse(g.expiresAt) > now && Date.parse(g.expiresAt) - Date.parse(g.issuedAt) <= 30000, 'AUTHORIZATION_EXPIRED');
    const inputs = indexUnique(job.inputs, i => i.inputId, 'REFERENCE_MISMATCH');
    demand(inputs.size === a.inputRecipes.filter(input => input.kind !== 'secretRef').length, 'REFERENCE_MISMATCH');
    let bytes = 0;
    for (const recipe of a.inputRecipes) {
        if (recipe.kind === 'secretRef') { demand(recipe.provenance.kind === 'configuration' && Object.hasOwn(job.secrets, recipe.provenance.referenceName), 'REFERENCE_MISMATCH'); continue; }
        const input = inputs.get(recipe.inputId);
        demand(input, 'REFERENCE_MISMATCH');
        bytes += Buffer.byteLength(input.value);
        demand(Buffer.byteLength(input.value) <= 16384, 'LIMIT_EXCEEDED');
        if (recipe.kind === 'destination') {
            let url: URL;
            try {
                url = new URL(input.value);
            }
            catch {
                throw new ObservedRefusal('REFERENCE_MISMATCH');
            }
            demand(!url.username && !url.password && domainAllowed(allowedDomains, input.value) && Buffer.byteLength(input.value) <= 4096, 'POLICY_REFUSED');
        }
    }
    demand(bytes <= OBSERVED_LIMITS.inputs, 'LIMIT_EXCEEDED');
    demand(job.runtime.stepTimeoutMs === job.configuration.timeoutSeconds * 1000 && job.runtime.stepTimeoutMs > 0 && job.runtime.totalRuntimeMs > 0, 'INVALID_CONTRACT');
    return job;
}

/** Transient check at the Execute3 value boundary; no Vault access or retained value state. An authored nonsecret value never equals a resolved secret. */
export function assertResolvedSecretLiterals(message: Pick<Execute3, 'inputs' | 'secrets'>): void {
    const values = new Set(Object.values(message.secrets));
    for (const input of message.inputs) demand(input.kind === 'secretRef' || !values.has(input.value), 'REFERENCE_MISMATCH');
    values.clear();
}
