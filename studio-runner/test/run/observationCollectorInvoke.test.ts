/**
 * STUDIO-OBS-012A — the collector's in-page writes and value assertions (`invoke` for `fill`,
 * `selectOption` and `assert`), against the same structural DOM stand-in `observation.test.ts`
 * uses. The unit tier stays browser-free (AC-25); real Chromium proves the DOM in the fixtures tier.
 *
 * What is asserted is the security-relevant behaviour of each write: it only happens on the exact
 * observed element, it refuses rather than guesses (ambiguous options, disabled options, a missing
 * value), and a focus handler that changes the field between focus and write stops the write.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installObservationCollector } from '../../src/run/observationCollector.js';
import { observationOptions } from '../../src/run/observationSanitizer.js';
import type { GuidedInvocation, ObservationConfig } from '../../src/run/observationTypes.js';

const ORIGIN = 'http://127.0.0.1:4173';
const config: ObservationConfig = {
  sessionId: 'session',
  scopeHash: 'a'.repeat(64),
  approvedOrigins: [ORIGIN],
  rules: [],
  knownSecrets: [],
  applicationPolicy: { policyRuleId: 'structural', allowStructuralDiscovery: true },
};

/**
 * The MutationObserver records the next `takeRecords()` delivers (STUDIO-OBS-009 AC-7 FM-01, ruling A9). The stub used to
 * return `[]` always, so no unit case could say what the collector does with a record. A test scripts records here, usually
 * from a focus handler (`FixtureInput.onFocus`), exactly where a page's own handler would mutate the DOM. Drained on read.
 */
const scripted: unknown[] = [];

/** A shared "document" whose activeElement the fixture's focus() moves. */
const focusRoot: { activeElement: unknown } = { activeElement: null };

class FixtureElement {
  readonly children: FixtureElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly events: string[] = [];
  childNodes: { length: number; item(index: number): { nodeType: number; nodeValue: string } } = { length: 0, item: () => ({ nodeType: 3, nodeValue: '' }) };
  shadowRoot = null;
  nodeType = 1;
  isConnected = true;
  parentElement: FixtureElement | null = null;
  previousElementSibling: FixtureElement | null = null;
  innerText = '';
  constructor(readonly tagName: string, name = '') {
    if (name) {
      this.childNodes = { length: 1, item: () => ({ nodeType: 3, nodeValue: name }) };
      this.innerText = name;
    }
  }
  get firstChild() { return this.childNodes.length ? { ...this.childNodes.item(0), nextSibling: null, firstChild: null } : null; }
  getRootNode() { return focusRoot; }
  matches() { return false; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }; }
  get lastElementChild() { return this.children.at(-1) ?? null; }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  append(child: FixtureElement) { child.parentElement = this; child.previousElementSibling = this.lastElementChild; this.children.push(child); }
  dispatchEvent(event: Event) { this.events.push(event.type); return true; }
}
class FixtureInput extends FixtureElement {
  value = '';
  type = 'text';
  checked = false;
  list = null;
  readOnly = false;
  disabled = false;
  /** Runs synchronously inside focus(), like a page's focus listener. */
  onFocus: (() => void) | null = null;
  focus() { focusRoot.activeElement = this; this.onFocus?.(); }
}
class FixtureTextarea extends FixtureInput {}
class FixtureSelect extends FixtureInput {
  multiple = false;
  size = 0;
  options: { value: string; disabled: boolean }[] = [];
  selectedOptions = { length: 0, item: () => null };
}
class FixtureLabel extends FixtureElement { control: FixtureInput | null = null; }

