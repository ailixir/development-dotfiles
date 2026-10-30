/* eslint-disable -- SPK-07 spike tooling: untyped .mjs harness, Node and browser-page globals (the DRAW and in-world functions run in a page). */
// SPK-07 S3/S4 locator synthesis: a CLOSED typed grammar (JSON objects only), mapped to Playwright internal selectors and
// verified by Playwright's own engine in our isolated world (count === 1 and the same element). The model never authors any
// of this: it names a ref; the runner picks the most durable verified locator. Screening evidence only.
//
// Grammar (a locator is an array of steps applied left to right from the page, i.e. `a >> b >> c`):
//   {by:'testId', value}                         getByTestId (exact)
//   {by:'role', role, name?, exact}              getByRole
//   {by:'label' | 'placeholder' | 'text', value, exact}
//   {by:'scope', role, name, exact}              a named landmark/form/dialog/region/row that scopes the next steps
//   {by:'tag', tag}                              a structural element (form, table, li, article, ...)
//   {by:'filterHas', has:[...locator]}           the previous step, filtered to those containing the has-locator
//   {by:'attr', tag, attrs:[{name,value}]}       whitelisted attributes (name, id, type, aria-label, title) on a given tag
//   {by:'nth', index}                            last resort
// Nothing else is expressible, and no step can carry a harness artifact (data-bench*, __spk07, ...).
import { call } from './cdp.mjs';
import { createMatcher } from './perceive.mjs';

export const ATTR_WHITELIST = Object.freeze(['name', 'id', 'type', 'aria-label', 'title']);
export const TAG_WHITELIST = Object.freeze(['a', 'article', 'aside', 'button', 'dialog', 'details', 'div', 'fieldset', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'img', 'input', 'label', 'li', 'main', 'nav', 'ol', 'option', 'p', 'section', 'select', 'span', 'summary', 'table', 'tbody', 'td', 'textarea', 'th', 'tr', 'ul']);
export const TIERS = Object.freeze(['testId', 'role', 'label', 'placeholder', 'text', 'scoped', 'filterHas', 'attribute', 'nth', 'generated']);
const FORBIDDEN = /data-bench|__spk07|__pw/iu;
const ROLE_RE = /^[a-z][a-z-]{0,40}$/u;
const KEYS = {
  testId: ['by', 'value'], role: ['by', 'role', 'name', 'exact'], label: ['by', 'value', 'exact'], placeholder: ['by', 'value', 'exact'], text: ['by', 'value', 'exact'],
  scope: ['by', 'role', 'name', 'exact'], tag: ['by', 'tag'], filterHas: ['by', 'has'], attr: ['by', 'tag', 'attrs'], nth: ['by', 'index'],
};

const cleanString = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(value) && !FORBIDDEN.test(value);

/** Throws on anything outside the closed grammar. Returns the locator for chaining. */
export function validateLocator(locator, { depth = 0 } = {}) {
  if (!Array.isArray(locator) || locator.length === 0 || locator.length > 8) throw new Error('GRAMMAR locator must be a non-empty array of at most 8 steps');
  if (depth > 1) throw new Error('GRAMMAR filterHas nesting too deep');
  locator.forEach((step, index) => {
    if (step === null || typeof step !== 'object' || Array.isArray(step) || !KEYS[step.by]) throw new Error(`GRAMMAR unknown step ${JSON.stringify(step?.by)}`);
    for (const key of Object.keys(step)) if (!KEYS[step.by].includes(key)) throw new Error(`GRAMMAR step ${step.by} cannot carry ${key}`);
    switch (step.by) {
      case 'testId': if (!cleanString(step.value)) throw new Error('GRAMMAR testId value'); break;
      case 'role': case 'scope':
        if (!ROLE_RE.test(step.role ?? '') || step.role === 'generic') throw new Error('GRAMMAR role');
        if (step.name !== undefined && !cleanString(step.name)) throw new Error('GRAMMAR role name');
        if (step.by === 'scope' && step.name === undefined) throw new Error('GRAMMAR scope needs a name');
        if (step.exact !== undefined && typeof step.exact !== 'boolean') throw new Error('GRAMMAR exact');
        break;
      case 'label': case 'placeholder': case 'text':
        if (!cleanString(step.value)) throw new Error(`GRAMMAR ${step.by} value`);
        if (step.exact !== undefined && typeof step.exact !== 'boolean') throw new Error('GRAMMAR exact');
        break;
      case 'tag': if (!TAG_WHITELIST.includes(step.tag)) throw new Error('GRAMMAR tag'); break;
      case 'filterHas':
        if (index === 0) throw new Error('GRAMMAR filterHas cannot start a locator');
        validateLocator(step.has, { depth: depth + 1 });
        break;
      case 'attr':
        if (!TAG_WHITELIST.includes(step.tag)) throw new Error('GRAMMAR attr tag');
        if (!Array.isArray(step.attrs) || step.attrs.length < 1 || step.attrs.length > 2) throw new Error('GRAMMAR attr attrs');
        for (const attr of step.attrs) {
          if (!ATTR_WHITELIST.includes(attr?.name) || !cleanString(attr.value)) throw new Error('GRAMMAR attr not whitelisted');
          if (Object.keys(attr).some(key => key !== 'name' && key !== 'value')) throw new Error('GRAMMAR attr keys');
        }
        break;
      case 'nth':
        if (index === 0 || index !== locator.length - 1 || !Number.isInteger(step.index) || step.index < 0 || step.index > 500) throw new Error('GRAMMAR nth');
        break;
      default: throw new Error('GRAMMAR');
    }
  });
  return locator;
}

