/* eslint-disable @typescript-eslint/require-await -- fakes of the Playwright surface: every real method is async, these answer from scripted state. */
/**
 * SC008-E1 AC4 to AC7: the step API binding, driven through runStep against scripted fakes (unit tier: no browser).
 * The fakes are class instances, which is how the binding recognises Playwright objects.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OriginNotAllowed } from '../../src/allowedDomains.js';
import type { InvocationControl } from '../../src/executor/observedReplay.js';
import { hashObserved, ObservedRefusal, type ObservedErrorCode } from '../../src/validator/observedReferencePolicy.js';
import { runStep, type StepResult, type StepRun } from '../../src/run/stepCode.js';
import { MAX_EFFECTS, READ_ONLY, type BeforeCall, type HookedCall, type StepTally } from '../../src/run/stepCodeBinding.js';
import { packageRoot } from '../helpers/corpus.js';

interface World {
  log: string[];
  effects: number;
  matches: Record<string, number>;
  seen: Record<string, unknown[]>;
  handlers: Record<string, ((...args: unknown[]) => unknown)[]>;
  created: object[];
  popup?: FakePage;
  failClick?: 'timeout' | 'lost';
  countFails?: boolean;
  /** SC008-FIX-39: count() never answers (the gate's bound must end it). */
  countHangs?: boolean;
  /** Distinct ancestor signatures evaluateAll reports for a selector (default 1: a uniform set); a number below 0 makes it throw. */
  signatures: Record<string, number>;
  holdClick?: Promise<void>;
  configured: unknown[];
  matcherOptions: unknown[];
}
const newWorld = (): World => ({ log: [], effects: 0, matches: {}, seen: {}, handlers: {}, created: [], configured: [], matcherOptions: [], signatures: {} });
const note = (w: World, key: string, value: unknown): void => { (w.seen[key] ??= []).push(value); };
const named = (name: string, message: string): Error => Object.assign(new Error(message), { name });

class FakeLocator {
  constructor(readonly w: World, readonly sel: string, readonly owner: FakePage) { w.created.push(this); }
  private count_(): number { return this.w.matches[this.sel] ?? 1; }
  async waitFor(options: unknown): Promise<void> {
    if (this.sel === 'slow') await new Promise(resolve => setTimeout(resolve, 150));
    this.w.log.push(`waitFor:${this.sel}`);
    note(this.w, 'waitFor', options);
    const n = this.count_();
    if (n === 0) throw named('TimeoutError', 'locator.waitFor: Timeout exceeded. CANARY-TEXT');
    if (n > 1) throw new Error('strict mode violation: CANARY-TEXT');
  }
  async count(): Promise<number> { this.w.log.push('count'); if (this.w.countHangs === true) return new Promise<number>(() => undefined); if (this.w.countFails === true) throw new Error('count unavailable'); return this.count_(); }
  async innerText(): Promise<string> {
    this.w.log.push('innerText');
    const n = this.count_();
    if (n === 0) throw named('TimeoutError', 'locator.innerText: Timeout exceeded. CANARY-TEXT');
    if (n > 1) throw new Error('strict mode violation: CANARY-TEXT');
    return 'text';
  }
  async isVisible(): Promise<boolean> { this.w.log.push('isVisible'); return this.count_() > 0; }
  async textContent(): Promise<string> { this.w.log.push('textContent'); return 'text'; }
  async click(options?: unknown): Promise<void> {
    this.w.log.push('click');
    this.w.effects += 1;
    note(this.w, 'click', options);
    if (this.w.holdClick) await this.w.holdClick;
    if (this.w.failClick === 'timeout') throw named('TimeoutError', 'locator.click: Timeout exceeded. CANARY-TEXT');
    if (this.w.failClick === 'lost') throw new Error('response lost CANARY-TEXT');
  }
  async fill(value: unknown, options?: unknown): Promise<void> { this.w.log.push('fill'); this.w.effects += 1; note(this.w, 'fill', [value, options]); }
  async _expect(): Promise<object> { this.w.log.push('_expect'); return {}; }
  filter(options: unknown): FakeLocator { note(this.w, 'filter', options); return new FakeLocator(this.w, this.sel, this.owner); }
  /** An index pick is one element: its selector is its own, and it matches one unless a test says otherwise. */
  first(): FakeLocator { return new FakeLocator(this.w, `${this.sel}#first`, this.owner); }
  last(): FakeLocator { return new FakeLocator(this.w, `${this.sel}#last`, this.owner); }
  nth(index: number): FakeLocator { return new FakeLocator(this.w, `${this.sel}#${String(index)}`, this.owner); }
  async evaluateAll(program: unknown): Promise<number> {
    this.w.log.push(`evaluateAll:${this.sel}`);
    note(this.w, 'evaluateAll', String(program));
    const distinct = this.w.signatures[this.sel] ?? 1;
    if (distinct < 0) throw new Error('evaluateAll unavailable');
    return distinct;
  }
  getByRole(): FakeLocator { return new FakeLocator(this.w, `${this.sel}>role`, this.owner); }
  locator(sel: string): FakeLocator { return new FakeLocator(this.w, sel, this.owner); }
  page(): FakePage { return this.owner; }
}
class FakeFrame {
  constructor(readonly w: World, readonly owner: FakePage) {}
  async goto(url: string): Promise<void> { this.w.log.push(`frame.goto:${url}`); }
  childFrames(): FakeFrame[] { return []; }
  parentFrame(): null { return null; }
  page(): FakePage { return this.owner; }
  locator(sel: string): FakeLocator { return new FakeLocator(this.w, sel, this.owner); }
}
class FakePage {
  frame: FakeFrame;
  ctx = null as unknown as FakeContext; // set by the rig
  constructor(readonly w: World, readonly address = 'about:blank') { this.frame = new FakeFrame(w, this); }
  video(): null { this.w.log.push('video'); return null; }
  async close(): Promise<void> { this.w.log.push('close'); }
  mainFrame(): FakeFrame { return this.frame; }
  frames(): FakeFrame[] { return [this.frame]; }
  context(): FakeContext { return this.ctx; }
  url(): string { return this.address; }
  async title(): Promise<string> { this.w.log.push(`title:${this.address}`); return 'T'; }
  locator(sel: string): FakeLocator { return new FakeLocator(this.w, sel, this); }
  frameLocator(sel: string): FakeLocator { return new FakeLocator(this.w, `frame:${sel}`, this); }
  async goto(url: string): Promise<void> { this.w.log.push(`goto:${url}`); this.w.effects += 1; }
  async click(selector: string): Promise<void> { this.w.log.push(`page.click:${selector}`); this.w.effects += 1; }
  on(event: string, handler: (...args: unknown[]) => unknown): void { (this.w.handlers[event] ??= []).push(handler); }
  setDefaultTimeout(ms: number): void { note(this.w, 'page.setDefaultTimeout', ms); }
  setDefaultNavigationTimeout(ms: number): void { note(this.w, 'page.setDefaultNavigationTimeout', ms); }
  async evaluate(fn: (...a: never[]) => unknown, arg?: unknown): Promise<unknown> { note(this.w, 'evaluate', [fn.toString(), arg]); return 1; }
  async waitForEvent(event: string): Promise<unknown> { this.w.log.push(`waitForEvent:${event}`); return this.w.popup; }
}
class FakeContext {
  constructor(readonly w: World, readonly all: FakePage[]) {}
  async newPage(): Promise<void> { this.w.log.push('newPage'); }
  async newCDPSession(): Promise<void> { this.w.log.push('newCDPSession'); }
  browser(): null { this.w.log.push('browser'); return null; }
  async close(): Promise<void> { this.w.log.push('context.close'); }
  get tracing(): object { this.w.log.push('tracing'); return {}; }
  pages(): FakePage[] { return this.all; }
  setDefaultTimeout(ms: number): void { note(this.w, 'context.setDefaultTimeout', ms); }
  setDefaultNavigationTimeout(ms: number): void { note(this.w, 'context.setDefaultNavigationTimeout', ms); }
  async waitForEvent(event: string): Promise<unknown> { this.w.log.push(`ctx.waitForEvent:${event}`); return this.w.popup; }
}

