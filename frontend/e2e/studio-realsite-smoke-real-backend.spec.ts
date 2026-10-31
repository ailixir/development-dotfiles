import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GATE_DIR, isDryRunId } from './realsite-gate/common.ts';
import { runFlow } from './realsite-gate/driver.ts';
import { DIR, RUN_ID, guard, makeContext, writeResult } from './realsite-gate/specsupport.ts';

/**
 * G0 smoke (X-5): the five flows of realsite-gate/smoke-flows.json, each learned, confirmed and replayed once,
 * under a dry- run id only. Same stack and env as the gate spec (see realsite-gate/README.md). Run with
 * `--reporter=list,json` so `gate-cli collect` finds the JSON report. Skipped without CHECKS_GATE_MODE=run; a skip is NOT evidence.
 */
const smoke = JSON.parse(readFileSync(join(GATE_DIR, 'smoke-flows.json'), 'utf8')) as { flows: { key: string; site: string; steps: string[] }[] };

for (const s of smoke.flows) {
  test(`smoke ${s.key}`, async ({ page }) => {
    guard('run');
    if (!isDryRunId(RUN_ID)) throw new Error(`the smoke runs under a dry- run id only, got '${RUN_ID}'`);
    test.setTimeout(30 * 60_000);
    mkdirSync(join(DIR, 'results'), { recursive: true });
    const startedAt = new Date().toISOString();
    const ctx = await makeContext(page);
    const flow = await runFlow(page, ctx, { key: s.key, flow: { id: 'main', steps: s.steps }, mode: 'first', proceed: true, description: `G0 smoke ${s.site}` });
    writeResult({ key: s.key, kind: 'positive', status: 'RAN', voidReason: null, flows: [flow], startedAt, endedAt: new Date().toISOString() });
    const rev = flow.publication?.revisionId ?? null;
    const proofReceipts = flow.proofReceipts ?? [];
    const summary = {
      key: s.key,
      learned: flow.learned,
      error: flow.error,
      proof: flow.proof?.status ?? null,
      confirmedIsProven: rev !== null && flow.headAfterProof?.confirmed === rev,
      receiptsAllPassed: proofReceipts.length === s.steps.length && proofReceipts.every((r) => r.status === 'PASSED'),
      replays: flow.replays.map((r) => r.status),
    };
    writeFileSync(join(DIR, 'results', `${s.key}.summary.json`), JSON.stringify(summary, null, 1));
    expect(summary.learned && summary.proof === 'PASSED' && summary.confirmedIsProven && summary.receiptsAllPassed && summary.replays.every((x) => x === 'PASSED'), JSON.stringify(summary)).toBe(true);
  });
}
