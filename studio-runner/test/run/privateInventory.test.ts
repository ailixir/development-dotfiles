import { describe, expect, it } from 'vitest';

import {
  GAP,
  INVENTORY_LIMITS,
  PrivateInventory,
  compactText,
  createPrivateMatcher,
  decodePercentSequences,
  fold,
  nameVariant,
  mintCaptureOrigin,
  percentDecodeRounds,
  type InventoryEntry,
} from '../../src/run/privateInventory.js';

/**
 * ADR-SC-007 D1 / D2 / D6: the private inventory (caps, fail-closed latch) and the private-value matcher
 * (spike semantics, URL decoding, values split across pieces).
 */

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return 'NO_ERROR';
};

describe('PrivateInventory', () => {
  it('D4 excludes only the exact capture contributor while ordinary scrub retains it', () => {
    const inventory = new PrivateInventory(), own = mintCaptureOrigin();
    inventory.addCapture('public copied version 7.2.1', own);
    expect(inventory.matcher().hit('copied version 7.2.1')).toBe(true);
    expect(inventory.matcherExceptCapture(own).hit('public copied version 7.2.1')).toBe(false);
    expect(inventory.snapshot()).toEqual([['public copied version 7.2.1', true]]);
    expect(JSON.stringify(inventory.foreignEntries(own))).toBe('[]');
  });
  it.each(['add','withhold','merge','otherCapture'] as const)('D4 retains duplicate foreign contributor through %s handoff', handoff => {
    const inventory = new PrivateInventory(), own = mintCaptureOrigin(), value = 'duplicate private value 123';
    inventory.addCapture(value, own);
    if (handoff === 'add') inventory.add(value, true);
    if (handoff === 'withhold') inventory.withhold([value]);
    if (handoff === 'merge') inventory.merge([[value, true]]);
    if (handoff === 'otherCapture') inventory.addCapture(value, mintCaptureOrigin());
    expect(inventory.matcherExceptCapture(own).hit(value)).toBe(true);
    expect(inventory.matcherExceptCapture(own).hit('duplicate private')).toBe(true);
  });
  it('D4 keeps foreign strict upgrades, normalization, percent forms, windows and split/inserted matches', () => {
    const inventory = new PrivateInventory(), own = mintCaptureOrigin();
    inventory.addCapture('prefix ＰＲＩＶＡＴＥ shared window suffix', own);
    inventory.add('prefix PRIVATE shared window suffix', false);
    inventory.withhold(['prefix PRIVATE shared window suffix']);
    const foreign = inventory.matcherExceptCapture(own);
    expect(foreign.hit('PRIVATE shared')).toBe(true);
    expect(foreign.hit('prefix%20PRIVATE%20shared%20window%20suffix')).toBe(true);
    expect(foreign.hitSplit(['prefix PRIVATE ', 'shared window suffix'])).toBe(true);
    expect(foreign.locateInserted(['PRIVATE'], ['prefix ', ' shared window suffix']).insert.size).toBe(1);
    const shared = new PrivateInventory(), capture = mintCaptureOrigin();
    shared.addCapture('capture abcdefghijkl tail', capture);
    shared.withhold(['foreign abcdefghijkl payload']);
    expect(shared.matcherExceptCapture(capture).hit('capture abcdefghijkl tail')).toBe(true);
  });
  it('D4 cannot mint an exemption from a serialized or forged capture identity', () => {
    const inventory = new PrivateInventory(); inventory.withhold(['private-canary']);
    expect(() => inventory.matcherExceptCapture({} as ReturnType<typeof mintCaptureOrigin>)).toThrow('CONTEXT_LOST');
    expect(inventory.matcher().hit('private-canary')).toBe(true);
  });
  it('D4 origin attribution exhaustion fails closed under the existing entry budget', () => {
    const inventory = new PrivateInventory();
    for (let i = 0; i < INVENTORY_LIMITS.entries; i++) inventory.addCapture('same-value', mintCaptureOrigin());
    expect(() => { inventory.addCapture('same-value', mintCaptureOrigin()); }).toThrow('PRIVATE_INVENTORY_LIMIT');
    expect(() => inventory.snapshot()).toThrow('CONTEXT_LOST');
  });
  it('stores a value and its name-normalised variant, and strict provenance wins', () => {
    const inventory = new PrivateInventory();
    inventory.add('a  b​', false);
    expect(inventory.snapshot()).toEqual([['a  b​', false], ['a b', false]]);
    inventory.add('a b', true);
    expect(inventory.snapshot()).toEqual([['a  b​', false], ['a b', true]]);
    expect(inventory.size).toBe(2);
  });

  it('ignores empty and whitespace-only variants', () => {
    const inventory = new PrivateInventory();
    inventory.add('', true);
    inventory.add('   ', true);
    expect(inventory.snapshot()).toEqual([['   ', true]]);
    expect(inventory.size).toBe(1);
  });

  it('merges entries and withholds caller values as strict', () => {
    const inventory = new PrivateInventory();
    inventory.merge([['alpha', true], ['on', false]]);
    inventory.withhold(['secret-1', 'secret-2']);
    expect(inventory.snapshot().map((entry) => entry[0])).toEqual(['alpha', 'on', 'secret-1', 'secret-2']);
    expect(inventory.snapshot().find((entry) => entry[0] === 'on')?.[1]).toBe(false);
    expect(inventory.snapshot().find((entry) => entry[0] === 'secret-1')?.[1]).toBe(true);
  });

  it('is never serialisable and has no enumerable members', () => {
    const inventory = new PrivateInventory();
    inventory.add('CANARY_VALUE', true);
    expect(() => JSON.stringify(inventory)).toThrow('INVENTORY_NOT_SERIALISABLE');
    expect(Object.keys(inventory)).toEqual([]);
    expect(Object.getOwnPropertyNames(inventory)).toEqual([]);
  });

  describe('caps', () => {
    it('holds exactly 4,096 entries and refuses the 4,097th', () => {
      const inventory = new PrivateInventory();
      for (let i = 0; i < INVENTORY_LIMITS.entries; i++) inventory.add(`value-${String(i).padStart(5, '0')}`, true);
      expect(inventory.size).toBe(4096);
      expect(code(() => { inventory.add('one-more', true); })).toBe('PRIVATE_INVENTORY_LIMIT');
    });

    it('counts both variants of a value toward the entry cap', () => {
      const inventory = new PrivateInventory();
      let failedAt = -1;
      for (let i = 0; i < 4096; i++) {
        try {
          inventory.add(`v${String(i)}  x`, true); // the double space makes the normalised variant differ
        } catch {
          failedAt = i;
          break;
        }
      }
      expect(failedAt).toBe(2048);
    });

    it('holds a long value whole: only the 1 MiB total cap limits one value', () => {
      const long = new PrivateInventory();
      long.add('x'.repeat(12000), true);
      long.add('y'.repeat(20000), true);
      expect(long.size).toBe(2);
      expect(long.snapshot().map(([value]) => value.length)).toEqual([12000, 20000]);
      const exact = new PrivateInventory();
      exact.add('x'.repeat(1048576), true);
      expect(exact.size).toBe(1);
      const too = new PrivateInventory();
      expect(code(() => { too.add('x'.repeat(1048577), true); })).toBe('PRIVATE_INVENTORY_LIMIT');
    });

    it('refuses more than 1 MiB of values', () => {
      const inventory = new PrivateInventory();
      const value = (i: number): string => `${String(i).padStart(4, '0')}${'é'.repeat(4000)}`;
      let added = 0;
      let message = 'NO_ERROR';
      for (let i = 0; i < 400; i++) {
        try {
          inventory.add(value(i), true);
          added++;
        } catch (error) {
          message = (error as Error).message;
          break;
        }
      }
      expect(message).toBe('PRIVATE_INVENTORY_LIMIT');
      expect(added).toBe(Math.floor(1048576 / (4 + 8000)));
    });

    it('refuses a lone surrogate with INVALID_UNICODE', () => {
      const inventory = new PrivateInventory();
      expect(code(() => { inventory.add('bad\ud800', true); })).toBe('INVALID_UNICODE');
      expect(code(() => { new PrivateInventory().add('\udc00bad', true); })).toBe('INVALID_UNICODE');
      const fine = new PrivateInventory();
      fine.add('emoji 😀 ok', true);
      expect(fine.size).toBeGreaterThan(0);
    });
  });

  describe('fail-closed latch', () => {
    const failed = (reason: 'limit' | 'unicode'): PrivateInventory => {
      const inventory = new PrivateInventory();
      inventory.add('kept before the failure', true);
      expect(code(() => { inventory.add(reason === 'limit' ? 'x'.repeat(1048577) : 'bad\ud800', true); })).toBe(reason === 'limit' ? 'PRIVATE_INVENTORY_LIMIT' : 'INVALID_UNICODE');
      return inventory;
    };

    it.each(['limit', 'unicode'] as const)('after a %s failure every operation throws CONTEXT_LOST', (reason) => {
      const inventory = failed(reason);
      expect(code(() => { inventory.add('x', true); })).toBe('CONTEXT_LOST');
      expect(code(() => { inventory.merge([['x', true]]); })).toBe('CONTEXT_LOST');
      expect(code(() => { inventory.withhold(['x']); })).toBe('CONTEXT_LOST');
      expect(code(() => inventory.snapshot())).toBe('CONTEXT_LOST');
      expect(code(() => inventory.matcher())).toBe('CONTEXT_LOST');
    });

    it('a disposed inventory is unusable and holds nothing', () => {
      const inventory = new PrivateInventory();
      inventory.add('secret', true);
      inventory.dispose();
      expect(inventory.size).toBe(0);
      expect(code(() => inventory.matcher())).toBe('CONTEXT_LOST');
    });

    it('fail() latches an inventory the caller found unusable', () => {
      const inventory = new PrivateInventory();
      inventory.add('secret', true);
      inventory.fail();
      expect(code(() => { inventory.add('x', true); })).toBe('CONTEXT_LOST');
      expect(inventory.size).toBe(0);
    });
  });

  describe('caps the deleted production worker mirror enforced, pinned at their indices', () => {
    /** Index of the first entry the instance refuses when entries are fed one at a time, or -1. */
    const failingIndex = (entries: readonly InventoryEntry[], feed: (entry: InventoryEntry) => void): number => {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry) continue;
        try {
          feed(entry);
        } catch {
          return i;
        }
      }
      return -1;
    };
    // The old worker inventory mirror is deleted with the collector; its indices were equal to these on every case below.
    const both = (entries: readonly InventoryEntry[]): { mine: number } => {
      const mine = new PrivateInventory();
      return { mine: failingIndex(entries, (entry) => { mine.add(entry[0], entry[1]); }) };
    };

    it('fails at the same index on the 4,096 entry cap (distinct values)', () => {
      const entries: InventoryEntry[] = Array.from({ length: 4100 }, (_, i) => [`distinct-${String(i)}`, true]);
      expect(both(entries)).toEqual({ mine: 4096 });
    });

    it('fails at the same index when the normalised variant doubles the count', () => {
      const entries: InventoryEntry[] = Array.from({ length: 3000 }, (_, i) => [`dbl-${String(i)}  x`, true]);
      const result = both(entries);
      expect(result.mine).toBe(2048);
    });

    it('does not count a repeated value twice, in both', () => {
      const entries: InventoryEntry[] = Array.from({ length: 6000 }, (_, i) => [`dup-${String(i % 100)}`, i % 2 === 0]);
      expect(both(entries)).toEqual({ mine: -1 });
    });

    it('fails at the same index on the 1 MiB byte cap with multi-byte values', () => {
      const entries: InventoryEntry[] = Array.from({ length: 200 }, (_, i) => [`${String(i).padStart(4, '0')}${'é'.repeat(4000)}`, true]);
      const result = both(entries);
      expect(result.mine).toBe(131);
    });

    it('fails at the same index on the byte cap with three-byte characters', () => {
      const entries: InventoryEntry[] = Array.from({ length: 200 }, (_, i) => [`${String(i).padStart(4, '0')}${'€'.repeat(3000)}`, true]);
      const result = both(entries);
      expect(result.mine).toBe(116);
    });
  });
});

