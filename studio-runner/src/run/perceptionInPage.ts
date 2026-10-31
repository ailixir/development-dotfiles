/// <reference lib="dom" />
/**
 * Page programs of the perception path (ADR-SC-007). Each function here is sent to a CDP isolated world as
 * source text (`Function.prototype.toString`) and runs there, so it is CLOSURE-FREE: it may use only its
 * parameters, `this` and the world's globals. Nothing is stamped on the application DOM, nothing is
 * dispatched into the page, and the results are returned by value or as remote object handles held by the
 * runner.
 *
 * Programs that take an InjectedScript `this` run on Playwright's own injected script, which is created by
 * `playwrightEngine.ts` after its source has been checked against the pinned sha256.
 *
 * The unit tier cannot execute these (no DOM); the perception tier does (test/fixtures-tier/perception).
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A node of Playwright's AI aria snapshot, as read by the sanitizer. */
export interface SnapshotNode {
  role: string;
  name?: string;
  ref?: string;
  text?: string;
  url?: string;
  placeholder?: string;
  cursor?: string;
  box?: Box;
  checked?: boolean | 'mixed';
  disabled?: boolean;
  expanded?: boolean;
  pressed?: boolean | 'mixed';
  selected?: boolean;
  level?: number;
  invalid?: boolean;
  ariaHidden?: boolean;
  children?: (SnapshotNode | string)[];
}

/** Element facts read in the isolated world for every ref of the snapshot. */
export interface ElementFacts {
  tag: string;
  type?: string;
  password?: boolean;
  valueControl: boolean;
  editable: boolean;
  editableRoot: boolean;
  sensitive: boolean;
  inSelect: boolean;
  valueAttr: boolean;
  /** Trusted same-ref native naming proof, never a page marker or a backup label. Internal only. */
  primaryNameSource?: 'PRIMARY_ARIA_LABEL';
  nativeTextRoot?: 'paragraph' | 'strong';
  directTextAssertion?: true;
  opaquePublicSource?: true;
  /** Same-pass native provenance for the direct stripped value string; never public authority. */
  directValueOnly?: 'NATIVE_INPUT_VALUE_ONLY';
  /** An iframe's own title attribute: the one thing about a frame the outline shows (its content is never read). */
  frameTitle?: string;
  scopeRefs?: string[];
  readScope?: { relation: 'SAME_ROW_LABEL' | 'IMMEDIATE_HEADING_SAME_PARENT' | 'R7_ADJACENT_PUBLIC'; sourceRefs: string[]; tableTitleRef?: string };

}

export interface CollectedPage {
  json: SnapshotNode[];
  facts: Record<string, ElementFacts>;
  echo: string[];
  viewport: { width: number; height: number };
  origin: string;
  canvases: number;
}

/** The subset of Playwright's InjectedScript these programs use. */
export interface InjectedScriptLike {
  ariaSnapshotJSON(root: Element, options: { mode: 'ai'; boxes: boolean }): { json: SnapshotNode[] };
  parseSelector(selector: string): unknown;
  querySelector(parsed: unknown, root: Document, strict: boolean): Element | null;
  querySelectorAll(parsed: unknown, root: Document): Element[];
  generateSelectorSimple(element: Element): string;
}

export interface PageInventory {
  entries: [string, boolean][];
  oversize: boolean;
}

