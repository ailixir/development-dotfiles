/**
 * STUDIO-FLEX-001 items 2 and 3, in real Chromium: the domain whitelist is the only navigation control.
 *
 * - Author-directed navigation needs a whitelisted destination and is refused before any request.
 * - A page may take the main frame anywhere (link, JS, 30x chain), load iframes and subresources from any
 *   host, and nothing is blocked on the way: there is no proxy and no route filter.
 * - A page that leaves the whitelist (an SSO hop) has a 15 s return window. Back inside it, learning and
 *   replay continue. Past it, learning ends with the host only (`OriginNotAllowed`) and the replay step is
 *   refused `POLICY_REFUSED`. Nothing is observed while the page is away, so no off-domain observation
 *   exists.
 *
 * The "other host" is `127.0.0.1`: the fixture server answers there too, and an IP literal can never be a
 * whitelist entry, so it stands in for an identity provider. The app is `localhost`.
 */
// eslint-disable-next-line no-restricted-imports -- Real Chromium fixture types; production import remains browser.ts only.
import type { Page } from 'playwright';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { OriginNotAllowed } from '../../src/allowedDomains.js';
import { ObservedInvocationControl, ReplayAcquisitionBudget } from '../../src/executor/observedReplay.js';
import type { Guard, ReplayAction, Scope } from '../../src/executor/observedOperations.js';
import { RETURN_WINDOW_MS, launchGuidedBrowser } from '../../src/run/browser.js';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';
import type { BrowserHandle } from '../../src/run/browserFactory.js';
import { createObservedReplayAdapter } from '../../src/run/observedReplayAdapter.js';
import { ObservedRefusal } from '../../src/validator/observedReferencePolicy.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { playwrightBrowserFactory } from './preparedBrowser.js';

interface Hit { readonly host: string; readonly path: string }
let server: Server, port = 0;
const hits: Hit[] = [];
const APP = (): string => `http://localhost:${String(port)}`;
const IDP = (): string => `http://127.0.0.1:${String(port)}`;
const hitsOn = (host: string, path: string): number => hits.filter(h => h.host === host && h.path === path).length;
const scratchDirs: string[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://x');
    const host = (request.headers.host ?? '').split(':')[0] ?? '';
    hits.push({ host, path: url.pathname });
    const html = (body: string): void => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(body); };
    const delay = url.searchParams.get('delay') ?? '1000';
    if (url.pathname === '/app') { html(`<title>App</title><main><a href="${IDP()}/idp?delay=${delay}">Sign in</a></main>`); return; }
    // The identity provider: a page of its own that sends the main frame back with JS after a delay.
    if (url.pathname === '/idp') { html(`<title>IdP</title><main><p>Identity provider</p></main><script>setTimeout(function(){location.replace(${JSON.stringify(APP())}+'/back');},${delay});</script>`); return; }
    if (url.pathname === '/back') { html('<title>Back</title><main><p>Signed in</p></main>'); return; }
    // A 30x chain that ends on the other host.
    if (url.pathname === '/redirect') { response.writeHead(302, { location: `${IDP()}/idp?delay=${delay}` }); response.end(); return; }
    // Subresources and an iframe on the other host.
    if (url.pathname === '/embed') { html(`<title>Embed</title><main><p>Embedding</p><iframe src="${IDP()}/frame"></iframe><img alt="pixel" src="${IDP()}/pixel.png"></main>`); return; }
    if (url.pathname === '/frame') { html('<title>Frame</title><p>Framed</p>'); return; }
    if (url.pathname === '/pixel.png') { response.writeHead(200, { 'content-type': 'image/png' }); response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==', 'base64')); return; }
    response.writeHead(404); response.end();
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('PORT');
  port = address.port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => { server.close(() => { resolve(); }); });
  for (const dir of scratchDirs) await rm(dir, { recursive: true, force: true });
});
afterEach(() => { hits.length = 0; });

const guidedConfig = (domains: readonly string[] = TEST_DOMAINS) => ({ sessionId: 'return-window', scopeHash: 'a'.repeat(64), allowedDomains: domains, knownSecrets: [] });
const pageOf = (browser: GuidedBrowser): Page => {
  if (browser.handle === undefined) throw new Error('HANDLE');
  return browser.handle.page as unknown as Page;
};

