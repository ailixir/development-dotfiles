import {captureHnAmendment,applyHnAmendment} from './realsite-gate/public-label-preflight.ts';
import { appendFreezeCheckpoint } from './realsite-gate/freeze.ts';
import { captureRuntimeFreeze, externalCoreDeclaration, readManifest } from './realsite-gate/environment.ts';
import { scanVerdict } from './realsite-gate/leakscan.ts';
import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUN_ID_RE, flowsOf, isDryRunId, isInside, nowIso, positivesOf, readJson, REPO_ROOT, writeJson } from './realsite-gate/common.ts';
import { authorSteps, createUiTest, runFlow, saveDraft } from './realsite-gate/driver.ts';
import { collectEnvironment, loadCanaries } from './realsite-gate/environment.ts';
import { evaluateControl, positiveFindings, validateDryRunScan, validateEnvironment, verifyIsSameDay } from './realsite-gate/evaluate.ts';
import type { ScanFile, TestResult } from './realsite-gate/evaluate.ts';
import { recorderCount } from './realsite-gate/recorder.ts';
import { runScan } from './realsite-gate/scanrun.ts';
import {
  DIR,
  GATE_TABLE,
  RUN_ID,
  backendUrl,
  baseUrl,
  guard,
  makeContext,
  outRoot,
  proxyStateFor,
  proxyUrl,
  requirePreconditions,
  voidReasonFor,
  writeResult,
} from './realsite-gate/specsupport.ts';
import { LIVE_PORTS, gatePorts } from './realsite-gate/stack/ports.mjs';
import { getJson, psqlConfigFromEnv, psqlScalar } from './realsite-gate/status.ts';

/**
 * ADR-SC-007 WI-5: the real-site release gate, run mode.
 *
 * WHAT THIS IS. The real-site E2E through the Studio UI on the real stack: 14 positive tests (6 alpha
 * sites, 8 fresh-site tests), the safety controls N1, N2, N3, then a leak scan.
 * Every test creates its own UI test, drives All Checks -> Create Check -> UI Test -> editor -> Save ->
 * Run Test (learn) -> proof replay -> two manual replays -> detail page. The test table is
 * realsite-gate/gate-table.json; the verdict logic is realsite-gate/evaluate.ts (pure, unit-tested).
 *
 * HOW IT IS SELECTED. The file name ends -real-backend.spec.ts, so it belongs to the `real-backend`
 * project only and never to msw. It also needs CHECKS_GATE_MODE=run and CHECKS_GATE_RUN_ID=rg-... ; with
 * CHECKS_GATE_MODE unset every test is skipped. THAT MEANS `CHECKS_E2E_REAL_BACKEND=1 pnpm run test:e2e`
 * EXITS 0 WITHOUT RUNNING THE GATE AND IS NOT EVIDENCE. Evidence exists only when `gate-cli report`
 * exits 0. A set but misspelled mode fails the environment test.
 *
 * WHAT IT NEEDS. The stack launched by realsite-gate/stack/gate-stack.sh (see realsite-gate/README.md),
 * its manifest in CHECKS_GATE_STACK_MANIFEST, the recorder in CHECKS_GATE_PROXY_URL, CHECKS_GATE_PGPORT,
 * CHECKS_GATE_OUT (outside the worktree for rg- runs) and CHECKS_GATE_CANARY_FILE.
 * The existing general privacy canary is sufficient; no login secret is required.
 */

// Playwright traces, screenshots and videos can capture fill values, and Playwright refuses test.use({ trace })
// inside a describe group (it forces a new worker), so none is kept for any test of this file. The gate keeps its
// own redacted UI snapshots (ui/*.txt) and the product's recordings instead.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const dryFlag = ['1', 'true'].includes(process.env.CHECKS_GATE_DRY_RUN ?? '');

