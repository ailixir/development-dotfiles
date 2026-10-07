/**
 * The real `BrowserAdapter`, over the browser surface the accepted language needs (AC-1, AC-2).
 *
 * ## Why this module does not import Playwright
 *
 * It is written against the **structural** page and locator surface declared below, and
 * `src/run/browser.ts` — the one module that imports `playwright` — hands it a real `Page`. Two
 * things fall out of that, and both are the point:
 *
 * 1. **No Playwright type escapes.** Not into the executor, not into the validator, not even into
 *    this file. `eslint.boundary-rules.js` confines the import to `src/run/browser.ts`, with a
 *    proving fixture under `fixtures/lint/`, and `test/run/playwright-confinement.test.ts`
 *    asserts the property over the sources directly.
 * 2. **The adapter is testable without a browser.** Every branch here — matcher compilation,
 *    locator-chain construction, each assertion's polling and timeout behaviour — is exercised in
 *    the unit tier against a hand-written page, which keeps `npm test` browser-free (AC-25) while
 *    the fixtures tier proves the same code against real Chromium (AC-18a).
 *
 * ## Assertions are polled here, not imported
 *
 * Playwright's `expect` lives in `@playwright/test`, which is a test-runner package and is **not**
 * a dependency of this component (AC-24: the production closure stays `playwright`,
 * `playwright-core`, `typescript`). The four assertions the accepted language permits are
 * therefore polled against the live DOM with the same retry-until-timeout semantics, which is
 * also what §6.4 needs: **a wait or assertion step seeks to its start, not to the instant its
 * condition became true**, so the reading that matters is taken before the polling begins — by
 * `executeSteps`, which is where step timings are read, and never here.
 *
 * Matchers arrive as data (`{source, flags}`) and are compiled here, which is the division
 * `BrowserAdapter` documents: the validator proved the pattern is in the safe subset, the adapter
 * turns it into a `RegExp`. A `RegExp` is not an evaluation channel — it has no access to scope,
 * no call surface, and the language it accepts was already bounded upstream.
 */

import type {
  BrowserAdapter,
  LocatorHandle,
  PageLocation,
  ResolvedMatcher,
} from '../executor/adapters/BrowserAdapter.js';
import { StepRefusal } from '../executor/refusals.js';
import type {
  ActionOptions,
  ClickOptions,
  ContainTextOptions,
  GotoOptions,
  HaveUrlOptions,
  LocatorChain,
  LocatorSegment,
  PressOptions,
  TextMatcher,
  TimeoutOptions,
} from '../executor/operations.js';

// ── The structural browser surface ────────────────────────────────────────────────────────────

export interface RoleQueryOptions {
  readonly name?: string | RegExp | undefined;
  readonly exact?: boolean | undefined;
  readonly checked?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly expanded?: boolean | undefined;
  readonly selected?: boolean | undefined;
  readonly pressed?: boolean | undefined;
  readonly level?: number | undefined;
}

export interface TextQueryOptions {
  readonly exact?: boolean | undefined;
}

/** The locator factories `page` and `locator` share; a chain is built by applying them in order. */
export interface QueryRoot {
  getByRole(role: string, options?: RoleQueryOptions): LocatorLike;
  getByText(text: string | RegExp, options?: TextQueryOptions): LocatorLike;
  getByLabel(text: string | RegExp, options?: TextQueryOptions): LocatorLike;
  getByPlaceholder(text: string | RegExp, options?: TextQueryOptions): LocatorLike;
  getByTestId(testId: string): LocatorLike;
  locator(selector: string): LocatorLike;
}

export interface LocatorLike extends QueryRoot {
  click(options?: Record<string, unknown>): Promise<void>;
  fill(value: string, options?: Record<string, unknown>): Promise<void>;
  press(key: string, options?: Record<string, unknown>): Promise<void>;
  check(options?: Record<string, unknown>): Promise<void>;
  uncheck(options?: Record<string, unknown>): Promise<void>;
  hover(options?: Record<string, unknown>): Promise<void>;
  selectOption(values: string, options?: Record<string, unknown>): Promise<readonly string[]>;
  waitFor(options?: Record<string, unknown>): Promise<void>;
  textContent(options?: Record<string, unknown>): Promise<string | null>;
  innerText(options?: Record<string, unknown>): Promise<string>;
  inputValue(options?: Record<string, unknown>): Promise<string>;
  /** How many elements the locator matches right now; never waits. Text-entry equivalence only. */
  count(): Promise<number>;
  /** A locator matching either this one or `other`. Text-entry equivalence only. */
  or(other: LocatorLike): LocatorLike;
  /**
   * This locator narrowed to its visible matches (Playwright ≥1.51). Visible-only resolution of
   * the action operations only (VAL-040); assertions never use it.
   */
  filter(options: { readonly visible: boolean }): LocatorLike;
  /** A string selector, or (VAL-041 gate only) another locator, resolved inside this one. */
  locator(selector: string | LocatorLike): LocatorLike;
}

export interface PageLike extends QueryRoot {
  /**
   * `QueryRoot.locator`, plus the `hasNot` option the text-entry re-render gate uses (VAL-041):
   * the elements matching `selector` that contain no element matching `hasNot`.
   */
  locator(selector: string, options?: { readonly hasNot?: LocatorLike }): LocatorLike;
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForURL(url: string | RegExp, options?: Record<string, unknown>): Promise<void>;
  /**
   * Waits for the page's current navigation, if any, to reach `state`.
   *
   * Not an operation of the accepted language: the child uses it once, after the last step and
   * before the recording context is closed, so that a final action whose navigation only
   * *committed* has painted before the recorder stops (`src/run/childRuntime.ts`, the tail
   * settle). Bounded by the `timeout` the caller passes; a rejection is the caller's to swallow.
   */
  waitForLoadState(
    state?: 'load' | 'domcontentloaded' | 'networkidle',
    options?: Record<string, unknown>,
  ): Promise<void>;
  url(): string;
  title(): Promise<string>;
}

