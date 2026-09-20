import type { ArtifactStep, SourceArtifact } from '@/types/studio/studioTypes';

/**
 * The action/target/assertion summary, derived from the **validated artifact** (story 10.11c
 * AC-28; story 10.10 AC-16b; architecture §4.7).
 *
 * §4.7 asks for *"a readable action/target/assertion summary derived from validated operations,
 * and expandable executable source"*. The two words that decide this module's design are
 * **validated operations**: the summary is a reading of what the compiler produced and the
 * validator accepted, never a reading of the author's English. ADR-002 §21.7 states the
 * consequence plainly — the artifact is the candidate's and `steps` is the draft's current
 * sentence, and deriving the summary from `steps` would present *the client's* reading of the
 * sentence as *the validator's* reading of the artifact, which is the confusion the confirmation
 * step exists to prevent and which architecture §8.3 retires the client grammar path to end.
 *
 * **This is not the second parser the story forbids.** The retired path parsed the *English* and
 * generated code from it; what happens here is the reverse and much narrower — one validated
 * statement in a closed language, read back into the words it already is. Nothing here can produce
 * an operation the server did not produce.
 *
 * **It guesses nothing.** The language is finite and enumerated below. A statement this module
 * does not recognize is reported as unrecognized, by name, and the rendering falls back to showing
 * the executable source itself. An approximation would be worse than an absence for exactly the
 * reason 10.10's AC-16(a) gave: at the human control point, a plausible wrong summary is the most
 * expensive output available.
 *
 * ## The vocabulary, and why it is a second copy rather than an import
 *
 * The tables below mirror `studio-runner/src/validator/language.ts`, which is the production
 * vocabulary — *"Everything the validator permits is enumerated here … Anything absent from these
 * tables is rejected. There is no wildcard and no fallthrough."* The frontend cannot import from
 * the runner package, so this is a copy, and a copy whose provenance nothing checks is a shape
 * this epic has catalogued twice. `artifactSummary.test.ts` therefore reads the runner's own
 * source and compares the two sets **both ways**; a method added to the language and not to this
 * file is red, and so is the reverse.
 */

/** Navigation methods permitted directly on `page`. Mirrors `PAGE_METHODS`. */
export const PAGE_ACTIONS = ['goto', 'waitForURL'] as const;

/** Actions permitted on a locator. Mirrors `ACTION_METHODS`. */
export const LOCATOR_ACTIONS = [
  'click',
  'fill',
  'press',
  'check',
  'uncheck',
  'hover',
  'selectOption',
] as const;

/** Locator factories. Mirrors `LOCATOR_METHODS`. */
export const LOCATOR_FACTORIES = [
  'getByRole',
  'getByText',
  'getByLabel',
  'getByPlaceholder',
  'getByTestId',
  'locator',
] as const;

/** Assertions permitted on `expect(locator)`. Mirrors `LOCATOR_ASSERTIONS`. */
export const LOCATOR_ASSERTION_MATCHERS = ['toBeVisible', 'toContainText', 'toHaveValue'] as const;

/** Assertions permitted on `expect(page)`. Mirrors `PAGE_ASSERTIONS`. */
export const PAGE_ASSERTION_MATCHERS = ['toHaveURL', 'toHaveTitle'] as const;

export interface ReadOperation {
  readonly recognized: true;
  /** `action` for something done to the page, `assertion` for something checked about it. */
  readonly kind: 'action' | 'assertion';
  /** The operation in the author-facing words this module renders it in. */
  readonly action: string;
  /** What the operation is performed on or checked about. */
  readonly target: string;
  /** The operand — a URL, a value, a matcher — or null where the operation takes none. */
  readonly detail: string | null;
}

export interface UnreadOperation {
  readonly recognized: false;
  /** Why this statement was not summarized. Shown to the reader, never swallowed. */
  readonly reason: string;
}

export type ArtifactOperation = ReadOperation | UnreadOperation;

const ACTION_WORDS: Record<string, string> = {
  goto: 'Open',
  waitForURL: 'Wait for the address to become',
  click: 'Click',
  fill: 'Type into',
  press: 'Press a key on',
  check: 'Tick',
  uncheck: 'Untick',
  hover: 'Hover over',
  selectOption: 'Choose an option in',
};

