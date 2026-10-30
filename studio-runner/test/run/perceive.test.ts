import { validatePublicObservation } from '../../src/validator/pressInheritance.js';
import { describe, expect, it } from 'vitest';

import {
  OPTION_CAP,
  annotate,
  bound,
  buildRendered,
  deriveFacts,
  evidenceFor,
  evidenceSegments,
  guardDerived,
  internalsOf,
  newCounters,
  norm,
  perceive,
  perceiveCollected,
  project,
  renderLine,
  safeUrl,
  shownRef,
  words,
  type RenderedNode,
  type RenderedTree,
} from '../../src/run/perceive.js';
import { pageInventory, type CollectedPage } from '../../src/run/perceptionInPage.js';
import { vi } from 'vitest';
import { PrivateInventory, createPrivateMatcher } from '../../src/run/privateInventory.js';
import {
  factDifferences,
  lineDiff,
  loadBaseline,
  loadCollected,
  loadDifferences,
  spikeRun,
  type Baseline,
} from '../fixtures/perception-parity/parity.js';
import { ScriptedCdp, box, elementFacts, everything, n, page } from './perceptionFakes.js';

/**
 * ADR-SC-007 D1 / D3 / D6: the sanitizer, the outline, the focus projection and the facts table, on the pure
 * pipeline (no browser), plus AC1 layer 1 against the committed verbatim copy of the spike.
 */

const run = (collected: CollectedPage, values: string[] = [], o: Parameters<typeof perceiveCollected>[2] = {}): ReturnType<typeof perceiveCollected> =>
  perceiveCollected(collected, createPrivateMatcher(values), o);
const outlineOf = (collected: CollectedPage, values: string[] = [], o: Parameters<typeof perceiveCollected>[2] = {}): string[] => run(collected, values, o).outline.text.split('\n');
const U2026 = '…';
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

describe('text helpers', () => {
  it('norm: NFKC, lower case, collapsed whitespace, edge punctuation and symbols stripped; symbol-only text keeps its symbols', () => {
    expect(norm('  Ｈello,   World!! ')).toBe('hello, world');
    expect(norm('+')).toBe('+');
    expect(norm('...')).toBe('...');
    expect(norm('"Quoted"')).toBe('quoted');
  });

  it('words: tokens of 2 or more letters or digits', () => {
    expect(words('Click the "Search" button, 3 times: x2')).toEqual(['click', 'the', 'search', 'button', 'times', 'x2']);
    expect(words('+')).toEqual([]);
    expect(words('über straße')).toEqual(['über', 'straße']);
  });

  it('bound: collapses whitespace and cuts with the U+2026 glyph, counting characters', () => {
    expect(bound('  a   b  ')).toBe('a b');
    expect(bound(null)).toBe('');
    expect(bound(undefined)).toBe('');
    const cut = bound('x'.repeat(200), 160);
    expect(Array.from(cut)).toHaveLength(160);
    expect(cut.endsWith(U2026)).toBe(true);
    expect(Buffer.from(cut.slice(-1)).toString('hex')).toBe('e280a6');
    expect(bound('😀'.repeat(5), 3)).toBe(`😀😀${U2026}`);
  });

  it('safeUrl: drops credentials and fragments, hides long opaque query values, bounds the length', () => {
    expect(safeUrl('https://user:pw@example.test/a?token=abcdefghijklmnopqrstuvwxyz&x=1#frag')).toBe(`https://example.test/a?token=${U2026}&x=1`);
    expect(safeUrl('/relative/path?q=short')).toBe('/relative/path?q=short');
    expect(safeUrl('/flag?x')).toBe('/flag?x');
    expect(safeUrl('data:text/html;base64,AAAA')).toBe(`data:${U2026}`);
    expect(safeUrl('JavaScript:alert(1)')).toBe('javascript:');
    expect(Array.from(safeUrl(`/${'p'.repeat(300)}`) ?? '')).toHaveLength(120);
    expect(safeUrl(undefined)).toBeUndefined();
    expect(safeUrl(5)).toBeUndefined();
  });
});

describe('sanitizer', () => {
  it('value-only omission requires its exact same-pass certificate and all local prerequisites', () => {
    const make = (): CollectedPage => page([n('textbox', { name: 'Recipient', ref: 'e1' }, 'delete value-canary')], {
      e1: elementFacts('input', { type: 'text', password: false, valueControl: true, directValueOnly: 'NATIVE_INPUT_VALUE_ONLY' }),
    });
    const certified = run(make());
    expect(certified.facts.e1).toMatchObject({ nameComplete: true, ownTextComplete: true });
    expect(certified.segments.e1?.some(s => s.field === 'ownText')).toBe(false);
    expect(certified.counters.valuesStripped).toBe(1);
    expect(JSON.stringify({ outline: certified.outline, facts: certified.facts })).not.toContain('value-canary');
    for (const mutate of [
      (p: CollectedPage) => { delete must(p.facts.e1).directValueOnly; },
      (p: CollectedPage) => { delete must(p.facts.e1).password; },
      (p: CollectedPage) => { must(p.facts.e1).tag = 'textarea'; },
      (p: CollectedPage) => { must(p.facts.e1).type = 'number'; },
      (p: CollectedPage) => { must(p.facts.e1).valueAttr = true; },
      (p: CollectedPage) => { must(p.json[0]).role = 'button'; },
      (p: CollectedPage) => { must(p.json[0]).children?.push(n('generic', {}, 'Delete')); },
      (p: CollectedPage) => { must(p.json[0]).text = 'delete value-canary'; },
    ]) {
      const raw = make(); mutate(raw);
      expect(run(raw).facts.e1?.ownTextComplete).toBe(false);
    }
    const privateName = make(); must(privateName.json[0]).name = 'label-canary';
    expect(run(privateName, ['label-canary']).facts.e1?.nameComplete).not.toBe(true);
  });
  it('renders password, sensitive, iframe and canvas surfaces as lines without refs, and never as facts', () => {
    const collected = page(
      [n('document', {},
        n('textbox', { name: 'User', ref: 'e1' }),
        n('textbox', { name: 'Password', ref: 'e2' }),
        n('generic', { ref: 'e3' }, 'secret text'),
        n('iframe', { ref: 'e4' }),
        n('generic', { ref: 'e5' }),
        n('button', { name: 'Go', ref: 'e6' }))],
      {
        e1: elementFacts('input', { type: 'text', valueControl: true }),
        e2: elementFacts('input', { type: 'password', password: true, valueControl: true }),
        e3: elementFacts('div', { sensitive: true }),
        e5: elementFacts('canvas'),
      },
      { canvases: 3 },
    );
    const result = run(collected);
    expect(result.outline.text.split('\n')).toEqual([
      '- document',
      '  - textbox "User" [e1]',
      '  - passwordControl',
      '  - withheld {sensitive}',
      '  - iframe {unsupported surface}',
      '  - canvas {unsupported surface}',
      '  - button "Go" [e6]',
      '- canvas {unsupported surface}',
      '- canvas {unsupported surface}',
    ]);
    expect(result.counters).toMatchObject({ passwordControls: 1, withheldSensitive: 1, unsupported: 2 });
    expect(Object.keys(result.facts)).toEqual(['e1', 'e6']);
    expect(everything(result.outline, result.facts)).not.toContain('secret text');
  });

  it('drops the selected option of a native select, keeps the others, and strips value children of value controls', () => {
    const collected = page(
      [n('document', {},
        n('combobox', { name: 'Currency', ref: 'e1' }, n('option', { name: 'EUR', selected: true, ref: 'e2' }), n('option', { name: 'GBP', ref: 'e3' }), n('option', { name: 'USD', ref: 'e4' })),
        n('textbox', { name: 'Name', ref: 'e5' }, 'typed value'),
        n('slider', { name: 'Volume', ref: 'e6' }, '7'))],
      {
        e1: elementFacts('select', { valueControl: true }),
        e2: elementFacts('option', { inSelect: true }),
        e3: elementFacts('option', { inSelect: true }),
        e4: elementFacts('option', { inSelect: true }),
        e5: elementFacts('input', { type: 'text', valueControl: true }),
        e6: elementFacts('div', { valueAttr: true }),
      },
    );
    const result = run(collected);
    expect(result.outline.text.split('\n')).toEqual([
      '- document',
      '  - combobox "Currency" [e1]',
      '    - option "GBP" [e3]',
      '    - option "USD" [e4]',
      '  - textbox "Name" [e5]',
      '  - slider "Volume" [e6]',
    ]);
    expect(result.counters.valuesStripped).toBe(3);
    expect(everything(result.outline, result.facts)).not.toMatch(/EUR|typed value/u);
  });

  it('shows an editable root as {editable} and drops its content', () => {
    const collected = page([n('document', {}, n('generic', { name: 'Editor', ref: 'e1' }, 'draft text'))], { e1: elementFacts('div', { editable: true,  editableRoot: true }) });
    expect(outlineOf(collected)).toEqual(['- document', '  - generic "Editor" [e1] {editable}']);
  });

  it('scrubs text that echoes a control value the snapshot could not attribute', () => {
    const collected = page([n('document', {}, n('paragraph', {}, 'typed value'), n('paragraph', {}, 'other'))], {}, { echo: ['typed value'] });
    const result = run(collected);
    expect(result.outline.text).not.toContain('typed value');
    expect(result.counters.echoScrubbed).toBe(1);
  });

  it('renders states, placeholders and sanitized urls', () => {
    const collected = page([n('document', {},
      n('checkbox', { name: 'A', ref: 'e1', checked: 'mixed', disabled: true }),
      n('button', { name: 'B', ref: 'e2', expanded: true, pressed: true }),
      n('button', { name: 'C', ref: 'e3', pressed: 'mixed', selected: true }),
      n('heading', { name: 'D', ref: 'e4', level: 2, invalid: true, ariaHidden: true }),
      n('generic', { name: 'E', ref: 'e5', cursor: 'pointer' }),
      n('textbox', { name: 'F', ref: 'e6', placeholder: '  e.g.   42 ' }),
      n('link', { name: 'G', ref: 'e7', url: 'https://example.test/x?secret=abcdefghijklmnopqrstuv' }),
      n('checkbox', { name: 'H', ref: 'e8', checked: true }))]);
    expect(outlineOf(collected)).toEqual([
      '- document',
      '  - checkbox "A" [e1] {checked=mixed,disabled}',
      '  - button "B" [e2] {expanded,pressed}',
      '  - button "C" [e3] {pressed=mixed,selected}',
      '  - heading "D" [e4] {level=2,invalid,aria-hidden}',
      '  - generic "E" [e5] {clickable}',
      '  - textbox "F" [e6] {placeholder="e.g. 42"}',
      `  - link "G" [e7] {url="https://example.test/x?secret=${U2026}"}`,
      '  - checkbox "H" [e8] {checked}',
    ]);
  });

  it('gives a lone text child of a transparent wrapper the wrapper\'s ref, and keeps several children without it', () => {
    const one = page([n('document', {}, n('paragraph', { ref: 'e1' }, 'Hello'))]);
    expect(outlineOf(one)).toEqual(['- document', '  - text "Hello" [e1]']);
    const many = page([n('document', {}, n('paragraph', { ref: 'e1' }, n('generic', {}, 'Hello'), n('generic', {}, 'World')))]);
    expect(outlineOf(many)).toEqual(['- document', '  - text "Hello"', '  - text "World"']);
  });

  it('omits the name of a row (its cells carry it), shows no ref on bare containers, and keeps the ref of named nodes', () => {
    const collected = page([n('table', { name: 'People', ref: 'e1' }, n('row', { name: 'Ann admin', ref: 'e2' }, n('cell', { name: 'Ann', ref: 'e3' }, 'Ann'), n('cell', { name: 'admin', ref: 'e4' }, 'admin')))]);
    expect(outlineOf(collected)).toEqual(['- table "People" [e1]', '  - row', '    - cell "Ann" [e3]', '      - text "Ann"', '    - cell "admin" [e4]', '      - text "admin"']);
  });

  it('drops empty unnamed nodes and collapses text runs', () => {
    const collected = page([n('document', {}, n('generic', {}), n('paragraph', {}, 'a', 'b', n('strong', {}, 'c')))]);
    expect(outlineOf(collected)).toEqual(['- document', '  - text "ab"', '  - text "c"']);
  });
});

