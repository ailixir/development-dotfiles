/**
 * Shared harness of the perception tier (ADR-SC-007 WI-2): real Chromium, no dist.
 *
 * - `guardDist()` signs the `dist/` tree (path, size, mtime, content hash) before the file's tests and
 *   asserts it unchanged afterwards: nothing in this tier may emit, rewrite or touch `dist/`.
 * - `environmentFingerprint()` identifies the browser and the layout it produces; the layout-dependent
 *   parts of the tier (near / in / headers come from boxes) are valid only for the fingerprint recorded in
 *   `test/fixtures/perception-parity/baseline.json`, and a mismatch FAILS, it is never skipped.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// eslint-disable-next-line no-restricted-imports -- Real Chromium for the perception tier; the production import stays in src/run/browser.ts only.
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { afterAll, beforeAll, expect } from 'vitest';

import type { CdpSession } from '../../../src/run/playwrightEngine.js';
import { packageRoot } from '../../helpers/corpus.js';

export const VIEWPORT = { width: 1280, height: 720 } as const;

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

/** One digest over every file of dist/: relative path, size, mtime and content. */
export function distSignature(): string {
  const root = join(packageRoot, 'dist');
  const hash = createHash('sha256');
  for (const file of filesUnder(root).sort()) {
    const stat = statSync(file);
    hash.update(`${relative(root, file)}\0${String(stat.size)}\0${String(stat.mtimeMs)}\0`);
    hash.update(readFileSync(file));
  }
  return hash.digest('hex');
}

/** Registers the before / after dist check for the calling test file. */
export function guardDist(): void {
  let before = '';
  beforeAll(() => {
    before = distSignature();
  });
  afterAll(() => {
    expect(distSignature(), 'a perception test touched dist/').toBe(before);
  });
}

export async function launchChromium(): Promise<Browser> {
  return chromium.launch({ headless: true, chromiumSandbox: true, args: [] });
}

export async function openPage(browser: Browser, html: string, viewport: { width: number; height: number } = VIEWPORT): Promise<Page> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(html);
  return page;
}

export async function cdpOf(page: Page): Promise<CdpSession> {
  const session = await page.context().newCDPSession(page);
  return session as unknown as CdpSession;
}

