/* eslint-disable -- SPK-07 spike tooling: untyped .mjs harness, Node and browser-page globals (the DRAW and in-world functions run in a page). */
// SPK-07 S3/S4 perception: Playwright's own AI snapshot (ariaSnapshotJSON mode 'ai' with boxes) taken inside a CDP isolated
// world we own, SANITIZED, then rendered as a compact outline. Screening evidence only.
//
// Safety contract (hard requirements, tested in test/evaluation/grounding-b-sanitizer.test.ts):
//  - Playwright's raw snapshot leaks typed values (text boxes, passwords). Every control value is stripped structurally
//    (role, element facts read in the isolated world) and again by an echo scrub for controls the snapshot cannot attribute.
//  - A password control becomes a valueless `passwordControl` line with no ref: it is never a fill target by ref.
//  - [data-sensitive] subtrees are withheld; supplied private values (NFKC, case-insensitive, substring) withhold the node's TEXT. A node that
//    carries a ref (cell, generic, link, ...) is not dropped: it stays as a `role [ref] {value withheld}` line with no name, placeholder,
//    url or text, so it remains targetable while its value is hidden. A url-only hit drops just the url.
//  - The page is never marked and never mutated: all reads happen in an isolated world; identity is the CDP backendNodeId.
import { randomUUID } from 'node:crypto';
import { evaluateHandle, call, isolatedWorld, session } from './cdp.mjs';
import { engineExpression } from './pwEngine.mjs';
import { LIFTED_LIMITS, LIFTED_WORK_LIMITS, openCollector } from './collectorInstrumented.mjs';
import { baseConfig } from './arms/A1.mjs';

export const MAX_LINE_CHARS = 160;
export const OUTLINE_BYTES = 40000;
export const OPTION_CAP = 60; // options kept per combobox / listbox by the focus projection

// ---------------------------------------------------------------------------------------------------------------------
// Text helpers shared with the pre-registered intent gate (INTERFACES.md): norm / words.
const PUNCT = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;
/** NFKC, lowercase, collapsed whitespace, leading/trailing punctuation and symbols stripped; a string with no letter or digit keeps its symbols (QA-D7). */
export const norm = value => {
  const folded = String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
  const stripped = folded.replace(PUNCT, '');
  return stripped === '' ? folded : stripped;
};
export const words = value => norm(value).split(/[^\p{L}\p{N}]+/u).filter(word => Array.from(word).length >= 2);

/** Words ignored by the step-focused projection (function words only; exported so the pre-registration can record them). */
export const FOCUS_STOPWORDS = Object.freeze(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'then', 'are', 'was', 'its', 'has', 'have', 'not', 'but', 'you', 'your', 'type', 'enter', 'click', 'press', 'field', 'button', 'input', 'text', 'box', 'in', 'of', 'on', 'to', 'at', 'by', 'is', 'it', 'as', 'or', 'an', 'if', 'be', 'do', 'up', 'no', 'all', 'any', 'can', 'out', 'one']);
const STOP = new Set(FOCUS_STOPWORDS);

export function bound(value, limit = MAX_LINE_CHARS) {
  const chars = Array.from(String(value ?? '').replace(/\s+/gu, ' ').trim());
  return chars.length <= limit ? chars.join('') : `${chars.slice(0, limit - 1).join('')}…`;
}
const quote = value => JSON.stringify(bound(value));

/**
 * The private-value matcher: entries are [value, strict] pairs (the production inventory shape). Matching is NFKC and case-insensitive
 * (stricter than production, which is case-sensitive), also on the production name transformation (zero-width and soft hyphen removed,
 * whitespace collapsed). A strict value of 3 or more characters matches as a substring; a non-strict value (a safe implicit `on`) and a
 * value of 1-2 characters match as a whole token only (otherwise a stray "t" would withhold the page). A strict value of 12 or more
 * characters also matches on any shared 12-character window, so a truncated or edited echo is caught.
 * Self-contained: the function source is also injected into the page (lib/visual.mjs), so it may reference nothing outside itself.
 */
export function createMatcher(entries) {
  const fold = text => String(text).normalize('NFKC').toLowerCase();
  const nameVariant = text => text.replace(/[\u200b\u00ad]/gu, '').replace(/\s+/gu, ' ').trim();
  const isWord = ch => /[\p{L}\p{M}\p{N}_]/u.test(ch);
  const needles = []; const seen = new Set(); const windows = new Set();
  for (const entry of entries) {
    const value = Array.isArray(entry) ? entry[0] : entry;
    const strict = Array.isArray(entry) ? entry[1] === true : true;
    if (typeof value !== 'string') continue;
    const folded = fold(value);
    for (const variant of [folded, nameVariant(folded)]) {
      if (variant.trim() === '') continue;
      const mode = strict && Array.from(variant).length > 2 ? 'sub' : 'token';
      const key = `${mode}|${variant}`;
      if (seen.has(key)) continue;
      seen.add(key);
      needles.push({ v: variant, mode });
      if (mode === 'sub' && variant.length >= 12 && variant.length <= 4096) {
        const stride = variant.length > 256 ? 6 : 1;
        for (let i = 0; i + 12 <= variant.length; i += stride) windows.add(variant.slice(i, i + 12));
        windows.add(variant.slice(-12));
      }
    }
  }
  const hasToken = (text, v) => {
    let at = text.indexOf(v);
    while (at !== -1) {
      const before = Array.from(text.slice(0, at)).at(-1) ?? '';
      const next = text.codePointAt(at + v.length);
      const after = next === undefined ? '' : String.fromCodePoint(next);
      if (!isWord(before) && !isWord(after)) return true;
      at = text.indexOf(v, at + 1);
    }
    return false;
  };
  return {
    count: needles.length,
    hit(text) {
      if (needles.length === 0 || typeof text !== 'string' || text === '') return false;
      const a = fold(text); const b = nameVariant(a);
      for (const n of needles) if (n.mode === 'sub' ? (a.includes(n.v) || b.includes(n.v)) : (hasToken(a, n.v) || hasToken(b, n.v))) return true;
      if (windows.size > 0) for (const t of a === b ? [a] : [a, b]) for (let i = 0; i + 12 <= t.length; i++) if (windows.has(t.slice(i, i + 12))) return true;
      return false;
    },
  };
}

