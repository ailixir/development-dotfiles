/**
 * SC008-E6 (AC4 to AC7, real Chromium on loopback pages): the step runner against the production browser wiring. The browser comes from the same
 * factory the replay child uses (stepApi, popup registry, document counter, recordings), the session is the real observation session, and the code
 * runs through performStep and E1's runStep. No model, no public site.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Scope } from '../../../src/executor/observedOperations.js';
import { newTally, performStep } from '../../../src/run/observedReplayAdapter.js';
import type { SecretRun, StepOutcome, StepRequest } from '../../../src/run/observedReplayAdapter.js';
import type { BrowserHandle } from '../../../src/run/browserFactory.js';
import { createSecretRun } from '../../../src/run/observedReplayAdapter.js';
import { SecretUseEvidence } from '../../../src/run/secretUse.js';
import type { ObservationSession } from '../../../src/run/observationTypes.js';
import { TEST_DOMAINS } from '../../helpers/allowedDomains.js';
import { coordinate, must, openControl, operation } from '../../helpers/stepFakes.js';
import { launchGuidedBrowser } from '../../../src/run/browser.js';
import { playwrightBrowserFactory } from '../preparedBrowser.js';
import { guardDist } from './harness.js';

guardDist();

const SCOPE: Scope = { principalId: 'p', csiId: 'csi', environment: 'fixture', capabilities: ['step'], initialContext: { kind: 'initialBlank' } };

interface Site { readonly origin: string; readonly ipOrigin: string; readonly hits: string[]; readonly posts: string[]; close(): Promise<void> }
async function serve(routes: Readonly<Record<string, string | ((request: IncomingMessage, response: ServerResponse) => void)>>): Promise<Site> {
  const hits: string[] = [], posts: string[] = [];
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    hits.push(`${request.method ?? 'GET'} ${path}`);
    if (request.method === 'POST') { let body = ''; request.on('data', (chunk: Buffer) => { body += chunk.toString(); }); request.on('end', () => { posts.push(body); response.writeHead(200, { 'content-type': 'text/html' }); response.end('<title>Posted</title><p>posted</p>'); }); return; }
    const route = routes[path];
    if (route === undefined) { response.writeHead(404); response.end('not found'); return; }
    if (typeof route === 'function') { route(request, response); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(route);
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as AddressInfo).port;
  return { origin: `http://localhost:${String(port)}`, ipOrigin: `http://127.0.0.1:${String(port)}`, hits, posts, close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => { resolve(); }); }) };
}
const page = (body: string, head = ''): string => `<!doctype html><html><head><title>Fixture</title>${head}</head><body>${body}</body></html>`;

interface Run {
  readonly handle: BrowserHandle;
  readonly session: ObservationSession;
  readonly scratch: string;
  readonly videoDir: string;
  step(code: string, parts?: Partial<StepRequest> & { captures?: string[] }): Promise<StepOutcome>;
  close(): Promise<string | null>;
  dispose(): Promise<void>;
}
const scratches: string[] = [];
async function launch(allowedDomains: readonly string[] = TEST_DOMAINS): Promise<Run> {
  const scratch = await mkdtemp(join(tmpdir(), 'step-run-live-'));
  scratches.push(scratch);
  const handle = await playwrightBrowserFactory.launch({ allowedDomains, browser: 'chromium', viewport: { width: 1280, height: 720 }, recording: { width: 640, height: 480 }, scratchPath: scratch, observedScope: SCOPE });
  const session = handle.createObservationSession?.({ sessionId: 'live', scopeHash: '0'.repeat(64), allowedDomains, knownSecrets: [] });
  if (!session || !handle.stepApi) throw new Error('HANDLE');
  const host = handle.stepApi;
  let n = 0;
  return {
    handle, session, scratch, videoDir: join(scratch, 'video'),
    step(code, parts = {}) {
      const { captures, ...rest } = parts;
      return performStep(host, session, { coordinate: coordinate(`step-${String(n++)}`), operation: operation(code, captures === undefined ? {} : { captures }), inputs: {}, vars: {}, secretIds: [], control: openControl({ remainingMs: 20_000 }), tally: newTally(), allowedDomains, ...rest });
    },
    close: () => handle.close(),
    dispose: async () => { await session.dispose(); await handle.dispose(); },
  };
}
afterAll(async () => { for (const directory of scratches.splice(0)) await rm(directory, { recursive: true, force: true }); });

let site: Site;
beforeAll(async () => {
  site = await serve({
    '/start': page('<h1>Start</h1><a id="away" href="__AWAY__">go away</a><button id="mutate" onclick="document.body.insertAdjacentHTML(\'beforeend\', \'<p>changed</p>\')">Change</button>'),
    '/popup': page('<h1>Popup</h1><button id="ok">Fine</button>'),
    '/open': page('<button id="one" onclick="window.open(\'/popup\')">one</button><button id="two" onclick="window.open(\'/popup\')">two</button><button id="three" onclick="window.open(\'/popup\')">three</button><button id="four" onclick="window.open(\'/popup\')">four</button><button id="five" onclick="window.open(\'/popup\')">five</button>'),
    '/frame': page('<iframe title="Payments widget" srcdoc="<p>IFRAME-CANARY-TEXT</p>"></iframe><button>After the frame</button>'),
    '/login': page('<form method="post" action="/login"><label>User <input name="u" type="text"></label><label>Password <input name="p" type="password"></label><button type="submit">Sign in</button></form>'),
    // SC008-FIX-19: pages whose navigation commits after the step's own call has returned.
    '/nav-start': page('<main><h1>Home</h1><form action="/nav-go"><input name="q" type="search" aria-label="Search" value="x"><button type="submit">Go</button></form><select aria-label="Version" onchange="setTimeout(() => { location.href = \'/nav-go?v=\' + this.value; }, 0)"><option value="a">A</option><option value="b">B</option></select></main>'),
    '/nav-go': (_request, response) => { response.writeHead(302, { location: '/nav-article' }); response.end(); },
    '/nav-article': page('<main><h1>Article</h1><p>text</p></main>'),
    // SC008-FIX-25: a select whose change navigates 150 ms later (the docs.python.org version switcher), and the page it lands on.
    '/late-nav': page('<main><h1>Docs</h1><input aria-label="Query" type="search"><select aria-label="Version" onchange="setTimeout(() => { location.href = \'/late-nav-target\'; }, 150)"><option value="a">A</option><option value="b">B</option></select><button id="mutate" onclick="document.body.insertAdjacentHTML(\'beforeend\', \'<p>changed</p>\')">Change</button></main>'),
    '/late-nav-target': page('<main><h1>Docs next</h1><input aria-label="Query" type="search"></main>'),
    // SC008-FIX-40: a start page with failing sub-resources, a link to a document that answers 403 (bot protection), a link that redirects to a 200, and a link to a page whose own sub-resources and sub-frame fail.
    '/err-start': page('<main><h1>Releases</h1><img alt="logo" src="/missing.png"><a href="/blocked">browse blocked</a> <a href="/nav-go">browse redirected</a> <a href="/broken-parts">browse broken parts</a></main>'),
    '/blocked': (_request, response) => { response.writeHead(403, { 'content-type': 'text/html' }); response.end(page('<h1>Access Denied</h1>')); },
    '/broken-parts': page('<h1>Fine page</h1><img alt="gone" src="/missing-too.png"><iframe title="gone frame" src="/missing-frame"></iframe>'),
  });
});
afterAll(async () => { await site.close(); });

describe('certificates (FR-19)', () => {
  it('a step that changed the page kills the observation taken before it, and the next observation is a new generation that works', async () => {
    const run = await launch();
    try {
      await run.step(`await page.goto('${site.origin}/start');`);
      const before = (await run.session.observe()).observation;
      expect(run.session.documentCurrent({ documentId: before.documentId, generation: before.generation }, before.origin)).toBe(true);
      const read = await run.step("await page.locator('h1').innerText();");
      expect(read.receipt.closedCode).toBeNull();
      expect(run.session.documentCurrent({ documentId: before.documentId, generation: before.generation }, before.origin)).toBe(true);
      const changed = await run.step("await page.getByRole('button', { name: 'Change' }).click();");
      expect(changed.receipt).toMatchObject({ closedCode: null, fenceCrossed: true });
      expect(run.session.documentCurrent({ documentId: before.documentId, generation: before.generation }, before.origin)).toBe(false);
      const after = (await run.session.observe()).observation;
      expect(after.generation).toBeGreaterThan(before.generation);
      expect(run.session.documentCurrent({ documentId: after.documentId, generation: after.generation }, after.origin)).toBe(true);
      expect(run.session.documentCurrent({ documentId: before.documentId, generation: before.generation }, before.origin)).toBe(false);
    } finally { await run.dispose(); }
  });

  it('a password operation that names the observation taken before a changing step is refused with no effect', async () => {
    const run = await launch();
    try {
      await run.step(`await page.goto('${site.origin}/login');`);
      const before = (await run.session.observe()).observation;
      await run.step("await page.getByLabel('User').fill('someone');");
      const stale = { kind: 'passwordControl' as const, documentId: before.documentId, generation: before.generation };
      await expect(run.session.preparePassword?.(stale, before.origin)).rejects.toMatchObject({ message: 'TARGET_CHANGED' });
      const fresh = (await run.session.observe()).observation;
      await expect(run.session.preparePassword?.({ kind: 'passwordControl', documentId: fresh.documentId, generation: fresh.generation }, fresh.origin)).resolves.toBeUndefined();
    } finally { await run.dispose(); }
  });
});

describe('frames', () => {
  it('an iframe is one line with its title and a ref, and nothing of its content reaches the observation', async () => {
    const run = await launch();
    try {
      await run.step(`await page.goto('${site.origin}/frame');`);
      const exported = await run.session.observe();
      expect(exported.observation.outline).toMatch(/- iframe "Payments widget" \[e\d+\]/u);
      expect(exported.json).not.toContain('IFRAME-CANARY-TEXT');
      const ref = /- iframe "Payments widget" \[(e\d+)\]/u.exec(exported.observation.outline)?.[1];
      expect(ref && exported.observation.facts[ref]?.role).toBe('iframe');
    } finally { await run.dispose(); }
  });
});

describe('popups and recordings', () => {
  it('adopts an awaited popup, reports the step as offscreen, closes the one nobody awaited, and ends with exactly one recording', async () => {
    const run = await launch();
    try {
      await run.step(`await page.goto('${site.origin}/open');`);
      const adopted = await run.step("const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#one').click()]); await popup.getByRole('button', { name: 'Fine' }).click();");
      expect(adopted.receipt).toMatchObject({ closedCode: null, offscreen: true });
      expect(run.handle.stepApi?.adoptedPages()).toHaveLength(1);
      const stray = await run.step("await page.locator('#two').click(); await page.waitForTimeout(300);");
      expect(stray.receipt).toMatchObject({ closedCode: null, offscreen: false });
      expect(run.handle.stepApi?.adoptedPages()).toHaveLength(1);
      expect((run.handle.page as { context(): { pages(): unknown[] } }).context().pages()).toHaveLength(2);
      const next = await run.step("await page.locator('h1, button').first().click();");
      expect(next.receipt.closedCode).toBeNull();
      const path = await run.close();
      expect(path).toBeTruthy();
      expect(await readdir(run.videoDir)).toHaveLength(1);
    } finally { await run.dispose(); }
  }, 120_000);

  it('caps the adopted pages that are open across the run at 4: three then two refuses the fifth', async () => {
    const run = await launch();
    try {
      await run.step(`await page.goto('${site.origin}/open');`);
      const popup = (id: string): string => `await Promise.all([page.waitForEvent('popup'), page.locator('#${id}').click()]);`;
      const first = await run.step(`${popup('one')} ${popup('two')} ${popup('three')}`);
      expect(first.receipt.closedCode).toBeNull();
      expect(run.handle.stepApi?.adoptedPages()).toHaveLength(3);
      const second = await run.step(`${popup('four')} ${popup('five')}`);
      expect(second.receipt.closedCode).toBe('POLICY_REFUSED');
      expect(run.handle.stepApi?.adoptedPages()).toHaveLength(4);
    } finally { await run.dispose(); }
  }, 120_000);
});

describe('popups in a guided session', () => {
  it('neither ends the session nor adds a recording: an awaited popup is adopted, an unawaited one is closed, and the session keeps exactly its own video', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'step-run-guided-'));
    scratches.push(dir);
    let lost: string | undefined;
    const config = { sessionId: 'guided-live', scopeHash: '0'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [] };
    const browser = await launchGuidedBrowser(config, 'context-1', reason => { lost = reason ?? 'LOST'; }, { dir, size: { width: 640, height: 480 }, ready: () => undefined }, { deadlineEpochMs: Date.now() + 30_000, signal: new AbortController().signal });
    try {
      const host = browser.handle?.stepApi;
      if (!host) throw new Error('HANDLE');
      const run = (code: string): Promise<StepOutcome> => performStep(host, browser.observations, { coordinate: coordinate('g'), operation: operation(code), inputs: {}, vars: {}, secretIds: [], control: openControl({ remainingMs: 20_000 }), tally: newTally(), allowedDomains: TEST_DOMAINS });
      await run(`await page.goto('${site.origin}/open');`);
      expect((await run("const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#one').click()]); await popup.getByRole('button', { name: 'Fine' }).click();")).receipt).toMatchObject({ closedCode: null, offscreen: true });
      expect((await run("await page.locator('#two').click(); await page.waitForTimeout(300);")).receipt).toMatchObject({ closedCode: null, offscreen: false });
      expect(lost).toBeUndefined();
      await browser.close();
      expect(await browser.recordedVideo?.()).toBeTruthy();
      expect(await readdir(dir)).toHaveLength(1);
    } finally { await browser.terminate().catch(() => undefined); }
  }, 120_000);
});

describe('domain policy', () => {
  // *.localhost names resolve to the loopback server, so a second host exists without leaving the machine; an IP literal is never an entry.
  const alt = (): string => site.origin.replace('localhost', 'alt.localhost');
  const other = (): string => site.origin.replace('localhost', 'other.localhost');

  it('a click that takes the main frame off the list ends the step POLICY_REFUSED, and the same navigation is allowed under allow-all', async () => {
    const refusing = await launch(['alt.localhost']);
    try {
      await refusing.step(`await page.goto('${alt()}/start');`);
      const away = await refusing.step(`await page.evaluate((href) => { document.getElementById('away').setAttribute('href', href); }, '${other()}/popup');`);
      expect(away.receipt.closedCode).toBeNull();
      const outcome = await refusing.step("await page.locator('#away').click();");
      expect(outcome.receipt.closedCode).toBe('POLICY_REFUSED');
    } finally { await refusing.dispose(); }
    const open = await launch(['*']);
    try {
      await open.step(`await page.goto('${alt()}/start');`);
      expect((await open.step(`await page.goto('${other()}/popup');`)).receipt.closedCode).toBeNull();
      // Under allow-all an IP literal is still no destination.
      expect((await open.step(`await page.goto('${site.ipOrigin}/popup');`)).receipt.closedCode).toBe('POLICY_REFUSED');
    } finally { await open.dispose(); }
  });

  it('refuses goto to an off-list host before any request reaches it', async () => {
    const run = await launch(['alt.localhost']);
    try {
      const before = site.hits.length;
      const outcome = await run.step(`await page.goto('${other()}/popup');`);
      expect(outcome.receipt).toMatchObject({ closedCode: 'POLICY_REFUSED', fenceCrossed: false });
      expect(site.hits.length).toBe(before);
    } finally { await run.dispose(); }
  });
});

describe('a secret fill after a text fill in the same step', () => {
  it('writes through the trusted path, posts the form, and leaves the value out of every record', async () => {
    const run = await launch();
    try {
      const evidence = new SecretUseEvidence(['PASS']);
      let control = openControl({ remainingMs: 20_000 });
      const secrets: SecretRun = createSecretRun({ session: run.session, evidence, control: () => control, resolve: id => (id === 'PASS' ? { value: 'CANARY-SECRET-VALUE', allowedOrigins: [site.origin] } : undefined) });
      await run.step(`await page.goto('${site.origin}/login');`);
      control = openControl({ remainingMs: 20_000 });
      const posts = site.posts.length;
      const outcome = await performStep(must(run.handle.stepApi), run.session, {
        coordinate: coordinate('login'), operation: operation("await page.getByLabel('User').fill(inputs['u']); await page.getByLabel('Password').fill(secrets['PASS']); await page.getByRole('button', { name: 'Sign in' }).click();"),
        inputs: { u: 'someone' }, vars: {}, secretIds: ['PASS'], control, tally: newTally(), allowedDomains: TEST_DOMAINS, secrets,
      });
      expect(outcome.receipt.closedCode).toBeNull();
      expect(evidence.snapshot()).toEqual({ PASS: 'USED' });
      expect(site.posts.slice(posts)).toHaveLength(1);
      expect(site.posts.at(-1)).toContain('u=someone');
      expect(site.posts.at(-1)).toContain('CANARY-SECRET-VALUE');
      expect(JSON.stringify(outcome)).not.toContain('CANARY-SECRET-VALUE');
    } finally { await run.dispose(); }
  }, 120_000);
});

/**
 * The pages of the two fixtures the typed executor retired (fillReplacedField, fillPressSuccessor), now as ordinary step code. The outcome of each
 * is recorded as it comes: a pass or a closed code. The pages are not tuned.
 */