export interface PlaywrightAdapterOptions {
  readonly page: PageLike;
  /** Default wall-clock bound for an operation with no explicit `timeout` (§8.5, 30 s). */
  readonly defaultTimeoutMs: number;
  /** Polling interval for the four assertions. Small enough not to blur a step boundary. */
  readonly pollIntervalMs?: number | undefined;
  /**
   * Consulted before every operation. Returning a message aborts the run.
   *
   * This is how an unsupported multi-page workflow stops execution (AC-15): the child sets it
   * when a second page appears, and the very next operation refuses rather than continuing to
   * drive a run whose recording no longer shows what is happening.
   */
  readonly guard?: (() => string | null) | undefined;
  /**
   * Resolves a declared variable used **inside a locator chain**.
   *
   * `BrowserAdapter.locate` takes the chain alone — story 10.2 froze that shape and this story
   * does not widen it (AC-1) — so a `getByText(vars.get('X'))` has to be resolved by whoever
   * constructed the adapter. The child supplies the run's resolver; a secret can never appear
   * here, because `fill`'s value is the only position the validator permits one in.
   */
  readonly resolveVariable?: ((name: string) => string) | undefined;
  /**
   * The origins each secret may be filled on, by secret id (`scheme://host[:port]`, as
   * `URL.origin` renders it). A secret with no entry, or an empty one, cannot be filled: absent
   * is refused, never treated as "anywhere".
   */
  readonly secretOrigins?: Readonly<Record<string, readonly string[]>> | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  /** Monotonic source for the assertion deadlines. Injected so the unit tier need not sleep. */
  readonly now?: (() => number) | undefined;
  /**
   * Told each time a `fill`/`press` ran on a text-entry role other than the authored one
   * (executor 2.1.0, VAL-031). The child turns it into one bounded operator log line; both values
   * are members of {@link TEXT_ENTRY_ROLES}, never page content.
   */
  readonly onTextEntryEquivalence?: ((authored: string, resolved: string) => void) | undefined;
  /**
   * Told each time an action ran on the one visible element of a locator that also matched hidden
   * elements, i.e. visible-only resolution changed the outcome (executor 2.1.0, VAL-040). `total`
   * is the unfiltered match count; the child turns it into one bounded operator log line.
   */
  readonly onVisibleOnlyResolution?: ((total: number) => void) | undefined;
}

interface AdapterLocatorHandle extends LocatorHandle {
  readonly id: number;
}

/**
 * Text-entry role equivalence (executor 2.1.0, VAL-031 ruling §4).
 *
 * The author's model has no page access, so "type X in the search field" is compiled to a *guess*
 * among three roles a text-entry control can expose. For `fill` and `press` only, a terminal
 * `getByRole` with one of these roles means "the text-entry control with that accessible name":
 * the authored role is always tried first, and only when it has matched nothing for the settle
 * window do the other two roles — same `name`/`exact`/`disabled` — get a chance, and only if
 * exactly one element matches them. The set is closed; widening it is an executor minor bump and
 * an architect ruling.
 */
export const TEXT_ENTRY_ROLES: readonly string[] = ['textbox', 'searchbox', 'combobox'];

/** Upper bound of the settle window, in ms: the fallback is never considered sooner than this or `timeout/4`. */
export const TEXT_ENTRY_SETTLE_MAX_MS = 2_000;

/** Role options that keep a target eligible; any other state disables the equivalence. */
const TEXT_ENTRY_NEUTRAL_OPTIONS: ReadonlySet<string> = new Set(['name', 'exact', 'disabled']);

/** What `locate` remembers about a target eligible for the equivalence. */
interface TextEntryTarget {
  /** The root the terminal `getByRole` was applied to: page or the previous segment. */
  readonly parent: QueryRoot;
  readonly role: string;
  readonly options: RoleQueryOptions;
}

interface StoredLocator {
  readonly locator: LocatorLike;
  readonly textEntry: TextEntryTarget | null;
}

/** The fixed refusal when the authored role matched nothing and the alternatives matched several. */
export function describeTextEntryAmbiguity(
  action: 'fill' | 'press',
  authored: string,
  count: number,
): string {
  return (
    `${action} failed: no ${authored} matched; ${String(count)} other text-entry controls did — ` +
    'refusing to choose.'
  );
}

const MAX_ACTUAL_IN_MESSAGE = 120;

function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** `{source, flags}` becomes a `RegExp` here, and a literal stays a literal. */
export function compileMatcher(matcher: ResolvedMatcher): string | RegExp {
  return matcher.kind === 'string' ? matcher.value : new RegExp(matcher.source, matcher.flags);
}

/** Playwright 1.63 normalizes string text/title assertions, never regexes or input values. */
function normalizeWhitespace(value: string): string {
  return value.replace(/[\u200b\u00ad]/gu, '').trim().replace(/\s+/gu, ' ');
}

