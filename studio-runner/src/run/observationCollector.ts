/// <reference lib="dom" />
import type { CollectorOptions, Observation, ObservationNode, ObservedTarget, LocatorHint, GuidedInvocation, GuidedInvocationResult, AcquisitionRequest, AcquisitionResult } from './observationTypes.js';

/** Fixed browser program. No callbacks, source text or selectors supplied by a model.
 * This function is closure-free so the sole browser boundary can install it as a trusted function.
 * The returned object is held by a private remote handle, never installed on window/document.
 */
export function installObservationCollector(options: CollectorOptions, priorInventory: [string, boolean][] = []) {
  let disposed = false;
  let regionAnchors: { element: Element; role: string; name: string }[] = [];
  interface ReadPolicy { policyRuleId: string; classification: 'permittedBusinessData' | 'nonsecretApproved'; kind: 'visibleText' | 'controlValue'; controlType: string | null; region: Element | null }
  let readPolicies = new Map<string, ReadPolicy>();
  let nativeTypes = new Map<string, string>();
  let nativeGeometry = new Map<string, string>();
  const privateValues = new Map<string, boolean>();
  let inventoryBytes = 0;
  let inventoryFailed = false;
  let root = document.documentElement;
  let revision = 0;
  let observedRevision = -1;
  let documentId = '';
  let generation = 0;
  let candidateUniverseComplete = false;
  let identities = new Map<string, Element>();
  let resolutions: { element: Element; hints: LocatorHint[]; unresolvedRole: string | null; unresolvedLabel: boolean }[] = [];
  interface AcquisitionCandidate {element:Element;hints:LocatorHint[];role:string;elementType:ObservationNode['elementType'];controlType:ObservationNode['controlType'];visibilityOnly:boolean;hard:boolean;unresolvedRole:string|null;unresolvedLabel:boolean;actionable:boolean;readPossible:boolean;}
  let acquisitionCandidates:AcquisitionCandidate[]=[];
  let acquisitionNodes=new Map<Element,ObservationNode>();
  let hardDescendants=new Set<Element>();
  let approvedHints = new Map<string, LocatorHint[]>();
  let styles: { element: Element; signature: string; shadow: ShadowRoot | null }[] = [];
  let structure: { element: Element; shadow: ShadowRoot | null }[] = [];
  let trackedStyles = new Set<Element>();
  let fields: { element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; signature: string }[] = [];
  const observer = new MutationObserver(() => { revision++; });
  const observationOptions = { subtree: true, attributes: true, childList: true, characterData: true };
  observer.observe(document, observationOptions);
  const changed = () => { revision++; };
  document.addEventListener('input', changed, true);
  document.addEventListener('change', changed, true);
  const drain = () => { if (observer.takeRecords().length) revision++; };
  const valid = (text: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
  // These are the exact text transformations used by the supported locator-name subset.
  // Scrubbing applies the same transformation to values, never only to displayed names.
  const normalizeName = (text: string) => text.replace(/[\u200b\u00ad]/gu, '').replace(/\s+/gu, ' ').trim();
  const inventoryValue = (value: string, strict: boolean) => {
    if (disposed || inventoryFailed) throw new Error('CONTEXT_LOST');
    if (!valid(value)) { inventoryFailed = true; throw new Error('INVALID_UNICODE'); }
    for (const variant of [value, normalizeName(value)]) {
      if (!variant) continue;
      if (!privateValues.has(variant)) {
        const bytes = new TextEncoder().encode(variant).length;
        if (privateValues.size >= 4096 || inventoryBytes + bytes > 1048576) { inventoryFailed = true; throw new Error('PRIVATE_INVENTORY_LIMIT'); }
        inventoryBytes += bytes;
      }
      privateValues.set(variant, strict || privateValues.get(variant) === true);
    }
  };
  for (const [value, strict] of priorInventory) inventoryValue(value, strict);
  for (const value of options.knownSecrets) inventoryValue(value, true);
  priorInventory.length = 0;
  const sensitive = (text: string) => /password|passcode|secret|credential|auth(?:entication|orization)?|bearer|token|social.security|credit.card/iu.test(text);
  const bounded = (value: string | null): string => {
    if (value === null) return '';
    if (!valid(value)) throw new Error('INVALID_UNICODE');
    return value.length > 512 ? '' : value;
  };
  const snapshotField = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): { values: string[]; signature: string } | null => {
    const selected = element instanceof HTMLSelectElement && element.multiple ? element.selectedOptions : null;
    if (selected && selected.length > options.workLimits.elements) return null;
    const values: string[] = [];
    let bytes = 0;
    const count = selected ? selected.length : 1;
    for (let index = 0; index < count; index++) {
      const value = selected ? selected.item(index)?.value ?? '' : element.value;
      if (!valid(value)) throw new Error('INVALID_UNICODE');
      bytes += value.length * 3;
      if (value.length > 4096 || bytes > 65536) return null;
      values.push(value);
    }
    const checked = element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type) ? element.checked : null;
    return { values, signature: JSON.stringify([values, checked]) };
  };
  const parentOf = (element: Element): Element | null => {
    if (element.assignedSlot) return element.assignedSlot;
    if (element.parentElement) return element.parentElement;
    const tree = element.getRootNode();
    return tree instanceof ShadowRoot ? tree.host : null;
  };
  // Apply identical source eligibility wherever text is reached: traversal, ARIA/native
  // labels, inline descendants and term/value neighborhoods. Relationships cannot escape a
  // denied ancestor or alias a password's label into an otherwise ordinary control.
  const eligibility = (element:Element,checkLabelControl=true):{hidden:boolean;hard:boolean}=>{
    let ancestors=0,hidden=false,hard=false;
    for(let current:Element|null=element;current;current=parentOf(current)){
      if(++ancestors>options.workLimits.depth+1)return {hidden,hard:true};rememberStyle(current);const style=getComputedStyle(current);
      hidden ||= current.hasAttribute('hidden')||current.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse';
      hard ||= current.hasAttribute('data-sensitive')||['SCRIPT','STYLE','TEMPLATE','NOSCRIPT'].includes(current.tagName)||current.getAttribute('autocomplete')?.includes('password')===true||(current.hasAttribute('contenteditable')&&current.getAttribute('contenteditable')!=='false')||(current instanceof HTMLInputElement&&['password','hidden'].includes(current.type));
      if(checkLabelControl&&current instanceof HTMLLabelElement&&current.control){const control=eligibility(current.control,false);hidden ||= control.hidden;hard ||= control.hard;}
    }
    return {hidden,hard};
  };
  const eligibleSource=(element:Element,checkLabelControl=true):boolean=>{const state=eligibility(element,checkLabelControl);return !state.hidden&&!state.hard;};
  // Narrow text extraction: at most 32 nodes/two inline levels, never whole-subtree textContent.
  const boundedText = (element: Element, omittedControl: Element | null = null, ownControlName = false): string => {
    let seen = 0;
    let text = '';
    const visit = (node: Node, depth: number): boolean => {
      if (++seen > 32 || depth > 3) return false;
      if (node.nodeType === 3) {
        if ((node.nodeValue?.length ?? 0) > 512) return false;
        text += node.nodeValue ?? '';
        return text.length <= 512;
      }
      if (!(node instanceof Element)) return false;
      if (node.shadowRoot) return false; // This source's composed text is outside the narrow text subset.
      if (node === omittedControl) return true;
      if (node !== element && node.getAttribute('aria-hidden') === 'true') return ownControlName;
      if (node !== element && (!['SPAN', 'STRONG', 'EM', 'B', 'I', 'SMALL'].includes(node.tagName) || ['aria-label', 'aria-labelledby', 'role'].some(attribute => node.hasAttribute(attribute)))) return false;
      const nodeStyle = getComputedStyle(node);
      const separatesText = node !== element && nodeStyle.display !== 'inline';
      if (separatesText && !ownControlName) return false;
      if (nodeStyle.content && !['none', 'normal', '""'].includes(nodeStyle.content)) return false;
      const generated = (pseudo: string) => getComputedStyle(node, pseudo).content;
      if ([generated('::before'), generated('::after')].some(content => content && !['none', 'normal', '""'].includes(content))) return false;
      if (!eligibleSource(node) || !visible(node) || node.childNodes.length > 32) return false;
      if (separatesText) text += ' ';
      for (let index = 0; index < node.childNodes.length; index++) if (!visit(node.childNodes.item(index), depth + 1)) return false;
      if (separatesText) text += ' ';
      return text.length <= 512;
    };
    return eligibleSource(element) && visit(element, 0) ? normalizeName(bounded(text)) : '';
  };
  const visible = (element: Element) => {
    const style = getComputedStyle(element);
    return !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true' && style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
  };
  // Role selectors use accessibility visibility, not the nonempty box needed for actionability.
  // Zero-area competitors must still count (or make the supported proof unresolved).
  const ariaVisible = (element: Element) => {
    let depth = 0;
    for (let ancestor: Element | null = element; ancestor; ancestor = parentOf(ancestor)) {
      if (++depth > options.workLimits.depth + 1) return true; // Unknown visibility cannot remove a competitor.
      rememberStyle(ancestor);
      const style = getComputedStyle(ancestor);
      if (ancestor.parentElement?.shadowRoot && !ancestor.assignedSlot) return false;
      if (ancestor.getAttribute('aria-hidden') === 'true' || ancestor.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  };
  const styleSignature = (element: Element) => {
    const style = getComputedStyle(element);
    return [style.display, style.visibility, style.content, getComputedStyle(element, '::before').content, getComputedStyle(element, '::after').content, visible(element)].join('|');
  };
  const rememberStyle = (element: Element) => {
    if (trackedStyles.has(element)) return;
    trackedStyles.add(element);
    styles.push({ element, signature: styleSignature(element), shadow: element.shadowRoot });
  };
  const supportedRoles = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'spinbutton', 'slider', 'heading', 'main', 'form', 'region', 'navigation', 'status', 'dialog']);
  // Pinned Playwright 1.63 role vocabulary/first-valid-token behavior. Recognizing a role is
  // separate from supporting its name semantics: an alert cannot become a button competitor.
  const validExplicitRoles = new Set([
    'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell', 'checkbox', 'code', 'columnheader',
    'combobox', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory', 'document', 'emphasis', 'feed', 'figure', 'form',
    'generic', 'grid', 'gridcell', 'group', 'heading', 'img', 'insertion', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'mark', 'marquee',
    'math', 'meter', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note', 'option', 'paragraph',
    'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator',
    'slider', 'spinbutton', 'status', 'strong', 'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox',
    'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
  ]);
  const ruleMap = new Map(options.rules.map(rule => [rule.testId, rule]));
  const businessText = (element: Element, maxBytes: number): string => {
    let text = ''; let count = 0;
    const visit = (node: Node, depth: number): void => {
      if (++count > 512 || depth > 8) throw new Error('POLICY_DENIED');
      if (node.nodeType === 3) text += node.nodeValue ?? '';
      else if (node instanceof Element) {
        if (!eligibleSource(node) || !visible(node) || node.shadowRoot || node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement || ['IFRAME','CANVAS','OBJECT','EMBED'].includes(node.tagName)) throw new Error('POLICY_DENIED');
        for (let i = 0; i < node.childNodes.length; i++) visit(node.childNodes.item(i), depth + 1);
      }
      if (text.length > maxBytes || !valid(text)) throw new Error('POLICY_DENIED');
    };
    visit(element,0); if (new TextEncoder().encode(text).length > maxBytes) throw new Error('POLICY_DENIED'); return text;
  };
  /** The same positive resolver supplies observation metadata, preparation and final reads. */
  const resolveReadPolicy = (element: Element): ReadPolicy | null => {
    if (!eligibleSource(element) || !visible(element) || ['IFRAME','CANVAS','OBJECT','EMBED'].includes(element.tagName)) return null;
    const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
    const controlType = element instanceof HTMLTextAreaElement ? 'textarea' : element instanceof HTMLInputElement ? element.type : null;
    if (field && !['text','search','email','tel','url','textarea'].includes(controlType ?? '')) return null;
    if (element instanceof HTMLSelectElement) return null;
    const exact = ruleMap.get(element.getAttribute('data-testid') ?? '');
    if (exact) {
      if (exact.classification === 'structuralOnly' || (field ? exact.classification !== 'nonsecretApproved' : exact.classification !== 'permittedBusinessData')) return null;
      if (!field) { try { businessText(element,4096); } catch { return null; } }
      return { policyRuleId: exact.policyRuleId, classification: exact.classification, kind: field ? 'controlValue' : 'visibleText', controlType, region: null };
    }
    // Ordinary scalar business surfaces have stable semantic labels; region grants do not
    // turn every arbitrary subtree or action caption into a capturable value.
    if (!field && !['OUTPUT','DD','TD'].includes(element.tagName) && element.getAttribute('role') !== 'status') return null;
    if (!field) { try { businessText(element,4096); } catch { return null; } }
    const candidates: { policy: ReadPolicy; priority: number; allowed: boolean }[] = [];
    for (const grant of options.applicationPolicy?.readGrants ?? []) {
      if (grant.origin !== location.origin) continue;
      let region: Element | null = null;
      if (grant.region.kind === 'role') {
        const specification = grant.region;
        const anchors = regionAnchors.filter(anchor => anchor.role === specification.role && anchor.name === specification.name);
        if (anchors.length > 1) return null;
        if (anchors.length !== 1 || !anchors[0]?.element.isConnected || !eligibleSource(anchors[0].element) || !visible(anchors[0].element)) continue;
        region = anchors[0].element;
        let current: Element | null = element; let within = false;
        for (let depth = 0; current && depth <= options.workLimits.depth; depth++, current = parentOf(current)) if (current === region) { within = true; break; }
        if (!within) continue;
      }
      candidates.push({ policy: { policyRuleId: grant.policyRuleId, classification: field ? 'nonsecretApproved' : 'permittedBusinessData', kind: field ? 'controlValue' : 'visibleText', controlType, region }, priority: region ? 1 : 0, allowed: field ? grant.controlValue?.types.some(type => type === controlType) === true : grant.visibleText !== undefined });
    }
    const priority = Math.max(-1,...candidates.map(candidate => candidate.priority));
    const winners = candidates.filter(candidate => candidate.priority === priority);
    return winners.length === 1 && winners[0]?.allowed ? winners[0].policy : null;
  };
  return {
    collect(identity: { documentId: string; generation: number; observedAt: string; maxBytes?: number }): Observation {
      if (disposed || inventoryFailed) throw new Error('CONTEXT_LOST');
      const byteLimit=Math.min(options.limits.bytes,identity.maxBytes??options.limits.bytes);
      drain();
      observer.disconnect();
      observer.observe(document, observationOptions);
      if (root !== document.documentElement) { root = document.documentElement; documentId = ''; }
      if (!documentId) documentId = identity.documentId;
      generation = identity.generation;
      nativeTypes = new Map(); nativeGeometry = new Map(); regionAnchors = []; readPolicies = new Map();
      acquisitionCandidates=[];acquisitionNodes=new Map();hardDescendants=new Set();
      identities = new Map(); fields = []; resolutions = []; approvedHints = new Map(); styles = []; structure = []; trackedStyles = new Set(); candidateUniverseComplete = true;
      const observation: Observation = {
        schemaVersion: 1, sessionId: options.sessionId, scopeHash: options.scopeHash,
        documentId, generation, observedAt: identity.observedAt, origin: location.origin,
        coverage: { mode: 'semantic', complete: true, truncated: false, withheldRegions: 0, reason: 'complete' }, nodes: [],
      };
      if (!options.approvedOrigins.includes(location.origin)) throw new Error('SCOPE_DENIED');
      const started = performance.now();
      // Strict provenance wins if a value is seen through more than one source, including
      // normalized aliases, late fields and open-shadow fields.
      let secretBytes = 0;
      let visited = 0;
      let bytes = new TextEncoder().encode(JSON.stringify(observation)).length + 128;
      let budget = bytes > byteLimit;
      let unsupported = false;
      const labelsByNode = new Map<string, Element[]>();
      const stack: { element: Element; depth: number; semanticDepth: number; parent: string | null; region: string | null; form: string | null; denied: boolean }[] = [];
      stack.push({ element: root, depth: 0, semanticDepth: 0, parent: null, region: null, form: null, denied: false });
      while (stack.length && !budget) {
        if (visited >= options.workLimits.elements || performance.now() - started >= options.limits.milliseconds) { budget = true; break; }
        const entry = stack.pop();
        if (!entry) break;
        const { element, depth, semanticDepth } = entry;
        visited++;
        structure.push({ element, shadow: element.shadowRoot });
        if (element.shadowRoot) observer.observe(element.shadowRoot, observationOptions);
        const tag = element.tagName.toLowerCase();
        if (element.hasAttribute('data-sensitive')) {
          // Inventory explicit private text without reading an unbounded subtree or exporting it.
          let count=0; let privateText='';
          const visitPrivate=(node: Node, level: number): void => {
            if(++count>32 || level>4 || performance.now()-started>=options.limits.milliseconds) { inventoryFailed=true; throw new Error('PRIVATE_INVENTORY_LIMIT'); }
            if(node.nodeType===3) { const text=node.nodeValue??''; if(text.length>4096 || privateText.length+text.length>4096) { inventoryFailed=true;throw new Error('PRIVATE_INVENTORY_LIMIT'); } inventoryValue(text,true);privateText+=text; }
            else for(let child=node.firstChild;child;child=child.nextSibling)visitPrivate(child,level+1);
          };
          visitPrivate(element,0);inventoryValue(privateText,true);
        }

        const input = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
        if (input) {
          const snapshot = snapshotField(element);
          if (!snapshot) { budget = true; break; }
          secretBytes += snapshot.values.reduce((total, value) => total + value.length * 3, 0);
          if (secretBytes > 65536) { budget = true; break; }
          fields.push({ element, signature: snapshot.signature });
          const eligible = eligibleSource(element);
          const nativeAction = eligible && element instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(element.type);
          const implicitToggle = eligible && element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type) && !element.hasAttribute('value') && element.value === 'on';
          // Native action captions are structural names, not independent private sources. An
          // ARIA role cannot turn a text/password field into this exemption. All fields remain
          // in the freshness inventory, and other private provenance still scrubs captions.
          if (!nativeAction) for (const value of snapshot.values) inventoryValue(value, !implicitToggle);
        }
        const surface = ['iframe', 'canvas', 'object', 'embed'].includes(tag);
        if(surface||element.hasAttribute('data-sensitive')||['script','style','template','noscript'].includes(tag)||element.getAttribute('autocomplete')?.includes('password')===true||(element.hasAttribute('contenteditable')&&element.getAttribute('contenteditable')!=='false')||(element instanceof HTMLInputElement&&['password','hidden'].includes(element.type))){let parent=parentOf(element);for(let depth=0;parent&&depth<=options.workLimits.depth;depth++,parent=parentOf(parent))hardDescendants.add(parent);}
        if (surface) unsupported = true;
        const testId = bounded(element.getAttribute('data-testid'));
        const rule = ruleMap.get(testId);
        const relevant = input || ['button', 'a', 'area', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'main', 'form', 'section', 'nav', 'dialog', 'output', 'meter', 'progress', 'datalist', 'label', 'dt', 'dd', 'th', 'td'].includes(tag) ||
          ['role', 'aria-label', 'aria-labelledby', 'placeholder', 'data-testid'].some(attribute => element.hasAttribute(attribute));
        let emitted: ObservationNode | undefined;
        if (relevant) {
          rememberStyle(element);
          const controlType = element instanceof HTMLInputElement ? element.type : tag === 'textarea' ? 'textarea' : 'none';
          const labelControl = element instanceof HTMLLabelElement ? element.control : null;
          const unsupportedControl = tag === 'input' && !['text', 'search', 'email', 'tel', 'url', 'password', 'hidden', 'checkbox', 'radio', 'number', 'range', 'button', 'submit', 'reset'].includes(controlType);
          const blocked = unsupportedControl || !eligibleSource(element) || entry.denied || !visible(element);
          const labelElements: Element[] = [];
          const labelNames: string[] = [];
          const labelledBy = bounded(element.getAttribute('aria-labelledby'));
          let name = '';
          let ambiguous = false;
          if (labelledBy) {
            const ids = Array.from(new Set(labelledBy.split(' ').filter(Boolean)));
            if (ids.length > 8) ambiguous = true;
            else for (const id of ids) {
              const label = (element.getRootNode() as Document | ShadowRoot).getElementById(id);
              // A relation never transports its raw DOM ID; only safe observed label text.
              if (!label || !eligibleSource(label) || !visible(label)) { ambiguous = true; break; }
              const text = label.hasAttribute('aria-label') || label.hasAttribute('aria-labelledby') ? '' : boundedText(label, element);
              if (!text) { ambiguous = true; break; }
              labelElements.push(label); labelNames.push(text); name += `${name ? ' ' : ''}${text}`;
            }
          } else {
            name = normalizeName(bounded(element.getAttribute('aria-label')));
            if (name) labelNames.push(name);
          }
          const associated = (element as HTMLInputElement).labels;
          if (!name && associated?.length) {
            if (associated.length > 8) ambiguous = true;
            else for (let index = 0; index < associated.length; index++) {
              const label = associated.item(index);
              if (!eligibleSource(label) || !visible(label) || label.hasAttribute('aria-label') || label.hasAttribute('aria-labelledby')) { ambiguous = true; break; }
              const text = boundedText(label, element);
              if (!text) { ambiguous = true; break; }
              labelElements.push(label); labelNames.push(text);
            }
            name = labelNames.join(' ');
          }
          const placeholder = bounded(element.getAttribute('placeholder'));
          const nativeRole = tag === 'button' ? 'button' : ['a', 'area'].includes(tag) && element.hasAttribute('href') ? 'link' : tag === 'input' || tag === 'textarea' ?
            element instanceof HTMLInputElement && ['email', 'search', 'tel', 'text', 'url'].includes(controlType) && element.list !== null ? 'combobox' : controlType === 'search' ? 'searchbox' : controlType === 'number' ? 'spinbutton' : controlType === 'range' ? 'slider' : controlType === 'checkbox' ? 'checkbox' : controlType === 'radio' ? 'radio' : ['submit', 'button', 'reset', 'file', 'image'].includes(controlType) ? 'button' : 'textbox' :
            tag === 'select' ? (element instanceof HTMLSelectElement && (element.multiple || element.size > 1) ? 'listbox' : 'combobox') : /^h[1-6]$/u.test(tag) ? 'heading' : tag === 'nav' ? 'navigation' : tag === 'dialog' ? 'dialog' : tag === 'output' ? 'status' : tag === 'datalist' ? 'listbox' : tag === 'section' && (element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')) ? 'region' : tag === 'main' || (tag === 'form' && (element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby'))) ? tag : 'generic';
          const rawRole = element.getAttribute('role') ?? '';
          const roleTooLong = rawRole.length > 512;
          const explicit = bounded(rawRole).split(' ').map(token => token.trim()).find(token => validExplicitRoles.has(token)) ?? '';
          const presentation = explicit === 'none' || explicit === 'presentation';
          const unsupportedRole = roleTooLong || presentation || (Boolean(explicit) && !supportedRoles.has(explicit));
          const role = explicit && !presentation ? explicit : nativeRole;
          // Native submit/reset/button names differ from text inputs. Values stay local and
          // are still scrubbed from exported nodes; their names must count as competitors.
          if (!labelledBy && !normalizeName(element.getAttribute('aria-label') ?? '') && element instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(controlType)) {
            name = normalizeName(bounded(element.value));
            if (!name && !element.value.trim()) name = controlType === 'submit' ? 'Submit' : controlType === 'reset' ? 'Reset' : normalizeName(bounded(element.getAttribute('title')));
          }
          if (!name && tag === 'area') name = normalizeName(bounded(element.getAttribute('alt')));
          if (!name && ['button', 'link', 'heading'].includes(role)) name = boundedText(element, null, true);
          if (!name) name = normalizeName(bounded(element.getAttribute('title')));
          if (!name && (tag === 'textarea' || (tag === 'input' && ['text', 'search', 'email', 'tel', 'url', 'number', 'password'].includes(controlType)))) name = normalizeName(placeholder);
          if (!name && ['label', 'dt', 'th'].includes(tag)) name = boundedText(element, labelControl);
          // DOM fallback is confined to an adjacent term/value or header/value neighborhood.
          // Only the term is exported; the actual value stays behind its opaque local identity.
          const preceding = element.previousElementSibling;
          const term = (tag === 'dd' && preceding?.tagName === 'DT') || (tag === 'td' && preceding?.tagName === 'TH') ? preceding : null;
          let fallback = false;
          if (!name && term && eligibleSource(term) && visible(term)) {
            name = boundedText(term); labelElements.push(term); fallback = true;
          }
          if (['main','region','form'].includes(role)) regionAnchors.push({ element, role, name });
          if (rule?.accessibleName === undefined && rule) { name = rule.name; fallback = true; }
          const displayName = name || placeholder;
          const description = bounded(element.getAttribute('aria-description'));
          // Descriptions are not an exported channel; referenced descriptions are withheld until
          // a bounded policy can safely separate their label and value content.
          ambiguous ||= element.hasAttribute('aria-describedby') || element.hasAttribute('aria-owns') ||
            (element.shadowRoot !== null && role !== 'generic' && !labelledBy && !normalizeName(element.getAttribute('aria-label') ?? '') && !associated?.length);
          // The resolver records the supported exact semantic subset for *all* visited elements,
          // including withheld/hidden duplicates. These records and their strings stay local.
          const hints: LocatorHint[] = [];
          if (testId) hints.push({ kind: 'testId', value: testId, exact: true });
          if (placeholder) hints.push({ kind: 'placeholder', value: placeholder, exact: true });
          for (const labelName of labelNames) hints.push({ kind: 'label', value: labelName, exact: true });
          if (name && role !== 'generic' && ariaVisible(element) && controlType !== 'hidden') hints.push({ kind: 'role', role, name, exact: true });
          const unresolvedName = ambiguous || (!name && (element.hasAttribute('aria-labelledby') || element.hasAttribute('aria-label') || element.hasAttribute('title') || Boolean(associated?.length) || (element instanceof HTMLInputElement && ['submit', 'reset', 'button'].includes(controlType) && Boolean(element.value.trim())) || (['button', 'link', 'heading'].includes(role) && element.childNodes.length > 0)));
          resolutions.push({ element, hints, unresolvedRole: ariaVisible(element) ? roleTooLong ? '*' : unsupportedRole || unsupportedControl || unresolvedName ? role : null : null, unresolvedLabel: unresolvedName && (Boolean(associated?.length) || element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')) });
          const eligibilityFacts=eligibility(element);
          const privateHints=[...hints];if(name&&role!=='generic'&&!privateHints.some(h=>h.kind==='role'))privateHints.push({kind:'role',role,name,exact:true});
          acquisitionCandidates.push({element,hints:privateHints,role,
            elementType:tag==='a'?'link':['button','input','textarea','select'].includes(tag)?tag as ObservationNode['elementType']:fallback?'text':'other',
            controlType:['none','text','search','email','tel','url','textarea','password','hidden'].includes(controlType)?controlType as ObservationNode['controlType']:'other',
            visibilityOnly:eligibilityFacts.hidden,
            hard:eligibilityFacts.hard||unsupportedRole||unsupportedControl||surface||ambiguous||sensitive(displayName+description+testId+placeholder)||element.hasAttribute('contenteditable')||(rule?.accessibleName!==undefined&&name!==rule.accessibleName)||(rule===undefined&&options.applicationPolicy===undefined),
            unresolvedRole:roleTooLong?'*':unsupportedRole||unsupportedControl||unresolvedName?role:null,
            unresolvedLabel:unresolvedName&&(Boolean(associated?.length)||element.hasAttribute('aria-label')||element.hasAttribute('aria-labelledby')),
            actionable:['button','input','textarea','select','a'].includes(tag)&&!element.hasAttribute('disabled')&&element.getAttribute('aria-disabled')!=='true',
            readPossible:rule!==undefined?rule.classification!=='structuralOnly':(options.applicationPolicy?.readGrants??[]).some(grant=>grant.origin===location.origin&&(['input','textarea'].includes(tag)?grant.controlValue?.types.some(type=>type===controlType)===true:grant.visibleText!==undefined&&(['output','dd','td'].includes(tag)||role==='status')))});
          const safe = !unsupportedRole && !blocked && !surface && (rule !== undefined || options.applicationPolicy !== undefined) && !ambiguous && displayName.length > 0 && Array.from(displayName).length <= 256 &&
            !sensitive(displayName + description + testId + placeholder) && !element.hasAttribute('contenteditable') &&
            (rule?.accessibleName === undefined || name === rule.accessibleName);
          const relevant = rule !== undefined || fallback || role !== 'generic' || ['label', 'dt', 'th'].includes(tag);
          if (!safe || !relevant) {
            if (!['html', 'body'].includes(tag)) observation.coverage.withheldRegions++;
          } else {
            if (fallback) observation.coverage.mode = 'boundedDom';
            const nodeId = `node-${String(generation)}-${String(visited)}`;
            emitted = {
              nodeId, documentId, generation, role, name: rule?.name ?? displayName,
              elementType: tag === 'a' ? 'link' : ['button', 'input', 'textarea', 'select'].includes(tag) ? tag as ObservationNode['elementType'] : fallback ? 'text' : 'other',
              controlType: ['none', 'text', 'search', 'email', 'tel', 'url', 'textarea', 'password', 'hidden'].includes(controlType) ? controlType as ObservationNode['controlType'] : 'other',
              classification: rule?.classification ?? 'structuralOnly', policyRuleId: rule?.policyRuleId ?? options.applicationPolicy?.policyRuleId ?? '',
              visible: true, actionable: ['button', 'input', 'textarea', 'select', 'a'].includes(tag) && !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true',
              depth: semanticDepth, parentNodeId: entry.parent, regionId: entry.region, formId: entry.form, labelNodeIds: [], locatorHints: [],
            };
            if (testId && Array.from(testId).length <= 256) emitted.locatorHints.push({ kind: 'testId', value: testId, exact: true });
            if (!fallback && name && role !== 'generic') emitted.locatorHints.push({ kind: 'role', role, name, exact: true });
            if (!fallback) for (const labelName of labelNames) emitted.locatorHints.push({ kind: 'label', value: labelName, exact: true });
            if (!fallback && placeholder && Array.from(placeholder).length <= 256) emitted.locatorHints.push({ kind: 'placeholder', value: placeholder, exact: true });
            emitted.locatorHints = emitted.locatorHints.slice(0, 5);
            observation.nodes.push(emitted); identities.set(nodeId, element); labelsByNode.set(nodeId, labelElements); approvedHints.set(nodeId, emitted.locatorHints);
          }
        }
        // Count light and open-shadow descendants in the same traversal/depth/time budgets.
        // Never materialize a whole child list; root transitions retain real Element identity.
        const trees: { parent: Element | ShadowRoot; shadow: boolean }[] = [{ parent: element, shadow: false }];
        if (element.shadowRoot) trees.push({ parent: element.shadowRoot, shadow: true });
        for (const tree of trees) {
          if (tree.parent.children.length && depth >= options.workLimits.depth) { budget = true; break; }
          for (let child = tree.parent.lastElementChild; child; child = child.previousElementSibling) {
            if (stack.length + visited >= options.workLimits.elements) { budget = true; break; }
            stack.push({ element: child, depth: depth + 1, semanticDepth: emitted ? semanticDepth + 1 : semanticDepth,
              parent: emitted?.nodeId ?? entry.parent,
              region: emitted && ['main', 'region', 'navigation'].includes(emitted.role) ? emitted.nodeId : entry.region,
              // Native form association does not cross a shadow boundary.
              form: tree.shadow ? null : emitted && tag === 'form' ? emitted.nodeId : entry.form,
              denied: entry.denied || surface || element.hasAttribute('data-sensitive') || element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true' || ['script', 'style', 'template', 'noscript'].includes(tag),
            });
          }
          if (budget) break;
        }
      }
      // Classify with the complete region universe; inventory authorized text sources before
      // exporting ANY structural hint, including echoes elsewhere in this document.
      let businessBytes = 0;
      for (const node of observation.nodes) {
        if (performance.now() - started >= options.limits.milliseconds) { budget = true; break; }
        const element = identities.get(node.nodeId); if (!element) continue;
        const policy = resolveReadPolicy(element);
        node.classification = 'structuralOnly';
        if (policy) {
          node.classification = policy.classification; node.policyRuleId = policy.policyRuleId; readPolicies.set(node.nodeId,policy);
          if (policy.kind === 'visibleText') {
            const text = businessText(element,4096); businessBytes += new TextEncoder().encode(text).length;
            if (businessBytes > 65536) { budget = true; break; } inventoryValue(text,true);
          }
        }
      }
      // Scrub page-derived fields only. Protocol keys, structural enums, policy IDs and opaque
      // identities are not copied input data. Only safe implicit checkbox/radio `on` has token
      // semantics; every other source uses substring matching at every length.
      const echoed = (text: string, value: string, strict: boolean): boolean => {
        if (strict) return text.includes(value);
        let position = text.indexOf(value);
        while (position !== -1) {
          const before = Array.from(text.slice(0, position)).at(-1) ?? '';
          const next = text.codePointAt(position + value.length);
          const after = next === undefined ? '' : String.fromCodePoint(next);
          if (!/[\p{L}\p{M}\p{N}_]/u.test(before) && !/[\p{L}\p{M}\p{N}_]/u.test(after)) return true;
          position = text.indexOf(value, position + 1);
        }
        return false;
      };
      // At most workLimits.elements bounded structural candidates exist here. We never serialize
      // this private candidate set as a document; outgoing limits apply to the retained tree below.
      const candidateParents = new Map(observation.nodes.map(node => [node.nodeId, node.parentNodeId]));
      observation.nodes = observation.nodes.filter(node => {
        if (budget || performance.now() - started >= options.limits.milliseconds) { budget = true; return false; }
        const pageText = [node.name, ...node.locatorHints.map(hint => hint.kind === 'role' ? hint.name : hint.value)].flatMap(text => [text, normalizeName(text)]);
        for (const [value, strict] of privateValues) {
          if (performance.now() - started >= options.limits.milliseconds) { budget = true; return false; }
          if (pageText.some(text => echoed(text, value, strict))) {
            identities.delete(node.nodeId); observation.coverage.withheldRegions++; return false;
          }
        }
        return true;
      });
      for(const candidate of acquisitionCandidates){
        if(performance.now()-started>=options.limits.milliseconds){budget=true;break;}
        const strings=candidate.hints.map(h=>h.kind==='role'?h.name:h.value).flatMap(value=>[value,normalizeName(value)]);
        for(const [value,strict]of privateValues){if(performance.now()-started>=options.limits.milliseconds){budget=true;break;}if(strings.some(text=>echoed(text,value,strict))){candidate.hard=true;break;}}
      }
      const retained = new Set(observation.nodes.map(node => node.nodeId));
      const nodeByElement = new Map(observation.nodes.map(node => [identities.get(node.nodeId), node.nodeId]));
      const retainedDepths = new Map<string, number>();
      let outgoingNodes = 0;
      for (const node of observation.nodes) {
        let parent = node.parentNodeId;
        while (parent !== null && !retained.has(parent)) parent = candidateParents.get(parent) ?? null;
        node.parentNodeId = parent;
        node.depth = parent === null ? 0 : (retainedDepths.get(parent) ?? 0) + 1;
        retainedDepths.set(node.nodeId, node.depth);
        node.labelNodeIds = (labelsByNode.get(node.nodeId) ?? []).map(element => nodeByElement.get(element)).filter((id): id is string => id !== undefined).slice(0, 20);
        if (!retained.has(node.regionId ?? '')) node.regionId = null;
        if (!retained.has(node.formId ?? '')) node.formId = null;
        // Account incrementally before serializing any outgoing observation as a whole.
        bytes += new TextEncoder().encode(JSON.stringify(node)).length + 1;
        if (++outgoingNodes > options.limits.nodes || node.depth > options.limits.depth || bytes > byteLimit) { budget = true; break; }
      }
      if (bytes > byteLimit || performance.now() - started >= options.limits.milliseconds) budget = true;
      // Incomplete traversal cannot prove all current-value echoes scrubbed: withhold the result.
      if (budget) { observation.nodes = []; identities.clear(); candidateUniverseComplete = false; }
      observation.coverage.truncated = budget;
      observation.coverage.reason = budget ? 'budget' : unsupported ? 'unsupportedSurface' : observation.coverage.withheldRegions ? 'sensitivity' : 'complete';
      observation.coverage.complete = observation.coverage.reason === 'complete';
      acquisitionNodes=new Map(observation.nodes.flatMap(node=>{const element=identities.get(node.nodeId);return element?[[element,node] as const]:[];}));
      observedRevision = revision;
      return observation;
    },
    acquire(request:AcquisitionRequest):AcquisitionResult {
      const refuse=(code:'TARGET_DRIFT'|'READ_REFUSED'|'POLICY_REFUSED'='TARGET_DRIFT'):AcquisitionResult=>({kind:'REFUSED',code});
      drain();const started=performance.now();
      if(disposed||inventoryFailed||!candidateUniverseComplete||request.documentId!==documentId||request.generation!==generation||request.origin!==location.origin||!options.approvedOrigins.includes(request.origin)||root!==document.documentElement||observedRevision!==revision)return refuse();
      if(request.locator.kind==='text')return refuse();
      if(!structure.every(entry=>entry.element.isConnected&&entry.element.shadowRoot===entry.shadow)||!fields.every(field=>performance.now()-started<options.limits.milliseconds&&field.element.isConnected&&snapshotField(field.element)?.signature===field.signature)||!styles.every(entry=>performance.now()-started<options.limits.milliseconds&&entry.element.isConnected&&entry.element.shadowRoot===entry.shadow&&entry.signature===styleSignature(entry.element)))return refuse();
      const equal=(left:LocatorHint,right:LocatorHint)=>left.kind===right.kind&&(left.kind==='role'&&right.kind==='role'?left.role===right.role&&left.name===right.name:'value'in left&&'value'in right&&left.value===right.value);
      if(request.locator.kind==='role'&&acquisitionCandidates.some(c=>c.unresolvedRole==='*'||c.unresolvedRole===(request.locator as {role:string}).role))return refuse();
      if(request.locator.kind==='label'&&acquisitionCandidates.some(c=>c.unresolvedLabel))return refuse();
      const candidates=acquisitionCandidates.filter(candidate=>candidate.hints.some(h=>equal(h,request.locator)));
      if(candidates.length>1)return refuse();
      drain();if(observedRevision!==revision||performance.now()-started>=options.limits.milliseconds)return refuse();
      if(candidates.length===0){if(request.locator.kind==='role'&&acquisitionCandidates.some(candidate=>candidate.hints.some(h=>h.kind==='role'&&h.name===(request.locator as {name:string}).name)))return refuse();return {kind:'ABSENT'};}
      const candidate=candidates[0];if(!candidate||candidate.hard||hardDescendants.has(candidate.element)||!candidate.element.isConnected)return refuse();
      const expected=request.expected,element=candidate.element,op=request.operation;
      if(candidate.role!==expected.role||candidate.elementType!==expected.elementType||candidate.controlType!==expected.controlType||candidate.actionable!==expected.actionable)return refuse();
      const readable=(element instanceof HTMLInputElement&&['text','search','email','tel','url'].includes(element.type))||element instanceof HTMLTextAreaElement;
      if(op.kind==='fill'&&(!readable||element.matches(':disabled')||(element as HTMLInputElement).readOnly))return refuse();
      if(op.kind==='selectOption'&&(!(element instanceof HTMLSelectElement)||element.multiple||element.matches(':disabled')))return refuse();
      if((op.kind==='check'||op.kind==='uncheck')&&(!(element instanceof HTMLInputElement)||!['checkbox',...(op.kind==='check'?['radio']:[])].includes(element.type)))return refuse();
      if(op.kind==='press'&&(!(element instanceof HTMLElement)||element.tabIndex<0))return refuse();
      if(!['read','assert'].includes(op.kind)&&(element.matches(':disabled')||element.getAttribute('aria-disabled')==='true'))return refuse();
      if(op.kind==='assert'&&op.predicate==='hasValue'&&!readable)return refuse();
      if(candidate.visibilityOnly){
        // Existing policy resolves hidden sources to denial. Do not read hidden business text to guess a future grant.
        if(op.kind==='read'||candidate.readPossible||expected.classification!=='structuralOnly'||expected.readRuleId!==null)return refuse('READ_REFUSED');
        return {kind:'VISIBILITY_PENDING'};
      }
      const node=acquisitionNodes.get(element);if(!node||node.visible!==expected.visible||node.classification!==expected.classification)return refuse();
      if(op.kind==='read'&&(node.policyRuleId!==expected.readRuleId||node.policyRuleId!==op.recipe.policyRuleId||node.classification!==op.recipe.classification||(op.recipe.kind==='controlValue'&&node.controlType!==op.recipe.controlType)))return refuse('READ_REFUSED');
      return {kind:'READY',target:{documentId,generation,nodeId:node.nodeId}};
    },
    matches(target: ObservedTarget, hint: LocatorHint, focusStylesOnly = false): boolean {
      const mutations = observer.takeRecords();
      if (mutations.length && (!focusStylesOnly || mutations.length > options.workLimits.elements || mutations.some(record => record.type !== 'attributes' || !['class','style'].includes(record.attributeName ?? '')))) revision++;
      const started = performance.now();
      if ((hint as { exact: unknown }).exact !== true || !candidateUniverseComplete) return false;
      if (observedRevision !== revision || document.documentElement !== root || target.documentId !== documentId || target.generation !== generation ||
        !structure.every(entry => entry.element.isConnected && entry.element.shadowRoot === entry.shadow) ||
        !fields.every(field => field.element.isConnected && snapshotField(field.element)?.signature === field.signature) ||
        !styles.every(entry => performance.now() - started < options.limits.milliseconds && entry.element.isConnected && entry.element.shadowRoot === entry.shadow && entry.signature === styleSignature(entry.element))) return false;
      const equal = (left: LocatorHint, right: LocatorHint): boolean => left.kind === right.kind && (left.kind === 'role' && right.kind === 'role' ? left.role === right.role && left.name === right.name : 'value' in left && 'value' in right && left.value === right.value);
      // This is deliberately not a general Playwright selector engine. Only exact hints emitted
      // by our bounded semantic subset are accepted, and all visited duplicates are counted.
      if (!(approvedHints.get(target.nodeId) ?? []).some(approved => equal(approved, hint))) return false;
      if (hint.kind === 'role' && resolutions.some(record => record.unresolvedRole === '*' || record.unresolvedRole === hint.role)) return false;
      if (hint.kind === 'label' && resolutions.some(record => record.unresolvedLabel)) return false;
      const matches = resolutions.filter(record => record.hints.some(candidate => equal(candidate, hint)));
      return performance.now() - started < options.limits.milliseconds && matches.length === 1 && matches[0]?.element.isConnected === true && matches[0].element === identities.get(target.nodeId);
    },
    withhold(values: string[]): void { for (const value of values) inventoryValue(value, true); },
    privateInventory(): [string, boolean][] { if (disposed || inventoryFailed) throw new Error('CONTEXT_LOST'); return [...privateValues]; },
    navigate(target: { documentId: string; generation: number }, origin: string, destination: string): void {
      if (!this.pageMatches(target, origin) || !options.approvedOrigins.includes(new URL(destination).origin)) throw new Error('TARGET_CHANGED');
      location.assign(destination);
    },
    assertPage(target: { documentId: string; generation: number }, origin: string, predicate: 'url' | 'title', expected: string): boolean {
      if (!this.pageMatches(target, origin)) throw new Error('TARGET_CHANGED');
      return (predicate === 'url' ? location.href : document.title) === expected;
    },
    pageMatches(target: { documentId: string; generation: number }, origin: string): boolean {
      drain();
      return observedRevision === revision && root === document.documentElement && target.documentId === documentId && target.generation === generation && location.origin === origin;
    },
    validateInvocation(invocation: GuidedInvocation, allowViewportShift = false): boolean {
      const { target, operation, origin } = invocation;
      if (location.origin !== origin || !this.matches(target, target.locator)) return false;
      const element = identities.get(target.nodeId);
      if (!(element instanceof HTMLElement) || !eligibleSource(element) || !visible(element)) return false;
      const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
      const readable = field && (element instanceof HTMLTextAreaElement || ['text','search','email','tel','url'].includes(element.type));
      if (operation.kind === 'read') {
        const policy = resolveReadPolicy(element); const retained = readPolicies.get(target.nodeId);
        return Boolean(policy && retained && policy.region === retained.region && policy.policyRuleId === retained.policyRuleId && policy.kind === operation.recipe.kind && policy.policyRuleId === operation.recipe.policyRuleId && policy.classification === operation.recipe.classification && (operation.recipe.kind !== 'controlValue' || policy.controlType === operation.recipe.controlType));
      }
      if (operation.kind === 'fill') return readable && !element.matches(':disabled') && !element.readOnly;
      if (operation.kind === 'selectOption') return element instanceof HTMLSelectElement && !element.matches(':disabled') && !element.multiple;
      if (operation.kind === 'assert') return operation.predicate === 'visible' || (operation.predicate === 'hasValue' ? readable : operation.predicate === 'containsText');
      if (operation.kind === 'navigate' || element.matches(':disabled')) return false;
      const rect = element.getBoundingClientRect();
      const geometry = JSON.stringify([rect.x,rect.y,rect.width,rect.height]);
      const previous = nativeGeometry.get(target.nodeId);
      if (!allowViewportShift && previous !== undefined && previous !== geometry) return false;
      nativeGeometry.set(target.nodeId,geometry);
      if (operation.kind === 'check' || operation.kind === 'uncheck') return element instanceof HTMLInputElement && (element.type === 'checkbox' || operation.kind === 'check' && element.type === 'radio');
      if (operation.kind === 'press') return element.tabIndex >= 0;
      return true;
    },
    nativeTarget(invocation: GuidedInvocation): Element {
      if (!this.validateInvocation(invocation)) throw new Error('TARGET_CHANGED');
      const element = identities.get(invocation.target.nodeId);
      if (!element) throw new Error('TARGET_CHANGED');
      if (element instanceof HTMLInputElement) nativeTypes.set(invocation.target.nodeId, element.type);
      return element;
    },
    confirmToggle(invocation: GuidedInvocation, element: Element): boolean {
      const { target, operation, origin } = invocation;
      // Expected input/change mutations do not invalidate the postcondition. Check only the
      // original retained node and current document/type/policy, never resolve a replacement.
      return !disposed && root === document.documentElement && location.origin === origin &&
        target.documentId === documentId && target.generation === generation && identities.get(target.nodeId) === element &&
        element.isConnected && element instanceof HTMLInputElement && nativeTypes.get(target.nodeId) === element.type && eligibleSource(element) && visible(element) &&
        !element.matches(':disabled') && (element.type === 'checkbox' || operation.kind === 'check' && element.type === 'radio') &&
        (operation.kind === 'check' || operation.kind === 'uncheck') && element.checked === (operation.kind === 'check');
    },
    nativeState(invocation: GuidedInvocation): { alreadyChecked: boolean; requiresReveal: boolean } {
      const element = this.nativeTarget(invocation); const op = invocation.operation;
      const alreadyChecked = element instanceof HTMLInputElement && (op.kind === 'check' || op.kind === 'uncheck') && element.checked === (op.kind === 'check');
      const rect = element.getBoundingClientRect();
      let requiresReveal = rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight;
      let ancestor = parentOf(element);
      for (let depth = 0; ancestor && depth <= options.workLimits.depth; depth++, ancestor = parentOf(ancestor)) {
        const style = getComputedStyle(ancestor); const clip = ancestor.getBoundingClientRect();
        if (['auto','scroll','hidden','clip'].includes(style.overflowX) && (rect.left < clip.left || rect.right > clip.right)) requiresReveal = true;
        if (['auto','scroll','hidden','clip'].includes(style.overflowY) && (rect.top < clip.top || rect.bottom > clip.bottom)) requiresReveal = true;
      }
      if (ancestor) throw new Error('TARGET_CHANGED');
      return { alreadyChecked, requiresReveal };
    },
    acceptReveal(invocation: GuidedInvocation, element: Element): boolean {
      // Only the already consumed reveal path can replace a viewport geometry sample. All
      // document, mutation, type, policy, retained identity and uniqueness checks still apply.
      return identities.get(invocation.target.nodeId) === element && this.validateInvocation(invocation,true);
    },
    nativePoint(invocation: GuidedInvocation): { x: number; y: number; alreadyChecked: boolean } {
      const element = this.nativeTarget(invocation);
      const rect = element.getBoundingClientRect(); const x = rect.x + rect.width / 2; const y = rect.y + rect.height / 2;
      let hit = document.elementFromPoint(x,y);
      for (let depth = 0; depth < 64 && hit?.shadowRoot; depth++) { const inner = hit.shadowRoot.elementFromPoint(x,y); if (!inner || inner === hit) break; hit = inner; }
      let candidate = hit; let matches = false;
      for (let depth = 0; candidate && depth < 64; depth++, candidate = parentOf(candidate)) if (candidate === element) { matches = true; break; }
      if (!matches || getComputedStyle(element).pointerEvents === 'none') throw new Error('TARGET_CHANGED');
      const op = invocation.operation;
      const alreadyChecked = element instanceof HTMLInputElement && (op.kind === 'check' || op.kind === 'uncheck') && element.checked === (op.kind === 'check');
      return { x, y, alreadyChecked };
    },
    invoke(invocation: GuidedInvocation): GuidedInvocationResult {
      const { target, operation, resolvedValue, origin } = invocation;
      if (location.origin !== origin || !this.validateInvocation(invocation)) throw new Error('TARGET_CHANGED');
      const element = identities.get(target.nodeId);
      if (!element || !eligibleSource(element) || !visible(element)) throw new Error('POLICY_DENIED');
      const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
      const readable = field && (element instanceof HTMLTextAreaElement || ['text','search','email','tel','url'].includes(element.type));
      const editable = readable && !element.disabled && !element.readOnly;
      const value = () => { if (resolvedValue === null) throw new Error('POLICY_DENIED'); return resolvedValue; };
      const event = (name: string) => element.dispatchEvent(new Event(name, { bubbles: true }));
      switch (operation.kind) {
        case 'read': {
          let captured = '';
          if (operation.recipe.kind === 'controlValue') {
            if (!field) throw new Error('POLICY_DENIED'); captured = element.value;
          } else captured = businessText(element,invocation.maxValueBytes);
          if (!valid(captured) || !captured.trim() || new TextEncoder().encode(captured).length > invocation.maxValueBytes) throw new Error('POLICY_DENIED');
          return { value: captured };
        }
        case 'fill': {
          if (!editable) throw new Error('POLICY_DENIED');
          const originalType = element instanceof HTMLTextAreaElement ? 'textarea' : element.type;
          element.focus();
          // Focus handlers run synchronously and can replace, hide, retype or move this field.
          // Only inert class/style mutations may be tolerated, and all retained structural,
          // style, value, uniqueness and live-element checks still run before the write.
          if (location.origin !== origin || !this.matches(target,target.locator,true) || identities.get(target.nodeId) !== element || !element.isConnected || !eligibleSource(element) || !visible(element) || (element.getRootNode() as Document | ShadowRoot).activeElement !== element || element.matches(':disabled') || element.readOnly || element.getAttribute('aria-disabled') === 'true' || (element instanceof HTMLTextAreaElement ? 'textarea' : element.type) !== originalType) throw new Error('POST_FOCUS_CHANGED');
          element.value = value(); event('input'); event('change'); return {};
        }
        case 'selectOption': {
          if (!(element instanceof HTMLSelectElement) || element.disabled || element.multiple) throw new Error('POLICY_DENIED');
          const options = Array.from(element.options).filter(option => option.value === value() && !option.disabled);
          if (options.length !== 1) throw new Error('POLICY_DENIED');
          element.value = value(); event('input'); event('change'); return {};
        }
        case 'click': case 'check': case 'uncheck': case 'hover': case 'press': throw new Error('NATIVE_INPUT_REQUIRED');
        case 'assert': {
          if (operation.predicate === 'visible') return { assertionPassed: true };
          if (operation.predicate === 'hasValue') { if (!readable) throw new Error('POLICY_DENIED'); return { assertionPassed: element.value === value() }; }
          if (operation.predicate === 'containsText') return { assertionPassed: (element as HTMLElement).innerText.includes(value()) };
          throw new Error('POLICY_DENIED');
        }
        case 'navigate': throw new Error('POLICY_DENIED');
      }
    },
    dispose(): void { disposed = true;acquisitionCandidates=[];acquisitionNodes.clear();hardDescendants.clear(); privateValues.clear(); inventoryBytes = 0; options.knownSecrets = []; observer.disconnect(); document.removeEventListener('input', changed, true); document.removeEventListener('change', changed, true); identities.clear(); nativeTypes.clear(); nativeGeometry.clear(); readPolicies.clear(); regionAnchors = []; fields = []; resolutions = []; approvedHints.clear(); styles = []; structure = []; trackedStyles.clear(); },
  };
}
