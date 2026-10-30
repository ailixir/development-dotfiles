import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_DOMAINS } from '../../src/allowedDomains.js';
import { OriginNotAllowed } from '../../src/allowedDomains.js';
import { ClosedActionError } from '../../src/run/closedError.js';
import { canonicalObservation, exportObservation, observationOptions } from '../../src/run/observationSanitizer.js';
import { createObservationFlow, shownRefsOf, type FlowCdp, type FlowHost } from '../../src/run/observationFlow.js';
import { readGrantId } from '../../src/run/observationReadProfile.js';
import type { ObservationConfig, ObservationReadProfile } from '../../src/run/observationTypes.js';
import { installPageState } from '../../src/run/pageStateInPage.js';
import type { ElementCandidateFacts, OptionListing } from '../../src/run/perceptionInPage.js';
import { FakePage, FakeWorld } from '../helpers/fakePage.js';
import { perceive } from '../../src/run/perceive.js';
import { ScriptedCdp, elementFacts, n, page, type Script } from './perceptionFakes.js';
import { untrackedObservationChannel, captureSourceOnEngine, sourceValue } from '../../src/run/playwrightEngine.js';

/**
 * The Playwright-free observation session (plan D-1, D-2, D-5, D-16) driven by a scripted CDP and the fake page of the executor tests.
 * The page programs themselves run only in the perception tier.
 */

