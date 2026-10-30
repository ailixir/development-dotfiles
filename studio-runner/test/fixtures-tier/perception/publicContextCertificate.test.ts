// eslint-disable-next-line no-restricted-imports -- Native relation conformance requires a real browser.
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { perceive } from '../../../src/run/perceive.js';
import { checkPublicSourceRelations } from '../../../src/run/perceptionInPage.js';
import { runOnEngine, backendIdsForSelector, checkFrozenSourceContext, unsafePublicRoots, untrackedObservationChannel } from '../../../src/run/playwrightEngine.js';
import { synthesize, buildPublicLocator, toEngineSelector, type LocatorRoot } from '../../../src/run/locatorSynth.js';
import { PrivateInventory } from '../../../src/run/privateInventory.js';
import { qualifiedScopeAllows, validatePublicObservation } from '../../../src/validator/pressInheritance.js';
import type { ObservedPage } from '../../../src/executor/observedOperations.js';
import { inspectCapturedElement } from '../../../src/run/browser.js';
import { createObservationFlow } from '../../../src/run/observationFlow.js';
import type { PageLike } from '../../../src/run/targetAction.js';
import { invoke, open, prepare, serve, sessionConfig, TestControl, type Opened, type Operation, type Served } from './cutover-support.js';
import { cdpOf, guardDist, launchChromium, openPage } from './harness.js';