function matches(
  matcher: string | RegExp,
  actual: string,
  mode: 'equals' | 'contains',
  normalize = false,
  ignoreCase?: boolean,
): boolean {
  if (matcher instanceof RegExp) {
    // A global/sticky pattern carries `lastIndex` between calls; polling would then flip between
    // matching and not matching for the same page state. Test from a fresh instance each time.
    let flags = matcher.flags.replace(/[gy]/gu, '');
    if (ignoreCase === true && !flags.includes('i')) flags += 'i';
    if (ignoreCase === false) flags = flags.replace(/i/gu, '');
    return new RegExp(matcher.source, flags).test(actual);
  }
  if (normalize) {
    actual = normalizeWhitespace(actual);
    matcher = normalizeWhitespace(matcher);
  }
  if (ignoreCase === true) {
    actual = actual.toLowerCase();
    matcher = matcher.toLowerCase();
  }
  return mode === 'equals' ? actual === matcher : actual.includes(matcher);
}

function describeMatcher(matcher: string | RegExp): string {
  return matcher instanceof RegExp ? `/${matcher.source}/${matcher.flags}` : JSON.stringify(matcher);
}

function truncate(value: string): string {
  return value.length <= MAX_ACTUAL_IN_MESSAGE
    ? value
    : `${value.slice(0, MAX_ACTUAL_IN_MESSAGE)}…`;
}

/**
 * The tail of a timed-out assertion's message: what was last read, or why nothing was (VAL-011).
 *
 * Exported for the unit tier. Only an error's `name` is used — never its message, which for a
 * strict-mode violation lists the matched elements' text.
 */
export function describeLastReading(
  observed: string | null,
  lastError: unknown,
  subject: 'locator' | 'page',
  timeout: number,
): string {
  const within = `${String(timeout)}ms`;
  if (observed !== null) {
    return `last seen ${JSON.stringify(truncate(observed))} after ${within}.`;
  }
  // A zero or already-spent timeout: nothing was attempted, so nothing can be said about why.
  if (lastError === null) return `no reading was taken within ${within}.`;
  const name = lastError instanceof Error ? lastError.name : 'unknown';
  if (subject === 'locator') {
    if (lastError instanceof Error && /strict mode violation/iu.test(lastError.message)) {
      return `the locator matched more than one element within ${within}.`;
    }
    if (name === 'TimeoutError') return `no element matched the locator within ${within}.`;
  }
  return `no reading could be taken within ${within} (${name}).`;
}

/** The locator actions whose failures {@link describeActionFailure} maps. */
export type ActionName =
  | 'click'
  | 'fill'
  | 'press'
  | 'check'
  | 'uncheck'
  | 'hover'
  | 'selectOption';

const DETACHED_LINE = /^\s*-\s+element was detached from the DOM, retrying\s*$/u;
const DETACHED_PHRASE = 'the element was detached from the page';

/** Playwright's call-log reasons, matched as whole call-log lines only (never markup lines). */
const CALL_LOG_REASONS: readonly (readonly [RegExp, string])[] = [
  [/^\s*-\s+element is not visible\s*$/u, 'the element was not visible'],
  [/^\s*-\s+element is not enabled\s*$/u, 'the element was not enabled'],
  [/^\s*-\s+element is not editable\s*$/u, 'the element was not editable'],
  [/^\s*-\s+element is not stable\s*$/u, 'the element did not stop moving'],
  [DETACHED_LINE, DETACHED_PHRASE],
  [/^\s*-\s+element is outside of the viewport\s*$/u, 'the element was outside the viewport'],
  [/^\s*-\s+(?!locator resolved to ).* intercepts pointer events\s*$/u, 'another element was covering it'],
];

/** Playwright's immediate (non-retried) refusals, matched at the start of the message head. */
const IMMEDIATE_REASONS: readonly (readonly [string, string])[] = [
  ['Element is not visible', 'the element is not visible.'],
  ['Element is not attached to the DOM', 'the element was detached from the page.'],
  ['Element is outside of the viewport', 'the element is outside the viewport.'],
  ['Element is not an <input>', 'the element is not editable.'],
  ['Node is not an <input>', 'the element is not editable.'],
  ['Element is not a <select> element', 'the element is not a select.'],
  ['Target page, context or browser has been closed', 'the page was closed.'],
  ['Page has been closed', 'the page was closed.'],
];

/**
 * A failed locator action as a fixed, author-readable sentence (VAL-028).
 *
 * Exported for the unit tier. Like {@link describeLastReading}, Playwright's own message is never
 * emitted: a strict-mode violation lists the matched elements' markup, and a timeout's call log
 * quotes the element it resolved to. The message is only *inspected* — for the matched-element
 * count (parsed as an integer and nothing else) and for Playwright's fixed call-log phrases,
 * matched as whole lines so a markup line cannot be mistaken for one. The locator expression is
 * not repeated either: the step already names it, and it can carry a resolved variable's value.
 */