describe('private values in the sanitizer (single strings)', () => {
  it('keeps a ref-bearing node whose name, placeholder or text is private as a valueless {value withheld} line', () => {
    const collected = page([n('document', {},
      n('button', { name: 'Hello SPK_NAME', ref: 'e1' }),
      n('textbox', { name: 'Field', ref: 'e2', placeholder: 'SPK_PH' }),
      n('cell', { name: 'x', ref: 'e3' }, 'SPK_CELL text'),
      n('link', { name: 'Go', ref: 'e4', url: 'https://example.test/u/SPK_URL' }),
      n('paragraph', {}, 'ok text'))]);
    const result = run(collected, ['SPK_NAME', 'SPK_PH', 'SPK_CELL', 'SPK_URL']);
    expect(result.outline.text.split('\n')).toEqual([
      '- document',
      '  - button [e1] {value withheld}',
      '  - textbox [e2] {value withheld}',
      '  - cell [e3] {value withheld}',
      '  - link "Go" [e4]',
      '  - text "ok text"',
    ]);
    expect(everything(result.outline, result.facts)).not.toMatch(/SPK_/u);
    expect(result.counters.withheldKept).toBe(3);
  });

  it('drops the line of a ref-less node whose name is private and keeps what it contains', () => {
    const collected = page([n('document', {}, n('heading', { name: 'SPK_NAME title' }, n('button', { name: 'Ok', ref: 'e1' })))]);
    expect(outlineOf(collected, ['SPK_NAME'])).toEqual(['- document', '  - button "Ok" [e1]']);
  });

  it('matches case-insensitively, in NFKC form, and in URL-encoded forms (D2)', () => {
    const collected = page([n('document', {},
      n('button', { name: 'lower spk_case', ref: 'e1' }),
      n('button', { name: 'ＳＰＫ＿ＮＦＫＣ full width', ref: 'e2' }),
      n('link', { name: 'Profile', ref: 'e3', url: '/people/john%20smith/home' }),
      n('link', { name: 'Search', ref: 'e4', url: '/s?q=john+smith' }),
      n('link', { name: 'Again', ref: 'e5', url: '/r?u=john%2520smith' }))]);
    const result = run(collected, ['SPK_CASE', 'SPK_NFKC', 'John Smith']);
    expect(result.outline.text.split('\n')).toEqual([
      '- document',
      '  - button [e1] {ordinal=1/2} {value withheld}',
      '  - button [e2] {ordinal=2/2} {value withheld}',
      '  - link "Profile" [e3]',
      '  - link "Search" [e4]',
      '  - link "Again" [e5]',
    ]);
  });

  it('the claimant of withheld text renders no name (it was built from the content)', () => {
    const collected = page([n('document', {}, n('link', { name: 'Profile', ref: 'e1' }, n('generic', {}, 'John Smith'), n('generic', {}, 'extra')), n('button', { name: 'Go', ref: 'e2' }))]);
    expect(outlineOf(collected, ['John Smith'])).toEqual(['- document', '  - link [e1] {value withheld}', '    - text "extra"', '  - button "Go" [e2]']);
  });
});

describe('D1: values split across pieces, and names built from content', () => {
  const VALUE = 'Zephyr Quartz Ninefold';
  /** Every piece of the value must be absent, as must the value itself in any spacing. */
  const noFragments = (haystack: string, pieces: string[]): void => {
    for (const piece of pieces) expect(haystack, `fragment ${JSON.stringify(piece)}`).not.toContain(piece);
    expect(haystack.replace(/\s+/gu, '').toLowerCase()).not.toContain('zephyrquartzninefold');
  };

  it.each([
    ['two spans', ['Zephyr ', 'Quartz Ninefold']],
    ['three spans', ['Zephyr', ' Quartz', ' Ninefold']],
    ['four spans', ['Zeph', 'yr Qua', 'rtz Nine', 'fold']],
  ])('withholds a value split across %s of a paragraph and leaves a targetable stub', (_label, pieces) => {
    const collected = page([n('document', {}, n('paragraph', { ref: 'e1' }, ...pieces.map((piece) => n('generic', {}, piece))), n('button', { name: 'Save', ref: 'e2' }))]);
    const result = run(collected, [VALUE]);
    expect(result.outline.text.split('\n')).toEqual(['- document', '  - paragraph [e1] {value withheld}', '  - button "Save" [e2]']);
    noFragments(everything(result.outline, result.facts, result.segments), pieces);
    expect(result.counters.splitWithheld).toBeGreaterThan(0);
  });

  it('withholds the link, the heading above it and both fragments when the link name joins block children with spaces', () => {
    const collected = page([n('document', {},
      n('heading', { name: 'Zephyr Quartz Ninefold', ref: 'e1' }, n('link', { name: 'Zephyr Quartz Ninefold', ref: 'e2' }, n('generic', {}, n('generic', {}, 'Zephyr'), n('generic', {}, 'Quartz Ninefold')))),
      n('button', { name: 'Other', ref: 'e3' }))]);
    const result = run(collected, [VALUE]);
    expect(result.outline.text.split('\n')).toEqual(['- document', '  - heading [e1] {value withheld}', '    - link [e2] {value withheld}', '  - button "Other" [e3]']);
    noFragments(everything(result.outline, result.facts, result.segments), ['Zephyr', 'Quartz', 'Ninefold']);
    expect(result.facts.e1).toMatchObject({ name: '', evidence: '' });
    expect(result.facts.e2).toMatchObject({ name: '', evidence: '' });
  });

  it('keeps non-hit siblings: one matching cell does not blank its row, and the row loses only its name', () => {
    const collected = page([n('table', { name: 'People', ref: 'e1' },
      n('row', { name: 'Name Zephyr Quartz Ninefold Role admin', ref: 'e2' },
        n('cell', { name: 'Name', ref: 'e3' }, 'Name'),
        n('cell', { name: 'Zephyr Quartz Ninefold', ref: 'e4' }, 'Zephyr Quartz Ninefold'),
        n('cell', { name: 'admin', ref: 'e5' }, 'admin'),
        n('link', { name: 'Edit', ref: 'e6' })))]);
    const result = run(collected, [VALUE]);
    expect(result.outline.text.split('\n')).toEqual([
      '- table "People" [e1]',
      '  - row [e2] {value withheld}',
      '    - cell "Name" [e3]',
      '      - text "Name"',
      '    - cell [e4] {value withheld}',
      '    - cell "admin" [e5]',
      '      - text "admin"',
      '    - link "Edit" [e6]',
    ]);
    noFragments(everything(result.outline, result.facts), ['Zephyr', 'Quartz', 'Ninefold']);
    // the other cells' evidence does not contain the withheld sibling
    expect(result.facts.e3?.evidence).toBe('Name Name admin');
  });

  it('withholds a value split across two cells and drops the text the cell names were built from', () => {
    const collected = page([n('table', {}, n('row', {},
      n('cell', { name: 'Zephyr', ref: 'e2' }, 'Zephyr'),
      n('cell', { name: 'Quartz Ninefold', ref: 'e3' }, 'Quartz Ninefold'),
      n('cell', { name: 'other', ref: 'e4' }, 'other')))]);
    const result = run(collected, [VALUE]);
    expect(result.outline.text.split('\n')).toEqual(['- table', '  - row', '    - cell [e2] {ordinal=1/2} {value withheld}', '    - cell [e3] {ordinal=2/2} {value withheld}', '    - cell "other" [e4]', '      - text "other"']);
    noFragments(everything(result.outline, result.facts), ['Zephyr', 'Quartz', 'Ninefold']);
  });

  it('a name hit with no withheld text below it is DIRECT: the node is stubbed and its children stay', () => {
    const collected = page([n('document', {}, n('region', { name: VALUE, ref: 'e1' }, n('paragraph', {}, 'Hello world'), n('button', { name: 'Go', ref: 'e2' })))]);
    expect(outlineOf(collected, [VALUE])).toEqual(['- document', '  - region [e1] {value withheld}', '    - text "Hello world"', '    - button "Go" [e2]']);
  });

  it('a name hit that the text below it explains removes the name and leaves the other cells alone', () => {
    const collected = page([n('document', {}, n('table', {}, n('row', { name: `Ann ${VALUE}`, ref: 'e1' }, n('cell', { name: 'Ann', ref: 'e2' }, 'Ann'), n('cell', { name: VALUE, ref: 'e3' }, VALUE))))]);
    const lines = outlineOf(collected, [VALUE]);
    expect(lines).toEqual(['- document', '  - table', '    - row [e1] {value withheld}', '      - cell "Ann" [e2]', '        - text "Ann"', '      - cell [e3] {value withheld}']);
  });

  it('a direct name hit also drops the direct text lines that name was built from, but not unrelated ones', () => {
    const collected = page([n('document', {}, n('link', { name: 'Jo hn', ref: 'e1' }, 'Jo hn', n('generic', {}, 'unrelated')))]);
    const lines = outlineOf(collected, ['John']);
    expect(lines).toEqual(['- document', '  - link [e1] {value withheld}', '    - text "unrelated"']);
  });

  describe('a node\'s own strings have no order among themselves (F1)', () => {
    const SPLIT = 'Quillon Marsh';
    const hidden = (collected: CollectedPage, values: string[] = [SPLIT]): string => {
      const result = run(collected, values);
      const all = everything(result.outline, result.facts, result.segments);
      expect(all.toLowerCase()).not.toContain('quillon');
      expect(all.toLowerCase()).not.toContain('marsh');
      return result.outline.text;
    };

    it.each([
      ['name Marsh, text Quillon', n('button', { name: 'Marsh', ref: 'e3' }, 'Quillon')],
      ['name Quillon, text Marsh', n('button', { name: 'Quillon', ref: 'e3' }, 'Marsh')],
      ['name Marsh, text Quillon in a span', n('link', { name: 'Marsh', ref: 'e3' }, n('generic', {}, 'Quillon'))],
      ['name Quillon, text Marsh in a span', n('link', { name: 'Quillon', ref: 'e3' }, n('generic', {}, 'Marsh'))],
    ])('name against text: %s', (_label, node) => {
      expect(hidden(page([n('document', {}, node, n('button', { name: 'Other', ref: 'e9' }))]))).toContain('[e3] {value withheld}');
    });

    it.each([
      ['name Marsh, placeholder Quillon', { name: 'Marsh', placeholder: 'Quillon' }],
      ['name Quillon, placeholder Marsh', { name: 'Quillon', placeholder: 'Marsh' }],
    ])('name against placeholder: %s', (_label, attrs) => {
      hidden(page([n('document', {}, n('textbox', { ref: 'e3', ...attrs }))]));
    });

    it('placeholder against text, in both directions', () => {
      hidden(page([n('document', {}, n('link', { ref: 'e3', placeholder: 'Marsh' }, 'Quillon'))]));
      hidden(page([n('document', {}, n('link', { ref: 'e3', placeholder: 'Quillon' }, 'Marsh'))]));
    });

    it('three parts in every order: name, placeholder and text', () => {
      const value = 'Quillon Marsh Smith';
      const names = ['Quillon', 'Marsh', 'Smith'];
      const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
      for (const order of orders) {
        const [asName, asPlaceholder, asText] = order.map((i) => names[i] ?? '');
        const result = run(page([n('document', {}, n('link', { name: asName ?? '', placeholder: asPlaceholder ?? '', ref: 'e3' }, asText ?? ''))]), [value]);
        const all = everything(result.outline, result.facts, result.segments).toLowerCase();
        for (const piece of ['quillon', 'marsh', 'smith']) expect(all, `${order.join('')} ${piece}`).not.toContain(piece);
      }
    });

    it('a text line on each side of the name: Quillon [name Marsh] Smith', () => {
      const result = run(page([n('document', {}, n('button', { name: 'Marsh', ref: 'e3' }, 'Quillon', 'Smith'))]), ['Quillon Marsh Smith']);
      const all = everything(result.outline, result.facts).toLowerCase();
      for (const piece of ['quillon', 'marsh', 'smith']) expect(all).not.toContain(piece);
    });

    it('keeps the unrelated strings of the node', () => {
      const result = run(page([n('document', {}, n('textbox', { name: 'Marsh', placeholder: 'Quillon', ref: 'e3' }), n('textbox', { name: 'Email', placeholder: 'you@example.test', ref: 'e4' }))]));
      expect(result.outline.text).toContain('textbox "Email" [e4] {placeholder="you@example.test"}');
    });
  });

  it('a stub also loses the direct text its withheld name contains (F2)', () => {
    const collected = page([n('document', {}, n('link', { name: 'Quillon Marsh', ref: 'e1' }, 'Quillon'), n('button', { name: 'admin', ref: 'e4' }, 'admin'))]);
    const result = run(collected, ['Quillon Marsh']);
    expect(everything(result.outline, result.facts).toLowerCase()).not.toContain('quillon');
    expect(result.outline.text).toContain('- link [e1] {value withheld}');
    expect(result.outline.text).toContain('text "admin"');
    expect(result.outline.text).toContain('- button "admin" [e4]');
  });

  it('a stub keeps text its name does not contain (F2)', () => {
    const collected = page([n('document', {}, n('link', { name: 'Quillon Marsh', ref: 'e1' }, 'Quillon', n('generic', {}, 'unrelated')))]);
    expect(run(collected, ['Quillon Marsh']).outline.text.split('\n')).toEqual(['- document', '  - link [e1] {value withheld}', '    - text "unrelated"']);
  });

  it('joins top-level pieces that have no document root (F7)', () => {
    const collected = page([n('paragraph', {}, n('generic', {}, 'Jo'), n('strong', {}, 'hn'), ' Smith'), n('button', { name: 'Save', ref: 'e1' })]);
    const result = run(collected, ['John Smith']);
    expect(everything(result.outline, result.facts).replace(/\s+/gu, '').toLowerCase()).not.toMatch(/jo|hn|smith/u);
    expect(result.outline.text).toContain('button "Save" [e1]');
    const roots = page([n('generic', {}, 'Jo'), n('generic', {}, 'hn'), n('generic', {}, 'Smith')]);
    expect(run(roots, ['John Smith']).outline.text).not.toMatch(/Jo|hn|Smith/u);
  });

  it('prints no {in=} label from a row whose name carries the value, and no scope name', () => {
    const collected = page([n('document', {},
      n('row', { name: 'Zephyr Quartz Ninefold edit', ref: 'e1' }, n('textbox', { ref: 'e2' }), n('generic', {}, 'Zephyr'), n('generic', {}, 'Quartz Ninefold')),
      n('row', { name: 'Public row', ref: 'e5' }, n('textbox', { ref: 'e6' })))]);
    const result = run(collected, [VALUE]);
    expect(result.outline.text).toContain("{in=\"row 'Public row'\"}");
    expect(result.outline.text).not.toMatch(/Zephyr|Quartz|Ninefold/u);
    const internal = (() => {
      const counters = newCounters();
      const tree = buildRendered(collected, createPrivateMatcher([VALUE]), counters);
      return tree.nodes.map((node) => node.rawName).join('|');
    })();
    expect(internal).not.toMatch(/Zephyr|Quartz|Ninefold/u);
  });

  it('keeps author-named landmarks above a withheld descendant named, but clears content-named ancestors', () => {
    const collected = page([n('document', {}, n('main', { name: 'Account', ref: 'e1' }, n('link', { name: 'Open profile', ref: 'e2' }, n('generic', {}, VALUE)), n('button', { name: 'Close', ref: 'e3' })))]);
    const lines = outlineOf(collected, [VALUE]);
    expect(lines).toEqual(['- document', '  - main "Account" [e1]', '    - link [e2] {value withheld} {in="main \'Account\'"}', '    - button "Close" [e3]']);
  });

  it('taint: a content-named ancestor above a withheld descendant renders no name even when its own name shows no trace of the value', () => {
    const collected = page([n('document', {},
      n('listitem', { name: 'Entry summary', ref: 'e1' }, n('button', { name: 'Hidden Person', ref: 'e2' })),
      n('region', { name: 'Entry panel', ref: 'e3' }, n('button', { name: 'Hidden Person', ref: 'e4' })))]);
    const lines = outlineOf(collected, ['Hidden Person']);
    expect(lines).toEqual(['- document', '  - listitem', '    - button [e2] {ordinal=1/2} {value withheld} {in="listitem"}', '  - region "Entry panel" [e3]', '    - button [e4] {ordinal=2/2} {value withheld} {in="region \'Entry panel\'"}']);
    const internal = run(collected, ['Hidden Person']);
    expect(everything(internal.outline, internal.facts)).not.toContain('Entry summary');
  });

  it('compacts a single string whose spacing differs from the value', () => {
    const collected = page([n('document', {}, n('button', { name: 'Zeph yr Quartz Nine fold', ref: 'e1' }), n('paragraph', {}, 'Zephyr  Quartz Ninefold'), n('paragraph', {}, 'fine'))]);
    const lines = outlineOf(collected, [VALUE]);
    expect(lines).toEqual(['- document', '  - button [e1] {value withheld}', '  - text "fine"']);
  });

  it('finds a value in URL forms across pieces', () => {
    const collected = page([n('document', {}, n('link', { name: 'Open', ref: 'e1', url: '/p/zephyr%20quartz%20ninefold' }), n('paragraph', {}, 'x=zephyr+quartz+', 'ninefold'))]);
    const lines = outlineOf(collected, [VALUE]);
    expect(lines.join('\n')).not.toMatch(/zephyr/iu);
  });

  it('is deterministic: the same input and the same inventory in any order give the same result', () => {
    const collected = page([n('document', {}, n('paragraph', { ref: 'e1' }, n('generic', {}, 'Zephyr '), n('generic', {}, 'Quartz Ninefold')), n('button', { name: 'ALPHA secret', ref: 'e2' }))]);
    const a = run(collected, [VALUE, 'ALPHA secret', 'third value']);
    const b = run(collected, ['third value', 'ALPHA secret', VALUE]);
    expect(b.outline).toEqual(a.outline);
    expect(b.facts).toEqual(a.facts);
    expect(run(collected, [VALUE, 'ALPHA secret', 'third value']).outline).toEqual(a.outline);
  });

  it('takes the claims of ref-less hits to the nearest ref-bearing ancestor', () => {
    const collected = page([n('document', {}, n('listitem', { ref: 'e1' }, n('heading', { name: `${VALUE} title` }, n('generic', {})), n('link', { name: 'Keep', ref: 'e2' })))]);
    const lines = outlineOf(collected, [VALUE]);
    expect(lines).toEqual(['- document', '  - listitem [e1] {value withheld}', '    - link "Keep" [e2]']);
  });
});