const SCOPE = 'a'.repeat(64);
describe('D5/R5 dedicated untracked source metadata channel', () => {
  it.each(['DOM.getDocument','DOM.requestNode','DOM.requestChildNodes','DOM.pushNodesByBackendIdsToFrontend','DOM.getFlattenedDocument','DOMSnapshot.captureSnapshot'])('blocks %s before any protocol request and latches unknown coverage', async method => {
    const send = vi.fn(() => Promise.resolve({})), channel = untrackedObservationChannel({ send });
    await expect(channel.send(method)).rejects.toThrow('READ_REFUSED');
    await expect(channel.send('Runtime.enable')).rejects.toThrow('READ_REFUSED');
    expect(send).not.toHaveBeenCalled();
  });
  it('uses explicit depth-zero non-piercing descriptions and rejects a broader description', async () => {
    const send = vi.fn(() => Promise.resolve({})), channel = untrackedObservationChannel({ send });
    await channel.send('DOM.describeNode', { objectId: 'held-native-host' });
    expect(send).toHaveBeenCalledWith('DOM.describeNode', { objectId: 'held-native-host', depth: 0, pierce: false });
    await expect(channel.send('DOM.describeNode', { objectId: 'held-native-host', depth: -1, pierce: true })).rejects.toThrow('READ_REFUSED');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('refuses unknown channel provenance before installing or extracting a read source', async () => {
    const send = vi.fn(() => Promise.resolve({}));
    await expect(captureSourceOnEngine({ cdp: { send }, worldId: 1, objectId: 'unknown-engine' }, 'p', 4096)).rejects.toThrow('READ_REFUSED');
    expect(send).not.toHaveBeenCalled();
  });
  it.each(['root','nested','content-document','malformed','error','overflow','missing-host','final-drain'] as const)('quarantines the staged value when host metadata is %s', async failure => {
    let valueCalls = 0;
    const channel = untrackedObservationChannel({
      send(method, params) {
        const request = params as { functionDeclaration?: string } | undefined;
        if (method === 'Runtime.getProperties') return Promise.resolve({ result: [
          { name: '0', value: { objectId: 'exact-original-host' } },
          { name: 'length', value: { value: failure === 'overflow' ? 4097 : failure === 'missing-host' ? 2 : 1 } },
        ] });
        if (method === 'DOM.describeNode') {
          if (failure === 'error') return Promise.reject(Error('PRIVATE PROTOCOL ERROR'));
          return Promise.resolve({ node: { nodeType: failure === 'malformed' ? 'element' : 1,
            ...(failure === 'root' ? { shadowRoots: [{ shadowRootType: 'closed' }] } : {}),
            ...(failure === 'nested' ? { children: [{ nodeValue: 'PRIVATE NESTED CONTENT' }] } : {}),
            ...(failure === 'content-document' ? { contentDocument: { nodeType: 9 } } : {}),
          } });
        }
        if (request?.functionDeclaration === 'function() { return this.value(); }') { valueCalls++; return Promise.resolve({ result: { value: 'PRIVATE UNRELEASED CANARY' } }); }
        if (request?.functionDeclaration === 'function() { this.nodes(); }' && failure === 'final-drain') return Promise.reject(Error('PRIVATE EPOCH ERROR'));
        if (request?.functionDeclaration === 'function() { return this.nodes(); }') return Promise.resolve({ result: { objectId: 'original-host-array' } });
        return Promise.resolve({ result: {} });
      },
    });
    await expect(sourceValue({ cdp: channel, worldId: 1, objectId: 'engine' }, 'native-source', [])).rejects.toThrow('READ_REFUSED');
    expect(valueCalls).toBe(0);
  });
});
const READ_PROFILE = (domains: readonly string[]): ObservationReadProfile => ({
  policyRuleId: 'observed-structure-v1', allowStructuralDiscovery: true,
  readGrants: domains.map(domain => ({ policyRuleId: readGrantId(domain), domain, region: { kind: 'application' as const }, visibleText: { classification: 'permittedBusinessData' as const } })),
});

/** Wraps the scripted engine CDP with the page-state object the session installs next to it. */
class FlowCdpFake implements FlowCdp {
  readonly calls: { method: string; params: Record<string, unknown> }[] = [];
  /** Engine and page-state objects only (WI-2 also releases its own array handles). */
  get released(): string[] { return this.everyRelease.filter(id => /^(engine|pagestate)-/u.test(id)); }
  private readonly everyRelease: string[] = [];
  readonly disposed: string[] = [];
  private states = 0;
  private engines = 0;
  revision = 0;
  stableAnswers: boolean[] = [];
  passwordControls = 0;
  documentAnswers: unknown[] = [];
  constructor(private readonly inner: ScriptedCdp) {}
  send(method: string, params?: object): Promise<unknown> {
    const p = (params ?? {}) as Record<string, unknown>;
    this.calls.push({ method, params: p });
    if (method === 'Runtime.releaseObject') { this.everyRelease.push(String(p.objectId)); return Promise.resolve({}); }
    if (method === 'Runtime.evaluate' && String(p.expression).includes('new (module.exports.InjectedScript())')) return Promise.resolve({ result: { objectId: `engine-${String(++this.engines)}` } });
    if (method === 'Runtime.callFunctionOn') {
      const declaration = String(p.functionDeclaration);
      if (p.executionContextId !== undefined && declaration === installPageState.toString()) return Promise.resolve({ result: { objectId: `pagestate-${String(++this.states)}` } });
      if (String(p.objectId).startsWith('pagestate-')) {
        if (declaration.includes('this.dispose()')) { this.disposed.push(String(p.objectId)); return Promise.resolve({ result: {} }); }
        if (declaration.includes('this.revision()')) return Promise.resolve({ result: { value: this.revision } });
        if (declaration.includes('this.stamp(')) return Promise.resolve({ result: {} });
        if (declaration.includes('this.stable(')) return Promise.resolve({ result: { value: this.stableAnswers.shift() ?? true } });
        if (declaration.includes('this.passwordCount()')) return Promise.resolve({ result: { value: this.passwordControls } });
        if (declaration.includes('this.sameDocument()')) {
          const answer = this.documentAnswers.length ? this.documentAnswers.shift() : true;
          if (answer instanceof Error) return Promise.reject(answer);
          if (answer instanceof Promise) return answer;
          return Promise.resolve({ result: { value: answer } });
        }
        return Promise.resolve({ result: { value: true } });
      }
      if (declaration === 'function() { return true; }') return Promise.resolve({ result: { value: true } });
    }
    return this.inner.send(method, params);
  }
  detach(): Promise<void> { return Promise.resolve(); }
}

interface Rig {
  readonly session: ReturnType<typeof createObservationFlow>;
  readonly cdp: FlowCdpFake;
  readonly world: FakeWorld;
  readonly navigate: (newDocument?: boolean) => void;
}

function rig(o: { origin?: string; domains?: readonly string[]; script?: Partial<Script>; config?: Partial<ObservationConfig>; engines?: Parameters<typeof createObservationFlow>[2]; cdp?: FlowCdp; whitelistWait?: () => Promise<void> } = {}): Rig {
  const origin = o.origin ?? 'https://example.test';
  const domains = o.domains ?? ['example.test'];
  const script: Script = {
    collected: page([n('button', { name: 'Continue', ref: 'e1' })], { e1: elementFacts('button') }, { origin }),
    backendIds: { e1: 11 }, ...o.script,
  };
  const cdp = new FlowCdpFake(new ScriptedCdp(script));
  const world = new FakeWorld();
  world.url = `${origin}/page`;
  const listeners = new Set<() => void>();
  const host: FlowHost = {
    inspectBoundElement: world.inspectBoundElement, page: new FakePage(world), newCdp: () => Promise.resolve(o.cdp ?? cdp), onNavigation: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    awaitWhitelistedMainFrame: o.whitelistWait ?? (() => Promise.resolve()),
  };
  const config: ObservationConfig = { sessionId: 'session', scopeHash: SCOPE, allowedDomains: domains, knownSecrets: [], readProfile: READ_PROFILE(domains), ...o.config };
  return { session: createObservationFlow(host, config, o.engines, world.now), cdp, world, navigate: (newDocument = true) => { if (newDocument) cdp.documentAnswers.push(false); for (const listener of listeners) listener(); } };
}

const candidate = (extra: Partial<ElementCandidateFacts> = {}): ElementCandidateFacts => ({ tag: 'button', id: null, name: null, type: null, ariaLabel: null, title: null, placeholder: null, testId: 'continue', levels: [], generated: null, ...extra });

afterEach(() => { vi.useRealTimers(); });

describe('observe() and the origin whitelist', () => {
  it.each(['citi.com', 'www.citi.com', 'a.b.citi.com'])('observes a page on %s under the entry citi.com', async hostname => {
    const r = rig({ origin: `https://${hostname}`, domains: ['citi.com'] });
    const exported = await r.session.observe();
    expect(exported.observation.origin).toBe(`https://${hostname}`);
    await r.session.dispose();
  });

  it.each(['evilciti.com', 'citi.com.evil.com', 'citi.co', 'localhost', 'citi.com.', ''])('refuses a page on %j: SCOPE_DENIED, nothing observed', async hostname => {
    const r = rig({ origin: `https://${hostname}`, domains: ['citi.com'] });
    await expect(r.session.observe()).rejects.toMatchObject({ message: 'SCOPE_DENIED' });
  });

  it('refuses every page when the list is empty', async () => {
    const r = rig({ origin: 'https://citi.com', domains: [] });
    await expect(r.session.observe()).rejects.toMatchObject({ message: 'SCOPE_DENIED' });
  });

  it('allow-all: observes a page on any host, and a read grant for `*` applies to whatever page the collector is on', async () => {
    for (const hostname of ['citi.com', 'evilciti.com', 'localhost', 'a.b.example.org']) {
      const r = rig({ origin: `https://${hostname}`, domains: ALL_DOMAINS });
      const exported = await r.session.observe();
      expect(exported.observation.readRuleId, hostname).toBe(readGrantId('*'));
    }
  });
});

describe('what an observation is', () => {
  it('maps the perception to the wire observation and keeps outline refs and fact keys equal', async () => {
    const r = rig({ script: { collected: page([n('textbox', { name: 'Email', ref: 'e1' }), n('button', { name: 'Go', ref: 'e2' })], { e1: elementFacts('input', { editable: true,  editableRoot: true }), e2: elementFacts('button') }, { origin: 'https://example.test' }), backendIds: { e1: 11, e2: 12 } } });
    r.cdp.passwordControls = 1;
    const { observation, json, bytes } = await r.session.observe();
    expect(observation.schemaVersion).toBe(3);
    expect(observation.sessionId).toBe('session');
    expect(observation.coverage.passwordControls).toBe(1);
    expect(Object.keys(observation.facts).sort()).toEqual([...shownRefsOf(observation.outline)].sort());
    expect(observation.facts.e1?.role).toBe('textbox');
    expect(observation.facts.e1?.evidenceSegments.length).toBeGreaterThan(0);
    expect(observation.readRuleId).toBe(readGrantId('example.test'));
    expect(bytes).toBe(Buffer.byteLength(json));
    expect(observation.generation).toBe(1);
    expect((await r.session.observe()).observation.generation).toBe(2);
  });

  it('keeps one documentId per document and takes a new one after a navigation', async () => {
    const r = rig();
    const first = (await r.session.observe()).observation;
    const second = (await r.session.observe()).observation;
    expect(second.documentId).toBe(first.documentId);
    r.navigate();
    expect((await r.session.observe()).observation.documentId).not.toBe(first.documentId);
  });

  it('takes the observation again while the page keeps changing, and shares one generation counter', async () => {
    const r = rig();
    r.cdp.stableAnswers = [false, false, true];
    const { observation } = await r.session.observe(undefined, true);
    expect(observation.generation).toBe(3);
    expect(r.cdp.calls.filter(call => String(call.params.functionDeclaration).includes('this.stamp(')).length).toBe(3);
  });

  it('never returns an emptied observation', async () => {
    const perceive = vi.fn(() => Promise.reject(new Error('PERCEPTION_UNAVAILABLE')));
    const r = rig({ engines: { perceive } });
    await expect(r.session.observe()).rejects.toMatchObject({ message: 'OBSERVATION_DEADLINE' });
    // no second, partial answer exists: the same refusal again
    await expect(r.session.observe()).rejects.toMatchObject({ message: 'OBSERVATION_DEADLINE' });
  });

  it('refuses a page whose outline and facts disagree on the shown refs', async () => {
    const r = rig();
    const shown = await r.session.observe();
    expect(shownRefsOf(shown.observation.outline).size).toBe(Object.keys(shown.observation.facts).length);
    expect([...shownRefsOf('- button "Save [e1]" [e2]\n  - link "x" [e3] {url="[e9]"}')].sort()).toEqual(['e2', 'e3']);
  });

  it('rejects a byte cap the observation does not fit in (BUDGET_EXCEEDED) and a malformed one', async () => {
    const r = rig();
    await expect(r.session.observe(10)).rejects.toMatchObject({ message: 'BUDGET_EXCEEDED' });
    const s = rig();
    await expect(s.session.observe(0)).rejects.toMatchObject({ message: 'BUDGET_EXCEEDED' });
  });
});

describe('the collection deadline', () => {
  it('a fake CDP that never answers ends OBSERVATION_DEADLINE at the deadline', async () => {
    vi.useFakeTimers();
    const hang = new Promise<never>(() => undefined);
    const engine = { cdp: undefined as never, worldId: 9, objectId: 'engine-hung' };
    const releasedIds: string[] = [];
    const cdp: FlowCdp = {
      send(method, params) {
        const p = (params ?? {}) as Record<string, unknown>;
        if (method === 'Runtime.releaseObject') releasedIds.push(String(p.objectId));
        if (method === 'Runtime.callFunctionOn' && p.executionContextId !== undefined) return hang;
        return Promise.resolve({});
      },
    };
    const r = rig({ cdp, config: { limits: { milliseconds: 500 } }, engines: { openEngine: () => Promise.resolve(engine) } });
    const outcome = r.session.observe().then(() => 'resolved', (error: unknown) => (error as Error).message);
    await vi.advanceTimersByTimeAsync(499);
    let settled = false;
    void outcome.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(10);
    await expect(outcome).resolves.toBe('OBSERVATION_DEADLINE');
    expect(releasedIds).toContain('engine-hung');
    // the inventory is failed and the engine is released, so nothing late can be merged or answered; the refusal repeats
    await expect(r.session.observe()).rejects.toMatchObject({ message: 'OBSERVATION_DEADLINE' });
  });

  it('a dead CDP ends OBSERVATION_UNAVAILABLE, not the deadline', async () => {
    const dead: FlowCdp = { send: () => Promise.reject(new Error('Session closed. Most likely the page has been closed.')) };
    const r = rig({ cdp: dead });
    await expect(r.session.observe()).rejects.toMatchObject({ message: 'OBSERVATION_UNAVAILABLE' });
    const exhausted = rig({ cdp: dead, engines: { openEngine: () => Promise.resolve({ cdp: dead, worldId: 1, objectId: 'e' }), perceive: () => Promise.reject(new Error('PERCEPTION_UNAVAILABLE')) } });
    // the pagestate install fails first on a dead channel; with a live probe and a dead page program it would be the deadline
    await expect(exhausted.session.observe()).rejects.toMatchObject({ message: 'OBSERVATION_UNAVAILABLE' });
  });

  it('derives the sanitizer work budget from the time that remains', async () => {
    const seen: number[] = [];
    const r = rig({ engines: { perceive: (options) => { seen.push(options.workBudgetUnits ?? -1); return Promise.reject(new Error('PERCEPTION_UNAVAILABLE')); } } });
    await expect(r.session.observe()).rejects.toBeInstanceOf(ClosedActionError);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThanOrEqual(12_000 * 1_000_000);
  });

  it('releases the previous engine when the next observation replaces it', async () => {
    const r = rig();
    await r.session.observe();
    expect(r.cdp.released).toEqual([]);
    await r.session.observe();
    expect(r.cdp.released).toEqual(['pagestate-1', 'engine-1']);
    expect(r.cdp.disposed).toEqual(['pagestate-1']);
    await r.session.dispose();
    expect(r.cdp.released).toEqual(['pagestate-1', 'engine-1', 'pagestate-2', 'engine-2']);
  });
});

describe('prepareTarget', () => {
  const selectScript = (listing: OptionListing | null): Partial<Script> => ({
    collected: page([n('combobox', { name: 'Color', ref: 'e1' })], { e1: elementFacts('select', { editable: true }) }, { origin: 'https://example.test' }),
    backendIds: { e1: 11 },
    candidateFacts: () => candidate({ tag: 'select', testId: 'color' }),
    options: () => listing,
  });
  const select = (literal: string | null) => ({ ref: 'e1', operation: { kind: 'selectOption' as const, valueInputId: 'v' }, authoredLiteral: literal });

  async function observed(script: Partial<Script>, engines?: Parameters<typeof createObservationFlow>[2]) {
    const r = rig({ script, ...(engines !== undefined ? { engines } : {}) });
    const { observation } = await r.session.observe();
    return { r, identity: { documentId: observation.documentId, generation: observation.generation, origin: observation.origin } };
  }

  it('prepareTarget refuses an absent select literal with OPTION_NOT_PRESENT before any fence', async () => {
    const { r, identity } = await observed(selectScript({ kind: 'native', labels: ['Red', 'Blue'], values: ['red', 'blue'], tooMany: false }));
    await expect(r.session.prepareTarget({ ...identity, ...select('Green') } as never)).rejects.toMatchObject({ message: 'OPTION_NOT_PRESENT' });
    expect(r.world.fenced).toBe(false);
    expect(r.world.after()).toEqual([]);
  });

  it('a literal equal to the selected option passes G1', async () => {
    const { r, identity } = await observed(selectScript({ kind: 'native', labels: ['Red', 'Blue'], values: ['red', 'blue'], tooMany: false }));
    const resolved = await r.session.prepareTarget({ ...identity, ...select('Red') } as never);
    expect(resolved.locator).toEqual([{ by: 'testId', value: 'color' }]);
    expect(resolved.identity).toEqual({ role: 'combobox', name: 'Color' });
  });

  it('does not treat an unreadable option list as a refusal', async () => {
    const { r, identity } = await observed(selectScript(null));
    await expect(r.session.prepareTarget({ ...identity, ...select('Anything') } as never)).resolves.toMatchObject({ tier: 'testId' });
  });

  it('refuses a stale ref, an unknown ref and a changed generation as TARGET_CHANGED', async () => {
    const { r, identity } = await observed(selectScript(null));
    await expect(r.session.prepareTarget({ ...identity, ref: 'e99', operation: { kind: 'click' }, authoredLiteral: null } as never)).rejects.toMatchObject({ message: 'TARGET_CHANGED' });
    await expect(r.session.prepareTarget({ ...identity, generation: identity.generation + 1, ref: 'e1', operation: { kind: 'click' }, authoredLiteral: null } as never)).rejects.toMatchObject({ message: 'TARGET_CHANGED' });
    r.navigate();
    await expect(r.session.prepareTarget({ ...identity, ref: 'e1', operation: { kind: 'click' }, authoredLiteral: null } as never)).rejects.toMatchObject({ message: 'TARGET_CHANGED' });
  });

  it('refuses a ref the synthesis cannot give a verified locator for as NO_DURABLE_LOCATOR', async () => {
    const { r, identity } = await observed({ ...selectScript(null), check: (_ref, selectors) => selectors.map(() => ({ count: 2, index: 0 })) });
    await expect(r.session.prepareTarget({ ...identity, ref: 'e1', operation: { kind: 'click' }, authoredLiteral: null } as never)).rejects.toMatchObject({ message: 'NO_DURABLE_LOCATOR' });
  });

  it('refuses a read the profile does not allow as READ_NOT_ALLOWED', async () => {
    const { r, identity } = await observed(selectScript(null));
    const operation = { kind: 'read' as const, bindingId: 'b', recipe: { kind: 'visibleText' as const, classification: 'permittedBusinessData' as const, policyRuleId: 'some-other-rule' } };
    await expect(r.session.prepareTarget({ ...identity, ref: 'e1', operation, authoredLiteral: null } as never)).rejects.toMatchObject({ message: 'READ_NOT_ALLOWED' });
  });

  it('a prepareTarget that never finishes ends NO_DURABLE_LOCATOR', async () => {
    const hung = vi.fn(() => new Promise<never>(() => undefined));
    const { r, identity } = await observed(selectScript(null), { synthesize: hung });
    vi.useFakeTimers();
    const outcome = r.session.prepareTarget({ ...identity, ref: 'e1', operation: { kind: 'click' }, authoredLiteral: null } as never).then(() => 'resolved', (error: unknown) => (error as Error).message);
    await vi.advanceTimersByTimeAsync(8_001);
    await expect(outcome).resolves.toBe('NO_DURABLE_LOCATOR');
    expect(hung).toHaveBeenCalledOnce();
  });
});

describe('invoke at learn', () => {
  it('acts only on a target prepared in the same observation and on the node bound at prepare', async () => {
    const ids = vi.fn(() => Promise.resolve([11]));
    const r = rig({ script: { candidateFacts: () => candidate() }, engines: { backendIdsForSelector: ids } });
    const { observation } = await r.session.observe();
    const resolved = await r.session.prepareTarget({ ref: 'e1', documentId: observation.documentId, generation: observation.generation, origin: observation.origin, operation: { kind: 'click' }, authoredLiteral: null } as never);
    const request = { resolved, operation: { kind: 'click' as const }, resolvedValue: null, origin: observation.origin, maxValueBytes: 1024, readRuleId: null, profile: 'learn' as const, expect: { documentId: observation.documentId, generation: observation.generation } };
    // the node was replaced after prepare: refused before any fence
    ids.mockResolvedValueOnce([99]);
    await expect(r.session.invoke(request, r.world.control())).rejects.toMatchObject({ message: 'TARGET_CHANGED' });
    expect(r.world.fenced).toBe(false);
    // a target that was never prepared is refused
    await expect(r.session.invoke({ ...request, resolved: { ...resolved, locator: [{ by: 'testId', value: 'other' }] } }, r.world.control())).rejects.toMatchObject({ message: 'TARGET_CHANGED' });
    // the bound node and the prepared target: one fenced click
    await r.session.invoke(request, r.world.control());
    expect(r.world.fenced).toBe(true);
    expect(r.world.after().some(call => call.method === 'click')).toBe(true);
  });

  it('refuses after a newer observation replaced the one the target was prepared in', async () => {
    const r = rig({ script: { candidateFacts: () => candidate() }, engines: { backendIdsForSelector: () => Promise.resolve([11]) } });
    const first = (await r.session.observe()).observation;
    const resolved = await r.session.prepareTarget({ ref: 'e1', documentId: first.documentId, generation: first.generation, origin: first.origin, operation: { kind: 'click' }, authoredLiteral: null } as never);
    await r.session.observe();
    await expect(r.session.invoke({ resolved, operation: { kind: 'click' }, resolvedValue: null, origin: first.origin, maxValueBytes: 1024, readRuleId: null, profile: 'learn', expect: { documentId: first.documentId, generation: first.generation } }, r.world.control())).rejects.toMatchObject({ message: 'TARGET_CHANGED' });
  });
});

describe('resolveTarget and refForTarget (replay and prefix)', () => {
  const target = { locator: [{ by: 'testId' as const, value: 'continue' }], tier: 'testId' as const, identity: { role: 'button', name: 'Continue' } };

  it('matches a frozen target restored from JSONB with reordered object properties', async () => {
    const r = rig({ engines: { backendIdsForSelector: vi.fn(() => Promise.resolve([11])) } });
    await r.session.observe();
    const restored = { identity: { name: 'Continue', role: 'button' }, tier: 'testId', locator: [{ value: 'continue', by: 'testId' }] };
    expect(await r.session.refForTarget(restored as never)).toBe('e1');
  });

  it('reports READY, ABSENT and a duplicate match without observing', async () => {
    const r = rig();
    expect(await r.session.resolveTarget({ resolved: target, origin: 'https://example.test', operation: { kind: 'click' }, readRuleId: null } as never)).toEqual({ kind: 'READY' });
    r.world.b.count = 0;
    expect(await r.session.resolveTarget({ resolved: target, origin: 'https://example.test', operation: { kind: 'click' }, readRuleId: null } as never)).toEqual({ kind: 'ABSENT' });
    r.world.b.count = 2;
    expect(await r.session.resolveTarget({ resolved: target, origin: 'https://example.test', operation: { kind: 'click' }, readRuleId: null } as never)).toEqual({ kind: 'REFUSED', code: 'TARGET_DRIFT' });
  });

  it('refuses a read whose learned grant is not the one the live profile gives the page', async () => {
    const r = rig();
    const operation = { kind: 'read' as const, bindingId: 'b', recipe: { kind: 'visibleText' as const, classification: 'permittedBusinessData' as const, policyRuleId: 'x' } };
    expect(await r.session.resolveTarget({ resolved: target, origin: 'https://example.test', operation, readRuleId: 'x' } as never)).toEqual({ kind: 'REFUSED', code: 'READ_REFUSED' });
    expect(await r.session.resolveTarget({ resolved: target, origin: 'https://example.test', operation, readRuleId: readGrantId('example.test') } as never)).toEqual({ kind: 'READY' });
  });

  it('names the ref of the held observation that holds the frozen target, null when none does, and refuses several matches', async () => {
    const ids = vi.fn(() => Promise.resolve([11]));
    const r = rig({ engines: { backendIdsForSelector: ids } });
    expect(await r.session.refForTarget(target as never)).toBeNull(); // nothing held yet
    await r.session.observe();
    expect(await r.session.refForTarget(target as never)).toBe('e1');
    ids.mockResolvedValueOnce([]);
    expect(await r.session.refForTarget(target as never)).toBeNull();
    ids.mockResolvedValueOnce([77]);
    expect(await r.session.refForTarget(target as never)).toBeNull(); // present but not shown in the held outline: WAIT
    ids.mockResolvedValueOnce([11, 12]);
    await expect(r.session.refForTarget(target as never)).rejects.toMatchObject({ message: 'TARGET_CHANGED' });
  });
});

describe('document identity is distinct from navigation and observation generation', () => {
  it('a same-document navigation preserves identity and advances generation while refusing old preparations', async () => {
    const r = rig();
    const first = (await r.session.observe()).observation;
    r.navigate(false);
    const next = (await r.session.observe()).observation;
    expect(next.documentId).toBe(first.documentId);
    expect(next.generation).toBeGreaterThan(first.generation);
    await expect(r.session.prepareTarget({ documentId: first.documentId, generation: first.generation, origin: first.origin, ref: 'e1', operation: { kind: 'click' }, authoredLiteral: null } as never)).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
  });

  it.each([false, new Error('Protocol error: Could not find object with given id')])('a replaced root or lost old private context starts a new identity', async (answer) => {
    const r = rig();
    const first = (await r.session.observe()).observation;
    r.cdp.documentAnswers.push(answer);
    const next = (await r.session.observe()).observation;
    expect(next.documentId).not.toBe(first.documentId);
    expect(next.generation).toBeGreaterThan(first.generation);
  });

  it('a root replaced after the old identity probe is never exported or held as the old document', async () => {
    const r = rig();
    await r.session.observe();
    r.cdp.documentAnswers.push(true, false);
    await expect(r.session.observe()).rejects.toMatchObject({ code: 'STALE_OBSERVATION' });
    await expect(r.session.observe()).rejects.toMatchObject({ code: 'CONTEXT_LOST' });
  });

  it.each([null, 'true', new Error('unrecognized protocol failure')])('an unproven old identity refuses the observation', async (answer) => {
    const r = rig();
    await r.session.observe();
    r.cdp.documentAnswers.push(answer);
    await expect(r.session.observe()).rejects.toMatchObject({ code: 'OBSERVATION_UNAVAILABLE' });
  });

  it('a hung identity probe expires under the observation deadline and its late reply cannot publish', async () => {
    vi.useFakeTimers();
    const r = rig({ config: { limits: { milliseconds: 500 } } });
    await r.session.observe();
    let reply: (value: unknown) => void = () => undefined;
    r.cdp.documentAnswers.push(new Promise<unknown>((resolve) => { reply = resolve; }));
    const outcome = r.session.observe().then(() => 'published', (error: unknown) => (error as ClosedActionError).code);
    await vi.advanceTimersByTimeAsync(501);
    expect(await outcome).toBe('OBSERVATION_DEADLINE');
    reply({ result: { value: true } });
    await vi.advanceTimersByTimeAsync(0);
    await expect(r.session.observe()).rejects.toMatchObject({ code: 'OBSERVATION_DEADLINE' });
  });
});

describe('observation contract details found in the first real runs', () => {
  it('waits for a page that is off the list before, not inside, the collection deadline, and keeps ORIGIN_NOT_ALLOWED as itself', async () => {
    vi.useFakeTimers();
    const slow = rig({ config: { limits: { milliseconds: 500 } }, whitelistWait: () => new Promise<void>(resolve => { setTimeout(resolve, 2_000); }) });
    const observing = slow.session.observe();
    await vi.advanceTimersByTimeAsync(2_100);
    await expect(observing).resolves.toMatchObject({ observation: { sessionId: 'session' } });
    vi.useRealTimers();
    const off = rig({ whitelistWait: () => Promise.reject(new OriginNotAllowed('login.elsewhere.test')) });
    await expect(off.session.observe()).rejects.toBeInstanceOf(OriginNotAllowed);
  });

  it('gives an empty page the document root line, because the contract wants an outline of at least one line', async () => {
    const r = rig({ script: { collected: page([], {}, { origin: 'https://example.test' }) } });
    const { observation, bytes } = await r.session.observe();
    expect(observation.outline).toBe('- document');
    expect(observation.projection.outlineBytes).toBe(10);
    expect(observation.facts).toEqual({});
    expect(bytes).toBeGreaterThan(0);
  });

  it('measures a replay invoke on the control clock, not by subtracting Date.now from a run-clock deadline', async () => {
    const r = rig({ script: { candidateFacts: () => candidate() } });
    const target = { locator: [{ by: 'testId' as const, value: 'continue' }], tier: 'testId' as const, identity: { role: 'button', name: 'Continue' } };
    const control = { ...r.world.control(), deadlineMs: 5, remainingMs: () => 12_000 }; // run clock: five milliseconds after recording started
    await r.session.invoke({ resolved: target, operation: { kind: 'click' }, resolvedValue: null, origin: 'https://example.test', maxValueBytes: 1024, readRuleId: null, profile: 'replay' }, control);
    expect(r.world.after().some(call => call.method === 'click')).toBe(true);
    expect(Math.max(...r.world.timeouts())).toBeGreaterThan(1);
    // A spent control cannot fence a new bound action; any preflight timeout keeps the 1 ms floor.
    const spent = { ...r.world.control(), remainingMs: () => 0 };
    const again = rig({ script: { candidateFacts: () => candidate() } });
    await expect(again.session.invoke({ resolved: target, operation: { kind: 'click' }, resolvedValue: null, origin: 'https://example.test', maxValueBytes: 1024, readRuleId: null, profile: 'replay' }, spent)).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    expect(again.world.fenced).toBe(false); expect(again.world.effectedIds).toEqual([]);
    expect(Math.max(...again.world.timeouts())).toBe(1);
  });
});

describe('trusted observation policy and canonical export', () => {
  const base: ObservationConfig = { sessionId: 'session', scopeHash: SCOPE, allowedDomains: ['example.test'], knownSecrets: [] };
  it('accepts only lowering bounded limits and rejects malformed strings and origins', () => {
    expect(observationOptions(base).limits).toEqual({ outlineBytes: 40_000, bytes: 524_288, milliseconds: 12_000 });
    for (const limits of [{ outlineBytes: 40_001 }, { bytes: 524_289 }, { milliseconds: 12_001 }, { outlineBytes: 0 }, { bytes: -1 }, { milliseconds: NaN }]) expect(() => observationOptions({ ...base, limits })).toThrow('INVALID_CONTRACT');
    expect(observationOptions({ ...base, limits: { outlineBytes: 1_000, bytes: 2_000, milliseconds: 500 } }).limits).toEqual({ outlineBytes: 1_000, bytes: 2_000, milliseconds: 500 });
    expect(() => observationOptions({ ...base, sessionId: '\ud800' })).toThrow('INVALID_UNICODE');
    expect(() => observationOptions({ ...base, scopeHash: 'x' })).toThrow('INVALID_CONTRACT');
    expect(() => observationOptions({ ...base, allowedDomains: ['Example.com'] })).toThrow('INVALID_CONTRACT');
    expect(() => observationOptions({ ...base, knownSecrets: Array.from({ length: 65 }, (_, index) => `s${String(index)}`) })).toThrow('INVALID_CONTRACT');
  });

  it('rejects malformed or excessively broad trusted read grants before a session exists', () => {
    const grant = (over: Record<string, unknown> = {}) => ({ policyRuleId: 'g', domain: 'example.test', region: { kind: 'application' }, visibleText: { classification: 'permittedBusinessData' }, ...over });
    const profile = (grants: unknown[]) => ({ policyRuleId: 'p', allowStructuralDiscovery: true, readGrants: grants }) as unknown as ObservationReadProfile;
    expect(() => observationOptions({ ...base, readProfile: profile([grant()]) })).not.toThrow();
    for (const bad of [grant({ domain: 'other.test' }), grant({ region: { kind: 'role', role: 'main', name: 'x', exact: true } }), grant({ controlValue: { classification: 'nonsecretApproved', types: ['text'] } }), grant({ visibleText: undefined }), grant({ extra: 1 })]) {
      expect(() => observationOptions({ ...base, readProfile: profile([bad]) })).toThrow('INVALID_CONTRACT');
    }
    expect(() => observationOptions({ ...base, readProfile: profile([grant(), grant()]) })).toThrow('INVALID_CONTRACT');
    expect(() => observationOptions({ ...base, readProfile: profile(Array.from({ length: 33 }, (_, index) => grant({ policyRuleId: `g${String(index)}` }))) })).toThrow('INVALID_CONTRACT');
  });

  it('exports immutable canonical bytes and hashes compatible with the frozen corpus', () => {
    const fixtures = JSON.parse(readFileSync(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json', import.meta.url), 'utf8')) as { documents: { observedPage: Parameters<typeof exportObservation>[0] }; canonicalVector: { json: string; sha256: string } };
    expect(canonicalObservation({ b: 2, a: 'é' })).toBe(fixtures.canonicalVector.json);
    expect(createHash('sha256').update(canonicalObservation({ b: 2, a: 'é' })).digest('hex')).toBe(fixtures.canonicalVector.sha256);
    const observation = fixtures.documents.observedPage;
    const result = exportObservation(observation, 524_288);
    expect(result.bytes).toBe(Buffer.byteLength(result.json));
    expect(result.observationHash).toBe(createHash('sha256').update(result.json).digest('hex'));
    expect(Object.isFrozen(result.observation.facts)).toBe(true);
    expect(() => exportObservation(observation, result.bytes - 1)).toThrow('BUDGET_EXCEEDED');
    expect(canonicalObservation({ z: 'é😀', a: 1 })).toBe('{"a":1,"z":"é😀"}');
    expect(() => canonicalObservation({ a: '\udc00' })).toThrow('INVALID_UNICODE');
    expect(() => canonicalObservation(1.5)).toThrow('INVALID_CONTRACT');
  });

  it('a failed observation consumes no generation', async () => {
    let calls = 0;
    const r = rig({ engines: { perceive: (options) => (++calls === 2 ? Promise.reject(new Error('PERCEPTION_UNAVAILABLE')) : perceive(options)) } });
    const first = (await r.session.observe()).observation;
    expect(first.generation).toBe(1);
    await expect(r.session.observe()).rejects.toMatchObject({ message: 'OBSERVATION_DEADLINE' });
    // The password path checks the target generation against the session's counter: it still accepts the last successful one (a counter that had
    // advanced on the failed attempt would refuse it before sending anything to the page).
    await r.session.preparePassword?.({ kind: 'passwordControl', documentId: first.documentId, generation: first.generation }, first.origin).catch(() => undefined);
    expect(r.cdp.calls.some(call => String(call.params.functionDeclaration).includes('preparePasswordResult'))).toBe(true);
  });

  it('a session disposed while an observation is pending ends it as CONTEXT_LOST', async () => {
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const observing = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<never>((_, reject) => { release = () => { reject(new Error('Target closed')); }; });
    const r = rig({ engines: { perceive: () => { entered(); return held; } } });
    const pending = r.session.observe();
    await observing;
    const disposing = r.session.dispose();
    release();
    await expect(pending).rejects.toMatchObject({ message: 'CONTEXT_LOST' });
    await disposing;
  });

  it('after a failed observation the page is not touched again: a later observe answers from the failed inventory without any CDP call', async () => {
    const r = rig({ engines: { perceive: () => Promise.reject(new Error('boom')) } });
    await expect(r.session.observe()).rejects.toMatchObject({ message: 'OBSERVATION_UNAVAILABLE' });
    await Promise.resolve();
    const before = r.cdp.calls.length;
    await expect(r.session.observe()).rejects.toMatchObject({ message: 'CONTEXT_LOST' });
    expect(r.cdp.calls.length).toBe(before);
  });
});

it('captured binding freezes held document generation origin and navigation across every await', async () => {
  for (const method of ['elementHandle', 'inspectBoundElement']) for (const at of [1, 2]) for (const mutation of ['navigation', 'origin', 'dispose', 'held']) {
    const r = rig({ script: { candidateFacts: () => candidate() }, engines: { backendIdsForSelector: () => Promise.resolve([11]) } });
    const observation = (await r.session.observe()).observation;
    const resolved = await r.session.prepareTarget({ ref: 'e1', documentId: observation.documentId, generation: observation.generation, origin: observation.origin, operation: { kind: 'click' }, authoredLiteral: null });
    let calls = 0; let mutationDone: Promise<unknown> | undefined;
    r.world.hooks[method] = () => {
      if (++calls !== at) return;
      if (mutation === 'navigation') r.navigate();
      else if (mutation === 'origin') r.world.url = 'https://different.test/page';
      else if (mutation === 'dispose') mutationDone = r.session.dispose();
      else mutationDone = r.session.observe();
    };
    await expect(r.session.invoke({ resolved, operation: { kind: 'click' }, resolvedValue: null, origin: observation.origin, maxValueBytes: 1024, readRuleId: null, profile: 'learn', expect: { documentId: observation.documentId, generation: observation.generation } }, r.world.control())).rejects.toBeDefined();
    expect(r.world.fenced).toBe(false); expect(r.world.effectedIds).toEqual([]);
    await mutationDone?.catch(() => undefined); await r.session.dispose();
  }
});

it('combined committed physical predecessor survives only authenticated same-context sync', async () => {
  const ids = vi.fn(() => Promise.resolve([11]));
  const r = rig({ script: { candidateFacts: () => candidate() }, engines: { backendIdsForSelector: ids } });
  const first = (await r.session.observe()).observation;
  const identity = { admissionId: 'successful-predecessor', requestDigest: 'a'.repeat(64), operationHash: 'b'.repeat(64), coordinate: { stepId: 'fill', ordinal: 0 }, authority: 'same-authenticated-context' };
  const inherited = { kind: 'same-element-press' as const, predecessorAdmissionId: identity.admissionId, predecessorRequestDigest: identity.requestDigest, predecessorOperationHash: identity.operationHash, predecessorCoordinate: identity.coordinate, documentId: first.documentId };
  const prepare = (o: typeof first, press = false) => r.session.prepareTarget({ ref: 'e1', documentId: o.documentId, generation: o.generation, origin: o.origin, operation: press ? { kind: 'press', key: 'Enter' } : { kind: 'click' }, authoredLiteral: null, ...(press ? { pressInheritance: inherited, continuityAuthority: identity.authority } : {}) });
  const resolved = await prepare(first);
  await r.session.invoke({ resolved, operation: { kind: 'click' }, resolvedValue: null, origin: first.origin, maxValueBytes: 1024, readRuleId: null, profile: 'learn', expect: first, invocationIdentity: identity }, r.world.control());
  // No callback, no committed predecessor authority, even though the native click succeeded.
  await expect(prepare(first, true)).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
  r.session.commitInvocation?.(identity);
  const second = (await r.session.observe()).observation;
  const press = await prepare(second, true);
  expect(press.identity).toEqual(resolved.identity);
  // A same-label replacement after preparation cannot inherit or reach Enter.
  ids.mockResolvedValueOnce([99]); r.world.fenced = false; r.world.log.length = 0;
  await expect(r.session.invoke({ resolved: press, operation: { kind: 'press', key: 'Enter' }, resolvedValue: null, origin: second.origin, maxValueBytes: 1024, readRuleId: null, profile: 'learn', expect: second, invocationIdentity: { ...identity, admissionId: 'press', coordinate: { stepId: 'press', ordinal: 0 } }, pressInheritance: inherited }, r.world.control())).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
  expect(r.world.fenced).toBe(false); expect(r.world.log.some(call => call.method === 'press')).toBe(false);
  await expect(prepare(second, true)).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
  await r.session.dispose();
});

it('combined read scope retains exact original observation preparation lineage', async () => {
  const checkPublicSources = vi.fn(() => Promise.resolve(true));
  const collected = page([n('heading', { name: 'Release', ref: 'e2' }), n('button', { name: 'Continue', ref: 'e1' })], { e2: elementFacts('h2'), e1: elementFacts('button', { scopeRefs: ['e2'] }) });
  const r = rig({ script: { collected, backendIds: { e1: 11, e2: 12 }, candidateFacts: () => candidate() }, engines: { checkPublicSources, backendIdsForSelector: () => Promise.resolve([11]) } });
  const original = (await r.session.observe()).observation;
  expect(original.facts.e1?.scopeRefs).toEqual(['e2']);
  const resolved = await r.session.prepareTarget({ ref: 'e1', documentId: original.documentId, generation: original.generation, origin: original.origin, operation: { kind: 'click' }, authoredLiteral: null });
  expect(checkPublicSources).toHaveBeenCalledWith(expect.anything(), { ref: 'e1', sources: [{ ref: 'e2', name: 'Release', role: 'heading', mode: 'scope' }] }, []);
  checkPublicSources.mockResolvedValue(false); r.world.log.length = 0;
  await expect(r.session.invoke({ resolved, operation: { kind: 'click' }, resolvedValue: null, origin: original.origin, maxValueBytes: 1024, readRuleId: null, profile: 'learn', expect: original }, r.world.control())).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
  expect(r.world.fenced).toBe(false); expect(r.world.log.some(c => c.method === 'click')).toBe(false);
  await r.session.dispose();
});