guardDist();
describe('bounded public native context certificates', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchChromium(); });
  afterAll(async () => { await browser.close(); });
  const observe = async (html: string, values: string[] = []) => {
    const page = await openPage(browser, html), inventory = new PrivateInventory();
    inventory.withhold(values);
    const p = await perceive({ cdp: untrackedObservationChannel(await cdpOf(page)), inventory });
    const observation = { facts: Object.fromEntries(Object.entries(p.facts).map(([ref, f]) => [ref, { ...f, evidenceSegments: p.evidenceSegments[ref] ?? [] }])), outline: p.outline.text } as unknown as ObservedPage;
    validatePublicObservation(observation);
    return { page, p, observation };
  };
  it('combined read scope certifies exact row column and local native relation', async () => {
    const { page, p, observation: o } = await observe('<table><tr><th>Debian release</th><th>Code Name</th><th>Version</th></tr><tr><td>Debian 13</td><td>trixie</td><td>13</td></tr><tr><td>Debian 12</td><td>bookworm</td><td>12</td></tr></table>');
    try {
      const target = Object.values(o.facts).find(f => f.name === 'trixie'); expect(target).toBeDefined();
      expect(target?.readScope?.relation).toBe('SAME_ROW_LABEL');
      const names = target?.readScope?.sourceRefs.map(ref => o.facts[ref]?.name);
      expect(names).toEqual(['Debian 13','Code Name']);
      expect(qualifiedScopeAllows(o, must(target), 'Debian 13', 'read')).toBe(true);
      expect(qualifiedScopeAllows(o, must(target), 'Debian 12', 'read')).toBe(false);
      expect(qualifiedScopeAllows(o, must(target), 'Version', 'read')).toBe(false);
      expect(p.outline.bytes).toBeLessThanOrEqual(40000);
    } finally { await page.context().close(); }
  });
  it('qualified scope refs preserve kernel row click and named region identity without read-only leakage', async () => {
    const { page, observation: o } = await observe('<section aria-label="Primary workspace"><button>Open</button></section><section aria-label="Secondary workspace"><button>Open</button></section><table><tr><td>linux-next:</td><td><a href="#next">browse</a></td></tr><tr><td>stable:</td><td><a href="#stable">browse</a></td></tr></table>');
    try {
      const open = Object.values(o.facts).filter(f => f.name === 'Open'); expect(open).toHaveLength(2);
      expect(open.filter(f => qualifiedScopeAllows(o, f, 'Primary workspace', 'click'))).toHaveLength(1);
      const browse = Object.values(o.facts).filter(f => f.name === 'browse'); expect(browse).toHaveLength(2);
      expect(browse.filter(f => qualifiedScopeAllows(o, f, 'linux-next', 'click'))).toHaveLength(1);
      const { scopeRefs: _scopeRefs, ...base } = must(browse[0]);
      const forged = { ...base, readScope: { relation: 'R7_ADJACENT_PUBLIC' as const, sourceRefs: _scopeRefs ?? [] } };
      expect(qualifiedScopeAllows(o, forged as typeof browse[number], 'linux-next', 'click')).toBe(false);
    } finally { await page.context().close(); }
  });
  it('native source recheck refuses a lost region role on the same element', async () => {
    const { page, p, observation: o } = await observe('<div role="region" aria-label="Primary workspace"><button>Open</button></div>');
    try {
      const [ref, target] = must(Object.entries(o.facts).find(([, f]) => f.name === 'Open'));
      const sourceRef = must(target.scopeRefs?.[0]), source = must(o.facts[sourceRef]);
      const request = { ref, sources: [{ ref: sourceRef, role: source.role, name: source.name, mode: 'scope' as const }] };
      expect(await runOnEngine(p.engine, checkPublicSourceRelations, [request])).toBe(true);
      await page.locator('[role="region"]').evaluate(el => { el.removeAttribute('role'); });
      expect(await runOnEngine(p.engine, checkPublicSourceRelations, [request])).toBe(false);
    } finally { await page.context().close(); }
  });
  const keyword = '<h2>Search package directories</h2><form><label>Keyword: <input></label><button>Search</button></form><h2>Search package contents</h2><form><label>Keyword: <input></label><button>Search</button></form>';
  it('qualified Keyword fill uses only its certified package search heading', async () => {
    const { page, observation: o } = await observe(keyword);
    try {
      const fields = Object.values(o.facts).filter(f => f.name === 'Keyword:'); expect(fields).toHaveLength(2);
      expect(fields.filter(f => qualifiedScopeAllows(o, f, 'Search package directories', 'fill'))).toHaveLength(1);
      expect(fields.filter(f => qualifiedScopeAllows(o, f, 'Search package contents', 'fill'))).toHaveLength(1);
    } finally { await page.context().close(); }
  });
  it('qualified Keyword fill rejects an identically labelled control in the neighboring form', async () => {
    const { page, observation: o } = await observe(keyword, ['Search package directories']);
    try {
      const fields = Object.values(o.facts).filter(f => f.name === 'Keyword:');
      expect(fields.every(f => !qualifiedScopeAllows(o, f, 'Search package directories', 'fill'))).toBe(true);
      expect(o.outline).not.toContain('Search package directories');
    } finally { await page.context().close(); }
  });
  it('D2 linked native TH label and sole all-column title qualify the nearest table through both engines', async () => {
    const inner = '<table><tr><th colspan="2">Python</th></tr><tr><th><a href="#designer"><span>Designed by</span></a></th><td>Guido van Rossum</td></tr></table>';
    const { page, p, observation: o } = await observe(`<table><tr><th>Outer title</th></tr><tr><th>${inner}</th></tr></table><table><tr><th colspan="2">JavaScript</th></tr><tr><th><a href="#designer"><span>Designed by</span></a></th><td>Brendan Eich</td></tr></table>`);
    try {
      const [ref, target] = must(Object.entries(o.facts).find(([, fact]) => fact.name === 'Guido van Rossum'));
      const titleRef = must(target.readScope?.tableTitleRef);
      expect(o.facts[titleRef]).toMatchObject({ name: 'Python', nameComplete: true });
      expect(target.readScope?.sourceRefs).toContain(titleRef);
      expect(target.readScope?.sourceRefs.map(source => o.facts[source]?.name)).toEqual(['Designed by','Python']);
      const sourceRefs = must(target.readScope?.sourceRefs);
      const relation = { ref, tableTitleRef: titleRef, sources: sourceRefs.map(sourceRef => ({ ref: sourceRef, role: must(o.facts[sourceRef]).role, name: must(o.facts[sourceRef]).name, mode: 'SAME_ROW_LABEL' as const })) };
      expect(await runOnEngine(p.engine, checkPublicSourceRelations, [relation])).toBe(true);
      const otherLabel = must(Object.entries(o.facts).find(([sourceRef, fact]) => fact.role === 'link' && fact.name === 'Designed by' && !sourceRefs.includes(sourceRef)));
      const wrongRef = { ...relation, sources: relation.sources.map(source => source.ref === titleRef ? source : { ...source, ref: otherLabel[0] }) };
      // Identical public name/role in the neighboring table cannot stand in for the certified ref.
      expect(await runOnEngine(p.engine, checkPublicSourceRelations, [wrongRef])).toBe(false);
      expect(qualifiedScopeAllows(o, target, 'infobox for Python', 'read')).toBe(true);
      expect(qualifiedScopeAllows(o, target, 'infobox for JavaScript', 'read')).toBe(false);
      expect(qualifiedScopeAllows(o, target, 'infobox for Python', 'click')).toBe(false);
      const expected = [{ by: 'tag', tag: 'table' }, { by: 'filterHas', has: [{ by: 'role', role: must(o.facts[titleRef]).role, name: 'Python', exact: true }] }, { by: 'tag', tag: 'tr' }, { by: 'filterHas', has: [{ by: 'role', role: 'link', name: 'Designed by', exact: true }] }, { by: 'tag', tag: 'td' }] as const;
      const actualCandidateCount = (await backendIdsForSelector(p.engine, toEngineSelector(expected))).length;
      const candidate = await synthesize({ perception: p, ref, inventory: new PrivateInventory(), operation: { kind: 'read' } });
      expect(candidate.ok, JSON.stringify({ actualCandidateCount, result: candidate })).toBe(true);
      if (!candidate.ok) throw Error('MISSING_TABLE_CANDIDATE');
      expect(candidate.locator).toEqual([{ by: 'tag', tag: 'table' }, { by: 'filterHas', has: [{ by: 'role', role: o.facts[titleRef]?.role, name: 'Python', exact: true }] }, { by: 'tag', tag: 'tr' }, { by: 'filterHas', has: [{ by: 'role', role: 'link', name: 'Designed by', exact: true }] }, { by: 'tag', tag: 'td' }]);
      const selector = toEngineSelector(candidate.locator);
      expect(await backendIdsForSelector(p.engine, selector)).toEqual([p.backendNodeIds[ref]]);
      expect(await (buildPublicLocator(page as unknown as LocatorRoot, candidate.locator) as unknown as { count(): Promise<number> }).count()).toBe(1);
      expect(await checkFrozenSourceContext(p.engine, candidate.locator, selector, [])).toBe(true);
      // The complete final target is still unique, but the title now belongs only to the outer table.
      await page.locator('th').filter({ hasText: /^Python$/u }).evaluate(el => { el.textContent = 'Other language'; });
      await page.locator('table').first().locator('th').first().evaluate(el => { el.textContent = 'Python'; });
      expect(await backendIdsForSelector(p.engine, selector)).toEqual([p.backendNodeIds[ref]]);
      expect(await checkFrozenSourceContext(p.engine, candidate.locator, selector, [])).toBe(false);
    } finally { await page.context().close(); }
  });
  it('D2 refuses a final-two TD nesting layout without selecting an ordinary descendant prefix', async () => {
    const inner = '<table><tr><th colspan="2">Python</th></tr><tr><th><a href="#designer"><span>Designed by</span></a></th><td>Guido van Rossum</td></tr></table>';
    const { page, p, observation: o } = await observe(`<table><tr><th>Outer title</th></tr><tr><td>${inner}</td></tr></table>`);
    try {
      const [ref, target] = must(Object.entries(o.facts).find(([, fact]) => fact.name === 'Guido van Rossum'));
      const title = must(o.facts[must(target.readScope?.tableTitleRef)]);
      const locator = [{ by: 'tag', tag: 'table' }, { by: 'filterHas', has: [{ by: 'role', role: title.role, name: title.name, exact: true }] }, { by: 'tag', tag: 'tr' }, { by: 'filterHas', has: [{ by: 'role', role: 'link', name: 'Designed by', exact: true }] }, { by: 'tag', tag: 'td' }] as const;
      expect(await backendIdsForSelector(p.engine, toEngineSelector(locator))).toHaveLength(2);
      const candidate = await synthesize({ perception: p, ref, inventory: new PrivateInventory(), operation: { kind: 'read' } });
      expect(candidate.ok).toBe(false);
    } finally { await page.context().close(); }
  });
  it.each([
    '<tr><th colspan="1">Python</th></tr><tr><th><a href="#x">Designed by</a></th><td>Designer</td></tr>',
    '<caption>Competing title</caption><tr><th colspan="2">Python</th></tr><tr><th><a href="#x">Designed by</a></th><td>Designer</td></tr>',
    '<tr><th colspan="wrong">Python</th></tr><tr><th><a href="#x">Designed by</a></th><td>Designer</td></tr>',
    '<tr><th colspan="2">Python</th></tr><tr><th><a href="#x">Designed</a><a href="#y">by</a></th><td>Designer</td></tr>',
  ])('D2 refuses malformed title/linked-label certificate: %s', async body => {
    const { page, observation } = await observe(`<table>${body}</table>`);
    try { const target = Object.values(observation.facts).find(fact => fact.name === 'Designer'); expect(target?.readScope?.tableTitleRef).toBeUndefined(); }
    finally { await page.context().close(); }
  });
});

