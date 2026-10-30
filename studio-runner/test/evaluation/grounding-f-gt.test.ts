/* eslint-disable -- dynamic imports of untyped SPK-07 .mjs modules */
/**
 * SPK-07 workstream F: ground-truth chains, VOID handling and GT-driven operations (fake page, no browser).
 */
import { describe, expect, it } from 'vitest';

const load = async (rel: string): Promise<any> => import(new URL(rel, import.meta.url).href);
const gt = await load('../../evaluation/grounding/lib/gt.mjs');

/** A page/locator double that records the Playwright API calls of a chain. */
function fakePage() {
  const calls: string[] = [];
  const make = (path: string): any => new Proxy({}, {
    get: (_t, method: string) => {
      if (method === 'then') return undefined;
      return (...args: unknown[]) => { calls.push(`${path}.${method}(${JSON.stringify(args, (_k, v) => (v instanceof RegExp ? `/${v.source}/${v.flags}` : v && v.__locator ? `<${v.__locator}>` : v))})`); return make(`${path}.${method}`); };
    },
  });
  const page: any = make('page');
  return { page, calls };
}

describe('applyChain', () => {
  it('applies the whitelisted page API in order, reviving regex and nested locators', () => {
    const { page, calls } = fakePage();
    gt.applyChain(page, [{ m: 'getByRole', a: ['button', { name: 'Menu', exact: true }] }, { m: 'filter', a: [{ hasText: { $regex: 'Me', flags: 'i' } }] }, { m: 'nth', a: [1] }]);
    expect(calls).toEqual(['page.getByRole(["button",{"name":"Menu","exact":true}])', 'page.getByRole.filter([{"hasText":"/Me/i"}])', 'page.getByRole.filter.nth([1])']);
  });
  it('refuses unknown methods, empty chains and a chain that does not start at the page API', () => {
    const { page } = fakePage();
    expect(() => gt.applyChain(page, [{ m: 'evaluate', a: ['1'] }])).toThrow(/GT_BAD_METHOD/);
    expect(() => gt.applyChain(page, [{ m: 'first' }])).toThrow(/GT_BAD_METHOD/);
    expect(() => gt.applyChain(page, [])).toThrow(/GT_CHAIN_EMPTY/);
    expect(() => gt.applyChain(page, [{ m: 'getByText', a: ['x'] }, { m: 'click' }])).toThrow(/GT_BAD_METHOD/);
  });
});

describe('resolveGt VOID handling', () => {
  const { page } = fakePage();
  const chain = { chain: [{ m: 'getByText', a: ['x'] }] };
  const opts = (ids: number[] | Error) => ({ settleMs: 0, ids: async () => { if (ids instanceof Error) throw ids; return ids; } });
  it('resolves exactly one element', async () => {
    const result = await gt.resolveGt(page, null, chain, opts([42]));
    expect(result).toMatchObject({ void: false, ids: [42], count: 1 });
  });
  it('VOIDs on zero and on more than one', async () => {
    expect(await gt.resolveGt(page, null, chain, opts([]))).toMatchObject({ void: true, reason: 'GT_ABSENT', count: 0 });
    expect(await gt.resolveGt(page, null, chain, opts([1, 2]))).toMatchObject({ void: true, reason: 'GT_AMBIGUOUS:2', count: 2 });
  });
  it('VOIDs on an invalid chain and on a resolution error', async () => {
    expect((await gt.resolveGt(page, null, { chain: [{ m: 'evaluate' }] }, opts([1]))).reason).toMatch(/^GT_CHAIN_INVALID/);
    expect((await gt.resolveGt(page, null, chain, opts(new Error('boom')))).reason).toMatch(/^GT_ERROR boom/);
  });
  it('treats a null GT (negative task) as resolved with no ids', async () => {
    expect(await gt.resolveGt(page, null, null, opts([]))).toMatchObject({ void: false, ids: [], negative: true });
  });
  it('waits for a late element before declaring it absent', async () => {
    let calls = 0;
    const late = { settleMs: 2000, pollMs: 10, ids: async () => (++calls < 3 ? [] : [7]) };
    expect(await gt.resolveGt(page, null, chain, late)).toMatchObject({ void: false, ids: [7] });
  });
});

