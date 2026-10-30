#!/usr/bin/env node
'use strict';
// Contract conformance oracle for the one observed contract generation (contracts/v3) and the one
// public OpenAPI (docs/specs/studio/openapi.yaml). It is not a runtime admission service: fixture
// checks grant no dispatch authority and prove no DOM correspondence, browser effect or publication.
// STUDIO-OBS-012A retired the v1/v2 generations and the separate observed OpenAPI documents.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const YAML = require('yaml');
const generator = require('./build-studio-observed-schemas.cjs');
const directory = path.resolve(__dirname, '../docs/specs/studio-observed-authoring/contracts/v3');
const publicApiPath = path.resolve(__dirname, '../docs/specs/studio/openapi.yaml');
const base = 'https://checks.citi.example/contracts/observed/v3/';
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const schemaFiles = fs.readdirSync(directory).filter(name => name.endsWith('.schema.json')).sort();
for (const name of schemaFiles) {
  const schema = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  assert.equal(schema.$id, base + name, 'schema identity must match its file');
  assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
  ajv.addSchema(schema);
}
const readJson = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
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
    assert(/^[\x20-\x7e]*$/.test(key), 'ASCII contract keys only');
    return `${JSON.stringify(key)}:${canonical(value[key])}`;
  }).join(',')}}`;
}
const hash = value => crypto.createHash('sha256').update(canonical(value), 'utf8').digest('hex');
const key = coordinate => `${coordinate.stepId}:${coordinate.ordinal}`;
// ADR-SC-007: the operation identity hashes the runner-reported ResolvedTarget (locator, tier, identity), never a backend-derived locator.
const operationIdentity = action => ({ coordinate: action.coordinate, origin: action.origin, target: action.target, operation: action.operation });
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function check(condition, code) { if (!condition) fail(code); }
// The facts table must key exactly the refs the outline shows (WI-2 perceive.ts guarantees it; the backend refuses a mismatch at ingestion),
// the summary must match the outline bytes, and every fact segment must stay inside its evidence.
function validateObservationRelations(observation) {
  const shown = [...observation.outline.matchAll(/\[(e[0-9]{1,6})\]/g)].map(match => match[1]);
  const refs = Object.keys(observation.facts);
  // The facts table has no schema-level key bound (the runner's schema policy audit caps maxProperties at 100): it is bounded here by the 4,096-ref ceiling and by the outline (40,000 bytes).
  check(refs.length <= 4096, 'NODE_RELATION');
  check(new Set(shown).size === shown.length && shown.length === refs.length && refs.every(ref => shown.includes(ref)), 'NODE_ID');
  check(observation.projection.outlineBytes === Buffer.byteLength(observation.outline, 'utf8')
    && observation.projection.shownNodes === refs.length && observation.projection.shownNodes <= observation.projection.totalNodes
    && observation.projection.notShown === observation.projection.totalNodes - observation.projection.shownNodes
    && (observation.projection.projected || observation.projection.tier === null), 'NODE_RELATION');
  for (const fact of Object.values(observation.facts)) {
    check(fact.evidenceSegments.every(segment => segment.start <= segment.end && segment.end <= fact.evidence.length), 'NODE_RELATION');
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
const identityFields = ['schemaVersion', 'sessionId', 'workerId', 'ownerFence', 'scopeHash',
  'contextId', 'contextRevision', 'sourceRevision', 'configurationRevision', 'versions'];
function identity(value) {
  return Object.fromEntries(identityFields.map(field => [field, value[field]]));
}
function same(left, right, code) { check(canonical(left) === canonical(right), code); }
function unique(items, identity, code) {
  check(new Set(items.map(identity)).size === items.length, code);
}
function canonicalOrigin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { fail('ORIGIN'); }
  check(['http:', 'https:'].includes(parsed.protocol) && parsed.origin === value
    && !parsed.username && !parsed.password, 'ORIGIN');
  check(parsed.hostname.startsWith('[') || parsed.hostname.split('.').every(
    label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)), 'ORIGIN');
}
const proposalOperationIdentity = (proposal, proof) => ({ coordinate: proposal.coordinate,
  origin: proposal.executionEvidence.origin, target: proof.target ?? null,
  operation: proposal.operation });
const mutableLedgerFields = new Set(['state', 'dispatchCount', 'outcomeCode', 'assertionPassed']);
function immutableLedger(ledger) {
  return Object.fromEntries(Object.entries(ledger).filter(([field]) => !mutableLedgerFields.has(field)));
}
function validateInputs(context, source) {
  const table = context.authoredInputs;
  structural('runner-context', context);
  check(context.contextRevision >= 1 && context.materializationRevision >= 1, 'CONTEXT_REVISION');
  check(Date.parse(context.leaseExpiresAt) <= Date.parse(context.expiresAt), 'LEASE');
  check(table.sessionId === context.sessionId && table.scopeHash === context.scopeHash
    && table.sourceRevision === context.sourceRevision
    && table.configurationRevision === context.configurationRevision, 'INPUT_IDENTITY');
  check(hash(table) === context.authoredInputsHash, 'INPUT_HASH');
  if (context.prefixProgram !== undefined) check(hash(context.prefixProgram) === context.prefixProgramHash,
    'PREFIX_PROGRAM_HASH');
  unique(table.inputs, input => input.inputId, 'INPUT_IDENTITY');
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
      check(!url.username && !url.password && (url.protocol === 'http:' || url.protocol === 'https:'), 'ORIGIN');
    }
  }
}
function validateMaterializations(contexts, source) {
  check(contexts.length > 0, 'MATERIALIZATION');
  const first = contexts[0];
  const stableFields = [...identityFields, 'expiresAt', 'sourceStepIds',
    'authoredInputs', 'authoredInputsHash', 'limits'];
  const frozen = context => Object.fromEntries(stableFields.map(field => [field, context[field]]));
  for (let index = 0; index < contexts.length; index++) {
    const context = contexts[index];
    validateInputs(context, source);
    same(frozen(context), frozen(first), 'IMMUTABLE_CONTEXT');
    check(context.allocations.length <= context.limits.maxRuntimeValues
      && context.producers.length <= context.limits.maxRuntimeValues, 'BUDGET');
    unique(context.allocations, item => item.bindingId, 'BINDING_ID');
    unique(context.allocations, item => item.needId, 'BINDING_ID');
    unique(context.producers, item => item.bindingId, 'BINDING_ID');
    unique(context.consumerEdges, item => `${item.consumerAdmissionId}:${item.argumentSlot}`, 'BINDING_EDGE');
    for (const allocation of context.allocations) {
      const producerStep = context.sourceStepIds.indexOf(allocation.producerStepId);
      check(producerStep >= 0 && allocation.consumers.every(consumer =>
        context.sourceStepIds.indexOf(consumer.stepId) >= producerStep), 'BINDING_ORDER');
    }
    for (const producer of context.producers) {
      const allocation = context.allocations.find(item => item.bindingId === producer.bindingId);
      check(allocation && allocation.producerStepId === producer.coordinate.stepId, 'BINDING_PRODUCER');
      canonicalOrigin(producer.origin);
      same(producer.availability, { bindingId: producer.bindingId,
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
function validatePlan(plan) {
  structural('learned-plan', plan);
  same(Object.keys(plan.stepSnapshotHashes).sort(), [...plan.sourceSteps].sort(), 'SNAPSHOT_MAP');
  const effectiveIndex = plan.incremental === null ? 0
    : plan.sourceSteps.indexOf(plan.incremental.effectiveFirstLearnStepId);
  check(effectiveIndex >= 0, 'REUSE_BOUNDARY');
  same(Object.keys(plan.reusedFrom).sort(), plan.sourceSteps.slice(0, effectiveIndex).sort(), 'REUSE_PREFIX');
  for (const [stepId, reuse] of Object.entries(plan.reusedFrom)) check(
    reuse.stepId === stepId && reuse.revisionId === plan.incremental.baseRevisionId, 'REUSE_BASE');
  const blank = plan.initialContext.kind === 'initialBlank';
  if (!blank) canonicalOrigin(plan.initialContext.origin);
  const counts = new Map();
  let priorStep = -1;
  unique(plan.actions, action => action.admissionId, 'ADMISSION_IDENTITY');
  for (let index = 0; index < plan.actions.length; index++) {
    const action = plan.actions[index];
    if (action.origin === null) check(blank && index === 0
      && action.coordinate.stepId === plan.sourceSteps[0]
      && action.coordinate.ordinal === 0 && action.operation.kind === 'navigate'
      && action.target === null, 'BOOTSTRAP');
    else canonicalOrigin(action.origin);
    if (index === 0) check(blank ? action.origin === null : action.origin === plan.initialContext.origin, 'BOOTSTRAP');
    const stepIndex = plan.sourceSteps.indexOf(action.coordinate.stepId);
    check(stepIndex >= 0 && stepIndex >= priorStep
      && action.coordinate.ordinal === (counts.get(action.coordinate.stepId) || 0), 'ACTION_ORDER');
    priorStep = stepIndex;
    counts.set(action.coordinate.stepId, action.coordinate.ordinal + 1);
    const page = action.operation.kind === 'navigate' || (action.operation.kind === 'assert'
      && ['url', 'title'].includes(action.operation.predicate));
    check(page === (action.target === null), 'TARGET_MISMATCH');
    check(action.operationHash === hash(operationIdentity(action)), 'OPERATION_HASH');
  }
  check(plan.sourceSteps.every(step => counts.has(step)), 'INCOMPLETE_PLAN');
  unique(plan.bindings, binding => binding.bindingId, 'BINDING_ID');
  const exercisedEdges = new Set();
  for (const binding of plan.bindings) {
    const producerIndex = plan.actions.findIndex(action => action.admissionId === binding.provenance.producerAdmissionId);
    const producer = plan.actions[producerIndex];
    check(producer && producer.operation.kind === 'read' && producer.operation.bindingId === binding.bindingId
      && key(producer.coordinate) === key(binding.producer)
      && binding.provenance.sourceIntentStepId === producer.coordinate.stepId
      && producer.origin === binding.sourceOrigin, 'BINDING_PRODUCER');
    same(binding.recipe, producer.operation.recipe, 'BINDING_PRODUCER');
    if (binding.consumers.length === 0) check(plan.incremental !== null
      && plan.incremental.retainedPrefixAdmissionIds.includes(producer.admissionId), 'BINDING_PRODUCER');
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
function validateFlow(flow) {
  const { session, contexts, source, proposals, observations, histories, preparations, dispatches, outcomes, plan } = flow;
  structural('session', session);
  validateMaterializations(contexts, source);
  validatePlan(plan);
  check(flow.learnedPlanHash === hash(plan), 'PLAN_HASH');
  const context = contexts[0], finalContext = contexts.at(-1);
  check(hash(session.scope) === session.scopeHash && session.scopeHash === context.scopeHash
    && session.runAuthorization.scopeHash === session.scopeHash
    && session.runAuthorization.principalId === session.scope.principalId, 'SCOPE_HASH');
  check(session.sessionId === context.sessionId && session.owner.workerId === context.workerId
    && session.owner.fence === context.ownerFence && session.scope.sourceRevision === context.sourceRevision
    && session.scope.configurationRevision === context.configurationRevision, 'ENVELOPE_IDENTITY');
  same(session.versions, context.versions, 'VERSION');
  same(session.sourceSteps.map(step => step.stepId), context.sourceStepIds, 'ACTION_ORDER');
  same(plan.versions, context.versions, 'VERSION');
  check(plan.scopeHash === context.scopeHash && plan.sourceRevision === context.sourceRevision
    && plan.configurationRevision === context.configurationRevision
    && plan.authoredInputsHash === context.authoredInputsHash, 'INPUT_IDENTITY');
  same(plan.sourceSteps, context.sourceStepIds, 'ACTION_ORDER');
  const count = proposals.length;
  check([histories, preparations, dispatches, outcomes, plan.actions, flow.contextAtAction].every(items => items.length === count), 'ACTION_COUNT');
  check(count <= context.limits.maxActions && observations.length <= context.limits.maxObservations
    && context.sourceStepIds.length <= context.limits.maxSourceSteps, 'BUDGET');
  const observationsByHash = new Map();
  for (const observation of observations) {
    structural('observation', observation);
    validateObservationRelations(observation);
    check(Buffer.byteLength(canonical(observation), 'utf8') <= context.limits.maxObservationBytes
      && Buffer.byteLength(observation.outline, 'utf8') <= context.limits.maxOutlineBytes, 'BUDGET');
    canonicalOrigin(observation.origin);
    check(observation.sessionId === context.sessionId && observation.scopeHash === context.scopeHash, 'EVIDENCE_IDENTITY');
    observationsByHash.set(hash(observation), observation);
  }
  for (let index = 0; index < count; index++) {
    const proposal = proposals[index], evidence = proposal.executionEvidence;
    const materialization = contexts[flow.contextAtAction[index]];
    check(materialization && Number.isInteger(flow.contextAtAction[index])
      && (index === 0 || flow.contextAtAction[index] >= flow.contextAtAction[index - 1]), 'MATERIALIZATION');
    structural('action', proposal);
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
      canonicalOrigin(evidence.origin);
      const observation = observationsByHash.get(evidence.observationHash);
      check(observation && observation.origin === evidence.origin && observation.documentId === evidence.documentId
        && observation.generation === evidence.generation, 'OBSERVATION_HASH');
      if (proposal.target.kind !== 'page') {
        // ref is a fact of this observation; the runner-reported target agrees with the gated fact (the D-15 prepare-proof cross-check);
        // a read needs facts text and the page-level readRuleId (the backend-completed recipe)
        const fact = observation.facts[proposal.target.ref], proof = preparations[index];
        check(fact && proof.target !== null && proof.target.identity.role === fact.role
          && (proof.target.identity.name === null || proof.target.identity.name === fact.name), 'TARGET_MISMATCH');
        if (proposal.operation.kind === 'read') {
          const recipe = proposal.operation.recipe;
          check(fact.text !== undefined && recipe.policyRuleId === observation.readRuleId && recipe.classification === 'permittedBusinessData', 'SENSITIVE_SOURCE');
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
    same(proposalOperationIdentity(proposal, preparations[index]), operationIdentity(action), 'OPERATION_IDENTITY');
    const inputId = proposal.operation.destinationInputId || ((proposal.operation.value || proposal.operation.expected)?.kind === 'authoredLiteral'
      ? (proposal.operation.value || proposal.operation.expected).sourceInputId : null);
    if (inputId) {
      const input = context.authoredInputs.inputs.find(item => item.inputId === inputId);
      const slot = proposal.operation.kind === 'navigate' ? 'navigate.destination'
        : proposal.operation.kind === 'assert' ? 'assert.expected' : `${proposal.operation.kind}.value`;
      check(input && input.sourceStepId === proposal.coordinate.stepId && input.intendedSlot === slot, 'INPUT_SLOT');
    }
    const history = histories[index];
    for (const ledger of [history.admitted, history.dispatching, history.outcome]) structural('ledger', ledger);
    const admitted = history.admitted;
    check(admitted.state === 'ADMITTED' && admitted.dispatchCount === 0 && admitted.outcomeCode === 'PENDING'
      && admitted.assertionPassed === null && history.dispatching.state === 'DISPATCHING'
      && history.dispatching.dispatchCount === 1 && history.dispatching.outcomeCode === 'PENDING'
      && history.dispatching.assertionPassed === null, 'LEDGER_STATE');
    same(immutableLedger(admitted), immutableLedger(history.dispatching), 'IMMUTABLE_ADMISSION');
    same(immutableLedger(admitted), immutableLedger(history.outcome), 'IMMUTABLE_ADMISSION');
    check(history.outcome.state === 'SUCCEEDED' && history.outcome.dispatchCount === 1 && history.outcome.outcomeCode === 'OK'
      && history.outcome.assertionPassed === (proposal.operation.kind === 'assert' ? true : null), 'LEDGER_STATE');
    check(admitted.sessionId === context.sessionId && admitted.scopeHash === context.scopeHash
      && admitted.ownerFence === context.ownerFence && admitted.contextRevision === context.contextRevision
      && admitted.generation === proposal.generation && admitted.documentId === evidence.documentId
      && admitted.admission.admissionId === action.admissionId, 'ADMISSION_IDENTITY');
    same(admitted.coordinate, proposal.coordinate, 'ADMISSION_IDENTITY');
    same(admitted.executionEvidence, evidence, 'EVIDENCE_IDENTITY');
    check(admitted.authoredInputsHash === context.authoredInputsHash, 'INPUT_HASH');
    check(admitted.evidenceHash === proposal.evidenceHash && admitted.requestDigest === hash(proposal)
      && admitted.operationHash === hash(proposalOperationIdentity(proposal, preparations[index])), 'OPERATION_HASH');
    const preparation = preparations[index], dispatch = dispatches[index], outcome = outcomes[index];
    structural('bridge#/definitions/preparation', preparation);
    structural('bridge#/definitions/dispatch', dispatch);
    structural('bridge#/definitions/outcome', outcome);
    for (const envelope of [preparation, dispatch, outcome]) same(identity(envelope), identity(context), 'ENVELOPE_IDENTITY');
    check(preparation.preparationId === admitted.preparationId && dispatch.preparationId === admitted.preparationId
      && preparation.requestDigest === admitted.requestDigest && preparation.evidenceHash === admitted.evidenceHash
      && preparation.authoredInputsHash === context.authoredInputsHash
      && Date.parse(preparation.expiresAt) <= Date.parse(context.leaseExpiresAt), 'PREPARATION');
    same(dispatch.proposal, proposal, 'IMMUTABLE_ADMISSION');
    same(dispatch.ledger, history.dispatching, 'IMMUTABLE_ADMISSION');
    same(outcome.ledger, history.outcome, 'IMMUTABLE_ADMISSION');
    const edges = materialization.consumerEdges.filter(edge => edge.consumerAdmissionId === admitted.admission.admissionId);
    same(dispatch.consumerEdges, edges, 'BINDING_EDGE');
    if (proposal.operation.kind === 'read') {
      const producer = finalContext.producers.find(item => item.bindingId === proposal.operation.bindingId);
      check(producer && producer.producerAdmissionId === admitted.admission.admissionId
        && key(producer.coordinate) === key(proposal.coordinate) && producer.origin === evidence.origin, 'BINDING_PRODUCER');
      same(producer.recipe, proposal.operation.recipe, 'BINDING_PRODUCER');
      same(outcome.availability, producer.availability, 'AVAILABILITY');
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
  unique(histories, item => item.admitted.admission.admissionId, 'ADMISSION_IDENTITY');
  check(plan.bindings.length === finalContext.producers.length, 'BINDING_PRODUCER');
  for (const binding of plan.bindings) {
    const producer = finalContext.producers.find(item => item.bindingId === binding.bindingId);
    check(producer && binding.provenance.sessionId === context.sessionId, 'BINDING_PRODUCER');
    same(binding.consumers, finalContext.consumerEdges.filter(edge => edge.bindingId === binding.bindingId), 'BINDING_EDGE');
    const allocation = finalContext.allocations.find(item => item.bindingId === binding.bindingId);
    check(allocation.consumers.every(expected => binding.consumers.some(edge => edge.coordinate.stepId === expected.stepId
      && edge.argumentSlot === expected.argumentSlot)), 'INCOMPLETE_BINDING');
  }
  check(finalContext.allocations.length === plan.bindings.length, 'INCOMPLETE_BINDING');
}
const terminalStates = new Set(['SUCCEEDED', 'PUBLICATION_CONFLICT', 'FAILED', 'UNKNOWN_OUTCOME', 'CANCELLED', 'EXPIRED']);
function validateAssignmentReceipt(receipt, at) {
  structural('assignment-receipt', receipt);
  if (receipt.ownerFence !== null) {
    check(receipt.ownerFence === receipt.assignment.expectedFence + 1, 'ASSIGNMENT_FENCE');
    check(Date.parse(receipt.leaseExpiresAt) <= Date.parse(receipt.assignment.expiresAt), 'LEASE');
  }
  if (receipt.status === 'OWNED' && at !== undefined) check(Date.parse(at) < Date.parse(receipt.leaseExpiresAt), 'LEASE');
}
function validateAssignmentGrant(assignment, request, session, renewal, allowTerminal = false) {
  structural('assignment', assignment);
  structural('commands#/definitions/claim', request);
  structural('session', session);
  check(request.sessionId === assignment.sessionId && request.workerId === assignment.workerId
    && request.expectedFence === assignment.expectedFence + (renewal ? 1 : 0), 'ASSIGNMENT_IDENTITY');
  same(request.versions, assignment.versions, 'VERSION');
  same(session.versions, assignment.versions, 'VERSION');
  check(session.sessionId === assignment.sessionId && session.scopeHash === assignment.scopeHash
    && session.scope.sourceRevision === assignment.sourceRevision
    && session.scope.configurationRevision === assignment.configurationRevision
    && session.expiresAt === assignment.expiresAt, 'ASSIGNMENT_IDENTITY');
  check(hash(session.scope) === session.scopeHash && session.runAuthorization.scopeHash === session.scopeHash
    && session.runAuthorization.principalId === session.scope.principalId, 'SCOPE_HASH');
  if (!allowTerminal) check(!terminalStates.has(session.state), 'TERMINAL_GRANT');
  if (!terminalStates.has(session.state)) {
    check(session.owner.workerId === assignment.workerId
      && session.owner.fence === assignment.expectedFence + 1, 'ASSIGNMENT_FENCE');
    check(Date.parse(session.owner.leaseExpiresAt) <= Date.parse(assignment.expiresAt), 'LEASE');
  }
}
function validateAssignmentTrace(trace) {
  const { assignment } = trace;
  structural('assignment', assignment);
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
        structural('commands#/definitions/claim', event.request);
        check(!stopped && lease !== null && start < Date.parse(lease), 'LEASE');
        check(event.request.sessionId === assignment.sessionId && event.request.workerId === assignment.workerId
          && event.request.expectedFence === assignment.expectedFence + 1, 'ASSIGNMENT_IDENTITY');
        same(event.request.versions, assignment.versions, 'VERSION');
        check(event.applied === false, 'LEASE_REVIVAL');
        stopped = true;
      } else {
        validateAssignmentGrant(assignment, event.request, event.session, renewal,
          event.kind === 'terminal' || event.kind === 'lateGrant');
        if (event.kind === 'lateGrant') {
          check(stopped || (lease !== null && end >= Date.parse(lease)), 'RENEWAL_ORDER');
          check(event.applied === false, 'LEASE_REVIVAL');
          stopped = true;
        } else if (event.kind === 'terminal') {
          check(terminalStates.has(event.session.state) && event.applied === false, 'TERMINAL_GRANT');
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
          validateAssignmentReceipt(event.receipt, event.receivedAt);
          check(event.receipt.status === 'OWNED' && event.receipt.leaseExpiresAt === lease, 'LEASE');
          same(event.receipt.assignment, assignment, 'ASSIGNMENT_IDENTITY');
        }
      }
    } else if (event.kind === 'context') {
      structural('runner-context', event.context);
      check(!stopped && lease !== null && Date.parse(event.at) < Date.parse(lease), 'CONTEXT_WITHOUT_OWNER');
      const context = event.context;
      check(context.sessionId === assignment.sessionId && context.workerId === assignment.workerId
        && context.scopeHash === assignment.scopeHash && context.sourceRevision === assignment.sourceRevision
        && context.configurationRevision === assignment.configurationRevision
        && context.ownerFence === assignment.expectedFence + 1 && context.expiresAt === assignment.expiresAt,
      'ASSIGNMENT_IDENTITY');
      same(context.versions, assignment.versions, 'VERSION');
      check(Date.parse(context.leaseExpiresAt) <= hardDeadline && event.effectiveLeaseExpiresAt === lease, 'CONTEXT_LEASE');
    } else if (event.kind === 'stop') {
      structural('assignment-stop', event.request);
      same(event.request.assignment, assignment, 'ASSIGNMENT_IDENTITY');
      validateAssignmentReceipt(event.receipt);
      same(event.receipt.assignment, assignment, 'ASSIGNMENT_IDENTITY');
      check(event.receipt.status === 'STOPPED' && event.receipt.leaseExpiresAt === lease
        && event.receipt.ownerFence === (lease === null ? null : assignment.expectedFence + 1), 'STOP_RECEIPT');
      stopped = true;
    } else fail('ASSIGNMENT_EVENT');
    if (event.kind === 'renewalFailure' || event.kind === 'terminal' || event.kind === 'lateGrant') {
      validateAssignmentReceipt(event.receipt);
      same(event.receipt.assignment, assignment, 'ASSIGNMENT_IDENTITY');
      check(event.receipt.status === 'STOPPED' && event.receipt.leaseExpiresAt === lease
        && event.receipt.ownerFence === (lease === null ? null : assignment.expectedFence + 1), 'STOP_RECEIPT');
    }
  }
}
function observationRefreshKey(request, idempotencyKey) {
  structural('observation-refresh', request);
  check(typeof idempotencyKey === 'string' && idempotencyKey.length > 0 && idempotencyKey.length <= 256, 'REFRESH_KEY');
  return 'oref-' + hash({ identity: identity(request), idempotencyKey, requestDigest: hash(request) });
}
function validateObservationRefresh(flow) {
  const { request, context, before, after, callback, response, current } = flow;
  structural('observation-refresh', request);
  structural('runner-context', context);
  same(identity(request), identity(context), 'ENVELOPE_IDENTITY');
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
  structural('bridge#/definitions/observation', callback);
  structural('bridge#/definitions/observation', response);
  same(identity(callback), identity(request), 'ENVELOPE_IDENTITY');
  same(response, callback, 'REFRESH_RESPONSE');
  check(flow.requestDigest === hash(request)
    && flow.callbackKey === observationRefreshKey(request, flow.idempotencyKey), 'REFRESH_CORRELATION');
  const observation = callback.observation, bytes = Buffer.byteLength(canonical(observation), 'utf8');
  validateObservationRelations(observation);
  check(observation.sessionId === request.sessionId && observation.scopeHash === request.scopeHash, 'EVIDENCE_IDENTITY');
  canonicalOrigin(observation.origin);
  check(observation.generation > request.expectedGeneration, 'STALE_GENERATION');
  check(bytes <= context.limits.maxObservationBytes
    && before.evidenceBytes + bytes <= context.limits.maxSanitizedEvidenceBytesTotal
    && Buffer.byteLength(observation.outline, 'utf8') <= context.limits.maxOutlineBytes, 'BUDGET');
  check(flow.callbackAcknowledgedBeforeResponse && after.state === 'PROPOSING'
    && after.generation === observation.generation && after.observationHash === hash(observation), 'REFRESH_COMMIT');
  check(after.observations === before.observations + 1 && after.evidenceBytes === before.evidenceBytes + bytes
    && flow.collectCount === 1 && flow.callbackCommitCount === 1, 'REFRESH_ACCOUNTING');
  check(after.actions === before.actions, 'REFRESH_ACTION');
  same(after.ordinals, before.ordinals, 'REFRESH_ACTION');
  same(after.bindingIds, before.bindingIds, 'REFRESH_BINDINGS');
  check(after.preparationIds.length === 0, 'REFRESH_PREPARATION');
  for (const duplicate of flow.duplicates) {
    check(duplicate.idempotencyKey === flow.idempotencyKey && hash(duplicate.request) === flow.requestDigest, 'IDEMPOTENCY_CONFLICT');
  }
  // A committed callback, not the returned HTTP body, is authority. Cached replies
  // cannot be presented as current after another observation/admission or local stop.
  check(!current.stopped && current.state === 'PROPOSING' && current.generation === after.generation
    && current.observationHash === after.observationHash
    && !current.ledgerStates.some(state => ['ADMITTED', 'DISPATCHING'].includes(state)), 'STALE_REFRESH');
  if (!flow.controllerReceivedResponse) same(flow.recoveredObservation, callback, 'REFRESH_RESPONSE');
}function structural(name, value) {
  const [file, fragment] = name.split('#');
  const validate = ajv.getSchema(`${base}${file}.schema.json${fragment ? '#' + fragment : ''}`);
  assert(validate, `missing validator: ${name}`);
  check(validate(value), 'SCHEMA');
}
const snapshotOracle = require('./studio-snapshot-contract-oracle.cjs')({ hash, canonical, check, same, structural });

// Every schema and every definition compiles; references stay inside v3; timestamps keep their
// frozen family profile (replay/publication/revision millisecond UTC, bridge shared pattern).
function runSchemas() {
  const timestampPattern = readJson('wire-parity.fixtures.json').timestampPattern;
  let checked = 0;
  for (const file of schemaFiles) {
    const schema = readJson(file);
    function local(value) {
      if (!value || typeof value !== 'object') return;
      if (value.format === 'date-time' && file === 'authoring-snapshot.schema.json') {
        assert.equal(value.type, 'string', 'authored evidence keeps its stored ISO string, never a numeric timestamp');
      } else if (value.format === 'date-time') assert.equal(value.pattern, /^(replay-|publication\.|revision\.)/.test(file)
        ? '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' : timestampPattern, `${file}: frozen UTC profile`);
      if (typeof value.$ref === 'string') assert(value.$ref.startsWith('#/') || value.$ref.startsWith(base),
        `${file}: v3 cannot inherit a retired generation: ${value.$ref}`);
      for (const child of Object.values(value)) local(child);
    }
    local(schema);
    assert(ajv.getSchema(base + file));
    for (const definition of Object.keys(schema.definitions || {})) assert(ajv.getSchema(`${base}${file}#/definitions/${definition}`));
    checked++;
  }
  assert(!fs.existsSync(path.join(directory, 'replay-account.schema.json')), 'the account ABI stays removed');
  oneActionTimingDefinition();
  return checked;
}

