/**
 * The accepted language, expressed as data (architecture §4.5 table).
 *
 * Everything the validator permits is enumerated here: receivers, their methods, the arity and
 * kind of each positional argument, and the exact set of option keys with their value types.
 * Modelling it as data (rather than as branching code) is what lets story 10.3's reference
 * corpus and the backend prompt's syntax reference be generated from one source later.
 *
 * Anything absent from these tables is rejected. There is no wildcard and no fallthrough.
 */

/** Kinds of positional argument the schemas can require. */
export type ArgumentKind =
  /** Absolute http/https URL: string literal or `vars.get`. */
  | 'url'
  /** URL matcher: string literal, safe regex, or `vars.get`. */
  | 'urlMatcher'
  /** Human text matcher: string literal, safe regex, or `vars.get`. */
  | 'textMatcher'
  /** `fill` value: string literal, `vars.get`, or `vars.secret` (the only secret position). */
  | 'fillValue'
  /** `selectOption` value: string literal or `vars.get`. */
  | 'selectValue'
  /** Keyboard key for `press`: bounded string literal from the permitted key grammar. */
  | 'key'
  /** ARIA role name: string literal drawn from `PERMITTED_ROLES`. */
  | 'role'
  /** CSS selector for `locator`: string literal, CSS engine only. */
  | 'selector'
  /** Test id: string literal or `vars.get`. */
  | 'testId';

export type OptionValueSchema =
  | { readonly type: 'boolean' }
  | { readonly type: 'integer'; readonly min: number; readonly max: number }
  | { readonly type: 'enum'; readonly values: readonly string[] }
  | { readonly type: 'textMatcher' };

export interface MethodSchema {
  /** Positional arguments, in order. All are required. */
  readonly positional: readonly ArgumentKind[];
  /**
   * Permitted option keys for a trailing options object, or `null` when the method accepts no
   * options object at all.
   */
  readonly options: Readonly<Record<string, OptionValueSchema>> | null;
}

const TIMEOUT: OptionValueSchema = { type: 'integer', min: 0, max: 600_000 };

/** ARIA roles Playwright's `getByRole` understands. Any other role string is rejected. */
export const PERMITTED_ROLES: readonly string[] = [
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'button',
  'caption',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'directory',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'meter',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'subscript',
  'superscript',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
];

/** Locator factories reachable from `page` or from another locator. */
export const LOCATOR_METHODS: Readonly<Record<string, MethodSchema>> = {
  getByRole: {
    positional: ['role'],
    options: {
      name: { type: 'textMatcher' },
      exact: { type: 'boolean' },
      checked: { type: 'boolean' },
      disabled: { type: 'boolean' },
      expanded: { type: 'boolean' },
      selected: { type: 'boolean' },
      pressed: { type: 'boolean' },
      level: { type: 'integer', min: 1, max: 6 },
    },
  },
  getByText: { positional: ['textMatcher'], options: { exact: { type: 'boolean' } } },
  getByLabel: { positional: ['textMatcher'], options: { exact: { type: 'boolean' } } },
  getByPlaceholder: { positional: ['textMatcher'], options: { exact: { type: 'boolean' } } },
  getByTestId: { positional: ['testId'], options: null },
  locator: { positional: ['selector'], options: null },
};

