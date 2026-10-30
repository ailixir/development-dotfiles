import { describe, expect, it } from 'vitest';

import {
  ATTR_WHITELIST,
  MAX_STEPS,
  TAG_WHITELIST,
  TIERS,
  buildPublicLocator,
  locatorValues,
  synthesize,
  tierOf,
  tierRank,
  toEngineSelector,
  validateLocator,
  type Locator,
  type LocatorHandle,
  type LocatorRoot,
  type LocatorStep,
} from '../../src/run/locatorSynth.js';
import { perceive } from '../../src/run/perceive.js';
import type { ElementCandidateFacts } from '../../src/run/perceptionInPage.js';
import { PrivateInventory } from '../../src/run/privateInventory.js';
import { ScriptedCdp, elementFacts, n, page } from './perceptionFakes.js';

/**
 * ADR-SC-007 D4: the closed, exact-only locator grammar, the engine selector and the public-API locator it maps
 * to, and synthesis verified by the (here scripted) engine.
 */

const reason = (value: unknown): string => {
  try {
    validateLocator(value);
  } catch (error) {
    return (error as Error).message;
  }
  return 'ACCEPTED';
};
const role = (name?: string): LocatorStep => (name === undefined ? { by: 'role', role: 'button' } : { by: 'role', role: 'button', name, exact: true });

describe('validateLocator: what the closed grammar accepts', () => {
  it.each<[string, Locator]>([
    ['testId', [{ by: 'testId', value: 'save-button' }]],
    ['role with a name', [role('Save')]],
    ['role without a name', [{ by: 'role', role: 'textbox' }]],
    ['label', [{ by: 'label', value: 'Email', exact: true }]],
    ['placeholder', [{ by: 'placeholder', value: 'Search', exact: true }]],
    ['text', [{ by: 'text', value: 'Hello', exact: true }]],
    ['scope then role', [{ by: 'scope', role: 'form', name: 'Login', exact: true }, role('Go')]],
    ['tag, filterHas, role', [{ by: 'tag', tag: 'form' }, { by: 'filterHas', has: [role('Login')] }, { by: 'role', role: 'textbox' }]],
    ['attr with one and two attributes', [{ by: 'attr', tag: 'input', attrs: [{ name: 'name', value: 'q' }, { name: 'type', value: 'search' }] }]],
    ['nth last', [{ by: 'tag', tag: 'ul' }, { by: 'role', role: 'link' }, { by: 'nth', index: 14 }]],
    ['nth at the limits', [role('x'), { by: 'nth', index: 0 }]],
  ])('%s', (_label, locator) => {
    expect(reason(locator)).toBe('ACCEPTED');
  });

  it('accepts every whitelisted tag and attribute name', () => {
    for (const tag of TAG_WHITELIST) expect(reason([{ by: 'tag', tag }])).toBe('ACCEPTED');
    for (const name of ATTR_WHITELIST) expect(reason([{ by: 'attr', tag: 'input', attrs: [{ name, value: 'v' }] }])).toBe('ACCEPTED');
    expect(TIERS).toEqual(['testId', 'role', 'label', 'placeholder', 'text', 'scoped', 'filterHas', 'attribute', 'nth']);
  });
});

