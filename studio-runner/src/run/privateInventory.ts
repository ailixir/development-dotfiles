/**
 * The private inventory and the private-value matcher of the perception path (ADR-SC-007 D1, D6).
 *
 * Adapted from the collector's `privateValues` / `inventoryValue` (observationCollector.ts) and the
 * worker mirror (observationInventory.ts), which stay untouched until the cut-over. The inventory
 * holds every value the page showed in a control, in editable content or in sensitive regions, plus
 * the values the caller withholds. Anything that echoes one of them is withheld from the outline.
 *
 * Fail closed: the first failure (`PRIVATE_INVENTORY_LIMIT`, `INVALID_UNICODE`) latches the instance;
 * from then on every operation throws `CONTEXT_LOST`. Error messages are closed codes and never
 * carry a value.
 */

export type InventoryEntry = readonly [value: string, strict: boolean];

/** Volatile, process-local identity. It is never accepted from a wire object. */
declare const captureBrand: unique symbol;
export interface CaptureOrigin { readonly [captureBrand]: true }
const captureOrigins = new WeakSet();
export function mintCaptureOrigin(): CaptureOrigin {
  const origin = Object.freeze({}) as CaptureOrigin;
  captureOrigins.add(origin);
  return origin;
}
const FOREIGN = Symbol('FOREIGN_OR_UNKNOWN');

/**
 * Production caps (observationCollector.ts :66). There is no per-value cap: a long value (a hidden
 * `__VIEWSTATE`, a textarea, a rich-text field) is held completely and counts against the byte cap.
 */
export const INVENTORY_LIMITS = { entries: 4096, bytes: 1048576 } as const;

/**
 * Per-perceive work budget of the probes, in character comparisons (see `WorkBudget`).
 *
 * Measured in real Chromium (WI-2 review round 1, F10), every probe counted. One unit is about 0.7 to 0.85 ns,
 * so 1 ms of perception is about 1.2 to 1.5 million units:
 *   large-catalog.html (1,640 nodes)  with 0 / 20 / 300 / 1,000 extra inventory entries:  3.2M / 44M / 0.62G / 2.07G units
 *   large-form.html (3,009 nodes)     with 0 / 20 / 300 / 1,000 extra inventory entries:  0 / 79M / 1.18G / 3.91G units
 *   form page of 24,305 nodes         with 20 / 300 / 1,000 filled controls:              79M / 1.15G / 3.84G units
 *   the same with a hidden 12,000-character value:                                        300 controls 1.16G units
 *   the same with a 12,000-character hidden value and a 20,000-character textarea:        1,002 entries 4.91G units (4.2 s)
 *   the same with four hidden 100,000-character values:                                   1,004 entries 3.89G units (6.6 s)
 * 20G units leave 4.1x headroom over the largest of them (4.91G) and 17x over the largest page with 300 entries
 * (1.16G). A runaway page still stops, fail-closed, after about 15 s of work.
 */
export const DEFAULT_WORK_BUDGET_UNITS = 20_000_000_000;

/** Units charged per character of a value whose 12-character windows are built into the matcher (about 180 ns each). */
const WINDOW_BUILD_UNITS = 128;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

/** The exact name transformation of the supported locator-name subset (also used by the collector). */
export const nameVariant = (text: string): string => text.replace(/[\u200b\u00ad]/gu, '').replace(/\s+/gu, ' ').trim();

/** NFKC and lower case: matching is case-insensitive (stricter than the production collector). */
export const fold = (text: string): string => text.normalize('NFKC').toLowerCase();

/** Whitespace and zero-width characters removed: values split across inline elements join up. */
export const compactText = (text: string): string => text.replace(/[\s\u200b\u00ad]+/gu, '');

/** A part that can never be part of a match: keeps pieces on both sides of a withheld child apart. */
export const GAP = '\u0000';

const utf8Length = (text: string): number => new TextEncoder().encode(text).length;

export class PrivateInventory {
  readonly #values = new Map<string, Map<CaptureOrigin | typeof FOREIGN, boolean>>();
  #bytes = 0;
  #contributors = 0;
  #latched = false;

  get size(): number {
    return this.#values.size;
  }

  #assertLive(): void {
    if (this.#latched) throw new Error('CONTEXT_LOST');
  }

  /** Throws CONTEXT_LOST once the inventory has failed or been disposed. */
  assertLive(): void {
    this.#assertLive();
  }

