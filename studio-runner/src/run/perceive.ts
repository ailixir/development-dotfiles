/**
 * Perception: a sanitized, focus-projected outline of the page built from Playwright's AI aria snapshot,
 * with refs, a per-ref facts table and the evidence the intent gate reads (ADR-SC-007 D1, D3, D6).
 *
 * Ported from the SPK-07 spike (`evaluation/grounding/lib/perceive.mjs`) with the D1/D2 leak fixes. The
 * snapshot is taken in the runner's isolated world; boxes are used locally (near / in / headers) and are
 * never exported. Every private-value decision happens before any derived string is built.
 *
 * Pipeline (all steps after `collectPage` are pure and unit-tested):
 *   buildDrafts  -> sanitize the snapshot tree with the single-string matcher (spike semantics, D2 forms)
 *   withholdSplit-> D1: values split across pieces, name-from-content taint, fragment owners
 *   flatten, annotate (near / in / headers / group / sibling cells), guard derived strings
 *   render + project (40,000 bytes) + facts
 */
import {
  DEFAULT_WORK_BUDGET_UNITS,
  GAP,
  compactText,
  fold,
  type InventoryEntry,
  type PrivateInventory,
  type PrivateMatcher,
  type WorkBudget,
} from './privateInventory.js';
import { backendNodeIdsFor, openEngine, runOnEngine, unsafePublicRoots, type CdpSession, type PerceptionEngine } from './playwrightEngine.js';
import {
  collectPage,
  pageInventory,
  type Box,
  type CollectedPage,
  type ElementFacts,
  type PageInventory,
  type SnapshotNode,
} from './perceptionInPage.js';

export const MAX_LINE_CHARS = 160;
export const OUTLINE_BYTES = 40000;
export const OPTION_CAP = 60;
/** Projection of the rows around a matched node (rehearsal R3): rows, cells per row, and descendant lines per cell. */
export const ROW_CAP = 8;
export const ROW_CELL_CAP = 12;
const ROW_DESCENDANT_CAP = 12;
const TABLE_ROLE_NAMES: ReadonlySet<string> = new Set(['table', 'grid', 'treegrid']);
export const EVIDENCE_CHARS = 256;

// ---------------------------------------------------------------------------------------------------------------------
// Text helpers shared with the intent gate: norm / words.

const PUNCT = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;

/** NFKC, lowercase, collapsed whitespace, leading/trailing punctuation and symbols stripped; symbol-only text keeps its symbols. */
export function norm(value: string): string {
  const folded = value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
  const stripped = folded.replace(PUNCT, '');
  return stripped === '' ? folded : stripped;
}

export function words(value: string): string[] {
  return norm(value).split(/[^\p{L}\p{N}]+/u).filter((word) => Array.from(word).length >= 2);
}

/** Words ignored by the step-focused projection (function words only). */
export const FOCUS_STOPWORDS: readonly string[] = Object.freeze([
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'then', 'are', 'was', 'its', 'has', 'have', 'not', 'but', 'you', 'your', 'type',
  'enter', 'click', 'press', 'field', 'button', 'input', 'text', 'box', 'in', 'of', 'on', 'to', 'at', 'by', 'is', 'it', 'as', 'or', 'an', 'if',
  'be', 'do', 'up', 'no', 'all', 'any', 'can', 'out', 'one',
]);
const STOP = new Set(FOCUS_STOPWORDS);

export function bound(value: string | null | undefined, limit = MAX_LINE_CHARS): string {
  const chars = Array.from((value ?? '').replace(/\s+/gu, ' ').trim());
  return chars.length <= limit ? chars.join('') : `${chars.slice(0, limit - 1).join('')}…`;
}
const quote = (value: string): string => JSON.stringify(bound(value));
const utf8 = (text: string): number => Buffer.byteLength(text, 'utf8');

/** Link URLs: drop credentials and fragments, hide long opaque query values, bound the length. */
export function safeUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (/^data:/iu.test(value)) return 'data:…';
  if (/^javascript:/iu.test(value)) return 'javascript:';
  const withoutHash = value.split('#')[0] ?? '';
  const path = withoutHash.split('?')[0] ?? '';
  const query = withoutHash.includes('?') ? withoutHash.slice(withoutHash.indexOf('?') + 1) : '';
  const cleanPath = path.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/iu, '$1');
  const cleanQuery = query
    ? query.split('&').map((pair) => {
      const i = pair.indexOf('=');
      if (i < 0) return pair;
      const v = pair.slice(i + 1);
      return v.length >= 20 ? `${pair.slice(0, i)}=…` : pair;
    }).join('&')
    : '';
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
const NAME_OMIT_ROLES = new Set(['row']);
/** Roles whose accessible name comes from the author (aria-label, a landmark label), not from the content below them. */
const AUTHOR_NAMED_ROLES = new Set(['region', 'form', 'navigation', 'main', 'banner', 'contentinfo', 'complementary', 'search', 'dialog', 'alertdialog', 'group', 'list', 'table', 'grid', 'radiogroup', 'listbox', 'menu', 'toolbar', 'tabpanel', 'document']);
const isContentNamed = (role: string): boolean => !AUTHOR_NAMED_ROLES.has(role);

/** Characters of text kept per sibling cell in cell evidence. */
const SIBLING_CHARS = 80;

// ---------------------------------------------------------------------------------------------------------------------
// Types.

export type RenderedKind = 'node' | 'text' | 'password' | 'withheld' | 'unsupported';

export interface SanitizeCounters {
  withheldPrivate: number;
  withheldKept: number;
  withheldSensitive: number;
  echoScrubbed: number;
  valuesStripped: number;
  unsupported: number;
  passwordControls: number;
  splitWithheld: number;
}

export const newCounters = (): SanitizeCounters => ({
  withheldPrivate: 0, withheldKept: 0, withheldSensitive: 0, echoScrubbed: 0, valuesStripped: 0, unsupported: 0, passwordControls: 0, splitWithheld: 0,
});

export interface RenderedNode {
  i: number;
  parent: number;
  depth: number;
  kids: number[];
  kind: RenderedKind;
  role: string;
  name: string;
  rawName: string;
  /** Still-current collector-proved complete public output name. Never stores a previous name. */
  primaryName?: boolean;
  ref: string | undefined;
  states: string[];
  placeholder: string | undefined;
  url: string | undefined;
  box: Box | null;
  interactive: boolean;
  clickable: boolean;
  withheld: boolean;
  cleared: boolean;
  tag: string | undefined;
  text: string;
  coarse: boolean;
  what: string;
  ownText: string;
  near: string | undefined;
  inHint: string | null | undefined;
  headers: string[] | undefined;
  groupName: string | undefined;
  siblings: string[] | undefined;
  /** Evidence text of an unnamed non-interactive node (a heading whose only content is a link): its descendant text, at most 80 characters. */
  fallbackText?: string | undefined;
  ordinal?: { index: number; count: number };
  scopeRefs?: string[] | undefined;
  readScope?: ElementFacts['readScope'];
  nearReadOnly?: boolean;
  readContext?: string[] | undefined;
  ownTextUnknown?: boolean;
  directTextAssertion?: true;
  /** A table data cell whose only content is one named public link: the cell is offered as a read target next to its link. */
  linkValueCell?: true;
}

export interface RenderedTree {
  nodes: RenderedNode[];
  rootKids: number[];
}

/** A node of the nested tree while it is being sanitized. */
interface Draft {
  opaquePublicSource?: true;
  kind: RenderedKind;
  role: string;
  name: string;
  rawName: string;
  primaryName: boolean;
  ref: string | undefined;
  states: string[];
  placeholder: string | undefined;
  url: string | undefined;
  box: Box | null;
  interactive: boolean;
  clickable: boolean;
  withheld: boolean;
  cleared: boolean;
  tag: string | undefined;
  text: string;
  coarse: boolean;
  what: string;
  children: Draft[];
  parent: Draft | null;
  lostBelow: number;
  droppedChild: boolean;
  gone: boolean;
  /** The ref-bearing ref-less wrapper this node was flattened out of, so a withheld piece can still leave a targetable stub. */
  viaRef: { ref: string; role: string } | undefined;
  /** Strings of this node that were withheld in step 1: they stay in the probe so neighbouring pieces can still be joined to them. */
  ghostNames: string[];
  r7SourceRef?: string;
  ownTextUnknown?: boolean;
  directTextAssertion?: true;
}

const makeDraft = (kind: RenderedKind, init: Partial<Draft> = {}): Draft => ({
  kind, role: '', name: '', rawName: '', primaryName: false, ref: undefined, states: [], placeholder: undefined, url: undefined, box: null, interactive: false,
  clickable: false, withheld: false, cleared: false, tag: undefined, text: '', coarse: false, what: '', children: [], parent: null, lostBelow: 0,
  droppedChild: false, gone: false, viaRef: undefined, ghostNames: [], ...init,
});

// ---------------------------------------------------------------------------------------------------------------------
// Step 1: sanitize the snapshot tree with the single-string matcher (spike semantics).

const norm1 = (s: string | null | undefined): string => (s ?? '').replace(/\s+/gu, ' ').trim();

/**
 * Hidden content (ADR-SC-007 D-A) means what the pinned engine's snapshot leaves out: `[hidden]`, `type=hidden`,
 * `display:none`, `visibility:hidden`, `template`, `noscript`, `script` and `style`. It does NOT mean `aria-hidden`:
 * that content is rendered, as in the spike (AUTO-DECISION F8; the pinning test is perception/leaks.test.ts).
 */