function install(root: FixtureElement, policy: ObservationConfig = config) {
  focusRoot.activeElement = null;
  scripted.length = 0;
  vi.stubGlobal('document', { documentElement: root, addEventListener: vi.fn(), removeEventListener: vi.fn(), title: 'Fixture' });
  vi.stubGlobal('location', { origin: ORIGIN, href: `${ORIGIN}/form`, assign: vi.fn() });
  vi.stubGlobal('getComputedStyle', () => ({ display: 'block', visibility: 'visible' }));
  vi.stubGlobal('MutationObserver', class { observe = vi.fn(); takeRecords() { return scripted.splice(0); } disconnect = vi.fn(); });
  vi.stubGlobal('Element', FixtureElement);
  vi.stubGlobal('HTMLElement', FixtureElement);
  vi.stubGlobal('ShadowRoot', class { readonly host = null; });
  vi.stubGlobal('HTMLInputElement', FixtureInput);
  vi.stubGlobal('HTMLTextAreaElement', FixtureTextarea);
  vi.stubGlobal('HTMLSelectElement', FixtureSelect);
  vi.stubGlobal('HTMLLabelElement', FixtureLabel);
  const collector = installObservationCollector(observationOptions(policy));
  const observation = collector.collect({ documentId: 'doc', generation: 1, observedAt: '2026-10-12T00:00:00.000Z' });
  const invocation = (name: string, operation: GuidedInvocation['operation'], resolvedValue: string | null): GuidedInvocation => {
    const node = observation.nodes.find((candidate) => candidate.name === name);
    const locator = node?.locatorHints[0];
    if (!node || !locator) throw new Error(`NODE ${name}: ${JSON.stringify(observation.nodes.map((n) => n.name))}`);
    return { target: { nodeId: node.nodeId, documentId: node.documentId, generation: node.generation, locator }, operation, resolvedValue, origin: ORIGIN, maxValueBytes: 4096 };
  };
  return { collector, observation, invocation };
}

afterEach(() => {
  vi.unstubAllGlobals();
  scripted.length = 0;
});

const literal = { kind: 'authoredLiteral', sourceInputId: 'input' } as const;

function formRoot() {
  const root = new FixtureElement('MAIN');
  root.attributes.set('aria-label', 'Form');
  const field = new FixtureInput('INPUT');
  field.attributes.set('aria-label', 'Reference');
  field.value = 'before';
  root.append(field);
  const select = new FixtureSelect('SELECT');
  select.attributes.set('aria-label', 'Region');
  select.value = 'eu';
  select.options = [{ value: 'eu', disabled: false }, { value: 'us', disabled: false }, { value: 'apac', disabled: true }, { value: 'dup', disabled: false }, { value: 'dup', disabled: false }];
  root.append(select);
  const status = new FixtureElement('BUTTON', 'Order 42 confirmed');
  root.append(status);
  return { root, field, select, status };
}

describe('fill', () => {
  it('writes the resolved value into exactly the observed field and fires input then change', () => {
    const { root, field } = formRoot();
    const { collector, invocation } = install(root);
    expect(collector.invoke(invocation('Reference', { kind: 'fill', value: literal }, 'after'))).toEqual({});
    expect(field.value).toBe('after');
    expect(field.events).toEqual(['input', 'change']);
    collector.dispose();
  });

  it('refuses when the focus handler retypes the field into a password, and writes nothing', () => {
    const { root, field } = formRoot();
    const { collector, invocation } = install(root);
    field.onFocus = () => { field.type = 'password'; };
    expect(() => collector.invoke(invocation('Reference', { kind: 'fill', value: literal }, 'private-value'))).toThrow('POST_FOCUS_CHANGED');
    expect(field.value).toBe('before');
    expect(field.events).toEqual([]);
    collector.dispose();
  });

  it('refuses when focus is stolen by another element during the focus handler', () => {
    const { root, field, status } = formRoot();
    const { collector, invocation } = install(root);
    field.onFocus = () => { focusRoot.activeElement = status; };
    expect(() => collector.invoke(invocation('Reference', { kind: 'fill', value: literal }, 'x'))).toThrow('POST_FOCUS_CHANGED');
    expect(field.value).toBe('before');
    collector.dispose();
  });

  it('refuses when the focus handler makes the field read-only', () => {
    const { root, field } = formRoot();
    const { collector, invocation } = install(root);
    field.onFocus = () => { field.readOnly = true; };
    expect(() => collector.invoke(invocation('Reference', { kind: 'fill', value: literal }, 'x'))).toThrow('POST_FOCUS_CHANGED');
    expect(field.value).toBe('before');
    collector.dispose();
  });

  it('refuses a fill with no resolved value instead of writing an empty string', () => {
    const { root, field } = formRoot();
    const { collector, invocation } = install(root);
    expect(() => collector.invoke(invocation('Reference', { kind: 'fill', value: literal }, null))).toThrow('POLICY_DENIED');
    expect(field.value).toBe('before');
    expect(field.events).toEqual([]);
    collector.dispose();
  });
});