// AR-1 addendum D-1: ONE actionTiming definition. result#/definitions/actionTiming is a pure alias of
// action-timing.schema.json, and result.actionTimings items and bridge recordingEvidence.timings items
// both resolve to that same document. A route-local inline copy is a second definition and fails.
function oneActionTimingDefinition() {
  const actionTimingId = base + 'action-timing.schema.json';
  const documents = new Map(schemaFiles.map(file => [base + file, readJson(file)]));
  function target(id, fragment) {
    let value = documents.get(id);
    for (const part of fragment.split('/').filter(Boolean)) value = value?.[part];
    for (let hops = 0; value && typeof value.$ref === 'string'; hops++) {
      assert(hops < 8, `${id}#${fragment}: $ref chain too long`);
      const [file, pointer = ''] = value.$ref.split('#');
      const next = file ? new URL(file, id).href : id;
      value = documents.get(next);
      for (const part of pointer.split('/').filter(Boolean)) value = value?.[part];
      id = next;
    }
    assert(value, `${id}#${fragment} does not resolve`);
    return value;
  }
  const result = documents.get(base + 'result.schema.json'), bridge = documents.get(base + 'bridge.schema.json');
  assert.deepEqual(result.definitions.actionTiming, { $ref: actionTimingId }, 'result#/definitions/actionTiming is a pure $ref alias');
  assert.deepEqual(bridge.definitions.recordingEvidence.properties.timings.items, { $ref: actionTimingId },
    'bridge recordingEvidence.timings items reference action-timing.schema.json');
  const shared = documents.get(actionTimingId);
  assert.equal(target(base + 'result.schema.json', '/properties/actionTimings/items'), shared, 'result actionTimings item is the one definition');
  assert.equal(target(base + 'bridge.schema.json', '/definitions/recordingEvidence/properties/timings/items'), shared,
    'bridge timings item is the one definition');
}

