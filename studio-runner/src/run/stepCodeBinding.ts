/**
 * The step API binding (ADR-SC-008 D3.2, D3.3): a runner-owned Proxy layer between frozen step code and the Playwright
 * objects it reaches. It isolates nothing; it is the one place where the existing boundary is applied, the same way in
 * every mode:
 *
 *  - every reachable object is wrapped (structurally: the Playwright bundle mangles class names), arguments are unwrapped;
 *  - run-integrity denial (video, close, browser, newPage, newCDPSession, tracing) and the domain policy on navigation;
 *  - control.check() before every call and a revoked flag that the step runner sets when the step ends;
 *  - the fence at the first effectful call (anything outside READ_ONLY; unknown counts as effectful), preceded for a
 *    Locator receiver by Playwright's own strict wait for exactly one attached element;
 *  - timeout clamping, so no call outlives its step;
 *  - a tracking Proxy over expect, and tracked promises, so a floated rejection fails the step instead of killing the process;
 *  - the beforeCall hook that the secrets work (E8) implements.
 *
 * This module imports no Playwright package (src/run/browser.ts is the only importer); it works on structural shapes.
 */
import { domainAllowed } from '../allowedDomains.js';
import type { InvocationControl } from '../executor/observedReplay.js';
import { ObservedRefusal } from '../validator/observedReferencePolicy.js';

export type CallKind = 'Page' | 'Frame' | 'Locator' | 'BrowserContext' | 'Other';

/** What beforeCall sees for every forwarded call, reads and `_`-prefixed internals included. Secret handles in `args` are left intact and are never read here. */
export interface HookedCall {
  readonly kind: CallKind;
  readonly method: string;
  /** Arguments as written, unwrapped from this binding's proxies. */
  readonly args: readonly unknown[];
  /** The raw (unwrapped) receiver. */
  readonly receiver: object;
  readonly fenceCrossed: boolean;
}

/**
 * A hook may take a call over. `proceed()` performs the native call (strict wait for a Locator receiver, then the fence, then the call);
 * `fence()` is an idempotent fence trigger for a take-over that performs its own effect. Whatever `run` returns replaces the native result.
 * A take-over that calls neither is not an effect.
 */
export interface TakeOver {
  /** `fence()` returns the one memoised ack promise under a guided control (await it before the effect), undefined under a synchronous one. */
  run(proceed: () => unknown, fence: () => void | Promise<void>): unknown;
}

/** May return a Promise, but only for methods whose native call is asynchronous (a sync builder such as `locator` must not be made async). */
export type BeforeCall = (call: HookedCall) => TakeOver | undefined | Promise<TakeOver | undefined>;

export interface EffectEntry {
  readonly method: string;
  completed: boolean;
  /** Set when the call acted in an adopted (popup) page, which the run's single video does not show. */
  offscreen?: true;
}

/**
 * What the binding has done so far. The caller may pass its own holder and keep reading it after it abandons runStep (deadline, cancel):
 * the binding writes into it as the calls happen, not only when the step ends.
 */
export interface StepTally {
  fenceCrossed: boolean;
  /** The first MAX_EFFECTS effects. The fence and OUTCOME_UNKNOWN logic never depends on this list. */
  readonly effects: EffectEntry[];
  effectsTruncated: boolean;
  offscreen: boolean;
  /** Matches counted when the strict wait before an effectful Locator call failed (0 for a missing target, 2 or more for an ambiguous one). */
  matchCount?: number;
}

/** E5 freeze: the effects list in a receipt holds at most 64 entries. */
export const MAX_EFFECTS = 64;

export interface BindingOptions {
  readonly control: InvocationControl;
  readonly allowedDomains: readonly string[];
  readonly beforeCall?: BeforeCall;
  /** Called with the raw page of an awaited popup (waitForEvent 'popup' or 'page') after its domain check. */
  readonly adoptPage?: (page: object) => void;
  /** The pages the run opened. context.pages() shows the code these plus the adopted ones, nothing else. */
  readonly pages?: readonly object[];
  readonly tally?: StepTally;
  /**
   * Until-fence mode (learning prepare): the code runs, and at the first effectful call (or the first call a take-over fences, which is
   * where a secret-handle call lands) the call is stopped with FenceReached: no effect, no fence, control.beginInvocation never called.
   */
  readonly untilFence?: boolean;
}

