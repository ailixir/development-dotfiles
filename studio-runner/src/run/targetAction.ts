/**
 * The one resolver and the one executor of ADR-SC-007 (plan D-3, D-15, D-16). Learn (runtime.dispatch, via
 * ObservationSession.invoke) and replay (the observed replay adapter) both end here. This module has no Playwright
 * import: it works on the structural PageLike / ActionLocator types, which the real Playwright Page and Locator satisfy
 * and which the unit tier fakes.
 *
 * Every export throws only closed errors (closedError.ts): no Playwright text, call log or page value leaves.
 */
import { domainAllowed } from '../allowedDomains.js';
import type { InvocationControl } from '../executor/observedReplay.js';
import { hash } from '../guided/contracts.js';
import type { Action, ObservationFact, ResolvedTarget } from '../guided/types.js';
import { ObservedRefusal } from '../validator/observedReferencePolicy.js';
import { clampMs, type ActionBudget, type ActionProfileTable } from './actionBudget.js';
import { ClosedActionError, closePlaywrightError, type ClosedActionCode, type FencePhase } from './closedError.js';
import { buildPublicLocator, validateLocator, assertLocatorPurpose, childPrefixes, type Locator, type LocatorHandle, type LocatorRoot } from './locatorSynth.js';
import type { TargetInvocationResult } from './observationTypes.js';
import { nameVariant } from './privateInventory.js';
import { chooseForSelect, timed } from './targetOptions.js';
import { identityMatches, identityRequired, parseAriaIdentity } from './targetIdentity.js';

/** A Playwright Request, structurally. */
export interface RequestLike { isNavigationRequest(): boolean; frame(): unknown }

/** The public locator surface the executor uses. The real Playwright Locator satisfies it; unit tests fake it. */
/** The element a locator resolved to at one moment (Playwright ElementHandle, structurally): an action on it can only reach THAT node. */
export interface BoundElement {
  click(o: { timeout: number; noWaitAfter?: boolean }): Promise<void>;
  hover(o: { timeout: number }): Promise<void>;
  check(o: { timeout: number; noWaitAfter?: boolean }): Promise<void>;
  uncheck(o: { timeout: number; noWaitAfter?: boolean }): Promise<void>;
  dispose(): Promise<void>;
}

export interface ActionLocator extends LocatorHandle {
  elementHandle(o: { timeout: number }): Promise<BoundElement | null>;
  count(): Promise<number>;
  ariaSnapshot(o: { timeout: number }): Promise<string>;
  click(o: { trial?: boolean; timeout: number; noWaitAfter?: boolean }): Promise<void>;
  hover(o: { trial?: boolean; timeout: number }): Promise<void>;
  check(o: { trial?: boolean; timeout: number; noWaitAfter?: boolean }): Promise<void>;
  uncheck(o: { trial?: boolean; timeout: number; noWaitAfter?: boolean }): Promise<void>;
  fill(value: string, o: { timeout: number }): Promise<void>;
  selectOption(arg: string | { index: number }, o: { timeout: number }): Promise<unknown>;
  press(key: string, o: { timeout: number; noWaitAfter?: boolean }): Promise<void>;
  focus(o: { timeout: number }): Promise<void>;
  waitFor(o: { state: 'visible' | 'attached'; timeout: number }): Promise<void>;
  isVisible(): Promise<boolean>;
  isEnabled(o?: { timeout?: number }): Promise<boolean>;
  isEditable(o?: { timeout?: number }): Promise<boolean>;
  isChecked(o?: { timeout?: number }): Promise<boolean>;
  isDisabled(o?: { timeout?: number }): Promise<boolean>;
  getAttribute(name: string, o: { timeout: number }): Promise<string | null>;
  textContent(o: { timeout: number }): Promise<string | null>;
  innerText(o: { timeout: number }): Promise<string>;
  inputValue(o: { timeout: number }): Promise<string>;
  and(other: ActionLocator): ActionLocator;
  nth(index: number): ActionLocator;
  locator(css: string): ActionLocator;
  getByText(value: string, o: { exact: boolean }): ActionLocator;
}

