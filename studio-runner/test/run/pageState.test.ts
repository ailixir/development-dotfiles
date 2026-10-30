import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_DOMAINS } from '../../src/allowedDomains.js';
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

const TARGET = { documentId: 'doc', generation: 1 };
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

describe('the navigation whitelist inside the page (matched on location.hostname)', () => {
  it('allow-all: author-directed navigation reaches any host, but still refuses userinfo and a foreign scheme', () => {
    const page = stubPage('www.citi.com'), state = stamped(ALL_DOMAINS);
    state.navigate(TARGET, 'https://www.citi.com', 'https://elsewhere.example/next');
    expect(page.assign).toHaveBeenCalledWith('https://elsewhere.example/next');
    for (const destination of ['https://user@citi.com/', 'javascript:alert(1)', 'data:text/html,x']) {
      expect(() => { state.navigate(TARGET, 'https://www.citi.com', destination); }, destination).toThrow('TARGET_CHANGED');
    }
    expect(page.assign).toHaveBeenCalledTimes(1);
    state.dispose();
  });

  it('refuses author-directed navigation to a host off the list, and destinations with userinfo or a foreign scheme', () => {
    const page = stubPage('www.citi.com'), state = stamped(['citi.com']);
    state.navigate(TARGET, 'https://www.citi.com', 'https://login.citi.com/next');
    for (const destination of ['https://evil.com/', 'https://citi.com.evil.com/', 'https://user@citi.com/', 'https://citi.com@evil.com/', 'javascript:alert(1)', 'data:text/html,x']) {
      expect(() => { state.navigate(TARGET, 'https://www.citi.com', destination); }, destination).toThrow('TARGET_CHANGED');
    }
    expect(page.assign).toHaveBeenCalledTimes(1);
    state.dispose();
  });
});

describe('the page-level steps hold the page identity gate', () => {
  it('pageMatches needs the stamped document and generation, the expected origin and an unchanged DOM revision', () => {
    const page = stubPage('www.citi.com'), state = stamped(['citi.com']);
    expect(state.pageMatches(TARGET, 'https://www.citi.com')).toBe(true);
    expect(state.pageMatches({ documentId: 'other', generation: 1 }, 'https://www.citi.com')).toBe(false);
    expect(state.pageMatches({ documentId: 'doc', generation: 2 }, 'https://www.citi.com')).toBe(false);
    expect(state.pageMatches(TARGET, 'https://elsewhere.example')).toBe(false);
    page.mutate();
    expect(state.pageMatches(TARGET, 'https://www.citi.com')).toBe(false);
    expect(() => { state.navigate(TARGET, 'https://www.citi.com', 'https://login.citi.com/'); }).toThrow('TARGET_CHANGED');
    expect(page.assign).not.toHaveBeenCalled();
  });

  it('a revision read before the page changed does not stamp the changed page', () => {
    const page = stubPage('www.citi.com'), state = installPageState({ allowedDomains: ['citi.com'] });
    const before = state.revision();
    page.mutate();
    state.stamp('doc', 1, before); // the page changed between the read and the stamp: the stamp is already stale
    expect(state.pageMatches(TARGET, 'https://www.citi.com')).toBe(false);
  });

  it('assertPage compares the url or the title only on the matching page, and refuses a stale one', () => {
    const page = stubPage('www.citi.com', 'Welcome'), state = stamped(['citi.com']);
    expect(state.assertPage(TARGET, 'https://www.citi.com', 'title', 'Welcome')).toBe(true);
    expect(state.assertPage(TARGET, 'https://www.citi.com', 'title', 'Other')).toBe(false);
    expect(state.assertPage(TARGET, 'https://www.citi.com', 'url', 'https://www.citi.com/page')).toBe(true);
    expect(state.assertPage(TARGET, 'https://www.citi.com', 'url', 'https://www.citi.com/elsewhere')).toBe(false);
    page.mutate();
    expect(() => state.assertPage(TARGET, 'https://www.citi.com', 'title', 'Welcome')).toThrow('TARGET_CHANGED');
  });

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
