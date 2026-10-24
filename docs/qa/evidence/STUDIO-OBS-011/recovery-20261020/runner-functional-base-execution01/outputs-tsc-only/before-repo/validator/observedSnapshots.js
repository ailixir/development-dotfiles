import { demand, equalObserved, hashObserved } from './observedReferencePolicy.js';
const same = (a, b) => { demand(equalObserved(a, b), 'EVIDENCE_MISMATCH'); };
function omit(value, keys) { const excluded = new Set(keys); return Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.has(key))); }
const sort = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
/** Frozen source identity only. No current variable lookup or materialized value reconstruction. */
export function inputChains(identity, configuration) {
    const declarations = new Map(identity.authoredDeclarations.map(d => [d.referenceId, d]));
    demand(declarations.size === identity.authoredDeclarations.length, 'EVIDENCE_MISMATCH');
    const used = new Map();
    const collect = (context, text) => {
        const local = new Map();
        const add = (id, kind, direct = false) => {
            const d = direct ? identity.authoredDeclarations.find(item => item.kind === 'secretRef' && item.secretId === id && item.referenceId === id) : declarations.get(id);
            demand(d?.kind === kind, 'REFERENCE_MISMATCH');
            const prior = used.get(d.referenceId);
            demand(!prior || equalObserved(prior, d), 'REFERENCE_MISMATCH');
            used.set(d.referenceId, d);
            local.set(d.referenceId, d);
        };
        for (const item of context.entries) {
            const entry = item.kind === 'default' ? item.value : item;
            if (entry.kind === 'variableRef')
                add(entry.referenceId, 'plain');
            if (entry.kind === 'secretRef')
                add(entry.referenceId, 'secretRef');
        }
        for (const token of text?.matchAll(/<var\s+([A-Za-z0-9_.-]{1,64})>/gu) ?? [])
            add(token[1] ?? '', 'plain');
        for (const token of text?.matchAll(/<secret\s+([A-Za-z0-9_.-]{1,64})>/gu) ?? [])
            add(token[1] ?? '', 'secretRef', true);
        return [...local.values()].sort((a, b) => sort(a.referenceId, b.referenceId));
    };
    const globalReferences = collect(identity.authoring.globalContext);
    let previous = hashObserved({ domain: 'studio.test-config', version: 1, ...configuration, globalContextHash: hashObserved(identity.authoring.globalContext), globalReferences });
    const chains = identity.authoring.steps.map(step => {
        const references = collect(step.context, step.text);
        const stepInputHash = hashObserved({ domain: 'studio.step-input', version: 1, stepId: step.id, text: step.text, context: step.context, references });
        previous = hashObserved({ domain: 'studio.step-chain', version: 1, stepId: step.id, stepInputHash, previous });
        return previous;
    });
    same([...used.values()].sort((a, b) => sort(a.referenceId, b.referenceId)), identity.authoredDeclarations);
    return chains;
}
export function stepSnapshots(identity, configuration, plan) {
    const chains = inputChains(identity, configuration);
    return Object.fromEntries(identity.authoring.steps.map((step, index) => {
        const actions = plan.actions.filter(a => a.coordinate.stepId === step.id).sort((a, b) => a.coordinate.ordinal - b.coordinate.ordinal).map(a => omit(a, ['admissionId']));
        const producedBindings = plan.bindings.filter(b => b.producer.stepId === step.id).sort((a, b) => a.producer.ordinal - b.producer.ordinal || sort(a.bindingId, b.bindingId)).map(b => ({ ...omit(b, ['consumers']), provenance: omit(b.provenance, ['sessionId', 'producerAdmissionId']) }));
        const consumedBindings = plan.bindings.flatMap(b => b.consumers).filter(e => e.coordinate.stepId === step.id).sort((a, b) => a.coordinate.ordinal - b.coordinate.ordinal || sort(a.argumentSlot, b.argumentSlot) || sort(a.bindingId, b.bindingId)).map(e => omit(e, ['producerAdmissionId', 'consumerAdmissionId']));
        return [step.id, hashObserved({ domain: 'studio.step-snapshot', version: 1, stepId: step.id, inputChain: chains[index], learnedStepHash: hashObserved({ actions, producedBindings, consumedBindings }) })];
    }));
}
function expectedProgram(base, pin, ids) {
    return { schemaVersion: 3, baseRevisionId: pin.revisionId, baseRevisionDigest: pin.revisionDigest, sourceStepIds: ids, actions: base.artifact.learnedPlan.actions.filter(a => ids.includes(a.coordinate.stepId)).map(action => {
            const a = omit(action, ['admissionId']);
            const replay = base.artifact.steps.flatMap(s => s.operations).filter(o => equalObserved(o.coordinate, a.coordinate));
            demand(replay.length === 1, 'EVIDENCE_MISMATCH');
            const guard = base.artifact.guards.find(g => g.guardId === replay[0]?.guardId);
            demand(guard, 'EVIDENCE_MISMATCH');
            return { ...a, guard };
        }) };
}
/** Reconstruct current and immediate immutable base maps before any candidate hash exists. */
export function deriveSnapshotMaps(b, plan) {
    const proof = b.snapshotEvidence, current = proof.current;
    same(current.authoring.steps.map((s, ordinal) => ({ stepId: s.id, ordinal, source: s.text })), b.sourceSteps);
    const stepSnapshotHashes = stepSnapshots(current, b.configuration, plan), reusedFrom = {};
    const incremental = b.incrementalEvidence;
    if (!incremental) {
        same(proof.pinnedBase, null);
        same(proof.baseProof, null);
        return { stepSnapshotHashes, reusedFrom, incremental: null };
    }
    const { plan: initial, program, switch: change } = incremental, pin = proof.pinnedBase;
    demand(pin && initial.sessionId === b.sessionId && initial.testId === b.testId && initial.csiId === b.csiId && change.sessionId === b.sessionId, 'EVIDENCE_MISMATCH');
    same(initial.baseRevisionId, pin.revisionId);
    same(program.baseRevisionId, pin.revisionId);
    same(program.baseRevisionDigest, pin.revisionDigest);
    same(change.baseRevisionId, pin.revisionId);
    same(hashObserved(program), initial.prefixProgramHash);
    const original = initial.initialFirstLearnIndex, effective = change.effectiveFirstLearnIndex;
    demand(original >= 0 && original < b.sourceSteps.length && effective >= 0 && effective <= original && change.completedPrefixCount === effective, 'EVIDENCE_MISMATCH');
    same(b.sourceSteps[original]?.stepId, initial.initialFirstLearnStepId);
    same(change.initialFirstLearnStepId, initial.initialFirstLearnStepId);
    same(b.sourceSteps[effective]?.stepId, change.effectiveFirstLearnStepId);
    if (change.reason !== 'DRIFT') {
        demand(effective === original && change.nextSemanticOrdinal === 0 && incremental.driftReceipt === null && change.driftReceiptHash === null && incremental.excludedAttempts.length === 0, 'EVIDENCE_MISMATCH');
    }
    else {
        demand(effective < original && incremental.driftReceipt, 'EVIDENCE_MISMATCH');
        const { receiptHash, ...body } = incremental.driftReceipt;
        same(hashObserved(body), receiptHash);
        same(receiptHash, change.driftReceiptHash);
        same(body.coordinate, { stepId: change.effectiveFirstLearnStepId, ordinal: change.nextSemanticOrdinal });
    }
    if (original === 0) {
        demand(change.reason === 'EMPTY_PREFIX' && !proof.baseProof && program.actions.length === 0 && program.sourceStepIds.length === 0 && incremental.prefixRequests.length === 0 && change.retainedPrefixAdmissionIds.length === 0, 'EVIDENCE_MISMATCH');
    }
    else {
        const base = proof.baseProof;
        demand(base, 'EVIDENCE_MISMATCH');
        const revision = base.revision, identity = revision.identity, artifact = base.artifact;
        same(revision.id, pin.revisionId);
        same(revision.revisionDigest, pin.revisionDigest);
        same(hashObserved(identity), pin.revisionDigest);
        same(identity.testId, b.testId);
        same(identity.csiId, b.csiId);
        same(hashObserved(base.authoringIdentity.authoring.steps.map(s => s.text)), identity.sourceHash);
        same(hashObserved(base.authoringIdentity.authoring.steps.map((s, ordinal) => ({ stepId: s.id, ordinal, source: s.text }))), identity.authoringHash);
        same(hashObserved(base.configuration), identity.configurationHash);
        same(hashObserved(artifact), identity.artifactHash);
        same(hashObserved(artifact.learnedPlan), identity.learnedPlanHash);
        same(artifact.learnedPlanHash, identity.learnedPlanHash);
        same(hashObserved(artifact.replayPolicy), identity.referencePolicyHash);
        same(hashObserved(artifact.profile), identity.profileHash);
        for (const key of ['sourceHash', 'configurationHash', 'authoringHash'])
            same(artifact[key], identity[key]);
        for (const key of ['admissionProvenanceHash', 'publicationEvidenceHash', 'runAuthorizationHash'])
            same(artifact.replayPolicy[key], identity[key]);
        same(hashObserved({ operations: artifact.steps.flatMap(s => s.operations), guards: artifact.guards, inputRecipes: artifact.inputRecipes, bindings: artifact.replayPolicy.bindings, transfers: artifact.replayPolicy.transfers }), identity.operationEquivalenceHash);
        same(stepSnapshots(base.authoringIdentity, base.configuration, artifact.learnedPlan), revision.stepSnapshotHashes);
        same(revision.stepSnapshotHashes, artifact.learnedPlan.stepSnapshotHashes);
        same(revision.reusedFrom, artifact.learnedPlan.reusedFrom);
        const oldChains = inputChains(base.authoringIdentity, base.configuration), chains = inputChains(current, b.configuration);
        let boundary = chains.findIndex((chain, i) => chain !== oldChains[i] || current.authoring.steps[i]?.id !== base.authoringIdentity.authoring.steps[i]?.id);
        if (boundary < 0 && chains.length !== oldChains.length)
            boundary = Math.min(chains.length, oldChains.length) - 1;
        demand(boundary < 0 || original <= boundary, 'EVIDENCE_MISMATCH');
        const ids = current.authoring.steps.slice(0, original).map(s => s.id);
        same(ids, base.authoringIdentity.authoring.steps.slice(0, original).map(s => s.id));
        same(program, expectedProgram(base, pin, ids));
        for (const id of ids.slice(0, effective)) {
            same(stepSnapshotHashes[id], revision.stepSnapshotHashes[id]);
            reusedFrom[id] = { revisionId: pin.revisionId, stepId: id };
        }
    }
    const retained = b.actions.filter(a => { const index = b.sourceSteps.findIndex(s => s.stepId === a.ledger.coordinate.stepId); return index < effective || index === effective && a.ledger.coordinate.ordinal < change.nextSemanticOrdinal; }).map(a => {
        const originalAction = program.actions.find(p => equalObserved(p.coordinate, a.ledger.coordinate));
        demand(originalAction && originalAction.operationHash === a.ledger.operationHash, 'EVIDENCE_MISMATCH');
        return a.ledger.admission.admissionId;
    });
    same(retained, change.retainedPrefixAdmissionIds);
    same(hashObserved(retained), change.retainedPrefixAdmissionsHash);
    return { stepSnapshotHashes, reusedFrom, incremental: { baseRevisionId: pin.revisionId, initialFirstLearnStepId: initial.initialFirstLearnStepId, effectiveFirstLearnStepId: change.effectiveFirstLearnStepId, retainedPrefixAdmissionIds: retained, driftReceiptHash: change.driftReceiptHash } };
}
//# sourceMappingURL=observedSnapshots.js.map