export async function domHash(cdp: CdpSession): Promise<string> {
  const result = (await cdp.send('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true })) as { result: { value: string } };
  return createHash('sha256').update(result.result.value).digest('hex');
}

/** backendNodeIds of every element a public Playwright locator matches, in document order (parks them in a main-world variable and removes it). */
export async function backendIdsOfLocator(cdp: CdpSession, locator: Locator): Promise<number[]> {
  const key = `__perception_${createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 16)}`;
  const count = await locator.evaluateAll((elements, k) => {
    (window as unknown as Record<string, unknown>)[k] = elements;
    return elements.length;
  }, key);
  const ids: number[] = [];
  for (let index = 0; index < count; index++) {
    const evaluated = (await cdp.send('Runtime.evaluate', { expression: `window[${JSON.stringify(key)}][${String(index)}]`, returnByValue: false })) as { result: { objectId?: string } };
    const objectId = evaluated.result.objectId;
    if (objectId === undefined) continue;
    const described = (await cdp.send('DOM.describeNode', { objectId })) as { node: { backendNodeId: number } };
    ids.push(described.node.backendNodeId);
  }
  await cdp.send('Runtime.evaluate', { expression: `delete window[${JSON.stringify(key)}]` });
  return ids;
}

export interface Fingerprint {
  readonly chromium: string;
  readonly playwright: string;
  readonly platform: string;
  readonly arch: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly layoutProbeSha256: string;
}

const PROBE_HTML = readFileSync(join(packageRoot, 'test', 'fixtures', 'perception-parity', 'fingerprint-probe.html'), 'utf8');

/** Browser build, platform and a hash of the text metrics the browser lays out (fonts included). */
export async function environmentFingerprint(browser: Browser): Promise<Fingerprint> {
  const page = await openPage(browser, PROBE_HTML);
  try {
    const metrics = await page.evaluate(() => Array.from(document.querySelectorAll('#probe span')).map((el) => {
      const rect = el.getBoundingClientRect();
      return [Math.round(rect.width * 1000) / 1000, Math.round(rect.height * 1000) / 1000];
    }));
    const { version } = JSON.parse(readFileSync(join(packageRoot, 'node_modules', 'playwright', 'package.json'), 'utf8')) as { version: string };
    return {
      chromium: browser.version(), playwright: version, platform: process.platform, arch: process.arch, viewport: VIEWPORT,
      layoutProbeSha256: createHash('sha256').update(JSON.stringify(metrics)).digest('hex'),
    };
  } finally {
    await page.context().close();
  }
}

/** True when `haystack` contains `needle` in any case. */
export const containsAnyCase = (haystack: string, needle: string): boolean => haystack.toLowerCase().includes(needle.toLowerCase());

// ---------------------------------------------------------------------------------------------------------------------
// Page generators of the WI-4 cut-over tests (cutover-observe, cutover-act, cutover-read, canary-boundary).

/** AC2 R4: an unnamed empty button beside a named one. */
export const R4_PAGE = '<main aria-label="Operations"><button type="button" id="icon"></button><button type="button" id="save" onclick="document.body.dataset.saved=\'yes\'">Save</button></main>';

/**
 * AC2 budget: a 1,200 item list and a 700 node table around one target. The canonical observation is far above 32,768
 * bytes and the page has more than 600 nodes; the outline stays within 40,000 bytes and still shows the target.
 */
export function budgetPage(): string {
  const items = Array.from({ length: 1200 }, (_, index) => `<li>Catalog entry number ${String(index)} with a descriptive tail</li>`).join('');
  const rows = Array.from({ length: 175 }, (_, index) => `<tr><td>Row ${String(index)}</td><td>Value ${String(index)}</td><td><a href="#r${String(index)}">Open ${String(index)}</a></td></tr>`).join('');
  return `<main aria-label="Operations"><h1>Catalog</h1><ul>${items}</ul><table aria-label="Orders"><tbody>${rows}</tbody></table><button type="button" id="target" onclick="document.body.dataset.clicked='yes'">Place order</button></main>`;
}

/** A page with `count` inputs, the first `filled` of them carrying a distinct value (private inventory entries). */
export function inputsPage(count: number, filled: number): string {
  const inputs: string[] = [];
  for (let index = 0; index < count; index++) {
    inputs.push(index < filled ? `<input aria-label="Field ${String(index)}" value="filled-value-${String(index)}">` : `<input aria-label="Field ${String(index)}">`);
  }
  return `<main aria-label="Operations">${inputs.join('')}</main>`;
}

/** A page whose main thread busy-loops for `blockMs` in repeated blocks of 1,000 ms (a hostile page for the collection deadline). */
export function busyPage(blockMs: number): string {
  return `<main aria-label="Operations"><button type="button">Go</button></main><script>const end=Date.now()+${String(blockMs)};(function spin(){const stop=Date.now()+1000;while(Date.now()<stop){}if(Date.now()<end)setTimeout(spin,0);})();</script>`;
}

/** Deterministic pseudo-random lowercase text (the generator of the WI-2 work-budget pages). */
export function noise(length: number, seed: number): string {
  let state = seed;
  let out = '';
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    out += 'abcdefghijklmnopqrstuvwxyz0123456789'[(state >>> 16) % 36] ?? 'a';
  }
  return out;
}

/**
 * A large order form: `rows` rows of nested markup, the first `filled` of them with a value (a private inventory entry each). This is the page
 * shape of the WI-2 work-budget tests; 9,000 rows with 4,000 entries ran the 20G default budget out after about 13 s on the S0 host.
 */
export function runawayFormPage(rows: number, filled: number): string {
  const parts = Array.from({ length: rows }, (_, i) => {
    const value = i < filled ? ` value="customer value number ${String(i)} ${noise(12, i)}"` : '';
    return `<div class="row"><div><span>Field ${String(i)}</span></div><div><label for="a${String(i)}">Name ${String(i)}<span>*</span></label></div><div><input id="a${String(i)}" name="a${String(i)}"${value}></div><div><p>Hint <b>one</b> <i>two</i> text ${String(i)}</p></div><ul><li>a</li><li>b</li><li>c</li></ul><button>Edit ${String(i)}</button><a href="#r${String(i)}">Link ${String(i)}</a></div>`;
  });
  return `<main aria-label="Orders"><form aria-label="Order form">${parts.join('')}</form></main>`;
}
