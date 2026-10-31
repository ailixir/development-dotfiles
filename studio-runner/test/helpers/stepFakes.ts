/* eslint-disable @typescript-eslint/require-await -- fakes of the Playwright surface: every real method is async, these answer from scripted state. */
/**
 * Browser-free fakes for the SC008-E6 unit tests: the Playwright surface step code touches (class instances, which is how the binding
 * recognises Playwright objects), a step api over them, an observation session, and the frozen-step helpers. Nothing here launches a browser.
 */
import { vi } from 'vitest';

import { OriginNotAllowed } from '../../src/allowedDomains.js';
import type { InvocationControl } from '../../src/executor/observedReplay.js';
import type { ReplayAction } from '../../src/executor/observedOperations.js';
import { hashObserved, ObservedRefusal } from '../../src/validator/observedReferencePolicy.js';
import { StepPages } from '../../src/run/browserFactory.js';
import type { BrowserHandle, StepApi } from '../../src/run/browserFactory.js';
import type { ObservationSession } from '../../src/run/observationTypes.js';

export interface World {
  url: string;
  /** Effects the page took, by method name. */
  effects: string[];
  /** Matches per selector; absent means one. */
  matches: Record<string, number>;
  text: Record<string, string>;
  log: string[];
  /** The page a `waitForEvent('popup')` hands out next. */
  popup?: FakePage;
  /** Hosts the main frame must not be on after a step (an OriginNotAllowed from the whitelist wait). */
  offList?: string;
  /** The next click fails after taking its effect, as a response lost in transit does. */
  failClick?: boolean;
  now: () => number;
}
/** The page has no password input unless a test says so: E8's post-fill check counts them after every text fill. */
export const newWorld = (url = 'https://app.example.test/start'): World => ({ url, effects: [], matches: { 'input[type="password" i]': 0 }, text: {}, log: [], now: Date.now });
const named = (name: string, message: string): Error => Object.assign(new Error(message), { name });

export class FakeLocator {
  constructor(readonly w: World, readonly sel: string, readonly owner: FakePage) {}
  private n(): number { return this.w.matches[this.sel] ?? 1; }
  async waitFor(): Promise<void> {
    this.w.log.push(`waitFor:${this.sel}`);
    if (this.n() === 0) throw named('TimeoutError', 'locator.waitFor: Timeout exceeded. CANARY-TEXT');
    if (this.n() > 1) throw new Error('strict mode violation: CANARY-TEXT');
  }
  async count(): Promise<number> { return this.n(); }
  /** Only the trusted secret path asks the page where a locator lives (the top document): answered yes. */
  async evaluate(): Promise<boolean> { return true; }
  async innerText(): Promise<string> { return this.w.text[this.sel] ?? ''; }
  async click(): Promise<void> { this.w.effects.push('click'); if (this.w.failClick) throw new Error('response lost CANARY-TEXT'); }
  async fill(value: unknown): Promise<void> { this.w.effects.push('fill'); this.w.log.push(`fill:${typeof value === 'string' ? value : '<handle>'}`); }
  async _expect(): Promise<object> { return {}; }
  filter(): this { return this; }
  first(): this { return this; }
  and(): this { return this; }
  getByRole(role: string): FakeLocator { return new FakeLocator(this.w, role, this.owner); }
  locator(sel: string): FakeLocator { return new FakeLocator(this.w, sel, this.owner); }
  page(): FakePage { return this.owner; }
}
export class FakeFrame {
  constructor(readonly w: World, readonly owner: FakePage) {}
  async goto(): Promise<void> { this.w.effects.push('frame.goto'); }
  childFrames(): FakeFrame[] { return []; }
  parentFrame(): null { return null; }
  page(): FakePage { return this.owner; }
}
export class FakePage {
  readonly frame: FakeFrame;
  closed = false;
  constructor(readonly w: World, public address = 'https://app.example.test/start') { this.frame = new FakeFrame(w, this); }
  url(): string { return this.address; }
  video(): null { return null; }
  async close(): Promise<void> { this.closed = true; }
  isClosed(): boolean { return this.closed; }
  mainFrame(): FakeFrame { return this.frame; }
  frames(): FakeFrame[] { return [this.frame]; }
  context(): FakeContext { return this.ctx; }
  ctx = null as unknown as FakeContext;
  async goto(url: string): Promise<void> { this.w.effects.push('goto'); this.address = url; this.w.url = url; }
  locator(sel: string): FakeLocator { return new FakeLocator(this.w, sel, this); }
  getByRole(role: string): FakeLocator { return new FakeLocator(this.w, role, this); }
  async waitForEvent(name: string): Promise<FakePage | undefined> { this.w.log.push(`waitForEvent:${name}`); return this.w.popup; }
  async waitForTimeout(ms: number): Promise<void> { await new Promise(resolve => setTimeout(resolve, ms)); }
  setDefaultTimeout(): void { /* configured by the binding */ }
  setDefaultNavigationTimeout(): void { /* configured by the binding */ }
}
export class FakeContext {
  constructor(readonly w: World, readonly opener: FakePage) { opener.ctx = this; }
  pages(): FakePage[] { return [this.opener]; }
  async newPage(): Promise<FakePage> { return new FakePage(this.w); }
  async newCDPSession(): Promise<object> { return {}; }
  browser(): null { return null; }
  async close(): Promise<void> { /* denied by the binding */ }
  setDefaultTimeout(): void { /* configured by the binding */ }
  setDefaultNavigationTimeout(): void { /* configured by the binding */ }
}