describe('D1: explained and direct hits found only by the compact test', () => {
  const VALUE = 'Zephyr Quartz Ninefold';

  it('a compact-only name hit explained by withheld text below removes the name and adds no marker', () => {
    const collected = page([n('document', {}, n('table', {}, n('row', { name: 'Ann Z e p h y r Q u a r t z N i n e f o l d', ref: 'e1' }, n('cell', { name: 'Ann', ref: 'e2' }, 'Ann'), n('cell', { name: VALUE, ref: 'e3' }, VALUE))))]);
    expect(outlineOf(collected, [VALUE])).toEqual(['- document', '  - table', '    - row', '      - cell "Ann" [e2]', '        - text "Ann"', '      - cell [e3] {value withheld}']);
  });

  it('a compact-only name hit with nothing withheld below is direct: stubbed with a marker, children untouched', () => {
    const collected = page([n('document', {}, n('region', { name: 'Z e p h y r Q u a r t z N i n e f o l d', ref: 'e1' }, n('paragraph', {}, 'Hello world'), n('button', { name: 'Go', ref: 'e2' })))]);
    expect(outlineOf(collected, [VALUE])).toEqual(['- document', '  - region [e1] {value withheld}', '    - text "Hello world"', '    - button "Go" [e2]']);
  });

  it('finds the fragments of a long value that only a 12-character window of one piece reveals (the dropped piece stays in the probe)', () => {
    const collected = page([n('document', {}, n('paragraph', { ref: 'e1' }, n('generic', {}, 'Zephyr '), n('generic', {}, 'Quartz Ninefold')))]);
    const lines = outlineOf(collected, [VALUE]);
    expect(lines).toEqual(['- document', '  - paragraph [e1] {value withheld}']);
  });

  it('keeps a text line that is not part of any match, even beside matched ones', () => {
    const collected = page([n('document', {}, n('listitem', { ref: 'e1' }, n('generic', {}, 'Zephyr'), n('generic', {}, ' Quartz Ninefold'), n('generic', {}, 'unrelated note')))]);
    const lines = outlineOf(collected, [VALUE]);
    expect(lines).toContain('    - text "unrelated note"');
    expect(lines.join('\n')).not.toMatch(/Zephyr|Quartz|Ninefold/u);
  });
});

