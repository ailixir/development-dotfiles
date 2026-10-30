/**
 * Locator synthesis (ADR-SC-007 D4): a CLOSED, exact-only grammar of JSON steps, verified by Playwright's own
 * engine, and replayed through the public Playwright API.
 *
 * The model never writes any of this: it names a ref; the runner picks the most durable locator that the
 * pinned engine resolves to EXACTLY ONE element, the same element as the ref. Nothing outside the grammar
 * can be expressed: no raw selector, no case-insensitive or substring step. The engine-generated selector is
 * never an executable result.
 *
 * Grammar (a locator is an array of steps applied left to right from the page, i.e. `a >> b >> c`):
 *   {by:'testId', value}                         getByTestId (exact)
 *   {by:'role', role, name?, exact:true}         getByRole; `exact` is present exactly when `name` is
 *   {by:'label'|'placeholder'|'text', value, exact:true}
 *   {by:'scope', role, name, exact:true}         a named landmark/form/dialog/region/row that scopes the next steps
 *   {by:'tag', tag}                              a structural element
 *   {by:'filterHas', has:[...locator]}           the previous step, filtered to those containing the has-locator
 *   {by:'attr', tag, attrs:[{name,value}]}       whitelisted attributes on a given tag
 *   {by:'nth', index}                            last resort, last step only
 * At most 8 steps in total, counting the steps inside filterHas.
 */
import { internalsOf, type Perception, type RenderedNode } from './perceive.js';
import { candidateFactsOf, verifySelectors, type PerceptionEngine } from './playwrightEngine.js';
import type { PrivateInventory } from './privateInventory.js';

export const ATTR_WHITELIST = ['name', 'id', 'type', 'aria-label', 'title'] as const;
export const TAG_WHITELIST = ['a', 'article', 'aside', 'button', 'dialog', 'details', 'div', 'fieldset', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'img', 'input', 'label', 'li', 'main', 'nav', 'ol', 'option', 'p', 'section', 'select', 'span', 'summary', 'table', 'tbody', 'td', 'textarea', 'th', 'tr', 'ul'] as const;
export const TIERS = ['testId', 'role', 'label', 'placeholder', 'text', 'scoped', 'filterHas', 'attribute', 'nth'] as const;
export const MAX_STEPS = 8;

export type Tag = (typeof TAG_WHITELIST)[number];
export type AttrName = (typeof ATTR_WHITELIST)[number];
export type Tier = (typeof TIERS)[number];

export type LocatorStep =
  | { readonly by: 'testId'; readonly value: string }
  | { readonly by: 'role'; readonly role: string; readonly name?: string; readonly exact?: true }
  | { readonly by: 'label' | 'placeholder' | 'text'; readonly value: string; readonly exact: true }
  | { readonly by: 'scope'; readonly role: string; readonly name: string; readonly exact: true }
  | { readonly by: 'tag'; readonly tag: Tag }
  | { readonly by: 'filterHas'; readonly has: readonly LocatorStep[]; readonly relation?: 'child' }
  | { readonly by: 'attr'; readonly tag: Tag; readonly attrs: readonly { readonly name: AttrName; readonly value: string }[] }
  | { readonly by: 'nth'; readonly index: number };
export type Locator = readonly LocatorStep[];

