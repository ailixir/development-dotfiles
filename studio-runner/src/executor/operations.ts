/**
 * Typed, serializable operation list produced by the validator and consumed by the trusted
 * executor (AC-11, AC-12).
 *
 * These objects are the *only* thing that crosses from validation to execution. They contain no
 * source text and no resolved secret value: a secret appears as `{kind: 'secret', id}` and is
 * resolved at the moment of the action call (AC-13).
 */

/** A regular expression that survived the safe-subset check, carried as data, never as code. */
export interface RegexValue {
  readonly kind: 'regex';
  readonly source: string;
  readonly flags: string;
}

/** A literal string argument. */
export interface LiteralValue {
  readonly kind: 'literal';
  readonly value: string;
}

/** `vars.get('NAME')` — a non-secret declared reference. */
export interface VariableValue {
  readonly kind: 'variable';
  readonly name: string;
}

/** `vars.secret('ID')` — resolved only inside the executor, never stored here. */
export interface SecretValue {
  readonly kind: 'secret';
  readonly id: string;
}

/** Text-ish argument: a literal, a declared variable, or a safe regular expression. */
export type TextMatcher = LiteralValue | VariableValue | RegexValue;

/** Value argument of `fill` — the single V1 position where a secret reference is permitted. */
export type FillValue = LiteralValue | VariableValue | SecretValue;

export interface LocatorTextOptions {
  readonly exact?: boolean | undefined;
}

export interface RoleOptions {
  readonly name?: LiteralValue | VariableValue | RegexValue | undefined;
  readonly exact?: boolean | undefined;
  readonly checked?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly expanded?: boolean | undefined;
  readonly selected?: boolean | undefined;
  readonly pressed?: boolean | undefined;
  readonly level?: number | undefined;
}

export type LocatorSegment =
  | { readonly kind: 'getByRole'; readonly role: string; readonly options?: RoleOptions | undefined }
  | { readonly kind: 'getByText'; readonly text: TextMatcher; readonly options?: LocatorTextOptions | undefined }
  | {
      readonly kind: 'getByLabel';
      readonly text: TextMatcher;
      readonly options?: LocatorTextOptions | undefined;
    }
  | {
      readonly kind: 'getByPlaceholder';
      readonly text: TextMatcher;
      readonly options?: LocatorTextOptions | undefined;
    }
  | { readonly kind: 'getByTestId'; readonly testId: LiteralValue | VariableValue }
  | { readonly kind: 'locator'; readonly selector: string };

/** A locator chain rooted at `page`; always at least one segment long. */
export interface LocatorChain {
  readonly segments: readonly LocatorSegment[];
}

export interface TimeoutOptions {
  readonly timeout?: number | undefined;
}

export interface GotoOptions extends TimeoutOptions {
  readonly waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit' | undefined;
}

export interface ActionOptions extends TimeoutOptions {
  readonly force?: boolean | undefined;
}

export interface ClickOptions extends ActionOptions {
  readonly button?: 'left' | 'right' | 'middle' | undefined;
  readonly clickCount?: number | undefined;
  readonly delay?: number | undefined;
}

export interface PressOptions extends TimeoutOptions {
  readonly delay?: number | undefined;
}

export interface ContainTextOptions extends TimeoutOptions {
  readonly ignoreCase?: boolean | undefined;
  readonly useInnerText?: boolean | undefined;
}

export interface HaveUrlOptions extends TimeoutOptions {
  readonly ignoreCase?: boolean | undefined;
}

export type Operation =
  | { readonly op: 'goto'; readonly url: LiteralValue | VariableValue; readonly options?: GotoOptions | undefined }
  | { readonly op: 'waitForURL'; readonly url: TextMatcher; readonly options?: GotoOptions | undefined }
  | { readonly op: 'click'; readonly locator: LocatorChain; readonly options?: ClickOptions | undefined }
  | {
      readonly op: 'fill';
      readonly locator: LocatorChain;
      readonly value: FillValue;
      readonly options?: ActionOptions | undefined;
    }
  | {
      readonly op: 'press';
      readonly locator: LocatorChain;
      readonly key: LiteralValue;
      readonly options?: PressOptions | undefined;
    }
  | { readonly op: 'check'; readonly locator: LocatorChain; readonly options?: ActionOptions | undefined }
  | { readonly op: 'uncheck'; readonly locator: LocatorChain; readonly options?: ActionOptions | undefined }
  | { readonly op: 'hover'; readonly locator: LocatorChain; readonly options?: ActionOptions | undefined }
  | {
      readonly op: 'selectOption';
      readonly locator: LocatorChain;
      readonly value: LiteralValue | VariableValue;
      readonly options?: ActionOptions | undefined;
    }
  | {
      readonly op: 'expectVisible';
      readonly locator: LocatorChain;
      readonly options?: TimeoutOptions | undefined;
    }
  | {
      readonly op: 'expectContainText';
      readonly locator: LocatorChain;
      readonly expected: TextMatcher;
      readonly options?: ContainTextOptions | undefined;
    }
  | {
      readonly op: 'expectValue';
      readonly locator: LocatorChain;
      readonly expected: TextMatcher;
      readonly options?: TimeoutOptions | undefined;
    }
  | { readonly op: 'expectUrl'; readonly expected: TextMatcher; readonly options?: HaveUrlOptions | undefined }
  | {
      readonly op: 'expectTitle';
      readonly expected: TextMatcher;
      readonly options?: TimeoutOptions | undefined;
    };

export type OperationName = Operation['op'];
