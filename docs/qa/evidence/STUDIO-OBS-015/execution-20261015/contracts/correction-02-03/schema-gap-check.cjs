'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../../../../../..');
const Ajv = require(path.join(root, 'node_modules/ajv'));
const formats = require(path.join(root, 'node_modules/ajv-formats'));
const directory = path.join(root, 'docs/specs/studio-observed-authoring/contracts/v3');
const ajv = new Ajv({ strict: true, allErrors: true }); formats(ajv);
for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.schema.json'))) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(directory, name))));
}
const fixtures = JSON.parse(fs.readFileSync(path.join(directory, 'publication-fixtures.json')));
const validator = ajv.getSchema('https://checks.citi.example/contracts/observed/v3/replay-validation.schema.json#/definitions/ValidationBasis');
const cases = fixtures.graphTimingConformance.graphCases.map(test => ({ name: test.name,
  expectedByReviewedGraphSemantics: 'VALID', schemaValid: validator(test.basis), errors: structuredClone(validator.errors) }));
console.log(JSON.stringify({ status: cases.every(test => test.schemaValid) ? 'PASS' : 'BLOCKED_SCHEMA_AUTHORIZATION_PENDING',
  pointer: 'replay-validation.schema.json#/definitions/AcceptedTranslationPlan/properties/needs/items/properties/consumers/minItems',
  actualMinItems: 1, schemaChanged: false, generatorWrites: 0, cases }, null, 2));
process.exitCode = cases.every(test => test.schemaValid) ? 0 : 1;