// Semantic flow, plan, input, materialization, assignment and refresh oracles over v3 documents.
function runFixtures() {
  const fixtures = readJson('fixtures.json');
  let checked = 0;
  for (const fixture of fixtures.cases) {
    assert(fixtures.documents[fixture.document], `missing fixture document ${fixture.document}`);
    const sample = structuredClone(fixtures.documents[fixture.document]);
    for (const patch of fixture.patches || []) applyPatch(sample, patch);
    let failure;
    try {
      // Private fixture sources contain maps keyed by opaque step/reference IDs. They are not
      // canonical wire documents; check Unicode without hashing those maps.
      function wellFormed(value) {
        if (typeof value === 'string') check(value.isWellFormed(), 'INVALID_UNICODE');
        if (value && typeof value === 'object') for (const child of Object.values(value)) wellFormed(child);
      }
      wellFormed(sample);
      if (fixture.validator === 'flow') validateFlow(sample);
      else if (fixture.validator === 'plan') validatePlan(sample);
      else if (fixture.validator === 'source') validateInputs(sample.context, sample.source);
      else if (fixture.validator === 'materializations') validateMaterializations(sample.contexts, sample.source);
      else if (fixture.validator === 'assignment-receipt-context') validateAssignmentReceipt(sample.receipt, sample.at);
      else if (fixture.validator === 'assignment-trace') validateAssignmentTrace(sample);
      else if (fixture.validator === 'observation-refresh-flow') validateObservationRefresh(sample);
      else structural(fixture.validator, sample);
    } catch (error) { failure = error; }
    assert.equal(failure?.code || (failure ? 'INTERNAL_ERROR' : 'VALID'), fixture.expected,
      `${fixture.name}: ${failure?.message || 'accepted'}`);
    checked++;
  }
  for (const vector of readJson('wire-parity.fixtures.json').dateTimes) {
    const assignment = structuredClone(fixtures.documents.assignment);
    assignment.expiresAt = vector.value;
    let accepted = true;
    try { structural('assignment', assignment); } catch { accepted = false; }
    assert.equal(accepted, vector.accepted, `UTC instant profile: ${JSON.stringify(vector.value)}`);
    checked++;
  }
  // Runtime read-value bounds (folded from the retired v1 corpus) against the v3 limits document.
  const limits = fixtures.documents.context.limits;
  structural('limits', limits);
  for (const fixture of fixtures.runtimeReadCases) {
    const value = fixture.value ?? fixture.repeat.repeat(fixture.count);
    let failure;
    try { assert.equal(validateRead(value, fixture.existingCount || 0, fixture.existingBytes || 0, { ...limits, ...fixture.limits }), value); } catch (error) { failure = error; }
    assert.equal(failure?.code || 'VALID', fixture.expected, fixture.name);
    checked++;
  }
  assert.equal(canonical({ b: 2, a: 'é' }), fixtures.canonicalVector.json);
  assert.equal(hash({ b: 2, a: 'é' }), fixtures.canonicalVector.sha256);
  for (const vector of fixtures.hashVectors) {
    assert.equal(canonical(vector.value), vector.canonical, vector.name + ': canonical preimage');
    assert.equal(hash(vector.value), vector.sha256, vector.name + ': canonical digest');
    checked += 2;
  }
  // Current positive flow keys must bind the actual retained request, not a stale historical literal.
  for (const correlation of [fixtures.observationRefreshCorrelationVector, fixtures.documents.observationRefreshFlow]) {
    const preimage = { identity: identity(correlation.request), idempotencyKey: correlation.idempotencyKey,
      requestDigest: hash(correlation.request) };
    assert.equal(correlation.requestDigest, preimage.requestDigest, 'current refresh request preimage');
    assert.equal(correlation.callbackKey, 'oref-' + hash(preimage), 'current refresh callback preimage');
    assert.equal(observationRefreshKey(correlation.request, correlation.idempotencyKey), correlation.callbackKey);
    if (correlation.canonical !== undefined) assert.equal(correlation.canonical, canonical(preimage));
    checked += 3;
  }
  for (const test of fixtures.secretCases) {
    const value = structuredClone(fixtures.documents[test.document]);
    if (test.path || test.remove) {
      const parts = (test.path || test.remove).slice(1).split('/');
      const parent = parts.slice(0, -1).reduce((v, k) => v[k], value);
      if (test.remove) delete parent[parts.at(-1)]; else parent[parts.at(-1)] = test.value;
    }
    const [name, fragment] = test.schema.split('#');
    const validate = ajv.getSchema(base + name + '.schema.json' + (fragment ? '#' + fragment : ''));
    assert(validate);
    assert.equal(validate(value), test.valid, test.name + ': ' + JSON.stringify(validate.errors));
    checked++;
  }
  // AR-1 R2/R3 (STUDIO-OBS-013): the array ceilings, accepted at the bound and refused one past it.
  const timing = fixtures.documents.actionTiming;
  const recordingResult = structuredClone(fixtures.documents.recordingResult);
  const recordingEvidence = structuredClone(fixtures.documents.recordingEvidence);
  for (const [name, sample, field, bound] of [['result', recordingResult, 'actionTimings', 400],
    ['bridge#/definitions/recordingEvidence', recordingEvidence, 'timings', 200]]) {
    for (const [count, valid] of [[bound, true], [bound + 1, false]]) {
      sample[field] = Array.from({ length: count }, () => structuredClone(timing));
      let accepted = true;
      try { structural(name, sample); } catch { accepted = false; }
      assert.equal(accepted, valid, `${name}.${field} with ${count} items`);
      checked++;
    }
  }
  checked += runRefusalCodes();
  return checked;
}

// The bridge refusal vocabulary is closed and ordered: the runner list (GUIDED_REFUSAL_CODES), then POLICY_DENIED.
function runRefusalCodes() {
  let checked = 0;
  // bridge#/definitions/refusal: the runner list order (GUIDED_REFUSAL_CODES) then POLICY_DENIED.
  const refusal = readJson('bridge.schema.json').definitions.refusal;
  const codes = refusal.properties.code.enum;
  assert.equal(codes.at(-1), 'POLICY_DENIED', 'the refusal code enum ends with POLICY_DENIED');
  assert.equal(new Set(codes).size, codes.length, 'refusal codes are unique');
  assert.equal(new Set(refusal.properties.reason.enum).size, refusal.properties.reason.enum.length, 'refusal reasons are unique');
  checked += 3;
  return checked;
}

function runPlanning() {
  const planning = readJson('planning-fixtures.json');
  for (const fixture of planning.cases) {
    const validate = ajv.getSchema(base + fixture.schema + '.schema.json');
    assert(validate, fixture.schema);
    assert.equal(validate(fixture.value), fixture.valid, fixture.name + ': ' + JSON.stringify(validate.errors));
  }
  return planning.cases.length;
}

// Replay/publication family: closed schemas, independently rebuilt aggregates, canonical vectors and
// the observed-choice witness.
function runPublication() {
  const publication = readJson('publication-fixtures.json');
  snapshotOracle.wireBounds(publication.validationRequest);
  let checked = 0;
  const types = {basis:'replay-validation#/definitions/ValidationBasis',artifact:'replay-artifact',build:'replay-profile#/definitions/BuildIdentity',job:'replay-job',admissionRequest:'replay-job#/definitions/AdmissionRequest',admissionReceipt:'replay-job#/definitions/AdmissionReceipt',launch:'replay-ipc#/definitions/Launch3',execute:'replay-ipc#/definitions/Execute3',validationRequest:'replay-validation'};
  for (const [key, type] of Object.entries(types)) {
    const [name, fragment] = type.split('#');
    const validate = ajv.getSchema(base + name + '.schema.json' + (fragment ? '#' + fragment : ''));
    assert(validate(publication[key]), key + ': ' + JSON.stringify(validate.errors));
    assert(!validate({ ...publication[key], extra: 'CANARY' }), 'closed ' + key);
    checked += 2;
  }
  for (const item of publication.positive) {
    const validate = ajv.getSchema(base + item.schema.split('/').at(-1) + '.schema.json');
    assert(validate && validate(item.value), item.name + ': ' + JSON.stringify(validate?.errors));
    checked++;
  }
  for (const item of publication.negative) {
    const validate = ajv.getSchema(base + item.schema.split('/').at(-1) + '.schema.json');
    assert(validate && !validate(item.value), item.name + ': negative fixture must refuse');
    checked++;
  }
  // Admission/publication aggregates are independently rebuilt from immutable source facts.
  // Structural conformance cannot catch a stale preparation tuple inside a valid digest string.
  for (const sample of [publication, publication.observedChoice,
    publication.controlValueReference, publication.controlValueReferenceUsedConfiguration]) {
    const { basis, artifact } = sample;
    validateSnapshotGraph(basis, sample.snapshotAuthority, artifact);
    const preparations = new Map(basis.preparations.map(fact => [fact.preparationId, fact]));
    const ordered = [...basis.actions].sort((a, b) =>
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
        hash({ scopeHash: action.ledger.scopeHash, preparation: fact.proof, requestDigest }),
        'full policy decision preimage');
      checked += 3;
    }
    assert.equal(artifact.replayPolicy.admissionProvenanceHash,
      hash(ordered.map(({ ledger: l }) => ({ coordinate: l.coordinate, admission: l.admission,
        operationHash: l.operationHash, scopeHash: l.scopeHash }))), 'admission aggregate preimage');
    assert.equal(artifact.replayPolicy.publicationEvidenceHash,
      hash({ version: 1, basisHash: hash(basis), runAuthorizationHash: hash(basis.runAuthorization),
        translationHash: basis.translationHash, bootstrapHash: hash(basis.bootstrap),
        sourceManifestHash: basis.sourceManifestHash }), 'publication aggregate preimage');
    assert.equal(artifact.learnedPlanHash, hash(artifact.learnedPlan), 'learned plan preimage');
    assert.equal(artifact.replayPolicy.learnedPlanHash, artifact.learnedPlanHash, 'policy plan pin');
    const usedInputs = new Set(basis.preparations.flatMap(fact => {
      const operation = fact.proposal.operation, argument = operation.value ?? operation.expected;
      return operation.kind === 'navigate' ? [operation.destinationInputId]
        : ['authoredLiteral', 'secretRef'].includes(argument?.kind) ? [argument.sourceInputId] : [];
    }));
    assert.deepEqual(artifact.inputRecipes.map(input => input.inputId).sort(), [...usedInputs].sort(),
      'candidate replay recipes exclude unused retained materialization');
    // One collapsed tuple (ADR-SC-005 "Contracts"): the profile is {contract:3}; the build identity
    // is compared separately and pins the profile by hash.
    assert.deepEqual(artifact.profile, { contract: 3 });
    assert.deepEqual(artifact.learnedPlan.versions, { contract: 3 });
    if (sample.hashes) {
      assert.equal(sample.hashes.operationEquivalenceHash, hash({ operations: artifact.steps.flatMap(step => step.operations),
        guards: artifact.guards, inputRecipes: artifact.inputRecipes, bindings: artifact.replayPolicy.bindings,
        transfers: artifact.replayPolicy.transfers }), 'operation aggregate preimage');
      assert.equal(sample.hashes.artifactHash, hash(artifact), 'choice artifact preimage');
      assert.equal(sample.hashes.referencePolicyHash, hash(artifact.replayPolicy), 'choice policy preimage');
      assert.equal(sample.hashes.learnedPlanHash, artifact.learnedPlanHash, 'choice plan pin');
      assert.equal(sample.hashes.publicationEvidenceHash, artifact.replayPolicy.publicationEvidenceHash,
        'choice extended evidence pin');
    }
    checked += 6;
  }
  assert.equal(publication.artifact.version, 3);
  assert.equal(publication.artifact.replayPolicy.schemaVersion, 4);
  assert.equal(publication.build.profileHash, hash({ contract: 3 }), 'build pins the collapsed profile');
  assert.equal(publication.build.schemaBundleHash,
    hash(JSON.parse(generator.outputs['studio-runner/src/validator/observedSchemas.json'])),
    'build pins the sole generated observed schema bundle');
  assert.equal(hash(publication.basis), publication.validationRequest.basisHash);
  assert.equal(hash(publication.basis.translationPlan), publication.basis.translationHash);
  assert.equal(hash(publication.artifact), publication.job.binding.artifactHash);
  assert.equal(hash(publication.job.configuration), publication.job.binding.configurationHash);
  assert.equal(publication.job.binding.learnedPlanHash, publication.artifact.learnedPlanHash);
  assert.equal(publication.job.binding.referencePolicyHash, hash(publication.artifact.replayPolicy));
  assert.equal(publication.job.binding.publicationEvidenceHash,
    publication.artifact.replayPolicy.publicationEvidenceHash);
  assert.equal(publication.basis.learningProvenance.guidedPromptHash, null);
  assert(publication.basis.learningProvenance.outputContractHash);
  // Observed-choice witness (OBS-006, carried into v3): independent proof, never an explicit null.
  const choice = publication.observedChoice;
  assert(choice, 'independently authored observed-choice baseline is required');
  const validateBasis = ajv.getSchema(base + 'replay-validation.schema.json#/definitions/ValidationBasis');
  const prep = choice.basis.preparations.find(p => p.observedChoice), w = prep.observedChoice;
  const captureHeader = choice.basis.materializationEvidence.versions[w.context.questionCapture.contextRevision - 1];
  assert.equal(w.context.questionCapture.authoredInputsHash, captureHeader.authoredInputsHash,
    'new synthetic original question binds its actual captured materialization version');
  assert.equal(prep.proof.authoredInputsHash, captureHeader.authoredInputsHash);
  assert.equal(choice.basis.bootstrap.inputsHash,
    choice.basis.materializationEvidence.versions[choice.basis.bootstrap.contextRevision - 1].authoredInputsHash);
  assert.equal(w.receipt.contextIdentityHash, hash(w.context));
  assert.equal(w.receipt.meaningsHash, hash(w.meanings));
  assert.equal(w.receipt.questionCaptureHash, hash(w.context.questionCapture));
  assert.equal(w.context.questionCapture.modelQuestionHash, hash(w.attempt.modelQuestion));
  assert.equal(w.questionPlan.planHash, hash(w.questionPlan.plan));
  // The fresh node is independently proved: a later generation, whose runner-reported identity is the accepted choice's stored selection.
  const accepted = w.meanings.find(meaning => meaning.choiceId === w.receipt.answer.choiceId);
  assert(accepted, 'the receipt names one of the witness meanings');
  assert(prep.proposal.target.generation > w.receipt.answer.generation, 'refresh node is independently proved');
  assert.deepEqual(prep.proof.target.identity, { role: accepted.selection.role, name: accepted.selection.name },
    'the fresh preparation proves the identity of the accepted selection');
  assert(publication.basis.preparations.every(p => !Object.hasOwn(p, 'observedChoice')), 'zero-choice optional evidence is omitted');
  const singleton = structuredClone(choice.basis), single = singleton.preparations.find(p => p.observedChoice).observedChoice;
  single.meanings.splice(0, 1); single.context.question.choices.splice(0, 1); single.attempt.modelQuestion.choices.splice(0, 1);
  single.context.questionCapture.modelQuestionHash = hash(single.attempt.modelQuestion);
  single.receipt.contextIdentityHash = hash(single.context); single.receipt.meaningsHash = hash(single.meanings);
  single.receipt.questionCaptureHash = hash(single.context.questionCapture);
  assert(!validateBasis(singleton), 'coherently resealed one-alternative witness must refuse');
  const nullProof = structuredClone(choice.basis);
  nullProof.preparations.find(p => p.observedChoice).observedChoice = null;
  assert(!validateBasis(nullProof), 'optional proof cannot be explicit null');
  checked += 8;
  const vectors = readJson('publication-canonical-vectors.json');
  for (const vector of vectors.positive) {
    assert.equal(Buffer.from(canonical(vector.input)).toString('hex'), vector.canonicalUtf8Hex);
    assert.equal(hash(vector.input), vector.sha256);
    checked++;
  }
  return checked;
}

