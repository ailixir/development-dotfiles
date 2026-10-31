import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPageState } from '../../src/run/pageStateInPage.js';

/**
 * Unit-tier DOM stand-ins for the page-state program (ADR-SC-007 WI-4 D-7). The password path is covered by
 * `passwordControlResolution.test.ts`; real Chromium covers the program in the perception tier.
 */
class Node0 {
  readonly children: Node0[] = [];
  shadowRoot = null; nodeType = 1; isConnected = true; parentElement: Node0 | null = null; assignedSlot = null;
  constructor(readonly tagName: string) {}
  getRootNode(): unknown { return document; }
  hasAttribute(): boolean { return false; }
  getAttribute(): string | null { return null; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }; }
  matches(): boolean { return false; }
}

interface Page { readonly assign: ReturnType<typeof vi.fn>; mutate(): void; setLocation(origin: string, href: string, title?: string): void; }
function stubPage(hostname: string, title = 'Home'): Page {
  const assign = vi.fn();
  let mutated = false;
  const loc = { origin: `https://${hostname}`, hostname, href: `https://${hostname}/page`, assign };
  vi.stubGlobal('document', { documentElement: new Node0('HTML'), title, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('location', loc);
  vi.stubGlobal('Element', Node0); vi.stubGlobal('HTMLElement', Node0); vi.stubGlobal('HTMLInputElement', class FakeInput { readonly isFakeInput = true; }); vi.stubGlobal('ShadowRoot', class { readonly host = null; });
  vi.stubGlobal('getComputedStyle', () => ({ display: 'block', visibility: 'visible' }));
  vi.stubGlobal('MutationObserver', class { observe = vi.fn(); takeRecords() { const records = mutated ? [{ type: 'childList' }] : []; mutated = false; return records; } disconnect = vi.fn(); });
  return { assign, mutate: () => { mutated = true; }, setLocation: (origin, href, newTitle) => { Object.assign(loc, { origin, href }); if (newTitle !== undefined) (document as unknown as { title: string }).title = newTitle; } };
}
afterEach(() => { vi.unstubAllGlobals(); });

const stamped = (domains: readonly string[]) => { const page = installPageState({ allowedDomains: domains }); page.stamp('doc', 1, page.revision()); return page; };

it('document identity survives hash and ordinary mutations but cannot be rebased onto a replacement root', () => {
  const page = stubPage('example.test'), state = stamped(['example.test']);
  expect(state.sameDocument()).toBe(true);
  page.setLocation('https://example.test', 'https://example.test/page#next');
  page.mutate();
  expect(state.sameDocument()).toBe(true);
  (document as unknown as { documentElement: Node0 }).documentElement = new Node0('HTML');
  expect(state.sameDocument()).toBe(false);
  expect(() => { state.stamp('replacement', 2, state.revision()); }).toThrow('TARGET_CHANGED');
  expect(state.sameDocument()).toBe(false);
  state.dispose();
  expect(state.sameDocument()).toBe(false);
});

describe('the page-level state holds the page identity gate',()=>{
  it('stable reports a quiet page as stable and a page that changed since the revision as not', async () => {
    vi.useFakeTimers();
    try {
      const page = stubPage('www.citi.com'), state = stamped(['citi.com']);
      const since = state.revision();
      const quiet = state.stable(120, since);
      await vi.advanceTimersByTimeAsync(200);
      await expect(quiet).resolves.toBe(true);
      page.mutate();
      const changed = state.stable(120, since);
      await vi.advanceTimersByTimeAsync(200);
      await expect(changed).resolves.toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('refuses every operation after dispose, and stamp refuses with CONTEXT_LOST', () => {
    stubPage('www.citi.com');
    const state = stamped(['citi.com']);
    state.dispose();
    expect(() => { state.stamp('doc', 2, 0); }).toThrow('CONTEXT_LOST');
    expect(() => state.passwordCount()).toThrow('CONTEXT_LOST');
    expect(state.preparePasswordResult({ kind: 'passwordControl', documentId: 'doc', generation: 1 }, 'https://www.citi.com')).toEqual({ kind: 'passwordPrewriteRefusal', code: 'TARGET_CHANGED' });
  });
});

describe('moving focus to the password field after an edited field', () => {
  it('does not take the change event of the blurred field for a page change, but still refuses a real mutation', () => {
    const listeners = new Map<string, ((event: Event) => void)[]>();
    stubPage('login.example.test');
    const root = (document as unknown as { documentElement: Node0 }).documentElement;
    vi.stubGlobal('document', { documentElement: root, title: 'Login', activeElement: null, addEventListener: (name: string, listener: (event: Event) => void) => { listeners.set(name, [...(listeners.get(name) ?? []), listener]); }, removeEventListener: vi.fn() });
    let mutated = false;
    vi.stubGlobal('MutationObserver', class { observe = vi.fn(); takeRecords() { const records = mutated ? [{ type: 'childList' }] : []; mutated = false; return records; } disconnect = vi.fn(); });
    class Input extends Node0 {
      type = 'password'; value = ''; readOnly = false; form = null; onFocus: () => void = () => undefined;
      constructor() { super('INPUT'); }
      override matches(): boolean { return false; }
      focus(): void { (document as unknown as { activeElement: unknown }).activeElement = this; this.onFocus(); }
      dispatchEvent(): boolean { return true; }
    }
    vi.stubGlobal('HTMLInputElement', Input);
    const input = new Input();
    input.parentElement = root; root.children.push(input);
    const emit = (name: string): void => { for (const listener of listeners.get(name) ?? []) listener(new Event(name)); };
    const run = (blurChange: boolean, mutate: boolean): void => {
      const state = installPageState({ allowedDomains: ['example.test'] });
      state.stamp('doc', 1, state.revision());
      const target = { kind: 'passwordControl' as const, documentId: 'doc', generation: 1 };
      state.preparePassword(target, 'https://login.example.test');
      input.onFocus = () => { if (blurChange) emit('change'); if (mutate) mutated = true; };
      state.fillPassword(target, 'https://login.example.test', ['https://login.example.test'], 'secret');
    };
    expect(() => { run(true, false); }).not.toThrow();
    expect(input.value).toBe('secret');
    input.value = '';
    // a page mutation caused by the focus is still a change
    expect(() => { run(false, true); }).toThrow('TARGET_CHANGED');
    expect(input.value).toBe('');
  });
});
