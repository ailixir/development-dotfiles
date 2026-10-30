/* eslint-disable -- SPK-07 spike tooling: untyped .mjs harness, dynamic imports of arm modules, Node globals. */
// SPK-07 ground truth: a task's gt.chain is a hand-written Playwright page-API chain. It is applied
// with the public API (never the model), resolved to CDP backendNodeIds, and the task is VOID for that
// load unless it resolves to exactly one element. GT locators also perform setup ops and chain steps.
import { isolatedWorld, locatorIds, session } from './cdp.mjs';

const PAGE_METHODS = new Set(['getByRole', 'getByLabel', 'getByText', 'getByPlaceholder', 'getByTestId', 'getByAltText', 'getByTitle', 'locator']);
const CHAINED_METHODS = new Set([...PAGE_METHODS, 'filter', 'nth', 'first', 'last']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Arguments are JSON; a RegExp is `{"regex": "src", "flags": "i"}` (the corpus encoding, same as corpus/verify.mjs) or the
 * equivalent `{"$regex": ...}`; `{"chain": [...]}` is a nested locator (filter has/hasNot).
 */
function revive(value, page) {
  if (Array.isArray(value)) return value.map(item => revive(item, page));
  if (value !== null && typeof value === 'object') {
    if (typeof value.regex === 'string') return new RegExp(value.regex, typeof value.flags === 'string' ? value.flags : '');
    if (typeof value.$regex === 'string') return new RegExp(value.$regex, typeof value.flags === 'string' ? value.flags : '');
    if (Array.isArray(value.chain)) return applyChain(page, value.chain);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revive(item, page)]));
  }
  return value;
}

/** Applies gt.chain from `page`; only the whitelisted Playwright locator methods are callable. */
export function applyChain(page, chain) {
  if (!Array.isArray(chain) || chain.length === 0) throw new Error('GT_CHAIN_EMPTY');
  let current = page;
  chain.forEach((step, index) => {
    const method = step?.m;
    if (index === 0 ? !PAGE_METHODS.has(method) : !CHAINED_METHODS.has(method)) throw new Error(`GT_BAD_METHOD ${String(method)}`);
    const args = (Array.isArray(step.a) ? step.a : []).map(arg => revive(arg, page));
    if (typeof current[method] !== 'function') throw new Error(`GT_BAD_METHOD ${method}`);
    current = current[method](...args);
  });
  return current;
}

/**
 * Resolves a GT to backendNodeIds. Returns { void: false, ids: [one], locator } only for exactly one element;
 * otherwise { void: true, reason, count }. `gt === null` (negatives) resolves to { void: false, ids: [], locator: null }.
 * Polls up to settleMs because real pages render late; the poll never stops early on ambiguity.
 */
export async function resolveGt(page, cdp, gt, { settleMs = 4000, pollMs = 250, ids = locatorIds } = {}) {
  if (gt === null || gt === undefined) return { void: false, ids: [], locator: null, negative: true };
  let locator;
  try { locator = applyChain(page, gt.chain); } catch (error) { return { void: true, reason: `GT_CHAIN_INVALID ${error.message}`, count: 0 }; }
  const deadline = Date.now() + settleMs;
  let last = [];
  let lastError = null;
  for (;;) {
    try { last = await ids(page, cdp, locator); lastError = null; } catch (error) { lastError = error; last = []; }
    if (last.length === 1) return { void: false, ids: last, locator, count: 1 };
    if (Date.now() >= deadline) break;
    await sleep(pollMs);
  }
  if (lastError) return { void: true, reason: `GT_ERROR ${String(lastError.message).split('\n')[0]}`, count: 0 };
  return { void: true, reason: last.length === 0 ? 'GT_ABSENT' : `GT_AMBIGUOUS:${last.length}`, count: last.length };
}

// ---- click equivalence ------------------------------------------------------------------------------------------------

