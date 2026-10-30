import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser } from 'playwright';

import type { ResolvedTarget } from '../../../src/guided/types.js';
import { guardDist, launchChromium } from './harness.js';
import { codeOf, factOf, html, invoke, open, prepare, rejection, serve, TestControl, type Opened, type Operation, type Served } from './cutover-support.js';

/**
 * ADR-SC-007 WI-4, execution side (AC2, AC3, AC5, AC10, AC11): the production observation session over a real Chromium
 * page. Learn is prepareTarget + invoke ('learn' profile, the element bound at prepare); replay is resolveTarget + invoke
 * ('replay' profile, the frozen locator through the public API). Both go through the one executor.
 */

guardDist();

const literal = { kind: 'authoredLiteral', sourceInputId: 'input' } as const;
const FILL: Operation = { kind: 'fill', value: literal };
const SELECT: Operation = { kind: 'selectOption', value: literal };
const CLICK: Operation = { kind: 'click' };

const OPERATIONS_PAGE = html(`<main aria-label="Operations">
  <a href="/landed">Follow link</a>
  <label>Query <input id="q" onkeydown="if(event.key==='Enter'){document.body.dataset.entered='yes';event.preventDefault()}"></label>
  <label>Plan <select id="plan"><option value="a">Alpha</option><option value="b">Beta</option><option value="g">Gamma</option></select></label>
  <label>Opt in <input id="opt" type="checkbox"></label>
  <label><input id="radio" type="radio" name="size"> Small</label>
  <button type="button" id="hover" onmouseover="document.body.dataset.hovered='yes'">Hover me</button>
</main>`);