// The one public OpenAPI: guided sessions under /api/v1/studio, the observed replay routes, no
// retired generation or compile route.
const guidedOperations = ['POST /guided-sessions', 'GET /guided-sessions/latest', 'GET /guided-sessions/{id}', 'GET /guided-sessions/{id}/result',
  'GET /guided-sessions/{id}/clarification', 'POST /guided-sessions/{id}/clarify', 'POST /guided-sessions/{id}/cancel',
  'POST /guided-sessions/{id}/finalize', 'GET /guided-sessions/{id}/video'];
// AR-1 (STUDIO-OBS-013): the recording refusals shared through components.responses.
const sharedVideoRefusals = { '404': 'VideoNoEvidence', '410': 'VideoExpired', '416': 'VideoRangeNotSatisfiable' };
const retiredOperations = ['POST /tests/{id}/compile', 'POST /tests/{id}/confirm-compile', 'POST /v1/validate',
  'POST /v1/runs', 'DELETE /v1/runs/{id}'];
function runPublicApi() {
  const text = fs.readFileSync(publicApiPath, 'utf8');
  const api = YAML.parse(text, { uniqueKeys: true });
  assert(!api.components.schemas.LegacyAuthoringRequest, 'retired v1 authoring component is removed');
  const fixture = readJson('publication-fixtures.json');
  for (const retired of ['/api/v3', 'openapi-v3', 'openapi-v2', 'contracts/v2/', '/internal/v1/', 'COMPILE_REQUIRED']) {
    assert(!text.includes(retired), `the public document must not mention ${retired}`);
  }
  const operations = [];
  for (const [route, item] of Object.entries(api.paths)) {
    for (const method of Object.keys(item)) if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) operations.push(`${method.toUpperCase()} ${route}`);
  }
  for (const retired of retiredOperations) assert(!operations.includes(retired), `retired operation still declared: ${retired}`);
  assert.equal(operations.length, 32, 'OBS-015 changes contracts on existing operations only; OBS-008 C-int W1 adds getStudioTestCapabilities; STUDIO-UNIFY-001.6 adds readLatestGuidedAttempts; STUDIO-GOV-001.3 removes the five guided-policy operations; STUDIO-GOV-001.2 removes the eight Studio schedule operations');
  assert(operations.includes('DELETE /v2/runs/{id}'), 'runner cancellation is DELETE /v2/runs/{id}');
  assert(operations.includes('POST /tests/{id}/validate-variables'), 'validate-variables stays documented (CLN-12)');
  const pointer = (root, fragment) => (fragment || '').replace(/^#?\//, '').split('/').filter(Boolean)
    .reduce((value, part) => { const next = value?.[part.replace(/~1/g, '/').replace(/~0/g, '~')]; assert.notEqual(next, undefined, `unresolved ${fragment}`); return next; }, root);
  function resolve(ref) {
    if (ref.startsWith('#/')) return pointer(api, ref);
    const match = /^\.\.\/studio-observed-authoring\/contracts\/v3\/([a-z-]+\.schema\.json|publication-fixtures\.json)(?:#(.*))?$/.exec(ref);
    assert(match, `observed references stay in contracts/v3: ${ref}`);
    if (match[1] === 'publication-fixtures.json') return pointer(fixture, match[2]);
    const id = base + match[1] + (match[2] ? '#' + match[2] : '');
    assert(ajv.getSchema(id), `unresolved v3 schema ${id}`);
    return { $ref: id };
  }
  (function references(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') resolve(value.$ref);
    for (const child of Object.values(value)) references(child);
  })(api);
  let examples = 0;
  function content(media) {
    const json = media?.['application/json'];
    assert(json, 'JSON body');
    const validate = ajv.compile(json.schema.$ref ? resolve(json.schema.$ref) : json.schema);
    const values = json.example !== undefined ? [json.example]
      : Object.values(json.examples || {}).map(example => example.$ref ? resolve(example.$ref).value : example.value);
    assert(values.length, 'example required');
    for (const value of values) { canonical(value); assert(validate(value), JSON.stringify(validate.errors)); examples++; }
  }
  for (const route of ['/v2/validate-observed', '/v2/runs', '/internal/studio/executions/{id}/observed-admission']) {
    const op = api.paths[route]?.post;
    assert(op);
    assert.deepEqual(op.security, [{ serviceIdentity: [] }]);
    assert.equal(op['x-internal'], true);
    assert(op.requestBody.required);
    content(op.requestBody.content);
    const status = route === '/v2/runs' ? '202' : '200';
    assert(op.responses[status]);
    if (op.responses[status].content) content(op.responses[status].content);
  }
  assert.equal(api.components.securitySchemes.serviceIdentity.type, 'http');
  assert.equal(api.components.securitySchemes.serviceIdentity.scheme, 'bearer');
  const guided = operations.filter(operation => operation.split(' ')[1].startsWith('/guided-sessions'));
  assert.deepEqual([...guided].sort(), [...guidedOperations].sort(), 'nine guided-session routes');
  // STUDIO-UNIFY-001.6 AC-10: the documented 200 example of the latest-attempts read validates against its schema.
  const latest = api.paths['/guided-sessions/latest'].get;
  assert.equal(latest.operationId, 'readLatestGuidedAttempts');
  content(latest.responses['200'].content);
  // Both recording routes reference the shared refusals (AR-1 addendum E-1, landed in OBS-014 C2a):
  // reference equality, not a literal comparison. Status sets stay pinned.
  const guidedVideo = api.paths['/guided-sessions/{id}/video'].get;
  const executionVideo = api.paths['/executions/{id}/video'].get;
  assert.equal(guidedVideo.operationId, 'getGuidedSessionVideo');
  assert.deepEqual(Object.keys(guidedVideo.responses).sort(), ['200', '206', '401', '403', '404', '410', '416', '503']);
  assert.deepEqual(Object.keys(executionVideo.responses).sort(), ['200', '206', '401', '403', '404', '410', '416', '503'],
    'getExecutionVideo status set is unchanged');
  for (const [status, component] of Object.entries(sharedVideoRefusals)) {
    const shared = `#/components/responses/${component}`;
    assert(api.components.responses[component], `shared ${component} is declared`);
    assert.deepEqual(guidedVideo.responses[status], { $ref: shared }, `guided ${status} is shared`);
    assert.deepEqual(executionVideo.responses[status], { $ref: shared }, `execution ${status} is shared`);
  }
  for (const status of ['200', '206']) {
    assert.deepEqual(guidedVideo.responses[status].content, executionVideo.responses[status].content, `${status} media`);
  }
  assert.deepEqual(guidedVideo.responses['206'].headers, executionVideo.responses['206'].headers, '206 headers');
  for (const operation of guided) {
    const [method, route] = operation.split(' ');
    const op = api.paths[route][method.toLowerCase()];
    assert.deepEqual(op.tags, ['guided-sessions']);
    assert.equal(op.security, undefined, 'public BFF routes inherit the platform session like every public operation');
    assert.equal(op.responses['401'].$ref, '#/components/responses/SessionUnauthorized');
    if (method === 'POST') {
      const parameters = [...(api.paths[route].parameters || []), ...(op.parameters || [])].map(p => p.$ref ? resolve(p.$ref) : p);
      assert(parameters.some(p => p.name === 'Idempotency-Key' && p.in === 'header' && p.required), `${operation} requires Idempotency-Key`);
      assert(op.requestBody?.required);
      content(op.requestBody.content);
    }
    for (const [status, response] of Object.entries(op.responses)) {
      if (!/^2/.test(status) || !response.content) continue;
      // The video route's success bodies are bytes, not v3 JSON documents.
      if (route.endsWith('/video')) assert.deepEqual(Object.keys(response.content), ['video/webm']);
      else content(response.content);
    }
    assert(!JSON.stringify(op).includes('accountRef') && !JSON.stringify(op).includes('authConnection'));
  }
  // STUDIO-OBS-014 C2b: startGuidedSession refuses a conflict with the closed v3 error (409) and a
  // budget with v3 BUDGET_EXCEEDED or the platform RATE_LIMITED (429 + Retry-After).
  const start = api.paths['/guided-sessions'].post;
  assert.deepEqual(Object.keys(start.responses).sort(), ['202', '400', '401', '403', '409', '422', '429', '503']);
  const v3Error = ajv.getSchema(base + 'error.schema.json');
  assert.equal(start.responses['409'].content['application/json'].schema.$ref, '../studio-observed-authoring/contracts/v3/error.schema.json');
  for (const example of Object.values(start.responses['409'].content['application/json'].examples)) {
    assert(v3Error(example.value), JSON.stringify(v3Error.errors));
    assert(example.value.code === 'REVISION_CONFLICT');
    assert(['FIRST_LEARN_STEP_NARROWED',
      'FIRST_LEARN_STEP_UNKNOWN', 'BASE_REVISION_MISMATCH', 'BASE_IDENTITY_INCOMPLETE']
      .includes(example.value.messageCode));
    examples++;
  }
  for (const example of Object.values(start.responses['403'].content['application/json'].examples)) {
    assert(v3Error(example.value), JSON.stringify(v3Error.errors));
    assert(example.value.code === 'ORIGIN_NOT_ALLOWED' && example.value.retryable === false);
    examples++;
  }
  const budget = start.responses['429'];
  assert.deepEqual(budget.headers['Retry-After'].schema, { type: 'integer', minimum: 1 }, 'Retry-After is whole seconds >= 1');
  let budgetExamples = 0;
  for (const example of Object.values(budget.content['application/json'].examples)) {
    if (example.value.schemaVersion === 3) {
      assert(v3Error(example.value) && example.value.code === 'BUDGET_EXCEEDED', JSON.stringify(v3Error.errors));
    } else {
      assert.equal(example.value.error.code, 'RATE_LIMITED', 'the platform filter envelope');
    }
    budgetExamples++;
    examples++;
  }
  assert.equal(budgetExamples, 4);
  assert(Object.values(budget.content['application/json'].examples).some(example =>
    example.value.messageCode === 'LEARNING_CAPACITY_EXHAUSTED' && example.value.retryable === true), 'learning capacity example');
  // O-1: canonical authoring is the only create/update/detail path; list stays its own projection.
  assert.equal(api.components.schemas.TestPage.properties.data.items.$ref, '#/components/schemas/TestDto');
  assert.equal(api.paths['/tests/{id}'].get.responses['200'].content['application/json'].schema.$ref,
    '#/components/schemas/TestDetailDto');
  const publicAjv = new Ajv({ allErrors: true, strict: false }); addFormats(publicAjv);
  publicAjv.addFormat('int64', true);
  function jsonSchema(value) {
    if (Array.isArray(value)) return value.map(jsonSchema);
    if (!value || typeof value !== 'object') return value;
    const converted = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'nullable' && !key.startsWith('x-'))
      .map(([key, child]) => [key, key === '$ref' ? child.replace('#/components/schemas/', '#/definitions/') : jsonSchema(child)]));
    return value.nullable ? { anyOf: [converted, { type: 'null' }] } : converted;
  }
  const definitions = jsonSchema(api.components.schemas);
  const canonicalWrite = publicAjv.compile({ definitions, $ref: '#/definitions/TestRequest' });
  const canonicalDetail = publicAjv.compile({ definitions, $ref: '#/definitions/TestDetailDto' });
  for (const example of Object.values(api.paths['/tests/{id}'].get.responses['200'].content['application/json'].examples)) {
    assert(canonicalDetail(example.value), JSON.stringify(canonicalDetail.errors)); examples++;
  }
  let writeExample;
  for (const [route, method] of [['/tests', 'post'], ['/tests/{id}', 'put']]) {
    const op = api.paths[route][method];
    assert.equal(op.requestBody.content['application/json'].schema.$ref, '#/components/schemas/TestRequest');
    assert.equal(op.responses[method === 'post' ? '201' : '200'].content['application/json'].schema.$ref,
      '#/components/schemas/TestDetailDto');
    for (const example of Object.values(op.requestBody.content['application/json'].examples)) {
      assert(canonicalWrite(example.value), JSON.stringify(canonicalWrite.errors));
      assert(new Set(example.value.steps.map(step => step.id)).size === example.value.steps.length);
      writeExample = example.value; examples++;
    }
  }
  for (const mutate of [v => delete v.authoringSchemaVersion, v => { v.authoringSchemaVersion = 1; },
    v => { v.steps = v.steps.map(step => step.text); }, v => { v.browser = 'chrome'; },
    v => { v.variables = [{ name: 'vault://studio/customer-password', kind: 'secretRef' }]; },
    v => { v.variables = [{ name: 'alias', kind: 'secretRef', secretId: '..' }]; }]) {
    const value = structuredClone(writeExample); mutate(value);
    assert(!canonicalWrite(value), 'retired/invalid authoring write must refuse'); examples++;
  }
  const opaque = structuredClone(writeExample);
  opaque.variables = [{ name: 'vault://studio/customer-password', kind: 'secretRef', secretId: 'LOGIN_PASSWORD' }];
  assert(canonicalWrite(opaque), 'opaque exact alias with explicit secretId remains valid'); examples++;
  return { operations: operations.length, examples };
}

