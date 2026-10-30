import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser } from 'playwright';

import type { ResolvedTarget } from '../../../src/guided/types.js';
import { inspectCapturedElement } from '../../../src/run/browser.js';
import { createObservationFlow } from '../../../src/run/observationFlow.js';
import type { PageLike } from '../../../src/run/targetAction.js';
import { guardDist, launchChromium } from './harness.js';
import { codeOf, factOf, html, invoke, open, prepare, serve, sessionConfig, TestControl, type Opened, type Operation, type Prepared, type Served } from './cutover-support.js';

/**
 * ADR-SC-007 WI-4, reads and asserts (D-3 read / assert, D-2 step 6): any visible element the model can name is readable under
 * the application grant, except the surfaces the kept read profile never reads. The refusal comes at prepare
 * (READ_NOT_ALLOWED, before any fence, feeding the joined T-J2) or at invoke before the fence (POLICY_DENIED at learn).
 */

guardDist();

const readOf = (rule: string | null, kind: 'visibleText' | 'controlValue' = 'visibleText'): Operation =>
  ({ kind: 'read', bindingId: 'binding', recipe: kind === 'visibleText' ? { kind, classification: 'permittedBusinessData', policyRuleId: rule ?? 'none' } : { kind, classification: 'nonsecretApproved', controlType: 'text', policyRuleId: rule ?? 'none' } }) as Operation;
const VISIBLE: Operation = { kind: 'assert', predicate: 'visible', expected: null };
const CONTAINS: Operation = { kind: 'assert', predicate: 'containsText', expected: { kind: 'authoredLiteral', sourceInputId: 'x' } };
const HAS_VALUE: Operation = { kind: 'assert', predicate: 'hasValue', expected: { kind: 'authoredLiteral', sourceInputId: 'x' } };

const MAIN = (body: string): string => html(`<main aria-label="Operations">${body}</main>`);