describe('R4 INV-002 retained native title and linked-label source coverage', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchChromium(); });
  afterAll(async () => { await browser.close(); });
  const inner = '<table id="nearest"><tr><th id="title" colspan="2"><span id="title-host">Python</span></th></tr><tr><th><a id="label" href="#designer"><span id="label-host">Designed by</span></a></th><td>Guido van Rossum</td></tr></table>';
  const fixture = `<main><table id="outer"><tr><th>Outer title</th></tr><tr><th>${inner}</th></tr></table><table id="neighbor"><tr><th colspan="2">JavaScript</th></tr><tr><th><a href="#other">Designed by</a></th><td>Brendan Eich</td></tr></table></main>`;
  type Dependency = 'title' | 'label';
  const attachClosed = async (created: Opened, dependency: Dependency, clear = false): Promise<void> => {
    await created.page.evaluate(({ dependency, clear }) => {
      const host = document.querySelector(`#${dependency}-host`);
      if (!host) throw Error('MISSING_CERTIFICATE_HOST');
      const root = host.attachShadow({ mode: 'closed' });
      root.innerHTML = '<slot></slot><span hidden>PRIVATE CERTIFICATE CANARY</span>';
      if (clear) root.replaceChildren(document.createElement('slot'));
    }, { dependency, clear });
  };
  const nativeOpened = async (served: Served, hooks: { extracted?: () => Promise<void>; compared?: () => Promise<void> } = {}) => {
    const created = await open(browser, served, '/source');
    await created.session.dispose();
    const descriptions: { depth: unknown; pierce: unknown }[] = [];
    let tracked = false, privatePayload = false, extractionHooks = 0, comparisonHooks = 0;
    const session = createObservationFlow({
      page: created.page as unknown as PageLike,
      async newCdp() {
        const raw = await created.page.context().newCDPSession(created.page);
        return {
          async send(method: string, params?: object) {
            if (['DOM.getDocument','DOM.requestNode','DOM.requestChildNodes','DOM.getFlattenedDocument'].includes(method)) tracked = true;
            const response = await raw.send(method as Parameters<typeof raw.send>[0], params as Parameters<typeof raw.send>[1]);
            if (method === 'DOM.describeNode') {
              const request = params as { depth?: unknown; pierce?: unknown };
              descriptions.push({ depth: request.depth, pierce: request.pierce });
              privatePayload ||= JSON.stringify(response).includes('PRIVATE CERTIFICATE CANARY');
            }
            const declaration = (params as { functionDeclaration?: string } | undefined)?.functionDeclaration ?? '';
            if (method === 'Runtime.callFunctionOn' && declaration.includes('this.extract(text =>') && hooks.extracted) { extractionHooks++; await hooks.extracted(); }
            if (method === 'Runtime.callFunctionOn' && declaration.includes('this.compare(expected, entries, mode,') && hooks.compared) { comparisonHooks++; await hooks.compared(); }
            return response;
          },
          detach: () => raw.detach(),
        };
      },
      inspectBoundElement: bound => inspectCapturedElement(created.page, bound),
      onNavigation(listener) { const callback = (): void => { listener(); }; created.page.on('framenavigated', callback); return () => { created.page.off('framenavigated', callback); }; },
      awaitWhitelistedMainFrame: () => Promise.resolve(),
    }, sessionConfig());
    return { ...created, session, metadata: () => ({ descriptions, tracked, privatePayload, extractionHooks, comparisonHooks }), close: async () => { await session.dispose(); await created.close(); } };
  };
  const preparedRead = async (created: Opened) => {
    const exported = await created.session.observe(undefined, false), rule = exported.observation.readRuleId ?? 'missing';
    const entry = must(Object.entries(exported.observation.facts).find(([, fact]) => fact.name === 'Guido van Rossum'));
    expect(entry[1].readScope?.sourceRefs.map(ref => exported.observation.facts[ref]?.name)).toEqual(['Designed by', 'Python']);
    expect(entry[1].readScope?.sourceRefs).toContain(entry[1].readScope?.tableTitleRef);
    const operation: Operation = { kind: 'read', bindingId: 'certified-designer', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule } };
    return { prepared: await prepare(created, entry[1].role, entry[1].name, operation, null, exported), operation, rule };
  };
  const sourceComparison = async (created: Opened) => {
    const { prepared, operation, rule } = await preparedRead(created);
    const identity = { admissionId: 'certificate-read', requestDigest: 'a'.repeat(64), operationHash: 'b'.repeat(64), coordinate: { stepId: 'read-step', ordinal: 0 }, authority: 'certificate-owner' };
    const result = await created.session.invoke({ invocationIdentity: identity, preparationId: 'certificate-preparation', resolved: prepared.resolved, operation,
      resolvedValue: null, origin: created.origin, maxValueBytes: 4096, readRuleId: rule, profile: 'learn',
      expect: { documentId: prepared.exported.observation.documentId, generation: prepared.exported.observation.generation } }, new TestControl());
    expect(result).toEqual({ value: 'Guido van Rossum' });
    created.session.commitRead?.(operation.bindingId, { identity, preparationId: 'certificate-preparation' });
    await created.session.observe(undefined, false);
    const refreshed = await created.session.observe(undefined, false);
    expect(refreshed.json).not.toContain('Guido van Rossum');
    const [ref] = must(Object.entries(refreshed.observation.facts).find(([, fact]) => fact.role === 'cell'
      && fact.readScope?.tableTitleRef !== undefined && refreshed.observation.facts[fact.readScope.tableTitleRef]?.name === 'Python'));
    const source = { bindingId: operation.bindingId, producerAdmissionId: identity.admissionId, producerPreparationId: 'certificate-preparation' };
    const assertion: Operation = { kind: 'assert', predicate: 'containsText', expected: { kind: 'binding', bindingId: operation.bindingId } };
    const reprepare = (frozen?: Parameters<typeof created.session.prepareTarget>[0]['frozen']) => created.session.prepareTarget({ ref, documentId: refreshed.observation.documentId,
      generation: refreshed.observation.generation, origin: created.origin, operation: assertion, authoredLiteral: null,
      assertSourceBinding: source, continuityAuthority: identity.authority, ...(frozen ? { frozen } : {}) });
    const resolved = await reprepare();
    expect(resolved.assertTextMode).toBe('READ_BINDING_SOURCE');
    expect(await reprepare(resolved)).toEqual(resolved);
    return { reprepare: () => reprepare(resolved), compare: (profile: 'learn' | 'replay' = 'learn', control = new TestControl()) => created.session.invoke({
      resolved, operation: assertion, resolvedValue: result.value ?? null, origin: created.origin, maxValueBytes: 4096, readRuleId: null, profile, assertSourceBinding: source,
      ...(profile === 'learn' ? { invocationIdentity: { ...identity, admissionId: 'certificate-assert' }, expect: { documentId: refreshed.observation.documentId, generation: refreshed.observation.generation } } : {}),
    }, control) };
  };
  const assertMetadata = (created: Awaited<ReturnType<typeof nativeOpened>>): void => {
    const metadata = created.metadata();
    expect(metadata.tracked).toBe(false); expect(metadata.privatePayload).toBe(false);
    expect(metadata.descriptions.length).toBeGreaterThan(0);
    expect(metadata.descriptions.every(request => request.depth === 0 && request.pierce === false)).toBe(true);
  };

  it('exact nearest native title and linked-label sources survive read commit, refresh, frozen preparation and learn/replay comparison', async () => {
    const served = await serve({ '/source': fixture }), created = await nativeOpened(served);
    try {
      const source = await sourceComparison(created);
      expect(await source.compare()).toEqual({ assertionPassed: true });
      expect(await source.compare('replay')).toEqual({ assertionPassed: true });
      assertMetadata(created);
    } finally { await created.close(); await served.close(); }
  });

  it.each(['title', 'label'] as const)('collection excludes a ghost light-DOM %s hidden by a preexisting closed span', async dependency => {
    const served = await serve({ '/source': fixture }), created = await nativeOpened(served);
    const marker = dependency === 'title' ? 'UNREGISTERED_GHOST_TITLE_4F91' : 'UNREGISTERED_GHOST_LABEL_7C26';
    try {
      // No observation, inventory withholding or known-private registration precedes attachment.
      // The native closed root renders the known public replacement while its host's
      // light-DOM text is absent from the rendered tree; diagnostics expose booleans only.
      const replacementRendered = await created.page.evaluate(({ dependency, marker }) => {
        const host = document.querySelector(`#${dependency}-host`);
        if (!host) throw Error('MISSING_GHOST_CERTIFICATE_HOST');
        host.textContent = marker;
        const root = host.attachShadow({ mode: 'closed' }), replacement = document.createElement('span');
        replacement.textContent = dependency === 'title' ? 'Python' : 'Designed by';
        root.append(replacement);
        const box = replacement.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }, { dependency, marker });
      expect(replacementRendered).toBe(true);
      const exported = await created.session.observe(undefined, false);
      const target = Object.values(exported.observation.facts).find(fact => fact.name === 'Guido van Rossum');
      expect(target !== undefined).toBe(true);
      const sourceRefs = target?.readScope?.sourceRefs ?? [];
      const ghostCertified = sourceRefs.some(ref => {
        const fact = exported.observation.facts[ref];
        return fact?.name.includes(marker) === true || fact?.text?.includes(marker) === true;
      });
      expect(ghostCertified).toBe(false);
      if (dependency === 'title') expect(target?.readScope?.tableTitleRef !== undefined).toBe(false);
      else expect(target?.readScope !== undefined).toBe(false);
      expect(exported.json.includes(marker)).toBe(false);
    } finally { await created.close(); await served.close(); }
  });

  it.each(['title', 'label'] as const)('refuses a preexisting closed span in the certified %s before read transfer', async dependency => {
    const served = await serve({ '/source': fixture }), created = await nativeOpened(served);
    try {
      const { prepared, operation, rule } = await preparedRead(created);
      await attachClosed(created, dependency);
      const attempted = prepare(created, 'cell', 'Guido van Rossum', operation, null, prepared.exported)
        .then(current => invoke(created, current, operation, { readRuleId: rule }));
      await expect(attempted).rejects.toBeDefined();
      expect(() => created.session.commitRead?.('certified-designer')).toThrow();
      assertMetadata(created);
    } finally { await created.close(); await served.close(); }
  });

  it.each(['title', 'label'] as const)('quarantines the staged read after a late cleared closed %s attachment', async dependency => {
    const served = await serve({ '/source': fixture });
    const created: Awaited<ReturnType<typeof nativeOpened>> = await nativeOpened(served, { extracted: () => attachClosed(created, dependency, true) });
    try {
      const { prepared, operation, rule } = await preparedRead(created);
      await expect(invoke(created, prepared, operation, { readRuleId: rule })).rejects.toBeDefined();
      expect(created.metadata().extractionHooks).toBe(1);
      expect(() => created.session.commitRead?.('certified-designer')).toThrow();
      assertMetadata(created);
    } finally { await created.close(); await served.close(); }
  });

  it.each(['title', 'label'] as const)('quarantines the staged boolean after a late cleared closed %s attachment', async dependency => {
    const served = await serve({ '/source': fixture });
    const created: Awaited<ReturnType<typeof nativeOpened>> = await nativeOpened(served, { compared: () => attachClosed(created, dependency, true) });
    try {
      const source = await sourceComparison(created);
      await expect(source.compare()).rejects.toBeDefined();
      expect(created.metadata().comparisonHooks).toBe(1);
      assertMetadata(created);
    } finally { await created.close(); await served.close(); }
  });

  it.each([
    ['title', 'hidden-input'], ['title', 'editable'], ['title', 'button'], ['title', 'private-control'],
    ['label', 'hidden-input'], ['label', 'editable'], ['label', 'button'], ['label', 'private-control'],
  ] as const)('refuses a %s source with a %s descendant before extracting the value', async (dependency, kind) => {
    const served = await serve({ '/source': fixture }), created = await nativeOpened(served);
    try {
      const { prepared, operation, rule } = await preparedRead(created);
      await created.page.evaluate(({ dependency, kind }) => {
        const source = document.querySelector(`#${dependency}`); if (!source) throw Error('MISSING_CERTIFICATE_SOURCE');
        const child = document.createElement(kind === 'button' ? 'button' : kind === 'editable' ? 'span' : 'input');
        if (kind === 'hidden-input') { child.setAttribute('type', 'hidden'); }
        if (kind === 'editable') { child.setAttribute('contenteditable', 'true'); child.setAttribute('hidden', ''); }
        if (kind === 'private-control') { child.setAttribute('type', 'password'); child.setAttribute('hidden', ''); }
        source.append(child);
      }, { dependency, kind });
      await expect(invoke(created, prepared, operation, { readRuleId: rule })).rejects.toBeDefined();
      expect(() => created.session.commitRead?.('certified-designer')).toThrow();
    } finally { await created.close(); await served.close(); }
  });

  it.each(['title', 'label'] as const)('retained %s change-and-restore revokes frozen preparation and both comparison profiles', async dependency => {
    const served = await serve({ '/source': fixture }), created = await nativeOpened(served);
    try {
      const source = await sourceComparison(created);
      await created.page.evaluate(dependency => {
        const text = document.querySelector(`#${dependency}-host`)?.firstChild;
        if (!text) throw Error('MISSING_CERTIFICATE_TEXT');
        const original = text.textContent; text.textContent = 'Transient source'; text.textContent = original;
      }, dependency);
      await expect(source.reprepare()).rejects.toBeDefined();
      await expect(source.compare()).rejects.toBeDefined();
      await expect(source.compare('replay')).rejects.toBeDefined();
    } finally { await created.close(); await served.close(); }
  });

  it.each(['title', 'label'] as const)('drains queued %s change-and-restore at the assertion fence without a boolean', async dependency => {
    const served = await serve({ '/source': fixture }), created = await nativeOpened(served);
    try {
      const source = await sourceComparison(created);
      const control = new TestControl(async () => {
        await created.page.evaluate(dependency => {
          const text = document.querySelector(`#${dependency}-host`)?.firstChild;
          if (!text) throw Error('MISSING_CERTIFICATE_TEXT');
          const original = text.textContent; text.textContent = 'Queued transient source'; text.textContent = original;
        }, dependency);
      });
      await expect(source.compare('learn', control)).rejects.toBeDefined();
      expect(control.fenced).toBe(1);
    } finally { await created.close(); await served.close(); }
  });

  it.each(['same-label-replacement', 'wrong-neighbor-title', 'nested-table-replacement'] as const)('refuses retained source identity changes after %s', async mutation => {
    const served = await serve({ '/source': fixture }), created = await nativeOpened(served);
    try {
      const source = await sourceComparison(created);
      await created.page.evaluate(kind => {
        const title = document.querySelector('#title'), label = document.querySelector('#label');
        if (!title || !label) throw Error('MISSING_CERTIFICATE_SOURCE');
        if (kind === 'same-label-replacement') label.replaceWith(label.cloneNode(true));
        else if (kind === 'wrong-neighbor-title') {
          const neighbor = document.querySelector('#neighbor th'); if (!neighbor) throw Error('MISSING_CERTIFICATE_NEIGHBOR');
          neighbor.textContent = 'Python'; title.textContent = 'Other language';
        } else {
          const table = document.querySelector('#nearest'); if (!table) throw Error('MISSING_CERTIFICATE_TABLE');
          table.replaceWith(table.cloneNode(true));
        }
      }, mutation);
      await expect(source.reprepare()).rejects.toBeDefined();
      await expect(source.compare()).rejects.toBeDefined();
      await expect(source.compare('replay')).rejects.toBeDefined();
    } finally { await created.close(); await served.close(); }
  });
});