// OBS-015: pure fact joins over the closed extended basis. The fixture authority argument models
// already authenticated transport/database facts; a receipt hash or a document boolean is never
// authentication. This oracle performs no callback, DB, browser, model or publication operation.
function validateExtendedBasis(basis, authority) {
  structural('replay-validation#/definitions/ValidationBasis', basis);
  if (authority.rawGraph) {
    same(basis.allocations, authority.rawGraph.allocations, 'GRAPH_RAW_AUTHORITY');
    same(basis.consumerEdges, authority.rawGraph.consumerEdges, 'GRAPH_RAW_AUTHORITY');
    same(basis.producers, authority.rawGraph.producers, 'GRAPH_RAW_AUTHORITY');
    check(basis.bootstrap.allocationHash === authority.rawGraph.bootstrapAllocationHash, 'GRAPH_RAW_AUTHORITY');
  }
  const scopeHash = hash(basis.scope), evidence = basis.materializationEvidence;
  const headers = evidence.versions, entries = evidence.entries;
  unique(entries, entry => entry.inputId, 'INPUT_IDENTITY');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i], full = authority.privateInputs.inputs[i];
    check(full && entry.inputOrdinal === i && entry.inputId === full.inputId, 'INPUT_IDENTITY');
    const { value, ...metadata } = full;
    same(entry.metadata, metadata, 'INPUT_METADATA');
    check(entry.inputHash === hash(full), 'INPUT_HASH');
    check(Buffer.byteLength(canonical(full)) <= 32768, 'INPUT_LIMIT');
  }
  check(entries.length === authority.privateInputs.inputs.length, 'INPUT_IDENTITY');
  let previous = null, previousCount = -1, previousBirth = 0;
  const stableHeader = header => Object.fromEntries(['schemaVersion', 'sessionId', 'workerId',
    'ownerFence', 'scopeHash', 'contextId', 'sourceRevision', 'configurationRevision']
    .map(field => [field, header[field]]));
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    check(header.contextRevision === i + 1 && header.previousInputsHash === previous
      && header.inputCount > previousCount && header.inputCount <= entries.length
      && header.birthMaterializationRevision > previousBirth, 'VERSION_CHAIN');
    same(stableHeader(header), stableHeader(headers[0]), 'VERSION_IDENTITY');
    check(header.sessionId === basis.sessionId && header.scopeHash === scopeHash
      && header.contextId === basis.bootstrap.contextId && header.ownerFence === basis.bootstrap.ownerFence
      && header.sourceRevision === basis.sourceRevision
      && header.configurationRevision === basis.configurationRevision, 'VERSION_IDENTITY');
    const inputs = authority.privateInputs.inputs.slice(0, header.inputCount);
    const table = { schemaVersion: 3, sessionId: header.sessionId, scopeHash: header.scopeHash,
      sourceRevision: header.sourceRevision, configurationRevision: header.configurationRevision, inputs };
    check(hash(table) === header.authoredInputsHash && Buffer.byteLength(canonical(table)) <= 1048576,
      'VERSION_RECONSTRUCTION');
    for (let ordinal = previousCount < 0 ? 0 : previousCount; ordinal < header.inputCount; ordinal++) {
      check(entries[ordinal].introducedContextRevision === header.contextRevision, 'INPUT_INTRODUCTION');
    }
    previous = header.authoredInputsHash; previousCount = header.inputCount;
    previousBirth = header.birthMaterializationRevision;
  }
  check(previous === basis.authoredInputsHash && previousCount === entries.length, 'FINAL_INPUT_VERSION');
  const bootstrapHeader = headers[basis.bootstrap.contextRevision - 1];
  check(bootstrapHeader && basis.bootstrap.inputsHash === bootstrapHeader.authoredInputsHash
    && basis.bootstrap.materializationRevision >= bootstrapHeader.birthMaterializationRevision,
  'BOOTSTRAP_INPUT_VERSION');
  check(entries.reduce((bytes, entry) => bytes + Buffer.byteLength(canonical(
    authority.privateInputs.inputs[entry.inputOrdinal])), 0) <= 1048576, 'INPUT_LIMIT');
  const allFacts = [...basis.actions, ...(basis.incrementalEvidence?.excludedAttempts ?? []).map(x => x.action)];
  check(allFacts.length <= 200, 'ATTEMPT_BUDGET');
  unique(allFacts, fact => fact.ledger.admission.admissionId, 'ADMISSION_IDENTITY');
  same(allFacts.map(fact => fact.ledger.admission.admissionId).sort(),
    authority.ledgers.map(ledger => ledger.admission.admissionId).sort(), 'OMITTED_ATTEMPT');
  const actionJoin = (fact, preparation, association, excluded = false) => {
    const ledger = fact.ledger, proposal = preparation?.proposal, proof = preparation?.proof;
    check(proposal && proof && association, 'ACTION_JOIN');
    const header = headers[ledger.contextRevision - 1];
    check(header && ledger.sessionId === basis.sessionId && ledger.scopeHash === scopeHash
      && ledger.ownerFence === header.ownerFence, 'ACTION_IDENTITY');
    check(ledger.authoredInputsHash === header.authoredInputsHash
      && proposal.authoredInputsHash === header.authoredInputsHash
      && proof.authoredInputsHash === header.authoredInputsHash
      && proposal.contextRevision === header.contextRevision && proof.contextRevision === header.contextRevision,
    'HISTORICAL_VERSION');
    for (const document of [proposal, proof]) {
      check(document.sessionId === basis.sessionId && document.scopeHash === scopeHash, 'ACTION_IDENTITY');
    }
    check(proof.workerId === header.workerId && proof.ownerFence === header.ownerFence
      && proof.contextId === header.contextId && proof.sourceRevision === header.sourceRevision
      && proof.configurationRevision === header.configurationRevision, 'ACTION_IDENTITY');
    const captured = authority.preparations.find(p => p.preparationId === fact.preparationId);
    check(captured && preparation.materializationRevision === captured.materializationRevision
      && preparation.materializationRevision >= header.birthMaterializationRevision, 'PREPARATION_REVISION');
    check(fact.preparationId === preparation.preparationId && fact.preparationId === proof.preparationId
      && fact.preparationId === ledger.preparationId && fact.obligationId === association.obligationId
      && association.admissionId === ledger.admission.admissionId, 'ACTION_JOIN');
    same(association.coordinate, ledger.coordinate, 'ACTION_JOIN');
    same(proposal.coordinate, ledger.coordinate, 'ACTION_JOIN');
    same(proposal.executionEvidence, ledger.executionEvidence, 'EVIDENCE_IDENTITY');
    same(preparation.executionEvidence, ledger.executionEvidence, 'EVIDENCE_IDENTITY');
    check(ledger.evidenceHash === hash(ledger.executionEvidence) && proof.evidenceHash === ledger.evidenceHash
      && proposal.evidenceHash === ledger.evidenceHash, 'EVIDENCE_HASH');
    const digest = hash(proposal);
    check(ledger.requestDigest === digest && proof.requestDigest === digest && association.proposalHash === digest,
      'PROPOSAL_DIGEST');
    check(ledger.operationHash === hash(proposalOperationIdentity(proposal, proof)), 'OPERATION_HASH');
    check(ledger.admission.policyDecisionHash === hash({ scopeHash, preparation: proof, requestDigest: digest }),
      'POLICY_DECISION');
    same(ledger, authority.ledgers.find(l => l.admission.admissionId === ledger.admission.admissionId), 'LEDGER_IMMUTABLE');
    if (excluded) check(ledger.state === 'FAILED' && ledger.outcomeCode === 'TARGET_CHANGED'
      && ledger.dispatchCount === 1 && ledger.attemptOrdinal === 0, 'EXCLUDED_ATTEMPT');
    else check(ledger.state === 'SUCCEEDED' && ledger.outcomeCode === 'OK' && ledger.dispatchCount === 1,
      'EFFECTIVE_ATTEMPT');
  };
  unique(basis.actions, fact => key(fact.ledger.coordinate), 'SEMANTIC_COORDINATE');
  const counts = new Map(); let prior = -1;
  for (const fact of basis.actions) {
    const coordinate = fact.ledger.coordinate, index = basis.sourceSteps.findIndex(s => s.stepId === coordinate.stepId);
    check(index >= prior && index >= 0 && coordinate.ordinal < 8
      && coordinate.ordinal === (counts.get(coordinate.stepId) ?? 0), 'ACTION_ORDER');
    prior = index; counts.set(coordinate.stepId, coordinate.ordinal + 1);
    actionJoin(fact, basis.preparations.find(p => p.preparationId === fact.preparationId),
      basis.obligationAssociations.find(a => a.admissionId === fact.ledger.admission.admissionId));
  }
  check(basis.sourceSteps.every(step => counts.has(step.stepId)), 'INCOMPLETE_PLAN');
  if (basis.incrementalEvidence === null) {
    check(basis.actions.every(fact => fact.ledger.attemptOrdinal === 0), 'ATTEMPT_ORDINAL');
    validateSnapshotGraph(basis, authority.snapshot);
    return;
  }
  const x = basis.incrementalEvidence, plan = x.plan, program = x.program, switched = x.switch;
  check(plan.sessionId === basis.sessionId && plan.testId === basis.testId && plan.csiId === basis.csiId
    && switched.sessionId === basis.sessionId && x.firstSuffixAcceptance.sessionId === basis.sessionId,
  'INCREMENTAL_IDENTITY');
  check(plan.prefixProgramHash === hash(program) && plan.baseRevisionId === program.baseRevisionId
    && plan.baseRevisionId === switched.baseRevisionId, 'PROGRAM_PIN');
  same(program.sourceStepIds, basis.sourceSteps.slice(0, plan.initialFirstLearnIndex).map(s => s.stepId), 'CONTIGUOUS_PREFIX');
  check(plan.initialFirstLearnStepId === basis.sourceSteps[plan.initialFirstLearnIndex]?.stepId
    && switched.initialFirstLearnStepId === plan.initialFirstLearnStepId
    && switched.effectiveFirstLearnStepId === basis.sourceSteps[switched.effectiveFirstLearnIndex]?.stepId
    && switched.completedPrefixCount === switched.effectiveFirstLearnIndex, 'BOUNDARY_IDENTITY');
  const retained = basis.actions.filter(({ ledger: l }) => {
    const position = basis.sourceSteps.findIndex(s => s.stepId === l.coordinate.stepId);
    return position < switched.effectiveFirstLearnIndex || position === switched.effectiveFirstLearnIndex
      && l.coordinate.ordinal < switched.nextSemanticOrdinal;
  }).map(fact => fact.ledger.admission.admissionId);
  same(retained, switched.retainedPrefixAdmissionIds, 'RETAINED_ADMISSIONS');
  same(retained, x.firstSuffixAcceptance.retainedPrefixAdmissionIds, 'RETAINED_ADMISSIONS');
  check(hash(retained) === switched.retainedPrefixAdmissionsHash
    && x.firstSuffixAcceptance.planRevision === x.firstSuffixAcceptance.previousPlanRevision + 1, 'SWITCH_HASH');
  check(BigInt(x.firstSuffixAcceptance.planRevision) <= BigInt(basis.translationRevision), 'GRAPH_FIRST_SUFFIX');
  unique(x.prefixRequests, request => hash(request), 'PREFIX_REQUEST');
  for (const request of x.prefixRequests) {
    const header = headers[request.contextRevision - 1];
    check(header && request.sessionId === basis.sessionId && request.scopeHash === scopeHash
      && request.workerId === header.workerId && request.ownerFence === header.ownerFence
      && request.contextId === header.contextId && request.authoredInputsHash === header.authoredInputsHash
      && request.sourceRevision === header.sourceRevision && request.configurationRevision === header.configurationRevision
      && request.prefixProgramHash === plan.prefixProgramHash, 'PREFIX_REQUEST');
    check(program.actions.some(action => key(action.coordinate) === key(request.coordinate)), 'PREFIX_COORDINATE');
  }
  for (const admissionId of retained) {
    const ledger = basis.actions.find(fact => fact.ledger.admission.admissionId === admissionId).ledger;
    check(x.prefixRequests.some(request => key(request.coordinate) === key(ledger.coordinate)
      && request.evidenceHash === ledger.evidenceHash && request.contextRevision === ledger.contextRevision
      && request.authoredInputsHash === ledger.authoredInputsHash), 'PREFIX_REQUEST');
  }
  if (switched.reason !== 'DRIFT') {
    check(x.driftReceipt === null && x.excludedAttempts.length === 0 && switched.driftReceiptHash === null
      && switched.effectiveFirstLearnIndex === plan.initialFirstLearnIndex
      && basis.actions.every(fact => fact.ledger.attemptOrdinal === 0), 'BOUNDARY_ATTEMPT');
    validateSnapshotGraph(basis, authority.snapshot);
    return;
  }
  const receipt = x.driftReceipt;
  check(receipt && switched.driftReceiptHash === receipt.receiptHash, 'DRIFT_RECEIPT');
  const { receiptHash, ...body } = receipt;
  check(hash(body) === receiptHash, 'RECEIPT_HASH');
  const request = x.prefixRequests.find(request => hash(request) === receipt.requestDigest);
  check(request, 'RECEIPT_REQUEST');
  for (const field of Object.keys(request)) same(receipt[field], request[field], 'RECEIPT_IDENTITY');
  const trusted = authority.authenticatedReceipt;
  check(trusted && trusted.jwtAlgorithm === 'RS256' && trusted.mtlsVerified === true
    && trusted.subject === request.workerId && trusted.assignmentSessionId === basis.sessionId
    && trusted.ownerFence === request.ownerFence && trusted.receiptHash === receiptHash
    && trusted.liveOwner === true && trusted.nativeFence === 'REFUSED_BEFORE_INVOCATION', 'RECEIPT_AUTHENTICATION');
  check(receipt.nativeInvocationStarted === false && receipt.attemptOrdinal === 0
    && receipt.coordinate.stepId === switched.effectiveFirstLearnStepId
    && receipt.coordinate.ordinal === switched.nextSemanticOrdinal, 'NATIVE_FENCE');
  const action = program.actions.find(action => key(action.coordinate) === key(receipt.coordinate));
  check(action?.operationHash === receipt.operationHash, 'RECEIPT_OPERATION');
  if (receipt.phase === 'PRE_ADMISSION') {
    check(x.excludedAttempts.length === 0 && basis.actions.every(fact => fact.ledger.attemptOrdinal === 0), 'EXCLUDED_ATTEMPT');
  } else {
    check(x.excludedAttempts.length === 1, 'EXCLUDED_ATTEMPT');
    const excluded = x.excludedAttempts[0], ledger = excluded.action.ledger;
    actionJoin(excluded.action, excluded.preparation, excluded.obligationAssociation, true);
    check(receipt.admissionId === ledger.admission.admissionId && receipt.preparationId === ledger.preparationId
      && ledger.operationHash === receipt.operationHash && ledger.evidenceHash === receipt.evidenceHash
      && ledger.contextRevision === receipt.contextRevision && ledger.authoredInputsHash === receipt.authoredInputsHash,
    'EXCLUDED_RECEIPT_JOIN');
    same(receipt.coordinate, ledger.coordinate, 'EXCLUDED_RECEIPT_JOIN');
    const replacement = basis.actions.find(fact => key(fact.ledger.coordinate) === key(ledger.coordinate));
    check(replacement?.ledger.attemptOrdinal === 1 && replacement.ledger.admission.admissionId !== receipt.admissionId
      && basis.actions.every(fact => fact === replacement || fact.ledger.attemptOrdinal === 0), 'ATTEMPT_ORDINAL');
  }
  validateSnapshotGraph(basis, authority.snapshot);
}

function runIncremental() {
  const fixture = readJson('publication-fixtures.json').incrementalContracts;
  let checked = 0;
  for (const test of fixture.wireCases) {
    const validate = ajv.getSchema(test.schema);
    assert(validate, test.schema);
    assert.equal(validate(test.value), test.valid, `${test.name}: ${JSON.stringify(validate.errors)}`); checked++;
  }
  for (const test of fixture.schemaCases) {
    const validate = ajv.getSchema(fixture.definitionLocations[test.definition]);
    assert(validate, test.definition);
    assert.equal(validate(test.value), test.valid, `${test.name}: ${JSON.stringify(validate.errors)}`); checked++;
  }
  for (const vector of fixture.canonicalVectors) {
    assert.equal(canonical(vector.input), vector.canonical, vector.name);
    assert.equal(Buffer.from(canonical(vector.input)).toString('hex'), vector.canonicalUtf8Hex, vector.name);
    assert.equal(hash(vector.input), vector.sha256, vector.name); checked++;
  }
  for (const test of fixture.basisCases) {
    let code = 'VALID';
    try {
      validateExtendedBasis(test.basis, test.authority);
      if (test.expectedArtifact) validateSnapshotGraph(test.basis, test.authority.snapshot, test.expectedArtifact);
    } catch (error) { code = error.code || 'INTERNAL_ERROR'; }
    assert.equal(code, test.expected, `${test.name}: ${code}`); checked++;
  }
  for (const test of fixture.resultCases) {
    let code = 'VALID';
    try {
      structural('result', test.value);
      const switched = test.switch;
      const expected = switched === null ? null : { stepId: switched.effectiveFirstLearnStepId,
        ...(switched.reason === 'DRIFT' ? { driftSwitchStepId: switched.effectiveFirstLearnStepId } : {}) };
      same(test.value.relearnedFrom, expected, 'RESULT_SWITCH');
      if (test.value.publication.receipt !== null) same(test.value.publication.receipt.relearnedFrom,
        expected, 'RECEIPT_SWITCH');
    } catch (error) { code = error.code || 'INTERNAL_ERROR'; }
    assert.equal(code, test.expected, `${test.name}: ${code}`); checked++;
  }
  const { base: original, edit4 } = fixture.tenStepChain;
  const equal = [];
  for (let i = 0; i < 10; i++) {
    for (const rows of [original, edit4]) {
      const row = rows[i];
      assert.equal(hash(row.stepInput), row.chain.stepInputHash);
      assert.equal(hash(row.chain), row.snapshot.inputChain);
      assert.equal(hash(row.learnedContent), row.snapshot.learnedStepHash);
      assert.equal(hash(row.snapshot), row.snapshotHash);
      if (i > 0) assert.equal(row.chain.previous, hash(rows[i - 1].chain));
    }
    if (original[i].snapshotHash === edit4[i].snapshotHash) equal.push(i + 1);
    checked++;
  }
  assert.deepEqual(equal, [1, 2, 3]);
  return checked;
}