describe('learning (the guided browser)', () => {
  let guided: GuidedBrowser | undefined;
  afterEach(async () => { await guided?.close().catch(() => undefined); guided = undefined; });

  it('refuses an author-directed navigation to a host off the list before any request leaves, whatever the host', async () => {
    guided = await launchGuidedBrowser(guidedConfig(), 'context', () => undefined);
    for (const destination of [`${IDP()}/app`, 'http://example.org/', `http://localhost.evil.test:${String(port)}/app`, `http://user@localhost:${String(port)}/app`]) {
      await expect(guided.navigateBlank(destination), destination).rejects.toThrow('POLICY_DENIED');
    }
    expect(hits).toEqual([]);
    await guided.close(); guided = undefined;
  });

  it('refuses every navigation when the list is empty', async () => {
    guided = await launchGuidedBrowser(guidedConfig([]), 'context', () => undefined);
    await expect(guided.navigateBlank(`${APP()}/app`)).rejects.toThrow('POLICY_DENIED');
    expect(hits).toEqual([]);
  });

  it('continues when the page hops to another host and comes back inside the return window', async () => {
    guided = await launchGuidedBrowser(guidedConfig(), 'context', () => undefined);
    await guided.navigateBlank(`${APP()}/app?delay=1500`);
    const first = await guided.observations.observe();
    expect(first.observation.origin).toBe(APP());
    // A page-initiated main-frame navigation (a link) to a host off the list is not blocked.
    await pageOf(guided).click('a');
    const started = Date.now();
    const back = await guided.observations.observe();
    expect(Date.now() - started).toBeLessThan(RETURN_WINDOW_MS);
    expect(back.observation.origin).toBe(APP());
    expect(back.json).not.toContain('Identity provider');
    expect(hitsOn('127.0.0.1', '/idp')).toBe(1);
    expect(hitsOn('localhost', '/back')).toBe(1);
  });

  it('follows a 30x chain onto another host and continues when the page returns', async () => {
    guided = await launchGuidedBrowser(guidedConfig(), 'context', () => undefined);
    await guided.navigateBlank(`${APP()}/redirect?delay=1000`);
    const observed = await guided.observations.observe();
    expect(observed.observation.origin).toBe(APP());
    expect(hitsOn('127.0.0.1', '/idp')).toBe(1);
  });

  it('loads iframes and subresources from any host', async () => {
    guided = await launchGuidedBrowser(guidedConfig(), 'context', () => undefined);
    await guided.navigateBlank(`${APP()}/embed`);
    const observed = await guided.observations.observe();
    expect(observed.observation.origin).toBe(APP());
    await new Promise<void>(resolve => { setTimeout(resolve, 500); });
    expect(hitsOn('127.0.0.1', '/frame')).toBe(1);
    expect(hitsOn('127.0.0.1', '/pixel.png')).toBe(1);
  });

  it('ends with the host only, and observes nothing, when the page stays away past the window', async () => {
    guided = await launchGuidedBrowser(guidedConfig(), 'context', () => undefined);
    await guided.navigateBlank(`${APP()}/app?delay=22000`);
    await guided.observations.observe();
    await pageOf(guided).click('a');
    const started = Date.now();
    const failure = await guided.observations.observe().then(() => null, (error: unknown) => error);
    const waited = Date.now() - started;
    expect(failure).toBeInstanceOf(OriginNotAllowed);
    expect(failure).toMatchObject({ host: '127.0.0.1', message: 'ORIGIN_NOT_ALLOWED' });
    expect(waited).toBeGreaterThanOrEqual(RETURN_WINDOW_MS - 200);
    expect(waited).toBeLessThan(RETURN_WINDOW_MS + 5_000);
    // Only the host is in the error: no URL, path or query.
    expect(JSON.stringify(failure, Object.getOwnPropertyNames(failure))).not.toMatch(/idp|delay|http/u);
    expect(pageOf(guided).url().startsWith(IDP())).toBe(true);
    expect(hitsOn('localhost', '/back')).toBe(0);
  }, 60_000);
});