export function describeActionFailure(
  action: ActionName,
  error: unknown,
  timeout: number,
): string {
  const failed = `${action} failed`;
  if (!(error instanceof Error)) return `${failed} (unknown).`;
  const lines = error.message.split('\n');
  const head = (lines[0] ?? '').replace(/^[\w.]+: /u, '').replace(/^Error: /u, '');

  if (head.startsWith('strict mode violation: ')) {
    const count = /resolved to (\d{1,9}) elements/u.exec(head)?.[1];
    return count === undefined
      ? `${failed}: the locator matched more than one element; make the step more specific.`
      : describeStrictViolation(action, Number.parseInt(count, 10));
  }

  if (error.name === 'TimeoutError' || /^Timeout \d+ms exceeded/u.test(head)) {
    const within = `within ${String(timeout)}ms`;
    let reason: string | null = null;
    let resolved = false;
    // VAL-041: whether the locator matched anything again after the element first detached.
    let detached = false;
    let resolvedAfterDetach = false;
    for (const line of lines.slice(1)) {
      if (/^\s*-\s+(?:\d{1,9} × )?locator resolved to /u.test(line)) {
        resolved = true;
        if (detached) resolvedAfterDetach = true;
      }
      if (DETACHED_LINE.test(line)) detached = true;
      for (const [pattern, phrase] of CALL_LOG_REASONS) {
        if (pattern.test(line)) reason = phrase;
      }
    }
    // Playwright logs nothing while a re-resolution finds no element, so a detach that is never
    // followed by another match means the element went away for good — not that it kept
    // detaching. Saying "detached" there would hide that the locator stopped matching.
    if (reason === DETACHED_PHRASE && !resolvedAfterDetach) {
      return `${failed}: the element was detached from the page and no element matched the locator again ${within}.`;
    }
    if (reason !== null) return `${failed}: ${reason} ${within}.`;
    if (resolved) return `${failed}: an element matched but could not be acted on ${within}.`;
    return `${failed}: no element matched the locator ${within}.`;
  }

  for (const [prefix, phrase] of IMMEDIATE_REASONS) {
    if (head.startsWith(prefix)) return `${failed}: ${phrase}`;
  }
  return `${failed} (${safeErrorName(error)}).`;
}

/**
 * The fixed strict-mode failure (VAL-028), also raised directly by visible-only resolution when
 * several *visible* elements match (VAL-040), with `count` the visible count.
 */
export function describeStrictViolation(action: ActionName, count: number): string {
  return (
    `${action} failed: the locator matched ${String(count)} elements; ` +
    'make the step more specific.'
  );
}

/** An error's name when it is a plain identifier, `Error` otherwise; never its message. */
function safeErrorName(error: Error): string {
  return /^[A-Za-z]\w{0,63}$/u.test(error.name) ? error.name : 'Error';
}

/** The page-level navigation operations whose failures {@link describeNavigationFailure} maps. */
export type NavigationName = 'goto' | 'waitForURL';

/**
 * A failed navigation as a fixed, author-readable sentence (VAL-029).
 *
 * Playwright's navigation errors quote the URL — `net::ERR_… at <url>`, `navigating to "<url>"`,
 * `waiting for navigation to "<url>"` — and a URL can carry a query, a fragment or userinfo (the
 * VAL-020 leak class). No URL is ever taken from the error: where the browser was is already said
 * by the executor's ` (page: origin+path — "title")` suffix. Only a Chromium network error code is
 * kept, and only when the whole token matches `net::ERR_[A-Z_]+`.
 */
export function describeNavigationFailure(
  action: NavigationName,
  error: unknown,
  timeout: number,
): string {
  const failed = `${action} failed`;
  if (!(error instanceof Error)) return `${failed} (unknown).`;
  const head = (error.message.split('\n')[0] ?? '')
    .replace(/^[\w.]+: /u, '')
    .replace(/^Error: /u, '');

  if (error.name === 'TimeoutError' || /^Timeout \d+ms exceeded/u.test(head)) {
    const within = `within ${String(timeout)}ms`;
    return action === 'goto'
      ? `${failed}: the page did not load ${within}.`
      : `${failed}: the page address did not match ${within}.`;
  }
  const code = head.split(/\s/u, 1)[0] ?? '';
  if (/^net::ERR_[A-Z_]+$/u.test(code)) {
    return `${failed}: the address could not be reached (${code}).`;
  }
  if (head.startsWith('Navigation to ') && head.includes(' is interrupted by another navigation')) {
    return `${failed}: the navigation was interrupted by another navigation.`;
  }
  if (head.startsWith('Cannot navigate to invalid URL')) {
    return `${failed}: the address is not a valid URL.`;
  }
  if (
    head.startsWith('Target page, context or browser has been closed') ||
    head.startsWith('Page has been closed')
  ) {
    return `${failed}: the page was closed.`;
  }
  return `${failed} (${safeErrorName(error)}).`;
}

