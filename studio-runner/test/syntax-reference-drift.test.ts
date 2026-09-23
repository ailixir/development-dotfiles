import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ACTION_METHODS,
  LOCATOR_ASSERTIONS,
  LOCATOR_METHODS,
  PAGE_ASSERTIONS,
  PAGE_METHODS,
  PERMITTED_REGEX_FLAGS,
  PERMITTED_ROOT_IDENTIFIERS,
  REFERENCE_METHODS,
  type MethodSchema,
  type OptionValueSchema,
} from '../src/validator/language.js';

/**
 * The backend compile prompt carries `syntax-reference.md` to tell the model what to propose; the
 * validator's `language.ts` decides what is allowed to run. The two are separate files in separate
 * modules, so nothing but this test stops the prompt from advertising an option the validator
 * rejects (the `noWaitAfter` drift) or from staying silent about one it accepts.
 *
 * Read across the module boundary on purpose, following the precedent of
 * `frontend/src/components/studio/review/artifactSummary.test.ts`.
 *
 * The rules, chosen to be mechanical rather than heuristic:
 *
 * - **Forward.** Every method in the five method tables is *called* somewhere in the doc's code
 *   (`name(` inside inline code or a `js` fence), and every option key in those tables appears as a
 *   bare backticked span `` `key` ``.
 * - **Reverse.** Inside inline code and `js` fences, every identifier immediately followed by `(`
 *   is a known method, root or reference call, and every unquoted object-literal key (`{ key:` or
 *   `, key:`) is a known option key. Every bare backticked lower-camel identifier anywhere in the
 *   doc is a known method, option key, enum value, root identifier, regex flag, or one of the
 *   short, fixed list of prose placeholders below.
 */

const DOC_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../backend/src/main/resources/studio/syntax-reference.md',
);

const TABLES: Readonly<Record<string, Readonly<Record<string, MethodSchema>>>> = {
  LOCATOR_METHODS,
  ACTION_METHODS,
  PAGE_METHODS,
  LOCATOR_ASSERTIONS,
  PAGE_ASSERTIONS,
};

const METHOD_NAMES = new Set(Object.values(TABLES).flatMap((table) => Object.keys(table)));

const OPTION_KEYS = new Set(
  Object.values(TABLES).flatMap((table) =>
    Object.values(table).flatMap((schema) => Object.keys(schema.options ?? {})),
  ),
);

const ENUM_VALUES = new Set(
  Object.values(TABLES).flatMap((table) =>
    Object.values(table).flatMap((schema) =>
      Object.values(schema.options ?? {}).flatMap((value: OptionValueSchema) =>
        value.type === 'enum' ? value.values : [],
      ),
    ),
  ),
);

/** Callables that are not in a method table but are part of the accepted language. */
const OTHER_CALLABLES = new Set([...PERMITTED_ROOT_IDENTIFIERS, ...Object.keys(REFERENCE_METHODS)]);

/**
 * Words the doc uses in backticks as placeholders or literal values rather than as language
 * surface. Adding a word here is a deliberate act; an option key must never be added.
 */
const PROSE_WORDS = new Set([
  'role',
  'text',
  'url',
  'id',
  'value',
  'key',
  'options',
  'cssSelector',
  'locator',
  'http',
  'https',
  'false',
]);

interface DocCode {
  /** Inline code spans outside fenced blocks, without their backticks. */
  readonly inline: readonly string[];
  /** Bodies of fenced blocks tagged `js`. */
  readonly jsFences: readonly string[];
}

function parseDoc(markdown: string): DocCode {
  const jsFences: string[] = [];
  const outside = markdown.replace(
    /```([a-z]*)\n([\s\S]*?)```/g,
    (_match, lang: string, body: string) => {
      if (lang === 'js') jsFences.push(body);
      return '\n';
    },
  );
  const inline = [...outside.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? '');
  return { inline, jsFences };
}

function codeTexts(doc: DocCode): string[] {
  return [...doc.inline, ...doc.jsFences];
}