/** Actions permitted on a locator. Keys are the source method names. */
export const ACTION_METHODS: Readonly<Record<string, MethodSchema>> = {
  click: {
    positional: [],
    options: {
      button: { type: 'enum', values: ['left', 'right', 'middle'] },
      clickCount: { type: 'integer', min: 1, max: 3 },
      delay: { type: 'integer', min: 0, max: 5_000 },
      force: { type: 'boolean' },
      trial: { type: 'boolean' },
      timeout: TIMEOUT,
    },
  },
  fill: {
    positional: ['fillValue'],
    options: { force: { type: 'boolean' }, timeout: TIMEOUT },
  },
  press: {
    positional: ['key'],
    options: { delay: { type: 'integer', min: 0, max: 5_000 }, timeout: TIMEOUT },
  },
  check: {
    positional: [],
    options: { force: { type: 'boolean' }, trial: { type: 'boolean' }, timeout: TIMEOUT },
  },
  uncheck: {
    positional: [],
    options: { force: { type: 'boolean' }, trial: { type: 'boolean' }, timeout: TIMEOUT },
  },
  hover: {
    positional: [],
    options: { force: { type: 'boolean' }, trial: { type: 'boolean' }, timeout: TIMEOUT },
  },
  selectOption: {
    positional: ['selectValue'],
    options: { force: { type: 'boolean' }, timeout: TIMEOUT },
  },
};

/** Navigation methods permitted directly on `page`. */
export const PAGE_METHODS: Readonly<Record<string, MethodSchema>> = {
  goto: {
    positional: ['url'],
    options: {
      timeout: TIMEOUT,
      waitUntil: {
        type: 'enum',
        values: ['load', 'domcontentloaded', 'networkidle', 'commit'],
      },
    },
  },
  waitForURL: {
    positional: ['urlMatcher'],
    options: {
      timeout: TIMEOUT,
      waitUntil: {
        type: 'enum',
        values: ['load', 'domcontentloaded', 'networkidle', 'commit'],
      },
    },
  },
};

/** Assertions permitted on `expect(locator)`. */
export const LOCATOR_ASSERTIONS: Readonly<Record<string, MethodSchema>> = {
  toBeVisible: { positional: [], options: { timeout: TIMEOUT } },
  toContainText: {
    positional: ['textMatcher'],
    options: {
      timeout: TIMEOUT,
      ignoreCase: { type: 'boolean' },
      useInnerText: { type: 'boolean' },
    },
  },
  toHaveValue: { positional: ['textMatcher'], options: { timeout: TIMEOUT } },
};

/** Assertions permitted on `expect(page)`. */
export const PAGE_ASSERTIONS: Readonly<Record<string, MethodSchema>> = {
  toHaveURL: {
    positional: ['urlMatcher'],
    options: { timeout: TIMEOUT, ignoreCase: { type: 'boolean' } },
  },
  toHaveTitle: { positional: ['textMatcher'], options: { timeout: TIMEOUT } },
};

/** Root identifiers the validator recognises at all. Everything else is a denied receiver. */
export const PERMITTED_ROOT_IDENTIFIERS: readonly string[] = ['page', 'expect', 'vars'];

/** `vars` methods and the reference kind they produce. */
export const REFERENCE_METHODS: Readonly<Record<string, 'variable' | 'secret'>> = {
  get: 'variable',
  secret: 'secret',
};

/**
 * Argument kinds in which a `vars.secret(...)` reference is accepted. V1 approves exactly one
 * position: the value argument of `fill` (AC-9). Widening this set requires a documented case.
 */
export const SECRET_PERMITTED_ARGUMENT_KINDS: readonly ArgumentKind[] = ['fillValue'];

/** Regex flags the safe subset permits. `g`, `y`, `d` and `v` are rejected. */
export const PERMITTED_REGEX_FLAGS: readonly string[] = ['i', 'm', 's', 'u'];

/**
 * Playwright selector-engine syntax that `locator()` accepts but the CSS-only policy rejects.
 * The check is textual and deliberately conservative.
 */
export const FORBIDDEN_SELECTOR_FRAGMENTS: readonly string[] = [
  '>>',
  ':has-text(',
  ':text(',
  ':text-is(',
  ':text-matches(',
  ':has(',
  ':visible',
  ':right-of(',
  ':left-of(',
  ':above(',
  ':below(',
  ':near(',
  ':nth-match(',
  ':scope',
];

/** Property names that expose the prototype chain and are rejected on every receiver. */
export const PROTOTYPE_PROPERTY_NAMES: readonly string[] = [
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
];