describe('replay (the observed adapter over the real browser)', () => {
  let handle: BrowserHandle | undefined;
  const scope: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', capabilities: ['navigate', 'click', 'assert'], initialContext: { kind: 'initialBlank' } };
  const open = async (domains: readonly string[] = TEST_DOMAINS): Promise<{ readonly handle: BrowserHandle; readonly page: Page }> => {
    const scratch = await mkdtemp(join(tmpdir(), 'return-window-'));
    scratchDirs.push(scratch);
    handle = await playwrightBrowserFactory.launch({ allowedDomains: domains, browser: 'chromium', scratchPath: scratch, observedScope: scope, viewport: { width: 800, height: 600 }, recording: { width: 800, height: 600 } });
    return { handle, page: handle.page as unknown as Page };
  };
  afterEach(async () => { await handle?.dispose().catch(() => undefined); handle = undefined; });
  const assertTitle = (expected: string): { readonly action: ReplayAction; readonly guard: Guard; readonly expected: string } => ({
    action: { coordinate: { stepId: '00000000-0000-4000-8000-000000000001', ordinal: 0 }, guardId: 'g1', operation: { kind: 'assert', predicate: 'title', expected: { kind: 'authoredLiteral', sourceInputId: 'expected' } } } as ReplayAction,
    guard: { guardId: 'g1', origin: APP(), target: { kind: 'page' } } as Guard,
    expected,
  });
  const performOn = (opened: BrowserHandle, domains: readonly string[], step: ReturnType<typeof assertTitle>) => {
    const adapter = createObservedReplayAdapter(opened, scope, domains, 'return-window-run', () => undefined);
    const control = new ObservedInvocationControl({ now: () => performance.now() }, performance.now() + 120_000, new AbortController().signal, new ReplayAcquisitionBudget(), { extra: 0 });
    return { adapter, run: () => adapter.perform(step.action, step.guard, step.expected, control) };
  };

  it('refuses an author-directed navigation to a host off the list before any request leaves', async () => {
    const { handle: opened } = await open();
    for (const destination of [`${IDP()}/app`, 'http://example.org/']) {
      await expect(opened.observedNavigateBlank?.(destination), destination).rejects.toThrow('POLICY_REFUSED');
    }
    expect(hits).toEqual([]);
  });

  it('refuses a step whose learned origin is off the list before it observes anything', async () => {
    const { handle: opened, page } = await open();
    await page.goto(`${IDP()}/back`);
    const step = assertTitle('Back');
    const { adapter, run } = performOn(opened, TEST_DOMAINS, { ...step, guard: { ...step.guard, origin: IDP() } as Guard });
    try { await expect(run()).rejects.toMatchObject({ code: 'POLICY_REFUSED' }); } finally { await adapter.dispose(); }
  });

  it('passes a step when the page hopped to another host and returned inside the window', async () => {
    const { handle: opened, page } = await open();
    await page.goto(`${APP()}/app?delay=1500`);
    await page.click('a');
    const { adapter, run } = performOn(opened, TEST_DOMAINS, assertTitle('Back'));
    try { await expect(run()).resolves.toEqual({ assertionPassed: true }); } finally { await adapter.dispose(); }
    expect(hitsOn('localhost', '/back')).toBe(1);
  });

  it('refuses the step POLICY_REFUSED when the page stays away past the window, and acts on nothing', async () => {
    const { handle: opened, page } = await open();
    await page.goto(`${APP()}/app?delay=22000`);
    await page.click('a');
    const { adapter, run } = performOn(opened, TEST_DOMAINS, assertTitle('Back'));
    const started = Date.now();
    const failure = await run().then(() => null, (error: unknown) => error);
    try {
      expect(failure).toBeInstanceOf(ObservedRefusal);
      expect(failure).toMatchObject({ code: 'POLICY_REFUSED', noEffect: true });
      expect(Date.now() - started).toBeGreaterThanOrEqual(RETURN_WINDOW_MS - 200);
      expect(hitsOn('localhost', '/back')).toBe(0);
    } finally { await adapter.dispose(); }
  }, 60_000);
});
