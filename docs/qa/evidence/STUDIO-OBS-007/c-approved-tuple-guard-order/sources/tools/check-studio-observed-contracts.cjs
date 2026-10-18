#!/usr/bin/env node
'use strict';
// Contract conformance oracle, not a runtime admission service. Consumed by shared fixtures.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const YAML = require('yaml');
const directory = path.resolve(__dirname, '../docs/specs/studio-observed-authoring/contracts');
const base = 'https://checks.citi.example/contracts/observed/v1/';
const v2Directory = path.join(directory, 'v2');
const v2Base = 'https://checks.citi.example/contracts/observed/v2/';
const v3Base = 'https://checks.citi.example/contracts/observed/v3/';
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.schema.json'))) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
}
for (const name of fs.readdirSync(v2Directory).filter(name => name.endsWith('.schema.json'))) {
  const schema = JSON.parse(fs.readFileSync(path.join(v2Directory, name), 'utf8'));
  assert.equal(schema.$id, v2Base + name, 'v2 schema identity must match its file');
  assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
  ajv.addSchema(schema);
}
for(const name of fs.readdirSync(path.join(directory,'v3')).filter(n=>n.endsWith('.schema.json'))){const schema=JSON.parse(fs.readFileSync(path.join(directory,'v3',name),'utf8'));assert.equal(schema.$id,v3Base+name);assert.equal(schema.$schema,'http://json-schema.org/draft-07/schema#');ajv.addSchema(schema);}
// Canonical JSON subset: sorted ASCII keys, Unicode strings preserved, safe integers only.
function canonical(value) {
  if (typeof value === 'string') check(value.isWellFormed(), 'INVALID_UNICODE');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    assert(Number.isSafeInteger(value) && !Object.is(value, -0), 'canonical integers only');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  assert(value && Object.getPrototypeOf(value) === Object.prototype, 'plain JSON object only');
  return `{${Object.keys(value).sort().map(key => {
    assert(/^[A-Za-z][A-Za-z0-9]*$/.test(key), 'ASCII contract keys only');
    return `${JSON.stringify(key)}:${canonical(value[key])}`;
  }).join(',')}}`;
}
const hash = value => crypto.createHash('sha256').update(canonical(value), 'utf8').digest('hex');
const key = coordinate => `${coordinate.stepId}:${coordinate.ordinal}`;
const operationIdentity = action => ({ coordinate: action.coordinate, locator: action.locator, operation: action.operation, origin: action.origin });
const provenance = bundle => bundle.ledgers.map(ledger => ({ coordinate: ledger.coordinate, admission: ledger.admission, operationHash: ledger.operationHash, scopeHash: ledger.scopeHash }));
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function check(condition, code) { if (!condition) fail(code); }
function structural(name, value) {
  const validate = ajv.getSchema(`${base}${name}.schema.json`);
  check(validate(value), 'SCHEMA');
}
function validateObservationRelations(observation) {
  const nodes = new Map(observation.nodes.map(node => [node.nodeId, node]));
  check(nodes.size === observation.nodes.length, 'NODE_ID');
  for (const node of observation.nodes) {
    for (const id of [node.parentNodeId, node.regionId, node.formId, ...node.labelNodeIds]) {
      check(id === null || nodes.has(id), 'NODE_RELATION');
    }
    // Strictly decreasing parent depth also excludes self-links and every parent cycle.
    check(node.parentNodeId === null ? node.depth === 0 : node.depth === nodes.get(node.parentNodeId).depth + 1, 'NODE_RELATION');
  }
}
function validateBundle(bundle) {
  const { session, observations, proposals, ledgers, plan, revision, result } = bundle;
  for (const [name, value] of [['session',session],['learned-plan',plan],['revision',revision],['result',result]]) structural(name,value);
  observations.forEach(value => structural('observation',value));
  proposals.forEach(value => structural('action',value));
  ledgers.forEach(value => structural('ledger',value));
  for (const origin of session.scope.approvedOrigins) {
    let parsed;
    try { parsed = new URL(origin); } catch { fail('ORIGIN'); }
    check(parsed.hostname.startsWith('[') || parsed.hostname.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)), 'ORIGIN');
    check(['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin && !parsed.username && !parsed.password, 'ORIGIN');
  }
  check(new Set(session.scope.approvedOrigins).size === session.scope.approvedOrigins.length, 'ORIGIN');
  const scopeHash = hash(session.scope);
  check(session.scopeHash === scopeHash && session.runAuthorization.scopeHash === scopeHash && session.runAuthorization.principalId === session.scope.principalId, 'SESSION_SCOPE');
  check(session.createdAt < session.expiresAt && Date.parse(session.expiresAt) - Date.parse(session.createdAt) <= session.limits.maxSessionSeconds * 1000, 'SESSION_EXPIRY');
  check(session.authConnection.mode !== 'unavailable' && session.authConnection.connectionId !== null, 'AUTH_CONNECTION');
  check(session.sourceSteps.length === new Set(session.sourceSteps.map(step => step.stepId)).size, 'STEP_ID');
  check(plan.sourceSteps.join('|') === session.sourceSteps.map(step => step.stepId).join('|'), 'STEP_ID');
  check(plan.actions.length === proposals.length && proposals.length === ledgers.length && proposals.length === observations.length, 'ACTION_COUNT');
  check(session.sourceSteps.length <= session.limits.maxSourceSteps && plan.actions.length <= session.limits.maxActions && observations.length <= session.limits.maxObservations && plan.bindings.length <= session.limits.maxRuntimeValues, 'BUDGET');
  // Stored counters may include repair/re-observation work, but cannot undercount the exercised corpus.
  const observationBytes = observations.reduce((total, observation) => total + Buffer.byteLength(canonical(observation), 'utf8'), 0);
  check(session.counters.actions >= plan.actions.length && session.counters.observations >= observations.length && session.counters.modelProposals >= proposals.length && session.counters.sanitizedEvidenceBytes >= observationBytes, 'BUDGET');
  for (const [counter, limit] of Object.entries({actions:'maxActions',observations:'maxObservations',modelProposals:'maxModelProposals',modelInputTokens:'maxModelInputTokensTotal',modelOutputTokens:'maxModelOutputTokensTotal',sanitizedEvidenceBytes:'maxSanitizedEvidenceBytesTotal'})) check(session.counters[counter] <= session.limits[limit], 'BUDGET');
  const counts = new Map();
  let priorStep = -1;
  for (let index = 0; index < proposals.length; index++) {
    const proposal = proposals[index], observation = observations[index], ledger = ledgers[index], action = plan.actions[index];
    check([proposal, observation, ledger].every(item => item.sessionId === session.sessionId), 'SESSION_SCOPE');
    check([proposal, observation, ledger, plan, revision, result].every(item => item.scopeHash === scopeHash), 'SESSION_SCOPE');
    check(session.scope.approvedOrigins.includes(observation.origin) && observation.origin === action.origin, 'ORIGIN');
    check(proposal.generation === observation.generation && ledger.generation === observation.generation && proposal.target.generation === observation.generation && proposal.target.documentId === observation.documentId && ledger.documentId === observation.documentId, 'NODE_GENERATION');
    check(observation.nodes.every(node => node.generation === observation.generation && node.documentId === observation.documentId), 'NODE_GENERATION');
    check(observation.nodes.length === new Set(observation.nodes.map(node => node.nodeId)).size, 'NODE_ID');
    check(Buffer.byteLength(canonical(observation), 'utf8') <= session.limits.maxObservationBytes && observation.nodes.length <= session.limits.maxObservationNodes && observation.nodes.every(node => node.depth <= session.limits.maxObservationDepth), 'BUDGET');
    validateObservationRelations(observation);
    check(proposal.observationHash === hash(observation) && ledger.observationHash === hash(observation), 'OBSERVATION_HASH');
    const stepIndex = plan.sourceSteps.indexOf(action.coordinate.stepId);
    check(stepIndex >= priorStep && stepIndex >= 0, 'ACTION_ORDER');
    priorStep = stepIndex;
    const ordinal = counts.get(action.coordinate.stepId) || 0;
    check(action.coordinate.ordinal === ordinal && ordinal < session.limits.maxStatementsPerStep, 'ACTION_ORDER');
    counts.set(action.coordinate.stepId, ordinal + 1);
    check(key(proposal.coordinate) === key(action.coordinate) && key(ledger.coordinate) === key(action.coordinate), 'ACTION_ORDER');
    check(canonical(proposal.operation) === canonical(action.operation), 'OPERATION_IDENTITY');
    check(session.scope.capabilities.includes(action.operation.kind), 'CAPABILITY');
    const pageOperation = action.operation.kind === 'navigate' || (action.operation.kind === 'assert' && ['url','title'].includes(action.operation.predicate));
    check(pageOperation ? proposal.target.kind === 'page' && action.locator === null : proposal.target.kind !== 'page', 'TARGET_MISMATCH');
    if (!pageOperation) {
      const node = observation.nodes.find(node => node.nodeId === proposal.target.nodeId);
      check(node && node.visible && node.classification !== 'withheld', 'TARGET_MISMATCH');
      check(canonical(action.locator) === canonical(proposal.target.locator) && node.locatorHints.some(locator => canonical(locator) === canonical(action.locator)), 'TARGET_MISMATCH');
      if (action.operation.kind === 'read') {
        const recipe = action.operation.recipe;
        check(!['password','hidden'].includes(node.controlType), 'SENSITIVE_SOURCE');
        check(recipe.policyRuleId === node.policyRuleId && recipe.classification === node.classification, 'SENSITIVE_SOURCE');
        check(recipe.kind !== 'controlValue' || (recipe.controlType === node.controlType && ['input','textarea'].includes(node.elementType)), 'SENSITIVE_SOURCE');
      }
    }
    check(action.operationHash === hash(operationIdentity(action)) && ledger.operationHash === action.operationHash && ledger.requestDigest === hash(proposal), 'OPERATION_IDENTITY');
    check(ledger.admission.admissionId === action.admissionId && ledger.admission.authorizationId === session.runAuthorization.authorizationId, 'ADMISSION_IDENTITY');
    check(ledger.ownerFence === session.owner.fence, 'STALE_FENCE');
    check(ledger.state === 'SUCCEEDED' && ledger.dispatchCount === 1 && ledger.outcomeCode === 'OK', 'PUBLICATION_STATE');
    if (action.operation.kind === 'assert') check(ledger.assertionPassed === true, 'ASSERTION_FAILED');
    if (index > 0) {
      const previous = observations[index - 1];
      const changesState = !['read', 'assert'].includes(plan.actions[index - 1].operation.kind);
      const changesDocument = observation.documentId !== previous.documentId;
      check(observation.generation >= previous.generation, 'NODE_GENERATION');
      if (changesState || changesDocument) check(observation.generation > previous.generation, 'NODE_GENERATION');
    }
  }
  check(ledgers.length === new Set(ledgers.map(ledger => ledger.idempotencyKey)).size && ledgers.length === new Set(ledgers.map(ledger => ledger.admission.admissionId)).size, 'ADMISSION_IDENTITY');
  check(plan.bindings.length === new Set(plan.bindings.map(binding => binding.bindingId)).size, 'BINDING_ID');
  const edges = new Set();
  for (const binding of plan.bindings) {
    const producerIndex = plan.actions.findIndex(action => key(action.coordinate) === key(binding.producer));
    const producer = plan.actions[producerIndex];
    check(producer && producer.operation.kind === 'read' && producer.operation.bindingId === binding.bindingId, 'BINDING_PRODUCER');
    check(canonical(producer.operation.recipe) === canonical(binding.recipe) && producer.origin === binding.sourceOrigin, 'BINDING_PRODUCER');
    check(binding.provenance.sessionId === session.sessionId && binding.provenance.producerAdmissionId === producer.admissionId && binding.provenance.sourceIntentStepId === producer.coordinate.stepId, 'ADMISSION_IDENTITY');
    for (const consumer of binding.consumers) {
      const consumerIndex = plan.actions.findIndex(action => key(action.coordinate) === key(consumer.coordinate));
      check(consumerIndex > producerIndex, 'BINDING_ORDER');
      const action = plan.actions[consumerIndex];
      const slot = action.operation.kind === 'assert' ? 'assert.expected' : `${action.operation.kind}.value`;
      const value = action.operation.expected || action.operation.value;
      check(value && value.kind === 'binding' && value.bindingId === binding.bindingId && slot === consumer.argumentSlot && action.origin === consumer.destinationOrigin, 'BINDING_CONSUMER');
      check(binding.sourceOrigin === consumer.destinationOrigin || (binding.transferPolicyId !== null && binding.transferPolicyId === session.scope.valueTransferPolicyId), 'ORIGIN');
      edges.add(`${key(action.coordinate)}:${binding.bindingId}`);
    }
  }
  for (const action of plan.actions) {
    const argument = action.operation.value || action.operation.expected;
    if (argument?.kind === 'binding') check(edges.has(`${key(action.coordinate)}:${argument.bindingId}`), 'BINDING_CONSUMER');
    if (action.operation.kind === 'read') check(plan.bindings.some(binding => binding.bindingId === action.operation.bindingId && key(binding.producer) === key(action.coordinate)), 'BINDING_PRODUCER');
  }
  validatePlanning(bundle);
  check(session.state === 'SUCCEEDED' && result.mode === 'guided' && result.outcome === 'SUCCEEDED' && result.assertionsPassed && result.sessionId === session.sessionId, 'PUBLICATION_STATE');
  for (const step of session.sourceSteps) check(counts.has(step.stepId) && (!step.requiresAssertion || plan.actions.some(action => action.coordinate.stepId === step.stepId && action.operation.kind === 'assert')), 'INCOMPLETE_PLAN');
  check(revision.sourceRevision === session.scope.sourceRevision && revision.configurationRevision === session.scope.configurationRevision && revision.runAuthorizationId === session.runAuthorization.authorizationId, 'PUBLICATION_IDENTITY');
  check(canonical(revision.versions) === canonical(plan.versions) && canonical(plan.versions) === canonical(session.versions), 'VERSION');
  check(revision.learnedPlanHash === hash(plan) && revision.admissionProvenanceHash === hash(provenance(bundle)), 'PUBLICATION_IDENTITY');
  const { revisionId, ...identity } = revision;
  check(revisionId === hash(identity) && result.readyRevisionId === revisionId, 'PUBLICATION_IDENTITY');
}

