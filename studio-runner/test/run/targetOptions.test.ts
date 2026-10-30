import { describe, expect, it } from 'vitest';
import { ActionBudget } from '../../src/run/actionBudget.js';
import { ClosedActionError } from '../../src/run/closedError.js';
import { chooseForSelect, chooseOption, listNativeOptions, OPTION_CAP, timed } from '../../src/run/targetOptions.js';
import { FakePage, FakeWorld } from '../helpers/fakePage.js';

const budget = (): ActionBudget => new ActionBudget(60_000);
const listing = (...options: [label: string, value: string][]) => ({ labels: options.map(o => o[0]), values: options.map(o => o[1]) });
const VERSIONS = listing(['Python 3.12', 'a'], ['Three thirteen', 'b'], ['Spaced Out', 'Spaced Out'], ['', '']);

describe('which option a literal chooses', () => {
  it('a case variant chooses the option', () => {
    expect(chooseOption('python 3.12', VERSIONS)).toEqual({ kind: 'index', index: 0 });
    expect(chooseOption('PYTHON 3.12', VERSIONS)).toEqual({ kind: 'index', index: 0 });
    expect(chooseOption('B', VERSIONS)).toEqual({ kind: 'index', index: 1 });
  });
  it('a whitespace variant chooses the option', () => {
    expect(chooseOption('  Python    3.12 ', VERSIONS)).toEqual({ kind: 'index', index: 0 });
    expect(chooseOption('python 3.12', VERSIONS)).toEqual({ kind: 'index', index: 0 });
  });
  it('an NFKC variant chooses the option', () => {
    expect(chooseOption('Ｐython 3.12', VERSIONS)).toEqual({ kind: 'index', index: 0 });
    expect(chooseOption('Ｓｐａｃｅｄ Ｏｕｔ', VERSIONS)).toEqual({ kind: 'index', index: 2 });
  });
  it('an exact label or value wins over a normalised match', () => {
    const twin = listing(['python', 'x'], ['Python', 'y']);
    expect(chooseOption('Python', twin)).toEqual({ kind: 'index', index: 1 });
    expect(chooseOption('x', twin)).toEqual({ kind: 'index', index: 0 });
    expect(chooseOption('python', twin)).toEqual({ kind: 'index', index: 0 });
  });
  it('several normalised matches are ambiguous', () => {
    expect(chooseOption('PYTHON', listing(['python', 'x'], ['Python', 'y']))).toEqual({ kind: 'ambiguous' });
  });
  it('an absent literal is refused', () => {
    expect(chooseOption('3.99', VERSIONS)).toEqual({ kind: 'absent' });
    expect(chooseOption('', VERSIONS)).toEqual({ kind: 'index', index: 3 });
  });
});

describe('listing the options of a native select', () => {
  const select = (patch: ConstructorParameters<typeof FakeWorld>[0]) => { const w = new FakeWorld({ selectKind: 'single', ...patch }); const page = new FakePage(w); return { w, page, loc: page.target() }; };

  it('labels and values come from per-option reads and never from evaluate', async () => {
    const { w, loc } = select({ options: [
      { text: ' Python   3.12 ', value: 'a' }, { text: '3.13', label: 'Three thirteen', value: 'b' }, { text: '  Spaced   Out ' }, { text: 'Empty', label: '', value: '' },
    ] });
    const listed = await listNativeOptions(loc, budget());
    expect(listed).toEqual({ tooMany: false, listing: { labels: ['Python 3.12', 'Three thirteen', 'Spaced Out', ''], values: ['a', 'b', 'Spaced Out', ''] } });
    const methods = new Set(w.log.map(call => call.method));
    for (const forbidden of ['evaluate', 'evaluateAll', 'allInnerTexts', 'allTextContents', '$$eval']) expect(methods.has(forbidden)).toBe(false);
    expect([...methods].every(m => ['count', 'textContent', 'getAttribute:label', 'getAttribute:value'].includes(m))).toBe(true);
  });

  it('a value fallback is the collapsed text like Chrome, and an explicit empty value attribute stays empty', async () => {
    const { loc } = select({ options: [{ text: 'Plain' }, { text: ' Two   words ' }, { text: 'Explicit empty', value: '' }] });
    const listed = await listNativeOptions(loc, budget());
    expect(listed).toMatchObject({ tooMany: false, listing: { values: ['Plain', 'Two words', ''] } });
  });

  it('an unreadable list passes the literal through', async () => {
    const { page, loc } = select({ options: [] });
    expect(await listNativeOptions(loc, budget())).toBeNull();
    expect(await chooseForSelect(page, loc, 'anything', budget())).toBe('anything');
  });

  it('a disabled option is refused before the fence', async () => {
    const { page, loc, w } = select({ options: [{ text: 'A', value: 'a' }, { text: 'Beta', value: 'b', disabled: true }] });
    await expect(chooseForSelect(page, loc, 'beta', budget())).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    expect(await chooseForSelect(page, loc, 'a', budget())).toEqual({ index: 0 });
    expect(w.after()).toEqual([]);
  });

  it('an absent or ambiguous choice is refused with the closed code', async () => {
    const { page, loc } = select({ options: [{ text: 'python', value: 'x' }, { text: 'Python', value: 'y' }] });
    await expect(chooseForSelect(page, loc, 'nope', budget())).rejects.toBeInstanceOf(ClosedActionError);
    await expect(chooseForSelect(page, loc, 'PYTHON', budget())).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
  });

  it('an oversize list passes only an exact value or label', async () => {
    const { page, loc } = select({ oversize: OPTION_CAP + 1, options: [{ text: 'Python 3.12', value: 'a' }, { text: '3.13', label: 'Three thirteen', value: 'b' }, { text: 'Spaced Out' }] });
    expect(await listNativeOptions(loc, budget())).toEqual({ tooMany: true });
    expect(await chooseForSelect(page, loc, 'a', budget())).toBe('a');
    expect(await chooseForSelect(page, loc, 'Three thirteen', budget())).toBe('Three thirteen');
    expect(await chooseForSelect(page, loc, 'Spaced Out', budget())).toBe('Spaced Out');
  });

  it('an oversize list refuses a normalised variant before the fence', async () => {
    const { page, loc, w } = select({ oversize: OPTION_CAP + 1, options: [{ text: 'Python 3.12', value: 'a' }, { text: '3.13', label: 'Three thirteen', value: 'b' }] });
    await expect(chooseForSelect(page, loc, 'python 3.12', budget())).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    // The text under a label attribute is not a label.
    await expect(chooseForSelect(page, loc, '3.13', budget())).rejects.toMatchObject({ code: 'TARGET_CHANGED' });
    expect(w.after()).toEqual([]);
  });
});

describe('timed', () => {
  it('rejects with a TimeoutError-named error and ignores a late result', async () => {
    const slow = new Promise<number>(resolve => setTimeout(() => { resolve(1); }, 100));
    await expect(timed(slow, 5)).rejects.toMatchObject({ name: 'TimeoutError' });
    await expect(timed(Promise.resolve(3), 50)).resolves.toBe(3);
    await expect(timed(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom');
  });
});