class FakeControl implements InvocationControl {
  phase: InvocationControl['phase'] = 'PREPARING';
  readonly deadlineMs: number;
  begun = 0;
  failure: ObservedErrorCode | null = null;
  private readonly abort = new AbortController();
  constructor(budgetMs = 5000) { this.deadlineMs = Date.now() + budgetMs; }
  get signal(): AbortSignal { return this.abort.signal; }
  remainingMs(): number { return Math.max(0, this.deadlineMs - Date.now()); }
  check(): void {
    if (this.failure === null && Date.now() >= this.deadlineMs) this.poison('TIMEOUT');
    if (this.failure !== null) throw new ObservedRefusal(this.failure);
  }
  beginInvocation(): void {
    this.check();
    if (this.phase !== 'PREPARING') throw new ObservedRefusal('INVALID_CONTRACT');
    this.phase = 'INVOKING';
    this.begun += 1;
  }
  poison(reason: 'TIMEOUT' | 'CANCELLED'): void {
    this.failure = reason === 'TIMEOUT' && this.phase === 'INVOKING' ? 'OUTCOME_UNKNOWN' : reason;
    this.phase = 'POISONED';
    this.abort.abort();
  }
}

/** A scripted stand-in for Playwright's expect: matchers reject with a matcherResult error, as the real ones do. */
function fakeExpect(w: World): unknown {
  const failure = (): Error => Object.assign(new Error('expect failed CANARY-TEXT'), { matcherResult: { pass: false } });
  const matchers = (): Record<string, unknown> => ({
    async toOk() { /* passes */ },
    async toFail() { throw failure(); },
    // SC008-FIX-19: a strict-mode violation inside a matcher, as Playwright 1.63 reports it (verified by probe): the matcherResult carries the
    // matcher name, the pass flag (true for a NEGATED failure) and the expected state or text; the message carries the count, possibly with ANSI escapes.
    async toStrict(spec: { name: string; pass: boolean; expected: unknown; count: number; ansi?: boolean }) {
      const number = spec.ansi === true ? `\u001b[33m${String(spec.count)}\u001b[39m` : String(spec.count);
      throw Object.assign(new Error(`expect(locator).${spec.name}() failed\nError: strict mode violation: getByText('CANARY-TEXT') resolved to ${number} elements:`), { matcherResult: { name: spec.name, pass: spec.pass, expected: spec.expected } });
    },
    async toViaLocator(subject: { _expect(): Promise<unknown> }) { await subject._expect(); },
    async toPass(options: unknown) { w.matcherOptions.push(options); },
    async toHaveText(_text: string, options: unknown) { w.matcherOptions.push(options); },
    get not() { return matchers(); },
  });
  const root = (() => matchers()) as unknown as ((subject: unknown) => unknown) & Record<string, unknown>;
  root.poll = (_fn: unknown, options: unknown) => { w.matcherOptions.push(options); return matchers(); };
  root.configure = (options: unknown) => { w.configured.push(options); return root; };
  root.soft = root;
  return root;
}

const step = (code: string): { stepId: string; code: string; sourceHash: string } => ({ stepId: 's1', code, sourceHash: hashObserved(code) });

interface Rig {
  w: World;
  page: FakePage;
  context: FakeContext;
  control: FakeControl;
  vars: Record<string, unknown>;
  secrets: Record<string, unknown>;
  base: StepRun;
}
function rig(overrides: Partial<StepRun> = {}, budgetMs = 5000): Rig {
  const w = newWorld();
  const page = new FakePage(w);
  const context = new FakeContext(w, [page]);
  page.ctx = context;
  const control = new FakeControl(budgetMs);
  const vars: Record<string, unknown> = {};
  const secrets: Record<string, unknown> = {};
  const base: StepRun = { page, context, expect: fakeExpect(w), inputs: {}, secrets, vars, control, allowedDomains: ['*'], ...overrides };
  return { w, page, context, control, vars, secrets, base };
}
const go = (r: Rig, code: string, overrides: Partial<StepRun> = {}): Promise<StepResult> => runStep(step(code), { ...r.base, ...overrides });

let unhandled = 0;
const onUnhandled = (): void => { unhandled += 1; };
beforeEach(() => { unhandled = 0; process.on('unhandledRejection', onUnhandled); });
afterEach(() => { process.off('unhandledRejection', onUnhandled); });