/** Matcher over plain supplied private values (all strict). */
export const privateMatcher = (privateValues = []) => createMatcher(privateValues.filter(value => typeof value === 'string' && value.length > 0).map(value => [value, true]));

/**
 * Current values of every control that can hold typed or chosen data, read in the page itself (open shadow roots included):
 * text-like inputs (password too), textareas, selected option text, contenteditable and [data-sensitive] text, aria-valuetext.
 * Self-contained (its source is injected into isolated worlds). Returns [value, strict] pairs.
 */
export function lightInventory() {
  const out = [];
  const add = (value, strict = true) => { const text = String(value ?? ''); if (text.trim() !== '' && text.length <= 4096 && out.length < 4096) out.push([text, strict]); };
  const BUTTONISH = ['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file', 'hidden'];
  const texts = element => { const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let node; while ((node = walker.nextNode())) add(node.data); add(element.textContent); };
  const walk = root => {
    for (const el of root.querySelectorAll('*')) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') { const type = String(el.type || 'text').toLowerCase(); if (!BUTTONISH.includes(type)) add(el.value); }
      else if (tag === 'textarea') add(el.value);
      else if (tag === 'select') for (const option of el.selectedOptions) add(option.textContent);
      if (el.isContentEditable && !(el.parentElement && el.parentElement.isContentEditable)) texts(el);
      if (el.hasAttribute('data-sensitive')) texts(el);
      if (el.hasAttribute('aria-valuetext')) add(el.getAttribute('aria-valuetext'));
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return out;
}

/**
 * The private inventory of the live page, derived like production: the production collector is installed in its own isolated world,
 * collect() then privateInventory() give [value, strict] pairs (control values incl. password, contenteditable, select, [data-sensitive]
 * text). The page-side lightInventory() is always unioned in, so a production collector failure (limits, context lost) never opens a
 * hole. Returns { inventory, production: 'ok' | 'failed', error }.
 */
export async function privateInventoryFor(page, cdp) {
  const client = cdp ?? await session(page);
  const world = await isolatedWorld(client);
  const light = await evaluateHandle(client, world, `(${lightInventory.toString()})()`).then(async objectId => call(client, objectId, 'function() { return this; }'));
  let production = []; let status = 'ok'; let error = null;
  try {
    const base = await baseConfig();
    const facade = await openCollector({ cdp: client, options: { ...base, limits: { ...LIFTED_LIMITS }, workLimits: { ...LIFTED_WORK_LIMITS } } });
    try {
      await facade.collect({ documentId: randomUUID(), generation: 1 });
      production = await call(client, facade.handle, 'function() { return this.privateInventory(); }');
    } finally { await facade.dispose(); }
  } catch (caught) { status = 'failed'; error = String(caught?.message ?? caught).split('\n')[0]; }
  const merged = new Map();
  for (const [value, strict] of [...production, ...light]) merged.set(value, strict === true || merged.get(value) === true);
  return { inventory: [...merged], production: status, error };
}

/**
 * Remove every item that echoes a private value. `items` are any objects; `fields(item)` lists the strings that can carry page text
 * (default: name, rawName, text, placeholder, url, value). `inventory` is [value, strict] pairs (from privateInventoryFor) and/or plain
 * strings. Returns { kept, withheld }. Used by S3/S4 on the sanitized tree and by workstream A for S2's extra nodes.
 */
export function scrubEchoes(items, inventory, { fields = item => [item.name, item.rawName, item.text, item.placeholder, item.url, item.value] } = {}) {
  const matcher = createMatcher(inventory);
  const kept = []; const withheld = [];
  for (const item of items) (fields(item).some(text => typeof text === 'string' && matcher.hit(text)) ? withheld : kept).push(item);
  return { kept, withheld };
}

/** Link URLs: drop credentials and fragments, hide long opaque query values, bound the length. */
export function safeUrl(raw) {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (/^data:/iu.test(value)) return 'data:…';
  if (/^javascript:/iu.test(value)) return 'javascript:';
  const withoutHash = value.split('#')[0];
  const [path, query] = [withoutHash.split('?')[0], withoutHash.includes('?') ? withoutHash.slice(withoutHash.indexOf('?') + 1) : ''];
  const cleanPath = path.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/iu, '$1');
  const cleanQuery = query ? query.split('&').map(pair => { const i = pair.indexOf('='); if (i < 0) return pair; const v = pair.slice(i + 1); return v.length >= 20 ? `${pair.slice(0, i)}=…` : pair; }).join('&') : '';
  return bound(cleanQuery ? `${cleanPath}?${cleanQuery}` : cleanPath, 120);
}