const q = value => JSON.stringify(value);
const exactFlag = step => (step.exact === false ? 'i' : 's');

/** Maps one validated locator to a Playwright internal selector string (the same strings the getBy methods, filter and nth build). */
export function toSelector(locator, { testIdAttribute = 'data-testid' } = {}) {
  validateLocator(locator);
  return locator.map(step => {
    switch (step.by) {
      case 'testId': return `internal:testid=[${testIdAttribute}=${q(step.value)}s]`;
      case 'role': case 'scope': return `internal:role=${step.role}${step.name === undefined ? '' : `[name=${q(step.name)}${exactFlag(step)}]`}`;
      case 'label': return `internal:label=${q(step.value)}${exactFlag(step)}`;
      case 'placeholder': return `internal:attr=[placeholder=${q(step.value)}${exactFlag(step)}]`;
      case 'text': return `internal:text=${q(step.value)}${exactFlag(step)}`;
      case 'tag': return step.tag;
      case 'filterHas': return `internal:has=${q(toSelector(step.has, { testIdAttribute }))}`;
      case 'attr': return `${step.tag}${step.attrs.map(attr => `[${attr.name}=${q(attr.value)}]`).join('')}`;
      case 'nth': return `nth=${step.index}`;
      default: throw new Error('GRAMMAR');
    }
  }).join(' >> ');
}

export function tierOf(locator) {
  if (locator.some(step => step.by === 'nth')) return 'nth';
  if (locator.some(step => step.by === 'attr')) return 'attribute';
  if (locator.some(step => step.by === 'filterHas')) return 'filterHas';
  if (locator.length > 1) return 'scoped';
  return locator[0].by;
}
export const tierRank = tier => TIERS.indexOf(tier);

// ---------------------------------------------------------------------------------------------------------------------
const FACTS = `function(ref, testIdAttr, candidateRefs) {
  const resolve = r => this.querySelector(this.parseSelector('aria-ref=' + r), document, false);
  const el = resolve(ref);
  if (!el) return null;
  const attr = n => { const v = el.getAttribute(n); return v === null ? null : v; };
  const ancestors = [];
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement && ancestors.length < 6; p = p.parentElement) ancestors.push(p);
  const cands = candidateRefs.map(r => ({ r, e: resolve(r) })).filter(x => x.e && x.e !== el);
  const levels = ancestors.map(p => ({ tag: p.tagName.toLowerCase(), has: cands.filter(c => p.contains(c.e) && !el.contains(c.e) && !c.e.contains(el)).slice(0, 60).map(c => c.r) }));
  let generated = null;
  try { generated = this.generateSelectorSimple(el); } catch (e) { generated = null; }
  return { tag: el.tagName.toLowerCase(), id: attr('id'), name: attr('name'), type: attr('type'), ariaLabel: attr('aria-label'), title: attr('title'), placeholder: attr('placeholder'), testId: attr(testIdAttr), levels, generated };
}`;

const VERIFY = `function(ref, selectors) {
  const el = this.querySelector(this.parseSelector('aria-ref=' + ref), document, false);
  return selectors.map(s => {
    try { const all = this.querySelectorAll(this.parseSelector(s), document); return { count: all.length, index: Array.prototype.indexOf.call(all, el) }; }
    catch (e) { return { error: String(e && e.message || e).slice(0, 120) }; }
  });
}`;

const FORM_TAGS = new Set(['input', 'textarea', 'select']);
const SKIP_ROLES = new Set(['generic', 'text', 'document', 'none', 'presentation']);
const SCOPE_ROLES = new Set(['form', 'dialog', 'alertdialog', 'region', 'search', 'navigation', 'main', 'row', 'article', 'listitem', 'group', 'table', 'grid', 'tabpanel', 'menu', 'toolbar', 'banner', 'contentinfo', 'complementary', 'list']);