/** Operations whose activation reaches the GT element through a non-interactive descendant (click, press, check, uncheck). */
export const CLICK_LIKE = new Set(['click', 'press', 'check', 'uncheck']);
const INTERACTIVE = 'a[href],button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[role=menuitem],[role=tab],[role=switch],[role=option],[contenteditable]:not([contenteditable=false])';
const WALK = `function(gt) {
  const interactive = ${JSON.stringify(INTERACTIVE)};
  const up = n => n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
  for (let n = this; n; n = up(n)) {
    if (n === gt) return { equivalent: true, reason: 'DESCENDANT' };
    if (n.nodeType === 1 && n.matches(interactive)) return { equivalent: false, reason: 'INTERACTIVE_BETWEEN' };
  }
  return { equivalent: false, reason: 'NOT_DESCENDANT' };
}`;

/**
 * Is the picked element an equivalent target for a click-like step on the GT element? True when it is a descendant of the GT
 * and neither it nor any element between it and the GT is interactive (so activation reaches the GT). Ancestors never are.
 * Read-only: both nodes are resolved into a private isolated world by backendNodeId and walked there; the DOM is not touched.
 */
export async function clickEquivalent(cdp, pickedBackendNodeId, gtBackendNodeId) {
  if (pickedBackendNodeId === gtBackendNodeId) return { equivalent: false, reason: 'SAME' };
  const world = await isolatedWorld(cdp);
  const resolve = async backendNodeId => (await cdp.send('DOM.resolveNode', { backendNodeId, executionContextId: world })).object.objectId;
  const [pickedObject, gtObject] = [await resolve(pickedBackendNodeId), await resolve(gtBackendNodeId)];
  const result = await cdp.send('Runtime.callFunctionOn', { objectId: pickedObject, functionDeclaration: WALK, arguments: [{ objectId: gtObject }], returnByValue: true });
  if (result.exceptionDetails) throw new Error('EQUIVALENCE_WALK_FAILED');
  return result.result.value;
}