describe('percent decoding (D2)', () => {
  it('decodes ASCII, two-, three- and four-byte sequences, in any hex case', () => {
    expect(decodePercentSequences('john%20smith')).toBe('john smith');
    expect(decodePercentSequences('caf%C3%a9')).toBe('café');
    expect(decodePercentSequences('%e2%82%AC')).toBe('€');
    expect(decodePercentSequences('%F0%9F%98%80')).toBe('😀');
  });

  it('leaves invalid, truncated and overlong sequences exactly as written, without protecting neighbours', () => {
    expect(decodePercentSequences('%E0%A4%A')).toBe('%E0%A4%A');
    expect(decodePercentSequences('%C0%AF')).toBe('%C0%AF');
    expect(decodePercentSequences('%ff%20x')).toBe('%ff x');
    expect(decodePercentSequences('a%20%ffb%20c')).toBe('a %ffb c');
    expect(decodePercentSequences('%zz%2')).toBe('%zz%2');
    expect(decodePercentSequences('100%')).toBe('100%');
    expect(decodePercentSequences('no escapes')).toBe('no escapes');
  });

  it('produces raw, one round, two rounds, and the plus-as-space forms of each', () => {
    expect(percentDecodeRounds('plain')).toEqual(['plain']);
    expect(percentDecodeRounds('a+b')).toEqual(['a+b', 'a b']);
    expect(percentDecodeRounds('john%2520smith')).toEqual(['john%2520smith', 'john%20smith', 'john smith']);
    expect(percentDecodeRounds('x%2By')).toEqual(['x%2By', 'x+y', 'x y']);
  });
});

