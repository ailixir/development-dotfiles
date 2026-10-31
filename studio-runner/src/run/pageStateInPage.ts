/// <reference lib="dom" />
import type { PasswordTarget } from './observationTypes.js';

/**
 * The page-state program (ADR-SC-007 WI-4, plan D-7). It is the password code that used to live in the
 * observation collector, and nothing else: the DOM revision counter
 * (a MutationObserver), the single password-candidate definition used by count, prepare and fill, the pinned
 * prepare/fill pair and stable(). Observation and element targets are not here: perception (WI-2) owns the first,
 * and step code (`stepCode.ts`) acts on the page itself.
 *
 * Closure-free like `perceptionInPage.ts`: the runner sends `installPageState.toString()` to the CDP isolated world
 * named `checks-observation-<uuid>` (the same world the perception engine uses) with `Runtime.callFunctionOn`, and
 * keeps the returned object as a private remote handle. Nothing is stamped on the application DOM and nothing is
 * installed on `window`. One instance lives per observe() call and is disposed with it.
 *
 * The bodies below are moved from the collector without a change of behaviour. What is gone with the collector:
 * the style/field/structure tracking that fed the element-staleness gate (an element target is now proven by the
 * resolver and the executor, not by a held page snapshot) and the in-page private inventory (a PrivateInventory
 * object on the runner side). `navigationProceed` is kept (moved with the event monitor) so that the password
 * isolated-world parity test keeps every assertion; the native-navigation sequence of `targetAction.ts` does not
 * use it.
 *
 * The unit tier cannot execute this (no DOM); the perception tier does, and `test/run/passwordControlResolution.test.ts`
 * drives it against DOM stubs.
 */