  /** Adds `value` (and its name-normalised variant). Strict provenance wins when seen twice. */
  add(value: string, strict: boolean): void {
    this.#add(value, strict, FOREIGN);
  }

  addCapture(value: string, origin: CaptureOrigin): void {
    if (!captureOrigins.has(origin)) { this.fail(); throw new Error('CONTEXT_LOST'); }
    this.#add(value, true, origin);
  }

  #add(value: string, strict: boolean, origin: CaptureOrigin | typeof FOREIGN): void {
    this.#assertLive();
    try {
      if (typeof value !== 'string' || LONE_SURROGATE.test(value)) throw new Error('INVALID_UNICODE');
      for (const variant of [value, nameVariant(value)]) {
        if (variant === '') continue;
        if (!this.#values.has(variant)) {
          const bytes = utf8Length(variant);
          if (this.#values.size >= INVENTORY_LIMITS.entries || this.#bytes + bytes > INVENTORY_LIMITS.bytes) {
            throw new Error('PRIVATE_INVENTORY_LIMIT');
          }
          this.#bytes += bytes;
        }
        const contributors = this.#values.get(variant) ?? new Map<CaptureOrigin | typeof FOREIGN, boolean>();
        if (!contributors.has(origin)) {
          if (this.#contributors >= INVENTORY_LIMITS.entries) throw new Error('PRIVATE_INVENTORY_LIMIT');
          this.#contributors++;
        }
        contributors.set(origin, strict || contributors.get(origin) === true);
        this.#values.set(variant, contributors);
      }
    } catch (error) {
      this.#latched = true;
      this.#values.clear();
      throw error;
    }
  }

  merge(entries: readonly InventoryEntry[]): void {
    this.#assertLive();
    for (const [value, strict] of entries) this.add(value, strict);
  }

  /** Values the caller withholds (known secrets, authored values): always strict. */
  withhold(values: readonly string[]): void {
    this.#assertLive();
    for (const value of values) this.add(value, true);
  }

  snapshot(): InventoryEntry[] {
    this.#assertLive();
    return [...this.#values].map(([value, origins]) => [value, [...origins.values()].some(Boolean)]);
  }

  matcher(extraStrict: readonly string[] = [], options: MatcherOptions = {}): PrivateMatcher {
    this.#assertLive();
    return createPrivateMatcher([...this.snapshot(), ...extraStrict.filter((value) => value !== '').map((value): InventoryEntry => [value, true])], options);
  }

  /** Excludes only this exact contributor. Equal bytes from any other origin remain private. */
  foreignEntries(origin: CaptureOrigin): InventoryEntry[] {
    this.#assertLive();
    if (!captureOrigins.has(origin)) throw new Error('CONTEXT_LOST');
    return [...this.#values].flatMap(([value, origins]): InventoryEntry[] => {
      const contributors = [...origins].filter(([contributor]) => contributor !== origin);
      return contributors.length ? [[value, contributors.some(([, strict]) => strict)]] : [];
    });
  }

  matcherExceptCapture(origin: CaptureOrigin, options: MatcherOptions = {}): PrivateMatcher {
    return createPrivateMatcher(this.foreignEntries(origin), options);
  }

  /** Marks the inventory failed: the caller found a value it cannot hold. Every later operation throws CONTEXT_LOST. */
  fail(): void {
    this.#latched = true;
    this.#values.clear();
    this.#bytes = 0;
    this.#contributors = 0;
  }

  dispose(): void {
    this.#latched = true;
    this.#values.clear();
    this.#bytes = 0;
    this.#contributors = 0;
  }