describe('WI-4 execution on real Chromium', () => {
  let browser: Browser;
  let served: Served;
  const opened: Opened[] = [];
  const page = async (path: string, config: Parameters<typeof open>[3] = {}): Promise<Opened> => {
    const created = await open(browser, served, path, config);
    opened.push(created);
    return created;
  };
  const slow = (delayMs: number) => (_request: unknown, response: { writeHead(status: number, headers: Record<string, string>): void; end(body: string): void }): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(html('<main aria-label="Operations"><h1>Arrived</h1></main>'));
        resolve();
      }, delayMs);
    });

  beforeAll(async () => {
    browser = await launchChromium();
    served = await serve({
      '/ops': OPERATIONS_PAGE,
      '/landed': html('<main aria-label="Operations"><h1>Landed</h1></main>'),
      '/slow-link-4': html('<main aria-label="Operations"><a href="/slow4">Slow link</a></main>'),
      '/slow4': slow(4_000),
      '/slow-link-12': html('<main aria-label="Operations"><a href="/slow12">Slow link</a></main>'),
      '/slow12': slow(12_000),
      '/g1': html('<main aria-label="Operations"><label>Version <select id="v"><option>3.12</option><option selected>3.13</option></select></label></main>'),
      '/variants': html('<main aria-label="Operations"><label>Language <select id="lang"><option>Choose</option><option>Python 3.12</option><option>Ruby 3.3</option></select></label></main>'),
      '/tamper': html('<main aria-label="Operations"><label>Plan <select id="plan"><option>Alpha</option><option>Beta</option></select></label></main>', `<script>
        for (const [proto, name] of [[HTMLOptionElement.prototype, 'label'], [HTMLOptionElement.prototype, 'text'], [HTMLOptionElement.prototype, 'value'], [Node.prototype, 'textContent'], [HTMLElement.prototype, 'innerText']]) {
          Object.defineProperty(proto, name, { configurable: true, get() { return 'Alpha'; }, set() {} });
        }
      </script>`),
      '/disabled-option': html('<main aria-label="Operations"><label>Plan <select id="plan"><option>Alpha</option><option disabled>Beta</option><option>Gamma</option></select></label></main>'),
      '/replace': html('<main aria-label="Operations"><label>Query <input data-testid="q" id="q"></label></main>'),
      '/covered': html('<main aria-label="Operations"><button type="button" id="b" onclick="document.body.dataset.clicked=\'yes\'">Pay now</button></main><div style="position:fixed;inset:0;background:rgba(0,0,0,.1)"></div>'),
      '/twins': html('<main aria-label="Operations"><button type="button">Buy</button></main>'),
    });
  });
  afterAll(async () => {
    for (const created of opened.splice(0)) await created.close();
    await browser.close();
    await served.close();
  });

  it('learn executes every operation through prepareTarget and invoke', async () => {
    const created = await page('/ops');
    const exported = await created.session.observe(undefined, false);
    const run = async (role: string, name: string, operation: Operation, value: string | null = null, authored: string | null = null): Promise<void> => {
      const prepared = await prepare(created, role, name, operation, authored, exported);
      await invoke(created, prepared, operation, { value });
    };
    await run('textbox', 'Query', FILL, 'typed-by-learn');
    expect(await created.page.locator('#q').inputValue()).toBe('typed-by-learn');
    await run('textbox', 'Query', { kind: 'press', key: 'Enter' });
    expect(await created.page.evaluate(() => document.body.dataset.entered)).toBe('yes');
    await run('combobox', 'Plan', SELECT, 'Beta', 'Beta');
    expect(await created.page.locator('#plan').inputValue()).toBe('b');
    await run('combobox', 'Plan', SELECT, 'g', 'g');
    expect(await created.page.locator('#plan').inputValue()).toBe('g');
    await run('checkbox', 'Opt in', { kind: 'check' });
    expect(await created.page.locator('#opt').isChecked()).toBe(true);
    await run('checkbox', 'Opt in', { kind: 'uncheck' });
    expect(await created.page.locator('#opt').isChecked()).toBe(false);
    await run('radio', 'Small', { kind: 'check' });
    expect(await created.page.locator('#radio').isChecked()).toBe(true);
    await run('button', 'Hover me', { kind: 'hover' });
    expect(await created.page.evaluate(() => document.body.dataset.hovered)).toBe('yes');
    await run('link', 'Follow link', CLICK);
    await created.page.waitForURL('**/landed');
    expect(created.page.url()).toMatch(/\/landed$/u);
  }, 60_000);

  it('G1: Select 3.99 is refused before any fence', async () => {
    const created = await page('/g1');
    const control = new TestControl();
    const exported = await created.session.observe(undefined, false);
    const [ref] = factOf(exported, 'combobox', 'Version');
    const refused = created.session.prepareTarget({ ref, documentId: exported.observation.documentId, generation: exported.observation.generation, origin: exported.observation.origin, operation: SELECT, authoredLiteral: '3.99' });
    expect(await codeOf(refused)).toBe('OPTION_NOT_PRESENT');
    expect(control.fenced).toBe(0);
    expect(await created.page.locator('#v').inputValue()).toBe('3.13');
  });

  it('G1: the selected option passes', async () => {
    const created = await page('/g1');
    const prepared = await prepare(created, 'combobox', 'Version', SELECT, '3.13');
    await invoke(created, prepared, SELECT, { value: '3.13' });
    expect(await created.page.locator('#v').inputValue()).toBe('3.13');
    const other = await prepare(created, 'combobox', 'Version', SELECT, '3.12');
    await invoke(created, other, SELECT, { value: '3.12' });
    expect(await created.page.locator('#v').inputValue()).toBe('3.12');
  });

  it('a link with a slow response is a success at learn', async () => {
    const created = await page('/slow-link-4');
    const prepared = await prepare(created, 'link', 'Slow link', CLICK);
    const control = new TestControl();
    const started = Date.now();
    await invoke(created, prepared, CLICK, { control });
    const elapsed = Date.now() - started;
    expect(control.fenced).toBe(1);
    expect(elapsed).toBeGreaterThanOrEqual(3_500);
    expect(elapsed).toBeLessThan(8_000);
    expect(created.page.url()).toMatch(/\/slow4$/u);
  }, 30_000);

  it('a link with a slow response is a success at replay', async () => {
    const created = await page('/slow-link-12');
    const prepared = await prepare(created, 'link', 'Slow link', CLICK);
    const control = new TestControl();
    const started = Date.now();
    await invoke(created, prepared, CLICK, { control, profile: 'replay', bind: false });
    const elapsed = Date.now() - started;
    expect(control.fenced).toBe(1);
    expect(elapsed).toBeGreaterThanOrEqual(11_500);
    expect(elapsed).toBeLessThan(30_000);
    expect(created.page.url()).toMatch(/\/slow12$/u);
  }, 60_000);

  it('tampered option getters do not steer the choice', async () => {
    const created = await page('/tamper');
    const prepared = await prepare(created, 'combobox', 'Plan', SELECT, 'Beta');
    await invoke(created, prepared, SELECT, { value: 'Beta' });
    // The page redefined every getter to answer "Alpha"; the real second option is the one selected.
    expect(await created.page.locator('#plan').evaluate((select: HTMLSelectElement) => select.selectedIndex)).toBe(1);
  });

  it('a disabled option is refused before the fence', async () => {
    const created = await page('/disabled-option');
    const prepared = await prepare(created, 'combobox', 'Plan', SELECT, 'Beta');
    const control = new TestControl();
    expect(await codeOf(invoke(created, prepared, SELECT, { value: 'Beta', control }))).toBe('TARGET_CHANGED');
    expect(control.fenced).toBe(0);
    expect(await created.page.locator('#plan').evaluate((select: HTMLSelectElement) => select.selectedIndex)).toBe(0);
  });

  it('select variants: case, whitespace and NFKC literals select the option', async () => {
    const created = await page('/variants');
    const exported = await created.session.observe(undefined, false);
    const variants = ['python 3.12', '  PYTHON   3.12  ', 'Ｐｙｔｈｏｎ 3.12', 'Python 3.12'];
    for (const variant of variants) {
      await created.page.locator('#lang').selectOption({ index: 0 });
      const prepared = await prepare(created, 'combobox', 'Language', SELECT, variant, exported);
      await invoke(created, prepared, SELECT, { value: variant });
      expect(await created.page.locator('#lang').evaluate((select: HTMLSelectElement) => select.selectedOptions[0]?.text), `learn with ${JSON.stringify(variant)}`).toBe('Python 3.12');
      // Replay: the same frozen target and the same variant literal select the option again.
      await created.page.locator('#lang').selectOption({ index: 0 });
      const resolution = await created.session.resolveTarget({ resolved: prepared.resolved, origin: created.origin, operation: SELECT, readRuleId: null });
      expect(resolution.kind).toBe('READY');
      await invoke(created, prepared, SELECT, { value: variant, profile: 'replay', bind: false });
      expect(await created.page.locator('#lang').evaluate((select: HTMLSelectElement) => select.selectedOptions[0]?.text), `replay with ${JSON.stringify(variant)}`).toBe('Python 3.12');
    }
    // An absent literal ends at prepare, a variant of nothing.
    const [ref] = factOf(exported, 'combobox', 'Language');
    expect(await codeOf(created.session.prepareTarget({ ref, documentId: exported.observation.documentId, generation: exported.observation.generation, origin: exported.observation.origin, operation: SELECT, authoredLiteral: 'Perl 5' }))).toBe('OPTION_NOT_PRESENT');
  });

  it('a field replaced after prepare ends TARGET_CHANGED and the replacement stays untouched', async () => {
    const created = await page('/replace');
    const prepared = await prepare(created, 'textbox', 'Query', FILL, null);
    await created.page.evaluate(() => {
      const field = document.getElementById('q') as HTMLInputElement;
      field.replaceWith(field.cloneNode());
    });
    const control = new TestControl();
    expect(await codeOf(invoke(created, prepared, FILL, { value: 'NEVER-WRITTEN', control }))).toBe('TARGET_CHANGED');
    expect(control.fenced).toBe(0);
    expect(await created.page.locator('#q').inputValue()).toBe('');
  });

  describe('drift: the frozen locator through the public API', () => {
    const resolve = (created: Opened, resolved: ResolvedTarget, operation: Operation = CLICK) => created.session.resolveTarget({ resolved, origin: created.origin, operation, readRuleId: null });

    it('drift: zero matches', async () => {
      const created = await page('/twins');
      const prepared = await prepare(created, 'button', 'Buy', CLICK);
      expect((await resolve(created, prepared.resolved)).kind).toBe('READY');
      await created.page.evaluate(() => document.querySelector('button')?.remove());
      expect((await resolve(created, prepared.resolved)).kind).toBe('ABSENT');
    });

    it('drift: two identical buttons', async () => {
      const created = await page('/twins');
      const prepared = await prepare(created, 'button', 'Buy', CLICK);
      await created.page.evaluate(() => {
        const twin = document.createElement('button');
        twin.type = 'button';
        twin.textContent = 'Buy';
        document.querySelector('main')?.append(twin);
      });
      expect(await resolve(created, prepared.resolved)).toEqual({ kind: 'REFUSED', code: 'TARGET_DRIFT' });
      const control = new TestControl();
      expect(await rejection(invoke(created, prepared, CLICK, { control, profile: 'replay', bind: false }))).not.toBeNull();
      expect(control.fenced).toBe(0);
    });

    it('drift tiers: attribute, filterHas, nth and scoped nameless role', async () => {
      const created = await page('/twins');
      const body = `<main aria-label="Operations">
        <input name="q" aria-label="Query">
        <div id="card"><h2>Orders</h2><a href="#x" id="card-link">Open</a></div>
        <ul><li><button type="button">Remove</button></li><li><button type="button">Remove</button></li></ul>
        <section aria-label="Panel"><button type="button" id="inner">Run</button></section>
      </main>`;
      await created.page.setContent(html(body));
      const cases: [string, ResolvedTarget, () => Promise<void>][] = [
        ['attribute', { locator: [{ by: 'attr', tag: 'input', attrs: [{ name: 'name', value: 'q' }] }], tier: 'attribute', identity: { role: 'textbox', name: 'Query' } },
          async () => { await created.page.locator('input[name="q"]').evaluate((el) => { el.setAttribute('aria-label', 'Other name'); }); }],
        ['filterHas', { locator: [{ by: 'tag', tag: 'div' }, { by: 'filterHas', has: [{ by: 'role', role: 'heading', name: 'Orders', exact: true }] }, { by: 'role', role: 'link' }], tier: 'filterHas', identity: { role: 'link', name: 'Open' } },
          async () => { await created.page.locator('#card-link').evaluate((el) => { el.textContent = 'Close'; }); }],
        ['nth', { locator: [{ by: 'role', role: 'button' }, { by: 'nth', index: 1 }], tier: 'nth', identity: { role: 'button', name: 'Remove' } },
          async () => { await created.page.locator('li:nth-child(2) button').evaluate((el) => { el.textContent = 'Delete'; el.setAttribute('aria-label', 'Delete'); }); }],
        ['scoped nameless role', { locator: [{ by: 'scope', role: 'region', name: 'Panel', exact: true }, { by: 'role', role: 'button' }], tier: 'scoped', identity: { role: 'button', name: 'Run' } },
          async () => { await created.page.locator('#inner').evaluate((el) => { el.textContent = 'Stop'; }); }],
      ];
      for (const [label, resolved, mutate] of cases) {
        expect((await resolve(created, resolved, CLICK)).kind, `${label}: before the page changes`).toBe('READY');
        await mutate();
        const after = await resolve(created, resolved, CLICK);
        expect(after, `${label}: the locator still matches exactly one element but its role or name moved`).toEqual({ kind: 'REFUSED', code: 'TARGET_DRIFT' });
      }
    });
  });

  it('an always-covered target ends TARGET_CHANGED before the fence within the action budget', async () => {
    const created = await page('/covered');
    const prepared = await prepare(created, 'button', 'Pay now', CLICK);
    const control = new TestControl();
    const started = Date.now();
    expect(await codeOf(invoke(created, prepared, CLICK, { control }))).toBe('TARGET_CHANGED');
    expect(Date.now() - started).toBeLessThan(9_000);
    expect(control.fenced).toBe(0);
    expect(await created.page.evaluate(() => document.body.dataset.clicked)).toBeUndefined();
  }, 30_000);
  for (const kind of ['click', 'hover', 'check', 'uncheck'] as const) {
    for (const scenario of [
      'refuses captured clone B when prepared A is restored before final recheck',
      'acts once on prepared A and never on B',
      'never retargets a clone swapped at the invocation fence',
      'allows original A after transient B only when H V and prepared identity agree',
    ]) {
      it(`native ${kind} ${scenario}`, async () => {
        const created = await page('/twins');
        const toggle = kind === 'check' || kind === 'uncheck';
        await created.page.setContent(html(toggle
          ? `<label>Race <input data-testid="race" type="checkbox" ${kind === 'uncheck' ? 'checked' : ''}></label>`
          : '<button data-testid="race" type="button">Race</button>'));
        await created.page.mouse.move(0, 0);
        // These are independent fixture-owned physical witnesses, never production selection input.
        await created.page.evaluate((action) => {
          const a = document.querySelector('[data-testid="race"]');
          if (!(a instanceof HTMLElement)) throw new Error('missing fixture A');
          const b = a.cloneNode(true) as HTMLElement;
          const state = { a, b, effectsA: 0, effectsB: 0 };
          Object.assign(window, { bindingRaceFixture: state });
          const event = action === 'hover' ? 'mouseover' : 'click';
          {
            a.addEventListener(event, () => { state.effectsA++; });
            b.addEventListener(event, () => { state.effectsB++; });
          }
        }, kind);
        const a = await created.page.locator('[data-testid="race"]').elementHandle();
        const b = (await created.page.evaluateHandle(() => (window as unknown as { bindingRaceFixture: { b: HTMLElement } }).bindingRaceFixture.b)).asElement();
        const operation = { kind };
        const prepared = await prepare(created, toggle ? 'checkbox' : 'button', 'Race', operation);
        const locator = created.page.locator('[data-testid="race"]');
        const prototype = Object.getPrototypeOf(locator) as { elementHandle: typeof locator.elementHandle; page: typeof locator.page };
        const acquire = prototype.elementHandle;
        let captures = 0;
        prototype.elementHandle = async function (options) {
          if (this.page() !== created.page) return acquire.call(this, options);
          captures++;
          if (captures !== 1) return acquire.call(this, options);
          const captured = await acquire.call(this, options);
          // Trial actionability repositions the cursor. Park it before controlled DOM swaps
          // so layout-generated hover is distinguished from the executor native dispatch.
          await created.page.mouse.move(0, 0);
          if (scenario.startsWith('refuses captured') || scenario.startsWith('allows original')) {
            await created.page.evaluate(() => {
              const f = (window as unknown as { bindingRaceFixture: { a: HTMLElement; b: HTMLElement } }).bindingRaceFixture;
              f.a.replaceWith(f.b);
            });
            // The candidate clone is acquired by the SAME real public locator while B is current.
            const candidate = scenario.startsWith('refuses captured') ? await acquire.call(this, options) : captured;
            await created.page.evaluate(() => {
              const f = (window as unknown as { bindingRaceFixture: { a: HTMLElement; b: HTMLElement } }).bindingRaceFixture;
              f.b.replaceWith(f.a);
            });
            if (scenario.startsWith('refuses captured')) await captured.dispose();
            return candidate;
          }
          return captured;
        };
        const control = new TestControl(scenario.startsWith('never retargets') ? async () => {
          await created.page.evaluate(() => {
            const f = (window as unknown as { bindingRaceFixture: { a: HTMLElement; b: HTMLElement } }).bindingRaceFixture;
            f.a.replaceWith(f.b);
          });
        } : () => undefined);
        try {
          const outcome = invoke(created, prepared, operation, { control });
          if (scenario.startsWith('refuses captured')) {
            expect(await codeOf(outcome)).toBe('TARGET_CHANGED'); expect(control.fenced).toBe(0);
          } else if (scenario.startsWith('never retargets')) {
            expect(await codeOf(outcome)).toBe('UNKNOWN_OUTCOME'); expect(control.fenced).toBe(1);
          } else { await outcome; expect(control.fenced).toBe(1); }
          expect(captures).toBe(2);
          const counters = await created.page.evaluate(() => {
            const f = (window as unknown as { bindingRaceFixture: { effectsA: number; effectsB: number } }).bindingRaceFixture;
            return { a: f.effectsA, b: f.effectsB };
          });
          expect(counters.b).toBe(0);
          if (scenario.startsWith('refuses captured') || scenario.startsWith('never retargets')) expect(counters.a).toBe(0);
          else if (toggle) { expect(await a.isChecked()).toBe(kind === 'check'); expect(counters.a).toBe(1); }
          else expect(counters.a).toBe(1);
          if (scenario.startsWith('never retargets') && toggle) expect(await b.isChecked()).toBe(kind === 'uncheck');
        } finally { prototype.elementHandle = acquire; await a.dispose(); await b.dispose(); }
      });
    }
  }

  it('hover disabled target remains supported with one post-fence effect', async () => {
    const created = await page('/twins');
    await created.page.setContent(html('<button data-testid="disabled" disabled onmouseover="document.body.dataset.hovered=String(Number(document.body.dataset.hovered||0)+1)">Disabled hover</button>'));
    await created.page.mouse.move(0, 0);
    const prepared = await prepare(created, 'button', 'Disabled hover', { kind: 'hover' });
    const control = new TestControl(async () => { expect(await created.page.locator('body').getAttribute('data-hovered')).toBeNull(); });
    await invoke(created, prepared, { kind: 'hover' }, { control });
    expect(control.fenced).toBe(1);
    expect(await created.page.locator('body').getAttribute('data-hovered')).toBe('1');
  });
  it('hover covered target ends UNKNOWN_OUTCOME after one fence without retry', async () => {
    const created = await page('/covered');
    const prepared = await prepare(created, 'button', 'Pay now', { kind: 'hover' });
    const control = new TestControl();
    const error: unknown = await invoke(created, prepared, { kind: 'hover' }, { control }).catch((error: unknown) => error);
    expect(error).toMatchObject({ code: 'UNKNOWN_OUTCOME', message: 'UNKNOWN_OUTCOME' });
    expect(control.fenced).toBe(1); expect(await created.page.locator('body').getAttribute('data-clicked')).toBeNull();
    expect(JSON.stringify(error)).not.toContain('Pay now'); expect(String((error as Error).stack)).not.toContain('Pay now');
  });

});

