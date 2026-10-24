/** PREPARED ONLY. Root runs this in the quiet window after B7; no app code or compiler emit. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareText, loadTypescript } from './ast-equal.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const ts = loadTypescript(process.argv[2]);
const fixtures = resolve(here, 'self-test-fixtures');
const plan = JSON.parse(readFileSync(resolve(fixtures, 'expectations.json'), 'utf8'));
const before = readFileSync(resolve(fixtures, plan.before), 'utf8');
const results = [];
for (const entry of plan.cases) {
  const result = compareText(ts, before, readFileSync(resolve(fixtures, entry.file), 'utf8'), 'fixture.ts');
  if (entry.expectedUnexpectedDifferences === 0) assert.equal(result.differences.length, 0, entry.file);
  else assert.ok(result.differences.length >= 1, entry.file);
  results.push({ file: entry.file, differences: result.differences, expectationMet: true });
}
const allowance = JSON.parse(readFileSync(resolve(here, 'exact-comment-allowance.json'), 'utf8'));
const src = readFileSync(resolve(here, 'before', allowance.path), 'utf8');
const modified = src.replace(allowance.beforeComment, allowance.afterComment);
const allowed = compareText(ts, src, modified, allowance.path, allowance.beforeComment);
assert.equal(allowed.differences.length, 0); assert.equal(allowed.expectedCommentDifferences, 1);
const wrongPath = compareText(ts, src, modified, 'other.ts', allowance.beforeComment);
assert.ok(wrongPath.differences.length >= 1);
const extraEdit = compareText(ts, src, modified.replace('The whole guided start', 'An edited guided start'),
  allowance.path, allowance.beforeComment);
assert.ok(extraEdit.differences.length >= 1);
const wrongAllowance = compareText(ts, src, modified, allowance.path, allowance.beforeComment + 'changed');
assert.ok(wrongAllowance.differences.length >= 1);
results.push({ file: 'exact-comment-controls', allowed: 1, wrongPathRejected: true, extraEditRejected: true, wrongAllowanceRejected: true });
process.stdout.write(JSON.stringify({ kind: 'CHECKER_SELF_TEST_ONLY_NOT_STORY_QA', results }, null, 2) + '\n');