describe('annotate: near, in, headers, group and sibling cells', () => {
  it('uses the text just before an unnamed control in the same parent as its near label', () => {
    const collected = page([n('document', {}, 'Username', n('textbox', { ref: 'e1' }))]);
    expect(outlineOf(collected)).toEqual(['- document', '  - text "Username"', '  - textbox [e1] {near="Username"}']);
  });

  it('finds the nearest text to the left in the same row band, then the text directly above', () => {
    const left = page([n('document', {},
      n('listitem', {}, n('cell', { name: 'Total', ref: 'e1', box: box(0, 0, 80, 20) }, 'Total')),
      n('listitem', {}, n('textbox', { ref: 'e2', box: box(100, 0, 100, 20) })))]);
    expect(outlineOf(left).join('\n')).toContain('- textbox [e2] {near="Total"}');
    const above = page([n('document', {},
      n('listitem', {}, n('cell', { name: 'Notes', ref: 'e1', box: box(0, 80, 100, 18) }, 'Notes')),
      n('listitem', {}, n('textbox', { ref: 'e2', box: box(0, 100, 100, 20) })))]);
    expect(outlineOf(above).join('\n')).toContain('- textbox [e2] {near="Notes"}');
    const none = page([n('document', {}, n('listitem', {}, n('textbox', { ref: 'e2', box: box(500, 500, 100, 20) })))]);
    expect(outlineOf(none).join('\n')).toContain('- textbox [e2] {in="listitem"}'.replace('{in="listitem"}', '').trim());
  });

  it('tells unnamed containers of one role apart by their order, and names the enclosing regions in {in=}', () => {
    const collected = page([n('document', {},
      n('form', {}, n('textbox', { ref: 'e1' })),
      n('form', {}, n('textbox', { ref: 'e2' })),
      n('region', { name: "Bob's panel", ref: 'e3' }, n('textbox', { ref: 'e4' })))]);
    const lines = outlineOf(collected);
    expect(lines).toContain('    - textbox [e1] {ordinal=1/3} {in="form#1/2"}');
    expect(lines).toContain('    - textbox [e2] {ordinal=2/3} {in="form#2/2"}');
    expect(lines).toContain("    - textbox [e4] {ordinal=3/3} {in=\"region 'Bob’s panel'\"}");
  });

  it('names a repeated control by the container it sits in', () => {
    const collected = page([n('document', {},
      n('listitem', { name: 'First', ref: 'e1' }, n('button', { name: 'Delete', ref: 'e2' })),
      n('listitem', { name: 'Second', ref: 'e3' }, n('button', { name: 'Delete', ref: 'e4' })))]);
    const lines = outlineOf(collected);
    expect(lines).toContain("    - button \"Delete\" [e2] {ordinal=1/2} {in=\"listitem 'First'\"}");
    expect(lines).toContain("    - button \"Delete\" [e4] {ordinal=2/2} {in=\"listitem 'Second'\"}");
  });

  it('gives a table cell its row and column header names, and the other cells of its row (never its own, never withheld ones)', () => {
    const collected = page([n('table', { name: 'Codes', ref: 'e1' },
      n('row', {}, n('columnheader', { name: 'Code', ref: 'e2', box: box(0, 0, 100, 20) }, 'Code'), n('columnheader', { name: 'Description', ref: 'e3', box: box(100, 0, 200, 20) }, 'Description')),
      n('row', {}, n('rowheader', { name: 'Status', ref: 'e4' }, 'Status'), n('cell', { name: '418', ref: 'e5', box: box(0, 30, 100, 20) }, '418'), n('cell', { name: '(Unused)', ref: 'e6', box: box(100, 30, 200, 20) }, '(Unused)'), n('cell', { name: 'SECRETVAL', ref: 'e7', box: box(300, 30, 100, 20) }, 'SECRETVAL')))]);
    const result = run(collected, ['SECRETVAL']);
    expect(result.facts.e6?.evidence).toBe('(Unused) (Unused) Status Description 418');
    expect(result.facts.e5?.evidence).toBe('418 418 Status Code (Unused)');
    expect(result.facts.e7?.evidence).toBe('Status 418 (Unused)');
    expect(result.facts.e4?.evidence).toBe('Status Status');
    expect(evidenceSegments(must(internalsOfCollected(result).byRef.get('e6'))).map((segment) => segment.field)).toEqual(['name', 'ownText', 'header', 'header', 'sibling']);
  });

  it('gives a radio, checkbox or option the name of its enclosing group', () => {
    const collected = page([n('document', {}, n('radiogroup', { name: 'View as', ref: 'e1' }, n('radio', { name: 'List', ref: 'e2' }), n('radio', { name: 'Grid', ref: 'e3' })))]);
    expect(run(collected).facts.e2?.evidence).toBe('List View as');
  });
});

/** The rendered nodes behind a result of perceiveCollected. */
function internalsOfCollected(result: ReturnType<typeof perceiveCollected>): { byRef: Map<string, RenderedNode> } {
  return { byRef: result.byRef };
}

describe('guardDerived', () => {
  const node = (extra: Partial<RenderedNode>): RenderedNode => ({
    i: 0, parent: -1, depth: 0, kids: [], kind: 'node', role: 'textbox', name: '', rawName: '', ref: 'e1', states: [], placeholder: undefined, url: undefined, box: null,
    interactive: true, clickable: false, withheld: false, cleared: false, tag: undefined, text: '', coarse: false, what: '', ownText: '', near: undefined, inHint: undefined,
    headers: undefined, groupName: undefined, siblings: undefined, ...extra,
  });

  it('drops derived strings that carry a private value (also split) and counts them', () => {
    const tree: RenderedTree = { nodes: [node({ near: 'Account SECRET9', inHint: "region 'SE CRET9'", groupName: 'SECRET9 group', headers: ['ok', 'SECRET9'], siblings: ['fine', 'S E C R E T 9'] })], rootKids: [0] };
    const counters = newCounters();
    guardDerived(tree, createPrivateMatcher(['SECRET9']), counters);
    expect(tree.nodes[0]).toMatchObject({ near: undefined, inHint: null, groupName: undefined, headers: ['ok'], siblings: ['fine'] });
    expect(counters.withheldPrivate).toBe(5);
  });

  it('drops a derived string that only reveals the value together with the name (joined evidence, F9)', () => {
    const tree: RenderedTree = { nodes: [node({ role: 'button', name: 'Quillon', rawName: 'Quillon', near: 'Marsh', groupName: 'Billing', headers: ['Total'] })], rootKids: [0] };
    const counters = newCounters();
    guardDerived(tree, createPrivateMatcher(['Quillon Marsh']), counters);
    expect(tree.nodes[0]).toMatchObject({ near: undefined, groupName: 'Billing', headers: ['Total'] });
    expect(counters.withheldPrivate).toBe(1);
  });

  it('drops the last involved derived string until the joined strings are clean, and never the node\'s own (F9)', () => {
    const tree: RenderedTree = { nodes: [node({ role: 'button', name: 'Quillon Marsh', rawName: 'Quillon Marsh', near: 'unrelated' })], rootKids: [0] };
    guardDerived(tree, createPrivateMatcher(['Quillon Marsh']), newCounters());
    expect(tree.nodes[0]).toMatchObject({ near: 'unrelated', name: 'Quillon Marsh' }); // its own name is step 2's business
    const inHint: RenderedTree = { nodes: [node({ role: 'button', name: 'Quillon', rawName: 'Quillon', inHint: 'Marsh', siblings: ['Marsh'] })], rootKids: [0] };
    guardDerived(inHint, createPrivateMatcher(['Quillon Marsh']), newCounters());
    expect(inHint.nodes[0]).toMatchObject({ inHint: null, siblings: undefined });
  });

  it('removes a list that ends up empty and does nothing without private values', () => {
    const tree: RenderedTree = { nodes: [node({ headers: ['SECRET9'], siblings: ['SECRET9'] })], rootKids: [0] };
    guardDerived(tree, createPrivateMatcher(['SECRET9']), newCounters());
    expect(tree.nodes[0]?.headers).toBeUndefined();
    expect(tree.nodes[0]?.siblings).toBeUndefined();
    const untouched: RenderedTree = { nodes: [node({ near: 'SECRET9' })], rootKids: [0] };
    guardDerived(untouched, createPrivateMatcher([]), newCounters());
    expect(untouched.nodes[0]?.near).toBe('SECRET9');
  });
});