describe('replaced fields as step code', () => {
  const swap = (trigger: 'focus' | 'input', next: 'same-name' | 'other-name' | 'none'): string => page(`<main><form action="/result"><input type="search" name="q" aria-label="Find items" id="legacy"></form></main>
<script>
const swap = () => {
  const old = document.getElementById('legacy'); if (!old) return;
  const value = old.value; old.remove();
  if ('${next}' === 'none') return;
  const successor = document.createElement('input'); successor.type = 'search'; successor.name = 'q'; successor.setAttribute('role', 'combobox');
  successor.setAttribute('aria-label', '${next === 'same-name' ? 'Find items' : 'Something else'}'); successor.value = value;
  document.querySelector('form').append(successor); successor.focus();
};
document.getElementById('legacy').addEventListener('${trigger}', () => { setTimeout(swap, 0); }, { once: true });
</script>`);
  const results: Record<string, string | null> = {};
  let hosted: Site;
  beforeAll(async () => {
    hosted = await serve({
      '/focus-swap': swap('focus', 'same-name'), '/input-swap': swap('input', 'same-name'), '/other-name': swap('input', 'other-name'), '/gone': swap('input', 'none'),
      '/result': page('<h1>Result page</h1>'),
      '/swapping': page(`<main><form action="/result" method="get"><input type="search" name="q" aria-label="Find items" id="legacy"></form></main><script>document.addEventListener('input', (event) => {
  const old = event.target; if (old.id !== 'legacy') return;
  const next = document.createElement('input'); next.type = 'search'; next.name = 'q'; next.setAttribute('aria-label', 'Find items'); next.setAttribute('role', 'combobox'); next.value = old.value;
  setTimeout(() => { old.replaceWith(next); next.focus(); }, 50);
});</script>`),
    });
  });
  afterAll(async () => { await hosted.close(); });

  const FILL = "await page.getByRole('searchbox', { name: 'Find items' }).or(page.getByRole('combobox', { name: 'Find items' })).fill('Brendan Eich');";
  it.each(['/focus-swap', '/input-swap', '/other-name', '/gone'])('fill into %s ends passed or with a closed code', async path => {
    const run = await launch();
    try {
      await run.step(`await page.goto('${hosted.origin}${path}');`);
      const outcome = await run.step(FILL);
      results[path] = outcome.receipt.closedCode;
      expect([null, 'TARGET_DRIFT', 'OUTCOME_UNKNOWN', 'TIMEOUT']).toContain(outcome.receipt.closedCode);
      expect(JSON.stringify(outcome)).not.toMatch(/Timeout|locator\./u);
    } finally { await run.dispose(); }
  }, 120_000);

  it('a fill followed by Enter on a field the page replaces ends passed or with a closed code', async () => {
    const run = await launch();
    try {
      await run.step(`await page.goto('${hosted.origin}/swapping');`);
      const outcome = await run.step("await page.getByRole('searchbox', { name: 'Find items' }).fill('Guido van Rossum'); await page.waitForTimeout(300); await page.getByRole('combobox', { name: 'Find items' }).press('Enter'); await page.waitForURL(/result/u);");
      expect([null, 'TARGET_DRIFT', 'OUTCOME_UNKNOWN', 'TIMEOUT']).toContain(outcome.receipt.closedCode);
      results['/swapping'] = outcome.receipt.closedCode;
    } finally { await run.dispose(); }
  }, 120_000);
});