function validatePlanning(bundle) {
  const { session, planningContext, dependencyProposal, pendingBindings, authoredInputs, runnerContext, plan } = bundle;
  for (const [name, value] of [['planning-context',planningContext],['dependency-proposal',dependencyProposal],['pending-bindings',pendingBindings],['authored-inputs',authoredInputs],['runner-context',runnerContext]]) structural(name, value);
  check([planningContext, dependencyProposal, pendingBindings, authoredInputs, runnerContext].every(value => value.sessionId === session.sessionId && value.scopeHash === session.scopeHash), 'SESSION_SCOPE');
  check(runnerContext.ownerFence === session.owner.fence, 'STALE_FENCE');
  check([planningContext, dependencyProposal, authoredInputs].every(value => value.sourceRevision === session.scope.sourceRevision), 'DEPENDENCY_PLAN');
  const steps = session.sourceSteps.map(step => step.stepId);
  check(canonical(planningContext.sourceSteps.map(step => step.stepId)) === canonical(steps), 'DEPENDENCY_PLAN');
  check(authoredInputs.inputs.length === new Set(authoredInputs.inputs.map(input => input.inputId)).size && authoredInputs.inputs.every(input => steps.includes(input.sourceStepId)), 'AUTHORED_INPUT');
  check(planningContext.authoredInputsHash === hash(authoredInputs) && runnerContext.authoredInputsHash === hash(authoredInputs) && canonical(runnerContext.authoredInputs) === canonical(authoredInputs), 'AUTHORED_INPUT');
  for (const need of dependencyProposal.needs) {
    const producer = steps.indexOf(need.producerStepId);
    check(producer >= 0 && need.consumers.every(consumer => steps.indexOf(consumer.stepId) >= producer), 'DEPENDENCY_PLAN');
    const allocated = pendingBindings.bindings.find(binding => binding.needId === need.needId);
    check(allocated && allocated.producerStepId === need.producerStepId && canonical(allocated.consumers) === canonical(need.consumers), 'DEPENDENCY_PLAN');
    const binding = plan.bindings.find(binding => binding.bindingId === allocated.bindingId);
    check(binding && binding.producer.stepId === need.producerStepId && need.consumers.every(consumer => binding.consumers.some(edge => edge.coordinate.stepId === consumer.stepId && edge.argumentSlot === consumer.argumentSlot)), 'DEPENDENCY_PLAN');
  }
  // Check the reverse direction as well: removing an admitted need must never authorize
  // a previously unallocated binding or an extra executed consumer. Replanning snapshots
  // are cumulative, retaining the admitted needs/handles for every exercised edge.
  for (const binding of plan.bindings) {
    const allocated = pendingBindings.bindings.find(item => item.bindingId === binding.bindingId);
    const need = allocated && dependencyProposal.needs.find(item => item.needId === allocated.needId);
    check(need && binding.producer.stepId === need.producerStepId && binding.consumers.every(edge => need.consumers.some(consumer => consumer.stepId === edge.coordinate.stepId && consumer.argumentSlot === edge.argumentSlot)), 'DEPENDENCY_PLAN');
  }
  check(plan.bindings.length === pendingBindings.bindings.length && pendingBindings.bindings.length <= session.limits.maxRuntimeValues && pendingBindings.bindings.length === new Set(pendingBindings.bindings.map(binding => binding.needId)).size, 'DEPENDENCY_PLAN');
  check(dependencyProposal.needs.length === new Set(dependencyProposal.needs.map(need => need.needId)).size && pendingBindings.bindings.length === dependencyProposal.needs.length && pendingBindings.bindings.length === new Set(pendingBindings.bindings.map(binding => binding.bindingId)).size, 'DEPENDENCY_PLAN');
  check(pendingBindings.dependencyProposalHash === hash(dependencyProposal) && canonical(runnerContext.pendingBindings) === canonical(pendingBindings), 'DEPENDENCY_PLAN');
  for (const action of plan.actions) {
    const argument = action.operation.value || action.operation.expected;
    const id = action.operation.destinationInputId || (argument?.kind === 'authoredLiteral' ? argument.sourceInputId : null);
    if (id === null) continue;
    const input = authoredInputs.inputs.find(input => input.inputId === id);
    check(input && input.sourceStepId === action.coordinate.stepId, 'AUTHORED_INPUT');
    check(action.operation.kind === 'navigate' ? input.kind === 'destination' : input.kind === 'nonsecretText', 'AUTHORED_INPUT');
    if (input.kind === 'destination') check(session.scope.approvedOrigins.includes(new URL(input.value).origin), 'ORIGIN');
  }
}
function validateRead(value, existingCount, existingBytes, limits) {
  check(value.isWellFormed(), 'INVALID_UNICODE');
  check(value.trim().length > 0, 'EMPTY_VALUE');
  const bytes = Buffer.byteLength(value, 'utf8');
  check(bytes <= limits.maxRuntimeValueBytes && existingCount < limits.maxRuntimeValues && existingBytes + bytes <= limits.maxRuntimeValuesBytesTotal, 'VALUE_LIMIT');
  return value;
}

function applyPatch(value, patch) {
  const segments = patch.path.split('/').slice(1);
  const property = segments.pop();
  const parent = segments.reduce((current, segment) => current[segment], value);
  if (patch.op === 'remove') delete parent[property]; else parent[property] = patch.value;
}

// V2 is an independent conformance oracle. None of these fixture checks grants runtime
// dispatch authority or proves a DOM correspondence, account connection or publication.
function structuralV2(name, value) {
  const [file, fragment] = name.split('#');
  const validate = ajv.getSchema(`${v2Base}${file}.schema.json${fragment ? '#' + fragment : ''}`);
  assert(validate, `missing v2 validator: ${name}`);
  check(validate(value), 'SCHEMA');
}
const identityFieldsV2 = ['schemaVersion', 'sessionId', 'workerId', 'ownerFence', 'scopeHash',
  'contextId', 'contextRevision', 'sourceRevision', 'configurationRevision', 'versions'];
function identityV2(value) {
  return Object.fromEntries(identityFieldsV2.map(field => [field, value[field]]));
}
function sameV2(left, right, code) { check(canonical(left) === canonical(right), code); }
function uniqueV2(items, identity, code) {
  check(new Set(items.map(identity)).size === items.length, code);
}
function canonicalOriginV2(value) {
  let parsed;
  try { parsed = new URL(value); } catch { fail('ORIGIN'); }
  check(['http:', 'https:'].includes(parsed.protocol) && parsed.origin === value
    && !parsed.username && !parsed.password, 'ORIGIN');
  check(parsed.hostname.startsWith('[') || parsed.hostname.split('.').every(
    label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)), 'ORIGIN');
}
const operationIdentityV2 = proposal => ({ coordinate: proposal.coordinate,
  origin: proposal.executionEvidence.origin, locator: proposal.target.locator ?? null,
  operation: proposal.operation });
