/**
 * Glue for the current same-day gate spec: mode guard, run directory, the per-test context and the
 * recorder-aware proxy state. Importing this file never touches the network or the stack.
 */
import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTable, outRoot, readJson, runDir, writeJson } from './common.ts';
import type { GateTable } from './common.ts';
import type { GateContext } from './driver.ts';
import { loadCanaries, summarizeRecorder } from './environment.ts';
import { learnRequests, proxyState, sumProposals } from './evaluate.ts';
import type { ProxyState, TestResult, VerifyJudgement } from './evaluate.ts';
import { psqlConfigFromEnv } from './status.ts';
import { gatePorts } from './stack/ports.mjs';

export const MODE = process.env.CHECKS_GATE_MODE;
export const RUN_ID = process.env.CHECKS_GATE_RUN_ID ?? '';
export const DIR = runDir(RUN_ID === '' ? 'no-run-id' : RUN_ID);
export const GATE_TABLE: GateTable = loadTable();

/**
 * Skips when CHECKS_GATE_MODE is unset (not a gate run, not evidence). A set but different mode is a
 * hard error: a misspelled mode must never look green.
 */
export function guard(expected: 'run'): void {
  test.skip(MODE === undefined || MODE === '', 'not a gate run (CHECKS_GATE_MODE is unset); this is NOT evidence');
  if (MODE !== expected) throw new Error(`CHECKS_GATE_MODE=${String(MODE)} but this spec runs only in mode '${expected}'`);
}

/** Every test after the environment test: skip with a visible reason when the preconditions failed. */
export function requirePreconditions(): void {
  const file = join(DIR, 'preconditions.json');
  const state = existsSync(file) ? readJson<{ ok: boolean; problems: string[] }>(file) : null;
  test.skip(state === null || !state.ok, `preconditions not met: ${state === null ? 'the environment test did not run' : state.problems.join('; ')}`);
}

export const baseUrl = (): string => process.env.CHECKS_GATE_BASE_URL ?? test.info().project.use.baseURL ?? `http://127.0.0.1:${gatePorts().app}`;
/** The gate backend: CHECKS_E2E_BACKEND_URL, else the gate's own port (never the live :8080). */
export const backendUrl = (): string => process.env.CHECKS_E2E_BACKEND_URL ?? `http://127.0.0.1:${gatePorts().backend}`;
export const proxyUrl = (): string | null => (process.env.CHECKS_GATE_PROXY_URL ?? '') === '' ? null : (process.env.CHECKS_GATE_PROXY_URL ?? null);

export async function makeContext(page: Page): Promise<GateContext> {
  const base = baseUrl();
  await page.context().addCookies([{ name: 'put_session', value: process.env.CHECKS_GATE_SESSION_COOKIE ?? 'local-dev-session', url: base }]);
  return {
    runId: RUN_ID,
    dir: DIR,
    baseUrl: base,
    request: page.context().request,
    psql: psqlConfigFromEnv(),
    proxyUrl: proxyUrl(),
    csiId: GATE_TABLE.csiId,
    canaries: loadCanaries(),
  };
}

export function proxyStateFor(results: Record<string, TestResult | undefined>): ProxyState {
  const summary = summarizeRecorder(join(DIR, 'gateway'), proxyUrl() !== null);
  return proxyState(summary, sumProposals(results), learnRequests(results));
}

export function voidReasonFor(key: string): string | null {
  const file = join(DIR, 'verify-judgement.json');
  if (!existsSync(file)) return null;
  return readJson<VerifyJudgement>(file).voidKeys[key] ?? null;
}

export function writeResult(result: TestResult): void {
  writeJson(join(DIR, 'results', `${result.key}.json`), { ...result, schemaVersion: 1, runId: RUN_ID });
}

export function readResult(key: string): TestResult | null {
  const file = join(DIR, 'results', `${key}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as TestResult) : null;
}

export { outRoot };