/** The AI snapshot plus element facts and the echo material for controls the snapshot cannot attribute. */
export function collectPage(this: InjectedScriptLike): CollectedPage {
  const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const snap = this.ariaSnapshotJSON(document.documentElement, { mode: 'ai', boxes: true });
  const refs: string[] = [];
  const snapshots = new Map<string, SnapshotNode>();
  const walk = (n: SnapshotNode | string): void => {
    if (typeof n === 'string') return;
    if (n.ref) { refs.push(n.ref); snapshots.set(n.ref, n); }
    if (n.children) n.children.forEach(walk);
  };
  snap.json.forEach(walk);
  const BUTTONISH = ['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file', 'hidden'];
  const facts: Record<string, ElementFacts> = {};
  const refEls = new Set<Element>();
  const elements = new Map<string, Element>();
  for (const ref of refs) {
    const el = this.querySelector(this.parseSelector('aria-ref=' + ref), document, false);
    if (!el) continue;
    refEls.add(el);
    elements.set(ref, el);
    const tag = el.tagName.toLowerCase();
    let unmaskedStyleKnown = false;
    const f: ElementFacts = {
      tag, valueControl: false, editable: false, editableRoot: false, sensitive: false, inSelect: false, valueAttr: false,
    };
    if (tag === 'iframe') f.frameTitle = (el.getAttribute('title') ?? '').slice(0, 512);
    if (tag === 'input') {
      const input = el as HTMLInputElement;
      f.type = (input.type === '' ? 'text' : input.type).toLowerCase();
      const ac = (el.getAttribute('autocomplete') ?? '').toLowerCase();
      let masked = false;
      try {
        const style = getComputedStyle(el) as CSSStyleDeclaration & { webkitTextSecurity?: string };
        masked = Boolean(style.webkitTextSecurity) && style.webkitTextSecurity !== 'none';
        unmaskedStyleKnown = style.webkitTextSecurity === 'none';
      } catch {
        masked = false;
      }
      f.password = f.type === 'password' || /(^|\s)(current|new)-password(\s|$)/.test(ac) || masked;
    }
    f.valueControl = (tag === 'input' && !BUTTONISH.includes(f.type ?? '')) || tag === 'textarea' || tag === 'select';
    f.editable = (el as HTMLElement).isContentEditable;
    f.editableRoot = f.editable && !el.parentElement?.isContentEditable;
    f.sensitive = !!el.closest('[data-sensitive]');
    f.inSelect = !!el.closest('select');
    f.valueAttr = el.hasAttribute('aria-valuetext') || el.hasAttribute('aria-valuenow');
    const node = snapshots.get(ref);
    if (el instanceof HTMLInputElement && tag === 'input' && node
      && ((f.type === 'text' && node.role === 'textbox') || (f.type === 'search' && node.role === 'searchbox') || ((f.type === 'text' || f.type === 'search') && node.role === 'combobox'))
      && unmaskedStyleKnown && f.password === false && f.valueControl && !f.editable && !f.editableRoot && !f.sensitive && !f.inSelect && !f.valueAttr
      // A site script may add role="combobox" to its own search input once it is used (autocomplete): the only own text is still the stripped value.
      && (!el.hasAttribute('role') || (node.role === 'combobox' && norm(el.getAttribute('role')).toLowerCase() === 'combobox')) && !el.hasAttribute('aria-owns') && !el.closest('[contenteditable]')
      && el.childNodes.length === 0 && el.shadowRoot === null && !el.assignedSlot && el.getRootNode() === document) {
      const raw = node.text !== undefined ? [node.text] : node.children ?? [];
      const unmixed = node.text === undefined || !node.children?.length;
      try {
        // Only recognised empty generated-content states qualify. No label or field value is read.
        const emptyContent = (pseudo: string): boolean => ['none', 'normal', '""'].includes(getComputedStyle(el, pseudo).content);
        if (unmixed && raw.length <= 1 && raw.every(child => typeof child === 'string') && emptyContent('::before') && emptyContent('::after')) {
          f.directValueOnly = 'NATIVE_INPUT_VALUE_ONLY';
        }
      } catch { /* Unavailable generated-content provenance remains uncertified. */ }
    }
    if (tag === 'output' && node?.role === 'status' && node.cursor !== 'pointer' && !f.password && !f.valueControl && !f.editable && !f.sensitive && !f.inSelect && !f.valueAttr
      && !el.hasAttribute('role') && !el.hasAttribute('tabindex') && !el.hasAttribute('autofocus') && !el.hasAttribute('onclick') && !el.hasAttribute('onkeydown')
      && !el.hasAttribute('aria-labelledby') && !el.hasAttribute('placeholder') && !el.hasAttribute('href') && node.placeholder === undefined && node.url === undefined) {
      let excluded = false;
      // Shadow hosts and slotted parents cannot turn a sensitive/editable/control surface into public provenance.
      for (let parent: Element | null = el; parent;) {
        const ancestorRole = norm(parent.getAttribute('role')).toLowerCase().split(' ')[0] ?? '';
        if (parent.matches('[data-sensitive], [contenteditable], [aria-valuetext], [aria-valuenow], input, textarea, select, option, button, a[href]')
          || ['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'listbox', 'treeitem', 'scrollbar', 'meter', 'progressbar'].includes(ancestorRole)) { excluded = true; break; }
        const root = parent.getRootNode();
        parent = parent.assignedSlot ?? parent.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      }
      const label = norm(el.getAttribute('aria-label'));
      const name = norm(node.name);
      if (!excluded && label !== '' && label === name && Array.from(label).length <= 256 && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(label)) {
        f.primaryNameSource = 'PRIMARY_ARIA_LABEL';
      }
    }
    if (((tag === 'p' && node?.role === 'paragraph') || (tag === 'strong' && node?.role === 'strong'))
      && !el.hasAttribute('role') && !f.editable && !f.sensitive && !f.valueControl && !f.valueAttr && !f.inSelect
      && el.children.length === 0 && Array.from(el.childNodes).every(child => child.nodeType === Node.TEXT_NODE)
      && norm(el.textContent) !== '' && !el.assignedSlot && el.getRootNode() === document) {
      const children = node.text !== undefined ? [node.text] : node.children ?? [];
      if (children.length === 1 && typeof children[0] === 'string' && norm(children[0]) === norm(el.textContent)) f.nativeTextRoot = tag === 'p' ? 'paragraph' : 'strong';
    }
    if (tag === 'p' && node?.role === 'paragraph' && !node.name && el.children.length > 0
      && !el.hasAttribute('role') && !f.editable && !f.sensitive && !f.valueControl && !f.valueAttr && !f.inSelect
      && !el.assignedSlot && el.getRootNode() === document) {
      const runs: string[] = []; let run = '';
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) run += child.textContent ?? '';
        else { if (norm(run)) runs.push(norm(run)); run = ''; }
      }
      if (norm(run)) runs.push(norm(run));
      const raw = (node.text !== undefined ? [node.text] : node.children ?? []).filter((child): child is string => typeof child === 'string' && norm(child) !== '');
      // A child is always a gap. Neither the snapshot nor the wire may join across it.
      const descendants = Array.from(el.querySelectorAll('*'));
      const completePublic = descendants.length <= 4096 && [el, ...descendants].every(child => {
        if (child.shadowRoot || child.assignedSlot || child.getRootNode() !== document
          || child.matches('input,textarea,select,iframe,canvas,object,embed,script,style,template,noscript,[hidden],[data-sensitive],[contenteditable],[aria-valuetext],[aria-valuenow]')) return false;
        const style = getComputedStyle(child);
        return style.display !== 'none' && style.visibility === 'visible' && style.contentVisibility !== 'hidden';
      });
      if (completePublic && runs.length === 1 && raw.length === 1 && norm(raw[0]) === runs[0] && Array.from(runs[0]).length <= 256) f.directTextAssertion = true;
    }
    facts[ref] = f;
  }
  // Relation certificates refer only to existing native snapshot refs. Sanitization and projection
  // later require each source to be complete, clean and shown; no text is copied here.
  const refsByElement = new Map<Element, string>();
  for (const [ref, el] of elements) refsByElement.set(el, ref);
  const cleanNative = (el: Element): boolean => el.getRootNode() === document && !el.assignedSlot
    && !el.closest('[data-sensitive], [contenteditable], input[type="password"], textarea, select');
  const tableTitle = (table: Element): Element | null => {
    if (!(table instanceof HTMLTableElement)) return null;
    const rows = Array.from(table.rows).filter(row => row.closest('table') === table);
    if (!rows.length || rows.length > 4096) return null;
    const widths: number[] = [];
    for (const row of rows) {
      let width = 0;
      for (const cell of Array.from(row.cells)) {
        if (cell.rowSpan !== 1 || cell.hasAttribute('rowspan') && cell.getAttribute('rowspan') !== '1'
          || cell.hasAttribute('colspan') && !/^[1-9][0-9]*$/u.test(cell.getAttribute('colspan') ?? '') || cell.colSpan > 1000) return null;
        width += cell.colSpan;
      }
      if (width) widths.push(width);
    }
    if (!widths.length || widths.some(width => width !== widths[0])) return null;
    const first = rows[0], cell = first?.cells.length === 1 ? first.cells[0] : undefined;
    const title = cell?.tagName === 'TH' && cell.colSpan === widths[0] ? cell : null;
    const captions = Array.from(table.children).filter(child => child.tagName === 'CAPTION');
    if (captions.length + Number(title !== null) !== 1) return null;
    return captions[0] ?? title;
  };
  const scopes = new Set(['form','dialog','alertdialog','region','search','navigation','main','row','article','listitem','group','table','grid','tabpanel','menu','toolbar','banner','contentinfo','complementary','list']);
  for (const [ref, el] of elements) {
    const f = facts[ref];
    if (!f || !cleanNative(el)) continue;
    const sources: string[] = [];
    const add = (source: Element | null): void => {
      const r = source ? refsByElement.get(source) : undefined;
      if (r && r !== ref && !sources.includes(r) && source && cleanNative(source)) sources.push(r);
    };
    let namedAncestors = 0;
    for (let parent = el.parentElement; parent && namedAncestors < 3; parent = parent.parentElement) {
      const r = refsByElement.get(parent), n = r ? snapshots.get(r) : undefined;
      if (n && scopes.has(n.role) && norm(n.name) !== '') { add(parent); namedAncestors++; }
    }
    const cell = el.closest('td, th, [role="cell"], [role="gridcell"], [role="rowheader"], [role="columnheader"]');
    const row = cell?.closest('tr, [role="row"]');
    const table = cell?.closest('table, [role="table"], [role="grid"], [role="treegrid"]');
    const rowSources: string[] = [];
    if (cell && row && table && el.closest('table, [role="table"], [role="grid"], [role="treegrid"]') === table) {
      const cells = Array.from(row.children).filter(c => c.matches('td, th, [role="cell"], [role="gridcell"], [role="rowheader"], [role="columnheader"]'));
      // Only the first, text-only row label may qualify another cell; arbitrary values cannot.
      const label = cells[0];
      if (label && label !== cell && !label.querySelector('a, button, input, select, textarea, [contenteditable]')) {
        add(label); const r = refsByElement.get(label); if (r) rowSources.push(r);
      } else if (label?.tagName === 'TH' && label !== cell && cleanNative(label)) {
        const links = Array.from(label.querySelectorAll('a[href]'));
        const link = links.length === 1 ? links[0] : undefined;
        const labelRef = link ? refsByElement.get(link) : undefined;
        if (link && labelRef && link.closest('th') === label && link.closest('tr') === row && link.closest('table') === table
          && !label.querySelector('button,input,select,textarea,[contenteditable],[data-sensitive]')
          && Array.from(label.querySelectorAll('*')).every(child => child === link || child.tagName === 'SPAN')
          && norm(label.textContent) !== '' && norm(label.textContent) === norm(link.textContent)
          && norm(snapshots.get(labelRef)?.name) === norm(label.textContent)) rowSources.push(labelRef);
      }
      const unitCell = (candidate: Element): boolean => candidate instanceof HTMLTableCellElement
        ? candidate.colSpan === 1 && candidate.rowSpan === 1
        : !candidate.hasAttribute('aria-colspan') && !candidate.hasAttribute('aria-rowspan');
      const column = cells.indexOf(cell);
      const columnKnown = column >= 0 && cells.every(unitCell) && !cell.hasAttribute('headers') && !cell.hasAttribute('aria-colindex') && !cell.hasAttribute('aria-rowindex');
      const rows = Array.from(table.querySelectorAll('tr, [role="row"]')).filter(r => r.closest('table, [role="table"], [role="grid"], [role="treegrid"]') === table);
      for (const headerRow of rows) {
        if (headerRow === row) break;
        const headerCells = Array.from(headerRow.children);
        const header = headerCells[column];
        if (columnKnown && headerCells.every(unitCell) && header && header.matches('th, [role="columnheader"]') && (header instanceof HTMLTableCellElement ? header.colSpan === 1 && header.rowSpan === 1 : !header.hasAttribute('aria-colspan') && !header.hasAttribute('aria-rowspan'))) {
          add(header); const r = refsByElement.get(header); if (r && !rowSources.includes(r)) rowSources.push(r);
        }
      }
      if (rowSources.length > 0 && rowSources.length <= 8) {
        const title = tableTitle(table), titleRef = title ? refsByElement.get(title) : undefined;
        if (title && titleRef && title !== cell && cleanNative(title) && norm(snapshots.get(titleRef)?.name) === norm(title.textContent)
          && norm(title.textContent) !== '' && Array.from(norm(title.textContent)).length <= 80 && !rowSources.includes(titleRef) && rowSources.length < 8) {
          f.readScope = { relation: 'SAME_ROW_LABEL', sourceRefs: [...rowSources, titleRef], tableTitleRef: titleRef };
        } else f.readScope = { relation: 'SAME_ROW_LABEL', sourceRefs: rowSources };
      }
    }
    const previousHeading = (block: Element): Element | null => {
      const previous = block.previousElementSibling;
      return previous?.matches('h1,h2,h3,h4,h5,h6,[role="heading"]') && previous.parentElement === block.parentElement ? previous : null;
    };
    const form = el.closest('form');
    // A heading immediately before this exact unlabelled form qualifies its controls independently
    // of the read-only near evidence. A neighboring form can never borrow it.
    if (form && !form.hasAttribute('aria-label') && !form.hasAttribute('aria-labelledby')) add(previousHeading(form));
    else if (!form) add(previousHeading(el));
    const immediateHeading = previousHeading(el);
    if (!f.readScope && !form && immediateHeading) {
      const r = refsByElement.get(immediateHeading);
      if (r) f.readScope = { relation: 'IMMEDIATE_HEADING_SAME_PARENT', sourceRefs: [r] };
    }
    // The R7 certificate has a deliberately tiny envelope: one opaque target and one
    // exclusive public wrapper under the same span, with balanced punctuation only.
    // This closest exact envelope takes READ scope priority over an enclosing table row;
    // raw normalization still decides whether the certificate survives privacy processing.
    const parent = el.parentElement;
    if (parent?.tagName === 'SPAN' && cleanNative(parent) && parent.children.length === 2) {
      const sibling = Array.from(parent.children).find(c => c !== el);
      const source = sibling?.tagName === 'SPAN' && sibling.children.length === 1 ? sibling.firstElementChild : sibling;
      const r = source ? refsByElement.get(source) : undefined;
      const delimiters = Array.from(parent.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => norm(n.textContent));
      const punctuation = delimiters.join('');
      if (r && source && cleanNative(source) && delimiters.length <= 2 && Array.from(punctuation).length <= 8
        && (/^(?:\(\)|\[\]|[·|:,-]*)$/u.test(punctuation)) && source !== el && !source.contains(el)) {
        f.readScope = { relation: 'R7_ADJACENT_PUBLIC', sourceRefs: [r] };
      }
    }
    if (sources.length > 0 && sources.length <= 8) f.scopeRefs = sources;
  }
  const echo = new Set<string>();
  const addEcho = (s: string | null | undefined): void => {
    const t = norm(s);
    if (t) echo.add(t);
  };
  const textOf = (root: Element): void => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = w.nextNode())) addEcho((n as Text).data);
  };
  let candidates: Element[] = [];
  try {
    candidates = this.querySelectorAll(this.parseSelector('css=input, textarea, [contenteditable], [data-sensitive], [aria-valuetext]'), document);
  } catch {
    candidates = [];
  }
  for (const el of candidates) {
    if (refEls.has(el)) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && !BUTTONISH.includes((el as HTMLInputElement).type.toLowerCase())) addEcho((el as HTMLInputElement).value);
    if (tag === 'textarea') addEcho((el as HTMLTextAreaElement).value);
    if ((el as HTMLElement).isContentEditable) textOf(el);
    if (el.closest('[data-sensitive]')) textOf(el);
    if (el.hasAttribute('aria-valuetext')) addEcho(el.getAttribute('aria-valuetext'));
  }
  return {
    json: snap.json, facts, echo: [...echo], viewport: { width: innerWidth, height: innerHeight },
    origin: location.origin, canvases: document.querySelectorAll('canvas').length,
  };
}