test('environment and preconditions', async ({ page }) => {
  guard('run');
  test.setTimeout(15 * 60_000);
  const problems: string[] = [];
  if (!RUN_ID_RE.test(RUN_ID)) throw new Error('CHECKS_GATE_RUN_ID must match rg-YYYYMMDD-N (evidence) or dry-YYYYMMDD-N (dry run)');
  mkdirSync(DIR, { recursive: true });
  if (isDryRunId(RUN_ID) !== dryFlag) problems.push('CHECKS_GATE_DRY_RUN and the run id prefix disagree');
  if (!isDryRunId(RUN_ID)) {
    if (process.env.CHECKS_GATE_OUT === undefined || process.env.CHECKS_GATE_OUT === '') problems.push('CHECKS_GATE_OUT is required for an rg- run');
    else if (isInside(outRoot(), REPO_ROOT) || /(^|[\\/])node_modules([\\/]|$)/.test(outRoot())) problems.push('CHECKS_GATE_OUT must be outside the worktree and outside node_modules');
  }
  if (loadCanaries().filter((c) => c.cls === 'SECRET').length === 0) problems.push('no SECRET canary: set CHECKS_GATE_CANARY_FILE (gate-cli init)');

  const record = collectEnvironment({
    runId: RUN_ID,
    dryRun: dryFlag,
    outDir: outRoot(),
    gatewayDir: join(DIR, 'gateway'),
    proxyConfigured: proxyUrl() !== null,
    manifestPath: process.env.CHECKS_GATE_STACK_MANIFEST,
    backendUrl: backendUrl(),
  });
  problems.push(...validateEnvironment(record, dryFlag));

  // Same-day corpus verification, judged by `gate-cli verify`.
  if (!isDryRunId(RUN_ID)) {
    const verifyFile = join(DIR, 'verify.json');
    const judgementFile = join(DIR, 'verify-judgement.json');
    if (!existsSync(verifyFile) || !existsSync(judgementFile)) problems.push('no verify.json: run `gate-cli verify` the same day');
    else {
      const report = readJson<{ date: string }>(verifyFile);
      if (!verifyIsSameDay(report.date, record.startedAt)) problems.push(`verify.json (${report.date}) is not from the same day, within 12 h before this run`);
      const judgement = readJson<{ invalid: string | null }>(judgementFile);
      if (judgement.invalid !== null) problems.push(`verify judgement invalid: ${judgement.invalid}`);
    }
    const dryScanPath = process.env.CHECKS_GATE_DRYRUN_SCAN;
    const dryScan = dryScanPath !== undefined && existsSync(dryScanPath) ? readJson<ScanFile>(dryScanPath) : null;
    problems.push(...validateDryRunScan(dryScan, record.startedAt));
  }

  // Never the live dev stack: neither the backend, nor the app origin, nor the recorder may sit on a live port.
  const livePorts = new Set<number>(Object.values(LIVE_PORTS));
  for (const [label, url] of [['backend', backendUrl()], ['app origin', baseUrl()], ['recorder', proxyUrl() ?? 'http://127.0.0.1:1']] as const) {
    if (livePorts.has(Number(new URL(url).port))) problems.push(`the ${label} (${url}) is on a port of the live dev stack; the gate runs on its own ports (CHECKS_GATE_PORT_*)`);
  }

  if (Number(new URL(baseUrl()).port) !== gatePorts().app) {
    problems.push(`the app origin ${baseUrl()} is not the gate app port ${gatePorts().app}: export CHECKS_E2E_APP_PORT=${gatePorts().app} (the backend only allows that origin)`);
  }

  // The stack: backend, features, CSI, psql, recorder.
  const base = baseUrl();
  try {
    const health = await fetch(`${backendUrl()}/actuator/health`);
    if (health.status >= 500) problems.push(`backend health answered ${health.status}`);
  } catch (failure) {
    problems.push(`no backend answered at ${backendUrl()}: ${String(failure)}`);
  }
  const ctx = await makeContext(page);
  try {
    const features = (await getJson(ctx.request, `${base}/api/v1/features`)) as { sources: { type: string; enabled: boolean }[]; features: { key: string; enabled: boolean }[] };
    if (features.sources.find((s) => s.type === 'UI_TEST')?.enabled !== true) problems.push('the UI_TEST source is off');
    const studio = features.features.find((f) => f.key === 'STUDIO');
    if (studio !== undefined && !studio.enabled) problems.push('the STUDIO feature is off');
    const csis = JSON.stringify(await getJson(ctx.request, `${base}/api/v1/csi?page=0&size=200`));
    if (!csis.includes(GATE_TABLE.csiId)) problems.push(`CSI ${GATE_TABLE.csiId} is not registered`);
  } catch (failure) {
    problems.push(`feature/CSI read failed: ${String(failure)}`);
  }
  try {
    if (psqlScalar(psqlConfigFromEnv(), 'select 1') !== '1') problems.push('psql select 1 did not answer 1');
  } catch (failure) {
    problems.push(`psql is mandatory for an evidence run: ${String(failure).split('\n')[0]}`);
  }
  if (proxyUrl() !== null) {
    try {
      await recorderCount(proxyUrl() ?? '');
    } catch (failure) {
      problems.push(`the recorder at ${proxyUrl()} does not answer: ${String(failure)}`);
    }
  }

  // One UI-created throwaway test: proves the browser POST path (CORS) and guided-run capabilities.
  try {
    const id = await createUiTest(page, ctx, `Release gate ${RUN_ID} precondition`, 'precondition probe; deleted right away');
    // guidedStart is unavailable for a draft with no step (StudioCapabilitiesService.hasStep), so the probe authors one.
    await authorSteps(page, ['Go to "https://www.iana.org/"']);
    await saveDraft(page);
    const caps = (await getJson(ctx.request, `${base}/api/v1/studio/tests/${id}/capabilities`)) as { guidedStart: { available: unknown } };
    if (caps.guidedStart.available !== true) problems.push('capabilities: guidedStart.available is not true (runner, model gateway or worker missing)');
    await ctx.request.delete(`${base}/api/v1/studio/tests/${id}`);
  } catch (failure) {
    problems.push(`the UI create probe failed (CORS origin ${base} must be in CHECKS_CORS_ALLOWED_ORIGINS): ${String(failure).split('\n')[0]}`);
  }

  // Freeze exact authorized HN3 public labels once. Never choose a later/easier story.
  const amendment=await captureHnAmendment(page,RUN_ID,DIR);applyHnAmendment(GATE_TABLE,amendment,RUN_ID,record.startedAt);

  appendFreezeCheckpoint(join(DIR,'freeze'),{phase:'start',at:record.startedAt,freeze:captureRuntimeFreeze(readManifest(process.env.CHECKS_GATE_STACK_MANIFEST),externalCoreDeclaration())});
  writeFileSync(join(DIR, 'environment.json'),JSON.stringify(record)+'\n',{flag:'wx'});
  writeJson(join(DIR, 'preconditions.json'), { ok: problems.length === 0, problems, at: nowIso() });
  expect(problems, problems.join('; ')).toEqual([]);
});