describe('AC4: wrapping completeness and run-integrity denial', () => {
  const pageExpressions = ["page", "page.locator('a').page()", 'page.mainFrame().page()', 'page.frames()[0].page()', 'page.context().pages()[0]', 'context.pages()[0]', "page.frameLocator('f').locator('b').page()"];
  const contextExpressions = ['context', 'page.context()', "page.locator('a').page().context()", 'page.frames()[0].page().context()'];

  for (const expr of pageExpressions) {
    it(`refuses Page.video and Page.close reached through ${expr}`, async () => {
      const r = rig();
      for (const member of ['video', 'close']) {
        const result = await go(r, `(${expr}).${member}();`);
        expect(result.closedCode, `${expr}.${member}`).toBe('POLICY_REFUSED');
        expect(result.effects).toEqual([]);
      }
      expect(r.w.log).toEqual([]);
    });
  }
  for (const expr of contextExpressions) {
    it(`refuses the BrowserContext members reached through ${expr}`, async () => {
      const r = rig();
      for (const member of ['close', 'browser', 'newPage', 'newCDPSession', 'tracing']) {
        const result = await go(r, `void (${expr}).${member};`);
        expect(result.closedCode, `${expr}.${member}`).toBe('POLICY_REFUSED');
        expect(result.effects).toEqual([]);
      }
      expect(r.w.log).toEqual([]);
    });
  }

  it('unwraps arguments (filter has), and leaves the evaluate family its raw functions', async () => {
    const r = rig();
    const result = await go(r, "const a = page.locator('a'); page.locator('b').filter({ has: a }); await page.evaluate(() => 1 + 1, { timeout: 0 });");
    expect(result.ok).toBe(true);
    const filtered = r.w.seen.filter?.[0] as { has: unknown };
    expect(r.w.created).toContain(filtered.has); // a raw locator, not the proxy
    const [source, arg] = r.w.seen.evaluate?.[0] as [string, unknown];
    expect(source).toContain('1 + 1');
    expect(arg).toEqual({ timeout: 0 }); // data of the in-page family is never clamped
  });

  it('wraps callback parameters while the step runs', async () => {
    const r = rig();
    let release: () => void = () => undefined;
    r.w.holdClick = new Promise<void>(resolve => { release = resolve; });
    const popup = new FakePage(r.w);
    popup.ctx = r.context;
    const running = go(r, `
      page.on('popup', p => { try { p.close(); } catch (e) { vars.inCallback = e.message; } });
      await page.locator('x').click();
    `);
    await new Promise(resolve => setTimeout(resolve, 20));
    r.w.handlers.popup?.[0]?.(popup);
    release();
    expect((await running).ok).toBe(true);
    expect(r.vars.inCallback).toBe('POLICY_REFUSED');
    expect(r.w.log).not.toContain('close');
  });

  it('revokes the binding when the step ends: late timers and callbacks reach nothing, also after a failure', async () => {
    for (const ending of ['', "throw new Error('x');"]) {
      const r = rig();
      const popup = new FakePage(r.w);
      popup.ctx = r.context;
      const result = await go(r, `
        page.on('popup', p => { p.close(); });
        setTimeout(async () => { try { await page.locator('late').click(); } catch (e) { vars.late = e.message; } }, 20);
        ${ending}
      `);
      expect(result.ok).toBe(ending === '');
      const handler = r.w.handlers.popup?.[0];
      expect(() => handler?.(popup)).toThrow('CANCELLED');
      await new Promise(resolve => setTimeout(resolve, 80));
      expect(r.vars.late).toBe('CANCELLED');
      expect(r.w.log).not.toContain('click');
      expect(r.w.log).not.toContain('close');
    }
  });

  it('a call still waiting when the step ends never lands afterwards: no click, no beginInvocation', async () => {
    const r = rig();
    const result = await go(r, "page.locator('slow').click(); throw new Error('stop');");
    expect(result.closedCode).toBe('TARGET_DRIFT');
    expect(result.fenceCrossed).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(r.w.log).not.toContain('click');
    expect(r.w.effects).toBe(0);
    expect(r.control.begun).toBe(0);
    expect(r.control.phase).toBe('PREPARING');
    expect(unhandled).toBe(0);
  });

  it('a call waiting on a slow async hook never runs its take-over after the step ends', async () => {
    let ran = 0;
    const r = rig({ beforeCall: call => (call.method === 'click' ? new Promise(resolve => { setTimeout(() => { resolve({ run: async () => { ran += 1; return undefined; } }); }, 120); }) : undefined) });
    const result = await go(r, "page.locator('ok').click(); throw new Error('stop');");
    expect(result.ok).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(ran).toBe(0);
    expect(r.control.begun).toBe(0);
    expect(r.w.effects).toBe(0);
  });

  it('a proxy kept in vars survives into the next step; one kept anywhere else is dead', async () => {
    const r = rig();
    const popup = new FakePage(r.w, 'about:blank');
    popup.ctx = r.context;
    r.w.popup = popup;
    expect((await go(r, "vars.popup = await page.waitForEvent('popup'); secrets.keep = vars.popup;")).ok).toBe(true);
    expect(r.vars.popup).toBe(popup); // stored unwrapped
    const second = await go(r, 'vars.title = await vars.popup.title(); vars.denied = (() => { try { vars.popup.close(); } catch (e) { return e.message; } })();');
    expect(second.ok).toBe(true);
    expect(r.vars.title).toBe('T');
    expect(r.vars.denied).toBe('POLICY_REFUSED');
    const third = await go(r, 'await secrets.keep.title();'); // a proxy from the first step's binding
    expect(third.closedCode).toBe('CANCELLED');
    expect(r.w.log.filter(entry => entry === 'title:about:blank')).toHaveLength(1);
  });

  it('shows context.pages() only the run page and adopted pages', async () => {
    const r = rig();
    const stranger = new FakePage(r.w, 'https://stranger.test/');
    stranger.ctx = r.context;
    r.context.all.push(stranger);
    const popup = new FakePage(r.w, 'about:blank');
    popup.ctx = r.context;
    r.w.popup = popup;
    const result = await go(r, `
      vars.before = context.pages().length;
      await context.waitForEvent('page');
      vars.after = context.pages().length;
    `);
    r.context.all.push(popup);
    expect(result.ok).toBe(true);
    expect(r.vars.before).toBe(1);
    const again = await go(r, 'vars.sees = context.pages().length;');
    expect(again.ok).toBe(true);
    expect(r.vars.sees).toBe(1); // a later step sees an adopted page only if the caller says so
    const later = await go(r, 'vars.sees = context.pages().length;', { pages: [popup] });
    expect(later.ok).toBe(true);
    expect(r.vars.sees).toBe(2);
  });
});

describe('AC5: domain policy path', () => {
  const closed = async (allowed: readonly string[], code: string, overrides: Partial<StepRun> = {}): Promise<{ r: Rig; result: StepResult }> => {
    const r = rig({ allowedDomains: allowed });
    return { r, result: await go(r, code, overrides) };
  };

  it('refuses off-list goto, Frame.goto and userinfo before any call reaches the page', async () => {
    for (const url of ['https://evil.test/x', 'https://example.com@evil.test/', 'https://u:p@example.com/']) {
      const { r, result } = await closed(['example.com'], `await page.goto(${JSON.stringify(url)});`);
      expect(result.closedCode, url).toBe('POLICY_REFUSED');
      expect(r.w.log).toEqual([]);
      const frame = await closed(['example.com'], `await page.mainFrame().goto(${JSON.stringify(url)});`);
      expect(frame.result.closedCode, url).toBe('POLICY_REFUSED');
      expect(frame.r.w.log).toEqual([]);
    }
  });

  it('lets a listed host and its subdomains through', async () => {
    const { r, result } = await closed(['example.com'], "await page.goto('https://sub.example.com/x'); await page.mainFrame().goto('https://example.com/');");
    expect(result.ok).toBe(true);
    expect(r.w.log).toEqual(['goto:https://sub.example.com/x', 'frame.goto:https://example.com/']);
  });

  it('with allow-all ON passes http(s) hosts, but non-http schemes and userinfo stay refused', async () => {
    expect((await closed(['*'], "await page.goto('https://anything.test/');")).result.ok).toBe(true);
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://u:p@anything.test/', 'about:blank']) {
      expect((await closed(['*'], `await page.goto(${JSON.stringify(url)});`)).result.closedCode, url).toBe('POLICY_REFUSED');
    }
  });

  it('runs afterBlock once after the code, and maps OriginNotAllowed to POLICY_REFUSED', async () => {
    let calls = 0;
    const ok = await closed(['*'], 'await page.title();', { afterBlock: async () => { calls += 1; } });
    expect(ok.result.ok).toBe(true);
    expect(calls).toBe(1);
    const refused = await closed(['*'], 'await page.title();', { afterBlock: async () => { throw new OriginNotAllowed('evil.test'); } });
    expect(refused.result.closedCode).toBe('POLICY_REFUSED');
    let skipped = 0;
    const failed = await closed(['*'], "throw new Error('boom');", { afterBlock: async () => { skipped += 1; } });
    expect(failed.result.ok).toBe(false);
    expect(skipped).toBe(0);
  });

  it('adopts only awaited popups, after a domain check', async () => {
    const adopted: object[] = [];
    const r = rig({ allowedDomains: ['example.com'], adoptPage: page => { adopted.push(page); } });
    const good = new FakePage(r.w, 'about:blank');
    good.ctx = r.context;
    r.w.popup = good;
    expect((await go(r, "await page.waitForEvent('popup');")).ok).toBe(true);
    expect(adopted).toEqual([good]);
    const bad = new FakePage(r.w, 'https://evil.test/');
    bad.ctx = r.context;
    r.w.popup = bad;
    expect((await go(r, "await page.waitForEvent('popup');")).closedCode).toBe('POLICY_REFUSED');
    expect(adopted).toEqual([good]);
    for (const url of ['file:///etc/passwd', 'data:text/html,x', 'chrome://version/']) {
      const odd = new FakePage(r.w, url);
      odd.ctx = r.context;
      r.w.popup = odd;
      expect((await go(r, "await page.waitForEvent('popup');")).closedCode, url).toBe('POLICY_REFUSED');
    }
    expect(adopted).toEqual([good]);
    // a page that merely arrives through an event listener is not adopted
    await go(r, "page.on('popup', () => undefined);");
    expect(adopted).toEqual([good]);
  });
});