import { inspectCapturedElement } from '../../../src/run/browser.js';
import * as engine from '../../../src/run/playwrightEngine.js';
import { timed } from '../../../src/run/targetOptions.js';

function bridgeRig() {
  const client = { send: vi.fn().mockResolvedValue({ node: { backendNodeId: 17, attributes: ['CANARY'] } }) };
  const context = { delegate: { _client: client } };
  const frame = { existingContext: vi.fn(() => context) };
  const serverPage = {};
  const serverHandle = { __elementhandle: true, _disposed: false, _objectId: 'private-object', _context: context, _frame: frame, _page: serverPage };
  const map = new Map<unknown, unknown>();
  const connection = { toImpl: vi.fn((value: unknown) => map.get(value)) };
  const apiFrame = {};
  const page = { _connection: connection, mainFrame: () => apiFrame };
  const handle = { _connection: connection, click: vi.fn(() => Promise.resolve()), hover: vi.fn(() => Promise.resolve()), check: vi.fn(() => Promise.resolve()), uncheck: vi.fn(() => Promise.resolve()), dispose: vi.fn(() => Promise.resolve()) };
  map.set(page, serverPage); map.set(apiFrame, frame); map.set(handle, serverHandle);
  return { page, handle, serverHandle, frame, context, client, connection };
}
afterEach(() => { vi.restoreAllMocks(); });
const closed = async (work: Promise<unknown>): Promise<void> => {
  const error = await work.catch((e: unknown) => e);
  expect(error).toMatchObject({ code: 'TARGET_CHANGED', message: 'TARGET_CHANGED' });
  expect(JSON.stringify(error)).not.toContain('CANARY');
  expect(String((error as Error).stack)).not.toContain('CANARY');
  expect((error as Error).cause).toBeUndefined();
};