for (const spec of positivesOf(GATE_TABLE)) {
  test(`positive ${spec.key}`, async ({ page }) => {
    guard('run');
    requirePreconditions();
    test.setTimeout(55 * 60_000);
    const startedAt = nowIso();
    const voided = voidReasonFor(spec.key);
    if (voided !== null) {
      writeResult({ key: spec.key, kind: 'positive', status: 'VOID', voidReason: voided, flows: [], startedAt, endedAt: nowIso() });
      test.skip(true, `VOID: ${voided}`);
    }
    const ctx = await makeContext(page);
    const flow = flowsOf(spec)[0];
    if (flow === undefined) throw new Error(`${spec.key} has no flow`);
    const result: TestResult = { key: spec.key, kind: 'positive', status: 'RAN', voidReason: null, flows: [await runFlow(page, ctx, { key: spec.key, flow, mode: 'first', proceed: true, description: spec.covers.join(', ') })], startedAt, endedAt: nowIso() };
    writeResult(result);
    const findings = positiveFindings(spec.key, result, null, proxyStateFor({ [spec.key]: result })).filter((f) => f.verdict !== 'PASS');
    expect(findings.map((f) => f.reason), result.flows[0]?.error ?? 'positive test').toEqual([]);
  });
}

for (const spec of GATE_TABLE.tests.filter((t) => t.kind === 'control')) {
  test(`control ${spec.key}`, async ({ page }) => {
    guard('run');
    requirePreconditions();
    test.setTimeout(35 * 60_000);
    const startedAt = nowIso();
    const ctx = await makeContext(page);
    const flow = flowsOf(spec)[0];
    if (flow === undefined) throw new Error(`${spec.key} has no flow`);
    const flowResult = await runFlow(page, ctx, { key: spec.key, flow, mode: 'leave', proceed: false, description: `${spec.covers.join(', ')} (${spec.expect ?? ''})` });
    writeResult({ key: spec.key, kind: 'control', status: 'RAN', voidReason: null, flows: [flowResult], startedAt, endedAt: nowIso() });
    const verdict = evaluateControl(spec.key, flowResult);
    expect(verdict.falsePass, `${spec.key} FALSE PASS (hard zero): ${verdict.reasons.join('; ')}`).toBe(false);
    expect(verdict.expectationMet, `${spec.key} expectation not met (${spec.expect ?? ''}): ${verdict.reasons.join('; ')}`).toBe(true);
  });
}

test('leak scan (in-run; the authoritative scan is gate-cli scan after collect)', async ({ page }) => {
  guard('run');
  requirePreconditions();
  test.setTimeout(15 * 60_000);
  await makeContext(page);
  const file = runScan({ root: outRoot(), runId: RUN_ID, includePlaywrightOutput: false });
  expect(file.scan.pageOrigin,'PAGE_ORIGIN is diagnostic only; every occurrence fails').toBe(0);
  expect(scanVerdict(file.scan, file.scan.sources.map((s)=>s.name)).verdict,'in-run strict scan').toBe('PASS');
  expect(file.scan.leak, `LEAK hits: ${file.scan.hits.filter((h) => h.verdict === 'LEAK').slice(0, 10).map((h) => `${h.source}/${h.file}@${h.offset} ${h.canary} ${h.form} ${h.reason}`).join('; ')}`).toBe(0);
  expect(file.scan.canaries.length, 'canaries == 0: the scan proves nothing').toBeGreaterThan(0);
});
