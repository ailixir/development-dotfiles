/** Static parse inventory only. Does not import Vitest or execute tests. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadTypescript } from './ast-equal.mjs';
const [beforeRoot, afterRoot, repoRoot, output] = process.argv.slice(2);
const ts = loadTypescript(repoRoot);
const path = 'studio-runner/test/deferred.test.ts';
function value(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return value(node.left) + value(node.right);
  throw new Error('Non-literal name');
}
function inventory(root) {
  const text = readFileSync(resolve(root, path), 'utf8');
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sf.parseDiagnostics.length) throw new Error('Parse error');
  const rows = [];
  function walk(node, suite = []) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (callee === 'describe') {
        const nested = [...suite, value(node.arguments[0])];
        for (const child of node.arguments.slice(1)) walk(child, nested);
        return;
      }
      if (callee === 'it.skip') rows.push({ suite, name: value(node.arguments[0]), exactCall: node.getText(sf) });
    }
    ts.forEachChild(node, child => { walk(child, suite); });
  }
  walk(sf);
  return rows;
}
const before = inventory(beforeRoot), after = inventory(afterRoot);
const afterNames = new Set(after.map(r => JSON.stringify([r.suite, r.name])));
const beforeNames = new Set(before.map(r => JSON.stringify([r.suite, r.name])));
const removed = before.filter(r => !afterNames.has(JSON.stringify([r.suite, r.name])));
const added = after.filter(r => !beforeNames.has(JSON.stringify([r.suite, r.name])));
const changedRetained = after.filter(r => before.find(b => b.name === r.name)?.exactCall !== r.exactCall);
const expected = ['AC-17 IS NOT THIS STORY’S', 'Story 10.14’s AC-26 is DISCHARGED',
  'AC-13a, AC-16a, AC-18, AC-19a, AC-20, AC-21a, AC-22 and AC-23a', 'AC-18 is resolved:'];
if (before.length !== 19 || after.length !== 15 || removed.length !== 4 || added.length || changedRetained.length ||
  !removed.every((r, i) => r.name.startsWith(expected[i]))) throw new Error('Unexpected deferred name/call delta');
const result = { kind: 'STATIC_NAME_MAP_NOT_EXECUTED_TEST_PROOF', beforeCount: before.length, afterCount: after.length,
  retainedExactCalls: after.length, added, changedRetained,
  historicalSuiteSkippedCount: { before: 29, after: 25, status: 'EXPECTATION_REQUIRES_ACTUAL_NAMED_RUN_RECONCILIATION' },
  convertedPointers: removed, retainedCriteria: after };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
