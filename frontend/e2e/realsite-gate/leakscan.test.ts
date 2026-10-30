import {cleanScan} from './testkit.ts';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { GATE_DIR, REPO_ROOT, readJson } from './common.ts';
import { canaryForms, decodedStrings, fold, foldText, occurrenceVerdicts, pageTextPredicate, plainView, redactCanaries, scanSources, scanVerdict, segmentAround } from './leakscan.ts';
import type { Canary, PageTextSources, SourceSpec } from './leakscan.ts';

const SECRET: Canary = { label: 'GATE_CANARY', value: 'cnry-a1b2c3d4e5f6-0a1b2c3d4e5f-9f8e7d6c5b4a', cls: 'SECRET' };
// Spaces, punctuation, a quote, a percent sign and a non-ASCII letter exercise every encoded form.
const NASTY: Canary = { label: 'NASTY', value: 'Pa55 w0rd+x&y="z"%é rq7xk2m9', cls: 'SECRET' };
const PAGE: Canary = { label: 'L1_PASSWORD', value: 'Password123', cls: 'PAGE_PRINTED' };

const YAML = readFileSync(join(GATE_DIR, 'fixtures/practice.ai.yaml'), 'utf8');
const PAGE_TEXT = readFileSync(join(GATE_DIR, 'fixtures/practice.pagetext.txt'), 'utf8');
const TABLE = readJson<PageTextSources>(join(GATE_DIR, 'page-text-sources.json'));

function withDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'gate-leakscan-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const put = (dir: string, rel: string, body: string | Buffer): string => {
  const path = join(dir, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  return path;
};
const never = (): boolean => false;
const source = (name: string, root: string): SourceSpec => ({ name, root, mayCarryPageText: never });
const gateway = (root: string): SourceSpec => ({ name: 'gateway', root, mayCarryPageText: pageTextPredicate(TABLE, 'gateway') });

test('every encoded form of a canary is produced once', () => {
  const names = canaryForms(NASTY.value).map((f) => f.name);
  for (const form of ['raw', 'json', 'url', 'plus', 'double', 'base64']) assert.ok(names.includes(form), form);
  assert.ok(canaryForms(NASTY.value).find((f) => f.name === 'plus')?.needle.includes('+'));
  assert.ok(canaryForms(NASTY.value).find((f) => f.name === 'double')?.needle.includes('%25'));
  assert.deepEqual(canaryForms('abcd1234').map((f) => f.name), ['raw', 'url', 'base64'].filter((n) => canaryForms('abcd1234').some((f) => f.name === n)), 'identical needles are kept once');
});

test('each form is detected in a file, split values are detected, clean and near-miss text is clean', () => {
  withDir((dir) => {
    for (const form of canaryForms(NASTY.value)) put(dir, `forms/${form.name}.txt`, `prefix ${form.needle} suffix`);
    put(dir, 'split/spans.html', '<span>Pa55 w0rd+x&y=</span>\n<span>"z"%é</span>   <span>rq7xk2m9</span>');
    put(dir, 'split/json.json', JSON.stringify({ a: 'Pa55 w0rd', b: '+x&y="z"%é', c: 'rq7xk2m9' }));
    put(dir, 'split/outline.yaml', '- text "Pa55 w0rd+x&y=" [ref=e5]\n- text "\\"z\\"%é" [ref=e6]\n- generic [ref=e7]: rq7xk2m9\n');
    put(dir, 'clean/log.txt', 'nothing to see here. Pa55 only. rq7xk2m. cnry-a1b2c3d4e5f6');
    const scan = scanSources([NASTY], [source('x', dir)], { pageText: '' });
    for (const form of canaryForms(NASTY.value)) {
      assert.ok(scan.hits.some((h) => h.file === `forms/${form.name}.txt` && h.form === form.name), `form ${form.name}`);
    }
    assert.ok(scan.hits.some((h) => h.file === 'split/spans.html' && (h.form === 'split' || h.form === 'split-markup')), 'split across spans');
    assert.ok(scan.hits.some((h) => h.file === 'split/json.json' && (h.form === 'split' || h.form === 'split-markup')), 'split across JSON strings');
    assert.ok(scan.hits.some((h) => h.file === 'split/outline.yaml' && h.form === 'split-markup'), 'split across outline lines with refs between');
    assert.equal(scan.hits.filter((h) => h.file === 'clean/log.txt').length, 0);
    assert.ok(scan.hits.every((h) => h.verdict === 'LEAK' && h.reason === 'SECRET_CANARY'));
  });
});

