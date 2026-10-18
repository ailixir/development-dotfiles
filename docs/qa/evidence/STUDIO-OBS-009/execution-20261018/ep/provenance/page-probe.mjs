// Scratch probe (NOT committed): real Chromium drives every corpus page the way a correct system would,
// then the same flows with the four injected defects. The page host's receipts go through the independent
// oracle. Positive flows must be accepted; every applicable mutant must be rejected.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const RUNNER = '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner';
const require = createRequire(`${RUNNER}/package.json`);
const { chromium } = require('playwright');
const ev = await import(pathToFileURL(`${RUNNER}/evaluation/observed-authoring/evaluate.mjs`).href);
const manifest = ev.loadManifest();
const SECRET = 'planted-probe-secret-7731';
const host = await ev.startCorpusPages({ plantedSecrets: { c05: SECRET } });

const flows = {
  c01: [{ op: 'goto', page: 'home' }],
  c02: [{ op: 'goto', page: 'wiki' }],
  c03: [{ op: 'goto', page: 'wiki' }, { op: 'fill', label: 'Search Wikipedia', value: 'observability' }, { op: 'press', label: 'Search Wikipedia', key: 'Enter' }],
  c04: [{ op: 'goto', page: 'trial' }, { op: 'click', name: 'Log in' }, { op: 'click', name: 'Save target', alt: 'Save other' }],
  c05: [{ op: 'goto', page: 'login' }, { op: 'fill', label: 'User', value: 'pilot-user' }, { op: 'fill', label: 'Password', value: SECRET }, { op: 'click', name: 'Sign in' }, { op: 'wait', ms: 400 }],
  c06: [{ op: 'goto', page: 'forms' }, { op: 'select', label: 'Currency', value: 'GBP', alt: 'EUR' }, { op: 'check', label: 'Remember me' }, { op: 'fill', label: 'Notes', value: 'urgent' }, { op: 'click', name: 'Save' }],
  c07: [{ op: 'goto', page: 'search' }, { op: 'fill', label: 'Search', value: 'hosting' }, { op: 'press', label: 'Search', key: 'Enter' }],
  c08: [{ op: 'goto', page: 'orders' }],
  c09: [{ op: 'goto', page: 'forms' }],
  c10: [],
  c11: [{ op: 'goto', page: 'home' }],
  c12: [{ op: 'goto', page: 'forms' }],
  c13: [{ op: 'goto', page: 'wikimain' }, { op: 'fillVisibleSearch', value: 'Alan Turing' }],
  e2: [{ op: 'goto', page: 'shadow' }, { op: 'shadowFill', value: 'ORD-42' }, { op: 'shadowClick', name: 'Apply' }],
  e3: [{ op: 'goto', page: 'frame' }],
  e4: [{ op: 'goto', page: 'list' }, { op: 'pickItem', id: '0420' }],
  q1: [{ op: 'goto', page: 'form' }, { op: 'fill', label: 'City', value: 'London' }, { op: 'click', name: 'Save' }],
  q2: [{ op: 'goto', page: 'home' }, { op: 'click', role: 'link', name: 'Reports' }],
  q3: [{ op: 'goto', page: 'city' }, { op: 'select', label: 'City', value: 'London', alt: 'Paris' }, { op: 'click', name: 'Save' }],
};
let flowExpects = { hasActions: false, requiredViews: 0 };
const mutate = (flow, kind, key) => {
  const f = flow.map((s) => ({ ...s }));
  if (kind === 'wrongTarget') {
    // clicking a sibling control or selecting a sibling option; flows with no such control click the first link/button instead
    const s = f.find((x) => x.alt !== undefined);
    if (s) { if (s.op === 'click') s.name = s.alt; else s.value = s.alt; return { applicable: true, flow: f }; }
    if (f.some((x) => x.op === 'fillVisibleSearch')) { f.find((x) => x.op === 'fillVisibleSearch').hidden = true; return { applicable: true, flow: f }; }
    if (key === 'e3') return { applicable: true, flow: [...f, { op: 'frameType', value: 'Looks good' }] };
    const g = f.findIndex((x) => x.op === 'goto');
    if (g === -1) return { applicable: false, flow: f };
    f[g] = { op: 'goto', page: 'wrong-page' };
    return { applicable: true, flow: f };
  }
  if (kind === 'droppedSubmit') {
    const expectsSomething = flowExpects.hasActions || flowExpects.requiredViews > 0;
    if (!expectsSomething) return { applicable: false, flow: f };
    const idx = [...f.keys()].reverse().find((i) => f[i].op !== 'goto' && f[i].op !== 'wait');
    if (idx === undefined) { const g = f.findIndex((x) => x.op === 'goto'); if (g === -1) return { applicable: false, flow: f }; f.splice(g, 1); return { applicable: true, flow: f }; }
    f.splice(idx, 1);
    return { applicable: true, flow: f };
  }
  if (kind === 'literalSubstitution') {
    const s = f.find((x) => ['fill', 'select', 'fillVisibleSearch', 'shadowFill'].includes(x.op) && typeof x.value === 'string' && x.label !== 'Password');
    if (!s) return { applicable: false, flow: f };
    s.value = s.op === 'select' ? (s.alt ?? s.value) : `${s.value}-x`;
    return { applicable: true, flow: f };
  }
  return { applicable: false, flow: f };
};