// ---------------------------------------------------------------------------------------------------------------------
// Role tables.
export const INTERACTIVE_ROLES = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'listbox', 'treeitem', 'scrollbar']);
const VALUE_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider', 'scrollbar', 'meter', 'progressbar']);
export const LANDMARK_ROLES = new Set(['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'region', 'form', 'search', 'dialog', 'alertdialog']);
export const FORM_CONTROL_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'listbox', 'button']);
const TRANSPARENT_ROLES = new Set(['generic', 'paragraph', 'rowgroup', 'strong', 'emphasis', 'subscript', 'superscript', 'code', 'insertion', 'deletion', 'mark', 'time', 'group', 'list', 'none', 'presentation', 'blockquote']);
const LABEL_ROLES = new Set(['cell', 'gridcell', 'columnheader', 'rowheader', 'heading', 'term', 'caption', 'legend']);
const GROUP_ROLES = new Set(['form', 'row', 'cell', 'gridcell', 'dialog', 'alertdialog', 'region', 'search', 'article', 'listitem', 'group', 'navigation', 'main', 'table', 'grid', 'tabpanel', 'menu', 'toolbar']);
const HINT_ROLES = new Set(['form', 'dialog', 'alertdialog', 'region', 'search', 'navigation', 'main', 'row', 'table', 'grid', 'article', 'list', 'listitem', 'tabpanel', 'menu', 'toolbar', 'group', 'banner', 'contentinfo', 'complementary']);
const NAME_OMIT_ROLES = new Set(['row']); // a row's name is its cells' text concatenated: the cell lines already carry it

// ---------------------------------------------------------------------------------------------------------------------
// In-world collector. Runs inside the isolated world, bound to Playwright's InjectedScript (`this`). Page-invisible.
const COLLECT = `function() {
  const norm = s => String(s == null ? '' : s).replace(/\\s+/g, ' ').trim();
  const snap = this.ariaSnapshotJSON(document.documentElement, { mode: 'ai', boxes: true });
  const refs = [];
  const walk = n => { if (typeof n === 'string') return; if (n.ref) refs.push(n.ref); if (n.children) n.children.forEach(walk); };
  snap.json.forEach(walk);
  const BUTTONISH = ['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file', 'hidden'];
  const facts = {}; const refEls = new Set();
  for (const ref of refs) {
    const el = this.querySelector(this.parseSelector('aria-ref=' + ref), document, false);
    if (!el) continue;
    refEls.add(el);
    const tag = el.tagName.toLowerCase();
    const f = { tag };
    if (tag === 'input') {
      f.type = String(el.type || 'text').toLowerCase();
      const ac = String(el.getAttribute('autocomplete') || '').toLowerCase();
      let masked = false;
      try { masked = getComputedStyle(el).webkitTextSecurity && getComputedStyle(el).webkitTextSecurity !== 'none'; } catch (e) { masked = false; }
      f.password = f.type === 'password' || /(^|\\s)(current|new)-password(\\s|$)/.test(ac) || masked;
    }
    f.valueControl = (tag === 'input' && !BUTTONISH.includes(f.type)) || tag === 'textarea' || tag === 'select';
    f.editable = el.isContentEditable === true;
    f.editableRoot = f.editable && !(el.parentElement && el.parentElement.isContentEditable);
    f.sensitive = !!el.closest('[data-sensitive]');
    f.inSelect = !!el.closest('select');
    f.valueAttr = el.hasAttribute('aria-valuetext') || el.hasAttribute('aria-valuenow');
    facts[ref] = f;
  }
  // Echo scrub material: control values / editable content / sensitive text of elements the snapshot has no ref for.
  const echo = new Set();
  const addEcho = s => { s = norm(s); if (s) echo.add(s); };
  const textOf = root => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) addEcho(n.data); };
  let candidates = [];
  try { candidates = this.querySelectorAll(this.parseSelector('css=input, textarea, [contenteditable], [data-sensitive], [aria-valuetext]'), document); } catch (e) { candidates = []; }
  for (const el of candidates) {
    if (refEls.has(el)) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && !BUTTONISH.includes(String(el.type || '').toLowerCase())) addEcho(el.value);
    if (tag === 'textarea') addEcho(el.value);
    if (el.isContentEditable) textOf(el);
    if (el.closest('[data-sensitive]')) textOf(el);
    if (el.hasAttribute('aria-valuetext')) addEcho(el.getAttribute('aria-valuetext'));
  }
  return { json: snap.json, facts, echo: [...echo], viewport: { width: innerWidth, height: innerHeight }, origin: location.origin, canvases: document.querySelectorAll('canvas').length };
}`;

const RESOLVE_IDS = `function(refs) {
  const out = [];
  for (const ref of refs) out.push(this.querySelector(this.parseSelector('aria-ref=' + ref), document, false));
  return out;
}`;

const countKind = (list, kind, what) => list.reduce((sum, item) => sum + (item.kind === kind && item.what === what ? 1 : 0) + countKind(item.children ?? [], kind, what), 0);