export interface PageLike extends LocatorRoot {
  url(): string;
  mainFrame(): unknown;
  locator(css: string): ActionLocator;
  waitForLoadState(state: 'domcontentloaded', o: { timeout: number }): Promise<void>;
  waitForEvent(name: 'request', o: { predicate: (request: RequestLike) => boolean; timeout: number }): Promise<unknown>;
  waitForEvent(name: 'framenavigated', o: { predicate: (frame: unknown) => boolean; timeout: number }): Promise<unknown>;
}

export type ResolveOutcome =
  | { kind: 'READY'; locator: ActionLocator }
  | { kind: 'ABSENT' }
  | { kind: 'REFUSED'; reason: 'TARGET_CHANGED' };

export interface ResolveOptions {
  operation?: Action['operation'];
  origin: string;
  allowedDomains: readonly string[];
  budget: ActionBudget;
  profile: ActionProfileTable;
}

export interface PerformOptions {
  profile: ActionProfileTable;
  budget: ActionBudget;
  /** Learn: the bound-node check of D-16 (true = the locator's single match is still the node bound at prepare). */
  sameNode?: () => Promise<boolean>;
  /** Invoke-local witnesses; never reacquire authority from a newer observation. */
  authority?: () => void;
  verifyCapturedElement?: (candidate: BoundElement, witness: BoundElement) => Promise<void>;
  readText?: () => Promise<string>;
  compareText?: (expected: string) => Promise<boolean>;
  maxValueBytes: number;
  /** The grant id a read was learned under (Guard.readRuleId / recipe.policyRuleId); null for every other operation. */
  readRuleId: string | null;
  /** The grant id the live profile gives the page host (readRuleIdFor); null when none applies. */
  liveReadRuleId: string | null;
  origin: string;
  allowedDomains: readonly string[];
  target: ResolvedTarget;
}

const PASSWORD_SELECTOR = 'input[type="password" i]';
const SENSITIVE_SELECTOR = 'input, textarea, select, iframe, canvas, object, embed, [contenteditable], [data-sensitive]';
const FOCUSABLE_SELECTOR = ':is(a[href], area[href], button, input:not([type="hidden" i]), select, textarea, summary, [contenteditable]:not([contenteditable="false" i]), [tabindex])';
const FILLABLE_SELECTOR = 'input:not([type="checkbox" i]):not([type="radio" i]):not([type="button" i]):not([type="submit" i]):not([type="reset" i]):not([type="image" i]):not([type="file" i]):not([type="hidden" i]):not([type="range" i]):not([type="color" i]), textarea, [contenteditable]:not([contenteditable="false" i])';
const POST_FILL_PASSWORD_INPUTS = 8;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

const closed = (code: ClosedActionCode): ClosedActionError => new ClosedActionError(code);
const validUnicode = (text: string): boolean => !LONE_SURROGATE.test(text);
const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

/** Plan D-3 step a to d: the frozen locator through the public API, exactly one match, identity where the tier needs it. */
export async function resolveTarget(page: PageLike, target: ResolvedTarget, o: ResolveOptions): Promise<ResolveOutcome> {
  try {
    try { validateLocator(target.locator); assertLocatorPurpose(target.locator as Locator, o.operation?.kind); } catch { throw new ObservedRefusal('INVALID_CONTRACT'); }
    let origin: string;
    try { origin = new URL(page.url()).origin; } catch { return { kind: 'REFUSED', reason: 'TARGET_CHANGED' }; }
    if (origin !== o.origin || !domainAllowed(o.allowedDomains, origin)) return { kind: 'REFUSED', reason: 'TARGET_CHANGED' };
    for (const prefix of childPrefixes(target.locator as Locator)) {
      const context = buildPublicLocator(page, prefix) as unknown as ActionLocator;
      if (await timed(context.count(), o.budget.take(o.profile.identitySnapshotMs)) !== 1) return { kind: 'REFUSED', reason: 'TARGET_CHANGED' };
    }
    const locator = buildPublicLocator(page, target.locator as Locator) as unknown as ActionLocator;
    const count = await timed(locator.count(), o.budget.take(o.profile.identitySnapshotMs));
    if (count === 0) return { kind: 'ABSENT' };
    if (count >= 2) return { kind: 'REFUSED', reason: 'TARGET_CHANGED' };
    if (identityRequired(target.tier, target.locator as Locator)) {
      const snapshot = await locator.ariaSnapshot({ timeout: o.budget.take(o.profile.identitySnapshotMs) });
      if (!identityMatches(target.identity, parseAriaIdentity(snapshot))) return { kind: 'REFUSED', reason: 'TARGET_CHANGED' };
    }
    return { kind: 'READY', locator };
  } catch (error) {
    throw closePlaywrightError(error, 'preFence');
  }
}

