'use strict';
// Independent QA reproductions. Run from repository root; no source or fixture writes.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const { validateBundle, hash, operationIdentity, provenance } = require(path.join(root, 'tools/check-studio-observed-contracts.cjs'));
const fixtures = require(path.join(root, 'docs/specs/studio-observed-authoring/contracts/fixtures.json'));
const Ajv = require('ajv');
const ajv = new Ajv({ strict: true, allErrors: true });
require('ajv-formats')(ajv);
const directory = path.join(root, 'docs/specs/studio-observed-authoring/contracts');
for (const filename of fs.readdirSync(directory).filter(name => name.endsWith('.schema.json'))) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8')));
const results = [];
function test(name, document, mutate, expected, schema = 'bundle') {
  const sample = structuredClone(fixtures.documents[document]);
  mutate(sample);
  let actual = 'VALID';
  try {
    if (schema === 'bundle') validateBundle(sample);
    else if (!ajv.getSchema(`https://checks.citi.example/contracts/observed/v1/${schema}.schema.json`)(sample)) actual = 'SCHEMA';
  } catch (error) { actual = error.code || error.message; }
  results.push({ name, expected, actual, passed: expected === 'REJECT' ? actual !== 'VALID' : actual === expected });
}
function syncPending(bundle) {
  bundle.pendingBindings.dependencyProposalHash = hash(bundle.dependencyProposal);
  bundle.runnerContext.pendingBindings = structuredClone(bundle.pendingBindings);
}
function rehash(bundle) {
  bundle.plan.actions.forEach((action, index) => {
    action.operationHash = hash(operationIdentity(action));
    bundle.proposals[index].observationHash = hash(bundle.observations[index]);
    Object.assign(bundle.ledgers[index], { observationHash: hash(bundle.observations[index]), operationHash: action.operationHash, requestDigest: hash(bundle.proposals[index]) });
  });
  bundle.revision.learnedPlanHash = hash(bundle.plan);
  bundle.revision.admissionProvenanceHash = hash(provenance(bundle));
  const { revisionId, ...identity } = bundle.revision;
  bundle.revision.revisionId = hash(identity);
  bundle.result.readyRevisionId = bundle.revision.revisionId;
}
for (const name of ['bundle', 'localhost', 'ipv4', 'ipv6', 'httpApplication', 'authoredLiteralBundle']) test(`positive-${name}`, name, () => {}, 'VALID');
for (const name of ['actionProposal', 'clarificationProposal', 'stepCompleteProposal', 'unsupportedProposal']) test(`proposal-union-${name}`, name, () => {}, 'VALID', 'proposal-result');
test('foreign-session', 'bundle', b => { b.observations[0].sessionId = 'foreign'; }, 'SESSION_SCOPE');
test('stale-owner-fence', 'bundle', b => { b.ledgers[0].ownerFence++; }, 'STALE_FENCE');
test('stale-materialization-fence', 'bundle', b => { b.runnerContext.ownerFence++; }, 'STALE_FENCE');
test('materialized-source-value-substitution', 'authoredLiteralBundle', b => { b.runnerContext.authoredInputs.inputs[1].value = 'changed'; }, 'AUTHORED_INPUT');
test('password-read-after-consistent-rehash', 'bundle', b => { b.observations[0].nodes[0].controlType = 'password'; rehash(b); }, 'SENSITIVE_SOURCE');
test('hidden-read-after-consistent-rehash', 'bundle', b => { b.observations[0].nodes[0].controlType = 'hidden'; rehash(b); }, 'SENSITIVE_SOURCE');
test('cancelled-session', 'bundle', b => { b.session.state = 'CANCELLED'; }, 'PUBLICATION_STATE');
test('expired-session', 'bundle', b => { b.session.state = 'EXPIRED'; }, 'PUBLICATION_STATE');
test('unknown-outcome-ledger', 'bundle', b => { b.ledgers[0].state = 'UNKNOWN_OUTCOME'; }, 'PUBLICATION_STATE');
test('failed-required-assertion', 'bundle', b => { b.ledgers[2].assertionPassed = false; }, 'ASSERTION_FAILED');
test('executed-plan-hash-substitution', 'bundle', b => { b.revision.learnedPlanHash = 'f'.repeat(64); }, 'PUBLICATION_IDENTITY');
test('admission-provenance-substitution', 'bundle', b => { b.revision.admissionProvenanceHash = 'f'.repeat(64); }, 'PUBLICATION_IDENTITY');
test('new-artifact-old-revision', 'bundle', b => { b.revision.artifactHash = 'f'.repeat(64); }, 'PUBLICATION_IDENTITY');
test('mixed-proposal-outcome', 'actionProposal', b => { b.clarification = fixtures.documents.clarification; }, 'SCHEMA', 'proposal-result');
test('empty-step-complete', 'stepCompleteProposal', b => { b.successfulAdmissionIds = []; }, 'SCHEMA', 'proposal-result');
// Required invariants missing from the submitted conformance oracle.
test('unallocated-executed-binding', 'bundle', b => {
  b.dependencyProposal.needs = [];
  b.pendingBindings.bindings = [];
  syncPending(b);
}, 'REJECT');
test('executed-consumer-outside-admitted-needs', 'bundle', b => {
  b.dependencyProposal.needs[0].consumers.pop();
  b.pendingBindings.bindings[0].consumers.pop();
  syncPending(b);
}, 'REJECT');
test('generation-regresses-after-read', 'bundle', b => {
  const i = 1;
  b.observations[i].generation = 0;
  b.observations[i].nodes.forEach(node => { node.generation = 0; });
  b.proposals[i].generation = 0;
  b.proposals[i].target.generation = 0;
  b.ledgers[i].generation = 0;
  rehash(b);
}, 'REJECT');
test('document-replaced-without-new-generation', 'bundle', b => {
  const i = 1;
  b.observations[i].documentId = 'replacement-document';
  b.observations[i].nodes.forEach(node => { node.documentId = 'replacement-document'; });
  b.proposals[i].target.documentId = 'replacement-document';
  b.ledgers[i].documentId = 'replacement-document';
  rehash(b);
}, 'REJECT');
test('configured-source-step-limit-exceeded', 'bundle', b => { b.session.limits.maxSourceSteps = 1; }, 'REJECT');
const report = { scope: 'Independent static contract QA, not runtime or live browser proof', command: 'node docs/qa/evidence/STUDIO-OBS-001-independent-review.cjs', total: results.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