/** Double-quoted (straight or curly) literals of a step text, in order. */
export function literalsOf(text) {
  return [...String(text ?? '').matchAll(/["“]([^"”]+)["”]/gu)].map(match => match[1]);
}
/**
 * The typed/selected/pressed value for a step. operation.value / operation.key win; otherwise the quoted literal:
 * with one literal that one; with several, the one after a verb like type/enter/fill/press/select, else the last.
 */
export function valueFor(operation, text) {
  if (typeof operation?.value === 'string') return operation.value;
  if (typeof operation?.key === 'string') return operation.key;
  const literals = literalsOf(text);
  if (literals.length <= 1) return literals[0] ?? null;
  const verb = /\b(?:type|enter|fill(?: in)?|input|write|press|select|choose|search for)\s+["“]([^"”]+)["”]/iu.exec(String(text));
  return verb ? verb[1] : literals[literals.length - 1];
}

export async function settlePage(page, ms = 400) {
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(ms);
}

/** Performs one operation with a GT locator (never the model). read/assert do not touch the page. */
export async function performOp(page, locator, operation, text, { timeout = 8000, settleMs = 400 } = {}) {
  const kind = operation?.kind;
  const value = valueFor(operation, text);
  switch (kind) {
    case 'click': await locator.click({ timeout }); break;
    case 'fill': if (value === null) throw new Error('GT_FILL_NO_VALUE'); await locator.fill(value, { timeout }); break;
    case 'selectOption':
      if (value === null) throw new Error('GT_SELECT_NO_VALUE');
      await locator.selectOption({ label: value }, { timeout }).catch(() => locator.selectOption(value, { timeout }));
      break;
    case 'check': await locator.check({ timeout }); break;
    case 'uncheck': await locator.uncheck({ timeout }); break;
    case 'press': if (value === null) throw new Error('GT_PRESS_NO_KEY'); await locator.press(value, { timeout }); break;
    case 'read': case 'assert': return;
    default: throw new Error(`GT_UNKNOWN_OP ${String(kind)}`);
  }
  await settlePage(page, settleMs);
}

/**
 * One chain step by its GT (deviation 9). A read step keeps the GT element's text on the load; a later fill with
 * operation.valueFromStep types that text (context reuse). Everything else is performOp.
 */
export async function performChainStep(load, step, stepIndex, gt, { timeout = 8000, settleMs = 400 } = {}) {
  const operation = step.operation ?? {};
  load.readValues ??= [];
  if (operation.kind === 'read') { load.readValues[stepIndex] = (await gt.locator.innerText({ timeout })).trim(); return; }
  if (Number.isInteger(operation.valueFromStep)) {
    const value = load.readValues[operation.valueFromStep];
    if (typeof value !== 'string' || value === '') throw new Error('GT_FILL_NO_VALUE');
    return performOp(load.page, gt.locator, { ...operation, value }, step.text, { timeout, settleMs });
  }
  return performOp(load.page, gt.locator, operation, step.text, { timeout, settleMs });
}

/**
 * Setup ops (click/fill/press via GT chains) run before observing. A setup GT that is not unique VOIDs the load,
 * unless the op is marked `optional` (used for best-effort cookie banners in durability trials).
 */
export async function applySetup(page, cdp, setup, options = {}) {
  for (const entry of setup ?? []) {
    const resolved = await resolveGt(page, cdp, entry.gt, options.optional || entry.optional ? { ...options, settleMs: Math.min(options.settleMs ?? 4000, 1500) } : options);
    if (resolved.void) {
      if (entry.optional) continue;
      return { void: true, reason: `SETUP_${resolved.reason}` };
    }
    try { await performOp(page, resolved.locator, { kind: entry.op, ...(entry.value === undefined ? {} : { value: entry.value }), ...(entry.key === undefined ? {} : { key: entry.key }) }, entry.text ?? '', options); } catch (error) {
      if (entry.optional) continue;
      return { void: true, reason: `SETUP_OP_FAILED ${String(error.message).split('\n')[0]}` };
    }
  }
  return { void: false };
}

const exactOf = step => step.exact !== false;
/**
 * S3/S4 typed locator (closed grammar, an array of {by:...} steps applied left to right) -> public Playwright Locator.
 * Mirrors lib/synth.mjs toSelector(): testId, role/scope, label/placeholder/text, tag, filterHas, attr, nth.
 */
export function typedToLocator(page, steps) {
  let current = page;
  for (const step of steps) {
    switch (step.by) {
      case 'testId': current = current.getByTestId(step.value); break;
      case 'role': case 'scope': current = current.getByRole(step.role, { ...(step.name === undefined ? {} : { name: step.name }), exact: exactOf(step) }); break;
      case 'label': current = current.getByLabel(step.value, { exact: exactOf(step) }); break;
      case 'placeholder': current = current.getByPlaceholder(step.value, { exact: exactOf(step) }); break;
      case 'text': current = current.getByText(step.value, { exact: exactOf(step) }); break;
      case 'tag': current = current.locator(step.tag); break;
      case 'filterHas': current = current.filter({ has: typedToLocator(page, step.has) }); break;
      case 'attr': current = current.locator(`${step.tag}${step.attrs.map(attr => `[${attr.name}=${JSON.stringify(attr.value)}]`).join('')}`); break;
      case 'nth': current = current.nth(step.index); break;
      default: throw new Error(`LOCATOR_SHAPE typed step ${String(step.by)}`);
    }
  }
  return current;
}

/**
 * Frozen/arm locator -> public Playwright Locator (F1 proved the public API and the engine agree exactly).
 * `selector` is the Playwright internal selector string a row may carry (S3/S4 synth returns one next to the typed locator);
 * page.locator() accepts internal selectors, so it is preferred. Without one a typed array is replayed through the public API.
 */
export function locatorFromFrozen(page, locator, selector = null) {
  if (typeof selector === 'string' && selector.length > 0) return page.locator(selector);
  if (Array.isArray(locator) && locator.every(step => step && typeof step.by === 'string')) return typedToLocator(page, locator);
  if (locator === null || typeof locator !== 'object') throw new Error('LOCATOR_SHAPE');
  if (Array.isArray(locator.chain)) return applyChain(page, locator.chain);
  if (typeof locator.selector === 'string') return page.locator(locator.selector);
  switch (locator.kind) {
    case 'role': return page.getByRole(locator.role, { name: locator.name, exact: true });
    case 'label': return page.getByLabel(locator.value, { exact: true });
    case 'testId': return page.getByTestId(locator.value);
    case 'text': return page.getByText(locator.value, { exact: true });
    case 'placeholder': return page.getByPlaceholder(locator.value, { exact: true });
    default: throw new Error(`LOCATOR_SHAPE ${String(locator.kind)}`);
  }
}

/**
 * Heuristic flags on a frozen locator for the pre-registered sensitivity analysis (positional / non-exact count as
 * non-executable there). positional: nth/first/last or an `nth=` selector. nonExact: a getBy-style or hint name matched
 * without exact:true, or an internal selector with the case-insensitive `i` flag or a `text=` substring.
 */
export function locatorFlags(locator) {
  if (locator === null || typeof locator !== 'object') return { positional: false, nonExact: false };
  const text = JSON.stringify(locator);
  const positional = /"m":"(?:nth|first|last)"/u.test(text) || /"by":"nth"/u.test(text) || /nth=/u.test(text) || locator.nth !== undefined;
  let nonExact = false;
  if (Array.isArray(locator)) {
    nonExact = locator.some(step => ['role', 'scope', 'label', 'placeholder', 'text'].includes(step?.by) && step.exact === false);
  } else if (Array.isArray(locator.chain)) {
    nonExact = locator.chain.some(step => ['getByRole', 'getByLabel', 'getByText', 'getByPlaceholder', 'getByAltText', 'getByTitle'].includes(step.m)
      && !(step.a ?? []).some(arg => arg !== null && typeof arg === 'object' && arg.exact === true));
  } else if (typeof locator.selector === 'string') {
    nonExact = /"i(?=[\]\s>]|$)/u.test(locator.selector) || /(?:^|>>\s*)text=/u.test(locator.selector);
  } else if (locator.exact === false) nonExact = true;
  return { positional, nonExact };
}

/** fixture://<case>/<page> -> the loopback corpus host (own receipts namespace per load); other URLs unchanged. */
export function resolveTaskUrl(url, { fixtureHost, tag }) {
  if (!url.startsWith('fixture://')) return url;
  if (!fixtureHost) throw new Error('FIXTURE_HOST_MISSING');
  const [fixtureCase, ...page] = url.slice('fixture://'.length).split('/');
  const safeTag = String(tag).toLowerCase().replace(/[^a-z0-9-]/gu, '-').slice(0, 32);
  const resolved = `${fixtureHost.fixtureOrigin(`${fixtureCase}.${safeTag}`)}/${page.join('/')}`;
  // The backend rejects IP-literal destinations (AllowedDomains -> ORIGIN_NOT_ALLOWED): fixtures are always http://localhost:<port>.
  if (!/^http:\/\/localhost:\d+\//u.test(resolved)) throw new Error(`FIXTURE_ORIGIN_NOT_LOCALHOST ${resolved.split('/').slice(0, 3).join('/')}`);
  return resolved;
}

/**
 * One load: fresh context (default 1280x720, en-US), goto, settle, setup ops. The CDP session is renewable because
 * a GT click that navigates can invalidate it.
 */
export async function openLoad({ browser, task, fixtureHost = null, tag, viewport = { width: 1280, height: 720 }, locale = 'en-US', setup = task.setup, options = {} }) {
  const context = await browser.newContext({ viewport, locale });
  const page = await context.newPage();
  const load = { context, page, cdp: null, void: false, reason: null,
    async renewCdp() { if (this.cdp) await this.cdp.detach().catch(() => undefined); this.cdp = await session(page); return this.cdp; },
    async close() { if (this.cdp) await this.cdp.detach().catch(() => undefined); await context.close().catch(() => undefined); } };
  try {
    await page.goto(resolveTaskUrl(task.url, { fixtureHost, tag }), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('load', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await load.renewCdp();
    const result = await applySetup(page, load.cdp, setup, options);
    if (result.void) { load.void = true; load.reason = result.reason; }
  } catch (error) {
    load.void = true;
    load.reason = `LOAD_FAILED ${String(error.message).split('\n')[0]}`;
  }
  return load;
}