const ASSERTION_WORDS: Record<string, string> = {
  toBeVisible: 'Check that it is visible:',
  toContainText: 'Check that it contains',
  toHaveValue: 'Check that its value is',
  toHaveURL: 'Check that the address is',
  toHaveTitle: 'Check that the title is',
};

const LOCATOR_WORDS: Record<string, string> = {
  getByRole: 'the {0} named {1}',
  getByText: 'the element reading {0}',
  getByLabel: 'the field labelled {0}',
  getByPlaceholder: 'the box with placeholder {0}',
  getByTestId: 'the element with test id {0}',
  locator: 'the element matching {0}',
};

function unread(reason: string): UnreadOperation {
  return { recognized: false, reason };
}

/**
 * The first argument of a call, as it appears in the source.
 *
 * Deliberately textual. Every permitted argument is a string literal, a regular expression
 * literal, or `vars.get('NAME')` / `vars.secret('NAME')` — and the last of those carries a
 * reference **name** and never a value (architecture §9.2, ADR-002 §21.7), so echoing the source
 * text back cannot surface a secret. There is nothing here to resolve.
 */
function firstArgument(args: string): string | null {
  const text = args.trim();
  if (text.length === 0) {
    return null;
  }
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(' || character === '{' || character === '[') {
      depth += 1;
    } else if (character === ')' || character === '}' || character === ']') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      return text.slice(0, index).trim();
    }
  }
  return text;
}

/**
 * Splits `<receiver>.<method>(<args>)` at the **outermost** trailing call.
 *
 * Written as a backward scan rather than as a regular expression because a greedy one splits at
 * the *last* `.name(` in the text, which for `page.getByLabel('Password').fill(vars.secret('X'))`
 * is `.secret(` — the argument's own call, not the operation's. That was measured, not guessed:
 * the regular-expression form reported `secret` as an unrecognized action.
 */
function splitTrailingCall(
  body: string,
): { receiver: string; method: string; args: string } | null {
  const text = body.trim();
  if (!text.endsWith(')')) {
    return null;
  }
  let depth = 0;
  let open = -1;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const character = text[index];
    if (character === ')') {
      depth += 1;
    } else if (character === '(') {
      depth -= 1;
      if (depth === 0) {
        open = index;
        break;
      }
    }
  }
  if (open <= 0) {
    return null;
  }
  const head = text.slice(0, open);
  const match = /^(.*)\.([A-Za-z]\w*)$/su.exec(head);
  if (!match) {
    return null;
  }
  return {
    receiver: (match[1] ?? '').trim(),
    method: match[2] ?? '',
    args: text.slice(open + 1, text.length - 1),
  };
}