describe('R7 exact raw normalization envelope', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchChromium(); });
  afterAll(async () => { await browser.close(); });
  it('combined R7 certificate preserves only bounded public assertion context', async () => {
    const valid = '<span><a href="#story">Copied private title</a><span>(<a href="#domain">public.example</a>)</span></span>';
    const variants = [
      valid,
      `<table><tr><td>1.</td><td>${valid}</td></tr></table>`,
      '<span><a href="#story">Copied private title</a><span><span>(<a href="#domain">public.example</a>)</span></span></span>',
      '<span><a href="#story">Copied private title</a><span aria-label="Named wrapper">(<a href="#domain">public.example</a>)</span></span>',
      '<span><a href="#story">Copied private title</a><span>(<a href="#domain">public.example</a>) extra</span></span>',
      '<span><a href="#story">Copied private title</a><span data-sensitive>(<a href="#domain">public.example</a>)</span></span>',
      '<span><a href="#story">Copied private title</a><span>((((((<a href="#domain">public.example</a>))))))</span></span>',
    ];
    for (const [index, html] of variants.entries()) {
      const page = await openPage(browser, html);
      try {
        const inventory = new PrivateInventory(); inventory.withhold(['Copied private title']);
        const p = await perceive({ cdp: await cdpOf(page), inventory });
        const opaque = Object.values(p.facts).find(f => f.role === 'link' && f.name === '');
        if (index <= 1) {
          const opaqueRef = must(Object.entries(p.facts).find(([, f]) => f === opaque))[0];
          const standard = await synthesize({ perception: p, ref: opaqueRef, inventory, operation: { kind: 'assert' } });
          expect(standard.ok).toBe(true);
          expect(JSON.stringify(standard)).not.toContain('Copied private title');
          expect(opaque?.nearSource).toBe('WITHHELD_ADJACENT_PUBLIC');
          expect(opaque?.readScope?.relation).toBe('R7_ADJACENT_PUBLIC');
          expect(opaque?.nameComplete).toBe(false); expect(opaque?.ownTextComplete).toBe(false); expect(opaque?.text).toBeUndefined();
          expect(p.evidenceSegments[must(Object.entries(p.facts).find(([, f]) => f === opaque))[0]]).toContainEqual(expect.objectContaining({ field: 'near', purpose: 'READ_ASSERT_ONLY' }));
        } else expect(opaque?.readScope).toBeUndefined();
        expect(p.outline.text).not.toContain('Copied private title');
        inventory.withhold(['public.example']);
        const revoked = await perceive({ cdp: await cdpOf(page), inventory });
        expect(Object.values(revoked.facts).every(f => f.readScope?.relation !== 'R7_ADJACENT_PUBLIC')).toBe(true);
      } finally { await page.context().close(); }
    }
  });
});