describe('AC6: fence, strictness, effects and time', () => {
  it('a unique match crosses the fence once and records the effect by name only', async () => {
    const r = rig();
    const result = await go(r, "await page.locator('ok').fill('CANARY-ARG');");
    expect(result.ok).toBe(true);
    expect(result.fenceCrossed).toBe(true);
    expect(result.effects).toEqual([{ method: 'fill', completed: true }]);
    expect(r.control.begun).toBe(1);
    expect(JSON.stringify(result)).not.toContain('CANARY-ARG');
    expect(r.w.log).toEqual(['waitFor:ok', 'fill']);
  });

  it('zero or several matches end TARGET_DRIFT before the fence, with no effect', async () => {
    for (const matches of [0, 2]) {
      const r = rig();
      r.w.matches.m = matches;
      const result = await go(r, "await page.locator('m').click();");
      expect(result.closedCode, `${String(matches)} matches`).toBe('TARGET_DRIFT');
      expect(result.fenceCrossed).toBe(false);
      expect(result.effects).toEqual([]);
      expect(r.control.begun).toBe(0);
      expect(r.w.effects).toBe(0);
    }
  });

  it('after the fence a failure is OUTCOME_UNKNOWN, an expect failure stays ASSERTION_FAILED, and nothing runs twice', async () => {
    for (const mode of ['timeout', 'lost'] as const) {
      const r = rig();
      r.w.failClick = mode;
      const result = await go(r, "await page.locator('ok').click();");
      expect(result.closedCode, mode).toBe('OUTCOME_UNKNOWN');
      expect(result.effects).toEqual([{ method: 'click', completed: false }]);
      expect(r.w.effects).toBe(1);
      expect(JSON.stringify(result)).not.toContain('CANARY-TEXT');
    }
  });

  it('an expect failure ends ASSERTION_FAILED even after the fence', async () => {
    const r = rig();
    const result = await go(r, "await page.locator('ok').click(); await expect(page).toFail();");
    expect(result.closedCode).toBe('ASSERTION_FAILED');
    expect(result.fenceCrossed).toBe(true);
    expect(r.w.effects).toBe(1);
  });

  describe('a strict-mode violation inside a matcher (SC008-FIX-19)', () => {
    const strict = (spec: object): string => `await expect(page).toStrict(${JSON.stringify({ name: 'toBeVisible', pass: false, expected: 'visible', count: 2, ...spec })});`;
    it('a positive check of presence before the fence is TARGET_DRIFT with the count, even with ANSI escapes around the number', async () => {
      for (const spec of [{}, { ansi: true, count: 7 }, { name: 'toHaveText', expected: 'Hello' }]) {
        const result = await go(rig(), strict(spec));
        expect(result, JSON.stringify(spec)).toMatchObject({ closedCode: 'TARGET_DRIFT', matchCount: (spec as { count?: number }).count ?? 2, fenceCrossed: false });
        expect(JSON.stringify(result)).not.toContain('CANARY-TEXT');
      }
    });

    it('a negated check (pass is true on a failed negated matcher), a hidden check and a state option stay ASSERTION_FAILED', async () => {
      for (const spec of [{ pass: true }, { name: 'toBeHidden', expected: 'hidden' }, { expected: 'hidden' }, { name: 'toBeChecked', expected: 'checked' }, { name: 'toHaveCount', expected: 0 }, { name: 'toHaveText', pass: true, expected: 'Hello' }]) {
        const result = await go(rig(), strict(spec));
        expect(result.closedCode, JSON.stringify(spec)).toBe('ASSERTION_FAILED');
        expect(result.matchCount).toBeUndefined();
      }
    });

    it('a text matcher counts as positive only for a string or a RegExp that cannot assert absence', async () => {
      const regex = (source: string, flags = ''): string => `await expect(page).toStrict({ name: 'toHaveText', pass: false, count: 2, expected: new RegExp(${JSON.stringify(source)}, ${JSON.stringify(flags)}) });`;
      const expected: readonly [string, string][] = [
        [regex('hel+o', 'gi'), 'TARGET_DRIFT'],
        [regex('^$'), 'ASSERTION_FAILED'],
        [regex('x*'), 'ASSERTION_FAILED'],
        [regex('^(?!zzz)'), 'ASSERTION_FAILED'],
        [regex('(?<!zzz)hello'), 'ASSERTION_FAILED'],
        [strict({ name: 'toHaveText', expected: '' }), 'ASSERTION_FAILED'],
        [strict({ name: 'toHaveText', expected: ['a', 'b'] }), 'ASSERTION_FAILED'],
      ];
      for (const [code, closedCode] of expected) expect((await go(rig(), code)).closedCode, code).toBe(closedCode);
    });

    it('after the fence a positive violation stays ASSERTION_FAILED, and the matcher\'s own count beats a count left by an earlier swallowed miss', async () => {
      const after = rig();
      expect((await go(after, `await page.locator('ok').click(); ${strict({})}`)).closedCode).toBe('ASSERTION_FAILED');
      const stale = rig();
      stale.w.matches.m = 3;
      const result = await go(stale, `try { await page.locator('m').click(); } catch { /* the miss is swallowed */ } ${strict({ count: 2 })}`);
      expect(result).toMatchObject({ closedCode: 'TARGET_DRIFT', matchCount: 2 });
    });
  });

  it('cancellation after the fence: one effect, and later calls reach nothing', async () => {
    const r = rig();
    let release: () => void = () => undefined;
    r.w.holdClick = new Promise<void>(resolve => { release = resolve; });
    const running = go(r, "try { await page.locator('ok').click(); } catch {} await page.locator('ok').click();");
    await new Promise(resolve => setTimeout(resolve, 20));
    r.control.poison('CANCELLED');
    release();
    const result = await running;
    expect(result.closedCode).toBe('CANCELLED');
    expect(r.w.effects).toBe(1);
  });

  it('a timeout after the fence is OUTCOME_UNKNOWN with one effect, even if the code never returns', async () => {
    const r = rig({}, 80);
    r.w.holdClick = new Promise<void>(() => undefined);
    const result = await go(r, "await page.locator('ok').click();");
    expect(result.closedCode).toBe('OUTCOME_UNKNOWN');
    expect(r.w.effects).toBe(1);
  });

  it('Promise.all of two effectful calls begins the invocation once', async () => {
    const r = rig();
    const result = await go(r, "await Promise.all([page.locator('a').click(), page.locator('b').click()]);");
    expect(result.ok).toBe(true);
    expect(r.control.begun).toBe(1);
    expect(result.effects).toHaveLength(2);
    expect(r.w.effects).toBe(2);
  });

  it('keeps the tally readable by a caller that abandons runStep', async () => {
    const r = rig({}, 60);
    r.w.holdClick = new Promise<void>(() => undefined);
    const tally: StepTally = { fenceCrossed: false, effects: [], effectsTruncated: false, offscreen: false };
    const result = await go(r, "await page.locator('ok').click();", { tally });
    expect(result.closedCode).toBe('OUTCOME_UNKNOWN');
    expect(tally.fenceCrossed).toBe(true);
    expect(tally.effects).toEqual([{ method: 'click', completed: false }]);
  });

  it('caps the effects list at 64, flags the truncation, and still counts every effect for the fence', async () => {
    const r = rig();
    const result = await go(r, "for (let i = 0; i < 70; i += 1) await page.locator('ok').click();");
    expect(result.ok).toBe(true);
    expect(MAX_EFFECTS).toBe(64);
    expect(result.effects).toHaveLength(64);
    expect(result.effectsTruncated).toBe(true);
    expect(r.w.effects).toBe(70);
    expect(r.control.begun).toBe(1);
    const few = await go(rig(), "await page.locator('ok').click();");
    expect(few.effectsTruncated).toBe(false);
  });

  it('tags effects that act in an adopted page as offscreen', async () => {
    const r = rig();
    const popup = new FakePage(r.w, 'about:blank');
    popup.ctx = r.context;
    r.w.popup = popup;
    const result = await go(r, "const p = await page.waitForEvent('popup'); await p.locator('x').click(); await page.locator('y').click();");
    expect(result.effects).toEqual([{ method: 'click', completed: true, offscreen: true }, { method: 'click', completed: true }]);
    expect(result.offscreen).toBe(true);
  });

  it('reads and underscore internals take no fence and no strictness wait, also on an absent element', async () => {
    const r = rig();
    r.w.matches.gone = 0;
    const result = await go(r, `
      const gone = page.locator('gone');
      vars.n = await gone.count();
      vars.v = await gone.isVisible();
      await gone._expect();
      await expect(gone).toViaLocator(gone);
      await expect(gone).not.toOk();
    `);
    expect(result.ok).toBe(true);
    expect(result.fenceCrossed).toBe(false);
    expect(result.effects).toEqual([]);
    expect(r.control.begun).toBe(0);
    expect(r.vars.n).toBe(0);
    expect(r.w.log.some(entry => entry.startsWith('waitFor'))).toBe(false);
  });

  it('clamps timeouts from the remaining budget, including 0, and the default setters', async () => {
    const r = rig({}, 1000);
    const result = await go(r, `
      await page.locator('ok').click({ timeout: 0 });
      await page.locator('ok').click({ timeout: 999999 });
      await page.locator('ok').click({ timeout: 10 });
      page.setDefaultTimeout(0);
      page.setDefaultNavigationTimeout(0);
      context.setDefaultTimeout(1e9);
      context.setDefaultNavigationTimeout(0);
    `);
    expect(result.ok).toBe(true);
    const clicks = r.w.seen.click as { timeout: number }[];
    expect(clicks[0]?.timeout).toBeGreaterThan(0);
    expect(clicks[0]?.timeout).toBeLessThanOrEqual(1000);
    expect(clicks[1]?.timeout).toBeLessThanOrEqual(1000);
    expect(clicks[2]?.timeout).toBe(10);
    const defaults = [...(r.w.seen['page.setDefaultTimeout'] ?? []), ...(r.w.seen['page.setDefaultNavigationTimeout'] ?? []), ...(r.w.seen['context.setDefaultTimeout'] ?? []), ...(r.w.seen['context.setDefaultNavigationTimeout'] ?? [])] as number[];
    expect(defaults.length).toBe(8); // two applied by the binding before the step, six by the code
    for (const value of defaults) expect(value > 0 && value <= 1000, String(value)).toBe(true);
  });

  it('configures expect per step and clamps matcher and poll timeouts, toPass included', async () => {
    const r = rig({}, 1000);
    const result = await go(r, `
      await expect(page).toHaveText('x', { timeout: 0 });
      await expect(async () => {}).toPass();
      await expect(async () => {}).toPass({ timeout: 0 });
      await expect.poll(() => 1, { timeout: 1e9 }).toOk();
    `);
    expect(result.ok).toBe(true);
    const configured = r.w.configured[0] as { timeout: number; toPass: { timeout: number } };
    expect(configured.timeout).toBeLessThanOrEqual(1000);
    expect(configured.toPass.timeout).toBe(configured.timeout);
    for (const option of r.w.matcherOptions as ({ timeout: number } | undefined)[]) if (option !== undefined) expect(option.timeout > 0 && option.timeout <= 1000).toBe(true);
  });
});