// ---------------------------------------------------------------------------------------------------------------------
// Sanitize + flatten the raw snapshot into rendered nodes.
export function buildRendered(collected, matcher, counters) {
  const { json, facts, echo } = collected;
  const echoSet = new Set(echo);
  const norm1 = s => String(s ?? '').replace(/\s+/gu, ' ').trim();
  // Text withheld by a private-value hit under the node being processed and not yet claimed by a ref-bearing node (a frame per node).
  let lost = 0;

  const stateList = (node, f) => {
    const states = [];
    if (node.checked === true) states.push('checked'); else if (node.checked === 'mixed') states.push('checked=mixed');
    if (node.disabled) states.push('disabled');
    if (node.expanded) states.push('expanded');
    if (node.pressed === true) states.push('pressed'); else if (node.pressed === 'mixed') states.push('pressed=mixed');
    if (node.selected === true) states.push('selected');
    if (f?.editable && f?.editableRoot) states.push('editable');
    if (node.level) states.push(`level=${node.level}`);
    if (node.invalid) states.push('invalid');
    if (node.ariaHidden) states.push('aria-hidden');
    if (node.cursor === 'pointer' && node.role === 'generic') states.push('clickable');
    return states;
  };

  const textKid = (raw, owner, mixed) => {
    const text = norm1(raw);
    if (!text) return null;
    if (echoSet.has(text)) { counters.echoScrubbed++; return null; }
    if (matcher.hit(text)) { counters.withheldPrivate++; lost++; return null; }
    return { kind: 'text', text, box: owner.box ?? null, coarse: mixed, ref: undefined, children: [] };
  };

  const process = (node, inSelectContext) => {
    if (typeof node === 'string') return [];
    const f = node.ref ? facts[node.ref] : undefined;
    const role = node.role;
    if (role === 'iframe') { counters.unsupported++; return [{ kind: 'unsupported', what: 'iframe', children: [] }]; }
    if (f?.password) { counters.passwordControls++; return [{ kind: 'password', children: [] }]; }
    if (f?.sensitive) { counters.withheldSensitive++; return [{ kind: 'withheld', children: [] }]; }
    if (f && ['canvas', 'video', 'embed', 'object'].includes(f.tag)) { counters.unsupported++; return [{ kind: 'unsupported', what: f.tag, children: [] }]; }

    // A native select's selected option IS the control value: the option line is withheld (the other options stay).
    const inSelect = Boolean(inSelectContext || f?.inSelect || f?.tag === 'select');
    if (inSelect && role === 'option' && node.selected === true) { counters.valuesStripped++; return []; }
    const stripValue = Boolean(f && (f.editable || f.valueAttr || (f.valueControl && !(f.tag === 'select')))) || VALUE_ROLES.has(role);
    const dropAll = Boolean(f?.editable);
    const rawChildren = node.text !== undefined ? [node.text] : (node.children ?? []);

    const outerLost = lost; lost = 0;
    const kids = [];
    let buffer = '';
    let pieces = 0;
    const flush = () => {
      if (pieces > 0) {
        const mixed = rawChildren.length > 1;
        const kid = textKid(buffer, node, mixed);
        if (kid) kids.push(kid);
      }
      buffer = ''; pieces = 0;
    };
    if (!dropAll) {
      for (const child of rawChildren) {
        if (typeof child === 'string') {
          if (stripValue) { counters.valuesStripped++; continue; }
          if (echoSet.has(norm1(child))) { counters.echoScrubbed++; continue; }
          buffer += child; pieces++;
        } else {
          flush();
          kids.push(...process(child, inSelect));
        }
      }
      flush();
    } else counters.valuesStripped++;

    const mine = lost; lost = outerLost;

    const name = norm1(node.name);
    const placeholder = node.placeholder;
    const url = node.url !== undefined ? safeUrl(node.url) : undefined;
    const interactive = INTERACTIVE_ROLES.has(role) || Boolean(f?.editableRoot);
    const clickable = node.cursor === 'pointer' && role === 'generic';
    const textHit = matcher.hit(name) || matcher.hit(String(placeholder ?? ''));
    const urlHit = node.url !== undefined && matcher.hit(String(node.url));
    if (urlHit) counters.withheldPrivate++; // a url-only hit drops just the url; the node (name, ref, children) stays
    if (textHit) {
      counters.withheldPrivate++;
      if (!node.ref) return kids; // no ref to keep targetable: the node line is withheld; its already-sanitized children stay
    }
    // A ref-bearing node whose name, placeholder or text was withheld stays as a valueless line: still targetable, nothing private on it.
    const stubbed = textHit && Boolean(node.ref);
    const withheld = Boolean(node.ref) && (textHit || mine > 0);
    if (withheld) counters.withheldKept++;

    const transparent = TRANSPARENT_ROLES.has(role) && !name && !clickable && !interactive;
    if (transparent && !withheld) {
      // Withheld text under a ref-less wrapper is claimed by the nearest ref-bearing ancestor.
      if (mine > 0) lost += mine;
      if (kids.length === 1 && kids[0].kind === 'text' && node.ref && !kids[0].ref) { kids[0].ref = node.ref; kids[0].coarse = false; kids[0].box = node.box ?? kids[0].box; }
      return kids;
    }
    if (!name && kids.length === 0 && !interactive && !clickable && !withheld) return [];
    return [{
      kind: 'node', role, name: stubbed || NAME_OMIT_ROLES.has(role) ? '' : name, rawName: stubbed ? '' : name, ref: node.ref, states: stateList(node, f),
      placeholder: stubbed || placeholder === undefined ? undefined : norm1(placeholder),
      url: stubbed || urlHit ? undefined : url, box: node.box ?? null, interactive, clickable, withheld, tag: f?.tag, children: kids,
    }];
  };

  const roots = [];
  for (const top of json) roots.push(...process(top, false));
  // Canvases the snapshot did not surface are still noted as unsupported surfaces.
  const surfaced = roots.length === 0 ? 0 : countKind(roots, 'unsupported', 'canvas');
  for (let missing = surfaced; missing < Math.min(collected.canvases ?? 0, 5); missing++) roots.push({ kind: 'unsupported', what: 'canvas', children: [] });
  // Flatten in document order with parent / depth.
  const nodes = [];
  const visit = (rendered, parent, depth) => {
    const index = nodes.length;
    rendered.i = index; rendered.parent = parent; rendered.depth = depth;
    nodes.push(rendered);
    const kids = rendered.children;
    rendered.kids = [];
    for (const kid of kids) { rendered.kids.push(nodes.length); visit(kid, index, depth + 1); }
    delete rendered.children;
  };
  const rootless = { kids: [] };
  for (const root of roots) { rootless.kids.push(nodes.length); visit(root, -1, 0); }
  // Merge adjacent text kids that carry no ref (inline fragments) is already done at string level.
  // Own visible text for the intent gate.
  for (const n of nodes) {
    if (n.kind !== 'node') continue;
    n.ownText = bound(n.kids.filter(k => nodes[k].kind === 'text').map(k => nodes[k].text).join(' '), 256);
  }
  return { nodes, rootKids: rootless.kids };
}