function buildDrafts(collected: CollectedPage, matcher: PrivateMatcher, counters: SanitizeCounters): Draft[] {
  const { json, facts } = collected;
  const echoSet = new Set(collected.echo);
  // Text withheld by a private-value hit under the node being processed and not yet claimed by a ref-bearing node.
  let lost = 0;
  // Omission provenance only, from the EXISTING snapshot sanitation path. No new DOM label reads.
  let omittedOwn = 0;

  const stateList = (node: SnapshotNode, f: ElementFacts | undefined): string[] => {
    const states: string[] = [];
    if (node.checked === true) states.push('checked');
    else if (node.checked === 'mixed') states.push('checked=mixed');
    if (node.disabled) states.push('disabled');
    if (node.expanded) states.push('expanded');
    if (node.pressed === true) states.push('pressed');
    else if (node.pressed === 'mixed') states.push('pressed=mixed');
    if (node.selected === true) states.push('selected');
    if (f?.editable && f.editableRoot) states.push('editable');
    if (node.level) states.push(`level=${String(node.level)}`);
    if (node.invalid) states.push('invalid');
    if (node.ariaHidden) states.push('aria-hidden');
    if (node.cursor === 'pointer' && node.role === 'generic') states.push('clickable');
    return states;
  };

  const textKid = (raw: string, owner: SnapshotNode, mixed: boolean): Draft | null => {
    const text = norm1(raw);
    if (!text) return null;
    if (echoSet.has(text)) {
      counters.echoScrubbed++;
      return null;
    }
    if (matcher.hit(text)) {
      counters.withheldPrivate++;
      lost++;
      // the dropped text stays in the tree as a ghost: step 2 still joins its neighbours to it
      return makeDraft('text', { text, gone: true });
    }
    return makeDraft('text', { text, box: owner.box ?? null, coarse: mixed });
  };

  const proc = (node: SnapshotNode | string, inSelectContext: boolean): Draft[] => {
    if (typeof node === 'string') return [];
    const f = node.ref ? facts[node.ref] : undefined;
    const cleanWrapper = (raw: SnapshotNode): boolean => {
      const metadata = raw.ref ? facts[raw.ref] : undefined;
      return metadata?.tag === 'span' && ['generic','none','presentation'].includes(raw.role)
        && !raw.name && raw.text === undefined && raw.placeholder === undefined && raw.url === undefined && raw.cursor !== 'pointer'
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare -- Missing runtime native flags are UNKNOWN, never false.
        && metadata.password !== true && metadata.valueControl === false && metadata.editable === false && metadata.editableRoot === false
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare -- Missing runtime native flags are UNKNOWN, never false.
        && metadata.sensitive === false && metadata.inSelect === false && metadata.valueAttr === false;
    };
    // Mint only at this original raw P; never search the flattened ancestry for an explanation.
    const rawR7Pairs: { target: string; source: string }[] = [];
    if (cleanWrapper(node)) {
      const delimiters: string[] = [];
      const branches: SnapshotNode[] = [];
      let valid = true;
      const delimiter = (text: string): void => {
        const value = norm1(text);
        if (echoSet.has(value) || matcher.hitSplit([value]) || !/^[()[\]·|:,\s-]*$/u.test(value)) valid = false;
        if (value) delimiters.push(value);
      };
      for (const child of node.children ?? []) { if (typeof child === 'string') delimiter(child); else branches.push(child); }
      if (branches.length === 2) for (const [target, branch] of [[branches[0], branches[1]], [branches[1], branches[0]]] as const) {
        if (!target?.ref || !branch) continue;
        let source: SnapshotNode | undefined = branch;
        const extra: string[] = [];
        if (cleanWrapper(branch)) {
          const meaningful = (branch.children ?? []).filter((child): child is SnapshotNode => typeof child !== 'string');
          if (meaningful.length !== 1) continue;
          source = meaningful[0];
          for (const child of branch.children ?? []) if (typeof child === 'string') extra.push(child);
        }
        if (!source?.ref || !['link','text','paragraph','strong'].includes(source.role)) continue;
        const sourceFacts = facts[source.ref], targetFacts = facts[target.ref], sourceName = norm1(source.name);
        const native = targetFacts?.readScope;
        if (!sourceFacts || !targetFacts || native?.relation !== 'R7_ADJACENT_PUBLIC' || native.sourceRefs.length !== 1 || native.sourceRefs[0] !== source.ref
          || !['link','text','paragraph','strong','heading'].includes(target.role) || targetFacts.password || targetFacts.sensitive || targetFacts.editable || targetFacts.valueControl || targetFacts.valueAttr || targetFacts.inSelect
          || sourceFacts.password || sourceFacts.sensitive || sourceFacts.editable || sourceFacts.valueControl || sourceFacts.valueAttr || sourceFacts.inSelect
          || sourceName === '' || Array.from(sourceName).length > 80 || matcher.hitSplit([sourceName])) continue;
        const originalLength = delimiters.length;
        for (const text of extra) delimiter(text);
        const punctuation = delimiters.join('');
        const balanced = punctuation.replace(/\s/gu, '') === '' || /^(?:\(\)|\[\]|[·|:,-]+)$/u.test(punctuation.replace(/\s/gu, ''));
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- delimiter() mutates valid for every raw separator before minting.
        if (valid && balanced && delimiters.length <= 2 && Array.from(punctuation).length <= 8) rawR7Pairs.push({ target: target.ref, source: source.ref });
        delimiters.length = originalLength;
      }
    }
    const role = node.role;
    if (f?.opaquePublicSource) {
      counters.unsupported++;
      return [makeDraft('unsupported', { what: 'shadowRoot', opaquePublicSource: true })];
    }
    if (role === 'iframe') {
      counters.unsupported++;
      return [makeDraft('unsupported', { what: 'iframe' })];
    }
    if (f?.password) {
      counters.passwordControls++;
      return [makeDraft('password')];
    }
    if (f?.sensitive) {
      counters.withheldSensitive++;
      return [makeDraft('withheld')];
    }
    if (f && ['canvas', 'video', 'embed', 'object'].includes(f.tag)) {
      counters.unsupported++;
      return [makeDraft('unsupported', { what: f.tag })];
    }

    // A native select's selected option IS the control value: the option line is withheld (the other options stay).
    const inSelect = inSelectContext || f?.inSelect === true || f?.tag === 'select';
    if (inSelect && role === 'option' && node.selected === true) {
      counters.valuesStripped++;
      return [];
    }
    const stripValue = Boolean(f && (f.editable || f.valueAttr || (f.valueControl && f.tag !== 'select'))) || VALUE_ROLES.has(role);
    const dropAll = Boolean(f?.editable);
    const rawChildren: (SnapshotNode | string)[] = node.text !== undefined ? [node.text] : (node.children ?? []);
    // This certificate classifies only the direct excluded VALUE, never an absent or private label.
    // Missing runtime native flags are UNKNOWN, never false.
    const directValueOnly = f?.directValueOnly === 'NATIVE_INPUT_VALUE_ONLY' && f.tag === 'input' && f.password === false
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare -- Recheck same-pass prerequisites, including absent metadata.
      && f.valueControl === true && f.editable === false && f.editableRoot === false && f.sensitive === false && f.inSelect === false && f.valueAttr === false
      && ((f.type === 'text' && role === 'textbox') || (f.type === 'search' && role === 'searchbox') || ((f.type === 'text' || f.type === 'search') && role === 'combobox'))
      && (node.text === undefined || !node.children?.length) && rawChildren.length <= 1 && rawChildren.every(child => typeof child === 'string');

    const outerLost = lost;
    lost = 0;
    const outerOmitted = omittedOwn;
    omittedOwn = 0;
    const kids: Draft[] = [];
    let buffer = '';
    let pieces = 0;
    const flush = (): void => {
      if (pieces > 0) {
        const kid = textKid(buffer, node, rawChildren.length > 1);
        if (kid) kids.push(kid);
        else if (norm1(buffer) !== '') omittedOwn++;
      }
      buffer = '';
      pieces = 0;
    };
    if (!dropAll) {
      for (const child of rawChildren) {
        if (typeof child === 'string') {
          if (stripValue) {
            if (norm1(child) !== '' && !directValueOnly) omittedOwn++;
            counters.valuesStripped++;
            continue;
          }
          if (echoSet.has(norm1(child))) {
            omittedOwn++;
            counters.echoScrubbed++;
            continue;
          }
          buffer += child;
          pieces++;
        } else {
          flush();
          kids.push(...proc(child, inSelect));
        }
      }
      flush();
    } else { counters.valuesStripped++; if (rawChildren.length > 0) omittedOwn++; }

    for (const certificate of rawR7Pairs) {
      const find = (list: Draft[], ref: string): Draft | undefined => {
        for (const d of list) { if (d.ref === ref) return d; const below = find(d.children, ref); if (below) return below; }
        return undefined;
      };
      const target = find(kids, certificate.target), source = find(kids, certificate.source);
      if (target && source && !source.withheld && !source.cleared && !source.gone && !source.ownTextUnknown) target.r7SourceRef = certificate.source;
    }
    const mine = lost;
    lost = outerLost;
    const mineOmitted = omittedOwn;
    omittedOwn = outerOmitted + mineOmitted;
    const liveKids = kids.filter((kid) => !kid.gone);

    const name = norm1(node.name);
    const placeholder = node.placeholder;
    const url = node.url !== undefined ? safeUrl(node.url) : undefined;
    const interactive = INTERACTIVE_ROLES.has(role) || Boolean(f?.editableRoot);
    const clickable = node.cursor === 'pointer' && role === 'generic';
    const textHit = matcher.hit(name) || matcher.hit(placeholder ?? '');
    const urlHit = node.url !== undefined && matcher.hit(node.url);
    if (urlHit) counters.withheldPrivate++; // a url-only hit drops just the url; the node (name, ref, children) stays
    if (textHit) {
      counters.withheldPrivate++;
      if (!node.ref) {
        // No ref to keep targetable: the node line is withheld; the claim goes to the nearest ref-bearing ancestor.
        lost += mine + 1;
        return [makeDraft('text', { text: [name, placeholder ?? ''].filter(Boolean).join(' '), gone: true }), ...kids];
      }
    }
    // A ref-bearing node whose name, placeholder or text was withheld stays as a valueless line: still targetable.
    const stubbed = textHit && Boolean(node.ref);
    const primaryName = !stubbed && !urlHit && f?.primaryNameSource === 'PRIMARY_ARIA_LABEL' && f.tag === 'output' && role === 'status'
      && !interactive && !clickable && node.cursor !== 'pointer' && !f.password && !f.sensitive && !f.editable && !f.valueControl && !f.valueAttr && !inSelect
      && placeholder === undefined && node.url === undefined && name !== '' && Array.from(name).length <= 256;
    const withheld = Boolean(node.ref) && (textHit || mine > 0);
    if (withheld) counters.withheldKept++;

    const directTextAssertion = f?.directTextAssertion === true && role === 'paragraph' && name === '' && !withheld && !stubbed && mineOmitted === 0
      && kids.filter(k => k.kind === 'text' && !k.gone && k.text !== '').length === 1;
    const transparent = TRANSPARENT_ROLES.has(role) && !name && !clickable && !interactive && !directTextAssertion;
    if (transparent && !withheld) {
      // Withheld text under a ref-less wrapper is claimed by the nearest ref-bearing ancestor.
      if (mine > 0) lost += mine;
      const only = liveKids.length === 1 ? liveKids[0] : undefined;
      if (only?.kind === 'text' && node.ref && !only.ref) {
        only.ref = node.ref;
        if (f?.nativeTextRoot) { only.role = f.nativeTextRoot; only.tag = f.tag; }
        only.coarse = false;
        only.box = node.box ?? only.box;
      } else if (node.ref) {
        for (const kid of liveKids) kid.viaRef ??= { ref: node.ref, role };
      }
      return kids;
    }
    if (!name && liveKids.length === 0 && !interactive && !clickable && !withheld) return [];
    if (!node.ref) lost += mine; // a ref-less node cannot claim: its ancestors do
    return [makeDraft('node', {
      role, name: stubbed || NAME_OMIT_ROLES.has(role) ? '' : name, rawName: stubbed ? '' : name, primaryName, ref: node.ref, states: stateList(node, f),
      placeholder: stubbed || placeholder === undefined ? undefined : norm1(placeholder), url: stubbed || urlHit ? undefined : url,
      box: node.box ?? null, interactive, clickable, withheld, cleared: stubbed, tag: f?.tag, children: kids, lostBelow: mine,
      ownTextUnknown: mineOmitted > 0 || kids.some(k => ['password','withheld','unsupported'].includes(k.kind)),
      ...(directTextAssertion ? { directTextAssertion: true } : {}),
      ghostNames: stubbed ? [name, placeholder === undefined ? '' : norm1(placeholder)].filter(Boolean) : [],
    })];
  };

  const roots: Draft[] = [];
  for (const top of json) roots.push(...proc(top, false));
  // Canvases the snapshot did not surface are still noted as unsupported surfaces.
  const surfaced = countUnsupported(roots, 'canvas');
  for (let missing = surfaced; missing < Math.min(collected.canvases, 5); missing++) roots.push(makeDraft('unsupported', { what: 'canvas' }));
  return roots;
}