/** Thrown at the call that would have crossed the fence in until-fence mode. runStep turns it into an ok-until-fence result. */
export class FenceReached extends Error {
  constructor() {
    super('FENCE_REACHED');
    this.name = 'FenceReached';
  }
}

/**
 * Names that never take the fence (builders, getters, reads, waits, listener registration, timeout configuration). Every other name,
 * including every name this list has never seen, is effectful. Source: the S-1 classification of the pinned 1.63.0 surface; the guard test
 * checks that each name still exists in the pinned types.
 */
export const READ_ONLY: ReadonlySet<string> = new Set([
  'addListener', 'all', 'allHeaders', 'allInnerTexts', 'allTextContents', 'and', 'ariaSnapshot', 'ariaSnapshotJSON', 'asElement',
  'body', 'boundingBox', 'childFrames', 'consoleMessages', 'content', 'contentFrame', 'context', 'cookies', 'count', 'description',
  'elementHandle', 'elementHandles', 'failure', 'filter', 'finished', 'first', 'frame', 'frameElement', 'frameLocator', 'frames',
  'getAttribute', 'getByAltText', 'getByLabel', 'getByPlaceholder', 'getByRole', 'getByTestId', 'getByText', 'getByTitle', 'getProperties',
  'getProperty', 'headerValue', 'headerValues', 'headers', 'headersArray', 'innerHTML', 'innerText', 'inputValue', 'isChecked', 'isClosed',
  'isDetached', 'isDisabled', 'isEditable', 'isEnabled', 'isHidden', 'isNavigationRequest', 'isVisible', 'json', 'jsonValue', 'keyboard',
  'last', 'locator', 'mainFrame', 'method', 'mouse', 'name', 'nth', 'off', 'ok', 'on', 'once', 'opener', 'or', 'ownerFrame',
  'page', 'pageErrors', 'pages', 'parentFrame', 'postData', 'postDataBuffer', 'postDataJSON', 'prependListener', 'redirectedFrom',
  'redirectedTo', 'removeAllListeners', 'removeListener', 'request', 'requests', 'resourceType', 'screenshot', 'securityDetails',
  'serverAddr', 'serviceWorkers', 'setDefaultNavigationTimeout', 'setDefaultTimeout', 'status', 'statusText', 'text',
  'textContent', 'title', 'toString', 'touchscreen', 'url', 'viewportSize', 'waitFor', 'waitForEvent', 'waitForFunction',
  'waitForLoadState', 'waitForNavigation', 'waitForRequest', 'waitForResponse', 'waitForSelector', 'waitForTimeout', 'waitForURL', 'workers',
]);

