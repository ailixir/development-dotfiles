'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const script = path.join(root, 'tools/build-playwright-reference.cjs');
const resource = path.join(root, 'backend/src/main/resources/studio/playwright-reference/reference.txt');
const runner = path.join(root, 'studio-runner');
const nameOf = (line) => line.match(/^((?:expect\([a-z]+\))?[\w.]+?)(?:\(| ->|:)/)[1];
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const run = (...args) => execFileSync('node', [script, ...args], { encoding: 'utf8' }).trim();

function parse(text) {
  const sections = [];
  let current = null;
  let block = null;
  const result = { header: [], preamble: [], index: [], sections };
  for (const line of text.split('\n')) {
    if (line.startsWith('@@section ')) {
      const [, id, tier, ...title] = line.split(' ');
      current = { id, tier, title: title.join(' '), lines: [] };
      sections.push(current);
      block = current.lines;
    } else if (line === '@@preamble') block = result.preamble;
    else if (line === '@@index') block = result.index;
    else if (block) { if (line) block.push(line); }
    else if (line.startsWith('# ')) result.header.push(line);
  }
  return result;
}

const file = fs.readFileSync(resource);
const reference = parse(file.toString('utf8'));

test('two runs give the same bytes and the committed resource equals them', () => {
  const first = run('--hash');
  assert.equal(run('--hash'), first);
  run('--check');
  assert.equal(sha256(file), first);
});

test('the header binds the pinned Playwright version and the type definitions', () => {
  const pin = JSON.parse(fs.readFileSync(path.join(runner, 'package.json'), 'utf8')).dependencies.playwright;
  assert.equal(pin, '1.63.0');
  for (const pkg of ['playwright-core', 'playwright']) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(runner, 'node_modules', pkg, 'package.json'), 'utf8')).version, pin);
  }
  const header = reference.header.join('\n');
  assert.match(header, new RegExp('playwright=' + pin.replace(/\./g, '\\.') + '$', 'm'));
  assert.ok(header.includes('types.d.ts sha256=' + sha256(fs.readFileSync(path.join(runner, 'node_modules/playwright-core/types/types.d.ts')))));
  assert.ok(header.includes('test.d.ts sha256=' + sha256(fs.readFileSync(path.join(runner, 'node_modules/playwright/types/test.d.ts')))));
});

test('run-integrity members, listeners, deprecated members and selector twins are left out', () => {
  const lines = reference.sections.flatMap((s) => s.lines);
  const members = new Set(lines.map(nameOf));
  for (const left of ['page.video', 'page.close', 'context.close', 'context.browser', 'context.newPage', 'context.newCDPSession', 'context.tracing', 'page.request', 'context.request',
    'page.on', 'page.once', 'context.on', 'page.removeAllListeners', 'page.click', 'page.fill', 'page.type', 'page.waitForSelector', 'frame.click']) {
    assert.ok(!members.has(left), left + ' must not be in the reference');
  }
  for (const present of ['page.goto', 'page.locator', 'page.getByRole', 'locator.fill', 'locator.click', 'locator.getByRole', 'expect(locator).toHaveText',
    'expect(locator).toBeVisible', 'expect(page).toHaveURL', 'locator.evaluate', 'page.waitForEvent', 'page.evaluate']) {
    assert.ok(members.has(present), present + ' must be in the reference');
  }
  assert.ok(!lines.some((l) => /\bsignal\??[:,]/.test(l.split('  # ')[0])), 'the signal option is left out');
});

test('every member is in exactly one section and in the index; the size caps hold', () => {
  const indexed = reference.index.flatMap((line) => line.slice(line.indexOf(': ') + 2).split(', '));
  assert.equal(new Set(indexed).size, indexed.length, 'each member is indexed once');
  const lineNames = reference.sections.flatMap((s) => s.lines.map(nameOf));
  // An overload set is one index entry and may take two lines.
  assert.deepEqual([...new Set(lineNames)].sort(), [...indexed].sort());
  assert.deepEqual(reference.sections.map((s) => s.id), reference.index.map((l) => l.split(' ')[0]));
  const bytes = (s) => Buffer.byteLength(s.lines.join('\n') + '\n');
  const core = reference.sections.filter((s) => s.tier === 'core');
  assert.deepEqual(core.map((s) => s.id), ['core.locators', 'core.actions', 'core.assertions']);
  assert.ok(core.reduce((sum, s) => sum + bytes(s), 0) <= 20480);
  for (const section of reference.sections.filter((s) => s.tier === 'extended')) {
    assert.ok(bytes(section) <= 4096, section.id + ' is over 4096 bytes');
  }
});