export function createPlaywrightAdapter(options: PlaywrightAdapterOptions): BrowserAdapter {
  const { page, defaultTimeoutMs } = options;
  const pollIntervalMs = options.pollIntervalMs ?? 50;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? ((): number => performance.now());
  const resolveVariable =
    options.resolveVariable ??
    ((name: string): string => {
      throw new Error(`Locator variable "${name}" cannot be resolved: no resolver was supplied.`);
    });
  const secretOrigins = options.secretOrigins ?? {};
  const handles = new Map<number, StoredLocator>();
  let nextHandleId = 0;

  /**
   * Refuses to type a secret on a page whose origin the secret is not bound to.
   *
   * The page's own origin is the right one to check because the run drives exactly one page and
   * no frames: a second page or popup is closed and fails the run (`childRuntime.ts`, AC-15), so
   * the document a locator resolves in is the top-level document `page.url()` describes. Were
   * frames ever permitted, this would have to check the frame the locator resolved in instead.
   */
  function requireSecretOrigin(secretId: string): void {
    const allowed = Object.hasOwn(secretOrigins, secretId) ? secretOrigins[secretId] : undefined;
    let origin: string | null = null;
    try {
      origin = new URL(page.url()).origin;
    } catch {
      origin = null;
    }
    if (origin === null || allowed?.includes(origin) !== true) {
      // Names the secret id only: never the value, and not the page URL either, which may carry
      // author-supplied query text.
      throw new StepRefusal(
        'SECRET_ORIGIN_NOT_ALLOWED',
        `Secret "${secretId}" is not bound to the current page origin; nothing was typed.`,
      );
    }
  }

  /** Refuses the operation when the run has become unsupported (AC-15). */
  function guard(): void {
    const reason = options.guard?.() ?? null;
    if (reason !== null) throw new Error(reason);
  }

  function storedHandle(target: LocatorHandle): StoredLocator {
    const id = (target as AdapterLocatorHandle).id;
    const stored = handles.get(id);
    if (stored === undefined) {
      throw new Error('Locator handle was not produced by this adapter.');
    }
    return stored;
  }

  function resolveHandle(target: LocatorHandle): LocatorLike {
    return storedHandle(target).locator;
  }

  /**
   * The locator an action acts on, and the timeout it acts with (VAL-031 ruling §4, VAL-040).
   *
   * **Visible-only resolution (VAL-040).** Unless the author passed `force: true`, the action's
   * locators are narrowed with `filter({ visible: true })` before they are counted or acted on, so
   * hidden elements — which an action could not act on anyway — do not count towards strict mode.
   * The visible count is polled until the deadline: ≥2 is the fixed strict-mode failure with N the
   * visible count (never `.first()`); exactly 1 is acted on with the remaining time; 0 until the
   * deadline is "not visible" when the authored locator matched hidden elements, and "no element
   * matched" when it matched nothing. With `force: true` and no text-entry target, the authored
   * locator is returned unfiltered with the full timeout, exactly as before.
   *
   * **Text-entry equivalence (VAL-031)**, `fill`/`press` only: the authored role is counted first
   * on every poll, so a page where it matches keeps the authored target, strict mode included.
   * Only after it has matched nothing for `min(2 s, timeout/4)` are the other two text-entry roles
   * counted, as one `.or()` union narrowed the same way: exactly one match is acted on; several is
   * a fixed refusal; none until the deadline fails as above.
   *
   * **Re-render gate (VAL-041).** When the authored text-entry role matched, the action does not
   * act on it alone: a page can replace the control while the action runs — Wikipedia swaps its
   * server-rendered `searchbox` for a Codex `combobox` with the same name ~50 ms after the first
   * keystroke — and a locator pinned to the vanished role then waits out the whole timeout. The
   * action acts on `authored.or(alternates gated on "no authored match on the page")`, still one
   * re-resolving locator: while the authored role matches, the gate matches nothing, so the
   * authored target and its strict mode are unchanged; once it is gone, the visible alternates
   * take its place on Playwright's next retry, strict mode included. The settle window does not
   * apply there — the authored role has already matched. A swap during the action is not told to
   * `onTextEntryEquivalence`: which branch Playwright acted on is not observable afterwards.
   *
   * Runs after `guard()` and the secret-origin check, never before them (VAL-031 rule 6).
   */
  async function resolveActionTarget(
    action: ActionName,
    stored: StoredLocator,
    timeout: number,
    force: boolean | undefined,
  ): Promise<{ readonly locator: LocatorLike; readonly timeout: number }> {
    const target = action === 'fill' || action === 'press' ? stored.textEntry : null;
    const visibleOnly = force !== true;
    if (target === null && !visibleOnly) return { locator: stored.locator, timeout };
    const view = (locator: LocatorLike): LocatorLike =>
      visibleOnly ? locator.filter({ visible: true }) : locator;

    const start = now();
    const deadline = start + timeout;
    const remainingAfter = (first: boolean): number =>
      first ? timeout : Math.max(1, Math.floor(deadline - now()));
    const authored = view(stored.locator);
    const alternatesOf = (textEntry: TextEntryTarget): {
      readonly first: string;
      readonly second: string;
      readonly firstLocator: LocatorLike;
      readonly union: LocatorLike;
    } => {
      const [firstRole, secondRole] = TEXT_ENTRY_ROLES.filter(
        (role) => role !== textEntry.role,
      ) as [string, string];
      const firstLocator = textEntry.parent.getByRole(firstRole, textEntry.options);
      const union = firstLocator.or(textEntry.parent.getByRole(secondRole, textEntry.options));
      return { first: firstRole, second: secondRole, firstLocator, union };
    };
    let first = true;
    for (;;) {
      guard();
      const matched = await act(action, timeout, () => authored.count());
      if (matched > 1 && visibleOnly) {
        throw new Error(describeStrictViolation(action, matched));
      }
      if (matched > 0) {
        // The first poll found it: the action gets the whole timeout, as before.
        const remaining = remainingAfter(first);
        if (visibleOnly) await discloseVisibleOnly(action, timeout, stored.locator);
        if (target === null) return { locator: authored, timeout: remaining };
        // VAL-041: the alternates only ever match once no authored element is left on the page.
        const gated = page
          .locator(':root', { hasNot: authored })
          .locator(view(alternatesOf(target).union));
        return { locator: authored.or(gated), timeout: remaining };
      }
      first = false;
      if (target !== null && now() - start >= Math.min(TEXT_ENTRY_SETTLE_MAX_MS, timeout / 4)) {
        const {
          first: firstRole,
          second: secondRole,
          firstLocator: firstAlternate,
          union,
        } = alternatesOf(target);
        const alternates = await act(action, timeout, () => view(union).count());
        if (alternates > 1) {
          throw new Error(
            describeTextEntryAmbiguity(action as 'fill' | 'press', target.role, alternates),
          );
        }
        if (alternates === 1) {
          const resolved =
            (await act(action, timeout, () => view(firstAlternate).count())) === 1
              ? firstRole
              : secondRole;
          options.onTextEntryEquivalence?.(target.role, resolved);
          if (visibleOnly) await discloseVisibleOnly(action, timeout, union);
          return { locator: view(union), timeout: remainingAfter(false) };
        }
      }
      if (now() >= deadline) {
        const within = `within ${String(timeout)}ms`;
        if (visibleOnly && (await act(action, timeout, () => stored.locator.count())) > 0) {
          throw new Error(`${action} failed: the element was not visible ${within}.`);
        }
        throw new Error(`${action} failed: no element matched the locator ${within}.`);
      }
      await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - now())));
    }
  }

  /**
   * Tells the operator when visible-only resolution changed the outcome: the one visible element
   * being acted on had hidden twins, so strict mode would have refused it (VAL-040). Counts only,
   * never page content or the locator expression.
   */
  async function discloseVisibleOnly(
    action: ActionName,
    timeout: number,
    unfiltered: LocatorLike,
  ): Promise<void> {
    if (options.onVisibleOnlyResolution === undefined) return;
    const total = await act(action, timeout, () => unfiltered.count());
    if (total > 1) options.onVisibleOnlyResolution(total);
  }

  function applySegment(root: QueryRoot, segment: LocatorSegment): LocatorLike {
    switch (segment.kind) {
      case 'getByRole':
        return root.getByRole(segment.role, roleOptionsOf(segment, resolveVariable));
      case 'getByText':
        return root.getByText(textOf(segment.text, resolveVariable), {
          exact: segment.options?.exact,
        });
      case 'getByLabel':
        return root.getByLabel(textOf(segment.text, resolveVariable), {
          exact: segment.options?.exact,
        });
      case 'getByPlaceholder':
        return root.getByPlaceholder(textOf(segment.text, resolveVariable), {
          exact: segment.options?.exact,
        });
      case 'getByTestId':
        return root.getByTestId(
          segment.testId.kind === 'literal'
            ? segment.testId.value
            : resolveVariable(segment.testId.name),
        );
      case 'locator':
        return root.locator(segment.selector);
    }
  }

  function timeoutOf(given: number | undefined): number {
    return given ?? defaultTimeoutMs;
  }

  /**
   * Runs one Playwright locator action, replacing any failure with a fixed message (VAL-028).
   * Only the Playwright call is wrapped: the guard, a trial refusal and a secret-origin refusal
   * are the runner's own messages and reach the executor unchanged.
   */
  async function act<T>(action: ActionName, timeout: number, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw new Error(describeActionFailure(action, error, timeout));
    }
  }

  /** The same, for a page-level navigation (VAL-029): no URL from the error ever leaves. */
  async function navigate(
    action: NavigationName,
    timeout: number,
    run: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await run();
    } catch (error) {
      throw new Error(describeNavigationFailure(action, error, timeout));
    }
  }

  /**
   * Polls a live reading until it satisfies the matcher or the deadline passes.
   *
   * The first read happens before any sleep, so an already-true condition costs no wall time and
   * cannot push a later step's reading out. The failure message names the matcher and a truncated
   * actual; the actual goes through the executor's redactor before it reaches a report (AC-21).
   *
   * **"Last seen" names only what was actually read.** A read that throws is a not-yet, and its
   * error name is never filed as the actual: `last seen "TimeoutError"` reads as if the page said
   * "TimeoutError" and hides the real cause (VAL-011). When no read ever succeeded, the message
   * says so instead — for a locator, that nothing matched it (or that it matched several, which
   * Playwright refuses as a strict-mode violation). Only the error *name* is kept; Playwright's
   * message can quote page content and is never emitted.
   */
  async function pollUntil(
    read: (remainingMs: number) => Promise<string>,
    ok: (actual: string) => boolean,
    timeout: number,
    label: string,
    expected: string,
    subject: 'locator' | 'page',
  ): Promise<void> {
    const deadline = now() + timeout;
    let observed: string | null = null;
    let lastError: unknown = null;
    for (;;) {
      guard();
      let matched = false;
      try {
        const remaining = deadline - now();
        if (remaining > 0) {
          const actual = await read(Math.max(1, remaining));
          observed = actual;
          matched = ok(actual);
        }
      } catch (error) {
        // A locator that is not attached yet throws; that is a not-yet, not a failure, until the
        // deadline says otherwise.
        lastError = error;
      }
      guard();
      if (now() < deadline && matched) return;
      if (now() >= deadline) {
        throw new Error(
          `AssertionFailed: ${label} expected ${expected}, ` +
            describeLastReading(observed, lastError, subject, timeout),
        );
      }
      await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - now())));
    }
  }

  return {
    async goto(url: string, gotoOptions?: GotoOptions): Promise<void> {
      guard();
      const timeout = timeoutOf(gotoOptions?.timeout);
      await navigate('goto', timeout, () =>
        page.goto(url, { timeout, waitUntil: gotoOptions?.waitUntil }),
      );
    },

    async waitForURL(url: ResolvedMatcher, gotoOptions?: GotoOptions): Promise<void> {
      guard();
      const matcher = compileMatcher(url);
      const timeout = timeoutOf(gotoOptions?.timeout);
      await navigate('waitForURL', timeout, () =>
        page.waitForURL(matcher, { timeout, waitUntil: gotoOptions?.waitUntil }),
      );
    },

    // `async` rather than a synchronous body returning a promise: a refusal here — the guard, or
    // a variable with no resolver — must reach the executor as a rejected step, not as a throw
    // that escapes the operation loop by a different route than every other operation's.
    async locate(chain: LocatorChain): Promise<LocatorHandle> {
      await Promise.resolve();
      guard();
      let current: QueryRoot = page;
      const terminal = chain.segments.at(-1);
      const eligible = terminal !== undefined && isTextEntryEligible(terminal);
      const leading = eligible ? chain.segments.slice(0, -1) : chain.segments;
      for (const segment of leading) current = applySegment(current, segment);
      let textEntry: TextEntryTarget | null = null;
      if (eligible && terminal.kind === 'getByRole') {
        // Resolved once and shared: the alternatives get exactly the options the authored role got.
        const roleOptions = roleOptionsOf(terminal, resolveVariable);
        textEntry = { parent: current, role: terminal.role, options: roleOptions };
        current = current.getByRole(terminal.role, roleOptions);
      }
      nextHandleId += 1;
      handles.set(nextHandleId, { locator: current as LocatorLike, textEntry });
      const handle: AdapterLocatorHandle = { kind: 'locator-handle', id: nextHandleId };
      return handle;
    },

    async click(target: LocatorHandle, clickOptions?: ClickOptions): Promise<void> {
      guard();
      refuseTrial(clickOptions);
      const timeout = timeoutOf(clickOptions?.timeout);
      const resolved = await resolveActionTarget(
        'click',
        storedHandle(target),
        timeout,
        clickOptions?.force,
      );
      await act('click', timeout, () =>
        resolved.locator.click({
          button: clickOptions?.button,
          clickCount: clickOptions?.clickCount,
          delay: clickOptions?.delay,
          force: clickOptions?.force,
          timeout: resolved.timeout,
        }),
      );
    },

    async fill(
      target: LocatorHandle,
      value: string,
      actionOptions?: ActionOptions,
      secretId?: string,
    ): Promise<void> {
      guard();
      if (secretId !== undefined) requireSecretOrigin(secretId);
      const timeout = timeoutOf(actionOptions?.timeout);
      const resolved = await resolveActionTarget(
        'fill',
        storedHandle(target),
        timeout,
        actionOptions?.force,
      );
      await act('fill', timeout, () =>
        resolved.locator.fill(value, { force: actionOptions?.force, timeout: resolved.timeout }),
      );
    },

    async press(target: LocatorHandle, key: string, pressOptions?: PressOptions): Promise<void> {
      guard();
      const timeout = timeoutOf(pressOptions?.timeout);
      const resolved = await resolveActionTarget('press', storedHandle(target), timeout, undefined);
      await act('press', timeout, () =>
        resolved.locator.press(key, { delay: pressOptions?.delay, timeout: resolved.timeout }),
      );
    },

    async check(target: LocatorHandle, actionOptions?: ActionOptions): Promise<void> {
      guard();
      refuseTrial(actionOptions);
      const timeout = timeoutOf(actionOptions?.timeout);
      const resolved = await resolveActionTarget(
        'check',
        storedHandle(target),
        timeout,
        actionOptions?.force,
      );
      await act('check', timeout, () =>
        resolved.locator.check(actionOf(actionOptions, resolved.timeout)),
      );
    },

    async uncheck(target: LocatorHandle, actionOptions?: ActionOptions): Promise<void> {
      guard();
      refuseTrial(actionOptions);
      const timeout = timeoutOf(actionOptions?.timeout);
      const resolved = await resolveActionTarget(
        'uncheck',
        storedHandle(target),
        timeout,
        actionOptions?.force,
      );
      await act('uncheck', timeout, () =>
        resolved.locator.uncheck(actionOf(actionOptions, resolved.timeout)),
      );
    },

    async hover(target: LocatorHandle, actionOptions?: ActionOptions): Promise<void> {
      guard();
      refuseTrial(actionOptions);
      const timeout = timeoutOf(actionOptions?.timeout);
      const resolved = await resolveActionTarget(
        'hover',
        storedHandle(target),
        timeout,
        actionOptions?.force,
      );
      await act('hover', timeout, () =>
        resolved.locator.hover(actionOf(actionOptions, resolved.timeout)),
      );
    },

    async selectOption(
      target: LocatorHandle,
      value: string,
      actionOptions?: ActionOptions,
    ): Promise<void> {
      guard();
      const timeout = timeoutOf(actionOptions?.timeout);
      const resolved = await resolveActionTarget(
        'selectOption',
        storedHandle(target),
        timeout,
        actionOptions?.force,
      );
      await act('selectOption', timeout, () =>
        resolved.locator.selectOption(value, {
          force: actionOptions?.force,
          timeout: resolved.timeout,
        }),
      );
    },

    async expectVisible(target: LocatorHandle, timeoutOptions?: TimeoutOptions): Promise<void> {
      guard();
      const timeout = timeoutOf(timeoutOptions?.timeout);
      try {
        await resolveHandle(target).waitFor({ state: 'visible', timeout });
      } catch (error) {
        throw new Error(
          `AssertionFailed: expected the locator to be visible within ${String(timeout)}ms ` +
            `(${error instanceof Error ? error.name : 'unknown'}).`,
        );
      }
    },

    async expectContainText(
      target: LocatorHandle,
      expected: ResolvedMatcher,
      containOptions?: ContainTextOptions,
    ): Promise<void> {
      const locator = resolveHandle(target);
      const matcher = compileMatcher(expected);
      const ignoreCase = containOptions?.ignoreCase;
      const useInnerText = containOptions?.useInnerText === true;
      const timeout = timeoutOf(containOptions?.timeout);
      const compare = (actual: string): boolean =>
        matches(matcher, actual, 'contains', true, ignoreCase);
      // Named rather than inline: an inline async arrow passed straight to a call emits a shape
      // `test/no-dynamic-evaluation.test.ts` scans for (architecture §4.5). The scan is blunt on
      // purpose, and writing around it costs one named constant.
      const readText = async (remainingMs: number): Promise<string> =>
        useInnerText
          ? await locator.innerText({ timeout: remainingMs })
          : ((await locator.textContent({ timeout: remainingMs })) ?? '');
      await pollUntil(
        readText,
        compare,
        timeout,
        'text content to contain',
        describeMatcher(matcher),
        'locator',
      );
    },

    async expectValue(
      target: LocatorHandle,
      expected: ResolvedMatcher,
      timeoutOptions?: TimeoutOptions,
    ): Promise<void> {
      const locator = resolveHandle(target);
      const matcher = compileMatcher(expected);
      const timeout = timeoutOf(timeoutOptions?.timeout);
      const readValue = async (remainingMs: number): Promise<string> =>
        await locator.inputValue({ timeout: remainingMs });
      await pollUntil(
        readValue,
        (actual) => matches(matcher, actual, 'equals'),
        timeout,
        'input value to be',
        describeMatcher(matcher),
        'locator',
      );
    },

    async expectUrl(expected: ResolvedMatcher, urlOptions?: HaveUrlOptions): Promise<void> {
      let matcher = compileMatcher(expected);
      // Playwright resolves string expectations with URL(), falling back to the literal when
      // parsing fails. Studio has no baseURL; never infer one from the current page.
      if (typeof matcher === 'string') {
        try { matcher = new URL(matcher).toString(); } catch { /* Keep the literal. */ }
      }
      const ignoreCase = urlOptions?.ignoreCase;
      const timeout = timeoutOf(urlOptions?.timeout);
      await pollUntil(
        () => Promise.resolve(page.url()),
        (actual) => matches(matcher, actual, 'equals', false, ignoreCase),
        timeout,
        'the page URL to be',
        describeMatcher(matcher),
        'page',
      );
    },

    async expectTitle(
      expected: ResolvedMatcher,
      timeoutOptions?: TimeoutOptions,
    ): Promise<void> {
      const matcher = compileMatcher(expected);
      const timeout = timeoutOf(timeoutOptions?.timeout);
      const readTitle = async (): Promise<string> => await page.title();
      await pollUntil(
        readTitle,
        (actual) => matches(matcher, actual, 'equals', true),
        timeout,
        'the page title to be',
        describeMatcher(matcher),
        'page',
      );
    },

    // The raw reading; the executor reduces, redacts and time-bounds it (VAL-013). Nothing here
    // waits on its own: `title()` on a closed or crashed page rejects or hangs, and the executor's
    // bound is what keeps that from delaying the step report.
    async pageLocation(): Promise<PageLocation | null> {
      // A run being stopped, or one a second page made unsupported, is already explained by the
      // guard's message — and a page being torn down is not one to start reading from.
      if ((options.guard?.() ?? null) !== null) return null;
      const url = page.url();
      let title: string | null = null;
      try {
        title = await page.title();
      } catch {
        title = null;
      }
      return { url, title };
    },
  };
}

