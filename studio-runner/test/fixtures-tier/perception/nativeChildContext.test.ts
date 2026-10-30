// eslint-disable-next-line no-restricted-imports -- Real Chromium native conformance tier.
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { perceive } from '../../../src/run/perceive.js';
import { buildPublicLocator, childPrefixes, synthesize, toEngineSelector, validateLocator, type Locator, type LocatorRoot } from '../../../src/run/locatorSynth.js';
import { backendIdsForSelector, openEngine, runOnEngine } from '../../../src/run/playwrightEngine.js';
import { collectPage, type CollectedPage, type SnapshotNode } from '../../../src/run/perceptionInPage.js';
import { serve, open, prepare, invoke, TestControl, sessionConfig, type Opened, type Served } from './cutover-support.js';
import type { Operation } from './cutover-support.js';
import { createObservedReplayAdapter } from '../../../src/run/observedReplayAdapter.js';
import { createBrowserObservationSession, inspectCapturedElement } from '../../../src/run/browser.js';
import { createObservationFlow } from '../../../src/run/observationFlow.js';
import type { PageLike } from '../../../src/run/targetAction.js';
import type { BrowserHandle } from '../../../src/run/browserFactory.js';
import type { Guard, ReplayAction, Scope } from '../../../src/executor/observedOperations.js';
import { PrivateInventory } from '../../../src/run/privateInventory.js';
import { cdpOf, guardDist, launchChromium, openPage } from './harness.js';