describe('validateLocator: everything outside the grammar is refused with a closed reason', () => {
  const steps = (count: number): LocatorStep[] => Array.from({ length: count }, () => ({ by: 'tag', tag: 'div' }) as LocatorStep);

  it.each<[string, unknown, string]>([
    ['a string', 'button', 'NOT_ARRAY'],
    ['an object', { by: 'role' }, 'NOT_ARRAY'],
    ['null', null, 'NOT_ARRAY'],
    ['an empty array', [], 'EMPTY'],
    ['a raw selector step', [{ by: 'selector', value: 'div' }], 'UNKNOWN_STEP'],
    ['a string step', ['div'], 'UNKNOWN_STEP'],
    ['a step without by', [{ value: 'x' }], 'UNKNOWN_STEP'],
    ['an array step', [[]], 'UNKNOWN_STEP'],
    ['an inherited property as step name: constructor', [{ by: 'constructor' }], 'UNKNOWN_STEP'],
    ['an inherited property as step name: __proto__', [{ by: '__proto__' }], 'UNKNOWN_STEP'],
    ['an inherited property as step name: toString', [{ by: 'toString' }], 'UNKNOWN_STEP'],
    ['an inherited property as step name: hasOwnProperty', [{ by: 'hasOwnProperty', value: 'x' }], 'UNKNOWN_STEP'],
    ['a step with an extra key', [{ by: 'testId', value: 'x', extra: 1 }], 'EXTRA_KEY'],
    ['a generated engine step', [{ by: 'role', role: 'button', name: 'x', exact: true, generated: true }], 'EXTRA_KEY'],
    ['exact:false on role', [{ by: 'role', role: 'button', name: 'x', exact: false }], 'EXACT_REQUIRED'],
    ['exact:false on label', [{ by: 'label', value: 'x', exact: false }], 'EXACT_REQUIRED'],
    ['exact:false on placeholder', [{ by: 'placeholder', value: 'x', exact: false }], 'EXACT_REQUIRED'],
    ['exact:false on text', [{ by: 'text', value: 'x', exact: false }], 'EXACT_REQUIRED'],
    ['exact:false on scope', [{ by: 'scope', role: 'form', name: 'x', exact: false }], 'EXACT_REQUIRED'],
    ['exact missing with a role name', [{ by: 'role', role: 'button', name: 'x' }], 'EXACT_REQUIRED'],
    ['exact missing on text', [{ by: 'text', value: 'x' }], 'EXACT_REQUIRED'],
    ['exact on a nameless role', [{ by: 'role', role: 'button', exact: true }], 'EXACT_NOT_ALLOWED'],
    ['a scope without a name', [{ by: 'scope', role: 'form' }], 'SCOPE_NEEDS_NAME'],
    ['the generic role', [{ by: 'role', role: 'generic' }], 'ROLE'],
    ['an upper-case role', [{ by: 'role', role: 'Button' }], 'ROLE'],
    ['a role with a quote', [{ by: 'role', role: 'button"' }], 'ROLE'],
    ['a tag outside the whitelist', [{ by: 'tag', tag: 'script' }], 'TAG'],
    ['an attribute outside the whitelist', [{ by: 'attr', tag: 'input', attrs: [{ name: 'data-id', value: 'x' }] }], 'ATTR_NOT_WHITELISTED'],
    ['a harness-style attribute', [{ by: 'attr', tag: 'input', attrs: [{ name: 'data-bench-id', value: 'x' }] }], 'ATTR_NOT_WHITELISTED'],
    ['an attribute with an extra key', [{ by: 'attr', tag: 'input', attrs: [{ name: 'id', value: 'x', exact: true }] }], 'ATTR_KEYS'],
    ['an attr on a tag outside the whitelist', [{ by: 'attr', tag: 'object', attrs: [{ name: 'id', value: 'x' }] }], 'ATTR_TAG'],
    ['three attributes', [{ by: 'attr', tag: 'input', attrs: [{ name: 'id', value: 'a' }, { name: 'name', value: 'b' }, { name: 'type', value: 'c' }] }], 'ATTR_LIST'],
    ['no attributes', [{ by: 'attr', tag: 'input', attrs: [] }], 'ATTR_LIST'],
    ['an attribute that is not an object', [{ by: 'attr', tag: 'input', attrs: ['id'] }], 'ATTR_NOT_WHITELISTED'],
    ['a first nth', [{ by: 'nth', index: 0 }], 'NTH'],
    ['a non-final nth', [role('x'), { by: 'nth', index: 1 }, role('y')], 'NTH'],
    ['a negative nth', [role('x'), { by: 'nth', index: -1 }], 'NTH'],
    ['a fractional nth', [role('x'), { by: 'nth', index: 1.5 }], 'NTH'],
    ['nth 501', [role('x'), { by: 'nth', index: 501 }], 'NTH'],
    ['a filterHas that starts the locator', [{ by: 'filterHas', has: [role('x')] }], 'FILTER_FIRST'],
    ['a nested filterHas', [{ by: 'tag', tag: 'div' }, { by: 'filterHas', has: [{ by: 'tag', tag: 'p' }, { by: 'filterHas', has: [role('x')] }] }], 'NESTING'],
    ['an empty filterHas', [{ by: 'tag', tag: 'div' }, { by: 'filterHas', has: [] }], 'EMPTY'],
    ['a filterHas that is not an array', [{ by: 'tag', tag: 'div' }, { by: 'filterHas', has: 'x' }], 'NOT_ARRAY'],
  ])('%s', (_label, value, expected) => {
    expect(reason(value)).toBe(`GRAMMAR_INVALID:${expected}`);
  });

  it('counts steps flattened, including the steps inside filterHas (the limit is 8)', () => {
    expect(MAX_STEPS).toBe(8);
    expect(reason(steps(8))).toBe('ACCEPTED');
    expect(reason(steps(9))).toBe('GRAMMAR_INVALID:TOO_MANY_STEPS');
    const withHas = (inner: number): Locator => [{ by: 'tag', tag: 'div' }, { by: 'filterHas', has: steps(inner) }];
    expect(reason(withHas(6))).toBe('ACCEPTED');
    expect(reason(withHas(7))).toBe('GRAMMAR_INVALID:TOO_MANY_STEPS');
    expect(reason([...steps(7), { by: 'filterHas', has: steps(1) }])).toBe('GRAMMAR_INVALID:TOO_MANY_STEPS');
  });

  describe('strings', () => {
    it('accepts 200 characters and refuses 201 in every string position', () => {
      expect(reason([{ by: 'testId', value: 'x'.repeat(200) }])).toBe('ACCEPTED');
      expect(reason([{ by: 'testId', value: 'x'.repeat(201) }])).toBe('GRAMMAR_INVALID:TESTID_VALUE');
      expect(reason([role('x'.repeat(200))])).toBe('ACCEPTED');
      expect(reason([role('x'.repeat(201))])).toBe('GRAMMAR_INVALID:ROLE_NAME');
      expect(reason([{ by: 'label', value: 'x'.repeat(201), exact: true }])).toBe('GRAMMAR_INVALID:TEXT_VALUE');
      expect(reason([{ by: 'attr', tag: 'input', attrs: [{ name: 'id', value: 'x'.repeat(201) }] }])).toBe('GRAMMAR_INVALID:ATTR_NOT_WHITELISTED');
    });

    it.each([
      ['empty', ''],
      ['a line feed', 'a\nb'],
      ['a NUL', 'a\u0000b'],
      ['a DEL', 'a\u007fb'],
      ['U+2028', 'a b'],
      ['U+2029', 'a b'],
      ['a lone high surrogate', 'a\ud800b'],
      ['a lone low surrogate', 'a\udc00b'],
      ['harness text data-bench', 'x data-bench-id'],
      ['harness text __spk07', 'x__SPK07'],
      ['harness text __pw', 'a__pw'],
    ])('refuses %s', (_label, value) => {
      expect(reason([{ by: 'text', value, exact: true }])).toBe('GRAMMAR_INVALID:TEXT_VALUE');
    });

    it.each([
      ['a quote', 'say "hi"'],
      ['a backslash', 'a\\b'],
      ['>>', 'a >> b'],
      ['a closing bracket', 'a]b'],
      ['a percent sign', '100%'],
      ['an emoji (a valid surrogate pair)', 'ok 😀'],
      ['a non-breaking space', 'New York'],
      ['non-Latin text', '東京'],
    ])('accepts %s', (_label, value) => {
      expect(reason([{ by: 'text', value, exact: true }])).toBe('ACCEPTED');
    });

    it('never echoes the offending value in the error', () => {
      const secret = 'SECRET_PAGE_VALUE\n';
      const message = reason([{ by: 'text', value: secret, exact: true }]);
      expect(message).toBe('GRAMMAR_INVALID:TEXT_VALUE');
      expect(message).not.toContain('SECRET');
    });
  });
});