// ARCH015-02: raw arrays remain complete evidence. Only this local graph view is projected.
// Core ledger/receipt/version/base authority checks run first in validateExtendedBasis. The wire
// cannot establish the unseen intermediate plan history; Java must audit its immutable DB rows.
function projectEffectiveGraph(basis) {
  const before = canonical(basis), inc = basis.incrementalEvidence;
  const allocations = new Map(), producers = new Map(), actions = new Map(), needs = new Map();
  const pair = value => `${value.stepId}:${value.argumentSlot}`;
  const slot = operation => operation.kind === 'assert' ? 'assert.expected' : `${operation.kind}.value`;
  const argument = operation => operation.value ?? operation.expected;
  const position = coordinate => basis.sourceSteps.findIndex(step => step.stepId === coordinate.stepId) * 8 + coordinate.ordinal;
  const actionOf = fact => {
    const preparation = basis.preparations.find(p => p.preparationId === fact.preparationId);
    return { fact, preparation, operation: preparation?.proposal.operation, ledger: fact.ledger };
  };
  for (const value of basis.allocations) { check(!allocations.has(value.bindingId), 'GRAPH_ALLOCATION'); allocations.set(value.bindingId, value); }
  for (const value of basis.producers) { check(!producers.has(value.bindingId), 'GRAPH_PRODUCER'); producers.set(value.bindingId, value); }
  for (const fact of basis.actions) { const value = actionOf(fact); check(!actions.has(value.ledger.admission.admissionId), 'GRAPH_ACTION'); actions.set(value.ledger.admission.admissionId, value); }
  for (const need of basis.translationPlan.needs) { check(!needs.has(need.bindingId), 'GRAPH_NEED'); needs.set(need.bindingId, need); }
  check(basis.bootstrap.allocationHash === hash(basis.allocations), 'GRAPH_RAW_ALLOCATION_HASH');
  const drift = inc?.switch.reason === 'DRIFT';
  const authorizeFirstSuffixProjection = () => {
    check(drift && inc.firstSuffixAcceptance.sessionId === basis.sessionId
      && inc.firstSuffixAcceptance.planRevision === inc.firstSuffixAcceptance.previousPlanRevision + 1
      && BigInt(inc.firstSuffixAcceptance.planRevision) <= BigInt(basis.translationRevision), 'GRAPH_FIRST_SUFFIX');
    same(inc.firstSuffixAcceptance.retainedPrefixAdmissionIds, inc.switch.retainedPrefixAdmissionIds, 'GRAPH_FIRST_SUFFIX');
    return true;
  };
  const baseBindings = new Map((basis.snapshotEvidence.baseProof?.artifact.learnedPlan.bindings ?? []).map(b => [b.bindingId, b]));
  const importedRead = id => {
    if (!drift || !inc.firstSuffixAcceptance || !basis.snapshotEvidence.baseProof) return null;
    const binding = baseBindings.get(id);
    const read = inc.program.actions.find(a => a.operation.kind === 'read' && a.operation.bindingId === id);
    return binding && read && key(binding.producer) === key(read.coordinate) ? { binding, read } : null;
  };
  const atOrAfter = coordinate => position(coordinate) >= inc.switch.effectiveFirstLearnIndex * 8 + inc.switch.nextSemanticOrdinal;
  const importedConsumer = (id, consumer) => {
    const original = importedRead(id); if (!original) return false;
    authorizeFirstSuffixProjection();
    return original.binding.consumers.some(edge => edge.coordinate.stepId === consumer.stepId && edge.argumentSlot === consumer.argumentSlot
      && atOrAfter(edge.coordinate) && inc.program.actions.some(action => key(action.coordinate) === key(edge.coordinate)
        && argument(action.operation)?.kind === 'binding' && argument(action.operation).bindingId === id
        && slot(action.operation) === consumer.argumentSlot));
  };
  const excluded = inc?.excludedAttempts ?? [], spent = excluded[0];
  check(excluded.length <= 1, 'GRAPH_EXCLUDED');
  const liveEdges = [], excludedEdges = [], seen = new Set();
  for (const edge of basis.consumerEdges) {
    const edgeId = `${edge.consumerAdmissionId}:${edge.argumentSlot}`; check(!seen.has(edgeId), 'GRAPH_EDGE'); seen.add(edgeId);
    let consumer = actions.get(edge.consumerAdmissionId), isExcluded = false;
    if (!consumer && spent?.action.ledger.admission.admissionId === edge.consumerAdmissionId) {
      const receipt = inc.driftReceipt, ledger = spent.action.ledger;
      check(drift && receipt?.phase === 'ADMITTED_PRE_INVOCATION' && receipt.nativeInvocationStarted === false
        && ledger.state === 'FAILED' && ledger.outcomeCode === 'TARGET_CHANGED' && ledger.dispatchCount === 1
        && ledger.attemptOrdinal === 0 && receipt.admissionId === edge.consumerAdmissionId
        && receipt.preparationId === spent.action.preparationId, 'GRAPH_EXCLUDED');
      consumer = { ledger, operation: spent.preparation.proposal.operation }; isExcluded = true;
    }
    check(consumer && (isExcluded || consumer.ledger.state === 'SUCCEEDED'), 'GRAPH_UNKNOWN_EDGE');
    const producer = producers.get(edge.bindingId), value = argument(consumer.operation);
    check(producer && value?.kind === 'binding' && value.bindingId === edge.bindingId
      && edge.producerAdmissionId === producer.producerAdmissionId && edge.argumentSlot === slot(consumer.operation)
      && edge.destinationOrigin === producer.origin && edge.destinationOrigin === consumer.ledger.executionEvidence.origin
      && position(producer.coordinate) < position(edge.coordinate), 'GRAPH_EDGE');
    same(edge.coordinate, consumer.ledger.coordinate, 'GRAPH_EDGE');
    (isExcluded ? excludedEdges : liveEdges).push(edge);
  }
  for (const value of actions.values()) {
    const arg = argument(value.operation), ledger = value.ledger;
    if (arg?.kind === 'binding') check(liveEdges.filter(e => e.consumerAdmissionId === ledger.admission.admissionId
      && e.bindingId === arg.bindingId && e.argumentSlot === slot(value.operation)).length === 1, 'GRAPH_MISSING_SUCCESSFUL_EDGE');
    if (value.operation.kind === 'read') check(producers.get(value.operation.bindingId)?.producerAdmissionId === ledger.admission.admissionId, 'GRAPH_PRODUCER');
  }
  for (const [id, producer] of producers) {
    const actual = actions.get(producer.producerAdmissionId), raw = allocations.get(id), need = needs.get(id);
    check(actual && actual.operation.kind === 'read' && actual.operation.bindingId === id && raw && need
      && need.needId === raw.needId && need.producerStepId === raw.producerStepId
      && producer.coordinate.stepId === raw.producerStepId && producer.origin === actual.ledger.executionEvidence.origin, 'GRAPH_PRODUCER');
    same(producer.coordinate, actual.ledger.coordinate, 'GRAPH_PRODUCER'); same(producer.recipe, actual.operation.recipe, 'GRAPH_PRODUCER');
    const proof = actual.preparation.proof;
    same(producer.availability, { bindingId: id, producerAdmissionId: producer.producerAdmissionId,
      contextId: proof.contextId, workerId: proof.workerId, ownerFence: proof.ownerFence }, 'GRAPH_AVAILABILITY');
    const original = importedRead(id);
    if (original && inc.switch.retainedPrefixAdmissionIds.includes(producer.producerAdmissionId)) {
      check(actual.ledger.operationHash === original.read.operationHash && producer.origin === original.binding.sourceOrigin, 'GRAPH_IMPORT_IDENTITY');
      same(actual.operation, original.read.operation, 'GRAPH_IMPORT_IDENTITY'); same(producer.recipe, original.binding.recipe, 'GRAPH_IMPORT_IDENTITY');
    }
    const edges = liveEdges.filter(edge => edge.bindingId === id), used = new Set(edges.map(edge => pair({ stepId: edge.coordinate.stepId, argumentSlot: edge.argumentSlot })));
    check(need.consumers.length === used.size && need.consumers.every(consumer => used.has(pair(consumer))), 'GRAPH_NEED');
    for (const edge of edges) check(raw.consumers.some(consumer => pair(consumer) === pair({ stepId: edge.coordinate.stepId, argumentSlot: edge.argumentSlot })), 'GRAPH_RAW_INTENT');
    for (const consumer of raw.consumers) if (!used.has(pair(consumer))) check(importedConsumer(id, consumer), 'GRAPH_IMPORT_ONLY');
    if (edges.length === 0) check(importedRead(id) && authorizeFirstSuffixProjection()
      && inc.switch.retainedPrefixAdmissionIds.includes(producer.producerAdmissionId), 'GRAPH_ZERO_CONSUMER');
  }
  check(producers.size === needs.size, 'GRAPH_ORPHAN_NEED');
  for (const [id, raw] of allocations) if (!producers.has(id)) {
    const original = importedRead(id);
    check(original && authorizeFirstSuffixProjection() && atOrAfter(original.read.coordinate) && !needs.has(id)
      && !basis.consumerEdges.some(edge => edge.bindingId === id)
      && raw.producerStepId === original.read.coordinate.stepId
      && raw.consumers.every(consumer => importedConsumer(id, consumer)), 'GRAPH_ORPHAN_ALLOCATION');
  }
  const utf8 = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));
  const transfers = liveEdges.map(edge => ({ bindingId: edge.bindingId,
    producer: producers.get(edge.bindingId).coordinate, consumer: edge.coordinate,
    slot: edge.argumentSlot, origin: edge.destinationOrigin }))
    .sort((left, right) => position(left.producer) - position(right.producer)
      || position(left.consumer) - position(right.consumer) || utf8(left.slot, right.slot)
      || utf8(left.bindingId, right.bindingId));
  same(basis.transfers, transfers, 'GRAPH_TRANSFER_BIJECTION');
  same(canonical(basis), before, 'GRAPH_RAW_MUTATED');
  return { liveEdges, excludedEdges, transfers };
}

function validateSnapshotGraph(basis, authority, candidate) {
  validateObservationAccounting(basis);
  const graph = projectEffectiveGraph(basis);
  // The immutable helper sees only a local graph input. No projected arrays/hash are serialized
  // as publication evidence: all commitments still hash the untouched complete original basis.
  const derived = snapshotOracle.validate({ ...basis, consumerEdges: graph.liveEdges }, authority, candidate);
  if (candidate) {
    same(candidate.replayPolicy.bindings, basis.bindings, 'GRAPH_CANDIDATE_BINDINGS');
    same(candidate.replayPolicy.transfers, graph.transfers, 'GRAPH_CANDIDATE_TRANSFERS');
    const preimage = { version: 1, basisHash: hash(basis), runAuthorizationHash: hash(basis.runAuthorization),
      translationHash: basis.translationHash, bootstrapHash: hash(basis.bootstrap), sourceManifestHash: basis.sourceManifestHash };
    check(candidate.replayPolicy.publicationEvidenceHash === hash(preimage), 'GRAPH_PUBLICATION_PREIMAGE');
    const admissions = basis.actions.map(({ ledger }) => ({ coordinate: ledger.coordinate,
      admission: ledger.admission, operationHash: ledger.operationHash, scopeHash: ledger.scopeHash }));
    check(candidate.replayPolicy.admissionProvenanceHash === hash(admissions), 'GRAPH_ADMISSION_PREIMAGE');
    check(candidate.replayPolicy.runAuthorizationHash === hash(basis.runAuthorization), 'GRAPH_AUTHORIZATION_PREIMAGE');
    check(candidate.sourceHash === basis.sourceHash && candidate.authoringHash === basis.authoringHash
      && candidate.configurationHash === basis.configurationHash
      && candidate.learnedPlan.authoredInputsHash === basis.authoredInputsHash
      && candidate.learnedPlan.scopeHash === hash(basis.scope)
      && candidate.learnedPlan.sourceRevision === basis.sourceRevision
      && candidate.learnedPlan.configurationRevision === basis.configurationRevision, 'GRAPH_CANDIDATE_IDENTITY');
    for (const recipe of candidate.inputRecipes) if (recipe.provenance.kind === 'sourceSpan') {
      check(recipe.provenance.sourceHash === basis.sourceHash, 'GRAPH_INPUT_SOURCE_PROVENANCE');
    }
  }
  return derived;
}

function validateObservationAccounting(basis) {
  const rows = new Map();
  for (const row of basis.observations) {
    structural('observation', row.observation);
    check(row.observationHash === hash(row.observation), 'OBSERVATION_HASH');
    check(!rows.has(row.observationHash), 'OBSERVATION_DUPLICATE');
    rows.set(row.observationHash, row);
  }
  const anchors = new Set();
  const anchor = evidence => {
    if (evidence?.kind !== 'observedDocument') return;
    const row = rows.get(evidence.observationHash);
    check(row && row.observation.sessionId === evidence.sessionId
      && row.observation.documentId === evidence.documentId
      && row.observation.generation === evidence.generation
      && row.observation.origin === evidence.origin, 'OBSERVATION_ANCHOR');
    anchors.add(evidence.observationHash);
  };
  anchor(basis.bootstrap.initialEvidence);
  for (const p of [...basis.preparations, ...(basis.incrementalEvidence?.excludedAttempts ?? []).map(x => x.preparation)]) {
    anchor(p.executionEvidence);
    if (p.observedChoice) anchor(p.observedChoice.context.questionCapture.executionEvidence);
  }
  for (const request of basis.incrementalEvidence?.prefixRequests ?? []) {
    // Requests carry an evidence hash, not a fabricated observation ID. A full current fact
    // join validates their owner/version/receipt; only an existing matching envelope can anchor.
    for (const row of rows.values()) {
      const observation = row.observation;
      const evidence = {kind:'observedDocument',sessionId:observation.sessionId,
        contextId:request.contextId,documentId:observation.documentId,generation:observation.generation,
        origin:observation.origin,observationHash:row.observationHash};
      if (hash(evidence) === request.evidenceHash) anchor(evidence);
    }
  }
  check(anchors.size === rows.size, 'UNANCHORED_OBSERVATION');
}

function timingOrder(left, right) {
  const scalar = (a, b) => {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    check(a.isWellFormed() && b.isWellFormed(), 'INVALID_UNICODE');
    const aa = Array.from(a), bb = Array.from(b);
    for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
      const difference = aa[i].codePointAt(0) - bb[i].codePointAt(0); if (difference) return difference;
    }
    return aa.length - bb.length;
  };
  const rank = ['prefixReplay', 'step', 'clarificationWait', 'action'];
  return left.startMs - right.startMs || rank.indexOf(left.kind) - rank.indexOf(right.kind)
    || (left.ordinal ?? -1) - (right.ordinal ?? -1) || scalar(left.stepId, right.stepId)
    || scalar(left.admissionId, right.admissionId);
}

function validateTimingReadings(test) {
  const original = canonical(test.items), seen = new Set(), byStep = new Map();
  check(test.items.length <= (test.maxActions ?? 200), 'TIMING_LIMIT');
  for (const item of test.items) {
    structural('action-timing', item);
    const ledger = test.ledger[item.admissionId];
    check(item.kind === 'action' && !seen.has(item.admissionId), 'TIMING_ADMISSION'); seen.add(item.admissionId);
    check(ledger && ledger.dispatchCount === 1 && ledger.stepId === item.stepId && ledger.ordinal === item.ordinal, 'TIMING_LEDGER');
    const ceiling = test.maxSessionSeconds === undefined ? 600000 : test.maxSessionSeconds * 1000;
    check(item.startMs <= ceiling && (item.endMs === null || item.endMs >= item.startMs && item.endMs <= ceiling), 'TIMING_BOUNDS');
    const items = byStep.get(item.stepId) ?? []; items.push(item); byStep.set(item.stepId, items);
  }
  for (let i = 1; i < test.items.length; i++) check(timingOrder(test.items[i - 1], test.items[i]) < 0, 'TIMING_ORDER');
  const steps = [...byStep].map(([stepId, items]) => {
    const ordered = [...items].sort(timingOrder);
    return { kind: 'step', stepId, admissionId: null, ordinal: null, startMs: ordered[0].startMs, endMs: ordered.at(-1).endMs };
  });
  check(steps.length <= (test.maxSourceSteps ?? 100) && steps.length + test.items.length <= 400, 'TIMING_LIMIT');
  same(canonical(test.items), original, 'TIMING_READING_MUTATED');
  return { items: structuredClone(test.items), steps, merged: [...test.items, ...steps].sort(timingOrder) };
}