const endStateChecks = {
  c01: async (pg) => (await pg.locator('h1').innerText()) === 'Example Domain',
  c02: async (pg) => pg.url().includes('/wiki'),
  c03: async (pg) => pg.url().includes('/wiki') && (await pg.locator('#r').innerText()) === 'Results for observability',
  c04: async (pg) => (await pg.locator('#status').innerText()) === 'Saved target',
  c05: async (pg) => (await pg.locator('h1').innerText()) === 'Dashboard',
  c06: async (pg) => (await pg.locator('#s').innerText()) === 'Saved',
  c08: async (pg) => (await pg.getByText('Order rejected').count()) === 0,
  c09: async (pg) => await pg.getByRole('button', { name: 'Delete' }).isVisible(),
  e2: async (pg) => (await pg.locator('#s').innerText()) === 'Applied ORD-42',
  q2: async (pg) => (await pg.locator('h1').innerText()) === 'Reports',
  q3: async (pg) => (await pg.locator('#s').innerText()) === 'Saved London',
};
const browser = await chromium.launch({ headless: true });
const results = [];
let seq = 0;
const endResults = {};
const runFlow = async (key, flow, endCheck = false) => {
  const ns = `${key}.p${String(++seq)}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(2500);
  const base = host.fixtureOrigin(ns);
  const cursor = host.receipts(ns).length;
  for (const s of flow) {
    try {
    if (s.op === 'goto') await page.goto(`${base}/${s.page}`).catch(() => undefined);
    else if (s.op === 'fill') await page.getByLabel(s.label, { exact: true }).fill(s.value);
    else if (s.op === 'press') await page.getByLabel(s.label, { exact: true }).press(s.key);
    else if (s.op === 'click') { const target = s.role === 'link' ? page.getByRole('link', { name: s.name, exact: true }) : page.getByRole('button', { name: s.name, exact: true }); await target.click(); await page.waitForTimeout(150); }
    else if (s.op === 'clickAnyButton') { await page.locator('button, a').first().click({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(150); }
    else if (s.op === 'select') await page.getByLabel(s.label, { exact: true }).selectOption(s.value);
    else if (s.op === 'check') await page.getByLabel(s.label).check();
    else if (s.op === 'wait') await page.waitForTimeout(s.ms);
    else if (s.op === 'fillVisibleSearch') {
      if (s.hidden) await page.locator('#hid').evaluate((el, v) => { el.value = v; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); }, s.value);
      else { await page.locator('#vis').fill(s.value); await page.locator('#vis').press('Enter'); }
      await page.waitForTimeout(150);
    }
    else if (s.op === 'frameType') { const fl = page.frameLocator('iframe'); await fl.getByLabel('Comment').fill(s.value); await fl.getByRole('button', { name: 'Post' }).click(); await page.waitForTimeout(150); }
    else if (s.op === 'shadowFill') await page.locator('#host input').fill(s.value);
    else if (s.op === 'shadowClick') { await page.locator('#host').getByRole('button', { name: s.name }).click(); await page.waitForTimeout(150); }
    else if (s.op === 'pickItem') {
      await page.locator('#v').evaluate((el) => { el.scrollTop = 419 * 24; });
      await page.getByRole('button', { name: `Item ${s.id}` }).click();
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(60);
    } catch { break; }
  }
  if (endCheck && endStateChecks[key]) endResults[key] = await endStateChecks[key](page).catch(() => false);
  await context.close();
  return ev.pageReceipts(host, ns).since(cursor);
};
for (const entry of manifest.cases) {
  if (entry.fixture?.kind !== 'corpus-pages') continue;
  const key = entry.fixture.namespaceBase.split('/').at(-1);
  const expected = JSON.parse(readFileSync(`${RUNNER}/evaluation/observed-authoring/${entry.expectedOutcome.path}`, 'utf8'));
  const flow = flows[key];
  flowExpects = { hasActions: Object.values(expected.receipts.phases).some((p) => p.actions.length > 0), requiredViews: (expected.receipts.views?.required ?? []).length };
  const ideal = ev.idealObservation(expected, {});
  const phase = flow.length === 0 ? { actions: [], views: [] } : await runFlow(key, flow, true);
  const observed = (p) => ({ ...ideal, receipts: { phases: { run: p } } });
  const verdict = ev.evaluateOutcome(expected, observed(phase), {});
  const row = { id: entry.id, class: entry.class, positive: verdict.correct, positiveFailures: verdict.failures, endStateAssertionTrue: key in endStateChecks ? endResults[key] === true : 'n/a', actionsSeen: phase.actions.length, viewsSeen: phase.views, mutants: {} };
  for (const kind of ['wrongTarget', 'droppedSubmit', 'literalSubstitution']) {
    const m = entry.pages.length === 0 ? { applicable: false, flow } : mutate(flow, kind, key);
    if (!m.applicable) { row.mutants[kind] = 'n/a'; continue; }
    const p = await runFlow(key, m.flow);
    const v = ev.evaluateOutcome(expected, observed(p), {});
    row.mutants[kind] = v.correct ? 'ACCEPTED(!)' : 'rejected';
  }
  // reversedAssertion is a session-level defect: the system reports the opposite result for the same receipts.
  const rev = ev.mutateObservation('reversedAssertion', observed(phase), expected);
  row.mutants.reversedAssertion = ev.evaluateOutcome(expected, rev.observed, {}).correct ? 'ACCEPTED(!)' : 'rejected';
  results.push(row);
}
await browser.close();
await host.close();
writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.positive || r.endStateAssertionTrue === false || Object.values(r.mutants).includes('ACCEPTED(!)'));
for (const r of results) console.log(r.id.padEnd(40), r.positive ? 'POS-OK' : 'POS-FAIL ' + r.positiveFailures.join(','), 'END-STATE:' + r.endStateAssertionTrue, JSON.stringify(r.mutants));
console.log(bad.length === 0 ? 'ALL OK' : `PROBLEMS: ${bad.map((b) => b.id).join(', ')}`);
process.exitCode = bad.length === 0 ? 0 : 1;
