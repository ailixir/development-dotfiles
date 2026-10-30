/* eslint-disable @typescript-eslint/require-await -- a fake of the real Playwright surface: every real locator method is async, these answer from scripted state. */
/**
 * A scriptable fake of the public Playwright surface that src/run/targetAction.ts uses (PageLike / ActionLocator). Every call is logged with the
 * fence state at the time of the call and the Playwright timeout it was handed, and a call that carries a timeout advances the injected clock by
 * exactly that timeout (the worst case), so a test can prove the budget arithmetic and the "no committing call before the fence" order.
 */
import type { InvocationControl } from '../../src/executor/observedReplay.js';
import type { ActionLocator, BoundElement, PageLike, RequestLike } from '../../src/run/targetAction.js';

export interface LoggedCall { readonly id: string; readonly method: string; readonly fenced: boolean; readonly timeout: number | undefined; readonly arg?: unknown }

export interface Behaviour {
  /** Number of matches of the TARGET locator. */
  count: number;
  snapshot: string;
  enabled: boolean;
  editable: boolean;
  checked: boolean;
  type: string | null;
  text: string;
  value: string;
  isPassword: boolean;
  selectKind: 'single' | 'multiple' | 'none';
  focusable: boolean;
  fillable: boolean;
  /** self/descendant/ancestor read-surface counts of the target. */
  sensitiveSelf: number;
  sensitiveBelow: number;
  sensitiveAbove: number;
  /** what holds focus after target.focus(): 'target' (default), 'password', 'button', 'none'. */
  focusLandsOn: 'target' | 'password' | 'button' | 'none';
  /** Values currently held by password-type inputs of the page. */
  passwordValues: string[];
  /** write the filled value into the first password input (a page that copies the value on input). */
  copyFillIntoPassword: boolean;
  options: { text: string; label?: string | null; value?: string | null; disabled?: boolean }[];
  oversize: number | null;
  /** methods that throw: key `${method}` -> error name. */
  throwOn: Record<string, string>;
  /** navigation events: milliseconds after the action returns (null = never). */
  requestAfterMs: number | null;
  /** The page replaces the bound element after the fence: any action on the handle fails as Playwright does for a detached node. */
  boundDetached: boolean;
  /** The checkbox is replaced by an unchecked clone: the handle reports success, the locator shows the clone's state. */
  replacedByUnchecked: boolean;
  commitAfterMs: number | null;
}

export const defaults = (): Behaviour => ({
  count: 1, snapshot: '- button "Go"', enabled: true, editable: true, checked: false, type: null, text: 'Hello', value: '', isPassword: false,
  selectKind: 'none', focusable: true, fillable: true, sensitiveSelf: 0, sensitiveBelow: 0, sensitiveAbove: 0, focusLandsOn: 'target', passwordValues: [],
  copyFillIntoPassword: false, options: [], oversize: null, throwOn: {}, requestAfterMs: null, commitAfterMs: null, boundDetached: false, replacedByUnchecked: false,
});

export class FakeWorld {
  readonly log: LoggedCall[] = [];
  fenced = false;
  clock = 0;
  focused: 'target' | 'password' | 'button' | 'none' = 'none';
  readonly b: Behaviour;
  readonly main = { frame: 'main' };
  url = 'https://example.test/page';
  sameNodeResult = true;
  physicalId = 11;
  captureIds: number[] = [];
  readonly boundIds = new WeakMap<BoundElement, number>();
  readonly disposedIds: number[] = [];
  readonly effectedIds: number[] = [];
  inspectBoundElement = (bound: BoundElement): Promise<number> => {
    this.record('inspectBoundElement', 'inspectBoundElement');
    const id = this.boundIds.get(bound);
    if (id === undefined) return Promise.reject(new Error('unrecognized handle'));
    return Promise.resolve(id);
  };
  verifyCapturedElement = async (a: BoundElement, b: BoundElement): Promise<void> => {
    if (await this.inspectBoundElement(a) !== await this.inspectBoundElement(b)) throw new Error('changed');
  };
  /** Runs right after a call of that method has been logged (a page that changes under the executor). */
  hooks: Record<string, () => void> = {};
  constructor(patch: Partial<Behaviour> = {}) { this.b = { ...defaults(), ...patch }; }
  now = (): number => this.clock;
  record(id: string, method: string, timeout?: number, arg?: unknown): void {
    this.log.push({ id, method, fenced: this.fenced, timeout, arg });
    if (timeout !== undefined) this.clock += timeout;
    this.hooks[method]?.();
    const name = this.b.throwOn[method];
    if (name !== undefined) throw Object.assign(new Error('call log: <div data-note="CANARY-PAGE-TEXT"> value=CANARY-VALUE'), { name });
  }
  control(): InvocationControl {
    return {
      deadlineMs: Number.MAX_SAFE_INTEGER, remainingMs: () => Number.MAX_SAFE_INTEGER, signal: new AbortController().signal, phase: 'PREPARING',
      check: () => undefined, beginInvocation: () => { this.fenced = true; }, poison: () => undefined,
      reserveObservation: () => () => undefined, waitForAdditionalObservation: () => Promise.resolve(),
    };
  }
  /** Calls made after the fence. */
  after(): LoggedCall[] { return this.log.filter(call => call.fenced); }
  before(): LoggedCall[] { return this.log.filter(call => !call.fenced); }
  /** Timeouts of the calls that run one after the other (the registered event waits run concurrently and are not summed). */
  timeouts(): number[] { return this.log.flatMap(call => (call.timeout === undefined || call.method.startsWith('waitForEvent') ? [] : [call.timeout])); }
}