/**
 * Every value the page holds in a control, in editable content or in a sensitive region: the union of the
 * production collector's field inventory and the spike's page-side inventory. Evaluated as an expression
 * `(program)()` in the isolated world. Values come back whole, however long; more than 4,096 entries, or more
 * than 1 MiB of text in all, is not returned: `oversize` tells the runner to fail closed.
 */
export function pageInventory(): PageInventory {
  const entries: [string, boolean][] = [];
  let oversize = false;
  let chars = 0;
  const add = (value: string | null | undefined, strict: boolean): void => {
    const text = value ?? '';
    if (text.trim() === '') return;
    // Long values are returned whole. Only the production caps apply: 4,096 entries and 1 MiB (a value of more than
    // 1,048,576 UTF-16 units is certainly above the byte cap; the runner measures the exact bytes).
    chars += text.length;
    if (entries.length >= 4096 || chars > 1048576) {
      oversize = true;
      return;
    }
    entries.push([text, strict]);
  };
  const ACTION_INPUTS = ['button', 'submit', 'reset'];
  const texts = (element: Element): void => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) add((node as Text).data, true);
    add(element.textContent, true);
  };
  const walk = (root: Document | ShadowRoot): void => {
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') {
        const input = el as HTMLInputElement;
        const type = (input.type === '' ? 'text' : input.type).toLowerCase();
        // A checkbox or radio `value` is a constant the page wrote (the user's input there is the checked state), so it is not inventoried:
        // withholding it would only hide a label the page already shows. Text inputs, textareas, selects and contenteditable stay.
        if (!ACTION_INPUTS.includes(type) && type !== 'checkbox' && type !== 'radio') add(input.value, true);
      } else if (tag === 'textarea') add((el as HTMLTextAreaElement).value, true);
      else if (tag === 'select') {
        for (const option of Array.from((el as HTMLSelectElement).selectedOptions)) {
          add(option.value, true);
          add(option.textContent, true);
        }
      }
      if ((el as HTMLElement).isContentEditable && !el.parentElement?.isContentEditable) texts(el);
      if (el.hasAttribute('data-sensitive')) texts(el);
      if (el.hasAttribute('aria-valuetext')) add(el.getAttribute('aria-valuetext'), true);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return { entries, oversize };
}

