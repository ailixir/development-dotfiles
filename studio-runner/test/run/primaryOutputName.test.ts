import { describe, expect, it } from 'vitest';

import { guardDerived, newCounters, perceiveCollected } from '../../src/run/perceive.js';
import type { ElementFacts, SnapshotNode } from '../../src/run/perceptionInPage.js';
import { createPrivateMatcher } from '../../src/run/privateInventory.js';
import { elementFacts, n, page } from './perceptionFakes.js';

const VALUE = 'Zephyr Quartz Ninefold 7341';
const NAME = 'Order reference';
const primary = (extra: Partial<ElementFacts> = {}): ElementFacts => ({ ...elementFacts('output', extra), primaryNameSource: 'PRIMARY_ARIA_LABEL' } as ElementFacts);
const run = (node: SnapshotNode = n('status', { ref: 'e1', name: NAME }, VALUE), values = [VALUE], facts: ElementFacts = primary(), siblings: SnapshotNode[] = []) =>
  perceiveCollected(page([n('document', {}, node, ...siblings)], { e1: facts }), createPrivateMatcher(values));
const publicJson = (result: ReturnType<typeof run>): string => JSON.stringify({ outline: result.outline, facts: result.facts, segments: result.segments });

describe('bounded primary native output name', () => {
  it('preserves only the current proved public output name after full private child withholding', () => {
    const result = run();
    expect(result.facts.e1).toMatchObject({ role: 'status', name: NAME, evidence: NAME });
    expect(result.facts.e1).not.toHaveProperty('text');
    expect(result.outline.text).toContain(`status "${NAME}" [e1] {value withheld}`);
    expect(publicJson(result)).not.toContain(VALUE);
  });

  it('retains the public output name while withholding two three and four private child fragments', () => {
    for (const parts of [['Zephyr Quartz', ' Ninefold 7341'], ['Zephyr ', 'Quartz Nine', 'fold 7341'], ['Zeph', 'yr Quartz ', 'Ninefold ', '7341']]) {
      const result = run(n('status', { ref: 'e1', name: NAME }, ...parts.map((text) => n('generic', {}, text))));
      expect(result.facts.e1?.name).toBe(NAME);
      for (const text of parts) expect(publicJson(result)).not.toContain(text.trim());
      expect(result.facts.e1).not.toHaveProperty('text');
    }
  });

  it('declines absent uncertain overridden control sensitive editable placeholder and URL provenance', () => {
    for (const facts of [elementFacts('output'), primary({ tag: 'div' }), primary({ password: true }), primary({ sensitive: true }), primary({ editable: true }), primary({ valueControl: true }), primary({ valueAttr: true }), primary({ inSelect: true })]) {
      const result = run(undefined, undefined, facts);
      expect(result.byRef.get('e1')?.primaryName ?? false).toBe(false);
      expect(publicJson(result)).not.toContain(VALUE);
    }
    for (const attrs of [{ cursor: 'pointer' }, { placeholder: 'Public prompt' }, { url: '/public' }]) {
      expect(run(n('status', { ref: 'e1', name: NAME, ...attrs }, VALUE)).facts.e1?.name).toBe('');
    }
    expect(run(n('region', { ref: 'e1', name: NAME }, VALUE)).facts.e1?.name).toBe('');
  });

  it('revokes primary names for direct NFKC window and encoded private aliases', () => {
    for (const name of [VALUE, `Open ${VALUE}`, VALUE.toUpperCase(), 'Ｚephyr Quartz Ninefold 7341', encodeURIComponent(VALUE), VALUE.replaceAll(' ', '+'), encodeURIComponent(encodeURIComponent(VALUE))]) {
      const result = run(n('status', { ref: 'e1', name }, VALUE));
      expect(result.facts.e1?.name ?? '').toBe('');
      expect(publicJson(result)).not.toContain(name);
    }
    const long = 'abcdefghijklmnopqrstuvwxyz'.repeat(20);
    expect(run(n('status', { ref: 'e1', name: long.slice(120, 144) }, long), [long]).facts.e1?.name).toBe('');
  });

  it('revokes primary names involved in split inserted ghost parent and neighboring matches', () => {
    for (const [name, children, privateValue] of [
      ['Marsh', ['Quillon'], 'Quillon Marsh'],
      ['Quartz', ['Zephyr ', ' Ninefold'], 'Zephyr Quartz Ninefold'],
      ['Zephyr', ['Quartz Ninefold'], 'Zephyr Quartz Ninefold'],
    ] as const) {
      const result = run(n('status', { ref: 'e1', name }, ...children), [privateValue]);
      expect(result.facts.e1?.name ?? '').toBe('');
      expect(publicJson(result)).not.toContain(name);
    }
    // The full private child already became a ghost; the candidate must still take part in parent probes.
    const result = perceiveCollected(page([n('document', {}, n('paragraph', {}, 'Marsh'), n('status', { ref: 'e1', name: 'Quillon' }, VALUE))], { e1: primary() }), createPrivateMatcher([VALUE, 'Marsh Quillon']));
    expect(result.facts.e1?.name).toBe('');
    expect(publicJson(result)).not.toContain('Quillon');
  });

  it('never restores an earlier cleared name during later content taint', () => {
    const result = run(n('status', { ref: 'e1', name: NAME, placeholder: VALUE }, VALUE));
    expect(result.facts.e1?.name).toBe('');
    expect(publicJson(result)).not.toContain(NAME);
    const later = run(undefined, [VALUE, NAME]);
    expect(later.facts.e1?.name).toBe('');
  });

  it('revokes a retained name before discarding a participating final derived field', () => {
    for (const values of [['Quillon Marsh'], ['Quillon Marsh', 'Marsh']]) {
      const result = run(n('status', { ref: 'e1', name: 'Quillon' }, VALUE));
      const node = result.byRef.get('e1');
      if (!node) throw new Error('missing source ref');
      expect(node.primaryName).toBe(true);
      expect(node.rawName !== '').toBe(true);
      node.near = 'Marsh';
      const matcher = createPrivateMatcher(values);
      expect(matcher.locateSplit([node.rawName, node.near]).has(0)).toBe(true);
      guardDerived(result.tree, matcher, newCounters());
      expect(node.primaryName).toBe(false);
      expect(node.rawName).toBe('');
      expect(node.name).toBe('');
      expect(node.withheld).toBe(true);
    }
  });

  it('keeps content derived private story names and other role exceptions blank', () => {
    for (const role of ['link', 'heading', 'button', 'status']) {
      const result = run(n(role, { ref: 'e1', name: role === 'status' ? NAME : VALUE }, VALUE), [VALUE], elementFacts(role === 'status' ? 'div' : 'a'));
      expect(result.facts.e1?.name ?? '').toBe('');
    }
  });

  it('retains withheld cleared ancestor taint and absent text after public name preservation', () => {
    const result = perceiveCollected(page([n('heading', { ref: 'e2', name: 'Summary' }, n('status', { ref: 'e1', name: NAME }, VALUE))], { e1: primary() }), createPrivateMatcher([VALUE]));
    expect(result.byRef.get('e1')).toMatchObject({ rawName: NAME, withheld: true, cleared: true, ownText: '' });
    expect(result.byRef.get('e2')?.rawName).toBe('');
    expect(result.facts.e1).not.toHaveProperty('text');
    expect(publicJson(result)).not.toContain(VALUE);
  });
});