describe('toEngineSelector', () => {
  it('maps each step to the string Playwright\'s own getBy methods build', () => {
    expect(toEngineSelector([{ by: 'testId', value: 'save' }])).toBe('internal:testid=[data-testid="save"s]');
    expect(toEngineSelector([{ by: 'testId', value: 'save' }], { testIdAttribute: 'data-qa' })).toBe('internal:testid=[data-qa="save"s]');
    expect(toEngineSelector([role('Save')])).toBe('internal:role=button[name="Save"s]');
    expect(toEngineSelector([{ by: 'role', role: 'textbox' }])).toBe('internal:role=textbox');
    expect(toEngineSelector([{ by: 'label', value: 'Email', exact: true }])).toBe('internal:label="Email"s');
    expect(toEngineSelector([{ by: 'placeholder', value: 'Find', exact: true }])).toBe('internal:attr=[placeholder="Find"s]');
    expect(toEngineSelector([{ by: 'text', value: 'Hi', exact: true }])).toBe('internal:text="Hi"s');
    expect(toEngineSelector([{ by: 'scope', role: 'form', name: 'Login', exact: true }, role('Go')])).toBe('internal:role=form[name="Login"s] >> internal:role=button[name="Go"s]');
    expect(toEngineSelector([{ by: 'attr', tag: 'input', attrs: [{ name: 'name', value: 'q' }, { name: 'type', value: 'search' }] }])).toBe('input[name="q"][type="search"]');
    expect(toEngineSelector([{ by: 'tag', tag: 'ul' }, { by: 'role', role: 'link' }, { by: 'nth', index: 14 }])).toBe('ul >> internal:role=link >> nth=14');
  });

  it('nests filterHas as a quoted selector', () => {
    const selector = toEngineSelector([{ by: 'tag', tag: 'form' }, { by: 'filterHas', has: [role('Login')] }, { by: 'role', role: 'textbox' }]);
    expect(selector).toBe('form >> internal:has="internal:role=button[name=\\"Login\\"s]" >> internal:role=textbox');
  });

  it('quotes adversarial values as JSON strings', () => {
    const value = 'a"b\\c >> d]e%f 😀  ';
    expect(toEngineSelector([{ by: 'text', value, exact: true }])).toBe(`internal:text=${JSON.stringify(value)}s`);
    expect(toEngineSelector([{ by: 'attr', tag: 'input', attrs: [{ name: 'title', value }] }])).toBe(`input[title=${JSON.stringify(value)}]`);
  });

  it('refuses an invalid locator instead of building a selector', () => {
    expect(() => toEngineSelector([{ by: 'role', role: 'button', name: 'x', exact: false }] as never)).toThrow('GRAMMAR_INVALID:EXACT_REQUIRED');
  });
});