/** The `name:` option of `getByRole`, which is the only option this summary reads. */
function roleName(args: string): string | null {
  const match = /\bname\s*:\s*((?:'[^']*')|(?:"[^"]*")|(?:\/[^/]*\/[a-z]*))/u.exec(args);
  return match ? (match[1] ?? null) : null;
}

/** Renders a locator chain — always rooted at `page` — into words, or reports why it cannot. */
function readTarget(chain: string): { target: string } | UnreadOperation {
  const text = chain.trim();
  if (text === 'page') {
    return { target: 'the page' };
  }
  const call = splitTrailingCall(text);
  if (!call || call.receiver !== 'page') {
    return unread(
      `the target "${text}" is not a single locator on the page, so it is not summarized here`,
    );
  }
  const factory = call.method;
  const args = call.args;
  if (!(LOCATOR_FACTORIES as readonly string[]).includes(factory)) {
    return unread(`"${factory}" is not one of the locators this page knows how to describe`);
  }
  const first = firstArgument(args);
  if (first === null) {
    return unread(`"${factory}" was written with no argument to describe`);
  }
  const template = LOCATOR_WORDS[factory] ?? '';
  if (factory === 'getByRole') {
    const name = roleName(args);
    return {
      target: name
        ? template.replace('{0}', strip(first)).replace('{1}', name)
        : `the ${strip(first)}`,
    };
  }
  return { target: template.replace('{0}', first) };
}

/** Removes one layer of quoting from a literal, for the words that read better without it. */
function strip(literal: string): string {
  const match = /^(['"])(.*)\1$/su.exec(literal.trim());
  return match ? (match[2] ?? literal) : literal;
}

/**
 * Reads one validated statement into an action, a target and an operand.
 *
 * @param code the generated source of one artifact step, exactly as the server produced it
 * @returns the summary, or the reason this statement was not summarized
 */
export function readOperation(code: string): ArtifactOperation {
  const text = code.trim().replace(/;$/u, '').trim();
  if (!text.startsWith('await ')) {
    return unread('the statement is not an awaited operation, which the language requires');
  }
  const body = text.slice('await '.length).trim();

  const call = splitTrailingCall(body);
  if (!call) {
    return unread('the statement is not an operation on the page');
  }

  const expectMatch = /^expect\((.*)\)$/su.exec(call.receiver);
  if (expectMatch) {
    const subject = expectMatch[1] ?? '';
    const matcher = call.method;
    const args = call.args;
    const known =
      (LOCATOR_ASSERTION_MATCHERS as readonly string[]).includes(matcher) ||
      (PAGE_ASSERTION_MATCHERS as readonly string[]).includes(matcher);
    if (!known) {
      return unread(`"${matcher}" is not one of the checks this page knows how to describe`);
    }
    const target = readTarget(subject);
    if ('recognized' in target) {
      return target;
    }
    return {
      recognized: true,
      kind: 'assertion',
      action: ASSERTION_WORDS[matcher] ?? matcher,
      target: target.target,
      detail: firstArgument(args),
    };
  }

  const receiver = call.receiver;
  const method = call.method;
  const args = call.args;
  if (!receiver.startsWith('page')) {
    return unread('the statement is not an operation on the page');
  }

  if (receiver === 'page' && (PAGE_ACTIONS as readonly string[]).includes(method)) {
    return {
      recognized: true,
      kind: 'action',
      action: ACTION_WORDS[method] ?? method,
      target: 'the page',
      detail: firstArgument(args),
    };
  }

  if (!(LOCATOR_ACTIONS as readonly string[]).includes(method)) {
    return unread(`"${method}" is not one of the actions this page knows how to describe`);
  }
  const target = readTarget(receiver);
  if ('recognized' in target) {
    return target;
  }
  return {
    recognized: true,
    kind: 'action',
    action: ACTION_WORDS[method] ?? method,
    target: target.target,
    detail: firstArgument(args),
  };
}

/** The summary as one line of prose, for a reader rather than for an assertion. */
export function summaryLine(operation: ReadOperation): string {
  return operation.detail === null
    ? `${operation.action} ${operation.target}`
    : `${operation.action} ${operation.target}: ${operation.detail}`;
}

/**
 * The artifact entry for one authored line, or null when the artifact does not cover it.
 *
 * The join is **positional**, which is what the schema declares: *"Exactly one entry per source
 * line, index aligned, with identical originalText."* Nothing is padded, shifted or re-aligned to
 * make a mismatched artifact line up — a mismatch is a fact about the artifact and it is surfaced
 * rather than hidden. See {@link artifactAlignmentDefect}.
 */
export function artifactStepAt(
  artifact: SourceArtifact | null | undefined,
  index: number,
): ArtifactStep | null {
  if (!artifact || !Array.isArray(artifact.steps)) {
    return null;
  }
  const entry = artifact.steps[index];
  return entry && entry.stepIndex === index ? entry : null;
}

/**
 * Whether the artifact and the draft's current steps line up, and what is wrong when they do not.
 *
 * **This is not a defect report in the `needsRevision` sense.** ADR-002 §21.7: the artifact belongs
 * to the candidate revision and `steps` is the draft's current English, and in a state where the
 * draft has moved on the two genuinely disagree. The surface says so rather than reconciling them,
 * because a reader who is about to confirm an exact revision is entitled to know that the sentence
 * above the summary is not the sentence the summary was produced from.
 */
export function artifactDivergence(
  artifact: SourceArtifact | null | undefined,
  steps: readonly string[],
): string | null {
  if (!artifact) {
    return null;
  }
  if (artifact.steps.length !== steps.length) {
    return `The translated version has ${artifact.steps.length} steps and your draft now has ${steps.length}. What is shown below is what was translated, not what you have typed since.`;
  }
  const moved = artifact.steps.findIndex((entry, index) => entry.originalText !== steps[index]);
  if (moved === -1) {
    return null;
  }
  return `Step ${moved + 1} has changed since it was translated. What is shown below is what was translated, not what you have typed since.`;
}