describe('AC6: until-fence mode (learning prepare) and match counts', () => {
  it('runs the reads, then stops at the first effectful call: no effect, no fence, ok until the fence', async () => {
    const r = rig();
    const result = await go(r, "vars.n = await page.locator('ok').count(); await page.title(); await page.locator('ok').click(); vars.after = 1;", { untilFence: true });
    expect(result.ok).toBe(true);
    expect(result.fenceReached).toBe(true);
    expect(result.fenceCrossed).toBe(false);
    expect(result.effects).toEqual([]);
    expect(r.control.begun).toBe(0);
    expect(r.w.effects).toBe(0);
    expect(result.vars).toEqual({ n: 1 });
    expect(r.w.log).toEqual(['count', 'title:about:blank', 'waitFor:ok']); // the strict wait still ran: a miss is a pre-fence failure
  });

  it('stays stopped when the code swallows the stop, and ignores whatever follows', async () => {
    const r = rig();
    const result = await go(r, "try { await page.locator('ok').click(); } catch {} vars.after = 1; throw new Error('later');", { untilFence: true });
    expect(result.ok).toBe(true);
    expect(result.fenceReached).toBe(true);
    expect(r.w.effects).toBe(0);
  });

  it('stops a take-over at fence() and at proceed(), which is where a secret-handle call lands', async () => {
    for (const mode of ['fence', 'proceed'] as const) {
      const checks: string[] = [];
      const r = rig({ beforeCall: call => (call.method === 'fill' ? { run: async (proceed, fence) => { checks.push('pre-checks ran'); if (mode === 'fence') await fence(); else await proceed(); r.w.effects += 1; return undefined; } } : undefined) });
      const result = await go(r, "await page.locator('ok').fill('v');", { untilFence: true });
      expect(result.ok, mode).toBe(true);
      expect(result.fenceReached, mode).toBe(true);
      expect(checks).toEqual(['pre-checks ran']);
      expect(r.w.effects).toBe(0);
      expect(result.effects).toEqual([]);
    }
  });

  it('reports a pre-fence failure as it is, and a step with reads only as completed without the fence', async () => {
    const r = rig();
    r.w.matches.m = 0;
    const missing = await go(r, "await page.locator('m').click();", { untilFence: true });
    expect(missing.closedCode).toBe('TARGET_DRIFT');
    expect(missing.fenceReached).toBe(false);
    const reads = await go(rig(), "vars.t = await page.title();", { untilFence: true });
    expect(reads).toMatchObject({ ok: true, fenceReached: false, fenceCrossed: false });
  });

  it('adds the match count to TARGET_DRIFT: 0 for a missing target, 2 or more for an ambiguous one', async () => {
    for (const matches of [0, 2, 3]) {
      const r = rig();
      r.w.matches.m = matches;
      const result = await go(r, "await page.locator('m').click();");
      expect(result.closedCode).toBe('TARGET_DRIFT');
      expect(result.matchCount).toBe(matches);
    }
    const plain = await go(rig(), "throw new Error('x');");
    expect(plain.closedCode).toBe('TARGET_DRIFT');
    expect(plain.matchCount).toBeUndefined();
  });

  it('a READ that fails on a locator reports the real match count (SC008-FIX-36): 2 for an ambiguous one, 0 for a missing one', async () => {
    for (const matches of [0, 2, 3]) {
      const r = rig();
      r.w.matches.m = matches;
      const result = await go(r, "vars.t = await page.locator('m').innerText();", { untilFence: true });
      expect(result, String(matches)).toMatchObject({ ok: false, closedCode: 'TARGET_DRIFT', matchCount: matches, fenceCrossed: false });
      expect(JSON.stringify(result)).not.toContain('CANARY-TEXT');
    }
  });

  it('a read that fails and whose count cannot be obtained leaves matchCount undefined; a read that succeeds counts nothing', async () => {
    const r = rig();
    r.w.matches.m = 2;
    r.w.countFails = true;
    const unknown = await go(r, "vars.t = await page.locator('m').innerText();", { untilFence: true });
    expect(unknown.closedCode).toBe('TARGET_DRIFT');
    expect(unknown.matchCount).toBeUndefined();
    const fine = rig();
    const ok = await go(fine, "vars.t = await page.locator('ok').innerText();", { untilFence: true });
    expect(ok.ok).toBe(true);
    expect(fine.w.log).not.toContain('count');
  });
});