export interface Identity {
  readonly role: string;
  readonly name: string | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Validation.

const FORBIDDEN = /data-bench|__spk07|__pw/iu;
// eslint-disable-next-line no-control-regex -- control characters are exactly what this refuses
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/u;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
const ROLE_RE = /^[a-z][a-z-]{0,40}$/u;
const KEYS: Readonly<Record<string, readonly string[]>> = {
  testId: ['by', 'value'], role: ['by', 'role', 'name', 'exact'], label: ['by', 'value', 'exact'], placeholder: ['by', 'value', 'exact'],
  text: ['by', 'value', 'exact'], scope: ['by', 'role', 'name', 'exact'], tag: ['by', 'tag'], filterHas: ['by', 'has', 'relation'], attr: ['by', 'tag', 'attrs'], nth: ['by', 'index'],
};

function reject(reason: string): never {
  throw new Error(`GRAMMAR_INVALID:${reason}`);
}

const cleanString = (value: unknown, max = 200): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && !CONTROL.test(value) && !LONE_SURROGATE.test(value) && !FORBIDDEN.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Throws `GRAMMAR_INVALID:<REASON>` on anything outside the closed grammar. The reason never echoes the value. */
export function validateLocator(value: unknown): asserts value is Locator {
  let total = 0;
  const check = (locator: unknown, depth: number): void => {
    if (!Array.isArray(locator)) return reject('NOT_ARRAY');
    if (locator.length === 0) return reject('EMPTY');
    if (depth > 1) return reject('NESTING');
    const steps = locator as unknown[];
    total += steps.length;
    if (total > MAX_STEPS) return reject('TOO_MANY_STEPS');
    steps.forEach((step, index) => {
      if (!isRecord(step) || typeof step.by !== 'string') return reject('UNKNOWN_STEP');
      // own keys only: `constructor`, `__proto__` and `toString` are not step names
      const allowed = Object.hasOwn(KEYS, step.by) ? KEYS[step.by] : undefined;
      if (!allowed) return reject('UNKNOWN_STEP');
      for (const key of Object.keys(step)) if (!allowed.includes(key)) return reject('EXTRA_KEY');
      switch (step.by) {
        case 'testId':
          if (!cleanString(step.value)) return reject('TESTID_VALUE');
          return;
        case 'role':
        case 'scope': {
          const role = step.role;
          if (typeof role !== 'string' || !ROLE_RE.test(role) || role === 'generic') return reject('ROLE');
          const named = step.name !== undefined;
          if (named && !cleanString(step.name)) return reject('ROLE_NAME');
          if (step.by === 'scope' && !named) return reject('SCOPE_NEEDS_NAME');
          if (named && step.exact !== true) return reject('EXACT_REQUIRED');
          if (!named && step.exact !== undefined) return reject('EXACT_NOT_ALLOWED');
          return;
        }
        case 'label':
        case 'placeholder':
        case 'text':
          if (!cleanString(step.value)) return reject('TEXT_VALUE');
          if (step.exact !== true) return reject('EXACT_REQUIRED');
          return;
        case 'tag':
          if (!(TAG_WHITELIST as readonly unknown[]).includes(step.tag)) return reject('TAG');
          return;
        case 'filterHas':
          if (index === 0) return reject('FILTER_FIRST');
          if (step.relation !== undefined) {
            if (step.relation !== 'child' || !Array.isArray(step.has) || step.has.length !== 1) return reject('CHILD_SHAPE');
            const child = step.has[0] as Record<string, unknown> | undefined;
            if (child?.by !== 'role' || typeof child.name !== 'string' || child.exact !== true) return reject('CHILD_SHAPE');
          }
          check(step.has, depth + 1);
          return;
        case 'attr': {
          if (!(TAG_WHITELIST as readonly unknown[]).includes(step.tag)) return reject('ATTR_TAG');
          const attrs = step.attrs;
          if (!Array.isArray(attrs) || attrs.length < 1 || attrs.length > 2) return reject('ATTR_LIST');
          for (const attr of attrs as unknown[]) {
            if (!isRecord(attr)) return reject('ATTR_NOT_WHITELISTED');
            if (!(ATTR_WHITELIST as readonly unknown[]).includes(attr.name) || !cleanString(attr.value)) return reject('ATTR_NOT_WHITELISTED');
            if (Object.keys(attr).some((key) => key !== 'name' && key !== 'value')) return reject('ATTR_KEYS');
          }
          return;
        }
        case 'nth': {
          const at = step.index;
          if (index === 0 || index !== steps.length - 1 || typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at > 500) return reject('NTH');
          return;
        }
        default:
          return reject('UNKNOWN_STEP');
      }
    });
  };
  check(value, 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// Engine selector (internal) and tiers.

const q = (value: string): string => JSON.stringify(value);

/** The Playwright internal selector of a validated locator: the strings the getBy methods, filter and nth build. */
export function toEngineSelector(locator: Locator, options: { testIdAttribute?: string } = {}): string {
  validateLocator(locator);
  const testIdAttribute = options.testIdAttribute ?? 'data-testid';
  return locator.map((step): string => {
    switch (step.by) {
      case 'testId': return `internal:testid=[${testIdAttribute}=${q(step.value)}s]`;
      case 'role':
      case 'scope': return `internal:role=${step.role}${step.name === undefined ? '' : `[name=${q(step.name)}s]`}`;
      case 'label': return `internal:label=${q(step.value)}s`;
      case 'placeholder': return `internal:attr=[placeholder=${q(step.value)}s]`;
      case 'text': return `internal:text=${q(step.value)}s`;
      case 'tag': return step.tag;
      case 'filterHas': return `internal:has=${q(step.relation === 'child' ? `css=:scope > * >> internal:and=${q(toEngineSelector(step.has, { testIdAttribute }))}` : toEngineSelector(step.has, { testIdAttribute }))}`;
      case 'attr': return `${step.tag}${step.attrs.map((attr) => `[${attr.name}=${q(attr.value)}]`).join('')}`;
      case 'nth': return `nth=${String(step.index)}`;
    }
  }).join(' >> ');
}

export function tierOf(locator: Locator): Tier {
  if (locator.some((step) => step.by === 'nth')) return 'nth';
  if (locator.some((step) => step.by === 'attr')) return 'attribute';
  if (locator.some((step) => step.by === 'filterHas')) return 'filterHas';
  if (locator.length > 1) return 'scoped';
  const only = locator[0];
  if (!only) return reject('EMPTY');
  switch (only.by) {
    case 'testId': case 'role': case 'label': case 'placeholder': case 'text': return only.by;
    case 'scope': case 'tag': case 'filterHas': case 'attr': case 'nth': return 'scoped';
  }
}
export const tierRank = (tier: Tier): number => TIERS.indexOf(tier);

/** Every string value a locator carries, in order (nested filterHas included). */
export function locatorValues(locator: Locator): string[] {
  const out: string[] = [];
  for (const step of locator) {
    switch (step.by) {
      case 'testId': case 'label': case 'placeholder': case 'text': out.push(step.value); break;
      case 'role': case 'scope': if (step.name !== undefined) out.push(step.name); break;
      case 'filterHas': out.push(...locatorValues(step.has)); break;
      case 'attr': for (const attr of step.attrs) out.push(attr.value); break;
      case 'tag': case 'nth': break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Public-API locator (replay).

export interface LocatorRoot {
  getByTestId(value: string): LocatorHandle;
  getByRole(role: string, options?: { name?: string; exact?: boolean }): LocatorHandle;
  getByLabel(value: string, options: { exact: boolean }): LocatorHandle;
  getByPlaceholder(value: string, options: { exact: boolean }): LocatorHandle;
  getByText(value: string, options: { exact: boolean }): LocatorHandle;
  locator(css: string): LocatorHandle;
}
export interface LocatorHandle extends LocatorRoot {
  filter(options: { has: LocatorHandle }): LocatorHandle;
  nth(index: number): LocatorHandle;
  and(other: LocatorHandle): LocatorHandle;
}

/** Builds the Playwright locator of a validated grammar locator with PUBLIC API methods only (no evaluate). */
export function buildPublicLocator(page: LocatorRoot, locator: Locator): LocatorHandle {
  validateLocator(locator);
  let current: LocatorRoot = page;
  let handle: LocatorHandle | undefined;
  for (const step of locator) {
    switch (step.by) {
      case 'testId': handle = current.getByTestId(step.value); break;
      case 'role':
      case 'scope': handle = step.name === undefined ? current.getByRole(step.role) : current.getByRole(step.role, { name: step.name, exact: true }); break;
      case 'label': handle = current.getByLabel(step.value, { exact: true }); break;
      case 'placeholder': handle = current.getByPlaceholder(step.value, { exact: true }); break;
      case 'text': handle = current.getByText(step.value, { exact: true }); break;
      case 'tag': handle = current.locator(step.tag); break;
      case 'attr': handle = current.locator(`${step.tag}${step.attrs.map((attr) => `[${attr.name}=${q(attr.value)}]`).join('')}`); break;
      case 'filterHas': {
        if (!handle) return reject('FILTER_FIRST');
        handle = handle.filter({ has: step.relation === 'child' ? page.locator(':scope > *').and(buildPublicLocator(page, step.has)) : buildPublicLocator(page, step.has) });
        break;
      }
      case 'nth':
        if (!handle) return reject('NTH');
        handle = handle.nth(step.index);
        break;
    }
    current = handle;
  }
  if (!handle) return reject('EMPTY');
  return handle;
}

// ---------------------------------------------------------------------------------------------------------------------
// Synthesis.

export type SynthesisFailure = 'REF_NOT_IN_OUTLINE' | 'REF_UNRESOLVED' | 'NO_VERIFIED_LOCATOR' | 'LOCATOR_GENERATED_ONLY';
export type SynthesisResult =
  | { readonly ok: true; readonly locator: Locator; readonly tier: Tier; readonly identity: Identity; readonly tried: number }
  | { readonly ok: false; readonly reason: SynthesisFailure; readonly tried: number };

const FORM_TAGS = new Set(['input', 'textarea', 'select']);
const SKIP_ROLES = new Set(['generic', 'text', 'document', 'none', 'presentation']);
const SCOPE_ROLES = new Set(['form', 'dialog', 'alertdialog', 'region', 'search', 'navigation', 'main', 'row', 'article', 'listitem', 'group', 'table', 'grid', 'tabpanel', 'menu', 'toolbar', 'banner', 'contentinfo', 'complementary', 'list']);
const isTag = (value: string): value is Tag => (TAG_WHITELIST as readonly string[]).includes(value);

interface Candidate {
  readonly locator: Locator;
  readonly selector: string;
  readonly tier: Tier;
  /** For an nth locator: the tier of the locator it was built on. */
  readonly baseTier?: Tier;
}

export async function synthesize(a: { perception: Perception; ref: string; inventory: PrivateInventory; operation?: { kind: string }; testIdAttribute?: string; maxHasPerLevel?: number }): Promise<SynthesisResult> {
  const testIdAttribute = a.testIdAttribute ?? 'data-testid';
  const maxHasPerLevel = a.maxHasPerLevel ?? 8;
  const internal = internalsOf(a.perception);
  const node = internal?.byRef.get(a.ref);
  if (!internal || !node) return { ok: false, reason: 'REF_NOT_IN_OUTLINE', tried: 0 };
  const matcher = a.inventory.matcher(internal.privateValues);
  const engine: PerceptionEngine = a.perception.engine;

  const readContext = a.operation?.kind === 'read' || a.operation?.kind === 'assert';
  const local = new Set([...(node.scopeRefs ?? []), ...(readContext ? node.readScope?.sourceRefs ?? [] : [])]);
  const candidateNodes = [...internal.byRef.values()].filter((n) => n.kind === 'node' && n.ref !== a.ref && n.rawName !== '' && !SKIP_ROLES.has(n.role) && n.rawName.length <= 60 && (n.interactive || n.role === 'heading' || local.has(n.ref ?? ''))).sort((x, y) => Number(local.has(y.ref ?? '')) - Number(local.has(x.ref ?? '')));
  const facts = await candidateFactsOf(engine, a.ref, testIdAttribute, candidateNodes.slice(0, 600).map((n) => n.ref ?? ''));
  if (!facts) return { ok: false, reason: 'REF_UNRESOLVED', tried: 0 };

  const nativeTextRoot = ['paragraph', 'strong'].includes(node.role) && (node.kind === 'text' || node.withheld && node.rawName === '');
  const role = nativeTextRoot && !readContext || SKIP_ROLES.has(node.role) ? null : node.role || null;
  const name = node.rawName;
  const own: Locator[] = [];
  const attempt = (list: Locator[], locator: unknown): void => {
    try {
      validateLocator(locator);
      list.push(locator);
    } catch {
      // outside the grammar: not offered
    }
  };
  // A node perception stubbed or cleared (a private value, or part of one, was in its name, placeholder or text) offers
  // no locator built from its own attributes: a raw attribute can carry the fragment that was withheld (AUTO-DECISION F3).
  const redacted = node.withheld || node.cleared;
  if (!redacted && facts.testId) attempt(own, [{ by: 'testId', value: facts.testId }]);
  if (role && name) attempt(own, [{ by: 'role', role, name, exact: true }]);
  if (!redacted && name && (FORM_TAGS.has(facts.tag) || facts.ariaLabel)) attempt(own, [{ by: 'label', value: name, exact: true }]);
  if (!redacted && facts.ariaLabel && facts.ariaLabel !== name) attempt(own, [{ by: 'label', value: facts.ariaLabel, exact: true }]);
  if (!redacted && facts.placeholder) attempt(own, [{ by: 'placeholder', value: facts.placeholder, exact: true }]);
  const visibleText = node.ownText || (!FORM_TAGS.has(facts.tag) ? name : '');
  if (visibleText && !FORM_TAGS.has(facts.tag) && visibleText.length <= 120) attempt(own, [{ by: 'text', value: visibleText, exact: true }]);
  const bare: Locator[] = [];
  if (role) attempt(bare, [{ by: 'role', role }]);
  const attrLocators: Locator[] = [];
  if (!redacted && isTag(facts.tag)) {
    const values: Record<AttrName, string | null> = { name: facts.name, id: facts.id, type: facts.type, 'aria-label': facts.ariaLabel, title: facts.title };
    const pairs = ATTR_WHITELIST.map((attrName) => ({ name: attrName, value: values[attrName] })).filter((pair): pair is { name: AttrName; value: string } => Boolean(pair.value));
    for (const pair of pairs) attempt(attrLocators, [{ by: 'attr', tag: facts.tag, attrs: [pair] }]);
    for (let x = 0; x < pairs.length; x++) {
      for (let y = x + 1; y < pairs.length; y++) {
        const first = pairs[x];
        const second = pairs[y];
        if (first && second) attempt(attrLocators, [{ by: 'attr', tag: facts.tag, attrs: [first, second] }]);
      }
    }
  }
  const tail = [...own, ...bare];

  const candidates: Locator[] = [...own];
  const add = (locator: unknown): void => {
    try {
      validateLocator(locator);
      candidates.push(locator);
    } catch {
      // outside the grammar
    }
  };
  // Scoped chains: nearest named landmark / form / dialog / region / row ancestors of the rendered tree.
  const scopes: LocatorStep[] = [];
  for (let p = node.parent; p >= 0 && scopes.length < 3; p = internal.tree.nodes[p]?.parent ?? -1) {
    const ancestor: RenderedNode | undefined = internal.tree.nodes[p];
    if (ancestor?.kind === 'node' && SCOPE_ROLES.has(ancestor.role) && ancestor.rawName !== '' && ancestor.rawName.length <= 80) {
      scopes.push({ by: 'scope', role: ancestor.role, name: ancestor.rawName, exact: true });
    }
  }
  for (const scope of scopes) for (const start of [...tail, ...attrLocators]) add([scope, ...start]);

  // filterHas chains: an unnamed container identified by a named descendant (e.g. the form that holds button "login").
  const prefer = (candidate: RenderedNode): number => (candidate.role === 'heading' ? 0 : candidate.role === 'button' ? 1 : candidate.role === 'link' ? 2 : 3);
  const byRef = new Map(candidateNodes.map((n) => [n.ref, n] as const));
  if (node.directTextAssertion && a.operation?.kind === 'assert' && facts.nativeContext) {
    for (const ref of facts.selfChildren ?? []) {
      const child = byRef.get(ref);
      if (child?.role === 'link' && !child.withheld && !child.cleared && child.rawName !== '') add([
        { by: 'role', role: 'paragraph' },
        { by: 'filterHas', relation: 'child', has: [{ by: 'role', role: 'link', name: child.rawName, exact: true }] },
      ]);
    }
  }
  // A titled table row read ends at the data cell, or at the one named link directly inside it (a value that shares its cell with other text).
  const linkInCell = node.kind === 'node' && node.role === 'link' && !redacted && node.rawName !== '' && facts.tag === 'a' && facts.levels[0]?.tag === 'td';
  if (readContext && node.readScope?.tableTitleRef && facts.nativeContext && (facts.tag === 'td' || linkInCell)) {
    const title = byRef.get(node.readScope.tableTitleRef);
    const label = node.readScope.sourceRefs.map(ref => byRef.get(ref)).find(source => source && source.ref !== title?.ref);
    if (title && label) add([
      { by: 'tag', tag: 'table' }, { by: 'filterHas', has: [{ by: 'role', role: title.role, name: title.rawName, exact: true }] },
      { by: 'tag', tag: 'tr' }, { by: 'filterHas', has: [{ by: 'role', role: label.role, name: label.rawName, exact: true }] }, { by: 'tag', tag: 'td' },
      ...(linkInCell ? [{ by: 'role' as const, role: 'link', name: node.rawName, exact: true as const }] : []),
    ]);
  }
  facts.levels.forEach((level, depth) => {
    if (!isTag(level.tag) || (level.tag === 'div' && depth > 3)) return;
    const has = [...level.has].sort((x, y) => Number(local.has(y)) - Number(local.has(x))).map((r) => byRef.get(r)).filter((n): n is RenderedNode => n !== undefined)
      .sort((x, y) => Number(local.has(y.ref ?? '')) - Number(local.has(x.ref ?? '')) || prefer(x) - prefer(y) || x.rawName.length - y.rawName.length).slice(0, maxHasPerLevel);
    for (const descendant of has) {
      const hasLocator: LocatorStep[] = [{ by: 'role', role: descendant.role, name: descendant.rawName, exact: true }];
      for (const start of [...tail, ...attrLocators]) {
        if ((a.operation?.kind === 'read' || a.operation?.kind === 'assert') && facts.nativeContext === true && level.children?.includes(descendant.ref ?? '')) add([{ by: 'tag', tag: level.tag }, { by: 'filterHas', relation: 'child', has: hasLocator }, ...start]);
        add([{ by: 'tag', tag: level.tag }, { by: 'filterHas', has: hasLocator }, ...start]);
      }
    }
  });
  for (const locator of attrLocators) add(locator);

  // The privacy check looks at the RAW step values, at them joined, and at the engine selector.
  const leaks = (locator: Locator, selector: string): boolean => matcher.hitSplit([...locatorValues(locator), selector]);
  const unique = new Map<string, Candidate>();
  for (const locator of candidates) {
    if (node.directTextAssertion && (locator.length !== 2 || locator[0]?.by !== 'role' || locator[0].role !== 'paragraph'
      || locator[1]?.by !== 'filterHas' || locator[1].relation !== 'child')) continue;
    if (node.readScope?.tableTitleRef && (!isTableReadChain(locator) || (locator.length === 6) !== (node.role === 'link'))) continue;
    const selector = toEngineSelector(locator, { testIdAttribute });
    if (unique.has(selector) || leaks(locator, selector)) continue;
    unique.set(selector, { locator, selector, tier: tierOf(locator) });
  }
  const generated = facts.generated !== null && !FORBIDDEN.test(facts.generated) && !matcher.hit(facts.generated) ? facts.generated : null;

  const ordered = [...unique.values()];
  const selectors = [...ordered.map((candidate) => candidate.selector), ...(generated !== null ? [generated] : [])];
  const results = await verifySelectors(engine, a.ref, selectors);
  const verified: Candidate[] = [];
  const multiple: (Candidate & { count: number; index: number })[] = [];
  ordered.forEach((candidate, i) => {
    const r = results[i];
    if (!r || 'error' in r) return;
    if (r.count === 1 && r.index === 0) verified.push(candidate);
    else if (r.index >= 0) multiple.push({ ...candidate, count: r.count, index: r.index });
  });
  // A unique final target cannot launder an ambiguous child-bearing container prefix.
  for (let i = verified.length - 1; i >= 0; i--) {
    const candidate = verified[i];
    if (!candidate) continue;
    const prefixes = childPrefixes(candidate.locator).map(prefix => toEngineSelector(prefix, { testIdAttribute }));
    if (prefixes.length && (await verifySelectors(engine, a.ref, prefixes)).some(r => 'error' in r || r.count !== 1)) verified.splice(i, 1);
  }
  const generatedResult = generated !== null ? results[ordered.length] : undefined;
  const generatedVerified = Boolean(generatedResult && !('error' in generatedResult) && generatedResult.count === 1 && generatedResult.index === 0);

  // nth is the last resort: only when nothing better verified.
  let nthTried = 0;
  if (verified.length === 0 && multiple.length > 0 && !node.directTextAssertion && !node.readScope?.tableTitleRef) {
    const sourceNames = new Set([...local].map(ref => internal.byRef.get(ref)?.rawName).filter((name): name is string => Boolean(name)));
    const scoped = multiple.filter(candidate => local.size === 0 || candidate.locator.length > 1 && locatorValues(candidate.locator.slice(0, -1)).some(value => sourceNames.has(value)));
    const bases = scoped.sort((x, y) => tierRank(x.tier) - tierRank(y.tier) || x.count - y.count || x.selector.length - y.selector.length).slice(0, 6);
    const nth: { locator: Locator; baseTier: Tier }[] = [];
    for (const base of bases) {
      const locator = [...base.locator, { by: 'nth' as const, index: base.index }];
      try {
        validateLocator(locator);
        nth.push({ locator, baseTier: base.tier });
      } catch {
        // too many steps
      }
    }
    const nthSelectors = nth.map((entry) => toEngineSelector(entry.locator, { testIdAttribute }));
    nthTried = nthSelectors.length;
    const nthResults = nthSelectors.length ? await verifySelectors(engine, a.ref, nthSelectors) : [];
    const validPrefixes = await Promise.all(nth.map(async entry => { const prefixes = childPrefixes(entry.locator).map(prefix => toEngineSelector(prefix, { testIdAttribute })); return prefixes.length === 0 || (await verifySelectors(engine, a.ref, prefixes)).every(r => !('error' in r) && r.count === 1); }));
    nth.forEach((entry, i) => {
      const r = nthResults[i];
      const selector = nthSelectors[i];
      if (validPrefixes[i] && r && !('error' in r) && r.count === 1 && r.index === 0 && selector !== undefined && !leaks(entry.locator, selector)) verified.push({ locator: entry.locator, selector, tier: 'nth', baseTier: entry.baseTier });
    });
  }
  const tried = selectors.length + nthTried;
  // Preserve the existing families/tier order. New native tails are offered only inside
  // read/assert context chains; they never insert an earlier global role tier.
  verified.sort((x, y) => tierRank(x.tier) - tierRank(y.tier) || tierRank(x.baseTier ?? x.tier) - tierRank(y.baseTier ?? y.tier) || x.locator.length - y.locator.length || x.selector.length - y.selector.length || (x.selector < y.selector ? -1 : x.selector > y.selector ? 1 : 0));
  const chosen = verified[0];
  if (!chosen) return { ok: false, reason: generatedVerified ? 'LOCATOR_GENERATED_ONLY' : 'NO_VERIFIED_LOCATOR', tried };
  const identityName = node.kind === 'node' && (!node.withheld || (node.primaryName && Array.from(node.rawName).length <= 256)) && node.rawName !== '' && !matcher.hit(node.rawName) ? node.rawName : null;
  return { ok: true, locator: chosen.locator, tier: chosen.tier, identity: { role: node.role || 'text', name: identityName }, tried };
}

/** Every child-bearing outer prefix must be unique at synthesis, resolution and pre-fence. */
export function childPrefixes(locator: Locator): Locator[] {
  return locator.flatMap((step, index) => step.by === 'filterHas' && step.relation === 'child' ? [locator.slice(0, index + 1)] : []);
}
/** The certified titled-table read chain: table[title] tr[label] td, optionally ending at one named link inside the cell. */
export function isTableReadChain(locator: Locator): boolean {
  const last = locator[5];
  return (locator.length === 5 || locator.length === 6 && last?.by === 'role' && last.role === 'link' && last.name !== undefined)
    && locator[0]?.by === 'tag' && locator[0].tag === 'table' && locator[1]?.by === 'filterHas' && locator[2]?.by === 'tag' && locator[2].tag === 'tr'
    && locator[3]?.by === 'filterHas' && locator[4]?.by === 'tag' && locator[4].tag === 'td';
}
export function assertLocatorPurpose(locator: Locator, kind: string | undefined): void {
  if (childPrefixes(locator).length && kind !== 'read' && kind !== 'assert') throw new Error('GRAMMAR_INVALID:CHILD_PURPOSE');
}