describe('selectOption', () => {
  it('selects a single enabled matching option and fires input then change', () => {
    const { root, select } = formRoot();
    const { collector, invocation } = install(root);
    expect(collector.invoke(invocation('Region', { kind: 'selectOption', value: literal }, 'us'))).toEqual({});
    expect(select.value).toBe('us');
    expect(select.events).toEqual(['input', 'change']);
    collector.dispose();
  });

  it.each([
    ['a disabled option', 'apac'],
    ['an ambiguous option value', 'dup'],
    ['an option that does not exist', 'nowhere'],
  ])('refuses %s and leaves the selection unchanged', (_label, value) => {
    const { root, select } = formRoot();
    const { collector, invocation } = install(root);
    expect(() => collector.invoke(invocation('Region', { kind: 'selectOption', value: literal }, value))).toThrow('POLICY_DENIED');
    expect(select.value).toBe('eu');
    expect(select.events).toEqual([]);
    collector.dispose();
  });

  it('refuses a select that became multiple after observation', () => {
    const { root, select } = formRoot();
    const { collector, invocation } = install(root);
    const action = invocation('Region', { kind: 'selectOption', value: literal }, 'us');
    select.multiple = true;
    expect(() => collector.invoke(action)).toThrow();
    expect(select.value).toBe('eu');
    collector.dispose();
  });
});