// ---------------------------------------------------------------------------------------------------------------------
// Context for controls the model cannot name from the accessible name alone: near="…" and in="…".
export function annotate(nodes, rootKids) {
  const siblingsOf = n => (n.parent < 0 ? rootKids : nodes[n.parent].kids);
  const ancestors = n => { const out = []; for (let p = n.parent; p >= 0; p = nodes[p].parent) out.push(nodes[p]); return out; };
  const isDesc = (n, ancestorIndex) => { for (let p = n.parent; p >= 0; p = nodes[p].parent) if (p === ancestorIndex) return true; return false; };

  const items = [];
  for (const n of nodes) {
    if (!n.box || n.box.width <= 0 || n.box.height <= 0) continue;
    if (n.kind === 'text' && n.text.length <= 80) items.push({ n, text: n.text, box: n.box, coarse: n.coarse });
    else if (n.kind === 'node' && !n.interactive && n.rawName && LABEL_ROLES.has(n.role) && n.rawName.length <= 80) items.push({ n, text: n.rawName, box: n.box, coarse: false });
  }
  const geometric = items.filter(item => !item.coarse);

  const near = control => {
    // 1. the text fragment immediately preceding the control in the same parent (document order, no control in between)
    const sibs = siblingsOf(control);
    const at = sibs.indexOf(control.i);
    for (let j = at - 1; j >= 0; j--) {
      const s = nodes[sibs[j]];
      if (s.kind === 'text') return s.text.length <= 80 ? s.text : null;
      if (s.interactive) break;
      if (s.kind === 'node' && s.rawName && !s.interactive && s.rawName.length <= 80) return s.rawName;
    }
    const b = control.box;
    if (!b || b.width <= 0) return null;
    // 2. nearest text to the left in the same row band
    let best = null;
    for (const item of geometric) {
      if (item.n === control || isDesc(item.n, control.i) || isDesc(control, item.n.i)) continue;
      const r = item.box;
      const overlap = Math.min(r.y + r.height, b.y + b.height) - Math.max(r.y, b.y);
      if (overlap < 0.4 * Math.min(r.height, b.height)) continue;
      if (r.x + r.width > b.x + 8) continue;
      const gap = Math.max(0, b.x - (r.x + r.width));
      if (gap > 300) continue;
      if (!best || gap < best.gap || (gap === best.gap && r.height < best.h)) best = { gap, h: r.height, text: item.text };
    }
    if (best) return best.text;
    // 3. directly above, within the nearest form/row/cell group (widening up to three groups)
    const groups = ancestors(control).filter(a => a.kind === 'node' && GROUP_ROLES.has(a.role)).slice(0, 3);
    for (const scope of [...groups.map(g => g.i), null]) {
      let top = null;
      for (const item of geometric) {
        if (item.n === control || isDesc(item.n, control.i)) continue;
        if (scope !== null && !isDesc(item.n, scope)) continue;
        const r = item.box;
        const gap = b.y - (r.y + r.height);
        if (gap < -6 || gap > 48) continue;
        if (r.x > b.x + b.width || r.x + r.width < b.x - 40) continue;
        const dx = Math.abs(r.x - b.x);
        if (!top || gap < top.gap || (gap === top.gap && dx < top.dx)) top = { gap, dx, text: item.text };
      }
      if (top) return top.text;
    }
    return null;
  };

  // Unnamed containers of the same role are told apart by their order among siblings (form#2/2, row#3/5).
  const ordinals = new Map();
  for (const n of [{ kids: rootKids }, ...nodes]) {
    const byRole = new Map();
    for (const k of n.kids) { const kid = nodes[k]; if (kid.kind === 'node' && HINT_ROLES.has(kid.role) && !kid.rawName) { const list = byRole.get(kid.role) ?? []; list.push(k); byRole.set(kid.role, list); } }
    for (const list of byRole.values()) if (list.length > 1) list.forEach((i, at) => ordinals.set(i, { k: at + 1, total: list.length }));
  }

  const hint = control => {
    const parts = [];
    for (const a of ancestors(control)) {
      if (a.kind !== 'node' || !HINT_ROLES.has(a.role)) continue;
      const label = a.rawName ? bound(a.rawName, 40).replace(/'/gu, '’') : '';
      if (!label && (a.role === 'group' || a.role === 'row' || a.role === 'listitem' || a.role === 'article' || a.role === 'region')) {
        if (a.role === 'group' || a.role === 'region') continue;
      }
      const ordinal = ordinals.get(a.i);
      parts.push(label ? `${a.role} '${label}'` : ordinal ? `${a.role}#${ordinal.k}/${ordinal.total}` : a.role);
      if (parts.length >= 3) break;
    }
    return parts.length ? parts.join(' > ') : null;
  };

  // Table cells: the names of the row's rowheader(s) and of the column's columnheader (found by horizontal overlap with the cell, in the nearest
  // enclosing table/grid). Header names are page labels and are never private (a withheld header has an empty rawName and is skipped).
  const TABLE_ROLES = new Set(['table', 'grid', 'treegrid']);
  const tableOf = n => ancestors(n).find(a => a.kind === 'node' && TABLE_ROLES.has(a.role));
  const columnHeaders = new Map();
  for (const n of nodes) {
    if (n.kind !== 'node' || n.role !== 'columnheader' || !n.rawName || !n.box || n.box.width <= 0) continue;
    const table = tableOf(n);
    if (table) columnHeaders.set(table.i, [...(columnHeaders.get(table.i) ?? []), n]);
  }
  for (const n of nodes) {
    if (n.kind !== 'node' || (n.role !== 'cell' && n.role !== 'gridcell')) continue;
    const headers = [];
    const row = n.parent >= 0 && nodes[n.parent].kind === 'node' && nodes[n.parent].role === 'row' ? nodes[n.parent] : null;
    if (row) for (const k of row.kids) { const sibling = nodes[k]; if (sibling.kind === 'node' && sibling.role === 'rowheader' && sibling.rawName) headers.push(sibling.rawName); }
    const table = tableOf(n);
    if (table && n.box && n.box.width > 0) {
      const center = n.box.x + n.box.width / 2;
      let best = null;
      for (const header of columnHeaders.get(table.i) ?? []) {
        const h = header.box;
        if (center < h.x || center > h.x + h.width || h.y + h.height > n.box.y + 2) continue; // above (or level with) the cell, over its column
        if (!best || h.y + h.height > best.box.y + best.box.height) best = header;
      }
      if (best) headers.push(best.rawName);
    }
    const unique = [...new Set(headers.map(header => bound(header, 80)))];
    if (unique.length) n.headers = unique;
  }

  // Option-like controls: the name of the nearest enclosing radiogroup / group / listbox / menu (the intent is often only in the group's name).
  const GROUPED_ROLES = new Set(['radio', 'checkbox', 'option', 'menuitemradio', 'menuitemcheckbox']);
  const GROUP_NAME_ROLES = new Set(['radiogroup', 'group', 'listbox', 'menu']);
  for (const n of nodes) {
    if (n.kind !== 'node' || !GROUPED_ROLES.has(n.role)) continue;
    const group = ancestors(n).find(a => a.kind === 'node' && GROUP_NAME_ROLES.has(a.role) && a.rawName);
    if (group) n.groupName = bound(group.rawName, 80);
  }

  const keyCounts = new Map();
  for (const n of nodes) if (n.kind === 'node' && n.interactive && n.rawName) { const key = `${n.role}|${n.rawName}`; keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1); }
  for (const n of nodes) {
    if (n.kind !== 'node' || !n.interactive) continue;
    if (!n.rawName) { const nearText = near(n); if (nearText) n.near = bound(nearText, 80); n.inHint = hint(n); }
    else if ((keyCounts.get(`${n.role}|${n.rawName}`) ?? 0) > 1) n.inHint = hint(n);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Rendering.
/** Refs are shown on lines the model may legitimately name: controls, named nodes, clickable generics and text. Not bare containers. */
const showRef = n => Boolean(n.ref) && (n.interactive || n.clickable || n.withheld === true || Boolean(n.name) || n.role === 'heading' || n.role === 'img');

export function renderLine(n) {
  const pad = '  '.repeat(n.depth);
  switch (n.kind) {
    case 'password': return `${pad}- passwordControl`;
    case 'withheld': return `${pad}- withheld {sensitive}`;
    case 'unsupported': return `${pad}- ${n.what} {unsupported surface}`;
    case 'text': return `${pad}- text ${quote(n.text)}${n.ref ? ` [${n.ref}]` : ''}`;
    default: {
      let line = `${pad}- ${n.role}`;
      if (n.name) line += ` ${quote(n.name)}`;
      if (n.ref && showRef(n)) line += ` [${n.ref}]`;
      if (n.states.length) line += ` {${n.states.join(',')}}`;
      if (n.withheld) line += ' {value withheld}';
      if (n.placeholder) line += ` {placeholder=${quote(n.placeholder)}}`;
      if (n.url) line += ` {url=${quote(n.url)}}`;
      if (n.near) line += ` {near=${quote(n.near)}}`;
      if (n.inHint) line += ` {in=${quote(n.inHint)}}`;
      return line;
    }
  }
}

const utf8 = text => Buffer.byteLength(text, 'utf8');

/** Deterministic step-focused projection (INTERFACES.md focus budget). Returns { lines, tier, notShown }. */
export function project(nodes, lines, { stepText = '', targetIntent = '', maxBytes = OUTLINE_BYTES } = {}) {
  const focus = new Set([...words(stepText), ...words(targetIntent)].filter(word => !STOP.has(word)));
  const base = new Set();
  nodes.forEach((n, i) => {
    let keep = false;
    if (n.kind === 'password' || n.kind === 'withheld' || n.kind === 'unsupported') keep = true;
    else if (n.kind === 'node') {
      keep = LANDMARK_ROLES.has(n.role) || n.role === 'heading' || FORM_CONTROL_ROLES.has(n.role);
      if (!keep && focus.size) keep = [n.rawName, n.placeholder, n.near, n.ownText].some(text => text && words(text).some(w => focus.has(w)));
      // A valueless {value withheld} line has no text of its own: its row / column headers and group name are what a step can name it by.
      if (!keep && focus.size && n.withheld) keep = [n.groupName, ...(n.headers ?? [])].some(text => text && words(text).some(w => focus.has(w)));
    } else if (n.kind === 'text') keep = words(n.text).some(w => focus.has(w));
    if (keep) base.add(i);
  });
  // A kept combobox / listbox keeps its options (first OPTION_CAP), so a step naming an option that does not exist still sees what does.
  const optionGroups = [];
  const beyondCap = new Set();
  const optionsOf = control => {
    const out = [];
    const walk = i => { for (const k of nodes[i].kids ?? []) { const kid = nodes[k]; if (kid.kind !== 'node') continue; if (kid.role === 'option') out.push(k); else if (kid.role === 'group') walk(k); } };
    walk(control);
    return out;
  };
  for (const i of [...base]) {
    const n = nodes[i];
    if (n.kind !== 'node' || (n.role !== 'combobox' && n.role !== 'listbox')) continue;
    const options = optionsOf(i);
    if (options.length === 0) continue;
    optionGroups.push({ options });
    for (const k of options.slice(0, OPTION_CAP)) base.add(k);
    for (const k of options.slice(OPTION_CAP)) if (!base.has(k)) beyondCap.add(k); // the cap holds against the parent / sibling expansion below too
  }
  /** Per kept control: a `… N more options` line after its last kept option when some of its options are not shown. */
  const extrasFor = keep => {
    const out = new Map();
    for (const { options } of optionGroups) {
      const kept = options.filter(k => keep.has(k));
      const remaining = options.length - kept.length;
      if (kept.length > 0 && remaining > 0) { const anchor = kept.at(-1); out.set(anchor, `${'  '.repeat(nodes[anchor].depth)}… ${remaining} more options`); }
    }
    return out;
  };
  const rootKids = nodes.filter(n => n.parent < 0).map(n => n.i);
  const expand = (withParent, withSiblings) => {
    const keep = new Set(base);
    for (const i of base) {
      const n = nodes[i];
      if (withParent && n.parent >= 0) keep.add(n.parent);
      if (withSiblings) {
        const sibs = n.parent < 0 ? rootKids : nodes[n.parent].kids;
        const at = sibs.indexOf(i);
        if (at > 0) keep.add(sibs[at - 1]);
        if (at < sibs.length - 1) keep.add(sibs[at + 1]);
      }
    }
    for (const k of beyondCap) keep.delete(k);
    return keep;
  };
  const measure = keep => { let bytes = 0; keep.forEach(i => { bytes += utf8(lines[i]) + 1; }); extrasFor(keep).forEach(line => { bytes += utf8(line) + 1; }); return bytes; };
  const total = nodes.length;
  const finish = (keep, tier) => {
    const kept = [...keep].sort((a, b) => a - b);
    const extras = extrasFor(keep);
    const shown = [];
    for (const i of kept) { shown.push(lines[i]); if (extras.has(i)) shown.push(extras.get(i)); }
    const notShown = total - kept.length;
    return { keptIndexes: kept, lines: shown, tier, notShown };
  };
  const tails = notShown => `… ${notShown} more nodes not shown`;
  for (const [tier, withParent, withSiblings] of [['focus+parent+siblings', true, true], ['focus+parent', true, false], ['focus', false, false]]) {
    const keep = expand(withParent, withSiblings);
    if (measure(keep) + utf8(tails(total)) <= maxBytes) return finish(keep, tier);
  }
  // Last resort: the base set in order, cut at the byte budget.
  const ordered = [...base].sort((a, b) => a - b);
  const keep = new Set(); let bytes = utf8(tails(total));
  for (const i of ordered) { const cost = utf8(lines[i]) + 1; if (bytes + cost > maxBytes) break; keep.add(i); bytes += cost; }
  // The `… N more options` lines are extra bytes: drop trailing kept nodes until the whole thing fits.
  while (keep.size > 0 && measure(keep) + utf8(tails(total)) > maxBytes) keep.delete([...keep].sort((a, b) => a - b).at(-1));
  return finish(keep, 'truncated');
}

// ---------------------------------------------------------------------------------------------------------------------
async function resolveBackendIds(cdp, engineHandle, refs) {
  const idMap = {};
  if (refs.length === 0) return idMap;
  const arrayId = await call(cdp, engineHandle, RESOLVE_IDS, [refs], false);
  const { result } = await cdp.send('Runtime.getProperties', { objectId: arrayId, ownProperties: true });
  const byIndex = new Map();
  for (const property of result) if (/^\d+$/u.test(property.name) && property.value?.objectId) byIndex.set(Number(property.name), property.value.objectId);
  const entries = [...byIndex.entries()];
  for (let start = 0; start < entries.length; start += 64) {
    await Promise.all(entries.slice(start, start + 64).map(async ([index, objectId]) => {
      try { const { node } = await cdp.send('DOM.describeNode', { objectId }); idMap[refs[index]] = node.backendNodeId; } catch { /* element vanished: not nameable */ }
    }));
  }
  await cdp.send('Runtime.releaseObject', { objectId: arrayId }).catch(() => undefined);
  return idMap;
}

/**
 * Perceive the current page state.
 * @param {{ page?: object, cdp?: object, privateValues?: string[], stepText?: string, targetIntent?: string, obligations?: object[], maxBytes?: number, resolveIds?: boolean }} options
 */
export async function perceive({ page, cdp, privateValues = [], stepText = '', targetIntent = '', obligations = [], maxBytes = OUTLINE_BYTES, resolveIds = true, inventory = null } = {}) {
  const started = Date.now();
  const client = cdp ?? await session(page);
  const world = await isolatedWorld(client);
  const engine = await evaluateHandle(client, world, engineExpression());
  const collected = await call(client, engine, COLLECT);
  const derived = inventory ? { inventory, production: 'supplied', error: null } : await privateInventoryFor(page, client);
  const entries = [...derived.inventory, ...privateValues.filter(value => typeof value === 'string' && value.length > 0).map(value => [value, true])];
  const matcher = createMatcher(entries);
  const counters = { withheldPrivate: 0, withheldKept: 0, withheldSensitive: 0, echoScrubbed: 0, valuesStripped: 0, unsupported: 0, passwordControls: 0 };
  const { nodes, rootKids } = buildRendered(collected, matcher, counters);
  annotate(nodes, rootKids);
  // A {value withheld} node's box can be as wide as the withheld text, so S4's ref marks (lib/visual.mjs reads node.box) would draw the extent of a
  // private value. The geometry was only needed for near / headers above; drop it from every node that withheld something.
  for (const n of nodes) if (n.kind === 'node' && n.withheld) n.box = null;
  // Final leak guard on the derived strings (near/in are built from other nodes' text): drop a hint that echoes a private value.
  if (matcher.count > 0) {
    for (const n of nodes) {
      if (n.near && matcher.hit(n.near)) { delete n.near; counters.withheldPrivate++; }
      if (n.inHint && matcher.hit(n.inHint)) { n.inHint = null; counters.withheldPrivate++; }
      if (n.groupName && matcher.hit(n.groupName)) { delete n.groupName; counters.withheldPrivate++; }
      if (n.headers) { const clean = n.headers.filter(header => !matcher.hit(header)); if (clean.length !== n.headers.length) counters.withheldPrivate++; if (clean.length) n.headers = clean; else delete n.headers; }
    }
  }
  const lines = nodes.map(renderLine);
  const intents = [targetIntent, ...obligations.map(o => o?.targetIntent)].filter(Boolean).join(' ');
  const full = lines.join('\n');
  const unprojectedBytes = utf8(full);
  let shownIndexes = nodes.map(n => n.i);
  let outline = full;
  let projection = null;
  if (unprojectedBytes > maxBytes) {
    projection = project(nodes, lines, { stepText, targetIntent: intents, maxBytes });
    shownIndexes = projection.keptIndexes;
    outline = [...projection.lines, `… ${projection.notShown} more nodes not shown`].join('\n');
  }
  const shown = new Set(shownIndexes);
  const inOutline = new Set([...outline.matchAll(/\[(e\d+)\]/gu)].map(match => match[1]));
  const refs = [];
  const byRef = new Map();
  for (const i of shownIndexes) {
    const n = nodes[i];
    if (n.ref && (n.kind === 'node' || n.kind === 'text') && inOutline.has(n.ref)) { refs.push(n.ref); byRef.set(n.ref, n); }
  }
  const idMap = resolveIds ? await resolveBackendIds(client, engine, refs) : {};
  const result = {
    outline, nodes, shown, byRef, idMap,
    handle: { cdp: client, world, engine },
    origin: collected.origin, viewport: collected.viewport,
    meta: {
      bytes: utf8(outline), unprojectedBytes, nodes: shownIndexes.length, totalNodes: nodes.length, ms: Date.now() - started,
      projected: projection !== null, projectionTier: projection?.tier ?? null, notShown: projection?.notShown ?? 0,
      emptied: nodes.length === 0, canvases: collected.canvases, inventoryEntries: entries.length, inventoryProduction: derived.production, ...counters,
    },
  };
  // The inventory holds the private values themselves: not enumerable, so it never reaches JSON dumps of the perception.
  Object.defineProperty(result, 'inventory', { value: entries, enumerable: false });
  return result;
}

/**
 * Evidence string for the intent gate: name, placeholder, near-label and own visible text, then (S3 v2) the enclosing group's name of a
 * radio / checkbox / option and the row and column header names of a table cell, capped at 256. None of these parts can be private text.
 */
export function evidenceFor(node) {
  if (!node) return '';
  return bound([node.rawName, node.placeholder, node.near, node.ownText, node.text, node.groupName, ...(Array.isArray(node.headers) ? node.headers : [])].filter(Boolean).join(' '), 256);
}