/** A retained remote object. Its element and epoch never cross the isolated-world boundary. */
export interface NativeReadSource {
  node(): Element;
  nodes(): Element[];
  extract(privateHit: (text: string) => boolean): void;
  context(check: (engine: InjectedScriptLike) => boolean): boolean;
  value(): string;
  commitComparison(): boolean;
  same(selector: string): boolean;
  compare(expected: string, entries: readonly (readonly [string, boolean])[], mode: 'DIRECT_PUBLIC' | 'READ_BINDING_SOURCE',
    matcher: (entries: readonly (readonly [string, boolean])[], options: { workBudget: { remaining: number } }) => { hitSplit(parts: readonly string[]): boolean },
    inventory: () => PageInventory, allEntries?: readonly (readonly [string, boolean])[]): void;
  dispose(): void;
}

export interface NativeReadContext {
  roots: Element[];
  check(privateHit: (text: string) => boolean): boolean;
}

/** Install before extraction; all mutation records monotonically revoke, including change-and-restore.
 * The object is retained independently of the snapshot engine, through assertion commitment. */
export function captureReadSource(this: InjectedScriptLike, selector: string, maxBytes: number,
  contextFactory?: (engine: InjectedScriptLike, target: Element) => NativeReadContext | null, heldElement?: Element): NativeReadSource {
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- Returned source methods retain the exact injected engine independently of its released CDP handle.
  const engine = this, root = document, source = heldElement ? [heldElement] : engine.querySelectorAll(engine.parseSelector(selector), document);
  if (source.length !== 1 || !(source[0] instanceof HTMLElement)) throw new Error('READ_REFUSED');
  const element = source[0];
  const ancestors: Element[] = [];
  const descendants: Element[] = [], hosts: Element[] = [];
  let context: NativeReadContext | null = null;
  const contextSources: NativeReadSource[] = [];
  let revoked = false, disposed = false;
  const relevant = (records: MutationRecord[]): void => {
    if (records.length > 4096) { revoked = true; return; }
    for (const record of records) if (record.target === root || element.contains(record.target) || ancestors.includes(record.target as Element)) revoked = true;
  };
  const observer = new MutationObserver(relevant);
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  const onPageHide = (): void => { revoked = true; };
  addEventListener('pagehide', onPageHide, true);
  const drain = (): void => {
    relevant(observer.takeRecords());
    if (disposed || revoked || document !== root || !element.isConnected || element.ownerDocument !== root || element.getRootNode() !== root || element.assignedSlot) throw new Error('READ_REFUSED');
    let index = 0;
    for (let current: Element | null = element; current; current = current.parentElement) if (ancestors[index++] !== current) throw new Error('READ_REFUSED');
    if (index !== ancestors.length) throw new Error('READ_REFUSED');
  };
  const normal = (text: string): string => text.replace(/[\u200b\u00ad]/gu, '').replace(/\s+/gu, ' ').trim();
  const policy = (): void => {
    drain();
    const currentDescendants = Array.from(element.querySelectorAll('*'));
    if (currentDescendants.length !== descendants.length || currentDescendants.some((node, index) => node !== descendants[index])) throw new Error('READ_REFUSED');
    const nodes = [element, ...currentDescendants];
    if (nodes.length > 4096) throw new Error('READ_REFUSED');
    const relevantHosts = [...new Set([...ancestors, ...nodes])];
    const markerHosts = relevantHosts.filter(node => getComputedStyle(node).display === 'list-item');
    if (markerHosts.length) for (const node of relevantHosts) {
      if (node.matches('li[value],li[type],ol[start],ol[reversed],ol[type],ul[type]')) throw new Error('READ_REFUSED');
      for (const pseudo of ['', '::before', '::after', '::marker']) {
        const style = getComputedStyle(node, pseudo || null);
        if (style.counterReset !== 'none' || style.counterSet !== 'none' || style.counterIncrement !== 'none') throw new Error('READ_REFUSED');
      }
    }
    for (const node of markerHosts) {
      const style = getComputedStyle(node), marker = getComputedStyle(node, '::marker');
      if (node.tagName !== 'LI' || !['none','normal','""'].includes(marker.content) || style.listStyleImage !== 'none') throw new Error('READ_REFUSED');
      if (!['disc','none'].includes(style.listStyleType)) {
        const owner = node.parentElement;
        if (style.listStyleType !== 'decimal' || node !== element || owner?.tagName !== 'OL' || getComputedStyle(owner).display !== 'block'
          || owner.children.length !== 1 || owner.firstElementChild !== node
          // Authored counter-reset:none cannot be distinguished from UA state by computed
          // values alone. Unproved author styles refuse; no stylesheet/sibling text is read.
          || document.styleSheets.length !== 0 || document.adoptedStyleSheets.length !== 0 || ancestors.some(host => host.hasAttribute('style'))) throw new Error('READ_REFUSED');
      }
    }
    const generatedHosts = new Set<Element>([...ancestors, ...nodes]);
    // Generated content could be animated; only animations targeting this host set's ::before/::after refuse.
    for (const animation of document.getAnimations()) {
      const effect = animation.effect;
      if (effect instanceof KeyframeEffect && effect.target instanceof Element && generatedHosts.has(effect.target)
        && (effect.pseudoElement === '::before' || effect.pseudoElement === '::after')) throw new Error('READ_REFUSED');
    }
    for (const node of generatedHosts) {
      if (node.getRootNode() !== root || node.assignedSlot || node.shadowRoot
        || node.matches('input,textarea,select,option,iframe,frame,canvas,object,embed,video,audio,script,style,template,noscript,[data-sensitive],[contenteditable],[aria-valuetext],[aria-valuenow],[hidden]')
        || ['textbox','searchbox','combobox','spinbutton','slider','scrollbar','meter','progressbar'].includes((node.getAttribute('role') ?? '').toLowerCase())) throw new Error('READ_REFUSED');
      if (heldElement && nodes.includes(node) && (node.tagName === 'BUTTON'
        || ['button','checkbox','radio','switch','slider','spinbutton','tab','menuitem','menuitemcheckbox','menuitemradio','option','listbox','treeitem','scrollbar'].includes((node.getAttribute('role') ?? '').toLowerCase()))) throw new Error('READ_REFUSED');
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility !== 'visible' || style.contentVisibility === 'hidden'
        || !['none', 'normal', '""'].includes(getComputedStyle(node, '::before').content)
        || !['none', 'normal', '""'].includes(getComputedStyle(node, '::after').content)
        // An empty generated box displayed as list-item would carry nested marker generation.
        || /\blist-item\b/u.test(getComputedStyle(node, '::before').display) || /\blist-item\b/u.test(getComputedStyle(node, '::after').display)) throw new Error('READ_REFUSED');
    }
    if (element.getClientRects().length === 0) throw new Error('READ_REFUSED');
    for (const source of contextSources) source.nodes();
    drain();
  };
  let captured = '', extracted = false;
  let pendingComparison: boolean | undefined;
  const dispose = (): void => { disposed = true; revoked = true; captured = ''; pendingComparison = undefined; for (const source of contextSources) source.dispose(); observer.disconnect(); removeEventListener('pagehide', onPageHide, true); };
  try {
    // Retain the exact complete host list only after observer coverage has begun.
    for (let parent: Element | null = element; parent; parent = parent.parentElement) ancestors.push(parent);
    if (ancestors.length > 256) throw new Error('READ_REFUSED');
    descendants.push(...Array.from(element.querySelectorAll('*')));
    hosts.push(...new Set([...ancestors, ...descendants]));
    if (hosts.length > 4096) throw new Error('READ_REFUSED');
    policy();
    context = contextFactory?.(engine, element) ?? null;
    if (context) {
      if (context.roots.length > 8 || new Set(context.roots).size !== context.roots.length || context.roots.some(source => source === element)) throw new Error('READ_REFUSED');
      for (const source of context.roots) contextSources.push(captureReadSource.call(engine, '', maxBytes, undefined, source));
      const completeHosts = new Set(hosts);
      for (const source of contextSources) for (const host of source.nodes()) completeHosts.add(host);
      if (completeHosts.size > 4096) throw new Error('READ_REFUSED');
      hosts.splice(0, hosts.length, ...completeHosts);
    }
    return {
      node() { drain(); return element; },
      nodes() { policy(); return hosts; },
      extract(privateHit) {
        policy();
        if (extracted) throw new Error('READ_REFUSED');
        if (context && !context.check(privateHit)) throw new Error('READ_REFUSED');
        captured = element.innerText;
        if (!captured.trim() || new TextEncoder().encode(captured).length > maxBytes
          || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(captured) || privateHit(captured)) { captured = ''; revoked = true; throw new Error('READ_REFUSED'); }
        policy(); extracted = true;
      },
      context(check) { drain(); const result = check(engine); drain(); return result; },
      value() { policy(); if (!extracted) throw new Error('READ_REFUSED'); return captured; },
      commitComparison() { policy(); const result = pendingComparison; pendingComparison = undefined; if (typeof result !== 'boolean') throw new Error('READ_REFUSED'); return result; },
      same(currentSelector) {
        policy(); const matches = engine.querySelectorAll(engine.parseSelector(currentSelector), root);
        policy(); return matches.length === 1 && matches[0] === element;
      },
      compare(expected, entries, mode, makeMatcher, inventory, allEntries = entries) {
        pendingComparison = undefined;
        try {
        policy();
        const fresh = inventory();
        if (fresh.oversize) throw new Error('READ_REFUSED');
        const matcher = makeMatcher([...entries, ...fresh.entries], { workBudget: { remaining: 20_000_000_000 } });
        const fullMatcher = makeMatcher([...allEntries, ...fresh.entries], { workBudget: { remaining: 20_000_000_000 } });
        if (context && !context.check(text => fullMatcher.hitSplit([text]))) throw new Error('READ_REFUSED');
        policy(); // Fresh foreign inventory is complete before inspecting source text.
        let actual: string;
        if (mode === 'DIRECT_PUBLIC') {
          if (element.tagName !== 'P' || element.hasAttribute('role') || element.children.length === 0) throw new Error('READ_REFUSED');
          const runs: string[] = []; let run = '';
          for (const child of Array.from(element.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) run += child.textContent ?? '';
            else { if (normal(run)) runs.push(run); run = ''; }
          }
          if (normal(run)) runs.push(run);
          if (runs.length !== 1 || Array.from(normal(runs[0] ?? '')).length > 256) throw new Error('READ_REFUSED');
          actual = runs[0] ?? '';
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- The native entrypoint must refuse malformed runtime modes, not fall through to ordinary comparison.
        } else if (mode === 'READ_BINDING_SOURCE') actual = element.innerText;
        else throw new Error('READ_REFUSED');
        // The source cannot become an oracle: all foreign contributors and every current
        // private DOM value are checked before either true or false can be returned.
        const fullSource = element.innerText;
        if (new TextEncoder().encode(fullSource).length > maxBytes || matcher.hitSplit([fullSource, actual, expected])) throw new Error('READ_REFUSED');
        const result = normal(expected) !== '' && normal(actual).includes(normal(expected));
        policy(); drain(); // Same task, immediately before commitment.
        pendingComparison = result;
        } catch { revoked = true; captured = ''; throw new Error('READ_REFUSED'); }
      },
      dispose,
    };
  } catch { dispose(); throw new Error('READ_REFUSED'); }
}

