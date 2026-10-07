import type {
  ActionOptions,
  ClickOptions,
  ContainTextOptions,
  GotoOptions,
  HaveUrlOptions,
  LocatorChain,
  PressOptions,
  TimeoutOptions,
} from '../operations.js';

/**
 * The seam between the trusted executor and Playwright (story 10.12 supplies the real
 * implementation; every test here uses a fake).
 *
 * Deliberately minimal and Playwright-free: no Playwright type appears in the validator or the
 * executor, so neither can grow a capability by accident. Matchers arrive as data, never as code:
 * a regular expression is `{source, flags}` and the adapter is responsible for compiling it.
 */

/** Opaque handle returned by `locate`. The executor never inspects it. */
export interface LocatorHandle {
  readonly kind: 'locator-handle';
}

/** A text/URL matcher after resolution: either a concrete string or a safe pattern. */
export type ResolvedMatcher =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'pattern'; readonly source: string; readonly flags: string };

export interface BrowserAdapter {
  goto(url: string, options?: GotoOptions): Promise<void>;
  waitForURL(url: ResolvedMatcher, options?: GotoOptions): Promise<void>;
  locate(chain: LocatorChain): Promise<LocatorHandle>;
  click(target: LocatorHandle, options?: ClickOptions): Promise<void>;
  /**
   * `secretId` is set when `value` is a resolved secret. The adapter must then refuse unless the
   * current page origin is one that secret is bound to, and must refuse when it knows no origins
   * for it: an adapter that cannot check is an adapter that must not fill.
   */
  fill(
    target: LocatorHandle,
    value: string,
    options?: ActionOptions,
    secretId?: string,
  ): Promise<void>;
  press(target: LocatorHandle, key: string, options?: PressOptions): Promise<void>;
  check(target: LocatorHandle, options?: ActionOptions): Promise<void>;
  uncheck(target: LocatorHandle, options?: ActionOptions): Promise<void>;
  hover(target: LocatorHandle, options?: ActionOptions): Promise<void>;
  selectOption(target: LocatorHandle, value: string, options?: ActionOptions): Promise<void>;
  expectVisible(target: LocatorHandle, options?: TimeoutOptions): Promise<void>;
  expectContainText(
    target: LocatorHandle,
    expected: ResolvedMatcher,
    options?: ContainTextOptions,
  ): Promise<void>;
  expectValue(
    target: LocatorHandle,
    expected: ResolvedMatcher,
    options?: TimeoutOptions,
  ): Promise<void>;
  expectUrl(expected: ResolvedMatcher, options?: HaveUrlOptions): Promise<void>;
  expectTitle(expected: ResolvedMatcher, options?: TimeoutOptions): Promise<void>;
  /**
   * Where the browser is, read once when a step fails (VAL-013). Not an operation of the accepted
   * language — no step can call it — and optional, so an adapter with no page has nothing to say.
   *
   * Returns the **raw** reading. The executor reduces it to `origin + pathname`, redacts it and
   * bounds the wait (`src/executor/pageLocation.ts`); an adapter must not be trusted to.
   */
  pageLocation?(): Promise<PageLocation | null>;
}

/** The page the browser was on, as read. Raw: may carry a query, a fragment or userinfo. */
export interface PageLocation {
  readonly url: string;
  readonly title: string | null;
}

/**
 * Resolves declared references at the moment of use (AC-13).
 *
 * `knownValues` exists so the executor can build a redactor without ever holding the values it
 * redacts anywhere else; it is the only bulk read of secret material and its result never leaves
 * the redactor.
 */
export interface ValueResolver {
  variable(name: string): string;
  secret(id: string): string;
  knownValues(): readonly string[];
}