const TARGET = 'T';

class FakeLocator implements ActionLocator {
  constructor(readonly w: FakeWorld, readonly id: string) {}
  private get isTarget(): boolean { return this.id === TARGET; }
  private rec(method: string, timeout?: number, arg?: unknown): void { this.w.record(this.id, method, timeout, arg); }
  async count(): Promise<number> {
    this.rec('count');
    const id = this.id; const b = this.w.b;
    if (id === TARGET) return b.count;
    if (id === ':focus') return 0;
    if (id === 'input[type="password" i]') return b.passwordValues.length;
    if (id === 'input[type="password" i]:focus') return this.w.focused === 'password' ? 1 : 0;
    if (id.startsWith(`and(${TARGET}|`)) {
      const other = id.slice(`and(${TARGET}|`.length, -1);
      if (other === ':focus') return this.w.focused === 'target' ? 1 : 0;
      if (other === 'input[type="password" i]') return b.isPassword ? 1 : 0;
      if (other.startsWith('input, textarea, select, iframe')) return b.sensitiveSelf;
      if (other.startsWith('select:not([multiple])')) return b.selectKind === 'single' ? 1 : 0;
      if (other.startsWith(':is(a[href]')) return b.focusable ? 1 : 0;
      if (other.startsWith('input:not([type="checkbox"')) return b.fillable ? 1 : 0;
      return 0;
    }
    if (id === `${TARGET}>>input, textarea, select, iframe, canvas, object, embed, [contenteditable], [data-sensitive]`) return b.sensitiveBelow;
    if (id.startsWith(`${TARGET}>>xpath=ancestor-or-self`)) return b.sensitiveAbove;
    if (id === `${TARGET}>>option`) return b.oversize ?? b.options.length;
    if (id === `${TARGET}>>option[label]`) return b.options.filter(option => option.label !== undefined && option.label !== null).length;
    if (id === `${TARGET}>>option[value]`) return b.options.filter(option => option.value !== undefined && option.value !== null).length;
    const disabledIndex = /^and\(T>>option\[(\d+)\]\|:disabled\)$/u.exec(id);
    if (disabledIndex) return b.options[Number(disabledIndex[1])]?.disabled === true ? 1 : 0;
    if (id.startsWith(`and(${TARGET}>>option|[value=`)) return b.options.filter(option => id.includes(`[value="${option.value ?? '\u0000'}"]`)).length;
    if (id.startsWith(`and(${TARGET}>>option|[label=`)) return b.options.filter(option => id.includes(`[label="${option.label ?? '\u0000'}"]`)).length;
    if (id.includes('|:not([label]))>>text:')) return b.options.filter(option => (option.label === undefined || option.label === null) && id.endsWith(`>>text:${option.text}`)).length;
    if (/^input\[type="password" i\]\[\d+\]$/u.test(id)) return 1;
    return 0;
  }
  async elementHandle(o: { timeout: number }): Promise<{ click(o: { timeout: number; noWaitAfter?: boolean }): Promise<void>; hover(o: { timeout: number }): Promise<void>; check(o: { timeout: number; noWaitAfter?: boolean }): Promise<void>; uncheck(o: { timeout: number; noWaitAfter?: boolean }): Promise<void>; dispose(): Promise<void> } | null> {
    this.rec('elementHandle'); void o; // resolving a handle is instantaneous: the fake clock only advances by waits
    const id = this.w.captureIds.shift() ?? this.w.physicalId;
    const gone = (): void => { if (this.w.b.boundDetached) throw Object.assign(new Error('Element is not attached to the DOM'), { name: 'Error' }); };
    const effect = (): void => { gone(); this.w.effectedIds.push(id); };
    const bound: BoundElement = {
      click: o2 => { effect(); return this.click(o2); }, hover: o2 => { effect(); return this.hover(o2); },
      check: o2 => { effect(); return this.check(o2).then(() => { if (this.w.b.replacedByUnchecked) this.w.b.checked = false; }); },
      uncheck: o2 => { effect(); return this.uncheck(o2); }, dispose: () => { this.w.disposedIds.push(id); return Promise.resolve(); },
    };
    this.w.boundIds.set(bound, id);
    return bound;
  }
  async ariaSnapshot(o: { timeout: number }): Promise<string> { this.rec('ariaSnapshot', o.timeout); return this.w.b.snapshot; }
  async click(o: { trial?: boolean; timeout: number; noWaitAfter?: boolean }): Promise<void> { this.rec(o.trial === true ? 'click:trial' : 'click', o.timeout, o); this.afterAction(); }
  async hover(o: { trial?: boolean; timeout: number }): Promise<void> { this.rec(o.trial === true ? 'hover:trial' : 'hover', o.timeout); }
  async check(o: { trial?: boolean; timeout: number; noWaitAfter?: boolean }): Promise<void> { if (o.trial !== true) this.w.b.checked = true; this.rec(o.trial === true ? 'check:trial' : 'check', o.timeout, o); this.afterAction(); }
  async uncheck(o: { trial?: boolean; timeout: number; noWaitAfter?: boolean }): Promise<void> { if (o.trial !== true) this.w.b.checked = false; this.rec(o.trial === true ? 'uncheck:trial' : 'uncheck', o.timeout, o); this.afterAction(); }
  async fill(value: string, o: { timeout: number }): Promise<void> {
    this.rec('fill', o.timeout, value);
    this.w.b.value = value;
    if (this.w.b.copyFillIntoPassword) this.w.b.passwordValues[0] = value;
    if (this.w.focused === 'password') this.w.b.passwordValues[0] = value;
  }
  async selectOption(arg: string | { index: number }, o: { timeout: number }): Promise<unknown> { this.rec('selectOption', o.timeout, arg); return []; }
  async press(key: string, o: { timeout: number; noWaitAfter?: boolean }): Promise<void> { this.rec('press', o.timeout, { key, focused: this.w.focused, noWaitAfter: o.noWaitAfter }); this.afterAction(); }
  async focus(o: { timeout: number }): Promise<void> {
    this.rec('focus', o.timeout);
    const lands = this.w.b.focusLandsOn;
    this.w.focused = lands;
  }
  async waitFor(o: { state: string; timeout: number }): Promise<void> { this.rec('waitFor', o.timeout, o.state); }
  async isVisible(): Promise<boolean> { this.rec('isVisible'); return true; }
  async isEnabled(): Promise<boolean> { this.rec('isEnabled'); return this.w.b.enabled; }
  async isEditable(): Promise<boolean> { this.rec('isEditable'); return this.w.b.editable; }
  async isChecked(o?: { timeout?: number }): Promise<boolean> { this.rec('isChecked', o?.timeout); return this.w.b.checked; }
  async isDisabled(): Promise<boolean> { this.rec('isDisabled'); return !this.w.b.enabled; }
  async getAttribute(name: string, o: { timeout: number }): Promise<string | null> {
    this.rec(`getAttribute:${name}`, o.timeout);
    const optionIndex = /^T>>option\[(\d+)\]$/u.exec(this.id);
    if (optionIndex) {
      const option = this.w.b.options[Number(optionIndex[1])];
      if (name === 'label') return option?.label ?? null;
      if (name === 'value') return option?.value ?? null;
    }
    if (name === 'type') return this.w.b.isPassword ? 'password' : this.w.b.type;
    return null;
  }
  async textContent(o: { timeout: number }): Promise<string | null> {
    this.rec('textContent', o.timeout);
    const optionIndex = /^T>>option\[(\d+)\]$/u.exec(this.id);
    if (optionIndex) return this.w.b.options[Number(optionIndex[1])]?.text ?? null;
    return this.w.b.text;
  }
  async innerText(o: { timeout: number }): Promise<string> { this.rec('innerText', o.timeout); return this.w.b.text; }
  async inputValue(o: { timeout: number }): Promise<string> {
    this.rec('inputValue', o.timeout);
    const pw = /^input\[type="password" i\]\[(\d+)\]$/u.exec(this.id);
    if (pw) return this.w.b.passwordValues[Number(pw[1])] ?? '';
    return this.w.b.value;
  }
  and(other: ActionLocator): ActionLocator { return new FakeLocator(this.w, `and(${this.id}|${(other as FakeLocator).id})`); }
  nth(index: number): ActionLocator { return this.id === TARGET ? this : new FakeLocator(this.w, `${this.id}[${String(index)}]`); }
  locator(css: string): ActionLocator { return new FakeLocator(this.w, `${this.id}>>${css}`); }
  getByText(value: string): ActionLocator { return this.id === 'root' ? new FakeLocator(this.w, TARGET) : new FakeLocator(this.w, `${this.id}>>text:${value}`); }
  getByTestId(value: string): ActionLocator { return this.derive(`testId:${value}`); }
  getByRole(role: string, options?: { name?: string }): ActionLocator { return this.derive(`role:${role}:${options?.name ?? ''}`); }
  getByLabel(value: string): ActionLocator { return this.derive(`label:${value}`); }
  getByPlaceholder(value: string): ActionLocator { return this.derive(`placeholder:${value}`); }
  filter(): ActionLocator { return this; }
  private derive(id: string): ActionLocator { return new FakeLocator(this.w, this.isTarget || this.id === 'root' ? (this.id === 'root' ? TARGET : this.id) : `${this.id}>>${id}`); }
  private afterAction(): void {
    // Navigation events are armed by the page on demand (see FakePage.waitForEvent).
  }
}

