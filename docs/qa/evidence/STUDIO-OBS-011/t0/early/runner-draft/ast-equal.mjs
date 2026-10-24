/** Static TypeScript parse only: no compiler program, resolution, emit, imports of app code, or mutation. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const files = [
  'studio-runner/src/guided/contracts.ts',
  'studio-runner/src/guided/diagnostics.ts',
  'studio-runner/src/guided/evidence.ts',
  'studio-runner/src/guided/json.ts',
  'studio-runner/src/guided/transport.ts',
  'studio-runner/src/run/guidedBrowser.ts',
];
const allowedPath = 'studio-runner/src/run/guidedBrowser.ts';
const oldMention = 'GuidedRunnerClient.transportDeadline';
const newMention = 'HttpRunnerDispatchClient.transportDeadline';
const literalKinds = ['Identifier', 'PrivateIdentifier', 'StringLiteral', 'NumericLiteral', 'BigIntLiteral',
  'RegularExpressionLiteral', 'NoSubstitutionTemplateLiteral', 'TemplateHead', 'TemplateMiddle', 'TemplateTail'];

export function loadTypescript(repoRoot) {
  return createRequire(resolve(repoRoot, 'studio-runner/package.json'))('typescript');
}

export function inspect(ts, text, path) {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const literals = new Set(literalKinds.map(kind => ts.SyntaxKind[kind]));
  function tree(node) {
    const children = [];
    ts.forEachChild(node, child => { children.push(tree(child)); });
    return [node.kind, literals.has(node.kind) ? node.getText(sf) : null, children];
  }
  const tokens = [];
  const spans = [];
  function leaves(node) {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(sf);
    if (children.length) {
      for (const child of children) leaves(child);
    } else {
      const start = node.getStart(sf, false);
      const end = node.getEnd();
      if (end > start) {
        tokens.push([node.kind, text.slice(start, end)]);
        spans.push([start, end]);
      }
    }
  }
  leaves(sf);
  spans.sort((a, b) => a[0] - b[0]);
  const comments = [];
  let cursor = 0;
  let gapTokenIndex = 0;
  function gap(end) {
    if (end <= cursor) return;
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text.slice(cursor, end));
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
      if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
        comments.push({ text: scanner.getTokenText(), afterToken: gapTokenIndex });
      } else if (kind !== ts.SyntaxKind.WhitespaceTrivia && kind !== ts.SyntaxKind.NewLineTrivia &&
        kind !== ts.SyntaxKind.ShebangTrivia && kind !== ts.SyntaxKind.ConflictMarkerTrivia) {
        throw new Error(`Unaccounted non-trivia gap at ${path}:${cursor + scanner.getTokenPos()}`);
      }
    }
  }
  for (const [start, end] of spans) {
    gap(start);
    cursor = Math.max(cursor, end);
    gapTokenIndex++;
  }
  gap(text.length);
  return {
    tree: tree(sf), tokens, comments,
    parseErrors: sf.parseDiagnostics.map(d => ({ code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') })),
  };
}

export function compareText(ts, beforeText, afterText, path, allowedBeforeComment = null) {
  const before = inspect(ts, beforeText, path);
  const after = inspect(ts, afterText, path);
  const differences = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (before.parseErrors.length || after.parseErrors.length) differences.push('parse-errors');
  if (!same(before.tree, after.tree)) differences.push('ordered-ast');
  if (!same(before.tokens, after.tokens)) differences.push('exact-token-text-and-order');
  let expectedCommentDifferences = 0;
  if (before.comments.length !== after.comments.length) differences.push('comment-count');
  for (let i = 0; i < Math.max(before.comments.length, after.comments.length); i++) {
    if (same(before.comments[i], after.comments[i])) continue;
    const oldComment = before.comments[i]?.text;
    const allowed = path === allowedPath && oldComment === allowedBeforeComment &&
      oldComment?.split(oldMention).length === 2 &&
      after.comments[i]?.text === oldComment.replace(oldMention, newMention) &&
      after.comments[i]?.afterToken === before.comments[i]?.afterToken;
    if (allowed) expectedCommentDifferences++;
    else differences.push(`comment-${i}`);
  }
  return {
    path, differences, expectedCommentDifferences, tokenCount: before.tokens.length,
    commentCount: before.comments.length, beforeParseErrors: before.parseErrors, afterParseErrors: after.parseErrors,
  };
}

export function run(beforeRoot, afterRoot, repoRoot, allowanceFile) {
  const ts = loadTypescript(repoRoot);
  const allowance = JSON.parse(readFileSync(allowanceFile, 'utf8'));
  if (allowance.path !== allowedPath || typeof allowance.beforeComment !== 'string' ||
    allowance.afterComment !== allowance.beforeComment.replace(oldMention, newMention) ||
    allowance.beforeComment.split(oldMention).length !== 2) throw new Error('Invalid exact comment allowance');
  const results = files.map(path => compareText(ts,
    readFileSync(resolve(beforeRoot, path), 'utf8'), readFileSync(resolve(afterRoot, path), 'utf8'), path, allowance.beforeComment));
  for (const result of results) {
    const expected = result.path === allowedPath ? 1 : 0;
    if (result.expectedCommentDifferences !== expected) result.differences.push('missing-or-excess-comment-exception');
  }
  return { kind: 'STATIC_PARSE_ONLY_NOT_QA_OR_EMIT_PROOF', typescript: ts.version,
    unexpectedDifferences: results.reduce((n, r) => n + r.differences.length, 0), results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [beforeRoot, afterRoot, repoRoot, allowanceFile] = process.argv.slice(2);
  if (!beforeRoot || !afterRoot || !repoRoot || !allowanceFile) throw new Error(
    'Usage: node ast-equal.mjs BEFORE_REPO AFTER_REPO REAL_REPO_ROOT exact-comment-allowance.json');
  const result = run(beforeRoot, afterRoot, repoRoot, allowanceFile);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.unexpectedDifferences === 0 ? 0 : 1;
}