function runGraphTimingConformance() {
  const fixtures = readJson('publication-fixtures.json').graphTimingConformance;
  let checked = 0;
  for (const test of fixtures.graphCases) {
    const raw = canonical(test.basis);
    let refused = false;
    try {
      if (test.historicalBaseWitness) {
        const previous = test.historicalBaseWitness;
        validateExtendedBasis(previous.basis, previous.authority);
        validateSnapshotGraph(previous.basis, previous.authority.snapshot, previous.expectedArtifact);
        check(hash(previous.expectedArtifact) === test.basis.snapshotEvidence.baseProof.revision.identity.artifactHash, 'GRAPH_HISTORICAL_WITNESS');
      }
      validateExtendedBasis(test.basis, test.authority);
      validateSnapshotGraph(test.basis, test.authority.snapshot, test.expectedArtifact);
      const projected = projectEffectiveGraph(test.basis);
      if (test.expectedLiveAdmissions) same(projected.liveEdges.map(edge => edge.consumerAdmissionId), test.expectedLiveAdmissions, 'GRAPH_EXPECTED');
      if (test.expectedExcludedAdmissions) same(projected.excludedEdges.map(edge => edge.consumerAdmissionId), test.expectedExcludedAdmissions, 'GRAPH_EXPECTED');
      for (const producer of test.basis.producers) {
        if (test.basis.sourceSteps.findIndex(step => step.stepId === producer.coordinate.stepId) < test.basis.incrementalEvidence.switch.completedPrefixCount) {
          check(test.expectedArtifact.learnedPlan.stepSnapshotHashes[producer.coordinate.stepId]
            === test.basis.snapshotEvidence.baseProof.revision.stepSnapshotHashes[producer.coordinate.stepId], 'GRAPH_PRODUCER_SNAPSHOT');
        }
      }
    } catch { refused = true; }
    assert.equal(refused, test.expected === 'REJECT', test.name);
    assert.equal(canonical(test.basis), raw, 'raw arrays, bootstrap and every original fact remain byte exact'); checked++;
  }
  // This sidecar checks synthetic immutable row transitions only. The complete wire basis does
  // not carry intermediate plans or authenticate actual DB/history/consent/native authority.
  for (const test of fixtures.historyCases) {
    let refused = false;
    try {
      const rows = test.rows, acceptance = test.acceptance;
      const first = rows.find(row => row.revision === acceptance.planRevision);
      const prior = rows.find(row => row.revision === acceptance.previousPlanRevision);
      check(first && prior && first.parent === prior.revision && first.revision === prior.revision + 1, 'HISTORY_FIRST');
      for (const id of prior.successMeanings) check(first.successMeanings.includes(id), 'HISTORY_SUCCESS');
      for (const row of rows.filter(row => row.revision > first.revision)) {
        const parent = rows.find(value => value.revision === row.parent);
        check(parent && row.revision === parent.revision + 1, 'HISTORY_PARENT');
        for (const id of [...parent.successMeanings, ...parent.unperformedMeanings]) check(
          [...row.successMeanings, ...row.unperformedMeanings].includes(id), 'HISTORY_OBLIGATION');
        for (const need of parent.needs) {
          const next = row.needs.find(value => value.needId === need.needId);
          check(next && next.bindingId === need.bindingId && next.producerStepId === need.producerStepId
            && need.consumers.every(consumer => next.consumers.some(value => canonical(value) === canonical(consumer))), 'HISTORY_NEED');
        }
      }
    } catch { refused = true; }
    assert.equal(refused, test.expected === 'REJECT', test.name); checked++;
  }
  for (const test of fixtures.timingCases) {
    let refused = false;
    try { const result = validateTimingReadings(test); if (test.expectedSteps) same(result.steps, test.expectedSteps, 'TIMING_STEP'); }
    catch { refused = true; }
    assert.equal(refused, test.expected === 'REJECT', test.name); checked++;
  }
  for (const test of fixtures.publicWaitingCases) {
    let refused = false;
    try { structural(test.schema, test.value); } catch { refused = true; }
    assert.equal(refused, test.expected === 'REJECT', test.name); checked++;
  }
  return checked;
}

// ARCH015-05 pure IPC conformance. An accepted Launch is a separate fixture input, never a
// field/assertion in Execute. This arithmetic cannot authenticate a real parent or run native work.
const retainedExecuteLimits = Object.freeze({ ordinary: 2097152, artifact: 1048576, combined: 3145792, depth: 32, nodes: 1000000 });
function executeProofBounds(execute) {
  const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
  const proof = Object.hasOwn(execute, 'retainedArtifact');
  check(bytes(execute) <= (proof ? retainedExecuteLimits.combined : retainedExecuteLimits.ordinary), 'EXECUTE_COMBINED_LIMIT');
  const { retainedArtifact, ...ordinary } = execute;
  check(bytes(ordinary) <= retainedExecuteLimits.ordinary, 'EXECUTE_ORDINARY_LIMIT');
  if (proof) check(bytes(retainedArtifact) <= retainedExecuteLimits.artifact, 'EXECUTE_ARTIFACT_LIMIT');
  function shape(value) {
    let nodes = 0; const stack = new WeakSet();
    function walk(item, depth) {
      check(depth <= retainedExecuteLimits.depth && ++nodes <= retainedExecuteLimits.nodes, 'EXECUTE_SHAPE_LIMIT');
      if (typeof item === 'string') check(item.isWellFormed(), 'INVALID_UNICODE');
      else if (typeof item === 'number') check(Number.isSafeInteger(item) && !Object.is(item, -0), 'EXECUTE_NUMBER');
      else if (item && typeof item === 'object') {
        check(!stack.has(item), 'EXECUTE_CYCLE'); stack.add(item);
        for (const [key, child] of Object.entries(item)) { check(key.isWellFormed(), 'INVALID_UNICODE'); walk(child, depth + 1); }
        stack.delete(item);
      } else check(item === null || typeof item === 'boolean', 'EXECUTE_JSON');
    }
    walk(value, 0);
  }
  shape(execute); shape(ordinary); if (proof) shape(retainedArtifact);
  return { ordinaryBytes: bytes(ordinary), artifactBytes: proof ? bytes(retainedArtifact) : 0, combinedBytes: bytes(execute) };
}

function validateRetainedExecute(execute, acceptedLaunch) {
  executeProofBounds(execute);
  structural('replay-ipc#/definitions/Execute3', execute);
  unique(execute.bindings, binding => binding.bindingId, 'EXECUTE_BINDING');
  unique(execute.guards, guard => guard.guardId, 'EXECUTE_GUARD');
  unique(execute.inputs, input => input.inputId, 'EXECUTE_INPUT');
  const steps = execute.steps.map(step => step.stepId), runtimeOperations = execute.steps.flatMap(step => step.operations);
  unique(execute.steps, step => step.stepId, 'EXECUTE_STEP');
  const runtimeGuards = new Map(execute.guards.map(guard => [guard.guardId, guard]));
  const runtimeBindings = new Map(execute.bindings.map(binding => [binding.bindingId, binding]));
  const coordinatePosition = coordinate => steps.indexOf(coordinate.stepId) * 8 + coordinate.ordinal;
  const argumentOf = operation => operation.value ?? operation.expected;
  const operationSlot = operation => operation.kind === 'assert' ? 'assert.expected' : `${operation.kind}.value`;
  for (let i = 0; i < execute.steps.length; i++) {
    const step = execute.steps[i]; check(step.stepIndex === i, 'EXECUTE_STEP');
    step.operations.forEach((entry, ordinal) => check(entry.coordinate.stepId === step.stepId
      && entry.coordinate.ordinal === ordinal && runtimeGuards.has(entry.guardId), 'EXECUTE_OPERATION'));
  }
  const exercised = new Set();
  for (const transfer of execute.transfers) {
    const binding = runtimeBindings.get(transfer.bindingId);
    const consumer = runtimeOperations.find(entry => key(entry.coordinate) === key(transfer.consumer));
    check(binding && consumer && argumentOf(consumer.operation)?.kind === 'binding'
      && argumentOf(consumer.operation).bindingId === transfer.bindingId
      && operationSlot(consumer.operation) === transfer.slot
      && transfer.origin === binding.origin && runtimeGuards.get(consumer.guardId).origin === binding.origin
      && coordinatePosition(transfer.producer) < coordinatePosition(transfer.consumer), 'EXECUTE_TRANSFER');
    same(transfer.producer, binding.producer, 'EXECUTE_TRANSFER');
    const id = key(transfer.consumer) + ':' + transfer.slot; check(!exercised.has(id), 'EXECUTE_TRANSFER'); exercised.add(id);
  }
  for (const binding of execute.bindings) {
    const read = runtimeOperations.find(entry => key(entry.coordinate) === key(binding.producer));
    check(read?.operation.kind === 'read' && read.operation.bindingId === binding.bindingId
      && runtimeGuards.get(read.guardId).origin === binding.origin, 'EXECUTE_RUNTIME_READ');
    same(read.operation.recipe, binding.recipe, 'EXECUTE_RUNTIME_READ');
  }
  for (const entry of runtimeOperations) {
    const arg = argumentOf(entry.operation);
    if (entry.operation.kind === 'read') check(runtimeBindings.has(entry.operation.bindingId), 'EXECUTE_RUNTIME_READ');
    if (arg?.kind === 'binding') check(exercised.has(key(entry.coordinate) + ':' + operationSlot(entry.operation)), 'EXECUTE_TRANSFER');
  }
  const zero = execute.bindings.filter(binding => !execute.transfers.some(t => t.bindingId === binding.bindingId)).map(binding => binding.bindingId);
  check(Object.hasOwn(execute, 'retainedArtifact') === (zero.length > 0), 'EXECUTE_PROOF_PRESENCE');
  if (zero.length === 0) return { zeroBindings: [], proof: false };
  check(acceptedLaunch, 'EXECUTE_ACCEPTED_LAUNCH');
  const launchBefore = canonical(acceptedLaunch);
  structural('replay-ipc#/definitions/Launch3', acceptedLaunch);
  const launch = acceptedLaunch, request = launch.admission.request, artifact = execute.retainedArtifact;
  check(execute.runId === launch.runId && execute.attemptId === launch.attemptId
    && request.executionId === launch.runId && request.attemptId === launch.attemptId
    && request.admissionId === launch.admission.admissionId
    && execute.configurationHash === launch.configurationHash && request.configurationHash === launch.configurationHash
    && execute.profileHash === hash(launch.profile), 'EXECUTE_LAUNCH_IDENTITY');
  same(launch.profile, request.profile, 'EXECUTE_LAUNCH_PROFILE'); same(launch.build, request.build, 'EXECUTE_LAUNCH_BUILD');
  check(hash(launch.scope) === launch.scopeHash && launch.scopeHash === request.scopeHash, 'EXECUTE_LAUNCH_SCOPE');
  check(launch.build.profileHash === hash(launch.profile)
    && launch.build.schemaBundleHash === hash(JSON.parse(generator.outputs['studio-runner/src/validator/observedSchemas.json'])), 'EXECUTE_CURRENT_SOURCE_BUILD');
  structural('replay-artifact', artifact); validatePlan(artifact.learnedPlan);
  check(hash(artifact) === request.artifactHash && hash(artifact.learnedPlan) === artifact.learnedPlanHash
    && artifact.learnedPlanHash === request.learnedPlanHash
    && hash(artifact.replayPolicy) === request.referencePolicyHash
    && artifact.replayPolicy.learnedPlanHash === artifact.learnedPlanHash
    && artifact.replayPolicy.publicationEvidenceHash === request.publicationEvidenceHash
    && artifact.configurationHash === execute.configurationHash, 'EXECUTE_ADMITTED_ARTIFACT');
  same(artifact.profile, launch.profile, 'EXECUTE_ARTIFACT_PROFILE');
  const { principalId, ...requirements } = launch.scope;
  same(requirements, artifact.replayPolicy.scope, 'EXECUTE_REPLAY_SCOPE');
  same(artifact.learnedPlan.initialContext, requirements.initialContext, 'EXECUTE_INITIAL_CONTEXT');
  same(execute.steps, artifact.steps, 'EXECUTE_STEPS'); same(execute.guards, artifact.guards, 'EXECUTE_GUARDS');
  same(execute.bindings, artifact.replayPolicy.bindings.map(b => ({ bindingId: b.bindingId,
    producer: b.producer, recipe: b.recipe, origin: b.sourceOrigin })), 'EXECUTE_BINDING_PROJECTION');
  same(execute.transfers, artifact.replayPolicy.transfers, 'EXECUTE_TRANSFER_PROJECTION');
  same(artifact.replayPolicy.bindings, artifact.learnedPlan.bindings, 'EXECUTE_ARTIFACT_BINDINGS');
  const inputMetadata = execute.inputs.map(({ value, ...metadata }) => metadata);
  for (const recipe of artifact.inputRecipes) if (recipe.provenance.kind === 'sourceSpan') {
    check(recipe.provenance.sourceHash === artifact.sourceHash, 'EXECUTE_ARTIFACT_SOURCE');
  }
  const expectedInputs = artifact.inputRecipes.map(recipe => ({ inputId: recipe.inputId, stepId: recipe.stepId,
    kind: recipe.kind, intendedSlot: recipe.intendedSlot,
    ...(recipe.kind === 'secretRef' ? { referenceName: recipe.provenance.referenceName } : {}) }));
  same(inputMetadata, expectedInputs, 'EXECUTE_INPUT_PROJECTION');
  const plan = artifact.learnedPlan, incremental = plan.incremental;
  check(incremental, 'EXECUTE_RETAINED_METADATA');
  unique(plan.actions, action => action.admissionId, 'EXECUTE_ADMISSION_UNIQUENESS');
  same(incremental.retainedPrefixAdmissionIds,
    plan.actions.slice(0, incremental.retainedPrefixAdmissionIds.length).map(action => action.admissionId), 'EXECUTE_RETAINED_PREFIX');
  const initial = plan.sourceSteps.indexOf(incremental.initialFirstLearnStepId);
  const effective = plan.sourceSteps.indexOf(incremental.effectiveFirstLearnStepId);
  check(initial >= 0 && effective >= 0 && effective <= initial, 'EXECUTE_RETAINED_BOUNDARY');
  const emptyBindings = artifact.replayPolicy.bindings.filter(binding => binding.consumers.length === 0);
  same([...zero].sort(), emptyBindings.map(binding => binding.bindingId).sort(), 'EXECUTE_ZERO_SET');
  const guards = new Map(artifact.guards.map(guard => [guard.guardId, guard]));
  const operations = artifact.steps.flatMap(step => step.operations);
  same(operations.map(op => ({ coordinate: op.coordinate, operation: op.operation })),
    plan.actions.map(action => ({ coordinate: action.coordinate, operation: action.operation })), 'EXECUTE_ARTIFACT_OPERATIONS');
  for (const binding of emptyBindings) {
    const read = plan.actions.find(action => key(action.coordinate) === key(binding.producer));
    check(read && read.operation.kind === 'read' && read.operation.bindingId === binding.bindingId
      && read.admissionId === binding.provenance.producerAdmissionId
      && binding.provenance.sourceIntentStepId === binding.producer.stepId
      && incremental.retainedPrefixAdmissionIds.includes(read.admissionId)
      && read.origin === binding.sourceOrigin, 'EXECUTE_RETAINED_READ');
    same(read.operation.recipe, binding.recipe, 'EXECUTE_RETAINED_RECIPE');
    const operation = operations.find(op => key(op.coordinate) === key(read.coordinate)), guard = guards.get(operation?.guardId);
    check(guard && guard.origin === read.origin && guard.target.kind === 'element'
      && guard.target.readRuleId === binding.recipe.policyRuleId, 'EXECUTE_RETAINED_GUARD');
    same(guard.target.locator, read.target.locator, 'EXECUTE_RETAINED_GUARD');
  }
  check(canonical(acceptedLaunch) === launchBefore, 'EXECUTE_LAUNCH_MUTATED');
  return { zeroBindings: zero, proof: true };
}

