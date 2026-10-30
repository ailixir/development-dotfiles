/**
 * Shared, dependency-free helpers of the ADR-SC-007 real-site release gate (WI-5): paths, run ids,
 * the test table and small file utilities. Imported by the Playwright specs and by node:test files, so
 * it uses explicit `.ts` import specifiers elsewhere and only erasable TypeScript syntax.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE_DIR = dirname(fileURLToPath(import.meta.url));
export const FRONTEND_ROOT = resolve(GATE_DIR, '../..');
export const REPO_ROOT = resolve(GATE_DIR, '../../..');

/** rg- runs are evidence; dry- and rehearsal- runs are never evidence and the report refuses them. */
export const RUN_ID_RE = /^(rg|dry|rehearsal)-\d{8}-\d+$/;
export const isDryRunId = (runId: string): boolean => runId.startsWith('dry-') || runId.startsWith('rehearsal-');

export interface GateSecret {
  name: string;
  source: 'env:CHECKS_GATE_L1_SECRET' | 'canaryFile';
  cls: 'PAGE_PRINTED' | 'SECRET';
  /** 1-based step that fills the password. */
  passwordStep: number;
}

export interface GateFlow {
  id: string;
  description?: string;
  steps: string[];
  secret?: GateSecret;
}

export interface GateTest {
  key: string;
  kind: 'positive' | 'control' | 'leak';
  site: string;
  covers: string[];
  corpusTasks: string[];
  expect?: string;
  steps?: string[];
  flows?: GateFlow[];
}

export interface GateTable {
  version: number;
  csiId: string;
  tests: GateTest[];
}

export function loadTable(): GateTable {
  const table = JSON.parse(readFileSync(resolve(GATE_DIR, 'gate-table.json'), 'utf8')) as GateTable;
  if (table.version !== 1 || !Array.isArray(table.tests) || typeof table.csiId !== 'string') {
    throw new Error('gate-table.json: unexpected shape');
  }
  return table;
}

/** Every current test has one main flow; historical artifacts may describe multiple flows. */
export function flowsOf(test: GateTest): GateFlow[] {
  if (test.flows) return test.flows;
  if (!test.steps) throw new Error(`gate-table.json: ${test.key} has neither steps nor flows`);
  return [{ id: 'main', steps: test.steps }];
}

export const positivesOf = (table: GateTable): GateTest[] => table.tests.filter((t) => t.kind === 'positive');

export function defaultOutRoot(): string {
  return resolve(FRONTEND_ROOT, 'node_modules/.cache/realsite-gate');
}

export const outRoot = (): string => resolve(process.env.CHECKS_GATE_OUT ?? defaultOutRoot());
export const runDir = (runId: string, root: string = outRoot()): string => resolve(root, runId);

export function isInside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export const sha256Hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
export const sha256File = (path: string): string => sha256Hex(readFileSync(path));

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function envRequired(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

/** Wall-clock helper kept here so tests can read it without Playwright. */
export const nowIso = (): string => new Date().toISOString();

/** Required cases are declared by the registry, never inferred from files present on disk. */
export interface LifecycleCase { key: string; test: GateTest; flow: GateFlow }
export function requiredLifecycleCases(table: GateTable): LifecycleCase[] {
  const keys = table.tests.map((t) => t.key);
  if (new Set(keys).size !== keys.length) throw new Error('duplicate gate key');
  const ordinary = positivesOf(table);
  if (ordinary.length !== 14 || table.tests.length !== 17 || ['N1', 'N2', 'N3'].some((key) => !table.tests.some((test) => test.key === key && test.kind === 'control'))) throw new Error('required registry is14 positives and N1-N3');
  const cases = ordinary.map((t) => {
    const flows = flowsOf(t);
    if (flows.length !== 1 || flows[0]?.id !== 'main') throw new Error('ordinary case has invalid flow');
    return { key: t.key, test: t, flow: flows[0] };
  });
  return cases;
}
export function caseFilename(key: string): string {
  if (!/^[A-Za-z0-9_-]+(?:\/l1[ab])?$/.test(key)) throw new Error('invalid case key');
  return `${encodeURIComponent(key)}.json`;
}