/** Playwright's expect, as far as these tests need it: a matcher object over a locator that throws a failing matcherResult. */
export const fakeExpect = (() => {
  const matchers = (): { toHaveText(expected: string): Promise<void> } => ({
    async toHaveText(expected: string): Promise<void> { throw Object.assign(new Error(`expected ${expected}`), { matcherResult: { pass: false } }); },
  });
  const root = (() => matchers()) as unknown as ((target: unknown) => unknown) & { configure(): unknown };
  root.configure = () => root;
  return root;
})();

export interface Rig {
  readonly w: World;
  readonly page: FakePage;
  readonly context: FakeContext;
  readonly pages: StepPages;
  readonly api: StepApi;
  readonly session: ObservationSession & { readonly calls: string[]; readonly captures: string[] };
}
/** A session that records what the runner does to it. `observe` answers a fixed document. */
export function fakeSession(w: World, overrides: Partial<ObservationSession> = {}): ObservationSession & { readonly calls: string[]; readonly captures: string[] } {
  const calls: string[] = [], captures: string[] = [];
  let epoch = 0;
  const session: ObservationSession = {
    observe: vi.fn(async () => { calls.push('observe'); return { observation: { documentId: 'doc-1', generation: 1, origin: new URL(w.url).origin }, json: '{}', bytes: 2, observationHash: 'h'.repeat(64) } as never; }),
    commitCapture: value => { calls.push('commitCapture'); captures.push(value); },
    invalidate: () => { calls.push('invalidate'); },
    documentCurrent: () => true,
    documentEpoch: () => epoch++ && epoch,
    withhold: async () => { calls.push('withhold'); },
    preparePassword: async () => { calls.push('preparePassword'); },
    fillPassword: async (_target, _origin, _allowed, value) => { calls.push('fillPassword'); w.effects.push('secretFill'); w.log.push(`secretFill:${String(value.length)}`); },
    dispose: async () => { calls.push('dispose'); },
    ...overrides,
  };
  return Object.assign(session, { calls, captures });
}
export function newRig(url = 'https://app.example.test/start', overrides: Partial<ObservationSession> = {}): Rig {
  const w = newWorld(url);
  const page = new FakePage(w, url), context = new FakeContext(w, page);
  const pages = new StepPages();
  const api: StepApi = {
    page, context, expect: fakeExpect,
    awaitWhitelistedMainFrame: async () => { if (w.offList !== undefined) throw new OriginNotAllowed(w.offList); },
    beginStep: () => { pages.begin(); },
    endStep: () => pages.end(),
    adopt: adopted => { pages.adopt(adopted as FakePage); },
    adoptedPages: () => pages.openAdopted(),
  };
  return { w, page, context, pages, api, session: fakeSession(w, overrides) };
}
export function fakeHandle(rig: Rig): BrowserHandle {
  return {
    page: rig.page, stepApi: rig.api, createObservationSession: () => rig.session, observedBlankMatches: async () => true,
    observedHosts: () => [], close: async () => null, dispose: async () => undefined,
  };
}

/** A frozen step operation: its hash is the hash of its code, exactly as the publisher computes it. */
export function operation(code: string, parts: { captures?: string[]; uses?: ReplayAction['operation']['uses'][number][] } = {}): ReplayAction['operation'] {
  return { kind: 'step', code, captures: parts.captures ?? [], uses: parts.uses ?? [], sourceHash: hashObserved(code) };
}
/** A value a test has just arranged to exist. */
export function must<T>(value: T | undefined): T { if (value === undefined) throw new Error('FIXTURE'); return value; }
export const coordinate = (stepId = 'step-1', ordinal = 0): ReplayAction['coordinate'] => ({ stepId, ordinal });

/** A control that never expires and counts the fence, for steps run outside an executor. */
export function openControl(options: { remainingMs?: number } = {}): InvocationControl & { readonly fenced: () => number } {
  let phase: InvocationControl['phase'] = 'PREPARING', begun = 0;
  const abort = new AbortController();
  return {
    deadlineMs: Date.now() + (options.remainingMs ?? 60_000), remainingMs: () => options.remainingMs ?? 60_000, signal: abort.signal,
    get phase() { return phase; },
    check: () => { if (phase === 'POISONED') throw new ObservedRefusal('CANCELLED'); },
    beginInvocation: () => { begun++; phase = 'INVOKING'; },
    poison: () => { phase = 'POISONED'; abort.abort(); },
    fenced: () => begun,
  };
}
