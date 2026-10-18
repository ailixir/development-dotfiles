/**
 * STUDIO-OBS-012A — collector naming and counting edges that `observation.test.ts` does not reach:
 * native `<label>` association (and when it is ambiguous), the bounded term/value fallback, an
 * exact read rule over a source that is not plain business text, and password controls inside an
 * open shadow root. Structural DOM stand-in only; the unit tier stays browser-free (AC-25).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installObservationCollector } from '../../src/run/observationCollector.js';
import { observationOptions } from '../../src/run/observationSanitizer.js';
import type { ObservationConfig } from '../../src/run/observationTypes.js';

const ORIGIN = 'http://127.0.0.1:4173';
const structural: ObservationConfig = {
  sessionId: 'session',
  scopeHash: 'a'.repeat(64),
  approvedOrigins: [ORIGIN],
  rules: [],
  knownSecrets: [],
  applicationPolicy: { policyRuleId: 'structural', allowStructuralDiscovery: true },
};

class FixtureShadow {
  readonly children: FixtureElement[] = [];
  constructor(readonly host: FixtureElement) {}
  append(child: FixtureElement) { child.root = this; this.children.push(child); }
}
class FixtureElement {
  readonly children: FixtureElement[] = [];
  readonly attributes = new Map<string, string>();
  childNodes: { length: number; item(index: number): { nodeType: number; nodeValue: string } } = { length: 0, item: () => ({ nodeType: 3, nodeValue: '' }) };
  shadowRoot: FixtureShadow | null = null;
  root: object = {};
  nodeType = 1;
  isConnected = true;
  parentElement: FixtureElement | null = null;
  previousElementSibling: FixtureElement | null = null;
  constructor(readonly tagName: string, text = '') {
    if (text) this.childNodes = { length: 1, item: () => ({ nodeType: 3, nodeValue: text }) };
  }
  get firstChild() { return this.childNodes.length ? { ...this.childNodes.item(0), nextSibling: null, firstChild: null } : null; }
  getRootNode() { return this.root; }
  matches() { return false; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }; }
  get lastElementChild(): FixtureElement | null { return this.children.at(-1) ?? null; }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  append(child: FixtureElement) { child.parentElement = this; child.previousElementSibling = this.lastElementChild; this.children.push(child); }
}
class FixtureInput extends FixtureElement {
  value = '';
  type = 'text';
  checked = false;
  list = null;
  readOnly = false;
  labels: { length: number; item(index: number): FixtureElement } | null = null;
}
class FixtureTextarea extends FixtureInput {}
class FixtureSelect extends FixtureInput {}
class FixtureLabel extends FixtureElement { control: FixtureInput | null = null; }

function labelsOf(...labels: FixtureElement[]) {
  return { length: labels.length, item: (index: number) => labels[index] ?? labels[0] ?? new FixtureElement('LABEL') };
}

function collect(root: FixtureElement, config: ObservationConfig = structural) {
  vi.stubGlobal('document', { documentElement: root, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('location', { origin: ORIGIN, href: `${ORIGIN}/page` });
  vi.stubGlobal('getComputedStyle', (element: FixtureElement) => ({ display: element.hasAttribute('hidden') ? 'none' : 'block', visibility: 'visible' }));
  vi.stubGlobal('MutationObserver', class { observe = vi.fn(); takeRecords() { return []; } disconnect = vi.fn(); });
  vi.stubGlobal('Element', FixtureElement);
  vi.stubGlobal('HTMLElement', FixtureElement);
  vi.stubGlobal('ShadowRoot', FixtureShadow);
  vi.stubGlobal('HTMLInputElement', FixtureInput);
  vi.stubGlobal('HTMLTextAreaElement', FixtureTextarea);
  vi.stubGlobal('HTMLSelectElement', FixtureSelect);
  vi.stubGlobal('HTMLLabelElement', FixtureLabel);
  const collector = installObservationCollector(observationOptions(config));
  const observation = collector.collect({ documentId: 'doc', generation: 1, observedAt: '2026-10-12T00:00:00.000Z' });
  return { collector, observation };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('native <label> association', () => {
  function labelled(configure: (label: FixtureLabel, field: FixtureInput, root: FixtureElement) => void) {
    const root = new FixtureElement('MAIN');
    root.attributes.set('aria-label', 'Form');
    const label = new FixtureLabel('LABEL', 'Account number');
    const field = new FixtureInput('INPUT');
    field.value = 'PRIVATE-ACCOUNT-VALUE';
    label.control = field;
    field.labels = labelsOf(label);
    root.append(label);
    root.append(field);
    configure(label, field, root);
    return collect(root);
  }

  it('names an unlabelled field from its associated label and emits a label locator', () => {
    const { observation, collector } = labelled(() => undefined);
    const field = observation.nodes.find((node) => node.elementType === 'input');
    expect(field?.name).toBe('Account number');
    expect(field?.role).toBe('textbox');
    expect(field?.locatorHints).toContainEqual({ kind: 'label', value: 'Account number', exact: true });
    expect(JSON.stringify(observation)).not.toContain('PRIVATE-ACCOUNT-VALUE');
    collector.dispose();
  });

  it.each([
    ['the label carries its own aria-label', (label: FixtureLabel) => { label.attributes.set('aria-label', 'Something else'); }],
    ['the label is hidden', (label: FixtureLabel) => { label.attributes.set('hidden', ''); }],
    ['the label has no text', (_label: FixtureLabel, field: FixtureInput) => { field.labels = labelsOf(new FixtureLabel('LABEL')); }],
    ['more than eight labels point at the field', (label: FixtureLabel, field: FixtureInput) => { field.labels = labelsOf(...Array.from({ length: 9 }, () => label)); }],
  ] as const)('does not name the field from labels when %s', (_case, configure) => {
    const { observation, collector } = labelled(configure);
    const exported = observation.nodes.filter((node) => node.elementType === 'input');
    // An ambiguous or unsafe label relation never yields a named, label-locatable field.
    for (const node of exported) {
      expect(node.locatorHints.some((hint) => hint.kind === 'label')).toBe(false);
    }
    expect(exported.some((node) => node.name === 'Account number')).toBe(false);
    collector.dispose();
  });
});

describe('bounded term/value fallback', () => {
  it('names a <dd> from its adjacent <dt> without exporting the value itself', () => {
    const root = new FixtureElement('MAIN');
    root.attributes.set('aria-label', 'Summary');
    const term = new FixtureElement('DT', 'Status');
    const value = new FixtureElement('DD', 'PRIVATE-STATUS-VALUE');
    root.append(term);
    root.append(value);
    const { observation, collector } = collect(root);
    expect(observation.coverage.mode).toBe('boundedDom');
    const fallback = observation.nodes.filter((node) => node.name === 'Status' && node.elementType === 'text');
    expect(fallback.length).toBeGreaterThan(0);
    // The fallback is never a role/label locator target; the value never leaves the page.
    for (const node of fallback) expect(node.locatorHints.some((hint) => hint.kind === 'role' || hint.kind === 'label')).toBe(false);
    expect(JSON.stringify(observation)).not.toContain('PRIVATE-STATUS-VALUE');
    collector.dispose();
  });

  it('does not fall back to a hidden term', () => {
    const root = new FixtureElement('MAIN');
    root.attributes.set('aria-label', 'Summary');
    const term = new FixtureElement('DT', 'Status');
    term.attributes.set('hidden', '');
    root.append(term);
    root.append(new FixtureElement('DD', 'value'));
    const { observation, collector } = collect(root);
    expect(observation.nodes.some((node) => node.name === 'Status')).toBe(false);
    collector.dispose();
  });
});

describe('an exact read rule over a source that is not plain business text', () => {
  /** A ruled <output>; `hiddenChild` adds a hidden inline span inside its text. */
  function ruled(hiddenChild: boolean) {
    const root = new FixtureElement('MAIN');
    root.attributes.set('aria-label', 'Form');
    const output = new FixtureElement('OUTPUT');
    output.attributes.set('data-testid', 'total');
    const nodes: ({ nodeType: number; nodeValue: string } | FixtureElement)[] = [{ nodeType: 3, nodeValue: 'Total 42' }];
    if (hiddenChild) {
      const span = new FixtureElement('SPAN', 'HIDDEN-PRIVATE');
      span.attributes.set('hidden', '');
      output.append(span);
      nodes.push(span);
    }
    output.childNodes = { length: nodes.length, item: (index: number) => nodes[index] as { nodeType: number; nodeValue: string } };
    root.append(output);
    const rule = { testId: 'total', name: 'Total', policyRuleId: 'total-rule', classification: 'permittedBusinessData' as const };
    const { observation, collector } = collect(root, { ...structural, rules: [rule] });
    const node = observation.nodes.find((candidate) => candidate.locatorHints.some((hint) => hint.kind === 'testId' && hint.value === 'total'));
    if (!node) throw new Error(`RULED_NODE ${JSON.stringify(observation.nodes.map((n) => n.name))}`);
    const locator = node.locatorHints.find((hint) => hint.kind === 'testId');
    if (!locator) throw new Error('LOCATOR');
    const readable = collector.validateInvocation({ target: { nodeId: node.nodeId, documentId: node.documentId, generation: node.generation, locator }, operation: { kind: 'read', bindingId: 'b', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: 'total-rule' } }, resolvedValue: null, origin: ORIGIN, maxValueBytes: 4096 });
    collector.dispose();
    return { node, readable, json: JSON.stringify(observation) };
  }

  it('grants the visible-text read when the ruled element is plain text', () => {
    const { node, readable } = ruled(false);
    expect(node.classification).toBe('permittedBusinessData');
    expect(node.policyRuleId).toBe('total-rule');
    expect(readable).toBe(true);
  });

  it('withholds the same rule when the element hides text inside it', () => {
    const { node, readable, json } = ruled(true);
    expect(node.classification).not.toBe('permittedBusinessData');
    expect(readable).toBe(false);
    expect(json).not.toContain('HIDDEN-PRIVATE');
  });
});

describe('password controls inside an open shadow root', () => {
  it('are counted as password controls, so a shadow decoy is never invisible to the count', () => {
    const root = new FixtureElement('MAIN');
    root.attributes.set('aria-label', 'Login');
    const outer = new FixtureInput('INPUT');
    outer.type = 'password';
    root.append(outer);
    const host = new FixtureElement('DIV');
    host.shadowRoot = new FixtureShadow(host);
    const inner = new FixtureInput('INPUT');
    inner.type = 'password';
    host.shadowRoot.append(inner);
    root.append(host);
    const { observation, collector } = collect(root);
    expect(observation.coverage.passwordControls).toBe(2);
    collector.dispose();
  });
});
