/**
 * Secrets in generated step code (ADR-SC-008 D2 "Values", D3.2 Secrets row; SC008-E8).
 *
 * The step code sees a secret only as an opaque handle (`secrets['ID']`). The value never reaches the code: the hook below
 * accepts a handle in exactly one place, the value argument of `Locator.fill` on the page's single password control, and
 * routes that fill through the existing trusted isolated-world path (`passwordControl.ts`: prepare, withhold, fill with the
 * origin and form-action checks) instead of letting Playwright fill it. The value is fetched through `resolve(id)` only
 * after the step's fence, so a prepare run (until-fence) and a refused call never read it.
 *
 * What this is not: a control against hostile code. Step code runs in the runner's own realm and can reach Node (E1 review F3);
 * console, cookies, request bodies, `page.request`, `exposeFunction`, `addInitScript`, Playwright error text, patched
 * intrinsics and a bfcache `goBack` are named accepted risks (X-2). The handle and the refusals guard against accidental and
 * model-written misuse, which is what the learning loop produces.
 *
 * This module has no Playwright import (src/run/browser.ts is the only importer); it works on structural shapes.
 */
import type { InvocationControl } from '../executor/observedReplay.js';
import { ObservedRefusal } from '../validator/observedReferencePolicy.js';
import { ClosedActionError, closedReason } from './closedError.js';
import type { PasswordTarget } from './observationTypes.js';
import { PasswordNoEffect } from './passwordControl.js';
import type { SecretUseEvidence } from './secretUse.js';
import type { BeforeCall, HookedCall, TakeOver } from './stepCodeBinding.js';

const PASSWORD_SELECTOR = 'input[type="password" i]';
/** Passwords inspected by the post-fill literal check (as targetAction.ts did). */
const POST_FILL_PASSWORD_INPUTS = 8;
const HEADROOM_MS = 200;

const denied = (): ClosedActionError => new ClosedActionError('POLICY_DENIED');

/* ---------------------------------------------------------------------------------------------- the handle */

/** Handle -> secret ID. Module-private: only handles built by createSecrets are in it. */
const handleIds = new WeakMap<object, string>();
/** Only this module can pass it, so `new h.constructor(...)` in step code cannot mint a handle. */
const MINT = Symbol('mint');

class SecretHandle {
  constructor(token: symbol, id: string) {
    if (token !== MINT) throw denied();
    handleIds.set(this, id);
    Object.freeze(this);
  }
  toString(): never {
    throw denied();
  }
  toJSON(): never {
    throw denied();
  }
  valueOf(): never {
    throw denied();
  }
  [Symbol.toPrimitive](): never {
    throw denied();
  }
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    const id = handleIds.get(this);
    return id === undefined ? '<secret>' : `<secret ${id}>`;
  }
}
Object.freeze(SecretHandle.prototype);

/** The `secrets` object of one step: a frozen null-prototype record of handles, keyed by the exact secret ID. It holds no value. */
export function createSecrets(ids: readonly string[]): Readonly<Record<string, object>> {
  const secrets: Record<string, object> = Object.create(null) as Record<string, object>;
  for (const id of ids) Object.defineProperty(secrets, id, { value: new SecretHandle(MINT, id), enumerable: true });
  return Object.freeze(secrets);
}