guardDist();
describe('native sole-text and closed child context', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchChromium(); });
  afterAll(async () => { await browser.close(); });
  it('combined standard generator resolves exact native paragraph and strong', async () => {
    const page = await openPage(browser, '<section><h2>First report</h2><p>Visible report value</p><strong>Current stable</strong></section>');
    try {
      const cdp = await cdpOf(page), inventory = new PrivateInventory();
      const original = await perceive({ cdp, inventory });
      expect(Object.values(original.facts).map(f => f.role)).toContain('paragraph');
      expect(original.outline.text).toMatch(/- paragraph \[e[0-9]+\] \{text=/u);
      expect(original.outline.text).not.toContain('- paragraph "');
      expect(Object.values(original.facts).map(f => f.role)).toContain('strong');
      const root = Object.entries(original.facts).find(([, f]) => f.role === 'paragraph'); expect(root).toBeDefined();
      const choice = await synthesize({ perception: original, ref: must(root)[0], inventory, operation: { kind: 'read' } });
      expect(choice.ok).toBe(true);
      if (choice.ok) {
        const ids = await backendIdsForSelector(original.engine, toEngineSelector(choice.locator));
        expect(ids).toEqual([original.backendNodeIds[must(root)[0]]]);
        expect(await (buildPublicLocator(page as unknown as LocatorRoot, choice.locator) as unknown as { count(): Promise<number> }).count()).toBe(1);
      }
      inventory.withhold(['Visible report value']);
      const masked = await perceive({ cdp, inventory });
      const withheld = Object.values(masked.facts).find(f => f.role === 'paragraph');
      expect(withheld).toMatchObject({ name: '', nameComplete: false, ownTextComplete: false });
      expect(withheld?.text).toBeUndefined(); expect(masked.outline.text).not.toContain('Visible report value');
    } finally { await page.context().close(); }
  });
  it('native preparation captures withholds and asserts the same paragraph while repeat read refuses', async () => {
    const served = await serve({ '/native': '<section><h2>About</h2><p>A complete public description</p></section>' });
    const opened = await open(browser, served, '/native');
    try {
      const original = await opened.session.observe(), rule = original.observation.readRuleId;
      expect(rule).not.toBeNull();
      const read: Operation = { kind: 'read', bindingId: 'copied', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule ?? 'missing' } };
      const first = await prepare(opened, 'paragraph', '', read, null, original);
      expect(first.resolved.identity.role).toBe('paragraph');
      const captured = await invoke(opened, first, read, { readRuleId: rule });
      expect(captured.value).toBe('A complete public description');
      await opened.session.withhold?.([captured.value ?? '']);
      const opaque = await opened.session.observe();
      expect(opaque.observation.facts[first.ref]?.text).toBeUndefined();
      const assertion: Operation = { kind: 'assert', predicate: 'containsText', expected: { kind: 'authoredLiteral', sourceInputId: 'local-copied-value' } };
      const prepared = await prepare(opened, 'paragraph', '', assertion, null, opaque);
      expect((await invoke(opened, prepared, assertion, { value: captured.value ?? '' })).assertionPassed).toBe(true);
      await expect(prepare(opened, 'paragraph', '', read, null, opaque)).rejects.toMatchObject({ code: 'READ_NOT_ALLOWED' });
    } finally { await opened.close(); await served.close(); }
  });
  it('child public and private compilation agree and reject descendant ambiguity', async () => {
    const page = await openPage(browser, '<div><h2>Direct report</h2><p>Value one</p></div><div><span><h2>Direct report</h2></span><p>Value two</p></div>');
    try {
      const cdp = await cdpOf(page), p = await perceive({ cdp, inventory: new PrivateInventory() });
      const locator: Locator = [{ by: 'tag', tag: 'div' }, { by: 'filterHas', relation: 'child', has: [{ by: 'role', role: 'heading', name: 'Direct report', exact: true }] }, { by: 'role', role: 'paragraph' }];
      validateLocator(locator); expect(childPrefixes(locator)).toHaveLength(1);
      expect(await (buildPublicLocator(page as unknown as LocatorRoot, locator) as unknown as { count(): Promise<number> }).count()).toBe(1);
      expect(await backendIdsForSelector(p.engine, toEngineSelector(locator))).toHaveLength(1);
      const root = Object.entries(p.facts).find(([, f]) => f.role === 'paragraph' && f.text?.includes('Value one'));
      expect(root).toBeDefined(); expect(await backendIdsForSelector(p.engine, toEngineSelector(locator))).toEqual([p.backendNodeIds[must(root)[0]]]);
    } finally { await page.context().close(); }
  });

  it('D1 keeps the original mixed paragraph and exact authored literal in a complete direct run', async () => {
    const literal = 'This domain is for use in illustrative examples in documents.';
    const served = await serve({ '/iana': `<main><p>${literal} <a href="/more">Learn more.</a></p></main>` });
    const opened = await open(browser, served, '/iana');
    try {
      const observation = await opened.session.observe();
      const raw = await runOnEngine(await openEngine(await cdpOf(opened.page)), collectPage) as CollectedPage;
      const native: { ref?: string; nameLength: number; children: string[]; direct: boolean }[] = [];
      const inspect = (node: SnapshotNode | string): void => { if (typeof node === 'string') return; if (node.role === 'paragraph') native.push({ ...(node.ref ? { ref: node.ref } : {}), nameLength: (node.name ?? '').length, children: (node.children ?? []).map(child => typeof child === 'string' ? 'direct-text' : child.role), direct: node.ref ? raw.facts[node.ref]?.directTextAssertion === true : false }); node.children?.forEach(inspect); };
      raw.json.forEach(inspect);
      const entry = Object.entries(observation.observation.facts).find(([, fact]) => fact.role === 'paragraph');
      expect(entry, JSON.stringify({ native, sanitizedRoles: Object.values(observation.observation.facts).map(fact => fact.role) })).toBeDefined();
      const fact = must(entry);
      expect(fact[1]).toMatchObject({ name: '', ownTextComplete: true, directTextAssertion: true });
      expect(Object.values(observation.observation.facts).some(fact => fact.role === 'link' && fact.name === 'Learn more.')).toBe(true);
      const operation: Operation = { kind: 'assert', predicate: 'containsText', expected: { kind: 'authoredLiteral', sourceInputId: 'authored-assertion' } };
      const prepared = await prepare(opened, 'paragraph', '', operation, null, observation);
      expect(prepared.resolved.assertTextMode).toBe('DIRECT_PUBLIC');
      expect(prepared.resolved.locator).toEqual([{ by: 'role', role: 'paragraph' }, { by: 'filterHas', relation: 'child', has: [{ by: 'role', role: 'link', name: 'Learn more.', exact: true }] }]);
      expect(await invoke(opened, prepared, operation, { value: literal })).toEqual({ assertionPassed: true });
      for (let round = 0; round < 2; round++) expect(await invoke(opened, prepared, operation, { value: literal, profile: 'replay', bind: false })).toEqual({ assertionPassed: true });
      expect(await invoke(opened, prepared, operation, { value: 'documents in examples illustrative' })).toEqual({ assertionPassed: false });
      expect(await invoke(opened, prepared, operation, { value: 'This domain is for use in illustrative examples in documents. Learn more.' })).toEqual({ assertionPassed: false });
      for (const invalid of [{ kind: 'assert', predicate: 'visible', expected: null }, { kind: 'click' }] as Operation[]) {
        await expect(opened.session.prepareTarget({ ref: fact[0], documentId: observation.observation.documentId, generation: observation.observation.generation, origin: observation.observation.origin, operation: invalid, authoredLiteral: null })).rejects.toBeDefined();
      }
      await opened.session.withhold?.([literal]);
      await expect(invoke(opened, prepared, operation, { value: literal })).rejects.toBeDefined();
    } finally { await opened.close(); await served.close(); }
  });

  it.each([
    '<p>One direct <a href="#more">Learn more.</a> competing run.</p>',
    '<p>One <span>opaque child</span> direct run <a href="#more">Learn more.</a></p>',
    `<p>${'long '.repeat(60)}<a href="#more">Learn more.</a></p>`,
    '<p>One direct run <span data-sensitive>PRIVATE CHILD</span><a href="#more">Learn more.</a></p>',
  ])('D1 refuses incomplete, competing, split or private direct provenance: %s', async html => {
    const page = await openPage(browser, html);
    try {
      const p = await perceive({ cdp: await cdpOf(page), inventory: new PrivateInventory() });
      expect(Object.values(p.facts).every(fact => !fact.directTextAssertion)).toBe(true);
      expect(p.outline.text).not.toContain('PRIVATE CHILD');
    } finally { await page.context().close(); }
  });

  const sourceComparison = async (opened: Opened) => {
    const observed = await opened.session.observe(), rule = observed.observation.readRuleId ?? 'missing';
    const read: Operation = { kind: 'read', bindingId: 'captured-version', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule } };
    const prepared = await prepare(opened, 'paragraph', '', read, null, observed);
    const identity = { admissionId: 'read-admission', requestDigest: 'a'.repeat(64), operationHash: 'b'.repeat(64), coordinate: { stepId: 'read-step', ordinal: 0 }, authority: 'test-authenticated-owner' };
    const result = await opened.session.invoke({ invocationIdentity: identity, preparationId: 'exact-read-preparation', resolved: prepared.resolved, operation: read,
      resolvedValue: null, origin: opened.origin, maxValueBytes: 4096, readRuleId: rule, profile: 'learn',
      expect: { documentId: observed.observation.documentId, generation: observed.observation.generation } }, new TestControl());
    expect(result.value).toBe('Public current version 7.2.1');
    opened.session.commitRead?.(read.bindingId, { identity, preparationId: 'exact-read-preparation' });
    // Both old snapshot engine handles are released. The pre-read observer must remain live.
    await opened.session.observe();
    const refreshed = await opened.session.observe();
    expect(refreshed.json).not.toContain('Public current version 7.2.1');
    const source = { bindingId: read.bindingId, producerAdmissionId: identity.admissionId, producerPreparationId: 'exact-read-preparation' };
    const operation: Operation = { kind: 'assert', predicate: 'containsText', expected: { kind: 'binding', bindingId: read.bindingId } };
    const ref = must(Object.entries(refreshed.observation.facts).find(([, fact]) => fact.role === 'paragraph'))[0];
    const resolved = await opened.session.prepareTarget({ ref, documentId: refreshed.observation.documentId, generation: refreshed.observation.generation,
      origin: opened.origin, operation, authoredLiteral: null, assertSourceBinding: source, continuityAuthority: identity.authority });
    expect(resolved.assertTextMode).toBe('READ_BINDING_SOURCE');
    const frozen = await opened.session.prepareTarget({ ref, documentId: refreshed.observation.documentId, generation: refreshed.observation.generation,
      origin: opened.origin, operation, authoredLiteral: null, assertSourceBinding: source, continuityAuthority: identity.authority, frozen: resolved });
    expect(frozen).toEqual(resolved);
    return { compare: (profile: 'learn' | 'replay' = 'learn', control = new TestControl()) => opened.session.invoke({ resolved, operation, resolvedValue: result.value ?? null,
      origin: opened.origin, maxValueBytes: 4096, readRuleId: null, profile, assertSourceBinding: source,
      ...(profile === 'learn' ? { invocationIdentity: { ...identity, admissionId: 'assert-admission' }, expect: { documentId: refreshed.observation.documentId, generation: refreshed.observation.generation } } : {}) }, control) };
  };

  it('D3 exact successful read capability survives observation refresh and compares in learn and replay', async () => {
    const served = await serve({ '/source': '<main><p data-testid="version">Public current version 7.2.1</p><input type="password" id="private" value=""></main>' });
    const opened = await open(browser, served, '/source');
    try {
      const source = await sourceComparison(opened);
      expect(await source.compare()).toEqual({ assertionPassed: true });
      expect(await source.compare('replay')).toEqual({ assertionPassed: true });
    } finally { await opened.close(); await served.close(); }
  });
  it('D3/D4 ordinary model-free replay creates a fresh typed capability in each independent session', async () => {
    const served = await serve({ '/source': '<main><p data-testid="version">Public current version 7.2.1</p></main>' });
    const opened = await open(browser, served, '/source');
    try {
      const observed = await opened.session.observe(), rule = observed.observation.readRuleId ?? 'missing';
      const operation: Operation = { kind: 'read', bindingId: 'copied-version', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule } };
      const learned = await prepare(opened, 'paragraph', '', operation, null, observed);
      const scope: Scope = { principalId: 'native-replay-principal', csiId: 'native-replay-csi', environment: 'test', capabilities: ['read','assert'], initialContext: { kind: 'observedDocument', origin: opened.origin } };
      const handle = { createObservationSession: (config: Parameters<typeof createBrowserObservationSession>[1]) => createBrowserObservationSession(opened.page, config), observedBlankMatches: () => Promise.resolve(false), observedNavigateBlank: () => Promise.resolve() } as unknown as BrowserHandle;
      const read: ReplayAction = { coordinate: { stepId: 'read-step', ordinal: 0 }, guardId: 'g0', operation };
      const assertion: ReplayAction = { coordinate: { stepId: 'assert-step', ordinal: 0 }, guardId: 'g1', operation: { kind: 'assert', predicate: 'containsText', expected: { kind: 'binding', bindingId: operation.bindingId } } };
      const guard: Guard = { guardId: 'g0', origin: opened.origin, target: { kind: 'element', ...learned.resolved, readRuleId: rule } };
      const sourceGuard: Guard = { guardId: 'g1', origin: opened.origin, target: { kind: 'element', ...learned.resolved, readRuleId: null, assertTextMode: 'READ_BINDING_SOURCE' } };
      for (const round of [1,2]) {
        const adapter = createObservedReplayAdapter(handle, scope, ['localhost'], `fresh-replay-${String(round)}`, () => undefined);
        try {
          const captured = await adapter.perform(read, guard, null, new TestControl());
          expect(captured.value).toBe('Public current version 7.2.1');
          adapter.captureRead?.(operation.bindingId);
          expect(await adapter.perform(assertion, sourceGuard, captured.value ?? '', new TestControl())).toEqual({ assertionPassed: true });
          await adapter.withhold(captured.value ?? '');
          await expect(adapter.perform(assertion, sourceGuard, captured.value ?? '', new TestControl())).rejects.toBeDefined();
        } finally { await adapter.dispose(); }
      }
    } finally { await opened.close(); await served.close(); }
  });

  it.each(['changeRestore','privateChanged','childRestore','ancestorRestore','detachRestore','replacement','privateDuplicate','knownSecret','inputRevision'] as const)('D4/D5 emits no assertion boolean after %s', async mutation => {
    const served = await serve({ '/source': '<main><p data-testid="version">Public current version 7.2.1</p><input type="password" id="private" value=""></main>' });
    const opened = await open(browser, served, '/source');
    try {
      const source = await sourceComparison(opened);
      if (mutation === 'knownSecret') await opened.session.withhold?.(['Public current version 7.2.1']);
      else if (mutation === 'inputRevision') opened.session.revokeReads?.();
      else await opened.page.evaluate(kind => {
        const p = document.querySelector('p'); if (!p) throw Error('MISSING_TEST_SOURCE');
        if (kind === 'changeRestore') { const original = p.textContent; p.textContent = 'PRIVATE CHANGED VALUE'; p.textContent = original; }
        if (kind === 'childRestore') { const child = document.createElement('span'); child.textContent = 'unknown'; p.append(child); child.remove(); }
        if (kind === 'ancestorRestore') { p.parentElement?.setAttribute('data-sensitive', ''); p.parentElement?.removeAttribute('data-sensitive'); }
        if (kind === 'detachRestore') { const parent = p.parentNode; const next = p.nextSibling; p.remove(); parent?.insertBefore(p, next); }
        if (kind === 'replacement') p.replaceWith(p.cloneNode(true));
        if (kind === 'privateDuplicate' || kind === 'privateChanged') {
          const privateField = document.querySelector<HTMLInputElement>('#private');
          if (!privateField) throw Error('MISSING_PRIVATE_TEST_CONTROL');
          privateField.value = kind === 'privateDuplicate' ? 'Public current version 7.2.1' : 'PRIVATE CHANGED VALUE';
          if (kind === 'privateChanged') p.textContent = 'PRIVATE CHANGED VALUE';
        }
      }, mutation);
      await expect(source.compare()).rejects.toBeDefined();
      await expect(source.compare('replay')).rejects.toBeDefined();
    } finally { await opened.close(); await served.close(); }
  });
  it('D3 refuses source text changed to a current password value before read extraction', async () => {
    const served = await serve({ '/source': '<main><p data-testid="version">Public current version 7.2.1</p><input type="password" id="private" value=""></main>' });
    const opened = await open(browser, served, '/source');
    try {
      const observed = await opened.session.observe(), rule = observed.observation.readRuleId ?? 'missing';
      const read: Operation = { kind: 'read', bindingId: 'never-committed', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule } };
      const prepared = await prepare(opened, 'paragraph', '', read, null, observed);
      await opened.page.evaluate(() => { const privateField = document.querySelector<HTMLInputElement>('#private'); if (!privateField) throw Error('MISSING_PRIVATE_TEST_CONTROL'); privateField.value = 'PRIVATE READ CANARY'; const node = document.querySelector('p'); if (node) node.textContent = 'PRIVATE READ CANARY'; });
      await expect(invoke(opened, prepared, read, { readRuleId: rule })).rejects.toBeDefined();
      expect(() => opened.session.commitRead?.(read.bindingId)).toThrow();
    } finally { await opened.close(); await served.close(); }
  });
  it('D4/D5 refuses when persistent and fresh DOM private inventories overflow their shared existing cap', async () => {
    const controls = Array.from({ length: 32 }, (_, index) => `<input type="hidden" id="private-${String(index)}" value="">`).join('');
    const served = await serve({ '/source': `<main><p data-testid="version">Public current version 7.2.1</p>${controls}</main>` });
    const opened = await open(browser, served, '/source');
    try {
      const observed = await opened.session.observe(), rule = observed.observation.readRuleId ?? 'missing';
      const operation: Operation = { kind: 'read', bindingId: 'bounded-source', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule } };
      const prepared = await prepare(opened, 'paragraph', '', operation, null, observed);
      await opened.session.withhold?.(Array.from({ length: 4090 }, (_, index) => `FOREIGN-${String(index).padStart(5, '0')}`));
      await opened.page.evaluate(() => { for (const [index, input] of Array.from(document.querySelectorAll('input')).entries()) input.value = `DOM-FOREIGN-${String(index)}`; });
      await expect(invoke(opened, prepared, operation, { readRuleId: rule })).rejects.toBeDefined();
      expect(() => opened.session.commitRead?.(operation.bindingId)).toThrow();
    } finally { await opened.close(); await served.close(); }
  });
  it('D5 drains change-and-restore records at the assertion commitment fence', async () => {
    const served = await serve({ '/source': '<main><p data-testid="version">Public current version 7.2.1</p></main>' });
    const opened = await open(browser, served, '/source');
    try {
      const source = await sourceComparison(opened);
      const control = new TestControl(async () => {
        await opened.page.evaluate(() => { const node = document.querySelector('p')?.firstChild; if (!node) throw Error('MISSING_TEST_SOURCE'); const text = node.textContent; node.textContent = 'PRIVATE CHANGE'; node.textContent = text; });
      });
      await expect(source.compare('learn', control)).rejects.toBeDefined();
      expect(control.fenced).toBe(1);
    } finally { await opened.close(); await served.close(); }
  });

  const shadowOpened = async (served: Served, hooks: { extracted?: () => Promise<void>; compared?: () => Promise<void> } = {}) => {
    const opened = await open(browser, served, '/source');
    await opened.session.dispose();
    const descriptions: { depth: unknown; pierce: unknown }[] = [];
    let hiddenPayload = false, tracked = false;
    const session = createObservationFlow({
      page: opened.page as unknown as PageLike,
      async newCdp() {
        const raw = await opened.page.context().newCDPSession(opened.page);
        return {
          async send(method: string, params?: object) {
            if (['DOM.getDocument','DOM.requestNode','DOM.requestChildNodes','DOM.getFlattenedDocument'].includes(method)) tracked = true;
            const response = await raw.send(method as Parameters<typeof raw.send>[0], params as Parameters<typeof raw.send>[1]);
            if (method === 'DOM.describeNode') {
              const request = params as { depth?: unknown; pierce?: unknown };
              descriptions.push({ depth: request.depth, pierce: request.pierce });
              hiddenPayload ||= JSON.stringify(response).includes('PRIVATE CLOSED CANARY');
            }
            const declaration = (params as { functionDeclaration?: string } | undefined)?.functionDeclaration ?? '';
            if (method === 'Runtime.callFunctionOn' && declaration.includes('this.extract(text =>')) await hooks.extracted?.();
            if (method === 'Runtime.callFunctionOn' && declaration.includes('this.compare(expected, entries, mode,')) await hooks.compared?.();
            return response;
          },
          detach: () => raw.detach(),
        };
      },
      inspectBoundElement: bound => inspectCapturedElement(opened.page, bound),
      onNavigation(listener) { const callback = (): void => { listener(); }; opened.page.on('framenavigated', callback); return () => { opened.page.off('framenavigated', callback); }; },
      awaitWhitelistedMainFrame: () => Promise.resolve(),
    }, sessionConfig());
    return { ...opened, session, metadata: () => ({ descriptions, hiddenPayload, tracked }), close: async () => { await session.dispose(); await opened.close(); } };
  };
  const attachClosed = async (opened: Pick<Opened, 'page'>, place: 'source' | 'descendant' | 'ancestor', clear = false): Promise<void> => {
    await opened.page.evaluate(({ place, clear }) => {
      const selector = place === 'source' ? '#source' : place === 'descendant' ? '#descendant' : 'main';
      const host = document.querySelector(selector); if (!host) throw Error('MISSING_SHADOW_TEST_HOST');
      const root = host.attachShadow({ mode: 'closed' });
      root.innerHTML = '<slot></slot><span>PRIVATE CLOSED CANARY</span>';
      if (clear) root.replaceChildren(document.createElement('slot'));
    }, { place, clear });
  };
  it.each(['source','descendant','ancestor'] as const)('D5/R5 refuses a preexisting closed %s root before read transfer without receiving its contents', async place => {
    const served = await serve({ '/source': '<main><section aria-label="Source" data-testid="source" id="source">Public source text<span id="descendant"></span></section></main>' });
    const opened = await shadowOpened(served);
    try {
      const observed = await opened.session.observe(), rule = observed.observation.readRuleId ?? 'missing';
      const operation: Operation = { kind: 'read', bindingId: 'closed-source', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule } };
      const prepared = await prepare(opened, 'region', 'Source', operation, null, observed);
      await attachClosed(opened, place);
      await expect(invoke(opened, prepared, operation, { readRuleId: rule })).rejects.toBeDefined();
      expect(() => opened.session.commitRead?.(operation.bindingId)).toThrow();
      expect(opened.metadata().tracked).toBe(false); expect(opened.metadata().hiddenPayload).toBe(false);
      expect(opened.metadata().descriptions.every(request => request.depth === 0 && request.pierce === false)).toBe(true);
    } finally { await opened.close(); await served.close(); }
  });
  it('D5/R5 quarantines a read value when closed attachment occurs after extraction and is cleared', async () => {
    const served = await serve({ '/source': '<main><section aria-label="Source" data-testid="source" id="source">Public source text</section></main>' });
    const opened: Awaited<ReturnType<typeof shadowOpened>> = await shadowOpened(served, { extracted: () => attachClosed(opened, 'source', true) });
    try {
      const observed = await opened.session.observe(), rule = observed.observation.readRuleId ?? 'missing';
      const operation: Operation = { kind: 'read', bindingId: 'quarantined-read', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule } };
      const prepared = await prepare(opened, 'region', 'Source', operation, null, observed);
      await expect(invoke(opened, prepared, operation, { readRuleId: rule })).rejects.toBeDefined();
      expect(() => opened.session.commitRead?.(operation.bindingId)).toThrow();
      expect(opened.metadata().hiddenPayload).toBe(false); expect(opened.metadata().tracked).toBe(false);
    } finally { await opened.close(); await served.close(); }
  });
  it('D5/R5 quarantines the assertion boolean when closed attachment follows native comparison', async () => {
    const served = await serve({ '/source': '<main><p data-testid="version" id="source">Public current version 7.2.1</p></main>' });
    const opened: Awaited<ReturnType<typeof shadowOpened>> = await shadowOpened(served, { compared: () => attachClosed(opened, 'source', true) });
    try {
      const source = await sourceComparison(opened);
      await expect(source.compare()).rejects.toBeDefined();
      expect(opened.metadata().hiddenPayload).toBe(false); expect(opened.metadata().tracked).toBe(false);
    } finally { await opened.close(); await served.close(); }
  });
});

function must<T>(value: T | undefined): T { if (value === undefined) throw Error('MISSING_NATIVE_FIXTURE_FACT'); return value; }