  /** The inventory holds the private values themselves: it is never serialised. */
  toJSON(): never {
    throw new Error('INVENTORY_NOT_SERIALISABLE');
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// D2: percent decoding, per sequence.

const isHexPair = (text: string, at: number): boolean => /^[0-9a-fA-F]{2}$/u.test(text.slice(at, at + 2));
const decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Decodes %XX sequences one UTF-8 sequence at a time: a valid sequence becomes its characters, an invalid
 * or truncated one is left exactly as written, so one bad byte never protects its neighbours.
 */
export function decodePercentSequences(text: string): string {
  if (!text.includes('%')) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '%' && isHexPair(text, i + 1)) {
      const lead = Number.parseInt(text.slice(i + 1, i + 3), 16);
      const length = lead < 0x80 ? 1 : (lead & 0xe0) === 0xc0 ? 2 : (lead & 0xf0) === 0xe0 ? 3 : (lead & 0xf8) === 0xf0 ? 4 : 0;
      if (length === 1) {
        out += String.fromCharCode(lead);
        i += 3;
        continue;
      }
      if (length > 1) {
        const bytes = [lead];
        let j = i + 3;
        let complete = true;
        for (let k = 1; k < length; k++) {
          if (text[j] === '%' && isHexPair(text, j + 1)) {
            const next = Number.parseInt(text.slice(j + 1, j + 3), 16);
            if ((next & 0xc0) !== 0x80) {
              complete = false;
              break;
            }
            bytes.push(next);
            j += 3;
          } else {
            complete = false;
            break;
          }
        }
        if (complete) {
          try {
            out += decoder.decode(Uint8Array.from(bytes));
            i = j;
            continue;
          } catch {
            // not a valid sequence: left as written below
          }
        }
      }
      out += text.slice(i, i + 3);
      i += 3;
      continue;
    }
    out += text[i] ?? '';
    i += 1;
  }
  return out;
}

/**
 * Every form a candidate string is compared in: raw, one and two rounds of percent decoding, and each of
 * those with '+' read as a space. Deduplicated, raw first.
 */
export function percentDecodeRounds(text: string): string[] {
  if (!text.includes('%') && !text.includes('+')) return [text];
  const rounds: string[] = [text];
  const first = decodePercentSequences(text);
  rounds.push(first);
  rounds.push(decodePercentSequences(first));
  const forms: string[] = [];
  for (const round of rounds) {
    forms.push(round);
    if (round.includes('+')) forms.push(round.replaceAll('+', ' '));
  }
  return [...new Set(forms)];
}

// ---------------------------------------------------------------------------------------------------------------------
// The matcher.

export interface WorkBudget {
  remaining: number;
}

export interface MatcherOptions {
  /** Shared across the probes of one perceive(); exhausting it throws PERCEPTION_UNAVAILABLE. */
  readonly workBudget?: WorkBudget;
}

export interface PrivateMatcher {
  readonly count: number;
  /** Spike semantics (NFKC, case-insensitive, substring / token / 12-char windows) in every D2 form of the text. */
  hit(text: string): boolean;
  /** Indices of `parts` that overlap a match of the compacted join (whitespace removed), in every D2 form. */
  locateSplit(parts: readonly string[]): ReadonlySet<number>;
  hitSplit(parts: readonly string[]): boolean;
  /**
   * Like `locateSplit`, for strings with no position of their own (a node's name, placeholder): `insert`
   * may sit anywhere in `seq` (between pieces or inside one), alone or with the others, in any order, and
   * the value needs only the rest of it to be a run of `seq`. Windows of 12 characters are tried at the
   * boundaries between the pieces. Returns the indices involved.
   */
  locateInserted(insert: readonly string[], seq: readonly string[]): { insert: ReadonlySet<number>; seq: ReadonlySet<number> };
}

interface Needle {
  readonly v: string;
  readonly mode: 'sub' | 'token';
}

/** Most position-less strings combined in every order by `locateInserted`. */
const INSERT_LIMIT = 4;
/** Blocks placed at separate boundaries are at least this long (compact characters): shorter ones only sit next to another string. */
const MIN_SEPARATE_BLOCK = 3;

const isWordChar = (ch: string): boolean => /[\p{L}\p{M}\p{N}_]/u.test(ch);

function hasToken(text: string, needle: string): boolean {
  let at = text.indexOf(needle);
  while (at !== -1) {
    const before = Array.from(text.slice(0, at)).at(-1) ?? '';
    const next = text.codePointAt(at + needle.length);
    const after = next === undefined ? '' : String.fromCodePoint(next);
    if (!isWordChar(before) && !isWordChar(after)) return true;
    at = text.indexOf(needle, at + 1);
  }
  return false;
}

/**
 * Entries are [value, strict] pairs (or plain strings, strict). A strict value of 3 or more characters
 * matches as a substring; a non-strict value (a safe implicit `on`) and a value of 1-2 characters match as a
 * whole token only. A strict value of 12 or more characters also matches on any shared 12-character window.
 * Needles also exist in their encodeURIComponent and '+' forms (D2).
 */
