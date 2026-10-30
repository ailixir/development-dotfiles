import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { FRONTEND_ROOT, loadTable, positivesOf } from './common.ts';

interface Spec {
  file: string;
  title: string;
}
interface Suite {
  specs?: { file: string; title: string }[];
  suites?: Suite[];
}

const RUN_FILE = 'studio-realsite-gate-real-backend.spec.ts';
const NEXT_FILE = 'studio-realsite-nextday-real-backend.spec.ts';
const EDIT_FILE = 'studio-realsite-edit-relearn-real-backend.spec.ts';
const SMOKE_FILE = 'studio-authoring-real-backend.spec.ts';
const table = loadTable();

/** Playwright's own listing, parsed: this is the binding between the files and the projects. */
function listing(realBackend: boolean): Spec[] {
  const cli = join(FRONTEND_ROOT, 'node_modules/@playwright/test/cli.js');
  const args = [cli, 'test', '--list', '--reporter=json', ...(realBackend ? ['--project=real-backend'] : [])];
  const env = { ...process.env, CHECKS_E2E_REAL_BACKEND: realBackend ? '1' : '' } as NodeJS.ProcessEnv;
  delete env.CHECKS_GATE_MODE;
  const out = execFileSync(process.execPath, args, { cwd: FRONTEND_ROOT, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const parsed = JSON.parse(out) as { suites: Suite[]; errors: unknown[] };
  assert.deepEqual(parsed.errors, [], 'Playwright reported load errors');
  const specs: Spec[] = [];
  const walk = (s: Suite): void => {
    for (const sp of s.specs ?? []) specs.push({ file: sp.file, title: sp.title });
    for (const c of s.suites ?? []) walk(c);
  };
  for (const s of parsed.suites) walk(s);
  return specs;
}

const real = listing(true);
const msw = listing(false);
const titlesOf = (specs: Spec[], file: string): string[] => specs.filter((s) => s.file === file).map((s) => s.title);

test('real-backend project: the run spec has exactly the 19 gate tests, one per table key plus environment and scan', () => {
  const titles = titlesOf(real, RUN_FILE);
  const expected = 1 + positivesOf(table).length + table.tests.filter((t) => t.kind === 'control').length + 1;
  assert.equal(positivesOf(table).length, 14);
  assert.equal(expected, 19);
  assert.equal(titles.length, expected, titles.join(' | '));
  for (const t of table.tests) assert.equal(titles.filter((x) => x.includes(t.kind === 'positive' ? `positive ${t.key}` : t.kind === 'control' ? `control ${t.key}` : `control ${t.key}`)).length, 1, t.key);
  assert.equal(titles.filter((x) => x.startsWith('environment')).length, 1);
  assert.equal(titles.filter((x) => x.startsWith('leak scan')).length, 1);
});

test('the removed next-day spec is absent on disk and registers no current execution', () => {
  assert.equal(existsSync(join(FRONTEND_ROOT, 'e2e', NEXT_FILE)), false);
  assert.deepEqual(titlesOf(real, NEXT_FILE), []);
});

test('real-backend project: the existing D5 smoke is still there', () => {
  assert.equal(titlesOf(real, SMOKE_FILE).length, 2);
  assert.deepEqual([...new Set(real.map((s) => s.file))].sort(), [RUN_FILE, SMOKE_FILE, EDIT_FILE].sort());
});

test('msw project: no gate file, no -real-backend file, and exactly the non-real-backend specs on disk', () => {
  const files = [...new Set(msw.map((s) => s.file))].sort();
  assert.ok(files.length > 0);
  assert.ok(files.every((f) => !/-real-backend\.spec\.ts$/.test(f)), files.join());
  assert.ok(!files.some((f) => f.includes('realsite')), files.join());
  assert.ok(!msw.some((s) => s.title.includes('positive ') && s.title.includes('control ')));
  const onDisk = readdirSync(join(FRONTEND_ROOT, 'e2e')).filter((f) => f.endsWith('.spec.ts') && !f.endsWith('-real-backend.spec.ts')).sort();
  assert.deepEqual(files, onDisk.filter((f) => files.includes(f)), 'every listed msw file is a non-real-backend spec');
  assert.ok(!files.includes(RUN_FILE) && !files.includes(NEXT_FILE));
});

test('supplementary edit/relearn and exactly3 wording probes remain separate real-backend diagnostics',()=>{assert.equal(titlesOf(real,EDIT_FILE).length,5);});