function actionOf(
  actionOptions: ActionOptions | undefined,
  timeout: number,
): Record<string, unknown> {
  return { force: actionOptions?.force, timeout };
}

/**
 * Defence in depth: validator 2.0.0 rejects the `trial` key and `actionOf` never forwards it, but an
 * options object reaching the adapter at runtime is still refused if it carries `trial: true`.
 */
function refuseTrial(options: ActionOptions | ClickOptions | undefined): void {
  if ((options as { readonly trial?: unknown } | undefined)?.trial === true) {
    throw new Error('Playwright trial mode is not executable: it would skip the requested action.');
  }
}

/** `getByRole`'s options after resolution, as `applySegment` passes them. */
function roleOptionsOf(
  segment: Extract<LocatorSegment, { kind: 'getByRole' }>,
  resolveVariable: (name: string) => string,
): RoleQueryOptions {
  const name = segment.options?.name;
  return {
    name: name === undefined ? undefined : textOf(name, resolveVariable),
    exact: segment.options?.exact,
    checked: segment.options?.checked,
    disabled: segment.options?.disabled,
    expanded: segment.options?.expanded,
    selected: segment.options?.selected,
    pressed: segment.options?.pressed,
    level: segment.options?.level,
  };
}

/**
 * Whether a chain's **terminal** segment is eligible for the equivalence (VAL-031 rule 1): a
 * `getByRole` on a text-entry role whose options are limited to `name`, `exact` and `disabled`.
 * Any of `checked`/`expanded`/`selected`/`pressed`/`level` disables it.
 */
function isTextEntryEligible(segment: LocatorSegment): boolean {
  if (segment.kind !== 'getByRole' || !TEXT_ENTRY_ROLES.includes(segment.role)) return false;
  return Object.entries(segment.options ?? {}).every(
    ([key, value]) => value === undefined || TEXT_ENTRY_NEUTRAL_OPTIONS.has(key),
  );
}

/** A locator's text argument after resolution. Secrets never reach a locator (validator AC-13). */
function textOf(value: TextMatcher, resolveVariable: (name: string) => string): string | RegExp {
  switch (value.kind) {
    case 'literal':
      return value.value;
    case 'variable':
      return resolveVariable(value.name);
    case 'regex':
      return new RegExp(value.source, value.flags);
  }
}