/** Plan D-3 read: nothing the page marks as a form field, frame, canvas, contenteditable or data-sensitive may sit on, above or below the element. */
export async function assertReadable(page: PageLike, locator: ActionLocator, budget: ActionBudget, refusal: ClosedActionCode = 'POLICY_DENIED'): Promise<void> {
  const cap = 1_000;
  if ((await timed(locator.and(page.locator(PASSWORD_SELECTOR)).count(), budget.take(cap))) > 0) throw closed('PASSWORD_CONTROL_READ_REFUSED');
  if ((await timed(locator.and(page.locator(SENSITIVE_SELECTOR)).count(), budget.take(cap))) > 0) throw closed(refusal);
  if ((await timed(locator.locator(SENSITIVE_SELECTOR).count(), budget.take(cap))) > 0) throw closed(refusal);
  if ((await timed(locator.locator('xpath=ancestor-or-self::*[@data-sensitive or @contenteditable]').count(), budget.take(cap))) > 0) throw closed(refusal);
}

/**
 * Plan D-3 NAVIGATION: the action runs with noWaitAfter so that ACTION_MS owns the click (or key, or toggle) and never the navigation
 * commit. Two waits are registered first; the start window is a delay measured AFTER the action returns; a navigation that started
 * must commit within commitMs (UNKNOWN_OUTCOME otherwise, as the old code); then domcontentloaded within what remains of commitMs.
 */
export async function performWithNavigation(page: PageLike, action: (o: { noWaitAfter: true; timeout: number }) => Promise<void>, o: { actionMs: number; startMs: number; commitMs: number }): Promise<{ navigation: boolean }> {
  const main = page.mainFrame();
  const commitMs = clampMs(o.commitMs);
  const began = Date.now();
  const request = page.waitForEvent('request', { predicate: (r: RequestLike) => r.isNavigationRequest() && r.frame() === main, timeout: commitMs }).then(() => true, () => false);
  const committed = page.waitForEvent('framenavigated', { predicate: (frame: unknown) => frame === main, timeout: commitMs }).then(() => true, () => false);
  await action({ noWaitAfter: true, timeout: clampMs(o.actionMs) });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const window = new Promise<boolean>(resolve => { timer = setTimeout(() => { resolve(false); }, clampMs(o.startMs)); });
  const started = await Promise.race([request, window]);
  if (timer !== undefined) clearTimeout(timer);
  if (!started) return { navigation: false };
  if (!(await committed)) throw closed('UNKNOWN_OUTCOME');
  await page.waitForLoadState('domcontentloaded', { timeout: clampMs(commitMs - (Date.now() - began)) });
  return { navigation: true };
}

/** Plan I-7: the prepare proof agrees with the gated fact. */
export function assertPrepareProofAgrees(proposalTargetIsNode: boolean, fact: ObservationFact | undefined, resolved: ResolvedTarget | null): ResolvedTarget | null {
  if (!proposalTargetIsNode) {
    if (resolved !== null) throw closed('NO_DURABLE_LOCATOR');
    return null;
  }
  if (resolved === null || fact === undefined) throw closed('NO_DURABLE_LOCATOR');
  if (resolved.identity.role !== fact.role) throw closed('NO_DURABLE_LOCATOR');
  // Facts names are bounded (256 characters with an ellipsis): a name that does not equal the fact is not asserted.
  const name = resolved.identity.name !== null && resolved.identity.name === fact.name ? resolved.identity.name : null;
  return { ...resolved, identity: { role: resolved.identity.role, name } };
}