function countUnsupported(list: readonly Draft[], what: string): number {
  return list.reduce((sum, item) => sum + (item.kind === 'unsupported' && item.what === what ? 1 : 0) + countUnsupported(item.children, what), 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// Step 2 (D1): values split across pieces, and names built from content.

type PartField = 'name' | 'placeholder' | 'text' | 'ghost';
interface Part {
  readonly text: string;
  readonly owner: Draft;
  readonly field: PartField;
}

/** Characters probed per matcher call; longer part lists are probed in overlapping groups. */
const PROBE_CHARS = 8192;

function link(list: readonly Draft[], parent: Draft | null): void {
  for (const draft of list) {
    draft.parent = parent;
    link(draft.children, draft);
  }
}

function clearDraft(d: Draft, contentOnly = false): void {
  if (!(contentOnly && d.primaryName && d.name !== '' && d.rawName !== '')) {
    d.primaryName = false;
    d.name = '';
    d.rawName = '';
  }
  d.placeholder = undefined;
  d.url = undefined;
  d.cleared = true;
}

function prune(list: Draft[]): void {
  for (let k = list.length - 1; k >= 0; k--) {
    const d = list[k];
    if (d?.gone) list.splice(k, 1);
    else if (d) prune(d.children);
  }
}

/**
 * Probes the strings of every node (its own name and placeholder, its text lines and, for descendants, their
 * names, placeholders and text lines) together, with whitespace removed, so a value split across inline
 * elements, or joined with spaces into the name of a link or heading, is found. Only the pieces that take
 * part in a match are acted on: a text line is dropped and its nearest ref-bearing owner becomes a valueless
 * `{value withheld}` stub; a name or placeholder is cleared. A node whose name is built from content that
 * was withheld below it renders no name; non-involved siblings keep their lines.
 */
function withholdSplit(roots: Draft[], matcher: PrivateMatcher, counters: SanitizeCounters): void {
  if (matcher.count === 0) return;
  // Top-level drafts sit under a virtual parent (sharing the `roots` array), so pieces at the top are joined like any others.
  const top = makeDraft('node', { children: roots });
  link(roots, top);

  const ownParts = (d: Draft): Part[] => {
    if (d.kind === 'text') return d.text === '' ? [] : [{ text: d.text, owner: d, field: d.gone ? 'ghost' : 'text' }];
    if (d.kind !== 'node') return [];
    const out: Part[] = d.ghostNames.map((text): Part => ({ text, owner: d, field: 'ghost' }));
    if (d.rawName !== '') out.push({ text: d.rawName, owner: d, field: 'name' });
    if (d.placeholder !== undefined && d.placeholder !== '') out.push({ text: d.placeholder, owner: d, field: 'placeholder' });
    return out;
  };
  const stillThere = (part: Part): boolean => (part.field === 'ghost' ? true : part.field === 'text' ? !part.owner.gone : part.field === 'name' ? part.owner.rawName === part.text : part.owner.placeholder === part.text);
  /** A part whose string has been withheld stays in the probe as a ghost, so later joins still see where it was. */
  const settle = (part: Part): Part => (stillThere(part) ? part : { text: part.text, owner: part.owner, field: 'ghost' });

  const probe = (parts: readonly Part[]): Set<number> => {
    const involved = new Set<number>();
    let start = 0;
    while (start < parts.length) {
      let end = start;
      let chars = 0;
      while (end < parts.length && (end === start || chars + (parts[end]?.text.length ?? 0) <= PROBE_CHARS)) {
        chars += parts[end]?.text.length ?? 0;
        end++;
      }
      const group = parts.slice(start, end);
      for (const index of matcher.locateSplit(group.map((part) => part.text))) involved.add(start + index);
      if (end >= parts.length) break;
      // overlap: restart from the part that begins at about half the group, so a match across a cut is seen
      let back = end;
      let overlap = 0;
      while (back > start + 1 && overlap < PROBE_CHARS / 2) {
        back--;
        overlap += parts[back]?.text.length ?? 0;
      }
      start = Math.max(back, start + 1);
    }
    return involved;
  };

  const owner = (d: Draft): Draft | null => {
    for (let p: Draft | null = d.parent; p; p = p.parent) if (p.ref !== undefined && p.kind === 'node') return p;
    return null;
  };
  const isBelow = (d: Draft, ancestor: Draft): boolean => {
    for (let p: Draft | null = d.parent; p; p = p.parent) if (p === ancestor) return true;
    return false;
  };
  const touchedBelow = (d: Draft): boolean => d.children.some((c) => c.gone || c.withheld || c.cleared || c.lostBelow > 0 || c.droppedChild || touchedBelow(c));
  const stubbedRefs = new Set<string>();

  const dropText = (target: Draft): void => {
    if (target.gone) return;
    target.gone = true;
    if (target.parent) {
      target.parent.droppedChild = true;
      target.parent.lostBelow++;
    }
    // a text line that carries a ref stays targetable as a valueless stub
    if (target.ref !== undefined) {
      target.gone = false;
      target.kind = 'node';
      target.role ||= 'text';
      target.text = '';
      target.interactive = false;
      target.withheld = true;
      target.cleared = true;
      counters.withheldKept++;
      return;
    }
    // the wrapper this line was flattened out of keeps its ref as a valueless stub
    if (target.viaRef && target.parent) {
      if (!stubbedRefs.has(target.viaRef.ref)) {
        stubbedRefs.add(target.viaRef.ref);
        const stub = makeDraft('node', { role: target.viaRef.role, ref: target.viaRef.ref, withheld: true, cleared: true, parent: target.parent });
        target.parent.children.splice(target.parent.children.indexOf(target), 0, stub);
        counters.withheldKept++;
      }
      return;
    }
    const claimant = owner(target);
    if (claimant && !claimant.withheld) {
      claimant.withheld = true;
      counters.withheldKept++;
    }
  };

  /** A direct hit on a name: the text lines the name was built from go with it; unrelated lines stay. */
  const dropContained = (target: Draft, name: string): void => {
    const compactName = compactText(fold(name));
    for (const kid of [...target.children]) {
      if (kid.kind !== 'text' || kid.gone) continue;
      const compactKid = compactText(fold(kid.text));
      if (compactKid !== '' && compactName.includes(compactKid)) dropText(kid);
    }
  };

  // A node whose name or placeholder was withheld in step 1 (a stub) loses the text lines that withheld string contains,
  // unless the string is explained by lines already withheld below it (`<a aria-label='Quillon Marsh'>Quillon</a>`).
  const stubs: { node: Draft; names: string[] }[] = [];
  const findStubs = (list: readonly Draft[]): void => {
    for (const d of list) {
      if (d.kind === 'node' && d.ghostNames.length > 0 && !touchedBelow(d)) stubs.push({ node: d, names: d.ghostNames });
      findStubs(d.children);
    }
  };
  findStubs(roots);
  for (const stub of stubs) for (const name of stub.names) dropContained(stub.node, name);

  const act = (part: Part, involvedOwners: ReadonlySet<Draft>): void => {
    if (part.field === 'ghost') {
      if (part.owner.primaryName) clearDraft(part.owner);
      return;
    }
    counters.withheldPrivate++;
    counters.splitWithheld++;
    const target = part.owner;
    if (part.field === 'text') {
      dropText(target);
      return;
    }
    if (target.cleared && target.rawName === '') return;
    // A name hit is EXPLAINED when text below the node was withheld in this pass or earlier: the name was built from it.
    let explained = touchedBelow(target);
    for (const other of involvedOwners) if (other !== target && isBelow(other, target)) explained = true;
    const name = target.rawName;
    clearDraft(target);
    if (target.ref !== undefined && !explained && !target.withheld) {
      target.withheld = true;
      counters.withheldKept++;
    }
    if (!explained && name !== '') dropContained(target, name);
  };

  const visit = (d: Draft): Part[] => {
    const own = ownParts(d);
    const parts: Part[] = [...own];
    for (const child of d.children) {
      const childParts = visit(child);
      if (child.withheld || child.cleared) {
        // a withheld child contributes only what was withheld from it (so neighbours still join to it), then a gap
        for (const part of childParts) if (part.field === 'ghost' || (part.field === 'name' && part.owner.primaryName && stillThere(part))) parts.push(part);
        parts.push({ text: GAP, owner: d, field: 'text' });
      } else for (const part of childParts) parts.push(part);
    }
    // a node with one child and no strings of its own has exactly its child's strings: already probed
    if (parts.length > 0 && !(d.children.length === 1 && own.length === 0)) {
      const indexes = probe(parts);
      // A node's own strings (name, placeholder, withheld ghosts) have no position among its content: they may sit
      // before, after or between the pieces below it, alone or in any order (`<button aria-label=Marsh>Quillon</button>`).
      if (own.length > 0) {
        const found = matcher.locateInserted(own.map((part) => part.text), parts.slice(own.length).map((part) => part.text));
        for (const index of found.insert) indexes.add(index);
        for (const index of found.seq) indexes.add(own.length + index);
      }
      const involvedOwners = new Set<Draft>();
      for (const index of indexes) {
        const part = parts[index];
        if (part && part.text !== GAP && part.field !== 'ghost') involvedOwners.add(part.owner);
      }
      for (const index of indexes) {
        const part = parts[index];
        if (part && part.text !== GAP) act(part, involvedOwners);
      }
    }
    return parts.map((part) => (part.text === GAP ? part : settle(part)));
  };
  visit(top);

  // Name-from-content taint: a node that claims withheld text, and every content-named ancestor above a
  // withheld descendant, renders no name, placeholder or url (rawName included, so `in` hints and scope
  // steps never use it). Author-named landmarks keep their names.
  // Known cost (kept for spike parity, WI-2 review F5): a ref-less author-named landmark or a combobox that claims withheld
  // text also loses its name, which costs scope names and intent evidence but never leaks.
  const taint = (d: Draft): boolean => {
    let below = false;
    for (const child of d.children) if (!child.gone && taint(child)) below = true;
    if (d.kind === 'node') {
      const claimed = d.withheld || d.lostBelow > 0 || d.droppedChild;
      if (claimed) clearDraft(d, true);
      else if (below && isContentNamed(d.role)) clearDraft(d, true);
    }
    return d.withheld || d.cleared || d.lostBelow > 0 || d.droppedChild || below;
  };
  for (const root of roots) taint(root);
  prune(roots);
}

// ---------------------------------------------------------------------------------------------------------------------
// Step 3: flatten, annotate, guard.

function flatten(roots: readonly Draft[]): RenderedTree {
  const nodes: RenderedNode[] = [];
  const rootKids: number[] = [];
  const visit = (d: Draft, parent: number, depth: number): void => {
    const index = nodes.length;
    const rendered: RenderedNode = {
      i: index, parent, depth, kids: [], kind: d.kind, role: d.role, name: d.name, rawName: d.rawName, primaryName: d.primaryName, ref: d.ref, states: d.states,
      placeholder: d.placeholder, url: d.url, box: d.box, interactive: d.interactive, clickable: d.clickable, withheld: d.withheld,
      cleared: d.cleared, tag: d.tag, text: d.text, coarse: d.coarse, what: d.what, ownText: '', near: undefined, inHint: undefined,
      ...(d.r7SourceRef ? { readScope: { relation: 'R7_ADJACENT_PUBLIC' as const, sourceRefs: [d.r7SourceRef] } } : {}),
      headers: undefined, groupName: undefined, siblings: undefined, ownTextUnknown: d.ownTextUnknown === true || d.lostBelow > 0 || d.droppedChild,
      ...(d.directTextAssertion ? { directTextAssertion: true } : {}),
    };
    nodes.push(rendered);
    for (const kid of d.children) {
      rendered.kids.push(nodes.length);
      visit(kid, index, depth + 1);
    }
  };
  for (const root of roots) {
    rootKids.push(nodes.length);
    visit(root, -1, 0);
  }
  return { nodes, rootKids };
}

/** Sanitizes the collected snapshot into the flat rendered tree (steps 1 to 3a). */
export function buildRendered(collected: CollectedPage, matcher: PrivateMatcher, counters: SanitizeCounters): RenderedTree {
  const roots = buildDrafts(collected, matcher, counters);
  const scrubOpaque = (draft: Draft): boolean => {
    const below = draft.children.map(scrubOpaque).some(Boolean);
    if (below && draft.kind === 'node') {
      clearDraft(draft); draft.ownTextUnknown = true;
      if (!draft.withheld) { draft.withheld = true; counters.withheldKept++; }
      delete draft.directTextAssertion;
    }
    return draft.opaquePublicSource === true || below;
  };
  roots.forEach(scrubOpaque);
  withholdSplit(roots, matcher, counters);
  const tree = flatten(roots);
  // Own visible text for the intent gate; a node that renders no name renders no own text either.
  for (const n of tree.nodes) {
    if (n.kind !== 'node') continue;
    const direct = n.kids.map(k => tree.nodes[k]).filter((k): k is RenderedNode => k?.kind === 'text').map(k => k.text).join(' ');
    if (Array.from(direct).length > 256) n.ownTextUnknown = true;
    n.ownText = n.cleared ? '' : bound(n.kids.map((k) => tree.nodes[k]).filter((k): k is RenderedNode => k?.kind === 'text').map((k) => k.text).join(' '), 256);
  }
  const unrepresented = (child: RenderedNode, completeName: string): boolean => {
    if (child.withheld || child.cleared || child.ownTextUnknown) return true;
    if (child.kind === 'text') return child.text !== '' && child.text !== completeName;
    if (child.rawName !== '' && child.rawName !== completeName) return true;
    return child.kids.some(i => { const below = tree.nodes[i]; return below ? unrepresented(below, completeName) : true; });
  };
  for (const n of tree.nodes) if (n.kind === 'node' && !n.directTextAssertion && n.kids.some(i => { const child = tree.nodes[i]; return child?.kind === 'node' && unrepresented(child, n.rawName); })) n.ownTextUnknown = true;
  return tree;
}

/** Context for controls the model cannot name from the accessible name alone: near, in, headers, group and sibling cells. */
export function annotate(tree: RenderedTree): void {
  const { nodes, rootKids } = tree;
  const at = (i: number): RenderedNode => {
    const n = nodes[i];
    if (!n) throw new Error('PERCEPTION_UNAVAILABLE');
    return n;
  };
  const siblingsOf = (n: RenderedNode): number[] => (n.parent < 0 ? rootKids : at(n.parent).kids);
  const ancestors = (n: RenderedNode): RenderedNode[] => {
    const out: RenderedNode[] = [];
    for (let p = n.parent; p >= 0; p = at(p).parent) out.push(at(p));
    return out;
  };
  const isDesc = (n: RenderedNode, ancestorIndex: number): boolean => {
    for (let p = n.parent; p >= 0; p = at(p).parent) if (p === ancestorIndex) return true;
    return false;
  };

  interface Item { n: RenderedNode; text: string; box: Box; coarse: boolean }
  const items: Item[] = [];
  for (const n of nodes) {
    if (!n.box || n.box.width <= 0 || n.box.height <= 0) continue;
    if (n.kind === 'text' && n.text.length <= 80) items.push({ n, text: n.text, box: n.box, coarse: n.coarse });
    else if (n.kind === 'node' && !n.interactive && n.rawName && LABEL_ROLES.has(n.role) && n.rawName.length <= 80) items.push({ n, text: n.rawName, box: n.box, coarse: false });
  }
  const geometric = items.filter((item) => !item.coarse);

  const near = (control: RenderedNode): string | null => {
    // 1. the text fragment immediately preceding the control in the same parent (no control in between)
    const sibs = siblingsOf(control);
    const position = sibs.indexOf(control.i);
    for (let j = position - 1; j >= 0; j--) {
      const s = at(sibs[j] ?? 0);
      if (s.kind === 'text') return s.text.length <= 80 ? s.text : null;
      if (s.interactive) break;
      if (s.kind === 'node' && s.rawName !== '' && s.rawName.length <= 80) return s.rawName;
    }
    const b = control.box;
    if (!b || b.width <= 0) return null;
    // 2. nearest text to the left in the same row band
    let best: { gap: number; h: number; text: string } | null = null;
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
    const groups = ancestors(control).filter((a) => a.kind === 'node' && GROUP_ROLES.has(a.role)).slice(0, 3);
    const scopes: (number | null)[] = [...groups.map((g) => g.i), null];
    for (const scope of scopes) {
      let top: { gap: number; dx: number; text: string } | null = null;
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
  const ordinals = new Map<number, { k: number; total: number }>();
  const containers: { kids: number[] }[] = [{ kids: rootKids }, ...nodes];
  for (const n of containers) {
    const byRole = new Map<string, number[]>();
    for (const k of n.kids) {
      const kid = at(k);
      if (kid.kind === 'node' && HINT_ROLES.has(kid.role) && !kid.rawName) {
        const list = byRole.get(kid.role) ?? [];
        list.push(k);
        byRole.set(kid.role, list);
      }
    }
    for (const list of byRole.values()) if (list.length > 1) list.forEach((i, position) => ordinals.set(i, { k: position + 1, total: list.length }));
  }

  const hint = (control: RenderedNode): string | null => {
    const parts: string[] = [];
    for (const a of ancestors(control)) {
      if (a.kind !== 'node' || !HINT_ROLES.has(a.role)) continue;
      const label = a.rawName ? bound(a.rawName, 40).replace(/'/gu, '’') : '';
      if (!label && (a.role === 'group' || a.role === 'row' || a.role === 'listitem' || a.role === 'article' || a.role === 'region')) {
        if (a.role === 'group' || a.role === 'region') continue;
      }
      const ordinal = ordinals.get(a.i);
      parts.push(label ? `${a.role} '${label}'` : ordinal ? `${a.role}#${String(ordinal.k)}/${String(ordinal.total)}` : a.role);
      if (parts.length >= 3) break;
    }
    return parts.length ? parts.join(' > ') : null;
  };

  // Table cells: the names of the row's rowheader(s) and of the column's columnheader (found by horizontal overlap).
  const TABLE_ROLES = new Set(['table', 'grid', 'treegrid']);
  const tableOf = (n: RenderedNode): RenderedNode | undefined => ancestors(n).find((a) => a.kind === 'node' && TABLE_ROLES.has(a.role));
  const columnHeaders = new Map<number, RenderedNode[]>();
  for (const n of nodes) {
    if (n.kind !== 'node' || n.role !== 'columnheader' || !n.rawName || !n.box || n.box.width <= 0) continue;
    const table = tableOf(n);
    if (table) columnHeaders.set(table.i, [...(columnHeaders.get(table.i) ?? []), n]);
  }
  for (const n of nodes) {
    if (n.kind !== 'node' || (n.role !== 'cell' && n.role !== 'gridcell')) continue;
    const headers: string[] = [];
    const parentNode = n.parent >= 0 ? at(n.parent) : undefined;
    const row = parentNode?.kind === 'node' && parentNode.role === 'row' ? parentNode : null;
    if (row) {
      for (const k of row.kids) {
        const sibling = at(k);
        if (sibling.kind === 'node' && sibling.role === 'rowheader' && sibling.rawName) headers.push(sibling.rawName);
      }
    }
    const table = tableOf(n);
    if (table && n.box && n.box.width > 0) {
      const center = n.box.x + n.box.width / 2;
      let best: RenderedNode | null = null;
      for (const header of columnHeaders.get(table.i) ?? []) {
        const h = header.box;
        if (!h) continue;
        if (center < h.x || center > h.x + h.width || h.y + h.height > n.box.y + 2) continue;
        const bestBox = best?.box;
        if (!best || !bestBox || h.y + h.height > bestBox.y + bestBox.height) best = header;
      }
      if (best) headers.push(best.rawName);
    }
    const unique = [...new Set(headers.map((header) => bound(header, 80)))];
    if (unique.length) n.headers = unique;
    // Row sibling cells (ADR D3): the other cells of the row, in order, never a withheld one.
    if (row) {
      const siblings: string[] = [];
      for (const k of row.kids) {
        const sibling = at(k);
        if (sibling === n || sibling.kind !== 'node' || (sibling.role !== 'cell' && sibling.role !== 'gridcell')) continue;
        if (sibling.withheld || sibling.cleared || sibling.rawName === '') continue;
        siblings.push(bound(sibling.rawName, SIBLING_CHARS));
      }
      if (siblings.length) n.siblings = siblings;
    }
  }

  // Evidence by containment (ADR-SC-007 rehearsal R2): a link, text or other node inside a cell carries the header and row-sibling evidence of its NEAREST
  // enclosing cell, never beyond a nested table. The copies come from cells that were already sanitized (a withheld cell contributes nothing).
  const CELL_ROLES = new Set(['cell', 'gridcell']);
  for (const n of nodes) {
    if (n.kind === 'node' && CELL_ROLES.has(n.role)) continue;
    let cell: RenderedNode | null = null;
    for (let p = n.parent; p >= 0; p = at(p).parent) {
      const a = at(p);
      if (a.kind !== 'node') continue;
      if (TABLE_ROLES.has(a.role)) break;
      if (CELL_ROLES.has(a.role)) { cell = a; break; }
    }
    if (!cell || n.withheld || n.cleared) continue;
    if (cell.headers && !n.headers) n.headers = [...cell.headers];
    if (cell.siblings && !n.siblings) n.siblings = [...cell.siblings];
  }

  // An unnamed non-interactive node (a heading whose only content is a link, a list item, a term) falls back to its descendant text, at most 80 characters.
  const TEXT_FALLBACK_ROLES = new Set(['heading', 'listitem', 'cell', 'gridcell', 'rowheader', 'columnheader', 'term', 'definition']);
  const descendantText = (n: RenderedNode, out: string[]): void => {
    for (const k of n.kids) {
      const kid = at(k);
      if (kid.withheld || kid.cleared) continue;
      if (kid.kind === 'text') out.push(kid.text);
      else descendantText(kid, out);
    }
  };
  for (const n of nodes) {
    if (n.kind !== 'node' || !TEXT_FALLBACK_ROLES.has(n.role) || n.withheld || n.cleared || n.rawName !== '' || n.ownText !== '') continue;
    const parts: string[] = [];
    descendantText(n, parts);
    const text = bound(parts.join(' ').replace(/\s+/gu, ' ').trim(), 80);
    if (text !== '') n.fallbackText = text;
  }

  // Option-like controls: the name of the nearest enclosing radiogroup / group / listbox / menu.
  const GROUPED_ROLES = new Set(['radio', 'checkbox', 'option', 'menuitemradio', 'menuitemcheckbox']);
  const GROUP_NAME_ROLES = new Set(['radiogroup', 'group', 'listbox', 'menu']);
  for (const n of nodes) {
    if (n.kind !== 'node' || !GROUPED_ROLES.has(n.role)) continue;
    const group = ancestors(n).find((a) => a.kind === 'node' && GROUP_NAME_ROLES.has(a.role) && a.rawName);
    if (group) n.groupName = bound(group.rawName, 80);
  }

  const keyCounts = new Map<string, number>();
  for (const n of nodes) {
    if (n.kind === 'node' && n.interactive && n.rawName) {
      const key = `${n.role}|${n.rawName}`;
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
  }
  for (const n of nodes) {
    if (n.kind !== 'node' || !n.interactive) continue;
    if (!n.rawName) {
      const nearText = n.cleared ? null : near(n);
      if (nearText) n.near = bound(nearText, 80);
      n.inHint = hint(n);
    } else if ((keyCounts.get(`${n.role}|${n.rawName}`) ?? 0) > 1) n.inHint = hint(n);
  }
}

/** Final leak guard on the derived strings (near / in / group / headers / sibling cells are built from other nodes' text). */
export function guardDerived(tree: RenderedTree, matcher: PrivateMatcher, counters: SanitizeCounters): void {
  if (matcher.count === 0) return;
  let revokedPrimary = false;
  for (const n of tree.nodes) {
    const hadPrimary = n.primaryName;
    // Preserve the participation evidence before any independently private derived field is dropped.
    if (hadPrimary && shownRef(n) !== undefined) guardJoined(n, matcher, counters);
    if (n.near !== undefined && matcher.hitSplit([n.near])) {
      n.near = undefined;
      counters.withheldPrivate++;
    }
    if (n.inHint && matcher.hitSplit([n.inHint])) {
      n.inHint = null;
      counters.withheldPrivate++;
    }
    if (n.fallbackText !== undefined && matcher.hitSplit([n.fallbackText])) {
      n.fallbackText = undefined;
      counters.withheldPrivate++;
    }
    if (n.groupName !== undefined && matcher.hitSplit([n.groupName])) {
      n.groupName = undefined;
      counters.withheldPrivate++;
    }
    for (const key of ['headers', 'siblings'] as const) {
      const list = n[key];
      if (!list) continue;
      const clean = list.filter((entry) => !matcher.hitSplit([entry]));
      if (clean.length !== list.length) counters.withheldPrivate++;
      n[key] = clean.length ? clean : undefined;
    }
    if (shownRef(n) !== undefined) guardJoined(n, matcher, counters);
    if (hadPrimary && !n.primaryName) {
      revokedPrimary = true;
      for (let parent = n.parent; parent >= 0;) {
        const ancestor = tree.nodes[parent];
        if (!ancestor) break;
        if (ancestor.kind === 'node' && isContentNamed(ancestor.role) && !ancestor.primaryName) {
          ancestor.name = ''; ancestor.rawName = ''; ancestor.placeholder = undefined; ancestor.url = undefined;
          ancestor.ownText = ''; ancestor.cleared = true;
        }
        parent = ancestor.parent;
      }
    }
  }
  if (revokedPrimary) {
    // Annotation may already have copied this name into another ref's near/header view. Rebuild
    // those fields from the now-sanitized tree; each repeat permanently revokes at least one name.
    for (const n of tree.nodes) {
      n.near = undefined; n.inHint = undefined; n.headers = undefined; n.siblings = undefined;
      n.groupName = undefined; n.fallbackText = undefined;
    }
    annotate(tree);
    guardDerived(tree, matcher, counters);
  }
}

/**
 * The strings a ref's evidence and line are made of can join into a private value even when each is clean
 * (a `near` label and a name). While the joined strings hit, the last involved derived string (`near`, `in`,
 * group, header, sibling cell) is dropped; strings that are the node's own are settled by step 2.
 */
function guardJoined(n: RenderedNode, matcher: PrivateMatcher, counters: SanitizeCounters): void {
  const normal = (value: string): string => value.replace(/\s+/gu, ' ').trim();
  for (;;) {
    const parts: { text: string; name?: boolean; drop?: () => void }[] = evidenceParts(n, true).map((part) => {
      const text = part.text;
      const drop = part.field === 'near' ? () => { n.near = undefined; }
        : part.field === 'group' ? () => { n.groupName = undefined; }
          : part.field === 'text' && n.kind !== 'text' ? () => { n.fallbackText = undefined; }
          : part.field === 'header' ? () => { n.headers = n.headers?.filter((h) => normal(h) !== text); if (n.headers?.length === 0) n.headers = undefined; }
            : part.field === 'sibling' ? () => { n.siblings = n.siblings?.filter((h) => normal(h) !== text); if (n.siblings?.length === 0) n.siblings = undefined; }
              : undefined;
      return drop ? { text, drop } : { text, name: part.field === 'name' };
    });
    if (n.inHint) {
      const hint = n.inHint;
      parts.push({ text: hint, drop: () => { n.inHint = null; } });
    }
    if (parts.length < 2) return;
    const found = [...matcher.locateSplit(parts.map((part) => part.text))].sort((a, b) => b - a);
    if (found.length === 0) return;
    if (n.primaryName && found.some((index) => parts[index]?.name)) {
      n.primaryName = false;
      n.name = '';
      n.rawName = '';
      n.placeholder = undefined;
      n.url = undefined;
      n.ownText = '';
      n.cleared = true;
      if (!n.withheld) { n.withheld = true; counters.withheldKept++; }
      counters.withheldPrivate++;
      continue;
    }
    const droppable = found.map((index) => parts[index]).find((part) => part?.drop !== undefined);
    if (!droppable?.drop) return;
    droppable.drop();
    counters.withheldPrivate++;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Rendering.

/** Refs are shown on lines the model may legitimately name: controls, named nodes, clickable generics and text. Not bare containers. */
const showRef = (n: RenderedNode): boolean => n.ref !== undefined && (n.interactive || n.clickable || n.withheld || Boolean(n.name) || n.role === 'heading' || n.role === 'img' || n.directTextAssertion === true || n.linkValueCell === true);

/** The ref a rendered line shows, if any. */
export function shownRef(n: RenderedNode): string | undefined {
  if (n.ref === undefined) return undefined;
  if (n.kind === 'text') return n.ref;
  return n.kind === 'node' && showRef(n) ? n.ref : undefined;
}

export function renderLine(n: RenderedNode): string {
  const pad = '  '.repeat(n.depth);
  switch (n.kind) {
    case 'password': return `${pad}- passwordControl`;
    case 'withheld': return `${pad}- withheld {sensitive}`;
    case 'unsupported': return `${pad}- ${n.what} {unsupported surface}`;
    case 'text': {
      const ordinal = n.ordinal ? ` {ordinal=${String(n.ordinal.index)}/${String(n.ordinal.count)}}` : '';
      if (n.role === 'paragraph' || n.role === 'strong') return `${pad}- ${n.role}${n.ref ? ` [${n.ref}]` : ''} {text=${quote(n.text)}}${ordinal}`;
      return `${pad}- text ${quote(n.text)}${n.ref ? ` [${n.ref}]` : ''}${ordinal}`;
    }
    case 'node': {
      let line = `${pad}- ${n.role}`;
      if (n.name) line += ` ${quote(n.name)}`;
      if (n.ref && showRef(n)) line += ` [${n.ref}]`;
      if (n.ordinal) line += ` {ordinal=${String(n.ordinal.index)}/${String(n.ordinal.count)}}`;
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

export type ProjectionTier = 'focus+parent+siblings' | 'focus+parent' | 'focus' | 'truncated';

export interface Projection {
  keptIndexes: number[];
  lines: string[];
  tier: ProjectionTier;
  notShown: number;
}

/** Deterministic step-focused projection (INTERFACES focus budget). */
export function project(nodes: readonly RenderedNode[], lines: readonly string[], o: { stepText?: string; targetIntent?: string; maxBytes?: number } = {}): Projection {
  const maxBytes = o.maxBytes ?? OUTLINE_BYTES;
  const focus = new Set([...words(o.stepText ?? ''), ...words(o.targetIntent ?? '')].filter((word) => !STOP.has(word)));
  const intentWords = new Set(words(o.targetIntent ?? '').filter((word) => !STOP.has(word)));
  const base = new Set<number>();
  /** Nodes kept because their own words match the step or the target intent (not landmarks, kept parents or neighbours). */
  const matched: number[] = [];
  /** The subset of `matched` whose own words hit the TARGET INTENT words: their rows are chosen first and seeded in the truncated tier. */
  const intentMatched = new Set<number>();
  /** The subset of `intentMatched` where one text of the node carries every target-intent word (a label naming the whole intent): only these rows are seeded. */
  const intentFull = new Set<number>();
  const hitWords = (n: RenderedNode, wordSet: ReadonlySet<string>): boolean => {
    if (wordSet.size === 0) return false;
    if (n.kind === 'node') {
      if ([n.rawName, n.placeholder, n.near, n.ownText].some((text) => text && words(text).some((w) => wordSet.has(w)))) return true;
      return n.withheld && [n.groupName, ...(n.headers ?? [])].some((text) => text && words(text).some((w) => wordSet.has(w)));
    }
    if (n.kind === 'password' || n.kind === 'withheld' || n.kind === 'unsupported') return false;
    return words(n.text).some((w) => wordSet.has(w));
  };
  nodes.forEach((n, i) => {
    let keep = false;
    let hit = false;
    if (n.kind === 'password' || n.kind === 'withheld' || n.kind === 'unsupported') keep = true;
    else if (n.kind === 'node') {
      keep = LANDMARK_ROLES.has(n.role) || n.role === 'heading' || FORM_CONTROL_ROLES.has(n.role);
      if (focus.size) hit = [n.rawName, n.placeholder, n.near, n.ownText].some((text) => text && words(text).some((w) => focus.has(w)));
      // A valueless {value withheld} line has no text of its own: its row / column headers and group name are what a step can name it by.
      if (!hit && focus.size && n.withheld) hit = [n.groupName, ...(n.headers ?? [])].some((text) => text && words(text).some((w) => focus.has(w)));
      keep = keep || hit;
    } else {
      hit = words(n.text).some((w) => focus.has(w));
      keep = hit;
    }
    if (keep) base.add(i);
    if (hit) {
      matched.push(i);
      if (hitWords(n, intentWords)) {
        intentMatched.add(i);
        const texts = n.kind === 'node' ? [n.rawName, n.placeholder, n.near, n.ownText] : n.kind === 'text' ? [n.text] : [];
        if (texts.some((text) => { const tokens = text ? new Set(words(text)) : undefined; return tokens !== undefined && [...intentWords].every((w) => tokens.has(w)); })) intentFull.add(i);
      }
    }
  });
  // Rows around a matched node (ADR-SC-007 rehearsal R3): the matched row's other cells (a label's value), or the term / definition pair. At most
  // ROW_CAP rows and ROW_CELL_CAP cells each, a cell's text at most 80 characters; withheld cells keep their withheld line. Kept at every tier, so a byte
  // budget drops parents and neighbours before it drops these.
  const rowKeep = new Set<number>();
  /** Rows reached from a node naming the whole target intent, in priority order, each with its own lines (the truncated tier seeds these). */
  const intentRows: number[][] = [];
  {
    const rows = new Set<number>();
    const cellLines = (cell: number): number[] => {
      const out: number[] = [cell];
      const walk = (i: number): void => {
        for (const k of nodes[i]?.kids ?? []) {
          const kid = nodes[k];
          if (!kid || out.length > ROW_DESCENDANT_CAP) continue;
          if (kid.kind === 'text' && kid.text.length > 80) continue;
          out.push(k);
          walk(k);
        }
      };
      walk(cell);
      return out;
    };
    // Rows matched by the target intent come first; generic step words must not use up ROW_CAP before them.
    const prioritised = [...matched.filter((i) => intentMatched.has(i)), ...matched.filter((i) => !intentMatched.has(i))];
    for (const i of prioritised) {
      if (rows.size >= ROW_CAP) break;
      const rowLines = new Set<number>();
      const addLine = (line: number): void => { rowKeep.add(line); rowLines.add(line); };
      let anchor: number | undefined;
      for (let p = i; p >= 0; p = nodes[p]?.parent ?? -1) {
        const a = nodes[p];
        if (a?.kind === 'node' && (a.role === 'row' || a.role === 'term' || a.role === 'definition')) { anchor = p; break; }
        if (a?.kind === 'node' && TABLE_ROLE_NAMES.has(a.role)) break;
      }
      if (anchor === undefined || rows.has(anchor)) continue;
      rows.add(anchor);
      const a = nodes[anchor];
      if (a?.role === 'row') {
        for (const k of (a.kids).slice(0, ROW_CELL_CAP)) {
          const cell = nodes[k];
          if (cell?.kind !== 'node') continue;
          for (const line of cellLines(k)) addLine(line);
        }
        addLine(anchor);
      } else {
        const sibs = a?.parent !== undefined && a.parent >= 0 ? (nodes[a.parent]?.kids ?? []) : nodes.filter((x) => x.parent < 0).map((x) => x.i);
        const position = sibs.indexOf(anchor);
        const mate = a?.role === 'term' ? sibs[position + 1] : sibs[position - 1];
        const mateNode = mate === undefined ? undefined : nodes[mate];
        addLine(anchor);
        if (mate !== undefined && mateNode?.kind === 'node' && (mateNode.role === 'definition' || mateNode.role === 'term') && mateNode.role !== a?.role) {
          for (const line of cellLines(mate)) addLine(line);
          for (const line of cellLines(anchor)) addLine(line);
        }
      }
      if (intentFull.has(i)) intentRows.push([...rowLines]);
    }
  }
  // A kept combobox / listbox keeps its options (first OPTION_CAP), so a step naming an option that does not exist still sees what does.
  const optionGroups: { options: number[] }[] = [];
  const beyondCap = new Set<number>();
  const optionsOf = (control: number): number[] => {
    const out: number[] = [];
    const walk = (i: number): void => {
      for (const k of nodes[i]?.kids ?? []) {
        const kid = nodes[k];
        if (kid?.kind !== 'node') continue;
        if (kid.role === 'option') out.push(k);
        else if (kid.role === 'group') walk(k);
      }
    };
    walk(control);
    return out;
  };
  for (const i of [...base]) {
    const n = nodes[i];
    if (n?.kind !== 'node' || (n.role !== 'combobox' && n.role !== 'listbox')) continue;
    const options = optionsOf(i);
    if (options.length === 0) continue;
    optionGroups.push({ options });
    for (const k of options.slice(0, OPTION_CAP)) base.add(k);
    for (const k of options.slice(OPTION_CAP)) if (!base.has(k)) beyondCap.add(k);
  }
  /** Per kept control: a `… N more options` line after its last kept option when some of its options are not shown. */
  const extrasFor = (keep: ReadonlySet<number>): Map<number, string> => {
    const out = new Map<number, string>();
    for (const { options } of optionGroups) {
      const kept = options.filter((k) => keep.has(k));
      const remaining = options.length - kept.length;
      const anchor = kept.at(-1);
      if (kept.length > 0 && remaining > 0 && anchor !== undefined) out.set(anchor, `${'  '.repeat(nodes[anchor]?.depth ?? 0)}… ${String(remaining)} more options`);
    }
    return out;
  };
  const rootKids = nodes.filter((n) => n.parent < 0).map((n) => n.i);
  const byRef = new Map(nodes.flatMap(n => n.ref ? [[n.ref, n] as const] : []));
  const expand = (withParent: boolean, withSiblings: boolean): Set<number> => {
    const keep = new Set([...base, ...rowKeep]);
    for (const i of base) {
      const n = nodes[i];
      if (!n) continue;
      if (withParent && n.parent >= 0) keep.add(n.parent);
      if (withSiblings) {
        const sibs = n.parent < 0 ? rootKids : (nodes[n.parent]?.kids ?? []);
        const position = sibs.indexOf(i);
        const before = sibs[position - 1];
        const after = sibs[position + 1];
        if (position > 0 && before !== undefined) keep.add(before);
        if (position < sibs.length - 1 && after !== undefined) keep.add(after);
      }
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const i of [...keep]) {
        const n = nodes[i]; if (!n) continue;
        for (const ref of [...(n.scopeRefs ?? []), ...(n.readScope?.sourceRefs ?? [])]) {
          const source = byRef.get(ref); if (source && !keep.has(source.i)) { keep.add(source.i); grew = true; }
        }
        if (n.ordinal) for (const peer of nodes) {
          if (peer.ordinal?.count === n.ordinal.count && peer.role === n.role && peer.rawName === n.rawName && evidenceFor(peer) === evidenceFor(n) && !keep.has(peer.i)) { keep.add(peer.i); grew = true; }
        }
      }
    }
    for (const k of beyondCap) keep.delete(k);
    return keep;
  };
  const measure = (keep: ReadonlySet<number>): number => {
    let bytes = 0;
    keep.forEach((i) => { bytes += utf8(lines[i] ?? '') + 1; });
    extrasFor(keep).forEach((line) => { bytes += utf8(line) + 1; });
    return bytes;
  };
  const total = nodes.length;
  const finish = (keep: ReadonlySet<number>, tier: ProjectionTier): Projection => {
    const kept = [...keep].sort((a, b) => a - b);
    const extras = extrasFor(keep);
    const shown: string[] = [];
    for (const i of kept) {
      shown.push(lines[i] ?? '');
      const extra = extras.get(i);
      if (extra !== undefined) shown.push(extra);
    }
    return { keptIndexes: kept, lines: shown, tier, notShown: total - kept.length };
  };
  const tails = (notShown: number): string => `… ${String(notShown)} more nodes not shown`;
  const tiers: [ProjectionTier, boolean, boolean][] = [['focus+parent+siblings', true, true], ['focus+parent', true, false], ['focus', false, false]];
  for (const [tier, withParent, withSiblings] of tiers) {
    const keep = expand(withParent, withSiblings);
    if (measure(keep) + utf8(tails(total)) <= maxBytes) return finish(keep, tier);
  }
  // Last resort: the target-intent rows (with their scope / readScope source closure), then the base set in order, cut at the byte budget.
  // A value cell is never kept without its sources: a row that does not fit whole is dropped, from the end of the priority order.
  const ordered = [...base].sort((a, b) => a - b);
  const keep = new Set<number>();
  const seeded = new Set<number>();
  let bytes = utf8(tails(total));
  for (const rowLines of intentRows) {
    const closure = new Set(rowLines);
    const pending = [...rowLines];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      const n = nodes[next];
      if (!n) continue;
      for (const ref of [...(n.scopeRefs ?? []), ...(n.readScope?.sourceRefs ?? [])]) {
        const source = byRef.get(ref);
        if (source && !closure.has(source.i)) { closure.add(source.i); pending.push(source.i); }
      }
    }
    const fresh = [...closure].filter((i) => !keep.has(i) && !beyondCap.has(i));
    const cost = fresh.reduce((sum, i) => sum + utf8(lines[i] ?? '') + 1, 0);
    if (bytes + cost > maxBytes) break;
    for (const i of fresh) { keep.add(i); seeded.add(i); }
    bytes += cost;
  }
  for (const i of ordered) {
    if (keep.has(i)) continue;
    const cost = utf8(lines[i] ?? '') + 1;
    if (bytes + cost > maxBytes) break;
    keep.add(i);
    bytes += cost;
  }
  // The `… N more options` lines are extra bytes: drop trailing kept nodes until the whole thing fits, unseeded nodes before seeded ones.
  while (keep.size > 0 && measure(keep) + utf8(tails(total)) > maxBytes) {
    const sorted = [...keep].sort((a, b) => a - b);
    const last = sorted.filter((i) => !seeded.has(i)).at(-1) ?? sorted.at(-1);
    if (last === undefined) break;
    keep.delete(last);
    seeded.delete(last);
  }
  return finish(keep, 'truncated');
}

export interface Outline {
  readonly text: string;
  readonly bytes: number;
  readonly totalNodes: number;
  readonly shownNodes: number;
  readonly projected: boolean;
  readonly projectionTier: ProjectionTier | null;
  readonly notShown: number;
}

// ---------------------------------------------------------------------------------------------------------------------
// Facts and evidence.

export type EvidenceField = 'name' | 'placeholder' | 'near' | 'ownText' | 'text' | 'group' | 'header' | 'sibling';

export interface EvidenceSegment {
  readonly field: EvidenceField;
  readonly start: number;
  readonly end: number;
  readonly purpose?: 'READ_ASSERT_ONLY';
}

export interface RefFacts {
  readonly directTextAssertion?: true;
  readonly role: string;
  readonly name: string;
  readonly editable: boolean;
  readonly nameComplete: boolean;
  readonly ownTextComplete: boolean;
  readonly ordinal?: { index: number; count: number };
  readonly scopeRefs?: string[];
  readonly readScope?: NonNullable<ElementFacts['readScope']>;
  readonly nearSource?: 'WITHHELD_ADJACENT_PUBLIC';
  readonly evidence: string;
  readonly text?: string;
}
export type Facts = Readonly<Record<string, RefFacts>>;

/** The ordered strings that make up a node's evidence. */
function evidenceParts(n: RenderedNode, withSiblings: boolean): { field: EvidenceField; text: string }[] {
  const out: { field: EvidenceField; text: string }[] = [];
  const push = (field: EvidenceField, value: string | undefined): void => {
    if (value === undefined) return;
    const text = value.replace(/\s+/gu, ' ').trim();
    if (text !== '') out.push({ field, text });
  };
  push('name', n.rawName);
  push('placeholder', n.placeholder);
  if (!n.nearReadOnly) push('near', n.near);
  push('ownText', n.ownText);
  push('text', n.kind === 'text' ? n.text : n.fallbackText);
  push('group', n.groupName);
  for (const header of n.headers ?? []) push('header', header);
  if (withSiblings) for (const sibling of n.siblings ?? []) push('sibling', sibling);
  // New context never truncates an existing own/header/sibling segment to make room.
  // Every independently certified source remains one segment; words cannot splice across sources.
  if (n.nearReadOnly && n.near !== undefined && n.readContext) {
    const complete = [...out.map(p => p.text), ...n.readContext].join(' ');
    if (Array.from(complete).length <= EVIDENCE_CHARS) for (const text of n.readContext) push('near', text);
  }
  return out;
}

function composeEvidence(n: RenderedNode, withSiblings: boolean): { evidence: string; segments: EvidenceSegment[] } {
  const parts = evidenceParts(n, withSiblings);
  const joined = parts.map((part) => part.text).join(' ');
  const chars = Array.from(joined);
  const evidence = chars.length <= EVIDENCE_CHARS ? joined : `${chars.slice(0, EVIDENCE_CHARS - 1).join('')}…`;
  const limit = chars.length <= EVIDENCE_CHARS ? joined.length : chars.slice(0, EVIDENCE_CHARS - 1).join('').length;
  const segments: EvidenceSegment[] = [];
  let offset = 0;
  for (const part of parts) {
    const start = offset;
    const end = offset + part.text.length;
    offset = end + 1;
    if (start >= limit) break;
    segments.push({ field: part.field, start, end: Math.min(end, limit), ...(part.field === 'near' && n.nearReadOnly ? { purpose: 'READ_ASSERT_ONLY' as const } : {}) });
  }
  return { evidence, segments };
}

/** Evidence string for the intent gate (the spike's evidenceFor, plus row sibling cells for cells). */
export function evidenceFor(n: RenderedNode | undefined, options: { siblings?: boolean } = {}): string {
  return n ? composeEvidence(n, options.siblings !== false).evidence : '';
}

/** Where each field of `evidenceFor(n)` sits in the evidence string (code-unit offsets). */
export function evidenceSegments(n: RenderedNode): readonly EvidenceSegment[] {
  return composeEvidence(n, true).segments;
}

const NO_TEXT_ROLES = new Set(['combobox', 'textbox', 'searchbox', 'spinbutton', 'slider', 'listbox']);

/** Facts for every shown ref (kind node or text), in tree order. */
export function deriveFacts(tree: RenderedTree, shown: ReadonlySet<number>): { facts: Facts; segments: Record<string, readonly EvidenceSegment[]> } {
  const { nodes } = tree;
  const facts: Record<string, RefFacts> = {};
  const segments: Record<string, readonly EvidenceSegment[]> = {};
  const hidden = (n: RenderedNode): boolean => n.withheld || n.kind === 'password' || n.kind === 'withheld' || n.kind === 'unsupported' || n.kids.some((k) => { const kid = nodes[k]; return kid ? hidden(kid) : false; });
  const printedTexts = (n: RenderedNode): string[] => {
    const out: string[] = [];
    const walk = (d: RenderedNode): void => {
      for (const k of d.kids) {
        const kid = nodes[k];
        if (!kid) continue;
        if (kid.kind === 'node' && kid.name) out.push(bound(kid.name));
        if (kid.kind === 'text') out.push(bound(kid.text));
        walk(kid);
      }
    };
    walk(n);
    return out;
  };
  for (const i of [...shown].sort((a, b) => a - b)) {
    const n = nodes[i];
    const ref = n ? shownRef(n) : undefined;
    if (!n || ref === undefined || facts[ref] !== undefined) continue;
    const editable = n.states.includes('editable') || (n.role === 'combobox' && (n.tag === 'input' || n.tag === 'textarea'));
    const { evidence, segments: parts } = composeEvidence(n, true);
    const own = n.ownText;
    const ownPart = parts.find(p => p.field === 'ownText');
    const nameComplete = (!n.withheld && !n.cleared || n.primaryName === true) && Array.from(n.rawName).length <= 256;
    const ownTextComplete = !n.withheld && !n.cleared && !n.ownTextUnknown
      && (n.kind !== 'text' || n.text === '' || ownPart !== undefined && evidence.slice(ownPart.start, ownPart.end) === n.text)
      && (own === '' || ownPart !== undefined && evidence.slice(ownPart.start, ownPart.end) === own);
    const entry: { role: string; name: string; editable: boolean; evidence: string; text?: string; nameComplete: boolean; ownTextComplete: boolean; ordinal?: { index: number; count: number }; scopeRefs?: string[]; readScope?: NonNullable<ElementFacts['readScope']>; nearSource?: 'WITHHELD_ADJACENT_PUBLIC' } = {
      role: n.role || (n.kind === 'text' ? 'text' : n.role), name: bound(n.rawName, 256), editable, evidence, nameComplete, ownTextComplete,
      ...(n.ordinal ? { ordinal: n.ordinal } : {}),
    };
    if (!NO_TEXT_ROLES.has(entry.role) && !hidden(n)) {
      const own = n.kind === 'text' ? bound(n.text) : n.name ? bound(n.name) : '';
      entry.text = bound([own, ...printedTexts(n)].filter((part) => part !== '').join(' '), 256);
    }
    facts[ref] = entry;
    const completePublic = (node: RenderedNode): boolean => !node.withheld && !node.cleared && !node.ownTextUnknown
      && Array.from(node.rawName).length <= 256 && Array.from(node.text).length <= 256
      && ['node','text'].includes(node.kind) && node.kids.every(i => { const child = nodes[i]; return child !== undefined && completePublic(child); });
    if (n.directTextAssertion && ownTextComplete && own !== '' && n.rawName === '' && completePublic(n)) Object.assign(entry, { directTextAssertion: true, text: own });
    segments[ref] = parts;
  }
  const sourceNodes = new Map(nodes.flatMap(n => { const ref = shownRef(n); return ref ? [[ref, n] as const] : []; }));
  const cleanSource = (ref: string, target: string): boolean => {
    const source = facts[ref], node = sourceNodes.get(ref);
    return ref !== target && source !== undefined && source.nameComplete && source.name !== '' && Array.from(source.name).length <= 80
      && node !== undefined && !node.withheld && !node.cleared && (!node.interactive || node.role === 'link') && !node.clickable;
  };
  for (const n of nodes) {
    const ref = shownRef(n), fact = ref ? facts[ref] : undefined;
    if (!ref || !fact) continue;
    const scopeRefs = n.scopeRefs;
    const readScope = n.readScope;
    if (scopeRefs?.length && scopeRefs.length <= 8 && scopeRefs.every(r => cleanSource(r, ref))) Object.assign(fact, { scopeRefs });
    if (readScope && readScope.sourceRefs.length <= 8 && readScope.sourceRefs.every(r => cleanSource(r, ref))) Object.assign(fact, { readScope });
    if (n.nearReadOnly && n.near && readScope?.relation === 'R7_ADJACENT_PUBLIC' && fact.readScope) Object.assign(fact, { nearSource: 'WITHHELD_ADJACENT_PUBLIC' });
  }
  return { facts, segments };
}

// ---------------------------------------------------------------------------------------------------------------------
// perceive().

export interface PerceiveOptions {
  readonly cdp: CdpSession;
  readonly engine?: PerceptionEngine;
  readonly inventory: PrivateInventory;
  readonly privateValues?: readonly string[];
  readonly stepText?: string;
  readonly targetIntents?: readonly string[];
  readonly maxBytes?: number;
  readonly resolveBackendIds?: boolean;
  /** Work budget of the D1 probes, in character comparisons. */
  readonly workBudgetUnits?: number;
}

export interface Perception {
  readonly outline: Outline;
  readonly facts: Facts;
  readonly evidenceSegments: Readonly<Record<string, readonly EvidenceSegment[]>>;
  readonly backendNodeIds: Readonly<Record<string, number>>;
  readonly origin: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly counters: SanitizeCounters;
  readonly engine: PerceptionEngine;
}

/** What synthesis needs from a perception: the rendered nodes. Kept out of the enumerable result. */
export interface PerceptionInternals {
  readonly tree: RenderedTree;
  readonly byRef: ReadonlyMap<string, RenderedNode>;
  /** The caller's private values of this perception: synthesis must keep them out of locators too. */
  readonly privateValues: readonly string[];
}
const internals = new WeakMap<Perception, PerceptionInternals>();
export function internalsOf(perception: Perception): PerceptionInternals | undefined {
  return internals.get(perception);
}

function collectedShape(value: unknown): CollectedPage {
  if (typeof value !== 'object' || value === null) throw new Error('PERCEPTION_UNAVAILABLE');
  const v = value as Partial<CollectedPage>;
  const facts: unknown = v.facts;
  if (!Array.isArray(v.json) || typeof facts !== 'object' || facts === null || !Array.isArray(v.echo) || typeof v.origin !== 'string') {
    throw new Error('PERCEPTION_UNAVAILABLE');
  }
  return { json: v.json, facts: facts as CollectedPage['facts'], echo: v.echo, viewport: v.viewport ?? { width: 0, height: 0 }, origin: v.origin, canvases: typeof v.canvases === 'number' ? v.canvases : 0 };
}

/** Runs the page-side inventory in the engine's isolated world and merges it into `inventory` (fail closed). */
export async function mergePageInventory(engine: PerceptionEngine, inventory: PrivateInventory): Promise<void> {
  let result: unknown;
  try {
    result = await engine.cdp.send('Runtime.evaluate', { contextId: engine.worldId, expression: `(${pageInventory.toString()})()`, returnByValue: true, awaitPromise: false });
  } catch {
    throw new Error('PERCEPTION_UNAVAILABLE');
  }
  const record = result as { exceptionDetails?: unknown; result?: { value?: unknown } } | null;
  if (record === null || typeof record !== 'object' || record.exceptionDetails !== undefined) throw new Error('PERCEPTION_UNAVAILABLE');
  const value = record.result?.value as Partial<PageInventory> | undefined;
  if (!value || !Array.isArray(value.entries)) throw new Error('PERCEPTION_UNAVAILABLE');
  if (value.oversize === true) {
    inventory.fail();
    throw new Error('PRIVATE_INVENTORY_LIMIT');
  }
  inventory.merge(value.entries.map((entry): InventoryEntry => [entry[0], entry[1]]));
}

/** Pure part of perceive(): sanitize, annotate, render, project, facts. */
export function perceiveCollected(collected: CollectedPage, matcher: PrivateMatcher, o: { stepText?: string; targetIntents?: readonly string[]; maxBytes?: number } = {}): {
  outline: Outline; facts: Facts; segments: Record<string, readonly EvidenceSegment[]>; counters: SanitizeCounters; tree: RenderedTree; shown: Set<number>; refs: string[]; byRef: Map<string, RenderedNode>;
} {
  const maxBytes = o.maxBytes ?? OUTLINE_BYTES;
  const counters = newCounters();
  const tree = buildRendered(collected, matcher, counters);
  annotate(tree);
  const nativeByRef = new Map(tree.nodes.flatMap(n => n.ref ? [[n.ref, n] as const] : []));
  // A data cell holding nothing but one named public link (an infobox value) has no name or ref line of its own: the link is not a
  // readable target by itself, so the cell is offered too, carrying the link's text. The cell (five-step chain) and its link (six-step chain)
  // are both scoped read targets; the model may name either.
  for (const n of tree.nodes) {
    if (n.kind !== 'node' || (n.role !== 'cell' && n.role !== 'gridcell') || n.ref === undefined || n.rawName !== '' || n.ownText !== ''
      || n.withheld || n.cleared || n.interactive || n.clickable || collected.facts[n.ref]?.readScope?.tableTitleRef === undefined || n.kids.length !== 1) continue;
    const link = tree.nodes[n.kids[0] ?? -1];
    if (link?.kind !== 'node' || link.role !== 'link' || link.ref === undefined || link.withheld || link.cleared || link.rawName === '' || Array.from(link.rawName).length > 80
      || link.kids.some(i => tree.nodes[i]?.kind !== 'text')) continue;
    if (n.fallbackText !== undefined && n.fallbackText !== link.rawName.replace(/\s+/gu, ' ').trim()) continue;
    n.linkValueCell = true;
    n.fallbackText = link.rawName.replace(/\s+/gu, ' ').trim();
  }
  for (const n of tree.nodes) {
    const native = n.ref ? collected.facts[n.ref] : undefined;
    if (!native) continue;
    n.scopeRefs = native.scopeRefs;
    n.readScope = native.readScope?.relation === 'R7_ADJACENT_PUBLIC' ? n.readScope : native.readScope;
    if (shownRef(n) !== undefined && n.readScope && ((!n.interactive && !n.clickable) || n.withheld && n.role === 'link') && (n.readScope.relation !== 'R7_ADJACENT_PUBLIC' || n.withheld)) {
      const sources = n.readScope.sourceRefs.map(ref => nativeByRef.get(ref));
      if (sources.every(source => source && !source.withheld && !source.cleared && source.rawName !== '' && Array.from(source.rawName).length <= 80)) {
        const near = sources.flatMap(source => source ? [source.rawName] : []).join(' ');
        if (Array.from(near).length <= 80) { n.near = near; n.nearReadOnly = true; n.readContext = sources.flatMap(source => source ? [source.rawName] : []); }
      }
    }
  }
  guardDerived(tree, matcher, counters);
  for (const n of tree.nodes) if (n.nearReadOnly && n.near === undefined) n.readScope = undefined;
  const { nodes } = tree;
  // Group before projection. Ordinal identity never changes when a projection clips a peer.
  const allIndexes = new Set(nodes.map(n => n.i));
  let fullFacts = deriveFacts(tree, allIndexes).facts;
  // Revoke unusable source certificates before they become projection dependencies. A lost or
  // private source removes its optional context; it cannot erase an otherwise ordinary target.
  for (const n of nodes) {
    const ref = shownRef(n), fact = ref ? fullFacts[ref] : undefined;
    if (!fact) continue;
    if (n.directTextAssertion && !fact.directTextAssertion) delete n.directTextAssertion;
    n.scopeRefs = fact.scopeRefs;
    if (n.readScope && !fact.readScope) {
      n.readScope = undefined;
      if (n.nearReadOnly) { n.near = undefined; n.readContext = undefined; n.nearReadOnly = false; }
    }
  }
  guardDerived(tree, matcher, counters);
  fullFacts = deriveFacts(tree, allIndexes).facts;
  const classes = new Map<string, RenderedNode[]>();
  const groupedRefs = new Set<string>();
  for (const n of nodes) {
    const ref = shownRef(n), fact = ref ? fullFacts[ref] : undefined;
    if (!fact || !ref || groupedRefs.has(ref)) continue;
    groupedRefs.add(ref);
    const key = JSON.stringify([fact.role, fact.name, fact.evidence]);
    const peers = classes.get(key) ?? []; peers.push(n); classes.set(key, peers);
  }
  for (const peers of classes.values()) if (peers.length > 1) peers.forEach((n, i) => { n.ordinal = { index: i + 1, count: peers.length }; });
  const lines = nodes.map(renderLine);
  const full = lines.join('\n');
  const unprojectedBytes = utf8(full);
  let shownIndexes = nodes.map((n) => n.i);
  let text = full;
  let projection: Projection | null = null;
  if (unprojectedBytes > maxBytes) {
    projection = project(nodes, lines, { stepText: o.stepText ?? '', targetIntent: (o.targetIntents ?? []).filter(Boolean).join(' '), maxBytes });
    shownIndexes = projection.keptIndexes;
    text = [...projection.lines, `… ${String(projection.notShown)} more nodes not shown`].join('\n');
  }
  const shown = new Set(shownIndexes);
  let changed = true;
  while (changed) {
    changed = false;
    for (const peers of classes.values()) {
      const required = peers.flatMap(n => [n, ...(n.scopeRefs ?? []).map(ref => nativeByRef.get(ref)), ...(n.readScope?.sourceRefs ?? []).map(ref => nativeByRef.get(ref))]);
      if (peers.some(n => shown.has(n.i)) && required.some(n => !n || !shown.has(n.i))) {
        for (const n of peers) if (shown.delete(n.i)) changed = true;
      }
    }
  }
  shownIndexes = shownIndexes.filter(i => shown.has(i));
  if (projection && shownIndexes.length !== projection.keptIndexes.length) {
    projection = { ...projection, keptIndexes: shownIndexes, notShown: nodes.length - shownIndexes.length };
    text = [...shownIndexes.map(i => lines[i] ?? ''), `… ${String(projection.notShown)} more nodes not shown`].join('\n');
  }
  const refs: string[] = [];
  const byRef = new Map<string, RenderedNode>();
  for (const i of shownIndexes) {
    const n = nodes[i];
    const ref = n ? shownRef(n) : undefined;
    if (n && ref !== undefined && (n.kind === 'node' || n.kind === 'text')) {
      refs.push(ref);
      byRef.set(ref, n);
    }
  }
  const { facts, segments } = deriveFacts(tree, shown);
  const outline: Outline = {
    text, bytes: utf8(text), totalNodes: nodes.length, shownNodes: shownIndexes.length, projected: projection !== null,
    projectionTier: projection?.tier ?? null, notShown: projection?.notShown ?? 0,
  };
  return { outline, facts, segments, counters, tree, shown, refs, byRef };
}

/** Perceives the current page state. The page is never mutated or marked. */
export async function perceive(options: PerceiveOptions): Promise<Perception> {
  options.inventory.assertLive(); // an inventory that failed (or was disposed) is unusable: nothing is read from the page
  const engine = options.engine ?? await openEngine(options.cdp);
  const collected = collectedShape(await runOnEngine(engine, collectPage));
  const certified = new Set<string>();
  for (const [ref, facts] of Object.entries(collected.facts)) {
    if (facts.directTextAssertion) certified.add(ref);
    if (facts.readScope?.tableTitleRef) for (const sourceRef of facts.readScope.sourceRefs) certified.add(sourceRef);
  }
  if (certified.size) for (const ref of await unsafePublicRoots(engine, [...certified])) {
    const facts = collected.facts[ref]; if (facts) facts.opaquePublicSource = true;
  }
  await mergePageInventory(engine, options.inventory);
  const budget: WorkBudget = { remaining: options.workBudgetUnits ?? DEFAULT_WORK_BUDGET_UNITS };
  const matcher = options.inventory.matcher(options.privateValues ?? [], { workBudget: budget });
  const done = perceiveCollected(collected, matcher, {
    ...(options.stepText !== undefined ? { stepText: options.stepText } : {}),
    ...(options.targetIntents !== undefined ? { targetIntents: options.targetIntents } : {}),
    ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
  });
  const backendNodeIds = options.resolveBackendIds === false ? {} : await backendNodeIdsFor(engine, done.refs);
  const perception: Perception = {
    outline: done.outline, facts: done.facts, evidenceSegments: done.segments, backendNodeIds,
    origin: collected.origin, viewport: collected.viewport, counters: done.counters, engine,
  };
  internals.set(perception, { tree: done.tree, byRef: done.byRef, privateValues: [...(options.privateValues ?? [])] });
  return perception;
}