describe('literals and operations', () => {
  it('extracts the typed value', () => {
    expect(gt.valueFor({ kind: 'fill' }, 'Type "alice" in the "Username" field')).toBe('alice');
    expect(gt.valueFor({ kind: 'fill' }, 'In the "Search" box enter "playwright"')).toBe('playwright');
    expect(gt.valueFor({ kind: 'fill', value: 'v' }, 'Type "x"')).toBe('v');
    expect(gt.valueFor({ kind: 'press', key: 'Enter' }, 'Press Enter')).toBe('Enter');
    expect(gt.valueFor({ kind: 'click' }, 'Click the Menu button')).toBeNull();
  });
  it('performs click/fill with the GT locator and leaves read/assert untouched', async () => {
    const log: string[] = [];
    const locator = { click: async () => log.push('click'), fill: async (v: string) => log.push(`fill:${v}`) };
    const page = { waitForLoadState: async () => undefined, waitForTimeout: async () => undefined };
    await gt.performOp(page, locator, { kind: 'click' }, 'Click "Menu"', { settleMs: 0 });
    await gt.performOp(page, locator, { kind: 'fill' }, 'Type "bob" in the "Name" field', { settleMs: 0 });
    await gt.performOp(page, locator, { kind: 'read' }, 'Read the "Total"', { settleMs: 0 });
    await gt.performOp(page, locator, { kind: 'assert', predicate: 'visible' }, 'Check "Total" is visible', { settleMs: 0 });
    expect(log).toEqual(['click', 'fill:bob']);
    await expect(gt.performOp(page, locator, { kind: 'fill' }, 'Type something', { settleMs: 0 })).rejects.toThrow(/GT_FILL_NO_VALUE/);
  });
  it('setup VOIDs the load when a setup GT is missing, but skips optional ops', async () => {
    const page = { getByText: () => ({}) , waitForLoadState: async () => undefined, waitForTimeout: async () => undefined };
    const setup = [{ op: 'click', gt: { chain: [{ m: 'getByText', a: ['Reject'] }] } }];
    const voided = await gt.applySetup(page, null, setup, { settleMs: 0, ids: async () => [] });
    expect(voided).toMatchObject({ void: true });
    expect(voided.reason).toMatch(/^SETUP_GT_ABSENT/);
    const optional = await gt.applySetup(page, null, [{ ...setup[0], optional: true }], { settleMs: 0, ids: async () => [] });
    expect(optional).toEqual({ void: false });
  });
});

describe('url and frozen locator shapes', () => {
  it('maps fixture URLs to the corpus host and leaves real URLs', () => {
    const fixtureHost = { fixtureOrigin: (ns: string) => `http://localhost:1/ns/${ns}` };
    expect(gt.resolveTaskUrl('fixture://c01/home', { fixtureHost, tag: 'Run_1' })).toBe('http://localhost:1/ns/c01.run-1/home');
    expect(gt.resolveTaskUrl('https://www.gov.uk/', { fixtureHost, tag: 'x' })).toBe('https://www.gov.uk/');
  });
  it('never addresses a fixture by IP literal (the backend rejects it)', () => {
    const ipHost = { fixtureOrigin: (ns: string) => `http://127.0.0.1:1/ns/${ns}` };
    expect(() => gt.resolveTaskUrl('fixture://c01/home', { fixtureHost: ipHost, tag: 'x' })).toThrow(/FIXTURE_ORIGIN_NOT_LOCALHOST/);
  });
  it('converts hint, selector and chain locators; refuses unknown shapes', () => {
    const { page, calls } = fakePage();
    gt.locatorFromFrozen(page, { kind: 'role', role: 'button', name: 'Go' });
    gt.locatorFromFrozen(page, { selector: 'internal:text="x"s' });
    gt.locatorFromFrozen(page, { chain: [{ m: 'getByLabel', a: ['Email'] }] });
    expect(calls).toHaveLength(3);
    expect(() => gt.locatorFromFrozen(page, { kind: 'xpath' })).toThrow(/LOCATOR_SHAPE/);
    expect(() => gt.locatorFromFrozen(page, null)).toThrow(/LOCATOR_SHAPE/);
  });
  it('QA-D4: replays an S3/S4 typed locator through the public API, and prefers a carried internal selector', () => {
    const { page, calls } = fakePage();
    const typed = [{ by: 'scope', role: 'form', name: 'Login', exact: true }, { by: 'role', role: 'textbox', name: 'Name', exact: false }, { by: 'nth', index: 1 }];
    gt.locatorFromFrozen(page, typed);
    expect(calls).toEqual(['page.getByRole(["form",{"name":"Login","exact":true}])', 'page.getByRole.getByRole(["textbox",{"name":"Name","exact":false}])', 'page.getByRole.getByRole.nth([1])']);
    const viaSelector = fakePage();
    gt.locatorFromFrozen(viaSelector.page, typed, 'internal:role=form[name="Login"s] >> nth=1');
    expect(viaSelector.calls).toEqual(['page.locator(["internal:role=form[name=\\"Login\\"s] >> nth=1"])']);
    const filter = fakePage();
    gt.locatorFromFrozen(filter.page, [{ by: 'tag', tag: 'li' }, { by: 'filterHas', has: [{ by: 'text', value: 'Hi', exact: true }] }, { by: 'attr', tag: 'input', attrs: [{ name: 'name', value: 'q' }] }]);
    expect((filter.calls as string[]).map(c => c.split('(')[0] as string).filter((c: string) => !c.endsWith("toJSON"))).toEqual(['page.locator', 'page.getByText', 'page.locator.filter', 'page.locator.filter.locator']);
    expect(() => gt.locatorFromFrozen(page, [{ by: 'xpath' }])).toThrow(/LOCATOR_SHAPE/);
  });
  it('QA-D6: typed nth is positional, and exact:false typed steps are non-exact', () => {
    expect(gt.locatorFlags([{ by: 'filterHas', has: [] }, { by: 'nth', index: 2 }]).positional).toBe(true);
    expect(gt.locatorFlags([{ by: 'role', role: 'button', name: 'Go', exact: false }])).toEqual({ positional: false, nonExact: true });
    expect(gt.locatorFlags([{ by: 'role', role: 'button', name: 'Go', exact: true }])).toEqual({ positional: false, nonExact: false });
  });
  it('D-2: accepts both regex encodings, {"regex","flags"} (corpus) and {"$regex","flags"}', () => {
    const { page, calls } = fakePage();
    gt.applyChain(page, [{ m: 'getByRole', a: ['heading', { name: { regex: '^Title', flags: 'i' } }] }]);
    gt.applyChain(page, [{ m: 'getByRole', a: ['heading', { name: { $regex: '^Title', flags: 'i' } }] }]);
    expect(calls[0]).toBe('page.getByRole(["heading",{"name":"/^Title/i"}])');
    expect(calls[1]).toBe(calls[0]);
    gt.applyChain(page, [{ m: 'getByRole', a: ['link', { name: 'x' }] }, { m: 'filter', a: [{ hasText: { regex: 'a|b' } }] }]);
    expect(calls[3]).toBe('page.getByRole.filter([{"hasText":"/a|b/"}])');
  });
});