/**
 * SC008-FIX-19 (RCA A1): the step succeeds, and the navigation it started commits while the automatic observation after it is running. Each shape
 * is run five times on the real observation session; the observation under the 12 s window must describe the NEW document every time.
 */
describe('a step that navigates after it returns', () => {
  const REPEATS = 5;
  const shapes: Readonly<Record<string, string>> = {
    'page-level Enter': "await page.getByRole('searchbox', { name: 'Search' }).focus(); await page.keyboard.press('Enter');",
    'deferred selectOption': "await page.getByLabel('Version').selectOption('b');",
  };
  it.each(Object.entries(shapes))('observes the new document after %s in every repeat', async (shape, code) => {
    let observed = 0;
    const failures: string[] = [];
    for (let i = 0; i < REPEATS; i++) {
      const run = await launch(); // a failed observation ends a session, so every repeat has its own
      try {
        await run.step(`await page.goto('${site.origin}/nav-start');`);
        await run.session.observe();
        const stepped = await run.step(code);
        expect(stepped.receipt.closedCode).toBeNull();
        try {
          const { observation } = await run.session.observe(undefined, true, undefined, 12_000);
          if (observation.outline.includes('Article')) observed++; else failures.push('OLD_DOCUMENT');
        } catch (error) { failures.push(error instanceof Error ? error.message : 'UNKNOWN'); }
      } finally { await run.dispose(); }
    }
    console.log(`FIX19 navigate ${shape}: ${String(observed)} of ${String(REPEATS)} ${failures.join(',')}`);
    expect(failures).toEqual([]);
    expect(observed).toBe(REPEATS);
  }, 120_000);
});