/** SHA-256 hex of a ResolvedTarget in canonical form; keys the verified-element binding. */
export function targetKey(target: ResolvedTarget): string {
  return hash([target.locator, target.tier, target.identity, ...(target.assertTextMode ? [target.assertTextMode] : [])]);
}

// ---------------------------------------------------------------------------------------------------------------------
// performOnTarget.

interface Run {
  readonly page: PageLike;
  readonly locator: ActionLocator;
  readonly o: PerformOptions;
  readonly control: InvocationControl | undefined;
  fenced: boolean;
  operation: Action['operation'];
}

const take = (run: Run, cap: number): number => run.o.budget.take(cap);
const readRefusal = (run: Run): ClosedActionCode => (run.o.profile.name === 'learn' ? 'POLICY_DENIED' : 'READ_REFUSED');

async function typeIsPassword(run: Run): Promise<boolean> {
  return ((await run.locator.getAttribute('type', { timeout: take(run, 1_000) })) ?? '').toLowerCase() === 'password';
}

async function recheck(run: Run): Promise<void> {
  run.o.authority?.();
  const again = await resolveTarget(run.page, run.o.target, { origin: run.o.origin, allowedDomains: run.o.allowedDomains, budget: run.o.budget, profile: run.o.profile, operation: run.operation });
  run.o.authority?.();
  if (again.kind !== 'READY') throw closed('TARGET_CHANGED');
  if (run.o.sameNode !== undefined && !(await timed(run.o.sameNode(), take(run, run.o.profile.boundCheckMs)))) throw closed('TARGET_CHANGED');
}

async function fence(run: Run, requireUnexpired = false): Promise<void> {
  // The real control returns nothing; awaiting its result lets a test control that returns a promise finish before the first post-fence call.
  run.control?.check();
  run.o.authority?.();
  if (requireUnexpired && run.o.budget.expired()) throw closed('TARGET_CHANGED');
  const started: unknown = run.control?.beginInvocation();
  run.fenced = true;
  await started;
  // A control that tripped (timeout or cancel) at the fence stops the action: nothing reaches the page after it (found by the replay-privacy fixtures).
  run.control?.check();
}

/** fill and press (critique 2 R2): the target must hold focus, no password element may, and (learn) it must still be the bound node. */
async function verifyFocus(run: Run): Promise<void> {
  const { page, locator, o } = run;
  await locator.focus({ timeout: take(run, o.profile.focusMs) });
  const held = (await timed(locator.and(page.locator(':focus')).count(), take(run, 1_000))) === 1;
  const password = (await timed(page.locator(`${PASSWORD_SELECTOR}:focus`).count(), take(run, 1_000))) > 0;
  const same = o.sameNode === undefined ? true : await timed(o.sameNode(), take(run, o.profile.boundCheckMs));
  if (!held || password || !same) throw closed('UNKNOWN_OUTCOME');
}

const TEXT_ENTRY_ROLES: ReadonlySet<string> = new Set(['textbox', 'searchbox', 'combobox']);
/** How long the first attempt of a fill and of its neutral key waits for a target that a page script may have replaced meanwhile. */
const FILL_FIRST_ATTEMPT_MS = 3_000;
const KEY_FIRST_ATTEMPT_MS = 1_500;

/**
 * A page script may replace the text input being filled with a new one shortly after the input takes focus (a search box whose
 * autocomplete component re-renders it, keeping the value and the focus, often under a different role). The frozen locator then names
 * nothing, yet it is the same logical field. The successor is accepted only when the frozen locator matches nothing now, exactly one
 * element holds the focus, that element is a fillable non-password text input whose accessible name is the recorded one, and both
 * roles are text-entry roles. Anything else is not a successor and the original failure stands.
 */
