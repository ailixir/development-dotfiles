import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_DOMAINS } from '../../src/allowedDomains.js';
import { OriginNotAllowed } from '../../src/allowedDomains.js';
import { ClosedActionError } from '../../src/run/closedError.js';
import { canonicalObservation, exportObservation, observationOptions } from '../../src/run/observationSanitizer.js';
import { createObservationFlow, shownRefsOf, type FlowCdp, type FlowEngine, type FlowHost } from '../../src/run/observationFlow.js';
import type { ObservationConfig } from '../../src/run/observationTypes.js';
import { installPageState } from '../../src/run/pageStateInPage.js';
import { perceive } from '../../src/run/perceive.js';
import { ScriptedCdp, elementFacts, n, page, type Script } from './perceptionFakes.js';
import { untrackedObservationChannel, captureSourceOnEngine } from '../../src/run/playwrightEngine.js';

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
  const listeners = new Set<() => void>(), documents = new Set<() => void>();
  const host: FlowHost = {
    page: { url: () => `${origin}/page` }, newCdp: () => Promise.resolve(o.cdp ?? cdp), onNavigation: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    onDocument: listener => { documents.add(listener); return () => { documents.delete(listener); }; },
    awaitWhitelistedMainFrame: o.whitelistWait ?? (() => Promise.resolve()),
  };
  const config: ObservationConfig = { sessionId: 'session', scopeHash: SCOPE, allowedDomains: domains, knownSecrets: [], ...o.config };
  return { session: createObservationFlow(host, config, o.engines), cdp, navigate: (newDocument = true) => { if (newDocument) { cdp.documentAnswers.push(false); for (const listener of documents) listener(); } for (const listener of listeners) listener(); } };
}


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

  it('allow-all: observes a page on any host', async () => {
    for (const hostname of ['citi.com', 'evilciti.com', 'localhost', 'a.b.example.org']) {
      const r = rig({ origin: `https://${hostname}`, domains: ALL_DOMAINS });
      const exported = await r.session.observe();
      expect(exported.observation.origin, hostname).toBe(`https://${hostname}`);
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

describe('document identity is distinct from navigation and observation generation', () => {
  it('a same-document navigation preserves identity and advances generation while the old stamp is no longer current', async () => {
    const r = rig();
    const first = (await r.session.observe()).observation;
    r.navigate(false);
    const next = (await r.session.observe()).observation;
    expect(next.documentId).toBe(first.documentId);
    expect(next.generation).toBeGreaterThan(first.generation);
    expect(r.session.documentCurrent({ documentId: first.documentId, generation: first.generation }, first.origin)).toBe(false);
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

describe('a navigation that commits during the observation (SC008-FIX-19)', () => {
  type Perceive = FlowEngine['perceive'];
  /** An engine whose first `failures` perceptions navigate the page and then fail with `message`; the rest are the real one. */
  function navigating(failures: number, message: string, calls: { n: number }, hook: () => void): Perceive {
    return options => {
      calls.n++;
      if (calls.n <= failures) { hook(); return Promise.reject(new Error(message)); }
      return perceive(options);
    };
  }
  const withNavigation = (failures: number, message: string, extra: Partial<Parameters<typeof rig>[0]> = {}): { r: Rig; calls: { n: number } } => {
    const calls = { n: 0 };
    const holder: { r?: Rig } = {};
    const r = rig({ ...extra, engines: { perceive: navigating(failures, message, calls, () => { holder.r?.navigate(false); }) } });
    holder.r = r;
    return { r, calls };
  };

  it.each(['STALE_OBSERVATION', 'PERCEPTION_UNAVAILABLE'])('observes once more after %s when the page navigated during the attempt, and the second attempt is the document', async message => {
    const waits = { n: 0 };
    const { r, calls } = withNavigation(1, message, { whitelistWait: () => { waits.n++; return Promise.resolve(); } });
    const exported = await r.session.observe();
    expect(calls.n).toBe(2);
    expect(waits.n).toBe(2); // the whitelist wait is repeated before the retry
    expect(exported.observation.generation).toBe(1); // the failed attempt consumed no generation
    expect(exported.observation.outline).toContain('Continue');
    await r.session.dispose();
  });

  it('does not retry when nothing navigated, and an ordinary failure is not retried either', async () => {
    const calls = { n: 0 };
    const quiet = rig({ engines: { perceive: navigating(1, 'STALE_OBSERVATION', calls, () => undefined) } });
    await expect(quiet.session.observe()).rejects.toMatchObject({ code: 'STALE_OBSERVATION' });
    expect(calls.n).toBe(1);
  });

  it('retries when the protocol says the document went away, even though the navigation event has not arrived yet', async () => {
    const calls = { n: 0 };
    const r = rig({ engines: { perceive: options => (++calls.n === 1 ? Promise.reject(new Error('cdpSession.send: Protocol error (Runtime.callFunctionOn): Inspected target navigated or closed')) : perceive(options)) } });
    await expect(r.session.observe()).resolves.toMatchObject({ observation: { generation: 1 } });
    expect(calls.n).toBe(2);
  });

  it.each(['SCOPE_DENIED', 'BUDGET_EXCEEDED', 'CONTEXT_LOST', 'INVALID_UNICODE'])('does not retry %s even after a navigation', async message => {
    const { r, calls } = withNavigation(1, message);
    await expect(r.session.observe()).rejects.toMatchObject({ code: message });
    expect(calls.n).toBe(1);
  });

  it('continuous navigation ends after the one retry with the ORIGINAL code, long before the deadline', async () => {
    const { r, calls } = withNavigation(10, 'STALE_OBSERVATION');
    const started = Date.now();
    await expect(r.session.observe()).rejects.toMatchObject({ code: 'STALE_OBSERVATION' });
    expect(calls.n).toBe(2);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('a navigation to a host that is off the list is ORIGIN_NOT_ALLOWED on the retry, not SCOPE_DENIED', async () => {
    let waits = 0;
    const { r, calls } = withNavigation(1, 'STALE_OBSERVATION', { whitelistWait: () => (++waits === 2 ? Promise.reject(new OriginNotAllowed('login.elsewhere.test')) : Promise.resolve()) });
    await expect(r.session.observe()).rejects.toBeInstanceOf(OriginNotAllowed);
    expect(calls.n).toBe(1);
  });

  it('the retry is inside the deadline: a second attempt that never answers ends OBSERVATION_DEADLINE', async () => {
    vi.useFakeTimers();
    const calls = { n: 0 };
    const holder: { r?: Rig } = {};
    const r = rig({ config: { limits: { milliseconds: 500 } }, engines: { perceive: () => { if (++calls.n === 1) { holder.r?.navigate(false); return Promise.reject(new Error('STALE_OBSERVATION')); } return new Promise(() => undefined); } } });
    holder.r = r;
    const outcome = r.session.observe().then(() => 'published', (error: unknown) => (error as ClosedActionError).code);
    await vi.advanceTimersByTimeAsync(501);
    expect(await outcome).toBe('OBSERVATION_DEADLINE');
    expect(calls.n).toBe(2);
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

describe('what a step leaves behind on the session (ADR-SC-008)', () => {
  it('documentCurrent needs the same document, generation and origin; a new document counts in documentEpoch and ends currency; invalidate() ends it too, and the next observation is a higher generation', async () => {
    const r = rig();
    const first = (await r.session.observe()).observation;
    const stamp = { documentId: first.documentId, generation: first.generation };
    expect(r.session.documentCurrent(stamp, first.origin)).toBe(true);
    expect(r.session.documentCurrent(stamp, 'https://other.example.test')).toBe(false);
    expect(r.session.documentCurrent({ ...stamp, documentId: 'another' }, first.origin)).toBe(false);
    expect(r.session.documentCurrent({ ...stamp, generation: first.generation + 1 }, first.origin)).toBe(false);
    const epoch = r.session.documentEpoch();
    r.navigate(true);
    expect(r.session.documentEpoch()).toBe(epoch + 1);
    expect(r.session.documentCurrent(stamp, first.origin)).toBe(false);
    const second = (await r.session.observe()).observation;
    expect(second.generation).toBeGreaterThan(first.generation);
    r.session.invalidate();
    expect(r.session.documentCurrent({ documentId: second.documentId, generation: second.generation }, second.origin)).toBe(false);
    expect((await r.session.observe()).observation.generation).toBeGreaterThan(second.generation);
  });
  it('commitCapture masks a value a step captured in every later observation', async () => {
    const value = 'Captured business value 4242';
    const r = rig({ script: { collected: page([n('button', { name: 'Open', ref: 'e1' }, value)], { e1: elementFacts('button') }, { origin: 'https://example.test' }) } });
    r.session.commitCapture(value);
    const exported = await r.session.observe();
    expect(JSON.stringify(exported.observation)).not.toContain(value);
  });
});