describe('the bounded pinned captured-handle bridge', () => {
  it('uses DOM.describeNode on the captured handle owning client with exactly its objectId', async () => {
    const r = bridgeRig();
    expect(await inspectCapturedElement(r.page, r.handle)).toBe(17);
    expect(r.client.send).toHaveBeenCalledExactlyOnceWith('DOM.describeNode', { objectId: 'private-object' });
    expect(r.frame.existingContext).toHaveBeenCalledTimes(2);
    expect(r.handle.click).not.toHaveBeenCalled();
  });
  it('rejects equal backend IDs from another page client or frame', async () => {
    for (const field of ['_page', '_frame'] as const) {
      const r = bridgeRig(); r.serverHandle[field] = {} as never;
      await closed(inspectCapturedElement(r.page, r.handle));
      expect(r.client.send).not.toHaveBeenCalled();
    }
    const r = bridgeRig(); Object.assign(r.handle, { _connection: bridgeRig().connection });
    await closed(inspectCapturedElement(r.page, r.handle)); expect(r.client.send).not.toHaveBeenCalled();
  });
  it('rejects stale main context and disposed handle before and after describe', async () => {
    for (const after of [false, true]) for (const kind of ['context', 'disposed']) {
      const r = bridgeRig();
      const change = (): void => { if (kind === 'context') r.frame.existingContext.mockReturnValue({ delegate: { _client: bridgeRig().client } }); else r.serverHandle._disposed = true; };
      if (after) r.client.send.mockImplementation(() => { change(); return Promise.resolve({ node: { backendNodeId: 17 } }); }); else change();
      await closed(inspectCapturedElement(r.page, r.handle));
      expect(r.client.send).toHaveBeenCalledTimes(after ? 1 : 0);
    }
  });
  it('refuses missing mapping shape pin malformed ID and protocol errors without fallback or leak', async () => {
    for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '17', null]) {
      const r = bridgeRig(); r.client.send.mockResolvedValue({ node: { backendNodeId: id } });
      await closed(inspectCapturedElement(r.page, r.handle));
    }
    const missing = bridgeRig(); Object.assign(missing.connection, { toImpl: undefined });
    await closed(inspectCapturedElement(missing.page, missing.handle)); expect(missing.client.send).not.toHaveBeenCalled();
    const failed = bridgeRig(); failed.client.send.mockRejectedValue(new Error('CANARY raw protocol object attributes'));
    await closed(inspectCapturedElement(failed.page, failed.handle)); expect(failed.client.send).toHaveBeenCalledTimes(1);
    const pin = bridgeRig(); vi.spyOn(engine, 'loadInjectedSource').mockImplementation(() => { throw new Error('CANARY ENGINE_PIN_MISMATCH'); });
    await closed(inspectCapturedElement(pin.page, pin.handle)); expect(pin.connection.toImpl).not.toHaveBeenCalled();
  });
  it('hung readonly identity cannot finish a late invocation', async () => {
    const r = bridgeRig(); let finish: ((value: unknown) => void) | undefined;
    r.client.send.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await expect(timed(inspectCapturedElement(r.page, r.handle), 5)).rejects.toMatchObject({ name: 'TimeoutError' });
    finish?.({ node: { backendNodeId: 17 } }); await Promise.resolve();
    expect(r.handle.click).not.toHaveBeenCalled(); expect(r.handle.hover).not.toHaveBeenCalled();
    expect(r.handle.check).not.toHaveBeenCalled(); expect(r.handle.uncheck).not.toHaveBeenCalled();
  });
});