test('a truncated canary is caught by the 12-character window', () => {
  withDir((dir) => {
    put(dir, 'log.txt', 'saw cnry-a1b2c3d4e5f6-0a1b2c3 in the output');
    const scan = scanSources([SECRET], [source('x', dir)], { pageText: '' });
    assert.ok(scan.hits.some((h) => h.form === 'window'));
  });
});

test('hit records never contain the matched text', () => {
  withDir((dir) => {
    put(dir, 'a.txt', `x ${SECRET.value} y`);
    put(dir, 'b.txt', `x ${NASTY.value} y`);
    const scan = scanSources([SECRET, NASTY], [source('x', dir)], { pageText: '' });
    const dump = JSON.stringify(scan);
    assert.ok(scan.hits.length >= 2);
    for (const canary of [SECRET, NASTY]) {
      for (const form of canaryForms(canary.value)) assert.ok(!dump.includes(form.needle), `${canary.label} ${form.name} leaked into the scan record`);
    }
  });
});

test('denominators: text files and bytes are counted, videos and archives are opaque bytes, bearer shapes are hits', () => {
  withDir((dir) => {
    put(dir, 'a.txt', 'hello');
    put(dir, 'video/run.webm', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
    put(dir, 'trace.zip', Buffer.from([9, 9]));
    put(dir, 'tok.txt', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789');
    const scan = scanSources([SECRET], [source('x', dir)], { pageText: '' });
    assert.equal(scan.filesScanned, 2);
    assert.equal(scan.opaqueBytes, 10);
    assert.equal(scan.sources[0]?.opaqueFiles, 2);
    assert.ok(scan.hits.some((h) => h.cls === 'BEARER' && h.verdict === 'LEAK'));
  });
});

test('verdict: zero canaries, a missing source, an empty source and a LEAK all fail', () => {
  withDir((dir) => {
    put(dir, 'a.txt', 'clean');
    mkdirSync(join(dir, 'empty'));
    const ok = scanSources([SECRET], [source('x', dir)], { pageText: '' });
    assert.equal(scanVerdict(ok).verdict, 'FAIL','incomplete single-source scan cannot establish coverage');
    assert.equal(scanVerdict(cleanScan()).verdict,'PASS');
    assert.equal(scanVerdict(scanSources([], [source('x', dir)], { pageText: '' })).verdict, 'FAIL');
    assert.match(scanVerdict(scanSources([], [source('x', dir)], { pageText: '' })).reasons.join(), /no canaries/);
    assert.match(scanVerdict(scanSources([SECRET], [source('x', dir), source('playwright', join(dir, 'nope'))], { pageText: '' })).reasons.join(), /playwright is missing/);
    assert.match(scanVerdict(scanSources([SECRET], [source('empty', join(dir, 'empty'))], { pageText: '' })).reasons.join(), /empty is empty/);
    put(dir, 'leak.txt', SECRET.value);
    assert.equal(scanVerdict(scanSources([SECRET], [source('x', dir)], { pageText: '' })).verdict, 'FAIL');
    assert.match(scanVerdict({ ...ok, db: { tables: 0, rows: 0, bytes: 0 } }).reasons.join(), /database coverage/);
  });
});

test('segments are cut at newline, quote, brackets and braces, so snapshot markup never enters the context', () => {
  const line = '          - listitem [ref=e49]: Type password Password123 into Password field';
  assert.equal(segmentAround(line, line.indexOf('Password123'), 11), ': Type password Password123 into Password field');
  const quoted = '- listitem [ref=e36]: "Use next credentials to execute Login: Username: student Password: Password123"';
  assert.equal(segmentAround(quoted, quoted.indexOf('Password123'), 11), 'Use next credentials to execute Login: Username: student Password: Password123');
  assert.equal(segmentAround('{"value":"Password123"}', 10, 11), 'Password123');
  assert.equal(foldText(': Type password Password123 into Password field'), 'typepasswordpassword123intopasswordfield');
  assert.deepEqual(fold('A-b é').text, 'abé');
});

test('real snapshot: all three page-printed occurrences are PAGE_ORIGIN, raw and inside a JSON-escaped body', () => {
  const folded = foldText(PAGE_TEXT);
  assert.ok(folded.includes('password123'), 'the page text fixture prints the password');
  const raw = occurrenceVerdicts(YAML, 'Password123', folded);
  assert.equal(raw.length, 3);
  assert.deepEqual(raw.map((v) => v.verdict), ['PAGE_ORIGIN', 'PAGE_ORIGIN', 'PAGE_ORIGIN']);
  const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Outline of the page:\n${YAML}` }] }], systemInstruction: { parts: [{ text: 'rules' }] } });
  assert.ok(body.includes('\\n') && body.includes('\\"'), 'the fixture body is JSON-escaped');
  const inBody = occurrenceVerdicts(body, 'Password123', folded);
  assert.deepEqual(inBody.map((v) => v.verdict), ['PAGE_ORIGIN', 'PAGE_ORIGIN', 'PAGE_ORIGIN']);

  withDir((dir) => {
    put(dir, 'gateway/0001.req.json', body);
    put(dir, 'db/studio_guided_sessions.jsonl', `${JSON.stringify({ progress: { outline: YAML } })}\n`);
    const scan = scanSources([PAGE], [gateway(join(dir, 'gateway')), { name: 'db', root: join(dir, 'db'), mayCarryPageText: pageTextPredicate(TABLE, 'db') }], { pageText: PAGE_TEXT });
    assert.equal(scan.hits.length, 6);
    assert.ok(scan.hits.every((h) => h.verdict === 'PAGE_ORIGIN'), JSON.stringify(scan.hits.map((h) => h.reason)));
    assert.equal(scan.leak, 0);
    assert.equal(scan.pageOrigin, 6);
    assert.equal(scanVerdict(scan).verdict, 'FAIL','PAGE_ORIGIN is diagnostic only; ANY hit fails');
  });
  withDir((dir) => {
    put(dir, 'raw.yaml', YAML);
    const scan = scanSources([PAGE], [{ name: 'gateway', root: dir, mayCarryPageText: () => true }], { pageText: PAGE_TEXT });
    assert.equal(scan.hits.length, 3);
    assert.ok(scan.hits.every((h) => h.verdict === 'PAGE_ORIGIN'));
  });
});

test('the same bytes in a source outside the closed table are LEAK', () => {
  withDir((dir) => {
    put(dir, 'runner/studio-runner.log', YAML);
    put(dir, 'ui/page.txt', PAGE_TEXT);
    put(dir, 'db/studio_guided_actions.jsonl', `${JSON.stringify({ outline: YAML })}\n`);
    const scan = scanSources([PAGE], [source('runner', join(dir, 'runner')), source('ui', join(dir, 'ui')), { name: 'db', root: join(dir, 'db'), mayCarryPageText: pageTextPredicate(TABLE, 'db') }], { pageText: PAGE_TEXT });
    assert.ok(scan.hits.length >= 6);
    assert.ok(scan.hits.every((h) => h.verdict === 'LEAK' && h.reason === 'SOURCE_NOT_ALLOWED'), JSON.stringify(scan.hits.map((h) => h.reason)));
  });
});

test('a hit in a JSON field, an authored step, a header or an encoded form is LEAK even inside an allowed source', () => {
  const cases: [string, string, string][] = [
    ['JSON field value', JSON.stringify({ value: 'Password123' }), 'CONTEXT_TOO_SHORT'],
    ['JSON field with a key', JSON.stringify({ password: 'Password123', user: 'student' }), 'CONTEXT_TOO_SHORT'],
    ['authored step', JSON.stringify({ steps: ['Type "Password123" in the "Password" field'] }), 'CONTEXT_TOO_SHORT'],
    ['header line', 'Authorization: Password123\nAccept: */*', 'NOT_IN_PAGE'],
    ['sentence not on the page', JSON.stringify({ note: 'the operator typed Password123 into a prompt' }), 'NOT_IN_PAGE'],
  ];
  for (const [label, body, reason] of cases) {
    withDir((dir) => {
      put(dir, 'gateway/0001.req.json', body);
      const scan = scanSources([PAGE], [gateway(join(dir, 'gateway'))], { pageText: PAGE_TEXT });
      assert.equal(scan.hits.length, 1, label);
      assert.deepEqual([scan.hits[0]?.verdict, scan.hits[0]?.reason], ['LEAK', reason], label);
    });
  }
  withDir((dir) => {
    put(dir, 'gateway/0001.req.json', JSON.stringify({ q: 'https://x.example/?p=Password123&u=1', note: 'Use next credentials to execute Login: Username: student Password: Password%31%32%33' }));
    const scan = scanSources([PAGE], [gateway(join(dir, 'gateway'))], { pageText: PAGE_TEXT });
    assert.ok(scan.leak >= 1);
  });
  withDir((dir) => {
    put(dir, 'gateway/0001.req.json', JSON.stringify({ note: Buffer.from('Password123').toString('base64').replace(/=+$/, '') }));
    const scan = scanSources([PAGE], [gateway(join(dir, 'gateway'))], { pageText: PAGE_TEXT });
    assert.ok(scan.hits.some((h) => h.form === 'base64' && h.verdict === 'LEAK' && h.reason === 'FORM_NOT_PAGE_TEXT'), 'an encoded form is never page text');
  });
});

test('a SECRET canary is a LEAK everywhere, even inside the page-text fixture shape and an allowed source', () => {
  withDir((dir) => {
    put(dir, 'gateway/0001.req.json', JSON.stringify({ text: YAML.replace('Password123', SECRET.value) }));
    const scan = scanSources([SECRET], [gateway(join(dir, 'gateway'))], { pageText: PAGE_TEXT.replace('Password123', SECRET.value) });
    assert.ok(scan.hits.length >= 1);
    assert.ok(scan.hits.every((h) => h.verdict === 'LEAK' && h.reason === 'SECRET_CANARY'));
  });
});

test('decoding: JSON documents, JSON lines and escaped lines all yield the same strings', () => {
  assert.deepEqual(decodedStrings('{"a":"x\\ny","b":["z"]}'), ['a', 'x\ny', 'b', 'z']);
  assert.deepEqual(decodedStrings('{"a":"1"}\n{"a":"2"}\n'), ['a', '1', 'a', '2']);
  assert.deepEqual(decodedStrings('plain \\"quoted\\" line\nsecond'), ['plain "quoted" line', 'second']);
});

test('the plain view joins a value split by outline markup, html tags and JSON keys', () => {
  assert.match(foldText(plainView('- text "ab12" [ref=e1]\n- text "cd34" [ref=e2]\n')), /ab12cd34/);
  assert.match(foldText(plainView('<p>ab12</p><span>cd34</span>')), /ab12cd34/);
  assert.match(foldText(plainView('{"a":"ab12","b":"cd34"}')), /ab12cd34/);
});

test('redaction strips every encoded form from an error message', () => {
  const message = `locator.fill("${NASTY.value}") failed; url ${encodeURIComponent(NASTY.value)} body ${JSON.stringify(NASTY.value)}`;
  const redacted = redactCanaries(message, [NASTY]);
  for (const form of canaryForms(NASTY.value)) assert.ok(!redacted.includes(form.needle), form.name);
  assert.match(redacted, /<redacted>/);
});

test('page-text-sources.json: every table the migrations create is classified, none twice', () => {
  const dir = join(REPO_ROOT, 'backend/src/main/resources/db/migration');
  const created = new Set<string>();
  const dropped = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => /^V\d+__.*\.sql$/.test(f))) {
    const sql = readFileSync(join(dir, file), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi)) created.add((m[1] ?? '').toLowerCase());
    for (const m of sql.matchAll(/\bdrop\s+table\s+(?:if\s+exists\s+)?([a-z0-9_,\s]+?)(?:\s+cascade)?\s*;/gi)) for (const n of (m[1] ?? '').split(',')) dropped.add(n.trim().toLowerCase());
  }
  const may = new Set(TABLE.mayCarryPageText.dbTables);
  const mustNot = new Set(TABLE.mustNotCarryPageText.dbTables);
  const unclassified = [...created].filter((t) => !dropped.has(t) && !may.has(t) && !mustNot.has(t));
  assert.deepEqual(unclassified, [], 'classify new tables in page-text-sources.json');
  assert.deepEqual([...may].filter((t) => mustNot.has(t)), []);
  assert.ok(created.has('studio_guided_sessions') && may.has('studio_guided_sessions'));
  assert.ok(mustNot.has('studio_guided_actions') && mustNot.has('ui_tests') && mustNot.has('studio_secret_use_audit'));
});

import {recordUiText,recordUiCaptureFailure,incorporateOriginalUiText} from './ui-text.ts';
function uiSummary(){const s=cleanScan();s.canaries=[{label:PAGE.label,cls:PAGE.cls,length:PAGE.value.length,sha6:'aaaaaa'},{label:SECRET.label,cls:SECRET.cls,length:SECRET.value.length,sha6:'bbbbbb'}];s.formsPerCanary=Object.fromEntries([PAGE,SECRET].map((c)=>[c.label,canaryForms(c.value).length]));return s;}
test('actual product UI canary remains a failed scan after protecting persisted text evidence',()=>{
  for(const canary of [PAGE,SECRET])withDir((dir)=>{const text=`Actual Studio error: ${canary.value}`;recordUiText(dir,'capture.txt',text,[PAGE,SECRET],'dry-20261028-1');assert.ok(!readFileSync(join(dir,'capture.txt'),'utf8').includes(canary.value));const s=uiSummary();incorporateOriginalUiText(s,dir,'dry-20261028-1');assert.equal(s.originalUi?.snapshots,1);assert.equal(s.originalUi?.bytes,Buffer.byteLength(text));assert.ok(s.hits.some((h)=>h.source==='ui'&&h.canary===canary.label));assert.equal(scanVerdict(s).verdict,'FAIL');});
});
test('original UI coverage rejects failed capture, missing receipts, duplicate capture identity and cross-run reuse',()=>{
  withDir((dir)=>{const text='Actual clean Studio receipt';recordUiText(dir,'clean.txt',text,[PAGE,SECRET],'dry-20261028-1');assert.equal(readFileSync(join(dir,'clean.txt'),'utf8'),text);const s=uiSummary();incorporateOriginalUiText(s,dir,'dry-20261028-1');assert.equal(scanVerdict(s).verdict,'PASS');});
  for(const change of ['capture-failed','missing','duplicate','cross-run'] as const)withDir((dir)=>{recordUiText(dir,'first.txt','Actual clean Studio receipt',[PAGE,SECRET],'dry-20261028-1');const receipt=join(dir,'first.txt.scan.json');if(change==='capture-failed')recordUiCaptureFailure(dir,'failed.txt','dry-20261028-1');if(change==='missing')rmSync(receipt);if(change==='cross-run'){const r=JSON.parse(readFileSync(receipt,'utf8')) as Record<string,unknown>;r.runId='dry-20261029-1';writeFileSync(receipt,JSON.stringify(r));}if(change==='duplicate'){recordUiText(dir,'second.txt','Actual clean Studio receipt',[PAGE,SECRET],'dry-20261028-1');const r=JSON.parse(readFileSync(receipt,'utf8')) as Record<string,unknown>;r.file='second.txt';writeFileSync(join(dir,'second.txt.scan.json'),JSON.stringify(r));}const s=uiSummary();incorporateOriginalUiText(s,dir,'dry-20261028-1');assert.ok((s.originalUi?.missing ?? 0)>0,change);assert.equal(scanVerdict(s).verdict,'FAIL',change);});
});

test('one declared general canary is sufficient while forms, duplicate labels and all occurrences remain strict', () => {
  const clean = cleanScan();
  assert.deepEqual(clean.canaries.map((canary) => canary.label), ['GATE_CANARY']);
  assert.equal(scanVerdict(clean).verdict, 'PASS');
  const missingForm = structuredClone(clean);
  missingForm.formsPerCanary = {};
  assert.equal(scanVerdict(missingForm).verdict, 'FAIL');
  const duplicate = structuredClone(clean);
  duplicate.canaries.push({ ...duplicate.canaries[0]! });
  assert.equal(scanVerdict(duplicate).verdict, 'FAIL');
  withDir((dir) => {
    put(dir, 'actual.txt', `ordinary text ${SECRET.value}`);
    const scanned = scanSources([SECRET], [source('runner', dir)], { pageText: '' });
    assert.ok(scanned.hits.some((hit) => hit.canary === SECRET.label && hit.verdict === 'LEAK'));
    assert.equal(scanVerdict(scanned).verdict, 'FAIL');
  });
});