async function focusedSuccessor(run: Run): Promise<ActionLocator | null> {
  const { page, locator, o } = run;
  const recorded = o.target.identity;
  if (!TEXT_ENTRY_ROLES.has(recorded.role)) return null;
  try {
    if ((await timed(locator.count(), take(run, 1_000))) !== 0) return null;
    if ((await timed(page.locator(`${PASSWORD_SELECTOR}:focus`).count(), take(run, 1_000))) > 0) return null;
    const focused = page.locator(':focus').and(page.locator(FILLABLE_SELECTOR));
    if ((await timed(focused.count(), take(run, 1_000))) !== 1) return null;
    const found = parseAriaIdentity(await timed(focused.ariaSnapshot({ timeout: take(run, 1_000) }), take(run, 1_000)));
    if (found === null || !TEXT_ENTRY_ROLES.has(found.role) || recorded.name !== null && found.name !== recorded.name) return null;
    return focused;
  } catch { return null; }
}

/** The fill, then a neutral key (see the call site), on one target; the first attempt on the frozen locator is short so a replaced field is noticed. */
async function fillThenKey(run: Run, target: ActionLocator, text: string, first: boolean): Promise<void> {
  const { profile } = run.o;
  await target.fill(text, { timeout: first ? Math.min(take(run, profile.actionMs), FILL_FIRST_ATTEMPT_MS) : take(run, profile.actionMs) });
  // fill dispatches `input` only; a page that gates a button on keyup sees a trusted keydown/keyup from a neutral key pressed through the same
  // bound locator. No value change, no navigation (rehearsal R5). Only this non-secret path: a secret never reaches here (password targets are refused above).
  await target.press('End', { timeout: first ? Math.min(take(run, profile.actionMs), KEY_FIRST_ATTEMPT_MS) : take(run, profile.actionMs), noWaitAfter: true });
}

/** Critique 2 C-a: after a fill the authored (non-empty) literal must sit in no password-type input. A detection after the write. */
async function checkNoPasswordHoldsLiteral(run: Run, value: string): Promise<void> {
  if (value === '') return;
  const inputs = run.page.locator(PASSWORD_SELECTOR);
  const count = Math.min(await timed(inputs.count(), take(run, 1_000)), POST_FILL_PASSWORD_INPUTS);
  for (let i = 0; i < count; i++) if ((await inputs.nth(i).inputValue({ timeout: take(run, 1_000) })) === value) throw closed('UNKNOWN_OUTCOME');
}

async function requireVisibleEnabled(run: Run): Promise<void> {
  await run.locator.waitFor({ state: 'visible', timeout: take(run, run.o.profile.actionabilityWaitMs) });
}

function requireValue(value: string | null, run: Run): string {
  if (value === null || !validUnicode(value) || bytes(value) > run.o.maxValueBytes) throw closed('POLICY_DENIED');
  return value;
}

/**
 * Plan D-3 SEQUENCE for one operation. The caller (ObservationSession.invoke) has already resolved the locator (count == 1, identity)
 * and, at learn, checked the bound node. Here: pre-flight (non-committing), RE-CHECK just before the fence, the FENCE, ONE locator action.
 * Everything thrown after the fence is UNKNOWN_OUTCOME; everything before it is a no-effect refusal.
 */
export async function performOnTarget(page: PageLike, operation: Action['operation'], locator: ActionLocator, value: string | null, control: InvocationControl | undefined, o: PerformOptions): Promise<TargetInvocationResult> {
  const run: Run = { page, locator, o, control, fenced: false, operation };
  const phase = (): FencePhase => (run.fenced ? 'postFence' : 'preFence');
  try {
    control?.check();
    if (childPrefixes(o.target.locator as Locator).length && operation.kind !== 'read' && operation.kind !== 'assert') throw closed('POLICY_DENIED');
    return await execute(run, operation, value);
  } catch (error) {
    throw closePlaywrightError(error, phase());
  }
}

/** Capture is budgeted; an abandoned late handle can only be disposed. */
async function disposeElement(run: Run, bound: BoundElement): Promise<void> {
  await timed(bound.dispose(), take(run, run.o.profile.boundCheckMs)).catch(() => undefined);
}

async function bindElement(run: Run): Promise<BoundElement> {
  run.o.authority?.();
  let abandoned = false;
  const acquiring = run.locator.elementHandle({ timeout: take(run, run.o.profile.boundCheckMs) }).then(async bound => {
    if (abandoned && bound !== null) { await disposeElement(run, bound); return null; }
    return bound;
  });
  try {
    const bound = await timed(acquiring, take(run, run.o.profile.boundCheckMs));
    if (bound === null) throw closed('TARGET_CHANGED');
    return bound;
  } catch (error) { abandoned = true; throw error; }
}

