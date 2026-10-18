import { describe, expect, it } from 'vitest';
import { VERSION_FIELDS_TIMEOUT_MS, readVersionPaths } from '../../src/run/versionProbe.js';
import type { VersionProbeLocator, VersionProbePage } from '../../src/run/versionProbe.js';

/**
 * A fake chrome://version whose two fields stay empty until `fill`, like the real page between `load`
 * and the browser's reply. Both elements are attached from the start, so an unfiltered `waitFor` settles
 * at once, exactly as on the real page; only a locator narrowed by `filter({ hasText })` waits, and then
 * only until the field text matches the filter that was actually passed. Every `filter` call and every
 * `textContent` read is recorded.
 */
function lateVersionPage() {
  const text = new Map<string, string>([['#profile_path', ''], ['#executable_path', '']]);
  const waiting: { selector: string; hasText: RegExp; resolve: () => void }[] = [];
  const reads: { selector: string; text: string | null }[] = [];
  const waits: { selector: string; state: string; timeout: number }[] = [];
  const filters: { selector: string; hasText: RegExp }[] = [];
  const matches = (selector: string, hasText: RegExp): boolean => hasText.test(text.get(selector) ?? '');
  const locator = (selector: string, hasText: RegExp | null = null): VersionProbeLocator => ({
    filter: options => { filters.push({ selector, hasText: options.hasText }); return locator(selector, options.hasText); },
    waitFor: options => {
      waits.push({ selector, ...options });
      if (hasText === null || matches(selector, hasText)) return Promise.resolve();
      return new Promise<void>(resolve => { waiting.push({ selector, hasText, resolve }); });
    },
    textContent: () => { const value = text.get(selector) ?? null; reads.push({ selector, text: value }); return Promise.resolve(value); },
  });
  const page: VersionProbePage = { locator: selector => locator(selector) };
  const fill = (values: Record<string, string>): void => {
    for (const [selector, value] of Object.entries(values)) text.set(selector, value);
    for (const waiter of waiting.splice(0)) { if (matches(waiter.selector, waiter.hasText)) waiter.resolve(); else waiting.push(waiter); }
  };
  return { page, fill, reads, waits, filters };
}
const settled = async (promise: Promise<unknown>): Promise<boolean> => {
  let done = false;
  void promise.then(() => { done = true; }, () => { done = true; });
  await new Promise<void>(resolve => { setTimeout(resolve, 0); });
  return done;
};

describe('REL-001 chrome://version is read only after the browser has filled it', () => {
  it('waits through the empty window after load instead of reading empty paths', async () => {
    const fake = lateVersionPage();
    const pending = readVersionPaths(fake.page);
    expect(await settled(pending)).toBe(false);
    expect(fake.reads).toEqual([]);
    fake.fill({ '#profile_path': ' /tmp/profile ', '#executable_path': ' /tmp/chrome ' });
    await expect(pending).resolves.toEqual({ profilePath: '/tmp/profile', executablePath: '/tmp/chrome' });
    expect(fake.reads.every(read => read.text !== '')).toBe(true);
    expect(fake.reads.map(read => read.selector)).toEqual(['#profile_path', '#executable_path']);
    expect(fake.waits).toEqual([
      { selector: '#profile_path', state: 'attached', timeout: VERSION_FIELDS_TIMEOUT_MS },
      { selector: '#executable_path', state: 'attached', timeout: VERSION_FIELDS_TIMEOUT_MS },
    ]);
    // Each wait is narrowed to a field that holds text: the filter exists, is applied to both fields, and means "some non-whitespace".
    expect(fake.filters.map(applied => applied.selector)).toEqual(['#profile_path', '#executable_path']);
    for (const applied of fake.filters) { expect(applied.hasText.test('/tmp/x')).toBe(true); expect(applied.hasText.test('')).toBe(false); expect(applied.hasText.test(' \n\t')).toBe(false); }
    expect(VERSION_FIELDS_TIMEOUT_MS).toBeLessThan(15_000);
  });

  it('keeps waiting while one field is still empty or only whitespace', async () => {
    const fake = lateVersionPage();
    const pending = readVersionPaths(fake.page);
    fake.fill({ '#profile_path': '/tmp/profile', '#executable_path': '  ' });
    expect(await settled(pending)).toBe(false);
    expect(fake.reads).toEqual([]);
    fake.fill({ '#executable_path': '/tmp/chrome' });
    await expect(pending).resolves.toEqual({ profilePath: '/tmp/profile', executablePath: '/tmp/chrome' });
  });

  it('fails on the wait, without reading, when the page never fills the fields', async () => {
    const reads: string[] = [];
    const locator = (): VersionProbeLocator => ({
      filter: () => locator(),
      waitFor: () => Promise.reject(new Error('Timeout 30000ms exceeded.')),
      textContent: () => { reads.push('read'); return Promise.resolve(''); },
    });
    await expect(readVersionPaths({ locator })).rejects.toThrow('Timeout 30000ms exceeded.');
    expect(reads).toEqual([]);
  });

  it('passes a missing text node through as undefined so the caller refuses it', async () => {
    const locator = (): VersionProbeLocator => ({ filter: () => locator(), waitFor: () => Promise.resolve(), textContent: () => Promise.resolve(null) });
    await expect(readVersionPaths({ locator })).resolves.toEqual({ profilePath: undefined, executablePath: undefined });
  });
});
