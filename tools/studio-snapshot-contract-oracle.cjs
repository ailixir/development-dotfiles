'use strict';
// Internal contract arithmetic only. No application imports, persistence, callback authentication or effects.
module.exports = ({ hash, canonical, check, same, structural }) => {
  const limits = Object.freeze({ basis: 6291456, validationRequest: 8388608, artifact: 1048576 });
  const utf8 = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
  const clone = value => structuredClone(value);
  const configKeys = ['environment', 'browser', 'viewport', 'timeoutSeconds', 'waitStrategy'];
  function references(identity, context, text = '', all = new Map()) {
    const names = new Map(), direct = new Map();
    for (const declaration of identity.authoredDeclarations) {
      check(!names.has(declaration.referenceId), 'SNAPSHOT_DECLARATIONS'); names.set(declaration.referenceId, declaration);
      if (declaration.kind === 'secretRef') {
        const token = { ...declaration, referenceId: declaration.secretId };
        if (direct.has(declaration.secretId)) same(direct.get(declaration.secretId), token, 'SNAPSHOT_DECLARATIONS');
        direct.set(declaration.secretId, token);
      }
    }
    for (const [id, token] of direct) if (names.has(id)) same(names.get(id), token, 'SNAPSHOT_DECLARATIONS');
    const used = new Map();
    const add = (declaration, kind) => {
      check(declaration && declaration.kind === kind, 'SNAPSHOT_REFERENCE');
      const id = declaration.referenceId;
      if (all.has(id)) same(all.get(id), declaration, 'SNAPSHOT_DECLARATIONS');
      all.set(id, declaration); used.set(id, declaration);
    };
    for (const entry of context.entries) {
      const value = entry.kind === 'default' ? entry.value : entry;
      if (['variableRef', 'secretRef'].includes(value.kind)) add(names.get(value.referenceId), value.kind === 'variableRef' ? 'plain' : 'secretRef');
    }
    // Matches the existing Java parser's ASCII whitespace grammar, with exact IDs and no interpolation elsewhere.
    for (const match of text.matchAll(/<(var|secret)[ \t\n\v\f\r]+([A-Za-z0-9_.-]{1,64})>/g)) {
      add(match[1] === 'var' ? names.get(match[2]) : direct.get(match[2]), match[1] === 'var' ? 'plain' : 'secretRef');
    }
    return [...used.keys()].sort(utf8).map(id => clone(used.get(id)));
  }
  function envelopes(identity, configuration, graph) {
    structural('authoring-snapshot#/definitions/AuthoringSnapshotIdentity', identity);
    const source = identity.authoring, all = new Map();
    check(new Set(source.steps.map(step => step.id)).size === source.steps.length, 'SNAPSHOT_SOURCE');
    const testConfig = { domain: 'studio.test-config', version: 1,
      ...Object.fromEntries(configKeys.map(key => [key, configuration[key]])),
      globalContextHash: hash(source.globalContext), globalReferences: references(identity, source.globalContext, '', all) };
    let previous = hash(testConfig); const rows = [], maps = {};
    for (const step of source.steps) {
      const stepInput = { domain: 'studio.step-input', version: 1, stepId: step.id, text: step.text,
        context: step.context, references: references(identity, step.context, step.text, all) };
      const stepChain = { domain: 'studio.step-chain', version: 1, stepId: step.id, stepInputHash: hash(stepInput), previous };
      previous = hash(stepChain);
      const actions = graph.actions.filter(action => action.coordinate.stepId === step.id)
        .sort((a, b) => a.coordinate.ordinal - b.coordinate.ordinal).map(({ admissionId, ...rest }) => clone(rest));
      const producedBindings = [], consumedBindings = [];
      for (const binding of graph.bindings) {
        if (binding.producer.stepId === step.id) {
          const value = clone(binding); delete value.consumers; delete value.provenance.sessionId; delete value.provenance.producerAdmissionId;
          producedBindings.push(value);
        }
        for (const edge of binding.consumers) if (edge.coordinate.stepId === step.id) {
          const { producerAdmissionId, consumerAdmissionId, ...rest } = edge; consumedBindings.push(clone(rest));
        }
      }
      producedBindings.sort((a, b) => a.producer.ordinal - b.producer.ordinal || utf8(a.bindingId, b.bindingId));
      consumedBindings.sort((a, b) => a.coordinate.ordinal - b.coordinate.ordinal
        || utf8(a.argumentSlot, b.argumentSlot) || utf8(a.bindingId, b.bindingId));
      const learnedContent = { actions, producedBindings, consumedBindings };
      const stepSnapshot = { domain: 'studio.step-snapshot', version: 1, stepId: step.id,
        inputChain: previous, learnedStepHash: hash(learnedContent) };
      const snapshotHash = hash(stepSnapshot); maps[step.id] = snapshotHash;
      rows.push({ stepInput, stepChain, learnedContent, stepSnapshot, snapshotHash });
    }
    same(identity.authoredDeclarations, [...all.keys()].sort(utf8).map(key => all.get(key)), 'SNAPSHOT_DECLARATIONS');
    return { maps, computation: { testConfig, rows } };
  }
  function graphFromBasis(basis) {
    const order = new Map(basis.sourceSteps.map((step, i) => [step.stepId, i]));
    const compare = (a, b) => order.get(a.stepId) - order.get(b.stepId) || a.ordinal - b.ordinal;
    const facts = [...basis.actions].sort((a, b) => compare(a.ledger.coordinate, b.ledger.coordinate));
    const actions = facts.map(fact => {
      const ledger = fact.ledger, preparation = basis.preparations.find(p => p.preparationId === fact.preparationId);
      check(preparation && ledger.state === 'SUCCEEDED' && ledger.dispatchCount === 1, 'SNAPSHOT_GRAPH');
      const proposal = preparation.proposal;
      const action = { coordinate: clone(ledger.coordinate), origin: proposal.executionEvidence.origin,
        target: clone(preparation.proof.target ?? null), operation: clone(proposal.operation) };
      check(ledger.operationHash === hash(action), 'SNAPSHOT_GRAPH');
      return { ...action, admissionId: ledger.admission.admissionId, operationHash: hash(action) };
    });
    const bindings = basis.producers.map(producer => {
      const actual = actions.find(action => action.admissionId === producer.producerAdmissionId);
      check(actual && actual.operation.kind === 'read' && actual.operation.bindingId === producer.bindingId, 'SNAPSHOT_GRAPH');
      same(actual.coordinate, producer.coordinate, 'SNAPSHOT_GRAPH'); same(actual.operation.recipe, producer.recipe, 'SNAPSHOT_GRAPH');
      const consumers = basis.consumerEdges.filter(edge => edge.bindingId === producer.bindingId)
        .sort((a, b) => compare(a.coordinate, b.coordinate) || utf8(a.argumentSlot, b.argumentSlot) || utf8(a.bindingId, b.bindingId));
      for (const edge of consumers) {
        const action = actions.find(action => action.admissionId === edge.consumerAdmissionId);
        const argument = action?.operation.value ?? action?.operation.expected;
        check(action && argument?.kind === 'binding' && argument.bindingId === producer.bindingId
          && edge.producerAdmissionId === producer.producerAdmissionId, 'SNAPSHOT_GRAPH');
        same(edge.coordinate, action.coordinate, 'SNAPSHOT_GRAPH');
      }
      return { schemaVersion: 3, bindingId: producer.bindingId, valueType: 'string', producer: clone(producer.coordinate),
        recipe: clone(producer.recipe), sourceOrigin: producer.origin, consumers: clone(consumers),
        provenance: { sessionId: basis.sessionId, producerAdmissionId: producer.producerAdmissionId,
          sourceIntentStepId: producer.coordinate.stepId }, transferPolicy: 'sameOrigin', preserveBytes: true };
    }).sort((a, b) => compare(a.producer, b.producer) || utf8(a.bindingId, b.bindingId));
    same(bindings, basis.bindings, 'SNAPSHOT_GRAPH');
    return { actions, bindings };
  }
  function validate(basis, authority, candidate) {
    structural('replay-validation#/definitions/ValidationBasis', basis);
    check(Buffer.byteLength(canonical(basis)) <= limits.basis, 'LIMIT_EXCEEDED');
    const evidence = basis.snapshotEvidence, source = evidence.current.authoring;
    same(source.steps.map((step, ordinal) => ({ stepId: step.id, ordinal, source: step.text })), basis.sourceSteps, 'SNAPSHOT_SOURCE');
    check(hash(basis.sourceSteps.map(step => step.source)) === basis.sourceHash
      && hash(basis.sourceSteps) === basis.authoringHash && hash(basis.configuration) === basis.configurationHash, 'SNAPSHOT_SOURCE_HASH');
    if (authority) {
      const manifest = authority.sourceManifest;
      check(manifest, 'SNAPSHOT_AUTHORITY');
      same(basis.configuration, authority.configuration, 'SNAPSHOT_IMMUTABLE_CONFIGURATION');
      same(source, manifest.authoringSnapshot, 'SNAPSHOT_IMMUTABLE_SOURCE');
      same(evidence.current.authoredDeclarations, manifest.authoredDeclarations, 'SNAPSHOT_IMMUTABLE_SOURCE');
      check(manifest.authoringIdentityVersion === 1, 'SNAPSHOT_AUTHORITY');
      const { configurationValues, ...preimage } = manifest;
      check(hash(preimage) === basis.sourceManifestHash, 'SNAPSHOT_MANIFEST_HASH');
      for (const declaration of evidence.current.authoredDeclarations) if (declaration.kind === 'plain') {
        const actual = configurationValues[declaration.referenceId];
        check(typeof actual === 'string' && hash(actual) === declaration.valueHash, 'SNAPSHOT_VALUE_HASH');
      }
      same(evidence.pinnedBase, authority.originalPinnedBase, 'SNAPSHOT_ORIGINAL_PIN');
    }
    const graph = graphFromBasis(basis), derived = envelopes(evidence.current, basis.configuration, graph);
    const inc = basis.incrementalEvidence, reusedFrom = {}; let incremental = null;
    if (inc === null) check(evidence.pinnedBase === null && evidence.baseProof === null, 'SNAPSHOT_BASE_PROOF');
    else {
      const pin = evidence.pinnedBase;
      check(pin && pin.revisionId === inc.plan.baseRevisionId && pin.revisionId === inc.program.baseRevisionId
        && pin.revisionId === inc.switch.baseRevisionId && pin.revisionDigest === inc.program.baseRevisionDigest,
      'SNAPSHOT_BASE_PIN');
      check(hash(inc.program) === inc.plan.prefixProgramHash, 'SNAPSHOT_PROGRAM');
      if (inc.plan.initialFirstLearnIndex === 0) {
        check(evidence.baseProof === null && inc.switch.reason === 'EMPTY_PREFIX'
          && inc.program.actions.length === 0 && inc.program.sourceStepIds.length === 0
          && inc.prefixRequests.length === 0 && inc.switch.retainedPrefixAdmissionIds.length === 0
          && inc.firstSuffixAcceptance.retainedPrefixAdmissionIds.length === 0
          && inc.driftReceipt === null && inc.excludedAttempts.length === 0, 'SNAPSHOT_BASE_PROOF');
      } else {
        const proof = evidence.baseProof; check(proof, 'SNAPSHOT_BASE_PROOF');
        structural('authoring-snapshot#/definitions/BaseSnapshotProof', proof);
        check(Buffer.byteLength(canonical(proof.artifact)) <= limits.artifact, 'LIMIT_EXCEEDED');
        const revision = proof.revision, id = revision.identity, artifact = proof.artifact, plan = artifact.learnedPlan;
        check(revision.id === pin.revisionId && revision.revisionDigest === pin.revisionDigest
          && hash(id) === pin.revisionDigest && id.testId === basis.testId && id.csiId === basis.csiId, 'SNAPSHOT_BASE_IDENTITY');
        if (authority) same(proof, authority.baseProof, 'SNAPSHOT_IMMUTABLE_BASE');
        const base = envelopes(proof.authoringIdentity, proof.configuration, plan);
        same(base.maps, revision.stepSnapshotHashes, 'SNAPSHOT_BASE_MAP');
        same(base.maps, plan.stepSnapshotHashes, 'SNAPSHOT_BASE_MAP'); same(revision.reusedFrom, plan.reusedFrom, 'SNAPSHOT_BASE_MAP');
        const operationEquivalence = { operations: artifact.steps.flatMap(step => step.operations), guards: artifact.guards,
          inputRecipes: artifact.inputRecipes, bindings: artifact.replayPolicy.bindings, transfers: artifact.replayPolicy.transfers };
        check(hash(artifact) === id.artifactHash && hash(plan) === id.learnedPlanHash
          && artifact.learnedPlanHash === id.learnedPlanHash && artifact.replayPolicy.learnedPlanHash === id.learnedPlanHash
          && hash(artifact.replayPolicy) === id.referencePolicyHash && hash(proof.configuration) === id.configurationHash
          && hash(artifact.profile) === id.profileHash && hash(operationEquivalence) === id.operationEquivalenceHash,
        'SNAPSHOT_BASE_HASH');
        const baseSteps = proof.authoringIdentity.authoring.steps.map((step, ordinal) => ({ stepId: step.id, ordinal, source: step.text }));
        check(hash(baseSteps.map(step => step.source)) === id.sourceHash && hash(baseSteps) === id.authoringHash
          && artifact.sourceHash === id.sourceHash && artifact.configurationHash === id.configurationHash
          && artifact.authoringHash === id.authoringHash && plan.sourceRevision === id.sourceRevision
          && plan.configurationRevision === id.configurationRevision, 'SNAPSHOT_BASE_SOURCE');
        for (const name of ['admissionProvenanceHash', 'publicationEvidenceHash', 'runAuthorizationHash']) {
          check(id[name] === artifact.replayPolicy[name], 'SNAPSHOT_BASE_RECEIPT');
        }
        const prefix = source.steps.slice(0, inc.plan.initialFirstLearnIndex).map(step => step.id);
        same(prefix, proof.authoringIdentity.authoring.steps.slice(0, prefix.length).map(step => step.id), 'SNAPSHOT_PREFIX');
        same(prefix, inc.program.sourceStepIds, 'SNAPSHOT_PREFIX');
        const expectedProgram = plan.actions.filter(action => prefix.includes(action.coordinate.stepId)).map(action => {
          const { admissionId, ...value } = action; return { ...value, guard: artifact.guards[plan.actions.indexOf(action)] };
        });
        same(expectedProgram, inc.program.actions, 'SNAPSHOT_PROGRAM');
        let changed = -1;
        const left = derived.computation.rows, right = base.computation.rows;
        for (let i = 0; i < Math.min(left.length, right.length); i++) {
          if (left[i].stepInput.stepId !== right[i].stepInput.stepId || hash(left[i].stepChain) !== hash(right[i].stepChain)) { changed = i; break; }
        }
        if (changed < 0 && left.length !== right.length) changed = Math.min(left.length, right.length, left.length - 1);
        check(changed < 0 || inc.plan.initialFirstLearnIndex <= changed, 'SNAPSHOT_BOUNDARY');
        for (const step of source.steps.slice(0, inc.switch.completedPrefixCount)) {
          check(derived.maps[step.id] === base.maps[step.id], 'SNAPSHOT_REUSE_EQUALITY');
          reusedFrom[step.id] = { revisionId: pin.revisionId, stepId: step.id };
        }
      }
      incremental = { baseRevisionId: inc.plan.baseRevisionId, initialFirstLearnStepId: inc.plan.initialFirstLearnStepId,
        effectiveFirstLearnStepId: inc.switch.effectiveFirstLearnStepId,
        retainedPrefixAdmissionIds: clone(inc.switch.retainedPrefixAdmissionIds), driftReceiptHash: inc.switch.driftReceiptHash };
    }
    if (candidate) {
      structural('replay-artifact', candidate);
      same(candidate.learnedPlan.actions, graph.actions, 'SNAPSHOT_CANDIDATE_GRAPH');
      same(candidate.learnedPlan.bindings, graph.bindings, 'SNAPSHOT_CANDIDATE_GRAPH');
      same(candidate.learnedPlan.stepSnapshotHashes, derived.maps, 'SNAPSHOT_CANDIDATE_MAP');
      same(candidate.learnedPlan.reusedFrom, reusedFrom, 'SNAPSHOT_CANDIDATE_REUSE');
      same(candidate.learnedPlan.incremental, incremental, 'SNAPSHOT_CANDIDATE_INCREMENTAL');
      check(candidate.learnedPlanHash === hash(candidate.learnedPlan)
        && candidate.replayPolicy.learnedPlanHash === candidate.learnedPlanHash, 'SNAPSHOT_CANDIDATE_HASH');
    }
    return { ...derived, reusedFrom, incremental, graph };
  }
  function wireBounds(request) {
    check(Buffer.byteLength(canonical(request)) <= limits.validationRequest, 'LIMIT_EXCEEDED');
    check(Buffer.byteLength(canonical(request.validationBasis)) <= limits.basis, 'LIMIT_EXCEEDED');
    check(Buffer.byteLength(canonical(request.artifact)) <= limits.artifact, 'LIMIT_EXCEEDED');
  }
  return { envelopes, graphFromBasis, validate, wireBounds, limits };
};
