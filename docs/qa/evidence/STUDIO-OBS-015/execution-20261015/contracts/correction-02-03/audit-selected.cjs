'use strict';
// Read-only selected contract audit; no application, DB, browser, compilation or generation.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../../../../..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const here = path.relative(root, __dirname), before = read(here + '/before-manifest.json');
const c = require(path.join(root, 'tools/check-studio-observed-contracts.cjs'));
const P = 'docs/specs/studio-observed-authoring/contracts/v3/';
const actual = read(P + 'replay-validation.schema.json'), original = read(here + '/before/' + P + 'replay-validation.schema.json');
original.definitions.AcceptedTranslationPlan.properties.needs.items.properties.consumers.minItems = 0;
assert.deepEqual(actual, original, 'one authorized scalar is the entire schema delta');
const schemas = Object.keys(before).filter(name => name.endsWith('.schema.json'));
for (const file of schemas) if (file !== P + 'replay-validation.schema.json') assert.equal(sha(file), before[file], file);
assert.equal(sha(P + 'guided-model-response.schema.json'), '2d986c098548b604d6fe75a3597397eabe325705550a78286e76ae5ae2a176ca');
assert.equal(sha('tools/studio-snapshot-contract-oracle.cjs'), before['tools/studio-snapshot-contract-oracle.cjs']);
const definitions = [];
for (const file of schemas) {
  const visit = (value, pointer) => {
    if (!value || typeof value !== 'object') return;
    if (value.properties?.consumers) definitions.push({ file, pointer: pointer + '/properties/consumers/minItems', minimum: value.properties.consumers.minItems });
    for (const [key, child] of Object.entries(value)) visit(child, pointer + '/' + key);
  };
  visit(read(file), '');
}
assert.equal(definitions.length, 6);
for (const definition of definitions) assert.equal(definition.minimum, definition.file === P + 'guided-model-response.schema.json' ? 1 : 0);
const publication = read(P + 'publication-fixtures.json'), oldPublication = read(here + '/before/' + P + 'publication-fixtures.json');
const preserved = structuredClone(publication); delete preserved.graphTimingConformance;
const changedReferencePaths = [];
function difference(left, right, pointer = '') {
  if (JSON.stringify(left) === JSON.stringify(right)) return;
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    assert.deepEqual(Object.keys(left), Object.keys(right), 'existing keys stay exact at ' + pointer);
    for (const key of Object.keys(left)) difference(left[key], right[key], pointer + '/' + key);
    return;
  }
  assert(pointer.endsWith('/schemaBundleHash') || pointer.endsWith('/buildHash'), 'unapproved old Data payload mutation: ' + pointer);
  changedReferencePaths.push(pointer);
}
difference(oldPublication, preserved);
for (const field of ['basis', 'artifact', 'observedChoice', 'incrementalContracts', 'snapshotCorrection', 'positive', 'negative']) {
  assert.deepEqual(publication[field], oldPublication[field], 'existing case payloads preserved: ' + field);
}
const E = 'docs/qa/evidence/STUDIO-OBS-015/execution-20261015/';
const manifestPaths = ['final-design/architect', 'final-design/data'].map(name => 'docs/qa/evidence/STUDIO-OBS-015/' + name);
manifestPaths.push(...['01', '02', '03', '04'].map(number => E + 'architecture-correction-' + number));
let historicalFiles = 0;
for (const directory of manifestPaths) for (const [name, digest] of Object.entries(read(directory + '/manifest.json').files)) {
  const file = fs.existsSync(path.join(root, name)) ? name : directory + '/' + name;
  assert.equal(sha(file), digest, 'frozen historical artifact: ' + file); historicalFiles++;
}
assert.equal(sha(E + 'contracts/correction-01/implementation-receipt.json'), 'd77ab91bcca191a25370c70c330f141005d526efb2c237615e0156381263ad21');
assert.equal(sha(here + '/checkpoint-receipt.json'), 'f764d35c8c24a298661261efe38a932acdc14996e4b8536b6c3801d2f3694078');
assert.equal(sha(here + '/post-patch-checkpoint-receipt.json'), '92452a2d6d3795a3f4babcd40a8c9a1236f19c7bc19a91d7c81dc7f58cf593d9');
const classification = { positive: 0, negative: 0 }, rejectionReasons = [];
for (const test of publication.graphTimingConformance.graphCases) {
  if (test.expected === 'ACCEPT') { classification.positive++; continue; }
  assert.equal(test.expected, 'REJECT'); classification.negative++;
  let code = null;
  try { c.validateExtendedBasis(test.basis, test.authority); c.validateSnapshotGraph(test.basis, test.authority.snapshot, test.expectedArtifact); }
  catch (error) { code = error.code; }
  assert(code && typeof code === 'string', 'semantic negative cannot depend on internal errors: ' + test.name);
  rejectionReasons.push({ name: test.name, code });
}
assert.equal(classification.positive, 4); assert.equal(classification.negative, 43);
console.log(JSON.stringify({ status: 'PASS_SELECTED_PRESERVATION_AUDIT', schemas: schemas.length, schemaStructuralChanges: 1,
  allSixConsumerDefinitions: definitions, rawModelByteExact: true, correction01HelperByteExact: true,
  allOriginalCasePayloadsByteEquivalentAsJSON: true, onlyNecessaryOldBuildReferencePaths: changedReferencePaths,
  frozenHistoricalFilesVerified: historicalFiles, graphCaseClassifications: classification, rejectionReasons,
  generatedCanonicalBundle: publication.build.schemaBundleHash, generationWritesSinceCheckpoint: 0,
  applicationAcceptanceCredit: false, nativeConsentHistoryProof: false }, null, 2));