function runRetainedExecuteConformance() {
  const fixtures = readJson('publication-fixtures.json').retainedExecuteConformance;
  let checked = 0;
  for (const test of fixtures.cases) {
    const before = canonical(test.execute), launchBefore = test.acceptedLaunch ? canonical(test.acceptedLaunch) : null;
    let refused = false;
    try { validateRetainedExecute(test.execute, test.acceptedLaunch); } catch { refused = true; }
    assert.equal(refused, test.expected === 'REJECT', test.name);
    assert.equal(canonical(test.execute), before); if (test.acceptedLaunch) assert.equal(canonical(test.acceptedLaunch), launchBefore); checked++;
    if (test.expected === 'ACCEPT' && test.acceptedAt) {
      assert(Date.parse(test.acceptedAt) < Date.parse(test.acceptedLaunch.admission.startDeadlineAt));
      assert(Date.parse(test.executeAt) > Date.parse(test.acceptedLaunch.admission.startDeadlineAt)
        && Date.parse(test.executeAt) < Date.parse(test.acceptedLaunch.admission.runDeadlineAt)); checked++;
    }
    if (test.name === 'released-values-are-outside-inert-proof') {
      assert(!canonical(test.execute.retainedArtifact).includes('CINT_CURRENT_RELEASED_NONSECRET_CANARY')); checked++;
    }
  }
  const repeat = fixtures.cases.filter(test => test.repeatGroup === 'same-artifact-independent-runs');
  assert.equal(repeat.length, 2); assert.notEqual(repeat[0].execute.runId, repeat[1].execute.runId);
  assert.notEqual(repeat[0].execute.attemptId, repeat[1].execute.attemptId);
  same(repeat[0].execute.retainedArtifact, repeat[1].execute.retainedArtifact, 'EXECUTE_REPEAT_ARTIFACT'); checked++;
  const ordinary = { kind: 'execute', padding: '' }, proof = { padding: '' };
  ordinary.padding = 'x'.repeat(retainedExecuteLimits.ordinary - Buffer.byteLength(JSON.stringify(ordinary)));
  proof.padding = 'x'.repeat(retainedExecuteLimits.artifact - Buffer.byteLength(JSON.stringify(proof)));
  const combined = { ...ordinary, retainedArtifact: proof }, sizes = executeProofBounds(combined);
  assert.equal(sizes.combinedBytes, sizes.ordinaryBytes + sizes.artifactBytes + 20);
  assert.equal(sizes.ordinaryBytes, retainedExecuteLimits.ordinary); assert.equal(sizes.artifactBytes, retainedExecuteLimits.artifact); checked++;
  for (const test of [() => executeProofBounds({ ...ordinary, padding: ordinary.padding + 'x' }),
    () => executeProofBounds({ kind: 'execute', retainedArtifact: { padding: proof.padding + 'x' } }),
    () => executeProofBounds({ ...combined, padding: ordinary.padding + 'x'.repeat(65) })]) {
    assert.throws(test); checked++;
  }
  let nested = null; for (let i = 0; i < 34; i++) nested = { nested };
  assert.throws(() => executeProofBounds({ kind: 'execute', nested })); checked++;
  assert.throws(() => executeProofBounds({ kind: 'execute', values: Array.from({ length: 666667 }, () => []),
    retainedArtifact: { values: Array.from({ length: 333334 }, () => []) } }), { code: 'EXECUTE_SHAPE_LIMIT' }); checked++;
  assert.throws(() => executeProofBounds({ kind: 'execute', invalid: '\ud800' })); checked++;
  const escaped = executeProofBounds({ kind: 'execute', value: 'é\n"', retainedArtifact: { value: '𐀀\t' } });
  assert.equal(escaped.combinedBytes, escaped.ordinaryBytes + escaped.artifactBytes + 20); checked++;
  return checked;
}

function runSnapshotCorrection() {
  const fixture = readJson('publication-fixtures.json').snapshotCorrection;
  let checked = 0;
  for (const test of fixture.positives) {
    const result = snapshotOracle.validate(test.basis, test.authority, test.expectedArtifact);
    same(result.computation, test.snapshotComputation, 'SNAPSHOT_ENVELOPES');
    if (test.reviewedComputationSHA256) assert.equal(hash(result.computation), test.reviewedComputationSHA256,
      'independently reviewed canonical envelope preimages remain exact');
    const basis = test.basis;
    const preimage = { version: 1, basisHash: hash(basis), runAuthorizationHash: hash(basis.runAuthorization),
      translationHash: basis.translationHash, bootstrapHash: hash(basis.bootstrap), sourceManifestHash: basis.sourceManifestHash };
    assert.equal(hash(preimage), test.publicationEvidenceHash);
    same(preimage, test.publicationEvidencePreimage, 'PUBLICATION_PREIMAGE'); checked++;
  }
  for (const test of fixture.negatives) {
    let refused = false;
    try { snapshotOracle.validate(test.basis, test.authority, test.expectedArtifact); } catch { refused = true; }
    assert(refused, test.name + ': correction negative must refuse'); checked++;
  }
  const example = fixture.underdeterminationCounterexample;
  const source = fixture.positives.find(test => test.name === 'ordinary');
  const graph = snapshotOracle.graphFromBasis(source.basis);
  const a = snapshotOracle.envelopes(example.identityA, example.oldBasis.configuration, graph);
  const b = snapshotOracle.envelopes(example.identityB, example.oldBasis.configuration, graph);
  same(a.maps, example.snapshotMapA, 'COUNTEREXAMPLE_MAP_A');
  same(b.maps, example.snapshotMapB, 'COUNTEREXAMPLE_MAP_B');
  assert.deepEqual(source.basis.sourceSteps.filter(step => a.maps[step.stepId] !== b.maps[step.stepId])
    .map(step => step.ordinal + 1), [2, 3]);
  assert.throws(() => structural('replay-validation#/definitions/ValidationBasis', example.oldBasis)); checked++;
  assert.deepEqual(snapshotOracle.limits, { basis: 6291456, validationRequest: 8388608, artifact: 1048576 });
  const normalized = fixture.normalization;
  const originalMaps = snapshotOracle.envelopes(normalized.identity, normalized.configuration, graph).maps;
  for (const mutate of [identity => { identity.authoring.steps[1].context.entries.at(-1).exact = false; },
    identity => { identity.authoring.steps[1].context.evidenceReferences[0].capturedAt = '2026-10-15T04:00:00.123456788Z'; }]) {
    const identity = structuredClone(normalized.identity); mutate(identity);
    const changed = snapshotOracle.envelopes(identity, normalized.configuration, graph).maps;
    assert.deepEqual(source.basis.sourceSteps.filter(step => originalMaps[step.stepId] !== changed[step.stepId])
      .map(step => step.ordinal + 1), [2, 3]); checked++;
  }
  for (const mutate of [identity => { identity.authoring.steps[1].context.evidenceReferences[0].capturedAt = 0; },
    identity => { delete identity.authoring.steps[1].context.entries.at(-1).scope; },
    identity => { delete identity.authoring.steps[0].context.evidenceReferences; }]) {
    const identity = structuredClone(normalized.identity); mutate(identity);
    assert.throws(() => snapshotOracle.envelopes(identity, normalized.configuration, graph)); checked++;
  }
  const oversized = structuredClone(source.basis);
  oversized.snapshotEvidence.current.authoring.steps[0].context.entries.push({ kind: 'text', value: 'x'.repeat(snapshotOracle.limits.basis) });
  assert.throws(() => snapshotOracle.validate(oversized), { code: 'LIMIT_EXCEEDED' }); checked++;
  oversized.snapshotEvidence.current.authoring.steps[0].context.entries.at(-1).value = 'x'.repeat(snapshotOracle.limits.validationRequest);
  assert.throws(() => snapshotOracle.wireBounds({ validationBasis: oversized, artifact: source.expectedArtifact }), { code: 'LIMIT_EXCEEDED' }); checked++;
  return checked;
}

// STUDIO-FLEX-001 domain allow-list: reference implementation of docs/specs/studio/allowed-domains-vectors.json.
// The backend (AllowedDomains) and the runner implement the same rules separately and run the same file.
const allowedDomainsVectorsPath = path.resolve(__dirname, '../docs/specs/studio/allowed-domains-vectors.json');
const allowedDomains = (() => {
  const grammar = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const overlap = (a, b) => a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
  function validEntries(entries) {
    if (!Array.isArray(entries) || entries.length > 32) return false;
    if (!entries.every(entry => typeof entry === 'string' && grammar.test(entry))) return false;
    return entries.every((a, i) => entries.every((b, j) => i === j || !overlap(a, b)));
  }
  function fromEnv(value) {
    if (value === null || value === '') return [];
    const entries = value.split(',');
    return validEntries(entries) ? entries : null;
  }
  function hostOf(url) {
    if (typeof url !== 'string' || /[\u0000- \u007f\\]/.test(url)) return null;
    const parsed = /^https?:\/\/([^/?#]*)/i.exec(url);
    if (!parsed || parsed[1] === '' || /[@%[\]]/.test(parsed[1])) return null;
    let host = parsed[1];
    const colon = host.indexOf(':');
    if (colon >= 0) {
      const port = host.slice(colon + 1);
      if (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) return null;
      host = host.slice(0, colon);
    }
    const ascii = require('node:url').domainToASCII(host);
    return ascii !== '' && grammar.test(ascii) ? ascii : null;
  }
  function matches(entries, url) {
    const host = hostOf(url);
    return host !== null && entries.some(entry => host === entry || host.endsWith('.' + entry));
  }
  // The allow-all option: exactly 'true' or 'false'; anything else is refused (null). Unset and the empty
  // string take the deployment default (ON for now), which the vectors deliberately do not pin.
  function allowAllFromEnv(value) {
    if (value === 'false') return false;
    return value === null || value === '' || value === 'true' ? true : null;
  }
  // Allow-all: the list is ignored and a URL passes when its host passes hostOf.
  function matchesAllowAll(url) {
    return hostOf(url) !== null;
  }
  return { grammar, validEntries, fromEnv, hostOf, matches, allowAllFromEnv, matchesAllowAll };
})();
function runAllowedDomainVectors() {
  const vectors = JSON.parse(fs.readFileSync(allowedDomainsVectorsPath, 'utf8'));
  assert.equal(vectors.schemaVersion, 1);
  assert.equal(vectors.entryGrammar, allowedDomains.grammar.source, 'entryGrammar is the normative expression');
  assert.deepEqual(vectors.limits, { maxEntries: 32, maxEntryLength: 253, maxLabelLength: 63, maxPort: 65535 });
  let checked = 0;
  const names = new Set();
  const unique = (group, name) => { assert(!names.has(group + name), `duplicate ${group} case: ${name}`); names.add(group + name); };
  for (const test of vectors.configCases) {
    unique('config', test.name);
    assert.equal(allowedDomains.validEntries(test.entries), test.valid, `config: ${test.name}`);
    assert.equal(test.valid, test.reason === undefined, `config reason only on refusals: ${test.name}`);
    checked++;
  }
  for (const test of vectors.envCases) {
    unique('env', test.name);
    const entries = allowedDomains.fromEnv(test.value);
    assert.deepEqual(entries, test.valid ? test.entries : null, `env: ${test.name}`);
    checked++;
  }
  for (const test of vectors.hostCases) {
    unique('host', test.name);
    assert.equal(allowedDomains.hostOf(test.url), test.host, `host: ${test.name}`);
    checked++;
  }
  for (const test of vectors.matchCases) {
    unique('match', test.name);
    assert(allowedDomains.validEntries(test.entries), `match entries are a valid list: ${test.name}`);
    assert.equal(allowedDomains.matches(test.entries, test.url), test.match, `match: ${test.name}`);
    checked++;
  }
  for (const test of vectors.allowAllEnvCases) {
    unique('allowAllEnv', test.name);
    const allowAll = allowedDomains.allowAllFromEnv(test.value);
    assert.equal(allowAll, test.valid ? test.allowAll : null, `allow-all env: ${test.name}`);
    assert.equal(test.valid, test.allowAll !== undefined, `allow-all value only on valid cases: ${test.name}`);
    checked++;
  }
  for (const test of vectors.allowAllMatchCases) {
    unique('allowAllMatch', test.name);
    assert(allowedDomains.validEntries(test.entries), `allow-all match entries are a valid list: ${test.name}`);
    assert.equal(allowedDomains.matchesAllowAll(test.url), test.match, `allow-all match: ${test.name}`);
    checked++;
  }
  // The WHATWG parser agrees wherever the vectors treat a candidate as parseable and not pre-refused.
  for (const test of vectors.hostCases) {
    if (test.host === null || /%/.test(test.url)) continue;
    assert.equal(new URL(test.url).hostname, test.host, `WHATWG host: ${test.name}`);
    checked++;
  }
  return checked;
}

function run() {
  const schemas = runSchemas();
  const fixtures = runFixtures();
  const planning = runPlanning();
  const publication = runPublication();
  const incremental = runIncremental();
  const correction = runSnapshotCorrection();
  const graphTiming = runGraphTimingConformance();
  const retainedExecute = runRetainedExecuteConformance();
  const api = runPublicApi();
  const domains = runAllowedDomainVectors();
  const generated = generator.check();
  console.log(`PASS v3: ${schemas} schemas with every definition compiled and one actionTiming definition; ${fixtures} fixture/semantic/canonical checks; ${planning} planning fixtures; ${publication} replay/publication checks.`);
  console.log(`PASS public OpenAPI: ${api.operations} operations, nine guided-session routes, ${api.examples} validated examples; no retired generation or compile route.`);
  console.log(`PASS allowed domains: ${domains} config/env/host/match/allow-all vector checks against the reference implementation (docs/specs/studio/allowed-domains-vectors.json).`);
  console.log(`PASS codegen: ${generated}. No browser, database or publication proof claimed.`);
  console.log(`PASS incremental: ${incremental} schema/vector/basis/chain checks; synthetic transport authority only.`);
  console.log(`PASS snapshot correction: ${correction} authoritative source/base/envelope/counterexample checks; original byte limits retained.`);
  console.log(`PASS graph/timing conformance: ${graphTiming} complete-basis/history-sidecar/timing/public-wait cases; no live consent/native/history proof claimed.`);
  console.log(`PASS retained Execute: ${retainedExecute} pure accepted-launch/projection/presence/bounds checks; application/native24facets remain separately planned.`);
}
if (require.main === module) run();
module.exports = { hash, canonical, operationIdentity, validateFlow, validatePlan, validateMaterializations,
  validateInputs, observationRefreshKey, validateObservationRefresh, runSchemas, runFixtures, runPlanning,
  runPublication, runPublicApi, validateExtendedBasis, runIncremental, runSnapshotCorrection, projectEffectiveGraph,
  validateSnapshotGraph, validateTimingReadings, runGraphTimingConformance, snapshotOracle,
  retainedExecuteLimits, executeProofBounds, validateRetainedExecute, runRetainedExecuteConformance,
  allowedDomains, runAllowedDomainVectors, run };