/** Elements for the given refs of the last snapshot, as a remote array (null where a ref no longer resolves). */
export function resolveRefs(this: InjectedScriptLike, refs: string[]): (Element | null)[] {
  const out: (Element | null)[] = [];
  for (const ref of refs) out.push(this.querySelector(this.parseSelector('aria-ref=' + ref), document, false));
  return out;
}

/** Recheck only already-public labels and certified local relations. Returns a boolean; no current
 * DOM strings or physical IDs leave the isolated world. No global search or replacement source. */
export function checkPublicSourceRelations(this: InjectedScriptLike, request: {
  ref: string;
  tableTitleRef?: string;
  sources: { ref: string; name: string; role: string; mode: 'scope' | 'SAME_ROW_LABEL' | 'IMMEDIATE_HEADING_SAME_PARENT' | 'R7_ADJACENT_PUBLIC' }[];
}, held?: { target: Element; sources: ReadonlyMap<string, Element> }): boolean {
  const resolve = (ref: string): Element | null => held ? ref === request.ref ? held.target : held.sources.get(ref) ?? null : this.querySelector(this.parseSelector('aria-ref=' + ref), document, false);
  const target = resolve(request.ref);
  const normal = (s: string | null): string => (s ?? '').replace(/\s+/gu, ' ').trim();
  if (!target?.isConnected || target.getRootNode() !== document || target.assignedSlot) return false;
  const clean = (el: Element): boolean => el.isConnected && el.getRootNode() === document && !el.assignedSlot && !el.closest('[data-sensitive], [contenteditable], input[type="password"], textarea, select');
  const tableTitle = (table: Element): Element | null => {
    if (!(table instanceof HTMLTableElement)) return null;
    const rows = Array.from(table.rows).filter(row => row.closest('table') === table);
    if (!rows.length || rows.length > 4096) return null;
    const widths: number[] = [];
    for (const row of rows) {
      let width = 0;
      for (const cell of Array.from(row.cells)) {
        if (cell.rowSpan !== 1 || cell.hasAttribute('rowspan') && cell.getAttribute('rowspan') !== '1'
          || cell.hasAttribute('colspan') && !/^[1-9][0-9]*$/u.test(cell.getAttribute('colspan') ?? '') || cell.colSpan > 1000) return null;
        width += cell.colSpan;
      }
      if (width) widths.push(width);
    }
    if (!widths.length || widths.some(width => width !== widths[0])) return null;
    const first = rows[0], cell = first?.cells.length === 1 ? first.cells[0] : undefined;
    const title = cell?.tagName === 'TH' && cell.colSpan === widths[0] ? cell : null;
    const captions = Array.from(table.children).filter(child => child.tagName === 'CAPTION');
    if (captions.length + Number(title !== null) !== 1) return null;
    return captions[0] ?? title;
  };
  const sameTable = (a: Element, b: Element): boolean => {
    const table = a.closest('table,[role="table"],[role="grid"],[role="treegrid"]');
    return table !== null && table === b.closest('table,[role="table"],[role="grid"],[role="treegrid"]');
  };
  if (request.tableTitleRef && (request.sources.filter(source => source.ref === request.tableTitleRef).length !== 1
    || request.sources.some(source => source.ref === request.tableTitleRef && source.mode !== 'SAME_ROW_LABEL'))) return false;
  for (const descriptor of request.sources) {
    const source = resolve(descriptor.ref);
    if (!source || source === target || !clean(source)) return false;
    const namedRole = 'internal:role=' + descriptor.role + '[name=' + JSON.stringify(descriptor.name) + 's]';
    if (!this.querySelectorAll(this.parseSelector(namedRole), document).includes(source)) return false;
    const form = target.closest('form');
    const heading = source.matches('h1,h2,h3,h4,h5,h6,[role="heading"]');
    const row = target.closest('tr,[role="row"]');
    const cell = target.closest('td,th,[role="cell"],[role="gridcell"],[role="rowheader"],[role="columnheader"]');
    const cells = row ? Array.from(row.children).filter(c => c.matches('td,th,[role="cell"],[role="gridcell"],[role="rowheader"],[role="columnheader"]')) : [];
    const label = cells[0];
    const links = label?.tagName === 'TH' ? Array.from(label.querySelectorAll('a[href]')) : [];
    const linkedLabel = links.length === 1 && links[0] === source && label !== cell && source.closest('th') === label
      && source.closest('tr') === row && sameTable(source, target)
      && !label.querySelector('button,input,select,textarea,[contenteditable],[data-sensitive]')
      && Array.from(label.querySelectorAll('*')).every(child => child === source || child.tagName === 'SPAN')
      && normal(label.textContent) === normal(source.textContent) && normal(source.textContent) === normal(descriptor.name);
    const rowSource = linkedLabel || row !== null && source === label && source !== cell && sameTable(source,target)
      && !source.querySelector('a,button,input,select,textarea,[contenteditable]');
    const headerRow = source.closest('tr,[role="row"]');
    const columnSource = cell !== null && !cell.hasAttribute('headers') && !cell.hasAttribute('aria-colindex') && !cell.hasAttribute('aria-rowindex')
      && cells.every(c => c instanceof HTMLTableCellElement ? c.colSpan === 1 && c.rowSpan === 1 : !c.hasAttribute('aria-colspan') && !c.hasAttribute('aria-rowspan')) && source.matches('th,[role="columnheader"]') && sameTable(source,target) && headerRow !== null
      && Array.from(headerRow.children).every(c => c instanceof HTMLTableCellElement ? c.colSpan === 1 && c.rowSpan === 1 : !c.hasAttribute('aria-colspan') && !c.hasAttribute('aria-rowspan'))
      && Array.from(headerRow.children).indexOf(source) === cells.indexOf(cell)
      && (source instanceof HTMLTableCellElement ? source.colSpan === 1 && source.rowSpan === 1 : !source.hasAttribute('aria-colspan') && !source.hasAttribute('aria-rowspan'))
      && Boolean(source.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (descriptor.mode === 'scope') {
      if (source.contains(target) || rowSource || columnSource) continue;
      if (heading && (form ? !form.hasAttribute('aria-label') && !form.hasAttribute('aria-labelledby') && form.previousElementSibling === source && form.parentElement === source.parentElement : target.previousElementSibling === source && target.parentElement === source.parentElement)) continue;
      return false;
    }
    if (descriptor.mode === 'SAME_ROW_LABEL') {
      const table = target.closest('table');
      const titleSource = descriptor.ref === request.tableTitleRef && table !== null && source === tableTitle(table)
        && source.closest('table') === table && normal(source.textContent) === normal(descriptor.name);
      if (!rowSource && !columnSource && !titleSource) return false;
      continue;
    }
    if (descriptor.mode === 'IMMEDIATE_HEADING_SAME_PARENT') { if (!heading || target.previousElementSibling !== source || target.parentElement !== source.parentElement) return false; continue; }
    const transparent = (el: Element): boolean => el.tagName === 'SPAN' && clean(el)
      && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !el.hasAttribute('tabindex')
      && !el.hasAttribute('onclick') && !el.hasAttribute('onkeydown') && !el.hasAttribute('title')
      && (!el.hasAttribute('role') || ['generic','none','presentation'].includes(normal(el.getAttribute('role'))))
      && getComputedStyle(el).cursor !== 'pointer';
    const parent = target.parentElement;
    const wrapper = source.parentElement;
    if (!parent || !transparent(parent) || parent.children.length !== 2) return false;
    if (source.parentElement !== parent && !(wrapper && transparent(wrapper) && wrapper.parentElement === parent && wrapper.children.length === 1)) return false;
  }
  return true;
}