/**
 * Synthesize the most durable verified locator for a ref of the SAME perception.
 * @param {{ handle:{cdp:object, engine:string}, perceived:object, ref:string, privateValues?:string[], testIdAttribute?:string, maxHasPerLevel?:number }} args
 */
export async function synthesize({ handle, perceived, ref, privateValues = [], testIdAttribute = 'data-testid', maxHasPerLevel = 8 }) {
  const started = Date.now();
  const node = perceived.byRef.get(ref);
  if (!node) return { locator: null, selector: null, tier: null, alternatives: [], reason: 'REF_NOT_IN_OUTLINE', tried: 0, ms: 0 };
  // privateValues: plain strings and/or [value, strict] inventory entries (perceived.inventory); matched like the outline scrub.
  const matcher = createMatcher(privateValues.map(value => (Array.isArray(value) ? value : [value, true])));
  const { cdp, engine } = handle;

  // Candidate descendants for filterHas: named, role-bearing nodes of the same perception.
  const candidateNodes = [...perceived.byRef.values()].filter(n => n.kind === 'node' && n.ref !== ref && n.rawName && !SKIP_ROLES.has(n.role) && n.rawName.length <= 60 && (n.interactive || n.role === 'heading'));
  const facts = await call(cdp, engine, FACTS, [ref, testIdAttribute, candidateNodes.slice(0, 600).map(n => n.ref)]);
  if (!facts) return { locator: null, selector: null, tier: null, alternatives: [], reason: 'REF_UNRESOLVED', tried: 0, ms: Date.now() - started };

  const role = SKIP_ROLES.has(node.role) ? null : node.role;
  const name = node.rawName || '';
  const own = []; // locators that start at the target itself
  const push = (list, locator) => { try { validateLocator(locator); list.push(locator); } catch { /* outside the grammar: not offered */ } };
  if (facts.testId) push(own, [{ by: 'testId', value: facts.testId }]);
  if (role && name) push(own, [{ by: 'role', role, name, exact: true }]);
  if (name && (FORM_TAGS.has(facts.tag) || facts.ariaLabel)) push(own, [{ by: 'label', value: name, exact: true }]);
  if (facts.ariaLabel && facts.ariaLabel !== name) push(own, [{ by: 'label', value: facts.ariaLabel, exact: true }]);
  if (facts.placeholder) push(own, [{ by: 'placeholder', value: facts.placeholder, exact: true }]);
  const visibleText = node.ownText || (!FORM_TAGS.has(facts.tag) ? name : '');
  if (visibleText && !FORM_TAGS.has(facts.tag) && visibleText.length <= 120) push(own, [{ by: 'text', value: visibleText, exact: true }]);
  const bare = []; // weaker starts used only inside a scope / filterHas chain
  if (role) push(bare, [{ by: 'role', role }]);
  const attrLocators = [];
  const tag = TAG_WHITELIST.includes(facts.tag) ? facts.tag : null;
  if (tag) {
    const pairs = ATTR_WHITELIST.map(attrName => ({ name: attrName, value: { name: facts.name, id: facts.id, type: facts.type, 'aria-label': facts.ariaLabel, title: facts.title }[attrName] })).filter(pair => pair.value);
    for (const pair of pairs) push(attrLocators, [{ by: 'attr', tag, attrs: [pair] }]);
    for (let a = 0; a < pairs.length; a++) for (let b = a + 1; b < pairs.length; b++) push(attrLocators, [{ by: 'attr', tag, attrs: [pairs[a], pairs[b]] }]);
  }
  const tail = [...own, ...bare];

  const candidates = [];
  const add = (locator, via) => { try { validateLocator(locator); } catch { return; } candidates.push({ locator, via }); };
  for (const locator of own) add(locator, 'own');

  // Scoped chains: nearest named landmark / form / dialog / region / row ancestors of the rendered tree.
  const scopes = [];
  for (let p = node.parent; p >= 0 && scopes.length < 3; p = perceived.nodes[p].parent) {
    const ancestor = perceived.nodes[p];
    if (ancestor.kind === 'node' && SCOPE_ROLES.has(ancestor.role) && ancestor.rawName && ancestor.rawName.length <= 80) scopes.push({ by: 'scope', role: ancestor.role, name: ancestor.rawName, exact: true });
  }
  for (const scope of scopes) for (const start of [...tail, ...attrLocators]) add([scope, ...start], 'scope');

  // filterHas chains: an unnamed container identified by a named descendant (e.g. the form that holds button "login").
  const prefer = candidate => (candidate.role === 'heading' ? 0 : candidate.role === 'button' ? 1 : candidate.role === 'link' ? 2 : 3);
  const byRef = new Map(candidateNodes.map(n => [n.ref, n]));
  facts.levels.forEach((level, depth) => {
    if (!TAG_WHITELIST.includes(level.tag) || (level.tag === 'div' && depth > 3)) return;
    const has = level.has.map(r => byRef.get(r)).filter(Boolean).sort((a, b) => prefer(a) - prefer(b) || a.rawName.length - b.rawName.length).slice(0, maxHasPerLevel);
    for (const descendant of has) {
      const hasLocator = [{ by: 'role', role: descendant.role, name: descendant.rawName, exact: true }];
      for (const start of [...tail, ...attrLocators]) add([{ by: 'tag', tag: level.tag }, { by: 'filterHas', has: hasLocator }, ...start], 'filterHas');
    }
  });
  for (const locator of attrLocators) add(locator, 'attr');

  const unique = new Map();
  for (const candidate of candidates) {
    const selector = toSelector(candidate.locator, { testIdAttribute });
    if (matcher.hit(selector) || unique.has(selector)) continue;
    unique.set(selector, { ...candidate, selector });
  }
  let generated = null;
  if (facts.generated && !FORBIDDEN.test(facts.generated) && !matcher.hit(facts.generated)) generated = { locator: null, selector: facts.generated, tier: 'generated', via: 'engine' };

  const selectors = [...unique.keys(), ...(generated ? [generated.selector] : [])];
  const results = await call(cdp, engine, VERIFY, [ref, selectors]);
  const verified = []; const multiple = [];
  [...unique.values()].forEach((candidate, i) => {
    const r = results[i];
    const entry = { locator: candidate.locator, selector: candidate.selector, tier: tierOf(candidate.locator), via: candidate.via };
    if (r.error) return;
    if (r.count === 1 && r.index === 0) verified.push(entry);
    else if (r.index >= 0) multiple.push({ ...entry, count: r.count, index: r.index });
  });
  const generatedResult = generated ? results[unique.size] : null;
  const generatedVerified = Boolean(generatedResult && !generatedResult.error && generatedResult.count === 1 && generatedResult.index === 0);

  // nth is the last resort: only when nothing better verified.
  let nthTried = 0;
  if (verified.length === 0 && multiple.length > 0) {
    const bases = [...multiple].sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.count - b.count || a.selector.length - b.selector.length).slice(0, 6);
    const nth = bases.map(base => ({ locator: [...base.locator, { by: 'nth', index: base.index }], via: 'nth' })).filter(candidate => { try { validateLocator(candidate.locator); return true; } catch { return false; } });
    const nthSelectors = nth.map(candidate => toSelector(candidate.locator, { testIdAttribute })).map(s => s);
    nthTried = nthSelectors.length;
    const nthResults = nthSelectors.length ? await call(cdp, engine, VERIFY, [ref, nthSelectors]) : [];
    nth.forEach((candidate, i) => {
      const r = nthResults[i];
      if (r && !r.error && r.count === 1 && r.index === 0 && !matcher.hit(nthSelectors[i])) verified.push({ locator: candidate.locator, selector: nthSelectors[i], tier: 'nth', via: 'nth' });
    });
  }

  verified.sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.locator.length - b.locator.length || a.selector.length - b.selector.length || (a.selector < b.selector ? -1 : 1));
  let chosen = verified[0] ?? null;
  const alternatives = verified.slice(1);
  if (!chosen && generatedVerified) chosen = { locator: null, selector: generated.selector, tier: 'generated', via: 'engine' };
  else if (generatedVerified) alternatives.push({ locator: null, selector: generated.selector, tier: 'generated', via: 'engine' });
  return {
    locator: chosen?.locator ?? null, selector: chosen?.selector ?? null, tier: chosen?.tier ?? null, alternatives,
    generated: generated ? { selector: generated.selector, verified: generatedVerified } : null,
    tried: selectors.length + nthTried, verified: verified.length + (generatedVerified ? 1 : 0), ms: Date.now() - started,
    reason: chosen ? null : 'NO_VERIFIED_LOCATOR',
  };
}

/** Re-resolve a frozen typed locator on the current page state (used by durability and tests). Returns {count, index}. */
export async function resolveLocator({ handle, ref, locator, testIdAttribute = 'data-testid' }) {
  const selector = toSelector(locator, { testIdAttribute });
  const [result] = await call(handle.cdp, handle.engine, VERIFY, [ref, [selector]]);
  return { selector, ...result };
}