describe('WI-4 reads and asserts on real Chromium', () => {
  let browser: Browser;
  let served: Served;
  const opened: Opened[] = [];
  const page = async (path: string, config: Parameters<typeof open>[3] = {}): Promise<Opened> => {
    const created = await open(browser, served, path, config);
    opened.push(created);
    return created;
  };
  const NO_GRANTS = { policyRuleId: 'observed-structure-v1', allowStructuralDiscovery: true, readGrants: [] };

  beforeAll(async () => {
    browser = await launchChromium();
    served = await serve({
      '/readable': MAIN('<h1>Heading text</h1><p data-testid="para">Paragraph text here</p><table aria-label="Orders"><tbody><tr><th>Ref</th><td>Cell text</td></tr></tbody></table><ol><li aria-label="Named item">Third</li></ol>'),
      '/cell-input': MAIN('<table aria-label="Orders"><tbody><tr><td aria-label="Order reference">  fresh-1 <input aria-label="Adjust"></td></tr></tbody></table>'),
      '/cell-textarea': MAIN('<table aria-label="Orders"><tbody><tr><td aria-label="Order notes">notes-1 <textarea aria-label="Edit notes"></textarea></td></tr></tbody></table>'),
      '/editable-ancestor': MAIN('<div contenteditable="true"><table aria-label="Inside editable"><tbody><tr><td aria-label="Editable cell">EDITABLE-MARK</td></tr></tbody></table></div>'),
      '/sensitive-ancestor': MAIN('<div data-sensitive><table aria-label="Inside sensitive"><tbody><tr><td aria-label="Sensitive cell">SENSITIVE-MARK</td></tr></tbody></table></div>'),
      '/iframe-descendant': MAIN('<table aria-label="Framed"><tbody><tr><td aria-label="Framed cell">FRAMED-MARK<iframe title="inner" srcdoc="<p>inner</p>"></iframe></td></tr></tbody></table>'),
      '/long': MAIN(`<table aria-label="Orders"><tbody><tr><td aria-label="Long cell">${'x'.repeat(5_000)}</td></tr></tbody></table>`),
      '/empty': MAIN('<table aria-label="Orders"><tbody><tr><td aria-label="Blank cell">   </td></tr></tbody></table>'),
      '/asserts': MAIN('<h1>Heading text</h1><label>Name <input id="name" value="zed"></label><label>Hidden <input id="hidden" value="x" style="display:none"></label><button type="button" id="gone" style="display:none">Gone</button><p>Zero​Width text</p>'),
    });
  });
  afterAll(async () => {
    for (const created of opened.splice(0)) await created.close();
    await browser.close();
    await served.close();
  });

  const readRule = (prepared: Pick<Prepared, 'exported'>): string => {
    const rule = prepared.exported.observation.readRuleId;
    if (rule === null) throw new Error('the page has no read grant');
    return rule;
  };

  const markerComparison = async (created: Opened) => {
    const exported = await created.session.observe(undefined, false), rule = readRule({ exported });
    const read = readOf(rule);
    if (read.kind !== 'read') throw Error('MISSING_MARKER_READ');
    const prepared = await prepare(created, 'listitem', 'Named item', read, null, exported);
    const identity = { admissionId: 'marker-read', requestDigest: 'a'.repeat(64), operationHash: 'b'.repeat(64), coordinate: { stepId: 'marker-read', ordinal: 0 }, authority: 'marker-owner' };
    const result = await created.session.invoke({ invocationIdentity: identity, preparationId: 'marker-preparation', resolved: prepared.resolved, operation: read,
      resolvedValue: null, origin: created.origin, maxValueBytes: 4096, readRuleId: rule, profile: 'learn',
      expect: { documentId: exported.observation.documentId, generation: exported.observation.generation } }, new TestControl());
    expect(result).toEqual({ value: 'Third' });
    created.session.commitRead?.(read.bindingId, { identity, preparationId: 'marker-preparation' });
    const refreshed = await created.session.observe(undefined, false), ref = prepared.ref;
    expect(refreshed.observation.facts[ref]?.role).toBe('listitem');
    expect(refreshed.observation.facts[ref]?.name).toBe('');
    const source = { bindingId: read.bindingId, producerAdmissionId: identity.admissionId, producerPreparationId: 'marker-preparation' };
    const operation: Operation = { kind: 'assert', predicate: 'containsText', expected: { kind: 'binding', bindingId: read.bindingId } };
    const resolved = await created.session.prepareTarget({ ref, documentId: refreshed.observation.documentId, generation: refreshed.observation.generation,
      origin: created.origin, operation, authoredLiteral: null, assertSourceBinding: source, continuityAuthority: identity.authority });
    expect(resolved.assertTextMode).toBe('READ_BINDING_SOURCE');
    return (profile: 'learn' | 'replay' = 'learn', control = new TestControl()) => created.session.invoke({ resolved, operation, resolvedValue: result.value ?? null,
      origin: created.origin, maxValueBytes: 4096, readRuleId: null, profile, assertSourceBinding: source,
      ...(profile === 'learn' ? { invocationIdentity: { ...identity, admissionId: 'marker-assert' }, expect: { documentId: refreshed.observation.documentId, generation: refreshed.observation.generation } } : {}) }, control);
  };

  const lateMarkerOpened = async (local: Served, stage: 'extract' | 'compare') => {
    const created = await open(browser, local, '/marker');
    await created.session.dispose();
    let hookCount = 0;
    const session = createObservationFlow({
      page: created.page as unknown as PageLike,
      async newCdp() {
        const raw = await created.page.context().newCDPSession(created.page);
        return {
          async send(method: string, params?: object) {
            const response = await raw.send(method as Parameters<typeof raw.send>[0], params as Parameters<typeof raw.send>[1]);
            const declaration = (params as { functionDeclaration?: string } | undefined)?.functionDeclaration ?? '';
            const marker = stage === 'extract' ? 'this.extract(text =>' : 'this.compare(expected, entries, mode,';
            if (method === 'Runtime.callFunctionOn' && declaration.includes(marker)) {
              hookCount++;
              await created.page.evaluate(() => {
                const sheet = new CSSStyleSheet(); sheet.insertRule('li::marker { content: "late marker"; }');
                document.adoptedStyleSheets = [sheet];
              });
            }
            return response;
          },
          detach: () => raw.detach(),
        };
      },
      inspectBoundElement: bound => inspectCapturedElement(created.page, bound),
      onNavigation(listener) { const callback = (): void => { listener(); }; created.page.on('framenavigated', callback); return () => { created.page.off('framenavigated', callback); }; },
      awaitWhitelistedMainFrame: () => Promise.resolve(),
    }, sessionConfig());
    return { ...created, session, hooks: () => hookCount, close: async () => { await session.dispose(); await created.close(); } };
  };

  it('readable cell, heading, paragraph and list item', async () => {
    const created = await page('/readable');
    const exported = await created.session.observe(undefined, false);
    expect(exported.observation.readRuleId).not.toBeNull();
    const rule = exported.observation.readRuleId ?? '';
    const cases: [string, string, string, string][] = [
      ['cell', 'Cell text', 'Cell text', 'cell'],
      ['heading', 'Heading text', 'Heading text', 'heading'],
      ['paragraph', '', 'Paragraph text here', 'paragraph'],
      ['listitem', 'Named item', 'Third', 'list item'],
    ];
    for (const [role, name, expected, label] of cases) {
      const operation = readOf(rule);
      const prepared = await prepare(created, role, name, operation, null, exported);
      const result = await invoke(created, prepared, operation, { readRuleId: rule }).catch(() => { throw new Error(`READ_FAMILY_REFUSED_${role}`); });
      expect(result, `reading the ${label}`).toEqual({ value: expected });
    }
    // The bound is on the value, before the fence: a lowered cap is a no-effect refusal.
    const cell = await prepare(created, 'cell', 'Cell text', readOf(rule), null, exported);
    const control = new TestControl();
    expect(await codeOf(invoke(created, cell, readOf(rule), { readRuleId: rule, maxValueBytes: 3, control }))).toBe('POLICY_DENIED');
    expect(control.fenced).toBe(0);
  });

  it.each(['ul', 'ol'] as const)('default native %s marker permits the exact public item value and comparison', async tag => {
    // The OL case deliberately preserves the original single-LI cutover HTML.
    const local = await serve({ '/marker': MAIN(`<${tag}><li aria-label="Named item">Third</li></${tag}>`) });
    const created = await open(browser, local, '/marker');
    try {
      const compare = await markerComparison(created);
      expect(await compare()).toEqual({ assertionPassed: true });
      expect(await compare('replay')).toEqual({ assertionPassed: true });
    } finally { await created.close(); await local.close(); }
  });

  it.each([
    ['custom-content', '<ol><li aria-label="Named item">Third</li></ol>', 'li::marker { content: "custom"; }'],
    ['custom-list-type', '<ol><li aria-label="Named item">Third</li></ol>', 'li { list-style-type: upper-roman; }'],
    ['custom-list-image', '<ol><li aria-label="Named item">Third</li></ol>', 'li { list-style-image: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E"); }'],
    ['counter-content', '<ol><li aria-label="Named item">Third</li></ol>', 'li::marker { content: counter(list-item); }'],
    ['counter-reset', '<ol><li aria-label="Named item">Third</li></ol>', 'ol { counter-reset: list-item 9; }'],
    ['counter-increment', '<ol><li aria-label="Named item">Third</li></ol>', 'li { counter-increment: list-item 3; }'],
    ['outside-counter-with-ol-reset-none', '<div class="outside"></div><ol><li aria-label="Named item">Third</li></ol>', '.outside { counter-set: list-item 40; } ol { counter-reset: none; }'],
    ['ordinal-start', '<ol start="4"><li aria-label="Named item">Third</li></ol>', ''],
    ['ordinal-reversed', '<ol reversed><li aria-label="Named item">Third</li></ol>', ''],
    ['ordinal-value', '<ol><li value="8" aria-label="Named item">Third</li></ol>', ''],
    ['html-type', '<ol type="A"><li aria-label="Named item">Third</li></ol>', ''],
    ['generated-before', '<ol><li aria-label="Named item">Third</li></ol>', 'li::before { content: "private generated"; }'],
  ] as const)('native marker refuses %s without a value or assertion boolean', async (_kind, body, css) => {
    // In particular, the outside counter interaction is conservatively refused;
    // this test neither traverses sibling counter scope nor reads stylesheet text.
    const local = await serve({ '/marker': html(`<main aria-label="Operations">${body}</main>`, css ? `<style>${css}</style>` : '') });
    const created = await open(browser, local, '/marker');
    try {
      const exported = await created.session.observe(undefined, false), rule = readRule({ exported });
      factOf(exported, 'listitem', 'Named item');
      const operation = readOf(rule);
      const attempted = prepare(created, 'listitem', 'Named item', operation, null, exported)
        .then(prepared => invoke(created, prepared, operation, { readRuleId: rule }));
      await expect(attempted).rejects.toBeDefined();
      expect(() => created.session.commitRead?.('binding')).toThrow();
    } finally { await created.close(); await local.close(); }
  });

  it.each(['insertSibling', 'insertSiblingRestore', 'ordinalRestore', 'lateCSSOM'] as const)('native marker revokes %s after preparation before transferring a result', async mutation => {
    for (const profile of ['learn', 'replay'] as const) {
      const local = await serve({ '/marker': MAIN('<ol><li aria-label="Named item">Third</li></ol>') });
      const created = await open(browser, local, '/marker');
      try {
        const compare = await markerComparison(created);
        const control = new TestControl(async () => {
          await created.page.evaluate(kind => {
            const list = document.querySelector('ol'), item = document.querySelector('li');
            if (!list || !item) throw Error('MISSING_MARKER_FIXTURE');
            if (kind === 'insertSibling' || kind === 'insertSiblingRestore') {
              const sibling = document.createElement('li'); sibling.textContent = 'Earlier'; list.prepend(sibling);
              if (kind === 'insertSiblingRestore') sibling.remove();
            } else if (kind === 'ordinalRestore') { item.setAttribute('value', '7'); item.removeAttribute('value'); }
            else {
              // CSSOM mutation makes no MutationObserver record: final native style checks must catch it.
              const sheet = new CSSStyleSheet(); sheet.insertRule('li::marker { content: "late custom"; }');
              document.adoptedStyleSheets = [sheet];
            }
          }, mutation);
        });
        await expect(compare(profile, control)).rejects.toBeDefined();
        expect(control.fenced).toBe(1);
      } finally { await created.close(); await local.close(); }
    }
  });

  it.each(['extract', 'compare'] as const)('fresh marker commitment refuses CSSOM changes after native %s staging', async stage => {
    const local = await serve({ '/marker': MAIN('<ol><li aria-label="Named item">Third</li></ol>') });
    const created = await lateMarkerOpened(local, stage);
    try {
      if (stage === 'extract') {
        const exported = await created.session.observe(undefined, false), rule = readRule({ exported }), operation = readOf(rule);
        const prepared = await prepare(created, 'listitem', 'Named item', operation, null, exported);
        await expect(invoke(created, prepared, operation, { readRuleId: rule })).rejects.toBeDefined();
        expect(() => created.session.commitRead?.('binding')).toThrow();
      } else {
        const compare = await markerComparison(created);
        await expect(compare()).rejects.toBeDefined();
      }
      expect(created.hooks()).toBe(1);
    } finally { await created.close(); await local.close(); }
  });

  describe('refused', () => {
    const prepareRefusal = async (created: Opened, role: string, name: string, rule: string | null): Promise<string | null> => {
      const exported = await created.session.observe(undefined, false);
      const [ref] = factOf(exported, role, name);
      return codeOf(created.session.prepareTarget({ ref, documentId: exported.observation.documentId, generation: exported.observation.generation, origin: exported.observation.origin, operation: readOf(rule), authoredLiteral: null }));
    };

    it('refused: a cell with an input descendant', async () => {
      const created = await page('/cell-input');
      const rule = (await created.session.observe(undefined, false)).observation.readRuleId;
      expect(rule).not.toBeNull();
      expect(await prepareRefusal(created, 'cell', 'Order reference', rule)).toBe('READ_NOT_ALLOWED');
    });

    it('refused: a cell with a textarea descendant', async () => {
      const created = await page('/cell-textarea');
      const rule = (await created.session.observe(undefined, false)).observation.readRuleId;
      expect(await prepareRefusal(created, 'cell', 'Order notes', rule)).toBe('READ_NOT_ALLOWED');
    });

    it.each([
      ['/editable-ancestor', 'Editable cell', 'EDITABLE-MARK', 'a contenteditable ancestor'],
      ['/sensitive-ancestor', 'Sensitive cell', 'SENSITIVE-MARK', 'a data-sensitive ancestor'],
      ['/iframe-descendant', 'Framed cell', 'FRAMED-MARK', 'an iframe descendant'],
    ] as const)('refused: %s %s (%s)', // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the last column documents the case
  async (path, name, mark, _label) => {
      const created = await page(path);
      const exported = await created.session.observe(undefined, false);
      const rule = exported.observation.readRuleId;
      const shown = Object.entries(exported.observation.facts).find(([, fact]) => fact.name === name);
      if (shown === undefined) {
        // Perception withheld the whole subtree: the model cannot even name it, and its text is nowhere in the observation.
        expect(exported.json).not.toContain(mark);
        return;
      }
      expect(await prepareRefusal(created, shown[1].role, name, rule)).toBe('READ_NOT_ALLOWED');
    });

    it('refused: over 4,096 bytes', async () => {
      const created = await page('/long');
      const exported = await created.session.observe(undefined, false);
      const rule = readRule({ exported });
      const operation = readOf(rule);
      const prepared = await prepare(created, 'cell', 'Long cell', operation, null, exported);
      const control = new TestControl();
      expect(await codeOf(invoke(created, prepared, operation, { readRuleId: rule, control }))).toBe('POLICY_DENIED');
      expect(control.fenced).toBe(0);
    });

    it('refused: an empty value', async () => {
      const created = await page('/empty');
      const exported = await created.session.observe(undefined, false);
      const shown = Object.entries(exported.observation.facts).find(([, fact]) => fact.name === 'Blank cell');
      if (shown === undefined) return;
      const rule = readRule({ exported });
      const operation = readOf(rule);
      const prepared = await prepare(created, shown[1].role, 'Blank cell', operation, null, exported);
      const control = new TestControl();
      expect(await codeOf(invoke(created, prepared, operation, { readRuleId: rule, control }))).toBe('POLICY_DENIED');
      expect(control.fenced).toBe(0);
    });

    it('refused: a null readRuleId (no grant for the page)', async () => {
      const created = await page('/readable', { readProfile: NO_GRANTS });
      const exported = await created.session.observe(undefined, false);
      expect(exported.observation.readRuleId).toBeNull();
      expect(await prepareRefusal(created, 'cell', 'Cell text', null)).toBe('READ_NOT_ALLOWED');
    });

    it('refused: another grant id and a controlValue recipe', async () => {
      const created = await page('/readable');
      expect(await prepareRefusal(created, 'cell', 'Cell text', 'observed-read-v1-other')).toBe('READ_NOT_ALLOWED');
      const exported = await created.session.observe(undefined, false);
      const [ref] = factOf(exported, 'cell', 'Cell text');
      const rule = exported.observation.readRuleId;
      expect(await codeOf(created.session.prepareTarget({ ref, documentId: exported.observation.documentId, generation: exported.observation.generation, origin: exported.observation.origin, operation: readOf(rule, 'controlValue'), authoredLiteral: null }))).toBe('READ_NOT_ALLOWED');
    });
  });

  it('assert visible, containsText and hasValue, including the password refusal and the empty-expected rule', async () => {
    const created = await page('/asserts');
    const exported = await created.session.observe(undefined, false);
    const heading = await prepare(created, 'heading', 'Heading text', VISIBLE, null, exported);
    expect(await invoke(created, heading, VISIBLE)).toEqual({ assertionPassed: true });
    const contains = await prepare(created, 'heading', 'Heading text', CONTAINS, null, exported);
    expect(await invoke(created, contains, CONTAINS, { value: 'Heading' })).toEqual({ assertionPassed: true });
    expect(await invoke(created, contains, CONTAINS, { value: 'Missing text' })).toEqual({ assertionPassed: false });
    // The expected value is normalised (zero-width removed, whitespace collapsed) like the page text.
    const zero = Object.entries(exported.observation.facts).find(([, fact]) => fact.text?.includes('Width text'));
    if (zero !== undefined) {
      const zeroPrepared = await prepare(created, zero[1].role, zero[1].name, CONTAINS, null, exported);
      expect(await invoke(created, zeroPrepared, CONTAINS, { value: 'ZeroWidth text' })).toEqual({ assertionPassed: true });
    }
    // The empty-expected rule (PO R4): an expected value that is empty after normalisation never passes; it is a no-effect verdict, not a refusal.
    const control = new TestControl();
    expect(await invoke(created, contains, CONTAINS, { value: '\u200b  ', control })).toEqual({ assertionPassed: false });
    const field = await prepare(created, 'textbox', 'Name', HAS_VALUE, null, exported);
    expect(await invoke(created, field, HAS_VALUE, { value: 'zed' })).toEqual({ assertionPassed: true });
    expect(await invoke(created, field, HAS_VALUE, { value: 'other' })).toEqual({ assertionPassed: false });
    // A password input is never read: it has no ref, so the frozen target is built by hand, as a stored guard would carry it.
    const password: ResolvedTarget = { locator: [{ by: 'attr', tag: 'input', attrs: [{ name: 'type', value: 'password' }] }], tier: 'attribute', identity: { role: 'textbox', name: null } };
    await created.page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'password';
      input.value = 'PRIVATE-PASSWORD-VALUE';
      document.querySelector('main')?.append(input);
    });
    const passwordControl = new TestControl();
    const refused = await codeOf(invoke(created, { ...heading, resolved: password }, HAS_VALUE, { value: 'PRIVATE-PASSWORD-VALUE', profile: 'replay', bind: false, control: passwordControl }));
    expect(refused).toBe('PASSWORD_CONTROL_READ_REFUSED');
    expect(passwordControl.fenced).toBe(0);
  });

  it('a bare paragraph has a durable native role inside its verified public scope', async () => {
    // F1 fixes the former synthetic text-alias limitation; the original HTML/value remain exact.
    const local = await serve({ '/bare': MAIN('<p>Bare paragraph text</p>') });
    try {
      const created = await open(browser, local, '/bare'); opened.push(created);
      const exported = await created.session.observe(undefined, false), rule = exported.observation.readRuleId ?? '';
      const prepared = await prepare(created, 'paragraph', '', readOf(rule), null, exported);
      expect(prepared.resolved.identity).toEqual({ role: 'paragraph', name: null });
      expect(await invoke(created, prepared, readOf(rule), { readRuleId: rule })).toEqual({ value: 'Bare paragraph text' });
    } finally { await local.close(); }
  });

  it('unmapped generic text has no durable locator and never reaches a read fence', async () => {
    // The real semantic P owns a native ref, but its generic SPAN child makes it a
    // non-sole/unmapped text owner; no canonical native-root certificate or value selector.
    const local = await serve({ '/generic': MAIN('<p><span>Bare generic text</span></p>') });
    try {
      const created = await open(browser, local, '/generic'); opened.push(created);
      const exported = await created.session.observe(undefined, false), rule = exported.observation.readRuleId ?? '';
      const [ref, fact] = factOf(exported, 'text', '');
      expect(fact.text).toBe('Bare generic text'); expect(exported.observation.facts[ref]).toBe(fact);
      const control = new TestControl(), operation = readOf(rule);
      const attempted = prepare(created, 'text', '', operation, null, exported).then(prepared => invoke(created, prepared, operation, { readRuleId: rule, control }));
      expect(await codeOf(attempted)).toBe('NO_DURABLE_LOCATOR'); expect(control.fenced).toBe(0);
    } finally { await local.close(); }
  });

  it('assert visible on a hidden element ends before the fence', async () => {
    const created = await page('/asserts');
    const prepared = await prepare(created, 'heading', 'Heading text', VISIBLE);
    await created.page.evaluate(() => {
      (document.querySelector('h1') as HTMLElement).style.display = 'none';
    });
    const control = new TestControl();
    expect(await codeOf(invoke(created, prepared, VISIBLE, { control }))).toBe('TARGET_CHANGED');
    expect(control.fenced).toBe(0);
  }, 30_000);
});