/** Identifiers immediately followed by `(`, excluding selector-engine pseudo-classes (`:has(`). */
function calledIdentifiers(doc: DocCode): Set<string> {
  const called = new Set<string>();
  for (const text of codeTexts(doc)) {
    for (const match of text.matchAll(/(?:^|[^\w$:-])([A-Za-z_$][\w$]*)\(/g)) {
      if (match[1] !== undefined) called.add(match[1]);
    }
  }
  return called;
}

/** Unquoted object-literal keys: `{ key:` or `, key:`. */
function objectLiteralKeys(doc: DocCode): Set<string> {
  const keys = new Set<string>();
  for (const text of codeTexts(doc)) {
    for (const match of text.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*:/g)) {
      if (match[1] !== undefined) keys.add(match[1]);
    }
  }
  return keys;
}

/** Inline code spans that are exactly one lower-camel identifier, e.g. `` `timeout` ``. */
function bareIdentifiers(doc: DocCode): Set<string> {
  return new Set(doc.inline.filter((span) => /^[a-z][A-Za-z]*$/.test(span)));
}

function unknownKeys(doc: DocCode): string[] {
  return [...objectLiteralKeys(doc)].filter((key) => !OPTION_KEYS.has(key)).sort();
}

function unknownCalls(doc: DocCode): string[] {
  return [...calledIdentifiers(doc)]
    .filter((name) => !METHOD_NAMES.has(name) && !OTHER_CALLABLES.has(name))
    .sort();
}

function unknownBareIdentifiers(doc: DocCode): string[] {
  const known = new Set([
    ...METHOD_NAMES,
    ...OPTION_KEYS,
    ...ENUM_VALUES,
    ...OTHER_CALLABLES,
    ...PERMITTED_REGEX_FLAGS,
    ...PROSE_WORDS,
  ]);
  return [...bareIdentifiers(doc)].filter((word) => !known.has(word)).sort();
}

const doc = parseDoc(readFileSync(DOC_PATH, 'utf8'));

describe('syntax-reference.md stays in step with the accepted language', () => {
  it('demonstrates a call to every permitted method', () => {
    const called = calledIdentifiers(doc);
    const missing = [...METHOD_NAMES].filter((name) => !called.has(name)).sort();
    expect(missing, 'methods language.ts accepts that the doc never shows').toEqual([]);
  });

  it('names every permitted option key', () => {
    const named = bareIdentifiers(doc);
    const missing = [...OPTION_KEYS].filter((key) => !named.has(key)).sort();
    expect(missing, 'option keys language.ts accepts that the doc never names').toEqual([]);
  });

  it('calls nothing the validator does not accept', () => {
    expect(unknownCalls(doc)).toEqual([]);
  });

  it('uses no object-literal option key the validator does not accept', () => {
    expect(unknownKeys(doc)).toEqual([]);
  });

  it('names no backticked identifier outside the accepted language', () => {
    expect(unknownBareIdentifiers(doc)).toEqual([]);
  });

  it('names every permitted regex flag', () => {
    const named = bareIdentifiers(doc);
    expect(PERMITTED_REGEX_FLAGS.filter((flag) => !named.has(flag))).toEqual([]);
  });

  describe('the rules catch the drift they exist for', () => {
    it('flags an option key the validator rejects, in prose or in code', () => {
      const drifted = parseDoc(
        "Options: `timeout`, `noWaitAfter`.\n\n```js\nawait page.getByText('x').click({ noWaitAfter: true });\n```\n",
      );
      expect(unknownBareIdentifiers(drifted)).toEqual(['noWaitAfter']);
      expect(unknownKeys(drifted)).toEqual(['noWaitAfter']);
    });

    it('flags a method the validator rejects', () => {
      const drifted = parseDoc("```js\nawait page.getByText('x').dblclick();\n```\n");
      expect(unknownCalls(drifted)).toEqual(['dblclick']);
    });

    it('does not mistake CSS pseudo-classes for calls', () => {
      expect(unknownCalls(parseDoc('Rejected: `:has-text(`, `:nth-match(`, `>>`.'))).toEqual([]);
    });
  });
});