/**
 * SC008-FIX-39: the index-pick gate. In until-fence mode, first()/last()/nth() applied to a multi-match of UNLIKE elements is refused as TARGET_DRIFT
 * (with the match count) when the picked locator is used, because the index hides an ambiguity strictness would have reported. The fake reports the
 * number of distinct ancestor signatures per selector; the page program itself is exercised against real Chromium in the perception tier.
 */
describe('SC008-FIX-39: the index-pick gate (until-fence mode only)', () => {
  const mixed = (r: Rig, sel = 'm', matches = 4, signatures = 3): void => { r.w.matches[sel] = matches; r.w.signatures[sel] = signatures; };
  const evaluated = (r: Rig): string[] => r.w.log.filter(entry => entry.startsWith('evaluateAll:'));

  it('refuses a click on an index pick out of unlike elements: TARGET_DRIFT, the match count, no click, no fence', async () => {
    const r = rig();
    mixed(r);
    const result = await go(r, "await page.locator('m').first().click();", { untilFence: true });
    expect(result).toMatchObject({ ok: false, closedCode: 'TARGET_DRIFT', matchCount: 4, fenceReached: false, fenceCrossed: false, effects: [] });
    expect(r.w.effects).toBe(0);
    expect(r.control.begun).toBe(0);
    expect(r.w.log).not.toContain('click');
    expect(r.w.log).not.toContain('waitFor:m#first'); // refused before the strict wait
  });

  it('refuses a read on an index pick, and the text of the read never leaves', async () => {
    for (const pick of ['first()', 'last()', 'nth(1)']) {
      const r = rig();
      mixed(r);
      const result = await go(r, `vars.t = await page.locator('m').${pick}.innerText();`, { untilFence: true });
      expect(result, pick).toMatchObject({ ok: false, closedCode: 'TARGET_DRIFT', matchCount: 4 });
      expect(r.vars.t).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('text');
    }
  });

  it('a locator derived from an index pick (locator, getByRole, filter) inherits the base of the pick', async () => {
    for (const derived of ["locator('x')", 'getByRole()', "filter({ hasText: 'x' })", "locator('x').getByRole().filter({ hasText: 'y' })"]) {
      const r = rig();
      mixed(r, 'm', 3, 2);
      const result = await go(r, `await page.locator('m').nth(1).${derived}.click();`, { untilFence: true });
      expect(result, derived).toMatchObject({ ok: false, closedCode: 'TARGET_DRIFT', matchCount: 3, fenceReached: false });
      expect(r.w.effects).toBe(0);
    }
  });

  it('inherits through a union built before the pick: rows.getByRole(link).nth(1), where the base is the union', async () => {
    const r = rig();
    mixed(r, 'row>role', 7, 2);
    const result = await go(r, "vars.t = await page.locator('row').getByRole('link').nth(1).innerText();", { untilFence: true });
    expect(result).toMatchObject({ closedCode: 'TARGET_DRIFT', matchCount: 7 });
    expect(evaluated(r)).toEqual(['evaluateAll:row>role']);
  });

  it('judges every base of a chain of picks: an earlier mixed base is still refused after a later uniform one', async () => {
    const r = rig();
    mixed(r, 'm', 5, 2); // the first pick is from a mixed set; the pick after it is from a (fake-)uniform one
    r.w.matches['m#first>role'] = 3;
    const result = await go(r, "await page.locator('m').first().getByRole().last().click();", { untilFence: true });
    expect(result).toMatchObject({ closedCode: 'TARGET_DRIFT', matchCount: 5 });
    expect(r.w.effects).toBe(0);
    const later = rig(); // the reverse: the first base is uniform, the base of the later pick is not
    later.w.matches.m = 5;
    later.w.matches['m#first>role'] = 3;
    later.w.signatures['m#first>role'] = 2;
    const second = await go(later, "await page.locator('m').first().getByRole().last().click();", { untilFence: true });
    expect(second).toMatchObject({ closedCode: 'TARGET_DRIFT', matchCount: 3 });
    expect(evaluated(later)).toEqual(['evaluateAll:m', 'evaluateAll:m#first>role']);
  });

  it('lets a uniform base through to the fence, and judges a base only once per step', async () => {
    const r = rig();
    r.w.matches.m = 6; // signatures default to 1: identical siblings
    const result = await go(r, "const p = page.locator('m').nth(2); vars.a = await p.innerText(); vars.b = await p.textContent(); await p.click(); vars.after = 1;", { untilFence: true });
    expect(result).toMatchObject({ ok: true, fenceReached: true, fenceCrossed: false, effects: [] });
    expect(result.vars).toEqual({ a: 'text', b: 'text' });
    expect(evaluated(r)).toEqual(['evaluateAll:m']);
    expect(r.w.log.filter(entry => entry === 'count')).toHaveLength(1);
    expect(r.w.effects).toBe(0);
  });

  it('does not run the page program for a base with fewer than two matches', async () => {
    for (const matches of [0, 1]) {
      const r = rig();
      r.w.matches.m = matches;
      r.w.signatures.m = 5;
      const result = await go(r, "await page.locator('m').first().click();", { untilFence: true });
      expect(evaluated(r), String(matches)).toEqual([]);
      expect(result.closedCode === 'TARGET_DRIFT' && result.matchCount === 5).toBe(false);
    }
  });

  it('fails open when the count or the page program fails, or the count is not answered within the bound', async () => {
    const countFails = rig();
    mixed(countFails);
    countFails.w.countFails = true;
    expect(await go(countFails, "await page.locator('m').first().click();", { untilFence: true })).toMatchObject({ ok: true, fenceReached: true });

    const programFails = rig();
    mixed(programFails, 'm', 4, -1);
    expect(await go(programFails, "await page.locator('m').first().click();", { untilFence: true })).toMatchObject({ ok: true, fenceReached: true });

    const hangs = rig();
    mixed(hangs);
    hangs.w.countHangs = true;
    const started = Date.now();
    expect(await go(hangs, "vars.t = await page.locator('m').first().innerText(); await page.locator('m').last().click();", { untilFence: true })).toMatchObject({ ok: true, fenceReached: true });
    expect(Date.now() - started).toBeLessThan(4000);
  });

  it('is off outside until-fence mode: no count, no page program, the effect happens', async () => {
    for (const overrides of [{}, { untilFence: false }]) {
      const r = rig();
      mixed(r);
      const result = await go(r, "vars.t = await page.locator('m').nth(1).innerText(); await page.locator('m').first().click();", overrides);
      expect(result, JSON.stringify(overrides)).toMatchObject({ ok: true, fenceCrossed: true });
      expect(r.w.effects).toBe(1);
      expect(evaluated(r)).toEqual([]);
      expect(r.w.log).not.toContain('count');
    }
  });

  it('does not judge _internals (what expect calls) or count(), and leaves builders synchronous', async () => {
    const r = rig();
    mixed(r);
    const result = await go(r, `
      const p = page.locator('m').first();
      await expect(p).toViaLocator(p);
      vars.n = await p.count();
      vars.sync = typeof p.getByRole().page;
    `, { untilFence: true });
    expect(result).toMatchObject({ ok: true, fenceReached: false });
    expect(result.vars).toEqual({ n: 1, sync: 'function' });
    expect(evaluated(r)).toEqual([]);
    expect(r.w.log.filter(entry => entry === 'count')).toHaveLength(1); // the code's own count()
  });

  it('a locator that is not behind an index is not judged', async () => {
    const r = rig();
    mixed(r);
    const result = await go(r, "await page.locator('m').click();", { untilFence: true });
    expect(result).toMatchObject({ closedCode: 'TARGET_DRIFT', matchCount: 4 }); // the ordinary strict wait, not the gate
    expect(evaluated(r)).toEqual([]);
  });

  it('the page program is a constant runner-owned source that returns only a number and excludes the element\'s own class', () => {
    const r = rig();
    mixed(r);
    return go(r, "await page.locator('m').first().click();", { untilFence: true }).then(() => {
      const [program, ...more] = r.w.seen.evaluateAll as string[];
      expect(more).toEqual([]);
      expect(program).toContain('parentElement');
      expect(program).toContain('depth < 3');
      expect(program).toContain('return seen.size');
      expect(program).not.toMatch(/innerText|textContent|getAttribute|innerHTML/u);
    });
  });
});

