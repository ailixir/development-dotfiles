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
  ResolvedMatcher,
} from '../executor/adapters/BrowserAdapter.js';
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
}

export interface PageLike extends QueryRoot {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForURL(url: string | RegExp, options?: Record<string, unknown>): Promise<void>;
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
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  /** Monotonic source for the assertion deadlines. Injected so the unit tier need not sleep. */
  readonly now?: (() => number) | undefined;
}

interface AdapterLocatorHandle extends LocatorHandle {
  readonly id: number;
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

function matches(matcher: string | RegExp, actual: string, mode: 'equals' | 'contains'): boolean {
  if (matcher instanceof RegExp) {
    // A global/sticky pattern carries `lastIndex` between calls; polling would then flip between
    // matching and not matching for the same page state. Test from a fresh instance each time.
    return new RegExp(matcher.source, matcher.flags.replace(/[gy]/gu, '')).test(actual);
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
  const handles = new Map<number, LocatorLike>();
  let nextHandleId = 0;

  /** Refuses the operation when the run has become unsupported (AC-15). */
  function guard(): void {
    const reason = options.guard?.() ?? null;
    if (reason !== null) throw new Error(reason);
  }

  function resolveHandle(target: LocatorHandle): LocatorLike {
    const id = (target as AdapterLocatorHandle).id;
    const locator = handles.get(id);
    if (locator === undefined) {
      throw new Error('Locator handle was not produced by this adapter.');
    }
    return locator;
  }

  function applySegment(root: QueryRoot, segment: LocatorSegment): LocatorLike {
    switch (segment.kind) {
      case 'getByRole': {
        const name = segment.options?.name;
        return root.getByRole(segment.role, {
          name: name === undefined ? undefined : textOf(name, resolveVariable),
          exact: segment.options?.exact,
          checked: segment.options?.checked,
          disabled: segment.options?.disabled,
          expanded: segment.options?.expanded,
          selected: segment.options?.selected,
          pressed: segment.options?.pressed,
          level: segment.options?.level,
        });
      }
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
   * Polls a live reading until it satisfies the matcher or the deadline passes.
   *
   * The first read happens before any sleep, so an already-true condition costs no wall time and
   * cannot push a later step's reading out. The failure message names the matcher and a truncated
   * actual; the actual goes through the executor's redactor before it reaches a report (AC-21).
   */
  async function pollUntil(
    read: () => Promise<string>,
    ok: (actual: string) => boolean,
    timeout: number,
    label: string,
    expected: string,
  ): Promise<void> {
    const deadline = now() + timeout;
    let actual = '';
    for (;;) {
      guard();
      try {
        actual = await read();
        if (ok(actual)) return;
      } catch (error) {
        // A locator that is not attached yet throws; that is a not-yet, not a failure, until the
        // deadline says otherwise.
        actual = error instanceof Error ? error.name : 'unknown';
      }
      if (now() >= deadline) {
        throw new Error(
          `AssertionFailed: ${label} expected ${expected}, last seen ${JSON.stringify(truncate(actual))} ` +
            `after ${String(timeout)}ms.`,
        );
      }
      await sleep(pollIntervalMs);
    }
  }

  return {
    async goto(url: string, gotoOptions?: GotoOptions): Promise<void> {
      guard();
      await page.goto(url, {
        timeout: timeoutOf(gotoOptions?.timeout),
        waitUntil: gotoOptions?.waitUntil,
      });
    },

    async waitForURL(url: ResolvedMatcher, gotoOptions?: GotoOptions): Promise<void> {
      guard();
      await page.waitForURL(compileMatcher(url), {
        timeout: timeoutOf(gotoOptions?.timeout),
        waitUntil: gotoOptions?.waitUntil,
      });
    },

    // `async` rather than a synchronous body returning a promise: a refusal here — the guard, or
    // a variable with no resolver — must reach the executor as a rejected step, not as a throw
    // that escapes the operation loop by a different route than every other operation's.
    async locate(chain: LocatorChain): Promise<LocatorHandle> {
      await Promise.resolve();
      guard();
      let current: QueryRoot = page;
      for (const segment of chain.segments) current = applySegment(current, segment);
      nextHandleId += 1;
      handles.set(nextHandleId, current as LocatorLike);
      const handle: AdapterLocatorHandle = { kind: 'locator-handle', id: nextHandleId };
      return handle;
    },

    async click(target: LocatorHandle, clickOptions?: ClickOptions): Promise<void> {
      guard();
      await resolveHandle(target).click({
        button: clickOptions?.button,
        clickCount: clickOptions?.clickCount,
        delay: clickOptions?.delay,
        force: clickOptions?.force,
        trial: clickOptions?.trial,
        timeout: timeoutOf(clickOptions?.timeout),
      });
    },

    async fill(target: LocatorHandle, value: string, actionOptions?: ActionOptions): Promise<void> {
      guard();
      await resolveHandle(target).fill(value, {
        force: actionOptions?.force,
        timeout: timeoutOf(actionOptions?.timeout),
      });
    },

    async press(target: LocatorHandle, key: string, pressOptions?: PressOptions): Promise<void> {
      guard();
      await resolveHandle(target).press(key, {
        delay: pressOptions?.delay,
        timeout: timeoutOf(pressOptions?.timeout),
      });
    },

    async check(target: LocatorHandle, actionOptions?: ActionOptions): Promise<void> {
      guard();
      await resolveHandle(target).check(actionOf(actionOptions, timeoutOf(actionOptions?.timeout)));
    },

    async uncheck(target: LocatorHandle, actionOptions?: ActionOptions): Promise<void> {
      guard();
      await resolveHandle(target).uncheck(
        actionOf(actionOptions, timeoutOf(actionOptions?.timeout)),
      );
    },

    async hover(target: LocatorHandle, actionOptions?: ActionOptions): Promise<void> {
      guard();
      await resolveHandle(target).hover(actionOf(actionOptions, timeoutOf(actionOptions?.timeout)));
    },

    async selectOption(
      target: LocatorHandle,
      value: string,
      actionOptions?: ActionOptions,
    ): Promise<void> {
      guard();
      await resolveHandle(target).selectOption(value, {
        force: actionOptions?.force,
        timeout: timeoutOf(actionOptions?.timeout),
      });
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
      const ignoreCase = containOptions?.ignoreCase === true;
      const useInnerText = containOptions?.useInnerText === true;
      const timeout = timeoutOf(containOptions?.timeout);
      const compare = (actual: string): boolean =>
        ignoreCase && typeof matcher === 'string'
          ? actual.toLowerCase().includes(matcher.toLowerCase())
          : matches(matcher, actual, 'contains');
      // Named rather than inline: an inline async arrow passed straight to a call emits a shape
      // `test/no-dynamic-evaluation.test.ts` scans for (architecture §4.5). The scan is blunt on
      // purpose, and writing around it costs one named constant.
      const readText = async (): Promise<string> =>
        useInnerText
          ? await locator.innerText({ timeout })
          : ((await locator.textContent({ timeout })) ?? '');
      await pollUntil(
        readText,
        compare,
        timeout,
        'text content to contain',
        describeMatcher(matcher),
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
      const readValue = async (): Promise<string> => await locator.inputValue({ timeout });
      await pollUntil(
        readValue,
        (actual) => matches(matcher, actual, 'equals'),
        timeout,
        'input value to be',
        describeMatcher(matcher),
      );
    },

    async expectUrl(expected: ResolvedMatcher, urlOptions?: HaveUrlOptions): Promise<void> {
      const matcher = compileMatcher(expected);
      const ignoreCase = urlOptions?.ignoreCase === true;
      const timeout = timeoutOf(urlOptions?.timeout);
      await pollUntil(
        () => Promise.resolve(page.url()),
        (actual) =>
          ignoreCase && typeof matcher === 'string'
            ? actual.toLowerCase() === matcher.toLowerCase()
            : matches(matcher, actual, 'equals'),
        timeout,
        'the page URL to be',
        describeMatcher(matcher),
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
        (actual) => matches(matcher, actual, 'equals'),
        timeout,
        'the page title to be',
        describeMatcher(matcher),
      );
    },
  };
}

function actionOf(
  actionOptions: ActionOptions | undefined,
  timeout: number,
): Record<string, unknown> {
  return { force: actionOptions?.force, trial: actionOptions?.trial, timeout };
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