function must<T>(value: T | undefined): T { if (value === undefined) throw Error('MISSING_PUBLIC_FIXTURE_FACT'); return value; }

/**
 * Wikipedia infoboxes sit inside clearfix ancestors (`::before, ::after { content: ""; display: table }`).
 * An empty generated box is structural only for the CDP topology guard; emptiness is certified by the in-page
 * computed-content policy, which keeps refusing non-empty, attr(), counter(), list-item and animated generated content.
 */
describe('generated ::before/::after on certified public sources', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchChromium(); });
  afterAll(async () => { await browser.close(); });

  const INFOBOX = '<div class="wrap" data-x="attr-value"><table class="box"><tr><th colspan="2" class="cell">Python</th></tr><tr><th class="cell"><a href="#designer">Designed by</a></th><td class="cell">Guido van Rossum</td></tr></table></div>';
  const page = async (css: string) => {
    const opened = await openPage(browser, `<main aria-label="Article"><style>${css}</style>${INFOBOX}</main>`);
    const p = await perceive({ cdp: untrackedObservationChannel(await cdpOf(opened)), inventory: new PrivateInventory() });
    return { opened, p };
  };
  const refsOf = (p: Awaited<ReturnType<typeof page>>['p']): { all: string[]; value: string; title: string; label: string } => {
    const entries = Object.entries(p.facts);
    const find = (name: string): string => entries.find(([, fact]) => fact.name === name)?.[0] ?? '';
    const [value, title, label] = [find('Guido van Rossum'), find('Python'), find('Designed by')];
    return { all: [value, title, label], value, title, label };
  };

  it.each([
    ['clearfix on the wrapper ancestor', '.wrap::before,.wrap::after{content:"";display:table}'],
    ['clearfix on the table ancestor', '.box::before,.box::after{content:"";display:table;clear:both}'],
    ['empty ::after on the source cells themselves', '.cell::after{content:"";display:table}'],
    ['empty ::before and ::after on every host', '.wrap::before,.wrap::after,.box::before,.box::after,.cell::before,.cell::after{content:"";display:table}'],
  ])('empty generated content is not quarantined: %s', async (_name, css) => {
    const { opened, p } = await page(css);
    try {
      const refs = refsOf(p);
      expect(refs.all.every(ref => ref !== '')).toBe(true);
      const value = p.facts[refs.value];
      expect(value?.readScope?.tableTitleRef).toBe(refs.title);
      expect(value?.readScope?.sourceRefs.map(ref => p.facts[ref]?.name)).toEqual(['Designed by', 'Python']);
      expect([...await unsafePublicRoots(p.engine, refs.all)]).toEqual([]);
    } finally { await opened.context().close(); }
  });

  it.each([
    ['non-empty content', '.box::before{content:"x"}'],
    ['non-empty content on a source cell', '.cell::after{content:"x"}'],
    ['attr() content', '.wrap::after{content:attr(data-x)}'],
    ['counter() content', '.box::before{content:counter(c)}'],
    ['empty ::before displayed as list-item (nested marker)', '.box::before{content:"";display:list-item;list-style:disc inside}'],
    ['empty ::after displayed as list-item (nested marker)', '.wrap::after{content:"";display:list-item;list-style:"- " inside}'],
    ['animated ::before', '@keyframes k{from{opacity:1}to{opacity:.5}} .wrap::before{content:"";display:table;animation:k 100s linear infinite}'],
    ['animated ::after', '@keyframes k{from{opacity:1}to{opacity:.5}} .box::after{content:"";display:table;animation:k 100s linear infinite}'],
  ])('still quarantined: %s', async (_name, css) => {
    const { opened, p } = await page(css);
    try {
      const refs = refsOf(p);
      const unsafe = await unsafePublicRoots(p.engine, refs.all.filter(ref => ref !== ''));
      // Every ref sits below the styled host except nothing: the whole certified family is opaque.
      expect(unsafe.size).toBeGreaterThan(0);
    } finally { await opened.context().close(); }
  });

  it('an animation elsewhere on the page does not quarantine the sources', async () => {
    const { opened, p } = await page('@keyframes k{from{opacity:1}to{opacity:.5}} .other{animation:k 100s linear infinite} .other::before{content:"";animation:k 100s linear infinite} .wrap::before{content:"";display:table}');
    try {
      await opened.evaluate(() => { const other = document.createElement('div'); other.className = 'other'; other.textContent = 'Unrelated'; document.body.append(other); });
      const refs = refsOf(p);
      expect([...await unsafePublicRoots(p.engine, refs.all)]).toEqual([]);
    } finally { await opened.context().close(); }
  });

  it('an open shadow root on a source ancestor is still quarantined', async () => {
    const { opened, p } = await page('');
    try {
      const refs = refsOf(p);
      await opened.evaluate(() => { document.querySelector('.wrap')?.attachShadow({ mode: 'open' }); });
      expect((await unsafePublicRoots(p.engine, [refs.value])).has(refs.value)).toBe(true);
    } finally { await opened.context().close(); }
  });
});