/** The secret ID of a handle, or undefined for anything else (including an object made with Object.create(handle prototype)). */
export function secretIdOf(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null ? handleIds.get(value) : undefined;
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/**
 * The IDs of the handles in call arguments: the arguments themselves plus one level inside a plain object or an array. Own data
 * properties only, so no getter runs. This is not a security control: a handle that slips through carries only an ID.
 */
export function secretHandleIds(args: readonly unknown[]): string[] {
  const found: string[] = [];
  const look = (value: unknown): void => {
    const id = secretIdOf(value);
    if (id !== undefined) found.push(id);
  };
  for (const arg of args) {
    look(arg);
    if (Array.isArray(arg)) {
      for (const item of arg as unknown[]) look(item);
    } else if (isPlain(arg)) {
      for (const key of Object.keys(arg)) look(Object.getOwnPropertyDescriptor(arg, key)?.value);
    }
  }
  return found;
}

/* ------------------------------------------------------------------------------------------------ the hook */

/** The password path of the observation session (createPasswordControl). */
export interface SecretFillPort {
  preparePassword(target: PasswordTarget, origin: string): Promise<void>;
  fillPassword(target: PasswordTarget, origin: string, allowedOrigins: readonly string[], value: string, control?: InvocationControl): Promise<void>;
}

export interface SecretHookOptions {
  /** The value and the origins its form may post to. Called only after the step's fence. Owner of the value's lifetime and zeroing. */
  resolve(id: string): { readonly value: string; readonly allowedOrigins: readonly string[] } | undefined;
  readonly password: SecretFillPort;
  /** A fresh observation of the current main document (it re-stamps the page-state program, which refuses a fill after an earlier fill changed the DOM). */
  passwordTarget(): Promise<{ readonly target: PasswordTarget; readonly origin: string }>;
  /** Counts main-frame document loads; a different value means a new document. */
  documentEpoch(): number;
  /** The control of the step that is running now. */
  control(): InvocationControl;
  /** One per run. */
  readonly evidence: SecretUseEvidence;
}

interface LocatorShape {
  waitFor(options: { state: 'visible'; timeout: number }): Promise<unknown>;
  and(other: unknown): { count(): Promise<number> };
  evaluate(pageFunction: () => boolean): Promise<boolean>;
  page(): PageShape;
}
interface PageShape {
  locator(selector: string): { count(): Promise<number>; nth(index: number): { inputValue(options: { timeout: number }): Promise<string> } };
}

/** Refused on every receiver while a secret is in the page: they run page code or return a value the page holds. */
const EVALUATE_FAMILY: ReadonlySet<string> = new Set(['evaluate', 'evaluateAll', 'evaluateHandle', '$eval', '$$eval', 'addScriptTag', 'waitForFunction']);
/** Refused on every receiver while a secret is in the page: they read a control's value back. No selector test (a show-password toggle defeats one). */
const READ_BACK: ReadonlySet<string> = new Set([
  'inputValue', 'getAttribute', 'ariaSnapshot', 'ariaSnapshotJSON', 'getProperty', 'getProperties', 'jsonValue', 'elementHandle', 'elementHandles',
]);
/** `_expect` expressions of Playwright 1.63.0 that compare a value, property, attribute or the aria tree. to.be.empty stays (a one-bit oracle, accepted). */
const EXPECT_READ_BACK: ReadonlySet<string> = new Set([
  'to.have.value', 'to.have.values', 'to.have.property', 'to.have.attribute', 'to.have.attribute.value', 'to.match.aria',
]);

const policyRefusal = (): ObservedRefusal => new ObservedRefusal('POLICY_REFUSED', 'POLICY_DENIED', true);
const readRefusal = (): ObservedRefusal => new ObservedRefusal('PASSWORD_CONTROL_READ_REFUSED', 'PASSWORD_CONTROL_READ_REFUSED', true);

/**
 * The trusted path's own refusals, as observedReplayAdapter.ts mapped them: a PasswordNoEffect is a refusal before any write; anything
 * else is left for the step runner's closing (a failure after the write is uncertain and must stay uncertain).
 */
function passwordRefusal(error: unknown): unknown {
  if (!(error instanceof PasswordNoEffect)) return error;
  const reason = closedReason(error);
  const policy = ['POLICY_DENIED', 'PASSWORD_TARGET_ABSENT', 'PASSWORD_TARGET_AMBIGUOUS', 'PASSWORD_FORM_ACTION_NOT_ALLOWED'].includes(reason);
  const code = policy ? 'POLICY_REFUSED' : reason === 'TARGET_CHANGED' || reason === 'OBSERVATION_DEADLINE' ? 'TARGET_DRIFT' : 'OUTCOME_UNKNOWN';
  return new ObservedRefusal(code, reason, true);
}

/** After any nonsecret fill no password input may hold the authored literal (an unexpected redirect of the text). Raw page, so no hook. */
async function checkNoPasswordHoldsLiteral(page: PageShape, value: string): Promise<void> {
  const inputs = page.locator(PASSWORD_SELECTOR);
  const count = Math.min(await inputs.count(), POST_FILL_PASSWORD_INPUTS);
  for (let index = 0; index < count; index++) if ((await inputs.nth(index).inputValue({ timeout: 1_000 })) === value) throw new ClosedActionError('UNKNOWN_OUTCOME');
}

/** One armed secret fill. The window is open while any hold of the current document epoch exists. */
interface Hold {
  epoch: number;
}

export function createSecretHook(options: SecretHookOptions): { readonly beforeCall: BeforeCall } {
  const { evidence } = options;
  const holds = new Set<Hold>();

  /** A secret may be in the page: some fill armed or wrote in this document. A new document drops every hold. */
  const secretBearing = (): boolean => {
    const epoch = options.documentEpoch();
    for (const hold of holds) {
      if (hold.epoch === epoch) return true;
      holds.delete(hold);
    }
    return false;
  };

  const timeoutFor = (args: readonly unknown[]): number => {
    const bag = args[1];
    if (isPlain(bag) && typeof bag.timeout === 'number' && bag.timeout > 0) return bag.timeout;
    const control = options.control();
    const left = control.remainingMs?.() ?? Math.max(0, control.deadlineMs - Date.now());
    return Math.max(1, Math.floor(left) - Math.min(HEADROOM_MS, Math.floor(left / 10)));
  };

  /** The one allowed use. Sync until the first await: the hold is armed before anything can interleave. */
  async function secretFill(call: HookedCall, id: string): Promise<TakeOver> {
    const hold: Hold = { epoch: options.documentEpoch() };
    holds.add(hold);
    let target: PasswordTarget;
    let origin: string;
    try {
      const locator = call.receiver as LocatorShape;
      await locator.waitFor({ state: 'visible', timeout: timeoutFor(call.args) });
      options.control().check();
      const page = locator.page();
      let passwordMatches: number;
      try {
        passwordMatches = await locator.and(page.locator(PASSWORD_SELECTOR)).count();
      } catch {
        // Locator.and across frames throws: a locator in an iframe is not the main document's password control.
        throw policyRefusal();
      }
      if (passwordMatches !== 1) throw policyRefusal();
      // frameLocator(...).locator(...) passes the and() test above, so ask the page: the element must live in the top document, because the
      // trusted fill writes to the top document's password control, not to the one the code named.
      if (!(await locator.evaluate(() => window === window.top))) throw policyRefusal();
      ({ target, origin } = await options.passwordTarget());
      options.control().check();
      await options.password.preparePassword(target, origin);
    } catch (error) {
      holds.delete(hold);
      evidence.refusedBeforeEffect(id);
      throw passwordRefusal(error);
    }
    return {
      async run(_proceed, fence) {
        try {
          fence();
        } catch (error) {
          // FenceReached (prepare run) or a poisoned control: nothing was written and the value was never read.
          holds.delete(hold);
          throw error;
        }
        const secret = options.resolve(id);
        if (secret === undefined) {
          evidence.refusedBeforeEffect(id);
          throw new ObservedRefusal('REFERENCE_MISMATCH', undefined, true);
        }
        // The document may have changed while the pre-fence checks awaited, and another hooked call may have dropped this hold as stale:
        // the write below goes into the current document, so the hold is (re)armed for it.
        hold.epoch = options.documentEpoch();
        holds.add(hold);
        evidence.attempting(id);
        try {
          await options.password.fillPassword(target, origin, secret.allowedOrigins, secret.value, options.control());
        } catch (error) {
          if (error instanceof PasswordNoEffect) {
            // Proved no write: release only this fill's own hold, never another fill's.
            holds.delete(hold);
            evidence.refusedBeforeEffect(id);
            throw passwordRefusal(error);
          }
          throw error;
        }
        evidence.used(id);
        return undefined;
      },
    };
  }

  const beforeCall: BeforeCall = call => {
    const ids = secretHandleIds(call.args);
    const [id] = ids;
    if (id !== undefined) {
      const optionsBag = call.args[1];
      const allowed =
        call.kind === 'Locator' && call.method === 'fill' && ids.length === 1 && secretIdOf(call.args[0]) === id &&
        (call.args.length === 1 || (call.args.length === 2 && (optionsBag === undefined || isPlain(optionsBag))));
      if (!allowed) {
        for (const each of ids) evidence.refusedBeforeEffect(each);
        throw policyRefusal();
      }
      return secretFill(call, id);
    }
    if (secretBearing()) {
      if (EVALUATE_FAMILY.has(call.method)) throw policyRefusal();
      if (READ_BACK.has(call.method) || (call.method === '_expect' && typeof call.args[0] === 'string' && EXPECT_READ_BACK.has(call.args[0]))) throw readRefusal();
    }
    if (call.method === 'fill' && (call.kind === 'Locator' || call.kind === 'Page' || call.kind === 'Frame')) {
      const value = call.args[call.kind === 'Locator' ? 0 : 1];
      if (typeof value === 'string' && value !== '') {
        const receiver = call.receiver as { page?: () => PageShape };
        return {
          async run(proceed) {
            const result = await proceed();
            await checkNoPasswordHoldsLiteral(call.kind === 'Page' ? (call.receiver as PageShape) : (receiver.page as () => PageShape).call(receiver), value);
            return result;
          },
        };
      }
    }
    return undefined;
  };

  return { beforeCall };
}