export class FakePage implements PageLike {
  constructor(readonly w: FakeWorld) {}
  private get root(): FakeLocator { return new FakeLocator(this.w, 'root'); }
  url(): string { return this.w.url; }
  mainFrame(): unknown { return this.w.main; }
  getByTestId(value: string): ActionLocator { return this.root.getByTestId(value); }
  getByRole(role: string, options?: { name?: string; exact?: boolean }): ActionLocator { return this.root.getByRole(role, options); }
  getByLabel(value: string): ActionLocator { return this.root.getByLabel(value); }
  getByPlaceholder(value: string): ActionLocator { return this.root.getByPlaceholder(value); }
  getByText(value: string): ActionLocator { return this.root.getByText(value); }
  locator(css: string): ActionLocator { return new FakeLocator(this.w, css); }
  target(): ActionLocator { return new FakeLocator(this.w, TARGET); }
  async waitForLoadState(state: 'domcontentloaded', o: { timeout: number }): Promise<void> { this.w.record('page', 'waitForLoadState', o.timeout, state); }
  waitForEvent(name: 'request', o: { predicate: (request: RequestLike) => boolean; timeout: number }): Promise<unknown>;
  waitForEvent(name: 'framenavigated', o: { predicate: (frame: unknown) => boolean; timeout: number }): Promise<unknown>;
  waitForEvent(name: string, o: { predicate: (arg: never) => boolean; timeout: number }): Promise<unknown> {
    this.w.log.push({ id: 'page', method: `waitForEvent:${name}`, fenced: this.w.fenced, timeout: o.timeout });
    const after = name === 'request' ? this.w.b.requestAfterMs : this.w.b.commitAfterMs;
    return new Promise((resolve, reject) => {
      if (after !== null && after < o.timeout) {
        setTimeout(() => {
          const arg = name === 'request' ? { isNavigationRequest: () => true, frame: () => this.w.main } : this.w.main;
          if ((o.predicate as (a: unknown) => boolean)(arg)) resolve(arg);
        }, after);
      } else {
        setTimeout(() => { reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })); }, o.timeout);
      }
    });
  }
}