export function createPrivateMatcher(entries: readonly (InventoryEntry | string)[], options: MatcherOptions = {}): PrivateMatcher {
  const needles: Needle[] = [];
  const seen = new Set<string>();
  const windows = new Set<string>();
  const compactWindows = new Set<string>();
  const compactNeedles: string[] = [];
  const compactSeen = new Set<string>();
  const budget = options.workBudget;
  const spend = (units: number): void => {
    if (budget === undefined) return;
    budget.remaining -= units;
    if (budget.remaining < 0) throw new Error('PERCEPTION_UNAVAILABLE');
  };
  const addNeedle = (variant: string, mode: 'sub' | 'token'): void => {
    if (variant.trim() === '') return;
    const key = `${mode}|${variant}`;
    if (seen.has(key)) return;
    seen.add(key);
    needles.push({ v: variant, mode });
    if (mode === 'sub') {
      // Every 12-character window of the value, wherever it sits: a long value is matched as completely as a short one.
      spend(variant.length * WINDOW_BUILD_UNITS);
      for (let i = 0; i + 12 <= variant.length; i++) windows.add(variant.slice(i, i + 12));
      const compact = compactText(variant);
      if (compact !== '' && !compactSeen.has(compact)) {
        compactSeen.add(compact);
        compactNeedles.push(compact);
        // a compact value without whitespace has the same windows: they are already in `windows`
        if (compact !== variant) for (let i = 0; i + 12 <= compact.length; i++) compactWindows.add(compact.slice(i, i + 12));
      }
    }
  };
  for (const entry of entries) {
    const value = Array.isArray(entry) ? (entry as InventoryEntry)[0] : entry;
    const strict = Array.isArray(entry) ? (entry as InventoryEntry)[1] : true;
    if (typeof value !== 'string') continue;
    const folded = fold(value);
    const mode = (variant: string): 'sub' | 'token' => (strict && Array.from(variant).length > 2 ? 'sub' : 'token');
    for (const variant of [folded, nameVariant(folded)]) {
      if (variant.trim() === '') continue;
      addNeedle(variant, mode(variant));
      // D2: the value as it appears in a URL, with %20 or '+' for a space.
      const encoded = fold(encodeURIComponent(variant));
      if (encoded !== variant) {
        addNeedle(encoded, mode(variant));
        addNeedle(encoded.replaceAll('%20', '+'), mode(variant));
      }
    }
  }
  const inCompactWindows = (window: string): boolean => compactWindows.has(window) || windows.has(window);

  const hitOne = (candidate: string): boolean => {
    const a = fold(candidate);
    const b = nameVariant(a);
    spend(needles.length * (a.length + 1));
    for (const n of needles) {
      if (n.mode === 'sub' ? a.includes(n.v) || b.includes(n.v) : hasToken(a, n.v) || hasToken(b, n.v)) return true;
    }
    if (windows.size > 0) {
      for (const t of a === b ? [a] : [a, b]) {
        for (let i = 0; i + 12 <= t.length; i++) if (windows.has(t.slice(i, i + 12))) return true;
      }
    }
    return false;
  };

  const hit = (text: string): boolean => {
    if (needles.length === 0 || typeof text !== 'string' || text === '') return false;
    return percentDecodeRounds(text).some(hitOne);
  };

  /** The D2 forms of every part, combined form by form: one candidate join per decode round (and '+' reading). */
  const formCombinations = (parts: readonly string[]): string[][] => {
    const perPart = parts.map((part) => (part === GAP ? [GAP] : percentDecodeRounds(part)));
    const formCount = perPart.reduce((max, forms) => Math.max(max, forms.length), 1);
    const joins = new Map<string, string[]>();
    for (let f = 0; f < formCount; f++) {
      const chosen = perPart.map((forms) => forms[Math.min(f, forms.length - 1)] ?? '');
      joins.set(JSON.stringify(chosen), chosen);
    }
    return [...joins.values()];
  };
  const compactOf = (form: string): string => (form === GAP ? GAP : compactText(fold(form)));

  const locateSplit = (parts: readonly string[]): ReadonlySet<number> => {
    const involved = new Set<number>();
    if (needles.length === 0) return involved;
    parts.forEach((part, index) => {
      if (part !== GAP && hit(part)) involved.add(index);
    });
    if (compactNeedles.length === 0) return involved;
    for (const forms of formCombinations(parts)) {
      let text = '';
      const owner: number[] = [];
      forms.forEach((form, index) => {
        const compact = compactOf(form);
        text += compact;
        let k = compact.length;
        while (k-- > 0) owner.push(index);
      });
      if (text === '') continue;
      spend((compactNeedles.length + 1) * (text.length + 1));
      const mark = (start: number, end: number): void => {
        for (let k = start; k < end; k++) {
          const index = owner[k];
          if (index !== undefined && parts[index] !== GAP) involved.add(index);
        }
      };
      for (const needle of compactNeedles) {
        let at = text.indexOf(needle);
        while (at !== -1) {
          mark(at, at + needle.length);
          at = text.indexOf(needle, at + 1);
        }
      }
      if (compactWindows.size > 0 || windows.size > 0) {
        for (let i = 0; i + 12 <= text.length; i++) if (inCompactWindows(text.slice(i, i + 12))) mark(i, i + 12);
      }
    }
    return involved;
  };

  /** Every non-empty ordered selection of up to `INSERT_LIMIT` indices (all of them when there are no more). */
  const selections = (count: number): number[][] => {
    const indexes = Array.from({ length: Math.min(count, INSERT_LIMIT) }, (_, i) => i);
    const out: number[][] = [];
    const extend = (chosen: number[]): void => {
      if (chosen.length > 0) out.push(chosen);
      for (const i of indexes) if (!chosen.includes(i)) extend([...chosen, i]);
    };
    extend([]);
    return out;
  };

  const locateInserted = (insert: readonly string[], seq: readonly string[]): { insert: ReadonlySet<number>; seq: ReadonlySet<number> } => {
    const involvedInsert = new Set<number>();
    const involvedSeq = new Set<number>();
    if (compactNeedles.length === 0 || insert.length === 0) return { insert: involvedInsert, seq: involvedSeq };
    const picks = selections(insert.length).filter((pick) => pick.every((i) => insert[i] !== undefined && insert[i] !== GAP));
    for (const forms of formCombinations([...insert, ...seq])) {
      const insertForms = forms.slice(0, insert.length).map(compactOf);
      let text = '';
      const owner: number[] = [];
      const starts = new Set<number>([0]);
      forms.slice(insert.length).forEach((form, index) => {
        const compact = compactOf(form);
        starts.add(text.length);
        text += compact;
        let k = compact.length;
        while (k-- > 0) owner.push(index);
      });
      starts.add(text.length);
      const markSeq = (start: number, end: number): void => {
        for (let k = start; k < end; k++) {
          const index = owner[k];
          if (index !== undefined && seq[index] !== GAP) involvedSeq.add(index);
        }
      };
      for (const pick of picks) {
        const block = pick.map((i) => insertForms[i] ?? '').join('');
        if (block === '') continue;
        const blockOwner: number[] = [];
        for (const i of pick) for (let k = (insertForms[i] ?? '').length; k > 0; k--) blockOwner.push(i);
        /** The pieces of the block that take part: all of them for a needle, the ones a window covers for a window. */
        const markPick = (from = 0, to = block.length): void => {
          for (let k = from; k < to; k++) {
            const owner = blockOwner[k];
            if (owner !== undefined) involvedInsert.add(owner);
          }
        };
        spend((compactNeedles.length + 1) * (text.length + block.length + 1));
        for (const needle of compactNeedles) {
          let from = needle.indexOf(block);
          while (from !== -1) {
            const left = needle.slice(0, from);
            const right = needle.slice(from + block.length);
            if (left === '' && right === '') markPick();
            else {
              const rest = left + right;
              let at = text.indexOf(rest);
              while (at !== -1) {
                markPick();
                markSeq(at, at + rest.length);
                at = text.indexOf(rest, at + 1);
              }
            }
            from = needle.indexOf(block, from + 1);
          }
        }
        if (compactWindows.size > 0 || windows.size > 0) {
          // 12-character windows with at least one character of the block, at every boundary of the sequence
          const scan = (lead: string, leadStart: number, mid: string, midStart: number, trail: string, trailStart: number): void => {
            const joined = lead + mid + trail;
            for (let i = 0; i + 12 <= joined.length; i++) {
              if (!inCompactWindows(joined.slice(i, i + 12))) continue;
              for (let k = i; k < i + 12; k++) {
                if (k < lead.length) markSeq(leadStart + k, leadStart + k + 1);
                else if (k < lead.length + mid.length) markPick(midStart + k - lead.length, midStart + k - lead.length + 1);
                else markSeq(trailStart + k - lead.length - mid.length, trailStart + k - lead.length - mid.length + 1);
              }
            }
          };
          const edge = 11;
          spend(block.length + 1);
          scan('', 0, block, 0, '', 0);
          spend(starts.size * (4 * edge + 2));
          for (const pos of starts) {
            const leadStart = Math.max(0, pos - edge);
            const before = text.slice(leadStart, pos);
            const after = text.slice(pos, pos + edge);
            if (block.length <= 2 * edge) scan(before, leadStart, block, 0, after, pos);
            else {
              scan(before, leadStart, block.slice(0, edge), 0, '', pos);
              scan('', 0, block.slice(-edge), block.length - edge, after, pos);
            }
          }
        }
      }
      // Two or more separate blocks (a name before the text and a placeholder after it): each block of the pick sits at
      // its own place, with the rest of the value read as one run of the sequence. Needles only (no windows).
      for (const pick of picks) {
        if (pick.length < 2) continue;
        for (let mask = 1; mask < 2 ** (pick.length - 1); mask++) {
          const groups: number[][] = [[pick[0] ?? 0]];
          pick.slice(1).forEach((member, i) => {
            if ((mask >> i) & 1) groups.push([member]);
            else groups.at(-1)?.push(member);
          });
          const blocks = groups.map((group) => group.map((i) => insertForms[i] ?? '').join(''));
          if (blocks.some((block) => block.length < MIN_SEPARATE_BLOCK)) continue;
          for (const needle of compactNeedles) {
            const place = (j: number, from: number, positions: readonly number[]): void => {
              const block = blocks[j];
              if (block === undefined) {
                const segments: string[] = [];
                let cursor = 0;
                positions.forEach((position, k) => {
                  segments.push(needle.slice(cursor, position));
                  cursor = position + (blocks[k]?.length ?? 0);
                });
                segments.push(needle.slice(cursor));
                const rest = segments.join('');
                if (rest === '') return;
                spend(text.length + rest.length + 8);
                let at = text.indexOf(rest);
                while (at !== -1) {
                  for (const group of groups) for (const i of group) involvedInsert.add(i);
                  markSeq(at, at + rest.length);
                  at = text.indexOf(rest, at + 1);
                }
                return;
              }
              let at = needle.indexOf(block, from);
              while (at !== -1) {
                place(j + 1, at + block.length, [...positions, at]);
                at = needle.indexOf(block, at + 1);
              }
            };
            place(0, 0, []);
          }
        }
      }
    }
    return { insert: involvedInsert, seq: involvedSeq };
  };

  return {
    count: needles.length,
    hit,
    locateSplit,
    locateInserted,
    hitSplit: (parts) => locateSplit(parts).size > 0,
  };
}

