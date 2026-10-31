import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GATE_DIR, REPO_ROOT, flowsOf, loadTable, positivesOf, requiredLifecycleCases } from './common.ts';

const table = loadTable();
const POSITIVES = ['wikipedia', 'govuk', 'hackernews', 'pythondocs', 'mdn', 'github', 'debian-form', 'debian-reuse', 'kernel-table', 'kernel-releases', 'iana-registry', 'iana-home', 'datatracker-reuse', 'datatracker-filters'];

interface CorpusTask {
  id: string;
  url: string;
  steps: { text: string; gt: { chain: { m: string; a?: unknown[] }[] } | null }[];
}
const corpus = new Map<string, CorpusTask>();
for (const line of readFileSync(join(REPO_ROOT, 'studio-runner/evaluation/grounding/corpus/tasks.jsonl'), 'utf8').split('\n').filter(Boolean)) {
  const t = JSON.parse(line) as CorpusTask;
  corpus.set(t.id, t);
}

test('the table holds exactly the ADR tests: 14 positives and N1, N2, N3', () => {
  assert.deepEqual(positivesOf(table).map((t) => t.key), POSITIVES);
  assert.deepEqual(table.tests.filter((t) => t.kind === 'control').map((t) => t.key), ['N1', 'N2', 'N3']);
  assert.deepEqual(table.tests.filter((t) => t.kind === 'leak'), []);
  assert.equal(requiredLifecycleCases(table).length, 14);
  assert.equal(table.tests.length, 17);
  assert.equal(new Set(table.tests.map((t) => t.key)).size, 17);
  assert.equal(table.csiId, '178672');
});

test('every flow starts with Go to and has authored steps', () => {
  for (const t of table.tests) {
    for (const flow of flowsOf(t)) {
      assert.ok(flow.steps.length >= 2, `${t.key}/${flow.id}`);
      assert.match(flow.steps[0] ?? '', /^Go to "https:\/\/[^"]+"$/, `${t.key}/${flow.id}`);
      for (const step of flow.steps) assert.ok(step.trim() === step && step.length > 0);
    }
  }
});

test('alpha steps are the suite.mjs steps verbatim (counts and landmarks)', () => {
  const steps = (key: string) => table.tests.find((t) => t.key === key)?.steps ?? [];
  assert.equal(steps('wikipedia').length, 6);
  assert.equal(steps('wikipedia')[1], 'Copy the "Designed by" value from the infobox');
  assert.equal(steps('govuk')[1], 'Click the "Reject additional cookies" button');
  assert.equal(steps('hackernews')[3], 'Copy the title of the first story');
  assert.equal(steps('pythondocs')[1], 'Select "3.13" in the "Python version" dropdown at the top of the page');
  assert.equal(steps('mdn')[1], 'Click the "HTML" menu in the top navigation');
  assert.equal(steps('github')[1], 'Copy the repository description from the About section');
  assert.deepEqual(steps('github').map((s) => s.length > 0), [true, true, true, true, true, true]);
});

test('fresh-site tests list corpus ids that exist, with matching URLs and quoted names from the ground truth', () => {
  for (const t of positivesOf(table).filter((p) => p.corpusTasks.length > 0)) {
    const urls = new Set<string>();
    for (const step of t.steps ?? []) {
      const m = /^Go to "([^"]+)"$/.exec(step);
      if (m !== null) urls.add(m[1] ?? '');
    }
    for (const id of t.corpusTasks) {
      const task = corpus.get(id);
      assert.ok(task, `${t.key}: corpus task ${id} does not exist`);
      assert.ok(urls.has(task.url), `${t.key}: ${id} runs on ${task.url}, which no Go to step of the test visits`);
      const quoted = (task.steps.map((s) => s.text).join(' ').match(/"([^"]+)"/g) ?? []).map((q) => q.slice(1, -1));
      const chains = JSON.stringify(task.steps.map((s) => s.gt));
      for (const name of quoted.filter((q) => !/^[0-9a-z]{1,4}$/i.test(q))) {
        const inTest = (t.steps ?? []).some((s) => s.includes(name));
        assert.ok(inTest || chains.includes(name) || t.key === 'debian-reuse' || t.key === 'datatracker-reuse', `${t.key}: quoted name "${name}" of ${id} is not in the test`);
      }
    }
  }
  for (const id of table.tests.flatMap((t) => t.corpusTasks)) assert.ok(corpus.has(id), id);
});

test('controls retain the ADR expectations', () => {
  const n1 = table.tests.find((t) => t.key === 'N1');
  assert.deepEqual(n1?.steps, ['Go to "https://docs.python.org/3/builtins/functions.html"', 'Select "3.99" in the Python version menu at the top']);
  assert.deepEqual(n1?.corpusTasks, ['neg-pydocs-01']);
  const n2 = table.tests.find((t) => t.key === 'N2');
  assert.equal(n2?.steps?.[1], 'Check that the RSYNC row of the protocol and location table shows "rsync://wrong.kernel.org/pub/"');
  const n3 = table.tests.find((t) => t.key === 'N3');
  assert.equal(n3?.steps?.[1], 'Click the "Install" button next to the "stable" distribution');
});

test('control expectations state the effect-receipt rules, not ledger operation kinds', () => {
  const expect = (key: string) => table.tests.find((t) => t.key === key)?.expect ?? '';
  assert.match(expect('N1'), /TARGET_DRIFT, OUTCOME_UNKNOWN, ASSERTION_FAILED or TIMEOUT/);
  assert.match(expect('N1'), /selectOption attempted and not completed/);
  assert.match(expect('N1'), /failedStepIndex 1/);
  assert.doesNotMatch(expect('N1'), /TARGET_MISMATCH/);
  assert.match(expect('N2'), /ASSERTION_FAILED with no effect/);
  assert.doesNotMatch(expect('N2'), /UNSUPPORTED_SURFACE/);
  assert.match(expect('N3'), /no effect at the control step and the fence not crossed/);
  for (const key of ['N1', 'N2', 'N3']) assert.doesNotMatch(expect(key), /dispatched (selectOption|click)/, key);
});

test('no step carries a secret value: secret steps use <secret NAME> only', () => {
  const file = readFileSync(join(GATE_DIR, 'gate-table.json'), 'utf8');
  assert.ok(!/Password123|cnry-/.test(file));
  for (const t of table.tests) for (const f of flowsOf(t)) for (const s of f.steps) if (/password/i.test(s) && /Type/.test(s)) assert.match(s, /<secret [A-Z_]+>/);
});

test('current registry rejects missing, duplicate and extra lifecycle/control entries', () => {
  for (const change of ['positive', 'control', 'duplicate', 'extra'] as const) {
    const changed = structuredClone(table);
    if (change === 'positive') changed.tests = changed.tests.filter((entry) => entry.key !== 'mdn');
    if (change === 'control') changed.tests = changed.tests.filter((entry) => entry.key !== 'N3');
    if (change === 'duplicate') changed.tests[0]!.key = changed.tests[1]!.key;
    if (change === 'extra') changed.tests.push({ key: 'L1', kind: 'leak', site: 'fixture', covers: [], corpusTasks: [], steps: ['Go to "https://example.com"', 'Check fixture'] });
    assert.throws(() => requiredLifecycleCases(changed), change);
  }
});