const mutableLedgerFieldsV2 = new Set(['state', 'dispatchCount', 'outcomeCode', 'assertionPassed']);
function immutableLedgerV2(ledger) {
  return Object.fromEntries(Object.entries(ledger).filter(([field]) => !mutableLedgerFieldsV2.has(field)));
}
function validateInputsV2(context, source) {
  const table = context.authoredInputs;
  structuralV2('runner-context', context);
  check(context.contextRevision >= 1 && context.materializationRevision >= 1, 'CONTEXT_REVISION');
  check(Date.parse(context.leaseExpiresAt) <= Date.parse(context.expiresAt), 'LEASE');
  context.approvedOrigins.forEach(canonicalOriginV2);
  check(table.sessionId === context.sessionId && table.scopeHash === context.scopeHash
    && table.sourceRevision === context.sourceRevision
    && table.configurationRevision === context.configurationRevision, 'INPUT_IDENTITY');
  check(hash(table) === context.authoredInputsHash, 'INPUT_HASH');
  uniqueV2(table.inputs, input => input.inputId, 'INPUT_IDENTITY');
  check(source.sourceRevision === context.sourceRevision
    && source.configurationRevision === context.configurationRevision, 'SOURCE_REVISION');
  for (const input of table.inputs) {
    const ref = input.provenance;
    check(input.sourceStepId === ref.stepId && context.sourceStepIds.includes(ref.stepId)
      && input.kind === ref.kind && input.intendedSlot === ref.intendedSlot, 'SOURCE_PROVENANCE');
    check((input.kind === 'destination') === (input.intendedSlot === 'navigate.destination'), 'INPUT_SLOT');
    let value;
    if (ref.referenceKind === 'sourceSpan') {
      check(ref.sourceRevision === source.sourceRevision, 'SOURCE_REVISION');
      const step = source.steps[ref.stepId];
      check(step && typeof step.text === 'string', 'SOURCE_PROVENANCE');
      check(step.text.isWellFormed(), 'INVALID_UNICODE');
      const { startUtf16: start, endUtf16: end } = ref;
      const boundary = offset => offset === 0 || offset === step.text.length
        || !(step.text.charCodeAt(offset - 1) >= 0xd800 && step.text.charCodeAt(offset - 1) <= 0xdbff
          && step.text.charCodeAt(offset) >= 0xdc00 && step.text.charCodeAt(offset) <= 0xdfff);
      check(start >= 0 && start < end && end <= step.text.length && boundary(start) && boundary(end), 'SOURCE_SPAN');
      check(step.approvedNonsecretRegions.some(region => region.startUtf16 <= start && region.endUtf16 >= end), 'SOURCE_CLASSIFICATION');
      value = step.text.slice(start, end);
    } else {
      check(ref.configurationRevision === source.configurationRevision, 'SOURCE_REVISION');
      const configured = source.configuration[ref.referenceId];
      check(configured && configured.approvedNonsecret && configured.scopeHash === context.scopeHash
        && configured.stepId === ref.stepId && configured.kind === ref.kind
        && configured.intendedSlot === ref.intendedSlot, 'SOURCE_CLASSIFICATION');
      value = configured.value;
    }
    check(typeof value === 'string' && value.isWellFormed(), 'INVALID_UNICODE');
    check(input.value === value && Buffer.byteLength(value, 'utf8') <= 4096, 'SOURCE_PROVENANCE');
    if (input.kind === 'destination') {
      let url;
      try { url = new URL(value); } catch { fail('ORIGIN'); }
      check(!url.username && !url.password && context.approvedOrigins.includes(url.origin), 'ORIGIN');
    }
  }
}
function validateMaterializationsV2(contexts, source) {
  check(contexts.length > 0, 'MATERIALIZATION');
  const first = contexts[0];
  const stableFields = [...identityFieldsV2, 'expiresAt', 'approvedOrigins', 'sourceStepIds',
    'authoredInputs', 'authoredInputsHash', 'limits'];
  const frozen = context => Object.fromEntries(stableFields.map(field => [field, context[field]]));
  for (let index = 0; index < contexts.length; index++) {
    const context = contexts[index];
    validateInputsV2(context, source);
    sameV2(frozen(context), frozen(first), 'IMMUTABLE_CONTEXT');
    check(context.allocations.length <= context.limits.maxRuntimeValues
      && context.producers.length <= context.limits.maxRuntimeValues, 'BUDGET');
    uniqueV2(context.allocations, item => item.bindingId, 'BINDING_ID');
    uniqueV2(context.allocations, item => item.needId, 'BINDING_ID');
    uniqueV2(context.producers, item => item.bindingId, 'BINDING_ID');
    uniqueV2(context.consumerEdges, item => `${item.consumerAdmissionId}:${item.argumentSlot}`, 'BINDING_EDGE');
    for (const allocation of context.allocations) {
      const producerStep = context.sourceStepIds.indexOf(allocation.producerStepId);
      check(producerStep >= 0 && allocation.consumers.every(consumer =>
        context.sourceStepIds.indexOf(consumer.stepId) >= producerStep), 'BINDING_ORDER');
    }
    for (const producer of context.producers) {
      const allocation = context.allocations.find(item => item.bindingId === producer.bindingId);
      check(allocation && allocation.producerStepId === producer.coordinate.stepId, 'BINDING_PRODUCER');
      canonicalOriginV2(producer.origin);
      check(context.approvedOrigins.includes(producer.origin), 'ORIGIN');
      sameV2(producer.availability, { bindingId: producer.bindingId,
        producerAdmissionId: producer.producerAdmissionId, contextId: context.contextId,
        workerId: context.workerId, ownerFence: context.ownerFence }, 'AVAILABILITY');
    }
    for (const edge of context.consumerEdges) {
      const producer = context.producers.find(item => item.bindingId === edge.bindingId);
      const allocation = context.allocations.find(item => item.bindingId === edge.bindingId);
      check(producer && edge.producerAdmissionId === producer.producerAdmissionId
        && allocation.consumers.some(item => item.stepId === edge.coordinate.stepId
          && item.argumentSlot === edge.argumentSlot), 'BINDING_EDGE');
      const producerStep = context.sourceStepIds.indexOf(producer.coordinate.stepId);
      const consumerStep = context.sourceStepIds.indexOf(edge.coordinate.stepId);
      check(consumerStep > producerStep || (consumerStep === producerStep
        && edge.coordinate.ordinal > producer.coordinate.ordinal), 'BINDING_ORDER');
      check(edge.destinationOrigin === producer.origin, 'ORIGIN');
    }
    if (index > 0) {
      const previous = contexts[index - 1];
      check(context.materializationRevision > previous.materializationRevision, 'MATERIALIZATION');
      for (const field of ['allocations', 'producers', 'consumerEdges']) {
        check(previous[field].every(item => context[field].some(next => canonical(next) === canonical(item))), 'CUMULATIVE_BINDINGS');
      }
    }
  }
}
function validatePlanV2(plan) {
  structuralV2('learned-plan', plan);
  const blank = plan.initialContext.kind === 'initialBlank';
  if (!blank) canonicalOriginV2(plan.initialContext.origin);
  const counts = new Map();
  let priorStep = -1;
  uniqueV2(plan.actions, action => action.admissionId, 'ADMISSION_IDENTITY');
  for (let index = 0; index < plan.actions.length; index++) {
    const action = plan.actions[index];
    if (action.origin === null) check(blank && index === 0
      && action.coordinate.stepId === plan.sourceSteps[0]
      && action.coordinate.ordinal === 0 && action.operation.kind === 'navigate'
      && action.locator === null, 'BOOTSTRAP');
    else canonicalOriginV2(action.origin);
    if (index === 0) check(blank ? action.origin === null : action.origin === plan.initialContext.origin, 'BOOTSTRAP');
    const stepIndex = plan.sourceSteps.indexOf(action.coordinate.stepId);
    check(stepIndex >= 0 && stepIndex >= priorStep
      && action.coordinate.ordinal === (counts.get(action.coordinate.stepId) || 0), 'ACTION_ORDER');
    priorStep = stepIndex;
    counts.set(action.coordinate.stepId, action.coordinate.ordinal + 1);
    const page = action.operation.kind === 'navigate' || (action.operation.kind === 'assert'
      && ['url', 'title'].includes(action.operation.predicate));
    check(page === (action.locator === null), 'TARGET_MISMATCH');
    check(action.operationHash === hash(operationIdentity(action)), 'OPERATION_HASH');
  }
  check(plan.sourceSteps.every(step => counts.has(step)), 'INCOMPLETE_PLAN');
  uniqueV2(plan.bindings, binding => binding.bindingId, 'BINDING_ID');
  const exercisedEdges = new Set();
  for (const binding of plan.bindings) {
    const producerIndex = plan.actions.findIndex(action => action.admissionId === binding.provenance.producerAdmissionId);
    const producer = plan.actions[producerIndex];
    check(producer && producer.operation.kind === 'read' && producer.operation.bindingId === binding.bindingId
      && key(producer.coordinate) === key(binding.producer)
      && binding.provenance.sourceIntentStepId === producer.coordinate.stepId
      && producer.origin === binding.sourceOrigin, 'BINDING_PRODUCER');
    sameV2(binding.recipe, producer.operation.recipe, 'BINDING_PRODUCER');
    for (const edge of binding.consumers) {
      const consumerIndex = plan.actions.findIndex(action => action.admissionId === edge.consumerAdmissionId);
      check(consumerIndex > producerIndex, 'BINDING_ORDER');
      const consumer = plan.actions[consumerIndex];
      const value = consumer.operation.value || consumer.operation.expected;
      const slot = consumer.operation.kind === 'assert' ? 'assert.expected' : `${consumer.operation.kind}.value`;
      check(edge.bindingId === binding.bindingId && edge.producerAdmissionId === producer.admissionId
        && value?.kind === 'binding' && value.bindingId === binding.bindingId
        && key(edge.coordinate) === key(consumer.coordinate) && edge.argumentSlot === slot, 'BINDING_EDGE');
      check(edge.destinationOrigin === consumer.origin && consumer.origin === producer.origin, 'ORIGIN');
      const id = `${consumer.admissionId}:${slot}`;
      check(!exercisedEdges.has(id), 'BINDING_EDGE');
      exercisedEdges.add(id);
    }
  }
  for (const action of plan.actions) {
    if (action.operation.kind === 'read') check(plan.bindings.some(binding => binding.bindingId === action.operation.bindingId
      && binding.provenance.producerAdmissionId === action.admissionId), 'BINDING_PRODUCER');
    const value = action.operation.value || action.operation.expected;
    if (value?.kind === 'binding') check(exercisedEdges.has(`${action.admissionId}:${action.operation.kind === 'assert'
      ? 'assert.expected' : action.operation.kind + '.value'}`), 'BINDING_EDGE');
  }
}
function validateFlowV2(flow) {
  const { session, contexts, source, proposals, observations, histories, preparations, dispatches, outcomes, plan } = flow;
  structuralV2('session', session);
  validateMaterializationsV2(contexts, source);
  validatePlanV2(plan);
  check(flow.learnedPlanHash === hash(plan), 'PLAN_HASH');
  const context = contexts[0], finalContext = contexts.at(-1);
  check(hash(session.scope) === session.scopeHash && session.scopeHash === context.scopeHash
    && session.runAuthorization.scopeHash === session.scopeHash
    && session.runAuthorization.principalId === session.scope.principalId, 'SCOPE_HASH');
  check(session.sessionId === context.sessionId && session.owner.workerId === context.workerId
    && session.owner.fence === context.ownerFence && session.scope.sourceRevision === context.sourceRevision
    && session.scope.configurationRevision === context.configurationRevision, 'ENVELOPE_IDENTITY');
  sameV2(session.versions, context.versions, 'VERSION');
  sameV2(session.scope.approvedOrigins, context.approvedOrigins, 'ORIGIN');
  sameV2(session.sourceSteps.map(step => step.stepId), context.sourceStepIds, 'ACTION_ORDER');
  sameV2(plan.versions, context.versions, 'VERSION');
  check(plan.scopeHash === context.scopeHash && plan.sourceRevision === context.sourceRevision
    && plan.configurationRevision === context.configurationRevision
    && plan.authoredInputsHash === context.authoredInputsHash, 'INPUT_IDENTITY');
  sameV2(plan.sourceSteps, context.sourceStepIds, 'ACTION_ORDER');
  const count = proposals.length;
  check([histories, preparations, dispatches, outcomes, plan.actions, flow.contextAtAction].every(items => items.length === count), 'ACTION_COUNT');
  check(count <= context.limits.maxActions && observations.length <= context.limits.maxObservations
    && context.sourceStepIds.length <= context.limits.maxSourceSteps, 'BUDGET');
  const observationsByHash = new Map();
  for (const observation of observations) {
    structuralV2('observation', observation);
    validateObservationRelations(observation);
    check(Buffer.byteLength(canonical(observation), 'utf8') <= context.limits.maxObservationBytes
      && observation.nodes.length <= context.limits.maxObservationNodes
      && observation.nodes.every(node => node.depth <= context.limits.maxObservationDepth), 'BUDGET');
    check(observation.sessionId === context.sessionId && observation.scopeHash === context.scopeHash
      && context.approvedOrigins.includes(observation.origin), 'EVIDENCE_IDENTITY');
    check(observation.nodes.every(node => node.documentId === observation.documentId
      && node.generation === observation.generation), 'EVIDENCE_IDENTITY');
    observationsByHash.set(hash(observation), observation);
  }
  for (let index = 0; index < count; index++) {
    const proposal = proposals[index], evidence = proposal.executionEvidence;
    const materialization = contexts[flow.contextAtAction[index]];
    check(materialization && Number.isInteger(flow.contextAtAction[index])
      && (index === 0 || flow.contextAtAction[index] >= flow.contextAtAction[index - 1]), 'MATERIALIZATION');
    structuralV2('action', proposal);
    check(session.scope.capabilities.includes(proposal.operation.kind), 'CAPABILITY');
    check(proposal.coordinate.ordinal < context.limits.maxStatementsPerStep, 'BUDGET');
    check(proposal.sessionId === context.sessionId && proposal.scopeHash === context.scopeHash
      && evidence.sessionId === context.sessionId && evidence.contextId === context.contextId
      && proposal.contextRevision === context.contextRevision, 'EVIDENCE_IDENTITY');
    check(proposal.authoredInputsHash === context.authoredInputsHash, 'INPUT_HASH');
    check(proposal.evidenceHash === hash(evidence), 'EVIDENCE_HASH');
    check(proposal.target.documentId === evidence.documentId && proposal.target.generation === evidence.generation
      && proposal.generation === evidence.generation, 'EVIDENCE_IDENTITY');
    if (evidence.kind === 'initialBlank') {
      check(index === 0 && plan.initialContext.kind === 'initialBlank' && proposal.operation.kind === 'navigate'
        && proposal.target.kind === 'page' && proposal.coordinate.stepId === context.sourceStepIds[0]
        && proposal.coordinate.ordinal === 0, 'BOOTSTRAP');
    } else {
      canonicalOriginV2(evidence.origin);
      const observation = observationsByHash.get(evidence.observationHash);
      check(observation && observation.origin === evidence.origin && observation.documentId === evidence.documentId
        && observation.generation === evidence.generation, 'OBSERVATION_HASH');
      if (proposal.target.kind !== 'page') {
        const node = observation.nodes.find(item => item.nodeId === proposal.target.nodeId);
        check(node && node.visible && node.locatorHints.some(locator => canonical(locator) === canonical(proposal.target.locator)), 'TARGET_MISMATCH');
        if (proposal.operation.kind === 'read') {
          const recipe = proposal.operation.recipe;
          check(recipe.classification === node.classification && recipe.policyRuleId === node.policyRuleId
            && !['hidden', 'password'].includes(node.controlType)
            && (recipe.kind !== 'controlValue' || recipe.controlType === node.controlType), 'SENSITIVE_SOURCE');
        }
      }
    }
    if (index > 0) {
      const previous = proposals[index - 1];
      check(proposal.generation >= previous.generation, 'STALE_GENERATION');
      if (!['read', 'assert'].includes(previous.operation.kind)
        || evidence.documentId !== previous.executionEvidence.documentId) check(proposal.generation > previous.generation, 'STALE_GENERATION');
    }
    const action = plan.actions[index];
    sameV2(operationIdentityV2(proposal), operationIdentity(action), 'OPERATION_IDENTITY');
    const inputId = proposal.operation.destinationInputId || ((proposal.operation.value || proposal.operation.expected)?.kind === 'authoredLiteral'
      ? (proposal.operation.value || proposal.operation.expected).sourceInputId : null);
    if (inputId) {
      const input = context.authoredInputs.inputs.find(item => item.inputId === inputId);
      const slot = proposal.operation.kind === 'navigate' ? 'navigate.destination'
        : proposal.operation.kind === 'assert' ? 'assert.expected' : `${proposal.operation.kind}.value`;
      check(input && input.sourceStepId === proposal.coordinate.stepId && input.intendedSlot === slot, 'INPUT_SLOT');
    }
    const history = histories[index];
    for (const ledger of [history.admitted, history.dispatching, history.outcome]) structuralV2('ledger', ledger);
    const admitted = history.admitted;
    check(admitted.state === 'ADMITTED' && admitted.dispatchCount === 0 && admitted.outcomeCode === 'PENDING'
      && admitted.assertionPassed === null && history.dispatching.state === 'DISPATCHING'
      && history.dispatching.dispatchCount === 1 && history.dispatching.outcomeCode === 'PENDING'
      && history.dispatching.assertionPassed === null, 'LEDGER_STATE');
    sameV2(immutableLedgerV2(admitted), immutableLedgerV2(history.dispatching), 'IMMUTABLE_ADMISSION');
    sameV2(immutableLedgerV2(admitted), immutableLedgerV2(history.outcome), 'IMMUTABLE_ADMISSION');
    check(history.outcome.state === 'SUCCEEDED' && history.outcome.dispatchCount === 1 && history.outcome.outcomeCode === 'OK'
      && history.outcome.assertionPassed === (proposal.operation.kind === 'assert' ? true : null), 'LEDGER_STATE');
    check(admitted.sessionId === context.sessionId && admitted.scopeHash === context.scopeHash
      && admitted.ownerFence === context.ownerFence && admitted.contextRevision === context.contextRevision
      && admitted.generation === proposal.generation && admitted.documentId === evidence.documentId
      && admitted.admission.admissionId === action.admissionId, 'ADMISSION_IDENTITY');
    sameV2(admitted.coordinate, proposal.coordinate, 'ADMISSION_IDENTITY');
    sameV2(admitted.executionEvidence, evidence, 'EVIDENCE_IDENTITY');
    check(admitted.authoredInputsHash === context.authoredInputsHash, 'INPUT_HASH');
    check(admitted.evidenceHash === proposal.evidenceHash && admitted.requestDigest === hash(proposal)
      && admitted.operationHash === hash(operationIdentityV2(proposal)), 'OPERATION_HASH');
    const preparation = preparations[index], dispatch = dispatches[index], outcome = outcomes[index];
    structuralV2('bridge#/definitions/preparation', preparation);
    structuralV2('bridge#/definitions/dispatch', dispatch);
    structuralV2('bridge#/definitions/outcome', outcome);
    for (const envelope of [preparation, dispatch, outcome]) sameV2(identityV2(envelope), identityV2(context), 'ENVELOPE_IDENTITY');
    check(preparation.preparationId === admitted.preparationId && dispatch.preparationId === admitted.preparationId
      && preparation.requestDigest === admitted.requestDigest && preparation.evidenceHash === admitted.evidenceHash
      && preparation.authoredInputsHash === context.authoredInputsHash
      && Date.parse(preparation.expiresAt) <= Date.parse(context.leaseExpiresAt), 'PREPARATION');
    sameV2(dispatch.proposal, proposal, 'IMMUTABLE_ADMISSION');
    sameV2(dispatch.ledger, history.dispatching, 'IMMUTABLE_ADMISSION');
    sameV2(outcome.ledger, history.outcome, 'IMMUTABLE_ADMISSION');
    const edges = materialization.consumerEdges.filter(edge => edge.consumerAdmissionId === admitted.admission.admissionId);
    sameV2(dispatch.consumerEdges, edges, 'BINDING_EDGE');
    if (proposal.operation.kind === 'read') {
      const producer = finalContext.producers.find(item => item.bindingId === proposal.operation.bindingId);
      check(producer && producer.producerAdmissionId === admitted.admission.admissionId
        && key(producer.coordinate) === key(proposal.coordinate) && producer.origin === evidence.origin, 'BINDING_PRODUCER');
      sameV2(producer.recipe, proposal.operation.recipe, 'BINDING_PRODUCER');
      sameV2(outcome.availability, producer.availability, 'AVAILABILITY');
      check(!materialization.producers.some(item => item.bindingId === producer.bindingId), 'BINDING_ORDER');
    } else check(outcome.availability === null, 'AVAILABILITY');
    const value = proposal.operation.value || proposal.operation.expected;
    if (value?.kind === 'binding') {
      check(edges.length === 1 && edges[0].bindingId === value.bindingId, 'BINDING_EDGE');
      const producer = materialization.producers.find(item => item.bindingId === value.bindingId);
      check(producer && histories.slice(0, index).some(item => item.outcome.admission.admissionId === producer.producerAdmissionId
        && item.outcome.state === 'SUCCEEDED'), 'BINDING_ORDER');
    } else check(edges.length === 0, 'BINDING_EDGE');
  }
  uniqueV2(histories, item => item.admitted.admission.admissionId, 'ADMISSION_IDENTITY');
  check(plan.bindings.length === finalContext.producers.length, 'BINDING_PRODUCER');
  for (const binding of plan.bindings) {
    const producer = finalContext.producers.find(item => item.bindingId === binding.bindingId);
    check(producer && binding.provenance.sessionId === context.sessionId, 'BINDING_PRODUCER');
    sameV2(binding.consumers, finalContext.consumerEdges.filter(edge => edge.bindingId === binding.bindingId), 'BINDING_EDGE');
    const allocation = finalContext.allocations.find(item => item.bindingId === binding.bindingId);
    check(allocation.consumers.every(expected => binding.consumers.some(edge => edge.coordinate.stepId === expected.stepId
      && edge.argumentSlot === expected.argumentSlot)), 'INCOMPLETE_BINDING');
  }
  check(finalContext.allocations.length === plan.bindings.length, 'INCOMPLETE_BINDING');
}
const terminalStatesV2 = new Set(['SUCCEEDED', 'PUBLICATION_CONFLICT', 'FAILED', 'UNKNOWN_OUTCOME', 'CANCELLED', 'EXPIRED']);
function validateAssignmentReceiptV2(receipt, at) {
  structuralV2('assignment-receipt', receipt);
  if (receipt.ownerFence !== null) {
    check(receipt.ownerFence === receipt.assignment.expectedFence + 1, 'ASSIGNMENT_FENCE');
    check(Date.parse(receipt.leaseExpiresAt) <= Date.parse(receipt.assignment.expiresAt), 'LEASE');
  }
  if (receipt.status === 'OWNED' && at !== undefined) check(Date.parse(at) < Date.parse(receipt.leaseExpiresAt), 'LEASE');
}
function validateAssignmentGrantV2(assignment, request, session, renewal, allowTerminal = false) {
  structuralV2('assignment', assignment);
  structuralV2('commands#/definitions/claim', request);
  structuralV2('session', session);
  check(request.sessionId === assignment.sessionId && request.workerId === assignment.workerId
    && request.expectedFence === assignment.expectedFence + (renewal ? 1 : 0), 'ASSIGNMENT_IDENTITY');
  sameV2(request.versions, assignment.versions, 'VERSION');
  sameV2(session.versions, assignment.versions, 'VERSION');
  check(session.sessionId === assignment.sessionId && session.scopeHash === assignment.scopeHash
    && session.scope.sourceRevision === assignment.sourceRevision
    && session.scope.configurationRevision === assignment.configurationRevision
    && session.expiresAt === assignment.expiresAt, 'ASSIGNMENT_IDENTITY');
  check(hash(session.scope) === session.scopeHash && session.runAuthorization.scopeHash === session.scopeHash
    && session.runAuthorization.principalId === session.scope.principalId, 'SCOPE_HASH');
  if (!allowTerminal) check(!terminalStatesV2.has(session.state), 'TERMINAL_GRANT');
  if (!terminalStatesV2.has(session.state)) {
    check(session.owner.workerId === assignment.workerId
      && session.owner.fence === assignment.expectedFence + 1, 'ASSIGNMENT_FENCE');
    check(Date.parse(session.owner.leaseExpiresAt) <= Date.parse(assignment.expiresAt), 'LEASE');
  }
}
function validateAssignmentTraceV2(trace) {
  const { assignment } = trace;
  structuralV2('assignment', assignment);
  const hardDeadline = Date.parse(assignment.expiresAt);
  check(Number.isFinite(Date.parse(trace.assignedAt)) && Date.parse(trace.assignedAt) < hardDeadline, 'LEASE');
  const keys = new Set();
  let lease = null, stopped = false, claimCount = 0, lastNetworkEnd = Date.parse(trace.assignedAt);
  for (const event of trace.events) {
    if (['acquire', 'renew', 'terminal', 'lateGrant', 'renewalFailure'].includes(event.kind)) {
      const start = Date.parse(event.sentAt), end = Date.parse(event.receivedAt);
      check(Number.isFinite(start) && Number.isFinite(end) && end >= start && start >= lastNetworkEnd, 'RENEWAL_ORDER');
      check(typeof event.idempotencyKey === 'string' && event.idempotencyKey.length > 0
        && !keys.has(event.idempotencyKey), 'RENEWAL_KEY');
      keys.add(event.idempotencyKey);
      lastNetworkEnd = end;
      const renewal = event.kind !== 'acquire' && lease !== null;
      if (event.kind === 'renewalFailure') {
        structuralV2('commands#/definitions/claim', event.request);
        check(!stopped && lease !== null && start < Date.parse(lease), 'LEASE');
        check(event.request.sessionId === assignment.sessionId && event.request.workerId === assignment.workerId
          && event.request.expectedFence === assignment.expectedFence + 1, 'ASSIGNMENT_IDENTITY');
        sameV2(event.request.versions, assignment.versions, 'VERSION');
        check(event.applied === false, 'LEASE_REVIVAL');
        stopped = true;
      } else {
        validateAssignmentGrantV2(assignment, event.request, event.session, renewal,
          event.kind === 'terminal' || event.kind === 'lateGrant');
        if (event.kind === 'lateGrant') {
          check(stopped || (lease !== null && end >= Date.parse(lease)), 'RENEWAL_ORDER');
          check(event.applied === false, 'LEASE_REVIVAL');
          stopped = true;
        } else if (event.kind === 'terminal') {
          check(terminalStatesV2.has(event.session.state) && event.applied === false, 'TERMINAL_GRANT');
          stopped = true;
        } else {
          check(!stopped, 'LEASE_REVIVAL');
          check(end < hardDeadline && (lease === null || end < Date.parse(lease)), 'LEASE');
          check(event.kind === 'acquire' ? claimCount === 0 && lease === null : lease !== null, 'ASSIGNMENT_IDENTITY');
          check(Date.parse(event.session.owner.leaseExpiresAt) > end
            && (lease === null || Date.parse(event.session.owner.leaseExpiresAt) >= Date.parse(lease)), 'LEASE');
          check(event.session.state === event.workflowStateBefore, 'RENEWAL_WORKFLOW');
          lease = event.session.owner.leaseExpiresAt;
          claimCount++;
          validateAssignmentReceiptV2(event.receipt, event.receivedAt);
          check(event.receipt.status === 'OWNED' && event.receipt.leaseExpiresAt === lease, 'LEASE');
          sameV2(event.receipt.assignment, assignment, 'ASSIGNMENT_IDENTITY');
        }
      }
    } else if (event.kind === 'context') {
      structuralV2('runner-context', event.context);
      check(!stopped && lease !== null && Date.parse(event.at) < Date.parse(lease), 'CONTEXT_WITHOUT_OWNER');
      const context = event.context;
      check(context.sessionId === assignment.sessionId && context.workerId === assignment.workerId
        && context.scopeHash === assignment.scopeHash && context.sourceRevision === assignment.sourceRevision
        && context.configurationRevision === assignment.configurationRevision
        && context.ownerFence === assignment.expectedFence + 1 && context.expiresAt === assignment.expiresAt,
      'ASSIGNMENT_IDENTITY');
      sameV2(context.versions, assignment.versions, 'VERSION');
      check(Date.parse(context.leaseExpiresAt) <= hardDeadline && event.effectiveLeaseExpiresAt === lease, 'CONTEXT_LEASE');
    } else if (event.kind === 'stop') {
      structuralV2('assignment-stop', event.request);
      sameV2(event.request.assignment, assignment, 'ASSIGNMENT_IDENTITY');
      validateAssignmentReceiptV2(event.receipt);
      sameV2(event.receipt.assignment, assignment, 'ASSIGNMENT_IDENTITY');
      check(event.receipt.status === 'STOPPED' && event.receipt.leaseExpiresAt === lease
        && event.receipt.ownerFence === (lease === null ? null : assignment.expectedFence + 1), 'STOP_RECEIPT');
      stopped = true;
    } else fail('ASSIGNMENT_EVENT');
    if (event.kind === 'renewalFailure' || event.kind === 'terminal' || event.kind === 'lateGrant') {
      validateAssignmentReceiptV2(event.receipt);
      sameV2(event.receipt.assignment, assignment, 'ASSIGNMENT_IDENTITY');
      check(event.receipt.status === 'STOPPED' && event.receipt.leaseExpiresAt === lease
        && event.receipt.ownerFence === (lease === null ? null : assignment.expectedFence + 1), 'STOP_RECEIPT');
    }
  }
}
function observationRefreshKeyV2(request, idempotencyKey) {
  structuralV2('observation-refresh', request);
  check(typeof idempotencyKey === 'string' && idempotencyKey.length > 0 && idempotencyKey.length <= 256, 'REFRESH_KEY');
  return 'oref-' + hash({ identity: identityV2(request), idempotencyKey, requestDigest: hash(request) });
}
function validateObservationRefreshV2(flow) {
  const { request, context, before, after, callback, response, current } = flow;
  structuralV2('observation-refresh', request);
  structuralV2('runner-context', context);
  sameV2(identityV2(request), identityV2(context), 'ENVELOPE_IDENTITY');
  check(['OBSERVING', 'PROPOSING'].includes(before.state)
    && !before.ledgerStates.some(state => ['ADMITTED', 'DISPATCHING'].includes(state)), 'REFRESH_STATE');
  check(flow.intentState === 'OBSERVING' && flow.intentCommittedBeforeRpc === true, 'REFRESH_ORDER');
  check(before.generation === request.expectedGeneration, 'STALE_GENERATION');
  check(flow.workerIdle, 'REFRESH_BUSY');
  check(flow.acknowledgedLease
    && Date.parse(flow.sentAt) < Date.parse(flow.acknowledgedLease)
    && Date.parse(flow.completedAt) < Date.parse(flow.acknowledgedLease)
    && Date.parse(flow.acknowledgedLease) <= Date.parse(context.expiresAt), 'LEASE');
  check(before.observations < context.limits.maxObservations
    && flow.reservedObservationCount === before.observations + 1, 'BUDGET');
  structuralV2('bridge#/definitions/observation', callback);
  structuralV2('bridge#/definitions/observation', response);
  sameV2(identityV2(callback), identityV2(request), 'ENVELOPE_IDENTITY');
  sameV2(response, callback, 'REFRESH_RESPONSE');
  check(flow.requestDigest === hash(request)
    && flow.callbackKey === observationRefreshKeyV2(request, flow.idempotencyKey), 'REFRESH_CORRELATION');
  const observation = callback.observation, bytes = Buffer.byteLength(canonical(observation), 'utf8');
  validateObservationRelations(observation);
  check(observation.sessionId === request.sessionId && observation.scopeHash === request.scopeHash
    && observation.nodes.every(node => node.documentId === observation.documentId && node.generation === observation.generation), 'EVIDENCE_IDENTITY');
  check(context.approvedOrigins.includes(observation.origin), 'ORIGIN');
  canonicalOriginV2(observation.origin);
  check(observation.generation > request.expectedGeneration, 'STALE_GENERATION');
  check(bytes <= context.limits.maxObservationBytes
    && before.evidenceBytes + bytes <= context.limits.maxSanitizedEvidenceBytesTotal
    && observation.nodes.length <= context.limits.maxObservationNodes
    && observation.nodes.every(node => node.depth <= context.limits.maxObservationDepth), 'BUDGET');
  check(flow.callbackAcknowledgedBeforeResponse && after.state === 'PROPOSING'
    && after.generation === observation.generation && after.observationHash === hash(observation), 'REFRESH_COMMIT');
  check(after.observations === before.observations + 1 && after.evidenceBytes === before.evidenceBytes + bytes
    && flow.collectCount === 1 && flow.callbackCommitCount === 1, 'REFRESH_ACCOUNTING');
  check(after.actions === before.actions, 'REFRESH_ACTION');
  sameV2(after.ordinals, before.ordinals, 'REFRESH_ACTION');
  sameV2(after.bindingIds, before.bindingIds, 'REFRESH_BINDINGS');
  check(after.preparationIds.length === 0, 'REFRESH_PREPARATION');
  for (const duplicate of flow.duplicates) {
    check(duplicate.idempotencyKey === flow.idempotencyKey && hash(duplicate.request) === flow.requestDigest, 'IDEMPOTENCY_CONFLICT');
  }
  // A committed callback, not the returned HTTP body, is authority. Cached replies
  // cannot be presented as current after another observation/admission or local stop.
  check(!current.stopped && current.state === 'PROPOSING' && current.generation === after.generation
    && current.observationHash === after.observationHash
    && !current.ledgerStates.some(state => ['ADMITTED', 'DISPATCHING'].includes(state)), 'STALE_REFRESH');
  if (!flow.controllerReceivedResponse) sameV2(flow.recoveredObservation, callback, 'REFRESH_RESPONSE');
}
function validateApiV2(api, fixtures) {
  assert.equal(api.openapi, '3.1.0');
  assert.equal(api.jsonSchemaDialect, 'http://json-schema.org/draft-07/schema#');
  assert.equal(api.components.securitySchemes.MutualTLS.type, 'mutualTLS');
  assert.equal(api.components.securitySchemes.ServiceBearer.scheme, 'bearer');
  const pointer = (root, fragment) => fragment.replace(/^#\//, '').split('/').reduce((value, part) => {
    const next = value?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    assert.notEqual(next, undefined, `unresolved OpenAPI reference: ${fragment}`);
    return next;
  }, root);
  function resolve(reference) {
    if (reference.startsWith('#/')) return pointer(api, reference);
    const [file, fragment] = reference.split('#');
    const family=/^\.\/contracts\/(v2|v3)\/([^/]+)$/.exec(file);assert(family,'reference must stay in an explicit local contract family');
    if (file.endsWith('/fixtures.json')) {assert.equal(family[1],'v2');return pointer(fixtures, fragment);}
    if(file.endsWith('/publication-fixtures.json'))return pointer(JSON.parse(fs.readFileSync(path.join(directory,family[1],family[2]),'utf8')),fragment);
    assert(file.endsWith('.schema.json'), 'unsupported OpenAPI reference');
    const id = (family[1]==='v2'?v2Base:v3Base) + path.basename(file) + (fragment ? '#' + fragment : '');
    assert(ajv.getSchema(id), `unresolved v2 OpenAPI schema: ${id}`);
    return { $ref: id };
  }
  // Walk every reference, not only the subset reached by the happy-path example.
  function references(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') resolve(value.$ref);
    for (const child of Object.values(value)) references(child);
  }
  references(api);
  let examples = 0;
  function contentCheck(content) {
    assert(content?.['application/json'], 'all bridge bodies use JSON');
    const media = content['application/json'];
    function schemaReferences(value) {
      if (Array.isArray(value)) return value.map(schemaReferences);
      if (!value || typeof value !== 'object') return value;
      if (value.$ref) return resolve(value.$ref);
      return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, schemaReferences(child)]));
    }
    const schema = schemaReferences(media.schema);
    const validate = ajv.compile(schema);
    const values = media.example !== undefined ? [media.example] : Object.values(media.examples || {}).map(
      example => example.$ref ? resolve(example.$ref).value : example.value);
    assert(values.length > 0, 'v2 request/response example missing');
    for (const value of values) {
      canonical(value);
      assert(validate(value), `invalid v2 API example: ${JSON.stringify(validate.errors)}`);
      examples++;
    }
  }
  const actualRoutes = new Set(['assign', 'context', 'prepare', 'dispatch', 'observe', 'stop', 'claim', 'bootstrap-evidence',
    'observations', 'outcomes', 'lifecycle', 'admissions', 'advance', 'plans', 'proposals', 'dependency-admissions', 'planning-context']);
  const runnerRoutes = new Set(['assign', 'context', 'prepare', 'dispatch', 'observe', 'stop']);
  const controllerRoutes = new Set(['admissions', 'advance', 'plans', 'proposals', 'dependency-admissions', 'planning-context']);
  const seen = new Set();
  for (const [route, item] of Object.entries(api.paths)) {
    if(route.startsWith('/api/v3/studio/guided-sessions/{sessionId}/')){
      const suffix=route.split('/').at(-1);assert(['finalize','result'].includes(suffix),'unexpected public006 route');
      const operation=suffix==='finalize'?item.post:item.get;assert(operation);assert.deepEqual(operation.security,[{BffCookie:[]}]);
      assert.equal(api.components.securitySchemes.BffCookie.type,'apiKey');assert.equal(api.components.securitySchemes.BffCookie.in,'cookie');
      if(suffix==='finalize'){assert(operation.requestBody?.required);contentCheck(operation.requestBody.content);}
      assert(operation.responses['200']);for(const response of Object.values(operation.responses))if(response.content)contentCheck(response.content);
      continue;
    }
    assert(route.startsWith('/internal/v2/studio/guided-sessions/{sessionId}/'));
    const suffix = route.split('/').at(-1);
    assert(actualRoutes.has(suffix), `unagreed endpoint ${route}`);
    seen.add(suffix);
    const operation = item.post;
    assert(operation && Object.keys(item).every(name => ['post', 'parameters'].includes(name)));
    const runner = runnerRoutes.has(suffix);
    assert.equal(operation['x-receiver'], runner ? 'runner' : 'backend');
    assert.equal(operation['x-service-audience'], runner ? 'studio-guided-runner' : 'studio-guided-controller');
    assert.equal(operation['x-service-role'], runner || controllerRoutes.has(suffix) ? 'backend-controller' : 'owning-worker');
    assert.equal(operation['x-automatic-post-retry'], false);
    assert(operation.security.some(requirement => Object.hasOwn(requirement, 'ServiceBearer')
      && Object.hasOwn(requirement, 'MutualTLS')), 'JWT and mTLS must be conjunctive');
    const parameters = [...(item.parameters || []), ...(operation.parameters || [])].map(parameter =>
      parameter.$ref ? resolve(parameter.$ref) : parameter);
    const preContext = ['assign', 'claim'].includes(suffix);
    const mixed = ['stop', 'lifecycle'].includes(suffix);
    for (const name of ['sessionId', 'Idempotency-Key', ...(!preContext && !mixed ? ['X-Owner-Fence'] : [])]) {
      assert(parameters.some(parameter => parameter.name === name && parameter.required), `missing required ${name}`);
    }
    if (preContext) assert(!parameters.some(parameter => parameter.name === 'X-Owner-Fence'), 'pre-context acquisition has no owner fence header');
    if (mixed) {
      assert(parameters.some(parameter => parameter.name === 'X-Owner-Fence' && parameter.required === false));
      assert.equal(operation['x-owner-fence-required-for'], 'context-variant-only');
    }
    assert(operation.requestBody?.required);
    contentCheck(operation.requestBody.content);
    const success = runner || suffix === 'planning-context' ? '200' : '202';
    assert(operation.responses[success], `wrong success status for ${route}`);
    for (let response of Object.values(operation.responses)) {
      if (response.$ref) response = resolve(response.$ref);
      contentCheck(response.content);
    }
  }
  assert.deepEqual(seen, actualRoutes, 'v2 transport route coverage changed');
  return examples;
}
function runV2() {
  const timestampPattern = JSON.parse(fs.readFileSync(path.join(v2Directory, 'wire-parity.fixtures.json'), 'utf8')).timestampPattern;
  const schemas = fs.readdirSync(v2Directory).filter(name => name.endsWith('.schema.json'));
  for (const name of schemas) {
    const schema = JSON.parse(fs.readFileSync(path.join(v2Directory, name), 'utf8'));
    function versionedReferences(value) {
      if (!value || typeof value !== 'object') return;
      if (value.format === 'date-time') assert.equal(value.pattern, /^(replay-|publication\.|revision\.)/.test(name) ? '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' : timestampPattern, 'each contract family enforces its frozen UTC profile');
      if (typeof value.$ref === 'string') assert(value.$ref.startsWith('#/') || value.$ref.startsWith(v2Base),
        `v2 schema must not silently inherit a historical contract: ${value.$ref}`);
      for (const child of Object.values(value)) versionedReferences(child);
    }
    versionedReferences(schema);
    assert(ajv.getSchema(v2Base + name));
    // Definition-only documents must not appear compiled while their actual DTOs remain uncompiled.
    for (const definition of Object.keys(schema.definitions || {})) assert(ajv.getSchema(`${v2Base}${name}#/definitions/${definition}`));
  }
  const fixtures = JSON.parse(fs.readFileSync(path.join(v2Directory, 'fixtures.json'), 'utf8'));
  let passed = 0;
  for (const fixture of fixtures.cases) {
    assert(fixtures.documents[fixture.document], `missing fixture document ${fixture.document}`);
    const sample = structuredClone(fixtures.documents[fixture.document]);
    for (const patch of fixture.patches || []) applyPatch(sample, patch);
    let failure;
    try {
      // Private fixture sources contain maps keyed by opaque step/reference IDs. They
      // are not canonical wire documents; check Unicode without hashing those maps.
      function wellFormed(value) {
        if (typeof value === 'string') check(value.isWellFormed(), 'INVALID_UNICODE');
        if (value && typeof value === 'object') for (const child of Object.values(value)) wellFormed(child);
      }
      wellFormed(sample);
      if (fixture.validator === 'flow') validateFlowV2(sample);
      else if (fixture.validator === 'plan') validatePlanV2(sample);
      else if (fixture.validator === 'source') validateInputsV2(sample.context, sample.source);
      else if (fixture.validator === 'materializations') validateMaterializationsV2(sample.contexts, sample.source);
      else if (fixture.validator === 'assignment-receipt-context') validateAssignmentReceiptV2(sample.receipt, sample.at);
      else if (fixture.validator === 'assignment-trace') validateAssignmentTraceV2(sample);
      else if (fixture.validator === 'observation-refresh-flow') validateObservationRefreshV2(sample);
      else structuralV2(fixture.validator, sample);
    } catch (error) { failure = error; }
    assert.equal(failure?.code || (failure ? 'INTERNAL_ERROR' : 'VALID'), fixture.expected,
      `v2 ${fixture.name}: ${failure?.message || 'accepted'}`);
    passed++;
  }
  const wireParity = JSON.parse(fs.readFileSync(path.join(v2Directory, 'wire-parity.fixtures.json'), 'utf8'));
  for (const vector of wireParity.dateTimes) {
    const assignment = structuredClone(fixtures.documents.assignment);
    assignment.expiresAt = vector.value;
    let accepted = true;
    try { structuralV2('assignment', assignment); } catch { accepted = false; }
    assert.equal(accepted, vector.accepted, `v2 UTC instant profile: ${JSON.stringify(vector.value)}`);
    passed++;
  }
  const historical = JSON.parse(fs.readFileSync(path.join(directory, 'fixtures.json'), 'utf8'));
  assert.deepEqual(fixtures.canonicalVector, historical.canonicalVector);
  assert.equal(canonical({ b: 2, a: 'é' }), fixtures.canonicalVector.json);
  assert.equal(hash({ b: 2, a: 'é' }), fixtures.canonicalVector.sha256);
  for (const vector of fixtures.hashVectors) {
    assert.equal(canonical(vector.value), vector.canonical, vector.name);
    assert.equal(hash(vector.value), vector.sha256, vector.name);
  }
  const refreshVector = fixtures.observationRefreshCorrelationVector;
  assert.equal(hash(refreshVector.request), refreshVector.requestDigest);
  assert.equal(canonical({ identity: identityV2(refreshVector.request), idempotencyKey: refreshVector.idempotencyKey,
    requestDigest: refreshVector.requestDigest }), refreshVector.canonical);
  assert.equal(observationRefreshKeyV2(refreshVector.request, refreshVector.idempotencyKey), refreshVector.callbackKey);
  const api = YAML.parse(fs.readFileSync(path.join(directory, '../openapi-v2.yaml'), 'utf8'));
  const examples = validateApiV2(api, fixtures);
  console.log(`PASS v2: ${passed} fixture cases; ${examples} OpenAPI request/response examples; ${schemas.length} schemas and all definitions compiled; ${fixtures.hashVectors.length} canonical vectors verified. No browser or publication proof claimed.`);
  return { passed, examples, schemas: schemas.length };
}
function validateOrdinaryObservedApi() {
  const api=YAML.parse(fs.readFileSync(path.join(directory,'../../studio/openapi.yaml'),'utf8'));
  const fixture=JSON.parse(fs.readFileSync(path.join(directory,'v3','publication-fixtures.json'),'utf8'));
  let examples=0;
  function resolve(ref){
    const match=/^\.\.\/studio-observed-authoring\/contracts\/v3\/([a-z-]+\.(?:schema|fixtures)\.json|publication-fixtures\.json)(?:#(.*))?$/.exec(ref);assert(match,'observed route must use explicit closed local v3 schema/example refs');
    if(match[1]==='publication-fixtures.json'){let value=fixture;for(const key of (match[2]||'').replace(/^\//,'').split('/'))value=value[key];assert(value);return value;}
    const id=v3Base+match[1]+(match[2]?'#'+match[2]:'');assert(ajv.getSchema(id));return {$ref:id};
  }
  function check(content){const media=content?.['application/json'];assert(media);const schema=media.schema.$ref?resolve(media.schema.$ref):media.schema;const validate=ajv.compile(schema);const values=media.example!==undefined?[media.example]:Object.values(media.examples||{}).map(x=>x.$ref?resolve(x.$ref).value:x.value);assert(values.length);for(const value of values){assert(validate(value),JSON.stringify(validate.errors));examples++;}}
  for(const route of ['/v2/validate-observed','/v2/runs','/internal/studio/executions/{id}/observed-admission']){
    const op=api.paths[route]?.post;assert(op);assert.deepEqual(op.security,[{serviceIdentity:[]}]);assert.equal(op['x-internal'],true);check(op.requestBody.content);assert(op.requestBody.required);
    const status=route==='/v2/runs'?'202':'200';assert(op.responses[status]);if(op.responses[status].content)check(op.responses[status].content);
  }
  assert.equal(api.components.securitySchemes.serviceIdentity.type,'http');assert.equal(api.components.securitySchemes.serviceIdentity.scheme,'bearer');
  return examples;
}
function runObservedPublication() {
  const fixture = JSON.parse(fs.readFileSync(path.join(v2Directory,'publication-fixtures.json'),'utf8'));
  const types={basis:'replay-validation.schema.json#/definitions/ValidationBasis',artifact:'replay-artifact.schema.json',build:'replay-profile.schema.json#/definitions/BuildIdentity',trustedPolicy:'replay-ipc.schema.json#/definitions/TrustedPolicy',job:'replay-job.schema.json',admissionRequest:'replay-job.schema.json#/definitions/AdmissionRequest',admissionReceipt:'replay-job.schema.json#/definitions/AdmissionReceipt',launch:'replay-ipc.schema.json#/definitions/Launch2',execute:'replay-ipc.schema.json#/definitions/Execute2',validationRequest:'replay-validation.schema.json'};
  let checked=0;
  for(const [key,type]of Object.entries(types)){
    const validate=ajv.getSchema(v2Base+type);assert(validate);assert(validate(fixture[key]),key+': '+JSON.stringify(validate.errors));checked++;
    const extra={...fixture[key],unexpectedPrivateValue:'CANARY'};assert(!validate(extra),'closed '+key);checked++;
  }
  const vectors=JSON.parse(fs.readFileSync(path.join(v2Directory,'publication-canonical-vectors.json'),'utf8'));
  for(const v of vectors.positive){assert.equal(Buffer.from(canonical(v.input)).toString('hex'),v.canonicalUtf8Hex);assert.equal(hash(v.input),v.sha256);checked++;}
  const profile=fixture.artifact.profile;assert.equal(profile.artifact,2);assert.equal(profile.referencePolicy,3);assert.equal(profile.protocol,2);
  assert.equal(hash(fixture.basis),fixture.validationRequest.basisHash);assert.equal(hash(fixture.basis.translationPlan),fixture.basis.translationHash);
  assert.equal(hash(fixture.artifact),fixture.job.binding.artifactHash);assert.equal(hash(fixture.job.configuration),fixture.job.binding.configurationHash);assert.equal(hash(fixture.trustedPolicy),fixture.job.binding.currentPolicyHash);
  assert.equal(fixture.basis.learningProvenance.guidedPromptHash,null);assert(fixture.basis.learningProvenance.outputContractHash);
  const choice=fixture.observedChoice;
  assert(choice,'independently authored observed-choice baseline is required');
  const validateBasis=ajv.getSchema(v2Base+'replay-validation.schema.json#/definitions/ValidationBasis');
  const validateArtifact=ajv.getSchema(v2Base+'replay-artifact.schema.json');
  assert(validateBasis(choice.basis),'choice basis: '+JSON.stringify(validateBasis.errors));
  assert(validateArtifact(choice.artifact),'choice artifact: '+JSON.stringify(validateArtifact.errors));checked+=2;
  assert.equal(hash(choice.artifact),choice.hashes.artifactHash);
  const prep=choice.basis.preparations.find(p=>p.observedChoice),w=prep.observedChoice;
  assert.equal(w.receipt.contextIdentityHash,hash(w.context));assert.equal(w.receipt.meaningsHash,hash(w.meanings));assert.equal(w.receipt.questionCaptureHash,hash(w.context.questionCapture));
  assert.equal(w.context.questionCapture.modelQuestionHash,hash(w.attempt.modelQuestion));assert.equal(w.questionPlan.planHash,hash(w.questionPlan.plan));
  assert.notEqual(w.receipt.answer.nodeId,prep.proposal.target.nodeId,'refresh node is independently proved');
  assert(fixture.basis.preparations.every(p=>!Object.hasOwn(p,'observedChoice')),'zero-choice optional evidence is omitted');
  const singleton=structuredClone(choice.basis),single=singleton.preparations.find(p=>p.observedChoice).observedChoice;
  single.meanings.splice(0,1);single.context.question.choices.splice(0,1);single.attempt.modelQuestion.choices.splice(0,1);
  single.context.questionCapture.modelQuestionHash=hash(single.attempt.modelQuestion);single.receipt.contextIdentityHash=hash(single.context);single.receipt.meaningsHash=hash(single.meanings);single.receipt.questionCaptureHash=hash(single.context.questionCapture);
  assert(!validateBasis(singleton),'coherently resealed one-alternative witness must refuse');checked++;
  const nullProof=structuredClone(choice.basis);nullProof.preparations.find(p=>p.observedChoice).observedChoice=null;assert(!validateBasis(nullProof),'optional proof cannot be explicit null');checked++;
  const ordinaryExamples=validateOrdinaryObservedApi();assert(ordinaryExamples>=5);
  const publicFixtures=JSON.parse(fs.readFileSync(path.join(directory,'v3','publication-fixtures.json'),'utf8'));for(const item of publicFixtures.positive){const validate=ajv.getSchema(v3Base+item.schema.split('/').at(-1)+'.schema.json');assert(validate&&validate(item.value),item.name+': '+JSON.stringify(validate?.errors));checked++;}
  console.log(`PASS OBS-006: ${checked} positive/closed-schema/canonical fixture checks; independent semantic and browser tests are separate.`);
}

function runV3() {
  const folder = path.join(directory, 'v3');
  const schemas = fs.readdirSync(folder).filter(name => name.endsWith('.schema.json'));
  let checked = 0;
  for (const file of schemas) {
    const schema = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
    function local(value) {
      if (!value || typeof value !== 'object') return;
      if (value.$ref) assert(value.$ref.startsWith('#/') || value.$ref.startsWith(v3Base), 'v3 cannot inherit historical schemas');
      for (const child of Object.values(value)) local(child);
    }
    local(schema);
    assert(ajv.getSchema(v3Base + file));
    for (const def of Object.keys(schema.definitions || {})) assert(ajv.getSchema(v3Base + file + '#/definitions/' + def));
    checked++;
  }
  assert(!fs.existsSync(path.join(folder,'replay-account.schema.json')));
  const fixtures = JSON.parse(fs.readFileSync(path.join(folder, 'fixtures.json'), 'utf8'));
  for (const vector of fixtures.hashVectors) {
    assert.equal(canonical(vector.value), vector.canonical, vector.name + ': canonical preimage');
    assert.equal(hash(vector.value), vector.sha256, vector.name + ': canonical digest');
    checked += 2;
  }
  // Current positive flow keys must bind the actual retained request, not a stale historical literal.
  for (const correlation of [fixtures.observationRefreshCorrelationVector, fixtures.documents.observationRefreshFlow]) {
    const preimage = { identity: identityV2(correlation.request), idempotencyKey: correlation.idempotencyKey,
      requestDigest: hash(correlation.request) };
    assert.equal(correlation.requestDigest, preimage.requestDigest, 'current refresh request preimage');
    assert.equal(correlation.callbackKey, 'oref-' + hash(preimage), 'current refresh callback preimage');
    if (correlation.canonical !== undefined) assert.equal(correlation.canonical, canonical(preimage));
    checked += 2;
  }
  for (const test of fixtures.secretCases) {
    const value = structuredClone(fixtures.documents[test.document]);
    if (test.path || test.remove) {
      const parts = (test.path || test.remove).slice(1).split('/');
      const parent = parts.slice(0,-1).reduce((v,k) => v[k], value);
      if (test.remove) delete parent[parts.at(-1)]; else parent[parts.at(-1)] = test.value;
    }
    const [name,fragment] = test.schema.split('#');
    const validate = ajv.getSchema(v3Base + name + '.schema.json' + (fragment ? '#' + fragment : ''));
    assert(validate);
    assert.equal(validate(value), test.valid, test.name + ': ' + JSON.stringify(validate.errors));
    checked++;
  }
  const publication = JSON.parse(fs.readFileSync(path.join(folder,'publication-fixtures.json'),'utf8'));
  const types = {basis:'replay-validation#/definitions/ValidationBasis',artifact:'replay-artifact',build:'replay-profile#/definitions/BuildIdentity',trustedPolicy:'replay-ipc#/definitions/TrustedPolicy',job:'replay-job',admissionRequest:'replay-job#/definitions/AdmissionRequest',admissionReceipt:'replay-job#/definitions/AdmissionReceipt',launch:'replay-ipc#/definitions/Launch3',execute:'replay-ipc#/definitions/Execute3',validationRequest:'replay-validation'};
  for (const [key,type] of Object.entries(types)) {
    const [name,fragment]=type.split('#');
    const validate=ajv.getSchema(v3Base+name+'.schema.json'+(fragment?'#'+fragment:''));
    assert(validate(publication[key]),key+': '+JSON.stringify(validate.errors));
    assert(!validate({...publication[key],extra:'CANARY'}),'closed '+key);checked+=2;
  }
  // Admission/publication aggregates are independently rebuilt from immutable source facts.
  // Structural conformance cannot catch a stale preparation tuple inside a valid digest string.
  for (const sample of [publication, publication.observedChoice]) {
    const { basis, artifact } = sample;
    const preparations = new Map(basis.preparations.map(fact => [fact.preparationId, fact]));
    const ordered = [...basis.actions].sort((a,b) =>
      basis.sourceSteps.findIndex(step => step.stepId === a.ledger.coordinate.stepId)
        - basis.sourceSteps.findIndex(step => step.stepId === b.ledger.coordinate.stepId)
      || a.ledger.coordinate.ordinal - b.ledger.coordinate.ordinal);
    for (const action of ordered) {
      const fact = preparations.get(action.preparationId);
      assert(fact, 'actual retained preparation');
      const requestDigest = hash(fact.proposal);
      assert.equal(action.ledger.requestDigest, requestDigest, 'ledger proposal preimage');
      assert.equal(fact.proof.requestDigest, requestDigest, 'preparation proposal preimage');
      assert.equal(action.ledger.admission.policyDecisionHash,
        hash({scopeHash: action.ledger.scopeHash, preparation: fact.proof, requestDigest}),
        'full policy decision preimage');
      checked += 3;
    }
    assert.equal(artifact.replayPolicy.admissionProvenanceHash,
      hash(ordered.map(({ledger:l}) => ({coordinate:l.coordinate, admission:l.admission,
        operationHash:l.operationHash, scopeHash:l.scopeHash}))), 'admission aggregate preimage');
    assert.equal(artifact.replayPolicy.publicationEvidenceHash,
      hash({version:1,basisHash:hash(basis),runAuthorizationHash:hash(basis.runAuthorization),
        translationHash:basis.translationHash,bootstrapHash:hash(basis.bootstrap),
        sourceManifestHash:basis.sourceManifestHash}), 'publication aggregate preimage');
    assert.equal(artifact.learnedPlanHash, hash(artifact.learnedPlan), 'learned plan preimage');
    assert.equal(artifact.profile.executor, 'observed-4');
    assert.equal(artifact.profile.catalog, 'observed-replay-3');
    assert.equal(artifact.profile.language, 'observed-3');
    if (sample.hashes) {
      assert.equal(sample.hashes.operationEquivalenceHash, hash({operations:artifact.steps.flatMap(step => step.operations),
        guards:artifact.guards,inputRecipes:artifact.inputRecipes,bindings:artifact.replayPolicy.bindings,
        transfers:artifact.replayPolicy.transfers}), 'operation aggregate preimage');
      assert.equal(sample.hashes.artifactHash, hash(artifact), 'choice artifact preimage');
    }
    checked += 6;
  }
  assert.equal(publication.artifact.version,3);assert.equal(publication.artifact.replayPolicy.schemaVersion,4);
  assert.equal(hash(publication.basis),publication.validationRequest.basisHash);
  assert.equal(hash(publication.artifact),publication.job.binding.artifactHash);
  assert.equal(hash(publication.trustedPolicy),publication.job.binding.currentPolicyHash);
  const vectors=JSON.parse(fs.readFileSync(path.join(folder,'publication-canonical-vectors.json'),'utf8'));
  for(const vector of vectors.positive){assert.equal(Buffer.from(canonical(vector.input)).toString('hex'),vector.canonicalUtf8Hex);assert.equal(hash(vector.input),vector.sha256);checked++;}
  const api=YAML.parse(fs.readFileSync(path.join(directory,'../openapi-v3.yaml'),'utf8'));
  const expected = ['POST ','GET /{id}','GET /{id}/result','GET /{id}/clarification','POST /{id}/clarify','POST /{id}/cancel','POST /{id}/finalize'];
  const seen=[];let examples=0;
  function validateContent(content){
    for(const media of Object.values(content||{})){
      assert(media.schema.$ref?.startsWith('./contracts/v3/'));
      const validate=ajv.getSchema(v3Base+media.schema.$ref.slice('./contracts/v3/'.length));assert(validate);
      assert(validate(media.example),JSON.stringify(validate.errors));examples++;
    }
  }
  for(const [route,item]of Object.entries(api.paths)){
    assert(route.startsWith('/api/v3/studio/guided-sessions'));
    for(const [method,op]of Object.entries(item)){
      seen.push(method.toUpperCase()+' '+route.slice('/api/v3/studio/guided-sessions'.length));
      assert.deepEqual(op.security,[{BffCookie:[]}]);validateContent(op.requestBody?.content);
      for(const response of Object.values(op.responses))validateContent(response.content);
    }
  }
  assert.deepEqual(seen.sort(),expected.sort());assert(examples>=11);
  assert(!JSON.stringify(api).includes('accountRef'));assert(!JSON.stringify(api).includes('authConnection'));
  require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'build-studio-observed-schemas.cjs'),'--check']);
  console.log(`PASS v3: ${checked} schema/definition/positive/negative/canonical checks; ${examples} public API examples; seven routes; deterministic codegen parity. No browser or publication proof claimed.`);
}

function run() {
  // Compile all schemas even when a fixture does not reference them.
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.schema.json'))) ajv.getSchema(base+name);
  const fixtures = JSON.parse(fs.readFileSync(path.join(directory, 'fixtures.json'), 'utf8'));
  let passed = 0;
  for (const fixture of fixtures.cases) {
    const sample = structuredClone(fixtures.documents[fixture.document]);
    for (const patch of fixture.patches || []) applyPatch(sample, patch);
    let failure;
    try {
      if (fixture.schema === 'bundle') validateBundle(sample);
      else if (fixture.schema === 'proposal-result-context') {
        structural('proposal-result', sample);
        const bundle = fixtures.documents.bundle;
        check(sample.sessionId === bundle.session.sessionId && sample.scopeHash === bundle.session.scopeHash, 'SESSION_SCOPE');
        const admissions = bundle.ledgers.filter(ledger => ledger.coordinate.stepId === sample.stepId);
        check(admissions.length > 0 && admissions.every(ledger => ledger.state === 'SUCCEEDED' && ledger.assertionPassed !== false) && canonical(sample.successfulAdmissionIds) === canonical(admissions.map(ledger => ledger.admission.admissionId)), 'INCOMPLETE_PLAN');
      } else {
        structural(fixture.schema, sample);
        if (fixture.schema === 'observation') validateObservationRelations(sample);
      }
    } catch (error) { failure = error; }
    assert.equal(failure?.code || 'VALID', fixture.expected, `${fixture.name}: ${failure?.message || 'accepted'}`);
    passed++;
  }
  for (const fixture of fixtures.runtimeReadCases) {
    const value = fixture.value ?? fixture.repeat.repeat(fixture.count);
    let failure;
    try { assert.equal(validateRead(value, fixture.existingCount || 0, fixture.existingBytes || 0, { ...fixtures.documents.limits, ...fixture.limits }), value); } catch (error) { failure = error; }
    assert.equal(failure?.code || 'VALID', fixture.expected, fixture.name);
    passed++;
  }
  const api = YAML.parse(fs.readFileSync(path.join(directory, '../openapi.yaml'), 'utf8'));
  const methods = ['get','post'];
  let examples = 0;
  function resolve(reference) {
    if (reference.startsWith('#/')) return reference.slice(2).split('/').reduce((value, part) => value[part], api);
    const [file, fragment] = reference.split('#');
    check(file.startsWith('./contracts/'), 'OPENAPI_REF');
    return { $ref: base + path.basename(file) + (fragment ? '#'+fragment : '') };
  }
  function contentCheck(content) {
    if (!content) return;
    for (const media of Object.values(content)) {
      if (!media.schema || !media.example) continue;
      const schema = media.schema.$ref ? resolve(media.schema.$ref) : media.schema;
      const validate = ajv.compile(schema);
      assert(validate(media.example), JSON.stringify(validate.errors));
      // Observation examples may be nested in an internal command envelope.
      function observationRelations(value) {
        if (!value || typeof value !== 'object') return;
        if (value.coverage && Array.isArray(value.nodes)) validateObservationRelations(value);
        for (const child of Object.values(value)) observationRelations(child);
      }
      observationRelations(media.example);
      examples++;
    }
  }
  for (const item of Object.values(api.paths)) {
    for (const method of methods) {
      const operation = item[method];
      if (!operation) continue;
      assert(operation.security.length > 0 && operation['x-not-yet-implemented'] === true);
      if (operation['x-boundary'] === 'trusted backend/runner' && !operation.operationId.startsWith('claim')) {
        assert(['owning-worker', 'backend-controller'].includes(operation['x-service-role']), 'internal service role missing');
        assert(operation.parameters.some(parameter => parameter.name === 'X-Owner-Fence' && parameter.required && parameter.schema.type === 'integer'), 'internal owner fence missing');
      }
      contentCheck(operation.requestBody?.content);
      for (let response of Object.values(operation.responses)) {
        if (response.$ref) response = resolve(response.$ref);
        contentCheck(response.content);
      }
    }
  }
  assert(examples >= 15, 'API examples missing');
  assert.equal(hash({ b:2,a:'é' }), fixtures.canonicalVector.sha256);
  assert.equal(canonical({ b:2,a:'é' }), fixtures.canonicalVector.json);
  console.log(`PASS: ${passed} fixture cases; ${examples} OpenAPI request/response examples; all schemas compiled; canonical hash vector verified.`);
  runV2();
  runObservedPublication();
  runV3();
  const planning = JSON.parse(fs.readFileSync(path.join(v2Directory, 'planning-fixtures.json'), 'utf8'));
  for (const fixture of planning.cases) {
    const validate = ajv.getSchema(v2Base + fixture.schema + '.schema.json');
    assert(validate, fixture.schema);
    assert.equal(validate(fixture.value), fixture.valid, fixture.name + ': ' + JSON.stringify(validate.errors));
  }
  console.log(`PASS OBS-005: ${planning.cases.length} planning/question/privacy structural fixtures; no provider/browser proof claimed.`);
}
if (require.main === module) run();
module.exports = { hash, canonical, validateBundle, operationIdentity, provenance,
  validateFlowV2, validatePlanV2, validateMaterializationsV2, validateInputsV2, operationIdentityV2,
  observationRefreshKeyV2, validateObservationRefreshV2, runV2, runV3 };
