'use strict';
// Source catalog arithmetic only. No dist import, build, execution, private-history invention or native proof.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const root = path.resolve(__dirname, '../../../../../../..');
const oracle = require(path.join(root, 'tools/check-studio-observed-contracts.cjs'));
const { hash } = oracle;
const contractRoot = 'docs/specs/studio-observed-authoring/contracts/v3/';
const referenceRoot = 'studio-runner/fixtures/observed-reference/';
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
function hashes(basis, artifact) {
  return { sourceHash: basis.sourceHash, configurationHash: basis.configurationHash,
    authoringHash: basis.authoringHash, learnedPlanHash: hash(artifact.learnedPlan),
    artifactHash: hash(artifact), referencePolicyHash: hash(artifact.replayPolicy),
    operationEquivalenceHash: hash({ operations: artifact.steps.flatMap(step => step.operations),
      guards: artifact.guards, inputRecipes: artifact.inputRecipes,
      bindings: artifact.replayPolicy.bindings, transfers: artifact.replayPolicy.transfers }),
    admissionProvenanceHash: artifact.replayPolicy.admissionProvenanceHash,
    publicationEvidenceHash: artifact.replayPolicy.publicationEvidenceHash,
    runAuthorizationHash: hash(basis.runAuthorization), profileHash: hash(artifact.profile) };
}
function audit(references) {
  const p = read(contractRoot + 'publication-fixtures.json');
  references ??= Object.fromEntries(fs.readdirSync(path.join(root, referenceRoot)).filter(n => n.endsWith('.json')).sort().map(n => [n, read(referenceRoot + n)]));
  const failures = [], checks = [], schemaErrors = [];
  const attempt = (name, check) => { try { check(); checks.push({name, status:'PASS'}); } catch (e) { failures.push({name, message:e.message, code:e.code ?? null}); checks.push({name,status:'FAIL'}); } };
  const ajv = new Ajv({allErrors:true, strict:true}); addFormats(ajv);
  for (const name of fs.readdirSync(path.join(root, contractRoot)).filter(n => n.endsWith('.schema.json')).sort()) ajv.addSchema(read(contractRoot + name));
  const validate = (schema, value, name) => {
    const fn = ajv.getSchema('https://checks.citi.example/contracts/observed/v3/' + schema);
    if (!fn(value)) { schemaErrors.push({name, errors:structuredClone(fn.errors)}); throw new Error(name + ': ' + JSON.stringify(fn.errors)); }
  };
  attempt('exact five-file catalog inventory', () => assert.deepEqual(Object.keys(references).sort(), ['accepted-observed-choice.json','control-value-reference.json','fresh-order-reference.json','manifest.json','operation-mutations.json']));
  attempt('accepted-observed-choice exact current authoritative counterpart', () => assert.equal(hash(references['accepted-observed-choice.json']), hash(p.observedChoice)));
  attempt('exactly one version1 observed-choice preparation', () => assert.equal(references['accepted-observed-choice.json'].basis.preparations.filter(x => x.observedChoice?.version === 1).length, 1));
  const fresh = references['fresh-order-reference.json'];
  attempt('fresh-order exact current authoritative basis', () => assert.deepEqual(fresh.basis, p.basis));
  attempt('fresh-order exact current authoritative artifact', () => assert.deepEqual(fresh.artifact, p.artifact));
  attempt('fresh-order exact immutable snapshot authority counterpart', () => assert.deepEqual(fresh.snapshotAuthority, p.snapshotAuthority));
  attempt('fresh-order complete recomputed hash map', () => assert.deepEqual(fresh.hashes, hashes(p.basis, p.artifact)));
  attempt('canonical manifest exact current vector counterpart', () => assert.deepEqual(references['manifest.json'].canonicalVectors, read(contractRoot + 'publication-canonical-vectors.json')));
  attempt('manifest workflow identity unchanged', () => assert.deepEqual(Object.fromEntries(Object.entries(references['manifest.json']).filter(([k]) => k !== 'canonicalVectors')), {schemaVersion:1,catalog:'observed-replay-1',fixture:'fresh-order-reference.json'}));
  const mutationNames = ['guard-role','guard-control-type','guard-locator','read-recipe','argument-slot','binding-producer','binding-consumer','source-provenance','configuration-reference','original-evidence','allocated-binding','profile'];
  attempt('all twelve original operation mutation declarations preserved', () => assert.deepEqual(references['operation-mutations.json'], {schemaVersion:1,mutations:mutationNames}));
  for (const name of ['fresh-order-reference.json','control-value-reference.json','accepted-observed-choice.json']) {
    const sample = references[name];
    attempt(name + ' current closed complete basis', () => validate('replay-validation.schema.json#/definitions/ValidationBasis', sample.basis, name + '/basis'));
    attempt(name + ' current closed artifact', () => validate('replay-artifact.schema.json', sample.artifact, name + '/artifact'));
    attempt(name + ' exact aggregate hash preimages', () => assert.deepEqual(sample.hashes, hashes(sample.basis, sample.artifact)));
    attempt(name + ' publication evidence full-basis preimage', () => assert.equal(sample.artifact.replayPolicy.publicationEvidenceHash, hash({version:1,basisHash:hash(sample.basis),runAuthorizationHash:hash(sample.basis.runAuthorization),translationHash:sample.basis.translationHash,bootstrapHash:hash(sample.basis.bootstrap),sourceManifestHash:sample.basis.sourceManifestHash})));
    if (sample.basis.snapshotEvidence) attempt(name + ' authoritative snapshot/graph joins', () => oracle.validateSnapshotGraph(sample.basis, name === 'fresh-order-reference.json' ? p.snapshotAuthority : sample.snapshotAuthority, sample.artifact));
    else failures.push({name:name + ' snapshot authority',code:'MISSING_CURRENT_AUTHORITATIVE_FACTS',message:'No current snapshotEvidence/immutable source counterpart is present; do not synthesize private history.'});
  }
  attempt('current source schema/build commitment', () => assert.equal(p.build.schemaBundleHash, hash(read('studio-runner/src/validator/observedSchemas.json'))));
  return {status:failures.length ? 'FAIL_CURRENT_PACKAGED_CATALOG' : 'PASS_CURRENT_PACKAGED_CATALOG',
    scope:'PURE_SOURCE_CATALOG_NOT_PACKAGED_DIST_OR_EXECUTION', files: Object.keys(references).length,
    canonicalReferenceBundleHash:hash(references), canonicalSchemaBundleHash:hash(read('studio-runner/src/validator/observedSchemas.json')),
    canonicalObservedChoiceHash:hash(p.observedChoice), packagedObservedChoiceHash:hash(references['accepted-observed-choice.json']),
    checks, failures, schemaErrors, operationMutationDeclarations:mutationNames.length,
    nativeExecution:false, hiddenHistoryProof:false, rebuiltDist:false};
}
if (require.main === module) { const report = audit(); console.log(JSON.stringify(report,null,2)); if (report.failures.length) process.exitCode = 1; }
module.exports = { audit, hashes, referenceRoot, contractRoot };