describe('value assertions', () => {
  it('hasValue compares the live control value, not the observed one', () => {
    const { root, field } = formRoot();
    const { collector, invocation } = install(root);
    const assert = { kind: 'assert', predicate: 'hasValue', expected: literal } as const;
    expect(collector.invoke(invocation('Reference', assert, 'before'))).toEqual({ assertionPassed: true });
    expect(collector.invoke(invocation('Reference', assert, 'other'))).toEqual({ assertionPassed: false });
    expect(field.events).toEqual([]);
    collector.dispose();
  });

  it('containsText checks the rendered text of the target', () => {
    const { root } = formRoot();
    const { collector, invocation } = install(root);
    const assert = { kind: 'assert', predicate: 'containsText', expected: literal } as const;
    expect(collector.invoke(invocation('Order 42 confirmed', assert, '42 confirmed'))).toEqual({ assertionPassed: true });
    expect(collector.invoke(invocation('Order 42 confirmed', assert, 'cancelled'))).toEqual({ assertionPassed: false });
    collector.dispose();
  });

  // H6 / F4: Playwright 1.63 `normalizeWhiteSpace` on both sides, case-sensitive, substring only.
  it.each([
    ['fresh-1-x-\u00e9\u{1F600} ', '  fresh-1-x-\u00e9\u{1F600}  ', true],
    ['Order 42\nconfirmed', 'Order\t42  confirmed', true],
    ['Order 42', 'Order 42', true],
    ['Con\u00adfirmed', 'Confirmed', true],
    ['Order 42 confirmed', 'cancelled', false],
    ['Order 42 confirmed', 'order 42', false],
    ['Order42', 'Order 42', false],
    // PO R4 (2026-10-16): an expected value that is empty after normalization is not an assertion and never passes.
    ['Order 42 confirmed', '   ', false],
    ['Order 42 confirmed', '\u200b', false],
    ['Order 42 confirmed', ' \n\t\u00ad', false],
  ])('containsText compares whitespace-normalized rendered text with the whitespace-normalized expected value (F4): %j contains %j is %s', (innerText, expected, passed) => {
    const { root, status } = formRoot();
    const { collector, invocation } = install(root);
    status.innerText = innerText;
    const assert = { kind: 'assert', predicate: 'containsText', expected: literal } as const;
    expect(collector.invoke(invocation('Order 42 confirmed', assert, expected))).toEqual({ assertionPassed: passed });
    expect(status.events).toEqual([]);
    collector.dispose();
  });

  it('containsText never passes an expected value that is empty after whitespace normalization (PO R4)', () => {
    const { root, status } = formRoot();
    const { collector, invocation } = install(root);
    status.innerText = '';
    const assert = { kind: 'assert', predicate: 'containsText', expected: literal } as const;
    expect(collector.invoke(invocation('Order 42 confirmed', assert, '  '))).toEqual({ assertionPassed: false });
    expect(collector.invoke(invocation('Order 42 confirmed', assert, ''))).toEqual({ assertionPassed: false });
    expect(status.events).toEqual([]);
    collector.dispose();
  });

  it('a read of padded business text stays byte-exact; only containsText normalizes', () => {
    const { root } = formRoot();
    const padded = '  fresh-1-x-\u00e9\u{1F600}  ';
    const output = new FixtureElement('OUTPUT', padded);
    output.attributes.set('aria-label', 'Reference number');
    root.append(output);
    const grant = { policyRuleId: 'regional', origin: ORIGIN, region: { kind: 'role', role: 'main', name: 'Form', exact: true }, visibleText: { classification: 'permittedBusinessData' } } as const;
    const { collector, invocation } = install(root, { ...config, applicationPolicy: { policyRuleId: 'structural', allowStructuralDiscovery: true, readGrants: [grant] } });
    const read = { kind: 'read', bindingId: 'binding', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: 'regional' } } as const;
    expect(collector.invoke(invocation('Reference number', read, null))).toEqual({ value: padded });
    const assert = { kind: 'assert', predicate: 'containsText', expected: literal } as const;
    expect(collector.invoke(invocation('Reference number', assert, padded))).toEqual({ assertionPassed: true });
    collector.dispose();
  });

  it('a value assertion with no resolved value is refused, not passed', () => {
    const { root } = formRoot();
    const { collector, invocation } = install(root);
    expect(() => collector.invoke(invocation('Reference', { kind: 'assert', predicate: 'hasValue', expected: literal }, null))).toThrow('POLICY_DENIED');
    collector.dispose();
  });

  it('a hasValue assertion on a non-field is refused before invoke runs', () => {
    const { root } = formRoot();
    const { collector, invocation } = install(root);
    expect(() => collector.invoke(invocation('Order 42 confirmed', { kind: 'assert', predicate: 'hasValue', expected: literal }, 'x'))).toThrow('TARGET_CHANGED');
    collector.dispose();
  });

  it('navigate is never an in-page invocation', () => {
    const { root } = formRoot();
    const { collector, invocation } = install(root);
    expect(() => collector.invoke(invocation('Order 42 confirmed', { kind: 'navigate', destinationInputId: 'nav' }, `${ORIGIN}/next`))).toThrow();
    collector.dispose();
  });
});

// ── AC-7 FOCUS-MUTATION-01 (T0 ruling A9, rule FM): what a page change during a fill's focus may and may not do ─────────────
//
// Only the judgement of the records taken in the focus window changed. A change to the target field, or to the chain of its
// ancestors, still refuses `POST_FOCUS_CHANGED` and writes nothing; a change anywhere else no longer ends the session.

