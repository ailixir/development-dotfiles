/**
 * Option choice for selectOption (plan D-3; critique 1 item B5, critique 2 items R4 and C-b).
 *
 * Playwright's selectOption is EXACT on value or label, while G1 (WI-2 checkOptionPresent) matches after NFKC, whitespace
 * collapse and lower-casing. The executor therefore reads the live options and picks the option itself, with the SAME
 * predicate as G1 so that the two can never disagree, and dispatches it by index.
 *
 * The options are read WITHOUT evaluate and without the plural main-world reads (evaluateAll, allInnerTexts,
 * allTextContents run in the page's main world, where a page script can steer them; probe p11b). Only per-option
 * utility-world reads are used: textContent(), getAttribute(), and the :disabled pseudo-class through and().
 */
import { clampMs, type ActionBudget } from './actionBudget.js';
import { ClosedActionError } from './closedError.js';
import { checkOptionPresent } from './playwrightEngine.js';
import type { ActionLocator, PageLike } from './targetAction.js';

/** Over this many options the executor does not list: only an exact value or label passes (plan D-3). */
export const OPTION_CAP = 500;
const BATCH = 50;
const clean = (text: string | null | undefined): string => (text ?? '').replace(/\s+/gu, ' ').trim();

export interface OptionListing { readonly labels: readonly string[]; readonly values: readonly string[] }
export type ListedOptions = { readonly tooMany: false; readonly listing: OptionListing } | { readonly tooMany: true };

export type OptionChoice =
  | { readonly kind: 'index'; readonly index: number }
  | { readonly kind: 'absent' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'passThrough' };

/** Bounds a promise by a timer; a late result is ignored. Rejects with a TimeoutError-named error. */
export function timed<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })); }, clampMs(ms));
    work.then(
      value => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error('failed')); },
    );
  });
}

async function perOption<T>(options: ActionLocator, count: number, read: (option: ActionLocator) => Promise<T>): Promise<T[]> {
  const out = new Array<T>(count);
  for (let from = 0; from < count; from += BATCH) {
    await Promise.all(Array.from({ length: Math.min(BATCH, count - from) }, (_, offset) => read(options.nth(from + offset)).then(value => { out[from + offset] = value; })));
  }
  return out;
}

/** Labels and values of a native select, as WI-2 listOptions sees them (clean(option.label), option.value); null when it has no options. */
export async function listNativeOptions(select: ActionLocator, budget: ActionBudget): Promise<ListedOptions | null> {
  const options = select.locator('option');
  const count = await timed(options.count(), budget.take(1_000));
  if (count === 0) return null;
  if (count > OPTION_CAP) return { tooMany: true };
  const hasLabel = (await timed(select.locator('option[label]').count(), budget.take(1_000))) > 0;
  const hasValue = (await timed(select.locator('option[value]').count(), budget.take(1_000))) > 0;
  const texts = (await perOption(options, count, option => option.textContent({ timeout: budget.take(1_000) }))).map(clean);
  const labelAttrs = hasLabel ? await perOption(options, count, option => option.getAttribute('label', { timeout: budget.take(1_000) })) : null;
  const valueAttrs = hasValue ? await perOption(options, count, option => option.getAttribute('value', { timeout: budget.take(1_000) })) : null;
  return {
    tooMany: false,
    listing: {
      labels: texts.map((text, i) => clean(labelAttrs?.[i] ?? text)),
      // option.value without a value attribute is the text with whitespace collapsed (Chrome); an explicit empty value attribute stays empty.
      values: texts.map((text, i) => valueAttrs?.[i] ?? text),
    },
  };
}

/**
 * The option a literal selects: an option whose label or value equals the literal exactly wins (the first); otherwise exactly one
 * option matching after G1's normalisation wins; none is absent, several are ambiguous.
 */
export function chooseOption(literal: string, listing: OptionListing): OptionChoice {
  const exact = listing.labels.findIndex((label, i) => label === literal || listing.values[i] === literal);
  if (exact !== -1) return { kind: 'index', index: exact };
  const normalised: number[] = [];
  listing.labels.forEach((label, i) => {
    if (checkOptionPresent(literal, [label, listing.values[i] ?? '']).kind === 'pass') normalised.push(i);
  });
  const only = normalised[0];
  if (normalised.length === 1 && only !== undefined) return { kind: 'index', index: only };
  return normalised.length === 0 ? { kind: 'absent' } : { kind: 'ambiguous' };
}

/** option:disabled, including an option inside a disabled optgroup (getAttribute('disabled') alone misses that). */
export async function isOptionDisabled(select: ActionLocator, page: PageLike, index: number, budget: ActionBudget): Promise<boolean> {
  return (await timed(select.locator('option').nth(index).and(page.locator(':disabled')).count(), budget.take(1_000))) === 1;
}

const cssQuote = (value: string): string => `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;

/** Oversize lists: is the literal an exact value, an exact label attribute, or the exact text of an option without a label attribute? */
export async function literalIsExactInOversizeList(select: ActionLocator, page: PageLike, literal: string, budget: ActionBudget): Promise<boolean> {
  const options = select.locator('option');
  const hits = (await timed(options.and(page.locator(`[value=${cssQuote(literal)}]`)).count(), budget.take(1_000)))
    + (await timed(options.and(page.locator(`[label=${cssQuote(literal)}]`)).count(), budget.take(1_000)))
    + (await timed(options.and(page.locator(':not([label])')).getByText(literal, { exact: true }).count(), budget.take(1_000)));
  return hits >= 1;
}

export type SelectArgument = { readonly index: number } | string;

/**
 * Decides what selectOption receives, before the fence. Throws ClosedActionError(TARGET_CHANGED) when the literal is absent,
 * ambiguous or disabled, or not an exact value or label in an oversize list. A list that cannot be read passes the literal as given.
 */
export async function chooseForSelect(page: PageLike, select: ActionLocator, literal: string, budget: ActionBudget): Promise<SelectArgument> {
  const listed = await listNativeOptions(select, budget);
  if (listed === null) return literal;
  if (listed.tooMany) {
    if (await literalIsExactInOversizeList(select, page, literal, budget)) return literal;
    throw new ClosedActionError('TARGET_CHANGED');
  }
  const choice = chooseOption(literal, listed.listing);
  if (choice.kind !== 'index') throw new ClosedActionError('TARGET_CHANGED');
  if (await isOptionDisabled(select, page, choice.index, budget)) throw new ClosedActionError('TARGET_CHANGED');
  return { index: choice.index };
}
