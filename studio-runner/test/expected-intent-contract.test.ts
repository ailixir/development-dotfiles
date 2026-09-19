import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageRoot } from './helpers/corpus.js';
import type { YamlValue } from './helpers/openapi.js';
import { parseYaml, validateAgainstSchema } from './helpers/openapi.js';

const document = parseYaml(
  readFileSync(join(packageRoot, '..', 'docs', 'specs', 'studio', 'openapi.yaml'), 'utf8'),
);
const expectedOperationSchema = (document as { components: { schemas: Record<string, YamlValue> } })
  .components.schemas.ExpectedOperation;
if (expectedOperationSchema === undefined) throw new Error('ExpectedOperation schema is missing');
const schema: YamlValue = expectedOperationSchema;
const literal = { kind: 'literal', value: 'x' };
const locator = { segments: [{ kind: 'getByText', text: literal, options: { exact: true } }] };
const operations = [
  { op: 'goto', url: literal, options: { waitUntil: 'load', timeout: 1000 } },
  { op: 'waitForURL', url: literal },
  { op: 'click', locator, options: { button: 'right', clickCount: 2, force: true, trial: true, timeout: 1000 } },
  { op: 'fill', locator, value: { kind: 'secret', id: 'PW' } },
  { op: 'press', locator, key: literal, options: { delay: 1 } },
  { op: 'check', locator }, { op: 'uncheck', locator }, { op: 'hover', locator },
  { op: 'selectOption', locator, value: { kind: 'variable', name: 'REGION' } },
  { op: 'expectVisible', locator },
  { op: 'expectContainText', locator, expected: literal, options: { ignoreCase: true, useInnerText: true } },
  { op: 'expectValue', locator, expected: literal },
  { op: 'expectUrl', expected: { kind: 'regex', source: 'x', flags: 'u' }, options: { ignoreCase: true } },
  { op: 'expectTitle', expected: literal },
] as const;

describe('closed expected-intent v1 OpenAPI operation contract', () => {
  it.each(operations.map((operation) => [operation.op, operation] as const))(
    'accepts the closed %s shape',
    (_name, operation) => {
      expect(validateAgainstSchema(operation, schema, document)).toEqual([]);
    },
  );

  it('rejects unknown operation, locator, value and option fields', () => {
    for (const operation of [
      { ...operations[0], unknown: true },
      { op: 'click', locator: { segments: [{ ...locator.segments[0], unknown: true }] } },
      { op: 'goto', url: { ...literal, unknown: true } },
      { op: 'click', locator, options: { unknown: true } },
    ]) {
      expect(validateAgainstSchema(operation, schema, document).length).toBeGreaterThan(0);
    }
  });
});
