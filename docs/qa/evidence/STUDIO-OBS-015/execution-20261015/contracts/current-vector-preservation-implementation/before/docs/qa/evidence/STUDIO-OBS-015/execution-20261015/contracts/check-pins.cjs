'use strict';
// Pure source/pin gate; no Java, runtime build, database, browser or model is started.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const root = path.resolve(__dirname, '../../../../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const api = YAML.parse(read('docs/specs/studio/openapi.yaml'));
const actual = new Map();
for (const [route, item] of Object.entries(api.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
      actual.set(method.toUpperCase() + ' ' + route, Object.keys(operation.responses).sort().join(','));
    }
  }
}
const javaPath = 'backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java';
const java = read(javaPath);
const expected = new Map([...java.matchAll(/expected\.put\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)]
  .map(match => [match[1], match[2]]));
assert.equal(expected.size, 43);
assert.deepEqual([...actual].sort(), [...expected].sort());
const digest = crypto.createHash('sha256').update(read('docs/specs/studio/openapi.yaml')).digest('hex');
for (const [file, pattern] of [[javaPath, /BASE_SHA256 = "([a-f0-9]{64})"/],
  ['studio-runner/test/run/confinement.test.ts', /BASE_SHA256 = '([a-f0-9]{64})'/]]) {
  assert.equal(read(file).match(pattern)?.[1], digest, file);
}
const generatedTypes = {};
for (const file of ['studio-runner/src/guided/types.ts', 'studio-runner/src/executor/observedOperations.ts']) {
  const names = [...read(file).matchAll(/export (?:interface|type) ([A-Za-z0-9]+)/g)].map(match => match[1]);
  assert.equal(names.length, new Set(names).size, 'unique emitted type names');
  generatedTypes[file] = names.length;
}
const catalog = require('./correction-05-packaged-reference-01/catalog-audit.cjs').audit();
console.log(JSON.stringify({ status: catalog.failures.length ? 'FAIL_CATALOG_SOURCE_PINS' : 'PASS', scope: 'PURE_PIN_AND_OPERATION_STATUS_PARITY_AND_SOURCE_CATALOG',
  openapiSHA256: digest, operations: actual.size, quotedPins: 2, generatedTypes,
  catalog,
  applicationTests: 0, databaseCommands: 0, browserCommands: 0 }, null, 2));
assert.equal(catalog.failures.length, 0, 'current packaged source catalog must match canonical witnesses and closed schemas before build');