/** Their function arguments are serialized into the page and must reach Playwright unwrapped; their data arguments carry no timeout option. */
const IN_PAGE: ReadonlySet<string> = new Set(['evaluate', 'evaluateAll', 'evaluateHandle', '$eval', '$$eval', 'waitForFunction', 'addInitScript', 'exposeFunction', 'exposeBinding']);
const DEFAULT_TIMEOUT_SETTERS: ReadonlySet<string> = new Set(['setDefaultTimeout', 'setDefaultNavigationTimeout']);
/** The most a failed read waits for locator.count() before it gives the miss up without a count. */
const COUNT_BOUND_MS = 1_000;
/** locator.count() bounded by a timer; undefined when it throws or is not answered in time (the miss itself is then the only answer). */
async function countWithin(locator: { count(): Promise<number> }, boundMs: number): Promise<number | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const counted = await Promise.race([
      locator.count(),
      new Promise<undefined>(resolve => { timer = setTimeout(() => { resolve(undefined); }, Math.max(1, boundMs)); }),
    ]);
    return typeof counted === 'number' && Number.isInteger(counted) && counted >= 0 ? counted : undefined;
  } catch {
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
/** Used when the control does not report a remaining time. */
const FALLBACK_MS = 30_000;
const HEADROOM_MS = 200;
const SETTLE_ROUNDS = 4;

/** Proxy to target. Module-level on purpose: a proxy stored by one step is unwrapped and re-wrapped by the next step's binding. */
const rawOf = new WeakMap<object, object>();
const DATA_TYPES: readonly (abstract new (...args: never[]) => object)[] = [Date, RegExp, Error, Map, Set, WeakMap, WeakSet, Promise, ArrayBuffer, URL];

type Fn = (...args: unknown[]) => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

/** A class instance that is not a built-in data type: a Playwright object, structurally. */
function isPlaywrightLike(value: unknown): value is object {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || ArrayBuffer.isView(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto === null || proto === Object.prototype) return false;
  return !DATA_TYPES.some(type => value instanceof type);
}

function hasMethods(value: object, ...names: string[]): boolean {
  return names.every(name => typeof (value as Record<string, unknown>)[name] === 'function');
}

function kindOf(target: object): CallKind {
  if (hasMethods(target, 'waitFor', 'count', 'filter')) return 'Locator';
  if (hasMethods(target, 'video', 'close', 'mainFrame')) return 'Page';
  if (hasMethods(target, 'newPage', 'newCDPSession', 'browser')) return 'BrowserContext';
  if (hasMethods(target, 'childFrames', 'parentFrame', 'goto')) return 'Frame';
  return 'Other';
}

/** The run-integrity denial: these would break the recording, the browser slot or the single-video rule. */
const DENIED: Readonly<Record<string, ReadonlySet<string>>> = {
  Page: new Set(['video', 'close']),
  BrowserContext: new Set(['close', 'browser', 'newPage', 'newCDPSession', 'tracing']),
};

/**
 * A promise the binding hands to step code. A failure the code never consumed fails the step. Consuming it with then/catch/finally passes the
 * responsibility to the derived promise, which is tracked in turn, so `.then(cb)` or `.finally(cb)` without a rejection handler cannot hide a failure.
 */
class Tracked implements PromiseLike<unknown> {
  consumed = false;
  state: 'pending' | 'ok' | 'failed' = 'pending';
  error: unknown;
  readonly done: Promise<void>;
  constructor(private readonly inner: Promise<unknown>, private readonly register: (item: Tracked) => void) {
    this.done = inner.then(
      () => { this.state = 'ok'; },
      (error: unknown) => { this.state = 'failed'; this.error = error; },
    );
  }
  then<A = unknown, B = never>(onFulfilled?: ((value: unknown) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.derive(this.inner.then(onFulfilled, onRejected)) as unknown as PromiseLike<A | B>;
  }
  catch<B = never>(onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Tracked {
    return this.derive(this.inner.catch(onRejected));
  }
  finally(onFinally?: (() => void) | null): Tracked {
    return this.derive(this.inner.finally(onFinally));
  }
  private derive(promise: Promise<unknown>): Tracked {
    this.consumed = true;
    const next = new Tracked(promise, this.register);
    this.register(next);
    return next;
  }
}

export interface StepBinding {
  /** Wraps a Playwright object (or an array of them); anything else is returned as it is. */
  wrap(value: unknown): unknown;
  /** Playwright's expect with the per-step timeouts, inside the tracking Proxy. */
  wrapExpect(expect: unknown): unknown;
  /** The run-local record: values read are wrapped by this binding, values written are stored unwrapped. */
  wrapVars(vars: Record<string, unknown>): Record<string, unknown>;
  /** Sets the page and context default timeouts from the control's remaining time (raw objects, not through the proxies). */
  applyDefaults(...targets: object[]): void;
  /** Waits (bounded) for every promise handed to the code, then throws the error of the first one that failed unconsumed. */
  settle(): Promise<void>;
  revoke(): void;
  readonly fenceCrossed: boolean;
  readonly effects: readonly EffectEntry[];
  readonly effectsTruncated: boolean;
  readonly offscreen: boolean;
  readonly fenceReached: boolean;
  readonly matchCount: number | undefined;
}

export function createBinding(options: BindingOptions): StepBinding {
  const { control, allowedDomains } = options;
  const proxies = new WeakMap<object, object>();
  const callbacks = new WeakMap<Fn, Fn>();
  const trackers = new WeakMap<object, object>();
  const trackerSource = new WeakMap<object, object>();
  const tracked = new Set<Tracked>();
  const tally: StepTally = options.tally ?? { fenceCrossed: false, effects: [], effectsTruncated: false, offscreen: false };
  const visiblePages = new Set<object>(options.pages ?? []);
  const adopted = new Set<object>();
  let revoked = false;
  let fenceReached = false;

  const assertLive = (): void => {
    if (revoked) throw new ObservedRefusal('CANCELLED');
  };
  /**
   * The time Playwright calls may take: the control's remaining time minus a little headroom, so that Playwright's own TimeoutError
   * arrives before the step deadline and keeps its meaning (a missing target before the fence) instead of racing the deadline.
   */
  const remaining = (): number => {
    const left = control.remainingMs?.();
    if (left === undefined) return FALLBACK_MS;
    return Math.max(1, Math.floor(left) - Math.min(HEADROOM_MS, Math.floor(left / 10)));
  };
  /** 0 and anything unbounded become the remainder; anything longer than the remainder is cut to it. */
  const clampMs = (value: number): number => (!Number.isFinite(value) || value <= 0 ? remaining() : Math.min(value, remaining()));
  const clampOptions = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    let copy: Record<string, unknown> | undefined;
    if (typeof value.timeout === 'number') copy = { ...value, timeout: clampMs(value.timeout) };
    if (isRecord(value.toPass) && typeof value.toPass.timeout === 'number') copy = { ...(copy ?? value), toPass: { ...value.toPass, timeout: clampMs(value.toPass.timeout) } };
    return copy ?? value;
  };

  const register = (item: Tracked): void => { tracked.add(item); };
  const track = (promise: Promise<unknown>): Tracked => {
    const item = new Tracked(promise, register);
    tracked.add(item);
    return item;
  };
  const chain = (value: unknown, next: (settled: unknown) => unknown): unknown => (isThenable(value) ? track(Promise.resolve(value).then(next)) : next(value));

  const unwrapAny = (value: unknown): unknown => {
    if (typeof value === 'object' && value !== null) {
      const raw = rawOf.get(value);
      if (raw !== undefined) return raw;
      if (Array.isArray(value)) return value.map(unwrapAny);
      if (isRecord(value)) {
        let copy: Record<string, unknown> | undefined;
        for (const [key, inner] of Object.entries(value)) {
          const next = unwrapAny(inner);
          if (next !== inner) copy = { ...(copy ?? value), [key]: next };
        }
        return copy ?? value;
      }
    }
    return value;
  };

  const wrapAny = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(wrapAny);
    if (!isPlaywrightLike(value) || rawOf.has(value)) return value;
    const known = proxies.get(value);
    if (known !== undefined) return known;
    const proxy = new Proxy(value, {
      get(target, prop) {
        if (typeof prop !== 'string') return Reflect.get(target, prop, target) as unknown;
        assertLive();
        if (DENIED[kindOf(target)]?.has(prop) === true) throw new ObservedRefusal('POLICY_REFUSED');
        const member = Reflect.get(target, prop, target) as unknown;
        if (typeof member !== 'function') return prop.startsWith('_') ? member : wrapAny(member);
        return (...args: unknown[]): unknown => call(target, prop, member as Fn, args);
      },
    });
    rawOf.set(proxy, value);
    proxies.set(value, proxy);
    return proxy;
  };

  const wrapCallback = (fn: Fn): Fn => {
    const known = callbacks.get(fn);
    if (known !== undefined) return known;
    const wrapped: Fn = (...params) => {
      assertLive();
      return fn(...params.map(wrapAny));
    };
    callbacks.set(fn, wrapped);
    return wrapped;
  };

  const prepareArgs = (name: string, args: readonly unknown[]): unknown[] => {
    const inPage = IN_PAGE.has(name);
    return args.map((arg, index) => {
      if (typeof arg === 'function') return inPage ? arg : wrapCallback(arg as Fn);
      const plain = unwrapAny(arg);
      if (DEFAULT_TIMEOUT_SETTERS.has(name) && index === 0 && typeof plain === 'number') return clampMs(plain);
      if (inPage) return name === 'waitForFunction' && index === 2 ? clampOptions(plain) : plain;
      return clampOptions(plain);
    });
  };

  const explicitTimeout = (args: readonly unknown[]): number => {
    for (const arg of args) if (isRecord(arg) && typeof arg.timeout === 'number') return arg.timeout;
    return remaining();
  };

  /**
   * The fence. Under a synchronous control it is set synchronously: no await between the check and the set, so two concurrent effectful calls
   * begin the invocation once. Under a guided control beginInvocation answers with ONE ack promise: it is memoised here on every path (a call
   * that races the ack, or comes after it, gets the same memo), tally.fenceCrossed is set only when the ack arrives, and a rejection is
   * final (no retry, the flag stays false).
   */
  let fenceMemo: Promise<void> | undefined;
  const fence = (): void | Promise<void> => {
    assertLive();
    if (tally.fenceCrossed || fenceMemo !== undefined) return fenceMemo;
    if (options.untilFence === true) {
      fenceReached = true;
      throw new FenceReached();
    }
    let begun: unknown;
    if (control.phase === 'PREPARING') begun = control.beginInvocation();
    else control.check();
    if (isThenable(begun)) {
      fenceMemo = Promise.resolve(begun).then(() => { tally.fenceCrossed = true; });
      fenceMemo.catch(() => undefined); // every caller gets the rejection; this only keeps an unconsumed one from being unhandled
      return fenceMemo;
    }
    tally.fenceCrossed = true;
    return undefined;
  };

  /** Whether a call's receiver belongs to an adopted page (a Page is its own owner; Locator and Frame report theirs). */
  const actsOffscreen = (target: object): boolean => {
    if (adopted.size === 0) return false;
    try {
      const owner = typeof (target as { page?: unknown }).page === 'function' ? (target as { page: () => unknown }).page() : target;
      return typeof owner === 'object' && owner !== null && adopted.has(owner);
    } catch {
      return false;
    }
  };

  const afterResult = (kind: CallKind, name: string, args: readonly unknown[], value: unknown): unknown => {
    if (name === 'pages' && kind === 'BrowserContext' && Array.isArray(value)) return wrapAny(value.filter(page => visiblePages.has(page as object)));
    if (name === 'waitForEvent' && (args[0] === 'popup' || args[0] === 'page') && typeof value === 'object' && value !== null) {
      const url = typeof (value as { url?: unknown }).url === 'function' ? String((value as { url: () => unknown }).url()) : '';
      // A popup is adopted blank or on an allowed http(s) host; file:, data: and every other scheme are refused.
      if (url !== '' && url !== 'about:blank' && !domainAllowed(allowedDomains, url)) throw new ObservedRefusal('POLICY_REFUSED');
      adopted.add(value);
      visiblePages.add(value);
      options.adoptPage?.(value);
    }
    return wrapAny(value);
  };

  function call(target: object, name: string, member: Fn, rawArgs: readonly unknown[]): unknown {
    assertLive();
    control.check();
    const args = prepareArgs(name, rawArgs);
    const kind = kindOf(target);
    if (name === 'goto' && (kind === 'Page' || kind === 'Frame') && !(typeof args[0] === 'string' && domainAllowed(allowedDomains, args[0]))) throw new ObservedRefusal('POLICY_REFUSED');
    const effectful = !name.startsWith('_') && !READ_ONLY.has(name);
    let entry: EffectEntry | undefined;
    const fenceNow = (): void | Promise<void> => {
      // The effect is recorded once the fence is crossed: after the ack under a guided control.
      const record = (): void => {
        if (entry === undefined) {
          const offscreen = actsOffscreen(target);
          entry = offscreen ? { method: name, completed: false, offscreen: true } : { method: name, completed: false };
          if (tally.effects.length < MAX_EFFECTS) tally.effects.push(entry);
          else tally.effectsTruncated = true;
          if (offscreen) tally.offscreen = true;
        }
      };
      const crossing = fence();
      if (crossing === undefined) {
        record();
        return undefined;
      }
      return crossing.then(record);
    };
    const native = (): unknown => member.apply(target, args);
    const proceed = (): unknown => {
      assertLive();
      const perform = (): unknown => {
        // A call that started before the step ended (a pending wait or hook) must not land after it.
        assertLive();
        if (!effectful) return native();
        const crossing = fenceNow();
        if (crossing === undefined) return native();
        // Fence-before-effect under an asynchronous ack: native() is entered only after it, and only if the step is still live.
        return crossing.then(() => {
          assertLive();
          control.check();
          return native();
        });
      };
      if (effectful && kind === 'Locator') {
        const timeout = explicitTimeout(args);
        const locator = target as { waitFor(options: { state: 'attached'; timeout: number }): Promise<unknown>; count(): Promise<number> };
        return locator.waitFor({ state: 'attached', timeout }).then(perform, async (error: unknown) => {
          // Which kind of miss it was, for the repair loop: no element at all, or several.
          try { tally.matchCount = await locator.count(); } catch { /* the miss itself is the answer */ }
          throw error;
        });
      }
      if (kind === 'Locator' && name !== 'count') {
        // A read (innerText, textContent, ...) that fails on a locator: the repair loop still needs to know whether it matched nothing or several.
        const outcome = perform();
        if (!isThenable(outcome)) return outcome;
        const locator = target as { count(): Promise<number> };
        return Promise.resolve(outcome).then(undefined, async (error: unknown) => {
          if (!control.signal.aborted) {
            const counted = await countWithin(locator, Math.min(COUNT_BOUND_MS, remaining()));
            if (counted !== undefined) tally.matchCount = counted;
          }
          throw error;
        });
      }
      return perform();
    };
    const hooked = options.beforeCall?.({ kind, method: name, args, receiver: target, fenceCrossed: tally.fenceCrossed });
    return chain(hooked, decision => {
      assertLive();
      const takeOver = decision as TakeOver | undefined;
      const outcome = takeOver === undefined ? proceed() : takeOver.run(proceed, fenceNow);
      return chain(outcome, settled => {
        assertLive();
        if (entry !== undefined) entry.completed = true;
        return afterResult(kind, name, args, settled);
      });
    });
  }

  const trackValue = (value: unknown, clamp: boolean): unknown => {
    if (isThenable(value)) return track(Promise.resolve(value));
    if (typeof value === 'function') return trackFunction(value as Fn, clamp);
    if (typeof value === 'object' && value !== null) return trackObject(value);
    return value;
  };
  const trackFunction = (fn: Fn, clamp: boolean): unknown => {
    const known = trackers.get(fn);
    if (known !== undefined && clamp) return known;
    const proxy = new Proxy(fn, {
      apply(target, thisArg: unknown, args: unknown[]) {
        assertLive();
        control.check();
        const self = typeof thisArg === 'object' && thisArg !== null ? (trackerSource.get(thisArg) ?? thisArg) : thisArg;
        return trackValue(Reflect.apply(target, self, clamp ? args.map(clampOptions) : args), true);
      },
      get(target, prop) {
        const member = Reflect.get(target, prop, target) as unknown;
        // expect.poll and expect.configure take options; expect.soft and the root call take a subject, which is data.
        return trackValue(member, prop === 'poll' || prop === 'configure');
      },
    });
    trackerSource.set(proxy, fn);
    if (clamp) trackers.set(fn, proxy);
    return proxy;
  };
  const trackObject = (object: object): unknown => {
    const known = trackers.get(object);
    if (known !== undefined) return known;
    const proxy = new Proxy(object, {
      get(target, prop) {
        const member = Reflect.get(target, prop, target) as unknown;
        return typeof prop === 'string' ? trackValue(member, true) : member;
      },
    });
    trackerSource.set(proxy, object);
    trackers.set(object, proxy);
    return proxy;
  };

  return {
    wrap: wrapAny,
    wrapExpect(expect: unknown): unknown {
      const limit = remaining();
      const configure = (expect as { configure?: unknown } | null)?.configure;
      const configured = typeof configure === 'function' ? (configure as Fn).call(expect, { timeout: limit, toPass: { timeout: limit } }) : expect;
      return typeof configured === 'function' ? trackFunction(configured as Fn, false) : configured;
    },
    wrapVars(vars) {
      return new Proxy(vars, {
        get(target, prop) {
          if (typeof prop !== 'string') return Reflect.get(target, prop, target) as unknown;
          assertLive();
          return wrapAny(unwrapAny(Reflect.get(target, prop, target)));
        },
        set(target, prop, value) {
          return Reflect.set(target, prop, unwrapAny(value), target);
        },
      });
    },
    applyDefaults(...targets) {
      const limit = remaining();
      for (const target of targets) {
        const timed = target as { setDefaultTimeout?: Fn; setDefaultNavigationTimeout?: Fn };
        timed.setDefaultTimeout?.call(target, limit);
        timed.setDefaultNavigationTimeout?.call(target, limit);
      }
    },
    async settle() {
      for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
        const pending = [...tracked].filter(item => item.state === 'pending');
        if (pending.length === 0) break;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const bound = new Promise<void>(resolve => { timer = setTimeout(resolve, remaining()); });
        await Promise.race([Promise.all(pending.map(item => item.done)), bound]);
        clearTimeout(timer);
      }
      for (const item of tracked) if (item.state === 'failed' && !item.consumed) throw item.error;
    },
    revoke() {
      revoked = true;
    },
    get fenceCrossed() {
      return tally.fenceCrossed;
    },
    get effects() {
      return tally.effects.map(entry => ({ ...entry }));
    },
    get fenceReached() {
      return fenceReached;
    },
    get matchCount() {
      return tally.matchCount;
    },
    get effectsTruncated() {
      return tally.effectsTruncated;
    },
    get offscreen() {
      return tally.offscreen;
    },
  };
}