const attribute = (target: unknown, attributeName: string) => ({ type: 'attributes', target, attributeName, addedNodes: [], removedNodes: [] });
const childList = (target: unknown, added: unknown[] = [], removed: unknown[] = []) => ({ type: 'childList', target, attributeName: null, addedNodes: added, removedNodes: removed });
const characterData = (target: unknown) => ({ type: 'characterData', target, attributeName: null, addedNodes: [], removedNodes: [] });

/** MAIN > FORM > SECTION > INPUT ("Reference"), plus a sibling BUTTON elsewhere and a portal DIV outside the form. */
function nested() {
  const root = new FixtureElement('MAIN');
  root.attributes.set('aria-label', 'Form');
  const form = new FixtureElement('FORM');
  const section = new FixtureElement('SECTION');
  const field = new FixtureInput('INPUT');
  field.attributes.set('aria-label', 'Reference');
  field.value = 'before';
  section.append(field);
  form.append(section);
  root.append(form);
  const elsewhere = new FixtureElement('BUTTON', 'Order 42 confirmed');
  root.append(elsewhere);
  const portal = new FixtureElement('DIV');
  root.append(portal);
  return { root, form, section, field, elsewhere, portal };
}

function fillOnFocus(arrange: (parts: ReturnType<typeof nested>) => unknown[], after?: (parts: ReturnType<typeof nested>) => void) {
  const parts = nested();
  const run = install(parts.root);
  parts.field.onFocus = () => { scripted.push(...arrange(parts)); after?.(parts); };
  const attempt = (): unknown => run.collector.invoke(run.invocation('Reference', { kind: 'fill', value: literal }, 'after'));
  return { ...parts, ...run, attempt };
}

describe('FOCUS-MUTATION-01 (b): a change elsewhere on focus writes and returns {}', () => {
  it('(1) helper text inserted elsewhere', () => {
    const t = fillOnFocus(({ elsewhere }) => [childList(elsewhere, [new FixtureElement('SPAN', 'Required field')])]);
    expect(t.attempt()).toEqual({});
    expect(t.field.value).toBe('after');
    expect(t.field.events).toEqual(['input', 'change']);
    t.collector.dispose();
  });

  it('(1) text of an unrelated element changed (the D5 probe trigger)', () => {
    const t = fillOnFocus(({ elsewhere }) => [characterData(elsewhere), childList(elsewhere)]);
    expect(t.attempt()).toEqual({});
    expect(t.field.value).toBe('after');
    t.collector.dispose();
  });

  it('(2) an autocomplete listbox rendered in a portal outside the form', () => {
    const t = fillOnFocus(({ portal }) => [childList(portal, [new FixtureElement('UL'), new FixtureElement('LI', 'Berlin')]), attribute(portal, 'hidden')]);
    expect(t.attempt()).toEqual({});
    expect(t.field.value).toBe('after');
    t.collector.dispose();
  });

  it.each(['class', 'style', 'aria-expanded', 'aria-activedescendant', 'aria-describedby', 'aria-controls', 'data-focus', 'data-focus-visible', 'data-focus-within'])('(3) the allowlisted attribute %s set on the target', (name) => {
    const t = fillOnFocus(({ field }) => [attribute(field, name)]);
    expect(t.attempt()).toEqual({});
    expect(t.field.value).toBe('after');
    expect(t.field.events).toEqual(['input', 'change']);
    t.collector.dispose();
  });

  it('inert attributes on an ancestor are ignored: only hidden, inert and disabled count there', () => {
    const t = fillOnFocus(({ form, section }) => [attribute(form, 'class'), attribute(section, 'aria-expanded'), attribute(section, 'aria-hidden'), attribute(form, 'data-state')]);
    expect(t.attempt()).toEqual({});
    t.collector.dispose();
  });

  it('a childList record that touches the form but adds and removes nothing of the chain is ignored', () => {
    const t = fillOnFocus(({ form }) => [childList(form, [new FixtureElement('P', 'Hint')], [])]);
    expect(t.attempt()).toEqual({});
    t.collector.dispose();
  });

  it('exactly the work limit of unrelated records is tolerated (FM-5 bounds the count, it does not forbid records)', () => {
    const t = fillOnFocus(({ elsewhere }) => Array.from({ length: 4096 }, () => childList(elsewhere)));
    expect(t.attempt()).toEqual({});
    t.collector.dispose();
  });
});

