// SPK-07 F1: does Playwright's own engine, run inside our CDP isolated world, agree exactly with
// Playwright's public locators? Pass = identical match counts and identical elements (backendNodeId)
// for every generated selector and every today's-kind hint, and no page-visible DOM mutation.
// usage: node evaluation/grounding/f1-conformance.mjs OUT_DIR
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { session, isolatedWorld, evaluateHandle, call, backendNodeId, locatorIds } from './lib/cdp.mjs';
import { engineExpression, hintSelector, PINNED_BUNDLE_SHA256 } from './lib/pwEngine.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const { installObservationCollector } = await import(new URL('./generated/frozen-dist/run/observationCollector.js', import.meta.url));
const { observationReadProfile } = await import(new URL('./generated/frozen-dist/run/observationReadProfile.js', import.meta.url));
const out = process.argv[2]; mkdirSync(out, { recursive: true });

const PAGES = {
  practice: 'https://practicetestautomation.com/practice-test-login/',
  wikipedia: 'https://en.wikipedia.org/wiki/Python_(programming_language)',
  govuk: 'https://www.gov.uk/',
  hackernews: 'https://news.ycombinator.com/',
  hnlogin: 'https://news.ycombinator.com/login',
  pythondocs: 'https://docs.python.org/3/',
  mdn: 'https://developer.mozilla.org/en-US/',
  github: 'https://github.com/microsoft/playwright',
};
const EDGE = `<!doctype html><title>edge</title>
<button>Save</button><button style="display:none">Save</button><button aria-hidden="true">Save</button>
<div aria-hidden="true"><button>Close</button></div><button>Close</button>
<button>Save draft</button><label>Email <input></label><label for="e2">Email address</label><input id="e2">
<input placeholder="Search"><input placeholder="Search docs"><div data-testid="total">42</div><span>Exact text</span><span>Exact text more</span>
<div id="host"></div><iframe srcdoc="<button>Save</button>"></iframe>
<script>document.getElementById('host').attachShadow({mode:'open'}).innerHTML='<button>Shadow action</button><button>Save</button>';</script>`;

const publicLocator = (page, hint) => hint.kind === 'role' ? page.getByRole(hint.role, { name: hint.name, exact: true })
  : hint.kind === 'label' ? page.getByLabel(hint.value, { exact: true }) : hint.kind === 'testId' ? page.getByTestId(hint.value)
  : hint.kind === 'text' ? page.getByText(hint.value, { exact: true }) : page.getByPlaceholder(hint.value, { exact: true });

const relaxed = { limits: { nodes: 100000, depth: 64, bytes: 67108864, milliseconds: 20000 }, workLimits: { elements: 200000, depth: 64 } };
const browser = await chromium.launch({ headless: true });
const summary = { pinnedBundleSha256: PINNED_BUNDLE_SHA256, pages: {} };
for (const [key, url] of Object.entries({ ...PAGES, edge: null })) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  if (url) { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.waitForTimeout(2500); } else await page.setContent(EDGE);
  const cdp = await session(page);
  // Freeze page scripts so any DOM change during the check can only come from us.
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
  const domHash = async () => createHash('sha256').update((await cdp.send('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true })).result.value ?? '').digest('hex');
  const before = await domHash();
  const world = await isolatedWorld(cdp);
  const engine = await evaluateHandle(cdp, world, engineExpression());
  const t0 = Date.now();
  // Candidates: every element in Playwright's own AI-mode aria snapshot that carries a ref and an interactive role.
  const generated = await call(cdp, engine, `function() {
    const snapshot = this.ariaSnapshot(document.documentElement, { mode: 'ai' });
    const refs = [...snapshot.matchAll(/- (button|link|textbox|searchbox|combobox|checkbox|radio|listbox|spinbutton|slider|switch|tab|menuitem|option)\\b[^\\n]*\\[ref=(e\\d+)\\]/g)].map(m => m[2]);
    globalThis.__spk07 = [];
    const rows = [];
    for (const ref of refs) {
      const el = this.querySelector(this.parseSelector('aria-ref=' + ref), document, false);
      if (!el) { rows.push({ ref, error: 'REF_UNRESOLVED' }); continue; }
      const selector = this.generateSelectorSimple(el);
      const all = this.querySelectorAll(this.parseSelector(selector), document);
      globalThis.__spk07.push(el);
      rows.push({ ref, selector, count: all.length, same: all.length === 1 && all[0] === el, index: globalThis.__spk07.length - 1 });
    }
    return rows;
  }`);
  const engineMs = Date.now() - t0;
  const mismatches = []; let checked = 0;
  for (const row of generated) {
    if (row.error) { mismatches.push(row); continue; }
    const mine = await backendNodeId(cdp, await call(cdp, engine, 'function(i) { return globalThis.__spk07[i]; }', [row.index], false));
    const theirs = await locatorIds(page, cdp, page.locator(row.selector));
    checked++;
    if (theirs.length !== row.count || !row.same || theirs[0] !== mine) mismatches.push({ ...row, playwrightCount: theirs.length, sameElement: theirs[0] === mine });
  }
  // Today's hint kinds (Stage 1 / arm S2): count in our engine vs Playwright's public getBy* API.
  const collectorWorld = await isolatedWorld(cdp);
  const opts = { sessionId: 's', scopeHash: 'a'.repeat(64), allowedDomains: ['*'], rules: [], knownSecrets: [], readProfile: observationReadProfile(['*']), ...relaxed };
  const collector = await call(cdp, await evaluateHandle(cdp, collectorWorld, `(${installObservationCollector.toString()})(${JSON.stringify(opts)}, [])`), 'function() { return this; }', [], false);
  const observation = await call(cdp, collector, `function() { return this.collect({ documentId: 'd', generation: 1, observedAt: new Date().toISOString() }); }`);
  const hints = []; const seen = new Set();
  for (const node of observation.nodes) for (const hint of node.locatorHints) { const s = hintSelector(hint); if (!seen.has(s)) { seen.add(s); hints.push(hint); } }
  const hintMismatches = []; let hintUnique = 0;
  for (const hint of hints) {
    const selector = hintSelector(hint);
    const mineCount = await call(cdp, engine, 'function(s) { return this.querySelectorAll(this.parseSelector(s), document).length; }', [selector]);
    const theirs = await locatorIds(page, cdp, publicLocator(page, hint));
    if (mineCount === 1) hintUnique++;
    if (mineCount !== theirs.length) hintMismatches.push({ hint, selector, mineCount, playwrightCount: theirs.length });
  }
  const after = await domHash();
  const result = { url: url ?? 'setContent(edge)', interactive: generated.length, checked, mismatches: mismatches.length, engineMs,
    hints: hints.length, hintMismatches: hintMismatches.length, hintUniqueUnderPlaywright: hintUnique, domUnchanged: before === after };
  summary.pages[key] = result;
  writeFileSync(`${out}/${key}.json`, JSON.stringify({ result, mismatches, hintMismatches, generated: generated.slice(0, 50) }, null, 1));
  console.log(key.padEnd(11), JSON.stringify(result));
  await page.context().close();
}
await browser.close();
summary.pass = Object.values(summary.pages).every(p => p.mismatches === 0 && p.hintMismatches === 0 && p.domUnchanged && p.checked === p.interactive);
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
console.log('F1', summary.pass ? 'PASS' : 'FAIL');
