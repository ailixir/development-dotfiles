import {anchorHash} from './anchor.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { positivesOf } from './common.ts';
import { evaluateRun } from './evaluate.ts';
import { renderReport } from './report.ts';
import type { RunReportInput } from './report.ts';
import { cleanScan, control, flow, goodBundle, navStep, result, attempt, table } from './testkit.ts';

const input = (bundle = goodBundle()): RunReportInput => ({ bundle, evaluation: evaluateRun(bundle) });
const SECRET_VALUE = 'cnry-a1b2c3d4e5f6-0a1b2c3d4e5f-9f8e7d6c5b4a';

test('a passing run renders the verdict first, every test, controls, scan denominators, metrics and same-day seal; exit 0', () => {
  const out = renderReport([input()], '2026-10-28T13:00:00Z');
  assert.equal(out.verdict, 'PASS');
  assert.equal(out.exitCode, 0);
  assert.equal(out.refused, null);
  assert.match(out.markdown.split('\n')[0] ?? '', /: PASS$/);
  for (const t of positivesOf(table)) assert.ok(out.markdown.includes(`| ${t.key} |`), t.key);
  for (const key of ['N1', 'N2', 'N3']) assert.ok(out.markdown.includes(`| ${key} |`), key);
  assert.match(out.markdown, /Denominators: 12 text files, 12 text bytes, 0 opaque bytes/);
  assert.match(out.markdown, /70 tables \/ 100 rows/);
  assert.match(out.markdown, /LEAK hits: 0\. PAGE_ORIGIN hits: 0\./);
  assert.match(out.markdown, /Product-admitted rate/);
  assert.match(out.markdown, /by diagnostics Gate \(persisted rejection_gate\): STEP_SYNTAX/);
  assert.match(out.markdown, /p50 2\.0 s, p95 9\.0 s/);
  assert.doesNotMatch(out.markdown, /### Next day|\| Nextday ID|PENDING_NEXT_DAY/);
  assert.match(out.markdown, /user removed next-day\/24-hour replay and L1 login acceptance/);
  assert.match(out.markdown, /SAME_DAY_PASS event/);
  assert.match(out.markdown, /\| 1 \| Learn \| PASS \|/);
  assert.match(out.markdown, /\| 6 \| Reported metrics \| PASS \|/);
});

test('complete current evidence passes without login or next-day evidence', () => {
  const b=goodBundle(false);
  const out = renderReport([input(b)], 'now');
  assert.equal(out.verdict, 'PASS');
  assert.equal(out.exitCode, 0);
  assert.match(out.markdown.split('\n')[0] ?? '', /: PASS$/);
  assert.doesNotMatch(out.markdown, /### Next day|\| l1a \||\| l1b \||PENDING_NEXT_DAY/);
});

test('failures are rendered with their reasons and set a non-zero exit', () => {
  const bad = goodBundle();
  bad.results.mdn = result('mdn', 'positive', [flow({ learned: false, learnAttempts: [attempt({ cls: 'GROUNDING', errorCode: 'UNSUPPORTED_SURFACE', state: 'FAILED', receipt: false })], proof: null, replays: [] })]);
  const out = renderReport([input(bad)], 'now');
  assert.equal(out.verdict, 'FAIL');
  assert.equal(out.exitCode, 1);
  assert.match(out.markdown, /mdn: not learned \(GROUNDING UNSUPPORTED_SURFACE\)/);

  const zero = goodBundle();
  zero.results.N1 = result('N1', 'control', [control('TARGET_DRIFT', 'SUCCEEDED', [navStep()], { afterLearnExecutions: 1 })]);
  const hard = renderReport([input(zero)], 'now');
  assert.equal(hard.exitCode, 1);
  assert.match(hard.markdown, /false pass/);
  assert.match(hard.markdown, /#1 0: \[goto\] ok/, 'controls list the receipt of every dispatched step');
  assert.match(hard.markdown, /Playwright reference sha256/);
  assert.ok(!hard.markdown.includes('Q4 independent region audit'));

  const voided = goodBundle();
  voided.voidKeys['iana-home'] = 'ground truth no longer resolves: iana-nav-01 pass:false';
  const v = renderReport([input(voided)], 'now');
  assert.equal(v.verdict, 'INCOMPLETE');
  assert.equal(v.exitCode, 2);
  assert.match(v.markdown, /iana-home: VOID/);

  const invalid = goodBundle();
  invalid.preconditionsOk = false;
  assert.equal(renderReport([input(invalid)], 'now').exitCode, 2);
});

test('earlier failed runs stay in the report under their own run ids; the last run is the candidate', () => {
  const first = goodBundle();
  first.runId = 'rg-20261027-1';
  first.results.mdn = result('mdn', 'positive', [flow({ learned: false, learnAttempts: [attempt({ cls: 'GROUNDING', receipt: false, errorCode: 'MISSING_SOURCE' })], proof: null, replays: [] })]);
  const second = goodBundle();
  second.runId = 'rg-20261028-1';
  if (second.environment !== null) second.environment.runId = 'rg-20261028-1';
  second.scanFile!.runId=second.runId;second.anchor!.runId=second.runId;const {eventHash,...body}=second.anchor!;void eventHash;second.anchor!.eventHash=anchorHash(body);
  for(const r of Object.values(second.results))for(const f of r?.flows ?? [])if(f.learningTiming!==undefined){f.learningTiming.runId=second.runId;for(const receipt of f.learningTiming.receipts)receipt.runId=second.runId;}
  const out = renderReport([input(first), input(second)], 'now');
  assert.match(out.markdown, /Candidate run: rg-20261028-1/);
  assert.match(out.markdown, /## Run rg-20261027-1: FAIL/);
  assert.match(out.markdown, /## Run rg-20261028-1: PASS/);
  assert.equal(out.verdict, 'PASS');
  assert.equal(out.exitCode, 0);
});

test('report labels conservative per-step milliseconds and unknown/timeout coverage truthfully', () => {
  const b = goodBundle();
  const pass = renderReport([input(b)], 'now').markdown;
  assert.match(pass, /Learning upper bound \(ms\)/);
  assert.match(pass, /PASS \(conservative upper bound\)/);
  assert.match(pass, /not exact backend completion timestamps/);
  b.results.mdn!.flows[0]!.learningTiming!.failure = { code: 'STEP_LEARNING_TIMEOUT', atMs: 120_001 };
  assert.match(renderReport([input(b)], 'now').markdown, /STEP_LEARNING_TIMEOUT/);
  b.results.mdn!.flows[0]!.learningTiming = undefined;
  const missing = renderReport([input(b)], 'now');
  assert.notEqual(missing.verdict, 'PASS');
  assert.match(missing.markdown, /UNKNOWN coverage/);
});

test('dry-run ids and an empty list are refused', () => {
  const dry = goodBundle();
  dry.runId = 'dry-20261027-1';
  const refused = renderReport([input(dry)], 'now');
  assert.equal(refused.exitCode, 2);
  assert.match(refused.refused ?? '', /dry run/);
  assert.equal(refused.markdown, '');
  assert.equal(renderReport([], 'now').exitCode, 2);
});

test('no canary value or secret can appear in the report', () => {
  const b = goodBundle();
  b.scan = { ...cleanScan(), leak: 1, hits: [{ source: 'gateway', file: '0001.req.json', offset: 5, canary: 'GATE_CANARY', cls: 'SECRET', form: 'raw', verdict: 'LEAK', reason: 'SECRET_CANARY' }] };
  const out = renderReport([input(b)], 'now').markdown;
  assert.ok(!out.includes(SECRET_VALUE) && !out.includes('Password123'));
  assert.match(out, /GATE_CANARY:SECRET:41ch:bbbbbb/);
  assert.match(out, /SECRET_CANARY/);
});

test('current report retains hard-zero failure and all safe hit rows including PAGE_ORIGIN',()=>{
  const b=goodBundle();const scan=cleanScan();
  scan.pageOrigin=201;scan.hits=Array.from({length:201},(_,offset)=>({source:'db',file:`safe-${offset}.json`,offset,canary:'GATE_CANARY',cls:'SECRET' as const,form:'raw' as const,verdict:'PAGE_ORIGIN' as const,reason:'PAGE_ORIGIN' as const}));
  b.scan=scan;b.scanFile!.scan=scan;
  const out=renderReport([input(b)],'now');
  assert.equal(out.verdict,'FAIL');assert.equal(out.exitCode,1);
  assert.match(out.markdown,/Total canary hits: 201\. LEAK hits: 0\. PAGE_ORIGIN hits: 201/);
  assert.match(out.markdown,/safe-200\.json/);
});