async function bindVerifiedElement(run: Run): Promise<BoundElement> {
  if (run.o.budget.expired()) throw closed('TARGET_CHANGED');
  const candidate = await bindElement(run);
  let witness: BoundElement | undefined;
  try {
    run.o.authority?.();
    await recheck(run);
    witness = await bindElement(run);
    run.o.authority?.();
    if (run.o.verifyCapturedElement === undefined) throw closed('TARGET_CHANGED');
    await timed(run.o.verifyCapturedElement(candidate, witness), take(run, run.o.profile.boundCheckMs));
    run.o.authority?.();
    run.control?.check();
    if (run.o.budget.expired()) throw closed('TARGET_CHANGED');
    return candidate;
  } catch (error) { await disposeElement(run, candidate); throw error; }
  finally { if (witness !== undefined) await disposeElement(run, witness); }
}

async function execute(run: Run, operation: Action['operation'], rawValue: string | null): Promise<TargetInvocationResult> {
  const { locator, page, o } = run;
  const profile = o.profile;
  switch (operation.kind) {
    case 'click':
    case 'hover': {
      await (operation.kind === 'click' ? locator.click({ trial: true, timeout: take(run, profile.actionabilityWaitMs) }) : locator.waitFor({ state: 'visible', timeout: take(run, profile.actionabilityWaitMs) }));
      // H is checked against the fresh locator witness V and, at learn, immutable prepared identity.
      const bound = await bindVerifiedElement(run);
      try {
        await fence(run, true);
        if (operation.kind === 'hover') { await bound.hover({ timeout: take(run, profile.actionMs) }); return {}; }
        await performWithNavigation(page, opts => bound.click(opts), { actionMs: take(run, profile.actionMs), startMs: profile.navStartMs, commitMs: commitBudget(run) });
        return {};
      } finally { await disposeElement(run, bound); }
    }
    case 'check':
    case 'uncheck': {
      const check = operation.kind === 'check';
      await (check ? locator.check({ trial: true, timeout: take(run, profile.actionabilityWaitMs) }) : locator.uncheck({ trial: true, timeout: take(run, profile.actionabilityWaitMs) }));
      const bound = await bindVerifiedElement(run);
      let navigation: boolean;
      try {
        await fence(run, true);
        ({ navigation } = await performWithNavigation(page, opts => (check ? bound.check(opts) : bound.uncheck(opts)), { actionMs: take(run, profile.actionMs), startMs: profile.navStartMs, commitMs: commitBudget(run) }));
      } finally { await disposeElement(run, bound); }
      // The state is read through the locator (one match), not through the handle: a replaced checkbox shows its replacement's state.
      if (!navigation && (await locator.isChecked({ timeout: take(run, 1_000) })) !== check) throw closed('UNKNOWN_OUTCOME');
      return {};
    }
    case 'fill': {
      const text = requireValue(rawValue, run);
      await requireVisibleEnabled(run);
      if (!(await locator.isEnabled()) || !(await locator.isEditable())) throw closed('TARGET_CHANGED');
      if (await typeIsPassword(run)) throw closed('TARGET_CHANGED');
      if ((await timed(locator.and(page.locator(FILLABLE_SELECTOR)).count(), take(run, 1_000))) !== 1) throw closed('TARGET_CHANGED');
      await recheck(run);
      await fence(run);
      let target = locator;
      try { await verifyFocus(run); }
      catch (error) {
        // The field may have been replaced by a focused successor between the focus and its check.
        const successor = await focusedSuccessor(run);
        if (successor === null) throw error;
        target = successor;
      }
      try { await fillThenKey(run, target, text, true); }
      catch (error) {
        const successor = target === locator ? await focusedSuccessor(run) : null;
        if (successor === null) throw error;
        // Filling is idempotent, and the successor must end up holding exactly the authored text.
        await fillThenKey(run, successor, text, false);
        if ((await timed(successor.inputValue({ timeout: take(run, 1_000) }), take(run, 1_000))) !== text) throw closed('UNKNOWN_OUTCOME');
      }
      await checkNoPasswordHoldsLiteral(run, text);
      return {};
    }
    case 'selectOption': {
      const text = requireValue(rawValue, run);
      await requireVisibleEnabled(run);
      if (!(await locator.isEnabled())) throw closed('TARGET_CHANGED');
      if ((await timed(locator.and(page.locator('select:not([multiple])')).count(), take(run, 1_000))) !== 1) throw closed('TARGET_CHANGED');
      const argument = await chooseForSelect(page, locator, text, o.budget);
      await recheck(run);
      await fence(run);
      await locator.selectOption(argument, { timeout: take(run, profile.actionMs) });
      return {};
    }
    case 'press': {
      await requireVisibleEnabled(run);
      if (!(await locator.isEnabled())) throw closed('TARGET_CHANGED');
      if ((await timed(locator.and(page.locator(FOCUSABLE_SELECTOR)).count(), take(run, 1_000))) !== 1) throw closed('TARGET_CHANGED');
      await recheck(run);
      await fence(run);
      await verifyFocus(run);
      const key = operation.key;
      await performWithNavigation(page, opts => locator.press(key, opts), { actionMs: take(run, profile.actionMs), startMs: key === 'Enter' ? profile.navGraceMs : profile.navStartMs, commitMs: commitBudget(run) });
      return {};
    }
    case 'read': {
      const refusal = readRefusal(run);
      if (operation.recipe.kind !== 'visibleText' || o.readRuleId === null || o.readRuleId !== o.liveReadRuleId) throw closed(refusal);
      await assertReadable(page, locator, o.budget, refusal);
      await requireVisibleEnabled(run);
      // The value is the exact innerText (the binding preserves bytes); only the emptiness check looks at the trimmed form.
      let text: string;
      try { text = o.readText ? await o.readText() : await locator.innerText({ timeout: take(run, profile.actionabilityWaitMs) }); }
      catch { throw closed(refusal); }
      if (text.trim() === '' || !validUnicode(text) || bytes(text) > o.maxValueBytes) throw closed(refusal);
      await recheck(run);
      await fence(run);
      return { value: text };
    }
    case 'assert': {
      if (operation.predicate === 'visible') {
        await requireVisibleEnabled(run);
        await recheck(run);
        await fence(run);
        return { assertionPassed: true };
      }
      if (operation.predicate === 'containsText') {
        if ((await timed(locator.and(page.locator(PASSWORD_SELECTOR)).count(), take(run, 1_000))) > 0) throw closed('PASSWORD_CONTROL_READ_REFUSED');
        await requireVisibleEnabled(run);
        const expected = nameVariant(requireValue(rawValue, run));
        if (o.target.assertTextMode !== undefined) {
          if (!o.compareText) throw closed('READ_REFUSED');
          await recheck(run);
          await fence(run);
          return { assertionPassed: await o.compareText(expected) };
        }
        const actual = nameVariant(await locator.innerText({ timeout: take(run, profile.actionabilityWaitMs) }));
        await recheck(run);
        await fence(run);
        return { assertionPassed: expected !== '' && actual.includes(expected) };
      }
      if (operation.predicate === 'hasValue') {
        if (await typeIsPassword(run)) throw closed('PASSWORD_CONTROL_READ_REFUSED');
        await requireVisibleEnabled(run);
        const expected = requireValue(rawValue, run);
        const actual = await locator.inputValue({ timeout: take(run, profile.actionabilityWaitMs) });
        await recheck(run);
        await fence(run);
        return { assertionPassed: actual === expected };
      }
      throw closed('POLICY_DENIED');
    }
    case 'navigate':
    default:
      throw closed('POLICY_DENIED');
  }
}

/** What the navigation commit may use: the learn remainder, or the replay allowance clamped to the control's remaining time. */
function commitBudget(run: Run): number {
  const allowance = run.o.profile.navSettleMs;
  return allowance === null ? run.o.budget.remaining() : run.o.budget.take(allowance);
}