describe('AC3 (unit part): floated promises and the tracking Proxy over expect', () => {
  it('a floated failing expect, expect.not and expect.poll each fail the step and raise no unhandledRejection', async () => {
    for (const code of ['expect(page).toFail();', 'expect(page).not.toFail();', 'expect.poll(() => 1).toFail();']) {
      const r = rig();
      const result = await go(r, `${code} await page.title();`);
      expect(result.closedCode, code).toBe('ASSERTION_FAILED');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(unhandled).toBe(0);
  });

  it('a floated failing call fails the step too', async () => {
    const r = rig();
    r.w.failClick = 'lost';
    const result = await go(r, "page.locator('ok').click(); await page.title();");
    expect(result.ok).toBe(false);
    expect(unhandled).toBe(0);
  });

  it('a rejection the code awaited and caught, or caught with .catch, does not fail the step', async () => {
    const r = rig();
    const result = await go(r, `
      try { await expect(page).toFail(); } catch { vars.a = 1; }
      await expect(page).toFail().catch(() => { vars.b = 1; });
      expect(page).toFail().then(() => 0, () => { vars.c = 1; });
      await page.title();
    `);
    expect(result.ok).toBe(true);
    expect(result.vars).toEqual({ a: 1, b: 1, c: 1 });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(unhandled).toBe(0);
  });

  it('a floated failing call or expect chained with .then or .finally and no rejection handler still fails the step', async () => {
    for (const code of ["page.locator('ok').click().then(() => 1);", "page.locator('ok').click().finally(() => 1);", 'expect(page).toFail().then(() => 1);', "page.locator('ok').click().then(() => 1).then(() => 2);"]) {
      const r = rig();
      r.w.failClick = 'lost';
      const result = await go(r, `${code} await page.title();`);
      expect(result.ok, code).toBe(false);
    }
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(unhandled).toBe(0);
  });

  it('a chain that handles the rejection, or whose result the code awaits and catches, does not fail the step', async () => {
    const r = rig();
    r.w.failClick = 'lost';
    const result = await go(r, `
      page.locator('ok').click().then(() => 1, () => { vars.a = 1; });
      page.locator('ok').click().then(() => 1).catch(() => { vars.b = 1; });
      page.locator('ok').click().finally(() => 1).catch(() => { vars.c = 1; });
      try { await page.locator('ok').click().then(() => 1); } catch { vars.d = 1; }
      await page.title();
    `);
    expect(result.ok).toBe(true);
    expect(result.vars).toEqual({ a: 1, b: 1, c: 1, d: 1 });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(unhandled).toBe(0);
  });

  it('a floated promise that is still pending is awaited before the step ends', async () => {
    const r = rig();
    await go(r, "page.locator('a').click(); page.locator('b').click();");
    expect(r.w.effects).toBe(2);
  });
});

describe('AC7: the beforeCall hook', () => {
  it('sees every forwarded call (reads and underscore internals included) with the pinned payload, unwrapped', async () => {
    const seen: HookedCall[] = [];
    const hook: BeforeCall = call => { seen.push(call); return undefined; };
    const r = rig({ beforeCall: hook });
    const result = await go(r, "const l = page.locator('ok'); await l.count(); await l._expect(); await l.click(); page.locator('b').filter({ has: l });");
    expect(result.ok).toBe(true);
    expect(seen.map(call => call.method)).toEqual(['locator', 'count', '_expect', 'click', 'locator', 'filter']);
    const click = seen.find(call => call.method === 'click');
    if (click === undefined) throw new Error('the hook never saw the click');
    expect(click.kind).toBe('Locator');
    expect(click.fenceCrossed).toBe(false);
    expect(seen.at(-1)?.fenceCrossed).toBe(true);
    expect(r.w.created).toContain(click.receiver);
    expect(r.w.created).toContain((seen.at(-1)?.args[0] as { has: unknown }).has);
    expect(seen[0]?.kind).toBe('Page');
  });

  it('runs after the clamp, before the strictness wait and the fence; an async hook is awaited', async () => {
    const order: string[] = [];
    const r = rig({
      beforeCall: call => {
        if (call.method !== 'click') return undefined; // only a method whose native call is async may get a Promise
        return new Promise(resolve => setTimeout(() => {
          order.push(`hook fence=${String(call.fenceCrossed)} timeout=${String((call.args[0] as { timeout: number }).timeout > 0)} waited=${String(r.w.log.includes('waitFor:ok'))}`);
          resolve(undefined);
        }, 5));
      },
    });
    await go(r, "await page.locator('ok').click({ timeout: 0 });");
    expect(order).toEqual(['hook fence=false timeout=true waited=false']);
    expect(r.w.log).toEqual(['waitFor:ok', 'click']);
  });

  it('a refusal gives POLICY_REFUSED with fenceCrossed false, zero effects and no strictness wait', async () => {
    const r = rig({ beforeCall: call => { if (call.method === 'click') throw new ObservedRefusal('POLICY_REFUSED'); return undefined; } });
    const result = await go(r, "await page.locator('ok').click();");
    expect(result.closedCode).toBe('POLICY_REFUSED');
    expect(result.fenceCrossed).toBe(false);
    expect(result.effects).toEqual([]);
    expect(r.w.log).toEqual([]);
    const asyncRefusal = rig({ beforeCall: call => (call.method === 'textContent' ? Promise.reject(new ObservedRefusal('PASSWORD_CONTROL_READ_REFUSED')) : undefined) });
    const read = await go(asyncRefusal, "await page.locator('ok').textContent();");
    expect(read.closedCode).toBe('PASSWORD_CONTROL_READ_REFUSED');
    expect(read.fenceCrossed).toBe(false);
  });

  it('a take-over replaces the native result', async () => {
    const r = rig({ beforeCall: call => (call.method === 'textContent' ? { run: async () => 'replaced' } : undefined) });
    const result = await go(r, "vars.t = await page.locator('ok').textContent();");
    expect(result.vars.t).toBe('replaced');
    expect(r.w.log).toEqual([]);
  });

  it('proceed() wraps a native fill: strict wait, fence, call; two matches give TARGET_DRIFT with fenceCrossed false', async () => {
    const wrapper: BeforeCall = call => (call.method === 'fill' ? { run: async proceed => { await proceed(); return 'wrapped'; } } : undefined);
    const ok = rig({ beforeCall: wrapper });
    const done = await go(ok, "vars.r = await page.locator('ok').fill('v');");
    expect(done.ok).toBe(true);
    expect(done.vars.r).toBe('wrapped');
    expect(done.effects).toEqual([{ method: 'fill', completed: true }]);
    expect(ok.w.log).toEqual(['waitFor:ok', 'fill']);
    const two = rig({ beforeCall: wrapper });
    two.w.matches.many = 2;
    const drift = await go(two, "await page.locator('many').fill('v');");
    expect(drift.closedCode).toBe('TARGET_DRIFT');
    expect(drift.fenceCrossed).toBe(false);
    expect(drift.effects).toEqual([]);
    expect(two.control.begun).toBe(0);
  });

  it('a take-over with its own effect records it after fence(); a refusal before fence() stays repairable; one that calls neither is no effect', async () => {
    const custom = rig({ beforeCall: call => (call.method === 'fill' ? { run: async (_proceed, fence) => { await fence(); custom.w.effects += 1; return undefined; } } : undefined) });
    const result = await go(custom, "await page.locator('ok').fill('v');");
    expect(result.ok).toBe(true);
    expect(result.fenceCrossed).toBe(true);
    expect(result.effects).toEqual([{ method: 'fill', completed: true }]);
    expect(custom.control.begun).toBe(1);
    expect(custom.w.log).toEqual([]); // the native fill never ran

    const refusing = rig({ beforeCall: call => (call.method === 'fill' ? { run: async () => { throw new ObservedRefusal('POLICY_REFUSED'); } } : undefined) });
    const refused = await go(refusing, "await page.locator('ok').fill('v');");
    expect(refused.closedCode).toBe('POLICY_REFUSED');
    expect(refused.fenceCrossed).toBe(false);
    expect(refused.effects).toEqual([]);

    const neither = rig({ beforeCall: call => (call.method === 'fill' ? { run: async () => 'skipped' } : undefined) });
    const skipped = await go(neither, "await page.locator('ok').fill('v');");
    expect(skipped.ok).toBe(true);
    expect(skipped.fenceCrossed).toBe(false);
    expect(skipped.effects).toEqual([]);
  });

  it('passes the secrets object through untouched, and canaries never reach the serialized result', async () => {
    const r = rig();
    r.secrets.PASSWORD = { handle: true };
    const result = await go(r, "vars.same = secrets.PASSWORD.handle; await page.locator('ok').fill('CANARY-ARG'); throw new Error('CANARY-TEXT');");
    expect(r.secrets.PASSWORD).toEqual({ handle: true });
    expect(result.vars.same).toBe(true);
    expect(result.closedCode).toBe('OUTCOME_UNKNOWN');
    expect(JSON.stringify(result)).not.toMatch(/CANARY/u);
  });

  it('maps pre-fence plain errors to TARGET_DRIFT and never copies their text', async () => {
    const r = rig();
    const result = await go(r, "throw new Error('CANARY-TEXT');");
    expect(result.closedCode).toBe('TARGET_DRIFT');
    expect(JSON.stringify(result)).not.toContain('CANARY');
  });
});

describe('the READ_ONLY set', () => {
  it('names only members that still exist in the pinned Playwright types', () => {
    const types = readFileSync(join(packageRoot, 'node_modules', 'playwright-core', 'types', 'types.d.ts'), 'utf8');
    const missing = [...READ_ONLY].filter(name => !new RegExp(`\\b${name.replace(/\$/gu, '\\$')}\\b`, 'u').test(types));
    expect(missing).toEqual([]);
  });

  it('keeps every action out of the set (unknown counts as effectful)', () => {
    for (const name of ['click', 'fill', 'press', 'check', 'selectOption', 'goto', 'evaluate', 'hover', 'type', 'dispatchEvent', 'setInputFiles', 'reload', 'route']) expect(READ_ONLY.has(name), name).toBe(false);
    expect(READ_ONLY.has('_expect')).toBe(false);
  });
});