/**
 * SC008-FIX-25: frozen step code passes at learning because of the model gap and fails model-free when the previous step's page script navigates
 * a tick after the call returned. The wait lives in performStep (afterBlock), so learning and replay share it. The control run takes the wait
 * away (the step API without settleNavigation, which is exactly the code before the fix) to prove the fixture reproduces the race.
 */
describe('a step whose page navigates 150 ms after it returns (FIX-25)', () => {
  const select = "await page.getByLabel('Version').selectOption('b');";
  const type = "await page.getByLabel('Query').pressSequentially('asyncio');";
  // The heading exists only on the page the select leads to; the typed text must be in that page's field.
  const check = "await expect(page.getByRole('heading', { name: 'Docs next' })).toBeVisible(); await expect(page.getByLabel('Query')).toHaveValue('asyncio', { timeout: 2000 });";
  async function sequence(withWait: boolean, remainingMs: number): Promise<{ codes: (string | null)[]; ms: number[] }> {
    const run = await launch();
    try {
      const host = withWait ? run.handle.stepApi : { ...run.handle.stepApi, settleNavigation: undefined } as unknown as NonNullable<typeof run.handle.stepApi>;
      if (!host) throw new Error('HANDLE');
      const codes: (string | null)[] = [], ms: number[] = [];
      let n = 0;
      for (const code of [`await page.goto('${site.origin}/late-nav');`, select, type, check]) {
        const started = Date.now();
        const outcome = await performStep(host, run.session, { coordinate: coordinate(`late-${String(n++)}`), operation: operation(code), inputs: {}, vars: {}, secretIds: [], control: openControl({ remainingMs }), tally: newTally(), allowedDomains: TEST_DOMAINS });
        ms.push(Date.now() - started);
        codes.push(outcome.receipt.closedCode);
      }
      return { codes, ms };
    } finally { await run.dispose(); }
  }

  it('control: without the wait the typed text is lost to the late navigation', async () => {
    const { codes, ms } = await sequence(false, 20_000);
    console.log(`FIX25 control (no wait): ${codes.join(',')} step ms ${ms.join('/')}`);
    expect(codes.slice(0, 3)).toEqual([null, null, null]);
    expect(codes[3]).toBe('ASSERTION_FAILED');
  }, 120_000);

  it.each([['replay control (20 s left)', 20_000], ['learning control (8 s action budget)', 8_000]])('with the wait the next step types into the new document and the check passes: %s', async (_name, remainingMs) => {
    for (let i = 0; i < 3; i++) {
      const { codes, ms } = await sequence(true, remainingMs);
      console.log(`FIX25 ${_name} repeat ${String(i)}: ${codes.join(',')} step ms ${ms.join('/')}`);
      expect(codes).toEqual([null, null, null, null]);
    }
  }, 120_000);

  it('a step with no navigation waits no longer than the 300 ms start window', async () => {
    const run = await launch();
    try {
      const host = run.handle.stepApi;
      if (!host) throw new Error('HANDLE');
      const bare = { ...host, settleNavigation: undefined } as unknown as typeof host;
      await run.step(`await page.goto('${site.origin}/late-nav');`);
      const best = async (api: typeof host): Promise<number> => {
        const times: number[] = [];
        for (let i = 0; i < 5; i++) {
          const started = Date.now();
          const outcome = await performStep(api, run.session, { coordinate: coordinate(`bare-${String(i)}`), operation: operation("await page.locator('#mutate').click();"), inputs: {}, vars: {}, secretIds: [], control: openControl({ remainingMs: 20_000 }), tally: newTally(), allowedDomains: TEST_DOMAINS });
          expect(outcome.receipt).toMatchObject({ closedCode: null, fenceCrossed: true });
          times.push(Date.now() - started);
        }
        return Math.min(...times);
      };
      const without = await best(bare), withWait = await best(host);
      console.log(`FIX25 no-navigation step: without wait ${String(without)} ms, with wait ${String(withWait)} ms, added ${String(withWait - without)} ms`);
      expect(withWait - without).toBeLessThanOrEqual(350);
      // A pure check adds nothing: it crossed no fence and made no effect.
      const checkStarted = Date.now();
      await performStep(host, run.session, { coordinate: coordinate('check'), operation: operation("await expect(page.locator('h1')).toBeVisible();"), inputs: {}, vars: {}, secretIds: [], control: openControl({ remainingMs: 20_000 }), tally: newTally(), allowedDomains: TEST_DOMAINS });
      expect(Date.now() - checkStarted).toBeLessThan(250);
    } finally { await run.dispose(); }
  }, 120_000);
});