describe('D-3: click equivalence', () => {
  it('walks via CDP in an isolated world and returns the page-side verdict (read-only)', async () => {
    const sent: any[] = [];
    const cdp = { send: async (method: string, params: any) => {
      sent.push(method);
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'f' } } };
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 9 };
      if (method === 'DOM.resolveNode') return { object: { objectId: `o${params.backendNodeId}` } };
      if (method === 'Runtime.callFunctionOn') return { result: { value: { equivalent: params.objectId === 'o88' && params.arguments[0].objectId === 'o87', reason: 'DESCENDANT' } } };
      throw new Error(method);
    } };
    expect(await gt.clickEquivalent(cdp, 88, 87)).toMatchObject({ equivalent: true });
    expect(await gt.clickEquivalent(cdp, 87, 87)).toMatchObject({ equivalent: false, reason: 'SAME' });
    expect(sent.every(method => !/^DOM\.(set|remove|insert|copy)/.test(method) && method !== 'Runtime.evaluate')).toBe(true);
    expect(gt.CLICK_LIKE.has('click') && gt.CLICK_LIKE.has('check') && !gt.CLICK_LIKE.has('fill') && !gt.CLICK_LIKE.has('read')).toBe(true);
  });
});

describe('D-9: chain context reuse (valueFromStep)', () => {
  const locatorOf = (text: string, filled: string[]) => ({ innerText: async () => `  ${text}\n`, fill: async (value: string) => { filled.push(value); } });
  const page = { waitForLoadState: async () => undefined, waitForTimeout: async () => undefined };

  it('types the text the read step copied, not a quoted label from the step text', async () => {
    const filled: string[] = [];
    const load: any = { page };
    await gt.performChainStep(load, { text: 'Copy the first story title', operation: { kind: 'read' } }, 0, { locator: locatorOf('Show HN: A thing', filled) });
    await gt.performChainStep(load, { text: 'Type the copied title in the box next to "Search:"', operation: { kind: 'fill', valueFromStep: 0 } }, 1, { locator: locatorOf('', filled) }, { settleMs: 0 });
    expect(filled).toEqual(['Show HN: A thing']);
  });

  it('refuses a valueFromStep fill when nothing was copied, and keeps plain fills on the quoted literal', async () => {
    const filled: string[] = [];
    await expect(gt.performChainStep({ page }, { text: 'Type the copied value', operation: { kind: 'fill', valueFromStep: 0 } }, 1, { locator: locatorOf('', filled) })).rejects.toThrow('GT_FILL_NO_VALUE');
    await gt.performChainStep({ page }, { text: 'Type "pride" in the search box', operation: { kind: 'fill' } }, 0, { locator: locatorOf('', filled) }, { settleMs: 0 });
    expect(filled).toEqual(['pride']);
  });
});