describe('createPrivateMatcher (spike semantics)', () => {
  const hit = (entries: (InventoryEntry | string)[], text: string): boolean => createPrivateMatcher(entries).hit(text);

  it('matches NFKC and case-insensitively, as a substring for a strict value of 3 or more characters', () => {
    expect(hit(['Secret Value'], 'my secret value here')).toBe(true);
    expect(hit(['SPK_NFKC'], 'ＳＰＫ＿ＮＦＫＣ text')).toBe(true);
    expect(hit(['abc'], 'xxABCxx')).toBe(true);
    expect(hit(['abc'], 'ab c')).toBe(false);
  });

  it('matches a 1-2 character value, and a non-strict value, as a whole token only', () => {
    expect(hit([['t', true]], 'a t b')).toBe(true);
    expect(hit([['t', true]], 'about')).toBe(false);
    expect(hit([['on', false]], 'switch on now')).toBe(true);
    expect(hit([['on', false]], 'conference')).toBe(false);
    expect(hit([['ab', true]], 'ab-cd')).toBe(true);
  });

  it('applies the production name transformation (zero-width characters, whitespace)', () => {
    expect(hit(['john smith'], 'john​  smith')).toBe(true);
    expect(hit(['jo­hn'], 'john')).toBe(true);
  });

  it('matches any shared 12-character window of a long value (an edited echo)', () => {
    const value = 'the quick brown fox jumps over the lazy dog';
    expect(hit([value], 'xx brown fox jum yy')).toBe(true);
    expect(hit([value], 'xx brown fox yy')).toBe(false);
    expect(hit([value], 'quick brown fox jumps over')).toBe(true);
  });

  it('counts needles, ignores non-strings and empty candidates', () => {
    const matcher = createPrivateMatcher(['alpha', ['  ', true], ['beta', false]]);
    expect(matcher.count).toBeGreaterThan(0);
    expect(matcher.hit('')).toBe(false);
    expect(createPrivateMatcher([]).hit('anything')).toBe(false);
    expect(createPrivateMatcher([]).locateSplit(['a', 'b']).size).toBe(0);
  });

  describe('D2: the value as it appears in a URL', () => {
    const value = 'John Smith';
    it.each([
      ['%20', '/people/john%20smith/profile'],
      ['+', '/search?q=john+smith&x=1'],
      ['double-encoded %2520', '/r?u=john%2520smith'],
      ['mixed-case hex', '/n/Caf%C3%a9'],
      ['encodeURIComponent form', `/p/${encodeURIComponent(value)}`],
      ['upper-case encoded', '/p/JOHN%20SMITH'],
      ['plus after decoding', '/p/john%2Bsmith'],
    ])('finds the value in %s', (label, url) => {
      const entries = label === 'mixed-case hex' ? ['Café'] : [value];
      expect(hit(entries, url)).toBe(true);
    });

    it('finds a value that is only present once decoded twice', () => {
      expect(hit(['Jane Roe'], 'x=jane%25%32%30roe')).toBe(true);
    });

    it('does not invent a match', () => {
      expect(hit([value], '/people/jane%20roe')).toBe(false);
      expect(hit([value], '/search?q=john+doe')).toBe(false);
    });

    it('is not protected by a malformed byte beside the encoded value', () => {
      expect(hit([value], '/p/john%20smith%ff')).toBe(true);
    });
  });

  describe('locateSplit / hitSplit (D1)', () => {
    const matcher = createPrivateMatcher(['John Smith']);

    it('finds a value split across 2, 3 and 4 pieces, with and without spaces', () => {
      expect(matcher.hitSplit(['Jo', 'hn Smith'])).toBe(true);
      expect(matcher.hitSplit(['Jo', 'hn', ' Smith'])).toBe(true);
      expect(matcher.hitSplit(['J', 'ohn', 'Smi', 'th'])).toBe(true);
      expect(matcher.hitSplit(['John', 'Smith'])).toBe(true);
      expect(matcher.hitSplit(['John', 'Doe'])).toBe(false);
    });

    it('returns only the parts that take part in the match', () => {
      expect([...matcher.locateSplit(['Hello', 'Jo', 'hn', ' Smith', 'bye'])].sort()).toEqual([1, 2, 3]);
      expect([...matcher.locateSplit(['unrelated', 'text'])]).toEqual([]);
    });

    it('does not join across a gap', () => {
      expect(matcher.hitSplit(['Jo', GAP, 'hn Smith'])).toBe(false);
      expect(matcher.hitSplit(['John', GAP, 'Smith'])).toBe(false);
    });

    it('finds a value in a single string with its spaces changed (compact test on one string)', () => {
      expect(matcher.hitSplit(['Jo hn Smith'])).toBe(true);
      expect(matcher.hit('Jo hn Smith')).toBe(false); // the single-string test keeps spike semantics
    });

    it('applies the URL forms to split pieces too', () => {
      expect(matcher.hitSplit(['x=john%2', '0smith'])).toBe(true); // an escape cut in two is reassembled by the join
      expect(matcher.hitSplit(['x=john%20', 'smith'])).toBe(true);
      expect(matcher.hitSplit(['john+', 'smith'])).toBe(true);
    });

    it('marks the owners of a long value matched through 12-character windows across pieces', () => {
      const long = createPrivateMatcher(['the quick brown fox jumps over the lazy dog']);
      expect([...long.locateSplit(['intro', 'the quick brown', ' fox jumps over', ' the lazy dog', 'outro'])].sort()).toEqual([1, 2, 3]);
    });

    it('keeps whole-token needles out of the compact test', () => {
      const token = createPrivateMatcher([['on', false]]);
      expect(token.hitSplit(['c', 'o', 'n'])).toBe(false);
      expect(token.hitSplit(['switch on'])).toBe(true);
    });
  });

  describe('locateInserted (position-less strings, D1)', () => {
    const matcher = createPrivateMatcher(['Quillon Marsh']);
    const both = (insert: string[], seq: string[]): { insert: number[]; seq: number[] } => {
      const found = matcher.locateInserted(insert, seq);
      return { insert: [...found.insert].sort(), seq: [...found.seq].sort() };
    };

    it('finds the inserted string after the sequence as well as before it', () => {
      expect(both(['Marsh'], ['Quillon'])).toEqual({ insert: [0], seq: [0] });
      expect(both(['Quillon'], ['Marsh'])).toEqual({ insert: [0], seq: [0] });
    });

    it('finds it between two pieces of the sequence', () => {
      const three = createPrivateMatcher(['Quillon Marsh Smith']);
      const found = three.locateInserted(['Marsh'], ['Quillon', 'Smith', 'unrelated']);
      expect([...found.insert]).toEqual([0]);
      expect([...found.seq].sort()).toEqual([0, 1]);
    });

    it('finds the inserted string inside a piece of the sequence, when the rest of the value is one run of it', () => {
      const three = createPrivateMatcher(['Quillon Marsh Smith']);
      expect([...three.locateInserted(['Marsh'], ['QuillonSm', 'ith']).seq].sort()).toEqual([0, 1]);
      expect([...three.locateInserted(['Marsh'], ['Quillon Smith']).seq]).toEqual([0]);
      expect(both(['Marsh'], ['QuillXon']).seq).toEqual([]);
    });

    it('finds the inserted strings joined with each other in either order', () => {
      expect(both(['Marsh', 'Quillon'], [])).toEqual({ insert: [0, 1], seq: [] });
      expect(both(['Quillon', 'Marsh'], [])).toEqual({ insert: [0, 1], seq: [] });
      expect(both(['Marsh', 'zzz', 'Quillon'], [])).toEqual({ insert: [0, 2], seq: [] });
    });

    it('finds three parts in any order', () => {
      const three = createPrivateMatcher(['Quillon Marsh Smith']);
      const run = (insert: string[], seq: string[]): { insert: number[]; seq: number[] } => {
        const found = three.locateInserted(insert, seq);
        return { insert: [...found.insert].sort(), seq: [...found.seq].sort() };
      };
      expect(run(['Smith', 'Marsh'], ['Quillon'])).toEqual({ insert: [0, 1], seq: [0] });
      expect(run(['Marsh', 'Smith'], ['Quillon'])).toEqual({ insert: [0, 1], seq: [0] });
      expect(run(['Marsh', 'Quillon'], ['Smith'])).toEqual({ insert: [0, 1], seq: [0] });
      expect(run(['Smith'], ['Quillon', 'Marsh'])).toEqual({ insert: [0], seq: [0, 1] });
      expect(run(['Quillon', 'Smith'], ['Marsh'])).toEqual({ insert: [0, 1], seq: [0] }); // the text sits between the two strings
      expect(run(['Smith', 'Quillon'], ['Marsh'])).toEqual({ insert: [0, 1], seq: [0] });
      expect(run(['Quillon', 'Zzz'], ['unrelated'])).toEqual({ insert: [], seq: [] });
    });

    it('does not join across a gap or invent a match', () => {
      expect(both(['Marsh'], ['Quillon'].concat()).seq).toEqual([0]);
      expect(matcher.locateInserted(['Marsh'], ['Quillon', GAP]).seq.size).toBe(1);
      expect([...matcher.locateInserted(['Marsh'], [GAP, 'Quillon'.slice(0, 3)]).seq]).toEqual([]);
      expect(both(['Doe'], ['John']).insert).toEqual([]);
    });

    it('matches 12-character windows across the boundary, wherever the inserted string sits', () => {
      const long = createPrivateMatcher(['the quick brown fox jumps over the lazy dog']);
      const found = long.locateInserted([' fox jumps over'], ['the quick brown', ' the lazy dog']);
      expect([...found.insert]).toEqual([0]);
      expect([...found.seq].sort()).toEqual([0, 1]);
      const reversed = long.locateInserted(['the quick brown'], ['x fox jumps over the lazy dog']);
      expect([...reversed.insert]).toEqual([0]);
    });

    it('applies the URL forms and spends the work budget', () => {
      expect(matcher.locateInserted(['marsh'], ['x=quillon%20']).seq.size).toBe(1);
      const budget = { remaining: 1e9 };
      const tight = createPrivateMatcher(['Quillon Marsh'], { workBudget: budget });
      budget.remaining = 20;
      expect(code(() => tight.locateInserted(['Marsh'], ['Quillon'.repeat(50)]))).toBe('PERCEPTION_UNAVAILABLE');
    });
  });

  describe('long values are matched completely', () => {
    const body = Array.from({ length: 2000 }, (_, i) => String.fromCharCode(97 + ((i * 7 + (i >> 3)) % 26))).join('').repeat(6);

    it('withholds any 12-character window of a 12,000-character value, at every offset', () => {
      const long = createPrivateMatcher([[body, true]]);
      for (const at of [0, 1, 5, 6, 7, 4095, 4096, 4097, 8191, 11987, 11988]) {
        expect(long.hit(`prefix ${body.slice(at, at + 12)} suffix`), `offset ${String(at)}`).toBe(true);
      }
      expect(long.hit('prefix zzzzzzzzzzzzzzz suffix')).toBe(false);
    });

    it('finds a window of a long value split across pieces', () => {
      const long = createPrivateMatcher([[body, true]]);
      const piece = body.slice(9001, 9031);
      expect([...long.locateSplit(['intro', piece.slice(0, 10), piece.slice(10, 20), piece.slice(20), 'outro'])].sort()).toEqual([1, 2, 3]);
    });
  });

  describe('work budget', () => {
    it('throws PERCEPTION_UNAVAILABLE when the probes exhaust the budget, never a partial answer', () => {
      const budget = { remaining: 1e9 };
      const matcher = createPrivateMatcher(['alpha beta gamma delta'], { workBudget: budget });
      budget.remaining = 50;
      expect(code(() => matcher.locateSplit(['some long text '.repeat(40), 'more text '.repeat(40)]))).toBe('PERCEPTION_UNAVAILABLE');
      expect(budget.remaining).toBeLessThan(0);
    });

    it('charges building the windows of a long value, and fails closed when the budget cannot pay for them', () => {
      const long = 'abcdefghij'.repeat(100);
      expect(code(() => createPrivateMatcher([[long, true]], { workBudget: { remaining: 1000 } }))).toBe('PERCEPTION_UNAVAILABLE');
      expect(code(() => createPrivateMatcher([[long, true]], { workBudget: { remaining: 1e9 } }))).toBe('NO_ERROR');
    });

    it('does not throw while the budget lasts', () => {
      const matcher = createPrivateMatcher(['alpha'], { workBudget: { remaining: 1e9 } });
      expect(matcher.hit('xx alpha yy')).toBe(true);
    });

    it('is shared with the inventory matcher', () => {
      const inventory = new PrivateInventory();
      inventory.add('alpha beta', true);
      const budget = { remaining: 1e9 };
      const matcher = inventory.matcher([], { workBudget: budget });
      budget.remaining = 10;
      expect(code(() => matcher.hit('x'.repeat(500)))).toBe('PERCEPTION_UNAVAILABLE');
    });
  });

  it('exports the text transformations the sanitizer shares', () => {
    expect(fold('ＡBC')).toBe('abc');
    expect(nameVariant(' a​  b ')).toBe('a b');
    expect(compactText(' a ​ b\n')).toBe('ab');
  });
});