/**
 * SC008-FIX-40 (AC-1 to AC-3, AC-6 shape): in replay mode (failOnHttpError) a click that lands on a 403 document fails the step, whatever the
 * sub-resources of the starting page did; a redirect to a 200 and a page with failing sub-resources and sub-frame pass; a step that only reads on
 * the error page passes. Without the flag (guided learning) the 403 does not fail.
 */
describe('a step that lands on an HTTP error page (FIX-40)', () => {
  const link = (name: string): string => `await page.getByRole('link', { name: '${name}' }).click();`;
  async function from(code: string, failOnHttpError: boolean): Promise<{ closedCode: string | null; afterRead: string | null }> {
    const run = await launch();
    try {
      await run.step(`await page.goto('${site.origin}/err-start');`, { failOnHttpError });
      const outcome = await run.step(code, { failOnHttpError });
      const read = await run.step("await page.locator('h1').innerText();", { failOnHttpError });
      return { closedCode: outcome.receipt.closedCode, afterRead: read.receipt.closedCode };
    } finally { await run.dispose(); }
  }
  it('the 403 document fails the click; the 404 image of the starting page does not matter; a read on the error page afterwards passes', async () => {
    expect(await from(link('browse blocked'), true)).toEqual({ closedCode: 'NAVIGATION_HTTP_ERROR', afterRead: null });
  }, 60_000);
  it('a redirect that ends in a 200 document passes', async () => {
    expect((await from(link('browse redirected'), true)).closedCode).toBeNull();
  }, 60_000);
  it('a document whose images and iframe answer 404 passes', async () => {
    expect((await from(link('browse broken parts'), true)).closedCode).toBeNull();
  }, 60_000);
  it('the starting page itself (a 404 image, no navigation) passes an action that does not navigate', async () => {
    expect((await from("await page.getByRole('heading', { name: 'Releases' }).click();", true)).closedCode).toBeNull();
  }, 60_000);
  it('without the flag the 403 document does not fail the step', async () => {
    expect((await from(link('browse blocked'), false)).closedCode).toBeNull();
  }, 60_000);
});

