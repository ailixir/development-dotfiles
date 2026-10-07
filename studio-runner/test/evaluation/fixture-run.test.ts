/**
 * Story 10.26 AC-3 (local half): fixture-backed evaluation runs produce a report stating
 * correctness/coverage, unsupported outcomes, false success, p50/p95 latency at the stated
 * concurrency, token/transport budgets, repairs and capacity recovery, each with pins and
 * explicit denominators. The real fixture app and its independent oracle are used; the API and
 * runner are scripted (see `scripted-backend.ts`). This is not live model evidence (SPK-01).
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer, type FixtureServer } from '../../evaluation/fixture-server.mjs';
import { runEvaluation } from '../../evaluation/lifecycle.mjs';
import type { EvaluationReport } from '../../evaluation/report.mjs';
import { PINS, scriptedBackend, type ScriptOptions } from './scripted-backend.js';

const API_TOKEN = 'synthetic-evaluation-api-token';
const FIXTURE_TOKEN = 'synthetic-evaluation-fixture-token';
const saved = (account: string): Record<string, unknown> => ({
  namespace: 'CURRENT', revisionId: 'CURRENT', configurationRevision: 1, executionStatus: 'PASSED',
  events: [{ type: 'login.accepted', account: 'synthetic-user' }, { type: 'form.saved', account }],
  state: { loggedIn: true, saved: account },
});
const supported = (id: string, family: string): Record<string, unknown> => ({
  id, family, split: 'development', expectedClass: 'SUPPORTED',
  source: ['Go to {TARGET_URL}', 'Click the Log in button', 'Click Save target'], expected: saved('target'),
});
const PAIRED = {
  id: 'paired-edit', family: 'account-save', split: 'development', expectedClass: 'SUPPORTED', scope: 'STEP_SCOPED',
  source: ['Go to {TARGET_URL}', 'Click the Log in button', 'Click Save target'],
  editedSource: ['Go to {TARGET_URL}', 'Click the Log in button', 'Click Save other'],
  baselineExpected: saved('target'), expected: saved('other'),
};
const UNSUPPORTED = { id: 'second-tab', family: 'unsupported-tab', split: 'development', expectedClass: 'UNSUPPORTED',
  source: ['Open a second browser tab and compare it'], expected: { compileOutcome: 'UNSUPPORTED_CAPABILITY' } };
const AMBIGUOUS = { id: 'looks-right', family: 'ambiguous', split: 'development', expectedClass: 'CLARIFICATION',
  source: ['Make sure it looks correct'], expected: { compileOutcome: 'AMBIGUOUS_INTENT' } };

let fixture: FixtureServer;
let temp: string;
const previous = { api: process.env.STUDIO_EVAL_API_TOKEN, fixture: process.env.STUDIO_EVAL_FIXTURE_TOKEN };

beforeAll(async () => {
  process.env.STUDIO_EVAL_API_TOKEN = API_TOKEN;
  process.env.STUDIO_EVAL_FIXTURE_TOKEN = FIXTURE_TOKEN;
  fixture = await startFixtureServer({ token: FIXTURE_TOKEN, targetPort: 0, controlPort: 0 });
  temp = await mkdtemp(join(tmpdir(), 'studio-evaluation-report-'));
});
afterAll(async () => {
  await fixture.close();
  await rm(temp, { recursive: true, force: true });
  for (const [key, value] of [['STUDIO_EVAL_API_TOKEN', previous.api], ['STUDIO_EVAL_FIXTURE_TOKEN', previous.fixture]] as const) {
    if (value === undefined) Reflect.deleteProperty(process.env, key); else process.env[key] = value;
  }
});

interface RunResult { exit: number; report: EvaluationReport; markdown: string; trials: string; runManifest: { tier: string } }
let runCount = 0;
async function evaluate(cases: Record<string, unknown>[], options: ScriptOptions, overrides: Record<string, unknown> = {}): Promise<RunResult> {
  const dir = join(temp, `run-${String(++runCount)}`);
  const evidence = join(dir, 'evidence');
  await mkdir(evidence, { recursive: true });
  const gate = join(dir, 'gate.json');
  await writeFile(gate, JSON.stringify({ status: 'PASS', approvedBy: 'synthetic-fixture', quotaUsd: 1, quotaEnforced: true }));
  const exit = await runEvaluation({
    tier: 'live', purpose: 'development', maxApiCalls: 500, maxTransportCalls: 200, maxElapsedMs: 20_000, repetitions: 1,
    concurrency: 2, orderSeed: 'ac3', allowedTargetOrigins: [fixture.targetOrigin], sourceCommit: 'synthetic-commit',
    dirtyBaselineDigest: 'synthetic-digest', pins: { ...PINS }, fixtureVersion: fixture.fixtureVersion, csiId: '60403',
    approvedGatewayEvidence: gate, apiBaseUrl: 'https://api.example/api/v2/studio',
    executionApiBaseUrl: 'https://api.example/api/v1/studio', fixtureControlUrl: fixture.controlUrl, ...overrides,
  }, { schemaVersion: 1, cases }, evidence, scriptedBackend([fixture.targetOrigin, new URL(fixture.controlUrl).origin], options));
  return {
    exit,
    report: JSON.parse(await readFile(join(evidence, 'summary.json'), 'utf8')) as EvaluationReport,
    markdown: await readFile(join(evidence, 'report.md'), 'utf8'),
    trials: await readFile(join(evidence, 'trials.jsonl'), 'utf8'),
    runManifest: JSON.parse(await readFile(join(evidence, 'run-manifest.json'), 'utf8')) as { tier: string },
  };
}

describe('fixture-backed evaluation report (AC-3 local half)', () => {
  it('a clean fixture run reports every AC-3 metric with denominators and pins, and exits 0', async () => {
    const { exit, report, markdown, runManifest } = await evaluate([supported('save-target', 'save'), PAIRED, UNSUPPORTED, AMBIGUOUS], {});
    expect(exit).toBe(0);
    expect(report.releaseReady).toBe(false);
    // REQ-002: a scripted transport is never labelled as live T3 inference evidence.
    expect(report.tier).not.toMatch(/^T3\b/);
    expect(report.tier).toBe('scripted-transport');
    expect(markdown).toContain('tier scripted-transport;');
    expect(runManifest.tier).toBe('scripted-transport');
    expect(report.evidenceGaps).toEqual([]);
    expect(report.correctness.behavioralCorrectness).toMatchObject({ numerator: 3, denominator: 3, rate: 1 });
    expect(report.coverage.supportedCoverage).toMatchObject({ numerator: 3, denominator: 3 });
    expect(report.unsupportedOutcomes.UNSUPPORTED.correctNonExecutable).toMatchObject({ numerator: 1, denominator: 1 });
    expect(report.unsupportedOutcomes.CLARIFICATION.correctNonExecutable).toMatchObject({ numerator: 1, denominator: 1 });
    expect(report.falseSuccess.perPassExecution).toMatchObject({ numerator: 0, denominator: 3 });
    expect(report.latency.concurrency).toMatchObject({ configuredWorkers: 2 });
    expect(report.latency.compileToCandidate).toMatchObject({ samples: 5, denominator: 5, missingSamples: 0 });
    expect(report.latency.compileToCandidate.p95Ms).toBeGreaterThanOrEqual(report.latency.compileToCandidate.p50Ms ?? Infinity);
    // 5 trials; the paired trials each carry a baseline compile too: 7 compiles x 100 input tokens.
    expect(report.budgets.tokens.input).toEqual({ total: 700, availableTrials: 5, denominator: 5 });
    expect(report.budgets.transport).toMatchObject({ reservedCalls: 63, maxTransportCalls: 200, maxApiCalls: 500, stoppedBy: null });
    expect(report.budgets.cost).toBe('unavailable');
    expect(report.capacity).toMatchObject({ admissionsRefused: 0, admissionsAccepted: 7 });
    expect(report.pins).toMatchObject({ declared: PINS, sourceCommit: 'synthetic-commit', fixtureVersion: '1.0.0' });
    expect(report.pins.runtimeMismatch).toMatchObject({ numerator: 0, denominator: 3 });
    expect(Object.keys(report.byRequestedMode).sort()).toEqual(['AUTO', 'FULL']);
    expect(report.byRequestedMode.AUTO?.correctness.behavioralCorrectness).toMatchObject({ numerator: 1, denominator: 1 });
    for (const heading of ['## Pins', '## Correctness and coverage', '## Unsupported and ambiguous outcomes', '## False success',
      '## Latency', '## Token and transport budgets', '## Repairs', '## Capacity and recovery', '## By requested mode']) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).toContain('Behavioral correctness: 3/3 (100.0%) — denominator: all planned SUPPORTED trials');
    expect(markdown).toContain('Stated concurrency: {"configuredWorkers":2');
  });

  it('wrong-account false success, refused admission and repair are all visible against explicit denominators', async () => {
    const { exit, report, markdown, trials } = await evaluate(
      [supported('overload-save', 'overload'), supported('save-target', 'save'), supported('wrong-save', 'wrong'), PAIRED, UNSUPPORTED, AMBIGUOUS],
      { refuseFirstCompile: ['overload-save'], wrongAccount: ['wrong-save'], repaired: ['save-target'] });
    // A refused admission leaves a planned trial incomplete: incomplete evidence outranks the false success.
    expect(exit).toBe(2);
    expect(report.missingTrials).toBe(1);
    expect(report.correctness.behavioralCorrectness).toMatchObject({ numerator: 3, denominator: 5 });
    expect(report.coverage.supportedCoverage).toMatchObject({ numerator: 4, denominator: 5 });
    expect(report.falseSuccess.count).toBe(1);
    expect(report.falseSuccess.perSupportedTrial).toMatchObject({ numerator: 1, denominator: 5 });
    expect(report.falseSuccess.perPassExecution).toMatchObject({ numerator: 1, denominator: 4 });
    expect(report.latency.compileToCandidate).toMatchObject({ samples: 6, denominator: 7, missingSamples: 1 });
    expect(report.repairs.enteredRepair).toMatchObject({ numerator: 1, denominator: 6 });
    expect(report.repairs.repairTelemetryMissing).toBe(1);
    expect(report.repairs.repairYield).toMatchObject({ numerator: 1, denominator: 1 });
    expect(report.capacity).toMatchObject({ admissionsRefused: 1, recovery: { numerator: 1, denominator: 1 } });
    if (report.capacity === 'unavailable') throw new Error('capacity must be reported');
    expect(report.capacity.recovery.maxMs).toBeGreaterThan(0);
    expect(report.capacity.postDeadlineCalls).toBe('unavailable');
    expect(markdown).toContain('False success');
    expect(markdown).toContain('Per PASS execution: 1/4 (25.0%)');
    expect(markdown).toContain('Recovered after refusal: 1/1');
    expect(trials).toContain('Compile admission refused (capacity)');
    expect(trials).not.toContain(API_TOKEN);
    expect(trials).not.toContain(FIXTURE_TOKEN);
  });

  it('a hard call ceiling stops work, names the ceiling, and keeps unrun trials in the denominators', async () => {
    const { exit, report } = await evaluate([supported('save-target', 'save'), supported('save-again', 'save2')], {},
      { concurrency: 1, maxApiCalls: 8 });
    expect(exit).toBe(2);
    expect(report.budgets.transport.stoppedBy).toBe('maxApiCalls');
    expect(report.correctness.behavioralCorrectness.denominator).toBe(2);
    expect(report.correctness.behavioralCorrectness.numerator).toBeLessThan(2);
  });
});