describe('FOCUS-MUTATION-01 (c): a change to the target or its ancestors still refuses POST_FOCUS_CHANGED and writes nothing', () => {
  const refuses = (t: ReturnType<typeof fillOnFocus>): void => {
    expect(() => t.attempt()).toThrow('POST_FOCUS_CHANGED');
    expect(t.field.value).toBe('before');
    expect(t.field.events).toEqual([]);
    t.collector.dispose();
  };

  // Control for the scripted stub itself: a record alone, with the fixture's state untouched, is judged.
  it.each(['type', 'readonly', 'disabled', 'aria-disabled', 'name', 'value', 'autocomplete', 'contenteditable', 'aria-hidden', 'list', 'min'])('a scripted %s record on the target (fixture untouched)', (name) => {
    refuses(fillOnFocus(({ field }) => [attribute(field, name)]));
  });

  it('a record with no attribute name on the target counts', () => {
    refuses(fillOnFocus(({ field }) => [{ type: 'attributes', target: field, attributeName: null, addedNodes: [], removedNodes: [] }]));
  });

  it('the target removed (record names it)', () => {
    refuses(fillOnFocus(({ section, field }) => [childList(section, [], [field])]));
  });

  it('the target replaced: detached, and a new node added in its place', () => {
    refuses(fillOnFocus(({ section, field }) => [childList(section, [new FixtureInput('INPUT')], [field])], ({ field }) => { field.isConnected = false; }));
  });

  it('an ancestor removed', () => {
    refuses(fillOnFocus(({ form, section }) => [childList(form, [], [section])]));
  });

  it('an ancestor replaced', () => {
    refuses(fillOnFocus(({ form, section }) => [childList(form, [new FixtureElement('SECTION')], [section])]));
  });

  it('an ancestor moved: the recomputed chain differs even if the record only names the new parent', () => {
    refuses(fillOnFocus(({ portal }) => [childList(portal, [])], ({ section, portal }) => { section.parentElement = portal; }));
  });

  it('the chain changed with no record at all (an unobserved subtree): the recomputed chain still refuses', () => {
    refuses(fillOnFocus(() => [], ({ section, portal }) => { section.parentElement = portal; }));
  });

  it.each(['hidden', 'inert', 'disabled'])('%s set on an ancestor', (name) => {
    refuses(fillOnFocus(({ section }) => [attribute(section, name)]));
  });

  it('characterData inside the field', () => {
    refuses(fillOnFocus(({ field }) => [characterData(field)]));
  });

  it('more records than the work limit allows (FM-5, fail closed), even though each is unrelated', () => {
    refuses(fillOnFocus(({ elsewhere }) => Array.from({ length: 4097 }, () => childList(elsewhere))));
  });

  it('a tolerated change plus a real one is refused: one counting record in a crowd is enough', () => {
    refuses(fillOnFocus(({ elsewhere, portal, field }) => [childList(elsewhere, [new FixtureElement('SPAN')]), attribute(portal, 'class'), attribute(field, 'readonly')]));
  });

  it('keeps the other pre-write checks: a tolerated record does not excuse a field made read-only', () => {
    const t = fillOnFocus(({ field }) => [attribute(field, 'aria-expanded')], ({ field }) => { field.readOnly = true; });
    refuses(t);
  });

  it('keeps the other pre-write checks: a tolerated record does not excuse stolen focus', () => {
    const t = fillOnFocus(({ elsewhere }) => [childList(elsewhere)], ({ elsewhere }) => { focusRoot.activeElement = elsewhere; });
    refuses(t);
  });
});