describe('tiers and values', () => {
  it('ranks tiers from the most durable to the least', () => {
    expect(tierOf([{ by: 'testId', value: 'a' }])).toBe('testId');
    expect(tierOf([role('a')])).toBe('role');
    expect(tierOf([{ by: 'label', value: 'a', exact: true }])).toBe('label');
    expect(tierOf([{ by: 'placeholder', value: 'a', exact: true }])).toBe('placeholder');
    expect(tierOf([{ by: 'text', value: 'a', exact: true }])).toBe('text');
    expect(tierOf([{ by: 'scope', role: 'form', name: 'a', exact: true }, role('b')])).toBe('scoped');
    expect(tierOf([{ by: 'tag', tag: 'ul' }])).toBe('scoped');
    expect(tierOf([{ by: 'scope', role: 'form', name: 'a', exact: true }])).toBe('scoped');
    expect(tierOf([{ by: 'tag', tag: 'div' }, { by: 'filterHas', has: [role('a')] }, role('b')])).toBe('filterHas');
    expect(tierOf([{ by: 'attr', tag: 'input', attrs: [{ name: 'id', value: 'a' }] }])).toBe('attribute');
    expect(tierOf([role('a'), { by: 'nth', index: 1 }])).toBe('nth');
    expect(tierOf([{ by: 'attr', tag: 'input', attrs: [{ name: 'id', value: 'a' }] }, { by: 'nth', index: 1 }])).toBe('nth');
    expect(TIERS.map(tierRank)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(() => tierOf([])).toThrow('GRAMMAR_INVALID:EMPTY');
  });

  it('lists every string value, nested ones included', () => {
    expect(locatorValues([{ by: 'scope', role: 'form', name: 'F', exact: true }, { by: 'tag', tag: 'div' }, { by: 'filterHas', has: [role('H')] }, { by: 'attr', tag: 'input', attrs: [{ name: 'id', value: 'I' }] }, { by: 'testId', value: 'T' }, { by: 'label', value: 'L', exact: true }, { by: 'role', role: 'link' }, { by: 'nth', index: 1 }])).toEqual(['F', 'H', 'I', 'T', 'L']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The public-API locator.

/** Records every call as text, so the exact public API use can be asserted. */
function recorder(log: string[], prefix = ''): LocatorHandle {
  const call = (name: string, ...args: unknown[]): LocatorHandle => {
    const text = `${prefix}${prefix ? '.' : ''}${name}(${args.map((arg) => JSON.stringify(arg)).join(',')})`;
    log.push(text);
    return recorder(log, text);
  };
  return {
    getByTestId: (value) => call('getByTestId', value),
    getByRole: (r, o) => call('getByRole', ...(o === undefined ? [r] : [r, o])),
    getByLabel: (value, o) => call('getByLabel', value, o),
    getByPlaceholder: (value, o) => call('getByPlaceholder', value, o),
    getByText: (value, o) => call('getByText', value, o),
    locator: (css) => call('locator', css),
    filter: (o) => call('filter', { has: 'locator' in o ? 'handle' : 'handle' }),
    and: () => call('and', 'handle'),
    nth: (index) => call('nth', index),
  };
}

describe('buildPublicLocator', () => {
  const build = (locator: Locator): string => {
    const log: string[] = [];
    const root: LocatorRoot = recorder(log);
    buildPublicLocator(root, locator);
    return log.at(-1) ?? '';
  };

  it('uses getBy methods with exact:true, locator for css, filter and nth, and nothing else', () => {
    expect(build([{ by: 'testId', value: 'save' }])).toBe('getByTestId("save")');
    expect(build([role('Save')])).toBe('getByRole("button",{"name":"Save","exact":true})');
    expect(build([{ by: 'role', role: 'textbox' }])).toBe('getByRole("textbox")');
    expect(build([{ by: 'label', value: 'Email', exact: true }])).toBe('getByLabel("Email",{"exact":true})');
    expect(build([{ by: 'placeholder', value: 'Find', exact: true }])).toBe('getByPlaceholder("Find",{"exact":true})');
    expect(build([{ by: 'text', value: 'Hi', exact: true }])).toBe('getByText("Hi",{"exact":true})');
    expect(build([{ by: 'scope', role: 'form', name: 'Login', exact: true }, role('Go')])).toBe('getByRole("form",{"name":"Login","exact":true}).getByRole("button",{"name":"Go","exact":true})');
    expect(build([{ by: 'tag', tag: 'ul' }, { by: 'role', role: 'link' }, { by: 'nth', index: 14 }])).toBe('locator("ul").getByRole("link").nth(14)');
    expect(build([{ by: 'attr', tag: 'input', attrs: [{ name: 'name', value: 'q' }, { name: 'type', value: 'search' }] }])).toBe('locator("input[name=\\"q\\"][type=\\"search\\"]")');
  });

  it('builds the has-locator from the page root and applies it with filter', () => {
    const log: string[] = [];
    buildPublicLocator(recorder(log), [{ by: 'tag', tag: 'form' }, { by: 'filterHas', has: [role('Login')] }, { by: 'role', role: 'textbox' }]);
    expect(log).toEqual(['locator("form")', 'getByRole("button",{"name":"Login","exact":true})', 'locator("form").filter({"has":"handle"})', 'locator("form").filter({"has":"handle"}).getByRole("textbox")']);
  });

  it('passes adversarial values to the API verbatim, never through a selector string (except css attribute values, JSON-quoted)', () => {
    const value = 'a"b\\c >> d]e%f 😀  ';
    expect(build([{ by: 'text', value, exact: true }])).toBe(`getByText(${JSON.stringify(value)},{"exact":true})`);
    expect(build([role(value)])).toBe(`getByRole("button",{"name":${JSON.stringify(value)},"exact":true})`);
    expect(build([{ by: 'attr', tag: 'input', attrs: [{ name: 'title', value }] }])).toBe(`locator(${JSON.stringify(`input[title=${JSON.stringify(value)}]`)})`);
  });

  it('refuses an invalid locator before touching the page', () => {
    const log: string[] = [];
    expect(() => buildPublicLocator(recorder(log), [{ by: 'role', role: 'button', name: 'x' }] as never)).toThrow('GRAMMAR_INVALID:EXACT_REQUIRED');
    expect(log).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Synthesis.

const noFacts = (tag: string, extra: Partial<ElementCandidateFacts> = {}): ElementCandidateFacts => ({
  tag, id: null, name: null, type: null, ariaLabel: null, title: null, placeholder: null, testId: null, levels: [], generated: null, ...extra,
});

async function perceived(collected: ReturnType<typeof page>, script: Partial<ConstructorParameters<typeof ScriptedCdp>[0]> = {}, inventory = new PrivateInventory()): Promise<{ perception: Awaited<ReturnType<typeof perceive>>; cdp: ScriptedCdp; inventory: PrivateInventory }> {
  const cdp = new ScriptedCdp({ collected, ...script });
  const perception = await perceive({ cdp, inventory, resolveBackendIds: false });
  return { perception, cdp, inventory };
}
/** Engine answers keyed by selector: count and where the ref's element sits. */
const truth = (table: Record<string, { count: number; index: number }>): ((ref: string, selectors: string[]) => ({ count: number; index: number } | { error: true })[]) =>
  (_ref, selectors) => selectors.map((selector) => table[selector] ?? { count: 0, index: -1 });
const checks = (cdp: ScriptedCdp): { selectors: string[] }[] => cdp.calls.filter((call) => String(call.params?.functionDeclaration).includes('function checkSelectors')).map((call) => ({ selectors: (call.params?.arguments as { value: string[] }[])[1]?.value ?? [] }));

describe('synthesize', () => {
  const saveButton = page([n('document', {}, n('button', { name: 'Save', ref: 'e1' }))]);

  it('picks the role locator for a named button and reports the identity', async () => {
    const { perception, inventory } = await perceived(saveButton, { candidateFacts: () => noFacts('button'), check: truth({ 'internal:role=button[name="Save"s]': { count: 1, index: 0 } }) });
    const result = await synthesize({ perception, ref: 'e1', inventory });
    expect(result).toMatchObject({ ok: true, tier: 'role', locator: [{ by: 'role', role: 'button', name: 'Save', exact: true }], identity: { role: 'button', name: 'Save' } });
    expect(JSON.stringify(result)).not.toContain('internal:');
  });

  it('prefers a test id, then the role, then the label, by tier rank, among the locators that verify', async () => {
    const facts = noFacts('input', { testId: 'tid', ariaLabel: 'Aria' });
    const all = truth({
      'internal:testid=[data-testid="tid"s]': { count: 1, index: 0 },
      'internal:role=textbox[name="Email"s]': { count: 1, index: 0 },
      'internal:label="Email"s': { count: 1, index: 0 },
    });
    const field = page([n('document', {}, n('textbox', { name: 'Email', ref: 'e1' }))], { e1: elementFacts('input', { type: 'text', valueControl: true }) });
    const { perception, inventory, cdp } = await perceived(field, { candidateFacts: () => facts, check: all });
    const result = await synthesize({ perception, ref: 'e1', inventory });
    expect(result).toMatchObject({ ok: true, tier: 'testId' });
    const sent = checks(cdp)[0]?.selectors ?? [];
    expect(sent.slice(0, 3)).toEqual(['internal:testid=[data-testid="tid"s]', 'internal:role=textbox[name="Email"s]', 'internal:label="Email"s']);
    const noTestId = await synthesize({ perception: (await perceived(field, { candidateFacts: () => noFacts('input'), check: all })).perception, ref: 'e1', inventory });
    expect(noTestId).toMatchObject({ ok: true, tier: 'role' });
  });

  it('scopes a duplicate-named control by the named container it sits in', async () => {
    const dupes = page([n('document', {},
      n('listitem', { name: 'First', ref: 'e1' }, n('button', { name: 'Delete', ref: 'e2' })),
      n('listitem', { name: 'Second', ref: 'e3' }, n('button', { name: 'Delete', ref: 'e4' })))]);
    const table = truth({
      'internal:role=button[name="Delete"s]': { count: 2, index: 1 },
      'internal:role=listitem[name="Second"s] >> internal:role=button[name="Delete"s]': { count: 1, index: 0 },
    });
    const { perception, inventory } = await perceived(dupes, { candidateFacts: () => noFacts('button'), check: table });
    const result = await synthesize({ perception, ref: 'e4', inventory });
    expect(result).toMatchObject({ ok: true, tier: 'scoped', locator: [{ by: 'scope', role: 'listitem', name: 'Second', exact: true }, { by: 'role', role: 'button', name: 'Delete', exact: true }], identity: { role: 'button', name: 'Delete' } });
  });

  it('finds an icon-only control through its aria-label, and a table cell through a filterHas chain', async () => {
    const icon = page([n('document', {}, n('button', { ref: 'e1' }))]);
    const label = truth({ 'internal:label="Close dialog"s': { count: 1, index: 0 } });
    const one = await perceived(icon, { candidateFacts: () => noFacts('button', { ariaLabel: 'Close dialog' }), check: label });
    expect(await synthesize({ perception: one.perception, ref: 'e1', inventory: one.inventory })).toMatchObject({ ok: true, tier: 'label', locator: [{ by: 'label', value: 'Close dialog', exact: true }], identity: { role: 'button', name: null } });

    const cell = page([n('table', {}, n('row', {}, n('cell', { name: '(Unused)', ref: 'e1' }, '(Unused)'), n('link', { name: 'Edit 418', ref: 'e2' })))]);
    const has = truth({ 'tr >> internal:has="internal:role=link[name=\\"Edit 418\\"s]" >> internal:role=cell': { count: 1, index: 0 } });
    const two = await perceived(cell, { candidateFacts: (ref) => (ref === 'e1' ? noFacts('td', { levels: [{ tag: 'tr', has: ['e2'] }] }) : null), check: has });
    const result = await synthesize({ perception: two.perception, ref: 'e1', inventory: two.inventory });
    expect(result).toMatchObject({ ok: true, tier: 'filterHas', locator: [{ by: 'tag', tag: 'tr' }, { by: 'filterHas', has: [{ by: 'role', role: 'link', name: 'Edit 418', exact: true }] }, { by: 'role', role: 'cell' }] });
  });

  it('falls back to nth, the last resort, only when nothing else verifies', async () => {
    const dupes = page([n('document', {}, n('button', { name: 'Delete', ref: 'e1' }), n('button', { name: 'Delete', ref: 'e2' }))]);
    const table = truth({ 'internal:role=button[name="Delete"s]': { count: 2, index: 1 }, 'internal:role=button[name="Delete"s] >> nth=1': { count: 1, index: 0 } });
    const { perception, inventory, cdp } = await perceived(dupes, { candidateFacts: () => noFacts('button'), check: table });
    const result = await synthesize({ perception, ref: 'e2', inventory });
    expect(result).toMatchObject({ ok: true, tier: 'nth', locator: [{ by: 'role', role: 'button', name: 'Delete', exact: true }, { by: 'nth', index: 1 }] });
    expect(checks(cdp)).toHaveLength(2);
  });

  it('never executes the engine-generated selector: a generated-only match is a refusal, and its selector is not returned', async () => {
    const { perception, inventory } = await perceived(saveButton, { candidateFacts: () => noFacts('button', { generated: 'button.save-primary' }), check: truth({ 'button.save-primary': { count: 1, index: 0 } }) });
    const result = await synthesize({ perception, ref: 'e1', inventory });
    expect(result).toMatchObject({ ok: false, reason: 'LOCATOR_GENERATED_ONLY' });
    expect(JSON.stringify(result)).not.toContain('save-primary');
    const typed = await perceived(saveButton, { candidateFacts: () => noFacts('button', { generated: 'button.save-primary' }), check: truth({ 'button.save-primary': { count: 1, index: 0 }, 'internal:role=button[name="Save"s]': { count: 1, index: 0 } }) });
    expect(await synthesize({ perception: typed.perception, ref: 'e1', inventory: typed.inventory })).toMatchObject({ ok: true, tier: 'role' });
  });

  it('refuses with a closed reason when the ref is unknown, unresolved or has no verified locator', async () => {
    const { perception, inventory } = await perceived(saveButton, { candidateFacts: () => noFacts('button'), check: truth({}) });
    expect(await synthesize({ perception, ref: 'e99', inventory })).toEqual({ ok: false, reason: 'REF_NOT_IN_OUTLINE', tried: 0 });
    expect(await synthesize({ perception, ref: 'e1', inventory })).toMatchObject({ ok: false, reason: 'NO_VERIFIED_LOCATOR' });
    const gone = await perceived(saveButton, { candidateFacts: () => null });
    expect(await synthesize({ perception: gone.perception, ref: 'e1', inventory: gone.inventory })).toEqual({ ok: false, reason: 'REF_UNRESOLVED', tried: 0 });
  });

  it('drops a candidate that is not the element or matches several, and a candidate the engine cannot parse', async () => {
    const table = (_ref: string, selectors: string[]): ({ count: number; index: number } | { error: true })[] => selectors.map((_s, i) => (i === 0 ? { error: true as const } : { count: 1, index: 0 }));
    const { perception, inventory } = await perceived(saveButton, { candidateFacts: () => noFacts('button', { testId: 'tid' }), check: table });
    expect(await synthesize({ perception, ref: 'e1', inventory })).toMatchObject({ ok: true, tier: 'role' });
  });

  it('a stub has no identity name, and is reached through the named container around it', async () => {
    const inventory = new PrivateInventory();
    inventory.add('Hidden Person', true);
    const stub = page([n('document', {}, n('form', { name: 'Account', ref: 'e1' }, n('button', { name: 'Hidden Person', ref: 'e2' })))]);
    const table = truth({ "internal:role=form[name=\"Account\"s] >> internal:role=button": { count: 1, index: 0 } });
    const { perception } = await perceived(stub, { candidateFacts: () => noFacts('button'), check: table }, inventory);
    const result = await synthesize({ perception, ref: 'e2', inventory });
    expect(result).toMatchObject({ ok: true, tier: 'scoped', identity: { role: 'button', name: null } });
    const alone = await perceived(page([n('document', {}, n('button', { name: 'Hidden Person', ref: 'e2' }))]), { candidateFacts: () => noFacts('button') }, inventory);
    expect(await synthesize({ perception: alone.perception, ref: 'e2', inventory })).toMatchObject({ ok: false, reason: 'NO_VERIFIED_LOCATOR' });
  });

  describe('privacy of the candidates (raw values, joined values and the selector)', () => {
    const verifyAll = (_ref: string, selectors: string[]): { count: number; index: number }[] => selectors.map(() => ({ count: 1, index: 0 }));
    const sentSelectors = (cdp: ScriptedCdp): string => checks(cdp).flatMap((entry) => entry.selectors).join('\n');

    it('offers no candidate that contains a private value, however it is spelled', async () => {
      const inventory = new PrivateInventory();
      inventory.add('Jane Roe', true);
      const field = page([n('document', {}, n('textbox', { name: 'Profile', ref: 'e1' }))], { e1: elementFacts('input', { type: 'text', valueControl: true }) });
      const facts = noFacts('input', { testId: 'jane%20roe', id: 'JANE+ROE', ariaLabel: 'Jane Roe', placeholder: 'jane roe', title: 'Jane  Roe', name: 'q' });
      const { perception, cdp } = await perceived(field, { candidateFacts: () => facts, check: verifyAll }, inventory);
      await synthesize({ perception, ref: 'e1', inventory });
      const sent = sentSelectors(cdp);
      expect(sent).not.toMatch(/jane/iu);
      expect(sent).toContain('internal:role=textbox[name="Profile"s]');
    });

    it('also keeps out the private values the caller gave perceive() (they are not in the inventory)', async () => {
      const inventory = new PrivateInventory();
      const field = page([n('document', {}, n('textbox', { name: 'Profile', ref: 'e1' }))], { e1: elementFacts('input', { type: 'text', valueControl: true }) });
      const cdp = new ScriptedCdp({ collected: field, candidateFacts: () => noFacts('input', { ariaLabel: 'Caller Value 99', placeholder: 'caller value 99' }), check: verifyAll });
      const perception = await perceive({ cdp, inventory, privateValues: ['Caller Value 99'], resolveBackendIds: false });
      await synthesize({ perception, ref: 'e1', inventory });
      expect(sentSelectors(cdp)).not.toMatch(/caller/iu);
      expect(sentSelectors(cdp)).toContain('internal:role=textbox[name="Profile"s]');
    });

    it('tests raw values, so a quote or backslash in a value cannot hide it behind JSON escaping', async () => {
      const inventory = new PrivateInventory();
      inventory.add('say "hi" \\ there', true);
      const field = page([n('document', {}, n('textbox', { name: 'Field', ref: 'e1' }))], { e1: elementFacts('input', { type: 'text', valueControl: true }) });
      const { perception, cdp } = await perceived(field, { candidateFacts: () => noFacts('input', { ariaLabel: 'say "hi" \\ there' }), check: verifyAll }, inventory);
      await synthesize({ perception, ref: 'e1', inventory });
      expect(sentSelectors(cdp)).not.toContain('hi');
    });

    it('drops a candidate whose values only reveal the private value together (two attributes)', async () => {
      const inventory = new PrivateInventory();
      inventory.add('Zephyr Quartz', true);
      const field = page([n('document', {}, n('textbox', { name: 'Profile', ref: 'e1' }))], { e1: elementFacts('input', { type: 'text', valueControl: true }) });
      const { perception, cdp } = await perceived(field, { candidateFacts: () => noFacts('input', { id: 'Zephyr', name: 'Quartz' }), check: verifyAll }, inventory);
      await synthesize({ perception, ref: 'e1', inventory });
      const sent = sentSelectors(cdp);
      expect(sent).toContain('input[id="Zephyr"]');
      expect(sent).toContain('input[name="Quartz"]');
      expect(sent).not.toContain('input[id="Zephyr"][name="Quartz"]');
    });

    it('offers no locator built from the attributes of a node perception stubbed (a fragment may be in them) (F3)', async () => {
      const inventory = new PrivateInventory();
      inventory.add('Quillon Marsh', true);
      const split = page([n('document', {}, n('form', { name: 'Account', ref: 'e1' }, n('button', { name: 'Quillon', ref: 'e2' }, 'Marsh')))]);
      const facts = noFacts('button', { testId: 'tid-Quillon', id: 'Quillon', ariaLabel: 'Quillon', title: 'Quillon', name: 'q', type: 'button', placeholder: 'Quillon' });
      const { perception, cdp } = await perceived(split, { candidateFacts: () => facts, check: verifyAll }, inventory);
      expect(perception.outline.text).toContain('[e2] {value withheld}');
      const result = await synthesize({ perception, ref: 'e2', inventory });
      const sent = sentSelectors(cdp);
      expect(sent).not.toMatch(/quillon|marsh|tid-|button\[|placeholder|label=|testid/iu);
      expect(JSON.stringify(result)).not.toMatch(/quillon|marsh/iu);
      expect(result).toMatchObject({ ok: true, tier: 'scoped' });
    });

    it('still offers attribute locators for a node that was not touched (F3)', async () => {
      const inventory = new PrivateInventory();
      inventory.add('Quillon Marsh', true);
      const plain = page([n('document', {}, n('button', { name: 'Save', ref: 'e2' }))]);
      const { perception, cdp } = await perceived(plain, { candidateFacts: () => noFacts('button', { testId: 'save-tid', id: 'save' }), check: verifyAll }, inventory);
      await synthesize({ perception, ref: 'e2', inventory });
      expect(sentSelectors(cdp)).toContain('internal:testid=[data-testid="save-tid"s]');
      expect(sentSelectors(cdp)).toContain('button[id="save"]');
    });

    it('does not use the name of a container whose name was cleared (a row built from withheld content)', async () => {
      const inventory = new PrivateInventory();
      inventory.add('Zephyr Quartz Ninefold', true);
      const rows = page([n('document', {}, n('row', { name: 'Zephyr Quartz Ninefold edit', ref: 'e1' }, n('generic', {}, 'Zephyr'), n('generic', {}, 'Quartz Ninefold'), n('button', { name: 'Edit', ref: 'e2' })))]);
      const { perception, cdp } = await perceived(rows, { candidateFacts: () => noFacts('button'), check: verifyAll }, inventory);
      await synthesize({ perception, ref: 'e2', inventory });
      expect(sentSelectors(cdp)).not.toMatch(/Zephyr|Quartz|Ninefold/u);
    });

    it('errors carry only closed codes', async () => {
      const inventory = new PrivateInventory();
      const { perception } = await perceived(saveButton, { candidateFacts: () => noFacts('button') });
      inventory.dispose();
      await expect(synthesize({ perception, ref: 'e1', inventory })).rejects.toThrow(/^CONTEXT_LOST$/u);
    });
  });
});

describe('combined closed child scope grammar', () => {
  it('combined child grammar is closed and omission bytes stay unchanged', () => {
    const base = [{ by: 'tag', tag: 'section' }, { by: 'filterHas', has: [{ by: 'role', role: 'heading', name: 'About', exact: true }] }, { by: 'role', role: 'paragraph' }];
    validateLocator(base);
    expect(toEngineSelector(base)).toBe('section >> internal:has="internal:role=heading[name=\\"About\\"s]" >> internal:role=paragraph');
    const child = base.map(s => s.by === 'filterHas' ? { ...s, relation: 'child' } : s);
    validateLocator(child); expect(toEngineSelector(child)).toContain('css=:scope > * >> internal:and=');
    for (const patch of [{ relation: null }, { relation: 'descendant' }, { relation: 'child', extra: true }, { relation: 'child', has: [] }, { relation: 'child', has: [{ by: 'text', value: 'About', exact: true }] }, { relation: 'child', has: [{ by: 'role', role: 'heading' }] }, { relation: 'child', has: [...(base[1]?.has ?? []), ...(base[1]?.has ?? [])] }]) {
      expect(() => { validateLocator([base[0], { ...base[1], ...patch }, base[2]]); }).toThrow('GRAMMAR_INVALID');
    }
  });
});

it('combined local source anchors beat global native tails within fixed caps', async () => {
  const fillers = Array.from({ length: 610 }, (_, i) => n('heading', { ref: `e${String(i + 10)}`, name: `Other source ${String(i)}` }));
  const collected = page([...fillers, n('cell', { ref: 'e900', name: 'stable:' }), n('paragraph', { ref: 'e901' }, '6.20.1')], {
    e900: elementFacts('td'), e901: elementFacts('p', { nativeTextRoot: 'paragraph', readScope: { relation: 'SAME_ROW_LABEL', sourceRefs: ['e900'] } }),
  });
  const facts = noFacts('p', { nativeContext: true, levels: [{ tag: 'tr', has: ['e900'], children: ['e900'] }] });
  const child: Locator = [{ by: 'tag', tag: 'tr' }, { by: 'filterHas', relation: 'child', has: [{ by: 'role', role: 'cell', name: 'stable:', exact: true }] }, { by: 'role', role: 'paragraph' }];
  const prefix = child.slice(0, 2);
  const { perception, inventory, cdp } = await perceived(collected, { candidateFacts: () => facts, check: truth({ [toEngineSelector(child)]: { count: 1, index: 0 }, [toEngineSelector(prefix)]: { count: 1, index: -1 }, 'internal:text="6.20.1"s': { count: 1, index: 0 } }) });
  const result = await synthesize({ perception, inventory, ref: 'e901', operation: { kind: 'read' } });
  expect(result).toMatchObject({ ok: true, locator: child, identity: { role: 'paragraph', name: null } });
  const call = cdp.calls.find(c => String(c.params?.functionDeclaration).includes('function elementCandidateFacts'));
  const refs = (call?.params?.arguments as { value: unknown }[])[2]?.value as string[];
  expect(refs).toHaveLength(600); expect(refs[0]).toBe('e900');
  const effect = await synthesize({ perception, inventory, ref: 'e901', operation: { kind: 'hover' } });
  expect(effect.ok && effect.locator.some(s => s.by === 'filterHas' && s.relation === 'child')).toBe(false);
});