/** The same matcher in the isolated world. Only trusted static source is embedded, never page strings. */
export function nativeMatcherFactorySource(): string {
  return `(() => {
    const WINDOW_BUILD_UNITS = ${String(WINDOW_BUILD_UNITS)};
    const INSERT_LIMIT = ${String(INSERT_LIMIT)};
    const MIN_SEPARATE_BLOCK = ${String(MIN_SEPARATE_BLOCK)};
    const GAP = ${JSON.stringify(GAP)};
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const nameVariant = ${nameVariant.toString()};
    const fold = ${fold.toString()};
    const compactText = ${compactText.toString()};
    const isHexPair = ${isHexPair.toString()};
    const decodePercentSequences = ${decodePercentSequences.toString()};
    const percentDecodeRounds = ${percentDecodeRounds.toString()};
    const isWordChar = ${isWordChar.toString()};
    const hasToken = ${hasToken.toString()};
    const createPrivateMatcher = ${createPrivateMatcher.toString()};
    return (entries, options) => {
      const values = new Map(); let bytes = 0;
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'boolean'
          || ${LONE_SURROGATE.toString()}.test(entry[0])) throw new Error('INVALID_UNICODE');
        for (const value of [entry[0], nameVariant(entry[0])]) {
          if (!value) continue;
          if (!values.has(value)) {
            bytes += new TextEncoder().encode(value).length;
            if (values.size >= ${String(INVENTORY_LIMITS.entries)} || bytes > ${String(INVENTORY_LIMITS.bytes)}) throw new Error('PRIVATE_INVENTORY_LIMIT');
          }
          values.set(value, entry[1] || values.get(value) === true);
        }
      }
      return createPrivateMatcher([...values], options);
    };
  })()`;
}