describe('render lines and shown refs', () => {
  it('renders every kind and shows a ref only where a model may name it', () => {
    const collected = page([n('document', {}, n('generic', { ref: 'e1' }, n('paragraph', {}, 'a'), n('paragraph', {}, 'b')), n('img', { name: 'Logo', ref: 'e2' }), n('list', { ref: 'e3' }, n('listitem', { ref: 'e4' }, 'x', n('link', { name: 'L', ref: 'e5' }))))]);
    const result = run(collected);
    const refs = [...result.byRef.keys()];
    expect(refs).toEqual(['e2', 'e5']);
    expect(Object.keys(result.facts)).toEqual(refs);
    const only = result.tree.nodes.find((candidate) => candidate.ref === 'e2');
    expect(only && shownRef(only)).toBe('e2');
    expect(result.tree.nodes.filter((candidate) => candidate.kind === 'node').map((candidate) => renderLine(candidate)).join('\n')).toContain('- img "Logo" [e2]');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Focus projection.

/** 40 listitems of [textbox, link] under one list: base-set expansion by parents and siblings reaches nearly everything. */
const densePage = (): CollectedPage => page([n('document', {},
  n('banner', {}, n('heading', { name: 'Top', ref: 'e1', level: 1 })),
  n('main', {}, n('list', {}, ...Array.from({ length: 40 }, (_, i) => n('listitem', {}, n('textbox', { name: `Field w${String(i)}x`, ref: `e${String(i * 3 + 10)}` }), n('link', { name: `w${String(i)}x`, ref: `e${String(i * 3 + 11)}` }))))))]);

/** Two form controls among 120 filler items: parents and siblings are a small part of the page. */
const sparsePage = (): CollectedPage => {
  const filler = Array.from({ length: 120 }, (_, i) => n('listitem', {}, `filler text number ${String(i)} with some words`));
  return page([n('document', {}, n('main', {}, ...filler.slice(0, 40), n('textbox', { name: 'Needle field', ref: 'e1' }), ...filler.slice(40, 80), n('textbox', { name: 'Second field', ref: 'e2' }), ...filler.slice(80)))]);
};

describe('focus projection (40,000 bytes by default)', () => {
  it('does not project an outline that fits, and ends a projected one with the tail line', () => {
    const fits = run(densePage(), [], { maxBytes: 100_000 });
    expect(fits.outline.projected).toBe(false);
    expect(fits.outline.notShown).toBe(0);
    expect(fits.outline.text).not.toContain('more nodes not shown');
    const cut = run(densePage(), [], { stepText: 'Open w7x', maxBytes: 1600 });
    expect(cut.outline.projected).toBe(true);
    const lines = cut.outline.text.split('\n');
    expect(lines.at(-1)).toBe(`${U2026} ${String(cut.outline.notShown)} more nodes not shown`);
    expect(Buffer.from(lines.at(-1) ?? '').subarray(0, 3).toString('hex')).toBe('e280a6');
    expect(cut.outline.totalNodes).toBe(cut.outline.shownNodes + cut.outline.notShown);
  });

  it.each([
    ['focus+parent+siblings', sparsePage, 'Open Needle', 1000],
    ['focus+parent', densePage, 'Open w7x', 2200],
    ['focus', densePage, 'Open w7x', 1600],
    ['truncated', densePage, 'Open w7x', 200],
  ] as const)('reaches the %s tier and stays within the byte budget', (tier, make, stepText, maxBytes) => {
    const result = run(make(), [], { stepText, maxBytes });
    expect(result.outline.projectionTier).toBe(tier);
    expect(result.outline.bytes).toBeLessThanOrEqual(maxBytes);
    expect(result.outline.text.split('\n').at(-1)).toMatch(/^… \d+ more nodes not shown$/u);
  });

  it('never exceeds the budget at any size, and keeps the nodes the step names and the landmarks / controls', () => {
    const tiers = new Set<string | null>();
    for (let maxBytes = 200; maxBytes <= 4000; maxBytes += 50) {
      const result = run(densePage(), [], { stepText: 'Open w7x', maxBytes });
      tiers.add(result.outline.projectionTier);
      expect(result.outline.bytes, `at ${String(maxBytes)}`).toBeLessThanOrEqual(maxBytes);
      if (result.outline.projectionTier !== 'truncated' && result.outline.projected) {
        expect(result.outline.text).toContain('link "w7x"');
        expect(result.outline.text).toContain('heading "Top"');
        expect(result.outline.text).toContain('textbox "Field w1x"');
      }
    }
    expect([...tiers]).toEqual(expect.arrayContaining(['truncated', 'focus', 'focus+parent', null]));
  });

  it('keys the projection on the targetIntent as well as the step text', () => {
    const byStep = run(densePage(), [], { stepText: 'Open w7x', maxBytes: 1600 }).outline.text;
    const byIntent = run(densePage(), [], { stepText: 'Do it', targetIntents: ['w9x'], maxBytes: 1600 }).outline.text;
    expect(byStep).toContain('link "w7x"');
    expect(byStep).not.toContain('link "w9x"');
    expect(byIntent).toContain('link "w9x"');
    const several = run(densePage(), [], { targetIntents: ['w3x', '', 'w4x'], maxBytes: 1600 }).outline.text;
    expect(several).toContain('link "w3x"');
    expect(several).toContain('link "w4x"');
  });

  it('is never empty: a page larger than any budget still shows what the step names', () => {
    const huge = run(densePage(), [], { stepText: 'Open w7x', maxBytes: 600 });
    expect(huge.outline.shownNodes).toBeGreaterThan(0);
    expect(huge.outline.text.length).toBeGreaterThan(0);
  });

  describe('options of a kept combobox or listbox', () => {
    const options = Array.from({ length: 150 }, (_, i) => n('option', { name: `o${String(i + 1)}x` }));
    const withOptions = (): CollectedPage => page([n('document', {}, n('main', {},
      n('combobox', { name: 'Country', ref: 'e1' }, ...options),
      ...Array.from({ length: 30 }, (_, i) => n('listitem', {}, `filler ${String(i)} text`))))]);

    it('keeps up to 60 options and says how many are not shown', () => {
      const result = run(withOptions(), [], { stepText: 'Do it', maxBytes: 1500 });
      const lines = result.outline.text.split('\n');
      expect(OPTION_CAP).toBe(60);
      expect(lines.filter((line) => line.includes('option "'))).toHaveLength(60);
      expect(lines).toContain(`      ${U2026} 90 more options`);
      expect(lines.indexOf(`      ${U2026} 90 more options`)).toBe(lines.findIndex((line) => line.includes('option "o60x"')) + 1);
    });

    it('keeps an option beyond the cap when the step names it', () => {
      const result = run(withOptions(), [], { stepText: 'Pick o120x', maxBytes: 2000 });
      expect(result.outline.text).toContain('option "o120x"');
      expect(result.outline.text).toContain(`${U2026} 89 more options`);
    });

    it('applies to a listbox, and groups of options', () => {
      const grouped = page([n('document', {}, n('listbox', { name: 'Pick', ref: 'e1' }, n('group', { name: 'G' }, ...options.slice(0, 80)), ...options.slice(80, 100)), ...Array.from({ length: 80 }, (_, i) => n('listitem', {}, `filler ${String(i)} more words`)))]);
      const result = run(grouped, [], { maxBytes: 3200 });
      const lines = result.outline.text.split('\n');
      expect(lines.filter((line) => line.includes('option "'))).toHaveLength(60);
      expect(lines.some((line) => line.trim() === `${U2026} 40 more options`)).toBe(true);
    });
  });

  it('project() is exported with the same contract as the spike', () => {
    const tree = buildRendered(densePage(), createPrivateMatcher([]), newCounters());
    annotate(tree);
    const lines = tree.nodes.map(renderLine);
    const projection = project(tree.nodes, lines, { stepText: 'Open w7x', maxBytes: 1600 });
    expect(projection.tier).toBe('focus');
    expect(projection.keptIndexes.length + projection.notShown).toBe(tree.nodes.length);
    expect(project(tree.nodes, lines).tier).toBe('focus+parent+siblings');
  });
});

describe('project(): truncated tier seeds the target-intent row and its sources', () => {
  type Spec = Partial<RenderedNode> & { role: string; parent: number };
  const build = (specs: Spec[]): RenderedNode[] => {
    const nodes: RenderedNode[] = specs.map((spec, i) => ({
      i, depth: 0, kids: [], kind: 'node', name: '', rawName: '', ref: undefined, states: [], placeholder: undefined, url: undefined, box: null,
      interactive: false, clickable: false, withheld: false, cleared: false, tag: undefined, text: '', coarse: false, what: '', ownText: '', near: undefined,
      inHint: undefined, headers: undefined, groupName: undefined, siblings: undefined, ...spec,
    }));
    for (const node of nodes) if (node.parent >= 0) { const parent = nodes[node.parent]; if (parent) { parent.kids.push(node.i); node.depth = parent.depth + 1; } }
    return nodes;
  };
  const linesOf = (nodes: RenderedNode[]): string[] => nodes.map((node) => `${'  '.repeat(node.depth)}- ${node.role} ${JSON.stringify(node.rawName)}`);
  const withText = (name: string): Partial<RenderedNode> => ({ rawName: name, name, ownText: name });
  const oversized = (withIntentRow: boolean): RenderedNode[] => {
    const specs: Spec[] = [{ role: 'document', parent: -1 }];
    for (let k = 0; k < 300; k++) specs.push({ role: 'paragraph', parent: 0, ...withText(`python filler paragraph number ${String(k)}`) });
    // Generic rows matched only by the step word "python" come first and would consume ROW_CAP.
    specs.push({ role: 'table', parent: 0 });
    const generic = specs.length - 1;
    for (let r = 0; r < 12; r++) {
      specs.push({ role: 'row', parent: generic });
      const row = specs.length - 1;
      specs.push({ role: 'cell', parent: row, ...withText(`python generic row ${String(r)}`) });
      specs.push({ role: 'cell', parent: row, ...withText(`generic value ${String(r)}`) });
    }
    if (withIntentRow) {
      specs.push({ role: 'table', parent: 0 });
      const table = specs.length - 1;
      specs.push({ role: 'caption', parent: table, ref: 'e-title', ...withText('Python') });
      specs.push({ role: 'row', parent: table });
      const row = specs.length - 1;
      specs.push({ role: 'cell', parent: row, ref: 'e-label', ...withText('Designed by') });
      specs.push({ role: 'cell', parent: row, ref: 'e-value', ...withText('Guido van Rossum'), readScope: { relation: 'SAME_ROW_LABEL', sourceRefs: ['e-title', 'e-label'], tableTitleRef: 'e-title' } as never });
    }
    return build(specs);
  };
  const o = { stepText: 'Copy the "Designed by" value from the infobox for Python', targetIntent: 'Designed by', maxBytes: 2500 };

  it('keeps the value cell and its readScope sources when every tier overflows', () => {
    const nodes = oversized(true);
    const lines = linesOf(nodes);
    const result = project(nodes, lines, o);
    expect(result.tier).toBe('truncated');
    const shown = result.lines.join('\n');
    for (const expected of ['"Guido van Rossum"', '"Designed by"', '"Python"']) expect(shown).toContain(expected);
    expect(Buffer.byteLength([...result.lines, `… ${String(result.notShown)} more nodes not shown`].join('\n'), 'utf8')).toBeLessThanOrEqual(o.maxBytes);
    expect(project(nodes, lines, o)).toEqual(result);
  });

  it('never keeps a value cell without its sources when the seed does not fit', () => {
    const nodes = oversized(true);
    const result = project(nodes, linesOf(nodes), { ...o, maxBytes: 120 });
    expect(result.tier).toBe('truncated');
    expect(result.lines.join('\n')).not.toContain('Guido van Rossum');
  });

  it('without a target-intent row the truncated tier is the base set in document order', () => {
    const nodes = oversized(false);
    const lines = linesOf(nodes);
    const result = project(nodes, lines, o);
    expect(result.tier).toBe('truncated');
    const base = nodes.filter((node) => node.ownText.includes('python')).map((node) => node.i);
    expect(result.keptIndexes).toEqual(base.slice(0, result.keptIndexes.length));
    expect(result.keptIndexes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Facts and evidence.

describe('facts table', () => {
  it('holds role, name, editable, evidence and text for every shown ref, in tree order', () => {
    const collected = page([n('document', {}, n('heading', { name: 'Title', ref: 'e1', level: 1 }), n('textbox', { name: 'Search', ref: 'e2', placeholder: 'type here' }), n('button', { name: 'Go', ref: 'e3' }))]);
    const result = run(collected);
    expect(Object.keys(result.facts)).toEqual(['e1', 'e2', 'e3']);
    expect(result.facts.e1).toEqual({ role: 'heading', name: 'Title', editable: false, nameComplete: true, ownTextComplete: true, evidence: 'Title', text: 'Title' });
    expect(result.facts.e2).toEqual({ role: 'textbox', name: 'Search', editable: false, nameComplete: true, ownTextComplete: true, evidence: 'Search type here' });
    expect(result.facts.e3).toEqual({ role: 'button', name: 'Go', editable: false, nameComplete: true, ownTextComplete: true, evidence: 'Go', text: 'Go' });
  });

  it('has no text for the value roles, and none when the node or anything below it is withheld, a password or unsupported', () => {
    const collected = page([n('document', {},
      n('combobox', { name: 'C', ref: 'e1' }),
      n('searchbox', { name: 'S', ref: 'e2' }),
      n('spinbutton', { name: 'P', ref: 'e3' }),
      n('slider', { name: 'L', ref: 'e4' }),
      n('listbox', { name: 'B', ref: 'e5' }),
      n('region', { name: 'Box', ref: 'e6' }, n('textbox', { name: 'Password', ref: 'e7' }), n('paragraph', {}, 'visible')),
      n('region', { name: 'Plain', ref: 'e8' }, n('paragraph', {}, 'visible too')))],
    { e7: elementFacts('input', { type: 'password', password: true, valueControl: true }) });
    const result = run(collected);
    for (const ref of ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']) expect(result.facts[ref], ref).not.toHaveProperty('text');
    expect(result.facts.e8?.text).toBe('Plain visible too');
  });

  it('is editable for an editable root and for a combobox that is an input or a textarea, not a select', () => {
    const collected = page([n('document', {},
      n('generic', { name: 'Editor', ref: 'e1' }, 'x'),
      n('combobox', { name: 'Typeahead', ref: 'e2' }),
      n('combobox', { name: 'Select', ref: 'e3' }),
      n('combobox', { name: 'Area', ref: 'e4' }))],
    { e1: elementFacts('div', { editable: true,  editableRoot: true }), e2: elementFacts('input', { type: 'text', valueControl: true }), e3: elementFacts('select', { valueControl: true }), e4: elementFacts('textarea', { valueControl: true }) });
    const result = run(collected);
    expect(['e1', 'e2', 'e3', 'e4'].map((ref) => result.facts[ref]?.editable)).toEqual([true, true, false, true]);
  });

  it('describes a text line that carries a ref', () => {
    const result = run(page([n('document', {}, n('paragraph', { ref: 'e1' }, 'Hello there'))]));
    expect(result.facts.e1).toEqual({ role: 'text', name: '', editable: false, nameComplete: true, ownTextComplete: false, evidence: 'Hello there', text: 'Hello there' });
  });

  it('caps name, evidence and text at 256 characters with the U+2026 glyph', () => {
    const long = 'w'.repeat(300);
    const collected = page([n('region', { name: long, ref: 'e1' }, n('button', { name: long, ref: 'e2' }), n('paragraph', {}, long))]);
    const facts = run(collected).facts;
    expect(Array.from(facts.e2?.name ?? '')).toHaveLength(256);
    expect(facts.e2?.name.endsWith(U2026)).toBe(true);
    expect(Array.from(facts.e2?.evidence ?? '')).toHaveLength(256);
    expect(facts.e2?.evidence.endsWith(U2026)).toBe(true);
    expect(Array.from(facts.e1?.text ?? '')).toHaveLength(256);
    expect(facts.e1?.text?.endsWith(U2026)).toBe(true);
  });

  it('evidence lists name, placeholder, near, own text, group and headers in that order, with a segment for each', () => {
    const collected = page([n('document', {}, 'Near label', n('textbox', { ref: 'e1', placeholder: 'hint' }))]);
    const result = run(collected);
    expect(result.facts.e1?.evidence).toBe('hint Near label');
    const node = must(result.byRef.get('e1'));
    expect(evidenceSegments(node)).toEqual([{ field: 'placeholder', start: 0, end: 4 }, { field: 'near', start: 5, end: 15 }]);
    expect(result.segments.e1).toEqual(evidenceSegments(node));
    expect(evidenceFor(node)).toBe('hint Near label');
    expect(evidenceFor(undefined)).toBe('');
  });

  it('segments are ordered, non-overlapping, inside the string, slice to their text, and plain JSON; the cap clips them', () => {
    const cells = Array.from({ length: 12 }, (_, i) => n('cell', { name: `${'c'.repeat(30)}${String(i)}`, ref: `e${String(i + 10)}`, box: box(i * 100, 30, 90, 20) }, `${'c'.repeat(30)}${String(i)}`));
    const collected = page([n('table', {}, n('row', {}, ...cells))]);
    const result = run(collected);
    const segments = result.segments.e10 ?? [];
    const evidence = result.facts.e10?.evidence ?? '';
    expect(segments.map((segment) => segment.field)).toContain('sibling');
    let previousEnd = -1;
    for (const segment of segments) {
      expect(segment.start).toBeGreaterThan(previousEnd - 1);
      expect(segment.end).toBeGreaterThan(segment.start);
      expect(segment.end).toBeLessThanOrEqual(evidence.length);
      previousEnd = segment.end;
    }
    expect(evidence.slice(segments[0]?.start, segments[0]?.end)).toBe(`${'c'.repeat(30)}0`);
    expect(JSON.parse(JSON.stringify(result.segments))).toEqual(result.segments);
    expect(evidence.endsWith(U2026)).toBe(true);
    expect(segments.at(-1)?.end).toBeLessThanOrEqual(evidence.length - 1);
  });

  it('evidenceFor can leave the sibling cells out (the spike evidence)', () => {
    const collected = page([n('table', {}, n('row', {}, n('cell', { name: 'a', ref: 'e1' }, 'a'), n('cell', { name: 'b', ref: 'e2' }, 'b')))]);
    const node = must(run(collected).byRef.get('e1'));
    expect(evidenceFor(node)).toBe('a a b');
    expect(evidenceFor(node, { siblings: false })).toBe('a a');
  });

  it('deriveFacts takes any subset of shown nodes', () => {
    const collected = page([n('document', {}, n('button', { name: 'One', ref: 'e1' }), n('button', { name: 'Two', ref: 'e2' }))]);
    const counters = newCounters();
    const tree = buildRendered(collected, createPrivateMatcher([]), counters);
    annotate(tree);
    const only = deriveFacts(tree, new Set([2]));
    expect(Object.keys(only.facts)).toEqual(['e2']);
    expect(Object.keys(only.segments)).toEqual(['e2']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// AC1 layer 1: the spike's pure pipeline (committed verbatim copy, test/fixtures/spike-pure) against this one, on the
// raw objects the spike collected, so no browser, font or machine enters the comparison. Layer 2 (live, in the
// perception tier) checks the in-page port and the layout-dependent parts.

describe('AC1 layer 1: parity with the spike pure pipeline at freeze B', () => {
  const baseline: Baseline = loadBaseline();
  const collected = loadCollected();
  const differences = loadDifferences() as unknown as {
    kinds: Record<string, string>;
    outline: Record<string, { kind: string; reason: string; removed: string[]; added: string[] }>;
    facts: Record<string, Record<string, { kind: string; reason: string; fields: string[] }>>;
    siblings: Record<string, Record<string, string>>;
  };
  const entriesOf = (pass: { inventory: [string, boolean][]; privateValues: string[] }): [string, boolean][] => [...pass.inventory, ...pass.privateValues.map((value): [string, boolean] => [value, true])];
  const cases = Object.entries(baseline.pages).flatMap(([id, entry]) => Object.entries(entry.passes).map(([passId, pass]) => ({ id, passId, key: `${id}|${passId}`, pass })));

  it('covers every observed-authoring fixture page and the committed large pages, two passes each', () => {
    expect(cases.length).toBeGreaterThanOrEqual(48);
    expect(Object.keys(baseline.pages).filter((id) => id.startsWith('large/'))).toEqual(['large/large-catalog.html', 'large/large-form.html']);
    expect(baseline.freeze.harnessSha256).toBe('c46e72077cae491c919254b961571842919b4bb80b3dcad963b141b34f8b6388');
    expect(Object.keys(baseline.freeze.files)).toHaveLength(33);
    expect(Object.keys(collected).sort()).toEqual(Object.keys(baseline.pages).sort());
    const tiers = new Set(cases.map((c) => c.pass.projection.tier));
    expect(tiers.has('truncated')).toBe(true);
    expect(tiers.has('focus+parent')).toBe(true);
    expect(cases.some((c) => c.pass.outline.includes('more options'))).toBe(true);
  });

  it.each(cases.map((c) => [c.key, c] as const))('the committed spike copy reproduces the recorded spike output exactly: %s', (_key, c) => {
    const raw = collected[c.id];
    expect(raw).toBeDefined();
    const spike = spikeRun(must(raw), entriesOf(c.pass), { stepText: c.pass.stepText, targetIntent: c.pass.targetIntent });
    expect(spike.outline).toBe(c.pass.outline);
    expect(spike.facts).toEqual(c.pass.facts);
    for (const [name, value] of Object.entries(c.pass.counters)) expect(spike.counters[name], name).toBe(value);
  });

  const actualOutline: Record<string, { removed: string[]; added: string[] }> = {};
  const actualFacts: Record<string, Record<string, string[]>> = {};
  const actualSiblings: Record<string, Record<string, string>> = {};
  const atomicDrops = new Map<string, Set<string>>();
  const completedFixturePasses: string[] = [];
  // Each original fixture retains the default five-second deadline. The original named
  // aggregate below requires every pass, in the original order, before comparing all maps.
  it.sequential.each(cases)('compares frozen fixture pass $key under the unchanged deadline', c => {
    expect(completedFixturePasses).not.toContain(c.key);
    const raw = must(collected[c.id]);
    const entries = entriesOf(c.pass);
    const spike = spikeRun(raw, entries, { stepText: c.pass.stepText, targetIntent: c.pass.targetIntent });
    const result = perceiveCollected(raw, createPrivateMatcher(entries), { stepText: c.pass.stepText, targetIntents: [c.pass.targetIntent] });
    validatePublicObservation({ outline: result.outline.text, facts: Object.fromEntries(Object.entries(result.facts).map(([ref, fact]) => [ref, { ...fact, evidenceSegments: result.segments[ref] ?? [] }])) } as never);
    // Only the new explicit ordinal marker is absent from the old outline format. Its exact
    // index/count/class/order has already been independently validated above.
    const oldFormat = result.outline.text.replace(/ \{ordinal=[0-9]+\/[0-9]+\}/gu, '');
    const dropped = new Set(Object.keys(c.pass.facts).filter(ref => result.facts[ref] === undefined));
    if (dropped.size) {
      // Freeze B's private large form offered part of one duplicate class. Current projection
      // must offer the FULL class or no member. This exact vector is the approved projection delta.
      expect(c.key).toBe('large/large-form.html|private');
      const complete = perceiveCollected(raw, createPrivateMatcher(entries), { maxBytes: 1000000 });
      for (const ref of dropped) {
        const fullFact = complete.facts[ref]; expect(fullFact?.ordinal?.count).toBeGreaterThan(1);
        const peers = Object.entries(complete.facts).filter(([, f]) => f.role === fullFact?.role && f.name === fullFact.name && f.evidence === fullFact.evidence);
        expect(peers.length).toBe(fullFact?.ordinal?.count);
        expect(peers.every(([peer]) => result.facts[peer] === undefined)).toBe(true);
      }
      atomicDrops.set(c.key, dropped);
      const allowed = new Set([...spike.outline.split('\n'), ...(differences.outline[c.key]?.added ?? [])]);
      for (const line of oldFormat.split('\n')) if (!/^… [0-9]+ more nodes not shown$/u.test(line)) expect(allowed.has(line), line).toBe(true);
      expect(result.outline.bytes).toBeLessThanOrEqual(40000);
      expect(result.outline.notShown).toBeGreaterThan(c.pass.projection.notShown);
    } else {
      const diff = lineDiff(spike.outline.split('\n'), oldFormat.split('\n'));
      if (diff.removed.length || diff.added.length) actualOutline[c.key] = diff;
    }
    for (const [ref, fact] of Object.entries(c.pass.facts)) {
      const tsFact = result.facts[ref];
      if (atomicDrops.get(c.key)?.has(ref)) continue;
      expect(tsFact, `${c.key} ${ref}`).toBeDefined();
      if (!tsFact) continue;
      const sibling = result.segments[ref]?.find((segment) => segment.field === 'sibling');
      if (sibling) (actualSiblings[c.key] ??= {})[ref] = tsFact.evidence.slice(sibling.start);
      const fields = factDifferences(fact, tsFact, sibling?.start);
      if (fields.length) (actualFacts[c.key] ??= {})[ref] = fields;
    }
    for (const ref of Object.keys(result.facts)) expect(c.pass.facts[ref], `${c.key} ${ref} only in the new pipeline`).toBeDefined();
    if (!(c.key in differences.outline) && !(c.key in differences.facts)) {
      for (const name of ['withheldPrivate', 'withheldKept', 'withheldSensitive', 'echoScrubbed', 'valuesStripped', 'unsupported', 'passwordControls'] as const) {
        expect(result.counters[name], `${c.key} counter ${name}`).toBe(spike.counters[name]);
      }
    }
    completedFixturePasses.push(c.key);
  });

  it('differs from the spike only where differences.json documents it (outline lines, facts, sibling cells)', () => {
    const expectedFixturePasses = cases.map(c => c.key);
    expect(expectedFixturePasses).toHaveLength(48);
    expect(new Set(expectedFixturePasses).size).toBe(48);
    expect(completedFixturePasses).toEqual(expectedFixturePasses);
    const documentedOutline = Object.fromEntries(Object.entries(differences.outline).filter(([key]) => !atomicDrops.has(key)).map(([key, entry]) => [key, { removed: entry.removed, added: entry.added }]));
    const documentedFacts = Object.fromEntries(Object.entries(differences.facts).map(([key, refs]) => [key, Object.fromEntries(Object.entries(refs).filter(([ref]) => !atomicDrops.get(key)?.has(ref)).map(([ref, entry]) => [ref, entry.fields]))]));
    expect(actualOutline).toEqual(documentedOutline);
    expect(actualFacts).toEqual(documentedFacts);
    expect(actualSiblings).toEqual(Object.fromEntries(Object.entries(differences.siblings).map(([key, refs]) => [key, Object.fromEntries(Object.entries(refs).filter(([ref]) => !atomicDrops.get(key)?.has(ref)))])));
  });

  it('documents every difference with a known kind and a reason', () => {
    const kinds = new Set(Object.keys(differences.kinds));
    expect([...kinds].sort()).toEqual(['D1', 'D1-TAINT', 'D2', 'EVIDENCE-SIBLINGS', 'FACTS-NAME-CAP']);
    for (const entry of Object.values(differences.outline)) {
      expect(kinds.has(entry.kind)).toBe(true);
      expect(entry.reason.length).toBeGreaterThan(20);
    }
    for (const refs of Object.values(differences.facts)) {
      for (const entry of Object.values(refs)) {
        expect(kinds.has(entry.kind)).toBe(true);
        expect(entry.reason.length).toBeGreaterThan(20);
      }
    }
    for (const kind of kinds) expect((differences.kinds[kind] ?? '').length).toBeGreaterThan(20);
  });

  it('FACTS-NAME-CAP: a name of more than 256 characters is capped in facts (the spike keeps it whole)', () => {
    const long = 'n'.repeat(300);
    const raw = page([n('document', {}, n('button', { name: long, ref: 'e1' }))]);
    const spike = spikeRun(raw, [], { stepText: '', targetIntent: '' });
    expect(spike.facts.e1?.name).toHaveLength(300);
    const result = run(raw);
    expect(result.facts.e1?.name).toHaveLength(256);
    expect(factDifferences(spike.facts.e1 as never, result.facts.e1 as never, undefined)).toEqual(['name']);
  });

  describe('synthetic trees', () => {
    const same = (raw: CollectedPage, entries: [string, boolean][], o: { stepText: string; targetIntent: string; maxBytes: number }): void => {
      const spike = spikeRun(raw, entries, o);
      const result = perceiveCollected(raw, createPrivateMatcher(entries), { stepText: o.stepText, targetIntents: [o.targetIntent], maxBytes: o.maxBytes });
      expect(result.outline.text.split('\n')).toEqual(spike.outline.split('\n'));
      expect(Object.fromEntries(Object.entries(result.facts).map(([ref, fact]) => { return [ref, Object.fromEntries(Object.entries(fact).filter(([key]) => !['nameComplete','ownTextComplete'].includes(key)))]; }))).toEqual(spike.facts);
    };

    it('projection at every tier, from 200 to 6,000 bytes, matches the spike byte for byte', () => {
      for (const make of [densePage, sparsePage]) {
        for (let maxBytes = 200; maxBytes <= 6000; maxBytes += 100) same(make(), [], { stepText: 'Open w7x Needle', targetIntent: 'w3x', maxBytes });
      }
    });

    it('the 60-option cap and the tail lines match the spike', () => {
      const options = Array.from({ length: 150 }, (_, i) => n('option', { name: `o${String(i + 1)}x`, ref: `e${String(i + 5)}` }));
      const raw = page([n('document', {}, n('main', {}, n('combobox', { name: 'Country', ref: 'e1' }, ...options), n('listbox', { name: 'L', ref: 'e2' }, ...options.slice(0, 70)), ...Array.from({ length: 60 }, (_, i) => n('listitem', {}, `filler ${String(i)} text`))))],
        { e1: elementFacts('select', { valueControl: true }) });
      for (const maxBytes of [1500, 2500, 4000, 6000]) same(raw, [], { stepText: 'Pick o120x', targetIntent: '', maxBytes });
    });

    it('private values that only hit single strings of nodes without neighbours match the spike', () => {
      const raw = page([n('document', {}, n('button', { name: 'Hello SPK_NAME', ref: 'e1' }), n('textbox', { name: 'Field', ref: 'e2', placeholder: 'SPK_PH' }), n('link', { name: 'Go', ref: 'e3', url: '/u/SPK_URL' }), n('heading', { name: 'SPK_HEAD title' }))]);
      same(raw, [['SPK_NAME', true], ['SPK_PH', true], ['SPK_URL', true], ['SPK_HEAD', true]], { stepText: '', targetIntent: '', maxBytes: 40000 });
    });

    it('password, sensitive, iframe, value-stripping and echo handling match the spike', () => {
      const raw = page(
        [n('document', {}, n('textbox', { name: 'User', ref: 'e1' }, 'typed'), n('textbox', { name: 'Pw', ref: 'e2' }), n('generic', { ref: 'e3' }, 'secret'), n('iframe', { ref: 'e4' }), n('paragraph', {}, 'echo me'),
          n('combobox', { name: 'C', ref: 'e5' }, n('option', { name: 'A', selected: true, ref: 'e6' }), n('option', { name: 'B', ref: 'e7' })))],
        { e1: elementFacts('input', { type: 'text', valueControl: true }), e2: elementFacts('input', { type: 'password', password: true, valueControl: true }), e3: elementFacts('div', { sensitive: true }), e5: elementFacts('select', { valueControl: true }), e6: elementFacts('option', { inSelect: true }), e7: elementFacts('option', { inSelect: true }) },
        { echo: ['echo me'], canvases: 2 },
      );
      same(raw, [], { stepText: '', targetIntent: '', maxBytes: 40000 });
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// perceive(): the browser-facing function, against a scripted CDP session.

describe('perceive()', () => {
  const simple = (): CollectedPage => page([n('document', {}, n('heading', { name: 'Hello', ref: 'e1', level: 1 }), n('button', { name: 'Save', ref: 'e2' }), n('paragraph', {}, 'Account 4242 4242'))]);
  const methods = (cdp: ScriptedCdp): string[] => cdp.calls.map((call) => call.method);

  it('opens the engine, collects, merges the page inventory, sanitizes and resolves backend ids', async () => {
    const cdp = new ScriptedCdp({ collected: simple(), inventory: { entries: [['4242 4242', true]], oversize: false }, backendIds: { e1: 11, e2: 12 } });
    const inventory = new PrivateInventory();
    const perception = await perceive({ cdp, inventory, stepText: 'Click Save' });
    expect(perception.outline.text.split('\n')).toEqual(['- document', '  - heading "Hello" [e1] {level=1}', '  - button "Save" [e2]']);
    expect(Object.keys(perception.facts)).toEqual(['e1', 'e2']);
    expect(perception.backendNodeIds).toEqual({ e1: 11, e2: 12 });
    expect(perception.origin).toBe('https://example.test');
    expect(perception.viewport).toEqual({ width: 1280, height: 720 });
    expect(perception.counters.withheldPrivate).toBe(1);
    expect(perception.engine.objectId).toBe('engine');
    expect(inventory.snapshot()).toEqual([['4242 4242', true]]);
    expect(methods(cdp)).toContain('Page.createIsolatedWorld');
    const internals = internalsOf(perception);
    expect(internals?.byRef.get('e2')?.rawName).toBe('Save');
    expect(internals?.tree.nodes.length).toBeGreaterThan(2);
    expect(Object.keys(perception)).not.toContain('tree');
    expect(JSON.parse(JSON.stringify(perception.evidenceSegments))).toEqual(perception.evidenceSegments);
  });

  it('uses the engine it is given and can skip the backend ids', async () => {
    const first = new ScriptedCdp({ collected: simple() });
    const one = await perceive({ cdp: first, inventory: new PrivateInventory(), resolveBackendIds: false });
    expect(one.backendNodeIds).toEqual({});
    const before = first.calls.length;
    const two = await perceive({ cdp: first, engine: one.engine, inventory: new PrivateInventory() });
    expect(methods(first).slice(before)).not.toContain('Page.createIsolatedWorld');
    expect(two.engine).toBe(one.engine);
  });

  it('withholds the caller\'s private values and the values the inventory already holds', async () => {
    const cdp = new ScriptedCdp({ collected: page([n('document', {}, n('button', { name: 'Pay CALLER_VALUE now', ref: 'e1' }), n('button', { name: 'Hold HELD_VALUE', ref: 'e2' }), n('button', { name: 'Plain', ref: 'e3' }))]) });
    const inventory = new PrivateInventory();
    inventory.add('HELD_VALUE', true);
    const perception = await perceive({ cdp, inventory, privateValues: ['CALLER_VALUE'] });
    expect(perception.outline.text).not.toMatch(/CALLER_VALUE|HELD_VALUE/u);
    expect(perception.outline.text).toContain('button "Plain" [e3]');
  });

  it('is deterministic for the same page and inventory, whatever order the inventory was filled in', async () => {
    const collected = page([n('document', {}, n('paragraph', { ref: 'e1' }, n('generic', {}, 'Zephyr '), n('generic', {}, 'Quartz Ninefold')), n('button', { name: 'ALPHA secret', ref: 'e2' }))]);
    const a = new PrivateInventory();
    a.merge([['Zephyr Quartz Ninefold', true], ['ALPHA secret', true]]);
    const b = new PrivateInventory();
    b.merge([['ALPHA secret', true], ['Zephyr Quartz Ninefold', true]]);
    const one = await perceive({ cdp: new ScriptedCdp({ collected }), inventory: a });
    const two = await perceive({ cdp: new ScriptedCdp({ collected }), inventory: b });
    expect(two.outline).toEqual(one.outline);
    expect(two.facts).toEqual(one.facts);
  });

  it('fails closed and latches the inventory when the page holds a value it cannot hold', async () => {
    const cdp = new ScriptedCdp({ collected: simple(), inventory: { entries: [], oversize: true } });
    const inventory = new PrivateInventory();
    inventory.add('before', true);
    await expect(perceive({ cdp, inventory })).rejects.toThrow('PRIVATE_INVENTORY_LIMIT');
    expect(() => inventory.matcher()).toThrow('CONTEXT_LOST');
    await expect(perceive({ cdp, inventory })).rejects.toThrow('CONTEXT_LOST');
  });

  it('fails closed on a malformed or failing page inventory', async () => {
    const bad = new ScriptedCdp({ collected: simple(), inventory: { entries: 'nope' } as never });
    await expect(perceive({ cdp: bad, inventory: new PrivateInventory() })).rejects.toThrow('PERCEPTION_UNAVAILABLE');
    const boom = new ScriptedCdp({ collected: simple() });
    const real = boom.send.bind(boom);
    boom.send = async (method, params) => {
      if (method === 'Runtime.evaluate' && !String((params as { expression?: string }).expression).includes('InjectedScript')) throw new Error('SECRET_PAGE_TEXT');
      return real(method, params);
    };
    const error = await perceive({ cdp: boom, inventory: new PrivateInventory() }).catch((caught: unknown) => caught as Error);
    expect((error as Error).message).toBe('PERCEPTION_UNAVAILABLE');
    const exception = new ScriptedCdp({ collected: simple() });
    const realException = exception.send.bind(exception);
    exception.send = async (method, params) => {
      if (method === 'Runtime.evaluate' && !String((params as { expression?: string }).expression).includes('InjectedScript')) return { exceptionDetails: { text: 'SECRET_PAGE_TEXT' } };
      return realException(method, params);
    };
    await expect(perceive({ cdp: exception, inventory: new PrivateInventory() })).rejects.toThrow('PERCEPTION_UNAVAILABLE');
    const empty = new ScriptedCdp({ collected: simple() });
    const realEmpty = empty.send.bind(empty);
    empty.send = async (method, params) => (method === 'Runtime.evaluate' && !String((params as { expression?: string }).expression).includes('InjectedScript') ? {} : realEmpty(method, params));
    await expect(perceive({ cdp: empty, inventory: new PrivateInventory() })).rejects.toThrow('PERCEPTION_UNAVAILABLE');
  });

  it('refuses a malformed snapshot reply', async () => {
    for (const collected of [null, 'text', { json: 'x' }, { json: [], facts: null, echo: [], origin: 'o' }, { json: [], facts: {}, echo: {}, origin: 'o' }, { json: [], facts: {}, echo: [] }]) {
      const cdp = new ScriptedCdp({ collected: collected as never });
      await expect(perceive({ cdp, inventory: new PrivateInventory() }), JSON.stringify(collected)).rejects.toThrow('PERCEPTION_UNAVAILABLE');
    }
    const lenient = new ScriptedCdp({ collected: { json: [], facts: {}, echo: [], origin: 'https://x.test' } as never });
    const result = await perceive({ cdp: lenient, inventory: new PrivateInventory() });
    expect(result.viewport).toEqual({ width: 0, height: 0 });
  });

  it('stops with PERCEPTION_UNAVAILABLE when the D1 probes exhaust their work budget, never with a partial outline', async () => {
    const collected = page([n('document', {}, ...Array.from({ length: 50 }, (_, i) => n('paragraph', {}, `some words number ${String(i)}`)))]);
    const inventory = new PrivateInventory();
    inventory.add('a private value here', true);
    await expect(perceive({ cdp: new ScriptedCdp({ collected }), inventory, workBudgetUnits: 100 })).rejects.toThrow('PERCEPTION_UNAVAILABLE');
    const roomy = await perceive({ cdp: new ScriptedCdp({ collected }), inventory, workBudgetUnits: 1e9 });
    expect(roomy.outline.text).toContain('some words number 7');
  });

  it('passes the step text, intents and byte budget to the projection', async () => {
    const cdp = new ScriptedCdp({ collected: densePage() });
    const perception = await perceive({ cdp, inventory: new PrivateInventory(), stepText: 'Open w7x', targetIntents: ['w9x'], maxBytes: 1600, resolveBackendIds: false });
    expect(perception.outline.projected).toBe(true);
    expect(perception.outline.text).toContain('link "w7x"');
    expect(perception.outline.text).toContain('link "w9x"');
  });
});

/** Rehearsal fixes R1 to R3 (ADR-SC-007 WI-4): inventory of toggles, evidence by containment, rows around a matched node. */
describe('rehearsal R1: toggle values in the private inventory', () => {
  interface FakeEl { tagName: string; type?: string; value?: string; attrs?: string[]; isContentEditable: boolean; parentElement: null; shadowRoot: null; hasAttribute(n: string): boolean; getAttribute(n: string): string | null }
  const el = (tag: string, type: string, value: string, attrs: string[] = []): FakeEl => ({
    tagName: tag.toUpperCase(), type, value, isContentEditable: false, parentElement: null, shadowRoot: null,
    hasAttribute: (name) => attrs.includes(name), getAttribute: () => null,
  });
  const inventoryOf = (elements: FakeEl[]): ReturnType<typeof pageInventory> => {
    vi.stubGlobal('document', { querySelectorAll: () => elements });
    try { return pageInventory(); } finally { vi.unstubAllGlobals(); }
  };

  it('R1: a checkbox value attribute does not withhold its visible label', () => {
    const inventory = inventoryOf([el('input', 'checkbox', 'Python', ['value']), el('input', 'radio', 'Stable', ['value'])]);
    expect(inventory.entries).toEqual([]);
    const matcher = createPrivateMatcher(inventory.entries);
    expect(matcher.hitSplit(['Python'])).toBe(false);
    expect(matcher.hitSplit(['Stable'])).toBe(false);
  });

  it('R1: a typed text value equal to a checkbox value stays withheld in its input', () => {
    const inventory = inventoryOf([el('input', 'checkbox', 'Python', ['value']), el('input', 'text', 'Python')]);
    expect(inventory.entries).toEqual([['Python', true]]);
    expect(createPrivateMatcher(inventory.entries).hitSplit(['Python'])).toBe(true);
  });
});

describe('rehearsal R2: evidence by containment and unnamed headings', () => {
  const table = (...rows: ReturnType<typeof n>[]): ReturnType<typeof n> => n('table', { name: 'Packages', ref: 'e1' },
    n('row', {}, n('columnheader', { name: 'Package', ref: 'e2', box: box(0, 0, 100, 20) }, 'Package'), n('columnheader', { name: 'Version', ref: 'e3', box: box(100, 0, 100, 20) }, 'Version')), ...rows);

  it('R2: a link in a table cell carries the column header in evidence', () => {
    const collected = page([table(n('row', {}, n('cell', { name: 'zlib', box: box(0, 30, 100, 20) }, n('link', { name: 'zlib', ref: 'e5' }, 'zlib')), n('cell', { name: '1.3', box: box(100, 30, 100, 20) }, '1.3')))]);
    const result = run(collected);
    expect(result.facts.e5?.evidence).toContain('Package');
    expect(result.facts.e5?.evidence).toContain('1.3');
    expect(evidenceSegments(must(internalsOfCollected(result).byRef.get('e5'))).map((segment) => segment.field)).toContain('header');
  });

  it('R2: an unnamed heading carries its own text capped at 80 characters', () => {
    const long = 'x'.repeat(120);
    const collected = page([n('document', {}, n('heading', { ref: 'e1' }, n('link', { name: 'Content sectioning', ref: 'e2' }, 'Content sectioning')), n('heading', { ref: 'e3' }, n('link', { name: long, ref: 'e4' }, long)))]);
    const result = run(collected);
    expect(result.facts.e1?.evidence).toBe('Content sectioning');
    const capped = result.facts.e3?.evidence ?? '';
    expect(capped.startsWith('xxxxxxxx')).toBe(true);
    expect(Array.from(capped).length).toBeLessThanOrEqual(80);
  });

  it('R2: a nested table inherits only from the nearest enclosing cell', () => {
    const inner = n('table', { name: 'Inner', ref: 'e10' },
      n('row', {}, n('columnheader', { name: 'InnerHead', ref: 'e11', box: box(0, 40, 100, 20) }, 'InnerHead')),
      n('row', {}, n('cell', { name: 'v', box: box(0, 70, 100, 20) }, n('link', { name: 'Deep', ref: 'e12' }, 'Deep'))));
    const collected = page([n('table', { name: 'Outer', ref: 'e1' },
      n('row', {}, n('columnheader', { name: 'OuterHead', ref: 'e2', box: box(0, 0, 300, 20) }, 'OuterHead')),
      n('row', {}, n('cell', { name: 'c', box: box(0, 30, 300, 200) }, n('link', { name: 'Direct', ref: 'e3' }, 'Direct'), inner)))]);
    const result = run(collected);
    expect(result.facts.e12?.evidence).toContain('InnerHead');
    expect(result.facts.e12?.evidence).not.toContain('OuterHead');
    expect(result.facts.e3?.evidence).toContain('OuterHead');
    expect(result.facts.e3?.evidence).not.toContain('InnerHead');
  });
});

describe('rehearsal R3: rows around a matched node', () => {
  const filler = (count: number): ReturnType<typeof n>[] => Array.from({ length: count }, (_, i) => n('paragraph', {}, `filler paragraph number ${String(i)} with padding words`));
  const rowOf = (label: string, ...cells: string[]): ReturnType<typeof n> => n('row', {},
    n('cell', { name: label }, label), ...cells.map((value) => n('cell', { name: value }, value)));

  it('R3: a matched row label keeps its sibling value cell', () => {
    const collected = page([n('document', {}, ...filler(40), n('table', {}, rowOf('Stable', 'pad', '3.13.1')), ...filler(40))]);
    const result = run(collected, [], { stepText: 'Read the Stable version', maxBytes: 900 });
    expect(result.outline.projected).toBe(true);
    expect(result.outline.text).toContain('3.13.1');
    expect(result.outline.bytes).toBeLessThanOrEqual(900);
  });

  it('R3: a withheld cell stays withheld in a kept row', () => {
    const collected = page([n('document', {}, ...filler(40), n('table', {}, rowOf('Stable', 'visible-cell', 'SECRETVAL')), ...filler(40))]);
    const result = run(collected, ['SECRETVAL'], { stepText: 'Read the Stable version', maxBytes: 900 });
    expect(result.outline.text).toContain('visible-cell');
    expect(result.outline.text).not.toContain('SECRETVAL');
  });

  it('R3: kept rows stay within 8 rows, 12 cells and the outline byte cap', () => {
    const rows = Array.from({ length: 20 }, (_, r) => rowOf(`item${String(r)} Stable`, ...Array.from({ length: 20 }, (_, c) => `cell${String(r)}x${String(c)}`)));
    const collected = page([n('document', {}, n('table', {}, ...rows))]);
    const result = run(collected, [], { stepText: 'Read the Stable value', maxBytes: 3000 });
    const text = result.outline.text;
    const keptRows = new Set(Array.from(text.matchAll(/cell(\d+)x\d+/gu), (m) => m[1]));
    expect(keptRows.size).toBeLessThanOrEqual(8);
    for (const row of keptRows) expect(new Set(Array.from(text.matchAll(new RegExp(`cell${String(row)}x(\\d+)`, 'gu')), (m) => m[1])).size).toBeLessThanOrEqual(11);
    expect(result.outline.bytes).toBeLessThanOrEqual(3000);
  });
});

describe('combined native and public source projection', () => {
  it('combined native roles retain same root through private conversion', () => {
    const raw = page([n('paragraph', { ref: 'e1' }, 'root value'), n('strong', { ref: 'e2' }, 'stable')], {
      e1: elementFacts('p', { nativeTextRoot: 'paragraph' }), e2: elementFacts('strong', { nativeTextRoot: 'strong' }),
    });
    const visible = run(raw);
    expect(visible.facts.e1?.role).toBe('paragraph'); expect(visible.facts.e2?.role).toBe('strong');
    expect(visible.facts.e1?.name).toBe(''); expect(visible.facts.e1?.ownTextComplete).toBe(false); expect(visible.outline.text).toContain('- paragraph [e1] {text="root value"}');
    const masked = run(raw, ['root value']);
    expect(masked.facts.e1).toMatchObject({ role: 'paragraph', name: '', nameComplete: false, ownTextComplete: false });
    expect(masked.facts.e1?.text).toBeUndefined(); expect(masked.outline.text).not.toContain('root value');
    const nested = run(page([n('paragraph', { ref: 'e9' }, n('strong', { ref: 'e2' }, 'stable'))], { e2: elementFacts('strong', { nativeTextRoot: 'strong' }) }));
    expect(nested.facts.e2?.role).toBe('strong'); expect(nested.facts.e9).toBeUndefined();
    const split = run(page([n('paragraph', { ref: 'e1' }, 'root'), n('strong', { ref: 'e2' }, 'value')], raw.facts), ['rootvalue']);
    expect(Object.values(split.facts).map(f => f.role)).toEqual(['paragraph','strong']);
    expect(split.outline.text).not.toContain('root"'); expect(split.outline.text).not.toContain('value"');
  });
  it('combined duplicate ordinal is positional not physical identity', () => {
    const raw = page([n('button', { ref: 'e20', name: 'Open [e9]' }), n('button', { ref: 'e3', name: 'Open [e9]' })]);
    const full = run(raw);
    expect(full.facts.e20?.ordinal).toEqual({ index: 1, count: 2 }); expect(full.facts.e3?.ordinal).toEqual({ index: 2, count: 2 });
    expect(full.outline.text).toContain('[e20] {ordinal=1/2}');
    const clipped = run(raw, [], { maxBytes: 70 });
    expect(clipped.facts).toEqual({}); expect(clipped.refs).toEqual([]); expect(clipped.outline.bytes).toBeLessThanOrEqual(70);
    expect(clipped.outline.notShown).toBe(2);
    // Identical physical peers carry no physical continuity authority; changing native handles cannot
    // be detected from this semantic tuple. The separate volatile capability supplies that boundary.
    expect(run(raw).facts).toEqual(full.facts);
  });
  it('combined read scope refs remain closed and atomic through projection', () => {
    const raw = page([n('heading', { ref: 'e1', name: 'Release column' }), n('cell', { ref: 'e2', name: 'stable' })], {
      e1: elementFacts('h2'), e2: elementFacts('td', { readScope: { relation: 'IMMEDIATE_HEADING_SAME_PARENT', sourceRefs: ['e1'] } }),
    });
    const full = run(raw); expect(full.facts.e2?.readScope?.sourceRefs).toEqual(['e1']);
    const masked = run(raw, ['Release column']); expect(masked.facts.e2?.readScope).toBeUndefined();
    const tiny = run(raw, [], { stepText: 'stable', maxBytes: 45 }); expect(tiny.facts.e2).toBeUndefined();
    const dangling = run({ ...raw, facts: { ...raw.facts, e2: elementFacts('td', { readScope: { relation: 'SAME_ROW_LABEL', sourceRefs: ['e999'] } }) } });
    expect(dangling.facts.e2?.readScope).toBeUndefined(); // Invalid optional source context is revoked before projection.
  });
});

it('snapshot omission and unrepresented child labels never become complete empty own text', () => {
  const echoed = run(page([n('button', { name: 'Open', ref: 'e1' }, 'unrepresented private value')], {}, { echo: ['unrepresented private value'] }));
  expect(echoed.facts.e1).toMatchObject({ name: 'Open', nameComplete: true, ownTextComplete: false });
  expect(echoed.facts.e1?.evidence).toBe('Open');
  const child = run(page([n('button', { name: 'Open', ref: 'e1' }, n('heading', { name: 'Delete', ref: 'e2' }))]));
  expect(child.facts.e1).toMatchObject({ name: 'Open', nameComplete: true, ownTextComplete: false });
  const repeated = run(page([n('button', { name: 'Open', ref: 'e1' }, n('heading', { name: 'Open', ref: 'e2' }))]));
  expect(repeated.facts.e1).toMatchObject({ name: 'Open', nameComplete: true, ownTextComplete: true });
});