export function installPageState(options: { allowedDomains: readonly string[] }) {
  const WORK_ELEMENTS = 4096;
  const WORK_DEPTH = 64;
  let disposed = false;
  const root = document.documentElement as Element | null;
  let revision = 0;
  let observedRevision = -1;
  let documentId = '';
  let generation = 0;
  let navigationEvent: Event | null = null;
  const navigationMonitor = (event: Event): void => { navigationEvent = event; };
  for (const name of ['click', 'keydown', 'submit']) document.addEventListener(name, navigationMonitor);
  // The navigation whitelist, matched on `location.hostname` (lowercase punycode) on label boundaries. The entry `*` is the
  // allow-all list (`ALL_DOMAINS` in `src/allowedDomains.ts`): it matches the host of the page the program is on.
  const hostIn = (host: string, entry: string): boolean => entry === '*' || host === entry || host.endsWith('.' + entry);
  const domainAllowed = (host: string): boolean => options.allowedDomains.some(entry => hostIn(host, entry));
  class PasswordPrewriteRefusal extends Error {}
  const passwordResult = (success: string, work: () => void): { kind: string; code?: string } => {
    try { work(); return { kind: success }; } catch (error) { if (error instanceof PasswordPrewriteRefusal) return { kind: 'passwordPrewriteRefusal', code: error.message }; throw error; }
  };
  let passwordUniverseComplete = true;
  let passwordPin: { element: HTMLInputElement; revision: number; origin: string } | null = null;
  const observer = new MutationObserver(() => { revision++; });
  const observationOptions = { subtree: true, attributes: true, childList: true, characterData: true };
  observer.observe(document, observationOptions);
  // A 'change' that the browser fires on the previously focused field when the password field takes focus (an edited username blurs) is our own
  // focus move, not a page change: it must not invalidate the pin.
  let focusing = false;
  const changed = (event: Event) => { if (focusing && event.type === 'change') return; revision++; };
  document.addEventListener('input', changed, true);
  document.addEventListener('change', changed, true);
  const drain = () => { if (observer.takeRecords().length) revision++; };
  const parentOf = (element: Element): Element | null => {
    if (element.assignedSlot) return element.assignedSlot;
    if (element.parentElement) return element.parentElement;
    const tree = element.getRootNode();
    return tree instanceof ShadowRoot ? tree.host : null;
  };
  const visible = (element: Element) => {
    const style = getComputedStyle(element);
    return !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true' && style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
  };
  // Accessibility visibility, not the nonempty box needed for actionability: zero-area competitors must still count.
  const ariaVisible = (element: Element) => {
    let depth = 0;
    for (let ancestor: Element | null = element; ancestor; ancestor = parentOf(ancestor)) {
      if (++depth > WORK_DEPTH + 1) return true; // Unknown visibility cannot remove a competitor.
      const style = getComputedStyle(ancestor);
      if (ancestor.parentElement?.shadowRoot && !ancestor.assignedSlot) return false;
      if (ancestor.getAttribute('aria-hidden') === 'true' || ancestor.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  };
  /** Sole password candidate definition for count, prepare and fill; off-screen rendered
   * decoys count. Only this document and open shadow roots are traversed. */
  const passwordCandidates = (): HTMLInputElement[] => {
    const candidates: HTMLInputElement[] = [], pending: Element[] = [document.documentElement];
    let visited = 0; passwordUniverseComplete = true;
    while (pending.length) {
      const element = pending.pop();
      if (!element || ++visited > WORK_ELEMENTS) { passwordUniverseComplete = false; return []; }
      if (element instanceof HTMLInputElement && element.type === 'password' && visible(element) && ariaVisible(element) && !element.matches(':disabled') && !element.readOnly && element.getAttribute('aria-disabled') !== 'true') candidates.push(element);
      if (candidates.length > 500) throw new PasswordPrewriteRefusal('PASSWORD_TARGET_AMBIGUOUS');
      for (const child of Array.from(element.children)) pending.push(child);
      if (element.shadowRoot) {
        observer.observe(element.shadowRoot, observationOptions);
        for (const child of Array.from(element.shadowRoot.children)) pending.push(child);
      }
    }
    return candidates;
  };
  const passwordGuard = (target: PasswordTarget, origin: string): void => {
    drain();
    if (disposed || !passwordUniverseComplete || root !== document.documentElement || target.documentId !== documentId || target.generation !== generation || location.origin !== origin || !domainAllowed(location.hostname) || observedRevision !== revision) throw new PasswordPrewriteRefusal('TARGET_CHANGED');
  };
  return {
    /** The installation's immutable document witness, independent of URL and ordinary DOM mutations. */
    sameDocument(): boolean { return !disposed && root !== null && root === document.documentElement; },
    /** The DOM revision, after folding in any mutation records not yet counted. The runner reads it before it perceives. */
    revision(): number { drain(); return revision; },
    /**
     * Records what the observation is stamped with (what the collector set at the end of collect()): the document element, the
     * identity and the revision the page had when the observation was taken. A mutation after that revision fails every later
     * pageMatches / prepare / fill, so a held observation is never used against a page it no longer describes.
     */
    stamp(stampedDocumentId: string, stampedGeneration: number, stampedRevision: number): void {
      if (disposed) throw new Error('CONTEXT_LOST');
      if (root !== document.documentElement) throw new Error('TARGET_CHANGED');
      drain();
      documentId = stampedDocumentId; generation = stampedGeneration;
      observedRevision = stampedRevision; passwordPin = null;
    },
    /** The number of password controls on the page (the one candidate definition). */
    passwordCount(): number { if (disposed) throw new Error('CONTEXT_LOST'); return passwordCandidates().length; },
    /** True when the document stayed unchanged since revision `since` for `quietMs`: the observation is then still the live page. */
    async stable(quietMs: number, since: number): Promise<boolean> {
      const deadline = performance.now() + quietMs;
      while (performance.now() < deadline) {
        await new Promise<void>(resolve => { setTimeout(resolve, 50); });
        drain();
        if (since !== revision) return false;
      }
      return true;
    },
    preparePasswordResult(target: PasswordTarget, origin: string): { kind: string; code?: string } { return passwordResult('passwordPrepared', () => { this.preparePassword(target, origin); }); },
    fillPasswordResult(target: PasswordTarget, origin: string, allowedOrigins: string[], value: string): { kind: string; code?: string } { return passwordResult('passwordWriteCompleted', () => { this.fillPassword(target, origin, allowedOrigins, value); }); },
    preparePassword(target: PasswordTarget, origin: string): void {
      passwordGuard(target, origin);
      const candidates = passwordCandidates();
      if (candidates.length !== 1) throw new PasswordPrewriteRefusal(candidates.length === 0 ? 'PASSWORD_TARGET_ABSENT' : 'PASSWORD_TARGET_AMBIGUOUS');
      const element = candidates[0]; if (!element) throw new PasswordPrewriteRefusal('PASSWORD_TARGET_ABSENT');
      passwordPin = { element, revision, origin: location.origin };
    },
    fillPassword(target: PasswordTarget, origin: string, allowedOrigins: string[], value: string): void {
      passwordGuard(target, origin);
      const pin = passwordPin;
      if (pin?.revision !== revision || !pin.element.isConnected || pin.element.type !== 'password') throw new PasswordPrewriteRefusal('TARGET_CHANGED');
      const confirm = (focusStylesOnly = false): void => {
        const mutations = observer.takeRecords();
        if (mutations.length && (!focusStylesOnly || mutations.some(record => record.type !== 'attributes' || !['class', 'style'].includes(record.attributeName ?? '')))) revision++;
        const candidates = passwordCandidates();
        if (pin.revision !== revision || !pin.element.isConnected || pin.element.type !== 'password' || candidates.length !== 1 || candidates[0] !== pin.element || location.origin !== pin.origin) throw new PasswordPrewriteRefusal('TARGET_CHANGED');
        if (!allowedOrigins.includes(location.origin) || !domainAllowed(location.hostname)) throw new PasswordPrewriteRefusal('POLICY_DENIED');
        if (pin.element.form ? !allowedOrigins.includes(new URL(pin.element.form.action, location.href).origin) : location.origin !== pin.origin) throw new PasswordPrewriteRefusal('PASSWORD_FORM_ACTION_NOT_ALLOWED');
      };
      confirm(); focusing = true; try { pin.element.focus(); } finally { focusing = false; } confirm(true);
      if ((pin.element.getRootNode() as Document | ShadowRoot).activeElement !== pin.element) throw new PasswordPrewriteRefusal('TARGET_CHANGED');
      pin.element.value = value;
      pin.element.dispatchEvent(new Event('input', { bubbles: true }));
      pin.element.dispatchEvent(new Event('change', { bubbles: true }));
      passwordPin = null;
    },
    navigationProceed(): boolean { return navigationEvent !== null && !navigationEvent.defaultPrevented; },
    dispose(): void {
      navigationEvent = null; for (const name of ['click', 'keydown', 'submit']) document.removeEventListener(name, navigationMonitor);
      passwordPin = null; disposed = true; observer.disconnect();
      document.removeEventListener('input', changed, true); document.removeEventListener('change', changed, true);
    },
  };
}
