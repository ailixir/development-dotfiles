import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GATE_DIR, loadTable } from './common.ts';

interface SmokeFlow { key: string; site: string; steps: string[] }
const smoke = JSON.parse(readFileSync(join(GATE_DIR, 'smoke-flows.json'), 'utf8')) as { flows: SmokeFlow[] };
const table = loadTable();

test('smoke-flows.json defines the five G0 flows with unique keys outside the gate table', () => {
  assert.equal(smoke.flows.length, 5);
  assert.equal(new Set(smoke.flows.map((f) => f.key)).size, 5);
  const gateKeys = new Set(table.tests.map((t) => t.key));
  for (const flow of smoke.flows) {
    assert.ok(!gateKeys.has(flow.key), `${flow.key} is a gate-table key`);
    assert.ok(flow.steps.length > 0, flow.key);
    for (const step of flow.steps) assert.ok(step.length > 0 && step.trim() === step, `${flow.key}: step text`);
    assert.match(flow.steps[0] ?? '', /^Go to (the page )?"https:\/\/[^"]+"$/, `${flow.key}: starts with navigation`);
  }
  assert.deepEqual(smoke.flows.map((f) => f.site).sort(), ['en.wikipedia.org', 'github.com', 'www.iana.org', 'www.iana.org', 'www.kernel.org']);
});
